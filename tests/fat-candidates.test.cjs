const { test } = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")
const { destination, distance } = require("@turf/turf")
const load = require("./helpers/load-typescript.cjs")
const { findFatCandidates: discover, FAT_CAPACITY, FAT_MAX_BOXES_PER_POLE, FAT_MAX_SPLITTERS, FAT_SPLITTER_PORTS } = load(path.resolve(__dirname, "../lib/fat-candidates.ts"))
// Retain the original regression scenarios using an explicit user setting.
// New defaults and changing the setting are tested in planning-config.test.cjs.
const findFatCandidates = features => discover(features, { maxDropLengthMeters: 120 })

function item(id, category, coordinates) {
  return { id, name: id, category, file: "survey.kmz", kind: "Point",
    coords: [coordinates[1], coordinates[0]], geometry: { type: "Point", coordinates } }
}
function offset(origin, meters, bearing = 0) {
  const [longitude, latitude] = destination(origin, meters, bearing, { units: "meters" }).geometry.coordinates
  // KML import accepts longitudes in [-180, 180]; Turf destination can return unwrapped values.
  return [((longitude + 180) % 360 + 360) % 360 - 180, latitude]
}
const origin = [107.6098, -6.9147]

test("stores geographic distances in meters with the correct longitude/latitude order", () => {
  const pole = item("p", "Tiang", origin)
  const house = item("18", "Rumah", offset(origin, 75, 90))
  const [candidate] = findFatCandidates([pole, house])
  assert.ok(Math.abs(candidate.houses[0].distanceMeters - 75) < 1e-6)
  assert.ok(Math.abs(candidate.averageDistanceMeters - 75) < 1e-6)
  assert.equal(candidate.houses[0].house, house)
})

test("includes exactly 120 m in every direction and excludes houses just beyond it", () => {
  const features = [item("p", "Tiang", origin)]
  for (const bearing of [0, 45, 90, 135, 180, 225, 270, 315]) {
    features.push(item(`boundary-${bearing}`, "Rumah", offset(origin, 120, bearing)))
    features.push(item(`outside-${bearing}`, "Rumah", offset(origin, 120.001, bearing)))
  }
  features.push(item("inside", "Rumah", offset(origin, 119.999)))
  features.push(item("same-location", "Rumah", origin))
  const [candidate] = findFatCandidates(features)
  assert.equal(candidate.potentialCount, 10)
  assert.ok(candidate.houses.every(({ house }) => !house.id.startsWith("outside")))
  assert.equal(candidate.houses[0].distanceMeters, 0)
})

test("keeps all 25 potential houses while capacity stays at 16 without final assignments", () => {
  const poles = [item("p1", "Tiang", origin), item("p2", "Tiang", offset(origin, 5))]
  const houses = Array.from({ length: 25 }, (_, i) => item(`h${i}`, "Rumah", offset(origin, i + 1, 90)))
  const features = [...poles, ...houses]
  const before = JSON.stringify(features)
  const candidates = findFatCandidates(features)
  assert.equal(candidates.length, 2)
  for (const candidate of candidates) {
    assert.equal(candidate.potentialCount, 25)
    assert.equal(candidate.houses.length, 25)
    assert.equal(candidate.maxCapacity, 16)
    assert.deepEqual(new Set(candidate.houses.map(h => h.house.id)), new Set(houses.map(h => h.id)))
  }
  assert.equal(FAT_MAX_BOXES_PER_POLE, 1)
  assert.equal(FAT_MAX_SPLITTERS, 2)
  assert.equal(FAT_SPLITTER_PORTS, 8)
  assert.equal(FAT_CAPACITY, 16)
  assert.equal(JSON.stringify(features), before)
})

test("ranks by potential count first, then average distance, retaining zero-house poles", () => {
  const positions = [origin, offset(origin, 1000), offset(origin, 2000), offset(origin, 3000)]
  const features = positions.map((p, i) => item(`p${i}`, "Tiang", p))
  for (const [index, distances] of [[0, [100, 110, 115]], [1, [10, 20]], [2, [30, 40]]]) {
    distances.forEach((d, i) => features.push(item(`h${index}-${i}`, "Rumah", offset(positions[index], d))))
  }
  const result = findFatCandidates(features)
  assert.deepEqual(result.map(c => c.id), ["p0", "p1", "p2", "p3"])
  assert.equal(result[3].potentialCount, 0)
  assert.equal(result[3].averageDistanceMeters, null)
})

test("uses only point poles and houses, emits one candidate per pole ID", () => {
  const pole = item("p", "Tiang", origin)
  const area = { ...item("area", "Rumah", origin), kind: "Polygon", geometry: {
    type: "Polygon", coordinates: [[[107, -6], [108, -6], [108, -7], [107, -6]]],
  } }
  const line = { ...pole, id: "line", kind: "LineString", geometry: { type: "LineString", coordinates: [origin, offset(origin, 10)] } }
  const result = findFatCandidates([pole, pole, area, line, item("fat", "FAT", origin), item("unknown", "Belum dikategorikan", origin)])
  assert.equal(result.length, 1)
  assert.equal(result[0].potentialCount, 0)
  assert.deepEqual(findFatCandidates([]), [])
  assert.deepEqual(findFatCandidates([item("h", "Rumah", origin)]), [])
})

test("spatial filtering agrees with a full Turf distance scan, including dateline and high latitudes", () => {
  for (const position of [origin, [179.9998, 0], [-179.9998, 0], [20, 85], [20, 89.9999], [20, -89.9999]]) {
    const houses = Array.from({ length: 180 }, (_, i) => item(`h${i}`, "Rumah", offset(position, (i % 30) * 8, i * 17)))
    const [candidate] = findFatCandidates([item("p", "Tiang", position), ...houses])
    const expected = houses.filter(h => distance(position, h.geometry.coordinates, { units: "meters" }) <= 120 + 1e-6)
    assert.deepEqual(new Set(candidate.houses.map(h => h.house.id)), new Set(expected.map(h => h.id)))
  }
})
