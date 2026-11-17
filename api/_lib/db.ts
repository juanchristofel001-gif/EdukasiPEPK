// Penyimpanan data kegiatan.
// - Di Vercel: Firestore (Firebase), lewat akun layanan di env FIREBASE_SERVICE_ACCOUNT.
//   Browser tidak pernah mengakses Firestore langsung; semua lewat server ini.
// - Saat pengembangan lokal tanpa Firebase: file .data/kegiatan.json.
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Kegiatan, KegiatanInput, Riwayat } from '../../shared/schema.js';

export class DbError extends Error {
  constructor(msg: string, public status = 503) {
    super(msg);
  }
}

type Meta = Record<string, unknown>;
export type Cadangan = { tanggal: string; dibuat: string; jumlah: number; kegiatan: Kegiatan[] };

// Kegiatan yang dihapus tidak langsung hilang: diberi tanda `dihapus` (waktu) dan masuk sampah.
type Baris = Kegiatan & { dihapus?: string | null };

interface Store {
  semua(): Promise<Baris[]>; // termasuk yang di sampah
  get(id: string): Promise<Baris | null>;
  put(k: Baris): Promise<void>;
  remove(id: string): Promise<boolean>; // hapus permanen
  getMeta(key: string): Promise<Meta | null>;
  setMeta(key: string, v: Meta): Promise<void>;
  simpanCadangan(c: Cadangan): Promise<void>;
  daftarCadangan(): Promise<Omit<Cadangan, 'kegiatan'>[]>;
  ambilCadangan(tanggal: string): Promise<Cadangan | null>;
  hapusCadangan(tanggal: string): Promise<void>;
  catat(r: Riwayat): Promise<void>;
  riwayat(batas: number): Promise<Riwayat[]>; // terbaru dulu
}

let store: Store | null = null;

async function firestore(): Promise<Store> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  let cred: any;
  try {
    cred = JSON.parse(raw);
  } catch {
    throw new DbError('FIREBASE_SERVICE_ACCOUNT tidak berisi JSON yang valid.');
  }
  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] || initializeApp({ credential: cert(cred) });
  const db = getFirestore(app);
  const col = db.collection('kegiatan');
  const meta = db.collection('meta');
  const cad = db.collection('cadangan');
  return {
    async semua() {
      const s = await col.get();
      return s.docs.map((d) => d.data() as Baris);
    },
    async get(id) {
      const d = await col.doc(id).get();
      return d.exists ? (d.data() as Kegiatan) : null;
    },
    async put(k) {
      await col.doc(k.id).set(k);
    },
    async remove(id) {
      const ref = col.doc(id);
      if (!(await ref.get()).exists) return false;
      await ref.delete();
      return true;
    },
    async getMeta(key) {
      const d = await meta.doc(key).get();
      return d.exists ? (d.data() as Meta) : null;
    },
    async setMeta(key, v) {
      await meta.doc(key).set(v);
    },
    async simpanCadangan(c) {
      await cad.doc(c.tanggal).set(c);
    },
    async daftarCadangan() {
      const s = await cad.select('tanggal', 'dibuat', 'jumlah').get();
      return s.docs.map((d) => d.data() as Omit<Cadangan, 'kegiatan'>).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    },
    async ambilCadangan(t) {
      const d = await cad.doc(t).get();
      return d.exists ? (d.data() as Cadangan) : null;
    },
    async hapusCadangan(t) {
      await cad.doc(t).delete();
    },
    async catat(r) {
      await db.collection('riwayat').doc(r.id).set(r);
    },
    async riwayat(batas) {
      const s = await db.collection('riwayat').orderBy('waktu', 'desc').limit(batas).get();
      return s.docs.map((d) => d.data() as Riwayat);
    },
  };
}

function lokal(): Store {
  const dir = path.resolve(process.env.DATA_DIR || '.data');
  const file = path.join(dir, 'kegiatan.json');
  const mfile = path.join(dir, 'meta.json');
  const read = async <T>(f: string, d: T): Promise<T> => {
    try {
      return JSON.parse(await fs.readFile(f, 'utf8'));
    } catch {
      return d;
    }
  };
  const write = async (f: string, v: unknown) => {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(f, JSON.stringify(v, null, 1));
  };
  const cfile = path.join(dir, 'cadangan.json');
  const rfile = path.join(dir, 'riwayat.json');
  return {
    async semua() {
      return read<Baris[]>(file, []);
    },
    async get(id) {
      return (await read<Baris[]>(file, [])).find((k) => k.id === id) || null;
    },
    async put(k) {
      const all = (await read<Baris[]>(file, [])).filter((x) => x.id !== k.id);
      all.push(k);
      await write(file, all);
    },
    async remove(id) {
      const all = await read<Kegiatan[]>(file, []);
      const rest = all.filter((x) => x.id !== id);
      await write(file, rest);
      return rest.length !== all.length;
    },
    async getMeta(key) {
      return (await read<Record<string, Meta>>(mfile, {}))[key] || null;
    },
    async setMeta(key, v) {
      const m = await read<Record<string, Meta>>(mfile, {});
      m[key] = v;
      await write(mfile, m);
    },
    async simpanCadangan(c) {
      const m = await read<Record<string, Cadangan>>(cfile, {});
      m[c.tanggal] = c;
      await write(cfile, m);
    },
    async daftarCadangan() {
      const m = await read<Record<string, Cadangan>>(cfile, {});
      return Object.values(m)
        .map(({ kegiatan, ...r }) => r)
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    },
    async ambilCadangan(t) {
      return (await read<Record<string, Cadangan>>(cfile, {}))[t] || null;
    },
    async hapusCadangan(t) {
      const m = await read<Record<string, Cadangan>>(cfile, {});
      delete m[t];
      await write(cfile, m);
    },
    async catat(r) {
      const l = await read<Riwayat[]>(rfile, []);
      l.push(r);
      await write(rfile, l);
    },
    async riwayat(batas) {
      return (await read<Riwayat[]>(rfile, [])).sort((a, b) => b.waktu.localeCompare(a.waktu)).slice(0, batas);
    },
  };
}

