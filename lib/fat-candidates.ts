import { distance, earthRadius, geojsonRbush, point } from "@turf/turf"
import type { BBox, Point } from "geojson"
import type { FeatureItem } from "./import-survey"
import { DEFAULT_PLANNING_CONFIG, DISTANCE_EPSILON_METERS, maxDropLength, type PlanningConfig } from "./planning-config"

export const FAT_MAX_BOXES_PER_POLE = 1
export const FAT_MAX_SPLITTERS = 2
export const FAT_SPLITTER_PORTS = 8
export const FAT_CAPACITY = FAT_MAX_SPLITTERS * FAT_SPLITTER_PORTS
export const FAT_CANDIDATE_STATUS = "Kandidat awal—belum validasi rute"

export type PotentialHouse = { house: FeatureItem; distanceMeters: number }
export type FatCandidate = {
  id: string
  pole: FeatureItem
  houses: PotentialHouse[]
  potentialCount: number
  averageDistanceMeters: number | null
  maxCapacity: number
}

// Floating-point tolerance at the configured boundary; not a route allowance.
const DISTANCE_EPSILON = DISTANCE_EPSILON_METERS

function searchBounds(longitude: number, latitude: number, maxDropLengthMeters: number): BBox[] {
  const radians = Math.PI / 180
  const angle = Math.min(Math.PI, (maxDropLengthMeters + DISTANCE_EPSILON) / earthRadius)
  const lat = latitude * radians
  const south = Math.max(-90, (lat - angle) / radians)
  const north = Math.min(90, (lat + angle) / radians)
  if (south === -90 || north === 90) return [[-180, south, 180, north]]
  // Bounds of the spherical search cap, rather than a polygon approximating a circle.
  const deltaLon = Math.asin(Math.min(1, Math.sin(angle) / Math.cos(lat))) / radians
  const west = longitude - deltaLon
  const east = longitude + deltaLon
  if (west < -180) return [[west + 360, south, 180, north], [-180, south, east, north]]
  if (east > 180) return [[west, south, 180, north], [-180, south, east - 360, north]]
  return [[west, south, east, north]]
}

export function findFatCandidates(features: readonly FeatureItem[], config: PlanningConfig = DEFAULT_PLANNING_CONFIG): FatCandidate[] {
  const maxDropLengthMeters = maxDropLength(config)
  const points = features.filter((f): f is FeatureItem & { geometry: Point } => f.geometry.type === "Point")
  const houses = new Map(points.filter(f => f.category === "Rumah").map(f => [f.id, f]))
  const poles = new Map(points.filter(f => f.category === "Tiang").map(f => [f.id, f]))
  const index = geojsonRbush<Point, { id: string }>()
  index.load(Array.from(houses.values(), house => point(house.geometry.coordinates, { id: house.id })))

  return Array.from(poles.values(), pole => {
    const coordinates = pole.geometry.coordinates
    const nearby = new Map(searchBounds(coordinates[0], coordinates[1], maxDropLengthMeters).flatMap(bounds =>
      index.search(bounds).features.map(feature => [feature.properties.id, feature] as const)))
    const potential: PotentialHouse[] = []
    for (const feature of nearby.values()) {
      const distanceMeters = distance(coordinates, feature.geometry.coordinates, { units: "meters" })
      if (distanceMeters <= maxDropLengthMeters + DISTANCE_EPSILON) {
        potential.push({ house: houses.get(feature.properties.id)!, distanceMeters })
      }
    }
    potential.sort((a, b) => a.distanceMeters - b.distanceMeters || a.house.id.localeCompare(b.house.id))
    return {
      id: pole.id, pole, houses: potential, potentialCount: potential.length,
      averageDistanceMeters: potential.length ? potential.reduce((sum, house) => sum + house.distanceMeters, 0) / potential.length : null,
      maxCapacity: FAT_CAPACITY,
    }
  }).sort((a, b) => b.potentialCount - a.potentialCount ||
    (a.averageDistanceMeters ?? Infinity) - (b.averageDistanceMeters ?? Infinity) || a.id.localeCompare(b.id))
}
