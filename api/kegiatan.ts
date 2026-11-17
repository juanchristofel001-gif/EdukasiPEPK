// /api/kegiatan
//   GET            → semua kegiatan (terbaru dulu)
//   POST           → simpan kegiatan baru (body = isian)
//   PUT    ?id=…   → ubah kegiatan
//   DELETE ?id=…   → hapus kegiatan
import { izinkan, fail, ok, type Req, type Res } from './_lib/http.js';
import { db, baru, DbError } from './_lib/db.js';
import { rapikan, periksa } from '../shared/schema.js';

export default async function handler(req: Req, res: Res) {
  if (!izinkan(req, res)) return;
  try {
    const s = await db();
    const id = String(req.query.id || '');
    switch (req.method) {
      case 'GET':
        return ok(res, { kegiatan: await s.list() });
      case 'POST': {
        const isian = rapikan(req.body || {});
        const salah = periksa(isian);
        if (salah.length) return fail(res, 400, salah.join(' '));
        const k = baru(isian);
        await s.put(k);
        return ok(res, { kegiatan: k });
      }
      case 'PUT': {
        const lama = id && (await s.get(id));
        if (!lama) return fail(res, 404, 'Kegiatan tidak ditemukan. Mungkin sudah dihapus.');
        const isian = rapikan(req.body || {});
        const salah = periksa(isian);
        if (salah.length) return fail(res, 400, salah.join(' '));
        const k = { ...isian, id: lama.id, dibuat: lama.dibuat, diubah: new Date().toISOString() };
        await s.put(k);
        return ok(res, { kegiatan: k });
      }
      case 'DELETE':
        if (!id || !(await s.remove(id))) return fail(res, 404, 'Kegiatan tidak ditemukan.');
        return ok(res, { dihapus: id });
      default:
        return fail(res, 405, 'Metode tidak didukung.');
    }
  } catch (e: any) {
    if (e instanceof DbError) return fail(res, e.status, e.message);
    return fail(res, 500, 'Gagal mengakses database: ' + String(e?.message || e).slice(0, 200));
  }
}
