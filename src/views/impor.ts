// Halaman "Impor Excel": unggah rekap Excel/CSV → cocokkan kolom → pratinjau & perbaiki → simpan sekaligus.
import { KABKOTA, periksa, perluKecamatan, type KegiatanInput } from '../../shared/schema.js';
import { KOLOM_TUJUAN, tebakKolom, cariBarisJudul, barisKeIsian, kunciGanda, type Kolom, type Baris } from '../../shared/impor.js';
import { tanggalPendek, angka } from '../../shared/statistik.js';
import { api, nama } from '../api.js';
import { dataKegiatan, segarkanData } from '../data.js';
import { esc, $, $$, toast } from '../ui.js';
import { IKON } from '../ikon.js';
import { formHtml, bacaForm, tampilGalat, pasangForm } from './form.js';

type Lembar = { nama: string; data: unknown[][] };
type Status = 'siap' | 'cek' | 'kurang' | 'ganda';
type Item = Baris & { status: Status; simpan: boolean; ganda?: string; diisiAi: string[]; buka?: boolean };

let file = '';
let lembar: Lembar[] = [];
let pilihLembar = 0;
let barisJudul = 0;
let peta: Kolom[] = [];
let tahun = new Date().getFullYear();
let tahap: 'pilih' | 'kolom' | 'pratinjau' = 'pilih';
let item: Item[] = [];
let saring: Status | 'semua' = 'semua';

export function viewImpor(el: HTMLElement) {
  if (tahap === 'pilih') return pilih(el);
  if (tahap === 'kolom') return kolom(el);
  return pratinjau(el);
}

const kepala = (sub: string) => `<a class="teks kembali" href="#/unggah">← Unggah laporan</a>
  <header class="ph"><div><h1>Impor dari Excel</h1><p>${sub}</p></div>${tahap !== 'pilih' ? `<div class="kontrol"><button class="btn" id="ulang">Ganti file</button></div>` : ''}</header>
  <ol class="langkah"><li class="${tahap === 'pilih' ? 'on' : 'ok'}">Pilih file</li><li class="${tahap === 'kolom' ? 'on' : tahap === 'pratinjau' ? 'ok' : ''}">Cocokkan kolom</li><li class="${tahap === 'pratinjau' ? 'on' : ''}">Periksa & simpan</li></ol>`;

function pasangUlang(el: HTMLElement) {
  const b = $('#ulang', el);
  if (b)
    b.onclick = () => {
      if (tahap === 'pratinjau' && !confirm('Mulai lagi dengan file lain? Perbaikan yang belum disimpan akan hilang.')) return;
      tahap = 'pilih';
      item = [];
      viewImpor(el);
    };
}

// ---------- 1. pilih file ----------
function pilih(el: HTMLElement) {
  el.innerHTML = `${kepala('Masukkan banyak kegiatan sekaligus dari rekap Excel atau CSV, misalnya data kegiatan bulan-bulan sebelumnya.')}
  <label class="drop" id="drop"><input type="file" id="fx" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
    <span class="drop-ikon">${IKON.daftar}</span><strong>Pilih file Excel atau CSV</strong><span>.xlsx atau .csv · satu baris = satu kegiatan · baris judul kolom boleh di mana saja di 10 baris pertama</span></label>
  <p class="galat" hidden></p>
  <section class="kartu"><h2>Tips supaya hasilnya rapi</h2><ul class="tips">
    <li>Satu baris untuk satu kegiatan. Baris total atau baris kosong di tengah akan dilewati.</li>
    <li>Kolom yang paling penting: <b>tanggal, nama kegiatan, kab/kota, kecamatan, jumlah peserta, sasaran</b>. Kolom lain opsional.</li>
    <li>Judul kolom tidak harus sama persis; nanti kamu bisa mencocokkannya sendiri.</li>
    <li>Kolom yang kosong (mis. kecamatan) bisa dilengkapi AI di langkah terakhir, dan akan ditandai untuk dicek.</li>
    <li>Sebelum data disimpan, seluruh data dicadangkan otomatis, jadi impor bisa dibatalkan dari halaman Sampah & cadangan.</li></ul></section>`;
  const inp = $<HTMLInputElement>('#fx', el);
  const drop = $('#drop', el);
  const g = $<HTMLParagraphElement>('.galat', el);
  const baca = async (f?: File) => {
    if (!f) return;
    g.hidden = true;
    drop.classList.add('aktif');
    $('strong', drop).textContent = 'Membaca file…';
    try {
      lembar = await bacaFile(f);
      if (!lembar.some((l) => l.data.length > 1)) throw new Error('File ini kosong atau tidak punya baris data.');
      file = f.name;
      pilihLembar = Math.max(0, lembar.findIndex((l) => l.data.length > 1));
      siapkanLembar();
      tahap = 'kolom';
      viewImpor(el);
    } catch (e: any) {
      g.hidden = false;
      g.textContent = e.message || String(e);
      drop.classList.remove('aktif');
      $('strong', drop).textContent = 'Pilih file Excel atau CSV';
    }
  };
  inp.onchange = () => baca(inp.files?.[0]);
  drop.addEventListener('dragover', (e) => (e.preventDefault(), drop.classList.add('aktif')));
  drop.addEventListener('dragleave', () => drop.classList.remove('aktif'));
  drop.addEventListener('drop', (e) => (e.preventDefault(), baca(e.dataTransfer?.files?.[0])));
}

