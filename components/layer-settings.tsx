"use client"

import { useEffect, useRef } from "react"
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { baseMaps, defaultLayerSettings, geometryKinds, moveLayer, type LayerSettings, type LayerStyle } from "@/lib/layer-settings"
import type { Category, FeatureItem } from "@/lib/survey"

type Props = {
  settings: LayerSettings
  features: FeatureItem[]
  onChange: (settings: LayerSettings) => void
  onClose: () => void
}
export function LayerSettingsPanel({ settings, features, onChange, onClose }: Props) {
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeButton.current?.focus() }, [])
  const update = (category: Category, patch: Partial<LayerStyle>) => onChange({ ...settings, layers: { ...settings.layers, [category]: { ...settings.layers[category], ...patch } } })
  return <section id="layer-settings-panel" aria-label="Layer Settings" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); onClose() } }} className="fixed right-2 top-[132px] bottom-10 z-[700] flex w-[calc(100vw-1rem)] max-w-[350px] flex-col overflow-hidden rounded-xl border bg-white text-slate-800 shadow-xl sm:absolute sm:right-4 sm:top-16 sm:w-[calc(100%-1rem)]">
    <div className="flex shrink-0 items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold">Layer Settings</h2><p className="text-[11px] text-slate-500">Tampilan peta dan urutan layer</p></div><Button ref={closeButton} size="icon-sm" variant="ghost" onClick={onClose} aria-label="Tutup Layer Settings"><X /></Button></div>
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      <fieldset className="space-y-2"><legend className="mb-2 text-xs font-semibold">Base map</legend>{(["street", "satellite"] as const).map(key => <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs"><input type="radio" name="base-map" value={key} checked={settings.baseMap === key} onChange={() => onChange({ ...settings, baseMap: key })} /><span>{baseMaps[key].name}<small className="block text-slate-500">{baseMaps[key].provider}</small></span></label>)}<a className="text-[11px] text-blue-600 underline" href={baseMaps[settings.baseMap].terms} target="_blank" rel="noreferrer">Ketentuan penyedia peta</a></fieldset>
      <h3 className="text-xs font-semibold">Layer survei</h3>
      {settings.order.map((category, index) => {
        const style = settings.layers[category]
        const items = features.filter(feature => feature.category === category)
        const kinds = new Set(items.flatMap(feature => [...geometryKinds(feature.geometry)]))
        if (!items.length) kinds.add(category === "Jalur kabel" ? "line" : "point")
        return <fieldset key={category} className="space-y-3 rounded-lg border p-3"><legend className="sr-only">{category}</legend>
          <div className="flex items-center gap-2"><div className="flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold"><Button size="icon-sm" variant="ghost" aria-pressed={style.visible} aria-label={`${style.visible ? "Sembunyikan" : "Tampilkan"} kategori ${category}`} title={`${style.visible ? "Sembunyikan" : "Tampilkan"} kategori ${category}`} onClick={() => update(category, { visible: !style.visible })}>{style.visible ? <Eye className="text-emerald-600" aria-hidden="true" /> : <EyeOff className="text-slate-400" aria-hidden="true" />}</Button><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: style.color }} /><span>{category} <small className="font-normal text-slate-400">({items.length})</small></span></div><Button size="icon-xs" variant="ghost" disabled={index === 0} onClick={() => onChange({ ...settings, order: moveLayer(settings.order, category, -1) })} aria-label={`Naikkan layer ${category}`}><ArrowUp /></Button><Button size="icon-xs" variant="ghost" disabled={index === settings.order.length - 1} onClick={() => onChange({ ...settings, order: moveLayer(settings.order, category, 1) })} aria-label={`Turunkan layer ${category}`}><ArrowDown /></Button></div>
          <label className="flex items-center justify-between text-xs">Warna {category}<input aria-label={`Warna ${category}`} type="color" value={style.color} onChange={event => update(category, { color: event.target.value })} className="h-7 w-10 cursor-pointer rounded border" /></label>
          {kinds.has("point") && <label className="block text-xs">Ukuran marker {category}: {style.markerSize} px<input aria-label={`Ukuran marker ${category}`} className="mt-2 block w-full accent-emerald-600" type="range" min="8" max="40" step="1" value={style.markerSize} onChange={event => update(category, { markerSize: Number(event.target.value) })} /></label>}
          {(kinds.has("line") || kinds.has("polygon")) && <label className="block text-xs">Ketebalan garis {category}: {style.lineWidth} px<input aria-label={`Ketebalan garis ${category}`} className="mt-2 block w-full accent-emerald-600" type="range" min="1" max="10" step="1" value={style.lineWidth} onChange={event => update(category, { lineWidth: Number(event.target.value) })} /></label>}
          {kinds.has("polygon") && <label className="block text-xs">Transparansi poligon {category}: {Math.round((1 - style.fillOpacity) * 100)}%<input aria-label={`Transparansi poligon ${category}`} className="mt-2 block w-full accent-emerald-600" type="range" min="0" max="100" step="1" value={Math.round((1 - style.fillOpacity) * 100)} onChange={event => update(category, { fillOpacity: 1 - Number(event.target.value) / 100 })} /></label>}
        </fieldset>
      })}
      <Button size="sm" variant="outline" onClick={() => onChange(defaultLayerSettings())}><RotateCcw /> Kembalikan pengaturan awal</Button>
    </div>
  </section>
}
