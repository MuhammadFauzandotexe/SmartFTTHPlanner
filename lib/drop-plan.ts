import { along, distance, length, lineString } from "@turf/turf"
import type { Position } from "geojson"
import type { FeatureItem } from "./import-survey"
import type { FatSimulation } from "./fat-simulation"

import { DEFAULT_PLANNING_CONFIG, DROP_LAST_SPAN_METERS, DISTANCE_EPSILON_METERS, maxDropLength, type PlanningConfig } from "./planning-config"

const EPSILON = DISTANCE_EPSILON_METERS // Numerical tolerance in meters, not an installation allowance.
type Coordinate = [number, number]
export type DropRoute = {
  id: string
  fatId: string
  fat: FeatureItem
  splitterId: string
  splitterNumber: number
  house: FeatureItem
  status: "valid" | "estimate" | "problem"
  reason: string
  lengthMeters: number | null
  lastSpanMeters: number | null
  coordinates: Coordinate[] | null
  midpoint: Coordinate | null
}
export type DropPlan = {
  maxDropLengthMeters: number
  routes: DropRoute[]
  verifiedLengthMeters: number
  estimatedLengthMeters: number
  problemCount: number
  hasSupportData: boolean
}
export type DropPlanResult = { features: readonly FeatureItem[]; simulation: FatSimulation; plan: DropPlan }
export function currentDropPlan(result: DropPlanResult | null, simulation: FatSimulation | null, features: readonly FeatureItem[], config: PlanningConfig = DEFAULT_PLANNING_CONFIG) {
  return result?.simulation === simulation && result?.features === features ? revalidateDropPlan(result.plan, config) : null
}
export const dropStatusLabel = (status: DropRoute["status"]) => status === "valid" ? "Sesuai batas menurut data" :
  status === "estimate" ? "Belum validasi rute" : "Belum ditemukan rute layak"
export const formatDropMeters = (meters: number) => `${meters.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`
const coord = (p: Position): Coordinate => [p[0], p[1]]
const key = (p: Coordinate) => JSON.stringify(p)
const meters = (a: Coordinate, b: Coordinate) => distance(a, b, { units: "meters" })
const routeLength = (coordinates: Coordinate[]) => length(lineString(coordinates), { units: "meters" })

type Edge = { to: string; coordinates: Coordinate[]; meters: number }
type Graph = { positions: Map<string, Coordinate>; edges: Map<string, Edge[]> }

function buildGraph(features: readonly FeatureItem[], simulation: FatSimulation): Graph {
  const positions = new Map<string, Coordinate>()
  for (const f of [...features.filter(f => f.category === "Tiang" || f.category === "FAT"), ...simulation.boxes.map(b => b.candidate.pole)]) {
    if (f.geometry.type === "Point") {
      const p = coord(f.geometry.coordinates)
      positions.set(key(p), p)
    }
  }
  const edges = new Map([...positions.keys()].map(id => [id, [] as Edge[]]))
  for (const feature of features) {
    if (!feature.dropSupport || feature.geometry.type !== "LineString") continue
    // Only surveyed infrastructure vertices are graph nodes. Bends and crossings are not anchors.
    let start: string | null = null
    let geometry: Coordinate[] = []
    for (const position of feature.geometry.coordinates) {
      const p = coord(position), id = key(p)
      if (start) geometry.push(p)
      if (!positions.has(id)) continue
      if (start && start !== id) {
        const weight = routeLength(geometry)
        edges.get(start)!.push({ to: id, coordinates: geometry, meters: weight })
        edges.get(id)!.push({ to: start, coordinates: [...geometry].reverse(), meters: weight })
      }
      start = id
      geometry = [p]
    }
  }
  for (const list of edges.values()) list.sort((a, b) => a.meters - b.meters || a.to.localeCompare(b.to) || JSON.stringify(a.coordinates).localeCompare(JSON.stringify(b.coordinates)))
  return { positions, edges }
}

