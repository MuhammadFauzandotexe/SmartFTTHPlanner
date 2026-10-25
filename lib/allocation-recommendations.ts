import { extractPlanningInputs, planningDistance, type FtthPlan, type HomeGroup, type PlanningPoint } from "./ftth-planning"
import { validGeometry, type FeatureItem } from "./survey"

export type ReasonCode = "CAPACITY_UNAVAILABLE" | "DROP_LIMIT_EXCEEDED" | "NO_ALLOWED_PATH" | "INSUFFICIENT_DATA"
export type Decision = "pending" | "accepted" | "ignored" | "deleted"
export type CheckStatus = "passed" | "needs-verification" | "failed" | "stale"
export type ProposalType = "ASSIGN_EXISTING_FAT" | "INSTALL_NEW_FAT" | "ADD_FAT_ON_EXISTING_POLE"
export type Truth = "yes" | "no" | "unknown"
export type PathEvidence = { allowed: Truth; lengthMeters?: number }
export type PoleEvidence = { installation: Truth; upstream: Truth; maxFats?: number }
export type AllocationContext = {
  plan: FtthPlan
  poles: PlanningPoint[]
  surveyFats?: PlanningPoint[]
  paths?: Record<string, PathEvidence>
  sourceGeometry?: Record<string, number[]>
  poleEvidence?: Record<string, PoleEvidence>
}
export type Target = {
  id: string; pole: PlanningPoint; type: ProposalType; capacity: number; occupied: number; capacityKnown: boolean
}
export type ManualVerification = {
  paths: Record<string, PathEvidence>
  installation: boolean; upstream: boolean; maxFats?: number
  capacityConfirmed: boolean; occupiedPorts?: number; note: string
}
export type Proposal = {
  id: string; type: ProposalType; target: Target; homes: PlanningPoint[]; revision: string
  decision: Decision; note: string; history: string[]; manual: boolean
  verification?: ManualVerification
}
export type CandidateCheck = {
  status: Exclude<CheckStatus, "stale">; reasons: ReasonCode[]; missing: string[]
  drops: { homeId: string; meters: number; method: "route" | "straight-line" }[]
  used: number; remaining: number
}
export type LockedDesign = { group: HomeGroup; proposalId: string; verification: ManualVerification; geometryRevision: string }
export type AllocationState = { proposals: Proposal[]; locks: LockedDesign[] }
export const emptyAllocations = (): AllocationState => ({ proposals: [], locks: [] })
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
export const pathKey = (homeId: string, poleId: string) => JSON.stringify([homeId, poleId])
const geometry = (p: PlanningPoint) => [p.id, p.coordinates]
// Exact canonical strings avoid hash collisions and exclude names and display metadata.
export function inputRevision(ctx: AllocationContext): string {
  return JSON.stringify({ maxDrop: ctx.plan.maxDropLengthMeters, ports: ctx.plan.fatPorts,
    homes: [...ctx.plan.groups.flatMap(g => g.homes), ...ctx.plan.unservedHomes.map(h => h.home)].sort((a,b) => cmp(a.id,b.id)).map(geometry),
    poles: [...ctx.poles].sort((a,b) => cmp(a.id,b.id)).map(geometry),
    fats: [...(ctx.surveyFats || [])].sort((a,b) => cmp(a.id,b.id)).map(geometry),
    groups: ctx.plan.groups.map(g => [g.candidate?.id, g.candidate?.pole.id, g.capacity ?? ctx.plan.fatPorts, g.occupiedPorts ?? 0, g.homes.map(h => h.id).sort()]).sort((a,b) => cmp(String(a[0]),String(b[0]))),
    sourceGeometry: Object.entries(ctx.sourceGeometry || {}).sort(([a],[b]) => cmp(a,b)),
    paths: Object.entries(ctx.paths || {}).sort(([a],[b]) => cmp(a,b)), polesEvidence: Object.entries(ctx.poleEvidence || {}).sort(([a],[b]) => cmp(a,b)),
  })
}
export function allocationContext(plan: FtthPlan, features: readonly FeatureItem[]): AllocationContext {
  const { poles } = extractPlanningInputs(features)
  const surveyFats = features.filter(f => f.category === "FAT" && f.geometry.type === "Point" && validGeometry(f.geometry)).map(f => ({
    id: f.id, name: f.name, sourceId: f.id, file: f.file, coordinates: [...(f.geometry as GeoJSON.Point).coordinates.slice(0,2)] as [number,number],
  }))
  const sourceGeometry = Object.fromEntries(features.filter(f => ["Rumah", "Tiang", "FAT"].includes(f.category) && f.geometry.type === "Point" && validGeometry(f.geometry)).map(f => [f.id, (f.geometry as GeoJSON.Point).coordinates.slice(0,2)]))
  return { plan, poles, surveyFats, sourceGeometry }
}
export function targets(ctx: AllocationContext): Target[] {
  const existing: Target[] = ctx.plan.groups.filter(g => g.candidate).map(g => ({ id: g.candidate!.id, pole: g.candidate!.pole,
    type: "ASSIGN_EXISTING_FAT", capacity: g.capacity ?? ctx.plan.fatPorts, occupied: (g.occupiedPorts ?? 0) + g.homes.length, capacityKnown: true }))
  for (const fat of ctx.surveyFats || []) {
    if (!existing.some(t => t.id === `SURVEY-FAT:${fat.id}`)) existing.push({ id: `SURVEY-FAT:${fat.id}`, pole: fat, type: "ASSIGN_EXISTING_FAT", capacity: ctx.plan.fatPorts, occupied: 0, capacityKnown: false })
  }
  const occupied = (pole: PlanningPoint) => existing.some(t => t.pole.id === pole.id || planningDistance(t.pole, pole) < 0.1)
  return [...existing, ...ctx.poles.map(pole => ({ id: `POLE:${pole.id}`, pole, type: occupied(pole) ? "ADD_FAT_ON_EXISTING_POLE" as const : "INSTALL_NEW_FAT" as const,
    capacity: ctx.plan.fatPorts, occupied: 0, capacityKnown: true }))]
}
type Prepared = { allTargets: Target[]; availableHomes: Map<string, PlanningPoint> }
const prepare = (ctx: AllocationContext): Prepared => ({ allTargets: targets(ctx), availableHomes: new Map(ctx.plan.unservedHomes.map(h=>[h.home.id,h.home])) })
export function checkProposal(ctx: AllocationContext, proposal: Proposal, reserved = 0, prepared = prepare(ctx)): CandidateCheck {
  const reasons: ReasonCode[] = [], missing: string[] = [], drops: CandidateCheck["drops"] = []
  const reject = (reason: ReasonCode) => { if (!reasons.includes(reason)) reasons.push(reason) }
  const live = prepared.allTargets.find(t => t.id === proposal.target.id)
  const v = proposal.verification
  if (!live || !proposal.homes.length || new Set(proposal.homes.map(h => h.id)).size !== proposal.homes.length) reject("INSUFFICIENT_DATA")
  const target = live || proposal.target
  const availableHomes = prepared.availableHomes
  const capacity = target.type === "ASSIGN_EXISTING_FAT" && target.capacityKnown ? target.capacity : proposal.target.capacity
  const occupied = target.capacityKnown ? target.occupied : v?.occupiedPorts ?? target.occupied
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 25 || !Number.isInteger(occupied) || occupied < 0) reject("INSUFFICIENT_DATA")
  const used = occupied + reserved + proposal.homes.length
  if (used > capacity) reject("CAPACITY_UNAVAILABLE")
  if (!target.capacityKnown && !v?.capacityConfirmed) missing.push("Kapasitas dan port terpakai FAT survei perlu diverifikasi")
  if (!target.capacityKnown && v?.occupiedPorts === undefined) missing.push("Jumlah port FAT survei yang sudah terpakai")
  for (const proposedHome of proposal.homes) {
    const home = availableHomes.get(proposedHome.id)
    if (!home) { reject("INSUFFICIENT_DATA"); continue }
    const automatic = ctx.paths?.[pathKey(home.id, target.pole.id)]
    const manual = v?.paths[home.id]
    // Known invalid facts cannot be overwritten by manual confirmation.
    const evidence = automatic?.allowed === "no" ? automatic : manual?.allowed === "no" ? manual : automatic?.lengthMeters !== undefined ? automatic : manual || automatic
    const straight = planningDistance(home, target.pole)
    const route = evidence?.lengthMeters
    const routeValid = typeof route === "number" && Number.isFinite(route) && route >= straight - 0.01 && route >= 0
    const meters = routeValid ? route! : straight
    drops.push({ homeId: home.id, meters, method: routeValid ? "route" : "straight-line" })
    if (straight > ctx.plan.maxDropLengthMeters || (routeValid && meters > ctx.plan.maxDropLengthMeters)) reject("DROP_LIMIT_EXCEEDED")
    if (evidence?.allowed === "no") reject("NO_ALLOWED_PATH")
    else if (evidence?.allowed !== "yes") missing.push(`Izin jalur ${home.name}`)
    if (!routeValid) missing.push(`Panjang jalur aktual ${home.name} (minimal ${straight.toFixed(1)} m)`)
  }
  if (target.type !== "ASSIGN_EXISTING_FAT") {
    const pole = ctx.poleEvidence?.[target.pole.id]
    if (pole?.installation === "no" || pole?.upstream === "no") reject("NO_ALLOWED_PATH")
    if (pole?.installation !== "yes" && !v?.installation) missing.push("Kelayakan pemasangan tiang")
    if (pole?.upstream !== "yes" && !v?.upstream) missing.push("Akses dan kapasitas distribusi/upstream")
    const maxFats = pole?.maxFats ?? v?.maxFats
    const devices = prepared.allTargets.filter(t => t.type === "ASSIGN_EXISTING_FAT" && (t.pole.id === target.pole.id || planningDistance(t.pole, target.pole) < 0.1)).length
    if (maxFats === undefined) missing.push("Batas jumlah FAT pada tiang")
    else if (!Number.isInteger(maxFats) || devices + 1 > maxFats) reject("CAPACITY_UNAVAILABLE")
  }
  if (v && !v.note.trim()) missing.push("Catatan bukti verifikasi engineer")
  const failed = reasons.length > 0
  if (missing.length && !reasons.includes("INSUFFICIENT_DATA")) reasons.push("INSUFFICIENT_DATA")
  return { status: failed ? "failed" : missing.length ? "needs-verification" : "passed", reasons, missing, drops, used, remaining: capacity - used }
}
const priority = (t: Target) => t.type === "ASSIGN_EXISTING_FAT" ? 1 : t.type === "INSTALL_NEW_FAT" ? 2 : 3
const compactId = (key: string) => {
  let first = 2166136261, second = 5381
  for (let i=0;i<key.length;i++) { first=Math.imul(first^key.charCodeAt(i),16777619); second=Math.imul(second,33)^key.charCodeAt(i) }
  return `${(first>>>0).toString(16).padStart(8,"0")}${(second>>>0).toString(16).padStart(8,"0")}`
}
export function makeProposal(ctx: AllocationContext, target: Target, homes: PlanningPoint[], manual = false, revision = inputRevision(ctx), revisionKey = compactId(revision)): Proposal {
  return { id: `REC-${compactId(JSON.stringify([target.id, homes.map(h=>h.id).sort(), revisionKey]))}`, type: target.type, target, homes, revision, decision: "pending", note: "", history: [], manual }
}
export function proposalStatus(ctx: AllocationContext, p: Proposal): CheckStatus {
  if (p.decision === "accepted") {
    const fatId = p.type === "ASSIGN_EXISTING_FAT" ? p.target.id : `DESIGN:${p.id}`
    const group = ctx.plan.groups.find(g=>g.candidate?.id===fatId)
    if (!group || p.homes.some(h=>!group.homes.some(member=>member.id===h.id))) return "stale"
    if (ctx.sourceGeometry && [...p.homes,p.target.pole].some(point=>JSON.stringify(ctx.sourceGeometry?.[point.id])!==JSON.stringify(point.coordinates))) return "stale"
    if (group.homes.length + (group.occupiedPorts || 0) > (group.capacity ?? ctx.plan.fatPorts)) return "failed"
    return p.homes.some(h=>(group.candidate!.connections.find(c=>c.homeId===h.id)?.distanceMeters ?? Infinity)>ctx.plan.maxDropLengthMeters) ? "failed" : "passed"
  }
  return p.revision !== inputRevision(ctx) ? "stale" : checkProposal(ctx,p).status
}
export type HomeAssessment = { home: PlanningPoint; candidates: { targetId: string; status: CandidateCheck["status"]; reasons: ReasonCode[]; missing: string[] }[] }
export function assessUnserved(ctx: AllocationContext): HomeAssessment[] {
  const prepared = prepare(ctx), revision = inputRevision(ctx), revisionKey = compactId(revision)
  return ctx.plan.unservedHomes.map(({home}) => ({home, candidates: prepared.allTargets.map(t => {
    const c = checkProposal(ctx, makeProposal(ctx,t,[home],false,revision,revisionKey),0,prepared); return {targetId:t.id, status:c.status, reasons:c.reasons, missing:c.missing}
  })}))
}
export function generateRecommendations(ctx: AllocationContext, previous: AllocationState): AllocationState {
  const revision = inputRevision(ctx), revisionKey = compactId(revision), prepared = prepare(ctx), all = prepared.allTargets
  // Preserve accepted, suppressed and manually edited proposals; pending auto results are rebuilt deterministically.
  const retained = previous.proposals.filter(p => p.decision !== "pending" || p.manual)
  const result: Proposal[] = []
  const claimed = new Set<string>()
  const reservations = new Map<string, number>()
  for (const p of retained) if (p.decision === "pending" && p.revision === revision) {
    p.homes.forEach(h => claimed.add(h.id))
    if (checkProposal(ctx,p,0,prepared).status !== "failed") reservations.set(p.target.id, (reservations.get(p.target.id) || 0) + p.homes.length)
  }
  const suppressed = new Set(retained.filter(p => p.revision === revision && (p.decision === "ignored" || p.decision === "deleted")).map(p => p.id))
  const options = (home: PlanningPoint) => all.map(t => ({t, c: checkProposal(ctx,makeProposal(ctx,t,[home],false,revision,revisionKey),reservations.get(t.id) || 0,prepared)}))
    .filter(({c}) => c.status !== "failed")
    .sort((a,b) => priority(a.t)-priority(b.t) || Number(a.c.status !== "passed")-Number(b.c.status !== "passed") || a.c.drops[0].meters-b.c.drops[0].meters || cmp(a.t.id,b.t.id))
  const optionCounts = new Map(ctx.plan.unservedHomes.map(({home})=>[home.id,options(home).length]))
  const ordered = ctx.plan.unservedHomes.map(h=>h.home).sort((a,b)=> optionCounts.get(a.id)!-optionCounts.get(b.id)! || cmp(a.id,b.id))
  for (const home of ordered) {
    if (claimed.has(home.id)) continue
    const choices = options(home)
    // Within the selected priority, reuse a formed batch before opening another device.
    // Candidate ordering inside each reuse/new phase remains status, distance and ID.
    const preferred = choices.some(({c})=>c.status==="passed") ? choices.filter(({c})=>c.status==="passed") : choices
    const ranked = [1,2,3].flatMap(level => {
      const same = preferred.filter(({t})=>priority(t)===level)
      return [...same.filter(({t})=>result.some(p=>p.target.id===t.id)), ...same.filter(({t})=>!result.some(p=>p.target.id===t.id))]
    })
    for (const {t} of ranked) {
      let group = result.find(p => p.target.id === t.id)
      const candidate = makeProposal(ctx,t,[...(group?.homes || []),home],false,revision,revisionKey)
      if (suppressed.has(candidate.id) || retained.some(p => p.revision === revision && p.id === candidate.id)) continue
      // An identical suppressed member/target must not be resurrected by changing the batch size.
      if (retained.some(p => p.revision === revision && (p.decision === "ignored" || p.decision === "deleted") && p.target.id === t.id && p.homes.some(h=>h.id===home.id))) continue
      const otherReserved = (reservations.get(t.id) || 0) - (group?.homes.length || 0)
      if (checkProposal(ctx,candidate,otherReserved,prepared).status === "failed") continue
      if (t.type !== "ASSIGN_EXISTING_FAT" && retained.some(p => p.revision === revision && p.decision === "pending" && p.target.id === t.id)) continue
      if (group) result[result.indexOf(group)] = candidate
      else result.push(candidate)
      reservations.set(t.id,(reservations.get(t.id) || 0)+1); claimed.add(home.id); break
    }
  }
  return { ...previous, proposals: [...retained,...result] }
}
export function updateDecision(state: AllocationState, id: string, decision: Exclude<Decision,"accepted">, note: string): AllocationState {
  const selected = state.proposals.find(p=>p.id===id)
  if (decision === "pending" && selected && state.proposals.some(p=>p.id!==id && p.decision==="pending" && p.revision===selected.revision && p.homes.some(h=>selected.homes.some(s=>s.id===h.id)))) throw new Error("Rumah ada pada usulan pending lain. Abaikan usulan tersebut sebelum memulihkan.")
  if (decision === "pending" && selected) {
    const related = state.proposals.filter(p=>p.id!==id && p.decision==="pending" && p.revision===selected.revision && p.target.id===selected.target.id)
    if (selected.type!=="ASSIGN_EXISTING_FAT" && related.length) throw new Error("FAT provisional sudah ada pada tiang ini.")
    if (selected.target.occupied + selected.homes.length + related.reduce((n,p)=>n+p.homes.length,0) > selected.target.capacity) throw new Error("Reservasi port tidak mencukupi untuk memulihkan usulan.")
  }
  return {...state, proposals: state.proposals.map(p=>p.id===id && p.decision!=="accepted" ? {...p,decision,note,history:[...p.history,`${decision}: ${note}`]} : p)}
}
export function overrideProposal(ctx: AllocationContext, state: AllocationState, id: string, target: Target, homeIds: string[], note: string, verification?: ManualVerification): AllocationState {
  if (!note.trim()) throw new Error("Catatan perubahan wajib diisi.")
  const liveTarget = targets(ctx).find(t=>t.id===target.id)
  if (!liveTarget) throw new Error("Tujuan tidak tersedia pada input terbaru.")
  target = {...liveTarget, capacity: liveTarget.type==="ASSIGN_EXISTING_FAT" && liveTarget.capacityKnown ? liveTarget.capacity : target.capacity}
  const old = state.proposals.find(p=>p.id===id)
  if (!old || old.decision === "accepted") throw new Error("Usulan tidak dapat diubah.")
  const homes = homeIds.map(id=>ctx.plan.unservedHomes.find(h=>h.home.id===id)?.home)
  if (!homes.length || homes.some(h=>!h)) throw new Error("Pilih rumah yang masih belum terlayani.")
  const other = state.proposals.filter(p=>p.id!==id && p.decision==="pending" && p.revision===inputRevision(ctx))
  if (other.some(p=>p.homes.some(h=>homeIds.includes(h.id)))) throw new Error("Rumah sudah berada pada usulan pending lain; abaikan usulan tersebut terlebih dahulu.")
  if (target.type!=="ASSIGN_EXISTING_FAT" && other.some(p=>p.target.id===target.id)) throw new Error("Sudah ada FAT provisional pada tiang ini; ubah anggota usulan tersebut.")
  const edited = {...old,target,type:target.type,homes:homes as PlanningPoint[],revision:inputRevision(ctx),manual:true,verification,note,history:[...old.history,`Override: ${note}`]}
  const reserved = other.filter(p=>p.target.id===target.id).reduce((n,p)=>n+p.homes.length,0)
  if (checkProposal(ctx,edited,reserved).reasons.includes("CAPACITY_UNAVAILABLE")) throw new Error("Kapasitas tidak mencukupi termasuk reservasi usulan lain.")
  return {...state,proposals:state.proposals.map(p=>p.id===id?edited:p)}
}
export function acceptProposal(ctx: AllocationContext, state: AllocationState, id: string): { state: AllocationState; plan: FtthPlan } {
  const p = state.proposals.find(p=>p.id===id)
  if (!p) throw new Error("Usulan tidak ditemukan.")
  if (p.decision === "accepted") return {state,plan:ctx.plan}
  if (p.decision !== "pending") throw new Error("Pulihkan usulan terlebih dahulu.")
  if (proposalStatus(ctx,p)==="stale") throw new Error("Input berubah. Evaluasi ulang dan verifikasi kembali sebelum menyetujui.")
  const check = checkProposal(ctx,p)
  if (check.status!=="passed") throw new Error([...check.reasons,...check.missing].join("; "))
  const current = ctx.plan.groups.find(g=>g.candidate?.id===p.target.id)
  const idGroup = `LOCK:${p.id}`
  const fatId = p.type==="ASSIGN_EXISTING_FAT" ? p.target.id : `DESIGN:${p.id}`
  const homes = [...(current?.homes || []),...p.homes]
  const connections = [...(current?.candidate?.connections || []),...check.drops.map(d=>({homeId:d.homeId,distanceMeters:d.meters,method:d.method}))]
  const group: HomeGroup = {id:current?.id || idGroup, color:current?.color || "#047857", homes,
    capacity: p.target.capacity, occupiedPorts: current?.occupiedPorts ?? (p.target.capacityKnown ? 0 : p.verification!.occupiedPorts ?? 0),
    locked:true, candidate:{id:fatId,pole:p.target.pole,connections,totalDistanceMeters:connections.reduce((s,c)=>s+c.distanceMeters,0)}}
  const plan = {...ctx.plan, groups:[...ctx.plan.groups.filter(g=>g!==current),group],unservedHomes:ctx.plan.unservedHomes.filter(h=>!p.homes.some(x=>x.id===h.home.id))}
  const oldLock = state.locks.find(l=>l.group.candidate?.id===fatId)
  const verification = p.verification || {paths:Object.fromEntries(check.drops.map(d=>[d.homeId,{allowed:"yes" as const,lengthMeters:d.meters}])),installation:false,upstream:false,capacityConfirmed:false,note:"Pemeriksaan otomatis"}
  const lock: LockedDesign = {group, proposalId:id, verification:{...verification,paths:{...oldLock?.verification.paths,...verification.paths}}, geometryRevision: JSON.stringify([geometry(p.target.pole),homes.map(geometry)])}
  return {plan,state:{proposals:state.proposals.map(x=>x.id===id?{...x,decision:"accepted",history:[...x.history,`Accepted: ${verification.note}`]}:x), locks:[...state.locks.filter(l=>l.group.candidate?.id!==fatId),lock]}}
}
/** Locks take precedence; rebuild only the automatic part, never silently discard engineer designs. */
export function preserveLockedDesigns(base: FtthPlan, locks: LockedDesign[]): FtthPlan {
  const ids = new Set(locks.flatMap(l=>l.group.homes.map(h=>h.id)))
  const lockIds = new Set(locks.map(l=>l.group.id))
  const groups = base.groups.map(g=>{
    const homes=g.homes.filter(h=>!ids.has(h.id)), connections=g.candidate?.connections.filter(c=>!ids.has(c.homeId)) || []
    return {...g,id:lockIds.has(g.id)?`AUTO:${g.id}`:g.id,homes,candidate:g.candidate?{...g.candidate,id:locks.some(l=>l.group.candidate?.id===g.candidate?.id)?`AUTO:${g.candidate.id}`:g.candidate.id,connections,totalDistanceMeters:connections.reduce((s,c)=>s+c.distanceMeters,0)}:null}
  }).filter(g=>g.homes.length)
  return {...base,groups:[...groups,...locks.map(l=>l.group)],unservedHomes:base.unservedHomes.filter(h=>!ids.has(h.home.id))}
}
export function lockedDesignIssues(ctx: AllocationContext, locks: LockedDesign[]): string[] {
  const messages:string[]=[]
  for(const {group,verification} of locks) {
    if (ctx.sourceGeometry) for (const p of [...group.homes, ...(group.candidate ? [group.candidate.pole] : [])]) {
      if (JSON.stringify(ctx.sourceGeometry[p.id]) !== JSON.stringify(p.coordinates)) messages.push(`${p.name}: geometri sumber berubah/hilang; verifikasi desain terkunci perlu ditinjau`)
    }
    const pole = group.candidate?.pole
    const poleRules = pole && ctx.poleEvidence?.[pole.id]
    if (poleRules?.installation === "no" || poleRules?.upstream === "no") messages.push(`${group.id}: pemasangan/upstream diketahui tidak diizinkan`)
    if (pole && poleRules?.maxFats !== undefined && targets(ctx).filter(t=>t.type==="ASSIGN_EXISTING_FAT" && planningDistance(t.pole,pole)<0.1).length > poleRules.maxFats) messages.push(`${group.id}: batas jumlah FAT pada tiang terlampaui`)
    if(group.homes.length+(group.occupiedPorts||0)>(group.capacity??ctx.plan.fatPorts)) messages.push(`${group.id}: kapasitas terlampaui`)
    for(const home of group.homes) {
      const path = pole && ctx.paths?.[pathKey(home.id,pole.id)]
      if (path?.allowed === "no") messages.push(`${home.name}: jalur diketahui tidak diizinkan`)
      const route=path?.lengthMeters ?? verification.paths[home.id]?.lengthMeters
      const meters=route??group.candidate?.connections.find(c=>c.homeId===home.id)?.distanceMeters
      if(meters===undefined || meters>ctx.plan.maxDropLengthMeters) messages.push(`${home.name}: desain terkunci melampaui batas drop terbaru atau panjang belum diketahui`)
    }
  }
  return messages
}
