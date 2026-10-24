"use client"

import { useEffect } from "react"
import { CircleMarker, MapContainer, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

type MapFeature = { id: string; name: string; category: string; coords: [number, number] }
type MapViewProps = { features: MapFeature[]; onSelect: (feature: MapFeature) => void; onReady?: (map: L.Map) => void; showLabels?: boolean }

function MapInitializer({ onReady }: { onReady?: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => { onReady?.(map) }, [map, onReady])
  return null
}

const colors: Record<string, string> = { Tiang: "#20a36a", Rumah: "#3b82f6", FAT: "#f59e0b", FDT: "#8b5cf6", "Jalur kabel": "#ef5b5b", "Belum dikategorikan": "#94a3b8" }

export default function MapView({ features, onSelect, onReady, showLabels }: MapViewProps) {
  return <MapContainer center={[-6.9147, 107.6098]} zoom={14} zoomControl={false} className="h-full w-full">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <MapInitializer onReady={onReady} />
    {features.filter(f => f.category !== "Jalur kabel").map(feature => <CircleMarker key={feature.id} center={feature.coords} radius={feature.category === "Tiang" ? 5 : 7} pathOptions={{ color: colors[feature.category] ?? colors["Belum dikategorikan"], fillColor: colors[feature.category] ?? colors["Belum dikategorikan"], fillOpacity: 0.85, weight: 2 }} eventHandlers={{ click: () => onSelect(feature), mouseover: e => { if (showLabels) e.target.bindTooltip(feature.name).openTooltip() } }} />)}
  </MapContainer>
}
