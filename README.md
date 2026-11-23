# SiPEDULIKU

**Si**stem **Pe**ncatatan **Edu**kasi **Li**terasi **Keu**angan — pencatatan dan dasbor kegiatan edukasi keuangan OJK Provinsi Banten.

Tim mengunggah laporan kegiatan (PDF, Word, atau foto). AI membaca laporan dan mengisi data kegiatan. Tim mengecek dan menyimpannya. Dasbor lalu menampilkan posisi terkini: jumlah kegiatan, peserta, sebaran 8 kabupaten/kota dan 155 kecamatan (peta panas), sasaran, topik, dan insight AI. Tombol **Salin status** menghasilkan ringkasan siap tempel untuk WhatsApp atau email.

File laporan asli **tidak disimpan**. Yang disimpan hanya data hasil ekstraksi yang sudah dicek tim.

## Arsitektur

```
Browser (Vite + TypeScript)
   │  setiap permintaan membawa kode akses tim (header x-kode-akses)
   ▼
Fungsi server Vercel (folder api/)
   ├─ api/akses.ts     cek kode akses
   ├─ api/ekstrak.ts   kirim laporan ke Gemini → isian kegiatan (tidak menyimpan apa pun)
   ├─ api/kegiatan.ts  baca / simpan / ubah kegiatan; hapus = pindah ke sampah, bisa dipulihkan
   ├─ api/lengkapi.ts  impor Excel: AI menebak kolom kosong (kab/kota, kecamatan, sasaran, topik), ditandai 'ditebak'
   ├─ api/riwayat.ts   log aktivitas: siapa menambah/mengubah/menghapus/memulihkan, kolom apa berubah
   ├─ api/cadangan.ts  cadangan harian seluruh data (Vercel Cron 00.00 WIB, 30 hari disimpan)
   └─ api/insight.ts   hitung rekap dari database → Gemini menafsirkan → disimpan
   │
   ├──► Firestore (Firebase): koleksi `kegiatan` dan `meta`
   └──► Gemini API (Google AI Studio)
```

Koleksi Firestore: `kegiatan` (data, termasuk yang di sampah dengan kolom `dihapus`), `cadangan` (satu dokumen per tanggal), `meta` (insight AI), `riwayat` (log aktivitas; nama berasal dari header `x-nama` yang diisi di tiap perangkat, belum terverifikasi login).

```
```

- Browser **tidak pernah** mengakses Firestore atau Gemini secara langsung. Semua kunci rahasia hanya ada di server.
- `firestore.rules` menutup semua akses langsung ke database.
- Akses dikendalikan satu fungsi, `izinkan()` di `api/_lib/http.ts`. Kalau nanti pindah ke login pribadi, cukup fungsi itu yang diganti.

## Struktur folder

| Folder | Isi |
|---|---|
| `shared/schema.ts` | **Model data**: kolom kegiatan, daftar pilihan (kab/kota, sasaran, topik, dll.), aturan validasi. Dipakai server dan browser. |
| `shared/impor.ts` | Impor Excel/CSV: pencocokan judul kolom, pembacaan tanggal/wilayah/kecamatan (toleran salah ketik), deteksi kegiatan ganda. |
| `shared/statistik.ts` | Perhitungan rekap (per wilayah, per bulan, dll.) dan teks "Salin status". |
| `api/` | Fungsi server. `api/_lib/` berisi koneksi Gemini, database, dan pengecekan kode akses. |
| `src/` | Tampilan website. `src/views/` satu file per halaman. |
| `public/banten.json` | Batas 155 kecamatan dan 8 kab/kota Banten untuk peta. Sumber: portal GIS Kemendagri (data 2018 semester 1, via repo GitHub Alf-Anas/batas-administrasi-indonesia), disederhanakan dengan mapshaper; batas kab/kota digabung dari kecamatan. |
| `shared/kecamatan.ts` | Daftar kecamatan per kab/kota (dari data yang sama). |
| `scripts/dev-api.ts` | Server lokal untuk menjalankan `api/` tanpa Vercel. |

## Model data: satu kegiatan

