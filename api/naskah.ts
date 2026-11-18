// /api/naskah — AI menulis naskah laporan Word (bagian A–E) untuk satu kegiatan.
//   POST { isian: KegiatanInput } → { naskah }
// Nama narasumber TIDAK dikirim ke AI: AI menulis penanda [NARASUMBER] dan browser menggantinya
// dengan nama dari data. Naskah tidak disimpan di sini; tim menyunting dulu lalu menyimpannya lewat /api/kegiatan.
import { izinkan, fail, ok, type Req, type Res } from './_lib/http.js';
import { generateJson, GeminiError } from './_lib/gemini.js';
import { rapikan, BAGIAN_NASKAH, type Naskah } from '../shared/schema.js';
import { tanggalPanjang } from '../shared/statistik.js';

// Contoh gaya dari laporan tim (PKU Akbar PNM Cabang Serang), dipakai sebagai acuan nada dan panjang.
const CONTOH = `A. Pendahuluan
Dalam rangka meningkatkan pemahaman dan kesadaran finansial masyarakat, Otoritas Jasa Keuangan (OJK) Provinsi Banten menjadi salah satu pemateri dalam PKU Akbar Cabang Serang yang diselenggarakan oleh Permodalan Nasional Madani (PNM). Edukasi ini dilandasi oleh pentingnya pembekalan perencanaan keuangan yang cerdas sejak dini dan alokasi pendapatan untuk membangun kemandirian ekonomi untuk memutus siklus generasi sandwich sekaligus membangun pondasi perekonomian keluarga dan usaha yang sehat dan proporsional. Selain itu, pengenalan terhadap tugas, fungsi, dan wewenang OJK dalam mengawasi sektor jasa keuangan menjadi krusial agar masyarakat serta pelaku UMKM terhindar dari berbagai risiko keuangan ilegal dan mampu menjadi konsumen yang berdaya.
B. Pelaksanaan Kegiatan
Kegiatan Edukasi Keuangan kepada Nasabah PNM Cabang Serang dan Masyarakat Non-Nasabah (umum): Pengelolaan Keuangan dan Waspada Kejahatan Keuangan dalam acara PKU Akbar PNM Cabang Serang dilaksanakan pada 4 November 2026 di Universitas La Tansa Mashiro. Materi mengenai pengelolaan keuangan usaha dan peningkatan pemahaman finansial disampaikan oleh [NARASUMBER] selaku perwakilan dari Otoritas Jasa Keuangan (OJK) Provinsi Banten.
C. Peserta
Kegiatan Edukasi Keuangan diikuti oleh sekitar 250 peserta dari nasabah PNM maupun masyarakat umum. Para peserta mengikuti seluruh rangkaian kegiatan dengan antusias dan aktif dalam menyimak materi serta berdiskusi bersama narasumber. Selain edukasi keuangan, kegiatan ini juga dirangkaikan dengan kegiatan PKU Akbar PNM cabang Serang. Melalui kegiatan ini, diharapkan dapat meningkatkan pemahaman masyarakat terhadap pengelolaan dan alokasi keuangan yang bijak dan kewaspadaan terhadap aktivitas keuangan ilegal, sekaligus memberikan keberkahan serta manfaat nyata bagi masyarakat sekitar.
D. Kesimpulan
Kegiatan Edukasi Keuangan kepada Nasabah PNM Cabang Serang dan Masyarakat Umum dengan tema Pengelolaan Keuangan dan Waspada Kejahatan Keuangan telah terlaksana dengan baik dan mendapat antusiasme yang tinggi dari sekitar 250 peserta. Melalui sinergi antara OJK Provinsi Banten dan Permodalan Nasional Madani (PNM) dalam rangkaian acara PKU Akbar, kegiatan ini berhasil meningkatkan pemahaman masyarakat terkait perencanaan keuangan yang cerdas, alokasi pendapatan untuk memutus siklus generasi sandwich, serta pembangunan pondasi ekonomi keluarga dan usaha yang sehat.
E. Penutup
Kegiatan edukasi ditutup pada pukul 10.30 WIB sedangkan acara PKU Akbar masih dilanjutkan s.d selesai.`;

