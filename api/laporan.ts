// /api/laporan — tafsiran AI untuk laporan PDF.
//   GET  ?dari=…&sampai=… → tafsiran terakhir yang tersimpan untuk periode itu
//   POST ?dari=…&sampai=… → tulis tafsiran baru
// Angka dihitung server dari database dengan fungsi yang sama dengan laporan di browser;
// AI hanya menulis ringkasan, interpretasi per grafik, dan rekomendasi. Data pribadi tidak dikirim.
import { izinkan, fail, ok, type Req, type Res } from './_lib/http.js';
import { db, aktif, DbError } from './_lib/db.js';
import { generateJson, GeminiError } from './_lib/gemini.js';
import { isTanggal, KABKOTA } from '../shared/schema.js';
import { dataLaporan, deskripsi, bahanAi, sidikData, judulBagian, BAGIAN, VERSI_TAFSIR, type Bagian } from '../shared/laporan.js';
import { labelPeriode } from '../shared/statistik.js';

export type TafsirLaporan = {
  dibuat: string;
  model: string;
  jumlahData: number;
  versi?: number;
  sidik?: string;
  ringkasan: string;
  sorotan: string[];
  interpretasi: Partial<Record<Bagian, string>>;
  rekomendasi: string[];
};

export default async function handler(req: Req, res: Res) {
  if (!izinkan(req, res)) return;
  const dari = String(req.query.dari || ''),
    sampai = String(req.query.sampai || '');
  if (!isTanggal(dari) || !isTanggal(sampai) || dari > sampai) return fail(res, 400, 'Periode tidak valid.');
  const kab = String(req.query.kab || '') || undefined;
  if (kab && !(KABKOTA as readonly string[]).includes(kab)) return fail(res, 400, 'Kabupaten/kota tidak dikenal.');
  const key = `laporan_${dari}_${sampai}` + (kab ? '_' + kab.toLowerCase().replace(/[^a-z]+/g, '-') : '');
  try {
    const s = await db();
    if (req.method === 'GET') return ok(res, { tafsir: await s.getMeta(key) });
    if (req.method !== 'POST') return fail(res, 405, 'Metode tidak didukung.');

    const semua = await aktif();
    const d = dataLaporan(semua, { dari, sampai }, kab);
    if (!d.kegiatan) return fail(res, 400, 'Belum ada kegiatan di periode ini.');
    const desk = deskripsi(d);
    const prompt = `Kamu analis program edukasi keuangan OJK Provinsi Banten dan sedang menulis laporan untuk pimpinan.
${kab ? `Laporan ini KHUSUS untuk ${kab}; bandingkan dengan kabupaten/kota lain bila relevan, dan beri rekomendasi untuk wilayah ini (mis. kecamatan yang belum dijangkau).
` : ''}Data rekap kegiatan periode ${labelPeriode({ dari, sampai })} (${dari} s.d. ${sampai}) (JSON):
${JSON.stringify(bahanAi(d))}

Laporan berisi grafik berikut, masing-masing sudah punya DESKRIPSI angka (jangan diulang mentah-mentah):
${BAGIAN.map(([k]) => `- ${k} (${judulBagian(k, kab)}): ${desk[k]}`).join('\n')}

Tulis dalam bahasa Indonesia baku yang lugas. Jawab HANYA JSON:
{"ringkasan":"3-4 kalimat kondisi umum untuk pimpinan, dengan angka utama",
 "sorotan":["3-5 temuan utama, masing-masing satu kalimat dengan angka"],
 "interpretasi":{${BAGIAN.map(([k]) => `"${k}":"2-3 kalimat"`).join(',')}},
 "rekomendasi":["3-4 tindak lanjut konkret, sebut wilayah/sasaran/topik"]}
Isi "interpretasi" per grafik dengan MAKNA angka, bukan pengulangan deskripsi: apa artinya bagi pemerataan
edukasi, apa yang menonjol atau timpang, dan apa yang perlu diwaspadai saat membaca angkanya.
Aturan:
- Hanya pakai angka yang ada di data. Jangan mengarang penyebab sebagai fakta; kalau menduga, tulis "kemungkinan".
- Kalau segelintir kegiatan (mis. siaran radio/daring atau acara massal) menyumbang porsi besar peserta,
  sebutkan bahwa total peserta perlu dibaca hati-hati karena angka tersebut kemungkinan perkiraan jangkauan.
- Saat menilai pemerataan antarwilayah, pakai juga kegiatanPer100rbPenduduk: wilayah berpenduduk besar bisa
  tampak banyak kegiatannya tetapi rendah bila dibandingkan jumlah penduduknya.
- Kalau banyak kegiatan belum punya kecamatan, sebutkan bahwa cakupan kecamatan sebenarnya bisa lebih tinggi.
- Jika peserta ditandai perkiraan, gunakan kata "sekitar".`;
    let out: any, model: string;
    if (process.env.MOCK_AI && !process.env.VERCEL) {
      out = {
        ringkasan: `Contoh ringkasan (mode uji): ${d.kegiatan} kegiatan di ${d.wilayahTerjangkau} kabupaten/kota.`,
        sorotan: ['Contoh sorotan pertama.', 'Contoh sorotan kedua.'],
        interpretasi: Object.fromEntries(BAGIAN.map(([k, t]) => [k, `Contoh interpretasi untuk ${t.toLowerCase()} (mode uji).`])),
        rekomendasi: ['Contoh rekomendasi.'],
      };
      model = 'contoh';
    } else {
      const r = await generateJson([{ text: prompt }], { temperature: 0.3, maxTokens: 8192 });
      out = r.data;
      model = r.model;
    }
    const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 500)).filter(Boolean).slice(0, n) : []);
    const tafsir: TafsirLaporan = {
      dibuat: new Date().toISOString(),
      model,
      jumlahData: d.kegiatan,
      versi: VERSI_TAFSIR,
      sidik: sidikData(semua, { dari, sampai }, kab),
      ringkasan: String(out?.ringkasan || '').slice(0, 1200),
      sorotan: list(out?.sorotan, 6),
      interpretasi: Object.fromEntries(BAGIAN.map(([k]) => [k, String(out?.interpretasi?.[k] || '').slice(0, 800)]).filter(([, v]) => v)),
      rekomendasi: list(out?.rekomendasi, 5),
    };
    await s.setMeta(key, tafsir);
    return ok(res, { tafsir });
  } catch (e: any) {
    if (e instanceof GeminiError || e instanceof DbError) return fail(res, e.status, e.message);
    if (e instanceof SyntaxError) return fail(res, 502, 'Jawaban AI tidak terbaca. Coba lagi.');
    return fail(res, 500, 'Gagal menulis tafsiran: ' + String(e?.message || e).slice(0, 200));
  }
}
