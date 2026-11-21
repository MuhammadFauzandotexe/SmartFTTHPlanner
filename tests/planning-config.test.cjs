const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const load = require('./helpers/load-typescript.cjs')
const { destination } = require('@turf/turf')
const { DEFAULT_PLANNING_CONFIG, PLANNING_CONFIG_STORAGE_KEY, DROP_LAST_SPAN_METERS, maxDropLength, parseDropLengthInput, loadPlanningConfig, savePlanningConfig } = load(path.resolve(__dirname, '../lib/planning-config.ts'))
const { findFatCandidates } = load(path.resolve(__dirname, '../lib/fat-candidates.ts'))
const { simulateFatPlacement, validateFatAssignments } = load(path.resolve(__dirname, '../lib/fat-simulation.ts'))
const { planDropRoutes, revalidateDropPlan, currentDropPlan } = load(path.resolve(__dirname, '../lib/drop-plan.ts'))
const origin = [107.6, -6.9]
const at = meters => destination(origin, meters, 90, { units: 'meters' }).geometry.coordinates.slice(0, 2)
const config = maxDropLengthMeters => ({ maxDropLengthMeters })
const item = (id, category, position) => ({ id, name: id, category, kind: 'Point', coords: [position[1], position[0]], geometry: { type: 'Point', coordinates: position }, file: 'survey.kmz' })
const pole = item('pole', 'Tiang', origin)
const house = (id, meters) => item(id, 'Rumah', at(meters))
const supportLine = terminal => ({ id: 'edge', name: 'edge', category: 'Jalur kabel', kind: 'LineString', geometry: { type: 'LineString', coordinates: [origin, terminal.geometry.coordinates] }, coords: pole.coords, file: 'survey.kmz', dropSupport: true })
function assigned(houses) {
  const potentials = houses.map(house => ({ house, distanceMeters: 0 }))
  return { boxes: [{ candidate: { id: pole.id, pole, houses: potentials, potentialCount: houses.length, maxCapacity: 16, averageDistanceMeters: 0 }, houses: potentials,
    splitters: [{ id: 'splitter1', number: 1, houses: potentials }], estimatedDropMeters: 0 }], unservedHouses: [], servedCount: houses.length, splitterCount: 1, estimatedDropMeters: 0, localSearchComplete: true }
}
function storage(initial = null) {
  const entries = new Map(initial === null ? [] : [[PLANNING_CONFIG_STORAGE_KEY, initial]])
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }
}

test('one default configuration is 60 m; last span remains independently 35 m', () => {
  assert.deepEqual(DEFAULT_PLANNING_CONFIG, config(60))
  assert.equal(DROP_LAST_SPAN_METERS, 35)
  assert.equal(maxDropLength(), 60)
  assert.deepEqual(loadPlanningConfig(storage()), config(60))
})

test('input/config accepts only positive finite numeric values', () => {
  for (const value of ['', ' ', '0', '-1', 'NaN', 'Infinity', 'abc', '1e999', '0x10']) assert.equal(parseDropLengthInput(value), null, value)
  for (const [text, expected] of [['60', 60], ['90.5', 90.5], ['.5', 0.5], ['1e2', 100]]) assert.equal(parseDropLengthInput(text), expected)
  for (const value of [0, -1, NaN, Infinity, '60', null]) {
    assert.throws(() => maxDropLength(config(value)), /angka positif/)
    assert.throws(() => findFatCandidates([], config(value)), /angka positif/)
    assert.throws(() => simulateFatPlacement([], [], { config: config(value) }), /angka positif/)
    assert.throws(() => planDropRoutes(assigned([]), [], config(value)), /angka positif/)
  }
})

test('save then reload after a simulated page refresh restores the explicit limit, including 120 m', () => {
  const persisted = storage()
  savePlanningConfig(persisted, config(85.5))
  const refreshedPageConfig = loadPlanningConfig(persisted)
  assert.deepEqual(refreshedPageConfig, config(85.5))
  assert.notEqual(refreshedPageConfig, DEFAULT_PLANNING_CONFIG)
  savePlanningConfig(persisted, config(120))
  assert.deepEqual(loadPlanningConfig(persisted), config(120))
  // Merely opening the app does not migrate or overwrite an explicit older value.
  assert.equal(persisted.getItem(PLANNING_CONFIG_STORAGE_KEY), JSON.stringify(config(120)))
})

test('malformed storage falls back safely; loading never overwrites a stored record', () => {
  for (const raw of ['broken', '{"maxDropLengthMeters":0}', '{"maxDropLengthMeters":-1}', 'null', '{"maxDropLengthMeters":"120"}']) {
    const persisted = storage(raw)
    assert.deepEqual(loadPlanningConfig(persisted), config(60))
    assert.equal(persisted.getItem(PLANNING_CONFIG_STORAGE_KEY), raw)
  }
  const persisted = storage('{"maxDropLengthMeters":120,"otherSetting":"preserve"}')
  savePlanningConfig(persisted, config(75))
  assert.deepEqual(JSON.parse(persisted.getItem(PLANNING_CONFIG_STORAGE_KEY)), { maxDropLengthMeters: 75, otherSetting: 'preserve' })
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  assert.deepEqual(loadPlanningConfig(blocked), config(60))
  assert.throws(() => savePlanningConfig(blocked, config(70)), /blocked/)
})

test('candidate spatial filtering includes exactly 60 m and excludes 60.001 m by default in all directions', () => {
  const houses = [0,45,90,135,180,225,270,315].flatMap(bearing => [60, 60.001].map(m =>
    item(`${bearing}-${m}`, 'Rumah', destination(origin, m, bearing, { units: 'meters' }).geometry.coordinates)))
  const [candidate] = findFatCandidates([pole, ...houses])
  assert.equal(candidate.potentialCount, 8)
  assert.ok(candidate.houses.every(h => h.house.id.endsWith('-60')))
})

