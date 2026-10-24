# Smart FTTH Planner — Gambaran Project

Dokumen ini memisahkan kondisi kode saat ini dari kebutuhan pengembangan. Dasar pemeriksaan: `package.json`, `app/`, `components/`, `lib/`, dan konfigurasi di root. Keberadaan dependency atau tombol tidak berarti fiturnya telah selesai.

## 1. Ringkasan project dan tujuan

Smart FTTH Planner adalah aplikasi pemetaan dan perencanaan jaringan Fiber to the Home (FTTH). Data awal berasal dari survei lapangan berupa koordinat tiang dan rumah pelanggan dalam KML/KMZ.

Tahap awal berfokus pada viewer untuk mengimpor, menampilkan, dan memeriksa data survei. Kode saat ini merupakan prototipe **FTTH Survey Viewer**, dengan peta interaktif, kondisi awal kosong, impor KML/KMZ, dan ekspor GeoJSON yang mempertahankan geometri. Pengelompokan awal rumah (maksimal delapan anggota) dan kandidat FAT berdasarkan jarak geografis sudah tersedia. Routing jaringan, penempatan perangkat berdasarkan jalur fisik, link budget, dan BoQ masih rencana pengembangan.

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

1. Buka halaman utama; aplikasi menampilkan peta tanpa objek survei dan petunjuk impor, bukan otomatis membaca file survei di root.
2. Pilih **Impor Data** untuk memilih satu atau beberapa file. Arsip KMZ diekstrak dan seluruh KML di dalamnya dibaca; hasil dan peringatan ditampilkan pada panel.
3. Cari berdasarkan nama atau ID, lihat titik, garis, dan poligon pada peta, dan klik objek untuk memeriksa kategori, koordinat, serta sumber file.
4. Pilih rumah untuk melihat tiang terdekat berdasarkan jarak garis lurus.
5. Gunakan zoom dan **Fit ke Data**, lalu ekspor fitur yang lolos pencarian menjadi GeoJSON dengan geometri dan properti aslinya.
6. Jalankan **Mulai pengelompokan & estimasi FAT** di panel kontrol. Pilih kelompok untuk melihat anggota dan kandidat FAT. Kontrol layer perencanaan di kiri bawah peta mengatur kelompok, kandidat FAT, dan garis hubungan layanan.
7. Muat ulang halaman menghapus hasil impor dan rencana dari memori, lalu mengembalikan viewer ke kondisi kosong.

Alur tujuan berikutnya: validasi survei → koreksi jaringan antartiang → penempatan FAT → penempatan FDT dan koneksi sumber → link budget → BoQ → pemeriksaan serta ekspor. Ini belum menjadi alur aplikasi yang dapat dijalankan.

## 4. Teknologi dan arsitektur saat ini

Versi berikut adalah deklarasi `package.json`; awalan `^` merupakan rentang versi, bukan jaminan versi terpasang.

| Teknologi | Versi deklarasi | Penggunaan yang ditemukan |
| --- | --- | --- |
| Next.js | `16.4.3` | App Router; halaman utama dan layout; peta dimuat dinamis dengan `ssr: false` |
| React / React DOM | `19.2.4` / `19.2.4` | Komponen dan state antarmuka |
| TypeScript | `5.7.3` | Tipe data dan konfigurasi strict |
| Leaflet / React Leaflet | `^1.9.4` / `^5.0.0` | Peta, tile OpenStreetMap, GeoJSON, CircleMarker, zoom dan fit bounds |
| Turf.js (`@turf/turf`) | `^7.4.0` | `point`, `distance`, `length`, `flattenEach`, dan `bbox` untuk jarak, panjang garis, dan batas geometri |
| JSZip | `^3.10.2` | Ekstraksi KML dari arsip KMZ di browser |
| `@tmcw/togeojson` | `^7.1.3` | Konversi KML ke geometri GeoJSON dan properti |
| `react-leaflet-cluster` | `^4.1.3` | Dependency tersedia, **belum digunakan** untuk clustering marker |
| `@base-ui/react` | `^1.5.0` | Primitive button, input, badge dan separator |
| shadcn | `^4.11.0` | Konfigurasi `base-nova`, komponen lokal, dan stylesheet |
| Tailwind CSS / plugin PostCSS | `^4.3.3` / `^4.3.3` | Styling; PostCSS `^8.5` sebagai alat build |
| `tw-animate-css` | `^1.4.0` | Stylesheet animasi diimpor |
| `lucide-react` | `^1.16.0` | Ikon antarmuka |
| `sonner` | `^2.0.8` | Toast sukses/gagal impor dan ekspor; `<Toaster />` terpasang |
| `class-variance-authority` | `^0.7.1` | Variasi komponen UI |
| `clsx`, `tailwind-merge`, `cn` | `^2.1.1`, `^3.3.1`, `^0.5.0` | Penggabungan class CSS |
| `@vercel/analytics` | `1.6.1` | Komponen Analytics dirender pada mode produksi |
| Tipe Leaflet / Node / React / React DOM | `^1.9.22` / `^24` / `19.2.14` / `19.2.3` | Dukungan tipe pengembangan |
| `@xmldom/xmldom` | `^0.9.12` | DOMParser untuk pengujian importer di Node; bukan runtime browser |
| pnpm | `12.3.4` | Package manager yang dideklarasikan melalui `packageManager` |

