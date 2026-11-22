const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { destination } = require('@turf/turf')
const load = require('./helpers/load-typescript.cjs')
const manual = load(path.resolve(__dirname, '../lib/manual-assignments.ts'))
const { planDropRoutes } = load(path.resolve(__dirname, '../lib/drop-plan.ts'))
const { buildSimulationReview } = load(path.resolve(__dirname, '../lib/simulation-review.ts'))
const { saveAssignmentProject, loadAssignmentProject, PROJECT_STORAGE_KEY } = load(path.resolve(__dirname, '../lib/project-storage.ts'))
const config = { maxDropLengthMeters: 60 }
const origin = [107.6, -6.9]
const at = (meters, bearing = 90) => destination(origin, meters, bearing, { units: 'meters' }).geometry.coordinates.slice(0, 2)
const point = (id, category, coordinates) => ({ id, name: id, file: 'fixture.kml', kind: 'Point', category, geometry: { type: 'Point', coordinates }, coords: [coordinates[1], coordinates[0]] })
function box(id, pole, houses = []) {
  const items = houses.map(house => ({ house, distanceMeters: 20 }))
  return { candidate: { id, pole, houses: items, potentialCount: items.length, averageDistanceMeters: 20, maxCapacity: 16 }, houses: items, splitters: Array.from({ length: Math.ceil(items.length / 8) }, (_, i) => ({ id: `${id}-splitter-${i + 1}`, number: i + 1, houses: items.slice(i * 8, (i + 1) * 8) })), estimatedDropMeters: 0 }
}
function fixture({ support = false, samePole = false, full = false } = {}) {
  const house = point('h', 'Rumah', at(20)), other = point('other', 'Rumah', at(22))
  const a = point('pole-a', 'Tiang', origin), b = samePole ? a : point('pole-b', 'Tiang', at(10))
  const residents = full ? Array.from({ length: 16 }, (_, i) => point(`r${i}`, 'Rumah', at(12 + i))) : [other]
  const features = [a, ...(samePole ? [] : [b]), house, ...residents]
  if (support) features.push({ id: 'support', name: 'support', file: 'fixture.kml', kind: 'LineString', category: 'Jalur kabel', coords: a.coords, dropSupport: true, geometry: { type: 'LineString', coordinates: [origin, at(10)] } })
  const boxes = [box('fat-a', a, [house]), box('fat-b', b, residents)]
  const simulation = manual.summarizeAssignments(boxes, features)
  const project = { ...manual.emptyAssignmentProject(), features, simulation, candidates: boxes.map(b => b.candidate), candidateLimit: 60, simulationLimit: 60 }
  project.plan = planDropRoutes(simulation, features, config)
  return { project, house, other, a, b }
}
const approved = project => manual.approveFat(project, 'fat-b')

test('detach frees exactly one port, removes active route and membership, retains survey and empty FAT', () => {
  const { project, house } = fixture()
  const before = JSON.stringify(project)
  const next = manual.detachHouse(project, house.id, config)
  assert.equal(next.simulation.boxes[0].houses.length, 0)
  assert.equal(next.simulation.boxes.length, 2)
  assert.equal(next.simulation.boxes[0].splitters[0].houses.length, 0)
  assert.equal(next.plan.routes.some(r => r.house.id === house.id), false)
  assert.equal(next.simulation.unservedHouses[0].id, house.id)
  assert.equal(buildSimulationReview(next.simulation, next.plan).boxes[0].remainingCapacity, 16)
  assert.deepEqual(next.decisions[house.id], { kind: 'detached' })
  assert.equal(next.features, project.features)
  assert.equal(JSON.stringify(project), before)
  assert.equal(manual.detachHouse(next, house.id, config), next)
})

test('provisional/unknown FAT rejected; estimates require explicit acknowledgment, never validate as actual', () => {
  const { project } = fixture()
  const before = JSON.stringify(project)
  assert.throws(() => manual.assignHouse(project, 'h', 'fat-b', config, true), /provisional/)
  assert.throws(() => manual.assignHouse(project, 'h', 'unknown', config, true), /tidak tersedia/)
  const active = approved(project)
  assert.throws(() => manual.assignHouse(active, 'h', 'fat-b', config), /Konfirmasi status estimasi/)
  const next = manual.assignHouse(active, 'h', 'fat-b', config, true)
  const route = next.plan.routes.find(r => r.house.id === 'h')
  assert.equal(route.status, 'estimate')
  assert.equal(route.lastSpanMeters, null)
  const review = buildSimulationReview(next.simulation, next.plan)
  assert.equal(review.drops.find(r => r.house.id === 'h').basis, 'estimate')
  assert.equal(review.drops.find(r => r.house.id === 'h').status, 'estimate')
  assert.equal(JSON.stringify(project), before)
})

