// Halaman "Input data": isi formulir manual, unggah file laporan (AI membaca → tim cek), atau impor rekap Excel.
// Setiap formulir punya bagian Laporan Word sehingga .docx bisa langsung diunduh setelah disimpan.
import { api, nama } from '../api.js';
import { periksa, type KegiatanInput } from '../../shared/schema.js';
import { esc, $, toast } from '../ui.js';
import { formHtml, bacaForm, tampilGalat, pasangForm } from './form.js';
import { kartuLaporanWord, pasangLaporanWord, naskahDiLayar } from './laporan-word.js';
import { kartuFoto, pasangFoto, unggahFoto, type Foto } from './foto.js';
import { IKON } from '../ikon.js';
import { segarkanData } from '../data.js';
import { siapkan } from '../baca-file.js';

type Item = { id: number; nama: string; status: 'baca' | 'cek' | 'gagal' | 'tersimpan'; isian?: KegiatanInput; galat?: string; buka?: boolean; foto?: Foto[] };
let antrean: Item[] = [];
let nomor = 0;

const TERIMA = '.pdf,.docx,.jpg,.jpeg,.png,.webp';

export function viewUnggah(el: HTMLElement) {
  el.innerHTML = `
  <header class="ph"><div><h1>Input data</h1><p>Tambahkan kegiatan edukasi dengan salah satu cara berikut.</p></div></header>
  <div class="cara">
    <button type="button" class="cara-k" id="manual"><span class="cara-ikon">${IKON.pena}</span><b>Isi formulir</b><span>Ketik data kegiatan secara langsung. Laporan Word bisa langsung diunduh.</span></button>
    <label class="cara-k" id="drop"><input type="file" id="file" accept="${TERIMA}" multiple><span class="cara-ikon">${IKON.unggah}</span><b>Dari file laporan</b><span>PDF, Word, atau foto laporan. AI mengisi formulir untuk kamu periksa. File tidak disimpan.</span></label>
    <a class="cara-k" href="#/impor"><span class="cara-ikon">${IKON.daftar}</span><b>Impor rekap Excel</b><span>Banyak kegiatan sekaligus dari file rekap .xlsx atau .csv.</span></a>
  </div>
  <div id="antrean"></div>`;
  $('#manual', el).onclick = () => {
    antrean.unshift({ id: ++nomor, nama: '', status: 'cek', isian: kosong('') });
    gambar();
    $('#antrean .item')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const input = $<HTMLInputElement>('#file', el);
  input.addEventListener('change', () => {
    tambah([...(input.files || [])]);
    input.value = '';
  });
  const drop = $('#drop', el);
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('aktif');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('aktif'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('aktif');
    tambah([...(e.dataTransfer?.files || [])]);
  });
  gambar();
}

function gambar() {
  const box = $('#antrean');
  if (!box) return;
  // Simpan dulu isian yang sedang diketik supaya tidak hilang saat daftar digambar ulang.
  box.querySelectorAll<HTMLElement>('.item').forEach((elItem) => {
    const it = antrean.find((x) => String(x.id) === elItem.dataset.id);
    const form = elItem.querySelector('form');
    if (it && it.status === 'cek' && form && it.isian) {
      it.isian = { ...bacaForm(form, it.isian), naskah: naskahDiLayar(elItem) ?? it.isian.naskah };
      it.buka = !!elItem.querySelector<HTMLDetailsElement>('details.lw')?.open;
    }
  });
  antrean = antrean.filter((x) => x.status !== 'tersimpan');
  box.innerHTML = antrean
    .map((x) => {
      const head = `<div class="kartu-head"><div class="fn">${IKON.file}<span class="fnama">${esc(x.nama || 'Kegiatan baru')}</span>${
        x.status === 'baca' ? '<span class="pill">AI sedang membaca…</span>' : x.status === 'gagal' ? '<span class="pill merah">Gagal dibaca</span>' : x.nama ? '<span class="pill">Cek hasil AI</span>' : '<span class="pill">Isi manual</span>'
      }</div><button class="teks" data-buang="${x.id}">Buang</button></div>`;
      if (x.status === 'baca') return `<section class="kartu item" data-id="${x.id}">${head}<div class="memuat"><i></i><i></i><i></i></div></section>`;
      if (x.status === 'gagal')
        return `<section class="kartu item" data-id="${x.id}">${head}<p class="galat">${esc(x.galat)}</p><div class="aksi"><button class="btn" data-isi="${x.id}">Isi manual</button></div></section>`;
      const lw = kartuFoto((x.foto ||= [])) + kartuLaporanWord(x.isian!.naskah, x.isian!.tanggal, { lipat: true });
      return `<section class="kartu item" data-id="${x.id}">${head}${formHtml(x.isian!, { tandaiAi: !!x.nama })}${x.buka ? lw.replace('<details class="lw lw-lipat"', '<details class="lw lw-lipat" open') : lw}<div class="aksi"><button class="btn" data-simpan="${x.id}">Simpan kegiatan</button><button type="button" class="btn utama lw-unduh">${IKON.unduh}Simpan & unduh .docx</button></div></section>`;
    })
    .join('');
  box.querySelectorAll<HTMLFormElement>('form').forEach(pasangForm);
  box.querySelectorAll<HTMLElement>('.item').forEach((elItem) => {
    const it = antrean.find((x) => String(x.id) === elItem.dataset.id);
    const kartu = elItem.querySelector<HTMLElement>('.lw');
    const form = elItem.querySelector('form');
    if (!it || !kartu || !form) return;
    pasangLaporanWord(
      kartu,
      form,
      () => it.isian!,
      async (isian) => {
        const k = await api.simpan(isian);
        it.status = 'tersimpan';
        await simpanFotoBaru(it, k.id, isian.judul);
        await segarkanData();
        setTimeout(gambar, 1500);
      },
      { kecamatanWajib: true, foto: (it.foto ||= []) },
    );
    const fb = elItem.querySelector<HTMLElement>('[data-foto-blok]');
    if (fb) pasangFoto(fb, (it.foto ||= []));
  });
  box.onclick = async (e) => {
    const t = e.target as HTMLElement;
    const buang = t.closest<HTMLElement>('[data-buang]')?.dataset.buang;
    const simpan = t.closest<HTMLElement>('[data-simpan]')?.dataset.simpan;
    const isi = t.closest<HTMLElement>('[data-isi]')?.dataset.isi;
    if (buang) {
      antrean = antrean.filter((x) => String(x.id) !== buang);
      gambar();
    }
    if (isi) {
      const it = antrean.find((x) => String(x.id) === isi)!;
      it.status = 'cek';
      it.isian = kosong(it.nama);
      gambar();
    }
    if (simpan) await simpanItem(+simpan, t as HTMLButtonElement);
  };
}

