# Jalur Distribusi — implementasi MVP

## Audit dan batas perubahan

Tidak ditemukan AGENTS.md pada repository, folder sumber atau direktori leluhur yang diperiksa. Aplikasi tetap Next.js/React, TypeScript, Leaflet dan Turf; tidak ada backend, dependency baru, perubahan lockfile, deployment atau commit.

- `lib/ftth-planning.ts`: tiang valid diambil dari survei; setiap kandidat FAT milik satu kelompok dan menyimpan titik tiang. Beberapa FAT dapat memakai satu tiang; marker **F×2** berarti dua perangkat kandidat, bukan dua tiang.
- FDT sebelumnya hanya kategori survei; belum ada sumber/assignment atau koneksi distribusi. Garis survei, polygon dan hubungan rumah–FAT tidak dianggap koneksi antar-tiang.
- Konfigurasi, survei dan hasil sebelumnya hanya state sesi. Persistence existing hanya preferensi layer melalui localStorage. Fitur ini menambahkan snapshot proyek eksplisit menggunakan localStorage yang sama dan berkas JSON, tanpa mengganti preferensi layer atau menambahkan database.
- Clustering, penempatan FAT, alokasi layanan yang disetujui, rekomendasi perangkat, kapasitas FAT dan logika drop tidak diubah oleh routing.

## Cara menggunakan

1. Impor survei dan siapkan FAT rancangan seperti biasa. Buka **Distribusi**.
2. **A. Sumber & FAT tujuan → Tambah sumber**: pilih FDT survei bila ada, atau **Sumber sementara**. Pilih tiang akses secara eksplisit dan simpan. Sumber sementara tidak mengklaim perangkat FDT/OLT nyata.
3. Pilih sumber aktif, centang FAT, lalu **Tetapkan FAT terpilih ke sumber ini**. Untuk tepat satu sumber tersedia tindakan eksplisit **Tetapkan semua FAT aktif**. Assignment baru menggantikan sumber FAT tersebut; satu FAT hanya memiliki satu sumber.
4. **B. Koneksi Tiang → Tambah koneksi**: klik tiang asal dan tujuan. Periksa preview geometri lurus dan panjang. Centang izin/lintasan sudah diperiksa bila benar, lalu konfirmasi simpan. Tanpa centang, koneksi tetap belum diverifikasi dan tidak dipakai routing. Batal atau Escape membuang preview, bukan data survei.
5. **Sarankan Koneksi** membuat kandidat kedekatan geografis, bukan koneksi layak otomatis. Radius awal 100 m adalah nilai demo yang dapat diubah, bukan standar bentang. Jumlah tetangga kandidat dibatasi 1–10 (default 3), menggunakan RBush Turf dan screening geodesik.
6. Klik kandidat/segmen untuk memeriksa endpoint, panjang, aktif/nonaktif, izin/blokir/tolak, catatan dan rute yang memakainya. Ubah status secara eksplisit; hapus memerlukan konfirmasi. Pasangan yang dihapus disimpan sebagai suppression agar tidak otomatis disarankan lagi; menambah pasangan itu secara manual adalah tindakan eksplisit untuk memulihkannya.
7. **Generate Distribusi**. Klik FAT hasil untuk menyorot jalurnya, fit ke rute, dan melihat urutan tiang/segmen. **Fit hasil** adalah tindakan terpisah. Klik masalah untuk fokus objek bila koordinatnya tersedia.
8. Blokir/nonaktifkan koneksi atau ubah sumber/assignment. Hasil lama tetap terlihat sebagai **Perlu dihitung ulang**, lalu gunakan **Generate ulang distribusi**.
9. **Simpan / buka / ekspor**: simpan di browser atau unduh proyek JSON. Buka simpanan browser/JSON untuk memulihkan survei, FAT, alokasi rumah, konfigurasi, koneksi, keputusan kandidat dan hasil. Workspace baru memulihkan snapshot browser terakhir saat refresh, tanpa autosave perubahan baru.

## Modul utama

