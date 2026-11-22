const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { destination, along, length, lineString, distance } = require('@turf/turf')
const load = require('./helpers/load-typescript.cjs')
const { buildSimulationReview, dropDistanceLabel, shouldShowDropLabel, dropAppearance, reviewStatusLabel } = load(path.resolve(__dirname, '../lib/simulation-review.ts'))
const origin = [107.6, -6.9]
const at = (meters, bearing = 90) => destination(origin, meters, bearing, { units: 'meters' }).geometry.coordinates.slice(0, 2)
const point = (id, category, coordinates) => ({ id, name: id, category, kind: 'Point', file: 'survey.kmz', geometry: { type: 'Point', coordinates }, coords: [coordinates[1], coordinates[0]] })
function box(id, houses, position = origin) {
  const pole = point(`pole-${id}`, 'Tiang', position)
  const potentials = houses.map(house => ({ house, distanceMeters: 999 })) // Deliberately stale cache: review must not use it.
  const splitters = []
  for (let i = 0; i < potentials.length; i += 8) splitters.push({ id: `${id}-s${i / 8 + 1}`, number: i / 8 + 1, houses: potentials.slice(i, i + 8) })
  return { candidate: { id, pole, houses: potentials, potentialCount: houses.length, maxCapacity: 16, averageDistanceMeters: 999 }, houses: potentials, splitters, estimatedDropMeters: 999 }
}
const simulation = (boxes, unservedHouses = []) => ({ boxes, unservedHouses, servedCount: 999, splitterCount: 999, estimatedDropMeters: 999, localSearchComplete: true })
function route(box, house, overrides = {}) {
  return { id: `${box.candidate.id}-${house.id}`, fatId: box.candidate.id, fat: box.candidate.pole, splitterId: box.splitters.find(s => s.houses.some(h => h.house.id === house.id)).id,
    splitterNumber: 1, house, status: 'valid', reason: 'fixture', lengthMeters: 999, lastSpanMeters: 20,
    coordinates: [box.candidate.pole.geometry.coordinates, house.geometry.coordinates], midpoint: [0,0], ...overrides }
}
const plan = (routes, hasSupportData = true) => ({ maxDropLengthMeters: 60, routes, hasSupportData, verifiedLengthMeters: 999, estimatedLengthMeters: 999, problemCount: 999 })
const near = (actual, expected, epsilon = 1e-5) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`)

test('summary reads assignments, separates measured/estimated/unverified lengths, and computes total/mean/max', () => {
  const houses = [point('actual', 'Rumah', at(42.5)), point('estimated', 'Rumah', at(20)), point('no-path', 'Rumah', at(10)), point('too-long', 'Rumah', at(90))]
  const b = box('a', houses), unserved = point('unserved', 'Rumah', at(200))
  const sim = simulation([b], [unserved])
  const p = plan([route(b,houses[0]), route(b,houses[1], { status: 'estimate', lastSpanMeters: null }),
    route(b,houses[2], { status: 'problem', coordinates: null, midpoint: null, lengthMeters: null, lastSpanMeters: null }),
    route(b,houses[3], { status: 'problem', coordinates: null, midpoint: null, lengthMeters: 90, lastSpanMeters: 20 })])
  const before = JSON.stringify({ sim, p })
  const review = buildSimulationReview(sim, p)
  assert.equal(review.servedCount, 4)
  assert.equal(review.unservedCount, 1)
  assert.equal(review.boxCount, 1)
  assert.equal(review.splitterCount, 1)
  near(review.verified.total, 42.5)
  assert.equal(review.verified.count, 1)
  near(review.estimates.total, 30)
  assert.equal(review.estimates.count, 2)
  near(review.estimates.average, 15)
  near(review.estimates.maximum, 20)
  near(review.unverifiedRoutes.total, 90)
  near(review.lengths.total, 162.5)
  near(review.lengths.average, 40.625)
  near(review.lengths.maximum, 90)
  assert.equal(review.distanceViolationCount, 1)
  assert.equal(review.unresolvedCount, 1)
  assert.equal(review.boxes[0].remainingCapacity, 12)
  assert.equal(JSON.stringify({ sim, p }), before)
})

test('without route data all lengths are estimates and no geometry is generated', () => {
  const h = point('h', 'Rumah', at(42.5)), b = box('a', [h])
  const review = buildSimulationReview(simulation([b]), null)
  near(review.estimates.total, 42.5)
  assert.equal(review.verified.count, 0)
  assert.equal(review.drops[0].status, 'estimate')
  assert.equal(reviewStatusLabel(review.drops[0].status), 'Belum validasi rute')
  assert.equal(review.drops[0].coordinates, null)
  assert.equal(review.drops[0].midpoint, null)
  assert.equal(dropDistanceLabel(review.drops[0]), 'Est. 42,5 m')
})

test('actual route lengths and label midpoint follow winding geometry rather than straight distance or cached totals', () => {
  const h = point('h', 'Rumah', at(40)), b = box('a', [h])
  const coordinates = [origin, at(25,0), at(40)]
  const review = buildSimulationReview(simulation([b]), plan([route(b,h,{ coordinates })]), { maxDropLengthMeters: 120 })
  const drop = review.drops[0], expected = length(lineString(coordinates), { units: 'meters' })
  near(drop.lengthMeters, expected)
  assert.ok(drop.lengthMeters > 40)
  assert.deepEqual(drop.midpoint, along(lineString(coordinates), expected / 2, { units: 'meters' }).geometry.coordinates)
  assert.ok(distance(drop.midpoint, along(lineString([origin,at(40)]),20,{ units: 'meters' }).geometry.coordinates,{ units: 'meters' }) > 1)
  assert.equal(drop.basis, 'route')
  assert.equal(drop.status, 'verified')
  assert.ok(!dropDistanceLabel(drop).startsWith('Est.'))
})

test('active distance limit is inclusive; estimates never validate last span and actual last span stays 35 m', () => {
  const h = [point('on', 'Rumah', at(60)), point('over', 'Rumah', at(60.001))], b = box('a',h)
  let review = buildSimulationReview(simulation([b]), null)
  assert.deepEqual(review.drops.map(d => d.status), ['estimate','violation'])
  assert.equal(review.distanceViolationCount, 1)
  assert.equal(buildSimulationReview(simulation([b]), null, { maxDropLengthMeters: 90 }).distanceViolationCount, 0)
  for (const [span, expected] of [[35,'verified'],[35.001,'violation']]) {
    review = buildSimulationReview(simulation([box('b',[h[0]])]), plan([route(box('b',[h[0]]),h[0],{ lastSpanMeters: span })]))
    assert.equal(review.drops[0].status, expected)
  }
})

test('missing support data or final-span data cannot produce a verified status', () => {
  const h = point('h', 'Rumah', at(40)), b = box('a',[h]), sim = simulation([b])
  const noSupport = buildSimulationReview(sim, plan([route(b,h)],false))
  assert.equal(noSupport.drops[0].status, 'estimate')
  const noSpan = buildSimulationReview(sim, plan([route(b,h,{ lastSpanMeters: null })]))
  assert.equal(noSpan.drops[0].status, 'estimate')
  assert.equal(noSpan.verified.count, 0)
  assert.equal(noSpan.unverifiedRoutes.count, 1)
  assert.equal(reviewStatusLabel(noSpan.drops[0].status), 'Belum validasi rute')
})

test('capacity validation detects oversized splitter, more than two splitters, duplicate house and multiple boxes on one pole', () => {
  const houses = Array.from({ length: 10 }, (_,i) => point(`h${i}`, 'Rumah', at(i+1)))
  const a = box('a',houses), b = box('b',[houses[0]])
  a.splitters = [{ id:'a-s1', number:1, houses:a.houses.slice(0,9) }, { id:'a-s2', number:2, houses:a.houses.slice(9) }, { id:'a-s3',number:3,houses:[] }]
  b.candidate.pole = a.candidate.pole
  const review = buildSimulationReview(simulation([a,b]),null)
  assert.deepEqual(new Set(review.capacityIssues.map(i => i.code)), new Set(['splitter-houses','box-splitters','duplicate-house','pole-boxes']))
  assert.equal(review.servedCount, 10)
  assert.equal(review.splitterCount, 4)
})

test('nearby FAT on distinct poles are not automatically capacity violations', () => {
  const a = box('a',[point('h1','Rumah',at(10))]), b = box('b',[point('h2','Rumah',at(20))])
  const review = buildSimulationReview(simulation([a,b]),null)
  assert.equal(review.capacityIssues.length, 0)
  assert.deepEqual(review.boxes.map(b => b.remainingCapacity), [15,15])
})

test('default labels only show the selected route; all-label mode respects FAT filter', () => {
  const h = point('h','Rumah',at(42.5)), a = box('a',[h])
  const drop = buildSimulationReview(simulation([a]),plan([route(a,h)])).drops[0]
  assert.equal(shouldShowDropLabel(drop,{ showLabels:false, zoom:19 }),false)
  assert.equal(shouldShowDropLabel(drop,{ showLabels:false, zoom:19, selectedFatId:'a', selectedHouseId:h.id }),false)
  assert.equal(shouldShowDropLabel(drop,{ showLabels:false, zoom:14, selectedRouteId:drop.id }),true)
  assert.equal(shouldShowDropLabel(drop,{ showLabels:true, zoom:14 }),true)
  assert.equal(shouldShowDropLabel(drop,{ showLabels:true, zoom:19, selectedFatId:'other' }),false)
  assert.equal(shouldShowDropLabel(drop,{ showLabels:true, zoom:14, selectedFatId:'other', selectedRouteId:drop.id }),true)
  assert.equal(shouldShowDropLabel({ ...drop, midpoint:null },{ showLabels:true, zoom:19, selectedRouteId:drop.id }),false)
})

test('selected group is emphasized, others dimmed but retained, and verified/estimate/violation patterns differ', () => {
  const h = point('h','Rumah',at(40)), a = box('a',[h])
  const drop = buildSimulationReview(simulation([a]),plan([route(a,h)])).drops[0]
  const original = JSON.stringify(drop)
  assert.equal(dropAppearance(drop,'a').opacity,0.95)
  assert.equal(dropAppearance(drop,'b').opacity,0.15)
  assert.equal(dropAppearance(drop).opacity,0.95)
  assert.equal(dropAppearance(drop,'a',drop.id).weight,6)
  assert.equal(dropAppearance(drop).dashArray,undefined)
  assert.notEqual(dropAppearance({ ...drop, status:'estimate', basis:'estimate' }).dashArray,dropAppearance({ ...drop, status:'violation' }).dashArray)
  assert.equal(JSON.stringify(drop),original)
})

test('new assignment snapshot cannot inherit routes from another FAT or splitter; empty review has no stale metrics', () => {
  const h = point('h','Rumah',at(40)), a = box('a',[h]), b = box('b',[h])
  const oldPlan = plan([route(a,h)])
  const review = buildSimulationReview(simulation([b]),oldPlan)
  assert.equal(review.drops.length,1)
  assert.equal(review.drops[0].fatId,'b')
  assert.equal(review.drops[0].route,null)
  assert.equal(review.drops[0].status,'estimate')
  assert.equal(review.drops[0].midpoint,null)
  const empty = buildSimulationReview(simulation([]),oldPlan)
  assert.equal(empty.drops.length,0)
  assert.equal(empty.lengths.total,0)
  assert.equal(empty.lengths.average,null)
  assert.equal(empty.lengths.maximum,null)
})
