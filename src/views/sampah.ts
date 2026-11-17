// Halaman "Sampah & cadangan": memulihkan kegiatan yang terhapus dan mengunduh cadangan harian.
import { tanggalPanjang, tanggalPendek, angka } from '../../shared/statistik.js';
import { api } from '../api.js';
import { segarkanData } from '../data.js';
import { esc, $, toast, unduh } from '../ui.js';
import { IKON } from '../ikon.js';
import { csv } from './daftar.js';

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
            (c) => `<li><div><b>${/^\d{4}-\d{2}-\d{2}$/.test(c.tanggal) ? tanggalPanjang(c.tanggal) : esc(tanggalPanjang(c.tanggal.slice(0, 10)) + c.tanggal.slice(10))}</b><span>${c.jumlah} kegiatan · dibuat ${new Date(c.dibuat).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit',
            })}</span></div><div class="aksi-baris"><button class="btn" data-unduh="${esc(c.tanggal)}">${IKON.unduh}Unduh Excel</button><button class="btn lembut" data-pulih="${esc(c.tanggal)}">${IKON.pulih}Pulihkan ke versi ini</button></div></li>`,
          )
          .join('')}</ul>`
      : '<p class="kosong-kecil">Belum ada cadangan. Cadangan pertama dibuat otomatis malam ini, atau tekan "Cadangkan sekarang".</p>';
  } catch (e: any) {
    box.innerHTML = `<p class="galat">${esc(e.message)}</p>`;
    return;
  }
  box.onclick = async (e) => {
    const t = e.target as HTMLElement;
    const u = t.closest<HTMLButtonElement>('[data-unduh]');
    const p = t.closest<HTMLButtonElement>('[data-pulih]');
    if (u) {
      u.disabled = true;
      try {
        const c = await api.unduhCadangan(u.dataset.unduh!);
        unduh(`cadangan-edukasi-pepk-${u.dataset.unduh!.replace(/[^\w-]+/g, '-')}.csv`, csv(c.kegiatan, true));
      } catch (err: any) {
        toast(err.message, 'galat');
      }
      u.disabled = false;
    }
    if (p) {
      const tgl = p.dataset.pulih!;
      if (!confirm(`Kembalikan data ke cadangan ${tgl}?\n\nPerubahan setelah tanggal itu akan ditimpa. Kegiatan yang dibuat setelahnya tidak dihapus, hanya dipindah ke sampah. Kondisi sekarang dicadangkan dulu, jadi pemulihan ini juga bisa dibatalkan.`)) return;
      p.disabled = true;
      p.textContent = 'Memulihkan…';
      try {
        const r = await api.pulihkanCadangan(tgl);
        await segarkanData();
        toast(`Data dipulihkan (${r.dipulihkan} kegiatan${r.disampahkan ? `, ${r.disampahkan} kegiatan baru dipindah ke sampah` : ''}).`);
      } catch (err: any) {
        toast(err.message, 'galat');
      }
      muatSampah(el);
      muatCadangan(el);
    }
  };
}
