const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
const { planFtth, groupHomes, selectFatPole, planningDistance, extractPlanningInputs } = require('../lib/ftth-planning.ts')
const point = (id, longitude, latitude = 0) => ({ id, name: id, sourceId: id, file: 'test.kml', coordinates: [longitude, latitude] })
const feature = (id, category, longitude, latitude = 0) => ({ id, name: id, category, file: 'test.kml', kmlFile: 'test.kml', kind: 'Point', geometry: { type: 'Point', coordinates: [longitude, latitude] }, coords: [latitude, longitude], props: {} })

for (const count of [0, 1, 7, 8, 9, 16, 17, 65]) {
  test(`group ${count} houses exactly once, at most 8 per group, without modifying input`, () => {
    const homes = Array.from({ length: count }, (_, index) => point(`h${index}`, 107 + index * 0.0001, -6))
    const original = structuredClone(homes)
    const groups = groupHomes(homes)
    assert.equal(groups.length, Math.ceil(count / 8))
    assert(groups.every(group => group.length > 0 && group.length <= 8))
    const ids = groups.flatMap(group => group.map(home => home.id))
    assert.equal(ids.length, count)
    assert.equal(new Set(ids).size, count)
    assert.deepEqual(homes, original)
    assert.deepEqual(groupHomes([...homes].reverse()), groups)
  })
}

test('nearby homes group together instead of following survey input order', () => {
  const west = Array.from({ length: 8 }, (_, index) => point(`w${index}`, 100 + index * 0.00001))
  const east = Array.from({ length: 8 }, (_, index) => point(`e${index}`, 101 + index * 0.00001))
  const interleaved = west.flatMap((home, index) => [east[index], home])
  const groups = groupHomes(interleaved)
  assert(groups[0].every(home => home.id.startsWith('w')))
  assert(groups[1].every(home => home.id.startsWith('e')))
})

test('FAT minimizes total distance to all homes, not distance to centroid', () => {
  const homes = [point('h0', 0), point('h1', 0.001), point('h2', 0.002), point('far', 0.1)]
  const median = point('median-pole', 0.001)
  const centroid = point('centroid-pole', 0.02575)
  const result = selectFatPole(homes, [centroid, median])
  assert.equal(result.pole.id, median.id)
  assert.equal(result.connections.length, homes.length)
  assert.equal(result.totalDistanceMeters, homes.reduce((sum, home) => sum + planningDistance(median, home), 0))
  assert(result.totalDistanceMeters < homes.reduce((sum, home) => sum + planningDistance(centroid, home), 0))
})

test('equal candidates choose a consistent pole regardless of input order', () => {
  const homes = [point('h', 107, -6)]
  const a = point('a', 107.001, -6)
  const b = point('b', 107.001, -6)
  assert.equal(selectFatPole(homes, [b, a]).pole.id, 'a')
  assert.equal(selectFatPole(homes, [a, b]).pole.id, 'a')
  assert.equal(selectFatPole([], [a]), null)
  assert.equal(selectFatPole(homes, []), null)
})

test('different groups may share a pole but keep separate candidate IDs and service relationships', () => {
  const houses = Array.from({ length: 17 }, (_, index) => feature(`h${index}`, 'Rumah', 107 + index * 0.00001, -6))
  const plan = planFtth([...houses, feature('pole', 'Tiang', 107, -6)])
  assert.equal(plan.groups.length, 3)
  assert.equal(new Set(plan.groups.map(group => group.candidate.id)).size, 3)
  assert(plan.groups.every(group => group.candidate.pole.id === 'pole'))
  for (const group of plan.groups) {
    assert.deepEqual(group.candidate.connections.map(connection => connection.homeId), group.homes.map(home => home.id))
  }
})

test('no poles still produces all house groups with explicit missing candidate status', () => {
  const plan = planFtth([feature('h', 'Rumah', 107, -6)])
  assert.equal(plan.homeCount, 1)
  assert.equal(plan.groups.length, 1)
  assert.equal(plan.groups[0].candidate, null)
  assert(plan.warnings.some(warning => warning.includes('Tiang valid')))
  const empty = planFtth([])
  assert.equal(empty.groups.length, 0)
  assert(empty.warnings.some(warning => warning.includes('Rumah valid')))
})

