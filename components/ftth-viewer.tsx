"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type L from "leaflet"
import { point, distance, length as geoLength, flattenEach, bbox } from "@turf/turf"
import { importSurveyFile, ImportSurveyError } from "@/lib/import-survey"
import { colors, toGeoJSON, type FeatureItem, type Category } from "@/lib/survey"
import { ApplicationLog } from "@/components/application-log"
import { useApplicationLog } from "@/hooks/use-application-log"
import { importResultLogs, planningResultLogs, type LogInput } from "@/lib/application-log"
import { ControlSection } from "@/components/control-section"
import { AllocationPanel } from "@/components/allocation-panel"
import { acceptProposal, allocationContext, inputRevision, emptyAllocations, lockedDesignIssues, preserveLockedDesigns, type AllocationState, type Proposal } from "@/lib/allocation-recommendations"
import { PlanningPanel } from "@/components/planning-panel"
import { planFtth, extractPlanningInputs, validateMaxDropLengthMeters, DEFAULT_MAX_DROP_LENGTH_METERS, validateFatPorts, DEFAULT_FAT_PORTS, MAX_FAT_PORTS, type FtthPlan } from "@/lib/ftth-planning"
import { LayerSettingsPanel } from "@/components/layer-settings"
import { useLayerSettings } from "@/hooks/use-layer-settings"
import { baseMaps } from "@/lib/layer-settings"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Upload, Maximize2, Download, Search, Network, Layers3, House, UtilityPole, Eye, EyeOff, Cable, ChevronLeft, ChevronRight, Crosshair, Ruler, X, Copy, SlidersHorizontal } from "lucide-react"

const MapView = dynamic(() => import("@/components/map-view"), { ssr: false })

function fitFeaturesOnMap(map: L.Map, features: FeatureItem[]) {
  if (!features.length) return
  const b = bbox({ type: "FeatureCollection", features: features.map(toGeoJSON) })
  map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [40, 40], maxZoom: 18 })
}