Arsitektur: `app/page.tsx` merender `FtthViewer`, komponen client yang menyimpan data melalui React state. Komponen itu memuat `MapView` di browser. Pembacaan memakai File API, JSZip untuk KMZ, `DOMParser`, dan togeojson. Ekspor menggunakan Blob dan tautan unduhan.

Tidak ditemukan API route, database, backend domain terpisah, atau IndexedDB. Perencanaan awal dijalankan sebagai fungsi TypeScript di browser; routing jaringan fisik belum tersedia. Preferensi Layer Settings disimpan di localStorage; data survei tetap hanya dalam React state. Next.js tetap membutuhkan runtime Node.js untuk perintah pengembangan dan server produksi yang tersedia. Tile OpenStreetMap dan Esri World Imagery memerlukan akses jaringan; belum ada dukungan peta offline.

## 5. Struktur folder penting

```text
app/
  page.tsx                 Halaman utama viewer
  layout.tsx               Metadata, viewport, CSS, Analytics produksi
  globals.css              Tailwind, tema, penyesuaian Leaflet
components/
  ftth-viewer.tsx           State, impor, pencarian, ekspor, panel
  map-view.tsx              Peta Leaflet, basemap, pane kategori dan pembaruan layer
  layer-settings.tsx        Panel visibility, styling, urutan dan basemap
  planning-panel.tsx        Tombol perhitungan, daftar kelompok dan detail FAT
  planning-map-layers.tsx   Overlay dan kontrol layer perencanaan Leaflet
  ui/                      Button, Badge, Input, Separator
lib/
  utils.ts                 Helper penggabungan class CSS
  survey.ts                Model data, kategori, validasi dan ekspor geometri
  layer-settings.ts        Preferensi awal, validasi, urutan dan penyedia tile
  ftth-planning.ts         Validasi input, grouping greedy, skor kandidat FAT
  import-survey.ts          Pembaca KML/KMZ dan laporan impor
  kml-metadata.ts           Pembaca SchemaData, resolusi schema lokal, peringatan metadata
hooks/
  use-layer-settings.ts    Pemulihan dan penyimpanan preferensi localStorage
tests/
  layer-settings.test.cjs   Uji validasi, urutan dan geometri campuran
  ftth-planning.test.cjs    Uji grouping, skor FAT, kasus kosong/invalid, dan KMZ contoh
  map-layer-lifecycle.test.cjs Uji kontrak renderer, overlay rencana dan persistence dengan mock
  import-survey.test.cjs    Uji parser, arsip, geometri, dan file contoh
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

`node_modules/` dan `.next/` adalah hasil instalasi/build, bukan sumber fitur.

## 6. Format input dan struktur data

### Pembacaan dan validasi

Pemilih menerima satu atau beberapa `.kml`/`.kmz`, tanpa membedakan huruf besar/kecil. `lib/import-survey.ts` mengekstrak KMZ menggunakan JSZip dan membaca seluruh KML di dalamnya, termasuk subfolder; entri `__MACOSX/` diabaikan. Tidak ada unggahan survei ke backend. KML dikonversi melalui `@tmcw/togeojson` setelah pemeriksaan XML dan elemen root.

Point, LineString, Polygon, bentuk Multi, serta GeometryCollection dipertahankan sebagai GeoJSON. Koordinat diperiksa agar finite dengan longitude dalam -180 sampai 180 dan latitude dalam -90 sampai 90. Garis harus memiliki minimal dua titik; cincin poligon minimal empat titik dan tertutup. Fitur tanpa geometri atau tidak valid dilewati dengan laporan. Ini belum mencakup validasi topologi seperti self-intersection.

Arsip rusak/terenkripsi, arsip tanpa KML, dan file tanpa fitur valid menghasilkan pesan gagal. Bila satu KML dalam arsip gagal tetapi KML lain valid, fitur valid tetap dimuat dengan peringatan. NetworkLink eksternal tidak diambil dan gambar GroundOverlay tidak dirender. Ikon, foto, dan styling khusus KML tidak direproduksi; viewer memakai warna kategori sendiri.

### SchemaData dan schema yang tidak ditemukan

`SchemaData/SimpleData` dibaca kembali dari XML asli dan digabungkan ke `properties` GeoJSON, termasuk `HPTAR_ID`. Pembacaan tambahan diperlukan karena `@tmcw/togeojson` 7.1.3 memilih tipe field berdasarkan nama di seluruh dokumen, bukan berdasarkan `schemaUrl`. Konverter menerima salinan XML tanpa SchemaData; seluruh atribut SchemaData kemudian dikembalikan dari sumber asli tanpa memodifikasi geometri hasil konversi.

Referensi schema hanya dicocokkan dengan definisi `Schema` di dokumen yang sama atau KML lain yang sudah ada di dalam KMZ, termasuk jalur relatif. Schema eksternal tidak diambil otomatis. Jika definisi schema/field/tipe tidak ditemukan, nilainya tetap string apa adanya, termasuk nol di depan, spasi, dan string kosong. Tipe hanya diterapkan bila field memiliki definisi eksplisit pada schema yang dirujuk; tipe tidak dikenal atau nilai bertipe tidak valid tetap string.

Schema yang hilang tidak menggagalkan fitur dengan geometri valid. Panel **Peringatan metadata** mengelompokkan peringatan per sumber KML dan `schemaUrl`, dengan daftar nama serta ID asli fitur; bila ID asli tidak ada, digunakan ID internal. Tidak ada popup per fitur. **Masalah geometri** ditampilkan terpisah dan hanya menjelaskan fitur yang tidak dapat dimuat karena geometrinya. Peringatan tetap tersedia bila seluruh geometri gagal.

Ekspor memprioritaskan nama/nilai atribut asli apabila bertabrakan dengan nama properti tambahan viewer seperti `id`, `name`, atau `source`. ID internal fitur tetap tersedia pada anggota `id` GeoJSON di luar `properties`.

### Model data

`lib/survey.ts` mendefinisikan model bersama untuk importer dan peta:

```ts
type FeatureItem = {
  id: string                         // ID internal unik setiap impor
  name: string
  category: Category
  file: string                       // nama KML/KMZ yang dipilih
  kmlFile: string                    // jalur KML di dalam KMZ
  kind: Geometry['type']
  geometry: Geometry                // GeoJSON utuh, termasuk lubang poligon
  coords: [number, number]           // latitude, longitude titik pertama
  description?: string
  props: GeoJsonProperties           // properti KML/ExtendedData
}
```

Geometri GeoJSON memakai **longitude, latitude**; altitude dipertahankan jika tersedia. `coords` hanya titik pertama untuk panel detail, bukan pengganti geometri penuh. Label panel membedakan “Latitude, Longitude” untuk Point dan “Titik awal (Lat, Lon)” untuk bentuk lain. ID KML asli disimpan sebagai `props.originalId` bila ada dan tidak berbenturan dengan atribut asli bernama sama; ID internal bukan identitas survei permanen.

Garis dan MultiLineString dikategorikan sebagai “Jalur kabel”. Untuk bentuk lain, nama diperiksa untuk FDT, FAT, POLE/TIANG, dan RUMAH/HOME/PELANGGAN. Khusus geometri Point, nama yang hanya berisi angka (misalnya `29` atau `001`, dengan spasi di awal/akhir diabaikan) juga dikategorikan sebagai “Rumah”; nama dan koordinat asli tetap dipertahankan. Sisanya “Belum dikategorikan”. Editor kategori belum tersedia. Impor ulang menambahkan objek dengan ID internal baru; belum ada deduplikasi otomatis.

### Tampilan dan ekspor

Peta mulai kosong. Setelah impor berhasil, pencarian dikosongkan dan peta dipusatkan ke batas seluruh geometri yang baru dimuat. Marker titik, garis, poligon, dan geometri campuran dapat dipilih untuk melihat detail sumbernya. Tombol Fit memakai semua fitur. Ekspor mempertahankan geometri dan properti fitur yang lolos pencarian.

Jumlah file dihitung dari nama sumber unik pada fitur valid: dua file bernama sama dihitung sebagai satu sumber, sedangkan beberapa KML di dalam satu KMZ tetap dihitung satu file. Panjang garis dihitung dari seluruh LineString/MultiLineString, termasuk yang berada dalam GeometryCollection, dalam meter melalui Turf; keliling poligon tidak dihitung sebagai kabel. Luas belum dihitung.

`Data-Mentah.kmz` tidak dimuat otomatis. Pengujian parser pada file tersebut menghasilkan **244 fitur: 243 Point dan 1 Polygon**. Screenshot peta tetap bukan pengganti koordinat asli atau pemeriksaan lapangan.

### Layer Settings

Buka tombol **Layer Settings** di kanan atas peta. Panel dapat ditutup lewat tombol X atau Escape; fokus kembali ke tombol pembuka. Panel memakai komponen UI yang ada, input warna/range/radio/checkbox native, dan lebar yang menyesuaikan viewport kecil.

Pengaturan tersedia untuk enam kategori yang sudah ada: Tiang, Rumah, FAT, FDT, Jalur kabel, dan Belum dikategorikan. Setiap kategori memiliki visibility dan warna sendiri. Klik simbol mata pada daftar kategori atau panel Layer Settings untuk hide/show: mata terbuka berarti tampil, mata dicoret berarti tersembunyi. Kedua kontrol sinkron dan preferensinya tetap tersimpan. Ukuran marker adalah diameter 8–40 px; ketebalan garis 1–10 px. Kontrol transparansi poligon ditampilkan jika kategori berisi poligon, termasuk geometri campuran. Warna yang dipilih berlaku pada geometri kategori tersebut. Urutan paling atas pada daftar tampil di depan melalui pane Leaflet; tombol naik/turun memengaruhi vektor dan ikon rumah.

Instance MapContainer dipertahankan. Pergantian basemap hanya mengganti TileLayer, sedangkan visibility menambah/melepas group kategori yang sama. Styling memakai setStyle, setRadius dan setIcon; label diperbarui tanpa membangun ulang geometri. Data dan hasil ekspor tetap mengikuti pencarian seperti sebelumnya; visibility hanya mengubah tampilan peta dan jumlah fitur terlihat.

Preferensi disimpan dengan key `smart-ftth-planner.layer-settings.v1` setelah proses pemulihan selesai agar nilai awal tidak menimpa preferensi tersimpan. Data tersimpan divalidasi: kategori tidak dikenal dibuang, urutan dideduplikasi, nilai numerik dibatasi dan warna harus hex. Jika localStorage tidak tersedia, kontrol tetap bekerja selama sesi dan panel memberi status penyimpanan. Tombol reset mengembalikan preferensi awal. Pengaturan tidak menyimpan data survei, koordinat tampilan atau tingkat zoom.

Peta jalan menggunakan endpoint HTTPS OpenStreetMap dengan atribusi yang tetap terlihat dan caching bawaan browser, tanpa unduhan offline/prefetch. Citra satelit memakai layanan publik Esri World Imagery dengan kredit sumber layanan dan tautan atribusi; ketentuan penyedia dapat dibuka dari panel. Referensi: [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/), [World Imagery](https://goto.arcgisonline.com/maps/World_Imagery), dan [Esri Service Terms](https://www.esri.com/en-us/legal/terms/web-site-service). Resolusi citra bergantung lokasi; di atas zoom native 19, tile diperbesar hingga zoom 22.

### Perencanaan awal FTTH (MVP)

Impor hanya memuat dan menampilkan data survei; tidak menjalankan pengelompokan atau estimasi FAT. Setelah impor, status menunjukkan perencanaan belum dijalankan. Klik **Mulai pengelompokan & estimasi FAT** pada panel kontrol untuk memulai secara manual. Tombol nonaktif selama impor atau jika data belum tersedia. Hanya fitur kategori Rumah dan Tiang dengan geometri Point tunggal serta koordinat valid yang dipakai. Perhitungan memakai koordinat GeoJSON asli, bukan koordinat tampilan panel. Geometri tidak valid, bentuk non-Point pada dua kategori ini, dan ID internal duplikat dilaporkan sebagai data yang tidak digunakan. ID sumber seperti HPTAR_ID/POLE_ID dipertahankan untuk informasi pengguna; keanggotaan memakai ID internal.

Algoritma `groupHomes` mengurutkan rumah secara geografis (longitude, latitude, lalu nama/ID), memilih rumah pertama yang belum dipakai sebagai seed, dan mengambil maksimal tujuh rumah terdekat ke seed berdasarkan jarak Turf dalam meter. Proses diulang hingga semua rumah valid mendapat satu kelompok. Ini adalah greedy sederhana, bukan optimasi global; tidak ada ambang jarak atau asumsi koridor kabel.

`selectFatPole` membandingkan **seluruh tiang valid** untuk setiap kelompok. Skornya adalah jumlah jarak geografis tiang ke seluruh rumah anggota; kandidat dengan jumlah terkecil dipilih, tanpa pendekatan centroid. Jika nilai sama, urutan koordinat, nama dan ID dipakai secara konsisten. Tiang tidak memiliki pembatas pemasangan pada MVP dan boleh dipilih oleh beberapa kelompok. Setiap kelompok tetap mempunyai ID kandidat FAT sendiri (`FAT-G001`, dan seterusnya).

Hasil `FtthPlan` terpisah dari data survei: kelompok berisi ID (`G001`, dan seterusnya), warna, snapshot rumah, kandidat FAT/tiang, jumlah jarak dan hubungan layanan per rumah. Data sumber tidak diedit dan kandidat tidak ditambahkan sebagai objek FAT survei. Ekspor GeoJSON yang sudah ada tetap mengekspor data survei, bukan hasil perencanaan.

Visualisasi terdiri dari tiga overlay mandiri:

- **Kelompok rumah:** lingkaran warna di setiap rumah, label ID kelompok permanen, serta tooltip identitas anggota. Tidak perlu poligon batas untuk kelompok tunggal atau titik segaris.
- **Kandidat FAT:** penanda FAT khusus di koordinat tiang. Jika satu tiang dipilih beberapa kelompok, digunakan satu marker dengan popup berisi pilihan setiap kelompok/kandidat.
- **Hubungan layanan:** garis putus-putus dari kandidat FAT ke setiap rumah. Ini hanya relasi layanan dan jarak geografis, **bukan jalur kabel fisik**, routing, distribusi antartiang, atau slingwire.

Klik rumah atau lingkaran perencanaannya untuk membuka informasi objek survei asli, termasuk atribut KMZ/KML seperti HPTAR_ID; klik ini tidak membuka detail kelompok atau mengubah zoom. Klik ikon kelompok di label peta/daftar panel, atau ikon kandidat FAT, untuk membuka detail kelompok (ID, jumlah rumah, FAT, tiang dan anggota) serta menyesuaikan area peta. Klik nama kelompok untuk memasang/melepas sorotan visual tanpa membuka detail atau mengubah zoom; hover/fokus keyboard memberi sorotan sementara. Kelompok tersorot memiliki lingkaran/garis lebih tegas, label dan FAT lebih menonjol; kelompok lain diredupkan. Garis layanan tidak menangkap klik agar tidak menutupi rumah. Tiga overlay dapat di-hide/show dari kontrol Leaflet di kiri bawah; toggling tidak mengubah hasil hitungan. Visualisasi rencana mencakup seluruh rumah valid, terpisah dari pencarian dan visibility kategori survei.

**Hitung ulang kelompok & FAT** mengganti hasil lama dan isi overlay, tanpa menumpuk marker/garis atau kontrol baru; visibility overlay yang dipilih tetap dipertahankan selama kontrol masih terpasang. Memulai impor baru membatalkan hasil lama agar tidak tertukar dengan data yang sedang dimuat; jalankan kembali perhitungan. Hasil dan pilihan layer perencanaan hanya selama sesi, tidak disimpan dalam localStorage.

Bila tidak ada rumah valid, panel menjelaskan bahwa tidak ada kelompok yang bisa dibuat. Bila tidak ada tiang valid, rumah tetap dikelompokkan dengan kandidat FAT `null`, tanpa marker FAT/garis layanan. Batas panjang drop, kelayakan pemasangan, kapasitas perangkat fisik, dan cadangan port belum diperiksa. Batas delapan rumah adalah aturan kelompok MVP, bukan pernyataan spesifikasi perangkat yang sudah disepakati.

## 7. Fitur viewer dan status implementasi

**Tersedia** berarti ada mekanisme dalam kode untuk lingkup yang disebutkan, bukan pernyataan bahwa seluruh skenario telah lulus uji. **Sebagian** berarti ada pembatasan atau UI tanpa mekanisme lengkap. **Direncanakan** berarti belum ditemukan implementasinya.

| Fitur | Status | Kondisi konkret |
| --- | --- | --- |
| Peta dan geometri berwarna | Tersedia | OpenStreetMap, ikon rumah untuk kategori Rumah, ikon tiang dengan palang untuk kategori Tiang, lingkaran untuk titik kategori lain, garis kabel, poligon, dan geometri campuran melalui GeoJSON |
| Zoom, fit bounds, buka/tutup sidebar | Tersedia | Fit memakai seluruh fitur, bukan hanya hasil pencarian |
| Pencarian nama/ID | Tersedia | Menyaring marker, jumlah terlihat, dan data ekspor |
| Pemilihan objek dan salin koordinat | Tersedia | Panel kategori, nama, ID, sumber, koordinat; Clipboard API memerlukan izin/konteks browser yang mendukung |
| Rumah ke tiang terdekat | Tersedia | Jarak garis lurus dalam meter; bukan rute drop atau penugasan FAT |
| Impor KML | Tersedia | Konversi geometri dan ExtendedData; pemeriksaan XML, koordinat, serta struktur geometri dasar |
| Impor KMZ | Tersedia | Ekstraksi seluruh KML termasuk subfolder; laporan sukses/peringatan/gagal; auto-fit hasil impor |
| Ekspor GeoJSON | Tersedia | Mengunduh hasil pencarian dengan geometri asli, atribut dan sumber KML/KMZ |
| Ringkasan survei | Tersedia | Jumlah sumber file, fitur, kategori, status dan panjang garis berdasarkan hasil impor |
| Filter layer/kategori | Tersedia | Visibility independen lewat tombol kategori dan panel Layer Settings; tidak menghapus data survei |
| Base map | Tersedia | Peta jalan OpenStreetMap dan citra Esri World Imagery; pergantian hanya mengganti tile |
| Styling layer | Tersedia | Warna, diameter marker, ketebalan garis dan transparansi poligon; berlaku langsung |
| Urutan layer | Tersedia | Tombol naik/turun mengubah z-index pane tiap kategori, termasuk ikon rumah dan tiang |
| Preferensi layer | Tersedia | Disimpan di localStorage dan dipulihkan saat halaman dibuka; reset dan fallback bila storage tidak tersedia |
| Label | Sebagian | Tooltip teks saat hover; dinonaktifkan saat opsi mati; belum berbasis zoom |
| Ukur jarak | Sebagian | State dan rumus ada; klik peta belum mengisi titik ukur dan hasil belum ditampilkan |
| Buffer | Sebagian | Input awal “100” dan pemanggilan toast saja; tidak membuat atau menggambar geometri buffer |
| Koordinat kursor dan skala | Sebagian | Koordinat kursor masih “—”; skala dummy dihapus, perhitungan skala belum tersedia |
| Notifikasi | Tersedia | Satu toast hasil impor; panel umum, kelompok peringatan metadata berisi nama/ID/schema, dan masalah geometri yang terpisah |
| Clustering marker / label berdasarkan zoom | Direncanakan | Dependency clustering belum digunakan |
| Validasi, deduplikasi, koreksi manual survei | Sebagian | Validasi XML/koordinat/geometri dasar tersedia; deduplikasi, validasi topologi dan editor belum ada |
| Penyimpanan proyek | Direncanakan | Hanya state selama sesi; muat ulang kehilangan impor |
| Jaringan distribusi otomatis dan koreksinya | Direncanakan | Belum ada graf antartiang |
| Clustering pelanggan dan kandidat FAT | Sebagian | Grouping greedy maksimal 8 rumah; tiang dengan jumlah jarak terkecil; overlay dan detail interaktif. Belum ada routing/batas drop/koreksi manual |
| Penempatan FDT | Direncanakan | Belum ada algoritma penempatan FDT |
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
- **Status:** **Direncanakan**. Saat ini dapat menampilkan titik dan jalur yang sudah ada dalam file impor; graf antartiang dan pembentukan rute otomatis belum tersedia.

### 8.2 Penempatan FAT otomatis dan clustering rumah berdasarkan kabel drop

- **Tujuan:** membagi pelanggan ke FAT yang kapasitas dan jangkauan drop-nya layak.
- **Input:** rumah dengan ID unik, tiang kandidat FAT, graf jalur kabel, kapasitas port, dan batas panjang drop.
- **Mekanisme sederhana:** pilih kandidat FAT pada tiang yang dapat dipasang; alokasikan rumah dengan menjaga kapasitas port dan batas panjang kabel. Gunakan panjang rute kabel yang memungkinkan bila jaringan tersedia. Jika hanya ada jarak garis lurus, beri label estimasi awal dan minta pemeriksaan. Tandai rumah belum terlayani atau melebihi batas; sediakan koreksi penugasan manual.
- **Output:** lokasi FAT, daftar rumah yang dilayani, penggunaan/sisa port, geometri serta panjang drop, dan daftar pelanggan bermasalah.
- **Parameter:** kapasitas FAT, batas drop, cadangan port, kandidat tiang, aturan pengelompokan dan prioritas — **Perlu ditentukan**.
- **Status:** **Sebagian**. MVP sudah mengelompokkan maksimal 8 rumah dan memilih kandidat FAT pada tiang berdasarkan jumlah jarak geografis ke semua anggota, dengan relasi layanan terpisah. Pembatas panjang drop, rute kabel, kapasitas perangkat fisik/cadangan port, rumah melampaui jangkauan, dan koreksi penugasan manual masih direncanakan.

**Clustering pelanggan untuk perencanaan berbeda dari clustering marker.** Yang pertama menentukan hubungan layanan dan kapasitas; yang kedua hanya merapikan tampilan peta. Dependency `react-leaflet-cluster` tidak menyelesaikan penempatan FAT.

### 8.3 Penempatan FDT otomatis di lokasi sentral area

- **Tujuan:** menghubungkan kelompok FAT melalui FDT dengan cakupan dan kapasitas yang sesuai.
- **Input:** FAT hasil perencanaan, graf jalur kabel, tiang kandidat pemasangan, kapasitas FDT, serta lokasi sumber jaringan/OLT jika tersedia.
- **Mekanisme sederhana:** bandingkan kandidat tiang berdasarkan jarak melalui jaringan kabel ke kelompok FAT, lalu periksa kapasitas, konektivitas, akses pemasangan, dan hubungan ke sumber. Lokasi akhir harus berada di titik yang memungkinkan pemasangan dan dapat dikoreksi manual. Kebutuhan beberapa FDT harus dievaluasi berdasarkan kapasitas dan cakupan; jangan menetapkan satu FDT untuk semua kondisi.
- **Output:** lokasi FDT, daftar FAT yang dilayani, jalur penghubung, dan peringatan kapasitas/konektivitas.
- **Parameter:** kapasitas FDT, cakupan, bobot kriteria sentralitas, batas jalur, kandidat lokasi, dan aturan koneksi sumber — **Perlu ditentukan**.
- **Status:** **Direncanakan**. Belum ada pemilihan lokasi FDT otomatis.

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
- **Status:** **Direncanakan**. Jumlah kategori dalam viewer bukan rekap BoQ; panjang garis impor sudah dihitung, tetapi belum diubah menjadi kuantitas material beserta cadangannya.

Panjang rute dan tambahan cadangan kabel harus ditampilkan terpisah agar cadangan tidak dihitung dua kali. Aturan kebutuhan tiang baru, aksesoris, dan material lain belum tersedia.

## 9. Parameter perencanaan dan asumsi

| Data/parameter | Kondisi saat ini | Keputusan/kebutuhan berikutnya |
| --- | --- | --- |
| Koordinat dan ID unik tiang/rumah | Impor geometri dan properti; ID internal dibuat per impor | Identitas survei permanen, validasi rentang, deduplikasi: **Perlu ditentukan** |
| Nama, kategori, sumber, properti tambahan | Nama/sumber/properti disimpan; kategori dari nama dan jenis garis | Skema atribut wajib dan aturan koreksi kategori: **Perlu ditentukan** |
| Koneksi antartiang/jalan/koridor | Belum tersedia sebagai graf | Sumber data, arah koneksi dan kelayakan lintasan: **Perlu ditentukan** |
| Lokasi sumber jaringan/OLT | Belum tersedia | Koordinat, kapasitas, titik sambung: **Perlu ditentukan** |
| Kapasitas FAT/FDT | Kelompok MVP dibatasi 8 rumah; kapasitas perangkat fisik belum dimodelkan | Port, hierarki dan cadangan kapasitas perangkat: **Perlu ditentukan** |
| Batas panjang drop dan bentang | Belum dikonfigurasi | Nilai, satuan dan dasar pemilihan: **Perlu ditentukan** |
| Rasio dan susunan splitter | Belum dimodelkan | Jenis, tingkatan dan loss perangkat: **Perlu ditentukan** |
| Parameter optik | Belum dimodelkan | Perangkat, wavelength, daya/loss/rentang penerimaan: **Perlu ditentukan** |
| Cadangan kabel | Belum dihitung | Persentase atau aturan per segmen/lokasi: **Perlu ditentukan** |
| Klasifikasi tiang existing/baru | Belum ada field khusus | Aturan status aset dan kebutuhan baru: **Perlu ditentukan** |
| Jumlah data yang harus didukung | Belum ditetapkan | Target volume, perangkat uji, waktu respons: **Perlu ditentukan** |

Angka awal input buffer “100”, koordinat/pusat peta Bandung, dan zoom `14` merupakan nilai awal antarmuka; bukan parameter teknik FTTH yang telah disepakati. Asumsi CRS data impor perlu diverifikasi; kode belum melakukan reproyeksi.

## 10. Tahapan pengembangan

| Tahap | Lingkup dan hasil yang dituju | Kondisi saat ini |
| --- | --- | --- |
| 1. Viewer dan validasi survei | Impor KML/KMZ lengkap, normalisasi GeoJSON, validasi, kategori, detail, filter, ekspor valid | Sebagian: impor KML/KMZ, geometri, ekspor dan validasi dasar tersedia; editor belum tersedia |
| 2. Jaringan antartiang | Graf koridor, usulan koneksi, koreksi manual, tanda tidak terhubung, panjang segmen | Direncanakan |
| 3. Clustering rumah dan FAT | Penempatan pada tiang, kapasitas port, rute drop, rumah belum terlayani | Sebagian: grouping maksimal 8 dan kandidat berdasarkan jarak tersedia; routing/drop/kapasitas perangkat belum tersedia |
| 4. FDT dan sumber jaringan | Sentralitas melalui graf, kapasitas/cakupan, koneksi sumber, koreksi lokasi | Direncanakan |
| 5. Link budget | Model perangkat, rincian loss, estimasi daya dan evaluasi rentang | Direncanakan |
| 6. BoQ dan ekspor | Rekap yang dapat ditelusuri, cadangan terpisah, CSV/Excel | Direncanakan |

Setiap tahap memerlukan pemeriksaan manual dan data uji sebelum melanjutkan otomatisasi berikutnya. Jadwal, prioritas rinci, dan penanggung jawab: **Perlu ditentukan**.

## 11. Keterbatasan dan kebutuhan data

- Viewer mulai kosong dan hanya memuat data hasil impor. Belum ada manajemen proyek/file yang lengkap; jumlah sumber dihitung dari nama file unik.
- NetworkLink eksternal, gambar GroundOverlay, ikon/foto dalam arsip, dan styling KML khusus belum ditampilkan. Validasi topologi, deduplikasi dan target volume data belum ditetapkan.
- Preferensi layer tersimpan di localStorage, tetapi data survei belum memiliki persistence. Belum ada editor koordinat/kategori, undo/redo, atau koreksi koneksi. Muat ulang menghapus data impor.
- Banyak titik dapat menyebabkan kepadatan visual. Filter layer sudah tersedia. Clustering tampilan dan label berdasarkan zoom belum tersedia.
- Panjang garis geospasial telah dihitung; ini bukan hasil perencanaan kabel beserta cadangannya. Skala belum ditampilkan, serta buffer dan mode ukur belum lengkap. Status “Data dimuat” hanya menandakan adanya fitur impor, bukan validasi teknis survei.
- Data jalan/koridor, akses pemasangan, hambatan, kapasitas, OLT, dan spesifikasi optik harus dilengkapi sebelum hasil otomatis dianggap layak ditinjau.
- Akurasi dan kelayakan pemasangan harus diperiksa terhadap koordinat survei serta kondisi lapangan; screenshot tidak cukup.
- Script `test` menguji importer, ekspor geometri, logika grouping/skor FAT, dan kontrak overlay; script lint belum tersedia. `typescript.ignoreBuildErrors: true` membuat build produksi tidak menjadi bukti kelulusan pemeriksaan tipe.
- Model `FeatureItem` kini dipakai bersama oleh importer, viewer dan peta; ketidakcocokan tipe callback `onSelect` sebelumnya sudah diselesaikan.

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
| `test` | `node --test tests/*.test.cjs` | Uji importer dan ekspor menggunakan Node test runner |

Jalankan `pnpm test` untuk menguji importer. Pengujian dijalankan pada Node.js 22.22.1 dengan File API bawaan. Dependency pengujian `@xmldom/xmldom` (`^0.9.12`) menyediakan DOMParser di Node. Tidak ada script `lint` atau `typecheck`. Pemeriksaan tipe dapat dijalankan melalui `pnpm exec tsc --noEmit`; hasilnya perlu ditinjau terpisah dari build. Versi Next.js terpasang dapat diperiksa melalui `pnpm exec next --version`.

`pnpm-workspace.yaml` memuat `pmOnFail: ignore` serta pengecualian minimum release age untuk `next` dan `@next/*`; pertahankan kebijakan tersebut saat pemeliharaan. Tidak ditemukan kebutuhan konfigurasi database atau kredensial backend untuk viewer dasar. Pengunduhan dependency dan tile peta membutuhkan jaringan.

## 13. Kriteria penerimaan dan pemeriksaan dasar

Daftar berikut adalah kriteria pemeriksaan, **bukan klaim semua telah lulus**.

### Viewer saat ini dan penyelesaian tahap 1

- Pastikan halaman `/` terbuka tanpa marker survei, jumlah file/fitur/kategori nol, dan petunjuk impor tampil. Tombol fit serta ekspor dinonaktifkan saat tidak ada data yang relevan. Setelah impor KML titik, periksa zoom, fit, pencarian, pemilihan dan salin koordinat sesuai dukungan browser.
- Uji KML titik kecil dengan koordinat yang diketahui; bandingkan lokasi, kategori, nama dan sumber dengan file asli.
- Untuk rumah terpilih, periksa estimasi tiang terdekat menggunakan jarak geospasial dalam meter; jangan menganggapnya panjang kabel aktual.
- Uji pencarian dan ekspor Point, LineString, Polygon berlubang, serta geometri campuran. Periksa urutan longitude, latitude dan kesamaan geometri; ekspor dinonaktifkan bila hasil pencarian kosong.
- Sebelum menyatakan dukungan KML/KMZ lengkap, uji arsip berisi KML, XML rusak, geometri campuran, koordinat kosong/di luar rentang, properti tambahan, ID ganda, dan impor ulang. Hasil harus memberi laporan penerimaan/penolakan yang jelas.
- Sebelum menyatakan pengukuran atau buffer siap, pastikan kontrol mengubah data/geometri dan angka berasal dari perhitungan, bukan placeholder.
- Uji perencanaan dengan 0, 1, 8, 9 dan lebih banyak rumah; setiap rumah valid harus tepat satu kelompok maksimal 8. Periksa kandidat terhadap total jarak seluruh anggota, tie yang konsisten, kondisi tanpa tiang, dan perhitungan ulang setelah data berubah.
- Uji reload agar perilaku kehilangan data sesi dipahami. Persistensi baru boleh dinyatakan tersedia setelah implementasi dan pengujiannya ada.
- Uji pergantian basemap tanpa kehilangan layer/pusat peta; visibility tiap kategori; warna/ukuran/garis/transparansi; urutan depan/belakang; tutup/buka panel; reload preferensi, storage rusak dan storage tidak tersedia. Uji kontrak renderer memakai mock Leaflet dan hook, sehingga tidak menggantikan pemeriksaan visual browser.
- Jalankan instalasi, build dan smoke test; catat pemeriksaan tipe secara terpisah karena konfigurasi saat ini mengabaikan error tipe saat build.

### Tahap perencanaan berikutnya

- Jalur antartiang mengikuti koneksi/koridor yang disetujui, menghormati batas bentang, menandai simpul terputus, serta dapat ditambah/dihapus manual.
- Setiap rumah memiliki penugasan FAT yang dapat ditelusuri atau alasan belum terlayani. Kapasitas port dan batas drop diperiksa; estimasi garis lurus diberi label.
- FDT dipilih pada lokasi pemasangan yang layak, melayani FAT sesuai kapasitas/cakupan, serta memiliki jalur ke sumber bila datanya tersedia.
- Link budget memiliki rincian komponen dan satuan yang benar, parameter bersumber dari perangkat terpilih, serta membedakan estimasi dengan pengukuran OPM.
- BoQ membedakan existing/baru, rute/cadangan, serta item otomatis/manual/belum dihitung. Angka ekspor harus sama dengan tabel dan dapat ditelusuri ke segmen/perangkat.
- Target toleransi numerik, dataset uji, batas performa, dan persetujuan parameter teknik: **Perlu ditentukan**.
