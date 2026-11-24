// Angka agregat pelayanan konsumen yang dikirim Trapesium (aplikasi pelayanan) ke sini,
// untuk membandingkan topik masalah konsumen dengan topik edukasi. Hanya jumlah, tanpa data pribadi.
import { TOPIK, SEMUA_WILAYAH, cocokKecamatan } from './schema.js';

export const JENIS_LAYANAN = ['SLIK', 'Pengaduan', 'Lainnya'] as const;

export type BarisPelayanan = {
  bulan: string; // YYYY-MM
  jenis: (typeof JENIS_LAYANAN)[number];
  kategori: (typeof TOPIK)[number];
  kab: string; // kab/kota domisili konsumen, '' kalau tidak diketahui
  kec: string; // kecamatan, '' kalau tidak diketahui
  jumlah: number;
};
export type AgregatPelayanan = {
  versi: 2;
  diterima: string; // ISO, diisi server SiPEDULIKU
  perBulan: Record<string, { total: number; dianalisis: number; berkategori: number }>;
  baris: BarisPelayanan[];
  // Jumlah layanan (bukan penyebutan) yang punya kategori. Satu layanan bisa punya 2 kategori,
  // jadi ini penyebut yang benar untuk "% pengaduan tentang topik X". Kosong pada kiriman lama.
  layanan: LayananBerkategori[];
};
export type LayananBerkategori = { bulan: string; jenis: BarisPelayanan['jenis']; kab: string; kec: string; jumlah: number };

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
    const kab = (SEMUA_WILAYAH as readonly string[]).includes(r.kab) ? r.kab : '';
    baris.push({ bulan: r.bulan, jenis: r.jenis, kategori: r.kategori, kab, kec: kab ? cocokKecamatan(kab, r.kec) : '', jumlah: n });
  }
  const layanan: LayananBerkategori[] = [];
  for (const r of (Array.isArray(o.layanan) ? (o.layanan as any[]) : []).slice(0, 20000)) {
    if (!r || !bulanOk(r.bulan) || !JENIS_LAYANAN.includes(r.jenis)) continue;
    const n = angka(r.jumlah);
    if (!n) continue;
    const kab = (SEMUA_WILAYAH as readonly string[]).includes(r.kab) ? r.kab : '';
    layanan.push({ bulan: r.bulan, jenis: r.jenis, kab, kec: kab ? cocokKecamatan(kab, r.kec) : '', jumlah: n });
  }
  return { versi: 2, perBulan, baris, layanan };
}
