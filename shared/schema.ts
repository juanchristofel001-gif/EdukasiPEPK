// Model data kegiatan edukasi. Dipakai bersama oleh website (src/) dan server (api/),
// jadi daftar pilihan dan aturan validasinya selalu sama di kedua sisi.
import { KECAMATAN } from './kecamatan.js';

export const KABKOTA = [
  'Kota Serang',
  'Kabupaten Serang',
  'Kota Cilegon',
  'Kota Tangerang',
  'Kabupaten Tangerang',
  'Kota Tangerang Selatan',
  'Kabupaten Pandeglang',
  'Kabupaten Lebak',
] as const;
export const KABKOTA_LAIN = ['Daring (lintas wilayah)', 'Luar Banten'] as const;
export const SEMUA_WILAYAH = [...KABKOTA, ...KABKOTA_LAIN] as const;

export const MODE = ['Luring', 'Daring', 'Hybrid'] as const;

// Mengikuti kolom rekap resmi KOJK.
export const BENTUK = ['Sosialisasi', 'Workshop', 'Talkshow', 'Seminar', 'Pelatihan/ToT', 'Pameran/expo', 'Siaran media', 'GERAK Syariah', 'Lainnya'] as const;
export const JENIS = ['Konvensional', 'Syariah', 'Konvensional dan Syariah'] as const;

export const PERAN_OJK = ['Penyelenggara', 'Narasumber undangan', 'Kolaborasi dengan mitra'] as const;

export const SASARAN = [
  'Pelajar SD/SMP',
  'Pelajar SMA/SMK',
  'Pelajar (jenjang tidak disebut)',
  'Mahasiswa',
  'Guru/dosen',
  'UMKM',
  'Pekerja/karyawan',
  'ASN/TNI/Polri',
  'Ibu rumah tangga/komunitas perempuan',
  'Petani/nelayan',
  'Penyandang disabilitas',
  'Pekerja migran',
  'Komunitas',
  'Masyarakat umum',
  'Lainnya',
] as const;

export const TOPIK = [
  'Pengenalan OJK dan industri jasa keuangan',
  'Pengelolaan keuangan pribadi',
  'Perbankan dan tabungan',
  'Pasar modal dan investasi',
  'Asuransi',
  'Dana pensiun',
  'Pembiayaan dan pindar legal',
  'Pinjol ilegal',
  'Investasi bodong',
  'Waspada aktivitas keuangan ilegal',
  'Judi online',
  'Penipuan digital/scam',
  'Perlindungan data pribadi',
  'Perlindungan konsumen dan pengaduan',
  'Keuangan syariah',
  'Perkembangan ekonomi dan sektor jasa keuangan daerah',
  'Lainnya',
] as const;

export const KANAL = ['Kontak OJK 157', 'IASC', 'SIPASTI', 'APPK', 'SLIK/iDeb', 'Lainnya'] as const;

export const METODE = ['Paparan materi', 'Diskusi/tanya jawab', 'Kuis/games', 'Pre-test/post-test', 'Booth/pameran', 'Simulasi/praktik'] as const;

export type Kegiatan = {
  id: string;
  judul: string;
  tema: string; // judul materi, misal "Belajar Bareng: Cerdas Financial di Dunia Digital"
  pengundang: string; // lembaga/acara yang mengundang atau bermitra, misal "SMA Athalia"
  peranOjk: (typeof PERAN_OJK)[number] | '';
  tanggal: string; // YYYY-MM-DD (tanggal mulai)
  tanggalSelesai: string; // YYYY-MM-DD, kosong kalau satu hari
  bentuk: (typeof BENTUK)[number] | '';
  jenis: (typeof JENIS)[number] | '';
  tempat: string;
  kabkota: (typeof SEMUA_WILAYAH)[number] | '';
  kabkotaDitebak: boolean; // true kalau wilayah tidak tertulis di laporan dan ditebak AI dari nama tempat
  kecamatan: string; // salah satu kecamatan di kabkota (lihat shared/kecamatan.ts); kosong untuk daring/luar Banten
  kecamatanDitebak: boolean;
  mode: (typeof MODE)[number] | '';
  narasumber: string[];
  sasaran: (typeof SASARAN)[number][];
  sasaranDetail: string; // misal "Siswa kelas XII"
  peserta: number | null;
  pesertaPerkiraan: boolean; // true kalau laporan menulis "kurang lebih", "sekitar", dll.
  topik: (typeof TOPIK)[number][];
  // Materi pokok kegiatan (satu topik). Topik lain di `topik` dianggap materi pendukung/template.
  topikUtama: (typeof TOPIK)[number] | '';
  kanal: (typeof KANAL)[number][];
  metode: (typeof METODE)[number][];
  ringkasan: string;
  catatan: string; // respons peserta, kendala, pertanyaan yang sering muncul
  jamMulai: string; // "09.30" (opsional, untuk laporan Word)
  jamSelesai: string; // jam edukasi selesai, "10.30" (opsional)
  naskah: Naskah | null; // naskah laporan Word yang sudah disunting tim
  sumberFile: string; // nama file laporan asal (file-nya sendiri tidak disimpan)
  dicatatOleh: string;
  dibuat: string; // ISO timestamp
  diubah: string;
};

