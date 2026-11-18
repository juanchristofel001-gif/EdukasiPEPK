// Halaman Laporan: rangkuman satu periode dalam bentuk dokumen (sampul, ringkasan, grafik + deskripsi +
// interpretasi AI, rekomendasi). Bisa dibaca di layar lalu diunduh sebagai PDF A4.
import { KABKOTA, type Kegiatan } from '../../shared/schema.js';
import { JUMLAH_KECAMATAN } from '../../shared/kecamatan.js';
import { tanggalPanjang, tanggalPendek, angka, labelPeriode, type Periode } from '../../shared/statistik.js';
import { dataLaporan, deskripsi, sidikData, judulBagian, BAGIAN, VERSI_TAFSIR, type Bagian, type DataLaporan } from '../../shared/laporan.js';
import type { TafsirLaporan } from '../../api/laporan.js';
import { api, nama } from '../api.js';
import { dataKegiatan } from '../data.js';
import { esc, $, hariIni, toast } from '../ui.js';
import { muatPeta, petaSvg, batasLegenda, kelas, SKALA, KOSONG, type Geo } from './peta.js';
import { trenHtml } from './dasbor.js';
import { IKON } from '../ikon.js';
import { desimal, SUMBER_PENDUDUK } from '../../shared/penduduk.js';
import { LOGO, NAMA } from '../merek.js';

let sibuk = false;

export async function viewLaporan(el: HTMLElement, q: URLSearchParams) {
  const dari = q.get('dari') || '',
    sampai = q.get('sampai') || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dari) || !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
    location.hash = '#/dasbor';
    return;
  }
  const p: Periode = { dari, sampai };
  const kabQ = q.get('kab') || '';
  const kab = (KABKOTA as readonly string[]).includes(kabQ) ? kabQ : undefined;
  el.innerHTML = `<div class="memuat besar"><i></i><i></i><i></i></div>`;
  let semua: Kegiatan[], geo: Geo;
  try {
    [semua, geo] = await Promise.all([dataKegiatan(), muatPeta()]);
  } catch (e: any) {
    el.innerHTML = `<p class="galat">${esc(e.message)}</p>`;
    return;
  }
  const d = dataLaporan(semua, p, kab);
  const desk = deskripsi(d);
  const dibuat = new Date();

  el.innerHTML = `
  <header class="ph lap-ph">
    <div><a class="lnk kembali" href="#/dasbor">← Dasbor</a><h1>Laporan edukasi${kab ? ` – ${esc(kab)}` : ''}</h1><p>${labelPeriode(p)} · ${d.kegiatan} kegiatan</p></div>
    <div class="kontrol"><button class="btn lembut" id="tulisUlang" hidden>${IKON.kilau}Tulis ulang interpretasi</button><button class="btn utama" id="unduhPdf"${d.kegiatan ? '' : ' disabled'}>${IKON.unduh}Unduh PDF</button></div>
  </header>
  <p class="lap-status" id="lapStatus" hidden></p>
  ${d.kegiatan ? `<div class="lap" id="lap">${dokumen(d, desk, geo, p, dibuat)}</div>` : `<section class="kartu kosong"><h2>Tidak ada kegiatan${kab ? ` di ${esc(kab)}` : ''} pada periode ini</h2><p>Pilih periode lain di dasbor.</p></section>`}`;
  if (!d.kegiatan) return;

  const status = $('#lapStatus', el);
  const sidik = sidikData(semua, p, kab);
  // Interpretasi masih sesuai bila ditulis untuk data yang sama dan versi laporan yang sama.
  const masihSesuai = (t: TafsirLaporan) => t.versi === VERSI_TAFSIR && (t.sidik ? t.sidik === sidik : t.jumlahData === d.kegiatan);
  const ulang = $<HTMLButtonElement>('#tulisUlang', el);
  let sekarang: TafsirLaporan | null = null;
  const tampilkan = (t: TafsirLaporan | null, galat = '') => {
    sekarang = t;
    isiTafsir(el, t, galat);
    ulang.hidden = false;
    ulang.innerHTML = `${IKON.kilau}${t ? 'Tulis ulang interpretasi' : 'Tulis interpretasi AI'}`;
    const usang = !!t && !masihSesuai(t);
    status.hidden = !(galat || usang);
    status.className = 'lap-status' + (galat ? ' galat' : '');
    status.textContent = galat
      ? t
        ? `Interpretasi belum bisa ditulis ulang: ${galat}. Yang tampil masih interpretasi sebelumnya; coba lagi nanti.`
        : `Interpretasi AI belum tersedia: ${galat}. Laporan tetap bisa diunduh dengan deskripsi angka saja.`
      : usang
        ? `Data sudah berubah sejak interpretasi ini ditulis. Klik "Tulis ulang interpretasi" supaya sesuai.`
        : '';
  };
  const tulis = async () => {
    ulang.disabled = true;
    $$tunggu(el, true);
    try {
      tampilkan(await api.tafsirLaporan(dari, sampai, true, kab));
    } catch (e: any) {
      tampilkan(sekarang, e.message);
    }
    $$tunggu(el, false);
    ulang.disabled = false;
  };
  ulang.onclick = tulis;
  $('#unduhPdf', el).onclick = (e) => unduhPdf(el, e.currentTarget as HTMLButtonElement, p, kab);
  if (kab) zoomKab(el, kab);

  try {
    const t = await api.tafsirLaporan(dari, sampai, false, kab);
    if (t && masihSesuai(t)) tampilkan(t);
    else {
      if (t) tampilkan(t); // tampilkan dulu yang lama sambil AI menulis ulang
      await tulis();
    }
  } catch (e: any) {
    tampilkan(null, e.message);
  }
}

