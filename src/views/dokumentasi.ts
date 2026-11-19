// Halaman "Dokumentasi": galeri semua foto kegiatan, dikelompokkan per kegiatan.
// Foto ditambah/dihapus/diberi keterangan di halaman detail kegiatan; di sini untuk melihat, mencari, dan mengunduh.
import type { Kegiatan } from '../../shared/schema.js';
import type { FotoMeta } from '../../api/_lib/db.js';
import { SEMUA_WILAYAH } from '../../shared/schema.js';
import { tanggalPanjang } from '../../shared/statistik.js';
import { api } from '../api.js';
import { esc, $, $$, toast } from '../ui.js';
import { IKON } from '../ikon.js';
import { MAKS_FOTO } from './foto.js';

// URL lokal gambar yang sudah diambil, dipakai ulang selama halaman tidak dimuat ulang.
const cache = new Map<string, Promise<string>>();
const urlFoto = (id: string) => {
  if (!cache.has(id)) cache.set(id, api.fotoGambar(id).then((b) => URL.createObjectURL(b)));
  return cache.get(id)!;
};

let cari = '',
  wilayah = '',
  tahun = '';

const namaFile = (judul: string) => judul.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 60) || 'Dokumentasi';

function unduhBlob(nama: string, b: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

type Grup = { k: Kegiatan; foto: FotoMeta[] };

export async function viewDokumentasi(el: HTMLElement) {
  el.innerHTML = `<header class="ph"><div><h1>Dokumentasi</h1><p>Foto semua kegiatan edukasi.</p></div></header>
  <section class="kartu"><div class="memuat besar"><i></i><i></i><i></i></div></section>`;
  let kegiatan: Kegiatan[], foto: FotoMeta[];
  try {
    [kegiatan, foto] = await Promise.all([api.daftar(), api.fotoSemua()]);
  } catch (e: any) {
    $('.kartu', el).innerHTML = `<p class="galat">${esc(e.message)}</p>`;
    return;
  }
  const perKeg = new Map<string, FotoMeta[]>();
  for (const f of foto) perKeg.set(f.kegiatanId, [...(perKeg.get(f.kegiatanId) || []), f]);
  // Hanya kegiatan aktif (foto kegiatan di Sampah tidak ditampilkan).
  const grup: Grup[] = kegiatan
    .filter((k) => perKeg.has(k.id))
    .map((k) => ({ k, foto: perKeg.get(k.id)!.sort((a, b) => a.urutan - b.urutan || a.dibuat.localeCompare(b.dibuat)) }))
    .sort((a, b) => b.k.tanggal.localeCompare(a.k.tanggal));
  const total = grup.reduce((n, g) => n + g.foto.length, 0);
  const daftarTahun = [...new Set(grup.map((g) => g.k.tanggal.slice(0, 4)).filter(Boolean))].sort().reverse();
  const bisaDitambah = kegiatan
    .filter((k) => (perKeg.get(k.id)?.length || 0) < MAKS_FOTO)
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));

  el.innerHTML = `
  <header class="ph"><div><h1>Dokumentasi</h1><p>${total} foto dari ${grup.length} kegiatan. Foto ditambah atau dihapus di halaman kegiatannya.</p></div>
    <div class="kontrol"><select id="tambahKe" class="dk-tambah" aria-label="Tambah foto ke kegiatan"><option value="">+ Tambah foto ke kegiatan…</option>${bisaDitambah
      .map((k) => `<option value="${esc(k.id)}">${esc(k.tanggal ? tanggalPanjang(k.tanggal) + ' — ' : '')}${esc(k.judul.slice(0, 70))}</option>`)
      .join('')}</select></div></header>
  ${
    grup.length
      ? `<div class="saring">
    <input type="search" id="cari" placeholder="Cari judul kegiatan, tempat, atau keterangan foto…" value="${esc(cari)}">
    <select id="wil"><option value="">Semua wilayah</option>${SEMUA_WILAYAH.map((w) => `<option${w === wilayah ? ' selected' : ''}>${w}</option>`).join('')}</select>
    <select id="thn"><option value="">Semua tahun</option>${daftarTahun.map((t) => `<option${t === tahun ? ' selected' : ''}>${t}</option>`).join('')}</select>
  </div>
  <div id="galeri"></div>`
      : `<section class="kartu kosong"><span class="kosong-ikon">${IKON.foto}</span><h2>Belum ada foto</h2><p>Pilih kegiatan di atas, lalu tambahkan foto di kartu Foto dokumentasi pada halaman kegiatannya.</p></section>`
  }`;

  $<HTMLSelectElement>('#tambahKe', el).onchange = (e) => {
    const v = (e.target as HTMLSelectElement).value;
    if (v) location.hash = '#/kegiatan/' + v;
  };
  if (!grup.length) return;

  const galeri = $('#galeri', el);
  let tampil: Grup[] = [];
  const amati = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        const img = e.target as HTMLImageElement;
        amati.unobserve(img);
        urlFoto(img.dataset.id!)
          .then((u) => {
            img.src = u;
            img.closest('.dk-foto')?.classList.add('siap');
          })
          .catch(() => img.closest('.dk-foto')?.classList.add('gagal'));
      }
    },
    { rootMargin: '300px' },
  );

  const gambar = () => {
    const q = cari.trim().toLowerCase();
    tampil = grup
      .filter((g) => (!wilayah || g.k.kabkota === wilayah) && (!tahun || g.k.tanggal.startsWith(tahun)))
      .map((g) => {
        if (!q) return g;
        const cocokKeg = `${g.k.judul} ${g.k.tempat}`.toLowerCase().includes(q);
        return cocokKeg ? g : { ...g, foto: g.foto.filter((f) => f.ket.toLowerCase().includes(q)) };
      })
      .filter((g) => g.foto.length);
    amati.disconnect();
    if (!tampil.length) {
      galeri.innerHTML = `<section class="kartu"><p class="kosong-kecil">Tidak ada foto yang cocok dengan pencarian ini.</p></section>`;
      return;
    }
    galeri.innerHTML = tampil
      .map(
        (g, gi) => `<section class="kartu dk-grup">
      <div class="dk-kepala"><div><h2><a href="#/kegiatan/${esc(g.k.id)}">${esc(g.k.judul)}</a></h2>
        <p class="sub">${[g.k.tanggal ? tanggalPanjang(g.k.tanggal) : '', g.k.kabkota, `${g.foto.length} foto`].filter(Boolean).map(esc).join(' · ')}</p></div>
        <div class="dk-aksi"><button class="btn" data-zip="${gi}">${IKON.unduh}Unduh semua</button><a class="btn lembut" href="#/kegiatan/${esc(g.k.id)}">Kelola foto</a></div></div>
      <div class="dk-grid">${g.foto
        .map(
          (f, fi) =>
            `<figure class="dk-foto"><button type="button" data-buka="${gi}:${fi}" aria-label="Buka Gambar ${fi + 1}${f.ket ? ': ' + esc(f.ket) : ''}"><img data-id="${esc(f.id)}" alt=""></button><figcaption><b>Gambar ${fi + 1}</b>${
              f.ket ? '. ' + esc(f.ket) : ''
            }</figcaption></figure>`,
        )
        .join('')}</div></section>`,
      )
      .join('');
    $$<HTMLImageElement>('img[data-id]', galeri).forEach((i) => amati.observe(i));
  };
  gambar();

  let tunda = 0;
  $<HTMLInputElement>('#cari', el).oninput = (e) => {
    cari = (e.target as HTMLInputElement).value;
    clearTimeout(tunda);
    tunda = window.setTimeout(gambar, 200);
  };
  $<HTMLSelectElement>('#wil', el).onchange = (e) => {
    wilayah = (e.target as HTMLSelectElement).value;
    gambar();
  };
  $<HTMLSelectElement>('#thn', el).onchange = (e) => {
    tahun = (e.target as HTMLSelectElement).value;
    gambar();
  };

  galeri.onclick = async (e) => {
    const t = e.target as HTMLElement;
    const buka = t.closest<HTMLElement>('[data-buka]');
    if (buka) {
      const [gi, fi] = buka.dataset.buka!.split(':').map(Number);
      return lihat(tampil[gi], fi);
    }
    const zipBtn = t.closest<HTMLButtonElement>('[data-zip]');
    if (zipBtn) {
      const g = tampil[Number(zipBtn.dataset.zip)];
      zipBtn.disabled = true;
      try {
        const { default: PizZip } = await import('pizzip');
        const zip = new PizZip();
        for (let i = 0; i < g.foto.length; i++) {
          const b = await fetch(await urlFoto(g.foto[i].id)).then((r) => r.arrayBuffer());
          zip.file(`Gambar_${i + 1}${g.foto[i].ket ? '_' + namaFile(g.foto[i].ket).slice(0, 40) : ''}.jpg`, new Uint8Array(b));
        }
        unduhBlob(`Dokumentasi_${namaFile(g.k.judul)}.zip`, zip.generate({ type: 'blob' }));
      } catch (er: any) {
        toast(er.message || 'Foto gagal diunduh.', 'galat');
      } finally {
        zipBtn.disabled = false;
      }
    }
  };
}

