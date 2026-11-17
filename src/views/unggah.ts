// Halaman "Unggah laporan": pilih satu atau beberapa file → AI membaca → tim cek → simpan.
import { api } from '../api.js';
import { periksa, type KegiatanInput } from '../../shared/schema.js';
import { esc, $, toast } from '../ui.js';
import { formHtml, bacaForm, tampilGalat } from './form.js';
import { segarkanData } from '../data.js';

type Item = { id: number; nama: string; status: 'baca' | 'cek' | 'gagal' | 'tersimpan'; isian?: KegiatanInput; galat?: string };
let antrean: Item[] = [];
let nomor = 0;

const TERIMA = '.pdf,.docx,.jpg,.jpeg,.png,.webp';

export function viewUnggah(el: HTMLElement) {
  el.innerHTML = `
  <header class="judul-hal"><h1>Unggah laporan</h1>
    <p>AI membaca laporan dan mengisi data kegiatan. Kamu cukup mengecek, memperbaiki bila perlu, lalu menyimpan. File laporannya sendiri tidak disimpan.</p></header>
  <label class="drop" id="drop">
    <input type="file" id="file" accept="${TERIMA}" multiple>
    <strong>Pilih file laporan</strong>
    <span>atau tarik ke sini · PDF, Word (.docx), atau foto · maksimal 4 MB per file</span>
  </label>
  <div id="antrean"></div>`;
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
      const head = `<div class="kartu-head"><div><span class="fnama">${esc(x.nama)}</span>${
        x.status === 'baca' ? '<span class="pill">AI sedang membaca…</span>' : x.status === 'gagal' ? '<span class="pill merah">Gagal dibaca</span>' : '<span class="pill">Cek hasil AI</span>'
      }</div><button class="teks" data-buang="${x.id}">Buang</button></div>`;
      if (x.status === 'baca') return `<section class="kartu item" data-id="${x.id}">${head}<div class="memuat"><i></i><i></i><i></i></div></section>`;
      if (x.status === 'gagal')
        return `<section class="kartu item" data-id="${x.id}">${head}<p class="galat">${esc(x.galat)}</p><div class="aksi"><button class="btn" data-isi="${x.id}">Isi manual</button></div></section>`;
      return `<section class="kartu item" data-id="${x.id}">${head}${formHtml(x.isian!, { tandaiAi: true })}<div class="aksi"><button class="btn utama" data-simpan="${x.id}">Simpan kegiatan</button></div></section>`;
    })
    .join('');
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
    judul: '', tema: '', pengundang: '', peranOjk: '', tanggal: '', tempat: '', kabkota: '', kabkotaDitebak: false, mode: '', narasumber: [],
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

async function baca(f: File): Promise<{ nama: string; mime?: string; data?: string; teks?: string }> {
  const ext = f.name.toLowerCase().split('.').pop() || '';
  if (f.size > 4 * 1024 * 1024 && ext !== 'docx') throw new Error('File lebih dari 4 MB. Perkecil atau ekspor ulang PDF-nya.');
  if (ext === 'docx') {
    const mammoth: any = await import('mammoth');
    const r = await (mammoth.default || mammoth).extractRawText({ arrayBuffer: await f.arrayBuffer() });
    if (!r.value.trim()) throw new Error('Dokumen Word ini kosong atau tidak terbaca.');
    return { nama: f.name, teks: r.value };
  }
  const mime = f.type || (ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
  if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(mime)) throw new Error('Format belum didukung. Gunakan PDF, Word (.docx), JPG, atau PNG.');
  const data = await new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => no(new Error('File tidak bisa dibaca.'));
    r.readAsDataURL(f);
  });
  return { nama: f.name, mime, data };
}
