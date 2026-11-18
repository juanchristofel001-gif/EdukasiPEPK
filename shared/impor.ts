// Mengubah baris Excel/CSV menjadi isian kegiatan. Tidak bergantung pada browser, jadi bisa diuji di Node.
import { KABKOTA, KABKOTA_LAIN, MODE, PERAN_OJK, SASARAN, TOPIK, KANAL, METODE, BENTUK, JENIS, rapikan, type KegiatanInput } from './schema.js';
import { KECAMATAN } from './kecamatan.js';

export type Kolom = keyof KegiatanInput | '';

// Label kolom tujuan yang bisa dipilih saat mencocokkan judul kolom Excel.
export const KOLOM_TUJUAN: [Kolom, string][] = [
  ['', 'Abaikan kolom ini'],
  ['judul', 'Judul kegiatan'],
  ['tema', 'Tema / judul materi'],
  ['tanggal', 'Tanggal (mulai)'],
  ['tanggalSelesai', 'Tanggal selesai'],
  ['bentuk', 'Bentuk kegiatan'],
  ['jenis', 'Jenis (konvensional/syariah)'],
  ['tempat', 'Tempat / lokasi'],
  ['kabkota', 'Kabupaten/kota'],
  ['kecamatan', 'Kecamatan'],
  ['pengundang', 'Pengundang / mitra'],
  ['peranOjk', 'Peran OJK'],
  ['mode', 'Mode (luring/daring)'],
  ['narasumber', 'Narasumber'],
  ['sasaran', 'Sasaran peserta'],
  ['sasaranDetail', 'Keterangan peserta'],
  ['peserta', 'Jumlah peserta'],
  ['topik', 'Topik materi'],
  ['kanal', 'Kanal yang dikenalkan'],
  ['metode', 'Metode'],
  ['ringkasan', 'Ringkasan / keterangan'],
  ['catatan', 'Catatan lapangan'],
  ['dicatatOleh', 'Dicatat oleh / PIC'],
];

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Kata kunci judul kolom → kolom tujuan. Dicek berurutan dari yang paling spesifik; yang pertama cocok dipakai.
// Judul yang cocok dengan ABAIKAN tidak dipetakan (mis. provinsi, triwulan, nomor urut).
const ABAIKAN = /^(no|nomor|no urut)$|provinsi|ruang lingkup|triwulan|periode|^kojk$|^kantor ojk$|^satker$/;
const SINONIM: [Kolom, RegExp][] = [
  ['tanggalSelesai', /\b(tanggal|tgl) (berakhir|selesai|akhir)|\bsampai tanggal\b/],
  ['tanggal', /\b(tanggal|tgl)( mulai)?\b|\bhari tanggal\b|\bdate\b|\bwaktu pelaksanaan\b/],
  ['kecamatan', /\b(kec|kecamatan)\b/],
  ['kabkota', /\b(kab|kabupaten|kota|kab kota|kabupaten kota)\b|^wilayah$|^daerah$/],
  ['sasaran', /\b(sasaran|segmen|target peserta|kelompok sasaran|jenis peserta)\b/],
  ['peserta', /\b(jumlah peserta|jml peserta|total peserta)\b|^peserta$|^jumlah$|^jml$/],
  ['sasaranDetail', /\b(keterangan peserta|detail peserta|profil peserta)\b/],
  ['peranOjk', /\bperan\b/],
  ['narasumber', /\b(narasumber|pemateri|pembicara|nara sumber)\b/],
  ['pengundang', /\b(mitra|pengundang|penyelenggara|instansi|lembaga|kerja sama|kerjasama)\b/],
  ['bentuk', /\b(bentuk)\b/],
  ['jenis', /\b(jenis kegiatan|konvensional|syariah)\b|^jenis$/],
  ['mode', /\b(metode pelaksanaan|mode|luring|daring|online|offline)\b/],
  ['tema', /\b(tema|materi|judul materi)\b/],
  ['topik', /\b(topik|pokok bahasan|isu)\b/],
  ['kanal', /\b(kanal|layanan dikenalkan)\b/],
  ['metode', /\b(metode)\b/],
  ['tempat', /\b(tempat|lokasi|venue|alamat)\b/],
  ['catatan', /\b(catatan|kendala|evaluasi|tindak lanjut|respons|respon)\b/],
  ['ringkasan', /\b(ringkasan|keterangan|deskripsi|uraian|hasil)\b/],
  ['dicatatOleh', /\b(pic|petugas|dicatat|penginput|pelapor)\b/],
  ['judul', /\b(judul|nama kegiatan|kegiatan|acara|nama acara)\b/],
];