export default async function handler(req: Req, res: Res) {
  if (!izinkan(req, res)) return;
  if (req.method !== 'POST') return fail(res, 405, 'Metode tidak didukung.');
  const k = rapikan((req.body as any)?.isian || {});
  if (!k.judul || !k.tanggal) return fail(res, 400, 'Judul dan tanggal kegiatan perlu diisi dulu.');

  const data = {
    judul: k.judul,
    tema: k.tema,
    mitraPenyelenggara: k.pengundang,
    peranOjk: k.peranOjk,
    tanggal: tanggalPanjang(k.tanggal) + (k.tanggalSelesai ? ` s.d. ${tanggalPanjang(k.tanggalSelesai)}` : ''),
    jamMulai: k.jamMulai,
    jamSelesaiEdukasi: k.jamSelesai,
    tempat: k.tempat,
    kabkota: k.kabkota,
    bentuk: k.bentuk,
    mode: k.mode,
    sasaran: k.sasaran,
    sasaranDetail: k.sasaranDetail,
    peserta: k.peserta,
    pesertaPerkiraan: k.pesertaPerkiraan,
    topik: k.topik,
    jumlahNarasumber: k.narasumber.length,
    ringkasanMateri: k.ringkasan,
    catatanLapangan: k.catatan,
  };
  const prompt = `Kamu staf PEPK Kantor OJK Provinsi Banten yang menulis laporan kegiatan edukasi keuangan untuk atasan.
Tulis naskah laporan untuk kegiatan berikut, dengan gaya, nada, dan panjang yang SAMA dengan contoh.

CONTOH LAPORAN TIM:
${CONTOH}

DATA KEGIATAN (JSON):
${JSON.stringify(data)}

Aturan:
- Bahasa Indonesia baku dan formal, kalimat lengkap, tanpa poin-poin, tanpa judul bagian.
- Setiap bagian satu paragraf. Pendahuluan, Peserta, dan Kesimpulan masing-masing 3–5 kalimat; Pelaksanaan 2 kalimat; Penutup 1 kalimat.
- Pelaksanaan: sebut judul kegiatan, tanggal, dan tempat, lalu "disampaikan oleh [NARASUMBER] selaku perwakilan dari Otoritas Jasa Keuangan (OJK) Provinsi Banten".
  Tulis penanda [NARASUMBER] persis seperti itu; jangan menulis nama orang.
- Peserta: pakai jumlah peserta dari data (tulis "sekitar" bila pesertaPerkiraan true); jangan mengarang jumlah.
- Penutup: "Kegiatan edukasi ditutup pada pukul <jamSelesaiEdukasi> WIB." Kalau jamSelesaiEdukasi kosong, tulis "Kegiatan edukasi ditutup setelah sesi diskusi dan tanya jawab." Tambahkan anak kalimat tentang acara mitra hanya bila datanya menunjukkan edukasi bagian dari acara yang lebih besar.
- Jangan mengarang fakta yang tidak ada di data (nama pejabat, kutipan, angka, hasil survei). Uraian latar belakang dan manfaat boleh umum, sesuai topik.
Jawab HANYA JSON: {${BAGIAN_NASKAH.map(([b]) => `"${b}":"..."`).join(',')}}`;

  try {
    let out: any;
    if (process.env.MOCK_AI && !process.env.VERCEL) {
      out = {
        pendahuluan: `Contoh pendahuluan (mode uji) untuk ${k.judul}.`,
        pelaksanaan: `Kegiatan ${k.judul} dilaksanakan pada ${data.tanggal} di ${k.tempat || 'lokasi kegiatan'}. Materi disampaikan oleh [NARASUMBER] selaku perwakilan dari Otoritas Jasa Keuangan (OJK) Provinsi Banten.`,
        peserta: `Kegiatan diikuti oleh ${k.pesertaPerkiraan ? 'sekitar ' : ''}${k.peserta ?? '...'} peserta (mode uji).`,
        kesimpulan: 'Contoh kesimpulan (mode uji).',
        penutup: k.jamSelesai ? `Kegiatan edukasi ditutup pada pukul ${k.jamSelesai} WIB.` : 'Kegiatan edukasi ditutup setelah sesi diskusi dan tanya jawab.',
      };
    } else {
      out = (await generateJson([{ text: prompt }], { temperature: 0.4, maxTokens: 4096 })).data;
    }
    const naskah = Object.fromEntries(BAGIAN_NASKAH.map(([b]) => [b, String(out?.[b] || '').trim().slice(0, 4000)])) as Naskah;
    if (!Object.values(naskah).some(Boolean)) return fail(res, 502, 'Jawaban AI kosong. Coba lagi.');
    return ok(res, { naskah });
  } catch (e: any) {
    if (e instanceof GeminiError) return fail(res, e.status, e.message);
    if (e instanceof SyntaxError) return fail(res, 502, 'Jawaban AI tidak terbaca. Coba lagi.');
    return fail(res, 500, 'Gagal menulis naskah: ' + String(e?.message || e).slice(0, 200));
  }
}
