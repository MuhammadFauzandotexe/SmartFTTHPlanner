"use client"

import { useEffect } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import { planningDistance, type FtthPlan, type HomeGroup, type PlanningPoint } from "@/lib/ftth-planning"

type Props = { plan: FtthPlan; home: PlanningPoint; onPick: (groupId: string) => void }
const latLng = (p: PlanningPoint): L.LatLngTuple => [p.coordinates[1],p.coordinates[0]]
const text = (value: string) => { const span=document.createElement("span");span.textContent=value;return span }
/** Temporary isolated picker; does not change survey visibility preferences or the map camera. */
export function FatSelectionLayer({plan,home,onPick}: Props) {
  const map=useMap()
  useEffect(()=>{
    const pane=map.getPane("fat-selection")||map.createPane("fat-selection")
    pane.style.zIndex="495"
    const layer=L.featureGroup().addTo(map)
    layer.addLayer(L.circleMarker(latLng(home),{pane:"fat-selection",radius:12,color:"#2563eb",fillOpacity:0.3,weight:3}).bindTooltip(text(`Rumah tujuan: ${home.name}`),{permanent:true,direction:"bottom"}))
    const poles=new Map<string,HomeGroup[]>()
    for(const group of plan.groups) {
      if(!group.candidate || group.homes.length+(group.occupiedPorts||0)>=(group.capacity??plan.fatPorts)) continue
      const groups=poles.get(group.candidate.pole.id)||[]
      groups.push(group);poles.set(group.candidate.pole.id,groups)
    }
    for(const groups of poles.values()) {
      const pole=groups[0].candidate!.pole
      const symbol=text(groups.length>1?`FAT ×${groups.length}`:"FAT +")
      symbol.className="planning-fat-symbol"
      const marker=L.marker(latLng(pole),{pane:"fat-selection",title:`Pilih FAT pada ${pole.name}`,icon:L.divIcon({className:"planning-fat-marker",html:symbol,iconSize:[48,28],iconAnchor:[24,14]})})
      const description=(g:HomeGroup)=>`${g.candidate!.id} · ${(g.capacity??plan.fatPorts)-g.homes.length-(g.occupiedPorts||0)} port tersedia · ${planningDistance(home,pole).toLocaleString("id-ID",{maximumFractionDigits:1})} m`
      marker.bindTooltip(text(groups.map(description).join(" / ")),{permanent:true,direction:"top"})
      if(groups.length===1) marker.on("click",()=>onPick(groups[0].id))
      else {
        const popup=document.createElement("div")
        popup.appendChild(text("Pilih FAT tujuan:"))
        for(const group of groups) {
          const button=document.createElement("button")
          button.type="button";button.className="planning-fat-choice";button.textContent=description(group)
          button.addEventListener("click",()=>onPick(group.id));popup.appendChild(button)
        }
        marker.bindPopup(popup,{autoPan:false})
      }
      layer.addLayer(marker)
    }
    return()=>{map.closePopup();layer.remove();layer.clearLayers()}
  },[map,plan,home,onPick])
  return null
}
