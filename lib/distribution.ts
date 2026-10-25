import { length, lineString, point, geojsonRbush, featureCollection } from "@turf/turf"
import type { FeatureCollection, Geometry, LineString, Point, Position } from "geojson"
import { extractPlanningInputs, planningDistance, type PlanningPoint, type FtthPlan } from "./ftth-planning"
import { validGeometry, type FeatureItem } from "./survey"

export type DistributionFat = { id: string; name: string; poleId: string | null; coordinates?: [number, number] }
export type DistributionContext = { poles: PlanningPoint[]; fats: DistributionFat[]; fdts: { id: string; name: string }[] }
export type DistributionSource = { id: string; name: string; poleId: string; kind: "temporary" | "FDT"; deviceId?: string }
export type SegmentPermission = "unverified" | "allowed" | "blocked" | "rejected"
export type PoleConnection = {
  id: string; from: string; to: string; geometry: LineString; lengthMeters: number
  active: boolean; permission: SegmentPermission; origin: "manual" | "candidate" | "imported"; note: string
}
export type RouteStatus = "success" | "unreachable" | "invalid"
export type DistributionRoute = {
  key: string; sourceId: string; fatId: string; sourcePoleId: string | null; targetPoleId: string | null
  poleIds: string[]; segmentIds: string[]; lengthMeters: number | null; geometry: LineString | Point | null
  status: RouteStatus; reason: string; revision: string
}
export type DistributionIssue = { objectId: string; message: string; poleId?: string; segmentId?: string }
export type DistributionSummary = {
  targetCount: number; successCount: number; unreachableCount: number; invalidCount: number
  uniqueLengthMeters: number; totalRouteLengthMeters: number; longestRouteMeters: number
  segmentIds: string[]; sharedSegmentIds: string[]
}
export type DistributionResult = {
  revision: string; routes: DistributionRoute[]; issues: DistributionIssue[]; unassignedFatIds: string[]
  summary: DistributionSummary; bySource: Record<string, DistributionSummary>
  selectedConnections: PoleConnection[]
  usage: Record<string, { sourceIds: string[]; fatIds: string[]; routeKeys: string[] }>
}
export type DistributionState = {
  version: 1; nextId: number; sources: DistributionSource[]; assignments: Record<string, string>
  connections: PoleConnection[]; suppressedPairs: string[]; candidateRadiusMeters: number; candidateNeighbors: number
  result: DistributionResult | null
}
export const emptyDistribution = (): DistributionState => ({ version: 1, nextId: 1, sources: [], assignments: {}, connections: [], suppressedPairs: [], candidateRadiusMeters: 100, candidateNeighbors: 3, result: null })
export const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export const connectionPair = (a: string, b: string) => JSON.stringify([a, b].sort(compareId))
const coordinateKey = (coordinates: Position) => JSON.stringify(coordinates.slice(0, 2).map(value=>Object.is(value,-0)?0:value))
const isPoint = (p: PlanningPoint) => !!p && typeof p.id === "string" && !!p.id && validGeometry({ type: "Point", coordinates: p.coordinates })

