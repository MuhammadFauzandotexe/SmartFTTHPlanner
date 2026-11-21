"use client"

import { useEffect } from "react"
import { LayersControl, MapContainer, Pane, Polygon, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet"
import L from "leaflet"
import type { FeatureItem } from "@/lib/import-survey"
import type { FatCandidate } from "@/lib/fat-candidates"
import type { FatSimulation } from "@/lib/fat-simulation"
import type { DropPlan, DropRoute } from "@/lib/drop-plan"
import type { SimulationReview } from "@/lib/simulation-review"
import SurveyPointMarker from "@/components/survey-point-marker"
import DropRoutesLayer from "@/components/drop-routes-layer"
import type { FeatureCollection } from "geojson"
import "leaflet/dist/leaflet.css"

type MapViewProps = {
  features: FeatureItem[]
  onSelect: (feature: FeatureItem) => void
  onReady?: (map: L.Map) => void
  showLabels?: boolean
  markerScale?: number
  candidates?: FatCandidate[]
  simulation?: FatSimulation | null
  review: SimulationReview | null
  selectedCandidate?: FatCandidate | null
  onSelectCandidate?: (candidate: FatCandidate) => void
  dropPlan?: DropPlan | null
  showDropLabels?: boolean
  selectedDropRouteId?: string
  selectedHouseId?: string
  onSelectDropRoute: (route: DropRoute) => void
}

function MapInitializer({ onReady, features }: { onReady?: (map: L.Map) => void; features: FeatureItem[] }) {
  const map = useMap()
  useEffect(() => { onReady?.(map) }, [map, onReady])
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    })
    observer.observe(map.getContainer())
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [map])
  const ids = features.map(feature => feature.id).join("|")
  useEffect(() => {
    if (!features.length) return
    const collection: FeatureCollection = { type: "FeatureCollection", features: features.map(feature => ({
      type: "Feature", properties: {}, geometry: feature.geometry,
    })) }
    const bounds = L.geoJSON(collection).getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 })
  }, [map, ids])
  return null
}

const colors: Record<string, string> = { Tiang: "#20a36a", Rumah: "#3b82f6", FAT: "#f59e0b", FDT: "#8b5cf6", "Jalur kabel": "#ef5b5b", "Belum dikategorikan": "#94a3b8" }

