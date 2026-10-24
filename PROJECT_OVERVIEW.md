# Smart FTTH Planner — Gambaran Project

Dokumen ini memisahkan kondisi kode saat ini dari kebutuhan pengembangan. Dasar pemeriksaan: `package.json`, `app/`, `components/`, `lib/`, dan konfigurasi di root. Keberadaan dependency atau tombol tidak berarti fiturnya telah selesai.

## 1. Ringkasan project dan tujuan

Smart FTTH Planner adalah aplikasi pemetaan dan perencanaan jaringan Fiber to the Home (FTTH). Data awal berasal dari survei lapangan berupa koordinat tiang dan rumah pelanggan dalam KML/KMZ.

Tahap awal berfokus pada viewer untuk mengimpor, menampilkan, dan memeriksa data survei. Kode saat ini merupakan prototipe **FTTH Survey Viewer**, dengan peta interaktif, data demo, impor KML terbatas, dan ekspor GeoJSON terbatas. Otomatisasi jaringan, penempatan perangkat, link budget, dan BoQ merupakan rencana pengembangan.

Prinsip pengembangan:

- Mekanisme sederhana, mudah dipelihara, menggunakan JavaScript/TypeScript dan Node.js.
- Tidak menggunakan Spring Boot atau PostgreSQL; tahap awal tidak memerlukan database atau backend tambahan.
- Pemrosesan geospasial dilakukan di browser sejauh memungkinkan.
- Setiap hasil otomatis harus dapat diperiksa dan dikoreksi manual. Kemampuan koreksi jaringan tersebut belum tersedia saat ini.

## 2. Masalah yang ingin diselesaikan

Data survei perlu diubah menjadi informasi yang dapat diperiksa: lokasi objek, kategori, sumber file, kelengkapan koordinat, dan kemungkinan hubungan jaringan. File survei dapat memiliki nama tidak konsisten, koordinat tidak valid, objek ganda, dan geometri campuran.

Tahap berikutnya perlu mengurangi pekerjaan manual untuk menghubungkan tiang, mengelompokkan pelanggan, menempatkan FAT/FDT, memperkirakan redaman, dan menghitung material. Kedekatan koordinat saja belum menjamin kabel dapat dipasang melalui jalur tersebut; akses jalan, koridor, hambatan, dan kelayakan pemasangan tetap perlu diverifikasi.

## 3. Pengguna dan alur penggunaan utama

Calon pengguna adalah petugas survei, perencana jaringan, dan pemeriksa hasil perencanaan. Belum ada akun, autentikasi, pembagian peran, atau kolaborasi daring.

Alur yang sudah didukung secara terbatas:

1. Buka halaman utama; aplikasi menampilkan data demo, bukan otomatis membaca file survei di root.
2. Pilih **Impor Data** untuk memilih satu atau beberapa file. KML titik sederhana dapat ditambahkan; KMZ belum dibaca.
3. Cari berdasarkan nama atau ID, lihat titik pada peta, dan klik titik untuk memeriksa kategori, koordinat, serta sumber file.
4. Pilih rumah untuk melihat tiang terdekat berdasarkan jarak garis lurus.
5. Gunakan zoom dan **Fit ke Data**, lalu ekspor fitur yang lolos pencarian menjadi GeoJSON dengan keterbatasan geometri yang dijelaskan di bawah.
6. Muat ulang halaman akan menghapus hasil impor dari memori dan mengembalikan data demo.

Alur tujuan berikutnya: validasi survei → koreksi jaringan antartiang → penempatan FAT → penempatan FDT dan koneksi sumber → link budget → BoQ → pemeriksaan serta ekspor. Ini belum menjadi alur aplikasi yang dapat dijalankan.

## 4. Teknologi dan arsitektur saat ini

Versi berikut adalah deklarasi `package.json`; awalan `^` merupakan rentang versi, bukan jaminan versi terpasang.

