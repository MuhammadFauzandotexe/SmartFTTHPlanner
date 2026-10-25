"use client"
import { useEffect } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import { countFatsOnPole, type AllocationContext } from "@/lib/allocation-recommendations"
import { DEFAULT_MAX_FATS_PER_POLE } from "@/lib/ftth-planning"

export function PolePlacementLayer({context,onPick}:{context:AllocationContext;onPick:(poleId:string)=>void}) {
  const map=useMap()
  useEffect(()=>{
    const pane=map.getPane("pole-placement")||map.createPane("pole-placement")
    pane.style.zIndex="550"
    const layer=L.featureGroup().addTo(map)
    const limit=context.plan.maxFatsPerPole??DEFAULT_MAX_FATS_PER_POLE
    for(const pole of context.poles) {
      const count=countFatsOnPole(context,pole), full=count>=limit
      const tooltip=document.createElement("span")
      tooltip.textContent=`${pole.name} · ${count}/${limit} FAT${full?" · Batas tercapai":" · Klik untuk tambah FAT"}`
      const marker=L.circleMarker([pole.coordinates[1],pole.coordinates[0]],{pane:"pole-placement",radius:13,weight:4,color:full?"#b45309":"#047857",fillColor:full?"#fbbf24":"#34d399",fillOpacity:0.9,bubblingMouseEvents:false})
      marker.bindTooltip(tooltip).on("click",()=>onPick(pole.id))
      layer.addLayer(marker)
    }
    return()=>{layer.remove();layer.clearLayers()}
  },[map,context,onPick])
  return null
}