export default function FtthViewer() {
  const { entries: logs, addLogs } = useApplicationLog()
  const { settings, setSettings, ready: settingsReady, storageError } = useLayerSettings()
  const [layerSettingsOpen, setLayerSettingsOpen] = useState(false)
  const layerSettingsButton = useRef<HTMLButtonElement>(null)
  const [maxDropLengthMeters, setMaxDropLengthMeters] = useState(DEFAULT_MAX_DROP_LENGTH_METERS)
  const [fatPorts, setFatPorts] = useState(DEFAULT_FAT_PORTS)
  const [sections, setSections] = useState({ data: false, configuration: true, planning: true, layers: false, display: false })
  const [resultsOpen, setResultsOpen] = useState(false)
  const setSection = useCallback((key: keyof typeof sections, open: boolean) => setSections(previous => ({ ...previous, [key]: open })), [])
  const [features, setFeatures] = useState<FeatureItem[]>([])
  const [planning, setPlanning] = useState<{ source: FeatureItem[]; result: FtthPlan } | null>(null)
  const [allocations, setAllocations] = useState<AllocationState>(emptyAllocations)
  const [focusedProposal, setFocusedProposal] = useState<Proposal | null>(null)
  const plan = useMemo(() => {
    if (planning?.source === features) return planning.result
    if (!allocations.locks.length) return null
    const inputs = extractPlanningInputs(features)
    return preserveLockedDesigns({ fatPorts, maxDropLengthMeters, distanceMethod: "straight-line", groups: [], homeCount: inputs.homes.length, poleCount: inputs.poles.length, issues: inputs.issues, warnings: ["Hasil otomatis perlu dihitung ulang; desain engineer terkunci dipertahankan."], unservedHomes: inputs.homes.map(home => ({ home, reason: "Hasil otomatis perlu dihitung ulang." })) }, allocations.locks)
  }, [planning, features, allocations.locks, fatPorts, maxDropLengthMeters])
  const recommendationContext = useMemo(() => plan ? allocationContext(plan, features) : null, [plan, features])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null)
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null)
  const activeHighlight = hoveredGroupId || highlightedGroupId
  const [selected, setSelected] = useState<FeatureItem | null>(null)
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
  const [measureMode, setMeasureMode] = useState(false)
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([])
  const [bufferMeters, setBufferMeters] = useState("100")
  const [map, setMap] = useState<L.Map | null>(null)
  const [importing, setImporting] = useState(false)
  const [fitTarget, setFitTarget] = useState<FeatureItem[]>([])
  useEffect(() => {
    if (map && fitTarget.length) fitFeaturesOnMap(map, fitTarget)
  }, [map, fitTarget])
  const previousStorageError = useRef(false)
  useEffect(() => {
    if (storageError && !previousStorageError.current) addLogs([{
      level: "warning", source: "Preferensi", title: "Preferensi tidak dapat disimpan di browser", details: [
        { label: "Penanganan", value: "Pengaturan layer tetap berlaku selama sesi ini. localStorage tidak tersedia atau kapasitas penyimpanannya tidak mencukupi." },
      ],
    }])
    previousStorageError.current = storageError
  }, [storageError, addLogs])
  const fileRef = useRef<HTMLInputElement>(null)
  const visible = useMemo(() => features.filter(f => !query || `${f.name} ${f.id}`.toLowerCase().includes(query.toLowerCase())), [features, query])
  const importedFiles = useMemo(() => [...new Set(features.map(feature => feature.file))].map(name => ({ name, count: features.filter(feature => feature.file === name).length })), [features])
  const fileCount = useMemo(() => new Set(features.map(f => f.file)).size, [features])
  const displayed = useMemo(() => visible.filter(feature => settings.layers[feature.category].visible), [visible, settings.layers])
  const counts = useMemo(() => Object.fromEntries((Object.keys(colors) as Category[]).map(c => [c, features.filter(f => f.category === c).length])) as Record<Category, number>, [features])
  const importedLength = useMemo(() => {
    let meters = 0
    flattenEach({ type: "FeatureCollection", features: features.map(toGeoJSON) }, feature => {
      if (feature.geometry?.type === "LineString") meters += geoLength(feature, { units: "meters" })
    })
    return meters
  }, [features])
  const importFiles = useCallback(async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files)
    if (!selectedFiles.length) return
    setImporting(true)
    setPlanning(null)
    setResultsOpen(false)
    setSelectedGroupId(null)
    setHighlightedGroupId(null)
    setHoveredGroupId(null)
    addLogs([{ level: "info", source: "Impor", title: `Memulai impor ${selectedFiles.length} file survei`, details: [
      ...selectedFiles.map((file, index) => ({ label: `File ${index + 1}`, value: file.name })),
      { label: "Perencanaan", value: "Hasil perencanaan lama dibersihkan. Impor hanya memuat data; pengelompokan dan estimasi FAT menunggu perintah Anda setelah impor selesai." },
    ] }])
    const incoming: FeatureItem[] = []
    const messages: LogInput[] = []
    try {
      for (const file of selectedFiles) {
        try {
          const result = await importSurveyFile(file)
          incoming.push(...result.features)
          messages.push(...importResultLogs(file.name, result))
        } catch (error) {
          if (error instanceof ImportSurveyError) messages.push(...importResultLogs(file.name, error.result))
          messages.push({ level: "error", source: "Impor", title: `${file.name}: impor gagal`, details: [
            { label: "File", value: file.name }, { label: "Penyebab", value: error instanceof Error ? error.message : "Gagal mengimpor file." },
          ] })
        }
      }
      if (incoming.length) {
        setFeatures(previous => [...previous, ...incoming])
        setSelected(null)
        setQuery("")
        setFitTarget(incoming)
        messages.push({ level: "info", source: "Perencanaan", title: "Data survei siap — perencanaan belum dijalankan", details: [
          { label: "Fitur baru", value: String(incoming.length) },
          { label: "Tindakan", value: "Tekan tombol Mulai pengelompokan & estimasi FAT di panel kontrol untuk menjalankan pengelompokan rumah dan estimasi FAT secara manual." },
        ] })
      } else messages.push({ level: "error", source: "Impor", title: "Tidak ada fitur geografis valid yang dimuat", details: [
        { label: "Tindakan", value: "Periksa rincian log file, metadata dan geometri. Data survei yang sudah ada tidak dihapus." },
      ] })
      addLogs(messages)
    } finally { setImporting(false); if (fileRef.current) fileRef.current.value = "" }
  }, [addLogs])
  const exportGeoJSON = () => {
    try {
      const data = { type: "FeatureCollection", features: visible.map(toGeoJSON) }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/geo+json" }))
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "ftth-survey.geojson"
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      addLogs([{ level: "success", source: "Ekspor", title: "Unduhan GeoJSON dimulai", details: [
        { label: "File", value: "ftth-survey.geojson" }, { label: "Jumlah fitur", value: String(visible.length) },
      ] }])
    } catch (error) {
      addLogs([{ level: "error", source: "Ekspor", title: "Ekspor GeoJSON gagal", details: [{ label: "Penyebab", value: error instanceof Error ? error.message : "Unduhan tidak dapat disiapkan." }] }])
    }
  }
  const fitData = () => { if (map) fitFeaturesOnMap(map, features) }
  const changeFatPorts = useCallback((value: number) => {
    try {
      validateFatPorts(value)
      if (value === fatPorts) return
      setFatPorts(value)
      setPlanning(null)
      setResultsOpen(false)
      setSelectedGroupId(null)
      setHighlightedGroupId(null)
      setHoveredGroupId(null)
      addLogs([{ level: "info", source: "Planning Configuration", title: "Jumlah port FAT diperbarui", details: [
        { label: "Sebelumnya", value: `${fatPorts} port` }, { label: "Konfigurasi baru", value: `${value} port per FAT` },
        { label: "Pengelompokan", value: `Satu rumah menggunakan satu port; maksimal ${value} rumah per kelompok.` },
        { label: "Tindakan", value: "Hasil otomatis lama dibersihkan; desain engineer terkunci dipertahankan dan diperiksa terhadap konfigurasi baru. Jalankan pengelompokan & estimasi FAT secara manual." },
      ] }])
    } catch (error) {
      addLogs([{ level: "error", source: "Planning Configuration", title: "Jumlah port FAT tidak valid", details: [{ label: "Penyebab", value: error instanceof Error ? error.message : "Masukkan jumlah port yang valid." }] }])
    }
  }, [fatPorts, addLogs])
  const runPlanning = useCallback(() => {
    if (importing || !features.length) return
    try {
      const result = preserveLockedDesigns(planFtth(features, fatPorts, maxDropLengthMeters), allocations.locks)
      setPlanning({ source: features, result })
      setResultsOpen(true)
      setSection("planning", true)
      setSelectedGroupId(null)
      setHighlightedGroupId(null)
      setHoveredGroupId(null)
      setSelected(null)
      setQuery("")
      if (map) fitFeaturesOnMap(map, features)
      addLogs(planningResultLogs(result))
    } catch (error) {
      addLogs([{ level: "error", source: "Perencanaan", title: "Perencanaan awal gagal dijalankan", details: [{ label: "Penyebab", value: error instanceof Error ? error.message : "Perhitungan gagal." }] }])
    }
  }, [features, map, importing, addLogs, fatPorts, maxDropLengthMeters, setSection, allocations.locks])
  const selectPlanningGroup = useCallback((id: string) => {
    const group = plan?.groups.find(item => item.id === id)
    if (!group) return
    setSelectedGroupId(id)
    setResultsOpen(true)
    setSection("planning", true)
    setHighlightedGroupId(id)
    setHoveredGroupId(null)
    setSelected(null)
    setCollapsed(false)
    if (map) {
      const positions = [...group.homes, ...(group.candidate ? [group.candidate.pole] : [])]
      const bounds = bbox({ type: "FeatureCollection", features: positions.map(item => point(item.coordinates)) })
      requestAnimationFrame(() => {
        map.invalidateSize({ pan: false })
        map.fitBounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]], { padding: [40, 40], maxZoom: 18 })
      })
    }
  }, [plan, map, setSection])
  const selectSurveyObject = useCallback((feature: FeatureItem) => {
    setSelected(feature)
    setSelectedGroupId(null)
  }, [])
  const selectPlannedHome = useCallback((id: string) => {
    const home = features.find(feature => feature.id === id)
    if (home) selectSurveyObject(home)
  }, [features, selectSurveyObject])
  const highlightPlanningGroup = useCallback((id: string) => {
    if (plan?.groups.some(group => group.id === id)) {
      setSelectedGroupId(id)
      setResultsOpen(true)
      setSection("planning", true)
      setSelected(null)
      setCollapsed(false)
      setHoveredGroupId(null)
      setHighlightedGroupId(previous => previous === id ? null : id)
    }
  }, [plan, setSection])
  const hoverPlanningGroup = useCallback((id: string | null) => setHoveredGroupId(id), [])
  const focusProposal = useCallback((proposal: Proposal) => {
    setFocusedProposal(proposal)
    setCollapsed(false)
    if (map) {
      const positions = [proposal.target.pole, ...proposal.homes]
      const bounds = bbox({ type: "FeatureCollection", features: positions.map(item => point(item.coordinates)) })
      map.fitBounds([[bounds[1], bounds[0]], [bounds[3], bounds[2]]], { padding: [40, 40], maxZoom: 18 })
    }
  }, [map])
  const changeAllocations = (next: AllocationState) => {
    setAllocations(next)
    setFocusedProposal(previous => next.proposals.find(p => p.id === previous?.id && p.decision === "pending") || null)
  }
  const approveAllocation = (id: string) => {
    if (!recommendationContext) return
    const approved = acceptProposal(recommendationContext, allocations, id)
    setAllocations(approved.state)
    setPlanning({ source: features, result: approved.plan })
    setFocusedProposal(null)
    addLogs([{level:"success",source:"Rekomendasi",title:"Usulan disetujui sebagai desain terkunci",details:[{label:"Usulan",value:id},{label:"Verifikasi",value:approved.state.proposals.find(p=>p.id===id)?.verification?.note || "Pemeriksaan otomatis"}]}])
  }
  const nearestPole = selected?.category === "Rumah" && selected.kind === "Point" ? features.filter(f => f.category === "Tiang" && f.kind === "Point").map(f => ({ f, d: distance(point([selected.coords[1], selected.coords[0]]), point([f.coords[1], f.coords[0]]), { units: "meters" }) })).sort((a, b) => a.d - b.d)[0] : null
  const measureTotal = measurePoints.length > 1 ? measurePoints.slice(1).reduce((sum, p, i) => sum + distance(point([measurePoints[i][1], measurePoints[i][0]]), point([p[1], p[0]]), { units: "meters" }), 0) : 0

  return <div className="flex h-screen flex-col overflow-hidden bg-[#f7f9fb] text-slate-800">
    <header className="flex h-[68px] shrink-0 items-center justify-between border-b bg-white px-5">
      <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white"><Cable /></div><div><h1 className="text-[15px] font-bold tracking-tight">FTTH Survey Viewer</h1><p className="text-[11px] text-slate-400">Smart FTTH Planner</p></div></div>
      <div className="flex items-center gap-2"><input ref={fileRef} type="file" accept=".kml,.kmz" disabled={importing} multiple className="hidden" onChange={e => e.target.files && importFiles(e.target.files)} /><Button size="sm" disabled={importing} onClick={() => fileRef.current?.click()}><Upload data-icon="inline-start" /> {importing ? "Mengimpor..." : "Impor Data"}</Button><Button size="sm" variant="outline" disabled={!features.length} onClick={fitData}><Maximize2 data-icon="inline-start" /> Fit ke Data</Button><Button size="sm" variant="outline" disabled={!visible.length} onClick={exportGeoJSON}><Download data-icon="inline-start" /> Ekspor</Button></div>
    </header>
    <div className="flex min-h-0 flex-1">
      {!collapsed && <aside className="flex w-[294px] shrink-0 flex-col border-r bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3"><span className="text-xs font-semibold">Panel kontrol</span><Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} aria-label="Lipat sidebar"><ChevronLeft /></Button></div>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-3">
          <div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" /><Input className="pl-9 text-xs" placeholder="Cari nama atau ID..." value={query} onChange={event => setQuery(event.target.value)} /></div>
          <ControlSection title="Data Impor" icon={<Upload className="size-4" />} caption={`${fileCount} file`} open={sections.data} onOpenChange={open => setSection("data", open)}>
            <div className="flex gap-2"><Button size="sm" disabled={importing} onClick={() => fileRef.current?.click()}><Upload />{importing ? "Mengimpor..." : "Impor"}</Button><Button size="sm" variant="outline" disabled={!visible.length} onClick={exportGeoJSON}><Download />Ekspor</Button></div>
            <dl className="grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-400">File</dt><dd className="font-semibold">{fileCount}</dd></div><div><dt className="text-slate-400">Total fitur</dt><dd className="font-semibold">{features.length}</dd></div><div><dt className="text-slate-400">Panjang garis</dt><dd className="font-semibold">{features.length ? `${importedLength.toLocaleString("id-ID", { maximumFractionDigits: 1 })} m` : "—"}</dd></div><div><dt className="text-slate-400">Status</dt><dd className="font-semibold">{features.length ? "Data dimuat" : "Kosong"}</dd></div></dl>
            {importedFiles.length > 0 && <ul className="max-h-32 space-y-1 overflow-y-auto" aria-label="Daftar file impor">{importedFiles.map(file => <li key={file.name} className="flex min-w-0 items-center gap-2 rounded bg-slate-50 p-2 text-[11px]"><span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span><span className="shrink-0 text-slate-400">{file.count} fitur</span></li>)}</ul>}
          </ControlSection>
          <ControlSection title="Planning Configuration" icon={<SlidersHorizontal className="size-4" />} caption={`${fatPorts} port`} open={sections.configuration} onOpenChange={open => setSection("configuration", open)}>
            <label htmlFor="max-drop-length" className="block text-xs font-medium">Maksimum panjang drop (m)</label>
            <Input id="max-drop-length" type="number" min="0" step="any" value={maxDropLengthMeters} disabled={importing} onChange={event => {
              const value = Number(event.target.value)
              try { validateMaxDropLengthMeters(value) } catch { return }
              setMaxDropLengthMeters(value)
              setPlanning(null)
              setResultsOpen(false)
              setSelectedGroupId(null)
              setHighlightedGroupId(null)
              setHoveredGroupId(null)
            }} />
            <p className="text-[11px] text-slate-500">50 m adalah nilai awal demo yang dapat diubah, bukan standar teknis. Konfigurasi selama sesi; perubahan menghapus hasil otomatis. Desain engineer terkunci dipertahankan dengan masalah bila tidak sesuai. Hitung ulang manual.</p>
            <label htmlFor="fat-port-count" className="block text-xs font-medium">Jumlah port FAT</label>
            <select id="fat-port-count" value={fatPorts} disabled={importing} onChange={event => changeFatPorts(Number(event.target.value))} className="h-9 w-full rounded-lg border border-input bg-white px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
              {Array.from({ length: MAX_FAT_PORTS }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value} port{value === DEFAULT_FAT_PORTS ? " (default)" : ""}</option>)}
            </select>
          </ControlSection>
          <ControlSection title="Perencanaan FTTH" icon={<Network className="size-4" />} caption={plan ? `${plan.groups.length} kelompok` : "Manual"} open={sections.planning} onOpenChange={open => setSection("planning", open)}>
            <PlanningPanel plan={plan} selectedGroupId={selectedGroupId} highlightedGroupId={activeHighlight} onHighlightGroup={highlightPlanningGroup} onHoverGroup={hoverPlanningGroup} hasData={features.length > 0} importing={importing} onRun={runPlanning} onSelectGroup={selectPlanningGroup} resultsOpen={resultsOpen} onResultsOpenChange={setResultsOpen} />
            {recommendationContext && <AllocationPanel context={recommendationContext} state={allocations} onChange={changeAllocations} onAccept={approveAllocation} onFocus={focusProposal} issues={lockedDesignIssues(recommendationContext, allocations.locks)} />}
          </ControlSection>
          <ControlSection title="Layer & Kategori" icon={<Layers3 className="size-4" />} caption={`${Object.values(settings.layers).filter(layer => layer.visible).length}/${Object.keys(colors).length}`} open={sections.layers} onOpenChange={open => setSection("layers", open)}>
            {(Object.keys(colors) as Category[]).map(cat => <button key={cat} aria-label={`${settings.layers[cat].visible ? "Sembunyikan" : "Tampilkan"} kategori ${cat}`} title={`${settings.layers[cat].visible ? "Sembunyikan" : "Tampilkan"} kategori ${cat}`} aria-pressed={settings.layers[cat].visible} onClick={() => setSettings(previous => ({ ...previous, layers: { ...previous.layers, [cat]: { ...previous.layers[cat], visible: !previous.layers[cat].visible } } }))} className="flex w-full items-center justify-between rounded-md px-2 py-2 text-xs hover:bg-slate-50"><span className="flex items-center gap-2">{cat === "Rumah" ? <House className="size-4" style={{ color: settings.layers[cat].color, opacity: settings.layers[cat].visible ? 1 : 0.3 }} aria-hidden="true" /> : cat === "Tiang" ? <UtilityPole className="size-4" style={{ color: settings.layers[cat].color, opacity: settings.layers[cat].visible ? 1 : 0.3 }} aria-hidden="true" /> : <i className="size-2.5 rounded-full" style={{ backgroundColor: settings.layers[cat].color, opacity: settings.layers[cat].visible ? 1 : 0.3 }} />}{cat}</span><span className="flex items-center gap-3"><span className="text-slate-400">{counts[cat]}</span>{settings.layers[cat].visible ? <Eye className="size-4 text-emerald-600" aria-hidden="true" /> : <EyeOff className="size-4 text-slate-400" aria-hidden="true" />}</span></button>)}
          </ControlSection>
          <ControlSection title="Tampilan & Alat" icon={<SlidersHorizontal className="size-4" />} open={sections.display} onOpenChange={open => setSection("display", open)}>
            <Button size="sm" variant="outline" disabled={!settingsReady} onClick={() => setLayerSettingsOpen(true)}><Layers3 />Layer Settings</Button>
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} /> Label objek</label>
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={measureMode} onChange={event => setMeasureMode(event.target.checked)} /> Mode ukur jarak</label>
            <div className="flex gap-2"><Input aria-label="Radius buffer dalam meter" value={bufferMeters} onChange={event => setBufferMeters(event.target.value)} className="h-8 text-xs" /><Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => addLogs([{ level: "warning", source: "Peta", title: "Pembuatan buffer belum tersedia", details: [{ label: "Objek", value: selected?.name || "Belum dipilih" }, { label: "Radius masukan", value: `${bufferMeters} m` }, { label: "Status", value: "Kontrol ini masih placeholder; belum ada geometri buffer yang dibuat." }] }])}>Buffer (m)</Button></div>
          </ControlSection>
        </div>
      </aside>}
      <main className="relative min-w-0 flex-1"><MapView features={visible} onSelect={selectSurveyObject} showLabels={showLabels} onReady={setMap} settings={settings} plan={plan} provisional={focusedProposal && focusedProposal.decision === "pending" && recommendationContext && focusedProposal.revision === inputRevision(recommendationContext) ? focusedProposal : null} onSelectProposal={focusProposal} highlightedGroupId={activeHighlight} onSelectGroup={selectPlanningGroup} onSelectHome={selectPlannedHome} onHighlightGroup={highlightPlanningGroup} onHoverGroup={hoverPlanningGroup} />{!features.length && <div role="status" className="pointer-events-none absolute bottom-4 left-4 right-4 z-[500] rounded-lg border bg-white/95 p-4 text-center text-sm shadow-sm"><p className="font-semibold">Belum ada data survei</p><p className="mt-1 text-xs text-slate-500">Klik Impor Data untuk memuat file KML atau KMZ Anda.</p></div>}<div className="absolute left-4 top-4 z-[500] flex flex-col gap-1"><Button size="icon" variant="secondary" onClick={() => map?.zoomIn()} aria-label="Perbesar">+</Button><Button size="icon" variant="secondary" onClick={() => map?.zoomOut()} aria-label="Perkecil">−</Button></div>{collapsed && <Button className="absolute bottom-24 left-4 z-[500]" variant="secondary" size="icon" onClick={() => setCollapsed(false)} aria-label="Buka sidebar"><ChevronRight /></Button>}<div className="absolute right-2 top-4 z-[700] flex flex-wrap justify-end gap-2 sm:right-4"><Button ref={layerSettingsButton} size="sm" variant="secondary" disabled={!settingsReady} aria-expanded={layerSettingsOpen} aria-controls="layer-settings-panel" onClick={() => setLayerSettingsOpen(open => !open)}><Layers3 /> Layer Settings</Button><Button size="sm" variant="secondary" onClick={() => { setMeasureMode(true); addLogs([{ level: "warning", source: "Peta", title: "Mode ukur jarak belum lengkap", details: [{ label: "Status", value: "Pengumpulan titik klik peta belum tersambung. Belum ada hasil pengukuran yang dihitung." }] }]) }}><Ruler data-icon="inline-start" /> Ukur Jarak</Button><Button size="sm" variant="secondary" disabled={!features.length} onClick={fitData}><Crosshair data-icon="inline-start" /> Fit</Button></div>{layerSettingsOpen && <LayerSettingsPanel settings={settings} features={features} onChange={setSettings} onClose={() => { setLayerSettingsOpen(false); layerSettingsButton.current?.focus() }} />}{selected && (settings.layers[selected.category].visible || plan?.groups.some(group => group.homes.some(home => home.id === selected.id)) || plan?.unservedHomes.some(item => item.home.id === selected.id)) && <section aria-label="Informasi objek survei" className="absolute bottom-4 right-4 z-[500] max-h-[calc(100%-6rem)] w-[310px] overflow-y-auto rounded-xl border bg-white p-4 shadow-xl"><div className="flex items-start justify-between"><div><Badge style={{ backgroundColor: colors[selected.category], color: "white" }}>{selected.category}</Badge><h2 className="mt-2 text-sm font-bold">{selected.name}</h2><p className="mt-1 font-mono text-[10px] text-slate-400">ID: {selected.id}</p></div><Button variant="ghost" size="icon" onClick={() => setSelected(null)}><X /></Button></div><Separator className="my-3" /><div className="flex flex-col gap-2 text-xs"><div className="flex justify-between"><span className="text-slate-400">{selected.kind === "Point" ? "Latitude, Longitude" : "Titik awal (Lat, Lon)"}</span><span className="font-mono">{selected.coords[0].toFixed(6)}, {selected.coords[1].toFixed(6)} <button onClick={() => navigator.clipboard.writeText(`${selected.coords[0]}, ${selected.coords[1]}`)}><Copy className="inline size-3" /></button></span></div><div className="flex justify-between"><span className="text-slate-400">Sumber file</span><span>{selected.file}</span></div><div className="flex justify-between gap-2"><span className="text-slate-400">KML / Geometri</span><span className="break-all text-right">{selected.kmlFile} · {selected.kind}</span></div>{selected.props && Object.keys(selected.props).length > 0 && <details open className="mt-2 border-t pt-2"><summary className="cursor-pointer font-semibold">Atribut objek KMZ/KML</summary><dl className="mt-2 space-y-2">{Object.entries(selected.props).map(([key, value]) => <div key={key} className="rounded bg-slate-50 p-2"><dt className="break-all font-medium text-slate-500">{key}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></details>}{nearestPole && <div className="rounded-md bg-emerald-50 p-2 text-emerald-700">Tiang terdekat: <b>{nearestPole.f.name}</b><br />Jarak garis lurus: {nearestPole.d.toFixed(1)} m</div>}</div></section>}</main>
    </div><ApplicationLog entries={logs} /><footer className="flex h-7 shrink-0 items-center justify-between border-t bg-white px-4 text-[10px] text-slate-400"><span>Koordinat kursor: —</span><span>{displayed.length} fitur terlihat</span><span>{baseMaps[settings.baseMap].provider}</span></footer>
  </div>
}