// Bounded Dijkstra: positive geographic lengths; paths exceeding the configured total limit cannot be feasible.
function shortestPaths(graph: Graph, source: string, maxDropLengthMeters: number) {
  const costs = new Map<string, number>([[source, 0]])
  const previous = new Map<string, { from: string; edge: Edge }>()
  const visited = new Set<string>()
  const queue: { id: string; cost: number }[] = [{ id: source, cost: 0 }]
  // Binary min-heap avoids a quadratic scan on large support graphs.
  const less = (a: { id: string; cost: number }, b: { id: string; cost: number }) => a.cost < b.cost || a.cost === b.cost && a.id < b.id
  const push = (entry: { id: string; cost: number }) => {
    queue.push(entry)
    let i = queue.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!less(queue[i], queue[parent])) break
      ;[queue[i], queue[parent]] = [queue[parent], queue[i]]
      i = parent
    }
  }
  const pop = () => {
    const first = queue[0], last = queue.pop()!
    if (queue.length) {
      queue[0] = last
      let i = 0
      while (true) {
        let child = i * 2 + 1
        if (child >= queue.length) break
        if (child + 1 < queue.length && less(queue[child + 1], queue[child])) child++
        if (!less(queue[child], queue[i])) break
        ;[queue[i], queue[child]] = [queue[child], queue[i]]
        i = child
      }
    }
    return first
  }
  while (queue.length) {
    const current = pop()
    if (visited.has(current.id)) continue
    visited.add(current.id)
    for (const edge of graph.edges.get(current.id) ?? []) {
      const cost = current.cost + edge.meters
      if (cost > maxDropLengthMeters + EPSILON || cost >= (costs.get(edge.to) ?? Infinity)) continue
      costs.set(edge.to, cost)
      previous.set(edge.to, { from: current.id, edge })
      push({ id: edge.to, cost })
    }
  }
  return { costs, previous }
}

export function planDropRoutes(simulation: FatSimulation, features: readonly FeatureItem[], config: PlanningConfig = DEFAULT_PLANNING_CONFIG): DropPlan {
  const maxDropLengthMeters = maxDropLength(config)
  const hasSupportData = features.some(f => f.geometry.type === "LineString" && f.dropSupport === true)
  const graph = buildGraph(features, simulation)
  const routes: DropRoute[] = []
  const assigned = new Set<string>()
  for (const box of simulation.boxes) {
    const fat = box.candidate.pole
    if (fat.geometry.type !== "Point") continue
    const source = coord(fat.geometry.coordinates)
    const paths = hasSupportData ? shortestPaths(graph, key(source), maxDropLengthMeters) : null
    for (const splitter of box.splitters) for (const { house } of splitter.houses) {
      if (assigned.has(house.id)) throw new Error("Penugasan rumah ganda; periksa hasil simulasi FAT")
      assigned.add(house.id)
      if (house.geometry.type !== "Point") throw new Error("Rumah layanan harus berupa titik")
      const destination = coord(house.geometry.coordinates)
      const direct = meters(source, destination)
      const route: DropRoute = {
        id: JSON.stringify([box.candidate.id, splitter.id, house.id]), fatId: box.candidate.id, fat, house,
        splitterId: splitter.id, splitterNumber: splitter.number, status: "problem",
        reason: `Tidak ada rute melalui penyangga terdata yang memenuhi total ≤${maxDropLengthMeters} m dan bentangan terakhir ≤${DROP_LAST_SPAN_METERS} m.`,
        lengthMeters: null, lastSpanMeters: null, coordinates: null, midpoint: null,
      }
      if (!hasSupportData) {
        if (direct <= maxDropLengthMeters + EPSILON) {
          route.status = "estimate"
          route.coordinates = [source, destination]
          route.reason = "Data graph penyangga drop belum tersedia. Garis hanya estimasi jarak lurus; rute dan bentangan terakhir belum divalidasi."
        } else route.reason = `Jarak lurus saja sudah melebihi ${maxDropLengthMeters} m; tidak ada rute yang dapat memenuhi batas total.`
      } else if (paths) {
        let best: { id: string; span: number; total: number } | null = null
        for (const [id, cost] of paths.costs) {
          const position = graph.positions.get(id)!
          const span = meters(position, destination)
          const total = cost + span
          if (span > DROP_LAST_SPAN_METERS + EPSILON || total > maxDropLengthMeters + EPSILON) continue
          if (!best || total < best.total || total === best.total && id < best.id) best = { id, span, total }
        }
        if (best) {
          const segments: Coordinate[][] = []
          let cursor = best.id
          while (cursor !== key(source)) {
            const step = paths.previous.get(cursor)!
            segments.unshift(step.edge.coordinates)
            cursor = step.from
          }
          const geometry = [source, ...segments.flatMap(segment => segment.slice(1))]
          geometry.push(destination)
          route.status = "valid"
          route.coordinates = geometry
          route.lastSpanMeters = best.span
          route.reason = `Total ≤${maxDropLengthMeters} m dan bentangan terakhir ≤${DROP_LAST_SPAN_METERS} m sesuai graph penyangga terdata. Hambatan lapangan belum terverifikasi.`
        } else {
          const nearAnchors = [...graph.positions].filter(([, position]) => meters(position, destination) <= DROP_LAST_SPAN_METERS + EPSILON)
          const reachable = nearAnchors.filter(([id]) => paths.costs.has(id))
          route.reason = !nearAnchors.length ? "Tidak ada titik penyangga terdata dalam bentangan terakhir maksimal 35 m dari rumah." :
            reachable.length ? `Rute penyangga tersambung, tetapi panjang total termasuk bentangan terakhir melebihi ${maxDropLengthMeters} m.` :
              `Penyangga dekat rumah tidak terjangkau dari FAT dalam batas ${maxDropLengthMeters} m: graph terputus atau ruas terlalu panjang.`
        }
      }
      if (route.coordinates) {
        route.lengthMeters = routeLength(route.coordinates)
        route.midpoint = coord(along(lineString(route.coordinates), route.lengthMeters / 2, { units: "meters" }).geometry.coordinates)
      }
      routes.push(route)
    }
  }
  return {
    routes, hasSupportData, maxDropLengthMeters,
    verifiedLengthMeters: routes.filter(r => r.status === "valid").reduce((sum, r) => sum + r.lengthMeters!, 0),
    estimatedLengthMeters: routes.filter(r => r.status === "estimate").reduce((sum, r) => sum + r.lengthMeters!, 0),
    problemCount: routes.filter(r => r.status === "problem").length,
  }
}

