// Panggilan ke Gemini API. Kunci disimpan di environment variable GEMINI_API_KEY (Vercel),
// tidak pernah dikirim ke browser.

const CHAIN = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest'];
let good: string | null = null;

export class GeminiError extends Error {
  constructor(msg: string, public status: number) {
    super(msg);
  }
}

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } };
type Opt = { json?: boolean; temperature?: number; maxTokens?: number; timeout?: number };

async function call(model: string, key: string, parts: Part[], opt: Opt) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: opt.temperature ?? 0.2,
      maxOutputTokens: opt.maxTokens ?? 4096,
      ...(opt.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opt.timeout ?? 50000),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new GeminiError(String(j?.error?.message || `HTTP ${r.status}`).slice(0, 300), r.status);
  const c = j.candidates?.[0];
  const text = (c?.content?.parts || [])
    .filter((p: any) => !p.thought && typeof p.text === 'string')
    .map((p: any) => p.text)
    .join('');
  if (!text) throw new GeminiError(`Jawaban AI kosong (${c?.finishReason || 'tanpa alasan'})`, 502);
  if (c?.finishReason === 'MAX_TOKENS') throw new GeminiError('Jawaban AI terpotong (terlalu panjang).', 502);
  return text;
}

// Mencoba model satu per satu: model yang tidak tersedia atau kuotanya habis dilewati.
export async function generate(parts: Part[], opt: Opt = {}, lewati: string[] = []) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError('GEMINI_API_KEY belum diisi di pengaturan Vercel.', 503);
  const list = [process.env.GEMINI_MODEL, good, ...CHAIN].filter((m, i, a): m is string => !!m && a.indexOf(m) === i && !lewati.includes(m));
  let last: GeminiError | null = null;
  for (const m of list) {
    try {
      const t = await call(m, key, parts, opt);
      good = m;
      return { text: t, model: m };
    } catch (e: any) {
      last = e instanceof GeminiError ? e : new GeminiError(String(e?.message || e), 502);
      if (last.status === 401 || (last.status === 403 && !/model/i.test(last.message)) || (last.status === 400 && /api key/i.test(last.message)))
        throw new GeminiError('API key Gemini ditolak. Periksa GEMINI_API_KEY di Vercel.', 401);
      if (last.status === 400 && !/model/i.test(last.message)) throw last; // file tidak bisa dibaca, dll.
      console.error(`[gemini] ${m} gagal: ${last.status} ${last.message}`);
    }
  }
  if (last?.status === 429) throw new GeminiError('Kuota gratis Gemini sedang habis. Coba lagi beberapa menit lagi.', 429);
  throw last || new GeminiError('Tidak ada model Gemini yang bisa dipakai.', 502);
}

// Membaca JSON dari jawaban AI, toleran terhadap ``` atau teks tambahan di sekitarnya.
export function parseJson(text: string): any {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch (e) {
    const a = t.indexOf('{'),
      b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw e;
  }
}

// Panggil AI dan baca JSON-nya; kalau jawaban tidak terbaca, coba sekali lagi dengan model lain.
export async function generateJson(parts: Part[], opt: Opt = {}) {
  const r1 = await generate(parts, { ...opt, json: true });
  try {
    return { data: parseJson(r1.text), model: r1.model };
  } catch {
    console.error(`[gemini] JSON tidak terbaca dari ${r1.model}: ${r1.text.slice(0, 200)} … ${r1.text.slice(-120)}`);
  }
  const r2 = await generate(parts, { ...opt, json: true }, [r1.model]);
  return { data: parseJson(r2.text), model: r2.model };
}
