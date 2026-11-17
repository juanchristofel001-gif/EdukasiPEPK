// Halaman Dasbor: posisi terkini edukasi di Banten, siap dibaca dan disalin saat ada yang bertanya.
import { KABKOTA, type Kegiatan } from '../../shared/schema.js';
import { statistik, teksStatus, namaBulan, tanggalPanjang, tanggalPendek, angka, type Periode, type Statistik } from '../../shared/statistik.js';
import { api } from '../api.js';
import { dataKegiatan } from '../data.js';
import { esc, $, hariIni, selisihHari, salin, toast } from '../ui.js';

let pilihan = 'tahun';

function periodeDari(p: string, semua: Kegiatan[]): Periode {
  const h = hariIni();
  const y = h.slice(0, 4);
  if (p === 'tahun') return { dari: `${y}-01-01`, sampai: `${y}-12-31` };
  if (p === '12bulan') {
    const d = new Date(h + 'T00:00:00');
    d.setMonth(d.getMonth() - 11, 1);
    return { dari: d.toISOString().slice(0, 7) + '-01', sampai: h };
  }
  if (/^\d{4}$/.test(p)) return { dari: `${p}-01-01`, sampai: `${p}-12-31` };
  const tgl = semua.map((k) => k.tanggal).sort();
  return { dari: (tgl[0] || h).slice(0, 7) + '-01', sampai: tgl[tgl.length - 1] > h ? tgl[tgl.length - 1] : h };
}

export async function viewDasbor(el: HTMLElement) {
  el.innerHTML = `<div class="memuat besar"><i></i><i></i><i></i></div>`;
  let semua: Kegiatan[];
  try {
    semua = await dataKegiatan();
  } catch (e: any) {
    el.innerHTML = `<p class="galat">${esc(e.message)}</p>`;
    return;
  }
  const tahun = [...new Set(semua.map((k) => k.tanggal.slice(0, 4)))].sort().reverse();
  const p = periodeDari(pilihan, semua);
  const s = statistik(semua, p);
  const h = hariIni();

  el.innerHTML = `
  <header class="judul-hal dasbor-head">
    <div><h1>Edukasi keuangan di Banten</h1>
    <p>${tanggalPanjang(p.dari)} – ${tanggalPanjang(p.sampai)}</p></div>
    <div class="kontrol">
      <select id="periode" aria-label="Periode">
        <option value="tahun">Tahun ini</option><option value="12bulan">12 bulan terakhir</option>
        ${tahun.filter((y) => y !== h.slice(0, 4)).map((y) => `<option value="${y}">Tahun ${y}</option>`).join('')}
        <option value="semua">Semua data</option>
      </select>
      <button class="btn utama" id="salin">Salin status</button>
    </div>
  </header>
  ${semua.length ? isi(s, semua, p, h) : kosongHtml()}`;

  const sel = $<HTMLSelectElement>('#periode', el);
  sel.value = pilihan;
  sel.onchange = () => {
    pilihan = sel.value;
    viewDasbor(el);
  };
  $('#salin', el).onclick = async () => {
    await salin(teksStatus(s, h));
    toast('Status disalin. Tinggal tempel di WhatsApp atau email.');
  };
  if (semua.length) pasangInsight(el, p);
}

function kosongHtml() {
  return `<section class="kartu kosong"><h2>Belum ada kegiatan tercatat</h2><p>Mulai dengan mengunggah laporan kegiatan edukasi. AI akan mengisi datanya untuk kamu cek.</p><a class="btn utama" href="#/unggah">Unggah laporan</a></section>`;
}

function isi(s: Statistik, semua: Kegiatan[], p: Periode, h: string) {
  return `
  <section class="kpi">
    <div><span>Kegiatan</span><b>${angka(s.kegiatan)}</b></div>
    <div><span>Peserta</span><b>${s.adaPerkiraan ? '<small>±</small>' : ''}${angka(s.peserta)}</b></div>
    <div><span>Kabupaten/kota terjangkau</span><b>${s.wilayahTerjangkau}<small> / ${KABKOTA.length}</small></b></div>
    <div><span>Rata-rata peserta</span><b>${s.kegiatan ? angka(Math.round(s.peserta / s.kegiatan)) : 0}</b></div>
  </section>
  <section class="kartu wilayah">
    <div class="kartu-judul"><h2>Sebaran per kabupaten/kota</h2><span class="sub">Jumlah kegiatan, peserta, dan kapan terakhir dijangkau</span></div>
    ${wilayahHtml(s, h)}
  </section>
  <div class="dua">
    <section class="kartu"><div class="kartu-judul"><h2>Tren bulanan</h2><span class="sub">Jumlah kegiatan per bulan</span></div>${trenHtml(s)}</section>
    <section class="kartu" id="insight"><div class="kartu-judul"><h2>Insight AI</h2><span class="sub">Tafsiran dari angka di halaman ini</span></div><div class="ins-isi"><div class="memuat"><i></i><i></i><i></i></div></div></section>
  </div>
  <div class="dua">
    <section class="kartu"><div class="kartu-judul"><h2>Sasaran peserta</h2><span class="sub">Jumlah kegiatan per sasaran</span></div>${batang(s.sasaran)}</section>
    <section class="kartu"><div class="kartu-judul"><h2>Topik materi</h2><span class="sub">Jumlah kegiatan yang membawakan topik ini</span></div>${batang(s.topik, 8)}</section>
  </div>
  <section class="kartu"><div class="kartu-judul"><h2>Kegiatan terbaru</h2><a class="teks" href="#/kegiatan">Lihat semua</a></div>${terbaru(semua, p)}</section>`;
}

