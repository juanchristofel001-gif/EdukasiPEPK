// GET /api/riwayat            → 300 aktivitas terakhir (terbaru dulu)
// GET /api/riwayat?id=…       → aktivitas untuk satu kegiatan
import { izinkan, fail, ok, type Req, type Res } from './_lib/http.js';
import { db, DbError } from './_lib/db.js';

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') return fail(res, 405, 'Gunakan GET.');
  if (!izinkan(req, res)) return;
  try {
    const l = await (await db()).riwayat(id(req) ? 1000 : 300);
    return ok(res, { riwayat: id(req) ? l.filter((r) => r.kegiatanId === id(req)) : l });
  } catch (e: any) {
    if (e instanceof DbError) return fail(res, e.status, e.message);
    return fail(res, 500, 'Gagal membaca riwayat: ' + String(e?.message || e).slice(0, 200));
  }
}
const id = (req: Req) => String(req.query.id || '');
