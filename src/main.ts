// Titik masuk website: halaman kode akses, navigasi, dan pemilihan halaman berdasarkan alamat (#/…).
import './style.css';
import { api, kode, saatKodeDitolak } from './api.js';
import { lupakanData } from './data.js';
import { esc, $ } from './ui.js';
import { viewDasbor } from './views/dasbor.js';
import { viewUnggah } from './views/unggah.js';
import { viewDaftar, viewDetail } from './views/daftar.js';

const app = $('#app');

const NAV = [
  ['#/dasbor', 'Dasbor'],
  ['#/unggah', 'Unggah laporan'],
  ['#/kegiatan', 'Kegiatan'],
] as const;

function kerangka() {
  app.innerHTML = `
  <header class="top">
    <a class="merek" href="#/dasbor"><span class="logo" aria-hidden="true"></span><span><b>Edukasi PEPK</b><small>OJK Provinsi Banten</small></span></a>
    <nav>${NAV.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</nav>
    <button class="teks" id="keluar">Keluar</button>
  </header>
  <main id="hal" tabindex="-1"></main>`;
  $('#keluar').onclick = () => {
    kode.hapus();
    lupakanData();
    masuk();
  };
}

function rute() {
  if (!kode.get()) return masuk();
  if (!$('#hal')) kerangka();
  const h = location.hash || '#/dasbor';
  const hal = $('#hal');
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('aktif', h.startsWith(a.getAttribute('href')!)));
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
      <span class="logo besar" aria-hidden="true"></span>
      <h1>Edukasi PEPK</h1>
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