| Teknologi | Versi deklarasi | Penggunaan yang ditemukan |
| --- | --- | --- |
| Next.js | `16.4.3` | App Router; halaman utama dan layout; peta dimuat dinamis dengan `ssr: false` |
| React / React DOM | `19.2.4` / `19.2.4` | Komponen dan state antarmuka |
| TypeScript | `5.7.3` | Tipe data dan konfigurasi strict |
| Leaflet / React Leaflet | `^1.9.4` / `^5.0.0` | Peta, tile OpenStreetMap, CircleMarker, zoom dan fit bounds |
| Turf.js (`@turf/turf`) | `^7.4.0` | `point`, `distance` dalam meter, dan `bbox`; beberapa fungsi lain hanya diimpor |
| JSZip | `^3.10.2` | Dependency tersedia, **belum digunakan**; diperlukan untuk ekstraksi KMZ |
| `@tmcw/togeojson` | `^7.1.3` | Dependency tersedia, **belum digunakan**; konversi KML lengkap masih rencana |
| `react-leaflet-cluster` | `^4.1.3` | Dependency tersedia, **belum digunakan** untuk clustering marker |
| `@base-ui/react` | `^1.5.0` | Primitive button, input, badge dan separator |
| shadcn | `^4.11.0` | Konfigurasi `base-nova`, komponen lokal, dan stylesheet |
| Tailwind CSS / plugin PostCSS | `^4.3.3` / `^4.3.3` | Styling; PostCSS `^8.5` sebagai alat build |
| `tw-animate-css` | `^1.4.0` | Stylesheet animasi diimpor |
| `lucide-react` | `^1.16.0` | Ikon antarmuka |
| `sonner` | `^2.0.8` | Pemanggilan toast ada; komponen `<Toaster />` belum ditemukan, sehingga tampilan notifikasi belum dapat dianggap lengkap |
| `class-variance-authority` | `^0.7.1` | Variasi komponen UI |
| `clsx`, `tailwind-merge`, `cn` | `^2.1.1`, `^3.3.1`, `^0.5.0` | Penggabungan class CSS |
| `@vercel/analytics` | `1.6.1` | Komponen Analytics dirender pada mode produksi |
| Tipe Leaflet / Node / React / React DOM | `^1.9.22` / `^24` / `19.2.14` / `19.2.3` | Dukungan tipe pengembangan |
| pnpm | `12.3.4` | Package manager yang dideklarasikan melalui `packageManager` |

Arsitektur: `app/page.tsx` merender `FtthViewer`, komponen client yang menyimpan data melalui React state. Komponen itu memuat `MapView` di browser. Pembacaan KML menggunakan File API dan `DOMParser`, bukan togeojson. Ekspor menggunakan Blob dan tautan unduhan.

Tidak ditemukan API route, database, backend domain terpisah, penyimpanan localStorage/IndexedDB, maupun mesin perencanaan jaringan. Next.js tetap membutuhkan runtime Node.js untuk perintah pengembangan dan server produksi yang tersedia. Tile OpenStreetMap memerlukan akses jaringan; belum ada dukungan peta offline.

## 5. Struktur folder penting

```text
app/
  page.tsx                 Halaman utama viewer
  layout.tsx               Metadata, viewport, CSS, Analytics produksi
  globals.css              Tailwind, tema, penyesuaian Leaflet
components/
  ftth-viewer.tsx           State, data demo, impor, pencarian, ekspor, panel
  map-view.tsx              Peta Leaflet, tile, marker, callback pemilihan
  ui/                      Button, Badge, Input, Separator
lib/
  utils.ts                 Helper penggabungan class CSS
Data-Mentah.kmz             Berkas survei di root; tidak dimuat otomatis
package.json               Dependency dan script
pnpm-lock.yaml             Lockfile pnpm
pnpm-workspace.yaml        Kebijakan package manager
package-lock.json          Lockfile npm juga ada; pnpm tetap manager deklaratif
next.config.mjs            Konfigurasi Next.js
postcss.config.mjs         Plugin Tailwind untuk PostCSS
tsconfig.json              Konfigurasi TypeScript dan alias @/*
components.json            Konfigurasi shadcn dan alias
```

Folder `hooks/` hanya disebut sebagai alias pada konfigurasi shadcn; belum ditemukan sebagai folder implementasi. `node_modules/` dan `.next/` adalah hasil instalasi/build, bukan sumber fitur.

