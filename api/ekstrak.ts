// POST /api/ekstrak — membaca satu laporan kegiatan (PDF, gambar, atau teks dari Word)
// dan mengembalikan isian kegiatan untuk dicek tim. Tidak menyimpan apa pun.
import { izinkan, fail, ok, type Req, type Res } from './_lib/http.js';
import { generate, parseJson, GeminiError, type Part } from './_lib/gemini.js';
import { KABKOTA, KABKOTA_LAIN, MODE, PERAN_OJK, SASARAN, TOPIK, KANAL, METODE, rapikan } from '../shared/schema.js';

const MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAKS = 4 * 1024 * 1024; // batas body Vercel 4,5 MB

const daftar = (l: readonly string[]) => l.map((x) => `"${x}"`).join(', ');

const PROMPT = `Kamu membaca laporan kegiatan edukasi keuangan Otoritas Jasa Keuangan (OJK) Provinsi Banten.
Ambil data kegiatan dari laporan dan jawab HANYA dengan satu objek JSON berikut:
{
 "judul": "nama kegiatan singkat",
 "tema": "judul materi/tema yang dibawakan, tanpa tanda kutip",
 "pengundang": "lembaga atau acara yang mengundang/bermitra (misal nama sekolah, kampus, instansi); kosong jika OJK sendiri",
 "peranOjk": salah satu dari [${daftar(PERAN_OJK)}],
 "tanggal": "YYYY-MM-DD",
 "tempat": "tempat seperti tertulis di laporan",
 "kabkota": salah satu dari [${daftar([...KABKOTA, ...KABKOTA_LAIN])}],
 "kabkotaDitebak": true jika kabupaten/kota TIDAK tertulis di laporan dan kamu menyimpulkannya dari nama tempat, false jika tertulis,
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
- Nama penandatangan laporan BUKAN narasumber kecuali disebut sebagai pembawa materi.`;

const CONTOH = {
  judul: 'Edukasi Keuangan SMA Athalia Entrepreneurship Week 2026',
  tema: 'Belajar Bareng: Cerdas Financial di Dunia Digital',
  pengundang: 'SMA Athalia',
  peranOjk: 'Narasumber undangan',
  tanggal: '2026-11-12',
  tempat: 'SMA Athalia',
  kabkota: 'Kabupaten Tangerang',
  kabkotaDitebak: true,
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
  const b = (req.body || {}) as { nama?: string; mime?: string; data?: string; teks?: string };
  const nama = String(b.nama || 'laporan').slice(0, 200);
  const parts: Part[] = [{ text: PROMPT }];
  if (typeof b.teks === 'string' && b.teks.trim()) {
    parts.push({ text: 'Isi laporan:\n' + b.teks.slice(0, 60000) });
  } else if (typeof b.data === 'string' && MIME.includes(String(b.mime))) {
    if (b.data.length * 0.75 > MAKS) return fail(res, 413, 'File terlalu besar (maksimal 4 MB). Perkecil atau ekspor ulang PDF-nya.');
    parts.push({ inline_data: { mime_type: String(b.mime), data: b.data } });
  } else {
    return fail(res, 400, 'Format file belum didukung. Gunakan PDF, Word (.docx), JPG, atau PNG.');
  }

  try {
    let raw: any;
    let model = 'contoh';
    if (process.env.MOCK_AI && !process.env.VERCEL) raw = CONTOH;
    else {
      const r = await generate(parts, { json: true, temperature: 0.1, maxTokens: 2048 });
      raw = parseJson(r.text);
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
