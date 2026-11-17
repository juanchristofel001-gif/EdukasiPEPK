// Semua panggilan ke server lewat sini. Kode akses disimpan di perangkat dan dikirim di setiap permintaan.
import type { Kegiatan, KegiatanInput } from '../shared/schema.js';
import type { Insight } from '../api/insight.js';

const KUNCI = 'edukasi-pepk:kode';

export const kode = {
  get: () => {
    try {
      return localStorage.getItem(KUNCI) || '';
    } catch {
      return '';
    }
  },
  set: (v: string) => {
    try {
      localStorage.setItem(KUNCI, v);
    } catch {}
  },
  hapus: () => {
    try {
      localStorage.removeItem(KUNCI);
    } catch {}
  },
};

export class ApiError extends Error {
  constructor(msg: string, public status: number) {
    super(msg);
  }
}

let onKeluar: () => void = () => {};
export const saatKodeDitolak = (f: () => void) => (onKeluar = f);

async function req<T>(method: string, url: string, body?: unknown, kodeKhusus?: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method,
      headers: { 'x-kode-akses': kodeKhusus ?? kode.get(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Tidak tersambung ke server. Periksa internet lalu coba lagi.', 0);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && kodeKhusus === undefined) onKeluar();
    throw new ApiError(j.error || `Terjadi kesalahan (HTTP ${r.status}).`, r.status);
  }
  return j as T;
}

export const api = {
  cekKode: (k: string) => req<{ ok: true }>('POST', '/api/akses', undefined, k),
  daftar: () => req<{ kegiatan: Kegiatan[] }>('GET', '/api/kegiatan').then((r) => r.kegiatan),
  simpan: (k: KegiatanInput) => req<{ kegiatan: Kegiatan }>('POST', '/api/kegiatan', k).then((r) => r.kegiatan),
  ubah: (id: string, k: KegiatanInput) => req<{ kegiatan: Kegiatan }>('PUT', '/api/kegiatan?id=' + encodeURIComponent(id), k).then((r) => r.kegiatan),
  hapus: (id: string) => req<{ dihapus: string }>('DELETE', '/api/kegiatan?id=' + encodeURIComponent(id)),
  ekstrak: (b: { nama: string; teks?: string; gambar?: { mime: string; data: string }[] }) => req<{ isian: KegiatanInput; model: string }>('POST', '/api/ekstrak', b),
  insight: (dari: string, sampai: string, buat = false) =>
    req<{ insight: Insight | null }>(buat ? 'POST' : 'GET', `/api/insight?dari=${dari}&sampai=${sampai}`).then((r) => r.insight),
};
