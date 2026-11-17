import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'node:crypto';

export type Req = VercelRequest;
export type Res = VercelResponse;

export function fail(res: Res, status: number, error: string) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ error });
}

export function ok(res: Res, data: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(data);
}

const h = (s: string) => createHash('sha256').update(s).digest();

// Kode akses bersama tim. Disimpan di env KODE_AKSES; dicek di server untuk setiap permintaan.
// Nanti kalau pindah ke login pribadi, cukup fungsi ini yang diganti.
export function izinkan(req: Req, res: Res): boolean {
  const kode = process.env.KODE_AKSES;
  if (!kode) {
    fail(res, 503, 'KODE_AKSES belum diisi di pengaturan Vercel.');
    return false;
  }
  const given = String(req.headers['x-kode-akses'] || '');
  if (!given || !timingSafeEqual(h(given), h(kode))) {
    fail(res, 401, 'Kode akses salah atau sudah diganti.');
    return false;
  }
  return true;
}

// Nama yang diisi pengguna di perangkatnya (header x-nama). Belum ada login, jadi ini
// hanya label untuk log riwayat, bukan identitas yang terverifikasi.
export function namaPengguna(req: Req) {
  try {
    return decodeURIComponent(String(req.headers['x-nama'] || '')).trim().slice(0, 60) || 'Tanpa nama';
  } catch {
    return 'Tanpa nama';
  }
}