export function tebakKolom(judul: unknown[]): Kolom[] {
  const dipakai = new Set<Kolom>();
  return judul.map((j) => {
    const n = norm(j);
    if (!n || ABAIKAN.test(n)) return '';
    const hit = SINONIM.find(([k, re]) => re.test(n) && !dipakai.has(k));
    if (!hit) return '';
    // kolom daftar (topik, sasaran) boleh dari beberapa kolom; kolom tunggal hanya sekali
    if (!['topik', 'sasaran', 'kanal', 'metode', 'catatan', 'ringkasan', 'narasumber'].includes(hit[0])) dipakai.add(hit[0]);
    return hit[0];
  });
}

// Baris judul = baris pertama (dari 10 teratas) yang punya ≥ 3 sel teks dan bukan angka/tanggal.
export function cariBarisJudul(data: unknown[][]) {
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const teks = (data[i] || []).filter((c) => typeof c === 'string' && c.trim() && !/^\d+([.,]\d+)?$/.test(c.trim()));
    if (teks.length >= 3) return i;
  }
  return 0;
}

// ---------- nilai ----------
const BULAN: Record<string, number> = {
  jan: 1, januari: 1, january: 1, feb: 2, februari: 2, pebruari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4,
  mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, ags: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, nop: 11, nopember: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};
const z = (n: number) => String(n).padStart(2, '0');
const sah = (y: number, m: number, d: number) => {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return '';
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 ? `${y}-${z(m)}-${z(d)}` : '';
};

