# Rekomendasi alokasi FTTH

## Implementasi dan sumber data

Tidak ditemukan AGENTS.md yang berlaku pada direktori repository, leluhur, atau folder sumber yang diperiksa. Stack tetap Next.js/React, TypeScript, Turf dan Leaflet; tanpa backend/dependency baru.

`lib/ftth-planning.ts` masih membuat kelompok greedy dan memilih tiang dengan total jarak geografis terkecil. Batas drop default **50 m** sudah ditegakkan terhadap FAT final, dengan anggota yang tidak layak dilepas. Kandidat FAT kelompok pada rancangan saat ini diperlakukan sebagai perangkat rancangan aktif, bukan bukti perangkat terpasang di lapangan. FAT survei Point juga dapat menjadi tujuan; kapasitas dan port terpakainya belum diketahui sampai diverifikasi eksplisit.

`lib/allocation-recommendations.ts` memisahkan usulan, pemeriksaan, keputusan engineer, dan snapshot desain terkunci. `components/allocation-panel.tsx` menyediakan entry point dan tindakan engineer; viewer mengelola state sesi. Peta provisional ada di `components/recommendation-map-layer.tsx` dan terpisah dari layer rancangan aktif.

## Prioritas dan penggabungan

1. FAT pada rancangan aktif / FAT survei dengan kapasitas tersedia.
2. Tiang survei yang belum memiliki FAT.
3. FAT tambahan pada tiang ber-FAT.
4. Tanpa kandidat: tetap belum terlayani; tampilkan alasan dan arahkan perencanaan manual/survei tambahan.

Kandidat yang melanggar batas diketahui dibuang dari usulan utama. Jika suatu prioritas hanya berisi kandidat belum terverifikasi, kandidat yang sudah lolos pada prioritas berikutnya dapat menjadi usulan utama; kandidat unknown tetap dapat diperiksa sebagai alternatif. Jika tidak ada kandidat lolos, kandidat screening terbaik ditampilkan sebagai perlu verifikasi. Alternatif dan penolakan per rumah dapat dilihat pada disclosure pemeriksaan kandidat, termasuk bila prioritas lebih tinggi masih perlu verifikasi. Urutan kandidat dalam setiap prioritas/fase: lolos sebelum perlu verifikasi, panjang diperiksa terkecil, ID sebagai tie-breaker. Tidak ada skor pertumbuhan rumah.

Heuristic memproses rumah dengan opsi paling sedikit, kemudian ID. Pada prioritas yang sama, kelompok usulan yang sudah terbentuk dicoba terlebih dahulu sebelum membuka FAT provisional lain; urutan status/panjang/ID tetap digunakan dalam masing-masing fase reuse/kandidat baru. Rumah digabung selama jarak dan kapasitas memungkinkan. Satu proses memakai reservasi port dan membatasi satu usulan FAT baru per tiang; rumah yang tersisa tidak dipaksa dilayani. Ini bukan optimasi global.

## Metode panjang dan verifikasi

Screening otomatis memakai Turf geodesik dalam **meter**, berlabel **Estimasi jarak lurus**. Jarak lurus di atas batas ditolak. Di bawah batas tetap `needs-verification`, bukan bukti kelayakan jalur. Garis pada peta selalu hubungan layanan; bahkan setelah persetujuan bukan polyline kabel aktual.

Engineer dapat memasukkan panjang lintasan drop yang sudah diperiksa dan mengonfirmasi izin jalur **per rumah**, dengan catatan bukti wajib. Panjang harus finite, tidak negatif, tidak lebih pendek dari jarak geodesik (toleransi numerik 0,01 m), dan tidak melampaui batas drop. Data jalur yang diketahui tidak diizinkan tidak dapat ditimpa konfirmasi manual. Modul mendukung evidence jalur dan tiang valid/invalid/unknown; aplikasi belum menginferensikan evidence tersebut dari atribut KML yang tidak memiliki kontrak semantik.

FAT baru/tambahan juga memerlukan konfirmasi kelayakan pemasangan, akses dan kapasitas distribusi/upstream, serta batas jumlah FAT pada tiang. Kapasitas FAT baru ditampilkan eksplisit dari Planning Configuration dan dapat diubah di editor; FAT existing rancangan memakai kapasitas aktifnya. FAT survei memerlukan kapasitas aktual dan jumlah port sudah terpakai yang diperiksa; nilai kosong tidak dianggap nol yang valid.

Alasan menggunakan `CAPACITY_UNAVAILABLE`, `DROP_LIMIT_EXCEEDED`, `NO_ALLOWED_PATH`, `INSUFFICIENT_DATA`, dengan kandidat yang diperiksa dan rincian pemeriksaan. Tidak ada klaim bahwa semua FAT penuh ketika bukti hanya mengenai satu kandidat.

Belum ada graf routing rumah, geometri lintasan drop, allowance/slack atau model jaringan upstream. Engineer harus memasukkan panjang yang sesuai definisi lapangannya dan menjelaskan allowance dalam catatan; aplikasi belum menambah allowance otomatis.

## Siklus usulan dan keputusan