function $$tunggu(el: HTMLElement, on: boolean) {
  el.querySelectorAll('.ai-slot').forEach((s) => s.classList.toggle('menunggu', on));
}

function isiTafsir(el: HTMLElement, t: TafsirLaporan | null, galat: string) {
  const r = $('#aiRingkasan', el);
  if (r)
    r.innerHTML = t
      ? `<p class="lap-lead">${esc(t.ringkasan)}</p>${t.sorotan.length ? `<h3>Temuan utama</h3><ul>${t.sorotan.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`
      : `<p class="lap-catat">${galat ? 'Ringkasan AI tidak tersedia.' : 'Ringkasan AI belum ditulis.'} Angka di setiap bagian di bawah tetap dihitung langsung dari data.</p>`;
  el.querySelectorAll<HTMLElement>('[data-ai]').forEach((s) => {
    const v = t?.interpretasi[s.dataset.ai as Bagian];
    s.innerHTML = v ? `<h4>Interpretasi</h4><p>${esc(v)}</p>` : '';
  });
  const rek = $('#aiRek', el);
  if (rek) {
    rek.innerHTML = t?.rekomendasi.length ? `<h2>Rekomendasi tindak lanjut</h2><ol>${t.rekomendasi.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '';
    rek.hidden = !t?.rekomendasi.length;
  }
  const f = $('#aiFoot', el);
  if (f)
    f.textContent = t
      ? `Ringkasan, interpretasi, dan rekomendasi ditulis AI (${t.model}) pada ${new Date(t.dibuat).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })} dari angka agregat di laporan ini, tanpa data pribadi. Periksa kembali sebelum dipakai sebagai dasar keputusan.`
      : 'Laporan ini tidak memuat interpretasi AI.';
}

// ---------- isi dokumen ----------

function dokumen(d: DataLaporan, desk: Record<Bagian, string>, geo: Geo, p: Periode, dibuat: Date) {
  const blok: string[] = [];
  blok.push(`<section class="lb sampul">
    <div class="sp-atas"><img src="/logo-ojk.png" alt="Otoritas Jasa Keuangan" width="325" height="128"><span class="sp-merek"><span class="logo">${LOGO}</span><b>${NAMA}</b></span></div>
    <p class="sp-kicau">Laporan kegiatan edukasi keuangan</p>
    <h1>Edukasi Literasi Keuangan<br>${d.kab ? esc(d.kab) : 'OJK Provinsi Banten'}</h1>
    <dl class="sp-meta"><div><dt>Periode</dt><dd>${/^(Tahun|Triwulan)/.test(labelPeriode(p)) ? `${labelPeriode(p)}<br><small>${tanggalPanjang(p.dari)} – ${tanggalPanjang(p.sampai)}</small>` : labelPeriode(p)}</dd></div><div><dt>Dibuat</dt><dd>${tanggalPanjang(hariIni())}, ${String(dibuat.getHours()).padStart(2, '0')}.${String(dibuat.getMinutes()).padStart(2, '0')}</dd></div><div><dt>Oleh</dt><dd>${esc(nama.get())}</dd></div></dl>
  </section>`);
  blok.push(`<section class="lb lap-teks"><h2>Ringkasan</h2><div class="ai-slot" id="aiRingkasan"><p class="lap-catat">AI sedang menulis ringkasan…</p></div></section>`);
  blok.push(`<section class="lb"><div class="lap-kpi">
    ${kpi('Kegiatan', angka(d.kegiatan))}
    ${kpi('Peserta', (d.adaPerkiraan ? '±' : '') + angka(d.peserta))}
    ${
      d.kab
        ? (() => {
            const w = d.banten!.perWilayah.find((x) => x.nama === d.kab)!;
            return kpi('Kecamatan terjangkau', `${w.kecTerjangkau}<small>/${w.kecTotal}</small>`) + kpi('Per 100 rb penduduk', desimal(w.per100rb));
          })()
        : kpi('Kab/kota terjangkau', `${d.wilayahTerjangkau}<small>/${KABKOTA.length}</small>`) + kpi('Kecamatan terjangkau', `${d.kecamatanTerjangkau}<small>/${JUMLAH_KECAMATAN}</small>`)
    }
  </div></section>`);
  const grafik: Record<Bagian, string> = {
    peta: petaLaporan(d, geo),
    wilayah: d.banten ? tabelWilayah({ ...d, ...d.banten } as DataLaporan, geo, d.kab) : tabelWilayah(d, geo),
    tren: trenHtml(d) + `<p class="lap-kecil">Angka di atas batang: jumlah kegiatan per bulan.</p>`,
    peserta: bar(d.kelasPeserta, { satuan: 'kegiatan', urut: false }) + terbesar(d),
    sasaran: bar(d.sasaran.slice(0, 10), { satuan: 'kegiatan' }),
    topik: bar(d.topik.slice(0, 10), { satuan: 'kegiatan' }),
    bentuk: `<div class="lap-dua"><div><h4>Bentuk kegiatan</h4>${bar(d.bentuk, { satuan: 'kegiatan' })}</div><div><h4>Cara pelaksanaan</h4>${bar(d.mode, { satuan: 'kegiatan' })}</div></div>`,
    mitra: bar(d.mitra.slice(0, 10), { satuan: 'kegiatan' }),
  };
  BAGIAN.forEach(([k], i) =>
    blok.push(`<section class="lb lap-bag"><h2><span>${i + 1}</span>${esc(judulBagian(k, d.kab))}</h2>${grafik[k]}<div class="lap-tx"><h4>Deskripsi</h4><p>${esc(desk[k])}</p><div class="ai-slot" data-ai="${k}"></div></div></section>`),
  );
  blok.push(`<section class="lb lap-teks" id="aiRek" hidden></section>`);
  const catatan = [
    d.adaPerkiraan && 'Sebagian jumlah peserta adalah perkiraan (ditandai ± di aplikasi).',
    d.tanpaKecamatan && `${d.tanpaKecamatan} kegiatan belum memiliki data kecamatan; cakupan kecamatan sebenarnya bisa lebih tinggi.`,
    `Ukuran "per 100 rb penduduk" memakai data ${SUMBER_PENDUDUK} (Satu Data Banten).`,
    'Deskripsi dihitung langsung dari data SiPEDULIKU pada saat laporan dibuat.',
  ].filter(Boolean);
  blok.push(`<section class="lb lap-foot"><h4>Catatan data</h4><ul>${catatan.map((c) => `<li>${c}</li>`).join('')}</ul><p id="aiFoot"></p></section>`);
  return blok.join('');
}

const kpi = (l: string, v: string) => `<div><span>${l}</span><b>${v}</b></div>`;

function bar(data: [string, number][], opt: { satuan: string; urut?: boolean }) {
  const isi = data.filter(([, v]) => opt.urut === false || v > 0);
  if (!isi.length) return '<p class="lap-kecil">Belum ada data.</p>';
  const mx = Math.max(1, ...isi.map(([, v]) => v));
  return `<ul class="lap-bar">${isi.map(([k, v]) => `<li><span class="lbn">${esc(k)}</span><span class="lbb"><i style="width:${Math.max(v ? 1.5 : 0, (v / mx) * 100)}%"></i></span><b>${angka(v)}</b></li>`).join('')}</ul><p class="lap-kecil">Satuan: jumlah ${opt.satuan}.</p>`;
}

function terbesar(d: DataLaporan) {
  if (!d.terbesar.length) return '';
  return `<h4 class="lap-sub">Lima kegiatan dengan peserta terbanyak</h4><table class="lap-tabel"><thead><tr><th>Kegiatan</th><th>Tanggal</th><th>Mode</th><th class="n">Peserta</th></tr></thead><tbody>${d.terbesar
    .map((k) => `<tr><td>${esc(k.judul.slice(0, 110))}${k.judul.length > 110 ? '…' : ''}<small>${esc(k.kabkota)}</small></td><td>${tanggalPendek(k.tanggal)}</td><td>${esc(k.mode || '–')}</td><td class="n">${angka(k.peserta)}</td></tr>`)
    .join('')}</tbody></table>`;
}

function tabelWilayah(d: DataLaporan, geo: Geo, sorot?: string) {
  const urut = [...d.perWilayah].sort((a, b) => b.kegiatan - a.kegiatan || b.peserta - a.peserta);
  const mk = Math.max(1, ...urut.map((w) => w.kegiatan));
  const mp = Math.max(1, ...urut.map((w) => w.peserta));
  const mr = Math.max(0.1, ...urut.map((w) => w.per100rb));
  const sel = (v: number, mx: number, teks: string) =>
    `<td><span class="lkb"><i style="width:${v ? Math.max(1.5, (v / mx) * 100) : 0}%"></i></span><b>${teks}</b></td>`;
  return `${petaKab(d, geo, sorot)}
  <table class="lap-tabel lap-kab"><colgroup><col style="width:19%"><col style="width:18%"><col style="width:23%"><col style="width:20%"><col style="width:20%"></colgroup><thead><tr><th>Kabupaten/kota</th><th>Kegiatan</th><th>Peserta</th><th>Per 100 rb penduduk</th><th>Kecamatan terjangkau</th></tr></thead><tbody>${urut
    .map(
      (w) =>
        `<tr class="${w.kegiatan ? '' : 'nol'}${sorot === w.nama ? ' sorot' : ''}"><td class="nm">${esc(w.nama.replace('Kabupaten ', 'Kab. '))}</td>${sel(w.kegiatan, mk, angka(w.kegiatan))}${sel(w.peserta, mp, angka(w.peserta))}${sel(w.per100rb, mr, desimal(w.per100rb))}${sel(
          w.kecTerjangkau,
          w.kecTotal,
          `${w.kecTerjangkau}/${w.kecTotal}`,
        ).replace('class="lkb"', 'class="lkb cak"')}</tr>`,
    )
    .join('')}</tbody></table>
  <p class="lap-kecil">Batang kegiatan, peserta, dan per 100 rb penduduk dibandingkan dengan kab/kota tertinggi; batang kecamatan menunjukkan porsi kecamatan di kab/kota itu yang sudah dijangkau. Penduduk: ${SUMBER_PENDUDUK}.</p>`;
}

function petaKab(d: DataLaporan, geo: Geo, sorot?: string) {
  const r = petaSvg(geo, d, 'kegiatan', false, 'kabkota');
  let svg = warnaSvg(r.svg);
  // Laporan satu kab/kota: wilayah lain dipudarkan.
  if (sorot)
    svg = svg.replace(/<path ([^>]*?)data-nama="([^"]+)"/g, (m, a, n) => (n.split('|')[0] === sorot ? m : `<path opacity="0.3" ${a}data-nama="${n}"`));
  const bl = batasLegenda(r.maks);
  const leg =
    `<span class="lg"><i style="background:${KOSONG}"></i>0</span>` +
    bl.map((t, i) => `<span class="lg"><i style="background:${SKALA[r.maks <= SKALA.length ? kelas(i + 1, r.maks) : i]}"></i>${t}</span>`).join('') +
    `<span class="lg-unit">kegiatan per kab/kota</span>`;
  return `<div class="peta lap-peta">${svg}</div><div class="legenda">${leg}</div>`;
}