// Recheck the existing route geometries without changing FAT locations or house grouping.
// A larger limit may admit other paths, so old failures still require an explicit rerun.
export function revalidateDropPlan(plan: DropPlan, config: PlanningConfig = DEFAULT_PLANNING_CONFIG): DropPlan {
  const limit = maxDropLength(config)
  if (plan.maxDropLengthMeters === limit) return plan
  const routes = plan.routes.map((route): DropRoute => {
    if (route.lengthMeters !== null && route.lengthMeters > limit + EPSILON) return {
      ...route, status: "problem", coordinates: null, midpoint: null,
      reason: `Panjang sebelumnya ${formatDropMeters(route.lengthMeters)} melebihi batas aktif ${limit} m. Hitung ulang rencana drop; penugasan rumah tetap dipertahankan.`,
    }
    if (route.status === "valid" && route.lastSpanMeters !== null && route.lastSpanMeters > DROP_LAST_SPAN_METERS + EPSILON) return {
      ...route, status: "problem", coordinates: null, midpoint: null,
      reason: `Bentangan terakhir melebihi ${DROP_LAST_SPAN_METERS} m; perubahan batas total tidak mengubah aturan bentangan terakhir.`,
    }
    if (route.status === "problem") return { ...route, reason: `${route.reason} Batas aktif berubah menjadi ${limit} m; hitung ulang untuk mencari rute sesuai batas baru.` }
    if (route.status === "valid") return { ...route, reason: `Geometri sebelumnya memenuhi total ≤${limit} m dan bentangan terakhir ≤${DROP_LAST_SPAN_METERS} m. Hambatan lapangan belum terverifikasi.` }
    return route
  })
  return { ...plan, maxDropLengthMeters: limit, routes,
    verifiedLengthMeters: routes.filter(r => r.status === "valid").reduce((sum, r) => sum + r.lengthMeters!, 0),
    estimatedLengthMeters: routes.filter(r => r.status === "estimate").reduce((sum, r) => sum + r.lengthMeters!, 0),
    problemCount: routes.filter(r => r.status === "problem").length,
  }
}
