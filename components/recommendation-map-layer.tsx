"use client"
import { useEffect } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import type { Proposal } from "@/lib/allocation-recommendations"

/** Only the selected pending proposal is previewed. Links are service relationships, not routed cable. */
export function RecommendationMapLayer({proposal,onSelect}:{proposal:Proposal;onSelect?:(p:Proposal)=>void}) {
  const map=useMap()
  useEffect(()=>{
    const pane=map.getPane("allocation-preview")||map.createPane("allocation-preview")
    pane.style.zIndex="495"
    const layer=L.featureGroup().addTo(map)
    const pole:L.LatLngTuple=[proposal.target.pole.coordinates[1],proposal.target.pole.coordinates[0]]
    const label=document.createElement("span")
    label.textContent=proposal.type==="ASSIGN_EXISTING_FAT"?"USULAN → FAT":"FAT USULAN ?"
    label.style.cssText="display:block;background:white;border:2px dashed #a16207;color:#854d0e;border-radius:6px;padding:3px;font-size:10px;white-space:nowrap"
    const marker=L.marker(pole,{pane:"allocation-preview",title:"FAT provisional — belum aktif",icon:L.divIcon({className:"allocation-provisional",html:label,iconSize:[100,24],iconAnchor:[50,12]})})
    const tooltip=document.createElement("span");tooltip.textContent=`Usulan ${proposal.target.id} · belum aktif · hubungan layanan, bukan kabel aktual`
    marker.bindTooltip(tooltip).on("click",()=>onSelect?.(proposal));layer.addLayer(marker)
    for(const home of proposal.homes){
      const homePoint:L.LatLngTuple=[home.coordinates[1],home.coordinates[0]]
      layer.addLayer(L.polyline([pole,homePoint],{pane:"allocation-preview",color:"#a16207",weight:3,dashArray:"2 9",interactive:false}))
      const tip=document.createElement("span");tip.textContent=`${home.name} · diusulkan, belum terlayani aktif`
      layer.addLayer(L.circleMarker(homePoint,{pane:"allocation-preview",radius:18,color:"#a16207",weight:2,fillOpacity:0,dashArray:"2 9"}).bindTooltip(tip))
    }
    return()=>{layer.remove();layer.clearLayers()}
  },[map,proposal,onSelect])
  return null
}
