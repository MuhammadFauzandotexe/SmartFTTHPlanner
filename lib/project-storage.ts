import { distance } from "@turf/turf"
import { FAT_CAPACITY, FAT_MAX_SPLITTERS, FAT_SPLITTER_PORTS, findFatCandidates, type FatCandidate } from "./fat-candidates"
import { emptyAssignmentProject, summarizeAssignments, type AssignmentProject, type ManualDecision } from "./manual-assignments"
import type { FeatureItem } from "./import-survey"
import type { DropPlan, DropRoute } from "./drop-plan"
import { isValidDropLength, type PlanningConfig } from "./planning-config"

export const PROJECT_STORAGE_KEY = "smart-ftth:project:v1"
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const coordinate = (value: unknown): value is [number, number] => Array.isArray(value) && value.length >= 2 && finite(value[0]) && finite(value[1]) && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90
const nullableMeters = (value: unknown) => value === null || finite(value) && value >= 0
function isFeature(value: unknown): value is FeatureItem {
  if (!record(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.file !== "string" || !["Tiang", "Rumah", "FAT", "FDT", "Jalur kabel", "Belum dikategorikan"].includes(String(value.category)) || !Array.isArray(value.coords) || !finite(value.coords[0]) || !finite(value.coords[1]) || !record(value.geometry)) return false
  const { type, coordinates } = value.geometry
  if (type !== value.kind) return false
  if (type === "Point") return coordinate(coordinates) && value.coords[0] === coordinates[1] && value.coords[1] === coordinates[0]
  if (type === "LineString") return Array.isArray(coordinates) && coordinates.length >= 2 && coordinates.every(coordinate)
  return type === "Polygon" && Array.isArray(coordinates) && coordinates.length > 0 && coordinates.every(ring => Array.isArray(ring) && ring.length >= 4 && ring.every(coordinate))
}
export function saveAssignmentProject(storage: Pick<Storage, "setItem">, project: AssignmentProject, config: PlanningConfig): void {
  if (!isValidDropLength(config.maxDropLengthMeters)) throw new Error("Batas drop tidak valid")
  const snapshot = {
    version: 1, distributionStaleFdtIds: project.distributionStaleFdtIds ?? [], features: project.features, config, candidateLimit: project.candidateLimit, simulationLimit: project.simulationLimit,
    searched: project.candidates !== null, decisions: project.decisions, approvedFatIds: project.approvedFatIds,
    boxes: project.simulation?.boxes.map(box => ({ id: box.candidate.id, poleId: box.candidate.pole.id, splitters: box.splitters.map(s => ({ id: s.id, number: s.number, houseIds: s.houses.map(item => item.house.id) })) })) ?? null,
    localSearchComplete: project.simulation?.localSearchComplete ?? true,
    plan: project.plan ? { ...project.plan, routes: project.plan.routes.map(({ house, fat, ...route }) => ({ ...route, houseId: house.id, poleId: fat.id })) } : null,
  }
  storage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(snapshot))
}
// Rehydrate every house/pole reference from the canonical survey; derived counts are rebuilt.
// Reject malformed snapshots instead of partially loading assignments or approvals.
export function loadAssignmentProject(storage: Pick<Storage, "getItem">): { project: AssignmentProject; config: PlanningConfig } | null {
  const raw = storage.getItem(PROJECT_STORAGE_KEY)
  if (!raw) return null
  const data: unknown = JSON.parse(raw)
  if (!record(data) || data.version !== 1 || !Array.isArray(data.features) || !data.features.every(isFeature) || !record(data.config) || !isValidDropLength(data.config.maxDropLengthMeters) || !record(data.decisions) || !Array.isArray(data.approvedFatIds) || !data.approvedFatIds.every(id => typeof id === "string") || !(data.boxes === null || Array.isArray(data.boxes))) throw new Error("Snapshot proyek tidak valid; data tersimpan tidak ditimpa")
  const features = data.features
  const featureMap = new Map(features.map(f => [f.id, f]))
  if (featureMap.size !== features.length) throw new Error("ID survei ganda pada proyek")
  const config = { maxDropLengthMeters: data.config.maxDropLengthMeters }
  const candidates = findFatCandidates(features, config)
  const candidateMap = new Map(candidates.map(c => [c.id, c]))
  const boxIds = new Set<string>(), splitterIds = new Set<string>()
  const boxes = (data.boxes ?? []).map((value: unknown) => {
    if (!record(value) || typeof value.id !== "string" || typeof value.poleId !== "string" || !Array.isArray(value.splitters) || boxIds.has(value.id)) throw new Error("Perangkat FAT tersimpan tidak valid")
    boxIds.add(value.id)
    const pole = featureMap.get(value.poleId)
    if (!pole || pole.geometry.type !== "Point" || !["Tiang", "FAT"].includes(pole.category)) throw new Error("Tiang/FAT survei tidak ditemukan")
    const base = candidateMap.get(value.id)
    const candidate: FatCandidate = base && base.pole.id === pole.id ? base : { id: value.id, pole, houses: [], potentialCount: 0, averageDistanceMeters: null, maxCapacity: FAT_CAPACITY }
    const splitters = value.splitters.map((s: unknown) => {
      if (!record(s) || typeof s.id !== "string" || !Number.isInteger(s.number) || (s.number as number) < 1 || (s.number as number) > FAT_MAX_SPLITTERS || !Array.isArray(s.houseIds) || s.houseIds.length > FAT_SPLITTER_PORTS || splitterIds.has(s.id)) throw new Error("Splitter tersimpan tidak valid")
      splitterIds.add(s.id)
      const houses = s.houseIds.map(id => {
        const house = typeof id === "string" ? featureMap.get(id) : null
        if (!house || house.category !== "Rumah" || house.geometry.type !== "Point") throw new Error("Rumah alokasi tidak ditemukan")
        return { house, distanceMeters: 0 }
      })
      return { id: s.id, number: s.number as number, houses }
    })
    if (splitters.length > FAT_MAX_SPLITTERS || new Set(splitters.map(s => s.number)).size !== splitters.length) throw new Error("Kapasitas splitter tersimpan tidak valid")
    return { candidate, houses: [], splitters, estimatedDropMeters: 0 }
  })
  // Distance is derived from canonical coordinates, not serialized cached totals.
  for (const box of boxes) for (const splitter of box.splitters) for (const item of splitter.houses) {
    item.distanceMeters = distance([box.candidate.pole.coords[1], box.candidate.pole.coords[0]], [item.house.coords[1], item.house.coords[0]], { units: "meters" })
  }
  const simulation = data.boxes === null ? null : summarizeAssignments(boxes, features, data.localSearchComplete === true)
  const decisions: Record<string, ManualDecision> = {}
  for (const [houseId, value] of Object.entries(data.decisions)) {
    if (!featureMap.has(houseId) || featureMap.get(houseId)?.category !== "Rumah" || !record(value)) throw new Error("Keputusan manual tersimpan tidak valid")
    if (value.kind === "detached") {
      if (simulation?.boxes.some(box => box.houses.some(item => item.house.id === houseId))) throw new Error("Rumah dilepas masih memiliki alokasi")
      decisions[houseId] = { kind: "detached" }
    } else if (value.kind === "assigned" && typeof value.fatId === "string" && typeof value.splitterId === "string") {
      if (!simulation?.boxes.some(box => box.candidate.id === value.fatId && box.splitters.some(s => s.id === value.splitterId && s.houses.some(item => item.house.id === houseId)))) throw new Error("Penguncian manual tidak sesuai alokasi")
      decisions[houseId] = { kind: "assigned", fatId: value.fatId, splitterId: value.splitterId }
    } else throw new Error("Jenis keputusan manual tidak valid")
  }
  if (data.approvedFatIds.some(id => !boxIds.has(id))) throw new Error("Persetujuan merujuk FAT yang tidak ada")
  let plan: DropPlan | null = null
  if (data.plan !== null) {
    if (!record(data.plan) || !isValidDropLength(data.plan.maxDropLengthMeters) || !Array.isArray(data.plan.routes)) throw new Error("Rencana drop tersimpan tidak valid")
    const seen = new Set<string>(), routeIds = new Set<string>()
    const routes: DropRoute[] = data.plan.routes.map((r: unknown) => {
      if (!record(r) || typeof r.id !== "string" || typeof r.houseId !== "string" || typeof r.fatId !== "string" || typeof r.splitterId !== "string" || typeof r.reason !== "string" || !["valid", "estimate", "problem"].includes(String(r.status)) || !nullableMeters(r.lengthMeters) || !nullableMeters(r.lastSpanMeters) || !(r.coordinates === null || Array.isArray(r.coordinates) && r.coordinates.length >= 2 && r.coordinates.every(coordinate)) || !(r.midpoint === null || coordinate(r.midpoint)) || seen.has(r.houseId) || routeIds.has(r.id)) throw new Error("Geometri rencana tersimpan tidak valid")
      const box = simulation?.boxes.find(box => box.candidate.id === r.fatId)
      const splitter = box?.splitters.find(s => s.id === r.splitterId && s.houses.some(item => item.house.id === r.houseId))
      const house = featureMap.get(r.houseId)
      if (!box || !splitter || !house) throw new Error("Rencana drop tidak sesuai alokasi")
      seen.add(r.houseId)
      routeIds.add(r.id)
      return { id: r.id, house, fat: box.candidate.pole, fatId: r.fatId, splitterId: splitter.id, splitterNumber: splitter.number, reason: r.reason, status: r.status as DropRoute["status"], lengthMeters: r.lengthMeters as number | null, lastSpanMeters: r.lastSpanMeters as number | null, coordinates: r.coordinates as DropRoute["coordinates"], midpoint: r.midpoint as DropRoute["midpoint"] }
    })
    plan = { maxDropLengthMeters: data.plan.maxDropLengthMeters, hasSupportData: features.some(f => f.dropSupport === true), routes, verifiedLengthMeters: routes.filter(r => r.status === "valid").reduce((sum, r) => sum + (r.lengthMeters ?? 0), 0), estimatedLengthMeters: routes.filter(r => r.status === "estimate").reduce((sum, r) => sum + (r.lengthMeters ?? 0), 0), problemCount: routes.filter(r => r.status === "problem").length }
  }
  return { project: { ...emptyAssignmentProject(), features, simulation, plan, distributionStaleFdtIds: Array.isArray(data.distributionStaleFdtIds) ? data.distributionStaleFdtIds.filter((id): id is string => typeof id === "string" && features.some(f => f.id === id && f.category === "FDT")) : [], candidates: data.searched ? [...new Map([...candidates, ...boxes.map(box => box.candidate)].map(c => [c.id, c])).values()] : null, decisions, approvedFatIds: [...new Set(data.approvedFatIds as string[])], candidateLimit: isValidDropLength(data.candidateLimit) ? data.candidateLimit : null, simulationLimit: isValidDropLength(data.simulationLimit) ? data.simulationLimit : null }, config }
}
