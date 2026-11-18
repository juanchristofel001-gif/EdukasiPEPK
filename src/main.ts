// Titik masuk website: halaman kode akses, navigasi, dan pemilihan halaman berdasarkan alamat (#/…).
import '@fontsource-variable/plus-jakarta-sans';
import './style.css';
import { LOGO, NAMA } from './merek.js';
import { api, kode, nama, saatKodeDitolak } from './api.js';
import { lupakanData } from './data.js';
import { esc, $ } from './ui.js';
import { viewDasbor } from './views/dasbor.js';
import { IKON } from './ikon.js';
import { viewUnggah } from './views/unggah.js';
import { viewDaftar, viewDetail } from './views/daftar.js';
import { viewSampah } from './views/sampah.js';
import { viewRiwayat } from './views/riwayat.js';
import { viewImpor } from './views/impor.js';
import { viewLaporan } from './views/laporan.js';

const app = $('#app');

const NAV = [
  ['#/dasbor', 'Dasbor', IKON.dasbor],
  ['#/unggah', 'Unggah laporan', IKON.unggah],
  ['#/kegiatan', 'Kegiatan', IKON.daftar],
  ['#/riwayat', 'Riwayat', IKON.riwayat],
] as const;

const merek = `<a class="merek" href="#/dasbor"><span class="logo">${LOGO}</span><span class="bn"><b aria-label="SiPEDULIKU">${NAMA}</b><small>Pencatatan Edukasi Literasi Keuangan</small></span></a>`;

function kerangka() {
  app.innerHTML = `
  <aside class="side">
    <img class="ojk" src="/logo-ojk.png" alt="Otoritas Jasa Keuangan" width="325" height="128">
    ${merek}
    <nav class="nav">${NAV.map(([h, t, ic]) => `<a href="${h}">${ic}<span>${t}</span></a>`).join('')}</nav>
    <div class="siapa">Masuk sebagai <b>${esc(nama.get())}</b> · <button class="teks" id="gantiNama">ganti</button></div>
    <button class="foot" id="keluar">${IKON.keluar}<span>Keluar</span></button>
  </aside>
  <header class="top"><div class="top-kiri"><img class="ojk kecil" src="/logo-ojk.png" alt="Otoritas Jasa Keuangan" width="325" height="128">${merek}</div><button class="ikon-btn" id="keluar2" aria-label="Keluar">${IKON.keluar}</button></header>
  <main id="hal" class="main" tabindex="-1"></main>
  <nav class="bawah">${NAV.map(([h, t, ic]) => `<a href="${h}">${ic}<span>${t.replace(' laporan', '')}</span></a>`).join('')}</nav>`;
  const keluar = () => {
    kode.hapus();
    lupakanData();
    masuk();
  };
  $('#keluar').onclick = keluar;
  $('#gantiNama').onclick = () => (location.hash = '#/nama');
  $('#keluar2').onclick = keluar;
}

function rute() {
  if (!kode.get()) return masuk();
  if (!nama.get() || location.hash === '#/nama') return isiNama(!!nama.get());
  if (!$('#hal')) kerangka();
  const h = location.hash || '#/dasbor';
  const hal = $('#hal');
  document.querySelectorAll('.nav a, .bawah a').forEach((a) => a.classList.toggle('aktif', (h.startsWith('#/sampah') ? '#/kegiatan' : h.startsWith('#/impor') ? '#/unggah' : h.startsWith('#/laporan') ? '#/dasbor' : h).startsWith(a.getAttribute('href')!)));
  const m = h.match(/^#\/kegiatan\/(.+)$/);
  if (m) viewDetail(hal, decodeURIComponent(m[1]));
  else if (h.startsWith('#/unggah')) viewUnggah(hal);
  else if (h.startsWith('#/sampah')) viewSampah(hal);
  else if (h.startsWith('#/riwayat')) viewRiwayat(hal);
  else if (h.startsWith('#/impor')) viewImpor(hal);
  else if (h.startsWith('#/laporan')) viewLaporan(hal, new URLSearchParams(h.split('?')[1] || ''));
  else if (h.startsWith('#/kegiatan')) viewDaftar(hal);
  else viewDasbor(hal);
  window.scrollTo(0, 0);
}

function masuk(pesan = '') {
  app.innerHTML = `
  <main class="masuk">
    <form id="fmasuk" class="kartu">
      <img class="ojk masuk-ojk" src="/logo-ojk.png" alt="Otoritas Jasa Keuangan" width="325" height="128">
      <span class="logo besar">${LOGO}</span>
      <h1 aria-label="SiPEDULIKU">${NAMA}</h1>
      <p>Sistem Pencatatan Edukasi Literasi Keuangan, OJK Provinsi Banten. Masukkan kode akses tim.</p>
      <label class="field"><span class="lbl">Nama kamu</span><input id="nama" autocomplete="name" value="${esc(nama.get())}" placeholder="Muncul di riwayat perubahan" required autofocus></label>
      <label class="field"><span class="lbl">Kode akses</span><input id="kode" type="password" autocomplete="current-password" required></label>
      <p class="galat" role="alert"${pesan ? '' : ' hidden'}>${esc(pesan)}</p>
      <button class="btn utama penuh">Masuk</button>
    </form>
  </main>`;
  const f = $<HTMLFormElement>('#fmasuk');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const k = $<HTMLInputElement>('#kode').value.trim();
    const n = $<HTMLInputElement>('#nama').value.trim();
    const g = $<HTMLParagraphElement>('.galat', f);
    const b = $<HTMLButtonElement>('button', f);
    if (!n || !k) {
      g.hidden = false;
      g.textContent = !n ? 'Isi nama kamu dulu.' : 'Isi kode akses dulu.';
      return;
    }
    b.disabled = true;
    b.textContent = 'Memeriksa…';
    try {
      await api.cekKode(k);
      kode.set(k);
      nama.set(n);
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

// Perangkat yang sudah masuk sebelum ada log riwayat diminta mengisi nama sekali.
function isiNama(ganti = false) {
  app.innerHTML = `
  <main class="masuk">
    <form id="fnama" class="kartu">
      <span class="logo besar">${LOGO}</span>
      <h1>${ganti ? 'Ganti nama' : 'Siapa yang memakai perangkat ini?'}</h1>
      <p>Nama ini dicatat di riwayat setiap kali kamu menambah, mengubah, atau menghapus kegiatan, supaya tim tahu siapa mengerjakan apa.</p>
      <label class="field"><span class="lbl">Nama kamu</span><input id="nama" autocomplete="name" value="${esc(nama.get())}" required autofocus></label>
      <p class="galat" role="alert" hidden></p>
      <button class="btn utama penuh">Simpan</button>
    </form>
  </main>`;
  const f = $<HTMLFormElement>('#fnama');
  f.onsubmit = (e) => {
    e.preventDefault();
    const n = $<HTMLInputElement>('#nama').value.trim();
    if (!n) {
      const g = $<HTMLParagraphElement>('.galat', f);
      g.hidden = false;
      g.textContent = 'Isi nama kamu dulu.';
      return;
    }
    nama.set(n);
    if (location.hash === '#/nama') history.back();
    else rute();
  };
}

saatKodeDitolak(() => {
  kode.hapus();
  lupakanData();
  masuk('Kode akses sudah diganti. Masukkan kode yang baru.');
});
window.addEventListener('hashchange', rute);
rute();
