"use client"
import { useEffect, useRef, useState } from "react"
import { MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { FeatureItem } from "@/lib/import-survey"
export default function FdtPlacementControls({ fdts, selectedId, targetOnLeft, disabled, onStart, target, origin, activeId, onChooseAnother, onCancel, onApply, busy }: { fdts: FeatureItem[]; selectedId?: string; targetOnLeft: boolean; disabled: boolean; onStart: (id: string | null) => void; target?: FeatureItem; origin: string | null; activeId: string | null; onChooseAnother: () => void; onCancel: () => void; onApply: () => void; busy: boolean }) {
  const [choice, setChoice] = useState("")
  useEffect(() => { setChoice(selectedId ?? "") }, [selectedId])
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (target) { if (!dialog.current?.open) dialog.current?.showModal() }
    else { dialog.current?.close(); trigger.current?.focus() }
  }, [target?.id])
  return <section className="flex min-w-0 flex-wrap items-center justify-center gap-2 text-xs" aria-label="Perencanaan FDT">
    {fdts.length > 1 && <label className="flex min-w-0 flex-wrap items-center gap-2"><span className="sr-only">FDT yang dipindahkan</span><select aria-label="Pilih FDT untuk dipindahkan" className="h-9 w-48 max-w-full rounded border bg-white px-2 text-slate-800" value={choice} onChange={e => setChoice(e.target.value)}><option value="">Pilih ID perangkat FDT…</option>{fdts.map(f => <option key={f.id} value={f.id}>{f.name} · {f.id}</option>)}</select></label>}
    <Button ref={trigger} variant="outline" className="h-9" disabled={disabled || fdts.length > 1 && !choice} onClick={() => onStart(fdts.length ? fdts.length === 1 ? fdts[0].id : choice : null)}><MapPin />{fdts.length ? "Pindahkan FDT" : "Tentukan FDT"}</Button>{fdts.length > 1 && !choice && <span className="text-slate-600">Pilih perangkat FDT terlebih dahulu.</span>}
    <dialog ref={dialog} aria-labelledby="fdt-confirm-title" onCancel={event => { event.preventDefault(); onChooseAnother() }} onClick={event => { if (event.target === event.currentTarget) onChooseAnother() }} style={{ margin: "16px", left: targetOnLeft ? "auto" : 0, right: targetOnLeft ? 0 : "auto", top: 0, bottom: "auto" }} className="w-[380px] max-w-[90vw] rounded-xl border bg-white p-5 text-sm text-slate-800 shadow-xl backdrop:bg-slate-900/20">
      {target && <><h2 id="fdt-confirm-title" className="font-semibold">{activeId ? `Pindahkan ${activeId} dari tiang ${origin ?? "belum tercatat"} ke tiang ${target.id}?` : `Tempatkan FDT pada tiang ${target.id}?`}</h2><p className="mt-3 break-all text-xs">Tujuan: {target.id} · {target.coords.join(", ")}</p><p className="mt-2 text-xs">Lokasi dipilih manual; kelayakan pemasangan perlu verifikasi lapangan. Distribusi terkait akan ditandai perlu dihitung ulang. Routing distribusi belum tersedia pada aplikasi ini.</p><div className="mt-4 flex flex-wrap gap-2"><Button autoFocus disabled={busy} onClick={onApply}>{activeId ? "Pindahkan FDT" : "Tempatkan FDT"}</Button><Button variant="outline" disabled={busy} onClick={onChooseAnother}>Pilih tiang lain</Button><Button variant="outline" disabled={busy} onClick={onCancel}>Batal</Button></div></>}
    </dialog>
  </section>
}
