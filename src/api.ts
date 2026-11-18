// Semua panggilan ke server lewat sini. Kode akses disimpan di perangkat dan dikirim di setiap permintaan.
import type { Kegiatan, KegiatanInput, Riwayat } from '../shared/schema.js';
import type { Insight } from '../api/insight.js';
import type { TafsirLaporan } from '../api/laporan.js';

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

const KUNCI_NAMA = 'edukasi-pepk:nama';
// Nama orang yang memakai perangkat ini, untuk log riwayat (diisi sekali saat masuk).
export const nama = {
  get: () => {
    try {
      return localStorage.getItem(KUNCI_NAMA) || '';
    } catch {
      return '';
    }
  },
  set: (v: string) => {
    try {
      localStorage.setItem(KUNCI_NAMA, v.trim().slice(0, 60));
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
      headers: { 'x-kode-akses': kodeKhusus ?? kode.get(), 'x-nama': encodeURIComponent(nama.get()), ...(body ? { 'Content-Type': 'application/json' } : {}) },
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
  hapusPermanen: (id: string) => req<{ dihapus: string }>('DELETE', '/api/kegiatan?permanen=1&id=' + encodeURIComponent(id)),
  sampah: () => req<{ kegiatan: (Kegiatan & { dihapus: string })[] }>('GET', '/api/kegiatan?sampah=1').then((r) => r.kegiatan),
  pulihkan: (id: string) => req<{ dipulihkan: string }>('POST', '/api/kegiatan?pulihkan=' + encodeURIComponent(id)),
  daftarCadangan: () => req<{ cadangan: { tanggal: string; dibuat: string; jumlah: number }[] }>('GET', '/api/cadangan').then((r) => r.cadangan),
  unduhCadangan: (t: string) => req<{ kegiatan: (Kegiatan & { dihapus?: string | null })[] }>('GET', '/api/cadangan?unduh=' + encodeURIComponent(t)),
  pulihkanCadangan: (t: string) => req<{ dipulihkan: number; disampahkan: number }>('POST', '/api/cadangan?pulihkan=' + encodeURIComponent(t)),
  impor: (file: string, isian: KegiatanInput[]) => req<{ jumlah: number }>('POST', '/api/kegiatan?impor=1', { file, isian }).then((r) => r.jumlah),
  lengkapi: (baris: unknown[]) => req<{ hasil: { i: number; kabkota: string; kecamatan: string; dasar: string; sasaran: string[]; topik: string[] }[] }>('POST', '/api/lengkapi', { baris }).then((r) => r.hasil),
  riwayat: (id?: string) => req<{ riwayat: Riwayat[] }>('GET', '/api/riwayat' + (id ? '?id=' + encodeURIComponent(id) : '')).then((r) => r.riwayat),
  buatCadangan: () => req<{ cadangan: string }>('POST', '/api/cadangan'),
  ekstrak: (b: { nama: string; teks?: string; gambar?: { mime: string; data: string }[] }) => req<{ isian: KegiatanInput; model: string }>('POST', '/api/ekstrak', b),
  insight: (dari: string, sampai: string, buat = false) =>
    req<{ insight: Insight | null }>(buat ? 'POST' : 'GET', `/api/insight?dari=${dari}&sampai=${sampai}`).then((r) => r.insight),
  tafsirLaporan: (dari: string, sampai: string, buat = false, kab?: string) =>
    req<{ tafsir: TafsirLaporan | null }>(buat ? 'POST' : 'GET', `/api/laporan?dari=${dari}&sampai=${sampai}${kab ? `&kab=${encodeURIComponent(kab)}` : ''}`).then((r) => r.tafsir),
};