// Warna ditulis langsung di elemen SVG supaya tetap benar saat diubah menjadi gambar untuk PDF.
function warnaSvg(svg: string) {
  return svg
    .replaceAll('class="wil kec"', 'style="stroke:#ffffff;stroke-width:0.6px;stroke-linejoin:round" class="wil kec"')
    .replaceAll('class="wil"', 'style="stroke:#ffffff;stroke-width:1.6px;stroke-linejoin:round" class="wil"')
    .replaceAll('class="batas-kab"', 'style="fill:none;stroke:#4a4650;stroke-width:1.1px;stroke-linejoin:round" class="batas-kab"')
    .replace(/(<g class="pl luar"[^>]*>)<path /g, '$1<path fill="none" stroke="#a39fa8" ')
    .replaceAll('<text ', '<text style="fill:#1c1a1d;stroke:rgba(255,255,255,0.92);stroke-width:3.5px;paint-order:stroke;stroke-linejoin:round" ');
}

function petaLaporan(d: DataLaporan, geo: Geo) {
  const r = petaSvg(geo, d, 'kegiatan', false, 'kecamatan');
  const bl = batasLegenda(r.maks);
  const leg =
    `<span class="lg"><i style="background:${KOSONG}"></i>0</span>` +
    bl.map((t, i) => `<span class="lg"><i style="background:${SKALA[r.maks <= SKALA.length ? kelas(i + 1, r.maks) : i]}"></i>${t}</span>`).join('') +
    `<span class="lg-unit">kegiatan per kecamatan</span>`;
  const svg = warnaSvg(r.svg);
  return `<div class="peta lap-peta">${svg}</div><div class="legenda">${leg}</div>`;
}

