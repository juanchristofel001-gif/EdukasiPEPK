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

export const PERAN_OJK = ['Penyelenggara', 'Narasumber undangan', 'Kolaborasi dengan mitra'] as const;

export const SASARAN = [
  'Pelajar SD/SMP',
  'Pelajar SMA/SMK',
  'Mahasiswa',
  'Guru/dosen',
  'UMKM',
  'Pekerja/karyawan',
  'ASN/TNI/Polri',
  'Ibu rumah tangga/komunitas perempuan',
  'Petani/nelayan',
  'Penyandang disabilitas',
  'Pekerja migran',
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
  'Judi online',
  'Penipuan digital/scam',
  'Perlindungan data pribadi',
  'Perlindungan konsumen dan pengaduan',
  'Keuangan syariah',
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
  tanggal: string; // YYYY-MM-DD
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
  kanal: (typeof KANAL)[number][];
  metode: (typeof METODE)[number][];
  ringkasan: string;
  catatan: string; // respons peserta, kendala, pertanyaan yang sering muncul
  sumberFile: string; // nama file laporan asal (file-nya sendiri tidak disimpan)
  dicatatOleh: string;
  dibuat: string; // ISO timestamp
  diubah: string;
};

export type KegiatanInput = Omit<Kegiatan, 'id' | 'dibuat' | 'diubah'>;

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
export function rapikan(raw: Record<string, unknown>): KegiatanInput {
  const p = Number(raw.peserta);
  const tgl = str(raw.tanggal, 10);
  return {
    judul: str(raw.judul, 200),
    tema: str(raw.tema, 200),
    pengundang: str(raw.pengundang, 160),
    peranOjk: pick(PERAN_OJK, raw.peranOjk),
    tanggal: isTanggal(tgl) ? tgl : '',
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
    topik: picks(TOPIK, raw.topik),
    kanal: picks(KANAL, raw.kanal),
    metode: picks(METODE, raw.metode),
    ringkasan: str(raw.ringkasan, 1200),
    catatan: str(raw.catatan, 1200),
    sumberFile: str(raw.sumberFile, 200),
    dicatatOleh: str(raw.dicatatOleh, 80),
  };
}

// Kolom wajib sebelum disimpan. Mengembalikan daftar pesan; kosong berarti valid.
export function periksa(k: KegiatanInput): string[] {
  const e: string[] = [];
  if (!k.judul) e.push('Judul kegiatan belum diisi.');
  if (!k.tanggal) e.push('Tanggal belum diisi.');
  if (!k.kabkota) e.push('Kabupaten/kota belum dipilih.');
  else if (perluKecamatan(k.kabkota) && !k.kecamatan) e.push('Kecamatan belum dipilih.');
  if (k.peserta === null) e.push('Jumlah peserta belum diisi.');
  if (!k.sasaran.length) e.push('Pilih minimal satu sasaran peserta.');
  return e;
}
