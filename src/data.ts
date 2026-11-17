// Salinan data kegiatan di browser. Dimuat sekali, lalu disegarkan setelah ada perubahan.
import { api } from './api.js';
import type { Kegiatan } from '../shared/schema.js';

let cache: Kegiatan[] | null = null;
let janji: Promise<Kegiatan[]> | null = null;

export function dataKegiatan(): Promise<Kegiatan[]> {
  if (cache) return Promise.resolve(cache);
  if (!janji)
    janji = api
      .daftar()
      .then((d) => (cache = d))
      .finally(() => (janji = null));
  return janji;
}

export async function segarkanData() {
  cache = null;
  return dataKegiatan();
}

export const lupakanData = () => (cache = null);
