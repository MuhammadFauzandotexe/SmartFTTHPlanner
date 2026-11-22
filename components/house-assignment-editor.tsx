"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { FAT_CAPACITY } from "@/lib/fat-candidates"
import { formatDropMeters } from "@/lib/drop-plan"
import { houseOwner, type AssignmentPreview, type AssignmentProject } from "@/lib/manual-assignments"
import type { FeatureItem } from "@/lib/import-survey"
import type { PlanningConfig } from "@/lib/planning-config"

type Props = {
  house: FeatureItem; project: AssignmentProject; config: PlanningConfig; busy: boolean
  editing: boolean; targetId: string; preview: AssignmentPreview | null; deviceChoice: boolean; stagedApproval: boolean
  onStart: () => void; onCancel: () => void; onTarget: (id: string) => void
  onDetach: () => void; onApply: (acceptEstimate: boolean) => void; onAutomatic: () => void; onApprove: (id: string) => void
}
export default function HouseAssignmentEditor({ house, project, config, busy, editing, targetId, preview, deviceChoice, stagedApproval, onStart, onCancel, onTarget, onDetach, onApply, onAutomatic, onApprove }: Props) {
  const [confirmDetach, setConfirmDetach] = useState(false)
  const [acceptEstimate, setAcceptEstimate] = useState(false)
  useEffect(() => {
    if (!confirmDetach) return
    const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") setConfirmDetach(false) }
    window.addEventListener("keydown", cancel)
    return () => window.removeEventListener("keydown", cancel)
  }, [confirmDetach])
  useEffect(() => { setAcceptEstimate(false) }, [targetId, project.revision, config.maxDropLengthMeters])
  useEffect(() => { setConfirmDetach(false) }, [editing, house.id])
  const owner = houseOwner(project, house.id)
  const splitter = owner?.splitters.find(s => s.houses.some(item => item.house.id === house.id))
  const decision = project.decisions[house.id]
  const route = project.plan?.routes.find(route => route.house.id === house.id)
  const target = project.simulation?.boxes.find(box => box.candidate.id === targetId)
  const approved = stagedApproval || project.approvedFatIds.includes(targetId)
  const issue = owner && (!project.approvedFatIds.includes(owner.candidate.id) || route?.status === "problem" || (route?.lengthMeters !== null && route?.lengthMeters !== undefined && route.lengthMeters > config.maxDropLengthMeters))
  return <section aria-label="Hubungan rumah dan FAT" className="mt-3 space-y-2 border-t pt-3 text-xs">
    <dl className="space-y-1 break-words">
      <div><dt className="inline text-slate-500">FAT saat ini: </dt><dd className="inline">{owner ? `${owner.candidate.pole.name} · ${owner.candidate.id}` : "—"}</dd></div>
      <div><dt className="inline text-slate-500">Cluster layanan: </dt><dd className="inline">{owner ? `${owner.candidate.id} / ${splitter?.id}` : "—"}</dd></div>
      <div><dt className="inline text-slate-500">Status: </dt><dd className={`inline font-semibold ${owner ? "text-amber-800" : "text-red-700"}`}>{!owner ? "Belum terlayani" : issue ? "Alokasi perlu pemeriksaan" : route?.status === "valid" ? "Terlayani — sesuai data, lapangan belum terverifikasi" : "Terlayani sementara — belum validasi rute"}</dd></div>
      <div><dt className="inline text-slate-500">Pengelolaan: </dt><dd className="inline">{decision?.kind === "detached" ? "Dilepas manual · terkunci" : decision?.kind === "assigned" ? "Alokasi manual · terkunci" : "Otomatis"}</dd></div>
    </dl>
    {!editing && !confirmDetach && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={busy || !project.simulation?.boxes.length} onClick={onStart}>{owner ? "Pindahkan ke FAT lain" : "Hubungkan ke FAT"}</Button>
      {owner && <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmDetach(true)}>Lepas dari FAT</Button>}
      {decision && <Button size="sm" variant="outline" disabled={busy} onClick={onAutomatic}>Kembalikan ke alokasi otomatis</Button>}
    </div>}
    {confirmDetach && <div role="alertdialog" aria-label="Konfirmasi lepas rumah" className="space-y-2 rounded-md border border-red-200 bg-red-50 p-2" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setConfirmDetach(false) } }}>
      <p>Lepas {house.name} dari FAT? Port dikembalikan dan rumah tetap belum terlayani saat generate ulang. Objek survei tetap disimpan.</p>
      <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => { onDetach(); setConfirmDetach(false) }}>Konfirmasi lepas</Button><Button size="sm" variant="outline" onClick={() => setConfirmDetach(false)}>Batal</Button></div>
    </div>}
    {editing && <div className="space-y-2 rounded-md border border-sky-300 bg-sky-50 p-2">
      <p role="status">Pilih FAT tujuan pada peta atau daftar perangkat. Escape untuk batal.</p>
      {deviceChoice && <p className="font-semibold text-amber-800">Beberapa FAT berada pada tiang yang sama. Pilih ID perangkat yang tepat.</p>}
      <label className="block" htmlFor="assignment-target">FAT tujuan</label>
      <select id="assignment-target" value={targetId} disabled={busy} onChange={event => onTarget(event.target.value)} className="w-full rounded border bg-white p-2 text-xs">
        <option value="">Pilih perangkat FAT…</option>
        {project.simulation?.boxes.map(box => <option key={box.candidate.id} value={box.candidate.id}>{box.candidate.pole.name} · ID {box.candidate.id} · {box.houses.length}/{FAT_CAPACITY} · {project.approvedFatIds.includes(box.candidate.id) ? "disetujui" : "provisional"}</option>)}
      </select>
      {target && preview && <div className="space-y-1 break-words" aria-label="Preview penugasan">
        <p>FAT: {target.candidate.id}</p><p>Cluster: {preview.splitterId ?? "Tidak ada port"}</p>
        <p>Kapasitas: {preview.used}/{FAT_CAPACITY} terpakai · {preview.available} tersedia</p>
        <p>{preview.method === "estimate" ? "Estimasi" : "Panjang drop"}: {preview.lengthMeters !== null ? formatDropMeters(preview.lengthMeters) : "Belum diketahui"} · batas {config.maxDropLengthMeters} m</p>
        <p>Metode: {preview.method === "route" ? "Jalur penyangga terdata" : preview.method === "estimate" ? "Jarak lurus — belum validasi rute aktual" : "Belum diketahui"}</p>
        {!approved && <div className="rounded border border-amber-200 bg-white p-2"><p>FAT provisional tidak dapat menerima alokasi manual. Persetujuan perangkat tidak memvalidasi jalur kabel.</p><Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => onApprove(targetId)}>Setujui perangkat FAT ini</Button></div>}
        {stagedApproval && <p className="font-semibold text-sky-800">Persetujuan perangkat akan disimpan bersama alokasi saat Terapkan. Batal membuang persetujuan ini.</p>}
        {preview.reasons.map(reason => <p key={reason} className="text-red-700" role="alert">{reason}</p>)}
        {preview.warnings.map(warning => <p key={warning} className="text-amber-900">{warning}</p>)}
        {preview.method === "estimate" && <label className="flex items-start gap-2 pt-1"><input type="checkbox" checked={acceptEstimate} onChange={event => setAcceptEstimate(event.target.checked)} /><span>Saya memahami ini alokasi sementara berdasarkan estimasi, bukan rute tervalidasi.</span></label>}
      </div>}
      <div className="flex gap-2"><Button size="sm" disabled={busy || !preview?.allowed || preview.method === "estimate" && !acceptEstimate} onClick={() => onApply(acceptEstimate)}>Terapkan</Button><Button size="sm" variant="outline" onClick={onCancel}>Batal</Button></div>
    </div>}
    {!project.simulation?.boxes.length && <p className="text-slate-500">Jalankan simulasi FAT untuk menyediakan perangkat tujuan.</p>}
  </section>
}
