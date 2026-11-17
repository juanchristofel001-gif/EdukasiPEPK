// Halaman Dasbor: posisi terkini edukasi di Banten, siap dibaca dan disalin saat ada yang bertanya.
import { KABKOTA, type Kegiatan } from '../../shared/schema.js';
import { statistik, teksStatus, namaBulan, tanggalPanjang, tanggalPendek, angka, type Periode, type Statistik } from '../../shared/statistik.js';
import { api } from '../api.js';
import { dataKegiatan } from '../data.js';
import { esc, $, $$, hariIni, selisihHari, salin, toast } from '../ui.js';
import { muatPeta, petaSvg, tooltipHtml, batasLegenda, SKALA, KOSONG, type Ukuran } from './peta.js';
import { IKON } from '../ikon.js';

let pilihan = 'tahun';
let ukuran: Ukuran = 'kegiatan';

function periodeDari(p: string, semua: Kegiatan[]): Periode {
  const h = hariIni();
  const y = h.slice(0, 4);
  if (p === 'tahun') return { dari: `${y}-01-01`, sampai: `${y}-12-31` };
  if (p === '12bulan') {
    const d = new Date(h + 'T00:00:00');
    d.setMonth(d.getMonth() - 11, 1);
    return { dari: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, sampai: h };
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
  const h = hariIni();
  const tahunLain = [...new Set(semua.map((k) => k.tanggal.slice(0, 4)))].filter((y) => y !== h.slice(0, 4)).sort().reverse();
  const p = periodeDari(pilihan, semua);
  const s = statistik(semua, p);
  const opsi: [string, string][] = [
    ['tahun', 'Tahun ini'],
    ['12bulan', '12 bulan'],
    ...tahunLain.map((y): [string, string] => [y, y]),
    ['semua', 'Semua'],
  ];

  el.innerHTML = `
  <header class="ph">
    <div><h1>Dasbor edukasi</h1><p>${tanggalPanjang(p.dari)} – ${tanggalPanjang(p.sampai)}</p></div>
    <div class="kontrol">
      <div class="seg" role="group" aria-label="Periode">${opsi.map(([v, t]) => `<button data-p="${v}" class="${v === pilihan ? 'on' : ''}">${t}</button>`).join('')}</div>
    </div>
  </header>
  ${semua.length ? isi(s, semua, p, h) : kosongHtml()}`;

  $$<HTMLButtonElement>('.seg [data-p]', el).forEach(
    (b) =>
      (b.onclick = () => {
        pilihan = b.dataset.p!;
        viewDasbor(el);
      }),
  );
  if (!semua.length) return;
  $('#salin', el).onclick = async () => {
    await salin(teksStatus(s, h));
    toast('Status disalin. Tinggal tempel di WhatsApp atau email.');
  };
  pasangPeta(el, s);
  pasangInsight(el, p);
}

function kosongHtml() {
  return `<section class="kartu kosong"><span class="kosong-ikon">${IKON.unggah}</span><h2>Belum ada kegiatan tercatat</h2><p>Mulai dengan mengunggah laporan kegiatan edukasi. AI akan mengisi datanya untuk kamu cek.</p><a class="btn utama" href="#/unggah">Unggah laporan</a></section>`;
}

function isi(s: Statistik, semua: Kegiatan[], p: Periode, h: string) {
  const belum = s.perWilayah.filter((w) => !w.kegiatan);
  return `
  <section class="hero">
    <div class="hero-utama">
      <span class="hero-lbl">Kegiatan edukasi keuangan</span>
      <b class="hero-angka">${angka(s.kegiatan)}</b>
      <span class="hero-sub">${s.kegiatan ? `Kegiatan terakhir ${tanggalPanjang(semua.filter((k) => k.tanggal >= p.dari && k.tanggal <= p.sampai)[0].tanggal)}` : 'Belum ada kegiatan di periode ini'}</span>
      <div class="hero-aksi"><button class="btn putih" id="salin">${IKON.salin}Salin status</button><a class="btn kaca" href="#/unggah">${IKON.unggah}Unggah laporan</a></div>
    </div>
    <div class="hero-stat">
      <div><span>Peserta</span><b>${s.adaPerkiraan ? '<small>±</small>' : ''}${angka(s.peserta)}</b></div>
      <div><span>Wilayah terjangkau</span><b>${s.wilayahTerjangkau}<small>/${KABKOTA.length}</small></b></div>
      <div><span>Rata-rata peserta</span><b>${s.kegiatan ? angka(Math.round(s.peserta / s.kegiatan)) : 0}</b></div>
      <div><span>Belum dijangkau</span><b class="kecil">${belum.length ? belum.map((w) => esc(w.nama.replace('Kabupaten ', 'Kab. '))).join(', ') : 'Semua terjangkau'}</b></div>
    </div>
  </section>
  <div class="dash">
    <section class="kartu sp8 peta-kartu">
      <div class="ch"><div><h2>Peta sebaran</h2><p class="sub">Makin gelap, makin banyak ${ukuran}</p></div>
        <div class="seg kecil" role="group" aria-label="Ukuran peta"><button data-u="kegiatan" class="${ukuran === 'kegiatan' ? 'on' : ''}">Kegiatan</button><button data-u="peserta" class="${ukuran === 'peserta' ? 'on' : ''}">Peserta</button></div></div>
      <div class="peta" id="peta"><div class="memuat besar"><i></i><i></i><i></i></div></div>
      <div class="legenda" id="legenda"></div>
      <div class="tip" id="tip" hidden></div>
    </section>
    <section class="kartu sp4">
      <div class="ch"><div><h2>Per kabupaten/kota</h2><p class="sub">Urut dari kegiatan terbanyak</p></div></div>
      ${wilayahHtml(s, h)}
    </section>
    <section class="kartu sp7"><div class="ch"><div><h2>Tren bulanan</h2><p class="sub">Jumlah kegiatan per bulan</p></div></div>${trenHtml(s)}</section>
    <section class="kartu sp5" id="insight"><div class="ch"><div><h2>Insight AI</h2><p class="sub">Tafsiran dari angka di halaman ini</p></div></div><div class="ins-isi"><div class="memuat"><i></i><i></i><i></i></div></div></section>
    <section class="kartu sp6"><div class="ch"><div><h2>Sasaran peserta</h2><p class="sub">Jumlah kegiatan per sasaran</p></div></div>${batang(s.sasaran)}</section>
    <section class="kartu sp6"><div class="ch"><div><h2>Topik materi</h2><p class="sub">Jumlah kegiatan yang membawakan topik ini</p></div></div>${batang(s.topik, 8)}</section>
    <section class="kartu sp12"><div class="ch"><div><h2>Kegiatan terbaru</h2><p class="sub">Lima kegiatan terakhir di periode ini</p></div><a class="lnk" href="#/kegiatan">Lihat semua</a></div>${terbaru(semua, p)}</section>
  </div>`;
}

function wilayahHtml(s: Statistik, h: string) {
  const urut = [...s.perWilayah].sort((a, b) => b.kegiatan - a.kegiatan || b.peserta - a.peserta);
  return `<ol class="wl">${urut
    .map((w) => {
      const lama = w.terakhir ? selisihHari(w.terakhir, h) : null;
      const ket = !w.kegiatan
        ? '<span class="tag merah">Belum ada kegiatan</span>'
        : `<span class="kapan${lama! > 90 ? ' lama' : ''}">${tanggalPendek(w.terakhir!)}${lama! > 0 ? ` · ${lama} hari lalu` : ''}</span>`;
      return `<li class="${w.kegiatan ? '' : 'nol'}" data-nama="${esc(w.nama)}"><div class="wl-k"><span class="wn">${w.nama.replace('Kabupaten ', 'Kab. ')}</span>${ket}</div><div class="wl-n"><b>${w.kegiatan}</b><span>${angka(w.peserta)} peserta</span></div></li>`;
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
  if (!data.length) return '<p class="kosong-kecil">Belum ada data.</p>';
  const mx = data[0][1];
  return `<ul class="hb">${data
    .slice(0, n)
    .map(([k, v]) => `<li><span class="hn" title="${esc(k)}">${esc(k)}</span><span class="bar"><i style="width:${(v / mx) * 100}%"></i></span><b>${v}</b></li>`)
    .join('')}</ul>`;
}

function terbaru(semua: Kegiatan[], p: Periode) {
  const l = semua.filter((k) => k.tanggal >= p.dari && k.tanggal <= p.sampai).slice(0, 5);
  if (!l.length) return '<p class="kosong-kecil">Tidak ada kegiatan di periode ini.</p>';
  return `<ul class="baru">${l
    .map(
      (k) =>
        `<li><a href="#/kegiatan/${k.id}"><span class="bt">${tanggalPendek(k.tanggal)}</span><span class="bj">${esc(k.judul)}</span><span class="bm">${esc(
          k.kabkota,
        )} · ${k.pesertaPerkiraan ? '±' : ''}${angka(k.peserta || 0)} peserta</span></a></li>`,
    )
    .join('')}</ul>`;
}

async function pasangPeta(el: HTMLElement, s: Statistik) {
  const box = $('#peta', el),
    tip = $('#tip', el),
    leg = $('#legenda', el),
    kartu = $('.peta-kartu', el);
  let wil;
  try {
    wil = await muatPeta();
  } catch (e: any) {
    box.innerHTML = `<p class="galat">${esc(e.message)}</p>`;
    return;
  }
  const gambar = () => {
    if (!box.isConnected) return;
    box.innerHTML = petaSvg(wil, s, ukuran, box.clientWidth < 520);
    const maks = Math.max(0, ...s.perWilayah.map((w) => (ukuran === 'kegiatan' ? w.kegiatan : w.peserta)));
    const bl = batasLegenda(maks);
    leg.innerHTML =
      `<span class="lg"><i style="background:${KOSONG}"></i>0</span>` +
      bl.map((t, i) => `<span class="lg"><i style="background:${SKALA[bl.length === SKALA.length ? i : Math.round((i / Math.max(1, bl.length - 1)) * (SKALA.length - 1))]}"></i>${t}</span>`).join('') +
      `<span class="lg-unit">${ukuran}</span>`;
    $('.sub', kartu).textContent = `Makin gelap, makin banyak ${ukuran}`;
  };
  gambar();
  $$<HTMLButtonElement>('[data-u]', kartu).forEach(
    (b) =>
      (b.onclick = () => {
        ukuran = b.dataset.u as Ukuran;
        $$('[data-u]', kartu).forEach((x) => x.classList.toggle('on', x === b));
        gambar();
      }),
  );
  const sorot = (nama: string | null) => {
    $$('.wil', box).forEach((p) => p.classList.toggle('aktif', p.dataset.nama === nama));
    $$('.wl li', el).forEach((li) => li.classList.toggle('aktif', li.dataset.nama === nama));
  };
  const tampil = (nama: string, x: number, y: number) => {
    const r = kartu.getBoundingClientRect();
    tip.innerHTML = tooltipHtml(nama, s);
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(8, Math.min(r.width - tw - 8, x - r.left - tw / 2)) + 'px';
    tip.style.top = y - r.top - tip.offsetHeight - 14 + 'px';
    sorot(nama);
  };
  const sembunyi = () => {
    tip.hidden = true;
    sorot(null);
  };
  box.addEventListener('pointermove', (e) => {
    const p = (e.target as Element).closest<SVGPathElement>('.wil');
    if (p) tampil(p.dataset.nama!, e.clientX, e.clientY);
    else sembunyi();
  });
  box.addEventListener('pointerleave', sembunyi);
  box.addEventListener('focusin', (e) => {
    const p = (e.target as Element).closest<SVGPathElement>('.wil');
    if (!p) return;
    const b = p.getBoundingClientRect();
    tampil(p.dataset.nama!, b.left + b.width / 2, b.top + b.height / 2);
  });
  box.addEventListener('focusout', sembunyi);
  $$('.wl li', el).forEach((li) => {
    li.addEventListener('pointerenter', () => sorot(li.dataset.nama!));
    li.addEventListener('pointerleave', () => sorot(null));
  });
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
      <p class="catatan-kecil">Dibuat ${t!.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })} dari ${ins.jumlahData} kegiatan.</p>`
        : '<p class="kosong-kecil kiri">Belum ada insight untuk periode ini. AI akan membaca angka di dasbor dan catatan lapangan, lalu menuliskan temuan dan saran.</p>'
    }<button class="btn lembut" id="buatIns">${IKON.kilau}${ins ? 'Perbarui insight' : 'Buat insight'}</button>`;
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
