"use client"

import { useMemo, useState } from "react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { assessUnserved, checkProposal, generateRecommendations, inputRevision, makeProposal, overrideProposal, proposalStatus, targets, updateDecision, type AllocationContext, type AllocationState, type ManualVerification, type Proposal, type Truth } from "@/lib/allocation-recommendations"

export const proposalLabels = { ASSIGN_EXISTING_FAT: "Alokasi ke FAT existing", INSTALL_NEW_FAT: "FAT baru pada tiang tanpa FAT", ADD_FAT_ON_EXISTING_POLE: "FAT tambahan pada tiang ber-FAT" }
const statusLabels = { passed: "Lolos pemeriksaan", "needs-verification": "Perlu verifikasi", failed: "Gagal pemeriksaan", stale: "Stale — evaluasi ulang" }
const decisionLabels = { pending: "Pending", accepted: "Disetujui / terkunci", ignored: "Diabaikan", deleted: "Dihapus / suppressed" }
const reasonLabels = { CAPACITY_UNAVAILABLE: "Kapasitas tidak tersedia", DROP_LIMIT_EXCEEDED: "Melebihi batas drop", NO_ALLOWED_PATH: "Jalur/pemasangan tidak diizinkan", INSUFFICIENT_DATA: "Data belum cukup" }
type Props = { context: AllocationContext; state: AllocationState; onChange: (state: AllocationState) => void; onAccept: (id: string) => void; onFocus: (p: Proposal) => void; issues: string[] }
const blankVerification = (): ManualVerification => ({paths:{},installation:false,upstream:false,capacityConfirmed:false,note:""})
export function AllocationPanel({context:ctx,state,onChange,onAccept,onFocus,issues}:Props) {
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [draft,setDraft]=useState<Proposal|null>(null)
  const [verification,setVerification]=useState<ManualVerification>(blankVerification)
  const [note,setNote]=useState("")
  const [error,setError]=useState("")
  const [showHistory,setShowHistory]=useState(false)
  const [showCandidates,setShowCandidates]=useState(false)
  const allTargets=useMemo(()=>targets(ctx),[ctx])
  const revision=useMemo(()=>inputRevision(ctx),[ctx])
  const selected=state.proposals.find(p=>p.id===selectedId)
  const acceptedFatId=selected && (selected.type==="ASSIGN_EXISTING_FAT"?selected.target.id:`DESIGN:${selected.id}`)
  const acceptedGroup=selected?.decision==="accepted"?ctx.plan.groups.find(g=>g.candidate?.id===acceptedFatId):undefined
  const selectedCheck=selected ? acceptedGroup ? {
    status: "passed" as const, reasons: [], missing: [],
    drops: selected.homes.map(home=>{const c=acceptedGroup.candidate!.connections.find(c=>c.homeId===home.id);return {homeId:home.id,meters:c?.distanceMeters??0,method:c?.method||"straight-line" as const}}),
    used: acceptedGroup.homes.length+(acceptedGroup.occupiedPorts||0), remaining:(acceptedGroup.capacity??ctx.plan.fatPorts)-acceptedGroup.homes.length-(acceptedGroup.occupiedPorts||0),
  } : checkProposal(ctx,selected,state.proposals.filter(p=>p.id!==selected.id&&p.decision==="pending"&&p.revision===inputRevision(ctx)&&p.target.id===selected.target.id).reduce((n,p)=>n+p.homes.length,0)) : null
  const eligible=state.proposals.filter(p=>p.decision==="pending" && p.revision===revision)
  const pendingHomes=new Set(eligible.flatMap(p=>p.homes.map(h=>h.id)))
  const open=(p:Proposal)=>{
    const liveTarget=allTargets.find(t=>t.id===p.target.id)
    setSelectedId(p.id);setDraft({...p,target:liveTarget||p.target,type:liveTarget?.type||p.type,revision});setNote(p.note);setError("")
    setVerification(proposalStatus(ctx,p)==="stale"?blankVerification():p.verification||blankVerification());onFocus(p)
  }
  const act=(fn:()=>void)=>{try{fn();setError("")}catch(e){setError(e instanceof Error?e.message:String(e))}}
  const save=()=>act(()=>{
    if(!draft) return
    if(draft.revision!==revision) throw new Error("Input berubah selama editor terbuka. Pilih kembali usulan dan ulangi verifikasi.")
    const seed=state.proposals.some(p=>p.id===draft.id)?state:{...state,proposals:[...state.proposals,draft]}
    const updated=overrideProposal(ctx,seed,draft.id,draft.target,draft.homes.map(h=>h.id),note,verification)
    onChange(updated);setSelectedId(draft.id);onFocus(updated.proposals.find(p=>p.id===draft.id)!)
  })
  const assessments=useMemo(()=>showCandidates?assessUnserved(ctx):[],[ctx,showCandidates])
  return <section aria-label="Rekomendasi alokasi" className="space-y-2 rounded-lg border bg-slate-50 p-2 text-[11px]">
    <h3 className="text-xs font-semibold">Rekomendasi alokasi</h3>
    <p>{ctx.plan.unservedHomes.length} rumah belum terlayani · {eligible.length} usulan pending · {pendingHomes.size} rumah diusulkan</p>
    <p>Usulan bukan rancangan aktif. Kapasitas FAT baru mengikuti konfigurasi eksplisit: <b>{ctx.plan.fatPorts} port</b>. Keputusan tersimpan selama sesi ini.</p>
    {!!issues.length && <div role="alert" className="rounded border border-red-300 bg-red-50 p-2"><b>Masalah rancangan</b><ul>{issues.map((s,i)=><li key={i}>{s}</li>)}</ul><p>Desain dipertahankan; perlu peninjauan engineer, bukan dihapus otomatis.</p></div>}
    {!allTargets.length && <p>Data belum cukup: tambahkan titik tiang atau FAT melalui impor survei untuk rencana manual.</p>}
    <div className="flex flex-wrap gap-1">
      <Button size="sm" onClick={()=>act(()=>onChange(generateRecommendations(ctx,state)))}>Rekomendasikan Alokasi</Button>
      <Button size="sm" variant="outline" disabled={!ctx.plan.unservedHomes.length||!allTargets.length} onClick={()=>{
        const home=ctx.plan.unservedHomes.find(h=>!pendingHomes.has(h.home.id))?.home||ctx.plan.unservedHomes[0]?.home
        if(home){const p=makeProposal(ctx,allTargets[0],[home],true);setSelectedId(null);setDraft(p);setNote("");setVerification(blankVerification());setError("");onFocus(p)}
      }}>Rencanakan manual</Button>
    </div>
    <label className="flex gap-2"><input type="checkbox" checked={showHistory} onChange={e=>setShowHistory(e.target.checked)}/>Tampilkan keputusan dan usulan lama</label>
    <ul className="max-h-48 space-y-1 overflow-y-auto">{state.proposals.filter(p=>showHistory || (p.decision==="pending"&&p.revision===revision)).map(p=><li key={p.id}>
      <button className={`w-full break-all rounded border bg-white p-2 text-left ${p.id===selectedId?"border-emerald-600":""}`} onClick={()=>open(p)}>
        <b>{proposalLabels[p.type]}</b><br/>{p.target.id} · {p.homes.length} rumah<br/>{decisionLabels[p.decision]} · {statusLabels[proposalStatus(ctx,p)]}
      </button>
    </li>)}</ul>
    {selected && selectedCheck && <div className="space-y-1 rounded border bg-white p-2">
      <h4 className="font-semibold">Detail usulan</h4>
      <p className="break-all">{selected.target.pole.name} · ID {selected.target.pole.sourceId}</p>
      <p>Port: {selectedCheck.used}/{selected.target.capacity} · sisa {Math.max(0,selectedCheck.remaining)} (termasuk reservasi pending lain pada tujuan yang sama)</p>
      <p>Drop maksimum: {Math.max(0,...selectedCheck.drops.map(d=>d.meters)).toFixed(1)} m · batas {ctx.plan.maxDropLengthMeters} m</p>
      <ul>{selectedCheck.drops.map(d=><li key={d.homeId}>{selected.homes.find(h=>h.id===d.homeId)?.name}: {d.meters.toFixed(1)} m · {d.method==="route"?"Panjang jalur terverifikasi (catatan engineer)":"Estimasi jarak lurus"}</li>)}</ul>
      <p>{statusLabels[proposalStatus(ctx,selected)]}</p>
      <ul>{selectedCheck.reasons.map(r=><li key={r}>{reasonLabels[r]}</li>)}{selectedCheck.missing.map(m=><li key={m}>Perlu verifikasi: {m}</li>)}</ul>
      <p>Alasan: prioritas FAT existing → tiang tanpa FAT → FAT tambahan. Tidak ada asumsi pertumbuhan rumah.</p>
      <p>Catatan: {selected.note||"—"}</p>
      <details><summary>Riwayat keputusan</summary><ul>{selected.history.map((h,i)=><li key={i}>{h}</li>)}</ul></details>
      {selected.decision!=="accepted" && <div className="flex flex-wrap gap-1">
        <Button size="sm" disabled={selected.decision!=="pending"||proposalStatus(ctx,selected)!=="passed"} onClick={()=>act(()=>onAccept(selected.id))}>Setujui sebagai rancangan aktif</Button>
        {selected.decision==="pending"?<>
          <Button size="sm" variant="outline" onClick={()=>act(()=>{onChange(updateDecision(state,selected.id,"ignored",note));setDraft(null)})}>Abaikan</Button>
          <Button size="sm" variant="outline" onClick={()=>act(()=>{onChange(updateDecision(state,selected.id,"deleted",note));setDraft(null)})}>Hapus usulan</Button>
        </>:<Button size="sm" variant="outline" onClick={()=>act(()=>{onChange(updateDecision(state,selected.id,"pending",note));setDraft(null)})}>Pulihkan</Button>}
      </div>}
    </div>}
    {draft && selected?.decision!=="accepted" && <div className="space-y-2 rounded border bg-white p-2">
      <h4 className="font-semibold">Ubah / verifikasi usulan</h4>
      <label className="block">FAT / tiang tujuan<select aria-label="Tujuan usulan" className="mt-1 w-full rounded border p-1" value={draft.target.id} onChange={e=>{const target=allTargets.find(t=>t.id===e.target.value);if(target){setDraft({...draft,target,type:target.type});setVerification(blankVerification())}}}>{allTargets.map(t=><option value={t.id} key={t.id}>{proposalLabels[t.type]} · {t.pole.name} · {t.id}</option>)}</select></label>
      <fieldset className="max-h-36 space-y-1 overflow-y-auto"><legend>Anggota rumah belum terlayani</legend>{ctx.plan.unservedHomes.map(({home})=><label key={home.id} className="flex gap-1"><input type="checkbox" checked={draft.homes.some(h=>h.id===home.id)} onChange={e=>setDraft({...draft,homes:e.target.checked?[...draft.homes,home]:draft.homes.filter(h=>h.id!==home.id)})}/>{home.name} · {home.sourceId}</label>)}</fieldset>
      <p>Jarak lurus hanya screening. Masukkan panjang lintasan pemasangan yang telah diperiksa; izin jalur harus dikonfirmasi per rumah. Tidak ada pengecualian batas teknis.</p>
      {draft.homes.map(home=><fieldset key={home.id} className="space-y-1 rounded border p-1"><legend>{home.name}</legend>
        <label>Panjang jalur drop terverifikasi (m)<Input aria-label={`Panjang jalur ${home.id}`} type="number" min="0" step="any" value={verification.paths[home.id]?.lengthMeters??""} onChange={e=>setVerification({...verification,paths:{...verification.paths,[home.id]:{allowed:verification.paths[home.id]?.allowed||"unknown",lengthMeters:e.target.value===""?undefined:Number(e.target.value)}}})}/></label>
        <label>Izin jalur<select aria-label={`Izin jalur ${home.id}`} className="ml-1 rounded border" value={verification.paths[home.id]?.allowed||"unknown"} onChange={e=>setVerification({...verification,paths:{...verification.paths,[home.id]:{...verification.paths[home.id],allowed:e.target.value as Truth}}})}><option value="unknown">Belum diketahui</option><option value="yes">Diperiksa: diizinkan</option><option value="no">Diperiksa: tidak diizinkan</option></select></label>
      </fieldset>)}
      {(!draft.target.capacityKnown || draft.type!=="ASSIGN_EXISTING_FAT") && <label className="block">Kapasitas FAT yang direncanakan / diverifikasi (port)<Input type="number" min="1" max="25" value={draft.target.capacity} onChange={e=>setDraft({...draft,target:{...draft.target,capacity:Number(e.target.value)}})}/></label>}
      {!draft.target.capacityKnown && <>
        <label>Port FAT survei yang sudah terpakai<Input type="number" min="0" value={verification.occupiedPorts??""} onChange={e=>setVerification({...verification,occupiedPorts:e.target.value===""?undefined:Number(e.target.value)})}/></label>
        <label className="flex gap-1"><input type="checkbox" checked={verification.capacityConfirmed} onChange={e=>setVerification({...verification,capacityConfirmed:e.target.checked})}/>Kapasitas dan port terpakai sudah diperiksa</label>
      </>}
      {draft.type!=="ASSIGN_EXISTING_FAT" && <>
        <label className="flex gap-1"><input type="checkbox" checked={verification.installation} onChange={e=>setVerification({...verification,installation:e.target.checked})}/>Pemasangan FAT di tiang ini diizinkan dan layak</label>
        <label className="flex gap-1"><input type="checkbox" checked={verification.upstream} onChange={e=>setVerification({...verification,upstream:e.target.checked})}/>Akses dan kapasitas distribusi/upstream sudah diperiksa</label>
        <label>Batas FAT pada tiang yang telah diperiksa<Input type="number" min="1" value={verification.maxFats??""} onChange={e=>setVerification({...verification,maxFats:e.target.value===""?undefined:Number(e.target.value)})}/></label>
      </>}
      <label className="block">Catatan perubahan / bukti verifikasi (wajib)<textarea className="mt-1 w-full rounded border p-1" value={note} onChange={e=>{setNote(e.target.value);setVerification({...verification,note:e.target.value})}}/></label>
      <Button size="sm" variant="outline" onClick={save}>Simpan dan validasi ulang</Button>
      <Button size="sm" variant="ghost" onClick={()=>setDraft(null)}>Tutup editor</Button>
    </div>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <details onToggle={e=>setShowCandidates(e.currentTarget.open)}><summary className="cursor-pointer">Pemeriksaan kandidat per rumah / alternatif</summary><ul className="max-h-56 space-y-2 overflow-y-auto">{assessments.map(a=><li key={a.home.id}><b>{a.home.name}</b> belum terlayani oleh rancangan aktif.{!a.candidates.length&&<p>INSUFFICIENT_DATA: tidak ada FAT/tiang; perlukan survei tambahan dan rencanakan manual.</p>}<ul>{a.candidates.map(c=><li key={c.targetId} className="break-all">{c.targetId}: {statusLabels[c.status]} · {c.reasons.map(r=>`${r}: ${reasonLabels[r]}`).join("; ")||"INSUFFICIENT_DATA: "+c.missing.join(", ")}</li>)}</ul></li>)}</ul></details>
  </section>
}
