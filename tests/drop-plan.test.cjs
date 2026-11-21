const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const load = require('./helpers/load-typescript.cjs')
const { destination, distance, length, lineString, along } = require('@turf/turf')
const { planDropRoutes: plan, currentDropPlan: current, formatDropMeters } = load(path.resolve(__dirname, '../lib/drop-plan.ts'))
// Original route regression fixtures keep an explicit 120 m setting, independent of the new default.
const legacyConfig = { maxDropLengthMeters: 120 }
const planDropRoutes = (simulation, features) => plan(simulation, features, legacyConfig)
const currentDropPlan = (result, simulation, features) => current(result, simulation, features, legacyConfig)

const origin = [107.6, -6.9]
const at = (meters, bearing = 90) => destination(origin, meters, bearing, { units: 'meters' }).geometry.coordinates.slice(0, 2)
function item(id, category, p) {
  return { id, name: id, category, kind: 'Point', coords: [p[1], p[0]], geometry: { type: 'Point', coordinates: p }, file: 'survey.kmz' }
}
function line(id, positions, support = true) {
  return { id, name: id, category: 'Jalur kabel', kind: 'LineString', coords: [positions[0][1], positions[0][0]],
    geometry: { type: 'LineString', coordinates: positions }, file: 'survey.kmz', dropSupport: support }
}
function simulation(pole, houses) {
  const potential = houses.map(house => ({ house, distanceMeters: distance(pole.geometry.coordinates, house.geometry.coordinates, { units: 'meters' }) }))
  return { boxes: [{ candidate: { id: pole.id, pole, houses: potential, potentialCount: houses.length, maxCapacity: 16, averageDistanceMeters: 0 },
    houses: potential, splitters: [{ id: `${pole.id}-splitter-1`, number: 1, houses: potential }], estimatedDropMeters: 0 }],
    unservedHouses: [], servedCount: houses.length, splitterCount: 1, estimatedDropMeters: 0, localSearchComplete: true }
}
const fat = item('fat-pole', 'Tiang', origin)
function fixture(supportMeters, houseMeters) {
  const support = item('support', 'Tiang', at(supportMeters))
  const house = item('house', 'Rumah', at(houseMeters))
  const features = [fat, support, house, line('support-edge', [origin, at(supportMeters)])]
  const sim = simulation(fat, [house])
  return { features, sim, plan: planDropRoutes(sim, features) }
}

test('accepts total exactly 120 m including the last 35 m; distance label uses Indonesian formatting', () => {
  const { plan } = fixture(85, 120)
  const [route] = plan.routes
  assert.equal(route.status, 'valid')
  assert.ok(Math.abs(route.lengthMeters - 120) < 1e-6)
  assert.ok(Math.abs(route.lastSpanMeters - 35) < 1e-6)
  assert.equal(formatDropMeters(87.4), '87,4 m')
  assert.ok(Math.abs(plan.verifiedLengthMeters - 120) < 1e-6)
  assert.equal(plan.estimatedLengthMeters, 0)
})

test('rejects total over 120 m even when the final span is within 35 m', () => {
  const { plan } = fixture(86, 121)
  assert.equal(plan.routes[0].status, 'problem')
  assert.equal(plan.routes[0].coordinates, null)
  assert.equal(plan.problemCount, 1)
})

test('rejects last span just over 35 m even when total distance is below 120 m', () => {
  const { plan } = fixture(60, 95.001)
  assert.equal(plan.routes[0].status, 'problem')
  assert.equal(plan.routes[0].coordinates, null)
})

test('when FAT is last infrastructure, checks its direct span against 35 m', () => {
  const remoteA = item('remote-a', 'Tiang', at(500))
  const remoteB = item('remote-b', 'Tiang', at(600))
  for (const [meters, expected] of [[35, 'valid'], [35.001, 'problem']]) {
    const house = item('house', 'Rumah', at(meters))
    const plan = planDropRoutes(simulation(fat, [house]), [fat, house, remoteA, remoteB, line('remote', [at(500), at(600)])])
    assert.equal(plan.routes[0].status, expected)
    if (expected === 'valid') assert.ok(Math.abs(plan.routes[0].lastSpanMeters - 35) < 1e-6)
  }
})

test('measures a winding route along its geometry and places label halfway along that length', () => {
  const terminal = item('terminal', 'Tiang', at(60))
  const house = item('house', 'Rumah', at(80))
  const bend = at(25, 0)
  const geometry = [origin, bend, at(60)]
  const plan = planDropRoutes(simulation(fat, [house]), [fat, terminal, house, line('winding', geometry)])
  const route = plan.routes[0]
  assert.equal(route.status, 'valid')
  const expected = length(lineString([...geometry, at(80)]), { units: 'meters' })
  assert.ok(route.lengthMeters > 80 + 10)
  assert.ok(Math.abs(route.lengthMeters - expected) < 1e-6)
  const midpoint = along(lineString(route.coordinates), expected / 2, { units: 'meters' }).geometry.coordinates
  assert.deepEqual(route.midpoint, midpoint)
})

