// POST /api/lengkapi — melengkapi kolom yang kosong pada baris impor (kab/kota, kecamatan, sasaran, topik)
// berdasarkan judul, tempat, dan keterangan. Hasil selalu ditandai "ditebak" untuk dicek tim.
import { izinkan, fail, ok, type Req, type Res } from './_lib/http.js';
import { generateJson, GeminiError } from './_lib/gemini.js';
import { KECAMATAN } from '../shared/kecamatan.js';
import { KABKOTA, SASARAN, TOPIK, cocokKecamatan } from '../shared/schema.js';

type Masuk = { i: number; judul?: string; tema?: string; tempat?: string; pengundang?: string; kabkota?: string; kecamatan?: string; sasaranDetail?: string; ringkasan?: string; perlu: string[] };

const DAFTAR_KEC = Object.entries(KECAMATAN)
  .map(([k, l]) => `${k}: ${l.join(', ')}`)
  .join('\n');

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return fail(res, 405, 'Gunakan POST.');
  if (!izinkan(req, res)) return;
  const baris = (Array.isArray(req.body?.baris) ? req.body.baris : []).slice(0, 25) as Masuk[];
  if (!baris.length) return ok(res, { hasil: [] });
  const prompt = `Kamu membantu merapikan rekap kegiatan edukasi keuangan OJK di Provinsi Banten.
Untuk setiap baris, isi HANYA kolom yang diminta di "perlu", berdasarkan judul, tempat, pengundang, dan keterangan.
- kabkota: salah satu dari [${KABKOTA.map((k) => `"${k}"`).join(', ')}], atau "" jika tidak bisa ditentukan.
- kecamatan: nama persis dari daftar kecamatan kab/kota tersebut (di bawah), atau "" jika tidak yakin.
- sasaran: array dari [${SASARAN.map((k) => `"${k}"`).join(', ')}].
- topik: array dari [${TOPIK.map((k) => `"${k}"`).join(', ')}].
Pakai pengetahuanmu tentang lokasi sekolah, kampus, desa, atau instansi di Banten. Jangan mengarang: kalau ragu, kosongkan.
Jawab HANYA JSON: {"hasil":[{"i":nomor,"kabkota":"","kecamatan":"","sasaran":[],"topik":[]}]}

Daftar kecamatan:
${DAFTAR_KEC}

Baris:
${JSON.stringify(baris.map((b) => ({ ...b, judul: String(b.judul || '').slice(0, 200), ringkasan: String(b.ringkasan || '').slice(0, 300) })))}`;
  try {
    let data: any;
    if (process.env.MOCK_AI && !process.env.VERCEL)
      data = { hasil: baris.map((b) => ({ i: b.i, kabkota: b.kabkota || 'Kabupaten Lebak', kecamatan: (KECAMATAN[b.kabkota || 'Kabupaten Lebak'] || [])[0] || '', sasaran: ['Masyarakat umum'], topik: ['Pengelolaan keuangan pribadi'] })) };
    else data = (await generateJson([{ text: prompt }], { temperature: 0.1, maxTokens: 8192 })).data;
    const hasil = (Array.isArray(data?.hasil) ? data.hasil : []).map((h: any) => {
      const kab = (KABKOTA as readonly string[]).includes(h.kabkota) ? h.kabkota : '';
      return {
        i: Number(h.i),
        kabkota: kab,
        kecamatan: cocokKecamatan(kab, h.kecamatan),
        sasaran: (Array.isArray(h.sasaran) ? h.sasaran : []).filter((x: string) => (SASARAN as readonly string[]).includes(x)),
        topik: (Array.isArray(h.topik) ? h.topik : []).filter((x: string) => (TOPIK as readonly string[]).includes(x)),
      };
    });
    return ok(res, { hasil });
  } catch (e: any) {
    if (e instanceof GeminiError) return fail(res, e.status, e.message);
    return fail(res, 500, 'Gagal melengkapi dengan AI: ' + String(e?.message || e).slice(0, 200));
  }
}
