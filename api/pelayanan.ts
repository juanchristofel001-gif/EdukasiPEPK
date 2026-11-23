// Agregat pelayanan dari Trapesium, untuk kartu "Pelayanan vs edukasi" di dasbor.
// POST /api/pelayanan  → dipanggil server Trapesium, header x-kunci-agregat = env KUNCI_AGREGAT
// GET  /api/pelayanan  → dibaca website ini dengan kode akses tim
import { createHash, timingSafeEqual } from 'node:crypto';
import { izinkan, fail, ok, type Req, type Res } from './_lib/http.js';
import { db, DbError } from './_lib/db.js';
import { bacaAgregat, type AgregatPelayanan } from '../shared/pelayanan.js';

const h = (s: string) => createHash('sha256').update(s).digest();

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method === 'GET') {
      if (!izinkan(req, res)) return;
      const m = (await (await db()).getMeta('pelayanan')) as AgregatPelayanan | null;
      return ok(res, { pelayanan: m && Array.isArray(m.baris) ? m : null });
    }
    if (req.method !== 'POST') return fail(res, 405, 'Gunakan GET atau POST.');
    const kunci = process.env.KUNCI_AGREGAT;
    if (!kunci) return fail(res, 503, 'KUNCI_AGREGAT belum diisi di pengaturan Vercel.');
    const given = String(req.headers['x-kunci-agregat'] || '');
    if (!given || !timingSafeEqual(h(given), h(kunci))) return fail(res, 401, 'Kunci agregat salah.');
    let body: unknown = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = null;
      }
    }
    const a = bacaAgregat(body);
    if (!a) return fail(res, 400, 'Data agregat tidak valid.');
    await (await db()).setMeta('pelayanan', { ...a, diterima: new Date().toISOString() });
    return ok(res, { ok: true, baris: a.baris.length });
  } catch (e: any) {
    if (e instanceof DbError) return fail(res, e.status, e.message);
    return fail(res, 500, 'Gagal memproses agregat: ' + String(e?.message || e).slice(0, 200));
  }
}
