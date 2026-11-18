// POST /api/lengkapi — melengkapi kolom yang kosong pada baris impor (kab/kota, kecamatan, sasaran, topik)
// berdasarkan judul, tempat, Mitra Penyelenggara, dan keterangan. Hasil selalu ditandai "ditebak" untuk dicek tim.
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
Setiap baris punya judul, tempat, kab/kota (dari file), dan "pengundang" (= Mitra Penyelenggara).
Isi kolom yang diminta di "perlu". Untuk kecamatan, ikuti urutan ini:
1. Kalau judul atau tempat menyebut desa/kelurahan/kecamatan/gedung yang kamu tahu letaknya, pakai itu.
2. Kalau tidak, pakai alamat MITRA PENYELENGGARA, tapi HANYA jika kegiatannya wajar diadakan di tempat mitra itu sendiri
   dan mitra itu punya satu alamat yang jelas: sekolah, kampus (pilih kampus yang cocok dengan kab/kota di file;
   kalau kampusnya lebih dari satu dan tidak jelas yang mana, kosongkan), pesantren, desa, kantor cabang tertentu.
3. Kalau mitranya organisasi yang mengadakan acara di banyak tempat (pemerintah daerah, dinas, Bank Indonesia, BEI,
   RRI/radio/media, asosiasi seperti MES, perusahaan dengan banyak cabang) dan judul/tempat tidak menyebut lokasi,
   KOSONGKAN kecamatan. Alamat kantor mereka belum tentu tempat acaranya.
4. Siaran radio/TV dan kegiatan daring: kosongkan kecamatan.
Selalu isi "kabkota" dengan kab/kota lokasi yang kamu pakai (boleh sama dengan file). Kalau menurutmu lokasinya
berbeda dengan kab/kota di file, tetap tulis kab/kota menurutmu; tim akan mengeceknya.
Isi "dasar" dengan alasan singkat (maks. 12 kata), mis. "Kampus UIN Jakarta di Ciputat Timur" atau "Judul menyebut Desa Sukamanah".
Kalau kecamatan dikosongkan, "dasar" boleh berisi alasannya, mis. "Mitra MES, lokasi acara tidak disebut".

- kabkota: salah satu dari [${KABKOTA.map((k) => `"${k}"`).join(', ')}], atau "".
- kecamatan: nama persis dari daftar kecamatan kab/kota itu (di bawah), atau "".
- sasaran: array dari [${SASARAN.map((k) => `"${k}"`).join(', ')}] (hanya jika diminta).
- topik: array dari [${TOPIK.map((k) => `"${k}"`).join(', ')}] (hanya jika diminta).
Jangan mengarang. Kalau ragu, kosongkan.
Jawab HANYA JSON: {"hasil":[{"i":nomor,"kabkota":"","kecamatan":"","dasar":"","sasaran":[],"topik":[]}]}

Daftar kecamatan:
${DAFTAR_KEC}

Baris:
${JSON.stringify(baris.map((b) => ({ ...b, judul: String(b.judul || '').slice(0, 200), pengundang: String(b.pengundang || '').slice(0, 120), ringkasan: String(b.ringkasan || '').slice(0, 300) })))}`;
  try {
    let data: any;
    if (process.env.MOCK_AI && !process.env.VERCEL)
      data = { hasil: baris.map((b) => ({ i: b.i, kabkota: b.kabkota || 'Kabupaten Lebak', kecamatan: (KECAMATAN[b.kabkota || 'Kabupaten Lebak'] || [])[0] || '', dasar: b.pengundang ? 'Alamat mitra ' + b.pengundang : '', sasaran: ['Masyarakat umum'], topik: ['Pengelolaan keuangan pribadi'] })) };
    else data = (await generateJson([{ text: prompt }], { temperature: 0.1, maxTokens: 8192 })).data;
    const hasil = (Array.isArray(data?.hasil) ? data.hasil : []).map((h: any) => {
      const kab = (KABKOTA as readonly string[]).includes(h.kabkota) ? h.kabkota : '';
      return {
        i: Number(h.i),
        kabkota: kab,
        kecamatan: cocokKecamatan(kab, h.kecamatan),
        dasar: String(h.dasar || '').slice(0, 120),
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
