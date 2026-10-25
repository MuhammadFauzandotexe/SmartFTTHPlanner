# Workspace FTTH — audit implementasi dan perbaikan UI/UX

## Lingkup dan batas bukti

Audit berfokus pada pekerjaan engineer: memulai proses, menyeleksi objek, editing manual, pemeriksaan hasil, konfigurasi dan penyimpanan. Tidak ditemukan AGENTS.md yang berlaku pada repository/folder sumber/leluhur yang diperiksa. Perubahan lokal yang sudah ada dipertahankan.

Skill Product Design audit/index dan kerangka UX/accessibility dibaca, serta preflight user-context dijalankan (tidak ada konteks tersimpan). Inventori computer mengembalikan `apps: [], browsers: []`; percobaan membuka browser bawaan menghasilkan `Browser is not available: iab`. Karena itu tidak ada screenshot awal/akhir, pemeriksaan console, atau audit visual yang diklaim. Sesuai skill audit, “Do not claim an audit if the actual flow could not be accessed and captured.” Temuan berikut didasarkan pada kode dan perilaku yang dijalankan melalui harness komponen existing, bukan screenshot.

Sumber utama inspeksi: `components/ftth-viewer.tsx`, `planning-panel.tsx`, `allocation-panel.tsx`, `distribution-panel.tsx`, `layer-settings.tsx`, `application-log.tsx`, serta lifecycle Leaflet di `map-view.tsx` dan layer perencanaan/distribusi.

## Temuan awal

1. Sidebar 294 px mencampur impor, parameter teknis, perangkat FAT, generate, hasil, review usulan dan distribusi. Form konfigurasi terbuka sejak awal, sementara aksi proses harus dicari di dalam panel.
2. Detail objek memakai kartu lain di kanan peta, bersamaan dengan sidebar dan layer settings. Beberapa panel dapat saling menutupi atau menyisakan ruang peta terlalu kecil.
3. Distribusi memiliki sumber/assignment, koneksi, parameter kandidat, compute, hasil, masalah, save dan ekspor di satu komponen panjang.
4. Pencarian sidebar memfilter `features` yang dikirim ke peta dan ekspor, sehingga pencarian objek juga mengubah peta tanpa kontrol tampilan yang eksplisit.
5. Perubahan port/drop membuang hasil otomatis melalui `setPlanning(null)`, membuat perbandingan hasil lama sulit. Belum ada draft konfigurasi/Terapkan/Batal.
6. Log selalu mengambil baris tersendiri pada bagian bawah. Informasi usulan, rumah belum terlayani dan rute bermasalah tersebar di banyak section.
7. Ukur jarak merupakan placeholder yang belum tersambung ke klik peta, bukan alat ukur yang berfungsi. Aksi ini kini dinonaktifkan dengan penjelasan, bukan memberi kesan pengukuran telah dimulai.

Kekuatan yang dipertahankan: tema terang, komponen Button/Input existing, struktur data sesi terpusat, snapshot JSON/localStorage, pemisahan graf distribusi dari layanan rumah, alasan validasi, keputusan engineer, dan ResizeObserver Leaflet yang sudah memanggil `invalidateSize({pan:false})`.

## Struktur yang diimplementasikan

- **Header proyek:** identitas dari file survei, status perubahan/snapshot, Buka, Simpan, menu ekspor, Pengaturan. Tidak menampung seluruh aksi perencanaan.
- **Toolbar proses:** tahap Layanan FAT / Distribusi. Satu primary action per tahap, rekomendasi sekunder, dan menu aksi distribusi. Tetap terlihat saat explorer/pengaturan tertutup. Loading, prasyarat, status stale, guard klik berulang, dan larangan compute saat mode editing aktif tersedia.
- **Navigasi aktivitas:** Data, FAT & Layanan, Distribusi, Pemeriksaan. Satu explorer/detail terbuka pada satu waktu; default tertutup.
- **Explorer:** pencarian/filter/jumlah hasil; pilihan FAT/kelompok, rumah dan tiang; daftar dibatasi per halaman agar tidak menggambar ribuan baris sekaligus. Filter explorer tidak lagi mengubah peta atau cakupan ekspor.
- **Detail kontekstual:** objek survei dan FAT berada pada panel yang sama dengan explorer. Tidak ada kartu detail kedua yang menutup peta. Rumah menampilkan status, FAT, metode/panjang drop, alasan dan Sambungkan ke FAT; FAT menampilkan tiang, port, anggota dan drop. Fokus lokasi adalah aksi eksplisit.
- **Dock pemeriksaan:** bar ringkas selalu menampilkan rumah belum terlayani, usulan, FAT tak terjangkau dan kebutuhan hitung ulang. Tab Ringkasan, Masalah, Rute, Usulan alokasi, Log. Dapat diciutkan. Filter rute, urutan segmen/tiang, ringkasan per sumber dan review usulan tetap tersedia.
- **Pengaturan:** dialog terpisah, tertutup secara default. Hanya konfigurasi dengan draft, validasi, Terapkan, Batal dan Reset draft ke default aplikasi. Tidak ada daftar objek atau compute.
- **Kontrol peta:** zoom, Fit data, layer, legenda dan label survei. Mode editing ditampilkan jelas dengan instruksi dan Batal/Escape. Saat memilih FAT/menambah FAT, dock/explorer diciutkan untuk memperbesar area pilih; konteks dipertahankan dan detail dibuka lagi setelah sukses.

