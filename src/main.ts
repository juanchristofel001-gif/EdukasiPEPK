// Titik masuk website: halaman kode akses, navigasi, dan pemilihan halaman berdasarkan alamat (#/…).
import './style.css';
import { api, kode, saatKodeDitolak } from './api.js';
import { lupakanData } from './data.js';
import { esc, $ } from './ui.js';
import { viewDasbor } from './views/dasbor.js';
import { IKON } from './ikon.js';
import { viewUnggah } from './views/unggah.js';
import { viewDaftar, viewDetail } from './views/daftar.js';

const app = $('#app');

const NAV = [
  ['#/dasbor', 'Dasbor', IKON.dasbor],
  ['#/unggah', 'Unggah laporan', IKON.unggah],
  ['#/kegiatan', 'Kegiatan', IKON.daftar],
] as const;

const merek = `<a class="merek" href="#/dasbor"><span class="logo">${IKON.topi}</span><span class="bn"><b>Edukasi <span>PEPK</span></b><small>OJK Provinsi Banten</small></span></a>`;

function kerangka() {
  app.innerHTML = `
  <aside class="side">
    ${merek}
    <nav class="nav">${NAV.map(([h, t, ic]) => `<a href="${h}">${ic}<span>${t}</span></a>`).join('')}</nav>
    <button class="foot" id="keluar">${IKON.keluar}<span>Keluar</span></button>
  </aside>
  <header class="top">${merek}<button class="ikon-btn" id="keluar2" aria-label="Keluar">${IKON.keluar}</button></header>
  <main id="hal" class="main" tabindex="-1"></main>
  <nav class="bawah">${NAV.map(([h, t, ic]) => `<a href="${h}">${ic}<span>${t.replace(' laporan', '')}</span></a>`).join('')}</nav>`;
  const keluar = () => {
    kode.hapus();
    lupakanData();
    masuk();
  };
  $('#keluar').onclick = keluar;
  $('#keluar2').onclick = keluar;
}

function rute() {
  if (!kode.get()) return masuk();
  if (!$('#hal')) kerangka();
  const h = location.hash || '#/dasbor';
  const hal = $('#hal');
  document.querySelectorAll('.nav a, .bawah a').forEach((a) => a.classList.toggle('aktif', h.startsWith(a.getAttribute('href')!)));
  const m = h.match(/^#\/kegiatan\/(.+)$/);
  if (m) viewDetail(hal, decodeURIComponent(m[1]));
  else if (h.startsWith('#/unggah')) viewUnggah(hal);
  else if (h.startsWith('#/kegiatan')) viewDaftar(hal);
  else viewDasbor(hal);
  window.scrollTo(0, 0);
}

function masuk(pesan = '') {
  app.innerHTML = `
  <main class="masuk">
    <form id="fmasuk" class="kartu">
      <span class="logo besar">${IKON.topi}</span>
      <h1>Edukasi <span>PEPK</span></h1>
      <p>Pencatatan kegiatan edukasi keuangan OJK Provinsi Banten. Masukkan kode akses tim.</p>
      <label class="field"><span class="lbl">Kode akses</span><input id="kode" type="password" autocomplete="current-password" required autofocus></label>
      <p class="galat" role="alert"${pesan ? '' : ' hidden'}>${esc(pesan)}</p>
      <button class="btn utama penuh">Masuk</button>
    </form>
  </main>`;
  const f = $<HTMLFormElement>('#fmasuk');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const k = $<HTMLInputElement>('#kode').value.trim();
    const g = $<HTMLParagraphElement>('.galat', f);
    const b = $<HTMLButtonElement>('button', f);
    if (!k) {
      g.hidden = false;
      g.textContent = 'Isi kode akses dulu.';
      return;
    }
    b.disabled = true;
    b.textContent = 'Memeriksa…';
    try {
      await api.cekKode(k);
      kode.set(k);
      if (!location.hash) location.hash = '#/dasbor';
      rute();
    } catch (err: any) {
      g.hidden = false;
      g.textContent = err.message;
      b.disabled = false;
      b.textContent = 'Masuk';
    }
  };
}

saatKodeDitolak(() => {
  kode.hapus();
  lupakanData();
  masuk('Kode akses sudah diganti. Masukkan kode yang baru.');
});
window.addEventListener('hashchange', rute);
rute();
