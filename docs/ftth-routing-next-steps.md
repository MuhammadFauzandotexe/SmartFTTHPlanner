# FTTH — catatan lanjutan (2026-10-25)

## Temuan kode
- Tidak ditemukan AGENTS.md pada repository maupun direktori leluhur yang diperiksa.
- `lib/ftth-planning.ts`: `groupHomes` mengurutkan titik lalu mengambil rumah terdekat dari seed hingga kapasitas port. Bukan K-Means. `selectFatPole` meminimalkan total jarak ke seluruh anggota, sebelumnya tanpa batas individual.
- Kapasitas berlaku per kandidat FAT kelompok (default 8, rentang 1–25). Beberapa kandidat FAT boleh berbagi tiang; bukan satu perangkat dengan port bersama.
- `planningDistance` memakai Turf geodesik dalam meter dari koordinat GeoJSON. Tidak ada routing drop atau data validitas jalur layanan yang dikonsumsi planner. Garis survei tidak diasumsikan sebagai drop, feeder atau distribution.
- `components/planning-map-layers.tsx`: garis putus-putus adalah hubungan layanan, bukan kabel aktual. Tidak ditemukan alur pemindahan FAT.
- `components/ftth-viewer.tsx`: konfigurasi port, survei dan hasil hanya selama sesi; tidak ada penyimpanan proyek permanen. Preferensi layer terpisah memakai localStorage.

## Selesai pada tahap kecil ini
- `maxDropLengthMeters` positif dan finite, default demo 50 m yang dapat diubah, bukan standar teknis; mengikuti state sesi existing, disalin ke snapshot hasil.
- Memeriksa rumah terhadap lokasi FAT final. Jarak di atas batas dilepas, tepat sama diperbolehkan. Tidak menambah FAT atau memaksa semua rumah masuk kelompok.
- Menyelaraskan anggota, koneksi, port terpakai dan total jarak; kelompok kosong dihapus tanpa penomoran ulang kelompok lain.
- Input konfigurasi di viewer membuang hasil lama saat nilai valid berubah; hitung ulang manual.
- `components/planning-panel.tsx` menampilkan jumlah dan alasan per rumah, FAT/tiang, jarak dan batas. `lib/application-log.ts` memperbarui ringkasan dan panduan.
- Rumah belum terlayani memiliki penanda merah putus-putus pada layer rumah perencanaan, dapat diklik, tanpa hubungan layanan aktif.

## Metode dan keterbatasan
Pemeriksaan awal menggunakan **estimasi jarak lurus (geodesik)**. Lolos batas ini belum membuktikan lintasan pemasangan valid atau panjang kabel aktual memenuhi batas. Tidak memakai panjang garis survei sebagai panjang drop.

Belum ada penugasan ulang ke FAT kelompok lain. Pemilihan tiang existing tetap berdasarkan total jarak sebelum anggota tidak layak dilepas; kandidat tidak dioptimalkan ulang. Alasan melebihi batas hanya mengacu pada kandidat kelompok yang diperiksa, bukan klaim seluruh alternatif gagal atau semua FAT penuh. Tidak ada informasi kapasitas global/perangkat fisik atau jalur terlarang yang dapat dijadikan alasan tambahan. Data rumah invalid tetap tercatat pada issues existing, terpisah dari rumah valid belum terlayani. ID G026 mungkin tidak tampil bila seluruh anggotanya dilepas.

## Pemeriksaan yang dijalankan
- `node --test tests/ftth-planning.test.cjs tests/application-log.test.cjs tests/map-layer-lifecycle.test.cjs` — lulus untuk ketiga berkas setelah fixture disesuaikan.
- `./node_modules/.bin/tsc --noEmit` — lulus.
- Kasus: di bawah/sama/di atas batas, tanpa kandidat/tanpa alternatif penugasan, validasi konfigurasi, kapasitas, konsistensi anggota/koneksi/total, penanda rumah dilepas tanpa link, label estimasi, serta perubahan batas menghapus hasil lama.
- KMZ sampel diuji end-to-end oleh test existing dengan batas longgar eksplisit untuk mempertahankan pengujian pengelompokan; bukan bukti cakupan pada batas demo 50 m.
- Tidak menjalankan production build, pemeriksaan visual browser, atau perbandingan terarah kasus G026. Tidak ada kegagalan tersisa pada pemeriksaan yang dijalankan.
- Workspace sudah berisi perubahan lokal sebelum sesi ini; perubahan tersebut dipertahankan. Tidak membuat commit/push.

## Pekerjaan besok — belum diimplementasikan
- [ ] Memodelkan akses rumah ke jalur pemasangan yang diizinkan.
- [ ] Menghitung matriks panjang jalur rumah–kandidat FAT.
- [ ] Mendefinisikan allowance/slack dan apakah termasuk batas drop.
- [ ] Mengoptimalkan penugasan bersama dengan kapasitas FAT tetap menggunakan Minimum-Cost Flow.
- [ ] Memaksimalkan rumah terlayani sebelum meminimalkan total panjang drop.
- [ ] Membandingkan hasil sebelum/sesudah pada kasus G026, menggunakan identitas rumah/tiang sumber selain ID kelompok.
- [ ] Menambahkan evaluasi kandidat lokasi FAT menggunakan Facility Location/CP-SAT bila dibutuhkan.
- [ ] Mengevaluasi konsekuensi perubahan FAT terhadap distribusi/upstream.
- [ ] Menampilkan metrik cakupan, drop maksimum, total drop, dan jumlah FAT.
- [ ] Menambahkan pengujian regresi untuk kasus rumah jauh dan persaingan port (uji batas dasar sudah tersedia; persaingan port lintas FAT belum).
