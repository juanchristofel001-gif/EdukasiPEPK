// Laporan Word per kegiatan: naskah A–E (ditulis AI, disunting tim) diisikan ke template .docx tim
// (public/template-laporan.docx) sehingga formatnya sama persis dengan laporan yang biasa dibuat manual.
import { BAGIAN_NASKAH, periksa, type KegiatanInput, type Naskah } from '../../shared/schema.js';
import { tanggalPanjang } from '../../shared/statistik.js';
import { api } from '../api.js';
import { esc, $, toast } from '../ui.js';
import { IKON } from '../ikon.js';
import { bacaForm, tampilGalat } from './form.js';

type Ttd = { tempat: string; jabatan: string; nama: string };
const KUNCI_TTD = 'sipeduliku:ttd';
// Bawaan dari template laporan tim; bisa diubah di layar dan diingat per perangkat.
const TTD_AWAL: Ttd = { tempat: 'Serang', jabatan: 'Manajer PEPK Kantor OJK Provinsi\nBanten', nama: 'Tubagus Aria Dwitama' };
function ttdTersimpan(): Ttd {
  try {
    return { ...TTD_AWAL, ...JSON.parse(localStorage.getItem(KUNCI_TTD) || '{}') };
  } catch {
    return TTD_AWAL;
  }
}

// Bagian "Laporan Word" untuk satu kegiatan. Dipakai di halaman kegiatan dan di formulir Input data.
// opt.lipat: tampil sebagai bagian yang bisa dibuka-tutup (formulir input), bukan kartu sendiri.
export function kartuLaporanWord(n: Naskah | null, tanggal: string, opt: { lipat?: boolean; labelTombol?: string } = {}) {
  const t = ttdTersimpan();
  const isi = `
  <div class="lw-kepala"><p class="sub">Naskah bagian A–E diisikan ke template laporan tim. Tulis dengan AI atau ketik sendiri, sunting, lalu unduh.</p>
    <button type="button" class="btn lembut lw-tulis">${IKON.kilau}${n ? 'Tulis ulang dengan AI' : 'Tulis naskah dengan AI'}</button></div>
  <p class="lw-status" hidden></p>
  <div class="lw-isi">
    ${BAGIAN_NASKAH.map(([b, judul]) => `<label class="lw-bag"><span>${judul}</span><textarea data-lw="${b}" rows="${b === 'penutup' ? 2 : b === 'pelaksanaan' ? 3 : 4}">${esc(n?.[b] || '')}</textarea></label>`).join('')}
    <p class="lw-kecil">[NARASUMBER] otomatis diganti nama narasumber dari formulir. Tabel hari/tanggal, waktu, dan tempat diambil dari isian kegiatan.</p>
    <fieldset class="lw-ttd"><legend>Tanda tangan</legend>
      <label><span>Ditetapkan di</span><input data-ttd="tempat" value="${esc(t.tempat)}"></label>
      <label><span>Pada tanggal</span><input data-ttd="tanggal" value="${tanggal ? esc(tanggalPanjang(tanggal)) : ''}" placeholder="mengikuti tanggal kegiatan"></label>
      <label><span>Jabatan</span><textarea data-ttd="jabatan" rows="2">${esc(t.jabatan)}</textarea></label>
      <label><span>Nama</span><input data-ttd="nama" value="${esc(t.nama)}"></label>
    </fieldset>
  </div>
  ${opt.lipat ? '' : `<div class="aksi"><button type="button" class="btn utama lw-unduh">${IKON.unduh}${opt.labelTombol || 'Simpan naskah & unduh .docx'}</button></div>`}`;
  return opt.lipat
    ? `<details class="lw lw-lipat"${n ? ' open' : ''}><summary>${IKON.file}<span><b>Laporan Word</b><small>Opsional · unduh laporan .docx sesuai template tim</small></span></summary>${isi}</details>`
    : `<section class="kartu lw"><div class="ch"><div><h2>${IKON.file}Laporan Word</h2></div></div>${isi}</section>`;
}

// Naskah yang sedang tertulis di layar (null kalau semua kosong).
export function naskahDiLayar(kartu: HTMLElement): Naskah | null {
  const n = Object.fromEntries(BAGIAN_NASKAH.map(([b]) => [b, ($<HTMLTextAreaElement>(`[data-lw="${b}"]`, kartu)?.value || '').trim()])) as Naskah;
  return Object.values(n).some(Boolean) ? n : null;
}