- `lib/distribution.ts`: model, fingerprint, validasi koneksi, RBush kandidat, adjacency list, min-heap, Dijkstra, rekonstruksi, ringkasan dan ekspor.
- `lib/ftth-project.ts`: schema snapshot v1, validasi baca/tulis, fallback backward-compatible untuk proyek tanpa distribusi.
- `components/distribution-panel.tsx`: sumber/tujuan, editor, kandidat, izin, generate, hasil, masalah dan simpan/buka.
- `components/distribution-map-layers.tsx`: koneksi, rute unik, halo rute terpilih, sumber, marker masalah dan preview editor; pemilihan rute tidak membangun ulang geometri.
- `components/ftth-viewer.tsx` dan `components/map-view.tsx`: integrasi state, mode interaksi, fit eksplisit dan snapshot. Mode distribusi terpisah dari editing rumah/FAT.

## Model dan metode

**Koneksi antar-tiang** adalah segmen tersedia/diizinkan. **Hasil distribusi** adalah urutan koneksi dari sumber ke FAT. **Kabel/core/material** tidak dimodelkan pada tahap ini.

Graf dua arah memakai panjang Turf sepanjang LineString, dalam meter. GeoJSON tetap `[longitude, latitude]`, Leaflet `[latitude, longitude]`. Endpoint geometri harus sama dengan koordinat tiang yang dirujuk; memindahkan tiang memerlukan koreksi/gambar ulang koneksi, bukan snap otomatis. Geometri nonlurus dapat dibaca dari snapshot yang valid, tetapi editor MVP hanya membuat garis lurus.

Routing hanya memakai segmen aktif dan `allowed`, dengan endpoint, geometri dan panjang valid. Self-loop, pasangan/ID duplikat, koordinat tiang berimpit, endpoint hilang, panjang nonfinite/nonpositif, dan panjang tidak sesuai geometri dilaporkan serta dikeluarkan dari graf. Persilangan garis bukan sambungan.

Dijkstra dijalankan sekali per sumber valid menggunakan adjacency terurut dan min-heap (jarak, lalu ID tiang). Predecessor hanya diganti bila ditemukan jarak lebih pendek; jarak setara mempertahankan penemuan pertama yang deterministik. Jalur ke tiang tujuan yang sama direkonstruksi sekali lalu direferensikan beberapa FAT. Sumber dan FAT pada tiang sama menghasilkan 0 m, tanpa segmen, dengan geometri Point.

FAT rancangan aktif memakai ID tiang dari model FAT existing. FAT survei memerlukan referensi `POLE_ID`/`poleId` yang cocok unik dengan ID internal/source ID tiang. FAT tanpa mapping tetap ditampilkan sebagai input bermasalah, bukan dihubungkan ke tiang terdekat. FAT provisional tidak masuk tujuan. ID FAT yang berbeda pada tiang sama tetap dua perangkat; segmen fisiknya dideduplikasi berdasarkan ID.

Hasil menyimpan snapshot segmen terpilih agar rute lama tetap dapat dilihat ketika koneksi diedit/dihapus. Fingerprint deterministik mencakup geometri tiang, mapping FAT, sumber/tiang akses, assignment, serta geometri/panjang/status koneksi. Nama/catatan tidak mengubah status hasil. Dijkstra tidak dijalankan setiap render.

## Ringkasan dan kebenaran produk

- Panjang segmen unik menghitung setiap bentang sekali, secara global dan per sumber.
- Jumlah panjang rute menghitung bentang bersama untuk setiap rute yang melaluinya.
- Pemakaian satu bentang oleh banyak sumber ditandai, tetapi bukan bukti jaringan terhubung secara optik.
- Tidak ada standar batas distribusi yang dikarang; batas drop tidak dipakai sebagai batas distribusi.
- Hasil bukan optimasi global biaya, Steiner Tree, assignment kabel/core, optical link budget atau BOQ. Izin kandidat dan kelayakan pemasangan harus diperiksa engineer.
- Kandidat tak disetujui, segmen diblokir/nonaktif, dan komponen terpisah tidak dihubungkan secara otomatis untuk membuat hasil terlihat berhasil.

## Persistence dan ekspor

