// POST /api/akses — mengecek kode akses tim. Dipakai halaman masuk.
import { izinkan, fail, ok, type Req, type Res } from './_lib/http.js';

export default function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return fail(res, 405, 'Gunakan POST.');
  if (!izinkan(req, res)) return;
  return ok(res, { ok: true });
}
