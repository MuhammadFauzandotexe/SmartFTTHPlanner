"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type L from "leaflet"
import { point, distance, length, bbox } from "@turf/turf"
import { toast, Toaster } from "sonner"
import { importSurveyFile, type Category, type FeatureItem } from "@/lib/import-survey"
import { findFatCandidates, type FatCandidate } from "@/lib/fat-candidates"
import { simulateFatPlacement, validateFatAssignments, type FatSimulation } from "@/lib/fat-simulation"
import { currentDropPlan, planDropRoutes, type DropPlanResult, type DropRoute } from "@/lib/drop-plan"
import DropPlanPanel from "@/components/drop-plan-panel"
import { DEFAULT_PLANNING_CONFIG, isValidDropLength, loadPlanningConfig, savePlanningConfig, type PlanningConfig } from "@/lib/planning-config"
import { DEFAULT_MARKER_SCALE, isMarkerScale, loadMarkerScale, saveMarkerScale } from "@/lib/map-appearance"
import MapAppearanceSettings from "@/components/map-appearance-settings"
import PlanningSettings from "@/components/planning-settings"
import { buildSimulationReview } from "@/lib/simulation-review"
import MapLegend from "@/components/map-legend"
import ControlPanelGroup from "@/components/control-panel-group"
import SimulationActions from "@/components/simulation-actions"
import FatCandidatesPanel from "@/components/fat-candidates-panel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Upload, Maximize2, Download, Search, Layers3, Cable, ChevronLeft, ChevronRight, Crosshair, Ruler, X, Copy, FileUp, Settings2, FolderOpen, ListChecks } from "lucide-react"

const MapView = dynamic(() => import("@/components/map-view"), { ssr: false })

