export default function MapLegend() {
  return <div className="space-y-2 rounded-md border bg-slate-50 p-3 text-[10px] text-slate-600" aria-label="Legenda peta">
    <p className="text-xs font-semibold text-slate-800">Legenda review</p>
    <div className="grid grid-cols-2 gap-2">
      <span>⌂ Rumah</span><span>● Tiang (titik kecil)</span>
      <span>▣ FAT (kotak F)</span><span>⌂× Belum terlayani (merah)</span>
      <span><i className="mr-1 inline-block w-6 border-t-2 border-emerald-600 align-middle" />Rute sesuai data</span>
      <span><i className="mr-1 inline-block w-6 border-t-2 border-dashed border-blue-600 align-middle" />Estimasi</span>
      <span><i className="mr-1 inline-block w-6 border-t-2 border-dotted border-amber-600 align-middle" />Belum validasi rute</span>
      <span className="text-red-700">◌ Pelanggaran / rute bermasalah</span>
    </div>
    <p>Grup lain diredupkan saat review satu FAT. Splitter 1 merah muda, splitter 2 ungu. Ruas bermasalah yang tidak memiliki geometri ditandai pada rumah, tanpa sambungan rekaan.</p>
  </div>
}