test('invalid coordinates, duplicate IDs and non-point geometries are reported and skipped', () => {
  const input = [feature('ok', 'Rumah', 107, -6), feature('bad', 'Rumah', NaN), feature('pole-bad', 'Tiang', 200, 100), feature('ok', 'Rumah', 108), { ...feature('multi', 'Rumah', 107), geometry: { type: 'MultiPoint', coordinates: [[107, -6]] } }]
  const { homes, poles, issues } = extractPlanningInputs(input)
  assert.equal(homes.length, 1)
  assert.equal(poles.length, 0)
  assert.equal(issues.length, 4)
  assert.equal(planFtth(input).groups[0].homes.length, 1)
})

test('planning reads canonical GeoJSON coordinates and leaves all frozen survey data unchanged', () => {
  const home = feature('h', 'Rumah', 107, -6)
  home.coords = [0, 0] // The separate detail coordinate must not drive planning.
  home.props.HPTAR_ID = '000123'
  const pole = feature('p', 'Tiang', 107.001, -6)
  const input = [home, pole]
  const original = structuredClone(input)
  const freeze = value => { Object.freeze(value); for (const item of Object.values(value)) if (item && typeof item === 'object' && !Object.isFrozen(item)) freeze(item) }
  freeze(input)
  const first = planFtth(input)
  assert.deepEqual(planFtth(input), first)
  assert.deepEqual(input, original)
  assert.deepEqual(first.groups[0].homes[0].coordinates, [107, -6])
  assert.equal(first.groups[0].homes[0].sourceId, '000123')
  first.groups[0].homes[0].coordinates[0] = 1
  assert.equal(home.geometry.coordinates[0], 107)
})

test('geographic distance uses meters and handles the antimeridian', () => {
  const distance = planningDistance(point('a', 179.999), point('b', -179.999))
  assert(distance > 200 && distance < 230)
})

test('rerunning on new data replaces group membership and candidate selection', () => {
  const initial = planFtth([feature('old', 'Rumah', 107), feature('pole-old', 'Tiang', 107)])
  const next = planFtth([feature('new', 'Rumah', 108), feature('pole-new', 'Tiang', 108)])
  assert.deepEqual(initial.groups[0].homes.map(home => home.id), ['old'])
  assert.deepEqual(next.groups[0].homes.map(home => home.id), ['new'])
  assert.equal(next.groups[0].candidate.pole.id, 'pole-new')
})

const samplePath = require('node:path').join(__dirname, '../Data-Mentah.kmz')
test('imported project KMZ can be planned end to end with every valid house assigned once', { skip: !fs.existsSync(samplePath) }, async () => {
  global.DOMParser = require('@xmldom/xmldom').DOMParser
  const { importSurveyFile } = require('../lib/import-survey.ts')
  const imported = await importSurveyFile(new File([fs.readFileSync(samplePath)], 'Data-Mentah.kmz'))
  const sourceBefore = JSON.stringify(imported.features)
  const plan = planFtth(imported.features)
  const homes = imported.features.filter(feature => feature.category === 'Rumah' && feature.geometry.type === 'Point')
  const poles = new Set(imported.features.filter(feature => feature.category === 'Tiang' && feature.geometry.type === 'Point').map(feature => feature.id))
  assert(homes.length > 0)
  assert(poles.size > 0)
  assert.equal(plan.groups.length, Math.ceil(homes.length / 8))
  assert.deepEqual(plan.groups.flatMap(group => group.homes.map(home => home.id)).sort(), homes.map(home => home.id).sort())
  assert(plan.groups.every(group => group.homes.length <= 8 && group.candidate && poles.has(group.candidate.pole.id)))
  assert.deepEqual(plan.issues, [])
  assert.equal(JSON.stringify(imported.features), sourceBefore)
  console.log(`Sample planning: ${plan.homeCount} houses, ${plan.poleCount} poles, ${plan.groups.length} groups.`)
})
