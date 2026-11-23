// Kartu "Pelayanan vs edukasi": membandingkan porsi topik masalah konsumen (dari Trapesium)
// dengan porsi topik edukasi di periode yang sama. Hanya angka agregat, seluruh Banten.
import type { Periode } from '../../shared/statistik.js';
import { angka, namaBulan } from '../../shared/statistik.js';
import type { AgregatPelayanan } from '../../shared/pelayanan.js';
import { api } from '../api.js';
import { esc, $, $$ } from '../ui.js';

let jenis: 'semua' | 'Pengaduan' = 'Pengaduan'; // default pengaduan: cek SLIK rutin bukan sinyal kurang literasi
let cache: { at: number; data: AgregatPelayanan | null } | null = null;

// Ambang tanda "perlu perhatian": topik ini minimal 10% dari masalah konsumen
// dan porsinya di edukasi tertinggal minimal 5 poin persen.
const MIN_PORSI = 10;
const MIN_SELISIH = 5;

export type BarisGap = { topik: string; pel: number; edu: number; pPel: number; pEdu: number; selisih: number; perhatian: boolean };

export function hitungGap(a: AgregatPelayanan, eduTopik: [string, number][], p: Periode, j: 'semua' | 'Pengaduan') {
  const bDari = p.dari.slice(0, 7), bSampai = p.sampai.slice(0, 7);
  const masuk = (m: string) => m >= bDari && m <= bSampai;
  const pel: Record<string, number> = {};
  for (const r of a.baris) if (masuk(r.bulan) && (j === 'semua' || r.jenis === j) && r.kategori !== 'Lainnya') pel[r.kategori] = (pel[r.kategori] || 0) + r.jumlah;
  const edu: Record<string, number> = {};
  for (const [k, v] of eduTopik) if (k !== 'Lainnya') edu[k] = v;
  const tPel = Object.values(pel).reduce((x, y) => x + y, 0);
  const tEdu = Object.values(edu).reduce((x, y) => x + y, 0);
  const pct = (v: number, t: number) => (t ? (v / t) * 100 : 0);
  const baris: BarisGap[] = [...new Set([...Object.keys(pel), ...Object.keys(edu)])].map((t) => {
    const pPel = pct(pel[t] || 0, tPel), pEdu = pct(edu[t] || 0, tEdu);
    return { topik: t, pel: pel[t] || 0, edu: edu[t] || 0, pPel, pEdu, selisih: pPel - pEdu, perhatian: pPel >= MIN_PORSI && pPel - pEdu >= MIN_SELISIH };
  });
  baris.sort((x, y) => y.selisih - x.selisih || y.pel - x.pel);
  const cakupan = Object.entries(a.perBulan).filter(([m]) => masuk(m)).reduce((o, [, v]) => ({ total: o.total + v.total, berkategori: o.berkategori + v.berkategori }), { total: 0, berkategori: 0 });
  return { baris, tPel, tEdu, cakupan };
}

const pct = (v: number) => (v < 1 && v > 0 ? '<1' : Math.round(v)) + '%';

function html(a: AgregatPelayanan | null, eduTopik: [string, number][], p: Periode, terfilter: boolean) {
  if (!a) return '<p class="kosong-kecil kiri">Belum ada data pelayanan dari Trapesium. Data terkirim otomatis saat pemilik membuka Trapesium.</p>';
  const g = hitungGap(a, eduTopik, p, jenis);
  const seg = `<div class="seg kecil" role="group" aria-label="Jenis layanan">${(['Pengaduan', 'semua'] as const)
    .map((v) => `<button data-gj="${v}" class="${v === jenis ? 'on' : ''}">${v === 'semua' ? 'Semua layanan' : 'Pengaduan saja'}</button>`)
    .join('')}</div>`;
  const catatan = `<p class="gap-cat">${
    g.cakupan.total ? `${angka(g.cakupan.berkategori)} dari ${angka(g.cakupan.total)} layanan di periode ini sudah punya kategori dari catatan petugas. ` : ''
  }Porsi dihitung dari jumlah penyebutan topik (satu layanan bisa punya 2 kategori, satu kegiatan bisa membawakan beberapa topik). Data pelayanan diterima ${esc(new Date(a.diterima).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }))}.${
    terfilter ? ' Kartu ini selalu seluruh Banten: data pelayanan belum mencatat wilayah konsumen.' : ''
  }</p>`;
  if (!g.tPel) return seg + `<p class="kosong-kecil kiri">Belum ada layanan berkategori di periode ini (data pelayanan tersedia ${esc(rentang(a))}).</p>` + catatan;
  const rows = g.baris
    .filter((b) => b.pel || b.edu)
    .slice(0, 12)
    .map(
      (b) => `<li class="${b.perhatian ? 'perhatian' : ''}">
        <span class="gn">${esc(b.topik)}${b.perhatian ? '<em>Perlu perhatian</em>' : ''}</span>
        <span class="gb kiri" title="${b.pel} penyebutan di pelayanan"><i style="width:${Math.min(100, b.pPel)}%"></i><b>${pct(b.pPel)}</b></span>
        <span class="gb kanan" title="${b.edu} kegiatan edukasi"><i style="width:${Math.min(100, b.pEdu)}%"></i><b>${pct(b.pEdu)}</b></span>
      </li>`,
    )
    .join('');
  return `${seg}<div class="gap-kepala"><span></span><span>Masalah konsumen</span><span>Edukasi</span></div><ul class="gap">${rows}</ul>
  <p class="gap-cat">"Perlu perhatian" = topik ini minimal ${MIN_PORSI}% dari masalah konsumen, tetapi porsinya di edukasi tertinggal minimal ${MIN_SELISIH} poin persen.</p>${catatan}`;
}

function rentang(a: AgregatPelayanan) {
  const b = Object.keys(a.perBulan).sort();
  return b.length ? `${namaBulan(b[0])} – ${namaBulan(b[b.length - 1])}` : 'belum ada';
}

export async function pasangGap(el: HTMLElement, eduTopik: [string, number][], p: Periode, terfilter: boolean) {
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
    box.innerHTML = html(a, eduTopik, p, terfilter);
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
