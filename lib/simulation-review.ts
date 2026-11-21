import { along, distance, length, lineString } from "@turf/turf"
import { FAT_CAPACITY, FAT_MAX_BOXES_PER_POLE, FAT_MAX_SPLITTERS, FAT_SPLITTER_PORTS } from "./fat-candidates"
import { formatDropMeters, type DropPlan, type DropRoute } from "./drop-plan"
import type { FatSimulation } from "./fat-simulation"
import type { FeatureItem } from "./import-survey"
import { DEFAULT_PLANNING_CONFIG, DISTANCE_EPSILON_METERS, DROP_LAST_SPAN_METERS, maxDropLength, type PlanningConfig } from "./planning-config"

export type ReviewStatus = "verified" | "estimate" | "violation" | "unresolved"
export type ReviewedDrop = {
  id: string
  fatId: string
  splitterId: string
  house: FeatureItem
  route: DropRoute | null
  basis: "route" | "estimate"
  lengthMeters: number | null
  lastSpanMeters: number | null
  coordinates: [number, number][] | null
  midpoint: [number, number] | null
  status: ReviewStatus
  distanceViolation: boolean
}
export type LengthSummary = { count: number; total: number; average: number | null; maximum: number | null }
export type CapacityIssue = { fatId: string; code: string; message: string }
export type SimulationReview = {
  drops: ReviewedDrop[]
  servedCount: number
  unservedCount: number
  boxCount: number
  splitterCount: number
  lengths: LengthSummary
  verified: LengthSummary
  estimates: LengthSummary
  unverifiedRoutes: LengthSummary
  distanceViolationCount: number
  unresolvedCount: number
  capacityIssues: CapacityIssue[]
  boxes: { fatId: string; remainingCapacity: number; review: LengthSummary; verified: LengthSummary; estimates: LengthSummary; unverifiedRoutes: LengthSummary }[]
}

const finiteLength = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0
function summarize(drops: ReviewedDrop[]): LengthSummary {
  const values = drops.map(d => d.lengthMeters).filter(finiteLength)
  const total = values.reduce((sum, value) => sum + value, 0)
  return { count: values.length, total, average: values.length ? total / values.length : null, maximum: values.length ? values.reduce((max, value) => Math.max(max, value), 0) : null }
}
export function reviewStatusLabel(status: ReviewStatus): string {
  return status === "verified" ? "Sesuai batas menurut data" : status === "violation" ? "Pelanggaran jarak" : status === "unresolved" ? "Belum ditemukan rute layak" : "Belum validasi rute"
}
export function dropDistanceLabel(drop: ReviewedDrop): string | null {
  return drop.lengthMeters === null ? null : `${drop.basis === "estimate" ? "Est. " : ""}${formatDropMeters(drop.lengthMeters)}`
}
export function shouldShowDropLabel(drop: ReviewedDrop, { showLabels, zoom, selectedFatId, selectedHouseId, selectedRouteId }: {
  showLabels: boolean; zoom: number; selectedFatId?: string; selectedHouseId?: string; selectedRouteId?: string
}): boolean {
  if (!showLabels || !drop.midpoint) return false
  if (selectedFatId) return drop.fatId === selectedFatId
  return zoom >= 18 || drop.house.id === selectedHouseId || drop.id === selectedRouteId
}
export function dropAppearance(drop: ReviewedDrop, selectedFatId?: string, selectedRouteId?: string) {
  const dimmed = !!selectedFatId && selectedFatId !== drop.fatId
  return {
    color: drop.status === "verified" ? "#059669" : drop.status === "violation" ? "#dc2626" : drop.basis === "estimate" ? "#2563eb" : "#d97706",
    dashArray: drop.status === "verified" ? undefined : drop.status === "violation" ? "10 4 2 4" : drop.basis === "estimate" ? "7 6" : "2 6",
    opacity: dimmed ? 0.15 : 0.95,
    weight: drop.id === selectedRouteId ? 6 : selectedFatId === drop.fatId ? 4 : 3,
  }
}

