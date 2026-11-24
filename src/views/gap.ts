// Kartu "Pelayanan vs edukasi": sinyal topik yang sedang banyak dialami konsumen di front desk
// (dari Trapesium), dibandingkan dengan seberapa sering topik itu dibahas di kegiatan edukasi.
// Ukurannya cakupan, bukan porsi penyebutan:
//   pelayanan = % layanan berkategori yang menyangkut topik X
//   edukasi   = % kegiatan yang membahas topik X (sebagai materi utama maupun template)
// Dengan begitu, banyaknya topik per kegiatan (materi template) tidak mengecilkan angka topik lain.
import type { Kegiatan } from '../../shared/schema.js';
import type { Periode } from '../../shared/statistik.js';
import { angka, namaBulan } from '../../shared/statistik.js';
import type { AgregatPelayanan } from '../../shared/pelayanan.js';
import { api } from '../api.js';
import { esc, $, $$ } from '../ui.js';

let jenis: 'semua' | 'Pengaduan' = 'Pengaduan'; // default pengaduan: cek SLIK rutin bukan sinyal kurang literasi
let cache: { at: number; data: AgregatPelayanan | null } | null = null;

// Topik payung di edukasi yang dianggap sudah mencakup topik turunannya.
export const PAYUNG: Record<string, string[]> = {
  'Waspada aktivitas keuangan ilegal': ['Pinjol ilegal', 'Investasi bodong'],
};
// Tanda hanya ditampilkan kalau datanya cukup.
export const MIN_LAYANAN = 20;
const BANYAK = 10; // "Banyak diadukan": minimal 10% layanan berkategori menyangkut topik ini
const JARANG = 10; // "Jarang di edukasi": dibahas di kurang dari 10% kegiatan

export type BarisGap = { topik: string; pel: number; edu: number; pPel: number; pEdu: number; banyak: boolean; jarang: boolean };

export function hitungGap(a: AgregatPelayanan, kegiatan: Kegiatan[], p: Periode, j: 'semua' | 'Pengaduan', kab: string | null = null) {
  const bDari = p.dari.slice(0, 7), bSampai = p.sampai.slice(0, 7);
  const masuk = (m: string) => m >= bDari && m <= bSampai;
  const cocok = (r: { bulan: string; jenis: string; kab: string }) => masuk(r.bulan) && (j === 'semua' || r.jenis === j) && (!kab || r.kab === kab);

  // Pelayanan: penyebutan per kategori, dibagi jumlah layanan berkategori.
  const pel: Record<string, number> = {};
  let sebut = 0;
  for (const r of a.baris)
    if (cocok(r)) {
      sebut += r.jumlah;
      if (r.kategori !== 'Lainnya') pel[r.kategori] = (pel[r.kategori] || 0) + r.jumlah;
    }
  const adaLayanan = Array.isArray(a.layanan) && a.layanan.length > 0;
  // Kiriman lama tanpa jumlah layanan: pakai jumlah penyebutan (sedikit lebih besar dari jumlah layanan).
  const nPel = adaLayanan ? a.layanan.filter(cocok).reduce((x, r) => x + r.jumlah, 0) : sebut;

  // Edukasi: jumlah kegiatan yang membahas topik, topik payung ikut menghitung turunannya.
  const edu: Record<string, number> = {};
  const list = kegiatan.filter((k) => k.tanggal >= p.dari && k.tanggal <= p.sampai && (!kab || k.kabkota === kab));
  for (const k of list) {
    const set = new Set<string>(k.topik);
    for (const t of k.topik) for (const anak of PAYUNG[t] || []) set.add(anak);
    for (const t of set) if (t !== 'Lainnya') edu[t] = (edu[t] || 0) + 1;
  }
  const nEdu = list.length;
  const pct = (v: number, t: number) => (t ? (v / t) * 100 : 0);
  const cukup = nPel >= MIN_LAYANAN;
  const baris: BarisGap[] = [...new Set([...Object.keys(pel), ...Object.keys(edu)])].map((t) => {
    const pPel = pct(pel[t] || 0, nPel), pEdu = pct(edu[t] || 0, nEdu);
    const banyak = cukup && pPel >= BANYAK;
    return { topik: t, pel: pel[t] || 0, edu: edu[t] || 0, pPel, pEdu, banyak, jarang: banyak && nEdu > 0 && pEdu < JARANG };
  });
  baris.sort((x, y) => y.pPel - x.pPel || x.pEdu - y.pEdu);
  return { baris, nPel, nEdu, cukup, perkiraan: !adaLayanan };
}

const pct = (v: number) => (v < 1 && v > 0 ? '<1' : Math.round(v)) + '%';

