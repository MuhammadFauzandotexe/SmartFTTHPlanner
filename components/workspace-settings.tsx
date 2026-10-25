"use client"
import {useEffect,useRef,useState} from 'react'
import {X,RotateCcw} from 'lucide-react'
import {Button} from './ui/button'
import {Input} from './ui/input'
import {defaultWorkspaceConfiguration,validateWorkspaceConfiguration,type WorkspaceConfiguration} from '@/lib/workspace'
export function WorkspaceSettings({configuration,onApply,onClose}:{configuration:WorkspaceConfiguration;onApply:(next:WorkspaceConfiguration)=>void;onClose:()=>void}){
 const [draft,setDraft]=useState({...configuration}),[error,setError]=useState('')
 const close=useRef<HTMLButtonElement>(null)
 useEffect(()=>{if(typeof document==='undefined')return;const previous=document.activeElement as HTMLElement|null;close.current?.focus();return()=>previous?.focus?.()},[])
 const defaults=defaultWorkspaceConfiguration()
 const field=(key:keyof WorkspaceConfiguration,label:string,unit:string,description:string,min:number,max?:number)=><label className="block space-y-1 text-xs"><span className="font-medium">{label} ({unit})</span><Input type="number" aria-label={label} min={min} max={max} step={key==='maxDropLengthMeters'||key==='candidateRadiusMeters'?'any':1} value={draft[key]} onChange={e=>setDraft({...draft,[key]:Number(e.target.value)})}/><span className="block text-[11px] text-slate-500">{description} Default aplikasi: {defaults[key]} {unit}.{draft[key]!==defaults[key]?' Nilai diubah dari default.':''}</span></label>
 return <div className="workspace-modal" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section role="dialog" aria-modal="true" aria-labelledby="workspace-settings-title" className="workspace-settings" onKeyDown={e=>{
  if(e.key==='Escape'){e.stopPropagation();onClose()}
  if(e.key==='Tab'){const focusable=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
 }}>
 <header className="flex items-center justify-between border-b p-4"><div><h2 id="workspace-settings-title" className="font-semibold">Pengaturan perencanaan</h2><p className="text-xs text-slate-500">Konfigurasi saja · tidak menjalankan perhitungan</p></div><Button ref={close} variant="ghost" size="icon-sm" onClick={onClose} aria-label="Tutup pengaturan"><X/></Button></header>
 <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
 <fieldset className="space-y-3"><legend className="mb-2 text-sm font-semibold">Layanan FAT</legend>{field('fatPorts','Kapasitas FAT','port','Satu rumah memakai satu port. Mengubah nilai memerlukan hitung ulang layanan.',1,25)}{field('maxFatsPerPole','Maksimum FAT per tiang','FAT','Membatasi penambahan perangkat; perangkat existing dipertahankan jika batas diturunkan.',1,10)}</fieldset>
 <fieldset className="space-y-3 border-t pt-3"><legend className="mb-2 text-sm font-semibold">Drop</legend>{field('maxDropLengthMeters','Maksimum panjang drop','m','Screening jarak lurus bukan validasi lintasan pemasangan. Mengubah nilai memerlukan hitung ulang layanan.',0)}</fieldset>
 <fieldset className="space-y-3 border-t pt-3"><legend className="mb-2 text-sm font-semibold">Distribusi · kandidat koneksi</legend>{field('candidateRadiusMeters','Radius kandidat koneksi','m','Dipakai saat Sarankan Koneksi; tidak mengubah koneksi atau rute existing.',0)}{field('candidateNeighbors','Jumlah tetangga kandidat','tetangga','Membatasi jumlah kandidat per tiang, bukan batas kapasitas/core jaringan.',1,10)}</fieldset>
 <p className="rounded bg-amber-50 p-3 text-xs text-amber-900">Nilai ini default aplikasi, bukan standar industri. Hasil lama tetap tersedia sebagai referensi. Keputusan manual engineer tidak dihapus.</p>
 <Button size="sm" variant="outline" onClick={()=>{setDraft(defaultWorkspaceConfiguration());setError('')}}><RotateCcw/>Reset draft ke default aplikasi</Button>
 {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
 </div>
 <footer className="flex justify-end gap-2 border-t p-4"><Button variant="outline" onClick={onClose}>Batal</Button><Button onClick={()=>{try{onApply(validateWorkspaceConfiguration(draft));setError('')}catch(e){setError(e instanceof Error?e.message:'Konfigurasi tidak valid.')}}}>Terapkan perubahan</Button></footer>
 </section></div>
}
