"use client"
import {useEffect,useRef} from "react"
import {Button} from './ui/button'
import {Copy,X,Crosshair} from 'lucide-react'
import type {FeatureItem} from '@/lib/survey'
import type {FtthPlan} from '@/lib/ftth-planning'
export function SurveyDetails({feature,plan,onClose,onFocus,onConnect,canConnect,error,nearestPole}:{feature:FeatureItem;plan:FtthPlan|null;onClose:()=>void;onFocus:()=>void;onConnect:()=>void;canConnect:boolean;error:string;nearestPole?:{name:string;meters:number}|null}){
 const detail=useRef<HTMLElement>(null)
 useEffect(()=>{detail.current?.scrollIntoView({block:"nearest",behavior:"smooth"})},[feature.id])
 const group=plan?.groups.find(g=>g.homes.some(h=>h.id===feature.id)),drop=group?.candidate?.connections.find(c=>c.homeId===feature.id),unserved=plan?.unservedHomes.find(h=>h.home.id===feature.id)
 return <section ref={detail} aria-label="Informasi objek survei" className="space-y-3 border-t pt-3 text-xs"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{feature.category}</span><h3 className="break-words font-semibold">{feature.name}</h3><p className="break-all text-[10px] text-slate-400">ID: {feature.id}</p></div><Button size="icon-sm" variant="ghost" onClick={onClose} aria-label="Tutup detail objek"><X/></Button></div>
 {feature.category==='Rumah'&&<div className={`space-y-1 rounded-lg p-3 ${unserved?'bg-amber-50':'bg-emerald-50'}`}><p className="font-medium">{unserved?'Belum terlayani':group?'Terlayani dalam simulasi':'Belum dihitung'}</p>{unserved&&<p>{unserved.reason}</p>}{group&&<><p>FAT: <b>{group.candidate?.id||'—'}</b> · {group.id}</p><p>{drop?.method==='route'?'Panjang jalur terverifikasi':'Estimasi jarak lurus'}: <b>{drop?`${drop.distanceMeters.toLocaleString('id-ID',{maximumFractionDigits:1})} m`:'—'}</b></p></>}{unserved&&<Button size="sm" disabled={!canConnect} onClick={onConnect}>Sambungkan ke FAT</Button>}{unserved&&!canConnect&&<p>Hitung ulang layanan dari toolbar sebelum membuat sambungan baru.</p>}{error&&<p role="alert" className="text-red-700">{error}</p>}</div>}
 {nearestPole&&<p className="rounded bg-slate-50 p-2">Tiang terdekat: <b>{nearestPole.name}</b> · jarak lurus {nearestPole.meters.toFixed(1)} m</p>}
 <Button size="sm" variant="outline" onClick={onFocus}><Crosshair/>Fokus lokasi</Button>
 <dl className="space-y-2"><div><dt className="text-slate-500">Koordinat (lat, lon)</dt><dd className="font-mono">{feature.coords[0].toFixed(6)}, {feature.coords[1].toFixed(6)} <button aria-label="Salin koordinat objek" title="Salin koordinat" onClick={()=>navigator.clipboard.writeText(`${feature.coords[0]}, ${feature.coords[1]}`)}><Copy className="inline size-3"/></button></dd></div><div><dt className="text-slate-500">Sumber</dt><dd className="break-all">{feature.file} · {feature.kmlFile}</dd></div></dl>
 {!!Object.keys(feature.props||{}).length&&<details><summary className="cursor-pointer font-medium">Atribut survei</summary><dl className="mt-2 space-y-2">{Object.entries(feature.props||{}).map(([key,value])=><div className="rounded bg-slate-50 p-2" key={key}><dt className="break-all text-slate-500">{key}</dt><dd className="break-all">{value==null?'—':typeof value==='object'?JSON.stringify(value):String(value)}</dd></div>)}</dl></details>}
 </section>
}
