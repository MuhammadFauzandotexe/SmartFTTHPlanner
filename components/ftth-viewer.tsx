"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type L from "leaflet"
import { point, distance, length as geoLength, flattenEach, bbox } from "@turf/turf"
import { toast, Toaster } from "sonner"
import { importSurveyFile, ImportSurveyError, type ImportResult } from "@/lib/import-survey"
import { colors, toGeoJSON, type FeatureItem, type Category } from "@/lib/survey"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Upload, Maximize2, Download, Search, Layers3, House, Cable, ChevronLeft, ChevronRight, Crosshair, Ruler, X, Copy, Database, SlidersHorizontal } from "lucide-react"

const MapView = dynamic(() => import("@/components/map-view"), { ssr: false })

function fitFeaturesOnMap(map: L.Map, features: FeatureItem[]) {
  if (!features.length) return
  const b = bbox({ type: "FeatureCollection", features: features.map(toGeoJSON) })
  map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [40, 40], maxZoom: 18 })
}

export default function FtthViewer() {
  const [features, setFeatures] = useState<FeatureItem[]>([])
  const [selected, setSelected] = useState<FeatureItem | null>(null)
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
  const [measureMode, setMeasureMode] = useState(false)
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([])
  const [bufferMeters, setBufferMeters] = useState("100")
  const [map, setMap] = useState<L.Map | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMessages, setImportMessages] = useState<string[]>([])
  const [metadataWarnings, setMetadataWarnings] = useState<ImportResult["metadataWarnings"]>([])
  const [geometryWarnings, setGeometryWarnings] = useState<string[]>([])
  const [fitTarget, setFitTarget] = useState<FeatureItem[]>([])
  useEffect(() => {
    if (map && fitTarget.length) fitFeaturesOnMap(map, fitTarget)
  }, [map, fitTarget])
  const fileRef = useRef<HTMLInputElement>(null)
  const visible = useMemo(() => features.filter(f => !query || `${f.name} ${f.id}`.toLowerCase().includes(query.toLowerCase())), [features, query])
  const fileCount = useMemo(() => new Set(features.map(f => f.file)).size, [features])
  const counts = useMemo(() => Object.fromEntries((Object.keys(colors) as Category[]).map(c => [c, features.filter(f => f.category === c).length])) as Record<Category, number>, [features])
  const importedLength = useMemo(() => {
    let meters = 0
    flattenEach({ type: "FeatureCollection", features: features.map(toGeoJSON) }, feature => {
      if (feature.geometry?.type === "LineString") meters += geoLength(feature, { units: "meters" })
    })
    return meters
  }, [features])
  const importFiles = useCallback(async (files: FileList | File[]) => {
    setImporting(true)
    setImportMessages([])
    setMetadataWarnings([])
    setGeometryWarnings([])
    const incoming: FeatureItem[] = []
    const messages: string[] = []
    const metadata: ImportResult["metadataWarnings"] = []
    const geometry: string[] = []
    const collectWarnings = (fileName: string, result: ImportResult) => {
      metadata.push(...result.metadataWarnings.map(warning => ({ ...warning, kmlFile: `${fileName} / ${warning.kmlFile}` })))
      geometry.push(...result.geometryWarnings.map(warning => `${fileName} / ${warning}`))
    }
    try {
      for (const file of Array.from(files)) {
        try {
          const result = await importSurveyFile(file)
          incoming.push(...result.features)
          collectWarnings(file.name, result)
          messages.push(`${file.name}: ${result.features.length} fitur dimuat.`, ...result.warnings.map(w => `${file.name} / ${w}`))
        } catch (error) {
          if (error instanceof ImportSurveyError) collectWarnings(file.name, error.result)
          messages.push(`${file.name}: ${error instanceof Error ? error.message : "Gagal mengimpor file."}`)
        }
      }
      if (incoming.length) {
        setFeatures(previous => [...previous, ...incoming])
        setSelected(null)
        setQuery("")
        setFitTarget(incoming)
        toast.success(`${incoming.length} fitur berhasil diimpor`)
      } else toast.error("Tidak ada fitur geografis yang dapat dimuat")
      setImportMessages(messages)
      setMetadataWarnings(metadata)
      setGeometryWarnings(geometry)
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }, [])
  const exportGeoJSON = () => {
    const data = { type: "FeatureCollection", features: visible.map(toGeoJSON) }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/geo+json" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "ftth-survey.geojson"
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success("GeoJSON berhasil diekspor")
  }
  const fitData = () => { if (map) fitFeaturesOnMap(map, features) }
  const nearestPole = selected?.category === "Rumah" && selected.kind === "Point" ? features.filter(f => f.category === "Tiang" && f.kind === "Point").map(f => ({ f, d: distance(point([selected.coords[1], selected.coords[0]]), point([f.coords[1], f.coords[0]]), { units: "meters" }) })).sort((a, b) => a.d - b.d)[0] : null
  const measureTotal = measurePoints.length > 1 ? measurePoints.slice(1).reduce((sum, p, i) => sum + distance(point([measurePoints[i][1], measurePoints[i][0]]), point([p[1], p[0]]), { units: "meters" }), 0) : 0

  return <div className="flex h-screen flex-col overflow-hidden bg-[#f7f9fb] text-slate-800">
    <Toaster richColors position="top-right" />
    <header className="flex h-[68px] shrink-0 items-center justify-between border-b bg-white px-5">
      <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white"><Cable /></div><div><h1 className="text-[15px] font-bold tracking-tight">FTTH Survey Viewer</h1><p className="text-[11px] text-slate-400">Smart FTTH Planner</p></div></div>
      <div className="flex items-center gap-2"><input ref={fileRef} type="file" accept=".kml,.kmz" disabled={importing} multiple className="hidden" onChange={e => e.target.files && importFiles(e.target.files)} /><Button size="sm" disabled={importing} onClick={() => fileRef.current?.click()}><Upload data-icon="inline-start" /> {importing ? "Mengimpor..." : "Impor Data"}</Button><Button size="sm" variant="outline" disabled={!features.length} onClick={fitData}><Maximize2 data-icon="inline-start" /> Fit ke Data</Button><Button size="sm" variant="outline" disabled={!visible.length} onClick={exportGeoJSON}><Download data-icon="inline-start" /> Ekspor</Button></div>
    </header>
    <div className="flex min-h-0 flex-1">
      {!collapsed && <aside className="flex w-[294px] shrink-0 flex-col border-r bg-white"><div className="flex items-center justify-between border-b px-4 py-3"><span className="text-xs font-semibold">Panel kontrol</span><Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} aria-label="Lipat sidebar"><ChevronLeft /></Button></div><div className="flex flex-col gap-4 overflow-auto p-4"><div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" /><Input className="pl-9 text-xs" placeholder="Cari nama atau ID..." value={query} onChange={e => setQuery(e.target.value)} /></div><div className="rounded-lg border bg-slate-50 p-3"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold">Ringkasan survei</span><Badge variant="secondary" className="text-[10px]">{features.length ? "Data impor" : "Kosong"}</Badge></div><div className="grid grid-cols-2 gap-2 text-xs"><div><p className="text-slate-400">File</p><b>{fileCount} file</b></div><div><p className="text-slate-400">Total fitur</p><b>{features.length}</b></div><div><p className="text-slate-400">Panjang garis impor</p><b>{features.length ? `${importedLength.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m` : "—"}</b></div><div><p className="text-slate-400">Status</p><b>{features.length ? "Data dimuat" : "Belum ada data"}</b></div></div></div><Separator />{importMessages.length > 0 && <div role="status" aria-live="polite" className="max-h-44 overflow-auto rounded-lg border bg-slate-50 p-3 text-xs"><p className="mb-2 font-semibold">Hasil impor</p><ul className="space-y-2">{importMessages.map((message, index) => <li key={index}>{message}</li>)}</ul></div>}{metadataWarnings.length > 0 && <section aria-label="Peringatan metadata" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs"><p className="mb-2 font-semibold">Peringatan metadata</p><p className="mb-2">Atribut dipertahankan. Schema yang tidak ditemukan tidak menghalangi impor geometri valid.</p>{metadataWarnings.map((warning, index) => <details key={index} className="mb-2"><summary className="cursor-pointer break-all">{warning.kmlFile}: schema {warning.schemaUrl || "(schemaUrl kosong)"} tidak ditemukan · {warning.features.length} fitur</summary><ul className="mt-2 max-h-44 space-y-1 overflow-auto">{warning.features.map((feature, featureIndex) => <li key={featureIndex} className="break-all">{feature.name} · ID: {feature.id}</li>)}</ul></details>)}</section>}{geometryWarnings.length > 0 && <section aria-label="Masalah geometri" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs"><p className="mb-2 font-semibold">Masalah geometri</p><ul className="space-y-2">{geometryWarnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></section>}<div><div className="mb-2 flex items-center gap-2 text-xs font-semibold"><Layers3 /> Layer & kategori</div>{(Object.keys(colors) as Category[]).map(cat => <button key={cat} onClick={() => setFeatures(fs => fs.map(f => f.category === cat ? f : f))} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-xs hover:bg-slate-50"><span className="flex items-center gap-2">{cat === "Rumah" ? <House className="size-4 text-blue-600" aria-hidden="true" /> : <i className="size-2.5 rounded-full" style={{ backgroundColor: colors[cat] }} />}{cat}</span><span className="text-slate-400">{counts[cat]}</span></button>)}</div><Separator /><div className="flex flex-col gap-2"><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-2"><SlidersHorizontal /> Tampilan</span><label className="flex items-center gap-2 text-slate-500"><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} /> Label</label></div><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={measureMode} onChange={e => setMeasureMode(e.target.checked)} /> Mode ukur jarak</label><div className="flex gap-2"><Input value={bufferMeters} onChange={e => setBufferMeters(e.target.value)} className="h-8 text-xs" /><Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => selected && toast.success(`Buffer ${bufferMeters} m dibuat di sekitar ${selected.name}`)}>Buffer (m)</Button></div></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800"><Database className="mb-1 size-4" />Data tersimpan selama sesi. Impor ulang diperlukan setelah halaman dimuat ulang.</div></div></aside>}
      <main className="relative min-w-0 flex-1"><MapView features={visible} onSelect={setSelected} showLabels={showLabels} onReady={setMap} />{!features.length && <div role="status" className="pointer-events-none absolute bottom-4 left-4 right-4 z-[500] rounded-lg border bg-white/95 p-4 text-center text-sm shadow-sm"><p className="font-semibold">Belum ada data survei</p><p className="mt-1 text-xs text-slate-500">Klik Impor Data untuk memuat file KML atau KMZ Anda.</p></div>}<div className="absolute left-4 top-4 z-[500] flex flex-col gap-1"><Button size="icon" variant="secondary" onClick={() => map?.zoomIn()} aria-label="Perbesar">+</Button><Button size="icon" variant="secondary" onClick={() => map?.zoomOut()} aria-label="Perkecil">−</Button></div>{collapsed && <Button className="absolute left-4 top-4 z-[500]" variant="secondary" size="icon" onClick={() => setCollapsed(false)} aria-label="Buka sidebar"><ChevronRight /></Button>}<div className="absolute right-4 top-4 z-[500] flex gap-2"><Button size="sm" variant="secondary" onClick={() => { setMeasureMode(true); toast.info("Klik beberapa titik pada peta untuk mengukur") }}><Ruler data-icon="inline-start" /> Ukur Jarak</Button><Button size="sm" variant="secondary" disabled={!features.length} onClick={fitData}><Crosshair data-icon="inline-start" /> Fit</Button></div>{selected && <section className="absolute bottom-4 right-4 z-[500] w-[310px] rounded-xl border bg-white p-4 shadow-xl"><div className="flex items-start justify-between"><div><Badge style={{ backgroundColor: colors[selected.category], color: "white" }}>{selected.category}</Badge><h2 className="mt-2 text-sm font-bold">{selected.name}</h2><p className="mt-1 font-mono text-[10px] text-slate-400">ID: {selected.id}</p></div><Button variant="ghost" size="icon" onClick={() => setSelected(null)}><X /></Button></div><Separator className="my-3" /><div className="flex flex-col gap-2 text-xs"><div className="flex justify-between"><span className="text-slate-400">{selected.kind === "Point" ? "Latitude, Longitude" : "Titik awal (Lat, Lon)"}</span><span className="font-mono">{selected.coords[0].toFixed(6)}, {selected.coords[1].toFixed(6)} <button onClick={() => navigator.clipboard.writeText(`${selected.coords[0]}, ${selected.coords[1]}`)}><Copy className="inline size-3" /></button></span></div><div className="flex justify-between"><span className="text-slate-400">Sumber file</span><span>{selected.file}</span></div><div className="flex justify-between gap-2"><span className="text-slate-400">KML / Geometri</span><span className="break-all text-right">{selected.kmlFile} · {selected.kind}</span></div>{nearestPole && <div className="rounded-md bg-emerald-50 p-2 text-emerald-700">Tiang terdekat: <b>{nearestPole.f.name}</b><br />Jarak garis lurus: {nearestPole.d.toFixed(1)} m</div>}</div></section>}</main>
    </div><footer className="flex h-7 shrink-0 items-center justify-between border-t bg-white px-4 text-[10px] text-slate-400"><span>Koordinat kursor: —</span><span>{visible.length} fitur terlihat</span><span>OpenStreetMap · © kontributor</span></footer>
  </div>
}
