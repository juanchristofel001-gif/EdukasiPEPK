// POST /api/ekstrak — membaca satu laporan kegiatan. Browser sudah mengubah file menjadi teks
// (PDF/Word) atau gambar kecil (scan/foto), lihat src/baca-file.ts.
// dan mengembalikan isian kegiatan untuk dicek tim. Tidak menyimpan apa pun.
import { izinkan, fail, ok, type Req, type Res } from './_lib/http.js';
import { generateJson, GeminiError, type Part } from './_lib/gemini.js';
import { KECAMATAN } from '../shared/kecamatan.js';
import { KABKOTA, KABKOTA_LAIN, MODE, BENTUK, JENIS, PERAN_OJK, SASARAN, TOPIK, KANAL, METODE, rapikan } from '../shared/schema.js';

const MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAKS = 4 * 1024 * 1024; // batas body Vercel 4,5 MB

const daftar = (l: readonly string[]) => l.map((x) => `"${x}"`).join(', ');

const PROMPT = `Kamu membaca laporan kegiatan edukasi keuangan Otoritas Jasa Keuangan (OJK) Provinsi Banten.
Ambil data kegiatan dari laporan dan jawab HANYA dengan satu objek JSON berikut:
{
 "judul": "nama kegiatan singkat",
 "tema": "judul materi/tema yang dibawakan, tanpa tanda kutip",
 "pengundang": "lembaga atau acara yang mengundang/bermitra (misal nama sekolah, kampus, instansi); kosong jika OJK sendiri",
 "peranOjk": salah satu dari [${daftar(PERAN_OJK)}],
 "tanggal": "YYYY-MM-DD (tanggal mulai)",
 "tanggalSelesai": "YYYY-MM-DD jika kegiatan lebih dari satu hari, selain itu \"\"",
 "jamMulai": "jam mulai kegiatan, format HH.MM (mis. \"09.30\"), atau \"\"",
 "jamSelesai": "jam sesi edukasi selesai/ditutup, format HH.MM, atau \"\"",
 "bentuk": salah satu dari [${daftar(BENTUK)}],
 "jenis": salah satu dari [${daftar(JENIS)}] (syariah jika materi keuangan syariah),
 "tempat": "tempat seperti tertulis di laporan",
 "kabkota": salah satu dari [${daftar([...KABKOTA, ...KABKOTA_LAIN])}],
 "kabkotaDitebak": true jika kabupaten/kota TIDAK tertulis di laporan dan kamu menyimpulkannya dari nama tempat, false jika tertulis,
 "kecamatan": nama kecamatan lokasi kegiatan, dipilih dari daftar kecamatan kabupaten/kota tersebut di bawah; "" jika daring/luar Banten atau benar-benar tidak bisa ditentukan,
 "kecamatanDitebak": true jika kecamatan TIDAK tertulis di laporan dan kamu menyimpulkannya dari nama/alamat tempat,
 "mode": salah satu dari [${daftar(MODE)}],
 "narasumber": ["nama narasumber"],
 "sasaran": array dari [${daftar(SASARAN)}],
 "sasaranDetail": "keterangan peserta singkat, misal 'Siswa kelas XII'",
 "peserta": angka jumlah peserta, atau null jika tidak disebut,
 "pesertaPerkiraan": true jika jumlah ditulis sebagai perkiraan ("kurang lebih", "sekitar", "±"),
 "topik": array dari [${daftar(TOPIK)}],
 "kanal": array kanal pengaduan/pengecekan yang dikenalkan, dari [${daftar(KANAL)}],
 "metode": array dari [${daftar(METODE)}],
 "ringkasan": "maksimal 2 kalimat: apa kegiatannya dan untuk siapa",
 "catatan": "maksimal 2 kalimat: respons peserta, kendala, atau pertanyaan yang menonjol; kosong jika tidak ada"
}
Aturan:
- Pakai nilai daftar persis seperti tertulis. Jika tidak ada yang cocok, pakai "Lainnya" (untuk sasaran/topik/kanal) atau "" (untuk pilihan tunggal).
- Jangan mengarang. Jika informasi tidak ada di laporan, isi "" atau null atau [].
- Jangan memasukkan nama peserta, NIK, nomor HP, atau data pribadi peserta ke kolom mana pun.
- Untuk menebak kab/kota dan kecamatan dari nama tempat (sekolah, kampus, desa, kantor), pakai pengetahuanmu tentang lokasi tempat itu di Banten.
- Nama penandatangan laporan BUKAN narasumber kecuali disebut sebagai pembawa materi.`;

