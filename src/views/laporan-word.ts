// Laporan Word per kegiatan: naskah A–E (ditulis AI, disunting tim) diisikan ke template .docx tim
// (public/template-laporan.docx) sehingga formatnya sama persis dengan laporan yang biasa dibuat manual.
import { BAGIAN_NASKAH, periksa, type Kegiatan, type KegiatanInput, type Naskah } from '../../shared/schema.js';
import { tanggalPanjang } from '../../shared/statistik.js';
import { api } from '../api.js';
import { segarkanData } from '../data.js';
import { esc, $, $$, toast } from '../ui.js';
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

export function kartuLaporanWord(k: Kegiatan) {
  const n = k.naskah;
  const t = ttdTersimpan();
  return `<section class="kartu lw" id="laporanWord">
  <div class="ch"><div><h2>${IKON.file}Laporan Word</h2><p class="sub">Naskah A–E diisikan ke template laporan tim. Sunting dulu, lalu unduh .docx.</p></div>
    <div class="kontrol"><button class="btn lembut" id="lwTulis">${IKON.kilau}${n ? 'Tulis ulang dengan AI' : 'Tulis naskah dengan AI'}</button></div></div>
  <p class="lw-status" hidden></p>
  <div class="lw-isi">
    ${BAGIAN_NASKAH.map(([b, judul]) => `<label class="lw-bag"><span>${judul}</span><textarea name="lw_${b}" rows="${b === 'penutup' ? 2 : b === 'pelaksanaan' ? 3 : 5}" placeholder="${n ? '' : 'Klik "Tulis naskah dengan AI", atau tulis sendiri.'}">${esc(n?.[b] || '')}</textarea></label>`).join('')}
    <p class="lw-kecil">[NARASUMBER] otomatis diganti nama narasumber dari isian di atas. Tabel hari/tanggal, waktu, dan tempat diambil dari isian kegiatan.</p>
    <fieldset class="lw-ttd"><legend>Tanda tangan</legend>
      <label><span>Ditetapkan di</span><input name="lw_tempat" value="${esc(t.tempat)}"></label>
      <label><span>Pada tanggal</span><input name="lw_tanggal" value="${esc(tanggalPanjang(k.tanggalSelesai || k.tanggal))}"></label>
      <label><span>Jabatan</span><textarea name="lw_jabatan" rows="2">${esc(t.jabatan)}</textarea></label>
      <label><span>Nama</span><input name="lw_nama" value="${esc(t.nama)}"></label>
    </fieldset>
  </div>
  <div class="aksi"><button class="btn utama" id="lwUnduh">${IKON.unduh}Simpan naskah & unduh .docx</button></div>
</section>`;
}

export function pasangLaporanWord(el: HTMLElement, form: HTMLFormElement, k: Kegiatan) {
  const kartu = $('#laporanWord', el);
  const status = $('.lw-status', kartu);
  const tampil = (t: string, galat = false) => {
    status.hidden = !t;
    status.textContent = t;
    status.classList.toggle('galat', galat);
  };
  const naskahLayar = (): Naskah => Object.fromEntries(BAGIAN_NASKAH.map(([b]) => [b, $<HTMLTextAreaElement>(`[name="lw_${b}"]`, kartu).value.trim()])) as Naskah;

  $('#lwTulis', kartu).onclick = async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    const ada = Object.values(naskahLayar()).some(Boolean);
    if (ada && !confirm('Naskah yang sekarang akan diganti tulisan AI yang baru. Lanjutkan?')) return;
    b.disabled = true;
    tampil('AI sedang menulis naskah… (10–30 detik)');
    try {
      const n = await api.naskah(bacaForm(form, k));
      BAGIAN_NASKAH.forEach(([x]) => ($<HTMLTextAreaElement>(`[name="lw_${x}"]`, kartu).value = n[x]));
      tampil('Naskah siap. Periksa dan sunting seperlunya, lalu unduh.');
    } catch (err: any) {
      tampil('Gagal menulis naskah: ' + err.message, true);
    }
    b.disabled = false;
    b.innerHTML = `${IKON.kilau}Tulis ulang dengan AI`;
  };

  $('#lwUnduh', kartu).onclick = async (e) => {
    const b = e.currentTarget as HTMLButtonElement;
    const naskah = naskahLayar();
    if (!Object.values(naskah).some(Boolean)) return tampil('Naskah masih kosong. Tulis dengan AI atau isi sendiri dulu.', true);
    const isian: KegiatanInput = { ...bacaForm(form, k), naskah };
    const salah = periksa(isian, { kecamatan: false });
    tampilGalat(form, salah);
    if (salah.length) return tampil('Ada isian kegiatan yang perlu dibetulkan dulu (lihat formulir di atas).', true);
    const ttd: Ttd = {
      tempat: $<HTMLInputElement>('[name="lw_tempat"]', kartu).value.trim(),
      jabatan: $<HTMLTextAreaElement>('[name="lw_jabatan"]', kartu).value.trim(),
      nama: $<HTMLInputElement>('[name="lw_nama"]', kartu).value.trim(),
    };
    try {
      localStorage.setItem(KUNCI_TTD, JSON.stringify(ttd));
    } catch {}
    b.disabled = true;
    b.textContent = 'Menyimpan…';
    try {
      await api.ubah(k.id, isian); // simpan naskah + perubahan isian supaya laporan bisa diunduh ulang
      await segarkanData();
      b.textContent = 'Menyusun .docx…';
      await buatDocx(isian, ttd, $<HTMLInputElement>('[name="lw_tanggal"]', kartu).value.trim());
      tampil('Naskah tersimpan dan laporan .docx diunduh.');
    } catch (err: any) {
      tampil('Gagal: ' + err.message, true);
    }
    b.disabled = false;
    b.innerHTML = `${IKON.unduh}Simpan naskah & unduh .docx`;
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