## Pemetaan fitur lama → lokasi baru

| Kebutuhan | Fitur lama | Lokasi sekarang |
| --- | --- | --- |
| A. Proses | Pengelompokan rumah/kandidat FAT | Toolbar → Layanan FAT → Hitung kelompok / hitung ulang |
| A. Proses | Rekomendasi alokasi | Toolbar Layanan FAT → Rekomendasikan alokasi; review di dock |
| A. Proses | Generate distribusi | Toolbar → Distribusi → Hitung jalur / hitung ulang |
| B. Objek | Impor/file/jumlah fitur | Header Buka atau aktivitas Data |
| B. Objek | Component → FAT | FAT & Layanan → Tambah FAT pada tiang |
| B. Objek | Daftar kelompok/rumah/tiang | Explorer FAT & Layanan atau Data, dengan pencarian dan filter |
| B. Objek | Putus/sambungkan layanan | Menu ⋮ label jarak existing; detail rumah → Sambungkan ke FAT |
| B. Objek | Sumber/assignment/koneksi distribusi | Distribusi → Sumber & FAT / Koneksi tiang |
| C. Hasil | Ringkasan layanan dan distribusi | Dock → Ringkasan |
| C. Hasil | Rumah belum terlayani, input invalid, rute gagal | Dock → Masalah; klik untuk membuka konteks/fokus |
| C. Hasil | Rute/segmen bersama/filter status | Dock → Rute; detail segmen tetap pada Distribusi |
| C. Hasil | Override, ignore, delete, restore, verifikasi/accept usulan | Dock → Usulan alokasi; aksi domain existing dipertahankan |
| C. Hasil | Log/notifikasi detail | Dock → Log; tidak mengambil area permanen di luar dock |
| D. Konfigurasi | Port, batas FAT per tiang, batas drop | Pengaturan → Layanan FAT / Drop |
| D. Konfigurasi | Radius/tetangga kandidat | Pengaturan → Distribusi · kandidat koneksi |
| E. Tampilan | Layer/base map/warna/ukuran/urutan | Layer peta dekat peta; preferensi localStorage existing |
| E. Tampilan | Label, legenda, Fit/zoom | Kontrol peta; tidak dicampur parameter algoritma |
| Proyek | Simpan/buka JSON/browser, GeoJSON/CSV | Header Simpan/Buka/Ekspor; format dan key existing dipertahankan |

## Default dan invalidasi

Nilai awal tetap default aplikasi: 8 port FAT, batas drop 50 m, maksimum 2 FAT per tiang (rentang 1–10), radius kandidat 100 m, 3 tetangga kandidat (rentang 1–10). Bukan standar industri.

Draft tidak mengubah domain sebelum Terapkan. Batal dan Escape membuang draft. Reset mengubah draft ke default aplikasi, kemudian masih memerlukan Terapkan. Validasi memakai validator domain existing untuk port/drop/FAT per tiang; kandidat mengikuti batas existing. Tidak menambah parameter cadangan port atau parameter optimasi baru.

Perubahan port/drop mempertahankan snapshot hasil lama dan menandainya **perlu dihitung ulang** berdasarkan konfigurasi snapshot vs nilai aktif. Sambungan/usulan baru dibatasi sampai hitung ulang untuk menghindari memakai validasi lama. Hitung ulang memakai algoritma dan `preserveLockedDesigns` existing, sehingga keputusan manual tidak dihapus. Batas perangkat yang diturunkan tetap memakai masalah rancangan existing. Parameter kandidat hanya dipakai ketika Sarankan Koneksi dijalankan; tidak mengubah koneksi/rute existing diam-diam.

Fingerprint distribusi existing tetap menentukan stale untuk perubahan graf/sumber/assignment. Tidak menggandakan perhitungan routing di panel. UI memakai source of truth yang sama di FtthViewer.

## Interaksi dan kesinambungan

