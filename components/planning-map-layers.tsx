"use client"

import { useEffect, useRef } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import type { FtthPlan, HomeGroup, PlanningPoint } from "@/lib/ftth-planning"

type Props = {
  plan: FtthPlan
  highlightedGroupId: string | null
  onSelectGroup: (id: string) => void
  onSelectHome: (id: string) => void
  onHighlightGroup: (id: string) => void
  onHoverGroup: (id: string | null) => void
  homeMarkerSize: number
}
type Overlays = { homes: L.FeatureGroup; fats: L.FeatureGroup; links: L.FeatureGroup }
type Highlight = {
  rings: { layer: L.CircleMarker; group: HomeGroup }[]
  links: { layer: L.Polyline; group: HomeGroup }[]
  identities: { layer: L.Marker; group: HomeGroup; element: HTMLElement }[]
  fats: { layer: L.Marker; groups: HomeGroup[]; element: HTMLElement }[]
}
const emptyHighlight = (): Highlight => ({ rings: [], links: [], identities: [], fats: [] })
const latLng = (point: PlanningPoint): L.LatLngTuple => [point.coordinates[1], point.coordinates[0]]
const text = (value: string) => { const span = document.createElement("span"); span.textContent = value; return span }

/** Planning overlays are separate from survey layers and never modify the plan. */
export function PlanningMapLayers({ plan, highlightedGroupId, onSelectGroup, onSelectHome, onHighlightGroup, onHoverGroup, homeMarkerSize }: Props) {
  const map = useMap()
  const overlays = useRef<Overlays | null>(null)
  const highlight = useRef<Highlight>(emptyHighlight())
  useEffect(() => {
    for (const [name, zIndex] of [["planning-links", 475], ["planning-homes", 480], ["planning-fats", 490]] as const) {
      const pane = map.getPane(name) || map.createPane(name)
      pane.style.zIndex = String(zIndex)
    }
    const layers: Overlays = { homes: L.featureGroup().addTo(map), fats: L.featureGroup().addTo(map), links: L.featureGroup().addTo(map) }
    overlays.current = layers
    const control = L.control.layers({}, {
      "Rencana · Kelompok rumah": layers.homes,
      "Rencana · Kandidat FAT": layers.fats,
      "Rencana · Hubungan layanan (bukan kabel)": layers.links,
    }, { position: "bottomleft", collapsed: false }).addTo(map)
    control.getContainer()?.classList.add("ftth-planning-control")
    return () => {
      control.remove()
      for (const layer of Object.values(layers)) { layer.remove(); layer.clearLayers() }
      overlays.current = null
      highlight.current = emptyHighlight()
    }
  }, [map])

  useEffect(() => {
    const layers = overlays.current
    if (!layers) return
    for (const layer of Object.values(layers)) layer.clearLayers()
    highlight.current = emptyHighlight()
    const byPole = new Map<string, HomeGroup[]>()
    for (const group of plan.groups) {
      for (const home of group.homes) {
        const marker = L.circleMarker(latLng(home), {
          pane: "planning-homes", radius: 14, color: group.color, fillColor: group.color, fillOpacity: 0.2, weight: 2,
        }).bindTooltip(text(`${group.id} · ${home.name} · ID ${home.sourceId}`)).on("click", () => onSelectHome(home.id))
        layers.homes.addLayer(marker)
        highlight.current.rings.push({ layer: marker, group })
        if (group.candidate) {
          const link = L.polyline([latLng(group.candidate.pole), latLng(home)], {
            pane: "planning-links", color: group.color, weight: 1.5, opacity: 0.65, dashArray: "5 6", interactive: false,
          })
          layers.links.addLayer(link)
          highlight.current.links.push({ layer: link, group })
        }
      }
      // A permanent group identity works for single homes and collinear groups too.
      if (group.homes.length) {
        const label = document.createElement("span")
        label.className = "planning-group-identity"
        label.style.backgroundColor = group.color
        const open = document.createElement("button")
        open.type = "button"
        open.className = "planning-group-open"
        open.title = `Lihat detail kelompok ${group.id}`
        open.ariaLabel = open.title
        open.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><path d="m10 8-4 7m8-7 4 7M8 18h8"/></svg>'
        open.addEventListener("click", event => { event.stopPropagation(); onSelectGroup(group.id) })
        const name = document.createElement("button")
        name.type = "button"
        name.className = "planning-group-name"
        name.textContent = group.id
        name.title = `Sorot kelompok ${group.id}; klik lagi untuk membatalkan`
        name.ariaLabel = name.title
        name.addEventListener("click", event => { event.stopPropagation(); onHighlightGroup(group.id) })
        name.addEventListener("mouseenter", () => onHoverGroup(group.id))
        name.addEventListener("mouseleave", () => onHoverGroup(null))
        name.addEventListener("focus", () => onHoverGroup(group.id))
        name.addEventListener("blur", () => onHoverGroup(null))
        label.appendChild(open)
        label.appendChild(name)
        const identity = L.marker(latLng(group.homes[0]), {
          pane: "planning-homes", keyboard: false, title: `Kelompok ${group.id}: ${group.homes.length} rumah`,
          icon: L.divIcon({ className: "planning-label-marker", html: label, iconSize: [72, 24], iconAnchor: [-12, 25] }),
        })
        layers.homes.addLayer(identity)
        highlight.current.identities.push({ layer: identity, group, element: label })
      }
      if (group.candidate) {
        const poleGroups = byPole.get(group.candidate.pole.id) || []
        poleGroups.push(group)
        byPole.set(group.candidate.pole.id, poleGroups)
      }
    }
    // Shared poles use one map marker with a selector for every associated FAT.
    for (const groups of byPole.values()) {
      const pole = groups[0].candidate!.pole
      const symbol = text(groups.length > 1 ? `F×${groups.length}` : "FAT")
      symbol.className = "planning-fat-symbol"
      const popup = document.createElement("div")
      const heading = document.createElement("p")
      heading.textContent = `Kandidat FAT pada ${pole.name} · ID ${pole.sourceId}`
      popup.appendChild(heading)
      const marker = L.marker(latLng(pole), {
        pane: "planning-fats", title: `${groups.length} kandidat FAT pada ${pole.name}`,
        icon: L.divIcon({ className: "planning-fat-marker", html: symbol, iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16] }),
      })
      for (const group of groups) {
        const button = document.createElement("button")
        button.type = "button"
        button.className = "planning-fat-choice"
        button.textContent = `${group.candidate!.id} · ${group.id} · ${group.homes.length} rumah`
        button.addEventListener("click", () => { onSelectGroup(group.id); marker.closePopup() })
        popup.appendChild(button)
      }
      marker.bindPopup(popup)
      marker.on("click", () => { if (groups.length === 1) onSelectGroup(groups[0].id) })
      layers.fats.addLayer(marker)
      highlight.current.fats.push({ layer: marker, groups, element: symbol })
    }
    return () => {
      map.closePopup()
      for (const layer of Object.values(layers)) layer.clearLayers()
      highlight.current = emptyHighlight()
    }
  }, [plan, map, onSelectGroup, onSelectHome, onHighlightGroup, onHoverGroup])

  useEffect(() => {
    const focused = highlightedGroupId !== null
    for (const { layer, group } of highlight.current.rings) {
      const active = group.id === highlightedGroupId
      const dimmed = focused && !active
      layer.setRadius(homeMarkerSize / 2 + (active ? 6 : 3))
      layer.setStyle({ weight: active ? 4 : dimmed ? 1 : 2, opacity: dimmed ? 0.2 : 1, fillOpacity: active ? 0.3 : dimmed ? 0.025 : 0.15 })
      if (active) layer.bringToFront()
    }
    for (const { layer, group } of highlight.current.links) {
      const active = group.id === highlightedGroupId
      layer.setStyle({ weight: active ? 4 : 1.5, opacity: active ? 1 : focused ? 0.12 : 0.55 })
      if (active) layer.bringToFront()
    }
    for (const { layer, group, element } of highlight.current.identities) {
      const active = group.id === highlightedGroupId
      layer.setOpacity(focused && !active ? 0.4 : 1)
      layer.setZIndexOffset(active ? 1000 : 0)
      element.style.transform = active ? "scale(1.12)" : "none"
      element.style.boxShadow = active ? "0 0 0 3px white, 0 2px 10px rgb(15 23 42 / 50%)" : ""
      const button = element.querySelector(".planning-group-name")
      button?.setAttribute("aria-pressed", String(active))
    }
    for (const { layer, groups, element } of highlight.current.fats) {
      const active = groups.some(group => group.id === highlightedGroupId)
      layer.setOpacity(focused && !active ? 0.35 : 1)
      layer.setZIndexOffset(active ? 1000 : 0)
      element.style.boxShadow = active ? "0 0 0 3px white, 0 2px 10px rgb(15 23 42 / 50%)" : ""
    }
  }, [highlightedGroupId, homeMarkerSize, plan, onSelectGroup, onSelectHome, onHighlightGroup, onHoverGroup])
  return null
}