// Presentation only: observe assignments and existing geometries; never generate or optimize routes.
export function buildSimulationReview(simulation: FatSimulation, plan: DropPlan | null, config: PlanningConfig = DEFAULT_PLANNING_CONFIG): SimulationReview {
  const limit = maxDropLength(config)
  const eps = DISTANCE_EPSILON_METERS
  const routes = new Map(plan?.routes.map(r => [JSON.stringify([r.fatId, r.splitterId, r.house.id]), r]))
  const drops: ReviewedDrop[] = []
  const capacityIssues: CapacityIssue[] = []
  const assigned = new Map<string, string>()
  const poles = new Map<string, string>()
  for (const box of simulation.boxes) {
    const fatId = box.candidate.id
    const poleId = box.candidate.pole.id
    if (poles.has(poleId)) capacityIssues.push({ fatId, code: "pole-boxes", message: `Tiang ${box.candidate.pole.name} memiliki lebih dari ${FAT_MAX_BOXES_PER_POLE} box FAT.` })
    poles.set(poleId, fatId)
    if (box.splitters.length > FAT_MAX_SPLITTERS) capacityIssues.push({ fatId, code: "box-splitters", message: `FAT ${fatId} melebihi ${FAT_MAX_SPLITTERS} splitter.` })
    for (const splitter of box.splitters) {
      if (splitter.houses.length > FAT_SPLITTER_PORTS) capacityIssues.push({ fatId, code: "splitter-houses", message: `Splitter ${splitter.number} pada FAT ${fatId} melebihi ${FAT_SPLITTER_PORTS} rumah.` })
      for (const { house } of splitter.houses) {
        if (assigned.has(house.id)) capacityIssues.push({ fatId, code: "duplicate-house", message: `Rumah ${house.name} ditugaskan lebih dari satu kali.` })
        assigned.set(house.id, fatId)
        const route = routes.get(JSON.stringify([fatId, splitter.id, house.id])) ?? null
        const actualBasis = !!route && !!plan?.hasSupportData && (route.status === "valid" || finiteLength(route.lastSpanMeters))
        const coordinates = route?.coordinates ?? null
        const measured = coordinates && coordinates.length >= 2 ? length(lineString(coordinates), { units: "meters" }) : null
        const direct = distance([box.candidate.pole.coords[1], box.candidate.pole.coords[0]], [house.coords[1], house.coords[0]], { units: "meters" })
        const lengthMeters = actualBasis ? measured ?? (finiteLength(route?.lengthMeters) ? route.lengthMeters : null) : measured ?? direct
        const lastSpanMeters = actualBasis && finiteLength(route?.lastSpanMeters) ? route.lastSpanMeters : null
        const distanceViolation = direct > limit + eps || finiteLength(lengthMeters) && lengthMeters > limit + eps || lastSpanMeters !== null && lastSpanMeters > DROP_LAST_SPAN_METERS + eps
        const verified = actualBasis && measured !== null && lastSpanMeters !== null && route?.status === "valid"
        const status: ReviewStatus = distanceViolation ? "violation" : route?.status === "problem" ? "unresolved" : verified ? "verified" : "estimate"
        const midpoint = coordinates && coordinates.length >= 2 && measured !== null ? along(lineString(coordinates), measured / 2, { units: "meters" }).geometry.coordinates : null
        drops.push({ id: route?.id ?? JSON.stringify([fatId, splitter.id, house.id]), fatId, splitterId: splitter.id, house, route,
          basis: actualBasis ? "route" : "estimate", lengthMeters, lastSpanMeters, status, distanceViolation,
          coordinates, midpoint: midpoint ? [midpoint[0], midpoint[1]] : null })
      }
    }
  }
  const verified = (items: ReviewedDrop[]) => summarize(items.filter(d => d.status === "verified"))
  const estimates = (items: ReviewedDrop[]) => summarize(items.filter(d => d.basis === "estimate"))
  const unverified = (items: ReviewedDrop[]) => summarize(items.filter(d => d.basis === "route" && d.status !== "verified"))
  return {
    drops, servedCount: assigned.size,
    unservedCount: new Set(simulation.unservedHouses.filter(h => !assigned.has(h.id)).map(h => h.id)).size,
    boxCount: simulation.boxes.length, splitterCount: simulation.boxes.reduce((sum, box) => sum + box.splitters.length, 0),
    lengths: summarize(drops), verified: verified(drops), estimates: estimates(drops), unverifiedRoutes: unverified(drops),
    distanceViolationCount: new Set(drops.filter(d => d.distanceViolation).map(d => d.house.id)).size,
    unresolvedCount: drops.filter(d => d.status === "unresolved").length, capacityIssues,
    boxes: simulation.boxes.map(box => {
      const items = drops.filter(d => d.fatId === box.candidate.id)
      return { fatId: box.candidate.id, remainingCapacity: Math.max(0, FAT_CAPACITY - new Set(items.map(d => d.house.id)).size),
        review: summarize(items), verified: verified(items), estimates: estimates(items), unverifiedRoutes: unverified(items) }
    }),
  }
}
