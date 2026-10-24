"use client"

import { Network } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MAX_HOMES_PER_GROUP, type FtthPlan } from "@/lib/ftth-planning"

type Props = {
  plan: FtthPlan | null
  selectedGroupId: string | null
  highlightedGroupId: string | null
  onHighlightGroup: (id: string) => void
  onHoverGroup: (id: string | null) => void
  hasData: boolean
  importing: boolean
  onRun: () => void
  onSelectGroup: (id: string) => void
}
export function PlanningPanel({ plan, selectedGroupId, highlightedGroupId, onHighlightGroup, onHoverGroup, hasData, importing, onRun, onSelectGroup }: Props) {
  const selected = plan?.groups.find(group => group.id === selectedGroupId)
  return <section aria-label="Perencanaan awal FTTH" className="space-y-3 rounded-lg border bg-slate-50 p-3">
    <h2 className="flex items-center gap-2 text-xs font-semibold"><Network className="size-4" /> Perencanaan awal FTTH</h2>
    <p className="text-[11px] leading-relaxed text-slate-500">Maksimal {MAX_HOMES_PER_GROUP} rumah per kelompok. Kandidat FAT dipilih dari tiang dengan total jarak terkecil ke seluruh rumah.</p>
    <Button type="button" size="sm" className="w-full" disabled={!hasData || importing} onClick={onRun}>{plan ? "Hitung ulang kelompok & FAT" : "Mulai pengelompokan & estimasi FAT"}</Button>
    {!plan && hasData && !importing && <p role="status" className="rounded border border-blue-100 bg-blue-50 p-2 text-[11px] text-blue-800">Data survei siap. Pengelompokan rumah dan estimasi FAT belum dijalankan. Tekan tombol di atas untuk memulai.</p>}
    {importing && <p role="status" className="text-[11px] text-slate-500">Memuat data survei saja. Pengelompokan dan estimasi FAT menunggu perintah Anda setelah impor selesai.</p>}
    {!hasData && <p className="text-[11px] text-slate-500">Impor data survei terlebih dahulu.</p>}
    <p className="rounded border border-amber-200 bg-amber-50 p-2 text-[11px] leading-relaxed text-amber-800">Estimasi berdasarkan jarak geografis. Garis putus-putus hanya hubungan layanan FAT–rumah, bukan jalur kabel fisik. Belum ada batas panjang drop atau pemeriksaan kelayakan pemasangan.</p>
    {plan && <>
      <p role="status" className="text-xs">{plan.homeCount} rumah · {plan.poleCount} tiang · <b>{plan.groups.length} kelompok</b></p>
      {plan.warnings.length > 0 && <ul className="space-y-1 text-[11px] text-amber-800">{plan.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
      {!!plan.issues.length && <details className="text-[11px]"><summary className="cursor-pointer font-semibold">Data tidak digunakan ({plan.issues.length})</summary><ul className="mt-2 max-h-32 space-y-2 overflow-auto">{plan.issues.map((issue, index) => <li key={index} className="break-all">{issue.name} · ID {issue.id}: {issue.reason}</li>)}</ul></details>}
      {!!plan.groups.length && <>
        <p className="text-[11px] text-slate-500">Klik rumah untuk informasi objek KMZ/KML. Klik ikon kelompok untuk detail kelompok; klik nama kelompok untuk sorotan tanpa mengubah zoom. Klik nama lagi untuk membatalkan. Kontrol layer ada di kiri bawah peta.</p>
        <ul className="max-h-44 space-y-1 overflow-y-auto" aria-label="Daftar kelompok rumah">{plan.groups.map(group => <li key={group.id} className={`flex items-center gap-1 rounded-md border p-1 ${highlightedGroupId === group.id ? "border-emerald-600 bg-emerald-50" : "border-transparent bg-white"}`}>
          <Button size="icon-sm" variant="ghost" onClick={() => onSelectGroup(group.id)} aria-label={`Lihat detail kelompok ${group.id}`} title={`Lihat detail kelompok ${group.id}`}><Network style={{ color: group.color }} /></Button>
          <button type="button" aria-pressed={highlightedGroupId === group.id} aria-label={`Sorot kelompok ${group.id}`} onClick={() => onHighlightGroup(group.id)} onMouseEnter={() => onHoverGroup(group.id)} onMouseLeave={() => onHoverGroup(null)} onFocus={() => onHoverGroup(group.id)} onBlur={() => onHoverGroup(null)} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded p-2 text-left text-xs hover:bg-emerald-50"><span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ backgroundColor: group.color }} />{group.id} · {group.homes.length} rumah</span><span className="text-[10px] text-slate-500">{group.candidate?.id || "Tanpa FAT"}</span></button>
        </li>)}</ul>
      </>}
      {selected && <div className="space-y-2 rounded-lg border bg-white p-3 text-[11px]">
        <h3 className="text-xs font-semibold" style={{ color: selected.color }}>Kelompok {selected.id} · {selected.homes.length}/{MAX_HOMES_PER_GROUP} rumah</h3>
        {selected.candidate ? <>
          <p>Kandidat: <b>{selected.candidate.id}</b></p>
          <p className="break-all">Tiang: {selected.candidate.pole.name}<br />ID tiang: {selected.candidate.pole.sourceId}</p>
          <p>Total jarak geografis ke anggota: <b>{selected.candidate.totalDistanceMeters.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m</b></p>
          <p className="text-slate-500">Satu tiang dapat dipilih untuk beberapa kelompok. Kandidat belum menyatakan kapasitas atau perangkat FAT terpasang.</p>
        </> : <p className="text-amber-800">Belum ada kandidat FAT karena tidak ada tiang valid.</p>}
        <h4 className="font-semibold">Rumah yang direncanakan dilayani</h4>
        <ul className="max-h-44 space-y-2 overflow-y-auto">{selected.homes.map(home => <li key={home.id} className="break-all"><b>{home.name}</b> · ID {home.sourceId}{selected.candidate && <span className="block text-slate-500">Jarak geografis: {selected.candidate.connections.find(connection => connection.homeId === home.id)?.distanceMeters.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m</span>}</li>)}</ul>
      </div>}
    </>}
  </section>
}
