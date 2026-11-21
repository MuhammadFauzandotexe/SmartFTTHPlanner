import { formatDropMeters } from "@/lib/drop-plan"
import type { LengthSummary } from "@/lib/simulation-review"

export default function ReviewLengthSummary({ total, verified, estimates, unverifiedRoutes }: {
  total: LengthSummary; verified: LengthSummary; estimates: LengthSummary; unverifiedRoutes: LengthSummary
}) {
  const rows: [string, LengthSummary][] = [
    ["Gabungan (rute + estimasi)", total], ["Rute terverifikasi", verified], ["Estimasi", estimates], ["Rute belum terverifikasi / bermasalah", unverifiedRoutes],
  ]
  return <div className="space-y-2">
    <p>Total panjang drop (rute + estimasi): <b>{formatDropMeters(total.total)}</b></p>
    <table className="w-full text-left text-[10px]" aria-label="Ringkasan panjang drop">
      <thead><tr className="border-b"><th className="py-1">Jenis</th><th>Total</th><th>Rata-rata</th><th>Maks.</th></tr></thead>
      <tbody>{rows.map(([label, value]) => {
        return <tr key={label} className="border-b align-top"><th className="py-1 pr-1 font-normal">{label} ({value.count})</th>
          <td className="py-1 pr-1">{formatDropMeters(value.total)}</td><td className="py-1 pr-1">{value.average === null ? "—" : formatDropMeters(value.average)}</td><td className="py-1">{value.maximum === null ? "—" : formatDropMeters(value.maximum)}</td>
        </tr>
      })}</tbody>
    </table>
    <p className="text-[10px] text-slate-500">Estimasi tidak membuktikan rute atau bentangan terakhir memenuhi aturan. Rute tanpa panjang yang diketahui tidak masuk angka panjang.</p>
  </div>
}
