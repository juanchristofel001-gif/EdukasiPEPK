// Form isian satu kegiatan. Dipakai untuk mengecek hasil AI dan untuk mengubah kegiatan yang sudah tersimpan.
import { KABKOTA, KABKOTA_LAIN, MODE, BENTUK, JENIS, PERAN_OJK, SASARAN, TOPIK, KANAL, METODE, rapikan, type KegiatanInput } from '../../shared/schema.js';
import { esc, $, $$ } from '../ui.js';
import { KECAMATAN } from '../../shared/kecamatan.js';

const pilihan = (nama: string, list: readonly string[], nilai: string, kosong = 'Pilih…') =>
  `<select name="${nama}"><option value="">${kosong}</option>${list
    .map((x) => `<option${x === nilai ? ' selected' : ''}>${esc(x)}</option>`)
    .join('')}</select>`;

// Dropdown pilih-banyak: kotak seperti isian biasa yang membuka daftar centang.
// Kotak centangnya tetap bernama sama, jadi cara membaca formulir tidak berubah.
const ringkasMulti = (nilai: string[], ph: string) =>
  nilai.length ? nilai.map((x) => `<span class="tag">${esc(x)}</span>`).join('') : `<span class="multi-ph">${ph}</span>`;
const multi = (nama: string, list: readonly string[], nilai: string[], ph = 'Pilih satu atau lebih…') =>
  `<details class="multi" data-ph="${esc(ph)}"><summary><span class="multi-nilai">${ringkasMulti(nilai, ph)}</span></summary><div class="multi-panel">${
    list.length > 8 ? `<input class="multi-cari" type="search" placeholder="Cari…" aria-label="Cari pilihan">` : ''
  }${list
    .map((x) => `<label class="multi-op"><input type="checkbox" name="${nama}" value="${esc(x)}"${nilai.includes(x) ? ' checked' : ''}><span>${esc(x)}</span></label>`)
    .join('')}</div></details>`;

const bagian = (judul: string, isi: string) => `<fieldset class="bag"><legend>${judul}</legend><div class="grid">${isi}</div></fieldset>`;

const field = (label: string, isi: string, opt: { lebar?: boolean; catatan?: string; wajib?: boolean } = {}) =>
  `<div class="field${opt.lebar ? ' lebar' : ''}"><span class="lbl">${label}${opt.wajib ? ' <b class="req" aria-hidden="true">*</b>' : ''}</span>${isi}${
    opt.catatan ? `<span class="hint">${opt.catatan}</span>` : ''
  }</div>`;

function opsiKec(kab: string, nilai: string) {
  const l = KECAMATAN[kab];
  if (!kab) return '<option value="">Pilih kabupaten/kota dulu</option>';
  if (!l) return '<option value="">Tidak perlu (bukan wilayah Banten)</option>';
  return `<option value="">Pilih kecamatan…</option>${l.map((x) => `<option${x === nilai ? ' selected' : ''}>${esc(x)}</option>`).join('')}`;
}

// Pilihan kecamatan mengikuti kabupaten/kota yang dipilih.
export function pasangForm(form: HTMLFormElement) {
  const kab = $<HTMLSelectElement>('[name="kabkota"]', form);
  const kec = $<HTMLSelectElement>('[name="kecamatan"]', form);
  kab.addEventListener('change', () => {
    kec.innerHTML = opsiKec(kab.value, '');
    kec.disabled = !KECAMATAN[kab.value];
    kec.closest('.field')?.querySelector('.warn')?.remove();
  });
  kec.disabled = !KECAMATAN[kab.value];

  $$<HTMLDetailsElement>('details.multi', form).forEach((d) => {
    const nilai = $('.multi-nilai', d);
    const segar = () => (nilai.innerHTML = ringkasMulti($$<HTMLInputElement>('input[type="checkbox"]:checked', d).map((x) => x.value), d.dataset.ph || ''));
    d.addEventListener('change', segar);
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      $$<HTMLDetailsElement>('details.multi[open]').forEach((o) => o !== d && (o.open = false)); // satu terbuka saja
      $<HTMLInputElement>('.multi-cari', d)?.focus();
    });
    const cari = $<HTMLInputElement>('.multi-cari', d);
    if (cari)
      cari.addEventListener('input', () => {
        const q = cari.value.trim().toLowerCase();
        $$<HTMLElement>('.multi-op', d).forEach((o) => (o.hidden = !!q && !o.textContent!.toLowerCase().includes(q)));
      });
  });
}

