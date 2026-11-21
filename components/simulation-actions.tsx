"use client"

import { Cable, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function SimulationActions({ disabled, dropDisabled, simulating, maxDropLengthMeters, stale, onSimulateFat, onSimulateDrop }: {
  disabled: boolean; dropDisabled: boolean; simulating: boolean; maxDropLengthMeters: number; stale: boolean
  onSimulateFat: () => void; onSimulateDrop: () => void
}) {
  return <section className="shrink-0 space-y-2 border-b bg-white p-3" aria-label="Aksi simulasi">
    <div className="mb-2 flex items-center justify-between text-[10px]"><span className="font-semibold uppercase tracking-wide text-slate-400">Simulasi</span><span className="text-slate-500">Batas drop {maxDropLengthMeters} m</span></div>
    <Button className="w-full" size="sm" disabled={disabled} onClick={onSimulateFat}><Sparkles data-icon="inline-start" />{simulating ? "Menghitung simulasi..." : "Simulasikan FAT"}</Button>
    <Button className="w-full" size="sm" variant="outline" disabled={dropDisabled} onClick={onSimulateDrop}><Cable data-icon="inline-start" />Simulasikan Kabel Drop</Button>
    {stale && <p role="status" className="rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-800">Batas berubah. Hasil sebelumnya perlu dihitung ulang.</p>}
  </section>
}