| Kolom | Tipe | Keterangan |
|---|---|---|
| `judul`* | teks | Nama kegiatan |
| `tema` | teks | Judul materi |
| `pengundang` | teks | Lembaga/acara yang mengundang atau bermitra |
| `peranOjk` | pilihan | Penyelenggara · Narasumber undangan · Kolaborasi dengan mitra |
| `tanggal`* | YYYY-MM-DD | |
| `tempat` | teks | |
| `kabkota`* | pilihan | 8 kab/kota Banten, Daring, atau Luar Banten |
| `kabkotaDitebak` | ya/tidak | Wilayah tidak tertulis di laporan dan ditebak AI |
| `kecamatan`* | pilihan | Salah satu dari 155 kecamatan di kab/kota tersebut (`shared/kecamatan.ts`); kosong untuk daring/luar Banten |
| `kecamatanDitebak` | ya/tidak | Kecamatan ditebak AI dari nama/alamat tempat |
| `mode` | pilihan | Luring · Daring · Hybrid |
| `narasumber` | daftar teks | |
| `sasaran`* | daftar pilihan | Pelajar, mahasiswa, UMKM, dll. |
| `sasaranDetail` | teks | Misal "Siswa kelas XII" |
| `peserta`* | angka | |
| `pesertaPerkiraan` | ya/tidak | Laporan menulis "kurang lebih", "sekitar" |
| `topik` | daftar pilihan | Materi yang dibawakan |
| `kanal` | daftar pilihan | 157, IASC, SIPASTI, dll. |
| `metode` | daftar pilihan | Paparan, diskusi, kuis, dll. |
| `ringkasan`, `catatan` | teks | Ringkasan dan catatan lapangan |
| `sumberFile`, `dicatatOleh` | teks | Asal data |

\* wajib. Daftar pilihan diubah di `shared/schema.ts`.

## Pengaturan di Vercel (Environment Variables)

| Nama | Isi |
|---|---|
| `KODE_AKSES` | Kode akses tim. Ganti kapan saja; semua perangkat akan diminta kode baru. |
| `GEMINI_API_KEY` | API key dari Google AI Studio |
| `KUNCI_AGREGAT` | Kunci rahasia untuk menerima angka agregat pelayanan dari Trapesium (`/api/pelayanan`). Harus sama persis dengan `KUNCI_AGREGAT` di Vercel Trapesium. |
| `FIREBASE_SERVICE_ACCOUNT` | Seluruh isi file JSON kunci akun layanan Firebase |
| `GEMINI_MODEL` | (opsional) memaksa model tertentu |
| `CRON_SECRET` | (opsional) kalau diisi, jadwal cadangan harus membawa rahasia ini |

## Menjalankan di komputer sendiri

```bash
npm install
npm run build
KODE_AKSES=uji MOCK_AI=1 STATIC_DIR=dist npm run dev:api   # buka http://localhost:3001, kode: uji
```

Tanpa `FIREBASE_SERVICE_ACCOUNT`, data disimpan di `.data/kegiatan.json`. `MOCK_AI=1` mengganti AI dengan jawaban contoh. Untuk mengubah tampilan dengan reload otomatis, jalankan juga `npm run dev` (port 5173).

Sebelum push, jalankan `npm run cek` untuk memeriksa tipe data.

## Kredit

- Ikon jabat tangan pada logo: [Lucide](https://lucide.dev) (lisensi ISC).
- Font: Plus Jakarta Sans (SIL Open Font License), disajikan lewat paket @fontsource.

## Pelayanan vs edukasi

Kartu di Dasbor yang membandingkan porsi topik masalah konsumen di front desk (dari Trapesium) dengan porsi topik edukasi di periode yang sama.

- Trapesium mengklasifikasikan catatan petugas ke daftar `TOPIK` yang sama (`shared/schema.ts` di sini, `api/_kategori.js` di Trapesium). **Kalau daftar topik diubah, ubah di kedua repo.**
- Trapesium mengirim hanya angka (jumlah per bulan × jenis layanan × kategori), lewat server Trapesium ke `POST /api/pelayanan` dengan header `x-kunci-agregat`. Disimpan di Firestore `meta/pelayanan`, dibaca dasbor lewat `GET /api/pelayanan` dengan kode akses.
- Setiap baris membawa `kab` dan `kec` domisili konsumen (kosong kalau tidak diketahui), jadi kartu ikut filter kab/kota di dasbor. Layanan tanpa data wilayah hanya dihitung di tampilan seluruh Banten.
- Folder `api/` sekarang berisi 12 fungsi, batas paket Hobby Vercel. Fungsi baru harus digabung ke yang sudah ada.
