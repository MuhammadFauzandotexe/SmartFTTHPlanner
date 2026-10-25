"use client"
import {useState} from 'react'
import {Search} from 'lucide-react'
import {Input} from './ui/input'
import {Button} from './ui/button'
import type {FeatureItem} from '@/lib/survey'
import type {FtthPlan} from '@/lib/ftth-planning'
type Props={activity:'data'|'fat';features:FeatureItem[];plan:FtthPlan|null;selectedId:string|null;groupId:string|null;onSelect:(feature:FeatureItem)=>void;onSelectGroup:(id:string)=>void}
export function ObjectExplorer({activity,features,plan,selectedId,groupId,onSelect,onSelectGroup}:Props){
 const [query,setQuery]=useState(''),[kind,setKind]=useState(activity==='fat'?'groups':'all'),[status,setStatus]=useState('all'),[limit,setLimit]=useState(100)
 const served=new Set(plan?.groups.flatMap(g=>g.homes.map(h=>h.id))||[]),unserved=new Set(plan?.unservedHomes.map(h=>h.home.id)||[])
 const search=(...values:string[])=>values.join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())
 const groups=(plan?.groups||[]).filter(g=>search(g.id,g.candidate?.id||'',g.candidate?.pole.name||'')&&(status==='all'||(status==='spare'?g.homes.length+(g.occupiedPorts||0)<(g.capacity??plan!.fatPorts):status==='full'?g.homes.length+(g.occupiedPorts||0)>=(g.capacity??plan!.fatPorts):true)))
 const objects=features.filter(f=>(kind==='all'||f.category===kind)&&search(f.name,f.id,String(f.props?.POLE_ID||f.props?.HOME_ID||''))&&(status==='all'||(status==='unserved'?unserved.has(f.id):status==='served'?served.has(f.id):true)))
 const count=kind==='groups'?groups.length:objects.length
 return <section aria-label={activity==='fat'?'Explorer FAT dan layanan':'Explorer data survei'} className="space-y-2">
 <div className="relative"><Search className="absolute left-2 top-2.5 size-4 text-slate-400"/><Input className="pl-8 text-xs" aria-label="Cari objek" placeholder="Cari nama, FAT, tiang, atau ID…" value={query} onChange={e=>{setQuery(e.target.value);setLimit(100)}}/></div>
 <div className="grid grid-cols-2 gap-2"><select aria-label="Jenis objek" className="rounded border p-2 text-xs" value={kind} onChange={e=>{setKind(e.target.value);setStatus('all');setLimit(100)}}>{activity==='fat'&&<option value="groups">FAT / kelompok</option>}<option value="all">Semua data</option>{['Rumah','Tiang','FAT','FDT','Jalur kabel','Belum dikategorikan'].map(k=><option key={k} value={k}>{k}</option>)}</select><select aria-label="Status objek" className="rounded border p-2 text-xs" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Semua status</option>{kind==='groups'?<><option value="spare">Port tersedia</option><option value="full">Port penuh</option></>:<><option value="unserved">Rumah belum terlayani</option><option value="served">Rumah terlayani</option></>}</select></div>
 <p className="text-[11px] text-slate-500">{count} hasil · pencarian tidak mengubah tampilan peta</p>
 <ul className="workspace-object-list">{kind==='groups'?groups.slice(0,limit).map(g=><li key={g.id}><button className="workspace-object-row" aria-pressed={groupId===g.id} onClick={()=>onSelectGroup(g.id)}><span className="flex items-center gap-2 font-medium"><span className="size-2 rounded-full" style={{backgroundColor:g.color}}/>{g.candidate?.id||g.id}</span><span className="block text-[11px] text-slate-500">{g.candidate?.pole.name||'Tiang belum tersedia'} · {g.homes.length+(g.occupiedPorts||0)}/{g.capacity??plan!.fatPorts} port{g.locked?' · Terkunci':''}</span></button></li>):objects.slice(0,limit).map(f=><li key={f.id}><button className="workspace-object-row" aria-pressed={selectedId===f.id} onClick={()=>onSelect(f)}><span className="font-medium">{f.name}</span><span className="block text-[11px] text-slate-500">{f.category}{f.category==='Rumah'?unserved.has(f.id)?' · Belum terlayani':served.has(f.id)?' · Terlayani':' · Belum dihitung':''}</span></button></li>)}</ul>
 {!count&&<p className="rounded bg-slate-50 p-3 text-xs">Tidak ada objek yang cocok. Impor data atau ubah pencarian/filter.</p>}
 {count>limit&&<Button size="sm" variant="outline" onClick={()=>setLimit(n=>n+100)}>Tampilkan 100 berikutnya</Button>}
 </section>
}
