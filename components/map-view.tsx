"use client"

import { useEffect } from "react"
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import { colors, toGeoJSON, type FeatureItem } from "@/lib/survey"
import "leaflet/dist/leaflet.css"

type MapViewProps = {
  features: FeatureItem[]
  onSelect: (feature: FeatureItem) => void
  onReady?: (map: L.Map) => void
  showLabels?: boolean
}

const houseIcon = L.divIcon({
  className: "survey-house-marker",
  html: '<span class="survey-house-marker__symbol"><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/></svg></span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  tooltipAnchor: [0, -12],
})

function MapInitializer({ onReady }: { onReady?: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => { onReady?.(map) }, [map, onReady])
  return null
}

function SurveyLayer({ feature, onSelect, showLabels }: { feature: FeatureItem; onSelect: MapViewProps["onSelect"]; showLabels?: boolean }) {
  // Recreate immutable GeoJSON layers when label mode changes. Tooltip text uses
  // a DOM text node so names from imported files are never interpreted as HTML.
  const color = colors[feature.category]
  return <GeoJSON
    key={`${feature.id}-${Boolean(showLabels)}`}
    data={toGeoJSON(feature)}
    style={geoFeature => ({ color, weight: 3, fillColor: color, fillOpacity: geoFeature?.geometry.type === "Point" || geoFeature?.geometry.type === "MultiPoint" ? 0.85 : 0.15 })}
    pointToLayer={(_, latlng) => feature.category === "Rumah" ? L.marker(latlng, {
      icon: houseIcon,
      title: `Rumah: ${feature.name}`,
      keyboard: true,
      riseOnHover: true,
    }) : L.circleMarker(latlng, {
      pane: "markerPane",
      radius: feature.category === "Tiang" ? 5 : 7,
      color, fillColor: color, fillOpacity: 0.85, weight: 2,
    })}
    onEachFeature={(_, layer) => {
      layer.on("click", () => onSelect(feature))
      if (showLabels) {
        const label = document.createElement("span")
        label.textContent = feature.name
        layer.bindTooltip(label)
      }
    }}
  />
}

export default function MapView({ features, onSelect, onReady, showLabels }: MapViewProps) {
  return <MapContainer center={[-6.9147, 107.6098]} zoom={14} zoomControl={false} className="h-full w-full">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <MapInitializer onReady={onReady} />
    {features.map(feature => <SurveyLayer key={feature.id} feature={feature} onSelect={onSelect} showLabels={showLabels} />)}
  </MapContainer>
}
