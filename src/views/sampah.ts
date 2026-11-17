// Halaman "Sampah & cadangan": memulihkan kegiatan yang terhapus dan mengunduh cadangan harian.
import { tanggalPanjang, tanggalPendek, angka } from '../../shared/statistik.js';
import { api } from '../api.js';
import { segarkanData } from '../data.js';
import { esc, $, toast, unduh } from '../ui.js';
import { IKON } from '../ikon.js';

export async function viewSampah(el: HTMLElement) {
  el.innerHTML = `<a class="teks kembali" href="#/kegiatan">← Semua kegiatan</a>
  <header class="ph"><div><h1>Sampah & cadangan</h1><p>Kegiatan yang dihapus masuk sampah dulu dan bisa dipulihkan. Seluruh data juga dicadangkan otomatis setiap hari pukul 00.00 WIB (30 hari terakhir disimpan).</p></div></header>
  <section class="kartu" id="ksampah"><div class="ch"><div><h2>Sampah</h2><p class="sub">Kegiatan yang dipindahkan ke sampah tidak dihitung di dasbor</p></div></div><div class="isi"><div class="memuat"><i></i><i></i><i></i></div></div></section>
  <section class="kartu" id="kcad"><div class="ch"><div><h2>Cadangan harian</h2><p class="sub">Salinan seluruh data kegiatan, termasuk isi sampah</p></div><button class="btn lembut" id="cadSekarang">${IKON.unduh}Cadangkan sekarang</button></div><div class="isi"><div class="memuat"><i></i><i></i><i></i></div></div></section>`;
  muatSampah(el);
  muatCadangan(el);
  $('#cadSekarang', el).onclick = async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    b.disabled = true;
    try {
      await api.buatCadangan();
      toast('Cadangan hari ini sudah dibuat.');
      muatCadangan(el);
    } catch (err: any) {
      toast(err.message, 'galat');
    }
    b.disabled = false;
  };
}

async function muatSampah(el: HTMLElement) {
  const box = $('#ksampah .isi', el);
  try {
    const l = await api.sampah();
    box.innerHTML = l.length
      ? `<ul class="sampah">${l
          .map(
            (k) => `<li><div><b>${esc(k.judul)}</b><span>${tanggalPendek(k.tanggal)} · ${esc(k.kecamatan ? 'Kec. ' + k.kecamatan + ', ' : '')}${esc(k.kabkota)} · ${angka(
              k.peserta || 0,
            )} peserta</span><span class="kapan">Dihapus ${new Date(k.dihapus).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
            <div class="aksi-baris"><button class="btn lembut" data-pul="${k.id}">${IKON.pulih}Pulihkan</button><button class="btn bahaya" data-perm="${k.id}" data-judul="${esc(k.judul)}">Hapus permanen</button></div></li>`,
          )
          .join('')}</ul>`
      : '<p class="kosong-kecil">Sampah kosong.</p>';
  } catch (e: any) {
    box.innerHTML = `<p class="galat">${esc(e.message)}</p>`;
    return;
  }
  box.onclick = async (e) => {
    const t = e.target as HTMLElement;
    const pul = t.closest<HTMLButtonElement>('[data-pul]');
    const perm = t.closest<HTMLButtonElement>('[data-perm]');
    try {
      if (pul) {
        pul.disabled = true;
        await api.pulihkan(pul.dataset.pul!);
        toast('Kegiatan dipulihkan.');
      } else if (perm) {
        if (!confirm(`Hapus permanen "${perm.dataset.judul}"? Setelah ini hanya bisa dikembalikan dari cadangan harian.`)) return;
        perm.disabled = true;
        await api.hapusPermanen(perm.dataset.perm!);
        toast('Dihapus permanen.');
      } else return;
      await segarkanData();
      muatSampah(el);
    } catch (err: any) {
      toast(err.message, 'galat');
      muatSampah(el);
    }
  };
}

async function muatCadangan(el: HTMLElement) {
  const box = $('#kcad .isi', el);
  try {
    const l = await api.daftarCadangan();
    box.innerHTML = l.length
      ? `<ul class="sampah">${l
          .map(
            (c) => `<li><div><b>${tanggalPanjang(c.tanggal)}</b><span>${c.jumlah} kegiatan · dibuat ${new Date(c.dibuat).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })}</span></div><div class="aksi-baris"><button class="btn" data-unduh="${c.tanggal}">${IKON.unduh}Unduh</button></div></li>`,
          )
          .join('')}</ul>`
      : '<p class="kosong-kecil">Belum ada cadangan. Cadangan pertama dibuat otomatis malam ini, atau tekan "Cadangkan sekarang".</p>';
  } catch (e: any) {
    box.innerHTML = `<p class="galat">${esc(e.message)}</p>`;
    return;
  }
  box.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-unduh]');
    if (!b) return;
    b.disabled = true;
    try {
      const c = await api.unduhCadangan(b.dataset.unduh!);
      unduh(`cadangan-edukasi-pepk-${b.dataset.unduh}.json`, JSON.stringify(c, null, 1), 'application/json');
    } catch (err: any) {
      toast(err.message, 'galat');
    }
    b.disabled = false;
  };
}