// Tutup dropdown pilih-banyak saat klik di luar atau menekan Esc.
document.addEventListener('click', (e) => {
  $$<HTMLDetailsElement>('details.multi[open]').forEach((d) => !d.contains(e.target as Node) && (d.open = false));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $$<HTMLDetailsElement>('details.multi[open]').forEach((d) => ((d.open = false), d.querySelector('summary')?.focus()));
});

export function formHtml(k: KegiatanInput, opt: { tandaiAi?: boolean } = {}) {
  const wilayahHint =
    opt.tandaiAi && k.kabkotaDitebak
      ? '<span class="warn">Tidak tertulis di laporan, ditebak AI dari nama tempat. Pastikan benar.</span>'
      : '';
  const kecHint =
    opt.tandaiAi && k.kecamatanDitebak && k.kecamatan
      ? '<span class="warn">Kecamatan ditebak AI dari nama tempat. Pastikan benar.</span>'
      : opt.tandaiAi && !k.kecamatan && KECAMATAN[k.kabkota]
        ? '<span class="warn">AI tidak menemukan kecamatannya. Pilih manual.</span>'
        : '';
  const pesertaHint = k.pesertaPerkiraan ? 'Ditandai sebagai perkiraan.' : '';
  return `<form class="kform" novalidate>
  ${bagian(
    'Kegiatan',
    `${field('Judul kegiatan', `<input name="judul" value="${esc(k.judul)}" required>`, { lebar: true, wajib: true })}
    ${field('Tema / judul materi', `<input name="tema" value="${esc(k.tema)}">`, { lebar: true })}
    ${field('Bentuk kegiatan', pilihan('bentuk', BENTUK, k.bentuk))}
    ${field('Jenis', pilihan('jenis', JENIS, k.jenis))}
    ${field('Pengundang / mitra', `<input name="pengundang" value="${esc(k.pengundang)}" placeholder="Misal: SMA Athalia">`)}
    ${field('Peran OJK', pilihan('peranOjk', PERAN_OJK, k.peranOjk))}`,
  )}
  ${bagian(
    'Waktu dan tempat',
    `${field('Tanggal', `<input type="date" name="tanggal" value="${esc(k.tanggal)}" required>`, { wajib: true })}
    ${field('Tanggal selesai', `<input type="date" name="tanggalSelesai" value="${esc(k.tanggalSelesai)}">`, { catatan: 'Hanya bila lebih dari satu hari.' })}
    ${field('Jam mulai', `<input name="jamMulai" value="${esc(k.jamMulai || '')}" placeholder="09.30" inputmode="numeric" pattern="\\d{1,2}[.:]\\d{2}">`)}
    ${field('Jam selesai edukasi', `<input name="jamSelesai" value="${esc(k.jamSelesai || '')}" placeholder="10.30" inputmode="numeric" pattern="\\d{1,2}[.:]\\d{2}">`)}
    ${field('Mode', pilihan('mode', MODE, k.mode))}
    ${field('Tempat', `<input name="tempat" value="${esc(k.tempat)}" placeholder="Misal: Aula SMAN 1 Serang">`)}
    ${field(
      'Kabupaten/kota',
      `<select name="kabkota" required><option value="">Pilih…</option><optgroup label="Banten">${KABKOTA.map(
        (x) => `<option${x === k.kabkota ? ' selected' : ''}>${x}</option>`,
      ).join('')}</optgroup><optgroup label="Lainnya">${KABKOTA_LAIN.map((x) => `<option${x === k.kabkota ? ' selected' : ''}>${x}</option>`).join(
        '',
      )}</optgroup></select>${wilayahHint}`,
      { wajib: true },
    )}
    ${field('Kecamatan', `<select name="kecamatan">${opsiKec(k.kabkota, k.kecamatan)}</select>${kecHint}`, { wajib: true })}`,
  )}
  ${bagian(
    'Peserta',
    `${field('Jumlah peserta', `<div class="row"><input type="number" min="0" name="peserta" value="${k.peserta ?? ''}" required><label class="cek"><input type="checkbox" name="pesertaPerkiraan"${k.pesertaPerkiraan ? ' checked' : ''}> perkiraan</label></div>`, { wajib: true, catatan: pesertaHint })}
    ${field('Sasaran peserta', multi('sasaran', SASARAN, k.sasaran), { wajib: true })}
    ${field('Keterangan peserta', `<input name="sasaranDetail" value="${esc(k.sasaranDetail)}" placeholder="Misal: Siswa kelas XII">`, { lebar: true })}`,
  )}
  ${bagian(
    'Materi',
    `${field('Narasumber', `<input name="narasumber" value="${esc(k.narasumber.join(', '))}" placeholder="Pisahkan dengan koma">`)}
    ${field('Topik materi', multi('topik', TOPIK, k.topik))}
    ${field('Topik utama', pilihan('topikUtama', TOPIK, k.topikUtama || ''), { catatan: 'Materi pokok kegiatan. Topik lain dianggap materi pendukung/template.' })}
    ${field('Kanal yang dikenalkan', multi('kanal', KANAL, k.kanal))}
    ${field('Metode', multi('metode', METODE, k.metode))}
    ${field('Ringkasan', `<textarea name="ringkasan" rows="2" placeholder="Pokok materi yang disampaikan">${esc(k.ringkasan)}</textarea>`, { lebar: true })}`,
  )}
  ${bagian(
    'Catatan',
    `${field('Catatan lapangan', `<textarea name="catatan" rows="2" placeholder="Respons peserta, kendala, pertanyaan yang sering muncul">${esc(k.catatan)}</textarea>`, { lebar: true })}
    ${field('Dicatat oleh', `<input name="dicatatOleh" value="${esc(k.dicatatOleh)}" placeholder="Nama kamu (opsional)">`)}
    ${k.sumberFile ? field('File laporan asal', `<input name="sumberFile" value="${esc(k.sumberFile)}" readonly tabindex="-1" class="ro">`) : ''}`,
  )}
  <p class="galat" role="alert" hidden></p>
</form>`;
}

