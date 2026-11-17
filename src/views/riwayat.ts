// Halaman "Riwayat": log siapa menambah, mengubah, menghapus, atau memulihkan kegiatan.
import type { Riwayat } from '../../shared/schema.js';
import { tanggalPanjang } from '../../shared/statistik.js';
import { api, nama } from '../api.js';
import { esc, $, hariIni } from '../ui.js';
import { IKON } from '../ikon.js';

const KATA: Record<Riwayat['aksi'], [string, string, string]> = {
  // [kata kerja, ikon, kelas warna]
  tambah: ['menambah', IKON.plus, 'hijau'],
  ubah: ['mengubah', IKON.pena, 'biasa'],
  sampah: ['memindahkan ke sampah', IKON.sampah, 'merah'],
  pulihkan: ['memulihkan dari sampah', IKON.pulih, 'hijau'],
  'hapus-permanen': ['menghapus permanen', IKON.sampah, 'merah'],
  'pulihkan-cadangan': ['memulihkan data dari', IKON.pulih, 'kuning'],
};

const jam = (iso: string) => new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const tglLokal = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function baris(r: Riwayat, tautan: boolean) {
  const [kata, ikon, kls] = KATA[r.aksi] || ['mengubah', IKON.pena, 'biasa'];
  const judul =
    tautan && r.kegiatanId && r.aksi !== 'hapus-permanen' ? `<a href="#/kegiatan/${esc(r.kegiatanId)}">${esc(r.judul)}</a>` : `<b>${esc(r.judul)}</b>`;
  const ubah = r.perubahan?.length
    ? `<ul class="rw-beda">${r.perubahan
        .map(
          (p) =>
            `<li><span class="rw-kol">${esc(p.kolom)}</span><span class="rw-dari">${esc(p.dari) || '<i>kosong</i>'}</span><span class="rw-pnh" aria-label="menjadi">→</span><span class="rw-jadi">${
              esc(p.jadi) || '<i>kosong</i>'
            }</span></li>`,
        )
        .join('')}</ul>`
    : '';
  return `<li class="rw"><span class="rw-ikon ${kls}">${ikon}</span><div class="rw-isi"><p><b>${esc(r.oleh)}</b> ${kata} ${judul}</p>${
    r.catatan ? `<p class="rw-cat">${esc(r.catatan)}</p>` : ''
  }${ubah}</div><time class="rw-jam" datetime="${esc(r.waktu)}">${jam(r.waktu)}</time></li>`;
}

// Daftar riwayat dikelompokkan per tanggal.
export function riwayatHtml(l: Riwayat[], tautan = true) {
  if (!l.length) return '<p class="kosong-kecil">Belum ada aktivitas tercatat.</p>';
  const h = hariIni();
  const grup = new Map<string, Riwayat[]>();
  for (const r of l) {
    const t = tglLokal(r.waktu);
    grup.set(t, [...(grup.get(t) || []), r]);
  }
  return [...grup]
    .map(
      ([t, rs]) =>
        `<h3 class="rw-tgl">${t === h ? 'Hari ini' : tanggalPanjang(t)}</h3><ul class="rw-daftar">${rs.map((r) => baris(r, tautan)).join('')}</ul>`,
    )
    .join('');
}

let orang = '';

export async function viewRiwayat(el: HTMLElement) {
  el.innerHTML = `<header class="ph"><div><h1>Riwayat</h1><p>Siapa menambah, mengubah, menghapus, atau memulihkan kegiatan. Nama berasal dari yang diisi di tiap perangkat.</p><p class="siapa-hal">Perangkat ini tercatat sebagai <b>${esc(nama.get())}</b> · <a class="lnk" href="#/nama">ganti nama</a></p></div></header>
  <section class="kartu"><div class="memuat besar"><i></i><i></i><i></i></div></section>`;
  let l: Riwayat[];
  try {
    l = await api.riwayat();
  } catch (e: any) {
    $('.kartu', el).innerHTML = `<p class="galat">${esc(e.message)}</p>`;
    return;
  }
  const semuaOrang = [...new Set(l.map((r) => r.oleh))].sort();
  const gambar = () => {
    const f = orang ? l.filter((r) => r.oleh === orang) : l;
    $('.kartu', el).innerHTML = `<div class="ch"><div><h2>${f.length} aktivitas</h2><p class="sub">${l.length >= 300 ? '300 aktivitas terakhir' : 'Sejak log riwayat diaktifkan'}</p></div>
      ${
        semuaOrang.length > 1
          ? `<select id="orang" aria-label="Saring per orang" class="saring-orang"><option value="">Semua orang</option>${semuaOrang
              .map((o) => `<option${o === orang ? ' selected' : ''}>${esc(o)}</option>`)
              .join('')}</select>`
          : ''
      }</div>${riwayatHtml(f)}`;
    const sel = $<HTMLSelectElement>('#orang', el);
    if (sel)
      sel.onchange = () => {
        orang = sel.value;
        gambar();
      };
  };
  gambar();
}
