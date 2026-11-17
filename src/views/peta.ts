// Peta panas (choropleth) 8 kabupaten/kota Banten.
// Batas wilayah dari public/banten.json (Badan Informasi Geospasial), digambar sebagai SVG tanpa library.
import type { Statistik } from '../../shared/statistik.js';
import { angka, tanggalPendek } from '../../shared/statistik.js';
import { esc } from '../ui.js';

type Titik = [number, number];
type Wilayah = { nama: string; poligon: Titik[][][] };
type Kec = Wilayah & { kab: string };
export type Geo = { wilayah: Wilayah[]; kecamatan: Kec[] };
export type Tingkat = 'kabkota' | 'kecamatan';

let geo: Promise<Geo> | null = null;
export const muatPeta = () =>
  (geo ??= fetch('/banten.json')
    .then((r) => {
      if (!r.ok) throw new Error('Peta tidak bisa dimuat.');
      return r.json();
    })
    .then((j) => j as Geo));

// Warna berurutan satu rona (biru), terang = sedikit, gelap = banyak.
export const SKALA = ['#dbe7f7', '#a9c6ec', '#6e9fdb', '#3a72bd', '#1b4a8a'];
export const KOSONG = '#ecebf0';

export type Ukuran = 'kegiatan' | 'peserta';

export function kelas(nilai: number, maks: number) {
  if (!nilai) return -1;
  if (maks <= SKALA.length) return Math.min(SKALA.length - 1, Math.round(((nilai - 1) / Math.max(1, maks - 1)) * (SKALA.length - 1)));
  return Math.min(SKALA.length - 1, Math.floor((nilai / maks) * SKALA.length - 1e-9));
}

export function batasLegenda(maks: number): string[] {
  if (!maks) return [];
  if (maks <= SKALA.length) return Array.from({ length: maks }, (_, i) => String(i + 1));
  const step = maks / SKALA.length;
  return SKALA.map((_, i) => {
    const a = Math.floor(i * step) + 1,
      b = Math.floor((i + 1) * step);
    return a >= b ? angka(b) : `${angka(a)}–${angka(b)}`;
  });
}

// Label kota kecil ditarik keluar ke laut/tepi supaya tidak menumpuk.
const LABEL_LUAR: Record<string, [number, number, 'start' | 'end']> = {
  'Kota Cilegon': [-70, -34, 'end'],
  'Kota Serang': [10, -52, 'start'],
  'Kota Tangerang': [40, -40, 'start'],
  'Kota Tangerang Selatan': [36, 42, 'start'],
};
const SINGKAT: Record<string, string> = {
  'Kabupaten Lebak': 'Lebak',
  'Kabupaten Pandeglang': 'Pandeglang',
  'Kabupaten Serang': 'Kab. Serang',
  'Kabupaten Tangerang': 'Kab. Tangerang',
  'Kota Cilegon': 'Cilegon',
  'Kota Serang': 'Kota Serang',
  'Kota Tangerang': 'Kota Tangerang',
  'Kota Tangerang Selatan': 'Tangsel',
};

function luasDanPusat(ring: Titik[]) {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f;
    cx += (ring[j][0] + ring[i][0]) * f;
    cy += (ring[j][1] + ring[i][1]) * f;
  }
  a /= 2;
  return { luas: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) };
}

function dalam(p: Titik, ring: Titik[]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function jarakTepi(p: Titik, ring: Titik[], k: number) {
  let m = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0] * k, ay = ring[j][1], bx = ring[i][0] * k, by = ring[i][1], px = p[0] * k, py = p[1];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    m = Math.min(m, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return m;
}
// Titik paling "lega" di dalam wilayah (mirip polylabel), supaya label tidak jatuh di wilayah lain.
function titikLabel(ring: Titik[], k: number): Titik {
  const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let best: Titik = [(x0 + x1) / 2, (y0 + y1) / 2], bd = -1;
  const N = 36;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const p: Titik = [x0 + ((x1 - x0) * i) / N, y0 + ((y1 - y0) * j) / N];
      if (!dalam(p, ring)) continue;
      const d = jarakTepi(p, ring, k);
      if (d > bd) (bd = d), (best = p);
    }
  return best;
}

