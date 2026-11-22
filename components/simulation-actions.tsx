"use client"

import type { ReactNode } from "react"
import { Cable, LoaderCircle, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SimulationActions({ disabled, dropDisabled, simulating, dropLoading, maxDropLengthMeters, stale, reason, onSimulateFat, onSimulateDrop, children }: {
  disabled: boolean; dropDisabled: boolean; simulating: boolean; dropLoading: boolean; maxDropLengthMeters: number; stale: boolean; reason?: string
  onSimulateFat: () => void; onSimulateDrop: () => void; children: ReactNode
}) {
  return <section className="shrink-0 border-b bg-white px-4 py-2" aria-label="Aksi Perencanaan" aria-busy={simulating || dropLoading}>
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      <h2 className="text-xs font-semibold text-slate-700">Aksi Perencanaan</h2>
      <div role="group" aria-label="Layanan FAT" className="flex min-w-0 flex-wrap items-center justify-center gap-2">
        <span className="text-[11px] font-medium text-slate-600">1 · Layanan FAT</span>
        <Button className="h-9" disabled={disabled} aria-describedby={reason ? "planning-reason" : undefined} onClick={onSimulateFat}>{simulating ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{simulating ? "Menghitung FAT…" : "Simulasikan FAT"}</Button>
        <Button className="h-9" variant="outline" disabled={dropDisabled} aria-describedby={reason ? "planning-reason" : undefined} onClick={onSimulateDrop}>{dropLoading ? <LoaderCircle className="animate-spin" /> : <Cable />}{dropLoading ? "Menghitung Drop…" : "Simulasikan Kabel Drop"}</Button>
      </div>
      <div role="group" aria-label="Sumber Distribusi" className="flex min-w-0 flex-wrap items-center justify-center gap-2 border-l border-slate-200 pl-4">
        <span className="text-[11px] font-medium text-slate-600">2 · Sumber Distribusi</span>{children}
      </div>
    </div>
    <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
      <span>Batas drop {maxDropLengthMeters} m</span>
      {reason && <p id="planning-reason" role="status">{reason}</p>}
      {stale && <p role="status" className="font-medium text-amber-800">Hasil perlu dihitung ulang untuk batas aktif.</p>}
    </div>
  </section>
}