/** Only explicit device-to-pole references are used; no nearest-pole inference. */
export function distributionContext(features: readonly FeatureItem[], plan: FtthPlan | null): DistributionContext {
  const { poles } = extractPlanningInputs(features)
  const fats: DistributionFat[] = (plan?.groups || []).flatMap(group => group.candidate ? [{ id: group.candidate.id, name: group.candidate.id, poleId: group.candidate.pole.id, coordinates: group.candidate.pole.coordinates }] : [])
  for (const feature of features.filter(f => f.category === "FAT")) {
    const id = `SURVEY-FAT:${feature.id}`
    if (fats.some(f => f.id === id)) continue
    const reference = feature.props?.POLE_ID ?? feature.props?.poleId
    const matches = reference === undefined ? [] : poles.filter(p=>p.id===String(reference) || p.sourceId===String(reference))
    fats.push({ id, name: feature.name, poleId: matches.length === 1 ? matches[0].id : null,
      ...(feature.geometry.type === "Point" && validGeometry(feature.geometry) ? { coordinates: feature.geometry.coordinates.slice(0,2) as [number,number] } : {}) })
  }
  return { poles, fats, fdts: features.filter(f=>f.category==="FDT").map(f=>({id:f.id,name:f.name})) }
}
/** Names, notes, source kind labels, drop settings and home allocations do not change this graph. */
export function distributionRevision(ctx: DistributionContext, state: DistributionState): string {
  const canonical = JSON.stringify({
    poles: [...ctx.poles].sort((a,b)=>compareId(a.id,b.id)).map(p=>[p.id,p.coordinates]),
    fats: [...ctx.fats].sort((a,b)=>compareId(a.id,b.id)).map(f=>[f.id,f.poleId]),
    fdts: ctx.fdts.map(f=>f.id).sort(compareId),
    sources: [...state.sources].sort((a,b)=>compareId(a.id,b.id)).map(s=>[s.id,s.poleId,s.kind,s.deviceId]),
    assignments: Object.entries(state.assignments).sort(([a],[b])=>compareId(a,b)),
    connections: state.connections.map((s,index)=>s&&typeof s==="object"?[s.id,s.from,s.to,s.geometry,s.lengthMeters,s.active,s.permission]:[`INVALID:${index}`]).sort((a,b)=>compareId(String(a[0]),String(b[0]))),
  })
  let first=2166136261,second=5381
  for(let i=0;i<canonical.length;i++){first=Math.imul(first^canonical.charCodeAt(i),16777619);second=Math.imul(second,33)^canonical.charCodeAt(i)}
  return `distribution-v1-${(first>>>0).toString(16).padStart(8,"0")}${(second>>>0).toString(16).padStart(8,"0")}`
}
export const distributionIsStale = (ctx: DistributionContext, state: DistributionState) => !!state.result && state.result.revision !== distributionRevision(ctx,state)