export function petaSvg(g: Geo, s: Statistik, ukuran: Ukuran, sempit = false, tingkat: Tingkat = 'kabkota') {
  const wilayah = g.wilayah;
  const W = 620,
    PAD = sempit ? { l: 4, r: 170, t: 100, b: 8 } : { l: 8, r: 118, t: 58, b: 8 };
  const semua = wilayah.flatMap((w) => w.poligon.flatMap((p) => p[0]));
  const lon = semua.map((p) => p[0]),
    lat = semua.map((p) => p[1]);
  const x0 = Math.min(...lon),
    x1 = Math.max(...lon),
    y0 = Math.min(...lat),
    y1 = Math.max(...lat);
  const k = Math.cos(((y0 + y1) / 2) * (Math.PI / 180));
  const sc = (W - PAD.l - PAD.r) / ((x1 - x0) * k);
  const H = Math.round((y1 - y0) * sc + PAD.t + PAD.b);
  const X = (p: Titik) => PAD.l + (p[0] - x0) * k * sc;
  const Y = (p: Titik) => PAD.t + (y1 - p[1]) * sc;

  const data = new Map(s.perWilayah.map((w) => [w.nama, w]));
  const nilai = (n: string) => (ukuran === 'kegiatan' ? data.get(n)?.kegiatan : data.get(n)?.peserta) || 0;
  const maks = Math.max(0, ...s.perWilayah.map((w) => (ukuran === 'kegiatan' ? w.kegiatan : w.peserta)));

  const path = (pol: Titik[][][]) => pol.map((pl) => pl.map((ring) => 'M' + ring.map((p) => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join('L') + 'Z').join('')).join('');
  const kecData = new Map(s.perKecamatan.map((c) => [c.kab + '|' + c.nama, c]));
  if (tingkat === 'kecamatan') {
    const nk = (c: Kec) => {
      const d = kecData.get(c.kab + '|' + c.nama);
      return (ukuran === 'kegiatan' ? d?.kegiatan : d?.peserta) || 0;
    };
    const mk = Math.max(0, ...g.kecamatan.map(nk));
    const isi = g.kecamatan
      .map((c) => {
        const v = nk(c),
          ki = kelas(v, mk);
        return `<path class="wil kec" data-nama="${esc(c.kab + '|' + c.nama)}" d="${path(c.poligon)}" fill="${ki < 0 ? KOSONG : SKALA[ki]}" tabindex="-1"/>`;
      })
      .join('');
    const garis = wilayah.map((w) => `<path class="batas-kab" d="${path(w.poligon)}"/>`).join('');
    const nama = wilayah
      .map((w) => {
        const utama = w.poligon.map((pl) => ({ ring: pl[0], luas: luasDanPusat(pl[0]).luas })).sort((a, b) => b.luas - a.luas)[0].ring;
        const t = titikLabel(utama, k);
        const cx = X(t), cy = Y(t);
        const luar = LABEL_LUAR[w.nama];
        if (!luar) return `<g class="pl tipis" pointer-events="none"><text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" class="ln">${SINGKAT[w.nama]}</text></g>`;
        const f = sempit ? 1.45 : 1;
        const lx = cx + luar[0] * f, ly = cy + luar[1] * f;
        return `<g class="pl luar" pointer-events="none"><path d="M${cx.toFixed(1)},${cy.toFixed(1)}L${lx.toFixed(1)},${(ly + 4).toFixed(1)}"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.2"/><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${luar[2]}" class="ln">${SINGKAT[w.nama]}</text></g>`;
      })
      .join('');
    return { svg: `<svg viewBox="0 0 ${W} ${H}" class="peta-svg" role="img" aria-label="Peta sebaran ${ukuran} per kecamatan di Banten">${isi}${garis}${nama}</svg>`, maks: mk };
  }

  const bentuk = wilayah
    .map((w) => {
      const d = w.poligon.map((pl) => pl.map((ring) => 'M' + ring.map((p) => `${X(p).toFixed(1)},${Y(p).toFixed(1)}`).join('L') + 'Z').join('')).join('');
      const v = nilai(w.nama);
      const ki = kelas(v, maks);
      return `<path class="wil" data-nama="${esc(w.nama)}" d="${d}" fill="${ki < 0 ? KOSONG : SKALA[ki]}" tabindex="0" role="img" aria-label="${esc(w.nama)}: ${angka(v)} ${ukuran}"/>`;
    })
    .join('');

  const label = wilayah
    .map((w) => {
      const utama = w.poligon.map((pl) => ({ ring: pl[0], luas: luasDanPusat(pl[0]).luas })).sort((a, b) => b.luas - a.luas)[0].ring;
      const t = titikLabel(utama, k);
      const cx = X(t),
        cy = Y(t);
      const v = nilai(w.nama);
      const ki = kelas(v, maks);
      const gelap = ki >= 3;
      const luar = LABEL_LUAR[w.nama];
      if (!luar) {
        if (sempit && (w.nama === 'Kabupaten Serang' || w.nama === 'Kabupaten Tangerang'))
          return `<g class="pl${gelap ? ' gelap' : ''}" pointer-events="none"><text x="${cx.toFixed(1)}" y="${(cy + 8).toFixed(1)}" class="lv">${angka(v)}</text></g>`;
        return `<g class="pl${gelap ? ' gelap' : ''}" pointer-events="none"><text x="${cx.toFixed(1)}" y="${(cy - 4).toFixed(1)}" class="ln">${SINGKAT[w.nama]}</text><text x="${cx.toFixed(1)}" y="${(cy + 13).toFixed(1)}" class="lv">${angka(v)}</text></g>`;
      }
      const [dx0, dy0, anchor] = luar;
      const f = sempit ? 1.45 : 1;
      const dx = dx0 * f,
        dy = dy0 * f;
      const lx = cx + dx,
        ly = cy + dy;
      return `<g class="pl luar" pointer-events="none"><path d="M${cx.toFixed(1)},${cy.toFixed(1)}L${lx.toFixed(1)},${(ly + 4).toFixed(1)}"/><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2.2"/><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" class="ln">${SINGKAT[w.nama]} <tspan class="lv">${angka(v)}</tspan></text></g>`;
    })
    .join('');

  return { svg: `<svg viewBox="0 0 ${W} ${H}" class="peta-svg" role="group" aria-label="Peta sebaran ${ukuran} per kabupaten/kota di Banten">${bentuk}${label}</svg>`, maks };
}

export function tooltipHtml(nama: string, s: Statistik) {
  if (nama.includes('|')) {
    const [kab, kec] = nama.split('|');
    const c = s.perKecamatan.find((x) => x.kab === kab && x.nama === kec);
    return `<b>Kec. ${esc(kec)}</b><span>${esc(kab)}</span><span>${c?.kegiatan || 0} kegiatan · ${angka(c?.peserta || 0)} peserta</span>${
      c?.terakhir ? `<span>Terakhir ${tanggalPendek(c.terakhir)}</span>` : ''
    }`;
  }
  const w = s.perWilayah.find((x) => x.nama === nama);
  if (!w) return `<b>${esc(nama)}</b>`;
  return `<b>${esc(nama)}</b><span>${w.kegiatan} kegiatan · ${angka(w.peserta)} peserta</span><span>${w.kecTerjangkau} dari ${w.kecTotal} kecamatan terjangkau</span><span>${
    w.terakhir ? 'Terakhir ' + tanggalPendek(w.terakhir) : 'Belum ada kegiatan'
  }</span>`;
}