export default function MapView({ features, onSelect, onReady, showLabels, markerScale = 1, candidates = [], simulation, review, selectedCandidate, onSelectCandidate, dropPlan, showDropLabels = true, selectedDropRouteId, selectedHouseId, onSelectDropRoute }: MapViewProps) {
  const chosenBox = simulation?.boxes.find(box => box.candidate.id === selectedCandidate?.id)
  const focusFatId = chosenBox?.candidate.id
  const visibleIds = new Set(features.map(feature => feature.id))
  const highlightedHouses = new Set((chosenBox?.houses ?? selectedCandidate?.houses)?.map(item => item.house.id))
  const splitterByHouse = new Map(chosenBox?.splitters.flatMap(splitter => splitter.houses.map(h => [h.house.id, splitter.number] as const)))
  const servedHouses = new Set(simulation?.boxes.flatMap(box => box.houses.map(h => h.house.id)))
  const unservedHouses = new Set(simulation?.unservedHouses.map(h => h.id))
  const chosenPoles = new Set(simulation?.boxes.map(box => box.candidate.id))
  const otherCandidates = candidates.filter(candidate => !chosenPoles.has(candidate.id) && visibleIds.has(candidate.pole.id))
  const candidatePoles = new Set([...otherCandidates.map(candidate => candidate.pole.id), ...chosenPoles])
  return <MapContainer center={[-6.9147, 107.6098]} zoom={14} maxZoom={22} zoomControl={false} className="relative isolate z-0 h-full w-full">
    <LayersControl position="bottomleft" collapsed={false}>
      <LayersControl.BaseLayer name="Peta jalan">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxNativeZoom={19} maxZoom={22} />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer checked name="Citra satelit">
        <TileLayer
          attribution='Tiles &copy; <a href="https://www.arcgis.com/home/item.html?id=50c23e4987a44de4ab163e1baeab4a46">Esri</a> &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
          url="https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          maxNativeZoom={19}
          maxZoom={22}
        />
      </LayersControl.BaseLayer>
    </LayersControl>
    <MapInitializer onReady={onReady} features={features} />
    <Pane name="survey-point-markers" style={{ zIndex: 430 }} />
    {dropPlan && <DropRoutesLayer drops={(review?.drops ?? []).filter(drop => visibleIds.has(drop.house.id))} showLabels={showDropLabels} markerScale={markerScale} selectedFatId={focusFatId} selectedHouseId={selectedHouseId} selectedRouteId={selectedDropRouteId} onSelect={onSelectDropRoute} />}
    {features.map(feature => {
      if (candidatePoles.has(feature.id)) return null
      const highlighted = highlightedHouses.has(feature.id)
      const dimmed = !!focusFatId && !highlighted && !unservedHouses.has(feature.id)
      const color = splitterByHouse.get(feature.id) === 2 ? "#9333ea" : highlighted ? (chosenBox ? "#db2777" : "#d97706") :
        unservedHouses.has(feature.id) ? "#dc2626" : servedHouses.has(feature.id) ? "#10b981" : colors[feature.category] ?? colors["Belum dikategorikan"]
      const pathOptions = { color, fillColor: color, opacity: dimmed ? 0.2 : 1, fillOpacity: dimmed ? 0.15 : 0.85, weight: highlighted ? 4 : 2 }
      const eventHandlers = { click: () => onSelect(feature) }
      const label = <Tooltip key={`${showLabels && !dimmed}-${markerScale}`} permanent={showLabels && !dimmed} className="survey-map-label">{feature.name}{splitterByHouse.has(feature.id) ? ` · Splitter ${splitterByHouse.get(feature.id)}` : unservedHouses.has(feature.id) ? " · Belum terlayani" : servedHouses.has(feature.id) ? " · Terlayani sementara" : ""}</Tooltip>
      const { geometry } = feature
      if (geometry.type === "LineString") return <Polyline key={feature.id} positions={geometry.coordinates.map(p => [p[1], p[0]])} pathOptions={pathOptions} eventHandlers={eventHandlers}>{label}</Polyline>
      if (geometry.type === "Polygon") return <Polygon key={feature.id} positions={geometry.coordinates.map(ring => ring.map(p => [p[1], p[0]] as [number, number]))} pathOptions={{ ...pathOptions, fillOpacity: 0.25 }} eventHandlers={eventHandlers}>{label}</Polygon>
      return <SurveyPointMarker scale={markerScale} key={feature.id} kind={feature.category === "Rumah" ? "house" : feature.category === "Tiang" ? "pole" : feature.category === "FAT" ? "fat" : "other"}
        position={feature.coords} color={color} highlighted={highlighted} dimmed={dimmed} unserved={unservedHouses.has(feature.id)} title={feature.name} onClick={() => onSelect(feature)}>{label}</SurveyPointMarker>
    })}
    {otherCandidates.map((candidate, index) => <SurveyPointMarker scale={markerScale} key={`candidate-${candidate.id}`} kind="candidate" position={candidate.pole.coords}
      color="#b45309" highlighted={selectedCandidate?.id === candidate.id} dimmed={!!focusFatId} title={candidate.pole.name} onClick={() => onSelectCandidate?.(candidate)}>
      <Tooltip key={`${showLabels && !focusFatId}-${markerScale}`} permanent={showLabels && !focusFatId} direction="top" offset={[0, -12 * markerScale]} className="survey-map-label">
        #{index + 1} Kandidat FAT · {candidate.pole.name}
      </Tooltip>
    </SurveyPointMarker>)}
    {simulation?.boxes.filter(box => visibleIds.has(box.candidate.pole.id) || box.houses.some(h => visibleIds.has(h.house.id))).map((box, index) => <SurveyPointMarker scale={markerScale} key={`selected-fat-${box.candidate.id}`} kind="fat" position={box.candidate.pole.coords}
      color="#059669" highlighted={focusFatId === box.candidate.id} dimmed={!!focusFatId && focusFatId !== box.candidate.id} title={`FAT ${box.candidate.id}`} onClick={() => onSelectCandidate?.(box.candidate)}>
      <Tooltip key={`${showLabels && (!focusFatId || focusFatId === box.candidate.id)}-${markerScale}`} permanent={showLabels && (!focusFatId || focusFatId === box.candidate.id)} direction="top" offset={[0, -14 * markerScale]} className="survey-map-label">
        FAT {index + 1} · {box.candidate.pole.name}
      </Tooltip>
    </SurveyPointMarker>)}
  </MapContainer>
}
