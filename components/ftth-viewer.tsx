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
import { AllocationPanel } from "@/components/allocation-panel"
import { acceptProposal, installFatOnPole, connectHomeToFat, disconnectHome, allocationContext, inputRevision, emptyAllocations, lockedDesignIssues, preserveLockedDesigns, type AllocationState, type Proposal } from "@/lib/allocation-recommendations"
import { DistributionPanel, type ConnectionEditor } from "@/components/distribution-panel"
import { addPoleConnection, distributionContext, distributionGeoJSON, distributionCSV, emptyDistribution, generateDistribution, type DistributionIssue, type DistributionState } from "@/lib/distribution"
import { parseFtthProject, serializeFtthProject, PROJECT_STORAGE_KEY, type FtthProject } from "@/lib/ftth-project"
import { WorkspaceSettings } from "@/components/workspace-settings"
import { ObjectExplorer } from "@/components/object-explorer"
import { SurveyDetails } from "@/components/survey-details"
import { InspectionPanel } from "@/components/inspection-panel"
import { serviceResultsStale, projectSignature, validateWorkspaceConfiguration, type WorkspaceConfiguration, type WorkspaceActivity, type InspectionTab } from "@/lib/workspace"
import { generateRecommendations } from "@/lib/allocation-recommendations"
import { distributionIsStale } from "@/lib/distribution"
import { suggestConnections } from "@/lib/distribution"
import { PlanningPanel } from "@/components/planning-panel"
import { DEFAULT_MAX_FATS_PER_POLE, planFtth, extractPlanningInputs, DEFAULT_MAX_DROP_LENGTH_METERS, DEFAULT_FAT_PORTS, type FtthPlan } from "@/lib/ftth-planning"
import { LayerSettingsPanel } from "@/components/layer-settings"
import { useLayerSettings } from "@/hooks/use-layer-settings"
import { baseMaps } from "@/lib/layer-settings"
import { Button } from "@/components/ui/button"
import { Upload, Download, Network, Layers3, Cable, Crosshair, Ruler, Settings2, Save, FolderOpen, Play, RefreshCw, ListChecks, PanelLeftClose, Database, Route, Plus, ChevronDown, Info } from "lucide-react"

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
  const [maxFatsPerPole, setMaxFatsPerPole] = useState(DEFAULT_MAX_FATS_PER_POLE)
  const [addingFat, setAddingFat] = useState(false)
  const [placementError, setPlacementError] = useState("")
  const [fatPorts, setFatPorts] = useState(DEFAULT_FAT_PORTS)
  const [settingsOpen,setSettingsOpen]=useState(false)
  const [activity,setActivity]=useState<WorkspaceActivity>("fat")
  const [stage,setStage]=useState<"fat"|"distribution">("fat")
  const [dockOpen,setDockOpen]=useState(false)
  const [inspectionTab,setInspectionTab]=useState<InspectionTab>("summary")
  const [serviceBusy,setServiceBusy]=useState(false)
  const [recommendationBusy,setRecommendationBusy]=useState(false)
  const serviceGuard=useRef(false),recommendationGuard=useRef(false),distributionGuard=useRef(false),projectEpoch=useRef(0)
  const startupProject=useRef(false)
  const [projectSession,setProjectSession]=useState(0)
  const [savedSignature,setSavedSignature]=useState<string|null>(null)
  const projectFileRef=useRef<HTMLInputElement>(null)
  const [resultsOpen, setResultsOpen] = useState(false)
  const [features, setFeatures] = useState<FeatureItem[]>([])
  const [planning, setPlanning] = useState<{ source: FeatureItem[]; result: FtthPlan } | null>(null)
  const [allocations, setAllocations] = useState<AllocationState>(emptyAllocations)
  const [focusedProposal, setFocusedProposal] = useState<Proposal | null>(null)
  const plan = useMemo(() => {
    if (planning?.source === features) return planning.result.maxFatsPerPole===maxFatsPerPole ? planning.result : {...planning.result,maxFatsPerPole}
    if (!allocations.locks.length) return null
    const inputs = extractPlanningInputs(features)
    return preserveLockedDesigns({ maxFatsPerPole, fatPorts, maxDropLengthMeters, distanceMethod: "straight-line", groups: [], homeCount: inputs.homes.length, poleCount: inputs.poles.length, issues: inputs.issues, warnings: ["Hasil otomatis perlu dihitung ulang; desain engineer terkunci dipertahankan."], unservedHomes: inputs.homes.map(home => ({ home, reason: "Hasil otomatis perlu dihitung ulang." })) }, allocations.locks, allocations.detachedHomeIds, allocations.manualRevision)
  }, [planning, features, allocations.locks, allocations.detachedHomeIds, allocations.manualRevision, fatPorts, maxDropLengthMeters, maxFatsPerPole])
  const [distribution, setDistribution] = useState<DistributionState>(emptyDistribution)
  const [distributionEditor,setDistributionEditor] = useState<ConnectionEditor|null>(null)
  const [distributionRouteKey,setDistributionRouteKey] = useState<string|null>(null)
  const [distributionSegmentId,setDistributionSegmentId] = useState<string|null>(null)
  const [distributionBusy,setDistributionBusy] = useState(false)
  const [projectMessage,setProjectMessage] = useState("")
  const distributionCtx = useMemo(()=>distributionContext(features,plan),[features,plan])
  const configuration=useMemo(()=>({fatPorts,maxDropLengthMeters,maxFatsPerPole,candidateRadiusMeters:distribution.candidateRadiusMeters,candidateNeighbors:distribution.candidateNeighbors}),[fatPorts,maxDropLengthMeters,maxFatsPerPole,distribution.candidateRadiusMeters,distribution.candidateNeighbors])
  const servicesStale=serviceResultsStale(plan,planning?.source===features,configuration)
  const distributionStale=distributionIsStale(distributionCtx,distribution)
  const currentSignature=useMemo(()=>projectSignature(features,plan,allocations,{fatPorts,maxDropLengthMeters,maxFatsPerPole},distribution),[features,plan,allocations,fatPorts,maxDropLengthMeters,maxFatsPerPole,distribution])
  const dirty=savedSignature!==currentSignature
  const recommendationContext = useMemo(() => plan ? allocationContext(plan, features) : null, [plan, features])
  const placementContext = useMemo(()=>{
    if (!addingFat) return null
    if (plan) return allocationContext(plan,features)
    const inputs=extractPlanningInputs(features)
    return allocationContext({maxFatsPerPole,fatPorts,maxDropLengthMeters,distanceMethod:"straight-line",groups:[],homeCount:inputs.homes.length,poleCount:inputs.poles.length,issues:inputs.issues,warnings:["Rancangan manual; pengelompokan otomatis belum dijalankan."],unservedHomes:inputs.homes.map(home=>({home,reason:"Belum dialokasikan dalam rancangan manual."}))},features)
  },[addingFat,plan,features,maxFatsPerPole,fatPorts,maxDropLengthMeters])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null)
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null)
  const activeHighlight = hoveredGroupId || highlightedGroupId
  const [selected, setSelected] = useState<FeatureItem | null>(null)
  const [connectionSelection, setConnectionSelection] = useState<{homeId:string;revision:string}|null>(null)
  const [connectionError, setConnectionError] = useState("")
  const selectingHome = connectionSelection && recommendationContext && connectionSelection.revision === inputRevision(recommendationContext) ? plan?.unservedHomes.find(item=>item.home.id===connectionSelection.homeId)?.home : null
  const selectedUnserved = selected?.category === "Rumah" ? plan?.unservedHomes.find(item=>item.home.id===selected.id) : undefined
  useEffect(()=>{
    if(connectionSelection && !selectingHome) {
      setConnectionSelection(null)
      setConnectionError("Hasil perencanaan berubah. Pilih rumah dan mulai penyambungan kembali.")
    }
  },[connectionSelection,selectingHome])
  const [panelOpen, setPanelOpen] = useState(false)
  const [showLabels, setShowLabels] = useState(false)
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
  const visible = features
  const importedFiles = useMemo(() => [...new Set(features.map(feature => feature.file))].map(name => ({ name, count: features.filter(feature => feature.file === name).length })), [features])
  const fileCount = useMemo(() => new Set(features.map(f => f.file)).size, [features])
  const displayed = useMemo(() => visible.filter(feature => settings.layers[feature.category].visible), [visible, settings.layers])
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
    projectEpoch.current++
    setAddingFat(false)
    setDistributionEditor(null)
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
      const data = { type: "FeatureCollection", features: [...visible.map(toGeoJSON), ...distributionGeoJSON(distributionCtx,distribution).features] }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/geo+json" }))
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = "ftth-survey.geojson"
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      addLogs([{ level: "success", source: "Ekspor", title: "Unduhan GeoJSON dimulai", details: [
        { label: "File", value: "ftth-survey.geojson" }, { label: "Jumlah fitur", value: String(data.features.length) },
      ] }])
    } catch (error) {
      addLogs([{ level: "error", source: "Ekspor", title: "Ekspor GeoJSON gagal", details: [{ label: "Penyebab", value: error instanceof Error ? error.message : "Unduhan tidak dapat disiapkan." }] }])
    }
  }
  const fitData = () => { if (map) fitFeaturesOnMap(map, features) }
  const applyConfiguration=(next:WorkspaceConfiguration)=>{
    validateWorkspaceConfiguration(next)
    const serviceChanged=next.fatPorts!==fatPorts||next.maxDropLengthMeters!==maxDropLengthMeters
    setFatPorts(next.fatPorts);setMaxDropLengthMeters(next.maxDropLengthMeters);setMaxFatsPerPole(next.maxFatsPerPole)
    setPlanning(previous=>previous?{...previous,result:{...previous.result,maxFatsPerPole:next.maxFatsPerPole}}:previous)
    setDistribution(previous=>({...previous,candidateRadiusMeters:next.candidateRadiusMeters,candidateNeighbors:next.candidateNeighbors}))
    if(serviceChanged){setConnectionSelection(null);setAddingFat(false)}
    setSettingsOpen(false)
    addLogs([{level:"info",source:"Planning Configuration",title:"Konfigurasi workspace diterapkan",details:[{label:"Layanan FAT",value:`${next.fatPorts} port; maksimum ${next.maxFatsPerPole} FAT/tiang; drop ${next.maxDropLengthMeters} m`},{label:"Kandidat distribusi",value:`radius ${next.candidateRadiusMeters} m; ${next.candidateNeighbors} tetangga`},{label:"Dampak",value:serviceChanged?"Hasil lama dipertahankan dan perlu dihitung ulang. Keputusan manual tidak dihapus.":"Tidak menjalankan proses atau mengubah koneksi existing secara otomatis."}]}])
    setProjectMessage(serviceChanged?"Konfigurasi diterapkan. Hasil layanan lama dipertahankan; hitung ulang dari toolbar. Keputusan manual tidak dihapus.":"Konfigurasi diterapkan tanpa menjalankan proses. Koneksi dan rute existing tetap tersedia.")
  }
  const runPlanning = useCallback(async () => {
    if (importing || !features.length || serviceGuard.current) return
    const epoch=projectEpoch.current
    serviceGuard.current=true;setServiceBusy(true)
    setAddingFat(false);setConnectionSelection(null);setDistributionEditor(null)
    try {
      await new Promise(resolve=>setTimeout(resolve,0))
      if(epoch!==projectEpoch.current)return
      const result = {...preserveLockedDesigns(planFtth(features, fatPorts, maxDropLengthMeters), allocations.locks, allocations.detachedHomeIds, allocations.manualRevision),maxFatsPerPole}
      setPlanning({ source: features, result })
      setResultsOpen(true)

      setSelectedGroupId(null)
      setHighlightedGroupId(null)
      setHoveredGroupId(null)
      setSelected(null)
      setStage("fat");setInspectionTab("summary");setDockOpen(true)
      addLogs(planningResultLogs(result))
    } catch (error) {
      addLogs([{ level: "error", source: "Perencanaan", title: "Perencanaan awal gagal dijalankan", details: [{ label: "Penyebab", value: error instanceof Error ? error.message : "Perhitungan gagal." }] }])
    } finally {serviceGuard.current=false;setServiceBusy(false)}
  }, [features, importing, addLogs, fatPorts, maxDropLengthMeters, allocations.locks, allocations.detachedHomeIds, allocations.manualRevision, maxFatsPerPole])
  const selectPlanningGroup = useCallback((id: string) => {
    const group = plan?.groups.find(item => item.id === id)
    if (!group) return
    setLayerSettingsOpen(false);setDistributionRouteKey(null);setDistributionSegmentId(null)
    setActivity("fat");setStage("fat");setPanelOpen(true)
    setSelectedGroupId(id)
    setResultsOpen(true)

    setHighlightedGroupId(id)
    setHoveredGroupId(null)
    setSelected(null)
    setPanelOpen(true)
  }, [plan])
  const selectSurveyObject = useCallback((feature: FeatureItem) => {
    setLayerSettingsOpen(false)
    setSelected(feature)
    setSelectedGroupId(null)
    setDistributionRouteKey(null);setDistributionSegmentId(null)
    setActivity(feature.category==="Rumah"?"fat":"data");setPanelOpen(true)
  }, [])
  const selectPlannedHome = useCallback((id: string) => {
    const home = features.find(feature => feature.id === id)
    if (home) selectSurveyObject(home)
  }, [features, selectSurveyObject])
  const highlightPlanningGroup = useCallback((id: string) => {
    if (plan?.groups.some(group => group.id === id)) {
      setLayerSettingsOpen(false);setDistributionRouteKey(null);setDistributionSegmentId(null)
      setActivity("fat");setStage("fat");setPanelOpen(true)
      setSelectedGroupId(id)
      setResultsOpen(true)

      setSelected(null)
      setPanelOpen(true)
      setHoveredGroupId(null)
      setHighlightedGroupId(previous => previous === id ? null : id)
    }
  }, [plan])
  const hoverPlanningGroup = useCallback((id: string | null) => setHoveredGroupId(id), [])
  const focusProposal = useCallback((proposal: Proposal) => {
    setLayerSettingsOpen(false);setSelected(null);setSelectedGroupId(null);setHighlightedGroupId(null)
    setAddingFat(false);setConnectionSelection(null);setDistributionEditor(null)
    setFocusedProposal(proposal)
    setInspectionTab("proposals");setDockOpen(true)
  }, [])
  const fitProposal = useCallback((proposal:Proposal)=>{
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
    if(servicesStale||serviceBusy)throw new Error("Hitung ulang layanan sebelum menyetujui perubahan alokasi.")
    if (!recommendationContext) return
    const approved = acceptProposal(recommendationContext, allocations, id)
    setAllocations(approved.state)
    setPlanning({ source: features, result: approved.plan })
    setFocusedProposal(null)
    addLogs([{level:"success",source:"Rekomendasi",title:"Usulan disetujui sebagai desain terkunci",details:[{label:"Usulan",value:id},{label:"Verifikasi",value:approved.state.proposals.find(p=>p.id===id)?.verification?.note || "Pemeriksaan otomatis"}]}])
  }
  const disconnectPlannedHome = useCallback((groupId: string, homeId: string) => {
    if (!plan) return
    const next = disconnectHome(plan, allocations, groupId, homeId)
    if (next.plan === plan) return
    setPlanning({ source: features, result: next.plan })
    setAllocations(next.state)
    setFocusedProposal(null)
    setHoveredGroupId(null)
    addLogs([{ level: "info", source: "Perencanaan manual", title: "Hubungan rumah–FAT diputuskan", details: [
      { label: "Rumah", value: homeId }, { label: "Cluster sebelumnya", value: groupId },
      { label: "Status", value: "Rumah tetap ada sebagai belum terlayani. Port dilepas; hubungan tidak dipasang ulang oleh hitung ulang otomatis selama sesi." },
    ] }])
  }, [plan, allocations, features, addLogs])
  const beginFatSelection = () => {
    if (!selectedUnserved || !recommendationContext || importing || servicesStale) return
    setAddingFat(false)
    setPanelOpen(false);setDockOpen(false);setLayerSettingsOpen(false)
    setDistributionEditor(null)
    setConnectionError("")
    setConnectionSelection({homeId:selectedUnserved.home.id,revision:inputRevision(recommendationContext)})
    setFocusedProposal(null)
    setHoveredGroupId(null)
  }
  const pickFat = useCallback((groupId: string) => {
    if (!selectingHome || !recommendationContext || importing || servicesStale) return
    try {
      const next = connectHomeToFat(recommendationContext,allocations,groupId,selectingHome.id)
      setPlanning({source:features,result:next.plan})
      setAllocations(next.state)
      setConnectionSelection(null)
      setConnectionError("")
      setSelected(null)
      setActivity("fat");setStage("fat");setPanelOpen(true)
      setSelectedGroupId(groupId)
      setHighlightedGroupId(groupId)
      setResultsOpen(true)

      addLogs([{level:"success",source:"Perencanaan manual",title:"Rumah disambungkan ke FAT",details:[{label:"Rumah",value:selectingHome.name},{label:"Cluster",value:groupId},{label:"Metode",value:"Penugasan simulasi; lihat metode panjang per rumah. Estimasi jarak lurus belum memvalidasi lintasan pemasangan."}]}])
    } catch(error) {
      setConnectionError(error instanceof Error?error.message:"Penyambungan rumah gagal.")
    }
  },[selectingHome,recommendationContext,allocations,features,importing,addLogs,servicesStale])
  const beginFatPlacement = () => {
    if (importing || servicesStale) return
    setDistributionEditor(null)
    setAddingFat(true)
    setPanelOpen(false);setDockOpen(false)
    setPlacementError("")
    setConnectionSelection(null)
    setConnectionError("")
    setFocusedProposal(null)
    setHoveredGroupId(null)
    setSelected(null)
    setLayerSettingsOpen(false)
  }
  const pickPoleForFat = useCallback((poleId: string) => {
    if (!addingFat || !placementContext || importing || servicesStale) return
    try {
      const next=installFatOnPole(placementContext,allocations,poleId)
      setPlanning({source:features,result:next.plan})
      setAllocations(next.state)
      setAddingFat(false)
      setPlacementError("")
      setActivity("fat");setStage("fat");setPanelOpen(true)
      setSelectedGroupId(next.group.id)
      setHighlightedGroupId(next.group.id)
      setResultsOpen(true)

      addLogs([{level:"success",source:"Component",title:"FAT manual ditambahkan",details:[{label:"FAT",value:next.group.candidate!.id},{label:"Tiang",value:next.group.candidate!.pole.name},{label:"Kapasitas",value:`${next.group.capacity} port; penambahan simulasi, pemasangan/upstream belum diverifikasi.`}]}])
    } catch(error) {setPlacementError(error instanceof Error?error.message:"Penambahan FAT gagal.")}
  },[addingFat,placementContext,allocations,features,importing,addLogs,servicesStale])
  const changeDistribution = useCallback((next:DistributionState)=>setDistribution(next),[])
  const cancelDistributionConnection = useCallback(()=>setDistributionEditor(null),[])
  const startDistributionConnection = () => {
    setAddingFat(false);setConnectionSelection(null);setFocusedProposal(null);setSelected(null);setDockOpen(false);setLayerSettingsOpen(false)
    setActivity("distribution");setStage("distribution");setPanelOpen(true)
    setDistributionEditor({from:null,to:null});
  }
  const pickDistributionPole = useCallback((id:string)=>setDistributionEditor(current=>!current?current:!current.from||current.to?{from:id,to:null}:{from:current.from,to:id}),[])
  const saveDistributionConnection = (allowed:boolean) => {
    if(!distributionEditor?.from||!distributionEditor.to)throw new Error("Pilih dua tiang untuk koneksi.")
    const next=addPoleConnection(distributionCtx,distribution,distributionEditor.from,distributionEditor.to,allowed)
    setDistribution(next);setDistributionSegmentId(next.connections.at(-1)!.id)
    setDistributionEditor(null)
  }
  const fitDistributionGeometries = useCallback((geometries:GeoJSON.Geometry[])=>{
    if(!map||!geometries.length)return
    const bounds=bbox({type:"FeatureCollection",features:geometries.map(geometry=>({type:"Feature" as const,geometry,properties:{}}))})
    if(bounds.every(Number.isFinite))map.fitBounds([[bounds[1],bounds[0]],[bounds[3],bounds[2]]],{padding:[40,40],maxZoom:18})
  },[map])
  const selectDistributionSegment = useCallback((id:string)=>{
    setLayerSettingsOpen(false);setSelected(null);setSelectedGroupId(null);setHighlightedGroupId(null);setHoveredGroupId(null)
    setActivity("distribution");setStage("distribution");setDistributionSegmentId(id);setPanelOpen(true)
  },[])
  const selectDistributionRoute = useCallback((key:string)=>{
    setLayerSettingsOpen(false);setSelected(null);setSelectedGroupId(null);setHighlightedGroupId(null);setHoveredGroupId(null)
    setStage("distribution");setDistributionRouteKey(key);setInspectionTab("routes");setDockOpen(true)
    const route=distribution.result?.routes.find(r=>r.key===key)
    if(route?.geometry)fitDistributionGeometries([route.geometry])
    else {const fat=distributionCtx.fats.find(f=>f.id===route?.fatId),pole=distributionCtx.poles.find(p=>p.id===fat?.poleId),coordinates=pole?.coordinates||fat?.coordinates;if(coordinates)fitDistributionGeometries([{type:"Point",coordinates}])}
  },[distribution.result,distributionCtx,fitDistributionGeometries])
  const focusDistributionIssue = (issue:DistributionIssue) => {
    const segment=distribution.connections.find(s=>s.id===(issue.segmentId||issue.objectId))
    if(segment){setDistributionSegmentId(segment.id);try{fitDistributionGeometries([segment.geometry])}catch{/* invalid geometry remains in issue panel */}return}
    const fat=distributionCtx.fats.find(f=>f.id===issue.objectId),source=distribution.sources.find(s=>s.id===issue.objectId)
    const pole=distributionCtx.poles.find(p=>p.id===(issue.poleId||fat?.poleId||source?.poleId||issue.objectId))
    const coordinates=pole?.coordinates||fat?.coordinates
    if(coordinates)fitDistributionGeometries([{type:"Point",coordinates}])
    else setProjectMessage("Objek masalah tidak memiliki koordinat valid; periksa pemetaan ID tiang/sumber.")
  }
  const generateDistributionRoutes = async () => {
    if(distributionGuard.current)return
    const epoch=projectEpoch.current
    distributionGuard.current=true;setDistributionBusy(true)
    try {
      await new Promise(resolve=>setTimeout(resolve,0))
      if(epoch!==projectEpoch.current)return
      const result=generateDistribution(distributionCtx,distribution)
      setDistribution(current=>({...current,result}));setDistributionRouteKey(null);setInspectionTab("routes");setDockOpen(true)
      setProjectMessage(`Distribusi selesai: ${result.summary.successCount}/${result.summary.targetCount} FAT terjangkau.`)
    } catch(error) {setProjectMessage(error instanceof Error?error.message:"Generate distribusi gagal.")}
    finally {distributionGuard.current=false;setDistributionBusy(false)}
  }
  const projectSnapshot = ():FtthProject => ({format:"smart-ftth-project",version:1,savedAt:new Date().toISOString(),features,plan,allocations,configuration:{fatPorts,maxDropLengthMeters,maxFatsPerPole},distribution})
  const downloadProjectText = (name:string,contents:string,type:string) => {
    const url=URL.createObjectURL(new Blob([contents],{type})),anchor=document.createElement("a")
    anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  const projectAction = (action:()=>void,message:string) => {try{action();setProjectMessage(message)}catch(error){setProjectMessage(error instanceof Error?error.message:"Operasi proyek gagal. Simpanan sebelumnya tidak diubah.")}}
  const restoreProject = (value:unknown) => {
    const project=parseFtthProject(value)
    projectEpoch.current++
    setSettingsOpen(false);setLayerSettingsOpen(false);setPanelOpen(false);setDockOpen(false)
    setProjectSession(n=>n+1)
    setFeatures(project.features);setPlanning(project.plan?{source:project.features,result:project.plan}:null)
    setAllocations(project.allocations);setDistribution(project.distribution)
    setFatPorts(project.configuration.fatPorts);setMaxDropLengthMeters(project.configuration.maxDropLengthMeters);setMaxFatsPerPole(project.configuration.maxFatsPerPole)
    setAddingFat(false);setConnectionSelection(null);setDistributionEditor(null);setFocusedProposal(null)
    setSelected(null);setSelectedGroupId(null);setHighlightedGroupId(null);setHoveredGroupId(null);setDistributionRouteKey(null);setDistributionSegmentId(null);setFitTarget([])
    setResultsOpen(true);
    setSavedSignature(projectSignature(project.features,project.plan,project.allocations,project.configuration,project.distribution))
  }
  const saveProjectInBrowser = () => projectAction(()=>{localStorage.setItem(PROJECT_STORAGE_KEY,serializeFtthProject(projectSnapshot()));setSavedSignature(currentSignature)},"Snapshot proyek tersimpan di browser. Unduh JSON untuk salinan portabel.")
  const openBrowserProject = () => projectAction(()=>{const saved=localStorage.getItem(PROJECT_STORAGE_KEY);if(!saved)throw new Error("Belum ada simpanan proyek di browser.");restoreProject(JSON.parse(saved))},"Proyek dibuka dari simpanan browser; hasil diperiksa terhadap input terbaru.")
  const downloadProject = () => projectAction(()=>{downloadProjectText("smart-ftth-project.json",serializeFtthProject(projectSnapshot()),"application/json");setSavedSignature(currentSignature)},"Snapshot proyek JSON diunduh.")
  const openProjectFile = async (file:File) => {try{restoreProject(JSON.parse(await file.text()));setProjectMessage(`Proyek ${file.name} dibuka.`)}catch(error){setProjectMessage(error instanceof Error?error.message:"Berkas proyek tidak valid; rancangan aktif tidak diganti.")}}
  useEffect(()=>{
    if(startupProject.current||typeof localStorage==='undefined')return
    startupProject.current=true
    try{const saved=localStorage.getItem(PROJECT_STORAGE_KEY);if(saved){restoreProject(JSON.parse(saved));setProjectMessage("Snapshot browser terakhir dipulihkan. Perubahan baru disimpan melalui tombol Simpan.")}}
    catch(error){setProjectMessage(error instanceof Error?error.message:"Simpanan tidak dapat dibuka; data tersimpan tidak dihapus.")}
  },[])
  const exportDistribution = (format:"geojson"|"csv") => projectAction(()=>downloadProjectText(`ftth-distribution.${format}`,format==="geojson"?JSON.stringify(distributionGeoJSON(distributionCtx,distribution),null,2):distributionCSV(distributionCtx,distribution),format==="geojson"?"application/geo+json":"text/csv;charset=utf-8"),"Ekspor distribusi diunduh. Hasil lama diberi status stale, bukan final.")
  const nearestPole = selected?.category === "Rumah" && selected.kind === "Point" ? features.filter(f => f.category === "Tiang" && f.kind === "Point").map(f => ({ f, d: distance(point([selected.coords[1], selected.coords[0]]), point([f.coords[1], f.coords[0]]), { units: "meters" }) })).sort((a, b) => a.d - b.d)[0] : null

  const closeMenuOnEscape=(event:React.KeyboardEvent<HTMLDetailsElement>)=>{if(event.key==='Escape'){event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}
  const openInspection=(tab:InspectionTab)=>{setInspectionTab(tab);setDockOpen(true)}
  const openActivity=(next:WorkspaceActivity)=>{
    setLayerSettingsOpen(false);setActivity(next)
    if(next==='inspection'){setPanelOpen(false);openInspection('issues');return}
    setPanelOpen(previous=>activity===next?!previous:true)
    if(next==='fat'||next==='distribution')setStage(next)
  }
  const runRecommendations=async()=>{
    if(!recommendationContext||servicesStale||serviceBusy||recommendationGuard.current)return
    const epoch=projectEpoch.current
    recommendationGuard.current=true;setRecommendationBusy(true)
    try{await new Promise(resolve=>setTimeout(resolve,0));if(epoch!==projectEpoch.current)return;changeAllocations(generateRecommendations(recommendationContext,allocations));openInspection('proposals')}
    catch(error){setProjectMessage(error instanceof Error?error.message:'Rekomendasi gagal.')}
    finally{recommendationGuard.current=false;setRecommendationBusy(false)}
  }
  const suggestDistributionConnections=()=>{try{setDistribution(suggestConnections(distributionCtx,distribution));setStage('distribution');setActivity('distribution');setPanelOpen(true)}catch(error){setProjectMessage(error instanceof Error?error.message:'Saran koneksi gagal.')}}
  const inspectHouse=(id:string)=>{const home=features.find(f=>f.id===id);if(home){selectSurveyObject(home);if(map)fitFeaturesOnMap(map,[home]);setDockOpen(false)}}
  const inspectDistributionIssue=(issue:DistributionIssue)=>{focusDistributionIssue(issue);setActivity('distribution');setPanelOpen(true);setDockOpen(false)}
  const editing=!!(addingFat||selectingHome||distributionEditor)
  const closePanel=()=>{setPanelOpen(false);if(typeof document!=='undefined')document.querySelector<HTMLButtonElement>('.workspace-nav button[aria-pressed="true"]')?.focus()}
  const activeMode=addingFat?'Tambah FAT':selectingHome?'Sambungkan rumah':distributionEditor?'Tambah koneksi':'Pilih objek'
  const cancelMode=()=>{if(addingFat||selectingHome)setPanelOpen(true);setAddingFat(false);setPlacementError('');setConnectionSelection(null);setConnectionError('');setDistributionEditor(null)}
  useEffect(()=>{
    if(typeof window==='undefined')return
    const escape=(event:KeyboardEvent)=>{if(event.key!=='Escape'||settingsOpen)return;if(addingFat||selectingHome||distributionEditor){cancelMode();return}if(layerSettingsOpen){setLayerSettingsOpen(false);layerSettingsButton.current?.focus();return}if(dockOpen&&(event.target as HTMLElement|null)?.closest?.('.workspace-inspection')){setDockOpen(false);document.querySelector<HTMLButtonElement>('[aria-controls="inspection-body"]')?.focus();return}if(panelOpen)closePanel();else if(dockOpen){setDockOpen(false);document.querySelector<HTMLButtonElement>('[aria-controls="inspection-body"]')?.focus()}}
    window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape)
  },[settingsOpen,addingFat,selectingHome,distributionEditor,layerSettingsOpen,panelOpen,dockOpen])
  const pendingCount=allocations.proposals.filter(p=>p.decision==='pending').length
  const planningIssues=recommendationContext?lockedDesignIssues(recommendationContext,allocations.locks):[]
  const canDistribute=distribution.sources.length>0&&Object.keys(distribution.assignments).length>0
  const toolbarHint=serviceBusy?'Sedang menghitung layanan FAT…':distributionBusy?'Sedang menghitung distribusi…':recommendationBusy?'Sedang menyusun usulan alokasi…':editing?'Selesaikan atau batalkan mode editing sebelum menjalankan proses.':stage==='fat'?!features.length?'Impor data survei untuk memulai.':servicesStale?'Konfigurasi berubah. Hasil lama tetap tersedia; hitung ulang layanan.':!plan?'Gunakan default aplikasi untuk membuat kelompok dan kandidat FAT.':`${plan.unservedHomes.length} rumah belum terlayani · ${pendingCount} usulan perlu review.`:!canDistribute?'Pilih sumber dan tetapkan FAT pada aktivitas Distribusi.':distributionStale?'Koneksi atau assignment berubah. Hitung ulang distribusi.':distribution.result?`${distribution.result.summary.unreachableCount} FAT tidak terjangkau · ${distribution.result.summary.invalidCount} input bermasalah.`:'Siap menghitung jalur melalui koneksi tiang yang diizinkan.'
  const projectTitle=importedFiles.length===1?importedFiles[0].name:importedFiles.length?`Proyek FTTH · ${importedFiles.length} file`:'Proyek FTTH'
  return <div className="workspace bg-[#f7f9fb] text-slate-800">
    <header className="workspace-header">
      <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white"><Cable className="size-5"/></span><div className="min-w-0"><h1 className="truncate text-sm font-semibold" title={projectTitle}>{projectTitle}</h1><p className="truncate text-[11px] text-slate-500">{!features.length?'Workspace perencanaan FTTH':dirty?'Perubahan belum disimpan':'Snapshot tersimpan · lokal / JSON'}</p></div></div>
      <div className="flex shrink-0 items-center gap-1.5">
        <details className="workspace-menu" onKeyDown={closeMenuOnEscape}><summary className="workspace-menu-trigger"><FolderOpen className="size-4"/><span>Buka</span></summary><div className="workspace-menu-body" onClick={event=>{const menu=event.currentTarget.closest("details");if(menu)menu.open=false}}><button onClick={openBrowserProject}>Buka simpanan browser</button><button onClick={()=>projectFileRef.current?.click()}>Buka proyek JSON</button><button disabled={importing} onClick={()=>fileRef.current?.click()}>Impor survei KML/KMZ</button></div></details>
        <Button size="sm" onClick={saveProjectInBrowser} disabled={!features.length||distributionBusy||serviceBusy}><Save/>Simpan</Button>
        <details className="workspace-menu" onKeyDown={closeMenuOnEscape}><summary className="workspace-menu-trigger"><Download className="size-4"/><span>Ekspor</span></summary><div className="workspace-menu-body" onClick={event=>{const menu=event.currentTarget.closest("details");if(menu)menu.open=false}}><button disabled={!features.length} onClick={exportGeoJSON}>Survei + distribusi GeoJSON</button><button onClick={()=>exportDistribution('geojson')}>Distribusi GeoJSON</button><button disabled={!distribution.result} onClick={()=>exportDistribution('csv')}>Rute CSV</button><button disabled={!features.length} onClick={downloadProject}>Snapshot proyek JSON</button></div></details>
        <Button size="sm" variant="outline" aria-expanded={settingsOpen} onClick={()=>{setLayerSettingsOpen(false);setSettingsOpen(true)}}><Settings2/><span>Pengaturan</span></Button>
      </div>
      <input ref={fileRef} type="file" accept=".kml,.kmz" multiple disabled={importing} className="hidden" aria-label="Impor survei" onChange={e=>{if(e.target.files)importFiles(e.target.files);e.target.value=''}}/>
      <input ref={projectFileRef} type="file" accept=".json,application/json" className="hidden" aria-label="Buka proyek JSON" onChange={e=>{const file=e.target.files?.[0];if(file)openProjectFile(file);e.target.value=''}}/>
    </header>
    <section className="workspace-toolbar" aria-busy={serviceBusy||distributionBusy||recommendationBusy} aria-label="Toolbar perencanaan">
      <div className="workspace-stage" aria-label="Tahap perencanaan"><button aria-pressed={stage==='fat'} onClick={()=>{setStage("fat");if(panelOpen)setActivity("fat")}}>Layanan FAT</button><button aria-pressed={stage==='distribution'} onClick={()=>{setStage("distribution");if(panelOpen)setActivity("distribution")}}>Distribusi</button></div>
      {stage==='fat'?<>
        <Button size="sm" disabled={!features.length||importing||serviceBusy||recommendationBusy||distributionBusy||editing} aria-describedby="toolbar-prerequisite" onClick={runPlanning}>{serviceBusy?<RefreshCw className="animate-spin"/>:<Play/>}{serviceBusy?'Menghitung layanan…':plan?'Hitung ulang layanan FAT':'Hitung kelompok & FAT'}</Button>
        <Button size="sm" variant="outline" disabled={!plan||servicesStale||!plan.unservedHomes.length||recommendationBusy||serviceBusy||distributionBusy||editing} onClick={runRecommendations}>{recommendationBusy?'Menyusun usulan…':'Rekomendasikan alokasi'}</Button>
      </>:<>
        <Button size="sm" disabled={!canDistribute||distributionBusy||serviceBusy||recommendationBusy||importing||editing} aria-describedby="toolbar-prerequisite" onClick={generateDistributionRoutes}>{distributionBusy?<RefreshCw className="animate-spin"/>:<Play/>}{distributionBusy?'Menghitung distribusi…':distribution.result?'Hitung ulang distribusi':'Hitung jalur distribusi'}</Button>
        <Button size="sm" variant="outline" onClick={()=>{setActivity('distribution');setPanelOpen(true)}}>Siapkan distribusi</Button>
        <details className="workspace-menu" onKeyDown={closeMenuOnEscape}><summary className="workspace-menu-trigger">Aksi distribusi<ChevronDown className="size-3"/></summary><div className="workspace-menu-body" onClick={event=>{const menu=event.currentTarget.closest("details");if(menu)menu.open=false}}><button disabled={!distributionCtx.poles.length} onClick={startDistributionConnection}>Tambah koneksi tiang</button><button disabled={!distributionCtx.poles.length} onClick={suggestDistributionConnections}>Sarankan koneksi</button><button disabled={!distribution.result} onClick={()=>fitDistributionGeometries(distribution.result?.routes.flatMap(r=>r.geometry?[r.geometry]:[])||[])}>Fit hasil distribusi</button></div></details>
      </>}
      <p id="toolbar-prerequisite" className="workspace-toolbar-hint" role="status">{toolbarHint}</p>
    </section>
    <div className="workspace-body">
      <nav className="workspace-nav" aria-label="Aktivitas workspace">{([{id:'data',label:'Data',icon:Database},{id:'fat',label:'FAT & Layanan',icon:Network},{id:'distribution',label:'Distribusi',icon:Route},{id:'inspection',label:'Pemeriksaan',icon:ListChecks}] as const).map(item=><button key={item.id} aria-pressed={activity===item.id&&(item.id==='inspection'?dockOpen:panelOpen)} onClick={()=>openActivity(item.id)}><item.icon className="size-5"/><span>{item.label}</span></button>)}</nav>
      <div className="workspace-main">
        <div className="workspace-row">
          <aside className="workspace-explorer" hidden={!panelOpen} aria-label="Panel aktivitas">
            <header className="flex items-center justify-between border-b p-3"><h2 className="text-sm font-semibold">{activity==='data'?'Data proyek':activity==='distribution'?'Distribusi':'FAT & Layanan'}</h2><Button size="icon-sm" variant="ghost" aria-label="Tutup panel aktivitas" onClick={closePanel}><PanelLeftClose/></Button></header>
            <div className="workspace-explorer-content">
              <section hidden={activity!=='data'} className="space-y-3"><div className="flex flex-wrap gap-2"><Button size="sm" disabled={importing} onClick={()=>fileRef.current?.click()}><Upload/>{importing?'Mengimpor…':'Impor survei'}</Button><Button size="sm" variant="outline" onClick={openBrowserProject}>Buka simpanan</Button><Button size="sm" variant="outline" onClick={()=>projectFileRef.current?.click()}>Buka JSON</Button></div><p className="text-xs text-slate-500">{fileCount} file · {features.length} objek · {importedLength.toLocaleString('id-ID',{maximumFractionDigits:1})} m garis survei</p><details><summary className="cursor-pointer text-xs">File survei</summary><ul className="mt-2 text-xs">{importedFiles.map(f=><li className="break-all" key={f.name}>{f.name} · {f.count} objek</li>)}</ul></details><ObjectExplorer key={`data-${projectSession}`} activity="data" features={features} plan={plan} selectedId={selected?.id||null} groupId={selectedGroupId} onSelect={selectSurveyObject} onSelectGroup={selectPlanningGroup}/></section>
              <section hidden={activity!=='fat'} className="space-y-3"><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={importing||servicesStale||serviceBusy||!features.some(f=>f.category==='Tiang')} onClick={beginFatPlacement}><Plus/>Tambah FAT pada tiang</Button><Button size="sm" variant="ghost" onClick={()=>openInspection('proposals')}>Review usulan ({pendingCount})</Button></div>{servicesStale&&<p className="rounded bg-amber-50 p-2 text-xs text-amber-800">Hasil layanan lama. Hitung ulang dari toolbar untuk menerapkan konfigurasi terbaru; keputusan manual tetap dikunci.</p>}<ObjectExplorer key={`fat-${projectSession}`} activity="fat" features={features} plan={plan} selectedId={selected?.id||null} groupId={selectedGroupId} onSelect={selectSurveyObject} onSelectGroup={selectPlanningGroup}/>{!selected&&selectedGroupId&&<><Button size="sm" variant="outline" onClick={()=>{const group=plan?.groups.find(g=>g.id===selectedGroupId);if(group?.candidate)fitDistributionGeometries([{type:'Point',coordinates:group.candidate.pole.coordinates}])}}><Crosshair/>Fokus lokasi FAT</Button><PlanningPanel view="detail" plan={plan} selectedGroupId={selectedGroupId} highlightedGroupId={activeHighlight} onHighlightGroup={highlightPlanningGroup} onHoverGroup={hoverPlanningGroup} hasData={features.length>0} importing={importing} onRun={runPlanning} onSelectGroup={selectPlanningGroup} resultsOpen={resultsOpen} onResultsOpenChange={setResultsOpen}/></>}</section>
              <section hidden={activity!=='distribution'}><DistributionPanel key={`distribution-${projectSession}`} workspace context={distributionCtx} state={distribution} onChange={changeDistribution} editor={distributionEditor} onStartConnection={startDistributionConnection} onCancelConnection={cancelDistributionConnection} onSaveConnection={saveDistributionConnection} busy={distributionBusy} onGenerate={generateDistributionRoutes} onFit={()=>fitDistributionGeometries(distribution.result?.routes.flatMap(r=>r.geometry?[r.geometry]:[])||[])} selectedRouteKey={distributionRouteKey} onSelectRoute={selectDistributionRoute} selectedSegmentId={distributionSegmentId} onSelectSegment={selectDistributionSegment} onFocusIssue={inspectDistributionIssue} onSaveProject={saveProjectInBrowser} onDownloadProject={downloadProject} onOpenSaved={openBrowserProject} onOpenProject={openProjectFile} onExport={exportDistribution} projectMessage=""/></section>
              {selected&&(activity==='data'||activity==='fat')&&<SurveyDetails feature={selected} plan={plan} onClose={()=>setSelected(null)} onFocus={()=>{if(map)fitFeaturesOnMap(map,[selected])}} onConnect={beginFatSelection} nearestPole={nearestPole?{name:nearestPole.f.name,meters:nearestPole.d}:null} canConnect={!servicesStale&&!importing&&!serviceBusy} error={connectionError}/>}
            </div>
          </aside>
          <main className="workspace-map" aria-label="Peta perencanaan">
            <MapView features={addingFat||distributionEditor?features:visible} selectedFeature={selected} distribution={{context:distributionCtx,state:distribution,editor:distributionEditor,onPickPole:pickDistributionPole,selectedRouteKey:distributionRouteKey,selectedSegmentId:distributionSegmentId,onSelectSegment:selectDistributionSegment,onSelectRoute:selectDistributionRoute}} onSelect={selectSurveyObject} showLabels={showLabels} onReady={setMap} settings={settings} plan={plan} placementContext={placementContext} onPickPole={pickPoleForFat} selectingHome={selectingHome} onPickFat={pickFat} provisional={focusedProposal&&focusedProposal.decision==='pending'&&recommendationContext&&focusedProposal.revision===inputRevision(recommendationContext)?focusedProposal:null} onSelectProposal={focusProposal} highlightedGroupId={activeHighlight} onSelectGroup={selectPlanningGroup} onSelectHome={selectPlannedHome} onDisconnectHome={serviceBusy?undefined:disconnectPlannedHome} onHighlightGroup={highlightPlanningGroup} onHoverGroup={hoverPlanningGroup}/>
            <div className="workspace-map-controls"><div className="flex flex-col gap-1"><Button size="icon" variant="secondary" aria-label="Perbesar peta" title="Perbesar peta" onClick={()=>map?.zoomIn()}>+</Button><Button size="icon" variant="secondary" aria-label="Perkecil peta" title="Perkecil peta" onClick={()=>map?.zoomOut()}>−</Button><Button size="icon" variant="secondary" aria-label="Fit data" title="Fit seluruh data" disabled={!features.length} onClick={fitData}><Crosshair/></Button></div><div className="flex flex-col items-end gap-1"><Button ref={layerSettingsButton} size="sm" variant="secondary" aria-expanded={layerSettingsOpen} onClick={()=>{cancelMode();setPanelOpen(false);setDockOpen(false);setLayerSettingsOpen(open=>!open)}}><Layers3/>Layer peta</Button><details className="workspace-legend"><summary>Legenda</summary><div>{(Object.keys(colors) as Category[]).map(category=><p className="flex items-center gap-2" key={category}><span className="size-2 rounded-full" style={{backgroundColor:settings.layers[category].color}}/>{category}</p>)}<p>Garis tebal biru: distribusi</p><p>Garis putus-putus: kandidat / hubungan layanan</p><label className="flex gap-1"><input type="checkbox" checked={showLabels} onChange={e=>setShowLabels(e.target.checked)}/>Label survei</label></div></details><Button size="sm" variant="secondary" disabled title="Pengumpulan titik ukur belum tersedia pada aplikasi"><Ruler/>Ukur jarak</Button></div></div>
            <div className="workspace-mode"><span className="flex items-center gap-1"><Info className="size-3.5"/>{activeMode}</span>{(addingFat||selectingHome||distributionEditor)&&<Button size="sm" variant="outline" onClick={cancelMode}>Batal (Esc)</Button>}</div>
            {!features.length&&<div className="workspace-empty"><h2 className="font-semibold">Mulai dari data survei</h2><p>Impor KML/KMZ atau buka snapshot proyek. Default aplikasi sudah siap digunakan.</p><div className="mt-3 flex justify-center gap-2"><Button size="sm" onClick={()=>fileRef.current?.click()}>Impor survei</Button><Button size="sm" variant="outline" onClick={openBrowserProject}>Buka proyek tersimpan</Button></div></div>}
            {addingFat&&<section className="workspace-mode-card" aria-label="Tambah FAT pada tiang"><h2>Tambah FAT · pilih tiang</h2><p>Hanya tiang yang dapat diklik. Hijau: ruang tersedia; kuning: batas tercapai.</p><p>Maksimum {maxFatsPerPole} FAT per tiang · FAT baru {fatPorts} port.</p>{placementError&&<p role="alert" className="text-red-700">{placementError}</p>}<Button size="sm" variant="outline" onClick={cancelMode}>Batal menambah FAT</Button></section>}
            {selectingHome&&<section className="workspace-mode-card" aria-label="Pilih FAT untuk rumah"><h2>Sambungkan {selectingHome.name}</h2><p>Pilih FAT dengan port tersedia. Batas drop {maxDropLengthMeters} m menggunakan estimasi jarak lurus.</p>{!plan?.groups.some(g=>g.candidate&&g.homes.length+(g.occupiedPorts||0)<(g.capacity??plan.fatPorts))&&<p>Tidak ada FAT dengan port tersedia.</p>}{connectionError&&<p role="alert" className="text-red-700">{connectionError}</p>}<Button size="sm" variant="outline" onClick={cancelMode}>Batal memilih FAT</Button></section>}
            {distributionEditor&&<section className="workspace-mode-card" aria-label="Mode tambah koneksi"><h2>Tambah koneksi tiang</h2><p>{!distributionEditor.from?'Klik tiang asal.':!distributionEditor.to?'Klik tiang tujuan.':'Periksa preview dan konfirmasi pada panel Distribusi.'}</p><Button size="sm" variant="outline" onClick={cancelMode}>Batal koneksi</Button></section>}
            {layerSettingsOpen&&<LayerSettingsPanel settings={settings} features={features} onChange={setSettings} onClose={()=>{setLayerSettingsOpen(false);layerSettingsButton.current?.focus()}}/>}
          </main>
        </div>
        <InspectionPanel plan={plan} context={distributionCtx} distribution={distribution} serviceStale={servicesStale} busy={serviceBusy} distributionBusy={distributionBusy} issues={planningIssues} pendingCount={pendingCount} open={dockOpen} tab={inspectionTab} onToggle={()=>setDockOpen(open=>!open)} onTab={setInspectionTab} onHouse={inspectHouse} onRoute={selectDistributionRoute} onIssue={inspectDistributionIssue} selectedRouteKey={distributionRouteKey} proposals={recommendationContext?<AllocationPanel key={`allocations-${projectSession}`} hideGenerate disabled={servicesStale||serviceBusy} selectedProposalId={focusedProposal?.id} context={recommendationContext} state={allocations} onChange={changeAllocations} onAccept={approveAllocation} onFocus={focusProposal} onFit={fitProposal} issues={[]}/>:<p>Hitung layanan FAT dari toolbar untuk menyiapkan usulan alokasi.</p>} logs={<ApplicationLog entries={logs} defaultOpen/>}/>
      </div>
    </div>
    <footer className="workspace-footer"><span className="min-w-0 flex-1 truncate" role="status" title={projectMessage}>{projectMessage||`${displayed.length} fitur terlihat · ${activeMode}`}</span><span>{baseMaps[settings.baseMap].provider}</span></footer>
    {settingsOpen&&<WorkspaceSettings configuration={configuration} onApply={applyConfiguration} onClose={()=>setSettingsOpen(false)}/>}
  </div>
}
