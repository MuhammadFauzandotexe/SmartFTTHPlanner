"use client"

import { useEffect, useMemo, useRef } from "react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import { toGeoJSON, type Category, type FeatureItem } from "@/lib/survey"
import { baseMaps, categories, layerPaneName, layerZIndex, type LayerSettings, type LayerStyle } from "@/lib/layer-settings"
import { PlanningMapLayers } from "@/components/planning-map-layers"
import type { FtthPlan } from "@/lib/ftth-planning"
import "leaflet/dist/leaflet.css"

type MapViewProps = {
  features: FeatureItem[]
  onSelect: (feature: FeatureItem) => void
  onReady?: (map: L.Map) => void
  showLabels?: boolean
  settings: LayerSettings
  plan?: FtthPlan | null
  highlightedGroupId?: string | null
  onSelectHome?: (id: string) => void
  onHighlightGroup?: (id: string) => void
  onHoverGroup?: (id: string | null) => void
  onSelectGroup?: (id: string) => void
}

function pointIcon(style: LayerStyle, category: "Rumah" | "Tiang") {
  const className = category === "Tiang" ? "survey-pole-marker" : "survey-house-marker"
  const size = style.markerSize
  const symbol = document.createElement("span")
  symbol.className = `${className}__symbol`
  symbol.style.width = `${size}px`
  symbol.style.height = `${size}px`
  symbol.style.backgroundColor = style.color
  // Only a fixed SVG is inserted; imported names remain plain text in tooltips.
  symbol.innerHTML = category === "Tiang"
    ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M4 7h16M7 12h10M6 5v4M18 5v4M9 21h6"/></svg>'
    : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M9 21v-8h6v8"/></svg>'
  const svg = symbol.querySelector("svg")!
  svg.setAttribute("width", String(Math.max(6, Math.round(size * 0.65))))
  svg.setAttribute("height", String(Math.max(6, Math.round(size * 0.65))))
  return L.divIcon({ className, html: symbol, iconSize: [size, size], iconAnchor: [size / 2, size / 2], tooltipAnchor: [0, -size / 2 - 2] })
}

function visitLeaves(layer: L.Layer, callback: (leaf: L.Layer) => void) {
  if (layer instanceof L.LayerGroup) layer.eachLayer(child => visitLeaves(child, callback))
  else callback(layer)
}
const names = new WeakMap<L.Layer, string>()

function MapInitializer({ onReady }: { onReady?: (map: L.Map) => void }) {
  const map = useMap()
  useEffect(() => { onReady?.(map) }, [map, onReady])
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

function CategoryLayer({ features, category, style, zIndex, onSelect, showLabels }: {
  features: FeatureItem[]; category: Category; style: LayerStyle; zIndex: number
  onSelect: MapViewProps["onSelect"]; showLabels?: boolean
}) {
  const map = useMap()
  const group = useRef<L.FeatureGroup | null>(null)
  const pane = layerPaneName(category)

  // A stable pane per category controls vectors and point icons together.
  useEffect(() => {
    const element = map.getPane(pane) || map.createPane(pane)
    element.style.zIndex = String(zIndex)
  }, [map, pane, zIndex])

  // Geometry changes rebuild this category's group. Styling, ordering, labels,
  // basemap and visibility do not recreate the group or the Leaflet map.
  useEffect(() => {
    const collection = L.featureGroup()
    for (const item of features) {
      const layer = L.geoJSON(toGeoJSON(item), {
        pane,
        pointToLayer: (_, latlng) => category === "Rumah" || category === "Tiang"
          ? L.marker(latlng, { pane, title: `${category}: ${item.name}`, keyboard: true, icon: L.divIcon({ className: "survey-house-marker", html: "" }) })
          : L.circleMarker(latlng, { pane }),
        onEachFeature: (_, featureLayer) => visitLeaves(featureLayer, leaf => {
          names.set(leaf, item.name)
          leaf.on("click", () => onSelect(item))
        }),
      })
      collection.addLayer(layer)
    }
    group.current = collection
    return () => { collection.remove(); collection.clearLayers(); group.current = null }
  }, [features, category, pane, map, onSelect])

  useEffect(() => {
    if (!group.current) return
    visitLeaves(group.current, leaf => {
      if (leaf instanceof L.Marker) {
        if (category === "Rumah" || category === "Tiang") leaf.setIcon(pointIcon(style, category))
      } else if (leaf instanceof L.CircleMarker) {
        leaf.setRadius(style.markerSize / 2)
        leaf.setStyle({ color: style.color, fillColor: style.color, fillOpacity: 0.85, weight: 2 })
      } else if (leaf instanceof L.Path) {
        leaf.setStyle({ color: style.color, fillColor: style.color, weight: style.lineWidth, fillOpacity: style.fillOpacity })
      }
    })
  }, [style, features, category, map, onSelect])

  useEffect(() => {
    if (!group.current) return
    if (style.visible) group.current.addTo(map)
    else group.current.remove()
  }, [style.visible, features, category, map, onSelect])

  useEffect(() => {
    if (!group.current) return
    visitLeaves(group.current, leaf => {
      leaf.unbindTooltip()
      if (showLabels) {
        const text = document.createElement("span")
        text.textContent = names.get(leaf) || ""
        leaf.bindTooltip(text)
      }
    })
  }, [showLabels, features, category, map, onSelect])
  return null
}

export default function MapView({ features, onSelect, onReady, showLabels, settings, plan, highlightedGroupId, onSelectGroup, onSelectHome, onHighlightGroup, onHoverGroup }: MapViewProps) {
  const grouped = useMemo(() => Object.fromEntries(categories.map(category => [category, features.filter(feature => feature.category === category)])) as Record<Category, FeatureItem[]>, [features])
  const base = baseMaps[settings.baseMap]
  return <MapContainer center={[-6.9147, 107.6098]} zoom={14} maxZoom={22} zoomControl={false} className="h-full w-full">
    <TileLayer key={settings.baseMap} attribution={base.attribution} url={base.url} maxNativeZoom={19} maxZoom={22} />
    <MapInitializer onReady={onReady} />
    {categories.map(category => <CategoryLayer key={category} category={category} features={grouped[category]} style={settings.layers[category]} zIndex={layerZIndex(settings.order, category)} onSelect={onSelect} showLabels={showLabels} />)}
    {plan && plan.groups.length > 0 && onSelectGroup && onSelectHome && onHighlightGroup && onHoverGroup && <PlanningMapLayers plan={plan} highlightedGroupId={highlightedGroupId || null} onSelectGroup={onSelectGroup} onSelectHome={onSelectHome} onHighlightGroup={onHighlightGroup} onHoverGroup={onHoverGroup} homeMarkerSize={settings.layers.Rumah.markerSize} />}
  </MapContainer>
}