export type KegiatanInput = Omit<Kegiatan, 'id' | 'dibuat' | 'diubah'>;

// Naskah laporan Word (bagian A–E). Disimpan supaya laporan bisa diunduh ulang dengan isi yang sama.
export const BAGIAN_NASKAH = [
  ['pendahuluan', 'A. Pendahuluan'],
  ['pelaksanaan', 'B. Pelaksanaan Kegiatan'],
  ['peserta', 'C. Peserta'],
  ['kesimpulan', 'D. Kesimpulan'],
  ['penutup', 'E. Penutup'],
] as const;
export type Naskah = Record<(typeof BAGIAN_NASKAH)[number][0], string>;

const jam = (v: unknown) => {
  const m = str(v, 8).match(/^(\d{1,2})[.:](\d{2})$/);
  return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, '0')}.${m[2]}` : '';
};
function naskahDari(v: unknown): Naskah | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const n = Object.fromEntries(BAGIAN_NASKAH.map(([k]) => [k, str(o[k], 4000)])) as Naskah;
  return Object.values(n).some(Boolean) ? n : null;
}

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pick = <T extends readonly string[]>(list: T, v: unknown): T[number] | '' => {
  const s = str(v).toLowerCase();
  return (list.find((x) => x.toLowerCase() === s) as T[number]) || '';
};
const picks = <T extends readonly string[]>(list: T, v: unknown): T[number][] => {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[;,]/) : [];
  const out = arr.map((x) => pick(list, x)).filter(Boolean) as T[number][];
  return Array.from(new Set(out));
};
const names = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[;,]/) : [])
    .map((x) => str(x, 120))
    .filter(Boolean)
    .slice(0, 10);

export function isTanggal(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

const huruf = (v: unknown) => str(v).toLowerCase().replace(/^kec(amatan|\.)?\s+/, '').replace(/[^a-z]/g, '');
// Nama kecamatan dicocokkan tanpa memedulikan spasi/huruf besar ("Batu Ceper" = "Batuceper").
export function cocokKecamatan(kab: string, v: unknown) {
  const h = huruf(v);
  return (h && (KECAMATAN[kab] || []).find((k) => huruf(k) === h)) || '';
}
export const perluKecamatan = (kab: string) => !!KECAMATAN[kab];

// Merapikan data dari mana pun (form, AI, impor): buang nilai di luar daftar pilihan,
// potong teks terlalu panjang, pastikan tipe benar.
// Topik utama selalu ikut tercantum di daftar topik.
function topikDanUtama(topik: (typeof TOPIK)[number][], utama: (typeof TOPIK)[number] | '') {
  return { topik: utama && !topik.includes(utama) ? [utama, ...topik] : topik, topikUtama: utama };
}

export function rapikan(raw: Record<string, unknown>): KegiatanInput {
  const p = Number(raw.peserta);
  const tgl = str(raw.tanggal, 10);
  return {
    judul: str(raw.judul, 200),
    tema: str(raw.tema, 200),
    pengundang: str(raw.pengundang, 160),
    peranOjk: pick(PERAN_OJK, raw.peranOjk),
    tanggal: isTanggal(tgl) ? tgl : '',
    tanggalSelesai: isTanggal(str(raw.tanggalSelesai, 10)) && str(raw.tanggalSelesai, 10) > tgl ? str(raw.tanggalSelesai, 10) : '',
    bentuk: pick(BENTUK, raw.bentuk),
    jenis: pick(JENIS, raw.jenis),
    tempat: str(raw.tempat, 200),
    kabkota: pick(SEMUA_WILAYAH, raw.kabkota),
    kabkotaDitebak: raw.kabkotaDitebak === true,
    kecamatan: cocokKecamatan(pick(SEMUA_WILAYAH, raw.kabkota), raw.kecamatan),
    kecamatanDitebak: raw.kecamatanDitebak === true,
    mode: pick(MODE, raw.mode),
    narasumber: names(raw.narasumber),
    sasaran: picks(SASARAN, raw.sasaran),
    sasaranDetail: str(raw.sasaranDetail, 160),
    peserta: Number.isFinite(p) && p >= 0 && raw.peserta !== '' && raw.peserta !== null ? Math.round(p) : null,
    pesertaPerkiraan: raw.pesertaPerkiraan === true,
    ...topikDanUtama(picks(TOPIK, raw.topik), pick(TOPIK, raw.topikUtama)),
    kanal: picks(KANAL, raw.kanal),
    metode: picks(METODE, raw.metode),
    ringkasan: str(raw.ringkasan, 1200),
    catatan: str(raw.catatan, 1200),
    jamMulai: jam(raw.jamMulai),
    jamSelesai: jam(raw.jamSelesai),
    naskah: naskahDari(raw.naskah),
    sumberFile: str(raw.sumberFile, 200),
    dicatatOleh: str(raw.dicatatOleh, 80),
  };
}

// Kolom wajib sebelum disimpan. Mengembalikan daftar pesan; kosong berarti valid.
// Kecamatan wajib untuk kegiatan baru di Banten; untuk data impor lama atau saat mengubah boleh menyusul.
export function periksa(k: KegiatanInput, opt: { kecamatan?: boolean } = {}): string[] {
  const e: string[] = [];
  if (!k.judul) e.push('Judul kegiatan belum diisi.');
  if (!k.tanggal) e.push('Tanggal belum diisi.');
  if (!k.kabkota) e.push('Kabupaten/kota belum dipilih.');
  else if (opt.kecamatan !== false && perluKecamatan(k.kabkota) && !k.kecamatan) e.push('Kecamatan belum dipilih.');
  if (k.peserta === null) e.push('Jumlah peserta belum diisi.');
  if (!k.sasaran.length) e.push('Pilih minimal satu sasaran peserta.');
  return e;
}

// Nama kolom yang mudah dibaca, dipakai untuk log riwayat perubahan.
export const LABEL: Partial<Record<keyof KegiatanInput, string>> = {
  judul: 'Judul',
  tema: 'Tema',
  pengundang: 'Pengundang/mitra',
  peranOjk: 'Peran OJK',
  tanggal: 'Tanggal',
  tanggalSelesai: 'Tanggal selesai',
  bentuk: 'Bentuk kegiatan',
  jenis: 'Jenis (konvensional/syariah)',
  tempat: 'Tempat',
  kabkota: 'Kabupaten/kota',
  kecamatan: 'Kecamatan',
  mode: 'Mode',
  narasumber: 'Narasumber',
  sasaran: 'Sasaran',
  sasaranDetail: 'Keterangan peserta',
  peserta: 'Jumlah peserta',
  pesertaPerkiraan: 'Peserta perkiraan',
  topik: 'Topik',
  kanal: 'Kanal',
  metode: 'Metode',
  ringkasan: 'Ringkasan',
  catatan: 'Catatan lapangan',
  jamMulai: 'Jam mulai',
  jamSelesai: 'Jam selesai',
  naskah: 'Naskah laporan Word',
  dicatatOleh: 'Dicatat oleh',
};

export type Aksi = 'tambah' | 'ubah' | 'sampah' | 'pulihkan' | 'hapus-permanen' | 'pulihkan-cadangan' | 'impor';
export type Riwayat = {
  id: string;
  waktu: string; // ISO
  aksi: Aksi;
  oleh: string; // nama yang diisi di perangkat (bukan login, jadi tidak terverifikasi)
  kegiatanId: string;
  judul: string;
  perubahan?: { kolom: string; dari: string; jadi: string }[];
  catatan?: string;
};

const tampil = (v: unknown): string =>
  Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'ya' : 'tidak') : v === null || v === undefined ? '' : typeof v === 'object' ? Object.values(v).filter(Boolean).join(' | ') : String(v);
// Daftar kolom yang berubah antara dua versi kegiatan.
export function beda(lama: Partial<KegiatanInput>, baru: Partial<KegiatanInput>) {
  return (Object.keys(LABEL) as (keyof KegiatanInput)[])
    .filter((k) => tampil(lama[k]) !== tampil(baru[k]))
    .map((k) => ({ kolom: LABEL[k]!, dari: tampil(lama[k]).slice(0, 300), jadi: tampil(baru[k]).slice(0, 300) }));
}