const DAFTAR_KEC = Object.entries(KECAMATAN)
  .map(([k, l]) => `${k}: ${l.join(', ')}`)
  .join('\n');

const CONTOH = {
  judul: 'Edukasi Keuangan SMA Athalia Entrepreneurship Week 2026',
  tema: 'Belajar Bareng: Cerdas Financial di Dunia Digital',
  pengundang: 'SMA Athalia',
  peranOjk: 'Narasumber undangan',
  tanggal: '2026-11-12',
  tempat: 'SMA Athalia',
  kabkota: 'Kabupaten Tangerang',
  kabkotaDitebak: true,
  kecamatan: 'Kelapa Dua',
  kecamatanDitebak: true,
  mode: 'Luring',
  narasumber: ['Rija Fathul Bari'],
  sasaran: ['Pelajar SMA/SMK'],
  sasaranDetail: 'Siswa kelas XII',
  peserta: 100,
  pesertaPerkiraan: true,
  topik: ['Pengenalan OJK dan industri jasa keuangan', 'Pengelolaan keuangan pribadi', 'Penipuan digital/scam', 'Pinjol ilegal', 'Judi online', 'Investasi bodong', 'Perlindungan data pribadi'],
  kanal: ['Kontak OJK 157', 'IASC', 'SIPASTI'],
  metode: ['Paparan materi', 'Diskusi/tanya jawab', 'Kuis/games'],
  ringkasan: 'Edukasi keuangan untuk sekitar 100 siswa kelas XII SMA Athalia dalam rangka Entrepreneurship Week 2026.',
  catatan: 'Peserta antusias dan aktif dalam diskusi serta kuis Benar atau Salah.',
};

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return fail(res, 405, 'Gunakan POST.');
  if (!izinkan(req, res)) return;
  const b = (req.body || {}) as { nama?: string; teks?: string; gambar?: { mime?: string; data?: string }[] };
  const nama = String(b.nama || 'laporan').slice(0, 200);
  const parts: Part[] = [{ text: PROMPT + '\n\nDaftar kecamatan di Banten:\n' + DAFTAR_KEC }];
  const gambar = Array.isArray(b.gambar) ? b.gambar.slice(0, 8) : [];
  if (typeof b.teks === 'string' && b.teks.trim()) {
    parts.push({ text: 'Isi laporan:\n' + b.teks.slice(0, 60000) });
  } else if (gambar.length && gambar.every((g) => MIME.includes(String(g.mime)) && typeof g.data === 'string')) {
    if (gambar.reduce((s, g) => s + String(g.data).length * 0.75, 0) > MAKS) return fail(res, 413, 'Gambar laporan terlalu besar. Coba unggah ulang.');
    for (const g of gambar) parts.push({ inline_data: { mime_type: String(g.mime), data: String(g.data) } });
  } else {
    return fail(res, 400, 'Isi laporan tidak terbaca. Gunakan PDF, Word (.docx), JPG, atau PNG.');
  }

  try {
    let raw: any;
    let model = 'contoh';
    if (process.env.MOCK_AI && !process.env.VERCEL) raw = CONTOH;
    else {
      const r = await generateJson(parts, { temperature: 0.1, maxTokens: 8192 });
      raw = r.data;
      model = r.model;
    }
    const isian = rapikan({ ...raw, sumberFile: nama });
    return ok(res, { isian, model });
  } catch (e: any) {
    if (e instanceof GeminiError) return fail(res, e.status >= 400 && e.status < 600 ? e.status : 502, e.message);
    if (e instanceof SyntaxError) return fail(res, 502, 'Jawaban AI tidak terbaca. Coba unggah ulang.');
    return fail(res, 500, 'Gagal membaca laporan: ' + String(e?.message || e).slice(0, 200));
  }
}