export function connectionProblem(segment: PoleConnection, poles: ReadonlyMap<string,PlanningPoint>): string | null {
  try {
    if (typeof segment.id!=="string" || typeof segment.from!=="string" || typeof segment.to!=="string" || !segment.id || !segment.from || !segment.to || segment.from === segment.to) return "ID/endpoint kosong atau koneksi self-loop."
    const from=poles.get(segment.from), to=poles.get(segment.to)
    if (!from || !to || !isPoint(from) || !isPoint(to)) return "Endpoint tiang tidak ditemukan atau koordinat tidak valid."
    if (coordinateKey(from.coordinates)===coordinateKey(to.coordinates)) return "Koordinat tiang berimpit; koneksi tidak dapat digunakan."
    if (segment.geometry?.type !== "LineString" || !validGeometry(segment.geometry)) return "Geometri koneksi harus LineString valid."
    const coordinates=segment.geometry.coordinates, first=coordinates[0], last=coordinates[coordinates.length-1]
    if (coordinateKey(first)!==coordinateKey(from.coordinates) || coordinateKey(last)!==coordinateKey(to.coordinates)) return "Geometri tidak sesuai posisi endpoint tiang; periksa atau gambar ulang koneksi."
    const measured=length(lineString(coordinates),{units:"meters"})
    if (!Number.isFinite(segment.lengthMeters) || segment.lengthMeters<=0 || !Number.isFinite(measured) || measured<=0) return "Panjang segmen harus positif dan terbatas dalam meter."
    if (Math.abs(measured-segment.lengthMeters)>Math.max(.01,measured*1e-8)) return "Panjang tersimpan tidak sesuai geometri."
    if (typeof segment.active!=="boolean" || !["unverified","allowed","blocked","rejected"].includes(segment.permission)) return "Status koneksi tidak valid."
    return null
  } catch { return "Data koneksi rusak atau tidak lengkap." }
}
export function createConnection(id: string, from: PlanningPoint, to: PlanningPoint, permission: SegmentPermission = "unverified", origin: PoleConnection["origin"] = "manual"): PoleConnection {
  const geometry: LineString = {type:"LineString",coordinates:[[...from.coordinates],[...to.coordinates]]}
  const segment: PoleConnection = {id,from:from.id,to:to.id,geometry,lengthMeters:length(lineString(geometry.coordinates),{units:"meters"}),active:true,permission,origin,note:"Geometri awal garis lurus; periksa lintasan pemasangan di lapangan."}
  const problem=connectionProblem(segment,new Map([[from.id,from],[to.id,to]]))
  if (problem) throw new Error(problem)
  return segment
}
function unusedId(state: DistributionState, prefix: string): [string,number] {
  let n=state.nextId
  while(state.connections.some(s=>s.id===`${prefix}-${n}`) || state.sources.some(s=>s.id===`${prefix}-${n}`)) n++
  return [`${prefix}-${n}`,n+1]
}
export function addDistributionSource(state: DistributionState, source: Omit<DistributionSource,"id">): DistributionState {
  if (!source.name.trim() || !source.poleId) throw new Error("Nama sumber dan tiang akses wajib diisi.")
  if (source.kind==="FDT" && !source.deviceId) throw new Error("Pilih perangkat FDT survei.")
  const [id,nextId]=unusedId(state,"SRC")
  return {...state,nextId,sources:[...state.sources,{...source,id,name:source.name.trim()}]}
}
export function assignDistributionFats(state: DistributionState, sourceId: string, fatIds: readonly string[]): DistributionState {
  if (!state.sources.some(s=>s.id===sourceId)) throw new Error("Sumber tidak tersedia.")
  return {...state,assignments:{...state.assignments,...Object.fromEntries(fatIds.map(id=>[id,sourceId]))}}
}
export function addPoleConnection(ctx: DistributionContext, state: DistributionState, fromId: string, toId: string, allowed: boolean): DistributionState {
  const from=ctx.poles.find(p=>p.id===fromId),to=ctx.poles.find(p=>p.id===toId)
  if (!from || !to) throw new Error("Pilih dua tiang valid.")
  const pair=connectionPair(fromId,toId)
  if (state.connections.some(s=>connectionPair(s.from,s.to)===pair)) throw new Error("Pasangan tiang sudah memiliki koneksi. Edit koneksi existing.")
  const [id,nextId]=unusedId(state,"SEG")
  return {...state,nextId,connections:[...state.connections,createConnection(id,from,to,allowed?"allowed":"unverified")],suppressedPairs:state.suppressedPairs.filter(p=>p!==pair)}
}
export function removePoleConnection(state: DistributionState, id: string): DistributionState {
  const removed=state.connections.find(s=>s.id===id)
  return {...state,connections:state.connections.filter(s=>s.id!==id),suppressedPairs:removed?[...new Set([...state.suppressedPairs,connectionPair(removed.from,removed.to)])]:state.suppressedPairs}
}
/** Turf RBush bounds search, followed by exact geodesic screening. Date-line bounds are split. */
export function suggestConnections(ctx: DistributionContext, state: DistributionState): DistributionState {
  const radius=state.candidateRadiusMeters,k=state.candidateNeighbors
  if (!Number.isFinite(radius) || radius<=0 || !Number.isInteger(k) || k<1 || k>10) throw new Error("Radius harus positif/terbatas; tetangga 1–10.")
  const valid=ctx.poles.filter(isPoint).sort((a,b)=>compareId(a.id,b.id))
  const byId=new Map(valid.map(p=>[p.id,p]))
  const tree=geojsonRbush<Point,{poleId:string}>()
  tree.load(featureCollection(valid.map(p=>point(p.coordinates,{poleId:p.id}))))
  const seen=new Set([...state.suppressedPairs,...state.connections.map(s=>connectionPair(s.from,s.to))])
  const degree=new Map<string,number>()
  for(const s of state.connections)if(s.origin==="candidate"&&s.permission!=="rejected"){degree.set(s.from,(degree.get(s.from)||0)+1);degree.set(s.to,(degree.get(s.to)||0)+1)}
  const added: PoleConnection[]=[]
  let nextId=state.nextId
  for(const from of valid) {
    if((degree.get(from.id)||0)>=k)continue
    const [lon,lat]=from.coordinates, latSpan=radius/110000
    const minLat=Math.max(-90,lat-latSpan),maxLat=Math.min(90,lat+latSpan)
    const extreme=Math.max(Math.abs(minLat),Math.abs(maxLat))
    const lonSpan=extreme>=89.99?180:Math.min(180,latSpan/Math.cos(extreme*Math.PI/180))
    const boxes: [number,number,number,number][]=lonSpan>=180?[[-180,minLat,180,maxLat]]:lon-lonSpan < -180 ? [[-180,minLat,lon+lonSpan,maxLat],[lon-lonSpan+360,minLat,180,maxLat]] : lon+lonSpan > 180 ? [[lon-lonSpan,minLat,180,maxLat],[-180,minLat,lon+lonSpan-360,maxLat]] : [[lon-lonSpan,minLat,lon+lonSpan,maxLat]]
    const neighbors=new Map<string,PlanningPoint>()
    for(const box of boxes) for(const f of tree.search(box).features) { const p=byId.get(f.properties.poleId);if(p && p.id!==from.id) neighbors.set(p.id,p) }
    const nearest=[...neighbors.values()].map(to=>({to,meters:planningDistance(from,to)})).filter(p=>p.meters>0 && p.meters<=radius).sort((a,b)=>a.meters-b.meters||compareId(a.to.id,b.to.id)).slice(0,k)
    for(const {to} of nearest) {
      const pair=connectionPair(from.id,to.id)
      if(seen.has(pair)||(degree.get(from.id)||0)>=k||(degree.get(to.id)||0)>=k) continue
      seen.add(pair)
      degree.set(from.id,(degree.get(from.id)||0)+1);degree.set(to.id,(degree.get(to.id)||0)+1)
      while(state.connections.some(s=>s.id===`SEG-${nextId}`)) nextId++
      added.push(createConnection(`SEG-${nextId++}`,from,to,"unverified","candidate"))
    }
  }
  return {...state,nextId,connections:[...state.connections,...added]}
}

