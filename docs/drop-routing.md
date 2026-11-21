# Rencana kabel drop

Jalankan simulasi FAT, lalu **Simulasikan Kabel Drop**. Perhitungan mengikuti FAT,
splitter, dan rumah yang sudah ditugaskan. Tidak ada perubahan penempatan FAT atau grouping.

## Data penyangga KML/KMZ

Hanya LineString dengan ExtendedData `drop_support=true` (atau `1`) yang boleh
dipakai sebagai penyangga drop. Penanda ini harus berasal dari hasil survei kelayakan,
bukan ditambahkan untuk sekadar membuat rute lolos. Contoh pada Placemark garis:

```xml
<ExtendedData>
  <Data name="drop_support"><value>true</value></Data>
</ExtendedData>
```

Simpul graph adalah titik Tiang/FAT. Koordinat simpul harus sama persis dengan vertex
garis penyangga (longitude, latitude). Ruas dihitung dua arah sepanjang seluruh geometri
antara simpul. Belokan, perpotongan gambar, atau tiang yang sekadar berdekatan tidak
otomatis membuat sambungan atau titik penambat baru. Bila perlu sambungan, perbaiki data
survei dengan vertex dan titik infrastruktur yang sesuai. Tidak ada snapping atau penyangga
baru yang diasumsikan aplikasi.

Dijkstra dijalankan dari FAT, kemudian setiap simpul terjangkau diuji sebagai penambat
bentangan terakhir. Rute terpendek yang memenuhi panjang total <= batas konfigurasi `maxDropLengthMeters` (default 60 m) dan bentangan
terakhir <=35 m dipilih. FAT sendiri dapat menjadi penambat terakhir, tetapi bentangan
langsungnya tetap <=35 m. Toleransi numerik batas adalah satu mikrometer.

Tanpa ruas bertanda, garis langsung hanya **estimasi jarak** dan bentangan terakhir belum
diketahui. Jika sudah ada data penyangga tetapi rute tidak memenuhi aturan, aplikasi
menandai rumah bermasalah dan tidak menggambar sambungan. Status sesuai data memeriksa
batas panjang dan kelayakan ruas yang dideklarasikan; hambatan lapangan tetap belum
terverifikasi, termasuk pada bentangan terakhir.

## Tampilan dan siklus data

- Hijau utuh: sesuai batas menurut data; biru putus-putus: estimasi; cincin merah
  putus-putus tanpa rute: bermasalah.
- Label menunjukkan total panjang, dihitung di titik tengah sepanjang geometri, bukan
  rata-rata koordinat ujung. Label estimasi diawali `Est.` dan tidak menerima input pointer.
- Zoom <18 membatasi label ke FAT/rumah/rute terpilih; zoom >=18 menampilkan label yang
  titik tengahnya berada di viewport. Label berdekatan diberi selisih vertikal kecil.
- Layer dan label memiliki toggle terpisah. Detail dan daftar rute memakai panel existing.
- Menjalankan ulang mengganti hasil. Hasil hanya berlaku untuk referensi survei dan
  simulasi FAT asal; impor atau simulasi FAT baru membatalkannya. Jalankan simulasi drop
  kembali setelah perubahan sumber. Hasil tidak disimpan sebagai fitur survei.

## Konfigurasi batas total drop

Input **Maksimal Panjang Drop** pada pengaturan menerima angka positif (meter).
Nilai default perencanaan baru adalah 60 m; bentangan terakhir tetap 35 m sebagai aturan
terpisah. Nilai eksplisit disimpan di localStorage `smart-ftth:planning-config` dan dipakai
kembali setelah refresh, termasuk jika pengguna menyimpan nilai 120 m. Tidak ada penyimpanan
konfigurasi permanen pada versi sebelumnya; data survei dan simulasi tetap hanya selama sesi.
Jika penyimpanan browser gagal, aplikasi memberitahu bahwa nilai hanya berlaku selama sesi.

Perubahan batas memvalidasi ulang penugasan dan geometri rute yang ada, menandai hasil yang
perlu dihitung ulang, serta menyembunyikan geometri rute yang melampaui batas. Lokasi FAT dan
grouping lama tidak dioptimasi atau dihapus secara otomatis. Jalankan simulasi FAT secara
eksplisit untuk membuat usulan baru, atau simulasi drop untuk menghitung rute penugasan lama.
