import { FAT_CAPACITY, FAT_SPLITTER_PORTS, type FatCandidate, type PotentialHouse } from "./fat-candidates"
import { distance } from "@turf/turf"
import { DEFAULT_PLANNING_CONFIG, DISTANCE_EPSILON_METERS, maxDropLength, type PlanningConfig } from "./planning-config"
import type { FeatureItem } from "./import-survey"

export const FAT_SIMULATION_STATUS = "FAT terpilih sementara—belum validasi rute dan distribusi"
export type FatSplitter = { id: string; number: number; houses: PotentialHouse[] }
export type SelectedFat = {
  candidate: FatCandidate
  houses: PotentialHouse[]
  splitters: FatSplitter[]
  estimatedDropMeters: number
}
export type FatSimulation = {
  boxes: SelectedFat[]
  unservedHouses: FeatureItem[]
  servedCount: number
  splitterCount: number
  estimatedDropMeters: number
  localSearchComplete: boolean
}

type Assignment = Map<string, string> // house ID -> pole ID; never written into survey data
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

export function simulateFatPlacement(
  candidates: readonly FatCandidate[],
  surveyHouses: readonly FeatureItem[],
  { maxEvaluations = 2000, config = DEFAULT_PLANNING_CONFIG, capacityByFat }: { maxEvaluations?: number; config?: PlanningConfig; capacityByFat?: ReadonlyMap<string, number> } = {},
): FatSimulation {
  const capacity = (id: string) => Math.max(0, Math.min(FAT_CAPACITY, capacityByFat?.get(id) ?? FAT_CAPACITY))
  const maxDropLengthMeters = maxDropLength(config)
  const houses = new Map(surveyHouses.filter(h => h.category === "Rumah" && h.geometry.type === "Point").map(h => [h.id, h]))
  const poles = new Map([...candidates].sort((a, b) => compareId(a.id, b.id)).map(c => {
    const eligible = c.houses.filter(h => houses.has(h.house.id) && h.distanceMeters <= maxDropLengthMeters + DISTANCE_EPSILON_METERS)
      .sort((a, b) => a.distanceMeters - b.distanceMeters || compareId(a.house.id, b.house.id))
    return [c.id, { ...c, houses: eligible, potentialCount: eligible.length,
      averageDistanceMeters: eligible.length ? eligible.reduce((sum, h) => sum + h.distanceMeters, 0) / eligible.length : null }]
  }))
  const edges = new Map<string, Map<string, PotentialHouse>>()
  const alternatives = new Map<string, string[]>()
  for (const candidate of poles.values()) {
    const eligible = new Map(candidate.houses.filter(h => houses.has(h.house.id) && h.distanceMeters <= maxDropLengthMeters + DISTANCE_EPSILON_METERS).map(h => [h.house.id, h]))
    edges.set(candidate.id, eligible)
    for (const id of eligible.keys()) alternatives.set(id, [...(alternatives.get(id) ?? []), candidate.id])
  }
  const edge = (house: string, pole: string) => edges.get(pole)!.get(house)!
  const scarcity = (id: string) => alternatives.get(id)?.length ?? 0
  const occupied = (assignment: Assignment) => {
    const groups = new Map<string, string[]>()
    for (const [house, pole] of assignment) groups.set(pole, [...(groups.get(pole) ?? []), house])
    return new Map([...groups].sort(([a], [b]) => compareId(a, b)))
  }
  const score = (assignment: Assignment) => {
    const groups = occupied(assignment)
    let splitters = 0
    let drop = 0
    for (const ids of groups.values()) splitters += Math.ceil(ids.length / FAT_SPLITTER_PORTS)
    // Stable sum order makes input order irrelevant, including floating-point addition.
    for (const [house, pole] of [...assignment].sort(([a], [b]) => compareId(a, b))) drop += edge(house, pole).distanceMeters
    const signature = JSON.stringify([...groups].map(([pole, ids]) => [pole, ids.sort(compareId)]))
    return { served: assignment.size, boxes: groups.size, splitters, drop: Math.round(drop * 1e6), signature }
  }
  const better = (left: Assignment, right: Assignment) => {
    const a = score(left), b = score(right)
    return (b.served - a.served || a.boxes - b.boxes || a.splitters - b.splitters || a.drop - b.drop || compareId(a.signature, b.signature)) < 0
  }

  // Greedy: highest new coverage first; scarce houses precede flexible houses.
  let current: Assignment = new Map()
  const used = new Set<string>()
  while (true) {
    const choices = [...poles.values()].filter(c => !used.has(c.id)).map(candidate => {
      const available = [...edges.get(candidate.id)!.values()].filter(h => !current.has(h.house.id))
        .sort((a, b) => scarcity(a.house.id) - scarcity(b.house.id) || a.distanceMeters - b.distanceMeters || compareId(a.house.id, b.house.id))
        .slice(0, capacity(candidate.id))
      return { candidate, available, scarcity: available.reduce((sum, h) => sum + scarcity(h.house.id), 0),
        drop: available.reduce((sum, h) => sum + h.distanceMeters, 0) }
    }).filter(c => c.available.length).sort((a, b) => b.available.length - a.available.length || a.scarcity - b.scarcity || a.drop - b.drop || compareId(a.candidate.id, b.candidate.id))
    const choice = choices[0]
    if (!choice) break
    used.add(choice.candidate.id)
    for (const h of choice.available) current.set(h.house.id, choice.candidate.id)
  }

  // Capacitated augmenting paths can relocate a flexible house to free a slot for a scarce one.
  // For a fixed set of boxes this finds maximum coverage, rather than truncating overlapping lists.
  function rematch(selected: Set<string>): Assignment {
    const assignment: Assignment = new Map()
    const groups = new Map([...selected].sort(compareId).map(id => [id, new Set<string>()]))
    const options = new Map([...houses.keys()].map(id => [id, (alternatives.get(id) ?? []).filter(p => selected.has(p))
      .sort((a, b) => edge(id, a).distanceMeters - edge(id, b).distanceMeters || compareId(a, b))]))
    const order = [...houses.keys()].filter(id => options.get(id)!.length).sort((a, b) =>
      scarcity(a) - scarcity(b) || options.get(a)!.length - options.get(b)!.length ||
      edge(a, options.get(a)![0]).distanceMeters - edge(b, options.get(b)![0]).distanceMeters || compareId(a, b))
    function place(house: string, seen: Set<string>): boolean {
      for (const pole of options.get(house)!) {
        if (seen.has(pole)) continue
        seen.add(pole)
        const residents = groups.get(pole)!
        const move = () => {
          const previous = assignment.get(house)
          if (previous) groups.get(previous)!.delete(house)
          assignment.set(house, pole)
          residents.add(house)
        }
        if (residents.size < capacity(pole)) { move(); return true }
        for (const resident of [...residents].sort((a, b) => scarcity(b) - scarcity(a) || compareId(a, b))) {
          if (place(resident, seen)) { move(); return true }
        }
      }
      return false
    }
    for (const house of order) place(house, new Set())
    return assignment
  }

  // Best-improvement local search. Every accepted move improves the same lexicographic score.
  // A deterministic evaluation budget bounds runtime on large surveys; no global optimum is claimed.
  let evaluations = 0
  let complete = true
  while (true) {
    const starting = current
    let best = current
    let exhausted = false
    const consider = (build: () => Assignment) => {
      if (evaluations >= maxEvaluations) { exhausted = true; return }
      evaluations++
      const proposal = build()
      if (better(proposal, best)) best = proposal
    }
    const groups = occupied(current)
    const active = new Set(groups.keys())
    consider(() => rematch(active))
    // Consolidate whole boxes and replace their pole; also try a new box to unlock more coverage.
    for (const id of active) {
      consider(() => rematch(new Set([...active].filter(p => p !== id))))
      if (exhausted) break
    }
    for (const id of poles.keys()) {
      if (active.has(id) || !edges.get(id)!.size || exhausted) continue
      consider(() => rematch(new Set([...active, id])))
      for (const previous of active) {
        if (exhausted) break
        consider(() => rematch(new Set([...active].filter(p => p !== previous).concat(id))))
      }
    }
    // Single-house transfers can eliminate a box/splitter, or shorten drop estimates.
    for (const [house, source] of [...current].sort(([a], [b]) => compareId(a, b))) {
      if (exhausted) break
      for (const target of alternatives.get(house) ?? []) {
        if (exhausted) break
        if (target === source || !active.has(target)) continue
        if (groups.get(target)!.length < capacity(target)) consider(() => new Map(current).set(house, target))
        // Swaps improve distance even when both boxes are full.
        for (const other of groups.get(target)!) {
          if (exhausted) break
          if (compareId(source, target) >= 0 || !edges.get(source)!.has(other)) continue
          consider(() => new Map(current).set(house, target).set(other, source))
        }
      }
    }
    current = best
    if (exhausted) { complete = false; break }
    if (best === starting) break
  }

  const boxes = [...occupied(current)].map(([id, ids]): SelectedFat => {
    const served = ids.map(h => edge(h, id)).sort((a, b) => a.distanceMeters - b.distanceMeters || compareId(a.house.id, b.house.id))
    const splitters: FatSplitter[] = []
    for (let offset = 0; offset < served.length; offset += FAT_SPLITTER_PORTS) {
      const number = splitters.length + 1
      splitters.push({ id: `${id}-splitter-${number}`, number, houses: served.slice(offset, offset + FAT_SPLITTER_PORTS) })
    }
    return { candidate: poles.get(id)!, houses: served, splitters, estimatedDropMeters: served.reduce((sum, h) => sum + h.distanceMeters, 0) }
  })
  return {
    boxes, servedCount: current.size, splitterCount: boxes.reduce((sum, b) => sum + b.splitters.length, 0),
    unservedHouses: [...houses.values()].filter(h => !current.has(h.id)).sort((a, b) => compareId(a.id, b.id)),
    estimatedDropMeters: boxes.reduce((sum, b) => sum + b.estimatedDropMeters, 0), localSearchComplete: complete,
  }
}

// Revalidation observes existing assignments; it never relocates a box or assigns a house.
export function validateFatAssignments(simulation: FatSimulation, config: PlanningConfig = DEFAULT_PLANNING_CONFIG) {
  const limit = maxDropLength(config)
  return simulation.boxes.flatMap(box => box.splitters.flatMap(splitter => splitter.houses.filter(({ house }) =>
    distance([box.candidate.pole.coords[1], box.candidate.pole.coords[0]], [house.coords[1], house.coords[0]], { units: "meters" }) > limit + DISTANCE_EPSILON_METERS,
  ).map(({ house }) => house.id)))
}
