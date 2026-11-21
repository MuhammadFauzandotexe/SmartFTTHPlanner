"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DROP_LAST_SPAN_METERS, parseDropLengthInput, type PlanningConfig } from "@/lib/planning-config"

export default function PlanningSettings({ config, disabled, onApply }: { config: PlanningConfig; disabled: boolean; onApply: (config: PlanningConfig) => void }) {
  const [draft, setDraft] = useState(String(config.maxDropLengthMeters))
  const [error, setError] = useState("")
  useEffect(() => { setDraft(String(config.maxDropLengthMeters)); setError("") }, [config.maxDropLengthMeters])
  return <form className="flex flex-col gap-2" onSubmit={event => {
    event.preventDefault()
    const value = parseDropLengthInput(draft)
    if (value === null) { setError("Masukkan angka positif dan valid."); return }
    setError("")
    onApply({ maxDropLengthMeters: value })
  }} noValidate>
    <label htmlFor="max-drop-length" className="text-xs font-medium">Maksimal Panjang Drop</label>
    <div className="flex items-center gap-2">
      <Input id="max-drop-length" type="number" inputMode="decimal" step="any" min="0" value={draft} disabled={disabled}
        aria-invalid={!!error} aria-describedby={error ? "max-drop-error" : "max-drop-help"} onChange={e => { setDraft(e.target.value); setError("") }} className="h-8 text-xs" />
      <span className="text-xs text-slate-500">m</span>
      <Button type="submit" size="sm" variant="outline" disabled={disabled} className="h-8 text-xs">Terapkan</Button>
    </div>
    {error && <p id="max-drop-error" role="alert" className="text-xs text-red-600">{error}</p>}
    <p id="max-drop-help" className="text-[11px] text-slate-500">Batas aktif {config.maxDropLengthMeters} m termasuk bentangan terakhir. Bentangan terakhir tetap maksimal {DROP_LAST_SPAN_METERS} m. FAT dan grouping tidak dipindahkan otomatis.</p>
  </form>
}
