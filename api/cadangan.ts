// /api/cadangan — salinan harian seluruh data kegiatan (disimpan di Firestore, 30 hari terakhir).
//   GET  ?cron=1            → dipanggil Vercel Cron setiap hari (lihat vercel.json)
//   GET                     → daftar cadangan
//   GET  ?unduh=YYYY-MM-DD  → isi satu cadangan (JSON)
//   POST                    → buat cadangan sekarang
//   POST ?pulihkan=…        → kembalikan data ke isi cadangan itu
import { izinkan, fail, ok, namaPengguna, type Req, type Res } from './_lib/http.js';
import { db, buatCadangan, pulihkanCadangan, DbError } from './_lib/db.js';

function dariCron(req: Req) {
  const rahasia = process.env.CRON_SECRET;
  if (rahasia) return req.headers.authorization === `Bearer ${rahasia}`;
  return /vercel-cron/i.test(String(req.headers['user-agent'] || ''));
}

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method === 'GET' && req.query.cron) {
      if (!dariCron(req)) return fail(res, 401, 'Hanya untuk jadwal otomatis.');
      return ok(res, { cadangan: await buatCadangan() });
    }
    if (!izinkan(req, res)) return;
    const s = await db();
    if (req.method === 'POST' && req.query.pulihkan) return ok(res, await pulihkanCadangan(String(req.query.pulihkan), namaPengguna(req)));
    if (req.method === 'POST') return ok(res, { cadangan: await buatCadangan() });
    if (req.method !== 'GET') return fail(res, 405, 'Metode tidak didukung.');
    const t = String(req.query.unduh || '');
    if (t) {
      const c = await s.ambilCadangan(t.slice(0, 80));
      return c ? ok(res, c) : fail(res, 404, 'Cadangan tidak ditemukan.');
    }
    return ok(res, { cadangan: await s.daftarCadangan() });
  } catch (e: any) {
    if (e instanceof DbError) return fail(res, e.status, e.message);
    return fail(res, 500, 'Gagal memproses cadangan: ' + String(e?.message || e).slice(0, 200));
  }
}