test('successful move is atomic, correct cluster and port counts; repeated clicks are idempotent', () => {
  const { project } = fixture({ support: true })
  const next = manual.assignHouse(approved(project), 'h', 'fat-b', config)
  assert.equal(next.simulation.boxes[0].houses.length, 0)
  assert.equal(next.simulation.boxes[1].houses.length, 2)
  assert.equal(next.simulation.servedCount, project.simulation.servedCount)
  assert.equal(next.simulation.unservedHouses.length, 0)
  assert.equal(next.plan.routes.filter(r => r.house.id === 'h').length, 1)
  assert.equal(next.plan.routes.find(r => r.house.id === 'h').fatId, 'fat-b')
  assert.equal(next.decisions.h.fatId, 'fat-b')
  assert.equal(next.decisions.h.splitterId, 'fat-b-splitter-1')
  assert.equal(manual.assignHouse(next, 'h', 'fat-b', config), next)
  assert.equal(next.features, project.features)
  const oldOtherRoute = project.plan.routes.find(r => r.house.id !== 'h')
  assert.equal(next.plan.routes.find(r => r.house.id !== 'h'), oldOtherRoute)
})

test('full FAT and maximum length reject moves, preserving original allocation and geometry', () => {
  const { project } = fixture({ full: true })
  const current = approved(project), before = JSON.stringify(current)
  assert.throws(() => manual.assignHouse(current, 'h', 'fat-b', config, true), /FAT penuh/)
  assert.equal(manual.houseOwner(current, 'h').candidate.id, 'fat-a')
  assert.equal(JSON.stringify(current), before)
  const near = approved(fixture().project)
  assert.throws(() => manual.assignHouse(near, 'h', 'fat-b', { maxDropLengthMeters: 5 }, true), /melebihi batas/)
  assert.equal(manual.houseOwner(near, 'h').candidate.id, 'fat-a')
})

test('existing support policy rejects an unknown/invalid last span instead of falling back to straight-line approval', () => {
  const { project } = fixture({ support: true })
  const far = project.features.find(f => f.id === 'h')
  // New fixture data only: 40 m from both disconnected anchors, within total 60 m but last span >35 m.
  far.geometry.coordinates = at(45, 0); far.coords = [far.geometry.coordinates[1], far.geometry.coordinates[0]]
  const preview = manual.previewAssignment(approved(project), 'h', 'fat-b', config)
  assert.equal(preview.method, 'unknown')
  assert.equal(preview.lengthMeters, null)
  assert.equal(preview.allowed, false)
  assert.ok(preview.reasons.some(r => /penyangga|bentangan|rute/.test(r)))
  assert.throws(() => manual.assignHouse(approved(project), 'h', 'fat-b', config, true))
})

test('two FAT device IDs sharing one pole resolve precisely, including save/restore', () => {
  const { project } = fixture({ samePole: true })
  const next = manual.assignHouse(approved(project), 'h', 'fat-b', config, true)
  assert.equal(manual.houseOwner(next, 'h').candidate.id, 'fat-b')
  assert.equal(next.simulation.boxes[0].candidate.pole.id, next.simulation.boxes[1].candidate.pole.id)
  const memory = new Map(), storage = { setItem: (k, v) => memory.set(k, v), getItem: k => memory.get(k) ?? null }
  saveAssignmentProject(storage, next, config)
  const restored = loadAssignmentProject(storage).project
  assert.equal(manual.houseOwner(restored, 'h').candidate.id, 'fat-b')
  assert.equal(restored.simulation.boxes.length, 2)
})

test('regeneration respects detached/manual locks, reserves ports, preserves device identity; return to auto unlocks', () => {
  const { project } = fixture({ full: true })
  let current = manual.detachHouse(project, 'h', config)
  current = manual.approveFat(current, 'fat-a')
  current = manual.assignHouse(current, 'r0', 'fat-a', config, true)
  const before = JSON.stringify(current.features)
  for (let i = 0; i < 3; i++) {
    current = manual.regenerateAssignments(current, config)
    assert.equal(manual.houseOwner(current, 'h'), null)
    assert.equal(manual.houseOwner(current, 'r0').candidate.id, 'fat-a')
    assert.ok(current.simulation.boxes.every(b => b.houses.length <= 16 && b.splitters.every(s => s.houses.length <= 8)))
    assert.equal(new Set(current.simulation.boxes.flatMap(b => b.houses.map(h => h.house.id))).size, current.simulation.servedCount)
  }
  assert.equal(JSON.stringify(current.features), before)
  const automatic = manual.releaseManualDecision(current, 'h')
  assert.equal(automatic.decisions.h, undefined)
  const regenerated = manual.regenerateAssignments(automatic, config)
  assert.ok(manual.houseOwner(regenerated, 'h'))
  assert.equal(manual.releaseManualDecision(automatic, 'h'), automatic)
})

test('config changes report invalid manual assignment without silently moving/detaching it, also after regeneration', () => {
  const current = manual.assignHouse(approved(fixture().project), 'h', 'fat-b', config, true)
  const strict = { maxDropLengthMeters: 5 }
  assert.ok(manual.manualAssignmentIssues(current, strict).some(issue => issue.houseId === 'h'))
  const next = manual.regenerateAssignments(current, strict)
  assert.equal(manual.houseOwner(next, 'h').candidate.id, 'fat-b')
  assert.equal(next.decisions.h.kind, 'assigned')
  assert.ok(manual.manualAssignmentIssues(next, strict).some(issue => issue.houseId === 'h'))
})

