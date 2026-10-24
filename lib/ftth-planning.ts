import { distance, point } from "@turf/turf"
import { validGeometry, type FeatureItem } from "./survey"

export const MAX_HOMES_PER_GROUP = 8
export type PlanningPoint = {
  id: string
  name: string
  sourceId: string
  file: string
  coordinates: [longitude: number, latitude: number]
}
export type FatCandidate = {
  id: string
  pole: PlanningPoint
  totalDistanceMeters: number
  connections: { homeId: string; distanceMeters: number }[]
}
export type HomeGroup = { id: string; color: string; homes: PlanningPoint[]; candidate: FatCandidate | null }
export type PlanningIssue = { id: string; name: string; reason: string }
export type FtthPlan = {
  groups: HomeGroup[]
  homeCount: number
  poleCount: number
  issues: PlanningIssue[]
  warnings: string[]
}

function compareText(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0 }
/** Coordinate order, then source identifiers, makes equal-distance choices reproducible. */
function comparePoint(a: PlanningPoint, b: PlanningPoint) {
  return a.coordinates[0] - b.coordinates[0] || a.coordinates[1] - b.coordinates[1]
    || compareText(a.name, b.name) || compareText(a.sourceId, b.sourceId) || compareText(a.id, b.id)
}
export function planningDistance(a: PlanningPoint, b: PlanningPoint): number {
  return distance(point(a.coordinates), point(b.coordinates), { units: "meters" })
}

/** A geographically ordered seed plus up to seven nearest unassigned homes.
 * This is an initial greedy grouping, not a global optimum or cable routing.
 */
export function groupHomes(homes: readonly PlanningPoint[]): PlanningPoint[][] {
  let remaining = [...homes].sort(comparePoint)
  const groups: PlanningPoint[][] = []
  while (remaining.length) {
    const seed = remaining[0]
    const nearest = remaining.slice(1).map(home => ({ home, meters: planningDistance(seed, home) }))
      .sort((a, b) => a.meters - b.meters || comparePoint(a.home, b.home))
      .slice(0, MAX_HOMES_PER_GROUP - 1).map(entry => entry.home)
    const group = [seed, ...nearest]
    const assigned = new Set(group.map(home => home.id))
    groups.push(group)
    remaining = remaining.filter(home => !assigned.has(home.id))
  }
  return groups
}

/** Score each surveyed pole against EVERY home; no centroid shortcut. */
export function selectFatPole(homes: readonly PlanningPoint[], poles: readonly PlanningPoint[]): Omit<FatCandidate, "id"> | null {
  if (!homes.length || !poles.length) return null
  let best: Omit<FatCandidate, "id"> | null = null
  for (const pole of [...poles].sort(comparePoint)) {
    const connections = homes.map(home => ({ homeId: home.id, distanceMeters: planningDistance(pole, home) }))
    const totalDistanceMeters = connections.reduce((sum, connection) => sum + connection.distanceMeters, 0)
    if (!best || totalDistanceMeters < best.totalDistanceMeters) best = { pole, totalDistanceMeters, connections }
  }
  return best
}

/** Snapshot valid survey points without changing any survey objects/properties. */
export function extractPlanningInputs(features: readonly FeatureItem[]) {
  const homes: PlanningPoint[] = []
  const poles: PlanningPoint[] = []
  const issues: PlanningIssue[] = []
  const seen = new Set<string>()
  for (const feature of features) {
    if (feature.category !== "Rumah" && feature.category !== "Tiang") continue
    let reason = ""
    if (feature.geometry?.type !== "Point") reason = "Perencanaan MVP hanya menerima geometri Point tunggal."
    else if (!validGeometry(feature.geometry)) reason = "Koordinat tidak valid atau di luar rentang longitude/latitude."
    else if (seen.has(feature.id)) reason = "ID internal duplikat; titik tidak dihitung dua kali."
    if (reason) { issues.push({ id: feature.id, name: feature.name, reason }); continue }
    if (feature.geometry.type !== "Point") continue
    seen.add(feature.id)
    const props = feature.props || {}
    const sourceId = [props.POLE_ID, props.HPTAR_ID, props.HOME_ID, props.originalId]
      .find(value => typeof value === "string" || typeof value === "number")
    const snapshot: PlanningPoint = {
      id: feature.id, name: feature.name, sourceId: sourceId === undefined ? feature.id : String(sourceId), file: feature.file,
      coordinates: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
    }
    if (feature.category === "Rumah") homes.push(snapshot)
    else poles.push(snapshot)
  }
  return { homes, poles, issues }
}

export function planFtth(features: readonly FeatureItem[]): FtthPlan {
  const { homes, poles, issues } = extractPlanningInputs(features)
  const warnings: string[] = []
  if (!homes.length) warnings.push("Tidak ada titik Rumah valid untuk dikelompokkan.")
  if (!poles.length) warnings.push("Tidak ada titik Tiang valid. Kelompok rumah tetap dibuat tanpa kandidat FAT.")
  if (issues.length) warnings.push(`${issues.length} objek Rumah/Tiang dilewati; periksa rincian data tidak digunakan.`)
  const groups = groupHomes(homes).map((members, index): HomeGroup => {
    const id = `G${String(index + 1).padStart(3, "0")}`
    const candidate = selectFatPole(members, poles)
    return {
      id, color: `hsl(${Math.round(index * 137.508) % 360}, 75%, 38%)`, homes: members,
      candidate: candidate ? { id: `FAT-${id}`, ...candidate } : null,
    }
  })
  return { groups, homeCount: homes.length, poleCount: poles.length, issues, warnings }
}