// Tampilan foto besar: panah kiri/kanan untuk berpindah, Esc untuk menutup.
function lihat(g: Grup, mulai: number) {
  let i = mulai;
  const d = document.createElement('dialog');
  d.className = 'dk-lihat';
  d.innerHTML = `<div class="dkl-atas"><div><b class="dkl-no"></b><span class="dkl-ket"></span><small>${esc(g.k.judul)}</small></div>
    <div class="dkl-aksi"><button class="btn kaca" data-unduh>${IKON.unduh}Unduh</button><button class="btn kaca dkl-tutup" aria-label="Tutup">×</button></div></div>
    <div class="dkl-bidang"><button class="dkl-panah kiri" aria-label="Foto sebelumnya">‹</button><img alt=""><button class="dkl-panah kanan" aria-label="Foto berikutnya">›</button></div>`;
  document.body.appendChild(d);
  const img = $<HTMLImageElement>('img', d);
  const isi = async () => {
    const f = g.foto[i];
    $('.dkl-no', d).textContent = `Gambar ${i + 1} dari ${g.foto.length}`;
    $('.dkl-ket', d).textContent = f.ket ? ' · ' + f.ket : '';
    $<HTMLButtonElement>('.kiri', d).hidden = i === 0;
    $<HTMLButtonElement>('.kanan', d).hidden = i === g.foto.length - 1;
    img.removeAttribute('src');
    img.alt = `Gambar ${i + 1}${f.ket ? ': ' + f.ket : ''}`;
    const u = await urlFoto(f.id);
    if (g.foto[i] === f) img.src = u;
  };
  const geser = (n: number) => {
    const j = i + n;
    if (j < 0 || j >= g.foto.length) return;
    i = j;
    isi();
  };
  d.onclick = async (e) => {
    const t = e.target as HTMLElement;
    if (t === d || t.closest('.dkl-tutup')) d.close();
    else if (t.closest('.kiri')) geser(-1);
    else if (t.closest('.kanan')) geser(1);
    else if (t.closest('[data-unduh]')) {
      const f = g.foto[i];
      const b = await fetch(await urlFoto(f.id)).then((r) => r.blob());
      unduhBlob(`${namaFile(g.k.judul)}_Gambar_${i + 1}.jpg`, b);
    }
  };
  d.onkeydown = (e) => {
    if (e.key === 'ArrowLeft') geser(-1);
    if (e.key === 'ArrowRight') geser(1);
  };
  d.onclose = () => d.remove();
  isi();
  d.showModal();
}
