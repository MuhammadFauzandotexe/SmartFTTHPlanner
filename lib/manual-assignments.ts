import { distance } from "@turf/turf"
import { FAT_CAPACITY, FAT_MAX_SPLITTERS, FAT_SPLITTER_PORTS, findFatCandidates, type PotentialHouse } from "./fat-candidates"
import { simulateFatPlacement, type FatSimulation, type SelectedFat } from "./fat-simulation"
import { planDropRoutes, type DropPlan, type DropRoute } from "./drop-plan"
import type { FeatureItem } from "./import-survey"
import { DISTANCE_EPSILON_METERS, maxDropLength, type PlanningConfig } from "./planning-config"

export type ManualDecision = { kind: "detached" } | { kind: "assigned"; fatId: string; splitterId: string }
export type AssignmentProject = {
  features: FeatureItem[]
  candidates: ReturnType<typeof findFatCandidates> | null
  simulation: FatSimulation | null
  plan: DropPlan | null
  decisions: Record<string, ManualDecision>
  approvedFatIds: string[]
  candidateLimit: number | null
  simulationLimit: number | null
  distributionStaleFdtIds?: string[]
  revision: number
}
export const emptyAssignmentProject = (): AssignmentProject => ({ features: [], candidates: null, simulation: null, plan: null, decisions: {}, approvedFatIds: [], candidateLimit: null, simulationLimit: null, revision: 0 })
export function houseOwner(project: AssignmentProject, houseId: string) {
  return project.simulation?.boxes.find(box => box.splitters.some(splitter => splitter.houses.some(item => item.house.id === houseId))) ?? null
}
const directMeters = (house: FeatureItem, box: SelectedFat) => distance(house.geometry.type === "Point" ? house.geometry.coordinates : [], box.candidate.pole.geometry.type === "Point" ? box.candidate.pole.geometry.coordinates : [], { units: "meters" })

