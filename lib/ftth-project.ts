import type { AllocationState } from "./allocation-recommendations"
import { emptyAllocations } from "./allocation-recommendations"
import { DEFAULT_FAT_PORTS, DEFAULT_MAX_DROP_LENGTH_METERS, DEFAULT_MAX_FATS_PER_POLE, validateFatPorts, validateMaxDropLengthMeters, validateMaxFatsPerPole, type FtthPlan, type PlanningPoint } from "./ftth-planning"
import { emptyDistribution, type DistributionState } from "./distribution"
import { validGeometry, type FeatureItem } from "./survey"

export const PROJECT_STORAGE_KEY="smart-ftth-project-v1"
export type FtthProject = {
  format:"smart-ftth-project"; version:1; savedAt:string; features:FeatureItem[]; plan:FtthPlan|null
  allocations:AllocationState; configuration:{fatPorts:number;maxDropLengthMeters:number;maxFatsPerPole:number}; distribution:DistributionState
}
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}
const string=(v:unknown)=>typeof v==="string"
const pointValid=(v:unknown)=>{const p=object(v);try{return string(p.id)&&string(p.name)&&Array.isArray(p.coordinates)&&validGeometry({type:"Point",coordinates:p.coordinates as number[]})}catch{return false}}
function validPlan(value:unknown):value is FtthPlan {
  const p=object(value)
  try {
    validateFatPorts(p.fatPorts as number);validateMaxDropLengthMeters(p.maxDropLengthMeters as number)
    if(!Array.isArray(p.groups)||!Array.isArray(p.unservedHomes)||!Array.isArray(p.issues)||!Array.isArray(p.warnings)||!Number.isFinite(p.homeCount)||!Number.isFinite(p.poleCount))return false
    const groupIds=new Set<string>(),fatIds=new Set<string>(),homeIds=new Set<string>()
    for(const raw of p.groups){const g=object(raw),fat=object(g.candidate)
      if(!string(g.id)||!string(g.color)||groupIds.has(g.id)||!Array.isArray(g.homes))return false
      groupIds.add(g.id)
      for(const home of g.homes){if(!pointValid(home)||homeIds.has((home as PlanningPoint).id))return false;homeIds.add((home as PlanningPoint).id)}
      if(g.capacity!==undefined)validateFatPorts(g.capacity as number)
      if(g.occupiedPorts!==undefined&&(!Number.isInteger(g.occupiedPorts)||(g.occupiedPorts as number)<0))return false
      if(g.candidate!==null){if(!string(fat.id)||fatIds.has(fat.id)||!pointValid(fat.pole)||!Array.isArray(fat.connections)||!Number.isFinite(fat.totalDistanceMeters))return false;fatIds.add(fat.id)
        if(!fat.connections.every(raw=>{const c=object(raw);return string(c.homeId)&&typeof c.distanceMeters==="number"&&Number.isFinite(c.distanceMeters)&&c.distanceMeters>=0}))return false}
    }
    for(const raw of p.unservedHomes){const h=object(raw);if(!pointValid(h.home)||!string(h.reason)||homeIds.has((h.home as PlanningPoint).id))return false;homeIds.add((h.home as PlanningPoint).id)}
    return true
  }catch{return false}
}
export function readDistributionState(value:unknown):DistributionState {
  if(value===undefined||value===null)return emptyDistribution()
  const d=object(value)
  if(d.version!==1||!Array.isArray(d.sources)||!Array.isArray(d.connections)||!Array.isArray(d.suppressedPairs))throw new Error("Schema distribusi tidak didukung atau tidak lengkap.")
  if(!Number.isInteger(d.nextId)||(d.nextId as number)<1)throw new Error("Nomor urut distribusi tidak valid.")
  const sourceIds=new Set(),segmentIds=new Set()
  for(const raw of d.sources){const s=object(raw);if(!string(s.id)||sourceIds.has(s.id)||!string(s.name)||!string(s.poleId)||!["temporary","FDT"].includes(s.kind as string)||(s.kind==="FDT"&&!string(s.deviceId)))throw new Error("Sumber distribusi tidak valid/duplikat.");sourceIds.add(s.id)}
  for(const raw of d.connections){const s=object(raw);let geometry=false;try{geometry=object(s.geometry).type==="LineString"&&validGeometry(s.geometry as never)}catch{/* validated below */}
    if(!string(s.id)||segmentIds.has(s.id)||!string(s.from)||!string(s.to)||!geometry||typeof s.lengthMeters!=="number"||!Number.isFinite(s.lengthMeters)||s.lengthMeters<0||typeof s.active!=="boolean"||!["allowed","blocked","rejected","unverified"].includes(s.permission as string)||!["manual","candidate","imported"].includes(s.origin as string)||!string(s.note))throw new Error("Koneksi distribusi tidak valid/duplikat pada berkas proyek.");segmentIds.add(s.id)}
  if(!d.suppressedPairs.every(string)||!Object.values(object(d.assignments)).every(string))throw new Error("Assignment atau keputusan kandidat tidak valid.")
  if(typeof d.candidateRadiusMeters!=="number"||!Number.isFinite(d.candidateRadiusMeters)||d.candidateRadiusMeters<=0||!Number.isInteger(d.candidateNeighbors)||(d.candidateNeighbors as number)<1||(d.candidateNeighbors as number)>10)throw new Error("Konfigurasi kandidat tidak valid.")
  // The persisted result is a reference, never trusted to create connections or active allocations.
  if(d.result!==null&&d.result!==undefined){const r=object(d.result)
    if(!string(r.revision)||!Array.isArray(r.selectedConnections)||!Array.isArray(r.routes)||!Array.isArray(r.issues)||!Array.isArray(r.unassignedFatIds)||!Object.keys(object(r.summary)).length||!r.bySource||!r.usage)throw new Error("Hasil distribusi tersimpan tidak lengkap.")
    if(!r.unassignedFatIds.every(string))throw new Error("Daftar FAT belum ditetapkan tidak valid.")
    const checkSummary=(value:unknown)=>{const summary=object(value);return ["targetCount","successCount","unreachableCount","invalidCount","uniqueLengthMeters","totalRouteLengthMeters","longestRouteMeters"].every(key=>typeof summary[key]==="number"&&Number.isFinite(summary[key])&&(summary[key] as number)>=0)&&["segmentIds","sharedSegmentIds"].every(key=>Array.isArray(summary[key])&&(summary[key] as unknown[]).every(string))}
    if(!checkSummary(r.summary)||!Object.values(object(r.bySource)).every(checkSummary))throw new Error("Ringkasan distribusi tersimpan tidak valid.")
    for(const raw of Object.values(object(r.usage))){const usage=object(raw);if(!["sourceIds","fatIds","routeKeys"].every(key=>Array.isArray(usage[key])&&(usage[key] as unknown[]).every(string)))throw new Error("Data segmen bersama tidak valid.")}
    for(const raw of r.issues){const issue=object(raw);if(!string(issue.objectId)||!string(issue.message))throw new Error("Daftar masalah tersimpan tidak valid.")}
    for(const raw of r.selectedConnections){const segment=object(raw);let geometry=false;try{geometry=object(segment.geometry).type==="LineString"&&validGeometry(segment.geometry as never)}catch{/* checked below */}if(!string(segment.id)||!geometry||typeof segment.lengthMeters!=="number"||!Number.isFinite(segment.lengthMeters)||segment.lengthMeters<=0)throw new Error("Snapshot segmen hasil lama tidak valid.")}
    for(const raw of r.routes){const route=object(raw);if(!string(route.key)||!string(route.sourceId)||!string(route.fatId)||!Array.isArray(route.poleIds)||!route.poleIds.every(string)||!Array.isArray(route.segmentIds)||!route.segmentIds.every(string)||!["success","unreachable","invalid"].includes(route.status as string)||!string(route.reason)||!string(route.revision))throw new Error("Rute tersimpan tidak valid.")
      if(route.geometry!==null){try{if(!validGeometry(route.geometry as never)||!["Point","LineString"].includes(object(route.geometry).type as string))throw new Error()}catch{throw new Error("Geometri rute tersimpan tidak valid.")}}
      if(route.lengthMeters!==null&&(typeof route.lengthMeters!=="number"||!Number.isFinite(route.lengthMeters)||route.lengthMeters<0))throw new Error("Panjang rute tersimpan tidak valid.")}
  }
  return {...d,assignments:{...object(d.assignments)},result:d.result??null} as DistributionState
}
export function parseFtthProject(value:unknown):FtthProject {
  const p=object(value)
  if(p.format!==undefined&&p.format!=="smart-ftth-project")throw new Error("Berkas bukan proyek Smart FTTH Planner.")
  if(p.version!==undefined&&p.version!==0&&p.version!==1)throw new Error("Versi proyek belum didukung. Simpanan lama tidak diubah.")
  if(!Array.isArray(p.features))throw new Error("Proyek harus memiliki daftar data survei.")
  const featureIds=new Set()
  for(const raw of p.features){const f=object(raw);let geometry=false;try{geometry=validGeometry(f.geometry as never)}catch{/* checked below */}
    if(!string(f.id)||featureIds.has(f.id)||!string(f.name)||!string(f.file)||!string(f.kmlFile)||!["Tiang","Rumah","FAT","FDT","Jalur kabel","Belum dikategorikan"].includes(f.category as string)||!geometry||!Array.isArray(f.coords)||f.coords.length!==2||!f.coords.every(v=>typeof v==="number"&&Number.isFinite(v)))throw new Error("Data survei proyek tidak valid atau memiliki ID duplikat.");featureIds.add(f.id)}
  if(p.plan!==null&&p.plan!==undefined&&!validPlan(p.plan))throw new Error("Snapshot perencanaan rumah/FAT tidak valid; proyek aktif tidak diganti.")
  const c=object(p.configuration)
  const configuration={fatPorts:validateFatPorts((c.fatPorts??object(p.plan).fatPorts??DEFAULT_FAT_PORTS) as number),maxDropLengthMeters:validateMaxDropLengthMeters((c.maxDropLengthMeters??object(p.plan).maxDropLengthMeters??DEFAULT_MAX_DROP_LENGTH_METERS) as number),maxFatsPerPole:validateMaxFatsPerPole((c.maxFatsPerPole??DEFAULT_MAX_FATS_PER_POLE) as number)}
  const allocations=p.allocations===undefined?emptyAllocations():object(p.allocations)
  if(!Array.isArray(allocations.proposals)||!Array.isArray(allocations.locks))throw new Error("Keputusan alokasi tidak valid.")
  if(allocations.detachedHomeIds!==undefined&&(!Array.isArray(allocations.detachedHomeIds)||!allocations.detachedHomeIds.every(string)))throw new Error("Daftar rumah yang diputuskan tidak valid.")
  const validVerification=(value:unknown)=>{const v=object(value);return string(v.note)&&v.paths!==null&&typeof v.paths==="object"&&!Array.isArray(v.paths)&&Object.values(object(v.paths)).every(raw=>{const path=object(raw);return ["yes","no","unknown"].includes(path.allowed as string)&&(path.lengthMeters===undefined||(typeof path.lengthMeters==="number"&&Number.isFinite(path.lengthMeters)&&path.lengthMeters>=0))})}
  for(const raw of allocations.locks){const l=object(raw);if(!validPlan({...object(p.plan),groups:[l.group],unservedHomes:[],issues:[],warnings:[]}))throw new Error("Desain terkunci tidak valid.");if(!validVerification(l.verification))throw new Error("Verifikasi desain terkunci tidak valid.")}
  for(const raw of allocations.proposals){const r=object(raw),t=object(r.target);if(!string(r.id)||!string(r.revision)||!Array.isArray(r.homes)||!r.homes.every(pointValid)||!pointValid(t.pole)||!string(t.id)||!string(r.note)||!Array.isArray(r.history)||!r.history.every(string)||!["pending","accepted","ignored","deleted"].includes(r.decision as string)||!["ASSIGN_EXISTING_FAT","INSTALL_NEW_FAT","ADD_FAT_ON_EXISTING_POLE"].includes(r.type as string))throw new Error("Usulan alokasi tersimpan tidak valid.");if(r.verification!==undefined&&!validVerification(r.verification))throw new Error("Verifikasi usulan tersimpan tidak valid.")}
  return {format:"smart-ftth-project",version:1,savedAt:string(p.savedAt)?p.savedAt:new Date().toISOString(),features:p.features as FeatureItem[],plan:(p.plan??null) as FtthPlan|null,allocations:allocations as AllocationState,configuration,distribution:readDistributionState(p.distribution)}
}
export function serializeFtthProject(project:FtthProject):string {
  const value=JSON.stringify(project)
  parseFtthProject(JSON.parse(value))
  return value
}