## 6. Format input dan struktur data

### Kondisi saat ini

Pemilih file menerima `.kml` dan `.kmz`, tetapi hanya cabang KML yang mem-parsing isi. Parser membaca `Placemark`, mengambil `name` serta elemen `coordinates` pertama, memisahkan berdasarkan koma, dan memakai dua nilai pertama yang bernilai finite. Semua hasil dimasukkan sebagai `Point`.

Parser belum membedakan Point, LineString, Polygon, atau MultiGeometry dengan benar; tidak ada validasi XML menyeluruh, rentang koordinat, CRS, duplikasi, ataupun pelestarian ExtendedData. Impor berulang menambahkan objek dan membuat ID berbasis nama file, indeks, serta `Date.now()`, sehingga ID bukan identitas survei yang stabil.

KMZ saat ini hanya memanggil notifikasi dan tidak diekstrak. Teks antarmuka yang menyatakan pembacaan KMZ aktif bukan bukti implementasi. Keberadaan `Data-Mentah.kmz` juga bukan bukti file telah dibaca atau divalidasi aplikasi.

Bentuk data internal yang ditemukan:

```ts
type FeatureItem = {
  id: string
  name: string
  category: 'Tiang' | 'Rumah' | 'FAT' | 'FDT' | 'Jalur kabel' | 'Belum dikategorikan'
  file: string
  kind: 'Point' | 'LineString' | 'Polygon'
  coords: [number, number] // [latitude, longitude], hanya satu pasangan
  description?: string
  props?: Record<string, string>
}
```

`description` dan `props` belum diisi parser. Satu pasangan koordinat tidak cukup untuk menyimpan garis/poligon. Kategori diperkirakan dari nama: FDT, FAT, POLE/TIANG, atau RUMAH/HOME/PELANGGAN; kategori lain menjadi “Belum dikategorikan”. Belum tersedia editor kategori.

Data demo dibuat di kode: 38 tiang, 16 rumah, satu FAT, satu FDT, dan satu entri jalur kabel (57 fitur). Nama sumber `survey_bandung.kmz` pada data demo bukan hasil pembacaan file tersebut. Entri kabel hanya memiliki satu pasangan koordinat dan tidak digambar sebagai garis.

### Aturan data yang diperlukan

- GeoJSON menggunakan urutan **longitude, latitude**. Contoh Point: `[107.603, -6.9147]`.
- Internal viewer memakai **latitude, longitude**, sesuai pemakaian Leaflet. Antarmuka saat ini hanya memberi label “Koordinat”; label eksplisit “Latitude, Longitude” masih perlu ditambahkan pada pengembangan berikutnya.
- LineString membutuhkan daftar pasangan koordinat; Polygon membutuhkan cincin koordinat yang valid. Ekspor saat ini menukar urutan koordinat untuk Point dengan benar, tetapi tetap memberi satu pasangan untuk jenis garis/poligon sehingga belum aman untuk semua fitur, termasuk entri kabel demo.
- Rencana pembacaan KMZ: ekstrak arsip dengan JSZip, pilih KML, konversi dengan togeojson, validasi, lalu normalisasi. Aturan memilih KML bila arsip berisi beberapa KML: **Perlu ditentukan**.
- Perhitungan jarak dan luas harus menggunakan fungsi geospasial dengan satuan eksplisit; jangan menghitung jarak langsung dari selisih derajat. Jarak saat ini menggunakan Turf dalam meter; luas belum dihitung.
- Screenshot peta bukan pengganti koordinat asli maupun data geometri survei.

## 7. Fitur viewer dan status implementasi

**Tersedia** berarti ada mekanisme dalam kode untuk lingkup yang disebutkan, bukan pernyataan bahwa seluruh skenario telah lulus uji. **Sebagian** berarti ada pembatasan atau UI tanpa mekanisme lengkap. **Direncanakan** berarti belum ditemukan implementasinya.

