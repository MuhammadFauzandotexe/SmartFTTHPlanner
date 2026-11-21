"use client"

import { useEffect, useRef } from "react"
import { dropDistanceLabel, reviewStatusLabel, type SimulationReview } from "@/lib/simulation-review"
import { DROP_LAST_SPAN_METERS } from "@/lib/planning-config"
import { dropStatusLabel, formatDropMeters, type DropPlan, type DropRoute } from "@/lib/drop-plan"

type Props = {
  review: SimulationReview | null
  selectedFatId?: string
  stale: boolean
  maxDropLengthMeters: number
  plan: DropPlan | null
  selected: DropRoute | null
  onSelect: (route: DropRoute) => void
}

export default function DropPlanPanel({ review, selectedFatId, stale, maxDropLengthMeters, plan, selected, onSelect }: Props) {
  const selectedReview = review?.drops.find(drop => drop.id === selected?.id)
  const routeReviews = new Map(review?.drops.map(drop => [drop.id, drop]))
  const routes = selectedFatId ? plan?.routes.filter(route => route.fatId === selectedFatId) ?? [] : plan?.routes ?? []
  const detailRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selected?.id])
  return <section className="flex flex-col gap-3 text-xs" aria-label="Rencana Kabel Drop">
    {!plan && <p className="text-slate-500">Gunakan hasil simulasi FAT untuk merencanakan drop tanpa mengubah lokasi atau penugasan rumah.</p>}
    {plan && <>
      {stale && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">Rencana drop perlu dihitung ulang untuk batas {maxDropLengthMeters} m. Geometri lama sudah diperiksa ulang; rute yang melampaui batas tidak ditampilkan sebagai valid. FAT dan splitter asal tetap.</p>}
      <dl className="grid grid-cols-2 gap-3 rounded-md border p-3">
        <div><dt>Jumlah rencana rute</dt><dd className="font-semibold">{plan.routes.length}</dd></div>
        <div><dt>Rumah bermasalah</dt><dd className="font-semibold">{review?.drops.filter(drop => drop.status === "violation" || drop.status === "unresolved").length ?? plan.problemCount}</dd></div>
        <div><dt>Panjang sesuai data</dt><dd className="font-semibold">{formatDropMeters(review?.verified.total ?? plan.verifiedLengthMeters)}</dd></div>
        <div><dt>Total estimasi</dt><dd className="font-semibold">{formatDropMeters(review?.estimates.total ?? plan.estimatedLengthMeters)}</dd></div>
      </dl>

      {!plan.hasSupportData && <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">Belum validasi rute: tidak ada ruas dengan penanda drop_support=true. Garis survei biasa tidak dianggap penyangga drop.</p>}
      <details className="text-[10px] text-slate-500"><summary className="cursor-pointer">Catatan validasi dan label</summary><p className="mt-2">Hambatan lapangan belum terverifikasi. Label pada zoom jauh mengikuti FAT/rumah terpilih; pada zoom 18 seluruh label yang terlihat dapat ditampilkan.</p></details>
      <details><summary className="cursor-pointer font-semibold">Daftar rute dan status {selectedFatId ? "· FAT terpilih" : "· seluruh kelompok"}</summary>
        <ul className="mt-2 max-h-64 space-y-2 overflow-auto">{routes.map(route => <li key={route.id}>
          <button type="button" onClick={() => onSelect(route)} aria-pressed={selected?.id === route.id} className={`w-full rounded-md border p-2 text-left ${selected?.id === route.id ? "border-emerald-600 bg-emerald-50" : "hover:bg-slate-50"}`}>
            <span className="block font-semibold">{route.house.name} · {route.fat.name} / splitter {route.splitterNumber}</span>
            <span className="block">{routeReviews.has(route.id) ? reviewStatusLabel(routeReviews.get(route.id)!.status) : dropStatusLabel(route.status)}</span>
            {routeReviews.has(route.id) ? <span>{dropDistanceLabel(routeReviews.get(route.id)!) ?? "Panjang belum diketahui"}</span> : null}
          </button>
        </li>)}</ul>
      </details>
      {selected && <section ref={detailRef} className="space-y-2 rounded-md border p-3" aria-label="Detail rencana drop">
        <h3 className="font-semibold">Rumah: {selected.house.name}</h3>
        <p>FAT / tiang: {selected.fat.name}</p>
        <p>Splitter asal: {selected.splitterNumber} (1:8)</p>
        <p>{selectedReview?.basis === "estimate" ? "Estimasi panjang drop" : "Total panjang drop"}: {selectedReview ? dropDistanceLabel(selectedReview) ?? "Panjang belum diketahui" : "Panjang belum diketahui"}</p>
        <p>Bentangan terakhir: {selectedReview && selectedReview.lastSpanMeters !== null ? formatDropMeters(selectedReview.lastSpanMeters) : "Belum diketahui / belum divalidasi"}</p>
        <p className="font-semibold">{selectedReview ? reviewStatusLabel(selectedReview.status) : "Belum validasi rute"}</p>
        <p>{selectedReview?.status === "violation" ? `Panjang drop atau bentangan terakhir melampaui batas aktif ${maxDropLengthMeters} m / ${DROP_LAST_SPAN_METERS} m.` : selectedReview?.status === "estimate" ? "Data belum cukup untuk memvalidasi total rute dan bentangan terakhir. Panjang estimasi bukan bukti kelayakan pemasangan." : selected.reason}</p>
        <p className="text-slate-500">Hambatan lapangan belum terverifikasi.</p>
      </section>}
    </>}
  </section>
}