// simpan: menyimpan isian (kegiatan baru atau perubahan) sebelum .docx dibuat.
export function pasangLaporanWord(kartu: HTMLElement, form: HTMLFormElement, dasar: () => KegiatanInput, simpan: (isian: KegiatanInput) => Promise<void>, opt: { kecamatanWajib?: boolean } = {}) {
  const status = $('.lw-status', kartu);
  const tampil = (t: string, galat = false) => {
    if (t && kartu instanceof HTMLDetailsElement) kartu.open = true;
    status.hidden = !t;
    status.textContent = t;
    status.classList.toggle('galat', galat);
  };
  const tulis = $<HTMLButtonElement>('.lw-tulis', kartu);
  tulis.onclick = async () => {
    if (naskahDiLayar(kartu) && !confirm('Naskah yang sekarang akan diganti tulisan AI yang baru. Lanjutkan?')) return;
    const isian = bacaForm(form, dasar());
    if (!isian.judul || !isian.tanggal) return tampil('Isi judul dan tanggal kegiatan dulu supaya AI bisa menulis naskah.', true);
    tulis.disabled = true;
    tampil('AI sedang menulis naskah… (10–30 detik)');
    try {
      const n = await api.naskah(isian);
      BAGIAN_NASKAH.forEach(([x]) => ($<HTMLTextAreaElement>(`[data-lw="${x}"]`, kartu).value = n[x]));
      tampil('Naskah siap. Periksa dan sunting seperlunya, lalu unduh.');
    } catch (err: any) {
      tampil('Gagal menulis naskah: ' + err.message, true);
    }
    tulis.disabled = false;
    tulis.innerHTML = `${IKON.kilau}Tulis ulang dengan AI`;
  };

  // Di formulir Input data tombol unduh ada di baris aksi kartu, bukan di dalam bagian Laporan Word.
  const unduhBtn = $<HTMLButtonElement>('.lw-unduh', kartu) || $<HTMLButtonElement>('.lw-unduh', kartu.closest('.item') || kartu);
  const label = unduhBtn.innerHTML;
  unduhBtn.onclick = async () => {
    const naskah = naskahDiLayar(kartu);
    if (!naskah) {
      if (kartu instanceof HTMLDetailsElement) kartu.open = true;
      return tampil('Naskah laporan masih kosong. Klik "Tulis naskah dengan AI" atau isi sendiri dulu.', true);
    }
    const isian: KegiatanInput = { ...bacaForm(form, dasar()), naskah };
    const salah = periksa(isian, { kecamatan: opt.kecamatanWajib ?? false });
    tampilGalat(form, salah);
    if (salah.length) return tampil('Ada isian kegiatan yang perlu dibetulkan dulu (lihat formulir di atas).', true);
    const v = (k: string) => ($<HTMLInputElement>(`[data-ttd="${k}"]`, kartu)?.value || '').trim();
    const ttd: Ttd = { tempat: v('tempat'), jabatan: v('jabatan'), nama: v('nama') };
    try {
      localStorage.setItem(KUNCI_TTD, JSON.stringify(ttd));
    } catch {}
    unduhBtn.disabled = true;
    unduhBtn.textContent = 'Menyimpan…';
    try {
      await simpan(isian);
      unduhBtn.textContent = 'Menyusun .docx…';
      await buatDocx(isian, ttd, v('tanggal') || tanggalPanjang(isian.tanggalSelesai || isian.tanggal));
      tampil('Kegiatan dan naskah tersimpan, laporan .docx diunduh.');
    } catch (err: any) {
      tampil('Gagal: ' + err.message, true);
    }
    unduhBtn.disabled = false;
    unduhBtn.innerHTML = label;
  };
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const hariTanggal = (t: string) => `${HARI[new Date(t + 'T00:00:00').getDay()]}, ${tanggalPanjang(t)}`;
const daftarNama = (xs: string[]) => (xs.length <= 1 ? xs[0] || 'narasumber' : xs.slice(0, -1).join(', ') + ' dan ' + xs[xs.length - 1]);
const jamTeks = (j: string) => j.replace(/^0(\d)/, '$1'); // "09.30" → "9.30" seperti di template

async function buatDocx(k: KegiatanInput, ttd: Ttd, tanggalTtd: string) {
  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([import('pizzip'), import('docxtemplater')]);
  const r = await fetch('/template-laporan.docx');
  if (!r.ok) throw new Error('Template laporan tidak ditemukan.');
  const zip = new PizZip(await r.arrayBuffer());
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  const n = k.naskah!;
  const [jab1, ...jabSisa] = ttd.jabatan.split('\n');
  doc.render({
    judul: k.judul,
    pendahuluan: n.pendahuluan,
    pelaksanaan: n.pelaksanaan.replaceAll('[NARASUMBER]', daftarNama(k.narasumber)),
    hariTanggal: hariTanggal(k.tanggal) + (k.tanggalSelesai ? ` s.d. ${hariTanggal(k.tanggalSelesai)}` : ''),
    waktu: k.jamMulai ? `Pukul ${jamTeks(k.jamMulai)} WIB s.d Selesai` : '-',
    tempat: k.tempat || '-',
    peserta: n.peserta,
    kesimpulan: n.kesimpulan,
    penutup: n.penutup,
    tempatTtd: ttd.tempat,
    tanggalTtd: tanggalTtd,
    jabatan1: jab1 || '',
    jabatan2: jabSisa.join('\n'),
    namaTtd: ttd.nama,
  });
  const blob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Laporan_Edukasi_${k.judul.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 80)}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Laporan .docx diunduh.');
}