test('save/refresh preserves detach, manual cluster, approvals, capacity and exact survey coordinates', () => {
  let current = approved(fixture().project)
  current = manual.detachHouse(current, 'other', config)
  current = manual.assignHouse(current, 'h', 'fat-b', config, true)
  const memory = new Map(), storage = { setItem: (k, v) => memory.set(k, v), getItem: k => memory.get(k) ?? null }
  saveAssignmentProject(storage, current, config)
  const { project: restored, config: restoredConfig } = loadAssignmentProject(storage)
  assert.deepEqual(restored.features, current.features)
  assert.deepEqual(restored.decisions, current.decisions)
  assert.deepEqual(restored.approvedFatIds, current.approvedFatIds)
  assert.equal(restored.simulation.servedCount, current.simulation.servedCount)
  assert.deepEqual(restoredConfig, config)
  assert.equal(manual.houseOwner(restored, 'other'), null)
  assert.equal(manual.houseOwner(restored, 'h').candidate.id, 'fat-b')
  assert.deepEqual(restored.plan.routes.map(r => [r.id, r.coordinates, r.lengthMeters]), current.plan.routes.map(r => [r.id, r.coordinates, r.lengthMeters]))
  const regenerated = manual.regenerateAssignments(restored, config)
  assert.equal(manual.houseOwner(regenerated, 'other'), null)
  assert.equal(manual.houseOwner(regenerated, 'h').candidate.id, 'fat-b')
  const invalid = JSON.parse(memory.get(PROJECT_STORAGE_KEY))
  invalid.boxes[0].splitters[0].houseIds.push('h')
  memory.set(PROJECT_STORAGE_KEY, JSON.stringify(invalid))
  assert.throws(() => loadAssignmentProject(storage), /ganda|keputusan|Penguncian/)
})

test('preview/cancel are read-only, stale preview cannot apply over latest port occupancy', () => {
  let current = approved(fixture({ full: true }).project)
  current = manual.detachHouse(current, 'r0', config)
  assert.equal(manual.previewAssignment(current, 'h', 'fat-b', config).allowed, true)
  const before = JSON.stringify(current)
  manual.previewAssignment(current, 'h', 'fat-b', config)
  assert.equal(JSON.stringify(current), before)
  const latest = manual.assignHouse(current, 'r0', 'fat-b', config, true)
  assert.throws(() => manual.assignHouse(latest, 'h', 'fat-b', config, true), /FAT penuh/)
  assert.equal(manual.houseOwner(latest, 'h').candidate.id, 'fat-a')
})

test('draft approval and preview can be cancelled without changing project; failed apply cannot persist staged approval', () => {
  const { project } = fixture()
  const before = JSON.stringify(project)
  const draft = manual.approveFat(project, 'fat-b')
  assert.equal(manual.previewAssignment(draft, 'h', 'fat-b', config).allowed, true)
  assert.equal(JSON.stringify(project), before)
  assert.equal(project.approvedFatIds.includes('fat-b'), false)
  assert.throws(() => manual.assignHouse(manual.approveFat(project, 'fat-b'), 'h', 'fat-b', { maxDropLengthMeters: 1 }, true))
  assert.equal(JSON.stringify(project), before)
})

test('same FAT locking preserves the current splitter; manual reservation at full capacity cannot overflow on regenerate', () => {
  const { project } = fixture({ full: true })
  let current = manual.approveFat(project, 'fat-b')
  for (let i = 0; i < 16; i++) current = manual.assignHouse(current, `r${i}`, 'fat-b', config, true)
  assert.equal(current.decisions.r15.splitterId, 'fat-b-splitter-2')
  current = manual.regenerateAssignments(current, config)
  const target = current.simulation.boxes.find(box => box.candidate.id === 'fat-b')
  assert.equal(target.houses.length, 16)
  assert.deepEqual(target.splitters.map(s => s.houses.length), [8, 8])
  assert.equal(current.decisions.r15.splitterId, 'fat-b-splitter-2')
  assert.equal(current.simulation.servedCount, 17)
})

test('invalid locked assignments survive save/refresh with their old geometry for revalidation', () => {
  const current = manual.assignHouse(approved(fixture().project), 'h', 'fat-b', config, true)
  const strict = { maxDropLengthMeters: 5 }
  const memory = new Map(), storage = { setItem: (k, v) => memory.set(k, v), getItem: k => memory.get(k) ?? null }
  saveAssignmentProject(storage, current, strict)
  const restored = loadAssignmentProject(storage)
  assert.equal(manual.houseOwner(restored.project, 'h').candidate.id, 'fat-b')
  assert.ok(manual.manualAssignmentIssues(restored.project, restored.config).some(issue => issue.houseId === 'h'))
  assert.deepEqual(restored.project.plan.routes.find(r => r.house.id === 'h').coordinates, current.plan.routes.find(r => r.house.id === 'h').coordinates)
})
