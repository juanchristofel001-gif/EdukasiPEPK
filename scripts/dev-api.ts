// Server lokal untuk menjalankan fungsi di folder api/ tanpa Vercel.
// Jalankan: KODE_AKSES=uji MOCK_AI=1 npm run dev:api
// MOCK_AI=1 → AI diganti jawaban contoh (tanpa memanggil Gemini).
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.PORT || 3001);
const STATIC = process.env.STATIC_DIR; // opsional: sajikan hasil build (dist) juga

http
  .createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const r = res as any;
    r.status = (c: number) => ((res.statusCode = c), r);
    r.json = (v: unknown) => (res.setHeader('Content-Type', 'application/json'), res.end(JSON.stringify(v)), r);
    r.send = (v: unknown) => (res.end(v as any), r);
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z]/g, '');
      let mod: any;
      try {
        mod = await import(path.resolve('api', name + '.ts'));
      } catch {
        return r.status(404).json({ error: 'Tidak ada' });
      }
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks).toString();
      const q = req as any;
      q.query = Object.fromEntries(url.searchParams);
      try {
        q.body = raw ? JSON.parse(raw) : undefined;
      } catch {
        q.body = raw;
      }
      return mod.default(q, r);
    }
    if (!STATIC) return r.status(404).json({ error: 'Tidak ada' });
    const f = path.join(STATIC, url.pathname === '/' ? 'index.html' : url.pathname);
    try {
      const d = await readFile(f);
      const ext = path.extname(f);
      res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' }[ext] || 'application/octet-stream');
      res.end(d);
    } catch {
      res.setHeader('Content-Type', 'text/html');
      res.end(await readFile(path.join(STATIC, 'index.html')));
    }
  })
  .listen(PORT, () => console.log('API lokal di http://localhost:' + PORT));