function kosong(namaFile: string): KegiatanInput {
  return {
    judul: '', tema: '', pengundang: '', peranOjk: '', tanggal: '', tanggalSelesai: '', bentuk: '', jenis: '', tempat: '', kabkota: '', kabkotaDitebak: false, kecamatan: '', kecamatanDitebak: false, mode: '', narasumber: [],
    sasaran: [], sasaranDetail: '', peserta: null, pesertaPerkiraan: false, topik: [], topikUtama: '', kanal: [], metode: [], ringkasan: '', catatan: '', jamMulai: '', jamSelesai: '', naskah: null, sumberFile: namaFile, dicatatOleh: nama.get(),
  };
}

// Setelah kegiatan baru tersimpan, unggah fotonya. Kegiatan tetap tersimpan walau foto gagal.
async function simpanFotoBaru(it: Item, kegiatanId: string, judul: string) {
  const n = it.foto?.length || 0;
  try {
    if (n) await unggahFoto(it.foto!, kegiatanId);
    toast(`Tersimpan: ${judul}${n ? ` (dengan ${n} foto)` : ''}`);
  } catch (e: any) {
    const gagal = it.foto!.filter((f) => !f.serverId).length;
    toast(`Kegiatan tersimpan, tetapi ${gagal} foto gagal diunggah (${e.message}). Tambahkan lewat halaman kegiatan.`, 'galat');
  }
}

async function simpanItem(id: number, btn: HTMLButtonElement) {
  const it = antrean.find((x) => x.id === id);
  const form = $<HTMLFormElement>(`.item[data-id="${id}"] form`);
  if (!it || !form) return;
  const isian = { ...bacaForm(form, it.isian!), naskah: naskahDiLayar(form.closest<HTMLElement>('.item')!) };
  const salah = periksa(isian);
  tampilGalat(form, salah);
  if (salah.length) return;
  btn.disabled = true;
  btn.textContent = 'Menyimpan…';
  try {
    const k = await api.simpan(isian);
    it.status = 'tersimpan';
    await simpanFotoBaru(it, k.id, isian.judul);
    await segarkanData();
    gambar();
  } catch (e: any) {
    tampilGalat(form, [e.message]);
    btn.disabled = false;
    btn.textContent = 'Simpan kegiatan';
  }
}

function tambah(files: File[]) {
  for (const f of files) {
    const it: Item = { id: ++nomor, nama: f.name, status: 'baca' };
    antrean.push(it);
    baca(f)
      .then((body) => api.ekstrak(body))
      .then((r) => {
        it.status = 'cek';
        it.isian = { ...r.isian, dicatatOleh: r.isian.dicatatOleh || nama.get() };
      })
      .catch((e) => {
        it.status = 'gagal';
        it.galat = e.message || String(e);
      })
      .finally(gambar);
  }
  gambar();
}

async function baca(f: File) {
  return siapkan(f);
}
