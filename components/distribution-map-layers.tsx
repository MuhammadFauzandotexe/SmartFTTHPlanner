"use client"
import { useEffect, useRef } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import { connectionProblem, createConnection, distributionIsStale, type DistributionContext, type DistributionState } from "@/lib/distribution"
import type { ConnectionEditor } from "./distribution-panel"

type Props={context:DistributionContext;state:DistributionState;editor:ConnectionEditor|null;onPickPole:(id:string)=>void;selectedRouteKey:string|null;selectedSegmentId:string|null;onSelectSegment:(id:string)=>void;onSelectRoute:(key:string)=>void}
const label=(value:string)=>{const span=document.createElement("span");span.textContent=value;return span}
const positions=(coordinates:number[][]):L.LatLngTuple[]=>coordinates.map(p=>[p[1],p[0]])
type Layers={connections:L.FeatureGroup;routes:L.FeatureGroup;markers:L.FeatureGroup;editor:L.FeatureGroup}
export function DistributionMapLayers({context:ctx,state,editor,onPickPole,selectedRouteKey,selectedSegmentId,onSelectSegment,onSelectRoute}:Props){
  const map=useMap(),layers=useRef<Layers|null>(null),paths=useRef(new Map<string,{line:L.Polyline;halo:L.Polyline}>()),connectionPaths=useRef(new Map<string,L.Polyline>())
  const stale=distributionIsStale(ctx,state)
  useEffect(()=>{
    for(const [id,z] of [["distribution-connections",430],["distribution-routes",450],["distribution-markers",510],["distribution-editor",560]] as const){const pane=map.getPane(id)||map.createPane(id);pane.style.zIndex=String(z)}
    const current:Layers={connections:L.featureGroup().addTo(map),routes:L.featureGroup().addTo(map),markers:L.featureGroup().addTo(map),editor:L.featureGroup().addTo(map)}
    layers.current=current
    const control=L.control.layers({}, {"Distribusi · Koneksi tersedia/kandidat":current.connections,"Distribusi · Hasil rute":current.routes,"Distribusi · Sumber & masalah":current.markers},{position:"bottomleft",collapsed:true}).addTo(map)
    return()=>{control.remove();Object.values(current).forEach(g=>{g.remove();g.clearLayers()});layers.current=null;paths.current.clear();connectionPaths.current.clear()}
  },[map])
  useEffect(()=>{
    const current=layers.current;if(!current)return
    for(const group of [current.connections,current.routes,current.markers])group.clearLayers()
    paths.current.clear();connectionPaths.current.clear()
    const poles=new Map(ctx.poles.map(p=>[p.id,p]))
    for(const segment of state.connections){
      if(connectionProblem(segment,poles))continue
      const rejected=segment.permission==="blocked"||segment.permission==="rejected",candidate=segment.permission==="unverified"
      const line=L.polyline(positions(segment.geometry.coordinates),{pane:"distribution-connections",color:rejected?"#dc2626":candidate?"#a16207":"#64748b",weight:2,opacity:segment.active?.75:.3,dashArray:rejected?"8 5":candidate?"3 7":!segment.active?"1 6":undefined})
      line.bindTooltip(label(`${segment.id} · ${segment.lengthMeters.toFixed(1)} m · ${segment.permission} · ${segment.active?"aktif":"nonaktif"}${candidate?" · Kandidat/belum diverifikasi":""}`),{permanent:false}).on("click",()=>onSelectSegment(segment.id))
      current.connections.addLayer(line);connectionPaths.current.set(segment.id,line)
    }
    for(const segment of state.result?.selectedConnections||[]){
      const points=positions(segment.geometry.coordinates)
      const halo=L.polyline(points,{pane:"distribution-routes",color:"#fef3c7",weight:13,opacity:0,interactive:false})
      const line=L.polyline(points,{pane:"distribution-routes",color:"#2563eb",weight:5,opacity:stale?.45:.9,dashArray:stale?"9 7":undefined})
      const usage=state.result!.usage[segment.id]
      line.bindTooltip(label(`Distribusi ${segment.id} · ${segment.lengthMeters.toFixed(1)} m · FAT: ${usage?.fatIds.join(", ")||"—"}${(usage?.sourceIds.length||0)>1?" · Bentang lintas sumber (bukan bukti sambungan optik)":""}${stale?" · Perlu dihitung ulang":""}`)).on("click",()=>onSelectSegment(segment.id))
      current.routes.addLayer(halo);current.routes.addLayer(line);paths.current.set(segment.id,{line,halo})
    }
    for(const source of state.sources){const pole=poles.get(source.poleId);if(!pole)continue
      const text=label(source.kind==="FDT"?"FDT":"SUMBER ?");text.className="distribution-source-marker"
      current.markers.addLayer(L.marker([pole.coordinates[1],pole.coordinates[0]],{pane:"distribution-markers",icon:L.divIcon({className:"distribution-marker",html:text,iconSize:[65,24],iconAnchor:[32,12]})}).bindTooltip(label(`${source.name} · ${source.kind==="temporary"?"sumber sementara":"FDT survei"} · tiang ${pole.name}`)))
    }
    for(const route of state.result?.routes||[]) if(route.status!=="success"){
      const fat=ctx.fats.find(f=>f.id===route.fatId),pole=route.targetPoleId?poles.get(route.targetPoleId):undefined,coords=pole?.coordinates||fat?.coordinates
      if(!coords)continue
      const symbol=label("! FAT");symbol.className="distribution-problem-marker"
      current.markers.addLayer(L.marker([coords[1],coords[0]],{pane:"distribution-markers",title:`${route.fatId}: masalah distribusi`,icon:L.divIcon({className:"distribution-marker",html:symbol,iconSize:[48,24],iconAnchor:[24,28]})}).bindTooltip(label(`${route.fatId} · ${route.status==="unreachable"?"Tidak terjangkau":"Input bermasalah"}${stale?" · hasil lama":""} · ${route.reason}`)).on("click",()=>onSelectRoute(route.key)))
    }
    return()=>{current.connections.clearLayers();current.routes.clearLayers();current.markers.clearLayers();paths.current.clear();connectionPaths.current.clear()}
  },[map,ctx,state.connections,state.sources,state.result,stale,onSelectSegment,onSelectRoute])
  useEffect(()=>{
    const ids=new Set(state.result?.routes.find(r=>r.key===selectedRouteKey)?.segmentIds||[])
    for(const [id,{line,halo}] of paths.current){const selected=ids.has(id)||id===selectedSegmentId;line.setStyle({weight:selected?8:5,color:selected?"#1d4ed8":"#2563eb"});halo.setStyle({opacity:selected?.95:0});if(selected){halo.bringToFront();line.bringToFront()}}
    for(const [id,path] of connectionPaths.current)path.setStyle({weight:id===selectedSegmentId?5:2})
  },[selectedRouteKey,selectedSegmentId,state.result,ctx,state.connections,state.sources,stale,onSelectSegment,onSelectRoute])
  useEffect(()=>{
    const current=layers.current;if(!current)return
    current.editor.clearLayers()
    if(!editor)return
    for(const pole of ctx.poles){const selected=pole.id===editor.from||pole.id===editor.to
      current.editor.addLayer(L.circleMarker([pole.coordinates[1],pole.coordinates[0]],{pane:"distribution-editor",radius:selected?13:9,color:selected?"#ea580c":"#047857",fillColor:"#34d399",fillOpacity:.8,weight:3,bubblingMouseEvents:false}).bindTooltip(label(`Klik tiang ${pole.name}`)).on("click",()=>onPickPole(pole.id)))
    }
    if(editor.from&&editor.to){try{const a=ctx.poles.find(p=>p.id===editor.from),b=ctx.poles.find(p=>p.id===editor.to);if(a&&b){const preview=createConnection("PREVIEW",a,b);current.editor.addLayer(L.polyline(positions(preview.geometry.coordinates),{pane:"distribution-editor",color:"#059669",dashArray:"4 8",weight:4,interactive:false}).bindTooltip(label(`Preview ${preview.lengthMeters.toFixed(1)} m · belum disimpan`),{permanent:true,direction:"center"}))}}catch{/* panel displays validation error */}}
    return()=>{current.editor.clearLayers()}
  },[ctx,editor,map,onPickPole])
  return null
}
