const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const load = require('./helpers/load-typescript.cjs')
const { simulateFatPlacement: simulate } = load(path.resolve(__dirname, '../lib/fat-simulation.ts'))
const { findFatCandidates: discover } = load(path.resolve(__dirname, '../lib/fat-candidates.ts'))

// Original heuristic regression fixtures explicitly use the former 120 m setting.
const simulateFatPlacement = (candidates, houses, options = {}) => simulate(candidates, houses, { config: { maxDropLengthMeters: 120 }, ...options })
const findFatCandidates = features => discover(features, { maxDropLengthMeters: 120 })

function house(id) {
  return { id, name: id, category: 'Rumah', file: 'survey.kmz', kind: 'Point', coords: [-6.9, 107.6], geometry: { type: 'Point', coordinates: [107.6, -6.9] } }
}
function candidate(id, entries) {
  return { id, pole: { ...house(id), category: 'Tiang' }, houses: entries.map(([h, distanceMeters]) => ({ house: h, distanceMeters })),
    potentialCount: entries.length, averageDistanceMeters: entries.length ? entries.reduce((sum, [, d]) => sum + d, 0) / entries.length : null, maxCapacity: 16 }
}
function assertValid(result, allHouses) {
  const assigned = result.boxes.flatMap(b => b.splitters.flatMap(s => s.houses.map(h => h.house.id)))
  assert.equal(assigned.length, new Set(assigned).size)
  assert.equal(new Set(result.boxes.map(b => b.candidate.pole.id)).size, result.boxes.length)
  for (const box of result.boxes) {
    assert.ok(box.houses.length > 0 && box.houses.length <= 16)
    assert.equal(box.splitters.length, Math.ceil(box.houses.length / 8))
    assert.ok(box.splitters.length <= 2)
    for (const splitter of box.splitters) assert.ok(splitter.houses.length > 0 && splitter.houses.length <= 8)
    assert.equal(box.houses.length, box.splitters.reduce((sum, s) => sum + s.houses.length, 0))
  }
  assert.equal(result.servedCount, assigned.length)
  assert.equal(result.splitterCount, result.boxes.reduce((sum, b) => sum + b.splitters.length, 0))
  assert.deepEqual(new Set([...assigned, ...result.unservedHouses.map(h => h.id)]), new Set(allHouses.map(h => h.id)))
  assert.ok(result.unservedHouses.every(h => !assigned.includes(h.id)))
}

test('capacities at 1/8/9/16 and overflow: one pole, one box, up to two 1:8 splitters', () => {
  for (const count of [0, 1, 8, 9, 16, 17, 25]) {
    const houses = Array.from({ length: count }, (_, i) => house(`h${i}`))
    const c = candidate('p', houses.map(h => [h, 10]))
    const result = simulateFatPlacement([c], houses)
    assertValid(result, houses)
    assert.equal(result.servedCount, Math.min(count, 16))
    assert.equal(result.boxes.length, count ? 1 : 0)
    assert.equal(result.splitterCount, Math.ceil(Math.min(count, 16) / 8))
    assert.equal(result.unservedHouses.length, Math.max(0, count - 16))
  }
})

test('overlapping coverage never assigns a house to more than one box or splitter', () => {
  const houses = Array.from({ length: 25 }, (_, i) => house(`h${i}`))
  const candidates = ['a', 'b', 'c'].map(id => candidate(id, houses.map(h => [h, 20])))
  const before = JSON.stringify({ candidates, houses })
  const result = simulateFatPlacement(candidates, houses)
  assertValid(result, houses)
  assert.equal(result.servedCount, 25)
  assert.equal(result.boxes.length, 2)
  assert.equal(result.splitterCount, 4)
  assert.equal(JSON.stringify({ candidates, houses }), before)
})

test('prioritizes houses with one FAT alternative before flexible, nearer houses', () => {
  const scarce = Array.from({ length: 8 }, (_, i) => house(`scarce${i}`))
  const shared = Array.from({ length: 16 }, (_, i) => house(`shared${i}`))
  const candidates = [candidate('a', [...scarce.map(h => [h, 100]), ...shared.map(h => [h, 5])]), candidate('b', shared.map(h => [h, 10]))]
  const greedy = simulateFatPlacement(candidates, [...scarce, ...shared], { maxEvaluations: 0 })
  assert.equal(greedy.servedCount, 24)
  const a = greedy.boxes.find(b => b.candidate.id === 'a')
  assert.ok(scarce.every(h => a.houses.some(entry => entry.house.id === h.id)))
  const result = simulateFatPlacement(candidates, [...scarce, ...shared])
  assertValid(result, [...scarce, ...shared])
  assert.equal(result.servedCount, 24)
})