// Membership is authoritative in splitters. Keep device and splitter IDs, including empty devices.
export function summarizeAssignments(boxes: SelectedFat[], features: readonly FeatureItem[], localSearchComplete = true): FatSimulation {
  const assigned = new Set<string>()
  const normalized = boxes.map(box => {
    const houses = box.splitters.flatMap(splitter => splitter.houses)
    for (const item of houses) {
      if (assigned.has(item.house.id)) throw new Error(`Rumah ${item.house.id} memiliki alokasi ganda`)
      assigned.add(item.house.id)
    }
    return { ...box, houses, estimatedDropMeters: houses.reduce((sum, item) => sum + item.distanceMeters, 0) }
  })
  return { boxes: normalized, servedCount: assigned.size, unservedHouses: features.filter(f => f.category === "Rumah" && f.geometry.type === "Point" && !assigned.has(f.id)), splitterCount: normalized.reduce((sum, box) => sum + box.splitters.length, 0), estimatedDropMeters: normalized.reduce((sum, box) => sum + box.estimatedDropMeters, 0), localSearchComplete }
}
function withoutHouse(boxes: SelectedFat[], houseId: string): SelectedFat[] {
  return boxes.map(box => ({ ...box, splitters: box.splitters.map(splitter => ({ ...splitter, houses: splitter.houses.filter(item => item.house.id !== houseId) })) }))
}
function targetSplitter(box: SelectedFat, houseId: string) {
  const current = box.splitters.find(splitter => splitter.houses.some(item => item.house.id === houseId))
  if (current) return current
  const free = box.splitters.find(splitter => splitter.houses.length < FAT_SPLITTER_PORTS)
  if (free) return free
  if (box.splitters.length >= FAT_MAX_SPLITTERS) return null
  const number = Array.from({ length: FAT_MAX_SPLITTERS }, (_, i) => i + 1).find(number => !box.splitters.some(splitter => splitter.number === number))!
  return { id: `${box.candidate.id}-splitter-${number}`, number, houses: [] as PotentialHouse[] }
}
export type AssignmentPreview = {
  allowed: boolean; reasons: string[]; warnings: string[]; fatId: string; splitterId: string | null
  used: number; available: number; lengthMeters: number | null; method: "route" | "estimate" | "unknown"; route: DropRoute | null
}
export function previewAssignment(project: AssignmentProject, houseId: string, fatId: string, config: PlanningConfig): AssignmentPreview {
  const result: AssignmentPreview = { allowed: false, reasons: [], warnings: [], fatId, splitterId: null, used: 0, available: 0, lengthMeters: null, method: "unknown", route: null }
  const house = project.features.find(feature => feature.id === houseId && feature.category === "Rumah" && feature.geometry.type === "Point")
  const box = project.simulation?.boxes.find(box => box.candidate.id === fatId)
  if (!house) result.reasons.push("Rumah survei tidak ditemukan")
  if (!box) result.reasons.push("Perangkat FAT tujuan tidak tersedia pada proyek")
  if (!house || !box) return result
  const used = new Set(box.splitters.flatMap(splitter => splitter.houses.map(item => item.house.id)))
  result.used = used.size
  result.available = Math.max(0, FAT_CAPACITY - used.size)
  if (!project.approvedFatIds.includes(fatId)) result.reasons.push("FAT masih provisional; setujui perangkat FAT terlebih dahulu")
  if (used.size - Number(used.has(houseId)) >= FAT_CAPACITY) result.reasons.push(`FAT penuh (${FAT_CAPACITY} port terpakai)`)
  if (box.splitters.length > FAT_MAX_SPLITTERS || box.splitters.some(splitter => splitter.houses.length > FAT_SPLITTER_PORTS)) result.reasons.push("Kapasitas splitter FAT tidak konsisten")
  const splitter = targetSplitter(box, houseId)
  result.splitterId = splitter?.id ?? null
  if (!splitter) result.reasons.push("Tidak ada port splitter tersedia")
  const direct = directMeters(house, box)
  result.lengthMeters = direct
  if (direct > maxDropLength(config) + DISTANCE_EPSILON_METERS) result.reasons.push(`Jarak lurus melebihi batas drop aktif ${maxDropLength(config)} m`)
  if (splitter) {
    // Use the existing routing engine for this one affected connection; never reoptimize assignments.
    const item = { house, distanceMeters: direct }
    const single = summarizeAssignments([{ ...box, splitters: [{ ...splitter, houses: [item] }] }], [house])
    const plan = planDropRoutes(single, project.features, config)
    result.route = plan.routes[0] ?? null
    result.method = plan.hasSupportData ? result.route?.coordinates ? "route" : "unknown" : "estimate"
    result.lengthMeters = result.route?.lengthMeters ?? null
    if (!result.route || result.route.status === "problem") result.reasons.push(result.route?.reason ?? "Rute belum diketahui")
    if (result.method === "estimate") result.warnings.push("Estimasi jarak lurus; rute aktual, bentangan terakhir, dan hambatan belum divalidasi. Alokasi hanya rencana sementara.")
    else if (result.method === "route") result.warnings.push("Jalur mengikuti penyangga terdata; hambatan lapangan belum terverifikasi.")
  }
  result.allowed = result.reasons.length === 0
  return result
}
function planWithRoutes(project: AssignmentProject, routes: DropRoute[], config: PlanningConfig): DropPlan {
  return { maxDropLengthMeters: project.plan?.maxDropLengthMeters ?? maxDropLength(config), hasSupportData: project.features.some(f => f.geometry.type === "LineString" && f.dropSupport === true), routes,
    verifiedLengthMeters: routes.filter(r => r.status === "valid").reduce((sum, r) => sum + (r.lengthMeters ?? 0), 0),
    estimatedLengthMeters: routes.filter(r => r.status === "estimate").reduce((sum, r) => sum + (r.lengthMeters ?? 0), 0), problemCount: routes.filter(r => r.status === "problem").length }
}
export function detachHouse(project: AssignmentProject, houseId: string, config: PlanningConfig): AssignmentProject {
  if (!project.features.some(f => f.id === houseId && f.category === "Rumah" && f.geometry.type === "Point")) throw new Error("Rumah tidak ditemukan")
  if (project.decisions[houseId]?.kind === "detached" && !houseOwner(project, houseId)) return project
  return { ...project, simulation: project.simulation ? summarizeAssignments(withoutHouse(project.simulation.boxes, houseId), project.features, project.simulation.localSearchComplete) : null,
    plan: project.plan ? planWithRoutes(project, project.plan.routes.filter(route => route.house.id !== houseId), config) : null,
    decisions: { ...project.decisions, [houseId]: { kind: "detached" } }, revision: project.revision + 1 }
}
export function assignHouse(project: AssignmentProject, houseId: string, fatId: string, config: PlanningConfig, acceptEstimate = false): AssignmentProject {
  const preview = previewAssignment(project, houseId, fatId, config)
  if (!preview.allowed || !preview.route || !preview.splitterId) throw new Error(preview.reasons.join(". ") || "Alokasi tidak dapat divalidasi")
  if (preview.method === "estimate" && !acceptEstimate) throw new Error("Konfirmasi status estimasi yang belum divalidasi terlebih dahulu")
  const previous = project.decisions[houseId]
  if (previous?.kind === "assigned" && previous.fatId === fatId && houseOwner(project, houseId)?.candidate.id === fatId) return project
  const boxes = withoutHouse(project.simulation!.boxes, houseId).map(box => {
    if (box.candidate.id !== fatId) return box
    const splitter = project.simulation!.boxes.find(b => b.candidate.id === fatId)!.splitters.find(s => s.id === preview.splitterId) ?? targetSplitter(box, houseId)!
    const item = { house: preview.route!.house, distanceMeters: directMeters(preview.route!.house, box) }
    const splitters = box.splitters.some(s => s.id === splitter.id) ? box.splitters.map(s => s.id === splitter.id ? { ...s, houses: [...s.houses, item] } : s) : [...box.splitters, { ...splitter, houses: [item] }]
    return { ...box, splitters }
  })
  // One replacement snapshot: rejection above leaves the old allocation and geometry untouched.
  return { ...project, simulation: summarizeAssignments(boxes, project.features, project.simulation!.localSearchComplete),
    plan: planWithRoutes(project, [...(project.plan?.routes ?? []).filter(route => route.house.id !== houseId), preview.route], config),
    decisions: { ...project.decisions, [houseId]: { kind: "assigned", fatId, splitterId: preview.splitterId } }, revision: project.revision + 1 }
}
export function releaseManualDecision(project: AssignmentProject, houseId: string): AssignmentProject {
  if (!project.decisions[houseId]) return project
  const decisions = { ...project.decisions }
  delete decisions[houseId]
  return { ...project, decisions, revision: project.revision + 1 }
}
export function approveFat(project: AssignmentProject, fatId: string): AssignmentProject {
  if (!project.simulation?.boxes.some(box => box.candidate.id === fatId)) throw new Error("FAT tidak ditemukan")
  if (project.approvedFatIds.includes(fatId)) return project
  return { ...project, approvedFatIds: [...project.approvedFatIds, fatId], revision: project.revision + 1 }
}
export function regenerateAssignments(project: AssignmentProject, config: PlanningConfig): AssignmentProject {
  const existingBoxes = project.simulation?.boxes ?? []
  const candidates = findFatCandidates(project.features, config).flatMap(candidate => {
    const devices = existingBoxes.filter(box => box.candidate.pole.id === candidate.pole.id)
    return devices.length ? devices.map(box => ({ ...candidate, id: box.candidate.id })) : [candidate]
  })
  const retained = (project.simulation?.boxes ?? []).map(box => ({ ...box, splitters: box.splitters.map(splitter => ({ ...splitter, houses: splitter.houses.filter(item => {
    const decision = project.decisions[item.house.id]
    return decision?.kind === "assigned" && decision.fatId === box.candidate.id
  }) })) }))
  const capacityByFat = new Map(retained.map(box => [box.candidate.id, Math.max(0, FAT_CAPACITY - box.splitters.reduce((sum, s) => sum + s.houses.length, 0))]))
  const automaticHouses = project.features.filter(feature => !project.decisions[feature.id])
  const automatic = simulateFatPlacement(candidates, automaticHouses, { config, capacityByFat })
  const devices = new Map(retained.map(box => [box.candidate.id, box]))
  for (const auto of automatic.boxes) {
    let box = devices.get(auto.candidate.id)
    if (!box) { devices.set(auto.candidate.id, auto); continue }
    for (const item of auto.houses) {
      const splitter = targetSplitter(box, item.house.id)
      if (!splitter) throw new Error("Kapasitas reservasi manual tidak konsisten")
      box = { ...box, splitters: box.splitters.some(s => s.id === splitter.id) ? box.splitters.map(s => s.id === splitter.id ? { ...s, houses: [...s.houses, item] } : s) : [...box.splitters, { ...splitter, houses: [item] }] }
    }
    devices.set(auto.candidate.id, box)
  }
  const simulation = summarizeAssignments([...devices.values()], project.features, automatic.localSearchComplete)
  // Keep locked geometry even when config changes: normal review revalidates and reports it.
  const lockedRoutes = project.plan?.routes.filter(route => {
    const decision = project.decisions[route.house.id]
    return decision?.kind === "assigned" && decision.fatId === route.fatId
  }) ?? []
  return { ...project, candidates, simulation, plan: lockedRoutes.length ? planWithRoutes(project, lockedRoutes, config) : null, candidateLimit: config.maxDropLengthMeters, simulationLimit: config.maxDropLengthMeters, revision: project.revision + 1 }
}
export function manualAssignmentIssues(project: AssignmentProject, config: PlanningConfig): { houseId: string; message: string }[] {
  return Object.entries(project.decisions).flatMap(([houseId, decision]) => {
    if (decision.kind === "detached") return [{ houseId, message: "Belum terlayani — dilepas manual (terkunci)" }]
    const preview = previewAssignment(project, houseId, decision.fatId, config)
    return preview.reasons.map(message => ({ houseId, message: `Alokasi manual dipertahankan: ${message}` }))
  })
}
