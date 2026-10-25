import { distance, point } from "@turf/turf"
import { validGeometry, type FeatureItem } from "./survey"

export const DEFAULT_MAX_FATS_PER_POLE = 2
export const MAX_FATS_PER_POLE = 10
export function validateMaxFatsPerPole(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_FATS_PER_POLE) throw new RangeError(`Maksimum FAT per tiang harus bilangan bulat 1–${MAX_FATS_PER_POLE}.`)
  return value
}
export const DEFAULT_FAT_PORTS = 8
export const DEFAULT_MAX_DROP_LENGTH_METERS = 50
export function validateMaxDropLengthMeters(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError("Maksimum panjang drop harus angka positif dan terbatas dalam meter.")
  return value
}
export const MAX_FAT_PORTS = 25
export function validateFatPorts(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_FAT_PORTS) {
    throw new RangeError(`Jumlah port FAT harus bilangan bulat antara 1 dan ${MAX_FAT_PORTS}.`)
  }
  return value
}
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
  connections: { homeId: string; distanceMeters: number; method?: "route" | "straight-line" }[]
}
export type HomeGroup = { capacity?: number; occupiedPorts?: number; locked?: boolean; id: string; color: string; homes: PlanningPoint[]; candidate: FatCandidate | null }
export type PlanningIssue = { id: string; name: string; reason: string }
export type FtthPlan = {
  maxFatsPerPole?: number
  manualRevision?: number
  fatPorts: number
  maxDropLengthMeters: number
  distanceMethod: "straight-line"
  unservedHomes: { home: PlanningPoint; reason: string; fatId?: string; pole?: PlanningPoint; distanceMeters?: number; distanceMethod?: "route" | "straight-line" }[]
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

/** A geographically ordered seed plus nearest unassigned homes up to FAT capacity.
 * This is an initial greedy grouping, not a global optimum or cable routing.
 */
export function groupHomes(homes: readonly PlanningPoint[], fatPorts = DEFAULT_FAT_PORTS): PlanningPoint[][] {
  validateFatPorts(fatPorts)
  let remaining = [...homes].sort(comparePoint)
  const groups: PlanningPoint[][] = []
  while (remaining.length) {
    const seed = remaining[0]
    const nearest = remaining.slice(1).map(home => ({ home, meters: planningDistance(seed, home) }))
      .sort((a, b) => a.meters - b.meters || comparePoint(a.home, b.home))
      .slice(0, fatPorts - 1).map(entry => entry.home)
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

export function planFtth(features: readonly FeatureItem[], fatPorts = DEFAULT_FAT_PORTS, maxDropLengthMeters = DEFAULT_MAX_DROP_LENGTH_METERS): FtthPlan {
  validateMaxDropLengthMeters(maxDropLengthMeters)
  validateFatPorts(fatPorts)
  const { homes, poles, issues } = extractPlanningInputs(features)
  const warnings: string[] = []
  if (!homes.length) warnings.push("Tidak ada titik Rumah valid untuk dikelompokkan.")
  if (!poles.length) warnings.push("Tidak ada titik Tiang valid. Rumah ditandai belum terlayani.")
  if (issues.length) warnings.push(`${issues.length} objek Rumah/Tiang dilewati; periksa rincian data tidak digunakan.`)
  const unservedHomes: FtthPlan["unservedHomes"] = []
  const groups = groupHomes(homes, fatPorts).map((members, index): HomeGroup => {
    const id = `G${String(index + 1).padStart(3, "0")}`
    const candidate = selectFatPole(members, poles)
    const served = members.filter(home => {
      const checked = candidate?.connections.find(connection => connection.homeId === home.id)
      if (checked && checked.distanceMeters <= maxDropLengthMeters) return true
      unservedHomes.push({ home, reason: candidate ? "Melebihi batas drop pada FAT kelompok yang dievaluasi." : "Tidak ada kandidat FAT: titik Tiang valid tidak tersedia.",
        ...(candidate && checked ? { fatId: `FAT-${id}`, pole: candidate.pole, distanceMeters: checked.distanceMeters } : {}) })
      return false
    })
    if (candidate) {
      const ids = new Set(served.map(home => home.id))
      candidate.connections = candidate.connections.filter(connection => ids.has(connection.homeId))
      candidate.totalDistanceMeters = candidate.connections.reduce((sum, connection) => sum + connection.distanceMeters, 0)
    }
    return {
      id, color: `hsl(${Math.round(index * 137.508) % 360}, 75%, 38%)`, homes: served,
      candidate: candidate ? { id: `FAT-${id}`, ...candidate } : null,
    }
  }).filter(group => group.homes.length > 0)
  return { fatPorts, maxDropLengthMeters, distanceMethod: "straight-line", unservedHomes, groups, homeCount: homes.length, poleCount: poles.length, issues, warnings }
}