async function bacaFile(f: File): Promise<Lembar[]> {
  const ext = f.name.toLowerCase().split('.').pop();
  if (ext === 'csv') return [{ nama: f.name, data: csv(await f.text()) }];
  if (ext === 'xls') throw new Error('Format .xls lama belum didukung. Buka di Excel lalu simpan ulang sebagai .xlsx.');
  if (ext !== 'xlsx') throw new Error('Gunakan file .xlsx atau .csv.');
  const baca = (await import('read-excel-file/browser')).default as unknown as (f: File) => Promise<{ sheet: string; data: unknown[][] }[]>;
  const hasil = await baca(f);
  return hasil.map((s) => ({ nama: s.sheet, data: s.data }));
}

function csv(t: string): string[][] {
  const pemisah = (t.split('\n')[0].match(/;/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const out: string[][] = [];
  let baris: string[] = [],
    sel = '',
    kutip = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (kutip) {
      if (c === '"' && t[i + 1] === '"') (sel += '"'), i++;
      else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === pemisah) baris.push(sel), (sel = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      baris.push(sel), out.push(baris), (baris = []), (sel = '');
    } else sel += c;
  }
  if (sel || baris.length) baris.push(sel), out.push(baris);
  return out.map((r) => r.map((x) => x.replace(/^﻿/, '').trim()));
}

function siapkanLembar() {
  const d = lembar[pilihLembar].data;
  barisJudul = cariBarisJudul(d);
  peta = tebakKolom(d[barisJudul] || []);
}

// ---------- 2. cocokkan kolom ----------
function kolom(el: HTMLElement) {
  const d = lembar[pilihLembar].data;
  const judul = d[barisJudul] || [];
  const contoh = d.slice(barisJudul + 1).filter((r) => r.some((c) => c !== null && String(c).trim() !== '')).slice(0, 3);
  const cth = (i: number) =>
    contoh
      .map((r) => r[i])
      .filter((c) => c !== null && c !== undefined && String(c).trim() !== '')
      .map((c) => (c instanceof Date ? c.toLocaleDateString('id-ID') : String(c)))
      .map((s) => esc(s.slice(0, 40)))
      .join(' · ');
  el.innerHTML = `${kepala(`<b>${esc(file)}</b> · ${d.length - barisJudul - 1} baris data. Pastikan tiap kolom diarahkan ke isian yang benar.`)}
  <section class="kartu">
    <div class="impor-atur">
      ${lembar.length > 1 ? `<label class="field"><span class="lbl">Lembar (sheet)</span><select id="lembar">${lembar.map((l, i) => `<option value="${i}"${i === pilihLembar ? ' selected' : ''}>${esc(l.nama)} (${l.data.length} baris)</option>`).join('')}</select></label>` : ''}
      <label class="field"><span class="lbl">Baris judul kolom</span><select id="bj">${d
        .slice(0, 10)
        .map((r, i) => `<option value="${i}"${i === barisJudul ? ' selected' : ''}>Baris ${i + 1}: ${esc(r.filter(Boolean).slice(0, 4).join(' | ').slice(0, 60))}</option>`)
        .join('')}</select></label>
      <label class="field"><span class="lbl">Tahun untuk tanggal tanpa tahun</span><input type="number" id="thn" value="${tahun}" min="2000" max="2100"></label>
    </div>
    <table class="tbl peta-kolom"><thead><tr><th>Kolom di file</th><th>Contoh isi</th><th>Masuk ke isian</th></tr></thead><tbody>
    ${judul
      .map(
        (j, i) =>
          `<tr><td><b>${esc(j ?? '') || `<i class="contoh">Kolom ${i + 1} tanpa judul</i>`}</b></td><td class="contoh">${cth(i) || '—'}</td><td><select data-k="${i}" class="${peta[i] ? 'terisi' : ''}">${KOLOM_TUJUAN.map(
            ([k, t]) => `<option value="${k}"${k === (peta[i] || '') ? ' selected' : ''}>${t}</option>`,
          ).join('')}</select></td></tr>`,
      )
      .join('')}</tbody></table>
    <p class="galat" hidden></p>
    <div class="aksi"><button class="btn utama" id="lanjut">Lanjut: periksa data</button></div>
  </section>`;
  pasangUlang(el);
  const ls = $<HTMLSelectElement>('#lembar', el);
  if (ls) ls.onchange = () => ((pilihLembar = +ls.value), siapkanLembar(), kolom(el));
  const bj = $<HTMLSelectElement>('#bj', el);
  bj.onchange = () => ((barisJudul = +bj.value), (peta = tebakKolom(d[barisJudul] || [])), kolom(el));
  $$<HTMLSelectElement>('[data-k]', el).forEach(
    (s) =>
      (s.onchange = () => {
        peta[+s.dataset.k!] = s.value as Kolom;
        s.classList.toggle('terisi', !!s.value);
      }),
  );
  $('#lanjut', el).onclick = async () => {
    const g = $<HTMLParagraphElement>('.aksi', el).previousElementSibling as HTMLParagraphElement;
    const wajib: [Kolom, string][] = [
      ['tanggal', 'Tanggal'],
      ['judul', 'Judul kegiatan'],
    ];
    const kurang = wajib.filter(([k]) => !peta.includes(k) && !(k === 'judul' && peta.includes('tema')));
    if (kurang.length) {
      g.hidden = false;
      g.textContent = `Pilih kolom untuk: ${kurang.map((k) => k[1]).join(', ')}.`;
      return;
    }
    tahun = +$<HTMLInputElement>('#thn', el).value || tahun;
    await susunItem();
    tahap = 'pratinjau';
    saring = 'semua';
    viewImpor(el);
  };
}

// ---------- 3. pratinjau ----------
async function susunItem() {
  const d = lembar[pilihLembar].data;
  const ada = new Map((await dataKegiatan().catch(() => [])).map((k) => [kunciGanda(k), k]));
  item = d
    .slice(barisJudul + 1)
    .map((r, i) => ({ r, no: barisJudul + 2 + i }))
    .filter(({ r }) => r.filter((c) => c !== null && String(c).trim() !== '').length >= 2)
    .map(({ r, no }) => ({ ...barisKeIsian(r, peta, file, no, tahun), status: 'siap' as Status, simpan: true, diisiAi: [] }))
    .filter((it) => !/^(total|jumlah|grand total)\b/i.test(it.isian.judul));
  const lihat = new Map<string, number>();
  for (const it of item) {
    const k = kunciGanda(it.isian);
    const lama = ada.get(k);
    it.ganda = lama ? `Sudah ada di SiPEDULIKU: "${lama.judul}"` : lihat.has(k) ? `Sama dengan baris ${lihat.get(k)} di file ini` : undefined;
    if (!lihat.has(k)) lihat.set(k, it.no);
    nilai(it);
    it.simpan = it.status !== 'ganda' && it.status !== 'kurang';
  }
}

const tanpaKec = (k: KegiatanInput) => perluKecamatan(k.kabkota) && !k.kecamatan;
function nilai(it: Item) {
  const salah = periksa(it.isian, { kecamatan: false });
  it.status = it.ganda ? 'ganda' : salah.length ? 'kurang' : it.catatan.length || tanpaKec(it.isian) || it.isian.kabkotaDitebak || it.isian.kecamatanDitebak || it.diisiAi.length ? 'cek' : 'siap';
  if (it.status === 'kurang') it.simpan = false;
}

const LABEL_STATUS: Record<Status, string> = { siap: 'Siap', cek: 'Perlu dicek', kurang: 'Belum lengkap', ganda: 'Ganda' };

function pratinjau(el: HTMLElement) {
  const hitung = (s: Status) => item.filter((i) => i.status === s).length;
  const disimpan = item.filter((i) => i.simpan && i.status !== 'kurang');
  const perluAi = item.filter((i) => i.status !== 'ganda' && (!i.isian.kabkota || (perluKecamatan(i.isian.kabkota) && !i.isian.kecamatan) || !i.isian.sasaran.length || !i.isian.topik.length));
  const tampil = saring === 'semua' ? item : item.filter((i) => i.status === saring);
  el.innerHTML = `${kepala(`<b>${esc(file)}</b> · ${item.length} kegiatan terbaca. Centang baris yang mau disimpan; klik baris untuk memperbaiki.`)}
  <section class="impor-ring">
    ${(['siap', 'cek', 'kurang', 'ganda'] as Status[])
      .map((s) => `<button class="ir s-${s}${saring === s ? ' on' : ''}" data-s="${s}"><b>${hitung(s)}</b><span>${LABEL_STATUS[s]}</span></button>`)
      .join('')}
  </section>
  ${
    perluAi.length
      ? `<section class="kartu ai-isi"><div><h2>${perluAi.length} baris punya kolom kosong</h2><p class="sub">Kab/kota, kecamatan, sasaran, atau topik yang kosong bisa ditebak AI dari judul, tempat, dan Mitra Penyelenggara (misalnya alamat kampus atau sekolah mitra). Tiap tebakan disertai alasannya dan ditandai "perlu dicek".</p></div><button class="btn lembut" id="aiIsi">${IKON.kilau}Lengkapi dengan AI</button></section>`
      : ''
  }
  <section class="kartu">
    <div class="ch"><div><h2>${saring === 'semua' ? 'Semua baris' : LABEL_STATUS[saring]}</h2><p class="sub">${tampil.length} baris${saring !== 'semua' ? ` · <button class="lnk" id="semua">tampilkan semua</button>` : ''}</p></div>
      <label class="cek"><input type="checkbox" id="semuaCek"${tampil.some((i) => i.status === 'siap' || i.status === 'cek') && tampil.filter((i) => i.status === 'siap' || i.status === 'cek').every((i) => i.simpan) ? ' checked' : ''}> pilih semua yang bisa disimpan</label></div>
    <div class="impor-daftar">${tampil.map(barisHtml).join('') || '<p class="kosong-kecil">Tidak ada baris.</p>'}</div>
  </section>
  <div class="impor-bawah"><span><b>${disimpan.length}</b> kegiatan akan disimpan · ${angka(disimpan.reduce((t, i) => t + (i.isian.peserta || 0), 0))} peserta</span>
    <button class="btn utama" id="simpanSemua"${disimpan.length ? '' : ' disabled'}>Simpan ${disimpan.length} kegiatan</button></div>`;
  pasangUlang(el);
  $$<HTMLButtonElement>('[data-s]', el).forEach((b) => (b.onclick = () => ((saring = saring === b.dataset.s ? 'semua' : (b.dataset.s as Status)), pratinjau(el))));
  const sm = $('#semua', el);
  if (sm) sm.onclick = () => ((saring = 'semua'), pratinjau(el));
  $<HTMLInputElement>('#semuaCek', el).onchange = (e) => {
    const on = (e.target as HTMLInputElement).checked;
    tampil.forEach((i) => (i.status === 'siap' || i.status === 'cek') && (i.simpan = on));
    pratinjau(el);
  };
  const ai = $('#aiIsi', el);
  if (ai) ai.onclick = () => lengkapiAi(el, perluAi, ai as HTMLButtonElement);
  $('.impor-daftar', el).onclick = (e) => klikBaris(el, e);
  $$<HTMLFormElement>('.impor-daftar form', el).forEach(pasangForm);
  $('#simpanSemua', el).onclick = () => simpanSemua(el, disimpan);
}

function barisHtml(it: Item) {
  const k = it.isian;
  const tebak = k.kabkotaDitebak || k.kecamatanDitebak;
  const masalah = [...periksa(k, { kecamatan: false }), ...(tanpaKec(k) ? ['Kecamatan belum diketahui (boleh dilengkapi nanti)'] : []), ...(it.ganda ? [it.ganda] : []), ...it.catatan, ...(it.diisiAi.length ? [`Diisi AI: ${it.diisiAi.join(', ')}`] : [])];
  return `<div class="ib s-${it.status}${it.buka ? ' buka' : ''}" data-no="${it.no}">
    <div class="ib-baris">
      <input type="checkbox" class="ib-cek" aria-label="Simpan baris ${it.no}"${it.simpan ? ' checked' : ''}${it.status === 'kurang' ? ' disabled' : ''}>
      <span class="ib-no">${it.no}</span>
      <span class="ib-tgl">${k.tanggal ? tanggalPendek(k.tanggal) : '<i>tanpa tanggal</i>'}</span>
      <span class="ib-judul"><b>${esc(k.judul) || '<i>tanpa judul</i>'}</b>${masalah.length ? `<small>${masalah.map(esc).join(' · ')}</small>` : ''}</span>
      <span class="ib-wil">${esc(k.kecamatan ? `${k.kecamatan}, ` : '')}${esc(k.kabkota.replace('Kabupaten ', 'Kab. ')) || '<i>tanpa wilayah</i>'}${tebak ? ' <span class="tebak" title="Ditebak, perlu dicek">ditebak</span>' : ''}</span>
      <span class="ib-ps">${k.peserta === null ? '—' : (k.pesertaPerkiraan ? '±' : '') + angka(k.peserta)}</span>
      <span class="pill-s s-${it.status}">${LABEL_STATUS[it.status]}</span>
      <button class="lnk ib-buka" data-buka="${it.no}">${it.buka ? 'Tutup' : 'Perbaiki'}</button>
    </div>
    ${it.buka ? `<div class="ib-form">${formHtml(k, { tandaiAi: true })}<div class="aksi"><button class="btn" data-tutup="${it.no}">Batal</button><button class="btn utama" data-terap="${it.no}">Terapkan</button></div></div>` : ''}
  </div>`;
}

function klikBaris(el: HTMLElement, e: Event) {
  const t = e.target as HTMLElement;
  const box = t.closest<HTMLElement>('.ib');
  if (!box) return;
  const it = item.find((i) => i.no === +box.dataset.no!)!;
  if (t.classList.contains('ib-cek')) {
    it.simpan = (t as HTMLInputElement).checked;
    return pratinjau(el);
  }
  if (t.closest('[data-buka]') || t.closest('[data-tutup]') || (t.closest('.ib-baris') && !it.buka)) {
    item.forEach((i) => i !== it && (i.buka = false));
    it.buka = !it.buka;
    pratinjau(el);
    if (it.buka) $(`.ib[data-no="${it.no}"]`, el)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  if (t.closest('[data-terap]')) {
    const form = $<HTMLFormElement>('form', box);
    const isian = bacaForm(form, it.isian);
    const salah = periksa(isian, { kecamatan: false });
    tampilGalat(form, salah);
    if (salah.length) return;
    it.isian = isian;
    it.catatan = [];
    it.diisiAi = [];
    it.buka = false;
    if (it.status === 'ganda') it.ganda = undefined;
    nilai(it);
    it.simpan = true;
    pratinjau(el);
  }
}

async function lengkapiAi(el: HTMLElement, daftar: Item[], b: HTMLButtonElement) {
  b.disabled = true;
  let gagal = '';
  for (let i = 0; i < daftar.length; i += 15) {
    b.textContent = `AI melengkapi… ${Math.min(i + 15, daftar.length)}/${daftar.length}`;
    const potong = daftar.slice(i, i + 15);
    try {
      const hasil = await api.lengkapi(
        potong.map((it) => {
          const k = it.isian;
          const perlu = [!k.kabkota && 'kabkota', !k.kecamatan && 'kecamatan', !k.sasaran.length && 'sasaran', !k.topik.length && 'topik'].filter(Boolean);
          return { i: it.no, judul: k.judul, tema: k.tema, tempat: k.tempat, pengundang: k.pengundang, kabkota: k.kabkota, kecamatan: k.kecamatan, sasaranDetail: k.sasaranDetail, ringkasan: k.ringkasan, perlu };
        }),
      );
      for (const h of hasil) {
        const it = potong.find((x) => x.no === h.i);
        if (!it) continue;
        const k = it.isian;
        if (!k.kabkota && h.kabkota) (k.kabkota = h.kabkota as KegiatanInput['kabkota']), (k.kabkotaDitebak = true), it.diisiAi.push('kab/kota');
        const dasar = h.dasar ? ` (${h.dasar})` : '';
        const tambah = (t: string, simpan = false) => {
          if (!it.catatan.includes(t)) it.catatan.push(t);
          if (simpan && !(k.catatan || '').includes(t)) k.catatan = [k.catatan, t].filter(Boolean).join('\n');
        };
        if (h.kabkota && k.kabkota && h.kabkota !== k.kabkota && (KABKOTA as readonly string[]).includes(k.kabkota))
          tambah(`AI menilai lokasinya di ${h.kabkota}${h.kecamatan ? `, Kec. ${h.kecamatan}` : ''}, bukan ${k.kabkota}${dasar}. Cek ke tim.`, true);
        else if (!k.kecamatan && h.kecamatan) {
          k.kecamatan = h.kecamatan;
          k.kecamatanDitebak = true;
          it.diisiAi.push('kecamatan');
          tambah(`Kecamatan ${h.kecamatan} ditebak AI${h.dasar ? ': ' + h.dasar : ''}`, true);
        } else if (!k.kecamatan && h.dasar && perluKecamatan(k.kabkota)) tambah(`AI tidak menebak kecamatan: ${h.dasar}`);
        if (!k.sasaran.length && h.sasaran.length) (k.sasaran = h.sasaran as KegiatanInput['sasaran']), it.diisiAi.push('sasaran');
        if (!k.topik.length && h.topik.length) (k.topik = h.topik as KegiatanInput['topik']), it.diisiAi.push('topik');
        const lamaStatus = it.status;
        nilai(it);
        if (lamaStatus === 'kurang' && it.status !== 'kurang') it.simpan = true;
      }
    } catch (e: any) {
      gagal = e.message;
      break;
    }
  }
  if (gagal) toast(gagal, 'galat');
  else toast('Kolom kosong sudah dilengkapi AI. Cek baris berlabel "Perlu dicek".');
  pratinjau(el);
}

async function simpanSemua(el: HTMLElement, daftar: Item[]) {
  if (!confirm(`Simpan ${daftar.length} kegiatan dari ${file}? Data saat ini dicadangkan dulu secara otomatis.`)) return;
  const b = $<HTMLButtonElement>('#simpanSemua', el);
  b.disabled = true;
  b.textContent = 'Menyimpan…';
  try {
    const n = await api.impor(file, daftar.map((i) => ({ ...i.isian, dicatatOleh: i.isian.dicatatOleh || nama.get() })));
    await segarkanData();
    toast(`${n} kegiatan berhasil diimpor.`);
    tahap = 'pilih';
    item = [];
    location.hash = '#/kegiatan';
  } catch (e: any) {
    toast(e.message, 'galat');
    b.disabled = false;
    b.textContent = `Simpan ${daftar.length} kegiatan`;
  }
}