| Fitur | Status | Kondisi konkret |
| --- | --- | --- |
| Peta dasar dan marker berwarna | Tersedia | OpenStreetMap dan CircleMarker; kategori kabel tidak ditampilkan |
| Zoom, fit bounds, buka/tutup sidebar | Tersedia | Fit memakai seluruh fitur, bukan hanya hasil pencarian |
| Pencarian nama/ID | Tersedia | Menyaring marker, jumlah terlihat, dan data ekspor |
| Pemilihan objek dan salin koordinat | Tersedia | Panel kategori, nama, ID, sumber, koordinat; Clipboard API memerlukan izin/konteks browser yang mendukung |
| Rumah ke tiang terdekat | Tersedia | Jarak garis lurus dalam meter; bukan rute drop atau penugasan FAT |
| Impor KML | Sebagian | Pembacaan titik sederhana; geometri lengkap dan validasi belum tersedia |
| Impor KMZ | Sebagian | Pemilih menerima ekstensi; ekstraksi dan pembacaan isi belum tersedia |
| Ekspor GeoJSON | Sebagian | Mengunduh fitur hasil pencarian; geometri garis/poligon belum valid |
| Ringkasan survei | Sebagian | Total fitur dan jumlah kategori dinamis; “1 file”, “1,24 km”, serta “Terpetakan” statis |
| Filter layer/kategori | Sebagian | Tombol kategori tidak mengubah fitur; belum menyembunyikan layer |
| Label | Sebagian | Tooltip dipasang saat hover jika opsi aktif; belum berbasis zoom dan belum ada pelepasan tooltip yang jelas saat opsi dimatikan |
| Ukur jarak | Sebagian | State dan rumus ada; klik peta belum mengisi titik ukur dan hasil belum ditampilkan |
| Buffer | Sebagian | Input awal “100” dan pemanggilan toast saja; tidak membuat atau menggambar geometri buffer |
| Koordinat kursor dan skala | Sebagian | Koordinat “—” dan skala “1 : 5.000” masih statis |
| Notifikasi | Sebagian | Pemanggilan Sonner ada; host Toaster belum ditemukan |
| Clustering marker / label berdasarkan zoom | Direncanakan | Dependency clustering belum digunakan |
| Validasi, deduplikasi, koreksi manual survei | Direncanakan | Belum ada editor atau laporan validasi |
| Penyimpanan proyek | Direncanakan | Hanya state selama sesi; muat ulang kehilangan impor |
| Jaringan distribusi otomatis dan koreksinya | Direncanakan | Belum ada graf antartiang |
| Clustering pelanggan dan penempatan FAT | Direncanakan | FAT demo bukan hasil algoritma |
| Penempatan FDT | Direncanakan | FDT demo bukan hasil optimasi |
| Link budget | Direncanakan | Belum ada model perangkat atau kalkulasi |
| BoQ dan ekspor CSV/Excel | Direncanakan | Belum ada aturan kuantitas atau tabel material |

## 8. Lima kebutuhan utama perencanaan FTTH

Semua mekanisme dalam bagian ini adalah rancangan kebutuhan, kecuali dinyatakan sebagai fungsi terbatas yang sudah ada. Tidak ada nilai teknis baku yang ditetapkan dokumen ini.

### 8.1 Jalur distribusi otomatis dari tiang hasil survei

- **Tujuan:** mengusulkan jaringan distribusi yang dapat ditinjau kelayakan pemasangannya.
- **Input:** koordinat dan ID tiang, koneksi existing, jalan/koridor kabel, serta larangan lintasan jika tersedia.
- **Mekanisme sederhana:** jadikan tiang kandidat simpul graf dan koridor yang diizinkan sebagai kandidat koneksi. Hitung panjang tiap segmen, saring dengan batas bentang, lalu susun usulan koneksi sesuai cakupan yang dibutuhkan. Bila koridor belum ada, koneksi berdasarkan kedekatan hanya usulan awal untuk pemeriksaan lapangan. Pengguna harus dapat menambah/menghapus koneksi secara manual; tandai simpul yang tidak terhubung.
- **Output:** geometri jalur distribusi, urutan atau daftar koneksi tiang, panjang setiap segmen, dan daftar tiang tidak terhubung.
- **Parameter:** batas jarak antartiang, koridor yang diizinkan, hambatan, aturan pemilihan koneksi, serta titik awal/tujuan — **Perlu ditentukan**.
- **Status:** **Direncanakan**. Saat ini hanya ada marker tiang dan entri kabel demo tanpa geometri rute.

