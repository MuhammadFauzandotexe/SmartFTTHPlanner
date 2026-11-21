"use client"

import { useMemo, useState } from "react"
import { CircleMarker, Marker, Pane, Polyline, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import type { DropRoute } from "@/lib/drop-plan"
import { dropAppearance, dropDistanceLabel, shouldShowDropLabel, type ReviewedDrop } from "@/lib/simulation-review"

type Props = {
  drops: ReviewedDrop[]
  showLabels: boolean
  markerScale?: number
  selectedFatId?: string
  selectedHouseId?: string
  selectedRouteId?: string
  onSelect: (route: DropRoute) => void
}

export default function DropRoutesLayer({ drops, showLabels, markerScale = 1, selectedFatId, selectedHouseId, selectedRouteId, onSelect }: Props) {
  const map = useMap()
  const [viewport, setViewport] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }))
  useMapEvents({ moveend: () => setViewport({ zoom: map.getZoom(), bounds: map.getBounds() }), zoomend: () => setViewport({ zoom: map.getZoom(), bounds: map.getBounds() }) })
  const labels = useMemo(() => {
    if (!showLabels) return []
    const occupied: { x: number; y: number }[] = []
    return drops.filter(route => shouldShowDropLabel(route, { showLabels, zoom: viewport.zoom, selectedFatId, selectedHouseId, selectedRouteId }))
      .sort((a, b) => Number(b.id === selectedRouteId) - Number(a.id === selectedRouteId) || a.id.localeCompare(b.id))
      .flatMap(route => {
        const position: [number, number] = [route.midpoint![1], route.midpoint![0]]
        if (!viewport.bounds.contains(position)) return []
        const pixel = map.latLngToContainerPoint(position)
        // Small screen-space offsets keep coincident labels readable while anchoring to the route midpoint.
        let offset = 0
        while (occupied.some(p => Math.abs(p.x - pixel.x) < 80 && Math.abs(p.y - (pixel.y + offset)) < 20)) offset += 20
        occupied.push({ x: pixel.x, y: pixel.y + offset })
        const text = dropDistanceLabel(route)!
        const icon = L.divIcon({ className: `drop-distance-label drop-distance-${route.status}${route.basis === "route" && route.status === "estimate" ? " drop-distance-unverified" : ""}`, html: `<span>${text}</span>`, iconSize: [80, 20], iconAnchor: [40, 10 - offset] })
        return [{ route, position, icon }]
      })
  }, [drops, showLabels, viewport, selectedFatId, selectedHouseId, selectedRouteId, map])

  return <>
    <Pane name="drop-routes" style={{ zIndex: 405 }}>
      {drops.map(route => route.coordinates ? <Polyline key={route.id} positions={route.coordinates.map(p => [p[1], p[0]])}
        pathOptions={dropAppearance(route, selectedFatId, selectedRouteId)}
        eventHandlers={{ click: () => route.route && onSelect(route.route) }} /> : null)}
    </Pane>
    <Pane name="drop-problems" style={{ zIndex: 420 }}>
      {drops.filter(route => route.status === "violation" || route.status === "unresolved").map(route => <CircleMarker key={route.id} center={route.house.coords} radius={13 * markerScale} interactive={false}
        pathOptions={{ color: "#dc2626", weight: 2, dashArray: "2 4", fill: false, opacity: selectedFatId && route.fatId !== selectedFatId ? 0.2 : 1 }} />)}
    </Pane>
    <Pane name="drop-distance-labels" style={{ zIndex: 450, pointerEvents: "none" }}>
      {labels.map(({ route, position, icon }) => <Marker key={route.id} position={position} icon={icon} interactive={false} keyboard={false} />)}
    </Pane>
  </>
}
