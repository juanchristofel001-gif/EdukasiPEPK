// /api/foto — foto dokumentasi kegiatan (dipakai di halaman kegiatan dan halaman 2 laporan Word).
//   GET    ?kegiatan=<id>  → { foto: FotoMeta[] }   (tanpa isi gambar)
//   GET    ?id=<id>        → gambar JPEG
//   POST   { kegiatanId, data (base64 JPEG), w, h, ket } → { foto: FotoMeta }
//   PATCH  ?id=<id> { ket?, urutan? }
//   DELETE ?id=<id>
// Semua butuh kode akses. Foto tidak punya tautan publik.
import { randomUUID } from 'node:crypto';
import { izinkan, fail, ok, namaPengguna, type Req, type Res } from './_lib/http.js';
import { db, catat, DbError, type FotoDok } from './_lib/db.js';

export const MAKS_FOTO = 8;
const MAKS_DATA = 1_000_000; // karakter base64 (~730 KB); batas dokumen Firestore 1 MiB

export default async function handler(req: Req, res: Res) {
  if (!izinkan(req, res)) return;
  const id = String(req.query.id || '');
  const oleh = namaPengguna(req);
  try {
    const s = await db();
    switch (req.method) {
      case 'GET': {
        if (id) {
          const f = await s.fotoAmbil(id);
          if (!f) return fail(res, 404, 'Foto tidak ditemukan.');
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'private, max-age=31536000, immutable'); // isi foto tidak pernah berubah
          return res.status(200).send(Buffer.from(f.data, 'base64'));
        }
        const kid = String(req.query.kegiatan || '');
        if (!kid) return fail(res, 400, 'Sebutkan kegiatan.');
        return ok(res, { foto: await s.fotoDaftar(kid) });
      }
      case 'POST': {
        const b = (req.body || {}) as Record<string, unknown>;
        const kid = String(b.kegiatanId || '');
        const data = String(b.data || '').replace(/^data:image\/jpeg;base64,/, '');
        const k = kid && (await s.get(kid));
        if (!k || k.dihapus) return fail(res, 404, 'Kegiatan tidak ditemukan.');
        if (!data.startsWith('/9j/')) return fail(res, 400, 'Foto harus berformat JPEG.');
        if (data.length > MAKS_DATA) return fail(res, 413, 'Ukuran foto terlalu besar.');
        const ada = await s.fotoDaftar(kid);
        if (ada.length >= MAKS_FOTO) return fail(res, 400, `Maksimal ${MAKS_FOTO} foto per kegiatan.`);
        const angka = (v: unknown) => Math.max(1, Math.min(10000, Math.round(Number(v) || 1)));
        const f: FotoDok = {
          id: randomUUID(),
          kegiatanId: kid,
          urutan: ada.length ? Math.max(...ada.map((x) => x.urutan)) + 1 : 1,
          ket: String(b.ket || '').slice(0, 120),
          w: angka(b.w),
          h: angka(b.h),
          dibuat: new Date().toISOString(),
          oleh,
          data,
        };
        await s.fotoSimpan(f);
        await catat({ aksi: 'ubah', oleh, kegiatanId: kid, judul: k.judul, perubahan: [{ kolom: 'Foto dokumentasi', dari: `${ada.length} foto`, jadi: `${ada.length + 1} foto` }] });
        const { data: _, ...meta } = f;
        return ok(res, { foto: meta });
      }
      case 'PATCH': {
        const b = (req.body || {}) as Record<string, unknown>;
        const ubah: { ket?: string; urutan?: number } = {};
        if (typeof b.ket === 'string') ubah.ket = b.ket.slice(0, 120);
        if (Number.isFinite(Number(b.urutan))) ubah.urutan = Number(b.urutan);
        if (!id || !(await s.fotoUbah(id, ubah))) return fail(res, 404, 'Foto tidak ditemukan.');
        return ok(res, { diubah: id });
      }
      case 'DELETE': {
        const f = id && (await s.fotoAmbil(id));
        if (!f) return fail(res, 404, 'Foto tidak ditemukan.');
        await s.fotoHapus(id);
        const k = await s.get(f.kegiatanId);
        const sisa = (await s.fotoDaftar(f.kegiatanId)).length;
        await catat({ aksi: 'ubah', oleh, kegiatanId: f.kegiatanId, judul: k?.judul || '', perubahan: [{ kolom: 'Foto dokumentasi', dari: `${sisa + 1} foto`, jadi: `${sisa} foto` }] });
        return ok(res, { dihapus: id });
      }
      default:
        return fail(res, 405, 'Metode tidak didukung.');
    }
  } catch (e: any) {
    if (e instanceof DbError) return fail(res, e.status, e.message);
    return fail(res, 500, 'Gagal memproses foto: ' + String(e?.message || e).slice(0, 200));
  }
}
