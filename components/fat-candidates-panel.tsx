"use client"

import { useEffect, useRef } from "react"
import ReviewLengthSummary from "@/components/review-length-summary"
import { formatDropMeters } from "@/lib/drop-plan"
import { dropDistanceLabel, reviewStatusLabel, type SimulationReview } from "@/lib/simulation-review"
import { FAT_SPLITTER_PORTS } from "@/lib/fat-candidates"
import { DROP_LAST_SPAN_METERS } from "@/lib/planning-config"
import { Button } from "@/components/ui/button"
import { FAT_CANDIDATE_STATUS, type FatCandidate } from "@/lib/fat-candidates"
import { FAT_SIMULATION_STATUS, type FatSimulation, type SelectedFat } from "@/lib/fat-simulation"

type Props = {
  review: SimulationReview | null
  onReviewAll: () => void
  maxDropLengthMeters: number
  stale: boolean
  outOfRangeCount: number
  candidates: FatCandidate[] | null
  selected: FatCandidate | null
  simulation: FatSimulation | null
  selectedBox: SelectedFat | null
  showOtherCandidates: boolean
  onSelect: (candidate: FatCandidate) => void
}

export default function FatCandidatesPanel({ review, onReviewAll, maxDropLengthMeters, stale, outOfRangeCount, candidates, selected, simulation, selectedBox, showOtherCandidates, onSelect }: Props) {
  const detailRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selected?.id])
  const boxReview = review?.boxes.find(box => box.fatId === selectedBox?.candidate.id)
  const boxMetrics = new Map(review?.boxes.map(box => [box.fatId, box]))
  const chosen = new Set(simulation?.boxes.map(box => box.candidate.id))
  const others = candidates?.filter(candidate => !simulation || !chosen.has(candidate.id)) ?? []
  const reachable = new Set(candidates?.flatMap(candidate => candidate.houses.map(h => h.house.id)))
  return <section className="flex flex-col gap-3 text-xs" aria-label="Simulasi penempatan FAT">
    {stale && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">Batas berubah menjadi {maxDropLengthMeters} m. Kandidat/simulasi FAT perlu dihitung ulang. Lokasi dan grouping lama dipertahankan; {outOfRangeCount} rumah penugasan lama melebihi batas jarak lurus aktif.</p>}

    {simulation && <>
      <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2 font-semibold text-emerald-900">{FAT_SIMULATION_STATUS}</p>
      <dl className="grid grid-cols-2 gap-3 rounded-md border p-3" aria-label="Ringkasan simulasi">
        <div><dt>Box FAT</dt><dd className="font-semibold">{review?.boxCount ?? simulation.boxes.length}</dd></div>
        <div><dt>Splitter 1:8</dt><dd className="font-semibold">{review?.splitterCount ?? simulation.splitterCount}</dd></div>
        <div><dt>Rumah terlayani sementara</dt><dd className="font-semibold">{review?.servedCount ?? simulation.servedCount}</dd></div>
        <div><dt>Belum terlayani</dt><dd className="font-semibold">{review?.unservedCount ?? simulation.unservedHouses.length}</dd></div>
        <div><dt>Pelanggaran jarak (rumah)</dt><dd className="font-semibold">{review?.distanceViolationCount ?? 0}</dd></div>
        <div><dt>Pelanggaran kapasitas</dt><dd className="font-semibold">{review?.capacityIssues.length ?? 0}</dd></div>
      </dl>
      {review && <ReviewLengthSummary total={review.lengths} verified={review.verified} estimates={review.estimates} unverifiedRoutes={review.unverifiedRoutes} />}
      {!!review?.unresolvedCount && <p className="text-amber-800">{review.unresolvedCount} rumah belum ditemukan rute layak; tidak otomatis dihitung sebagai pelanggaran jarak.</p>}
      {!!review?.capacityIssues.length && <details><summary className="cursor-pointer text-red-700">Detail pelanggaran kapasitas</summary><ul className="mt-2 space-y-1">{review.capacityIssues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></details>}
      {selected && <Button size="sm" variant="outline" onClick={onReviewAll}>Lihat Semua Kelompok</Button>}

      {!simulation.localSearchComplete && <p className="rounded-md bg-amber-50 p-2 text-amber-900">Batas evaluasi local search tercapai. Usulan terbaik yang sudah ditemukan ditampilkan; perbaikan lanjutan masih mungkin.</p>}

      <h2 className="font-semibold">FAT terpilih sementara</h2>
      {!simulation.boxes.length && <p>Belum ada FAT yang dapat melayani rumah. Periksa titik tiang dan rumah hasil impor.</p>}
      <ol className="max-h-64 space-y-2 overflow-auto" aria-label="FAT terpilih sementara">
        {simulation.boxes.map((box, index) => <li key={box.candidate.id}>
          <button type="button" aria-pressed={selected?.id === box.candidate.id} onClick={() => onSelect(box.candidate)} className={`w-full rounded-md border p-2 text-left ${selected?.id === box.candidate.id ? "border-emerald-600 bg-emerald-50" : "hover:bg-slate-50"}`}>
            <span className="block font-semibold">FAT {index + 1} · {box.candidate.pole.name}</span>
            <span className="block">{box.houses.length}/16 rumah · {box.splitters.length} splitter</span>
            <span className="text-slate-500">Drop (rute + estimasi): {formatDropMeters(boxMetrics.get(box.candidate.id)?.review.total ?? 0)}</span>
          </button>
        </li>)}
      </ol>
      {selectedBox && <section ref={detailRef} className="space-y-2 rounded-md border border-emerald-300 p-3" aria-label="Detail FAT dan splitter">
        <h3 className="font-semibold">Review FAT · {selectedBox.candidate.pole.name}</h3>
        <p className="break-all">ID FAT: <span className="font-mono text-[10px]">{selectedBox.candidate.id}</span></p>
        <p>Tiang: {selectedBox.candidate.pole.name}</p>
        <p>{selectedBox.splitters.length} splitter · kapasitas tersisa {boxReview?.remainingCapacity ?? 0} rumah</p>
        <p>Sumber: {selectedBox.candidate.pole.file}</p>
        <p>{selectedBox.candidate.potentialCount} rumah potensial; {selectedBox.houses.length} ditugaskan sementara, kapasitas maksimal 16.</p>
        {boxReview && <ReviewLengthSummary total={boxReview.review} verified={boxReview.verified} estimates={boxReview.estimates} unverifiedRoutes={boxReview.unverifiedRoutes} />}
        {selectedBox.splitters.map(splitter => <section key={splitter.id}>
          <h4 className={`font-semibold ${splitter.number === 1 ? "text-pink-700" : "text-purple-700"}`}>Splitter {splitter.number} · 1:{FAT_SPLITTER_PORTS} · {splitter.houses.length}/{FAT_SPLITTER_PORTS} rumah · sisa {Math.max(0, FAT_SPLITTER_PORTS - splitter.houses.length)}</h4>
          <ul className="mt-2 space-y-2">
            {splitter.houses.map(({ house }) => {
              const drop = review?.drops.find(d => d.fatId === selectedBox.candidate.id && d.splitterId === splitter.id && d.house.id === house.id)
              return <li key={house.id} className="space-y-1">
                <div className="flex justify-between gap-2"><span className="min-w-0 break-words">{house.name}</span><span className="shrink-0 font-mono">{drop ? dropDistanceLabel(drop) ?? "—" : "—"}</span></div>
                <p className={`text-[10px] ${drop?.status === "violation" ? "text-red-700" : "text-slate-500"}`}>{drop ? reviewStatusLabel(drop.status) : "Belum validasi rute"}</p>
              </li>
            })}
          </ul>
        </section>)}
      </section>}
      <details><summary className="cursor-pointer font-semibold">Rumah belum terlayani ({simulation.unservedHouses.length})</summary>
        <ul className="mt-2 max-h-48 space-y-2 overflow-auto">
          {simulation.unservedHouses.map(house => <li key={house.id}><b>{house.name}</b> · {reachable.has(house.id) ? "Belum tertampung dalam usulan ini" : (stale ? "Tidak terjangkau pada pencarian sebelumnya" : `Tidak ada kandidat dalam ${maxDropLengthMeters} m`)}</li>)}
        </ul>
      </details>

    </>}
    {candidates !== null && (!simulation || showOtherCandidates) && <>
      <p className="rounded-md border border-amber-200 bg-amber-50 p-2 font-semibold text-amber-900">{FAT_CANDIDATE_STATUS}</p>
      <p className="text-slate-500">Kandidat berwarna kuning; daftar potensial dapat tumpang tindih. Memilih penanda hanya membuka detail, tidak mengubah penugasan.</p>
      <h2 className="font-semibold">{others.length} {simulation ? "kandidat lainnya" : "kandidat FAT"}</h2>
      <ol className="max-h-64 space-y-2 overflow-auto" aria-label="Kandidat FAT lainnya">
        {others.map(candidate => <li key={candidate.id}>
          <button type="button" aria-pressed={selected?.id === candidate.id} onClick={() => onSelect(candidate)} className={`w-full rounded-md border p-2 text-left ${selected?.id === candidate.id ? "border-amber-500 bg-amber-50" : "hover:bg-slate-50"}`}>
            <span className="block font-semibold">{candidate.pole.name}</span>
            <span>{candidate.potentialCount} rumah potensial; kapasitas maksimal {candidate.maxCapacity}</span>
          </button>
        </li>)}
      </ol>
      {selected && !selectedBox && <section ref={detailRef} className="space-y-2 rounded-md border border-amber-300 p-3" aria-label="Detail kandidat">
        <h3 className="font-semibold">Kandidat: {selected.pole.name}</h3>
        <p>{selected.potentialCount} rumah potensial; kapasitas maksimal 16. {simulation ? "Belum dipilih dalam simulasi." : "Belum ada penugasan layanan."}</p>
        <ul className="max-h-64 space-y-2 overflow-auto">{selected.houses.map(({ house, distanceMeters }) => <li key={house.id} className="flex justify-between gap-2"><span>{house.name}</span><span className="shrink-0">est. {distanceMeters.toFixed(1)} m</span></li>)}</ul>
      </section>}
    </>}
    <details className="text-[10px] text-slate-500"><summary className="cursor-pointer">Tentang hasil simulasi</summary>
      <p className="mt-2">Simulasi merupakan usulan sementara. FAT dan garis hasil impor dipertahankan. Greedy + local search belum menjamin optimum global.</p>
      <p className="mt-1">Penyaringan awal memakai jarak lurus ≤{maxDropLengthMeters} m. Rute drop dan bentangan terakhir ≤{DROP_LAST_SPAN_METERS} m masih perlu divalidasi.</p>
      <p className="mt-1">Maksimal 1 box/tiang, 2 splitter 1:8/box, dan 16 rumah/box. Setiap rumah ditugaskan sekali.</p>
    </details>
  </section>
}