test('changing config expands spatial search and uses the same bound for FAT selection and grouping', () => {
  const houses = [house('at60', 60), house('over60', 60.001), house('at90', 90), house('over90', 90.001)]
  const features = [pole, ...houses]
  const candidates90 = findFatCandidates(features, config(90))
  assert.equal(candidates90[0].potentialCount, 3)
  const result90 = simulateFatPlacement(candidates90, features, { config: config(90) })
  assert.equal(result90.servedCount, 3)
  const result60 = simulateFatPlacement(candidates90, features) // Even a cached larger candidate list is filtered.
  assert.equal(result60.servedCount, 1)
  assert.equal(result60.boxes[0].candidate.potentialCount, 1)
  assert.equal(result60.boxes[0].splitters[0].houses[0].house.id, 'at60')
  assert.equal(result60.unservedHouses.length, 3)
})

test('no-graph estimates use the active total limit, including the exact default boundary', () => {
  const houses = [house('at60', 60), house('over60', 60.001)]
  const result = planDropRoutes(assigned(houses), [pole, ...houses])
  assert.equal(result.maxDropLengthMeters, 60)
  assert.deepEqual(result.routes.map(r => r.status), ['estimate', 'problem'])
  assert.equal(result.routes[0].lastSpanMeters, null)
  assert.equal(result.routes[1].coordinates, null)
  assert.deepEqual(planDropRoutes(assigned(houses), [pole, ...houses], config(80)).routes.map(r => r.status), ['estimate', 'estimate'])
})

test('supported route checks total 60 m inclusive, independently of its 35 m last span', () => {
  for (const [anchorMeters, houseMeters, expected] of [[25,60,'valid'], [25.001,60.001,'problem'], [20,55.001,'problem']]) {
    const terminal = item('terminal', 'Tiang', at(anchorMeters))
    const h = house('h', houseMeters)
    const result = planDropRoutes(assigned([h]), [pole, terminal, h, supportLine(terminal)])
    assert.equal(result.routes[0].status, expected)
    if (expected === 'valid') {
      assert.ok(Math.abs(result.routes[0].lengthMeters - 60) < 1e-6)
      assert.ok(Math.abs(result.routes[0].lastSpanMeters - 35) < 1e-6)
    }
  }
})

test('increasing total limit does not relax the last span; decreasing it still constrains a direct span', () => {
  const remote = item('remote', 'Tiang', at(500))
  const far = item('far', 'Tiang', at(600))
  const line = { ...supportLine(remote), geometry: { type: 'LineString', coordinates: [at(500), at(600)] } }
  for (const [meters, limit, expected] of [[35,100,'valid'], [35.001,100,'problem'], [30,20,'problem']]) {
    const h = house('h', meters)
    assert.equal(planDropRoutes(assigned([h]), [pole, remote, far, h, line], config(limit)).routes[0].status, expected)
  }
})

test('changing the limit revalidates retained assignments and route geometries without mutating either', () => {
  const h = house('at90', 90)
  const terminal = item('terminal', 'Tiang', at(60))
  const features = [pole, terminal, h, supportLine(terminal)]
  const simulation = assigned([h])
  const oldPlan = planDropRoutes(simulation, features, config(120))
  assert.equal(oldPlan.routes[0].status, 'valid')
  const before = JSON.stringify({ simulation, oldPlan, features })
  assert.deepEqual(validateFatAssignments(simulation), [h.id])
  const result = currentDropPlan({ features, simulation, plan: oldPlan }, simulation, features)
  assert.equal(result.routes[0].status, 'problem')
  assert.equal(result.routes[0].coordinates, null)
  assert.equal(result.routes[0].fatId, oldPlan.routes[0].fatId)
  assert.equal(result.routes[0].splitterId, oldPlan.routes[0].splitterId)
  assert.equal(result.verifiedLengthMeters, 0)
  assert.equal(result.problemCount, 1)
  assert.equal(JSON.stringify({ simulation, oldPlan, features }), before)
  assert.equal(currentDropPlan({ features, simulation, plan: oldPlan }, simulation, features, config(120)), oldPlan)
})

test('raising the limit keeps old failures unverified until explicitly rerouted, then admits the new path', () => {
  const h = house('h', 80), terminal = item('terminal', 'Tiang', at(60))
  const features = [pole, terminal, h, supportLine(terminal)], simulation = assigned([h])
  const failed = planDropRoutes(simulation, features)
  assert.equal(failed.routes[0].status, 'problem')
  assert.equal(revalidateDropPlan(failed, config(100)).routes[0].status, 'problem')
  assert.equal(planDropRoutes(simulation, features, config(100)).routes[0].status, 'valid')
})

test('a house within the straight-line filter can still fail a longer actual route at the default bound', () => {
  const h = house('h', 50), terminal = item('terminal', 'Tiang', at(30))
  const bend = destination(origin, 40, 0, { units: 'meters' }).geometry.coordinates
  const winding = { ...supportLine(terminal), geometry: { type: 'LineString', coordinates: [origin, bend, at(30)] } }
  const features = [pole, terminal, h, winding]
  const candidates = findFatCandidates(features).filter(c => c.id === pole.id)
  assert.equal(candidates[0].potentialCount, 1)
  const simulation = simulateFatPlacement(candidates, features)
  assert.equal(simulation.servedCount, 1)
  assert.equal(planDropRoutes(simulation, features).routes[0].status, 'problem')
  const expanded = planDropRoutes(simulation, features, config(120))
  assert.equal(expanded.routes[0].status, 'valid')
  assert.ok(expanded.routes[0].lengthMeters > 60)
})
