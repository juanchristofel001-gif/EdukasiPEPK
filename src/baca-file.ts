// Menyiapkan isi laporan di browser sebelum dikirim ke server, supaya file besar (banyak foto)
// tetap bisa diproses: yang dikirim hanya teksnya, atau gambar halaman yang sudah diperkecil.
// Batas kiriman ke server Vercel sekitar 4,5 MB, jadi semua dijaga di bawah ~3,5 MB.

export type Gambar = { mime: string; data: string };
export type Kiriman = { nama: string; teks?: string; gambar?: Gambar[] };

const BATAS = 3.5 * 1024 * 1024;
const MAKS_HAL_GAMBAR = 6;

async function kanvasKeJpeg(c: HTMLCanvasElement, kualitas = 0.72): Promise<Gambar> {
  const url = c.toDataURL('image/jpeg', kualitas);
  return { mime: 'image/jpeg', data: url.split(',')[1] || '' };
}

async function pdf(f: File): Promise<Kiriman> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;

  // 1) Ambil teks semua halaman.
  const hal: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 40); i++) {
    const p = await doc.getPage(i);
    const t = await p.getTextContent();
    let baris = '';
    for (const it of t.items as any[]) baris += it.str + (it.hasEOL ? '\n' : ' ');
    hal.push(baris.replace(/[ \t]+/g, ' ').trim());
  }
  const teks = hal.join('\n\n').trim();
  if (teks.replace(/\s/g, '').length > 300) return { nama: f.name, teks };

  // 2) Tidak ada teks (hasil scan/foto): kirim beberapa halaman pertama sebagai gambar kecil.
  const gambar: Gambar[] = [];
  let total = 0;
  for (let i = 1; i <= Math.min(doc.numPages, MAKS_HAL_GAMBAR); i++) {
    const p = await doc.getPage(i);
    const v0 = p.getViewport({ scale: 1 });
    const scale = Math.min(2, 1400 / v0.width);
    const v = p.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.round(v.width);
    c.height = Math.round(v.height);
    await p.render({ canvas: c, canvasContext: c.getContext('2d')!, viewport: v } as any).promise;
    const g = await kanvasKeJpeg(c);
    if (total + g.data.length * 0.75 > BATAS) break;
    total += g.data.length * 0.75;
    gambar.push(g);
  }
  if (!gambar.length) throw new Error('PDF ini tidak bisa dibaca.');
  return { nama: f.name, gambar };
}

async function foto(f: File): Promise<Kiriman> {
  const bmp = await createImageBitmap(f);
  const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s);
  c.height = Math.round(bmp.height * s);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  let q = 0.8;
  let g = await kanvasKeJpeg(c, q);
  while (g.data.length * 0.75 > BATAS && q > 0.3) g = await kanvasKeJpeg(c, (q -= 0.15));
  return { nama: f.name, gambar: [g] };
}

async function word(f: File): Promise<Kiriman> {
  const mammoth: any = await import('mammoth');
  const r = await (mammoth.default || mammoth).extractRawText({ arrayBuffer: await f.arrayBuffer() });
  if (!r.value.trim()) throw new Error('Dokumen Word ini kosong atau tidak terbaca.');
  return { nama: f.name, teks: r.value };
}

export async function siapkan(f: File): Promise<Kiriman> {
  const ext = f.name.toLowerCase().split('.').pop() || '';
  if (f.size > 60 * 1024 * 1024) throw new Error('File lebih dari 60 MB. Ekspor ulang laporannya dengan ukuran lebih kecil.');
  if (ext === 'pdf' || f.type === 'application/pdf') return pdf(f);
  if (ext === 'docx') return word(f);
  if (/^image\//.test(f.type) || ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) return foto(f);
  if (ext === 'doc') throw new Error('Format .doc lama belum didukung. Simpan ulang sebagai .docx atau PDF.');
  throw new Error('Format belum didukung. Gunakan PDF, Word (.docx), JPG, atau PNG.');
}