export function bacaForm(form: HTMLFormElement, dasar: KegiatanInput): KegiatanInput {
  const v = (n: string) => ($<HTMLInputElement>(`[name="${n}"]`, form)?.value ?? '').trim();
  const cek = (n: string) => $$<HTMLInputElement>(`[name="${n}"]:checked`, form).map((x) => x.value);
  return rapikan({
    ...dasar,
    judul: v('judul'),
    tema: v('tema'),
    tanggal: v('tanggal'),
    tanggalSelesai: v('tanggalSelesai'),
    jamMulai: v('jamMulai'),
    jamSelesai: v('jamSelesai'),
    bentuk: v('bentuk'),
    jenis: v('jenis'),
    mode: v('mode'),
    tempat: v('tempat'),
    kabkota: v('kabkota'),
    kabkotaDitebak: dasar.kabkotaDitebak && v('kabkota') === dasar.kabkota,
    kecamatan: v('kecamatan'),
    kecamatanDitebak: dasar.kecamatanDitebak && v('kecamatan') === dasar.kecamatan,
    pengundang: v('pengundang'),
    peranOjk: v('peranOjk'),
    peserta: v('peserta') === '' ? null : Number(v('peserta')),
    pesertaPerkiraan: $<HTMLInputElement>('[name="pesertaPerkiraan"]', form).checked,
    narasumber: v('narasumber'),
    sasaran: cek('sasaran'),
    sasaranDetail: v('sasaranDetail'),
    topik: cek('topik'),
    topikUtama: v('topikUtama'),
    kanal: cek('kanal'),
    metode: cek('metode'),
    ringkasan: v('ringkasan'),
    catatan: v('catatan'),
    dicatatOleh: v('dicatatOleh'),
  });
}

export function tampilGalat(form: HTMLFormElement, pesan: string[]) {
  const p = $<HTMLParagraphElement>('.galat', form);
  p.hidden = !pesan.length;
  p.innerHTML = pesan.map(esc).join('<br>');
  if (pesan.length) p.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
