"use client"

import { useMemo, type ReactNode } from "react"
import { CircleMarker, Marker } from "react-leaflet"
import L from "leaflet"

export default function SurveyPointMarker({ kind, position, color, scale = 1, highlighted = false, dimmed = false, unserved = false, focused = false, title, onClick, children }: {
  kind: "house" | "fat" | "fdt" | "pole" | "candidate" | "other"
  position: [number, number]; color: string; highlighted?: boolean; dimmed?: boolean; unserved?: boolean
  scale?: number; focused?: boolean
  title: string; onClick: () => void; children?: ReactNode
}) {
  const icon = useMemo(() => {
    const size = Math.round((kind === "fdt" ? highlighted || focused ? 32 : 28 : kind === "fat" && highlighted ? 28 : 22) * scale)
    const html = kind === "fdt" ? `<span class="survey-fdt-symbol${highlighted || focused ? " survey-fdt-highlighted" : ""}" style="width:${size}px;height:${size}px;font-size:${Math.max(8, 10 * scale)}px;">FDT</span>` : kind === "fat" ? `<span class="survey-fat-symbol" style="background:${color};width:${size}px;height:${size}px;font-size:${Math.max(8, 11 * scale)}px;${highlighted ? `box-shadow:0 0 0 ${3 * scale}px #fde68a;` : ""}">F</span>` :
      `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 11 12 2 22 11 20 11 20 22 4 22 4 11Z" fill="${unserved ? "#fff" : color}" stroke="${unserved ? "#dc2626" : highlighted ? "#831843" : "#fff"}" stroke-width="2"/>${unserved ? '<path d="m8 12 8 7m0-7-8 7" stroke="#dc2626" stroke-width="2"/>' : '<path d="M10 22v-7h4v7" fill="white"/>'}</svg>`
    return L.divIcon({ className: `survey-point-icon${focused ? " survey-point-focused" : ""}`, html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
  }, [kind, highlighted, color, unserved, scale, focused])
  const opacity = dimmed ? kind === "fdt" ? 0.8 : 0.2 : 1
  if (kind === "house" || kind === "fat" || kind === "fdt") return <Marker pane="survey-point-markers" position={position} icon={icon} opacity={opacity} title={title} zIndexOffset={kind === "fdt" ? highlighted || focused ? 1300 : 1200 : 0}
    eventHandlers={{ click: onClick }}>{children}</Marker>
  return <CircleMarker pane="survey-point-markers" center={position} radius={(kind === "pole" ? 4 : kind === "candidate" ? 8 : 6) * scale}
    pathOptions={{ color, fillColor: color, opacity, fillOpacity: kind === "candidate" ? 0.2 * opacity : 0.85 * opacity, weight: (highlighted ? 4 : 2) * scale }} eventHandlers={{ click: onClick }}>{children}</CircleMarker>
}
