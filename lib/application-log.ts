import type { ImportResult } from "./import-survey"
import { DEFAULT_FAT_PORTS, MAX_FAT_PORTS, type FtthPlan } from "./ftth-planning"

export type LogLevel = "info" | "success" | "warning" | "error"
export type LogDetail = { label: string; value: string }
export type LogInput = { level: LogLevel; source: string; title: string; details: LogDetail[] }
export type LogEntry = LogInput & { id: string; createdAt: string }
export const MAX_LOG_ENTRIES = 300

export function initialLogMessages(): LogInput[] {
  return [
    { level: "info", source: "Aplikasi", title: "Viewer siap — impor data survei untuk memulai", details: [
      { label: "Penyimpanan survei", value: "Data impor dan hasil perencanaan hanya tersimpan selama sesi. Muat ulang halaman memerlukan impor dan perhitungan ulang." },
      { label: "Preferensi layer", value: "Warna, ukuran, visibility, urutan layer dan base map tersimpan otomatis di browser jika localStorage tersedia." },
      { label: "Urutan dan ukuran", value: "Layer paling atas pada daftar ditampilkan paling depan. Ukuran marker dan ketebalan garis memakai satuan piksel." },
    ] },
    { level: "info", source: "Perencanaan", title: "Panduan pengelompokan rumah dan kandidat FAT", details: [
      { label: "Kelompok", value: `Default ${DEFAULT_FAT_PORTS} port FAT, dapat diatur 1–${MAX_FAT_PORTS} melalui Planning Configuration. Satu rumah memakai satu port; jumlah rumah per kelompok mengikuti kapasitas yang dipilih. Kandidat FAT dipilih dari tiang dengan total jarak terkecil ke seluruh rumah.` },
      { label: "Pemicu manual", value: "Impor hanya memuat data survei. Tekan Mulai pengelompokan & estimasi FAT untuk menjalankan perencanaan." },
      { label: "Garis layanan", value: "Estimasi berdasarkan jarak geografis. Garis putus-putus hanya hubungan layanan FAT–rumah, bukan jalur kabel fisik. Batas drop diperiksa menggunakan estimasi jarak lurus; lintasan pemasangan belum tervalidasi." },
      { label: "Kandidat FAT", value: "Satu tiang dapat dipilih untuk beberapa kelompok. Jumlah port adalah parameter rencana pengguna, bukan bukti spesifikasi atau keberadaan perangkat FAT terpasang. Perubahan port membatalkan hasil lama; hitung ulang secara manual." },
      { label: "Interaksi", value: "Klik rumah untuk informasi objek KMZ/KML. Klik ikon kelompok untuk detail kelompok. Klik nama kelompok untuk memasang/melepas sorotan tanpa mengubah zoom; hover memberi sorotan sementara." },
      { label: "Layer perencanaan", value: "Kontrol di kiri bawah peta mengatur kelompok, kandidat FAT dan garis layanan. Visibility dan filter survei tidak mengubah hasil perhitungan." },
    ] },
  ]
}

export function appendLogEntries(previous: readonly LogEntry[], incoming: readonly LogEntry[]): LogEntry[] {
  return [...previous, ...incoming].slice(-MAX_LOG_ENTRIES)
}
export function countLogLevels(entries: readonly LogEntry[]): Record<LogLevel, number> {
  return entries.reduce((counts, entry) => { counts[entry.level]++; return counts }, { info: 0, success: 0, warning: 0, error: 0 })
}

/** Preserve grouped schema diagnostics and keep geometry errors in their own log. */
export function importResultLogs(fileName: string, result: ImportResult): LogInput[] {
  const entries: LogInput[] = []
  if (result.features.length) entries.push({ level: "success", source: "Impor", title: `${fileName}: ${result.features.length} fitur dimuat`, details: [
    { label: "File", value: fileName }, { label: "Fitur valid", value: String(result.features.length) },
  ] })
  if (result.warnings.length) entries.push({ level: "warning", source: "Impor", title: `${fileName}: catatan pembacaan file`, details: [
    { label: "File", value: fileName }, ...result.warnings.map((value, index) => ({ label: `Catatan ${index + 1}`, value })),
  ] })
  for (const warning of result.metadataWarnings) entries.push({ level: "warning", source: "Metadata", title: `Schema tidak ditemukan · ${warning.features.length} fitur`, details: [
    { label: "File", value: fileName }, { label: "KML", value: warning.kmlFile }, { label: "Schema", value: warning.schemaUrl || "(schemaUrl kosong)" },
    { label: "Penanganan", value: "Atribut tetap dipertahankan. Nilai tanpa definisi tipe disimpan sebagai string; geometri valid tetap diimpor. Schema eksternal tidak diambil." },
    ...warning.features.map((feature, index) => ({ label: `Fitur ${index + 1}`, value: `${feature.name} · ID: ${feature.id}` })),
  ] })
  if (result.geometryWarnings.length) entries.push({ level: "error", source: "Geometri", title: `${fileName}: geometri tidak valid dilewati`, details: [
    { label: "File", value: fileName }, ...result.geometryWarnings.map((value, index) => ({ label: `Masalah ${index + 1}`, value })),
  ] })
  return entries
}

export function planningResultLogs(plan: FtthPlan): LogInput[] {
  const details: LogDetail[] = [
    { label: "Belum terlayani", value: String(plan.unservedHomes.length) },
    { label: "Batas drop (estimasi jarak lurus)", value: `${plan.maxDropLengthMeters} m; lintasan pemasangan belum tervalidasi` },
    { label: "Rumah valid", value: String(plan.homeCount) }, { label: "Tiang valid", value: String(plan.poleCount) },
    { label: "Kelompok", value: String(plan.groups.length) }, { label: "Batas kelompok", value: `${plan.fatPorts} rumah` }, { label: "Port FAT", value: String(plan.fatPorts) },
    { label: "Kandidat FAT", value: String(plan.groups.filter(group => group.candidate).length) },
    { label: "Hasil", value: "Hasil perencanaan terpisah dari data survei. Garis layanan bukan jalur kabel fisik." },
  ]
  const entries: LogInput[] = [{ level: plan.groups.length ? "success" : "warning", source: "Perencanaan", title: plan.groups.length ? `${plan.groups.length} kelompok rumah selesai dihitung` : "Perencanaan belum menghasilkan kelompok", details }]
  if (plan.warnings.length || plan.issues.length) entries.push({ level: "warning", source: "Validasi perencanaan", title: "Perencanaan memiliki catatan data", details: [
    ...plan.warnings.map((value, index) => ({ label: `Catatan ${index + 1}`, value })),
    ...plan.issues.map((issue, index) => ({ label: `Objek ${index + 1}`, value: `${issue.name} · ID ${issue.id}: ${issue.reason}` })),
  ] })
  return entries
}