function html(a: AgregatPelayanan | null, kegiatan: Kegiatan[], p: Periode, kab: string | null) {
  if (!a) return '<p class="kosong-kecil kiri">Belum ada data pelayanan dari Trapesium. Data terkirim otomatis saat pemilik membuka Trapesium.</p>';
  const g = hitungGap(a, kegiatan, p, jenis, kab);
  const kabPendek = kab ? kab.replace('Kabupaten ', 'Kab. ') : '';
  const lbl = jenis === 'Pengaduan' ? 'pengaduan' : 'layanan';
  const seg = `<div class="seg kecil" role="group" aria-label="Jenis layanan">${(['Pengaduan', 'semua'] as const)
    .map((v) => `<button data-gj="${v}" class="${v === jenis ? 'on' : ''}">${v === 'semua' ? 'Semua layanan' : 'Pengaduan saja'}</button>`)
    .join('')}</div>`;
  const catatan = `<p class="gap-cat">Pelayanan = persentase ${lbl} berkategori yang menyangkut topik itu (satu ${lbl} bisa punya 2 kategori, jadi totalnya bisa lebih dari 100%). Edukasi = persentase kegiatan yang membahas topik itu, sebagai materi utama maupun materi template; "Waspada aktivitas keuangan ilegal" dihitung mencakup pinjol ilegal dan investasi bodong.${
    kab ? ` Hanya ${esc(kabPendek)}: ${lbl} dari konsumen yang domisilinya tercatat di sini, kegiatan yang berlangsung di sini.` : ''
  }${g.perkiraan ? ' Jumlah layanan masih diperkirakan dari jumlah penyebutan; buka Trapesium sekali agar angkanya diperbarui.' : ''} Pengaduan mencatat masalah yang sudah terjadi, sedangkan edukasi bersifat pencegahan, jadi kartu ini sinyal topik, bukan penilaian edukasi. Data pelayanan diterima ${esc(new Date(a.diterima).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }))}.</p>`;
  if (!g.nPel)
    return seg + `<p class="kosong-kecil kiri">Belum ada ${lbl} berkategori${kab ? ` dari konsumen ${esc(kabPendek)}` : ''} di periode ini (data pelayanan tersedia ${esc(rentang(a))}).</p>` + catatan;
  const info = `<p class="gap-n"><b>${angka(g.nPel)}</b> ${lbl} berkategori · <b>${angka(g.nEdu)}</b> kegiatan edukasi${
    g.cukup ? '' : ` · <span class="gap-kurang">Tanda belum ditampilkan: minimal ${MIN_LAYANAN} ${lbl} berkategori supaya persentasenya bermakna.</span>`
  }</p>`;
  const rows = g.baris
    .filter((b) => b.pel || b.edu)
    .slice(0, 12)
    .map(
      (b) => `<li class="${b.banyak ? 'perhatian' : ''}">
        <span class="gn">${esc(b.topik)}${b.banyak || b.jarang ? `<span class="gt">${b.banyak ? '<em>Banyak diadukan</em>' : ''}${b.jarang ? '<em class="abu">Jarang di edukasi</em>' : ''}</span>` : ''}</span>
        <span class="gb kiri" title="${b.pel} dari ${g.nPel} ${lbl}"><i style="width:${Math.min(100, b.pPel)}%"></i><b>${pct(b.pPel)}</b></span>
        <span class="gb kanan" title="${b.edu} dari ${g.nEdu} kegiatan"><i style="width:${Math.min(100, b.pEdu)}%"></i><b>${pct(b.pEdu)}</b></span>
      </li>`,
    )
    .join('');
  return `${seg}${info}<div class="gap-kepala"><span></span><span>% ${lbl}</span><span>% kegiatan edukasi</span></div><ul class="gap">${rows}</ul>
  <p class="gap-cat">"Banyak diadukan" = minimal ${BANYAK}% ${lbl} berkategori menyangkut topik ini. "Jarang di edukasi" = topik itu dibahas di kurang dari ${JARANG}% kegiatan.</p>${catatan}`;
}

function rentang(a: AgregatPelayanan) {
  const b = Object.keys(a.perBulan).sort();
  return b.length ? `${namaBulan(b[0])} – ${namaBulan(b[b.length - 1])}` : 'belum ada';
}

export async function pasangGap(el: HTMLElement, kegiatan: Kegiatan[], p: Periode, kab: string | null) {
  const box = $('#gap .gap-isi', el);
  if (!box) return;
  let a: AgregatPelayanan | null;
  try {
    if (!cache || Date.now() - cache.at > 5 * 60e3) cache = { at: Date.now(), data: await api.pelayanan() };
    a = cache.data;
  } catch (e: any) {
    box.innerHTML = `<p class="galat">${esc(e.message)}</p>`;
    return;
  }
  const gambar = () => {
    box.innerHTML = html(a, kegiatan, p, kab);
    $$<HTMLButtonElement>('[data-gj]', box).forEach(
      (b) =>
        (b.onclick = () => {
          jenis = b.dataset.gj as typeof jenis;
          gambar();
        }),
    );
  };
  gambar();
}