type AdjacencyEdge={to:string;segmentId:string;meters:number}
export type ValidatedGraph={poles:Map<string,PlanningPoint>;segments:Map<string,PoleConnection>;adjacency:Map<string,AdjacencyEdge[]>;components:Map<string,string>;issues:DistributionIssue[];invalidPoleIds:Set<string>}
export function buildDistributionGraph(ctx: DistributionContext, connections: readonly PoleConnection[]): ValidatedGraph {
  const issues:DistributionIssue[]=[],invalidPoleIds=new Set<string>(),poles=new Map<string,PlanningPoint>(),positions=new Map<string,string[]>()
  for(const p of ctx.poles) {
    if(!isPoint(p)) {invalidPoleIds.add(p.id);issues.push({objectId:p.id,message:"Koordinat tiang tidak valid.",poleId:p.id});continue}
    if(poles.has(p.id)){invalidPoleIds.add(p.id);issues.push({objectId:p.id,poleId:p.id,message:"ID tiang duplikat; endpoint tidak dipakai routing."})}
    poles.set(p.id,p)
    const key=coordinateKey(p.coordinates);positions.set(key,[...(positions.get(key)||[]),p.id])
  }
  for(const ids of positions.values()) if(ids.length>1) for(const id of ids) {invalidPoleIds.add(id);issues.push({objectId:id,poleId:id,message:`Tiang berimpit/ID duplikat: ${ids.join(", ")}. Periksa koordinat sumber.`})}
  for(const id of invalidPoleIds) poles.delete(id)
  const adjacency=new Map([...poles.keys()].map(id=>[id,[] as AdjacencyEdge[]])),segments=new Map<string,PoleConnection>()
  const safeConnections=connections.filter(s=>{if(s&&typeof s==="object")return true;issues.push({objectId:"INVALID_SEGMENT",message:"Objek segmen tidak valid; diabaikan untuk routing."});return false})
  const idCounts=new Map<string,number>(),pairCounts=new Map<string,number>()
  for(const s of safeConnections) {idCounts.set(s.id,(idCounts.get(s.id)||0)+1);const pair=connectionPair(s.from,s.to);pairCounts.set(pair,(pairCounts.get(pair)||0)+1)}
  for(const s of [...safeConnections].sort((a,b)=>compareId(String(a.id),String(b.id)))) {
    const problem=idCounts.get(s.id)!>1 || pairCounts.get(connectionPair(s.from,s.to))!>1 ? "ID segmen atau pasangan tiang duplikat; perbaiki sebelum routing." : connectionProblem(s,poles)
    if(problem) {issues.push({objectId:s.id,segmentId:s.id,message:problem});continue}
    if(!s.active || s.permission!=="allowed") continue
    segments.set(s.id,s)
    adjacency.get(s.from)!.push({to:s.to,segmentId:s.id,meters:s.lengthMeters})
    adjacency.get(s.to)!.push({to:s.from,segmentId:s.id,meters:s.lengthMeters})
  }
  for(const edges of adjacency.values()) edges.sort((a,b)=>compareId(a.segmentId,b.segmentId)||compareId(a.to,b.to))
  const components=new Map<string,string>()
  for(const id of [...poles.keys()].sort(compareId)) if(!components.has(id)) {
    const stack=[id];components.set(id,id)
    while(stack.length) {const current=stack.pop()!;for(const edge of adjacency.get(current)!) if(!components.has(edge.to)){components.set(edge.to,id);stack.push(edge.to)}}
  }
  return {poles,segments,adjacency,components,issues,invalidPoleIds}
}
class MinHeap {
  private values: {node:string;meters:number}[]=[]
  private less(a:{node:string;meters:number},b:{node:string;meters:number}) {return a.meters<b.meters || (a.meters===b.meters&&compareId(a.node,b.node)<0)}
  push(value:{node:string;meters:number}) {this.values.push(value);let i=this.values.length-1;while(i>0){const p=(i-1)>>1;if(!this.less(this.values[i],this.values[p]))break;[this.values[i],this.values[p]]=[this.values[p],this.values[i]];i=p}}
  pop(){const root=this.values[0],last=this.values.pop();if(!root)return undefined;if(this.values.length&&last){this.values[0]=last;let i=0;while(true){let c=i*2+1;if(c>=this.values.length)break;if(c+1<this.values.length&&this.less(this.values[c+1],this.values[c]))c++;if(!this.less(this.values[c],this.values[i]))break;[this.values[c],this.values[i]]=[this.values[i],this.values[c]];i=c}}return root}
}
export function dijkstra(graph: ValidatedGraph, sourcePoleId: string) {
  const distances=new Map<string,number>(),predecessors=new Map<string,{poleId:string;segmentId:string}>(),settled=new Set<string>(),heap=new MinHeap()
  if(!graph.poles.has(sourcePoleId)) return {distances,predecessors}
  distances.set(sourcePoleId,0);heap.push({node:sourcePoleId,meters:0})
  for(let next=heap.pop();next;next=heap.pop()) {
    if(settled.has(next.node) || next.meters!==distances.get(next.node))continue
    settled.add(next.node)
    for(const edge of graph.adjacency.get(next.node)!) {
      if(settled.has(edge.to))continue
      const meters=next.meters+edge.meters
      if(meters<(distances.get(edge.to)??Infinity)) {distances.set(edge.to,meters);predecessors.set(edge.to,{poleId:next.node,segmentId:edge.segmentId});heap.push({node:edge.to,meters})}
    }
  }
  return {distances,predecessors}
}
function summarize(routes: DistributionRoute[], segments: Map<string,PoleConnection>): DistributionSummary {
  const success=routes.filter(r=>r.status==="success"),usage=new Map<string,number>()
  for(const route of success)for(const id of route.segmentIds)usage.set(id,(usage.get(id)||0)+1)
  const segmentIds=[...usage.keys()].sort(compareId)
  return {targetCount:routes.length,successCount:success.length,unreachableCount:routes.filter(r=>r.status==="unreachable").length,invalidCount:routes.filter(r=>r.status==="invalid").length,uniqueLengthMeters:segmentIds.reduce((sum,id)=>sum+(segments.get(id)?.lengthMeters||0),0),totalRouteLengthMeters:success.reduce((sum,r)=>sum+r.lengthMeters!,0),longestRouteMeters:Math.max(0,...success.map(r=>r.lengthMeters!)),segmentIds,sharedSegmentIds:segmentIds.filter(id=>usage.get(id)!>1)}
}
export function generateDistribution(ctx: DistributionContext, state: DistributionState): DistributionResult {
  const revision=distributionRevision(ctx,state),graph=buildDistributionGraph(ctx,state.connections),issues=[...graph.issues],routes:DistributionRoute[]=[],usage:DistributionResult["usage"]={}
  const fats=new Map(ctx.fats.map(f=>[f.id,f])),sources=new Map(state.sources.map(s=>[s.id,s])),trees=new Map<string,ReturnType<typeof dijkstra>>()
  const seenFats=new Set<string>(),duplicateFats=new Set<string>(),seenSources=new Set<string>(),duplicateSources=new Set<string>()
  for(const fat of ctx.fats){if(seenFats.has(fat.id))duplicateFats.add(fat.id);seenFats.add(fat.id)}
  for(const source of state.sources){if(seenSources.has(source.id))duplicateSources.add(source.id);seenSources.add(source.id)}
  const paths=new Map<string,{poleIds:string[];segmentIds:string[];geometry:LineString|Point}>()
  for(const source of [...state.sources].sort((a,b)=>compareId(a.id,b.id))) if(!duplicateSources.has(source.id) && graph.poles.has(source.poleId) && (source.kind!=="FDT" || ctx.fdts.some(f=>f.id===source.deviceId))) trees.set(source.id,dijkstra(graph,source.poleId))
  for(const [fatId,sourceId] of Object.entries(state.assignments).sort(([a],[b])=>compareId(a,b))) {
    const source=sources.get(sourceId),fat=fats.get(fatId),tree=trees.get(sourceId)
    const route:DistributionRoute={key:JSON.stringify([sourceId,fatId]),sourceId,fatId,sourcePoleId:source?.poleId||null,targetPoleId:fat?.poleId||null,poleIds:[],segmentIds:[],lengthMeters:null,geometry:null,status:"invalid",reason:"",revision}
    if(duplicateFats.has(fatId)||duplicateSources.has(sourceId)) route.reason="ID FAT/sumber duplikat; perbaiki input sebelum routing."
    else if(!source || !tree) route.reason="Sumber/tiang akses/FDT hilang, tidak valid, atau tiang berimpit. Pilih tiang akses valid secara eksplisit."
    else if(!fat || !fat.poleId || !graph.poles.has(fat.poleId)) route.reason="FAT tidak tersedia atau pemetaan tiang pemasangannya hilang/tidak valid. Tetapkan pemetaan eksplisit; tidak dilakukan snap otomatis."
    else if(!tree.distances.has(fat.poleId)) {route.status="unreachable";route.reason=`Komponen sumber ${graph.components.get(source.poleId)} berbeda dari komponen tujuan ${graph.components.get(fat.poleId)}. Tambah/izinkan koneksi yang benar lalu hitung ulang.`}
    else {
      const cacheKey=JSON.stringify([sourceId,fat.poleId]);let path=paths.get(cacheKey)
      if(!path) {
        const poleIds=[fat.poleId],segmentIds:string[]=[];let current=fat.poleId
        while(current!==source.poleId) {const previous=tree.predecessors.get(current)!;segmentIds.unshift(previous.segmentId);poleIds.unshift(previous.poleId);current=previous.poleId}
        const coordinates:Position[]=[]
        segmentIds.forEach((id,index)=>{const s=graph.segments.get(id)!,points=s.from===poleIds[index]?s.geometry.coordinates:[...s.geometry.coordinates].reverse();coordinates.push(...points.slice(index?1:0).map(p=>[...p]))})
        path={poleIds,segmentIds,geometry:segmentIds.length?{type:"LineString",coordinates}:{type:"Point",coordinates:[...graph.poles.get(source.poleId)!.coordinates]}}
        paths.set(cacheKey,path)
      }
      Object.assign(route,{...path,lengthMeters:tree.distances.get(fat.poleId)!,status:"success",reason:""})
      for(const id of route.segmentIds) {const u=Object.hasOwn(usage,id)?usage[id]:{sourceIds:[],fatIds:[],routeKeys:[]};if(!u.sourceIds.includes(sourceId))u.sourceIds.push(sourceId);u.fatIds.push(fatId);u.routeKeys.push(route.key);usage[id]=u}
    }
    routes.push(route)
  }
  const unassignedFatIds=ctx.fats.filter(f=>!Object.hasOwn(state.assignments,f.id)).map(f=>f.id).sort(compareId)
  for(const id of unassignedFatIds)issues.push({objectId:id,message:"FAT belum ditetapkan ke sumber distribusi."})
  for(const route of routes)if(route.status!=="success")issues.push({objectId:route.fatId,poleId:route.targetPoleId||undefined,message:route.reason})
  return {revision,routes,issues,usage,selectedConnections:[...graph.segments.values()].filter(s=>Object.hasOwn(usage,s.id)),unassignedFatIds,summary:summarize(routes,graph.segments),bySource:Object.fromEntries(state.sources.map(s=>[s.id,summarize(routes.filter(r=>r.sourceId===s.id),graph.segments)]))}
}
export function distributionGeoJSON(ctx:DistributionContext,state:DistributionState): FeatureCollection<Geometry|null> {
  const stale=distributionIsStale(ctx,state),features:FeatureCollection<Geometry|null>["features"]=[]
  for(const s of state.connections) if(!connectionProblem(s,new Map(ctx.poles.map(p=>[p.id,p])))) features.push({type:"Feature",geometry:s.geometry,properties:{layer:"distribution_connections",id:s.id,from:s.from,to:s.to,lengthMeters:s.lengthMeters,active:s.active,permission:s.permission,origin:s.origin,final:false}})
  for(const source of state.sources){const pole=ctx.poles.find(p=>p.id===source.poleId);features.push({type:"Feature",geometry:pole?{type:"Point",coordinates:pole.coordinates}:null,properties:{layer:"distribution_sources",sourceId:source.id,name:source.name,poleId:source.poleId,kind:source.kind,deviceId:source.deviceId}})}
  for(const segment of state.result?.selectedConnections||[])features.push({type:"Feature",geometry:segment.geometry,properties:{layer:"distribution_selected_segments",segmentId:segment.id,lengthMeters:segment.lengthMeters,sourceIds:state.result!.usage[segment.id]?.sourceIds||[],fatIds:state.result!.usage[segment.id]?.fatIds||[],status:stale?"stale":"success",final:!stale}})
  for(const route of state.result?.routes||[]){const fat=ctx.fats.find(f=>f.id===route.fatId),pole=ctx.poles.find(p=>p.id===fat?.poleId),coordinates=pole?.coordinates||fat?.coordinates
    features.push({type:"Feature",geometry:route.geometry||(coordinates?{type:"Point",coordinates}:null),properties:{layer:"distribution_routes",sourceId:route.sourceId,fatId:route.fatId,lengthMeters:route.lengthMeters,segmentIds:route.segmentIds,poleIds:route.poleIds,status:stale?"stale":route.status,computedStatus:route.status,reason:route.reason,final:!stale&&route.status==="success",revision:route.revision}})
  }
  return {type:"FeatureCollection",features}
}
export function distributionCSV(ctx:DistributionContext,state:DistributionState):string {
  const stale=distributionIsStale(ctx,state),cell=(v:unknown)=>{let value=String(v??"");if(/^[\t\r\n ]*[=+@\-]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"'}
  return [["source_id","fat_id","source_pole_id","target_pole_id","status","length_m","pole_ids","segment_ids","reason","revision"],...(state.result?.routes||[]).map(r=>[r.sourceId,r.fatId,r.sourcePoleId,r.targetPoleId,stale?"stale":r.status,r.lengthMeters,r.poleIds.join(";"),r.segmentIds.join(";"),r.reason,r.revision])].map(row=>row.map(cell).join(",")).join("\r\n")
}
