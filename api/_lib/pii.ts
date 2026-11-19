// Samarkan data pribadi (NIK, nomor HP, email, NPWP, nomor rekening) dari teks sebelum dikirim ke Gemini.
// Dipanggil di api/_lib/gemini.ts untuk setiap bagian teks, jadi semua fitur AI lewat gerbang ini.
export function samarkan(t: string) {
  return String(t || '')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}/g, '[NPWP]')
    .replace(/(^|[^\d])(\d{16})(?!\d)/g, '$1[NIK]')
    .replace(/(^|[^\d+])((?:\+62|62|0)\s?8[\d\s.-]{7,14}\d)(?!\d)/g, (m, a, n) => (n.replace(/\D/g, '').length < 10 ? m : a + '[no. HP]'))
    .replace(/(rp\.?\s*)?(\d[\d.\s-]{8,}\d)/gi, (m, rp, n) => (rp || n.replace(/\D/g, '').length < 10 ? m : '[nomor]'));
}