### 8.2 Penempatan FAT otomatis dan clustering rumah berdasarkan kabel drop

- **Tujuan:** membagi pelanggan ke FAT yang kapasitas dan jangkauan drop-nya layak.
- **Input:** rumah dengan ID unik, tiang kandidat FAT, graf jalur kabel, kapasitas port, dan batas panjang drop.
- **Mekanisme sederhana:** pilih kandidat FAT pada tiang yang dapat dipasang; alokasikan rumah dengan menjaga kapasitas port dan batas panjang kabel. Gunakan panjang rute kabel yang memungkinkan bila jaringan tersedia. Jika hanya ada jarak garis lurus, beri label estimasi awal dan minta pemeriksaan. Tandai rumah belum terlayani atau melebihi batas; sediakan koreksi penugasan manual.
- **Output:** lokasi FAT, daftar rumah yang dilayani, penggunaan/sisa port, geometri serta panjang drop, dan daftar pelanggan bermasalah.
- **Parameter:** kapasitas FAT, batas drop, cadangan port, kandidat tiang, aturan pengelompokan dan prioritas — **Perlu ditentukan**.
- **Status:** **Direncanakan**. Perhitungan rumah ke tiang terdekat yang tersedia belum mengelompokkan rumah atau menempatkan FAT.

**Clustering pelanggan untuk perencanaan berbeda dari clustering marker.** Yang pertama menentukan hubungan layanan dan kapasitas; yang kedua hanya merapikan tampilan peta. Dependency `react-leaflet-cluster` tidak menyelesaikan penempatan FAT.

### 8.3 Penempatan FDT otomatis di lokasi sentral area

- **Tujuan:** menghubungkan kelompok FAT melalui FDT dengan cakupan dan kapasitas yang sesuai.
- **Input:** FAT hasil perencanaan, graf jalur kabel, tiang kandidat pemasangan, kapasitas FDT, serta lokasi sumber jaringan/OLT jika tersedia.
- **Mekanisme sederhana:** bandingkan kandidat tiang berdasarkan jarak melalui jaringan kabel ke kelompok FAT, lalu periksa kapasitas, konektivitas, akses pemasangan, dan hubungan ke sumber. Lokasi akhir harus berada di titik yang memungkinkan pemasangan dan dapat dikoreksi manual. Kebutuhan beberapa FDT harus dievaluasi berdasarkan kapasitas dan cakupan; jangan menetapkan satu FDT untuk semua kondisi.
- **Output:** lokasi FDT, daftar FAT yang dilayani, jalur penghubung, dan peringatan kapasitas/konektivitas.
- **Parameter:** kapasitas FDT, cakupan, bobot kriteria sentralitas, batas jalur, kandidat lokasi, dan aturan koneksi sumber — **Perlu ditentukan**.
- **Status:** **Direncanakan**. FDT pada peta saat ini adalah data demo statis.

### 8.4 Perhitungan power link budget

- **Tujuan:** memperkirakan kelayakan optik setiap jalur layanan sebelum pengukuran lapangan.
- **Input:** panjang kabel, jenis serat dan panjang gelombang, susunan/rasio splitter, jumlah konektor dan sambungan, margin, daya pancar, serta rentang daya terima perangkat.
- **Mekanisme sederhana:** telusuri komponen setiap jalur dan jumlahkan redamannya, kemudian evaluasi estimasi daya terima terhadap rentang perangkat yang dipilih.

```text
Redaman serat (dB) = panjang serat (km) × koefisien redaman (dB/km)
Total redaman = redaman serat + redaman splitter + redaman konektor
                + redaman sambungan + margin
Estimasi daya terima = daya pancar - total redaman
```

Redaman dan margin dinyatakan dalam **dB**; daya pancar dan daya terima dalam **dBm**. Redaman splitter bertingkat dijumlahkan berdasarkan komponen yang dilewati. Semua nilai perangkat dan parameter harus dapat dikonfigurasi dengan sumber spesifikasi yang jelas.

