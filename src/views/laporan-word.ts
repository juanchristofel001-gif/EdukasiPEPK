// Laporan Word per kegiatan: naskah A–E (ditulis AI, disunting tim) diisikan ke template .docx tim
// (public/template-laporan.docx) sehingga formatnya sama persis dengan laporan yang biasa dibuat manual.
import { BAGIAN_NASKAH, periksa, type KegiatanInput, type Naskah } from '../../shared/schema.js';
import { tanggalPanjang } from '../../shared/statistik.js';
import { api } from '../api.js';
import { esc, $, toast } from '../ui.js';
import { IKON } from '../ikon.js';
import { bacaForm, tampilGalat } from './form.js';

type Ttd = { tempat: string; jabatan: string; nama: string };

import type { Foto } from './foto.js';

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
    <p class="lw-kecil">Foto dari bagian Foto dokumentasi otomatis menjadi halaman 2 laporan.</p>
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
export function pasangLaporanWord(
  kartu: HTMLElement,
  form: HTMLFormElement,
  dasar: () => KegiatanInput,
  simpan: (isian: KegiatanInput) => Promise<void>,
  opt: { kecamatanWajib?: boolean; foto?: Foto[] } = {},
) {
  const foto = opt.foto || [];
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
      await buatDocx(isian, ttd, v('tanggal') || tanggalPanjang(isian.tanggalSelesai || isian.tanggal), foto);
      tampil('Kegiatan dan naskah tersimpan, laporan .docx diunduh.');
    } catch (err: any) {
      tampil('Gagal: ' + err.message, true);
    }
    unduhBtn.disabled = false;
    unduhBtn.innerHTML = label;
  };
}

// ---------- Halaman 2: dokumentasi foto ----------
const xmlEsc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = '<w:rFonts w:ascii="Bookman Old Style" w:hAnsi="Bookman Old Style"/><w:lang w:val="id-ID"/>';
const EMU_CM = 360000;

function gambarXml(f: Foto, n: number) {
  // Muat dalam kotak 7,4 × 5,6 cm dengan perbandingan sisi asli.
  const s = Math.min((7.4 * EMU_CM) / f.w, (5.6 * EMU_CM) / f.h);
  const cx = Math.round(f.w * s),
    cy = Math.round(f.h * s);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${1000 + n}" name="Foto ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${1000 + n}" name="foto${n}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdFoto${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function halamanFoto(foto: Foto[]) {
  if (!foto.length) return '';
  const sel = (f: Foto | undefined, n: number) =>
    `<w:tc><w:tcPr><w:tcW w:w="4513" w:type="dxa"/></w:tcPr>${
      f
        ? `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="60"/></w:pPr>${gambarXml(f, n)}</w:p><w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="160"/></w:pPr>${
            f.ket.trim() ? `<w:r><w:rPr>${FONT}<w:i/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${xmlEsc(f.ket.trim())}</w:t></w:r>` : ''
          }</w:p>`
        : '<w:p/>'
    }</w:tc>`;
  let baris = '';
  for (let i = 0; i < foto.length; i += 2) baris += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${sel(foto[i], i + 1)}${sel(foto[i + 1], i + 2)}</w:tr>`;
  return (
    `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` +
    `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:r><w:rPr>${FONT}<w:b/><w:bCs/></w:rPr><w:t>DOKUMENTASI KEGIATAN</w:t></w:r></w:p>` +
    `<w:tbl><w:tblPr><w:tblW w:w="9026" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblLook w:val="0000"/></w:tblPr><w:tblGrid><w:gridCol w:w="4513"/><w:gridCol w:w="4513"/></w:tblGrid>${baris}</w:tbl>`
  );
}

async function sisipkanFoto(zip: any, foto: Foto[]) {
  const rels = 'word/_rels/document.xml.rels';
  let r: string = zip.file(rels).asText();
  for (let i = 0; i < foto.length; i++) {
    zip.file(`word/media/foto${i + 1}.jpeg`, new Uint8Array(await foto[i].blob.arrayBuffer()));
    r = r.replace(
      '</Relationships>',
      `<Relationship Id="rIdFoto${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/foto${i + 1}.jpeg"/></Relationships>`,
    );
  }
  zip.file(rels, r);
  const ct = '[Content_Types].xml';
  let t: string = zip.file(ct).asText();
  if (!/Extension="jpeg"/i.test(t)) t = t.replace('<Default Extension="xml"', '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="xml"');
  zip.file(ct, t);
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const hariTanggal = (t: string) => `${HARI[new Date(t + 'T00:00:00').getDay()]}, ${tanggalPanjang(t)}`;
const daftarNama = (xs: string[]) => (xs.length <= 1 ? xs[0] || 'narasumber' : xs.slice(0, -1).join(', ') + ' dan ' + xs[xs.length - 1]);
const jamTeks = (j: string) => j.replace(/^0(\d)/, '$1'); // "09.30" → "9.30" seperti di template

async function buatDocx(k: KegiatanInput, ttd: Ttd, tanggalTtd: string, foto: Foto[] = []) {
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
    dokumentasi: halamanFoto(foto),
  });
  if (foto.length) await sisipkanFoto(doc.getZip(), foto);
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