// ---------- PDF ----------

async function unduhPdf(el: HTMLElement, b: HTMLButtonElement, p: Periode, kab?: string) {
  if (sibuk) return;
  sibuk = true;
  const asli = b.innerHTML;
  b.disabled = true;
  b.textContent = 'Menyiapkan PDF…';
  const lap = $('#lap', el);
  lap.classList.add('cetak');
  try {
    const [{ toCanvas, getFontEmbedCSS }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
    await document.fonts?.ready;
    const opt: Record<string, unknown> = { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: false };
    try {
      opt.fontEmbedCSS = await getFontEmbedCSS(lap);
    } catch {
      opt.skipFonts = true;
    }
    const blok = [...lap.querySelectorAll<HTMLElement>('.lb')].filter((x) => !x.hidden);
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const M = 14,
      W = 182,
      atas = M,
      bawah = 297 - 16;
    let y = atas;
    for (let i = 0; i < blok.length; i++) {
      b.textContent = `Menyusun PDF… ${i + 1}/${blok.length}`;
      const c = await toCanvas(blok[i], opt);
      let w = W,
        h = (c.height / c.width) * W;
      if (h > bawah - atas) (w = (W * (bawah - atas)) / h), (h = bawah - atas);
      if (blok[i].classList.contains('sampul') && i === 0) {
        doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', M, 60, w, h);
        doc.addPage();
        y = atas;
        continue;
      }
      if (y + h > bawah && y > atas) (doc.addPage(), (y = atas));
      doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', M + (W - w) / 2, y, w, h);
      y += h + 6;
    }
    const n = doc.getNumberOfPages();
    for (let i = 2; i <= n; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 146, 155);
      doc.text(`SiPEDULIKU · Laporan edukasi ${kab ? kab + ' · ' : ''}${/^(Tahun|Triwulan)/.test(labelPeriode(p)) ? labelPeriode(p) : `${tanggalPendek(p.dari)} – ${tanggalPendek(p.sampai)}`}`, M, 289);
      doc.text(`Halaman ${i - 1} dari ${n - 1}`, 210 - M, 289, { align: 'right' });
    }
    doc.save(`sipeduliku-laporan-${kab ? kab.toLowerCase().replace(/[^a-z]+/g, '-') + '-' : ''}${/^(Tahun|Triwulan)/.test(labelPeriode(p)) ? labelPeriode(p).toLowerCase().replace(/\s+/g, '-') : `${p.dari}-sd-${p.sampai}`}.pdf`);
    toast('PDF laporan diunduh.');
  } catch (e: any) {
    toast('Gagal membuat PDF: ' + (e?.message || e), 'galat');
  } finally {
    lap.classList.remove('cetak');
    b.disabled = false;
    b.innerHTML = asli;
    sibuk = false;
  }
}

