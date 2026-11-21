"use client"

import { X } from "lucide-react"
import { DEFAULT_MARKER_SCALE } from "@/lib/map-appearance"

export default function MapAppearanceSettings({ scale, onChange, onClose }: { scale: number; onChange: (value: number) => void; onClose: () => void }) {
  return <section id="map-appearance-settings" aria-label="Pengaturan ukuran ikon peta"
    className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t bg-white px-4 py-2 text-[11px] text-slate-500"
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose() } }}>
    <label htmlFor="map-marker-scale">Ukuran ikon peta</label>
    <input autoFocus id="map-marker-scale" type="range" min="50" max="200" step="10" value={Math.round(scale * 100)}
      aria-valuetext={`${Math.round(scale * 100)} persen`} className="h-4 w-36 cursor-pointer accent-slate-500"
      onChange={event => onChange(Number(event.target.value) / 100)} />
    <output htmlFor="map-marker-scale" className="w-9 text-right tabular-nums">{Math.round(scale * 100)}%</output>
    <button type="button" className="rounded px-1 py-0.5 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2" onClick={() => onChange(DEFAULT_MARKER_SCALE)}>Reset</button>
    <button type="button" aria-label="Tutup pengaturan ukuran ikon" className="rounded p-1 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2" onClick={onClose}><X className="size-3.5" /></button>
  </section>
}
