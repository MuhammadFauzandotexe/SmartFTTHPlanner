"use client"

import { useEffect, useMemo, useState } from "react"
import { CircleMarker, Marker, Pane, Polyline, Tooltip, useMap } from "react-leaflet"
import L from "leaflet"
import { visibleDropLabels, type PixelBox } from "@/lib/drop-label-layout"
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
  const [viewport, setViewport] = useState(0)
  useEffect(() => {
    let frame = 0
    const refresh = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setViewport(value => value + 1))
    }
    map.on("moveend zoomend resize", refresh)
    return () => {
      map.off("moveend zoomend resize", refresh)
      cancelAnimationFrame(frame)
    }
  }, [map])
  // Stable IDs reconcile old React-Leaflet layers; a new snapshot replaces old data.
  const routes = useMemo(() => [...new Map(drops.map(drop => [drop.id, drop])).values()], [drops])
  const labelData = useMemo(() => routes.flatMap(route => {
    if (!route.midpoint || !route.coordinates) return []
    const text = dropDistanceLabel(route)
    if (!text) return []
    const position: [number, number] = [route.midpoint[1], route.midpoint[0]]
    // Match the fixed-width CSS box, including padding and borders.
    const width = Math.max(64, text.length * 7 + 12)
    const icon = L.divIcon({ className: `drop-distance-label drop-distance-${route.status}${route.basis === "route" && route.status === "estimate" ? " drop-distance-unverified" : ""}`, html: `<span style="width:${width}px">${text}</span>`, iconSize: [width, 20], iconAnchor: [width / 2, 10] })
    return [{ route, position, icon, width }]
  }), [routes])
  const labels = useMemo(() => {
    const candidates = labelData.filter(({ route }) => shouldShowDropLabel(route, { showLabels, zoom: map.getZoom(), selectedFatId, selectedHouseId, selectedRouteId }))
    if (!candidates.length) return []
    const obstacles: PixelBox[] = []
    for (const route of showLabels ? routes : []) {
      // Protect house/FAT symbols; labels are hidden rather than shifted away.
      const positions = [route.house.coords, ...(route.coordinates?.length ? [[route.coordinates[0][1], route.coordinates[0][0]] as [number, number]] : [])]
      for (const position of positions) {
        const p = map.latLngToContainerPoint(position), radius = 16 * markerScale
        obstacles.push({ left: p.x - radius, right: p.x + radius, top: p.y - radius, bottom: p.y + radius })
      }
    }
    const visible = visibleDropLabels(candidates.map(label => {
      const p = map.latLngToContainerPoint(label.position)
      return { id: label.route.id, x: p.x, y: p.y, width: label.width, height: 20 }
    }), map.getSize(), selectedRouteId, obstacles)
    return candidates.filter(label => visible.has(label.route.id))
  }, [labelData, routes, showLabels, viewport, selectedFatId, selectedHouseId, selectedRouteId, markerScale, map])
  const visibleIds = new Set(labels.map(label => label.route.id))

  return <>
    <Pane name="drop-routes" style={{ zIndex: 405 }}>
      {routes.map(route => route.coordinates ? <Polyline key={route.id} positions={route.coordinates.map(p => [p[1], p[0]])}
        pathOptions={dropAppearance(route, selectedFatId, selectedRouteId)}
        eventHandlers={{ click: () => route.route && onSelect(route.route) }}>
        {!visibleIds.has(route.id) && <Tooltip sticky className="drop-hover-label">{dropDistanceLabel(route)}</Tooltip>}
      </Polyline> : null)}
    </Pane>
    <Pane name="drop-problems" style={{ zIndex: 420 }}>
      {routes.filter(route => route.status === "violation" || route.status === "unresolved").map(route => <CircleMarker key={route.id} center={route.house.coords} radius={13 * markerScale} interactive={false}
        pathOptions={{ color: "#dc2626", weight: 2, dashArray: "2 4", fill: false, opacity: selectedFatId && route.fatId !== selectedFatId ? 0.2 : 1 }} />)}
    </Pane>
    <Pane name="drop-distance-labels" style={{ zIndex: 450, pointerEvents: "none" }}>
      {labels.map(({ route, position, icon }) => <Marker key={route.id} position={position} icon={icon} interactive={false} keyboard={false} />)}
    </Pane>
  </>
}
