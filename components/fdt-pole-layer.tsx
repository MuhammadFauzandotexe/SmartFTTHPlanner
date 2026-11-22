"use client"
import { useEffect } from "react"
import L from "leaflet"
import { CircleMarker, Marker, Tooltip } from "react-leaflet"
import type { FeatureItem } from "@/lib/import-survey"
export default function FdtPoleLayer({ poles, originId, targetId, onSelect }: { poles: FeatureItem[]; originId: string | null; targetId: string; onSelect: (id: string) => void }) {
  useEffect(() => {
    // Focus events do not belong to Leaflet's event map; bind them on SVG paths.
    const nodes = document.querySelectorAll<SVGElement>(".fdt-selection-pole")
    const cleanups = Array.from(nodes).map(node => {
      const show = () => node.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
      const hide = () => node.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }))
      node.addEventListener("focus", show); node.addEventListener("blur", hide)
      return () => { node.removeEventListener("focus", show); node.removeEventListener("blur", hide) }
    })
    return () => cleanups.forEach(cleanup => cleanup())
  }, [poles, originId, targetId])
  const preview = poles.find(p => p.id === targetId)
  return <>{preview && <Marker position={preview.coords} interactive={false} keyboard={false} icon={L.divIcon({ className: "fdt-preview-icon", html: '<span style="display:grid;place-items:center;width:28px;height:28px;background:white;border:2px dashed #0284c7;color:#0284c7;font-weight:bold;font-size:10px;box-sizing:border-box;border-radius:8px">FDT</span>', iconSize: [28, 28], iconAnchor: [14, 14] })} />}{poles.map(pole => <CircleMarker key={pole.id} center={pole.coords} radius={pole.id === targetId ? 14 : 10} pathOptions={{ className: "fdt-selection-pole", color: pole.id === targetId ? "#0284c7" : pole.id === originId ? "#9333ea" : "#047857", fillColor: "white", fillOpacity: 1, weight: pole.id === targetId ? 5 : 3, dashArray: pole.id === originId ? "4 3" : undefined }} eventHandlers={{ click: () => onSelect(pole.id), add: event => { const node = event.target.getElement(); if (node) { node.setAttribute("tabindex", "0"); node.setAttribute("role", "button"); node.setAttribute("aria-label", `Tiang ${pole.id}${pole.id === originId ? " · lokasi saat ini" : ""}`) } }, keypress: event => { if (event.originalEvent.key === "Enter" || event.originalEvent.key === " ") { event.originalEvent.preventDefault(); onSelect(pole.id) } } }}><Tooltip permanent={pole.id === targetId || pole.id === originId}>{pole.id}{pole.id === originId ? " · Lokasi saat ini (garis putus)" : pole.id === targetId ? " · Kandidat / preview FDT ◇" : " · Tiang"}</Tooltip></CircleMarker>)}</>
}