- Klik FAT/objek menyorot dan membuka detail tanpa fit otomatis. Fokus lokasi/Fokus usulan adalah tindakan eksplisit; pemilihan rute hasil tetap menyorot dan memfokuskan sesuai kontrak distribusi existing.
- Pencarian/tab lokal dipertahankan saat berganti aktivitas. Membuka snapshot proyek mereset hanya state UI editor/filter/detail lewat key sesi, bukan keputusan domain.
- Snapshot browser terakhir dibaca kembali saat startup/refresh. Ini **bukan autosave**: hanya snapshot yang pernah disimpan dengan Simpan yang dipulihkan. Simpanan corrupt tidak dihapus atau ditulis ulang. Schema/format dan key storage existing tidak berubah.
- Guard proses mencegah compute ganda. Epoch sesi mencegah hasil proses lama diterapkan setelah proyek lain dibuka atau impor dimulai.
- Satu handler Escape workspace menangani mode aktif; dialog, menu, layer dan log menangani Escape mereka sendiri tanpa mempropagasikannya ke aktivitas lain.
- Dialog memiliki penangkapan Tab/Shift+Tab, fokus awal dan pengembalian fokus. Tab pemeriksaan mendukung panah kiri/kanan dan roving tabindex. Status memakai teks/ikon selain warna.
- MapContainer tidak diganti/re-key ketika panel dibuka/ditutup. ResizeObserver existing tetap menangani ukuran; halo seleksi berada di layer terpisah dan tidak mengubah geometri.

## Pemeriksaan dan batas verifikasi

Tahap penerimaan yang diuji melalui harness komponen existing:

1. **Mulai perencanaan — lulus:** pengaturan/explorer default tertutup, toolbar terlihat, disabled sebelum impor, loading dan guard klik ganda.
2. **Pengaturan — lulus:** draft invalid ditolak, reset/Batal tidak mengubah konfigurasi aktif, Terapkan mempertahankan hasil lama/stale, toolbar menghitung ulang.
3. **Manajemen FAT — lulus:** seleksi tanpa zoom, pemutusan/sambungan manual, penambahan FAT dan batas per tiang; keputusan manual bertahan.
4. **Pemeriksaan — lulus:** memilih rumah bermasalah membuka detail dan menutup dock yang menghalangi; rute/segmen tersinkron dengan peta.
5. **Distribusi — lulus:** sumber/assignment, koneksi, preview, generate, blokir/stale, generate ulang dan save/open tetap berjalan setelah reorganisasi.
6. **Keberlanjutan — lulus:** refresh memulihkan snapshot browser beserta konfigurasi dan lock engineer; hasil lama tidak diberi label terbaru; tidak ada autosave tersembunyi.

Pemeriksaan final:

- `./node_modules/.bin/tsc --noEmit` — lulus.
- `node --test tests/*.test.cjs` — seluruh **8 berkas test lulus**, termasuk algoritma/domain existing, draft/stale UI, pencarian/filter explorer, fokus/escape, workflow FAT/distribusi, dan pemulihan snapshot dengan lock engineer.
- `git diff --check` — lulus.
- `npm run build` — gagal karena hambatan lingkungan Turbopack pada CSS Leaflet (`binding to a port: Operation not permitted`), termasuk setelah eskalasi; kegagalan yang sama sudah ada pada sesi sebelumnya.
- `npm run build -- --webpack` — build produksi berhasil sampai prerender dan build traces dengan `experimental.useTypeScriptCli: false` sementara untuk menghindari masalah integrasi CLI TypeScript Next di environment. `next.config.mjs` dipulihkan persis setelah build; tidak ada perubahan build/dependency permanen. Typecheck dijalankan terpisah karena konfigurasi existing memakai `ignoreBuildErrors: true`.
- Tidak tersedia script lint repository; tidak menambah dependency lint/testing.

Pengujian interaksi di atas memakai harness React/Leaflet existing, bukan browser. Verifikasi visual/console/resolusi tetap merupakan batas pemeriksaan, bukan dinyatakan lulus.

Target responsif: **1440×900**, **1280×800**, **1024×768**, serta breakpoint ≤900/≤760 px dan layar pendek ≤700 px. Batas lebar explorer 280–330 px, flex `min-width:0`, peta tersisa, dock dibatasi tinggi, dan header/toolbar dapat wrap. Ini telah diperiksa dari aturan CSS dan build, **belum diuji secara visual pada browser di ukuran tersebut**. Screenshot, console browser, akurasi posisi popup/tooltip, sentuhan, dan penggunaan screen reader nyata masih perlu diverifikasi ketika browser tersedia. Tidak mengklaim kepatuhan WCAG lengkap.

## File utama

`components/ftth-viewer.tsx`, `workspace-settings.tsx`, `object-explorer.tsx`, `survey-details.tsx`, `inspection-panel.tsx`, adaptasi view pada `planning-panel.tsx` / `distribution-panel.tsx` / `allocation-panel.tsx`, `components/map-view.tsx`, `lib/workspace.ts`, `app/globals.css`, serta pengujian workspace dan lifecycle existing.

Tidak ada perubahan algoritma, schema proyek, backend, dependency/lockfile, commit, push atau deployment.
