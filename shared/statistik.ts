// Perhitungan ringkasan dari daftar kegiatan. Dipakai dasbor (browser) dan insight AI (server),
// supaya angka yang dilihat tim sama persis dengan angka yang dibaca AI.
import { KABKOTA, type Kegiatan } from './schema.js';
import { KECAMATAN, JUMLAH_KECAMATAN } from './kecamatan.js';

export type Periode = { dari: string; sampai: string }; // YYYY-MM-DD, inklusif

export type Statistik = {
  periode: Periode;
  kegiatan: number;
  peserta: number;
  adaPerkiraan: boolean;
  wilayahTerjangkau: number;
  perWilayah: { nama: string; kegiatan: number; peserta: number; terakhir: string | null; kecTerjangkau: number; kecTotal: number }[];
  kecamatanTerjangkau: number;
  perKecamatan: { kab: string; nama: string; kegiatan: number; peserta: number; terakhir: string | null }[];
  perBulan: { bulan: string; kegiatan: number; peserta: number }[]; // bulan = YYYY-MM
  sasaran: [string, number][];
  topik: [string, number][];
  kanal: [string, number][];
  mode: [string, number][];
  peran: [string, number][];
};

export function dalamPeriode(list: Kegiatan[], p: Periode) {
  return list.filter((k) => k.tanggal >= p.dari && k.tanggal <= p.sampai);
}

const hitung = (list: Kegiatan[], f: (k: Kegiatan) => string[]): [string, number][] => {
  const m = new Map<string, number>();
  for (const k of list) for (const v of f(k)) if (v) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

function bulanAntara(dari: string, sampai: string) {
  const out: string[] = [];
  let y = +dari.slice(0, 4),
    m = +dari.slice(5, 7);
  const ey = +sampai.slice(0, 4),
    em = +sampai.slice(5, 7);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 60) break;
  }
  return out;
}

export function statistik(semua: Kegiatan[], p: Periode): Statistik {
  const list = dalamPeriode(semua, p);
  const ringkas = (ks: Kegiatan[]) => ({
    kegiatan: ks.length,
    peserta: ks.reduce((s, k) => s + (k.peserta || 0), 0),
    terakhir: ks.reduce<string | null>((t, k) => (!t || k.tanggal > t ? k.tanggal : t), null),
  });
  const perKecamatan = KABKOTA.flatMap((kab) => (KECAMATAN[kab] || []).map((nama) => ({ kab, nama, ...ringkas(list.filter((k) => k.kabkota === kab && k.kecamatan === nama)) })));
  const perWilayah = KABKOTA.map((nama) => ({
    nama,
    ...ringkas(list.filter((k) => k.kabkota === nama)),
    kecTerjangkau: perKecamatan.filter((c) => c.kab === nama && c.kegiatan).length,
    kecTotal: (KECAMATAN[nama] || []).length,
  }));
  const perBulan = bulanAntara(p.dari, p.sampai).map((b) => {
    const ks = list.filter((k) => k.tanggal.startsWith(b));
    return { bulan: b, kegiatan: ks.length, peserta: ks.reduce((s, k) => s + (k.peserta || 0), 0) };
  });
  return {
    periode: p,
    kegiatan: list.length,
    peserta: list.reduce((s, k) => s + (k.peserta || 0), 0),
    adaPerkiraan: list.some((k) => k.pesertaPerkiraan),
    wilayahTerjangkau: perWilayah.filter((w) => w.kegiatan > 0).length,
    perWilayah,
    kecamatanTerjangkau: perKecamatan.filter((c) => c.kegiatan).length,
    perKecamatan,
    perBulan,
    sasaran: hitung(list, (k) => k.sasaran),
    topik: hitung(list, (k) => k.topik),
    kanal: hitung(list, (k) => k.kanal),
    mode: hitung(list, (k) => [k.mode]),
    peran: hitung(list, (k) => [k.peranOjk]),
  };
}

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const namaBulan = (ym: string) => BULAN[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
export const tanggalPanjang = (d: string) => `${+d.slice(8, 10)} ${BULAN[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
export const tanggalPendek = (d: string) => `${+d.slice(8, 10)} ${BULAN[+d.slice(5, 7) - 1].slice(0, 3)} ${d.slice(0, 4)}`;
export const angka = (n: number) => n.toLocaleString('id-ID');

// Teks status singkat yang siap ditempel ke WhatsApp/email saat ada yang bertanya "sudah berapa?".
export function teksStatus(s: Statistik, hariIni: string) {
  const belum = s.perWilayah.filter((w) => !w.kegiatan).map((w) => w.nama);
  const atas = s.perWilayah.filter((w) => w.kegiatan).sort((a, b) => b.kegiatan - a.kegiatan).slice(0, 3);
  const baris = [
    `Status edukasi keuangan OJK Provinsi Banten`,
    `Periode ${tanggalPanjang(s.periode.dari)} s.d. ${tanggalPanjang(s.periode.sampai)} (data per ${tanggalPanjang(hariIni)})`,
    ``,
    `• Kegiatan: ${angka(s.kegiatan)}`,
    `• Peserta: ${s.adaPerkiraan ? '±' : ''}${angka(s.peserta)} orang`,
    `• Wilayah terjangkau: ${s.wilayahTerjangkau} dari ${KABKOTA.length} kabupaten/kota`,
  ];
  baris.push(`• Kecamatan terjangkau: ${s.kecamatanTerjangkau} dari ${JUMLAH_KECAMATAN} kecamatan`);
  if (atas.length) baris.push(`• Terbanyak: ${atas.map((w) => `${w.nama} (${w.kegiatan})`).join(', ')}`);
  if (belum.length) baris.push(`• Belum ada kegiatan: ${belum.join(', ')}`);
  if (s.sasaran.length) baris.push(`• Sasaran utama: ${s.sasaran.slice(0, 3).map(([n, c]) => `${n} (${c})`).join(', ')}`);
  return baris.join('\n');
}
