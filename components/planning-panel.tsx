"use client"

import { useEffect, useRef } from "react"
import { Network } from "lucide-react"
import { ControlSection } from "@/components/control-section"
import { Button } from "@/components/ui/button"
import type { FtthPlan } from "@/lib/ftth-planning"

type Props = {
  view?: "full" | "detail"
  plan: FtthPlan | null
  selectedGroupId: string | null
  highlightedGroupId: string | null
  onHighlightGroup: (id: string) => void
  onHoverGroup: (id: string | null) => void
  hasData: boolean
  importing: boolean
  onRun: () => void
  onSelectGroup: (id: string) => void
  resultsOpen: boolean
  onResultsOpenChange: (open: boolean) => void
}
export function PlanningPanel({ view = "full", plan, selectedGroupId, highlightedGroupId, onHighlightGroup, onHoverGroup, hasData, importing, onRun, onSelectGroup, resultsOpen, onResultsOpenChange }: Props) {
  const selected = plan?.groups.find(group => group.id === selectedGroupId)
  const drops = selected?.candidate?.connections.filter(connection => selected.homes.some(home => home.id === connection.homeId) && Number.isFinite(connection.distanceMeters)) || []
  const formatMeters = (meters: number) => `${meters.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m`
  const selectedDetail = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected && resultsOpen) selectedDetail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selected, resultsOpen])
  const details = selected ? <div ref={selectedDetail} className="space-y-2 rounded-lg border bg-white p-3 text-[11px]">
        <h3 className="text-xs font-semibold" style={{ color: selected.color }}>Kelompok {selected.id}{selected.locked ? " · Desain terkunci" : ""} · {selected.homes.length + (selected.occupiedPorts || 0)}/{selected.capacity ?? plan!.fatPorts} port</h3>
        {selected.candidate ? <>
          <p>Kandidat: <b>{selected.candidate.id}</b></p>
          <p className="break-all">Tiang: {selected.candidate.pole.name}<br />ID tiang: {selected.candidate.pole.sourceId}</p>
          <div className="rounded-md bg-emerald-50 p-2 text-emerald-900">
            <h4 className="font-semibold">Perkiraan kabel drop cluster</h4>
            <p>Total panjang/jarak drop: <b>{formatMeters(drops.reduce((sum, drop) => sum + drop.distanceMeters, 0))}</b></p>
            <p>Drop terjauh: <b>{drops.length ? formatMeters(Math.max(...drops.map(drop => drop.distanceMeters))) : "—"}</b> · Batas {formatMeters(plan!.maxDropLengthMeters)}</p>
            <p className="mt-1 text-[10px]">Estimasi jarak lurus belum termasuk slack/allowance dan belum memvalidasi lintasan pemasangan. Metode jalur terverifikasi ditandai per rumah. Garis peta adalah hubungan layanan, bukan jalur kabel aktual.</p>
          </div>
        </> : <p>Kandidat FAT: <b>—</b></p>}
        <h4 className="font-semibold">Rumah yang direncanakan dilayani</h4>
        <ul className="max-h-60 space-y-2 overflow-y-auto" aria-label="Estimasi drop tiap rumah">{selected.homes.map(home => {
          const drop = drops.find(connection => connection.homeId === home.id)
          return <li key={home.id} className="break-all rounded border p-2"><b>{home.name}</b> · ID {home.sourceId}
            {selected.candidate && <><p>Rumah ↔ {selected.candidate.id}</p><p className="font-semibold text-emerald-800">{drop?.method === "route" ? "Drop jalur terverifikasi" : "Estimasi drop (jarak lurus)"}: {drop ? formatMeters(drop.distanceMeters) : "Belum tersedia"}</p></>}
          </li>
        })}</ul>
      </div> : <p className="text-xs text-slate-500">Pilih FAT atau kelompok untuk melihat detail.</p>
  if (view === "detail") return <section aria-label="Detail FAT dan kelompok">{details}</section>
  return <section aria-label="Perencanaan awal FTTH" className="space-y-3">
    <Button type="button" size="sm" className="w-full" disabled={!hasData || importing} onClick={onRun}>{plan ? "Hitung ulang kelompok & FAT" : "Mulai pengelompokan & estimasi FAT"}</Button>
    {plan && <ControlSection title="Hasil Perencanaan" caption={`${plan.groups.length} kelompok`} open={resultsOpen} onOpenChange={onResultsOpenChange}>
      <p role="status" className="text-xs">{plan.homeCount - plan.unservedHomes.length} rumah terlayani aktif / {plan.homeCount} rumah · {plan.poleCount} tiang · <b>{plan.groups.length} kelompok</b></p>
      <p className="text-xs">Belum terlayani: <b>{plan.unservedHomes.length} rumah</b> · Batas {plan.maxDropLengthMeters} m</p>
      <p className="text-[11px] text-slate-500">Perencanaan otomatis memakai estimasi jarak lurus (geodesik). Lolos pemeriksaan awal jarak belum memvalidasi lintasan pemasangan. Desain engineer menampilkan metode per rumah.</p>
      {!!plan.unservedHomes.length && <details><summary className="cursor-pointer text-xs font-medium">Rumah belum terlayani dan alasan</summary><ul className="max-h-44 space-y-2 overflow-y-auto text-[11px]">{plan.unservedHomes.map(item => <li key={item.home.id} className="rounded border p-2"><b>{item.home.name}</b> · ID {item.home.sourceId}<p>{item.reason}</p>{item.fatId && <p>{item.fatId} · Tiang {item.pole?.name} · ID {item.pole?.sourceId}<br />{item.distanceMethod === "route" ? "Panjang jalur terverifikasi" : "Estimasi jarak lurus"}: {item.distanceMeters?.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m · Batas {plan.maxDropLengthMeters} m</p>}</li>)}</ul></details>}
      {!!plan.groups.length && <>
        <ul className="max-h-44 space-y-1 overflow-y-auto" aria-label="Daftar kelompok rumah">{plan.groups.map(group => <li key={group.id} className={`flex items-center gap-1 rounded-md border p-1 ${highlightedGroupId === group.id ? "border-emerald-600 bg-emerald-50" : "border-transparent bg-white"}`}>
          <Button size="icon-sm" variant="ghost" onClick={() => onSelectGroup(group.id)} aria-label={`Lihat detail kelompok ${group.id}`} title={`Lihat detail kelompok ${group.id}`}><Network style={{ color: group.color }} /></Button>
          <button type="button" aria-pressed={highlightedGroupId === group.id} aria-label={`Sorot kelompok ${group.id}`} onClick={() => onHighlightGroup(group.id)} onMouseEnter={() => onHoverGroup(group.id)} onMouseLeave={() => onHoverGroup(null)} onFocus={() => onHoverGroup(group.id)} onBlur={() => onHoverGroup(null)} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded p-2 text-left text-xs hover:bg-emerald-50"><span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ backgroundColor: group.color }} />{group.id} · {group.homes.length} rumah</span><span className="text-[10px] text-slate-500">{group.candidate?.id || "Tanpa FAT"}</span></button>
        </li>)}</ul>
      </>}
      {selected && details}
    </ControlSection>}
  </section>
}