// Laporan satu kab/kota: peta kecamatan diperbesar ke wilayah itu.
function zoomKab(el: HTMLElement, kab: string) {
  const svg = el.querySelector<SVGSVGElement>('.lap-bag .lap-peta svg');
  if (!svg) return;
  const ps = [...svg.querySelectorAll<SVGGraphicsElement>('.wil')].filter((p) => p.dataset.nama!.split('|')[0] === kab);
  if (!ps.length) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of ps) {
    const b = p.getBBox();
    x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
  }
  const pad = Math.max(x1 - x0, y1 - y0) * 0.08;
  svg.setAttribute('viewBox', `${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`);
  svg.style.overflow = 'hidden';
  svg.querySelectorAll<SVGElement>('.wil').forEach((p) => {
    if (p.dataset.nama!.split('|')[0] !== kab) p.setAttribute('opacity', '0.25');
  });
  // Garis tetap tipis walau peta diperbesar.
  svg.querySelectorAll<SVGElement>('path').forEach((p) => p.style.setProperty('vector-effect', 'non-scaling-stroke'));
  svg.querySelectorAll('.pl').forEach((g) => g.remove()); // label kab/kota lain tidak relevan saat diperbesar
  // Nama kecamatan di tengah masing-masing wilayah.
  const fs = (x1 - x0) / 48;
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  for (const p of ps) {
    const nm = p.dataset.nama!.split('|')[1];
    if (!nm) continue;
    const b = p.getBBox();
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', String(b.x + b.width / 2));
    t.setAttribute('y', String(b.y + b.height / 2));
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('style', `font-size:${fs}px;font-weight:600;fill:#1c1a1d;stroke:rgba(255,255,255,0.9);stroke-width:${fs / 4}px;paint-order:stroke;pointer-events:none`);
    t.textContent = nm;
    g.appendChild(t);
  }
  svg.appendChild(g);
}
