// Halaman "Kegiatan": daftar semua kegiatan + halaman ubah per kegiatan.
import { SEMUA_WILAYAH, periksa, type Kegiatan } from '../../shared/schema.js';
import { tanggalPanjang, angka } from '../../shared/statistik.js';
import { api } from '../api.js';
import { dataKegiatan, segarkanData } from '../data.js';
import { esc, $, toast, unduh } from '../ui.js';
import { formHtml, bacaForm, tampilGalat } from './form.js';

let cari = '';
let wilayah = '';

export async function viewDaftar(el: HTMLElement) {
  el.innerHTML = `<div class="memuat besar"><i></i><i></i><i></i></div>`;
  let semua: Kegiatan[];
  try {
    semua = await dataKegiatan();
  } catch (e: any) {
    el.innerHTML = `<p class="galat">${esc(e.message)}</p>`;
    return;
  }
  el.innerHTML = `
  <header class="judul-hal dasbor-head"><div><h1>Kegiatan</h1><p>${semua.length} kegiatan tercatat</p></div>
    <div class="kontrol"><button class="btn" id="csv"${semua.length ? '' : ' disabled'}>Unduh CSV</button><a class="btn utama" href="#/unggah">Unggah laporan</a></div></header>
  <div class="saring">
    <input type="search" id="cari" placeholder="Cari judul, tempat, mitra, narasumber…" value="${esc(cari)}">
    <select id="wil"><option value="">Semua wilayah</option>${SEMUA_WILAYAH.map((w) => `<option${w === wilayah ? ' selected' : ''}>${w}</option>`).join('')}</select>
  </div>
  <div id="tabel"></div>`;
  const tabel = $('#tabel', el);
  const gambar = () => {
    const q = cari.toLowerCase();
    const l = semua.filter(
      (k) =>
        (!wilayah || k.kabkota === wilayah) &&
        (!q || [k.judul, k.tempat, k.pengundang, k.tema, k.narasumber.join(' '), k.kabkota].join(' ').toLowerCase().includes(q)),
    );
    tabel.innerHTML = l.length
      ? `<table class="tbl"><thead><tr><th>Tanggal</th><th>Kegiatan</th><th>Wilayah</th><th>Sasaran</th><th class="r">Peserta</th></tr></thead><tbody>${l
          .map(
            (k) => `<tr data-id="${k.id}" tabindex="0"><td class="nw">${tanggalPanjang(k.tanggal)}</td><td><a href="#/kegiatan/${k.id}">${esc(k.judul)}</a><span class="sub">${esc(
              k.tempat,
            )}</span></td><td>${esc(k.kabkota)}</td><td>${esc(k.sasaran.join(', '))}</td><td class="r">${k.pesertaPerkiraan ? '±' : ''}${angka(k.peserta || 0)}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : `<p class="sub kosong-kecil">${semua.length ? 'Tidak ada kegiatan yang cocok dengan pencarian.' : 'Belum ada kegiatan. Unggah laporan pertama.'}</p>`;
  };
  gambar();
  $<HTMLInputElement>('#cari', el).oninput = (e) => {
    cari = (e.target as HTMLInputElement).value;
    gambar();
  };
  $<HTMLSelectElement>('#wil', el).onchange = (e) => {
    wilayah = (e.target as HTMLSelectElement).value;
    gambar();
  };
  tabel.onclick = (e) => {
    const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-id]');
    if (tr && !(e.target as HTMLElement).closest('a')) location.hash = '#/kegiatan/' + tr.dataset.id;
  };
  tabel.onkeydown = (e) => {
    const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-id]');
    if (tr && e.key === 'Enter') location.hash = '#/kegiatan/' + tr.dataset.id;
  };
  $('#csv', el).onclick = () => unduh(`kegiatan-edukasi-${new Date().toISOString().slice(0, 10)}.csv`, csv(semua));
}

