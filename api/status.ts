// GET /api/status        → cek pengaturan server (tanpa membuka data apa pun)
// GET /api/status?ai=1   → sekaligus coba panggil Gemini (memakai sedikit kuota)
import { ok, type Req, type Res } from './_lib/http.js';
import { db } from './_lib/db.js';
import { generate } from './_lib/gemini.js';

export default async function handler(req: Req, res: Res) {
  const out: Record<string, string> = {
    kodeAkses: process.env.KODE_AKSES ? 'terisi' : 'BELUM diisi',
    geminiKey: process.env.GEMINI_API_KEY ? 'terisi' : 'BELUM diisi',
  };
  try {
    await (await db()).getMeta('status');
    out.database = 'tersambung';
  } catch (e: any) {
    out.database = 'GAGAL: ' + String(e?.message || e).slice(0, 160);
  }
  if (req.query.ai) {
    try {
      const r = await generate([{ text: 'Jawab satu kata: siap' }], { maxTokens: 16, timeout: 15000 });
      out.gemini = 'tersambung (' + r.model + ')';
    } catch (e: any) {
      out.gemini = 'GAGAL: ' + String(e?.message || e).slice(0, 160);
    }
  }
  return ok(res, out);
}
