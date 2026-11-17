// /api/insight
//   GET  ?dari=YYYY-MM-DD&sampai=YYYY-MM-DD → insight terakhir yang tersimpan untuk periode itu
//   POST ?dari=…&sampai=…                  → buat insight baru dengan AI dari data di database
// Angka dihitung server dari database (bukan dari browser), lalu AI hanya menafsirkan.
import { izinkan, fail, ok, type Req, type Res } from './_lib/http.js';
import { db, DbError } from './_lib/db.js';
import { generate, parseJson, GeminiError } from './_lib/gemini.js';
import { isTanggal } from '../shared/schema.js';
import { statistik, dalamPeriode } from '../shared/statistik.js';

export type Insight = {
  dibuat: string;
  model: string;
  jumlahData: number;
  ringkasan: string;
  temuan: string[];
  saran: string[];
};

export default async function handler(req: Req, res: Res) {
  if (!izinkan(req, res)) return;
  const dari = String(req.query.dari || ''),
    sampai = String(req.query.sampai || '');
  if (!isTanggal(dari) || !isTanggal(sampai) || dari > sampai) return fail(res, 400, 'Periode tidak valid.');
  const key = `insight_${dari}_${sampai}`;
  try {
    const s = await db();
    if (req.method === 'GET') return ok(res, { insight: await s.getMeta(key) });
    if (req.method !== 'POST') return fail(res, 405, 'Metode tidak didukung.');

    const semua = await s.list();
    const st = statistik(semua, { dari, sampai });
    if (!st.kegiatan) return fail(res, 400, 'Belum ada kegiatan di periode ini.');
    const catatan = dalamPeriode(semua, { dari, sampai })
      .filter((k) => k.catatan)
      .slice(0, 40)
      .map((k) => `- ${k.tanggal} ${k.kabkota}, ${k.sasaran.join('/')}: ${k.catatan}`)
      .join('\n');
    const prompt = `Kamu analis program edukasi keuangan OJK Provinsi Banten. Berikut rekap kegiatan edukasi periode ${dari} s.d. ${sampai} (JSON):
${JSON.stringify({ ...st, perBulan: st.perBulan.filter((b) => b.kegiatan), perKecamatan: st.perKecamatan.filter((c) => c.kegiatan), kecamatanTanpaKegiatanPerKab: Object.fromEntries(st.perWilayah.map((w) => [w.nama, w.kecTotal - w.kecTerjangkau])) })}

Catatan lapangan:
${catatan || '(tidak ada)'}

Tulis insight singkat untuk tim PEPK dalam bahasa Indonesia yang jelas. Jawab HANYA JSON:
{"ringkasan":"2-3 kalimat kondisi umum dengan angka utama","temuan":["3-5 temuan spesifik, sebut angka dan nama wilayah/sasaran"],"saran":["2-3 saran tindak lanjut yang konkret, misal wilayah atau sasaran yang perlu dijangkau"]}
Aturan: hanya pakai angka yang ada di data, jangan mengarang. Jika peserta ditandai perkiraan, sebut "sekitar".`;
    let out: any, model: string;
    if (process.env.MOCK_AI && !process.env.VERCEL) {
      out = {
        ringkasan: `Contoh insight (mode uji): ${st.kegiatan} kegiatan menjangkau ${st.wilayahTerjangkau} kabupaten/kota.`,
        temuan: st.perWilayah.filter((w) => w.kegiatan).map((w) => `${w.nama}: ${w.kegiatan} kegiatan.`),
        saran: st.perWilayah.filter((w) => !w.kegiatan).map((w) => `Jadwalkan kegiatan di ${w.nama}.`),
      };
      model = 'contoh';
    } else {
      const r = await generate([{ text: prompt }], { json: true, temperature: 0.3, maxTokens: 2048 });
      out = parseJson(r.text);
      model = r.model;
    }
    const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 400)).filter(Boolean).slice(0, 6) : []);
    const insight: Insight = {
      dibuat: new Date().toISOString(),
      model,
      jumlahData: st.kegiatan,
      ringkasan: String(out.ringkasan || '').slice(0, 800),
      temuan: list(out.temuan),
      saran: list(out.saran),
    };
    await s.setMeta(key, insight);
    return ok(res, { insight });
  } catch (e: any) {
    if (e instanceof GeminiError || e instanceof DbError) return fail(res, e.status, e.message);
    if (e instanceof SyntaxError) return fail(res, 502, 'Jawaban AI tidak terbaca. Coba lagi.');
    return fail(res, 500, 'Gagal membuat insight: ' + String(e?.message || e).slice(0, 200));
  }
}