- **Output:** rincian redaman per jalur, estimasi daya terima, serta status sesuai rentang perangkat, termasuk kemungkinan daya terlalu rendah atau terlalu tinggi.
- **Parameter:** koefisien serat, panjang gelombang, loss splitter/konektor/sambungan, margin, daya pancar, batas penerimaan perangkat — **Perlu ditentukan** berdasarkan datasheet dan keputusan desain.
- **Status:** **Direncanakan**. Belum ada kalkulator atau data perangkat dalam kode.

Hasil merupakan estimasi perencanaan; nilai OPM aktual diperoleh dari pengukuran lapangan. Dokumen ini tidak menetapkan kepatuhan terhadap standar tertentu tanpa sumber dan spesifikasi yang jelas.

### 8.5 Rekap Bill of Quantities (BoQ) otomatis

- **Tujuan:** menghasilkan kebutuhan material yang dapat ditelusuri ke hasil survei dan desain.
- **Input:** inventaris tiang, FAT/FDT, susunan splitter, jalur distribusi/drop, spesifikasi material, dan aturan cadangan kabel.
- **Mekanisme sederhana:** hitung jumlah objek/perangkat berdasarkan ID unik, jumlahkan panjang rute tiap jenis kabel, lalu terapkan aturan cadangan sekali saja. Pisahkan tiang existing hasil survei dari kebutuhan tiang baru. Komponen tanpa aturan perhitungan diberi status input manual atau belum dihitung, bukan diasumsikan nol.
- **Output:** tabel item, spesifikasi, satuan, kuantitas, dan dasar perhitungan; harga satuan serta total biaya opsional. Ekspor CSV atau Excel direncanakan.
- **Parameter:** katalog item, satuan, klasifikasi existing/baru, pembulatan, persentase/aturan cadangan, dan harga opsional — **Perlu ditentukan**.
- **Status:** **Direncanakan**. Jumlah kategori dalam viewer bukan rekap BoQ; nilai panjang statis bukan dasar kuantitas material.

Panjang rute dan tambahan cadangan kabel harus ditampilkan terpisah agar cadangan tidak dihitung dua kali. Aturan kebutuhan tiang baru, aksesoris, dan material lain belum tersedia.

## 9. Parameter perencanaan dan asumsi

| Data/parameter | Kondisi saat ini | Keputusan/kebutuhan berikutnya |
| --- | --- | --- |
| Koordinat dan ID unik tiang/rumah | Demo dan impor titik; ID impor tidak stabil | Identitas survei permanen, validasi rentang, deduplikasi: **Perlu ditentukan** |
| Nama, kategori, sumber, properti tambahan | Nama/sumber disimpan; kategori dari nama | Skema atribut, pemetaan kategori, pelestarian properti: **Perlu ditentukan** |
| Koneksi antartiang/jalan/koridor | Belum tersedia sebagai graf | Sumber data, arah koneksi dan kelayakan lintasan: **Perlu ditentukan** |
| Lokasi sumber jaringan/OLT | Belum tersedia | Koordinat, kapasitas, titik sambung: **Perlu ditentukan** |
| Kapasitas FAT/FDT | Belum dimodelkan | Port, hierarki dan cadangan kapasitas: **Perlu ditentukan** |
| Batas panjang drop dan bentang | Belum dikonfigurasi | Nilai, satuan dan dasar pemilihan: **Perlu ditentukan** |
| Rasio dan susunan splitter | Belum dimodelkan | Jenis, tingkatan dan loss perangkat: **Perlu ditentukan** |
| Parameter optik | Belum dimodelkan | Perangkat, wavelength, daya/loss/rentang penerimaan: **Perlu ditentukan** |
| Cadangan kabel | Belum dihitung | Persentase atau aturan per segmen/lokasi: **Perlu ditentukan** |
| Klasifikasi tiang existing/baru | Belum ada field khusus | Aturan status aset dan kebutuhan baru: **Perlu ditentukan** |
| Jumlah data yang harus didukung | Belum ditetapkan | Target volume, perangkat uji, waktu respons: **Perlu ditentukan** |

