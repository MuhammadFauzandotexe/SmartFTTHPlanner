# Editing manual rumah–FAT

Pilih rumah di peta, daftar Komponen, anggota splitter, atau daftar rumah belum terlayani.
Detail rumah memuat ID, ID perangkat FAT, cluster FAT/splitter, status pemeriksaan, dan
pengelolaan otomatis/manual. **Lepas dari FAT** memerlukan konfirmasi. Rumah dan
koordinat survei tetap; port dikembalikan dan FAT/splitter kosong tidak dihapus.

**Hubungkan ke FAT / Pindahkan ke FAT lain** mengaktifkan pemilihan perangkat pada
peta atau daftar. Batal/Escape hanya membersihkan preview. Dua perangkat yang berada
pada tiang/koordinat sama memerlukan pilihan ID yang eksplisit. Daftar memakai ID
perangkat, bukan ID tiang, sebagai identitas alokasi.

FAT hasil simulasi bersifat provisional. Engineer harus menggunakan **Setujui perangkat
FAT ini** sebelum menerapkan alokasi manual. Persetujuan pada preview baru disimpan bersama
alokasi saat Terapkan; Batal membuang draft tersebut. Persetujuan perangkat disimpan terpisah
dari validasi rute; ini bukan pernyataan bahwa hambatan lapangan telah diperiksa.
Tidak ada bypass kapasitas/drop. Batas 16 port/box, 2 splitter, dan 8 port/splitter
mengikuti konstanta existing. Generator existing tetap menghasilkan satu box per tiang;
editing tidak menyamakan identitas perangkat dengan identitas tiang.

Preview menggunakan `planDropRoutes`, termasuk graph `drop_support` dan batas bentangan
terakhir 35 m. Tanpa graph, kebijakan existing hanya menghasilkan estimasi sementara;
engineer harus mengakui status tersebut secara eksplisit. Garis estimasi putus-putus
bukan jalur kabel aktual. Dengan graph tetapi tanpa rute yang memenuhi aturan,
penerapan ditolak. Klik Terapkan memvalidasi ulang state terbaru. Pelepasan dan penugasan
berlangsung dalam satu penggantian snapshot; jika gagal, alokasi lama tetap.

Keanggotaan splitter adalah sumber alokasi. Jumlah port, anggota FAT, ringkasan,
rumah belum terlayani, warna splitter, dan garis diturunkan darinya. Hanya rute rumah
yang diubah diganti/dihapus; rute rumah lain dipertahankan. Aplikasi ini belum memiliki
model routing distribusi terpisah sehingga editing tidak membatalkan distribusi lain.

Keputusan manual berupa `detached` atau `assigned` pada ID rumah. Generate ulang
mengecualikan semua rumah terkunci dari optimasi otomatis, mereservasi kapasitas pada
FAT tujuan, dan mempertahankan perangkat serta splitter manual. Perubahan konfigurasi
tidak melepas/memindahkan rumah manual; masalah ditampilkan di review dan detail.
**Kembalikan ke alokasi otomatis** menghapus penguncian; hasil yang sedang terlihat
berubah melalui generate berikutnya.

Proyek disimpan otomatis dan melalui **Simpan proyek** di localStorage
`smart-ftth:project:v1`, melengkapi pola penyimpanan konfigurasi existing. Snapshot
berversi menyimpan survei, perangkat/splitter, keanggotaan, persetujuan, keputusan manual,
rute, dan konfigurasi. Saat dimuat, referensi rumah/tiang dipulihkan dari survei canonical,
kapasitas dihitung ulang, dan snapshot tidak konsisten ditolak tanpa ditimpa otomatis.
Penyimpanan berlaku pada browser/origin yang sama. Kuota/gagal penyimpanan dilaporkan;
tidak ada klaim tersimpan jika penyimpanan proyek gagal. Impor pengganti yang menghapus
objek beralokasi/terkunci ditolak agar keputusan engineer tidak hilang.