function wilayahHtml(s: Statistik, h: string) {
  const mx = Math.max(1, ...s.perWilayah.map((w) => w.kegiatan));
  const urut = [...s.perWilayah].sort((a, b) => b.kegiatan - a.kegiatan || b.peserta - a.peserta);
  return `<ol class="wl">${urut
    .map((w) => {
      const lama = w.terakhir ? selisihHari(w.terakhir, h) : null;
      const ket = !w.kegiatan
        ? '<span class="tag merah">Belum ada kegiatan</span>'
        : `<span class="kapan${lama! > 90 ? ' lama' : ''}">Terakhir ${tanggalPendek(w.terakhir!)}${lama! > 0 ? ` · ${lama} hari lalu` : ''}</span>`;
      return `<li class="${w.kegiatan ? '' : 'nol'}"><span class="wn">${w.nama}</span>
        <span class="bar"><i style="width:${(w.kegiatan / mx) * 100}%"></i></span>
        <span class="wk"><b>${w.kegiatan}</b> kegiatan</span><span class="wp">${angka(w.peserta)} peserta</span>${ket}</li>`;
    })
    .join('')}</ol>`;
}

function trenHtml(s: Statistik) {
  const bulan = s.perBulan.slice(-12);
  const mx = Math.max(1, ...bulan.map((b) => b.kegiatan));
  return `<div class="tren" role="img" aria-label="Jumlah kegiatan per bulan">${bulan
    .map(
      (b) =>
        `<div class="tb" title="${namaBulan(b.bulan)}: ${b.kegiatan} kegiatan, ${angka(b.peserta)} peserta"><span class="tv">${b.kegiatan || ''}</span><i style="height:${
          (b.kegiatan / mx) * 100
        }%"></i><span class="tl">${namaBulan(b.bulan).slice(0, 3)}</span></div>`,
    )
    .join('')}</div>`;
}

function batang(data: [string, number][], n = 13) {
  if (!data.length) return '<p class="sub">Belum ada data.</p>';
  const mx = data[0][1];
  return `<ul class="hb">${data
    .slice(0, n)
    .map(([k, v]) => `<li><span class="hn">${esc(k)}</span><span class="bar"><i style="width:${(v / mx) * 100}%"></i></span><b>${v}</b></li>`)
    .join('')}</ul>`;
}

function terbaru(semua: Kegiatan[], p: Periode) {
  const l = semua.filter((k) => k.tanggal >= p.dari && k.tanggal <= p.sampai).slice(0, 5);
  if (!l.length) return '<p class="sub">Tidak ada kegiatan di periode ini.</p>';
  return `<ul class="baru">${l
    .map(
      (k) =>
        `<li><a href="#/kegiatan/${k.id}"><span class="bt">${tanggalPanjang(k.tanggal)}</span><span class="bj">${esc(k.judul)}</span><span class="bm">${esc(
          k.kabkota,
        )} · ${k.pesertaPerkiraan ? '±' : ''}${angka(k.peserta || 0)} peserta</span></a></li>`,
    )
    .join('')}</ul>`;
}

async function pasangInsight(el: HTMLElement, p: Periode) {
  const box = $('#insight .ins-isi', el);
  const gambar = (ins: Awaited<ReturnType<typeof api.insight>>, galat = '') => {
    if (!box.isConnected) return;
    const t = ins ? new Date(ins.dibuat) : null;
    box.innerHTML = `${galat ? `<p class="galat">${esc(galat)}</p>` : ''}${
      ins
        ? `<p class="ins-ring">${esc(ins.ringkasan)}</p>
      ${ins.temuan.length ? `<h3>Temuan</h3><ul>${ins.temuan.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${ins.saran.length ? `<h3>Saran tindak lanjut</h3><ul>${ins.saran.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <p class="sub">Dibuat ${t!.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} dari ${ins.jumlahData} kegiatan.</p>`
        : '<p class="sub">Belum ada insight untuk periode ini.</p>'
    }<button class="btn" id="buatIns">${ins ? 'Perbarui insight' : 'Buat insight'}</button>`;
    $('#buatIns', box).onclick = async (e) => {
      const b = e.currentTarget as HTMLButtonElement;
      b.disabled = true;
      b.textContent = 'AI sedang menganalisis…';
      try {
        gambar(await api.insight(p.dari, p.sampai, true));
      } catch (err: any) {
        gambar(ins, err.message);
      }
    };
  };
  try {
    gambar(await api.insight(p.dari, p.sampai));
  } catch (e: any) {
    gambar(null, e.message);
  }
}