Angka awal input buffer “100”, koordinat/pusat peta Bandung, zoom `14`, angka panjang demo, dan skala statis merupakan nilai UI/demo; bukan parameter teknik FTTH yang telah disepakati. Asumsi CRS data impor perlu diverifikasi; kode belum melakukan reproyeksi.

## 10. Tahapan pengembangan

| Tahap | Lingkup dan hasil yang dituju | Kondisi saat ini |
| --- | --- | --- |
| 1. Viewer dan validasi survei | Impor KML/KMZ lengkap, normalisasi GeoJSON, validasi, kategori, detail, filter, ekspor valid | Sebagian: fondasi viewer dan parser titik |
| 2. Jaringan antartiang | Graf koridor, usulan koneksi, koreksi manual, tanda tidak terhubung, panjang segmen | Direncanakan |
| 3. Clustering rumah dan FAT | Penempatan pada tiang, kapasitas port, rute drop, rumah belum terlayani | Direncanakan |
| 4. FDT dan sumber jaringan | Sentralitas melalui graf, kapasitas/cakupan, koneksi sumber, koreksi lokasi | Direncanakan |
| 5. Link budget | Model perangkat, rincian loss, estimasi daya dan evaluasi rentang | Direncanakan |
| 6. BoQ dan ekspor | Rekap yang dapat ditelusuri, cadangan terpisah, CSV/Excel | Direncanakan |

Setiap tahap memerlukan pemeriksaan manual dan data uji sebelum melanjutkan otomatisasi berikutnya. Jadwal, prioritas rinci, dan penanggung jawab: **Perlu ditentukan**.

## 11. Keterbatasan dan kebutuhan data

- Data demo harus dibedakan dari survei nyata. Data impor masih bercampur dengan demo; belum ada manajemen proyek/file yang lengkap.
- Parser KML dapat salah menafsirkan garis atau poligon sebagai titik. KMZ, ExtendedData, geometri kompleks, dan validasi kesalahan masih perlu ditangani.
- Belum ada persistence, editor koordinat/kategori, undo/redo, atau koreksi koneksi. Muat ulang menghapus data impor.
- Banyak titik dapat menyebabkan kepadatan visual. Clustering tampilan, label berdasarkan zoom, dan filter layer merupakan kebutuhan; saat ini belum lengkap.
- Panjang impor, skala, status pemetaan, buffer, dan mode ukur pada UI tidak boleh dipakai sebagai hasil teknik yang sah.
- Data jalan/koridor, akses pemasangan, hambatan, kapasitas, OLT, dan spesifikasi optik harus dilengkapi sebelum hasil otomatis dianggap layak ditinjau.
- Akurasi dan kelayakan pemasangan harus diperiksa terhadap koordinat survei serta kondisi lapangan; screenshot tidak cukup.
- Tidak ditemukan script lint/test dan rangkaian uji otomatis project. `typescript.ignoreBuildErrors: true` membuat build produksi tidak menjadi bukti kelulusan pemeriksaan tipe.
- Pemeriksaan tipe awal menemukan ketidakcocokan callback `onSelect`: `MapFeature` pada `map-view.tsx` tidak memuat `file` dan `kind` yang diperlukan `FeatureItem` pada viewer. Ini adalah masalah yang sudah ada, bukan fitur yang diperbaiki oleh dokumentasi.

## 12. Cara menjalankan project

Gunakan Node.js yang kompatibel dengan versi Next.js terpasang; Next.js 16 memerlukan setidaknya Node.js `20.9`. Project mendeklarasikan **pnpm `12.3.4`**. Pastikan versi tersebut tersedia melalui pengelola package manager lingkungan Anda, lalu jalankan dari root:

```bash
pnpm --version
pnpm install
pnpm dev
```

Buka alamat yang dicetak server, umumnya `http://localhost:3000`. Untuk produksi lokal:

```bash
pnpm build
pnpm start
```