export async function db(): Promise<Store> {
  if (store) return store;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) store = await firestore();
  else if (process.env.VERCEL) throw new DbError('Database belum diatur: isi FIREBASE_SERVICE_ACCOUNT di pengaturan Vercel.');
  else store = lokal();
  return store;
}

const urut = (l: Kegiatan[]) => l.sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.dibuat.localeCompare(a.dibuat));
const bersih = ({ dihapus, ...k }: Baris) => k as Kegiatan;

// Kegiatan aktif (tidak di sampah), terbaru dulu.
export async function aktif() {
  return urut((await (await db()).semua()).filter((k) => !k.dihapus).map(bersih));
}
// Isi sampah, yang terakhir dihapus dulu.
export async function sampah() {
  return (await (await db()).semua()).filter((k) => k.dihapus).sort((a, b) => String(b.dihapus).localeCompare(String(a.dihapus)));
}

const SIMPAN_CADANGAN = 30;
// Salinan seluruh kegiatan (termasuk sampah) untuk tanggal hari ini (WIB); simpan 30 terakhir.
export async function buatCadangan() {
  const s = await db();
  const semua = await s.semua();
  const tanggal = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  await s.simpanCadangan({ tanggal, dibuat: new Date().toISOString(), jumlah: semua.filter((k) => !k.dihapus).length, kegiatan: semua });
  const lama = (await s.daftarCadangan()).slice(SIMPAN_CADANGAN);
  for (const c of lama) await s.hapusCadangan(c.tanggal);
  return tanggal;
}

// Kembalikan data ke isi satu cadangan. Aman: kegiatan yang dibuat setelah cadangan itu
// tidak dihapus, hanya dipindah ke sampah; kondisi sekarang dicadangkan dulu.
export async function pulihkanCadangan(tanggal: string, oleh = '') {
  const s = await db();
  const c = await s.ambilCadangan(tanggal);
  if (!c) throw new DbError('Cadangan tidak ditemukan.', 404);
  const sekarang = await s.semua();
  const waktu = new Date(Date.now() + 7 * 3600e3).toISOString();
  await s.simpanCadangan({ tanggal: `${waktu.slice(0, 10)} sebelum pemulihan ${waktu.slice(11, 16).replace(':', '.')}`, dibuat: new Date().toISOString(), jumlah: sekarang.filter((k) => !k.dihapus).length, kegiatan: sekarang });
  const ada = new Set(c.kegiatan.map((k) => k.id));
  for (const k of c.kegiatan as Baris[]) await s.put(k);
  const kini = new Date().toISOString();
  let disampahkan = 0;
  for (const k of sekarang) if (!ada.has(k.id) && !k.dihapus) (await s.put({ ...k, dihapus: kini }), disampahkan++);
  await catat({ aksi: 'pulihkan-cadangan', oleh, kegiatanId: '', judul: `Cadangan ${tanggal}`, catatan: `${c.kegiatan.length} kegiatan dipulihkan${disampahkan ? `, ${disampahkan} kegiatan baru dipindah ke sampah` : ''}` });
  return { dipulihkan: c.kegiatan.length, disampahkan };
}

// Catat satu aktivitas ke log riwayat. Kegagalan mencatat tidak membatalkan perubahan datanya.
export async function catat(r: Omit<Riwayat, 'id' | 'waktu'>) {
  try {
    await (await db()).catat({ ...r, id: `${Date.now()}-${randomUUID().slice(0, 8)}`, waktu: new Date().toISOString() });
  } catch (e) {
    console.error('[riwayat] gagal mencatat', e);
  }
}

export function baru(input: KegiatanInput): Kegiatan {
  const now = new Date().toISOString();
  return { ...input, id: randomUUID(), dibuat: now, diubah: now };
}