const KOLOM: [string, (k: Kegiatan) => unknown][] = [
  ['Tanggal', (k) => k.tanggal],
  ['Judul', (k) => k.judul],
  ['Tema', (k) => k.tema],
  ['Pengundang/mitra', (k) => k.pengundang],
  ['Peran OJK', (k) => k.peranOjk],
  ['Tempat', (k) => k.tempat],
  ['Kabupaten/kota', (k) => k.kabkota],
  ['Mode', (k) => k.mode],
  ['Narasumber', (k) => k.narasumber.join('; ')],
  ['Sasaran', (k) => k.sasaran.join('; ')],
  ['Keterangan peserta', (k) => k.sasaranDetail],
  ['Peserta', (k) => k.peserta ?? ''],
  ['Peserta perkiraan', (k) => (k.pesertaPerkiraan ? 'ya' : '')],
  ['Topik', (k) => k.topik.join('; ')],
  ['Kanal', (k) => k.kanal.join('; ')],
  ['Metode', (k) => k.metode.join('; ')],
  ['Ringkasan', (k) => k.ringkasan],
  ['Catatan', (k) => k.catatan],
  ['File laporan', (k) => k.sumberFile],
  ['Dicatat oleh', (k) => k.dicatatOleh],
];

function csv(l: Kegiatan[]) {
  const q = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [KOLOM.map((c) => c[0]), ...l.map((k) => KOLOM.map((c) => c[1](k)))].map((r) => r.map(q).join(',')).join('\r\n');
}

export async function viewDetail(el: HTMLElement, id: string) {
  el.innerHTML = `<div class="memuat besar"><i></i><i></i><i></i></div>`;
  const k = (await dataKegiatan().catch(() => [] as Kegiatan[])).find((x) => x.id === id);
  if (!k) {
    el.innerHTML = `<section class="kartu kosong"><h2>Kegiatan tidak ditemukan</h2><p>Mungkin sudah dihapus.</p><a class="btn" href="#/kegiatan">Kembali ke daftar</a></section>`;
    return;
  }
  el.innerHTML = `<a class="teks kembali" href="#/kegiatan">← Semua kegiatan</a>
  <header class="judul-hal"><h1>${esc(k.judul)}</h1><p>Dicatat ${new Date(k.dibuat).toLocaleDateString('id-ID', { dateStyle: 'long' })}${
    k.dicatatOleh ? ' oleh ' + esc(k.dicatatOleh) : ''
  }${k.diubah !== k.dibuat ? ' · diubah ' + new Date(k.diubah).toLocaleDateString('id-ID', { dateStyle: 'long' }) : ''}</p></header>
  <section class="kartu">${formHtml(k)}<div class="aksi"><button class="btn bahaya" id="hapus">Hapus</button><button class="btn utama" id="simpan">Simpan perubahan</button></div></section>`;
  const form = $<HTMLFormElement>('form', el);
  $('#simpan', el).onclick = async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    const isian = bacaForm(form, k);
    const salah = periksa(isian);
    tampilGalat(form, salah);
    if (salah.length) return;
    b.disabled = true;
    b.textContent = 'Menyimpan…';
    try {
      await api.ubah(k.id, isian);
      await segarkanData();
      toast('Perubahan tersimpan.');
      location.hash = '#/kegiatan';
    } catch (err: any) {
      tampilGalat(form, [err.message]);
      b.disabled = false;
      b.textContent = 'Simpan perubahan';
    }
  };
  $('#hapus', el).onclick = async (e) => {
    if (!confirm(`Hapus "${k.judul}"? Data ini tidak bisa dikembalikan.`)) return;
    const b = e.currentTarget as HTMLButtonElement;
    b.disabled = true;
    try {
      await api.hapus(k.id);
      await segarkanData();
      toast('Kegiatan dihapus.');
      location.hash = '#/kegiatan';
    } catch (err: any) {
      tampilGalat(form, [err.message]);
      b.disabled = false;
    }
  };
}