test('local search replaces a greedy pole and deletes a redundant box while preserving coverage', () => {
  const h = Array.from({ length: 6 }, (_, i) => house(`h${i}`))
  // Greedy picks a (four houses), then b, then c. b+c alone cover all six.
  const candidates = [candidate('a', [0,1,2,3].map(i => [h[i], 5])),
    candidate('b', [0,1,4].map(i => [h[i], 10])), candidate('c', [2,3,5].map(i => [h[i], 10]))]
  const greedy = simulateFatPlacement(candidates, h, { maxEvaluations: 0 })
  assert.equal(greedy.boxes.length, 3)
  const result = simulateFatPlacement(candidates, h)
  assertValid(result, h)
  assert.equal(result.servedCount, 6)
  assert.equal(result.boxes.length, 2)
  assert.equal(result.localSearchComplete, true)
})

test('local search minimizes splitters before total drop length', () => {
  const h = Array.from({ length: 16 }, (_, i) => house(`h${i}`))
  // Greedy chooses a for nine houses and b for seven: 3 splitters.
  // One house can move to b: eight/eight uses only 2 splitters, even at a longer distance.
  const candidates = [candidate('a', h.slice(0,9).map(x => [x, 1])),
    candidate('b', h.slice(8).map(x => [x, 100]))]
  const greedy = simulateFatPlacement(candidates, h, { maxEvaluations: 0 })
  assert.equal(greedy.splitterCount, 3)
  const result = simulateFatPlacement(candidates, h)
  assertValid(result, h)
  assert.equal(result.servedCount, 16)
  assert.equal(result.splitterCount, 2)
})

test('local search replaces a selected pole with a cheaper unselected pole', () => {
  const h = Array.from({ length: 6 }, (_, i) => house(`h${i}`))
  const candidates = [candidate('a', [0,1,2,3].map(i => [h[i], 5])),
    candidate('b', [3,4,5].map(i => [h[i], 10])), candidate('c', [0,1,2].map(i => [h[i], 1]))]
  const greedy = simulateFatPlacement(candidates, h, { maxEvaluations: 0 })
  assert.deepEqual(greedy.boxes.map(b => b.candidate.id), ['a', 'b'])
  const result = simulateFatPlacement(candidates, h)
  assertValid(result, h)
  assert.deepEqual(result.boxes.map(b => b.candidate.id), ['b', 'c'])
  assert.equal(result.estimatedDropMeters, 33)
})

test('local search swaps full-box residents to reduce total drop', () => {
  const h = Array.from({ length: 32 }, (_, i) => house(`h${i}`))
  const candidates = [candidate('a', h.map((x,i) => [x, i < 16 ? 1 : 10])),
    candidate('b', h.map((x,i) => [x, i < 16 ? 2 : 100]))]
  const greedy = simulateFatPlacement(candidates, h, { maxEvaluations: 0 })
  assert.equal(greedy.estimatedDropMeters, 1616)
  const result = simulateFatPlacement(candidates, h, { maxEvaluations: 10000 })
  assertValid(result, h)
  assert.equal(result.servedCount, 32)
  assert.equal(result.estimatedDropMeters, 192)
})

test('unreachable houses remain unserved; no phantom FAT is created', () => {
  const h = [house('reachable'), house('far')]
  const result = simulateFatPlacement([candidate('p', [[h[0], 50]])], h)
  assertValid(result, h)
  assert.deepEqual(result.unservedHouses.map(h => h.id), ['far'])
  assert.equal(result.estimatedDropMeters, 50)
  assert.equal(simulateFatPlacement([], h).boxes.length, 0)
})

test('same survey yields deterministic assignments even when input and potential lists are reversed', () => {
  const houses = Array.from({ length: 33 }, (_, i) => house(`h${i}`))
  const candidates = ['a', 'b', 'c'].map(id => candidate(id, houses.map(h => [h, 30])))
  const result = simulateFatPlacement(candidates, houses)
  const reordered = simulateFatPlacement([...candidates].reverse().map(c => ({ ...c, houses: [...c.houses].reverse() })), [...houses].reverse())
  assert.deepEqual(result, reordered)
  assert.deepEqual(result, simulateFatPlacement(candidates, houses))
})

test('integration with geographic candidate discovery respects the 120 m estimate', () => {
  const pole = { ...house('p'), category: 'Tiang' }
  const nearby = house('nearby')
  const far = { ...house('far'), coords: [-7, 107.6], geometry: { type: 'Point', coordinates: [107.6, -7] } }
  const features = [pole, nearby, far]
  const result = simulateFatPlacement(findFatCandidates(features), features)
  assertValid(result, [nearby, far])
  assert.equal(result.servedCount, 1)
  assert.deepEqual(result.unservedHouses.map(h => h.id), ['far'])
})