Snapshot v1 berformat `smart-ftth-project`, key localStorage `smart-ftth-project-v1`. Save eksplisit memvalidasi seluruh snapshot sebelum menulis. Berkas schema lama tanpa distribusi dibuka dengan state distribusi kosong; versi masa depan/corrupt ditolak tanpa mengganti proyek aktif atau reset simpanan. Preferensi layer existing tidak dimigrasi/dihapus. Tidak menyimpan instance Leaflet.

Kapasitas localStorage bergantung browser; bila penyimpanan gagal, pesan tetap ditampilkan dan berkas JSON dapat diunduh sebagai alternatif. Tidak ada sinkronisasi antar-browser/perangkat. Workspace baru memulihkan hanya snapshot browser yang sudah disimpan, bukan perubahan sesi yang belum disimpan. Membuka snapshot mengganti state sesi sesuai tindakan user, tidak menghapus survei di berkas sumber.

Ekspor GeoJSON distribusi dan ekspor utama memakai properti `layer` terpisah: `distribution_connections`, `distribution_sources`, `distribution_selected_segments`, `distribution_routes`. Kandidat/segmen tersedia tidak diberi label final. Segmen terpilih unik tidak digandakan per FAT, sedangkan geometri rute tetap per FAT. FAT gagal memakai titik atau geometry null, bukan garis palsu. CSV memuat semua hasil termasuk kegagalan. Hasil stale selalu diekspor dengan status `stale` dan `final: false`, bukan hasil final diam-diam.

## Pemeriksaan

- Test model mencakup seluruh skenario wajib: linear/bercabang, alternatif terpendek, blokir dan terputus, tiang perantara, segmen bersama, dua FAT satu tiang, 0 m, banyak sumber, persilangan, input invalid, determinisme, stale, nonmutasi clustering, kandidat belum disetujui, legacy snapshot dan roundtrip penyimpanan. Tambahan: kurva/reverse geometry, batas kandidat, antimeridian, segmen null dan ID FAT duplikat.
- Harness komponen existing menguji sumber FDT eksplisit → bulk assignment → klik dua tiang + preview + konfirmasi → generate → pilih/fit rute → blokir → stale → generate ulang → simpan → ubah input → buka kembali. Snapshot cluster rumah sebelum/sesudah sama.
- Harness Leaflet menguji deduplikasi span, marker FAT tidak terjangkau, gaya kandidat, halo selection tanpa rebuild dan cleanup event/layer.
- Inventori computer/browser mengembalikan daftar kosong. Tidak dilakukan dan tidak diklaim verifikasi visual browser.
- `./node_modules/.bin/tsc --noEmit` — lulus. Typecheck dijalankan terpisah karena `next.config.mjs` existing memakai `ignoreBuildErrors: true`.
- `node --test tests/*.test.cjs` — lulus untuk seluruh 7 berkas test, termasuk 24 kasus modul distribusi dan alur komponen/peta.
- `git diff --check` — lulus. Tidak tersedia script lint di package.json; tidak ditambahkan framework lint baru.
- `npm run build` — gagal pada hambatan lingkungan Turbopack: proses CSS Leaflet tidak dapat membuka port (`Operation not permitted`), juga setelah percobaan eskalasi. Hambatan yang sama sudah terjadi sebelum fitur ini.
- Build produksi `npm run build -- --webpack` — berhasil sampai halaman statis dan build traces selesai dengan `experimental.useTypeScriptCli: false` sementara, memakai API TypeScript untuk menghindari masalah integrasi CLI Next yang sudah diketahui di environment ini. Konfigurasi dipulihkan persis; tidak ada perubahan build/dependency/lockfile permanen.
- Package manager repository tercatat pnpm 12.3.4; binary pnpm tidak tersedia di PATH sesi ini. Tidak menjalankan install/update dependency atau mengubah lockfile. Perintah pemeriksaan memakai executable Node/TypeScript yang tersedia dan script build existing.

## Reorganisasi workspace

Aksi hitung kini di toolbar tahap Distribusi; parameter kandidat berada di Pengaturan. Sumber/assignment/koneksi ada di aktivitas Distribusi; hasil, masalah dan rute ada di dock Pemeriksaan. Simpan/buka/ekspor berada di header. Lihat [catatan UX workspace](ftth-workspace-ux.md). Algoritma dan format snapshot tidak berubah.
