// Penyimpanan data kegiatan.
// - Di Vercel: Firestore (Firebase), lewat akun layanan di env FIREBASE_SERVICE_ACCOUNT.
//   Browser tidak pernah mengakses Firestore langsung; semua lewat server ini.
// - Saat pengembangan lokal tanpa Firebase: file .data/kegiatan.json.
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Kegiatan, KegiatanInput } from '../../shared/schema.js';

export class DbError extends Error {
  constructor(msg: string, public status = 503) {
    super(msg);
  }
}

type Meta = Record<string, unknown>;

interface Store {
  list(): Promise<Kegiatan[]>;
  get(id: string): Promise<Kegiatan | null>;
  put(k: Kegiatan): Promise<void>;
  remove(id: string): Promise<boolean>;
  getMeta(key: string): Promise<Meta | null>;
  setMeta(key: string, v: Meta): Promise<void>;
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
  return {
    async list() {
      const s = await col.orderBy('tanggal', 'desc').get();
      return s.docs.map((d) => d.data() as Kegiatan);
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
  return {
    async list() {
      const all = await read<Kegiatan[]>(file, []);
      return all.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    },
    async get(id) {
      return (await read<Kegiatan[]>(file, [])).find((k) => k.id === id) || null;
    },
    async put(k) {
      const all = (await read<Kegiatan[]>(file, [])).filter((x) => x.id !== k.id);
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
  };
}

export async function db(): Promise<Store> {
  if (store) return store;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) store = await firestore();
  else if (process.env.VERCEL) throw new DbError('Database belum diatur: isi FIREBASE_SERVICE_ACCOUNT di pengaturan Vercel.');
  else store = lokal();
  return store;
}

export function baru(input: KegiatanInput): Kegiatan {
  const now = new Date().toISOString();
  return { ...input, id: randomUUID(), dibuat: now, diubah: now };
}