test('a long detour fails the total bound despite a short straight-line FAT-house distance', () => {
  const terminal = item('terminal', 'Tiang', at(60))
  const house = item('house', 'Rumah', at(80))
  const plan = planDropRoutes(simulation(fat, [house]), [fat, terminal, house, line('detour', [origin, at(100, 0), at(60)])])
  assert.equal(plan.routes[0].status, 'problem')
  assert.equal(plan.routes[0].coordinates, null)
})

test('Dijkstra chooses the shortest supported geometry and examines all final-span anchors', () => {
  const anchor1 = item('anchor1', 'Tiang', at(60))
  const anchor2 = item('anchor2', 'Tiang', at(70))
  const house = item('house', 'Rumah', at(90))
  const features = [fat, anchor1, anchor2, house,
    line('slow', [origin, at(40, 0), at(70)]), line('short', [origin, at(60)]), line('hop', [at(60), at(70)])]
  const result = planDropRoutes(simulation(fat, [house]), features)
  assert.equal(result.routes[0].status, 'valid')
  assert.ok(Math.abs(result.routes[0].lengthMeters - 90) < 1e-6)
})

test('disconnected graph does not fabricate a connection or fall back to a valid direct route', () => {
  const a = item('a', 'Tiang', at(70)), b = item('b', 'Tiang', at(90)), house = item('house', 'Rumah', at(100))
  const plan = planDropRoutes(simulation(fat, [house]), [fat, a, b, house, line('island', [at(70), at(90)])])
  assert.equal(plan.routes[0].status, 'problem')
  assert.equal(plan.routes[0].coordinates, null)
  assert.equal(plan.routes[0].lengthMeters, null)
})

test('unflagged lines are not support; without graph, direct geometry is only an estimate', () => {
  const house = item('house', 'Rumah', at(90))
  const features = [fat, house, line('ordinary-survey-line', [origin, at(90)], false)]
  const plan = planDropRoutes(simulation(fat, [house]), features)
  assert.equal(plan.hasSupportData, false)
  assert.equal(plan.routes[0].status, 'estimate')
  assert.equal(plan.routes[0].lastSpanMeters, null)
  assert.ok(Math.abs(plan.estimatedLengthMeters - 90) < 1e-6)
  assert.equal(plan.verifiedLengthMeters, 0)
  assert.equal(plan.routes[0].coordinates.length, 2)
})

test('even a <=35 m direct estimate is not upgraded to verified without support data', () => {
  const house = item('house', 'Rumah', at(20))
  const plan = planDropRoutes(simulation(fat, [house]), [fat, house])
  assert.equal(plan.routes[0].status, 'estimate')
  assert.equal(plan.routes[0].lastSpanMeters, null)
})

test('unsupported shortcut cannot shorten an eligible detour; unsurveyed bends are not terminal anchors', () => {
  const support = item('support', 'Tiang', at(60))
  const house = item('house', 'Rumah', at(80))
  const features = [fat, support, house, line('supported', [origin, at(100, 0), at(60)]), line('shortcut', [origin, at(60)], false)]
  assert.equal(planDropRoutes(simulation(fat, [house]), features).routes[0].status, 'problem')
  // Passing near a house at a geometric bend does not create an infrastructure anchor there.
  const terminal = item('far-terminal', 'Tiang', at(130))
  assert.equal(planDropRoutes(simulation(fat, [house]), [fat, house, terminal, line('bend', [origin, at(70), at(130)])]).routes[0].status, 'problem')
})

test('routes preserve FAT/splitter assignments and inputs; rerunning replaces rather than appends', () => {
  const { features, sim } = fixture(85, 120)
  const before = JSON.stringify({ features, sim })
  const first = planDropRoutes(sim, features)
  const second = planDropRoutes(sim, features)
  assert.deepEqual(first, second)
  assert.equal(second.routes.length, 1)
  assert.equal(second.routes[0].fatId, sim.boxes[0].candidate.id)
  assert.equal(second.routes[0].splitterId, sim.boxes[0].splitters[0].id)
  assert.equal(JSON.stringify({ features, sim }), before)
  const snapshot = { features, simulation: sim, plan: first }
  assert.equal(currentDropPlan(snapshot, sim, features), first)
  assert.equal(currentDropPlan(snapshot, { ...sim }, features), null)
  assert.equal(currentDropPlan(snapshot, sim, [...features]), null)
  assert.equal(currentDropPlan(snapshot, null, features), null)
  assert.equal(currentDropPlan(null, sim, features), null)
})

test('rejects duplicate house assignments instead of drawing duplicate routes', () => {
  const house = item('house', 'Rumah', at(30))
  const sim = simulation(fat, [house, house])
  assert.throws(() => planDropRoutes(sim, [fat, house]), /ganda/)
})