Jika lingkungan mewariskan `NODE_ENV=development`, gunakan `NODE_ENV=production pnpm build` dan `NODE_ENV=production pnpm start` untuk pemeriksaan produksi. Pada pemeriksaan upgrade, build berhasil setelah nilai lingkungan tersebut disesuaikan; respons halaman utama dan 10 aset JS/CSS menghasilkan HTTP 200, serta URL yang tidak ada menghasilkan 404. Ini belum membuktikan semua interaksi browser atau fitur survei telah lulus pengujian.

Script yang benar-benar ada:

| Script | Perintah | Fungsi |
| --- | --- | --- |
| `dev` | `next dev` | Server pengembangan |
| `build` | `next build` | Build produksi |
| `start` | `next start` | Menjalankan build produksi |

Tidak ada script `test`, `lint`, atau `typecheck`. Pemeriksaan tipe dapat dijalankan melalui `pnpm exec tsc --noEmit`; hasilnya perlu ditinjau terpisah dari build. Versi Next.js terpasang dapat diperiksa melalui `pnpm exec next --version`.

`pnpm-workspace.yaml` memuat `pmOnFail: ignore` serta pengecualian minimum release age untuk `next` dan `@next/*`; pertahankan kebijakan tersebut saat pemeliharaan. Tidak ditemukan kebutuhan konfigurasi database atau kredensial backend untuk viewer dasar. Pengunduhan dependency dan tile peta membutuhkan jaringan.

## 13. Kriteria penerimaan dan pemeriksaan dasar

Daftar berikut adalah kriteria pemeriksaan, **bukan klaim semua telah lulus**.

### Viewer saat ini dan penyelesaian tahap 1

- Pastikan halaman `/` terbuka, marker demo tampil, zoom, fit, pencarian, pemilihan dan salin koordinat bekerja sesuai dukungan browser.
- Uji KML titik kecil dengan koordinat yang diketahui; bandingkan lokasi, kategori, nama dan sumber dengan file asli.
- Untuk rumah terpilih, periksa estimasi tiang terdekat menggunakan jarak geospasial dalam meter; jangan menganggapnya panjang kabel aktual.
- Uji pencarian dan ekspor dengan fitur Point saja. Periksa urutan longitude, latitude. Ekspor semua data demo belum memenuhi kriteria geometri karena entri kabelnya tidak valid.
- Sebelum menyatakan dukungan KML/KMZ lengkap, uji arsip berisi KML, XML rusak, geometri campuran, koordinat kosong/di luar rentang, properti tambahan, ID ganda, dan impor ulang. Hasil harus memberi laporan penerimaan/penolakan yang jelas.
- Sebelum menyatakan filter, pengukuran, buffer, atau ringkasan siap, pastikan kontrol mengubah data/geometri dan angka berasal dari perhitungan, bukan placeholder.
- Uji reload agar perilaku kehilangan data sesi dipahami. Persistensi baru boleh dinyatakan tersedia setelah implementasi dan pengujiannya ada.
- Jalankan instalasi, build dan smoke test; catat pemeriksaan tipe secara terpisah karena konfigurasi saat ini mengabaikan error tipe saat build.

### Tahap perencanaan berikutnya

- Jalur antartiang mengikuti koneksi/koridor yang disetujui, menghormati batas bentang, menandai simpul terputus, serta dapat ditambah/dihapus manual.
- Setiap rumah memiliki penugasan FAT yang dapat ditelusuri atau alasan belum terlayani. Kapasitas port dan batas drop diperiksa; estimasi garis lurus diberi label.
- FDT dipilih pada lokasi pemasangan yang layak, melayani FAT sesuai kapasitas/cakupan, serta memiliki jalur ke sumber bila datanya tersedia.
- Link budget memiliki rincian komponen dan satuan yang benar, parameter bersumber dari perangkat terpilih, serta membedakan estimasi dengan pengukuran OPM.
- BoQ membedakan existing/baru, rute/cadangan, serta item otomatis/manual/belum dihitung. Angka ekspor harus sama dengan tabel dan dapat ditelusuri ke segmen/perangkat.
- Target toleransi numerik, dataset uji, batas performa, dan persetujuan parameter teknik: **Perlu ditentukan**.