// Tanggal dari sel Excel (objek Date atau angka seri) atau teks (12/11/2026, 2026-11-12, "Kamis, 12 November 2026").
export function bacaTanggal(v: unknown, tahunBawaan?: number): string {
  if (v instanceof Date && !isNaN(+v)) return sah(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    const t = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
    return sah(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  const s = String(v ?? '').toLowerCase().trim();
  if (!s) return '';
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return sah(+m[1], +m[2], +m[3]);
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) return sah(+m[3], +m[2], +m[1]); // format Indonesia: hari/bulan/tahun
  m = s.match(/(\d{1,2})\s*(?:s\.?d\.?|-|–)?\s*(?:\d{1,2}\s*)?([a-z]+)\.?\s*(\d{4})?/);
  if (m && BULAN[m[2]]) return sah(m[3] ? +m[3] : tahunBawaan || new Date().getFullYear(), BULAN[m[2]], +m[1]);
  return '';
}

export function bacaAngka(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return Math.round(v);
  const m = String(v ?? '').replace(/\./g, '').match(/\d+/);
  return m ? +m[0] : null;
}
export const perkiraan = (v: unknown) => /(±|\+\/-|kurang lebih|sekitar|kurleb|lebih dari|>|approx)/i.test(String(v ?? ''));

function jarak(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const rapat = (s: string) => norm(s).replace(/\s/g, '');

export function bacaKabkota(v: unknown): string {
  const n = norm(v);
  if (!n) return '';
  if (/daring|online|zoom|virtual|webinar/.test(n)) return 'Daring (lintas wilayah)';
  const kota = /\bkota\b/.test(n) && !/kabupaten|\bkab\b/.test(n);
  const inti = n.replace(/\b(kabupaten|kab|kota|kotamadya|provinsi|banten)\b/g, '').trim();
  if (/tangsel|tangerang selatan/.test(n)) return 'Kota Tangerang Selatan';
  if (/cilegon/.test(inti)) return 'Kota Cilegon';
  if (/pandeglang/.test(inti)) return 'Kabupaten Pandeglang';
  if (/lebak/.test(inti)) return 'Kabupaten Lebak';
  if (/tangerang/.test(inti)) return kota ? 'Kota Tangerang' : 'Kabupaten Tangerang';
  if (/serang/.test(inti)) return kota ? 'Kota Serang' : 'Kabupaten Serang';
  const lain = [...KABKOTA, ...KABKOTA_LAIN].find((k) => norm(k) === n);
  if (lain) return lain;
  // nama kab/kota lain (mis. "Kota Adm. Jakarta Pusat", "Kab. Bogor") → Luar Banten
  if (/\b(kota|kab|kabupaten|jakarta|bogor|bekasi|depok|bandung|lampung)\b/.test(n)) return 'Luar Banten';
  return '';
}

// Kecamatan dengan toleransi salah ketik (jarak ≤ 2). Kalau kab/kota belum diketahui, dicari di seluruh Banten.
export function bacaKecamatan(kab: string, v: unknown): { kab: string; kec: string } {
  const h = rapat(String(v ?? '').replace(/^\s*kec(amatan|\.)?\s*/i, ''));
  if (!h) return { kab, kec: '' };
  const daftar = kab && KECAMATAN[kab] ? [[kab, KECAMATAN[kab]] as const] : (Object.entries(KECAMATAN) as [string, readonly string[]][]);
  const kandidat: { kab: string; kec: string; d: number }[] = [];
  for (const [k, l] of daftar)
    for (const c of l) {
      const d = jarak(rapat(c), h);
      if (d <= (h.length > 6 ? 2 : 1)) kandidat.push({ kab: k, kec: c, d });
    }
  kandidat.sort((a, b) => a.d - b.d);
  if (!kandidat.length) return { kab, kec: '' };
  // nama kecamatan yang sama di dua kab/kota (mis. Cibeber) tanpa kab/kota → jangan menebak
  if (!kab && kandidat.filter((c) => c.d === kandidat[0].d).length > 1) return { kab, kec: '' };
  return { kab: kandidat[0].kab, kec: kandidat[0].kec };
}

const KATA_SASARAN: [string, RegExp][] = [
  ['Pelajar SD/SMP', /\b(sd|smp|mts|mi|sekolah dasar|siswa smp|pelajar smp)\b/],
  ['Pelajar SMA/SMK', /\b(sma|smk|ma|slta)\b/],
  ['Pelajar (jenjang tidak disebut)', /\b(siswa|pelajar)\b/],
  ['Mahasiswa', /\b(mahasiswa|kampus|universitas|politeknik|stie|perguruan tinggi)\b/],
  ['Guru/dosen', /\b(guru|dosen|tenaga pendidik|pengajar)\b/],
  ['UMKM', /\b(umkm|umk|pelaku usaha|wirausaha|ukm)\b/],
  ['Pekerja/karyawan', /\b(pekerja|karyawan|buruh|pegawai swasta)\b/],
  ['ASN/TNI/Polri', /\b(asn|pns|tni|polri|aparatur)\b/],
  ['Ibu rumah tangga/komunitas perempuan', /\b(ibu|pkk|perempuan|majelis taklim|wanita|dharma wanita)\b/],
  ['Petani/nelayan', /\b(petani|nelayan|kelompok tani)\b/],
  ['Penyandang disabilitas', /\b(disabilitas|difabel|tunanetra|tunarungu)\b/],
  ['Pekerja migran', /\b(pmi|pekerja migran|tki)\b/],
  ['Komunitas', /\b(komunitas|organisasi|ormas|karang taruna|asosiasi)\b/],
  ['Masyarakat umum', /\b(masyarakat|umum|warga)\b/],
];
const KATA_TOPIK: [string, RegExp][] = [
  ['Pengenalan OJK dan industri jasa keuangan', /\b(pengenalan ojk|tentang ojk|ijk|sjk|sektor jasa keuangan|industri jasa keuangan|lembaga jasa keuangan)\b/],
  ['Pengelolaan keuangan pribadi', /\b(pengelolaan keuangan|perencanaan keuangan|keuangan pribadi|keuangan keluarga|budgeting|cerdas finansial|cerdas keuangan)\b/],
  ['Perbankan dan tabungan', /\b(bank|perbankan|tabung|tabungan|simpanan)\b/],
  ['Pasar modal dan investasi', /\b(pasar modal|saham|reksa dana|reksadana|investasi legal|obligasi)\b/],
  ['Asuransi', /\b(asuransi)\b/],
  ['Dana pensiun', /\b(pensiun|dapen)\b/],
  ['Pembiayaan dan pindar legal', /\b(pembiayaan|pindar|fintech lending|kredit)\b/],
  ['Pinjol ilegal', /\b(pinjol|pinjaman online ilegal)\b/],
  ['Investasi bodong', /\b(investasi bodong|investasi ilegal|bodong|skema ponzi)\b/],
  ['Waspada aktivitas keuangan ilegal', /\b(waspada|ilegal|aktivitas keuanga?n? ilegal|satgas pasti)\b/],
  ['Judi online', /\b(judi|judol)\b/],
  ['Penipuan digital/scam', /\b(penipuan|scam|phishing|social engineering|modus)\b/],
  ['Perlindungan data pribadi', /\b(data pribadi|pdp|kebocoran data)\b/],
  ['Perlindungan konsumen dan pengaduan', /\b(perlindungan konsumen|pelindungan konsumen|pengaduan|apk|appk|157)\b/],
  ['Keuangan syariah', /\b(syariah)\b/],
  ['Perkembangan ekonomi dan sektor jasa keuangan daerah', /\b(perkembangan ekonomi|kondisi ekonomi|perkembangan sektor|ekonomi prov|ekonomi daerah)\b/],
];
const KATA_KANAL: [string, RegExp][] = [
  ['Kontak OJK 157', /\b157\b/],
  ['IASC', /\biasc\b/],
  ['SIPASTI', /\bsipasti\b/],
  ['APPK', /\bappk\b/],
  ['SLIK/iDeb', /\b(slik|ideb)\b/],
];
const KATA_METODE: [string, RegExp][] = [
  ['Paparan materi', /\b(paparan|presentasi|sosialisasi|ceramah|materi)\b/],
  ['Diskusi/tanya jawab', /\b(diskusi|tanya jawab|dialog)\b/],
  ['Kuis/games', /\b(kuis|quiz|games|permainan)\b/],
  ['Pre-test/post-test', /\b(pre test|post test|pretest|posttest)\b/],
  ['Booth/pameran', /\b(booth|pameran|expo|stand)\b/],
  ['Simulasi/praktik', /\b(simulasi|praktik|praktek|workshop)\b/],
];
function pilihan(list: readonly string[], kata: [string, RegExp][], v: unknown): string[] {
  const out = new Set<string>();
  for (const bagian of String(v ?? '').split(/[;,\n/]|\bdan\b/i)) {
    const n = norm(bagian);
    if (!n) continue;
    const persis = list.find((x) => norm(x) === n);
    if (persis) out.add(persis);
    else for (const [nilai, re] of kata) if (re.test(n)) out.add(nilai);
  }
  return [...out];
}

export const bacaSasaran = (v: unknown) => pilihan(SASARAN, KATA_SASARAN, v);
export const bacaTopik = (v: unknown) => pilihan(TOPIK, KATA_TOPIK, v);
export const bacaKanal = (v: unknown) => pilihan(KANAL, KATA_KANAL, v);
export const bacaMetode = (v: unknown) => pilihan(METODE, KATA_METODE, v);
export function bacaMode(v: unknown) {
  const n = norm(v);
  if (/hybrid|hibrid/.test(n)) return 'Hybrid';
  if (/daring|online|zoom|virtual|webinar/.test(n)) return 'Daring';
  if (/luring|offline|tatap muka|langsung/.test(n)) return 'Luring';
  return MODE.find((m) => norm(m) === n) || '';
}
export function bacaBentuk(v: unknown) {
  const n = norm(v);
  if (!n) return '';
  const persis = BENTUK.find((b) => norm(b) === n);
  if (persis) return persis;
  if (/gerak syariah/.test(n)) return 'GERAK Syariah';
  if (/sosialisasi|edukasi|penyuluhan/.test(n)) return 'Sosialisasi';
  if (/workshop|lokakarya/.test(n)) return 'Workshop';
  if (/talkshow|talk show|dialog/.test(n)) return 'Talkshow';
  if (/seminar|webinar|kuliah umum/.test(n)) return 'Seminar';
  if (/pelatihan|tot|training|bimtek/.test(n)) return 'Pelatihan/ToT';
  if (/pameran|expo|bazar|festival|booth/.test(n)) return 'Pameran/expo';
  if (/siaran|radio|tv|televisi|podcast/.test(n)) return 'Siaran media';
  return 'Lainnya';
}
export function bacaJenis(v: unknown) {
  const n = norm(v);
  if (/konvensional/.test(n) && /syariah/.test(n)) return 'Konvensional dan Syariah';
  if (/syariah/.test(n)) return 'Syariah';
  if (/konvensional/.test(n)) return 'Konvensional';
  return JENIS.find((j) => norm(j) === n) || '';
}
export function bacaPeran(v: unknown) {
  const n = norm(v);
  if (/narasumber|undang/.test(n)) return 'Narasumber undangan';
  if (/kolaborasi|kerja ?sama|bersama/.test(n)) return 'Kolaborasi dengan mitra';
  if (/penyelenggara|mandiri|ojk/.test(n)) return 'Penyelenggara';
  return PERAN_OJK.find((m) => norm(m) === n) || '';
}

// Kecamatan yang disebut di teks (judul/tempat), mis. "… di Kecamatan Mauk" atau "… di Pakuhaji".
// Hanya dipakai kalau tepat satu kecamatan dari kab/kota itu yang disebut.
export function kecamatanDariTeks(kab: string, teks: string): string {
  const l = KECAMATAN[kab];
  if (!l) return '';
  const t = ' ' + norm(teks) + ' ';
  // harus didahului "di", "kecamatan", atau "kec" supaya nama kampus (mis. "Sultan Ageng Tirtayasa") tidak ikut terbaca
  const pasti = l.filter((k) => [' di ', ' kecamatan ', ' kec '].some((p) => t.includes(p + norm(k) + ' ')));
  return pasti.length === 1 ? pasti[0] : '';
}

export type Baris = {
  no: number; // nomor baris di Excel
  isian: KegiatanInput;
  catatan: string[]; // hal yang perlu dicek
};

// Satu baris Excel → isian kegiatan + daftar hal yang perlu dicek.
export function barisKeIsian(sel: unknown[], peta: Kolom[], namaFile: string, no: number, tahunBawaan?: number): Baris {
  const ambil = (k: Kolom) => peta.map((p, i) => (p === k ? sel[i] : undefined)).filter((x) => x !== undefined && x !== null && String(x).trim() !== '');
  const satu = (k: Kolom) => ambil(k)[0];
  const teks = (k: Kolom) => ambil(k).map((x) => String(x).trim()).join('; ');
  const catatan: string[] = [];

  const tglMentah = satu('tanggal');
  const tanggal = bacaTanggal(tglMentah, tahunBawaan);
  if (tglMentah !== undefined && !tanggal) catatan.push(`Tanggal "${String(tglMentah).slice(0, 30)}" tidak terbaca`);

  let kab = bacaKabkota(satu('kabkota'));
  if (satu('kabkota') !== undefined && !kab) catatan.push(`Kab/kota "${String(satu('kabkota')).slice(0, 30)}" tidak dikenali`);
  if (kab === 'Luar Banten') catatan.push(`"${String(satu('kabkota')).slice(0, 40)}" di luar Banten`);
  if (kab && /^(serang|tangerang)$/.test(norm(satu('kabkota')))) catatan.push(`"${String(satu('kabkota'))}" dianggap ${kab}; pastikan bukan kota`);
  const kecMentah = satu('kecamatan');
  const kc = bacaKecamatan(kab, kecMentah);
  let kabDitebak = false;
  if (!kab && kc.kab) {
    kab = kc.kab;
    kabDitebak = true;
  }
  if (kecMentah !== undefined && !kc.kec) catatan.push(`Kecamatan "${String(kecMentah).slice(0, 30)}" tidak ditemukan${kab ? ' di ' + kab : ''}`);

  let kecDariJudul = '';
  if (!kc.kec && kecMentah === undefined && kab) {
    kecDariJudul = kecamatanDariTeks(kab, [teks('judul'), teks('tempat'), teks('pengundang')].join(' '));
    if (kecDariJudul) catatan.push(`Kecamatan ${kecDariJudul} diambil dari judul/tempat`);
  }

  const pMentah = satu('peserta');
  const peserta = bacaAngka(pMentah);
  if (pMentah !== undefined && peserta === null) catatan.push(`Jumlah peserta "${String(pMentah).slice(0, 20)}" bukan angka`);

  const sasaranTeks = teks('sasaran');
  const sasaran = bacaSasaran(sasaranTeks);
  if (sasaranTeks && !sasaran.length) catatan.push(`Sasaran "${sasaranTeks.slice(0, 30)}" tidak dikenali`);

  const isian = rapikan({
    judul: teks('judul') || teks('tema'),
    tema: teks('tema'),
    pengundang: teks('pengundang'),
    peranOjk: bacaPeran(satu('peranOjk')),
    tanggal,
    tanggalSelesai: bacaTanggal(satu('tanggalSelesai'), tahunBawaan),
    bentuk: bacaBentuk(satu('bentuk')),
    jenis: bacaJenis(satu('jenis')),
    tempat: teks('tempat'),
    kabkota: kab,
    kabkotaDitebak: kabDitebak,
    kecamatan: kc.kec || kecDariJudul,
    kecamatanDitebak: !!kecDariJudul,
    mode: bacaMode(satu('mode')),
    narasumber: teks('narasumber'),
    sasaran: sasaran.length ? sasaran : bacaSasaran(teks('sasaranDetail')),
    sasaranDetail: teks('sasaranDetail') || (sasaranTeks && !sasaran.length ? sasaranTeks : ''),
    peserta,
    pesertaPerkiraan: perkiraan(pMentah),
    topik: bacaTopik([teks('topik'), teks('tema')].join('; ')),
    kanal: bacaKanal([teks('kanal'), teks('ringkasan'), teks('catatan')].join('; ')),
    metode: bacaMetode(teks('metode')),
    ringkasan: teks('ringkasan'),
    catatan: teks('catatan'),
    sumberFile: namaFile,
    dicatatOleh: teks('dicatatOleh'),
  });
  return { no, isian, catatan };
}

const judulRapat = (s: string) => norm(s).replace(/\b(edukasi|keuangan|kegiatan|sosialisasi|literasi|ojk)\b/g, '').replace(/\s+/g, ' ').trim();
// Kunci untuk mendeteksi kegiatan ganda: tanggal + kab/kota + judul inti.
export const kunciGanda = (k: Pick<KegiatanInput, 'tanggal' | 'kabkota' | 'judul'>) => `${k.tanggal}|${k.kabkota}|${judulRapat(k.judul)}`;
