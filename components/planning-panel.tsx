"use client"

import { useEffect, useRef } from "react"
import { Network } from "lucide-react"
import { ControlSection } from "@/components/control-section"
import { Button } from "@/components/ui/button"
import type { FtthPlan } from "@/lib/ftth-planning"

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
  resultsOpen: boolean
  onResultsOpenChange: (open: boolean) => void
}
export function PlanningPanel({ plan, selectedGroupId, highlightedGroupId, onHighlightGroup, onHoverGroup, hasData, importing, onRun, onSelectGroup, resultsOpen, onResultsOpenChange }: Props) {
  const selected = plan?.groups.find(group => group.id === selectedGroupId)
  const selectedDetail = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected && resultsOpen) selectedDetail.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selected, resultsOpen])
  return <section aria-label="Perencanaan awal FTTH" className="space-y-3">
    <Button type="button" size="sm" className="w-full" disabled={!hasData || importing} onClick={onRun}>{plan ? "Hitung ulang kelompok & FAT" : "Mulai pengelompokan & estimasi FAT"}</Button>
    {plan && <ControlSection title="Hasil Perencanaan" caption={`${plan.groups.length} kelompok`} open={resultsOpen} onOpenChange={onResultsOpenChange}>
      <p role="status" className="text-xs">{plan.homeCount} rumah · {plan.poleCount} tiang · <b>{plan.groups.length} kelompok</b></p>
      <p className="text-xs">Belum terlayani: <b>{plan.unservedHomes.length} rumah</b> · Batas {plan.maxDropLengthMeters} m</p>
      <p className="text-[11px] text-slate-500">Metode: estimasi jarak lurus (geodesik). Lolos pemeriksaan awal jarak belum memvalidasi lintasan pemasangan.</p>
      {!!plan.unservedHomes.length && <details><summary className="cursor-pointer text-xs font-medium">Rumah belum terlayani dan alasan</summary><ul className="max-h-44 space-y-2 overflow-y-auto text-[11px]">{plan.unservedHomes.map(item => <li key={item.home.id} className="rounded border p-2"><b>{item.home.name}</b> · ID {item.home.sourceId}<p>{item.reason}</p>{item.fatId && <p>{item.fatId} · Tiang {item.pole?.name} · ID {item.pole?.sourceId}<br />Estimasi jarak lurus: {item.distanceMeters?.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m · Batas {plan.maxDropLengthMeters} m</p>}</li>)}</ul></details>}
      {!!plan.groups.length && <>
        <ul className="max-h-44 space-y-1 overflow-y-auto" aria-label="Daftar kelompok rumah">{plan.groups.map(group => <li key={group.id} className={`flex items-center gap-1 rounded-md border p-1 ${highlightedGroupId === group.id ? "border-emerald-600 bg-emerald-50" : "border-transparent bg-white"}`}>
          <Button size="icon-sm" variant="ghost" onClick={() => onSelectGroup(group.id)} aria-label={`Lihat detail kelompok ${group.id}`} title={`Lihat detail kelompok ${group.id}`}><Network style={{ color: group.color }} /></Button>
          <button type="button" aria-pressed={highlightedGroupId === group.id} aria-label={`Sorot kelompok ${group.id}`} onClick={() => onHighlightGroup(group.id)} onMouseEnter={() => onHoverGroup(group.id)} onMouseLeave={() => onHoverGroup(null)} onFocus={() => onHoverGroup(group.id)} onBlur={() => onHoverGroup(null)} className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded p-2 text-left text-xs hover:bg-emerald-50"><span className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ backgroundColor: group.color }} />{group.id} · {group.homes.length} rumah</span><span className="text-[10px] text-slate-500">{group.candidate?.id || "Tanpa FAT"}</span></button>
        </li>)}</ul>
      </>}
      {selected && <div ref={selectedDetail} className="space-y-2 rounded-lg border bg-white p-3 text-[11px]">
        <h3 className="text-xs font-semibold" style={{ color: selected.color }}>Kelompok {selected.id} · {selected.homes.length}/{plan!.fatPorts} port</h3>
        {selected.candidate ? <>
          <p>Kandidat: <b>{selected.candidate.id}</b></p>
          <p className="break-all">Tiang: {selected.candidate.pole.name}<br />ID tiang: {selected.candidate.pole.sourceId}</p>
          <p>Total jarak geografis ke anggota: <b>{selected.candidate.totalDistanceMeters.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m</b></p>
        </> : <p>Kandidat FAT: <b>—</b></p>}
        <h4 className="font-semibold">Rumah yang direncanakan dilayani</h4>
        <ul className="max-h-44 space-y-2 overflow-y-auto">{selected.homes.map(home => <li key={home.id} className="break-all"><b>{home.name}</b> · ID {home.sourceId}{selected.candidate && <span className="block text-slate-500">Jarak geografis: {selected.candidate.connections.find(connection => connection.homeId === home.id)?.distanceMeters.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m</span>}</li>)}</ul>
      </div>}
    </ControlSection>}
  </section>
}