const colors: Record<Category, string> = { Tiang: "#20a36a", Rumah: "#3b82f6", FAT: "#f59e0b", FDT: "#8b5cf6", "Jalur kabel": "#ef5b5b", "Belum dikategorikan": "#94a3b8" }
export default function FtthViewer() {
  const [markerScale, setMarkerScale] = useState(DEFAULT_MARKER_SCALE)
  const [showIconSettings, setShowIconSettings] = useState(false)
  const iconSettingsButtonRef = useRef<HTMLButtonElement>(null)
  const [config, setConfig] = useState<PlanningConfig>({ ...DEFAULT_PLANNING_CONFIG })
  const [configReady, setConfigReady] = useState(false)
  useEffect(() => {
    try { setConfig(loadPlanningConfig(window.localStorage)); setMarkerScale(loadMarkerScale(window.localStorage)) }
    catch { toast.error("Pengaturan tersimpan tidak dapat dibaca; default digunakan untuk sesi ini") }
    setConfigReady(true)
  }, [])
  const changeMarkerScale = (scale: number) => {
    if (!isMarkerScale(scale)) return
    setMarkerScale(scale)
    try { saveMarkerScale(window.localStorage, scale) }
    catch { toast.error("Ukuran ikon hanya tersimpan untuk sesi ini", { id: "map-appearance-storage" }) }
  }
  const closeIconSettings = () => {
    setShowIconSettings(false)
    iconSettingsButtonRef.current?.focus()
  }
  const applyConfig = (next: PlanningConfig) => {
    if (!isValidDropLength(next.maxDropLengthMeters)) { toast.error("Masukkan batas drop yang positif dan valid"); return }
    try { savePlanningConfig(window.localStorage, next) }
    catch { toast.error("Pengaturan hanya berlaku untuk sesi ini karena penyimpanan browser tidak tersedia") }
    setConfig(next)
    setSelectedDropId(null)
    if (next.maxDropLengthMeters !== config.maxDropLengthMeters) toast.info("Batas drop diperbarui. Hasil lama divalidasi ulang; FAT dan grouping tetap. Hitung ulang simulasi untuk usulan baru.")
  }
  const [features, setFeatures] = useState<FeatureItem[]>([])
  const [importing, setImporting] = useState(false)
  const [candidateResult, setCandidateResult] = useState<{ source: FeatureItem[]; candidates: FatCandidate[]; simulation: FatSimulation | null; candidateLimit: number; simulationLimit: number | null } | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [showOtherCandidates, setShowOtherCandidates] = useState(false)
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  const candidates = candidateResult?.source === features ? candidateResult.candidates : null
  const simulation = candidateResult?.source === features ? candidateResult.simulation : null
  const [dropResult, setDropResult] = useState<DropPlanResult | null>(null)
  const [showDropRoutes, setShowDropRoutes] = useState(true)
  const [showDropLabels, setShowDropLabels] = useState(true)
  const [selectedDropId, setSelectedDropId] = useState<string | null>(null)
  const dropPlan = useMemo(() => currentDropPlan(dropResult, simulation, features, config), [dropResult, simulation, features, config])
  const review = useMemo(() => simulation ? buildSimulationReview(simulation, dropPlan, config) : null, [simulation, dropPlan, config])
  const fatStale = !!simulation && candidateResult?.simulationLimit !== config.maxDropLengthMeters
  const candidatesStale = !!candidates && candidateResult?.candidateLimit !== config.maxDropLengthMeters
  const dropStale = !!dropPlan && dropResult?.plan.maxDropLengthMeters !== config.maxDropLengthMeters
  const outOfRangeHouses = useMemo(() => simulation ? validateFatAssignments(simulation, config) : [], [simulation, config])
  const selectedDrop = dropPlan?.routes.find(route => route.id === selectedDropId) ?? null
  const selectedCandidate = candidates?.find(candidate => candidate.id === selectedCandidateId) ?? null
  const selectedBox = simulation?.boxes.find(box => box.candidate.id === selectedCandidateId) ?? null
  const importedFiles = new Set(features.map(feature => feature.file)).size
  const importingRef = useRef(false)
  const [selected, setSelected] = useState<FeatureItem | null>(null)
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState(false)
  const [openGroup, setOpenGroup] = useState<"review" | "files" | "components" | "config" | "tools" | null>("files")
  const [reviewTab, setReviewTab] = useState<"fat" | "drop">("fat")
  const panelScrollRef = useRef<HTMLDivElement>(null)
  const togglePanelGroup = (group: NonNullable<typeof openGroup>) => {
    setOpenGroup(current => current === group ? null : group)
    panelScrollRef.current?.scrollTo({ top: 0 })
  }
  const showReview = (tab: "fat" | "drop") => {
    setOpenGroup("review")
    setReviewTab(tab)
    setCollapsed(false)
    panelScrollRef.current?.scrollTo({ top: 0 })
  }
  const [showLabels, setShowLabels] = useState(false)
  const [measureMode, setMeasureMode] = useState(false)
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([])
  const [bufferMeters, setBufferMeters] = useState("100")
  const [map, setMap] = useState<L.Map | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const visible = useMemo(() => features.filter(f => !query || `${f.name} ${f.id}`.toLowerCase().includes(query.toLowerCase())), [features, query])
  const counts = useMemo(() => Object.fromEntries((Object.keys(colors) as Category[]).map(c => [c, features.filter(f => f.category === c).length])) as Record<Category, number>, [features])
  const importFiles = useCallback(async (files: FileList | File[]) => {
    if (importingRef.current) return
    importingRef.current = true
    setImporting(true)
    const incoming: FeatureItem[] = []
    try {
      for (const file of Array.from(files)) {
        try {
          const parsed = await importSurveyFile(file)
          if (!parsed.length) throw new Error("Tidak ada fitur geografis yang dapat dimuat")
          incoming.push(...parsed)
        } catch (error) {
          toast.error(`${file.name}: ${error instanceof Error ? error.message : "Gagal membaca file"}`)
        }
      }
      if (incoming.length) {
        const replacedFiles = new Set(incoming.map(feature => feature.file))
        if (features.some(feature => replacedFiles.has(feature.file))) {
          toast.info("Impor ulang mengganti data file dengan nama yang sama. Usulan simulasi sebelumnya dibersihkan.")
        }
        setFeatures(prev => [...prev.filter(feature => !replacedFiles.has(feature.file)), ...incoming])
        setDropResult(null)
        setSelectedDropId(null)
        setOpenGroup("files")
        setReviewTab("fat")
        setCandidateResult(null)
        setSelectedCandidateId(null)
        setShowOtherCandidates(false)
        setSelected(null)
        setQuery("")
        toast.success(`${incoming.length} fitur berhasil diimpor`)
      }
    } finally {
      setImporting(false)
      importingRef.current = false
      if (fileRef.current) fileRef.current.value = ""
    }
  }, [features])
  const selectCandidate = (candidate: FatCandidate) => {
    showReview("fat")
    setSelectedDropId(null)
    setSelectedCandidateId(candidate.id)
    setSelected(null)
    setCollapsed(false)
    const box = simulation?.boxes.find(box => box.candidate.id === candidate.id)
    const points = [candidate.pole, ...(box?.houses ?? candidate.houses).map(item => item.house)]
    map?.fitBounds(points.map(feature => feature.coords), { padding: [40, 40], maxZoom: 18 })
  }
  const runSimulation = async () => {
    if (simulating || importing) return
    setSimulating(true)
    try {
      // Allow the progress label to paint before running the bounded, deterministic calculation.
      await new Promise(resolve => setTimeout(resolve, 0))
      const result = findFatCandidates(features, config)
      const proposal = simulateFatPlacement(result, features, { config })
      setDropResult(null)
      setSelectedDropId(null)
      setCandidateResult({ source: features, candidates: result, simulation: proposal, candidateLimit: config.maxDropLengthMeters, simulationLimit: config.maxDropLengthMeters })
      setSelectedCandidateId(null)
      setSelected(null)
      setShowOtherCandidates(false)
      showReview("fat")
      toast.success(`${proposal.boxes.length} FAT sementara · ${proposal.servedCount} rumah terlayani`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Simulasi gagal dihitung")
    } finally {
      setSimulating(false)
    }
  }
  const simulateDrops = () => {
    if (!simulation) return
    try {
      const plan = planDropRoutes(simulation, features, config)
      setDropResult({ features, simulation, plan })
      setSelectedDropId(null)
      setShowDropRoutes(true)
      showReview("drop")
      toast.success(`${plan.routes.length} rencana drop · ${plan.problemCount} rumah bermasalah`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghitung rencana drop")
    }
  }
  const selectDropRoute = (route: DropRoute) => {
    showReview("drop")
    setShowDropRoutes(true)
    setSelectedDropId(route.id)
    setSelectedCandidateId(route.fatId)
    setSelected(null)
    setCollapsed(false)
    const coordinates = route.coordinates ?? [[route.fat.coords[1], route.fat.coords[0]], [route.house.coords[1], route.house.coords[0]]]
    map?.fitBounds(coordinates.map(p => [p[1], p[0]] as [number, number]), { padding: [40, 40], maxZoom: 19 })
  }
  const selectFeature = (feature: FeatureItem) => {
    setSelected(feature)
    setSelectedDropId(null)
    const owner = simulation?.boxes.find(box => box.houses.some(h => h.house.id === feature.id))
    setSelectedCandidateId(owner?.candidate.id ?? null)
    if (owner) showReview("fat")
  }
  const reviewAllGroups = () => {
    setSelectedCandidateId(null)
    setSelectedDropId(null)
    setSelected(null)
    setQuery("")
    fitData()
  }
  const filterSurvey = (value: string) => {
    setQuery(value)
    setSelectedCandidateId(null)
    setSelectedDropId(null)
    setSelected(null)
  }
  const toggleOtherCandidates = (show: boolean) => {
    setShowOtherCandidates(show)
    if (!show && !selectedBox) setSelectedCandidateId(null)
  }
  const mapFeatures = useMemo(() => {
    if (!selectedCandidate) return visible
    const highlighted = [selectedCandidate.pole, ...(selectedBox?.houses ?? selectedCandidate.houses).map(item => item.house)]
    return Array.from(new Map([...visible, ...highlighted].map(feature => [feature.id, feature])).values())
  }, [visible, selectedCandidate, selectedBox])
  const importedLineLength = useMemo(() => features.reduce((total, feature) =>
    total + (feature.geometry.type === "LineString" ? length({ type: "Feature", properties: {}, geometry: feature.geometry }, { units: "kilometers" }) : 0), 0), [features])
  const exportGeoJSON = () => { const data = { type: "FeatureCollection", features: visible.map(f => ({ type: "Feature", geometry: f.geometry, properties: { id: f.id, name: f.name, category: f.category, source: f.file } })) }; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = "ftth-survey.geojson"; a.click(); URL.revokeObjectURL(a.href); toast.success("GeoJSON berhasil diekspor") }
  const fitData = () => { if (!map || !features.length) return; const b = bbox({ type: "FeatureCollection", features: features.map(f => ({ type: "Feature" as const, properties: {}, geometry: f.geometry })) }); map.fitBounds([[b[1], b[0]], [b[3], b[2]]], { padding: [40, 40], maxZoom: 18 }) }
  const nearestPole = selected?.category === "Rumah" ? features.filter(f => f.category === "Tiang").map(f => ({ f, d: distance(point([selected.coords[1], selected.coords[0]]), point([f.coords[1], f.coords[0]]), { units: "meters" }) })).sort((a, b) => a.d - b.d)[0] : null
  const measureTotal = measurePoints.length > 1 ? measurePoints.slice(1).reduce((sum, p, i) => sum + distance(point([measurePoints[i][1], measurePoints[i][0]]), point([p[1], p[0]]), { units: "meters" }), 0) : 0

  return <div className="flex h-screen flex-col overflow-hidden bg-[#f7f9fb] text-slate-800">
    <Toaster richColors position="top-right" />
    <header className="flex h-[68px] shrink-0 items-center justify-between border-b bg-white px-5">
      <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-emerald-600 text-white"><Cable /></div><div><h1 className="text-[15px] font-bold tracking-tight">FTTH Survey Viewer</h1><p className="text-[11px] text-slate-400">Smart FTTH Planner</p></div></div>
      <div className="flex items-center gap-2"><input ref={fileRef} type="file" accept=".kml,.kmz" multiple disabled={importing || simulating} className="hidden" onChange={e => e.target.files && importFiles(e.target.files)} /><Button size="sm" disabled={importing || simulating} onClick={() => fileRef.current?.click()}><Upload data-icon="inline-start" /> {importing ? "Mengimpor..." : "Impor Data"}</Button><Button size="sm" variant="outline" onClick={fitData}><Maximize2 data-icon="inline-start" /> Fit ke Data</Button><Button size="sm" variant="outline" onClick={exportGeoJSON}><Download data-icon="inline-start" /> Ekspor</Button></div>
    </header>
    <div className="flex min-h-0 flex-1">
      {!collapsed && <aside className="flex w-[340px] shrink-0 flex-col border-r bg-white">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <span className="text-xs font-semibold">Panel kontrol</span>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)} aria-label="Lipat sidebar"><ChevronLeft /></Button>
        </div>
        <SimulationActions disabled={!configReady || importing || simulating || !features.length} dropDisabled={!configReady || !simulation || importing || simulating}
          simulating={simulating} maxDropLengthMeters={config.maxDropLengthMeters} stale={fatStale || candidatesStale || dropStale} onSimulateFat={runSimulation} onSimulateDrop={simulateDrops} />
        <nav aria-label="Menu panel kontrol" className="grid shrink-0 grid-cols-5 gap-1 border-b bg-white p-2">
          {([
            ["files", "File", FolderOpen], ["components", "Komponen", Layers3], ["config", "Config", Settings2], ["review", "Review", ListChecks], ["tools", "Alat", Ruler],
          ] as const).map(([id, label, Icon]) => <button key={id} type="button" aria-pressed={openGroup === id} onClick={() => togglePanelGroup(id)}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] focus-visible:outline-2 focus-visible:outline-emerald-600 ${openGroup === id ? "bg-emerald-50 font-semibold text-emerald-700" : "text-slate-500 hover:bg-slate-50"}`}>
            <Icon className="size-3.5" />{label}
          </button>)}
        </nav>
        <div ref={panelScrollRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          {!openGroup && <p className="p-3 text-center text-xs text-slate-400">Pilih menu di atas untuk membuka pengaturan atau hasil.</p>}
          <ControlPanelGroup title="Hasil & Review" icon={<ListChecks />} summary={simulation ? `${simulation.boxes.length} FAT · ${dropPlan?.routes.length ?? 0} rencana drop` : "Belum ada hasil simulasi"} open={openGroup === "review"} onToggle={() => togglePanelGroup("review")}>
            {!simulation ? <p className="text-xs leading-relaxed text-slate-500">Impor data survei, lalu jalankan Simulasikan FAT dari tombol di atas. Hasil dan detail kelompok akan tersedia di sini.</p> : <>
              <div role="tablist" aria-label="Jenis hasil simulasi" className="mb-3 flex gap-1 rounded-md bg-slate-100 p-1" onKeyDown={event => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
                event.preventDefault()
                const tab = event.key === "Home" ? "fat" : event.key === "End" ? "drop" : reviewTab === "fat" ? "drop" : "fat"
                setReviewTab(tab)
                event.currentTarget.querySelector<HTMLButtonElement>(`#review-tab-${tab}`)?.focus()
              }}>
                <button id="review-tab-fat" role="tab" tabIndex={reviewTab === "fat" ? 0 : -1} aria-selected={reviewTab === "fat"} aria-controls="review-panel-fat" onClick={() => setReviewTab("fat")} className={`flex-1 rounded px-2 py-1.5 text-xs ${reviewTab === "fat" ? "bg-white font-semibold shadow-sm" : "text-slate-500 hover:bg-white/60"}`}>FAT</button>
                <button id="review-tab-drop" role="tab" tabIndex={reviewTab === "drop" ? 0 : -1} aria-selected={reviewTab === "drop"} aria-controls="review-panel-drop" onClick={() => setReviewTab("drop")} className={`flex-1 rounded px-2 py-1.5 text-xs ${reviewTab === "drop" ? "bg-white font-semibold shadow-sm" : "text-slate-500 hover:bg-white/60"}`}>Kabel Drop</button>
              </div>
              <div id="review-panel-fat" role="tabpanel" aria-labelledby="review-tab-fat" hidden={reviewTab !== "fat"}>
                <FatCandidatesPanel review={review} onReviewAll={reviewAllGroups} maxDropLengthMeters={config.maxDropLengthMeters} stale={fatStale || candidatesStale} outOfRangeCount={outOfRangeHouses.length}
                  candidates={candidates} selected={selectedCandidate} simulation={simulation} selectedBox={selectedBox} showOtherCandidates={showOtherCandidates} onSelect={selectCandidate} />
              </div>
              <div id="review-panel-drop" role="tabpanel" aria-labelledby="review-tab-drop" hidden={reviewTab !== "drop"}>
                <DropPlanPanel review={review} selectedFatId={selectedBox?.candidate.id} stale={dropStale} maxDropLengthMeters={config.maxDropLengthMeters} plan={dropPlan} selected={selectedDrop} onSelect={selectDropRoute} />
              </div>
            </>}
          </ControlPanelGroup>
          <ControlPanelGroup title="File" icon={<FolderOpen />} summary={`${importedFiles} file · ${features.length} fitur survei`} open={openGroup === "files"} onToggle={() => togglePanelGroup("files")}>
            <div className="space-y-3 text-xs">
              <div className="flex gap-2"><Button size="sm" disabled={importing || simulating} onClick={() => fileRef.current?.click()}><Upload data-icon="inline-start" />{importing ? "Mengimpor..." : "Impor KML / KMZ"}</Button><Button size="sm" variant="outline" disabled={!features.length} onClick={exportGeoJSON}><Download data-icon="inline-start" />Ekspor</Button></div>
              <div className="grid grid-cols-2 gap-3 rounded-md border bg-slate-50 p-3">
                <div><p className="text-[10px] text-slate-400">Total fitur</p><b>{features.length}</b></div>
                <div><p className="text-[10px] text-slate-400">Panjang garis impor</p><b>{importedLineLength.toLocaleString("id-ID", { maximumFractionDigits: 2 })} km</b></div>
              </div>
              {!!features.length && <ul className="max-h-40 space-y-2 overflow-auto">{[...new Set(features.map(feature => feature.file))].map(name => <li key={name} className="flex items-start gap-2 rounded-md border p-2"><FileUp className="mt-0.5 size-3.5 shrink-0 text-slate-400" /><span className="min-w-0 break-all">{name}</span></li>)}</ul>}
              <p className="text-[10px] leading-relaxed text-slate-500">Data survei berlaku selama sesi dan perlu diimpor ulang setelah refresh. Pengaturan batas drop tersimpan di browser.</p>
            </div>
          </ControlPanelGroup>
          <ControlPanelGroup title="Komponen & Layer" icon={<Layers3 />} summary="Cari objek, kategori, label, dan layer peta" open={openGroup === "components"} onToggle={() => togglePanelGroup("components")}>
            <div className="space-y-3">
              <div className="relative"><Search className="absolute left-2.5 top-2 size-3.5 text-slate-400" /><Input className="pl-8 text-xs" placeholder="Cari nama atau ID..." value={query} onChange={e => filterSurvey(e.target.value)} aria-label="Cari komponen survei" /></div>
              <div>{(Object.keys(colors) as Category[]).map(cat => <div key={cat} className="flex items-center justify-between px-1 py-1.5 text-xs"><span className="flex items-center gap-2"><i className="size-2 rounded-full" style={{ backgroundColor: colors[cat] }} />{cat}</span><span className="text-slate-400">{counts[cat]}</span></div>)}</div>
              <div className="space-y-2 border-t pt-3 text-xs text-slate-600">
                <label className="flex items-center gap-2"><input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} />Label objek</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={showOtherCandidates} disabled={!simulation} onChange={e => toggleOtherCandidates(e.target.checked)} />Kandidat FAT lainnya</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={showDropRoutes} disabled={!dropPlan} onChange={e => { setShowDropRoutes(e.target.checked); if (!e.target.checked) setSelectedDropId(null) }} />Rencana Kabel Drop</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={showDropLabels} disabled={!dropPlan} onChange={e => setShowDropLabels(e.target.checked)} />Label jarak drop</label>
              </div>
              <details><summary className="cursor-pointer text-[11px] text-slate-500">Legenda peta</summary><div className="mt-2"><MapLegend /></div></details>
            </div>
          </ControlPanelGroup>
          <ControlPanelGroup title="Konfigurasi" icon={<Settings2 />} summary={`Maksimal panjang drop ${config.maxDropLengthMeters} m`} open={openGroup === "config"} onToggle={() => togglePanelGroup("config")}>
            <PlanningSettings config={config} disabled={!configReady || simulating || importing} onApply={applyConfig} />
          </ControlPanelGroup>
          <ControlPanelGroup title="Alat Bantu" icon={<Ruler />} summary="Pengukuran jarak dan buffer" open={openGroup === "tools"} onToggle={() => togglePanelGroup("tools")}>
            <div className="space-y-3 text-xs text-slate-600">
              <label className="flex items-center gap-2"><input type="checkbox" checked={measureMode} onChange={e => setMeasureMode(e.target.checked)} />Mode ukur jarak</label>
              <div className="flex gap-2"><Input value={bufferMeters} aria-label="Jarak buffer dalam meter" onChange={e => setBufferMeters(e.target.value)} className="h-8 text-xs" /><Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => selected && toast.success(`Buffer ${bufferMeters} m dibuat di sekitar ${selected.name}`)}>Buffer (m)</Button></div>
            </div>
          </ControlPanelGroup>
        </div>
      </aside>}
      <main className="relative min-w-0 flex-1"><MapView markerScale={markerScale} features={mapFeatures} candidates={!simulation || showOtherCandidates ? candidates ?? [] : []} simulation={simulation} review={review} selectedCandidate={selectedCandidate} onSelectCandidate={selectCandidate} onSelect={selectFeature} showLabels={showLabels} onReady={setMap} dropPlan={showDropRoutes ? dropPlan : null} showDropLabels={showDropLabels} selectedDropRouteId={selectedDrop?.id} selectedHouseId={selected?.category === "Rumah" ? selected.id : undefined} onSelectDropRoute={selectDropRoute} />{!features.length && <div className="absolute left-1/2 top-1/2 z-[500] w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-white p-5 text-center shadow-lg"><FileUp className="mx-auto mb-2 size-7 text-emerald-600" /><p className="text-sm font-semibold">Belum ada data survei</p><p className="mt-1 text-xs text-slate-500">Impor file KML atau KMZ untuk menampilkan rumah, tiang, dan jalur kabel.</p><Button className="mt-3" size="sm" disabled={importing || simulating} onClick={() => fileRef.current?.click()}>{importing ? "Mengimpor..." : "Impor Data"}</Button></div>}<div className="absolute left-4 top-4 z-[500] flex flex-col gap-1"><Button size="icon" variant="secondary" onClick={() => map?.zoomIn()} aria-label="Perbesar">+</Button><Button size="icon" variant="secondary" onClick={() => map?.zoomOut()} aria-label="Perkecil">−</Button></div>{collapsed && <Button className="absolute left-4 top-4 z-[500]" variant="secondary" size="icon" onClick={() => setCollapsed(false)} aria-label="Buka sidebar"><ChevronRight /></Button>}<div className="absolute right-4 top-4 z-[500] flex gap-2"><Button size="sm" variant="secondary" onClick={() => { setMeasureMode(true); toast.info("Klik beberapa titik pada peta untuk mengukur") }}><Ruler data-icon="inline-start" /> Ukur Jarak</Button><Button size="sm" variant="secondary" onClick={fitData}><Crosshair data-icon="inline-start" /> Fit</Button></div>{selected && <section className="absolute bottom-4 right-4 z-[500] w-[310px] rounded-xl border bg-white p-4 shadow-xl"><div className="flex items-start justify-between"><div><Badge style={{ backgroundColor: colors[selected.category], color: "white" }}>{selected.category}</Badge><h2 className="mt-2 text-sm font-bold">{selected.name}</h2><p className="mt-1 font-mono text-[10px] text-slate-400">ID: {selected.id}</p></div><Button variant="ghost" size="icon" onClick={() => setSelected(null)}><X /></Button></div><Separator className="my-3" /><div className="flex flex-col gap-2 text-xs"><div className="flex justify-between"><span className="text-slate-400">Koordinat</span><span className="font-mono">{selected.coords[0].toFixed(6)}, {selected.coords[1].toFixed(6)} <button onClick={() => navigator.clipboard.writeText(`${selected.coords[0]}, ${selected.coords[1]}`)}><Copy className="inline size-3" /></button></span></div><div className="flex justify-between"><span className="text-slate-400">Sumber file</span><span>{selected.file}</span></div>{nearestPole && <div className="rounded-md bg-emerald-50 p-2 text-emerald-700">Tiang terdekat: <b>{nearestPole.f.name}</b><br />Jarak garis lurus: {nearestPole.d.toFixed(1)} m</div>}</div></section>}</main>
    </div>
    {showIconSettings && <MapAppearanceSettings scale={markerScale} onChange={changeMarkerScale} onClose={closeIconSettings} />}
    <footer className="flex h-7 shrink-0 items-center justify-between border-t bg-white px-4 text-[10px] text-slate-400">
      <span>Koordinat kursor: —</span><span>{visible.length} fitur terlihat · Skala 1 : 5.000</span>
      <div className="flex items-center gap-3"><span>OpenStreetMap · © kontributor</span>
        <button ref={iconSettingsButtonRef} type="button" title="Atur ukuran ikon peta" aria-label="Atur ukuran ikon peta" aria-expanded={showIconSettings} aria-controls="map-appearance-settings"
          onClick={() => setShowIconSettings(open => !open)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-2"><Settings2 className="size-3.5" /></button>
      </div>
    </footer>
  </div>
}