- Keputusan: `pending`, `accepted`, `ignored`, `deleted` (suppressed). Pemeriksaan terpisah: `passed`, `needs-verification`, `failed`, `stale`.
- Generate tidak mengaktifkan layanan atau menambah material aktif. Hanya usulan pending yang masuk jumlah pending; ignored/deleted tidak masuk.
- Klik usulan memfokuskan rumah dan tujuan pada peta dengan label **FAT USULAN ?** / **USULAN → FAT**, serta garis titik provisional. Tidak hanya mengandalkan warna.
- Override mengubah FAT/tiang atau anggota, menyimpan catatan dan mengulang validasi; tidak membuat salinan objek. Perubahan target mengosongkan verifikasi lama pada editor.
- Abaikan/hapus mempertahankan marker keputusan dan riwayat, tanpa menyentuh survei atau perangkat aktif. Keputusan dapat dilihat dan dipulihkan; restore diblok jika rumah sudah berada dalam usulan pending lain.
- Simpan dan validasi ulang digunakan untuk usulan stale; verifikasi lama dikosongkan ketika editor membuka usulan stale. Persetujuan normal diblok bila stale, gagal atau masih unknown; tidak ada alur pengecualian batas teknis.
- Persetujuan memvalidasi lagi state terbaru dan mengaktifkan rumah/koneksi serta perangkat bila diperlukan dalam satu pembaruan React. Persetujuan berulang idempotent. Alokasi ke FAT existing tidak membuat perangkat baru.
- Desain hasil persetujuan (termasuk perencanaan manual lewat editor) dikunci. Hitung ulang mempertahankan anggota, lokasi, kapasitas eksplisit dan hubungan layanan desain tersebut. Tidak ada dua alokasi aktif untuk satu rumah.
- Perubahan konfigurasi menghapus hasil **otomatis**, mempertahankan desain engineer dan menampilkan masalah bila desain tidak sesuai batas terbaru. Geometri sumber yang berubah/hilang juga menimbulkan masalah desain terkunci.
- Fingerprint kanonis meliputi geometri, kapasitas, keanggotaan aktif, konfigurasi dan evidence yang relevan; nama/file/display metadata tidak masuk. Perubahan alternatif/kapasitas dapat memengaruhi seluruh proses rekomendasi sehingga usulan pending proses tersebut menjadi stale.
- Desain accepted tidak dihapus melalui tombol hapus usulan. Penghapusan/edit perangkat aktif dengan dependensinya belum disediakan pada fitur ini.

## Penyimpanan, ekspor dan batas fitur

Survei, konfigurasi perencanaan, usulan, riwayat dan desain terkunci disimpan **selama sesi React** mengikuti pola existing. Refresh menghilangkan state sesi; tidak ditambahkan sistem penyimpanan proyek permanen. Keputusan bertahan saat generate/hitung ulang selama sesi, bukan setelah refresh.

Ekspor existing adalah GeoJSON survei saja; fitur ini tidak menyisipkan provisional maupun desain perencanaan ke ekspor tersebut. Belum ada ekspor desain/material aktif atau ekspor usulan; tidak ditambahkan ekspor baru.

Roadmap Minimum-Cost Flow, CP-SAT, optimasi global dan routing akses ditunda; checklist sebelumnya tetap ada di `ftth-routing-next-steps.md`.

## Verifikasi

- Test model mencakup prioritas 1–3, tanpa kandidat, screening unknown, jalur forbidden, penggabungan rumah dan reuse FAT provisional, reservasi port, kapasitas terbaru saat persetujuan, persetujuan idempotent, ignored/deleted/restore, stale vs metadata, override, desain manual terkunci, FAT survei dengan kapasitas unknown, dan dua persetujuan perangkat berbeda pada satu tiang.
- Test interaksi komponen memakai harness React existing: generate → pilih/fokus peta → isi panjang/izin/pemasangan/upstream/catatan → simpan verifikasi → setujui → jumlah unserved turun dan desain aktif bertambah. Ini bukan pengujian browser visual.
- `./node_modules/.bin/tsc --noEmit` lulus secara terpisah (konfigurasi Next existing memiliki `ignoreBuildErrors: true`, sehingga build saja bukan bukti typecheck).
- `npm test` lulus untuk seluruh enam berkas test, termasuk model rekomendasi dan alur interaksi komponen.
- `git diff --check` lulus.
- `npm run build` gagal karena Turbopack tidak dapat membuka port proses CSS (`Operation not permitted`), termasuk setelah percobaan eskalasi. Ini hambatan lingkungan, bukan diagnostik kode aplikasi.
- `npm run build -- --webpack` dengan konfigurasi existing terhenti pada integrasi CLI TypeScript Next (`Could not parse output from TypeScript's --showConfig`). Pemanggilan helper Next tersebut secara terpisah juga gagal dengan stdout kosong, sedangkan `tsc --showConfig` langsung menghasilkan JSON valid.
- Build produksi Webpack berhasil sampai halaman statis selesai dengan `experimental.useTypeScriptCli: false` **sementara** untuk memakai API TypeScript. `next.config.mjs` dipulihkan persis setelah pemeriksaan; tidak ada perubahan konfigurasi build permanen atau dependency baru.
- Inventori computer/browser sesi mengembalikan daftar browser kosong, sehingga tidak ada pemeriksaan visual browser yang diklaim.

## Memutuskan hubungan rumah–FAT secara manual

Klik cluster untuk menampilkan label jarak, lalu klik **⋮ → Putuskan dari cluster** pada hubungan rumah yang dipilih. Menu dapat dibuka lewat keyboard dan ditutup dengan Escape. Tindakan ini menghapus keanggotaan dan koneksi layanan rumah tersebut, menghitung ulang total drop dan port terpakai, lalu menandai rumah belum terlayani dengan alasan pemutusan manual. Data survei dan kandidat FAT tidak dihapus, termasuk saat cluster tidak lagi memiliki anggota.

Cluster yang diedit disimpan sebagai snapshot terkunci. Daftar rumah yang dilepas dan revision tindakan manual dipertahankan selama sesi agar hitung ulang/configuration reset tidak memasang hubungan otomatis lagi. Usulan terdampak menjadi stale. Alokasi eksplisit yang disetujui kemudian menghapus penahanan manual rumah tersebut. Sesi ini tidak menambahkan alur alokasi manual baru; tindakan pemutusan merupakan fokus perubahan ini.
