// /api/kegiatan
//   GET                    → semua kegiatan aktif (terbaru dulu)
//   GET    ?sampah=1       → kegiatan di sampah
//   POST                   → simpan kegiatan baru (body = isian)
//   POST   ?pulihkan=id    → keluarkan kegiatan dari sampah
//   PUT    ?id=…           → ubah kegiatan
//   DELETE ?id=…           → pindahkan ke sampah
//   DELETE ?id=…&permanen=1 → hapus permanen (hanya untuk yang sudah di sampah)
import { izinkan, fail, ok, namaPengguna, type Req, type Res } from './_lib/http.js';
import { db, baru, aktif, sampah, catat, DbError } from './_lib/db.js';
import { rapikan, periksa, beda } from '../shared/schema.js';

export default async function handler(req: Req, res: Res) {
  if (!izinkan(req, res)) return;
  try {
    const s = await db();
    const id = String(req.query.id || '');
    const oleh = namaPengguna(req);
    switch (req.method) {
      case 'GET':
        return ok(res, { kegiatan: req.query.sampah ? await sampah() : await aktif() });
      case 'POST': {
        const pul = String(req.query.pulihkan || '');
        if (pul) {
          const k = await s.get(pul);
          if (!k) return fail(res, 404, 'Kegiatan tidak ditemukan.');
          await s.put({ ...k, dihapus: null });
          await catat({ aksi: 'pulihkan', oleh, kegiatanId: k.id, judul: k.judul });
          return ok(res, { dipulihkan: pul });
        }
        const isian = rapikan(req.body || {});
        const salah = periksa(isian);
        if (salah.length) return fail(res, 400, salah.join(' '));
        const k = baru(isian);
        await s.put(k);
        await catat({ aksi: 'tambah', oleh, kegiatanId: k.id, judul: k.judul, catatan: k.sumberFile ? `Dari laporan ${k.sumberFile}` : 'Diisi manual' });
        return ok(res, { kegiatan: k });
      }
      case 'PUT': {
        const lama = id && (await s.get(id));
        if (!lama || lama.dihapus) return fail(res, 404, 'Kegiatan tidak ditemukan. Mungkin sudah dihapus.');
        const isian = rapikan(req.body || {});
        const salah = periksa(isian);
        if (salah.length) return fail(res, 400, salah.join(' '));
        const k = { ...isian, id: lama.id, dibuat: lama.dibuat, diubah: new Date().toISOString() };
        const perubahan = beda(lama, k);
        await s.put(k);
        if (perubahan.length) await catat({ aksi: 'ubah', oleh, kegiatanId: k.id, judul: k.judul, perubahan });
        return ok(res, { kegiatan: k });
      }
      case 'DELETE': {
        const k = id && (await s.get(id));
        if (!k) return fail(res, 404, 'Kegiatan tidak ditemukan.');
        if (req.query.permanen) {
          if (!k.dihapus) return fail(res, 400, 'Pindahkan ke sampah dulu sebelum menghapus permanen.');
          await s.remove(id);
          await catat({ aksi: 'hapus-permanen', oleh, kegiatanId: k.id, judul: k.judul });
          return ok(res, { dihapus: id, permanen: true });
        }
        await s.put({ ...k, dihapus: new Date().toISOString() });
        await catat({ aksi: 'sampah', oleh, kegiatanId: k.id, judul: k.judul });
        return ok(res, { dihapus: id });
      }
      default:
        return fail(res, 405, 'Metode tidak didukung.');
    }
  } catch (e: any) {
    if (e instanceof DbError) return fail(res, e.status, e.message);
    return fail(res, 500, 'Gagal mengakses database: ' + String(e?.message || e).slice(0, 200));
  }
}
