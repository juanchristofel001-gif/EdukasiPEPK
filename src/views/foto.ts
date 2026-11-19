// Foto dokumentasi kegiatan: tampil di halaman kegiatan dan di formulir Input data, disimpan di server
// (bisa dibuka hanya dengan kode akses), dan dipakai sebagai halaman 2 laporan Word.
import { api } from '../api.js';
import { esc, $ } from '../ui.js';
import { IKON } from '../ikon.js';

export type Foto = { id: number; serverId?: string; blob: Blob; url: string; w: number; h: number; ket: string };
export const MAKS_FOTO = 8;
let nomor = 0;

// Perkecil foto (sisi terpanjang 1600 px, JPEG) supaya ringan; orientasi kamera diikuti.
// Dicoba lagi lebih kecil bila masih > ~700 KB (batas penyimpanan per foto).
export async function siapkanFoto(f: File): Promise<Foto> {
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  let sisi = 1600,
    mutu = 0.85,
    hasil: { blob: Blob; w: number; h: number } | null = null;
  for (let coba = 0; coba < 4; coba++) {
    const s = Math.min(1, sisi / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * s),
      h = Math.round(bmp.height * s);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob>((ok, gagal) => c.toBlob((b) => (b ? ok(b) : gagal(new Error('Foto tidak bisa diproses.'))), 'image/jpeg', mutu));
    hasil = { blob, w, h };
    if (blob.size <= 700_000) break;
    sisi = Math.round(sisi * 0.8);
    mutu = Math.max(0.6, mutu - 0.08);
  }
  bmp.close?.();
  return { id: ++nomor, blob: hasil!.blob, url: URL.createObjectURL(hasil!.blob), w: hasil!.w, h: hasil!.h, ket: '' };
}

const keBase64 = (b: Blob) =>
  new Promise<string>((ok, gagal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => gagal(new Error('Foto tidak bisa dibaca.'));
    r.readAsDataURL(b);
  });

// Unggah foto yang belum tersimpan (dipakai setelah kegiatan baru disimpan).
export async function unggahFoto(foto: Foto[], kegiatanId: string) {
  for (const f of foto) {
    if (f.serverId) continue;
    const m = await api.fotoUnggah({ kegiatanId, data: await keBase64(f.blob), w: f.w, h: f.h, ket: f.ket });
    f.serverId = m.id;
  }
}

// Muat foto tersimpan untuk satu kegiatan.
export async function muatFoto(kegiatanId: string): Promise<Foto[]> {
  const daftar = await api.fotoDaftar(kegiatanId);
  return Promise.all(
    daftar.map(async (m) => {
      const blob = await api.fotoGambar(m.id);
      return { id: ++nomor, serverId: m.id, blob, url: URL.createObjectURL(blob), w: m.w, h: m.h, ket: m.ket };
    }),
  );
}

const isiGrid = (foto: Foto[]) =>
  foto
    .map(
      (f, i) =>
        `<figure class="lwf" data-foto="${f.id}"><img src="${f.url}" alt="Foto dokumentasi ${i + 1}"><button type="button" class="lwf-hapus" aria-label="Hapus foto ${i + 1}">×</button><input class="lwf-ket" value="${esc(f.ket)}" placeholder="Keterangan (opsional)" maxlength="120"></figure>`,
    )
    .join('') +
  (foto.length < MAKS_FOTO ? `<label class="lwf-tambah"><input type="file" accept="image/*" multiple class="lwf-file"><span>+</span>Tambah foto</label>` : '');

// kartu: true = kartu tersendiri (halaman kegiatan); false = blok di dalam kartu formulir.
export function kartuFoto(foto: Foto[], opt: { kartu?: boolean; memuat?: boolean } = {}) {
  const isi = `<div class="lwf-kepala"><span>${IKON.foto}Foto dokumentasi</span><small>Maks. ${MAKS_FOTO} foto. Tersimpan bersama kegiatan dan menjadi halaman 2 laporan Word.</small></div>
    <p class="lwf-status" hidden></p>
    <div class="lwf-grid">${opt.memuat ? '<div class="memuat"><i></i><i></i><i></i></div>' : isiGrid(foto)}</div>`;
  return opt.kartu ? `<section class="kartu lw-foto-kartu" data-foto-blok>${isi}</section>` : `<div class="lw-foto" data-foto-blok>${isi}</div>`;
}

// kegiatanId: diisi untuk kegiatan yang sudah tersimpan → setiap perubahan langsung disimpan.
export function pasangFoto(blok: HTMLElement, foto: Foto[], opt: { kegiatanId?: string } = {}) {
  const grid = $('.lwf-grid', blok);
  const status = $('.lwf-status', blok);
  const tampil = (t: string, galat = false) => {
    status.hidden = !t;
    status.textContent = t;
    status.classList.toggle('galat', galat);
  };
  const gambar = () => (grid.innerHTML = isiGrid(foto));
  gambar();
  const tunggu: Record<number, number> = {};

  grid.addEventListener('change', async (e) => {
    const inp = e.target as HTMLInputElement;
    if (!inp.classList.contains('lwf-file') || !inp.files?.length) return;
    const files = [...inp.files].slice(0, MAKS_FOTO - foto.length);
    grid.classList.add('memproses');
    tampil(opt.kegiatanId ? 'Mengunggah foto…' : 'Menyiapkan foto…');
    let gagal = 0;
    for (const f of files) {
      try {
        const x = await siapkanFoto(f);
        if (opt.kegiatanId) await unggahFoto([x], opt.kegiatanId);
        foto.push(x);
      } catch (err: any) {
        gagal++;
        tampil(`Foto "${f.name}" gagal ditambahkan: ${err?.message || 'format tidak didukung (pakai JPG atau PNG)'}.`, true);
      }
    }
    grid.classList.remove('memproses');
    if (!gagal) tampil(inp.files.length > files.length ? `Maksimal ${MAKS_FOTO} foto; sebagian foto tidak ditambahkan.` : opt.kegiatanId ? 'Foto tersimpan.' : '', inp.files.length > files.length);
    gambar();
  });

  grid.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('.lwf-hapus');
    if (!b) return;
    const id = +b.closest<HTMLElement>('.lwf')!.dataset.foto!;
    const i = foto.findIndex((f) => f.id === id);
    if (i < 0) return;
    const f = foto[i];
    if (f.serverId) {
      if (!confirm('Hapus foto ini dari kegiatan?')) return;
      try {
        await api.fotoHapus(f.serverId);
      } catch (err: any) {
        return tampil('Gagal menghapus foto: ' + err.message, true);
      }
    }
    foto.splice(i, 1);
    URL.revokeObjectURL(f.url);
    tampil('');
    gambar();
  });

  grid.addEventListener('input', (e) => {
    const inp = e.target as HTMLInputElement;
    if (!inp.classList.contains('lwf-ket')) return;
    const f = foto.find((x) => x.id === +inp.closest<HTMLElement>('.lwf')!.dataset.foto!);
    if (!f) return;
    f.ket = inp.value;
    if (!f.serverId) return;
    clearTimeout(tunggu[f.id]);
    tunggu[f.id] = window.setTimeout(() => api.fotoUbah(f.serverId!, { ket: f.ket }).catch((err) => tampil('Keterangan belum tersimpan: ' + err.message, true)), 700);
  });

  return { gambar, tampil };
}
