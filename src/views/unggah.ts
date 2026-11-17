// Halaman "Unggah laporan": pilih satu atau beberapa file → AI membaca → tim cek → simpan.
import { api } from '../api.js';
import { periksa, type KegiatanInput } from '../../shared/schema.js';
import { esc, $, toast } from '../ui.js';
import { formHtml, bacaForm, tampilGalat, pasangForm } from './form.js';
import { IKON } from '../ikon.js';
import { segarkanData } from '../data.js';
import { siapkan } from '../baca-file.js';

type Item = { id: number; nama: string; status: 'baca' | 'cek' | 'gagal' | 'tersimpan'; isian?: KegiatanInput; galat?: string };
let antrean: Item[] = [];
let nomor = 0;

const TERIMA = '.pdf,.docx,.jpg,.jpeg,.png,.webp';

export function viewUnggah(el: HTMLElement) {
  el.innerHTML = `
  <header class="ph"><h1>Unggah laporan</h1>
    <p>AI membaca laporan dan mengisi data kegiatan. Kamu cukup mengecek, memperbaiki bila perlu, lalu menyimpan. File laporannya sendiri tidak disimpan.</p></header>
  <label class="drop" id="drop">
    <input type="file" id="file" accept="${TERIMA}" multiple>
    <span class="drop-ikon">${IKON.unggah}</span>
    <strong>Pilih file laporan</strong>
    <span>atau tarik ke sini · PDF, Word (.docx), atau foto · foto dokumentasi di dalamnya tidak masalah</span>
  </label>
  <div class="manual"><span>Tidak ada laporannya?</span><button class="btn lembut" id="manual">${IKON.daftar}Isi manual tanpa laporan</button></div>
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
  antrean = antrean.filter((x) => x.status !== 'tersimpan');
  box.innerHTML = antrean
    .map((x) => {
      const head = `<div class="kartu-head"><div class="fn">${IKON.file}<span class="fnama">${esc(x.nama || 'Kegiatan baru')}</span>${
        x.status === 'baca' ? '<span class="pill">AI sedang membaca…</span>' : x.status === 'gagal' ? '<span class="pill merah">Gagal dibaca</span>' : x.nama ? '<span class="pill">Cek hasil AI</span>' : '<span class="pill">Isi manual</span>'
      }</div><button class="teks" data-buang="${x.id}">Buang</button></div>`;
      if (x.status === 'baca') return `<section class="kartu item" data-id="${x.id}">${head}<div class="memuat"><i></i><i></i><i></i></div></section>`;
      if (x.status === 'gagal')
        return `<section class="kartu item" data-id="${x.id}">${head}<p class="galat">${esc(x.galat)}</p><div class="aksi"><button class="btn" data-isi="${x.id}">Isi manual</button></div></section>`;
      return `<section class="kartu item" data-id="${x.id}">${head}${formHtml(x.isian!, { tandaiAi: !!x.nama })}<div class="aksi"><button class="btn utama" data-simpan="${x.id}">Simpan kegiatan</button></div></section>`;
    })
    .join('');
  box.querySelectorAll<HTMLFormElement>('form').forEach(pasangForm);
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

function kosong(nama: string): KegiatanInput {
  return {
    judul: '', tema: '', pengundang: '', peranOjk: '', tanggal: '', tempat: '', kabkota: '', kabkotaDitebak: false, kecamatan: '', kecamatanDitebak: false, mode: '', narasumber: [],
    sasaran: [], sasaranDetail: '', peserta: null, pesertaPerkiraan: false, topik: [], kanal: [], metode: [], ringkasan: '', catatan: '', sumberFile: nama, dicatatOleh: '',
  };
}

async function simpanItem(id: number, btn: HTMLButtonElement) {
  const it = antrean.find((x) => x.id === id);
  const form = $<HTMLFormElement>(`.item[data-id="${id}"] form`);
  if (!it || !form) return;
  const isian = bacaForm(form, it.isian!);
  const salah = periksa(isian);
  tampilGalat(form, salah);
  if (salah.length) return;
  btn.disabled = true;
  btn.textContent = 'Menyimpan…';
  try {
    await api.simpan(isian);
    it.status = 'tersimpan';
    toast(`Tersimpan: ${isian.judul}`);
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
        it.isian = r.isian;
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
