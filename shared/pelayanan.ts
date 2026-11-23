// Angka agregat pelayanan konsumen yang dikirim Trapesium (aplikasi pelayanan) ke sini,
// untuk membandingkan topik masalah konsumen dengan topik edukasi. Hanya jumlah, tanpa data pribadi.
import { TOPIK } from './schema.js';

export const JENIS_LAYANAN = ['SLIK', 'Pengaduan', 'Lainnya'] as const;

export type BarisPelayanan = {
  bulan: string; // YYYY-MM
  jenis: (typeof JENIS_LAYANAN)[number];
  kategori: (typeof TOPIK)[number];
  wilayah: string; // kosong dulu; nanti kab/kota atau kecamatan domisili konsumen
  jumlah: number;
};
export type AgregatPelayanan = {
  versi: 1;
  diterima: string; // ISO, diisi server SiPEDULIKU
  perBulan: Record<string, { total: number; dianalisis: number; berkategori: number }>;
  baris: BarisPelayanan[];
};

const bulanOk = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const angka = (n: unknown) => (Number.isInteger(n) && (n as number) >= 0 && (n as number) < 1e6 ? (n as number) : null);

// Validasi ketat: apa pun di luar bentuk ini dibuang.
export function bacaAgregat(v: unknown): Omit<AgregatPelayanan, 'diterima'> | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.baris) || !o.perBulan || typeof o.perBulan !== 'object') return null;
  const perBulan: AgregatPelayanan['perBulan'] = {};
  for (const [m, x] of Object.entries(o.perBulan as Record<string, any>)) {
    if (!bulanOk(m) || !x) continue;
    const t = angka(x.total), d = angka(x.dianalisis), k = angka(x.berkategori);
    if (t === null || d === null || k === null) continue;
    perBulan[m] = { total: t, dianalisis: d, berkategori: k };
  }
  const baris: BarisPelayanan[] = [];
  for (const r of (o.baris as any[]).slice(0, 20000)) {
    if (!r || !bulanOk(r.bulan) || !JENIS_LAYANAN.includes(r.jenis) || !(TOPIK as readonly string[]).includes(r.kategori)) continue;
    const n = angka(r.jumlah);
    if (!n) continue;
    baris.push({ bulan: r.bulan, jenis: r.jenis, kategori: r.kategori, wilayah: typeof r.wilayah === 'string' ? r.wilayah.slice(0, 80) : '', jumlah: n });
  }
  return { versi: 1, perBulan, baris };
}
