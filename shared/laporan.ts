// Isi laporan PDF: angka tambahan di luar dasbor dan "deskripsi" tiap grafik.
// Deskripsi dihitung langsung dari data (bukan AI), dan dipakai di browser maupun di server,
// sehingga AI hanya menafsirkan angka yang sama persis dengan yang tercetak di laporan.
import { KABKOTA, type Kegiatan } from './schema.js';
import { JUMLAH_KECAMATAN } from './kecamatan.js';
import { statistik, dalamPeriode, namaBulan, tanggalPanjang, angka, type Periode, type Statistik } from './statistik.js';
import { desimal, TAHUN_PENDUDUK, PENDUDUK } from './penduduk.js';

// Naikkan angka ini setiap kali isi laporan atau perintah AI berubah, supaya interpretasi lama ditulis ulang.
export const VERSI_TAFSIR = 3;

// Penanda isi data satu periode: jumlah kegiatan + waktu perubahan terakhir.
// Kalau ada kegiatan ditambah, diubah, atau dihapus, penanda ini berubah.
export function sidikData(semua: Kegiatan[], p: Periode, kab?: string) {
  const l = dalamPeriode(kab ? semua.filter((k) => k.kabkota === kab) : semua, p);
  return `${l.length}|${l.reduce((m, k) => (k.diubah > m ? k.diubah : m), '')}`;
}

export const BAGIAN = [
  ['peta', 'Sebaran kecamatan'],
  ['wilayah', 'Kegiatan per kabupaten/kota'],
  ['tren', 'Tren bulanan'],
  ['peserta', 'Besaran peserta per kegiatan'],
  ['sasaran', 'Sasaran peserta'],
  ['topik', 'Topik materi'],
  ['bentuk', 'Bentuk dan cara pelaksanaan'],
  ['mitra', 'Mitra penyelenggara'],
] as const;
export type Bagian = (typeof BAGIAN)[number][0];

// Judul bagian; laporan satu kab/kota memakai judul yang sedikit berbeda.
export function judulBagian(k: Bagian, kab?: string) {
  if (kab && k === 'peta') return `Sebaran kecamatan di ${kab}`;
  if (kab && k === 'wilayah') return 'Posisi dibanding kabupaten/kota lain';
  return BAGIAN.find(([x]) => x === k)![1];
}

export const KELAS_PESERTA = ['1–50', '51–100', '101–250', '251–500', '501–1.000', 'Di atas 1.000'] as const;
const BATAS = [50, 100, 250, 500, 1000, Infinity];

export type DataLaporan = Statistik & {
  bentuk: [string, number][];
  jenis: [string, number][];
  kelasPeserta: [string, number][]; // jumlah kegiatan per kelas besaran peserta
  tanpaPeserta: number;
  terbesar: { judul: string; tanggal: string; kabkota: string; peserta: number; mode: string }[];
  porsiTerbesar: number; // % peserta dari 5 kegiatan terbesar
  mitra: [string, number][];
  tanpaMitra: number;
  kab?: string; // diisi untuk laporan satu kabupaten/kota
  banten?: Statistik; // statistik seluruh Banten pada periode yang sama (pembanding)
};

// Penyamaan nama mitra yang hanya beda huruf besar/kecil atau spasi (mis. "UNTIRTA" dan "Untirta").
function kunciMitra(s: string) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function dataLaporan(semuaBanten: Kegiatan[], p: Periode, kab?: string): DataLaporan {
  const semua = kab ? semuaBanten.filter((k) => k.kabkota === kab) : semuaBanten;
  const st = statistik(semua, p);
  const list = dalamPeriode(semua, p);
  const hitung = (f: (k: Kegiatan) => string) => {
    const m = new Map<string, number>();
    for (const k of list) {
      const v = f(k);
      if (v) m.set(v, (m.get(v) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const berpeserta = list.filter((k) => (k.peserta || 0) > 0);
  const kelasPeserta = KELAS_PESERTA.map((n, i): [string, number] => [n, berpeserta.filter((k) => k.peserta! <= BATAS[i] && (i === 0 || k.peserta! > BATAS[i - 1])).length]);
  const urut = [...berpeserta].sort((a, b) => b.peserta! - a.peserta!);
  const top5 = urut.slice(0, 5).reduce((s, k) => s + k.peserta!, 0);
  const tampilan = new Map<string, string>();
  const mitraMap = new Map<string, number>();
  for (const k of list) {
    const m = (k.pengundang || '').replace(/\s+/g, ' ').trim();
    if (!m) continue;
    const kk = kunciMitra(m);
    if (!tampilan.has(kk)) tampilan.set(kk, m);
    mitraMap.set(kk, (mitraMap.get(kk) || 0) + 1);
  }
  return {
    ...st,
    bentuk: hitung((k) => k.bentuk),
    jenis: hitung((k) => k.jenis),
    kelasPeserta,
    tanpaPeserta: list.length - berpeserta.length,
    terbesar: urut.slice(0, 5).map((k) => ({ judul: k.judul, tanggal: k.tanggal, kabkota: k.kabkota, peserta: k.peserta!, mode: k.mode })),
    porsiTerbesar: st.peserta ? Math.round((top5 / st.peserta) * 100) : 0,
    mitra: [...mitraMap.entries()].map(([k, n]): [string, number] => [tampilan.get(k)!, n]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    tanpaMitra: list.filter((k) => !(k.pengundang || '').trim()).length,
    ...(kab ? { kab, banten: statistik(semuaBanten, p) } : {}),
  };
}

// Peringkat dan porsi satu kab/kota terhadap seluruh Banten.
export function posisiKab(d: DataLaporan) {
  if (!d.kab || !d.banten) return null;
  const b = d.banten;
  const w = b.perWilayah.find((x) => x.nama === d.kab)!;
  const peringkat = (f: (x: (typeof b.perWilayah)[number]) => number) => 1 + b.perWilayah.filter((x) => f(x) > f(w)).length;
  const totalPenduduk = Object.values(PENDUDUK).reduce((a, n) => a + n, 0);
  const keg8 = b.perWilayah.reduce((a, x) => a + x.kegiatan, 0);
  return {
    w,
    rankKegiatan: peringkat((x) => x.kegiatan),
    rankPeserta: peringkat((x) => x.peserta),
    rankPenduduk: peringkat((x) => x.per100rb),
    porsiKegiatan: persen(w.kegiatan, b.kegiatan),
    porsiPeserta: persen(w.peserta, b.peserta),
    rataBanten: totalPenduduk ? Math.round((keg8 / totalPenduduk) * 1_000_000) / 10 : 0,
  };
}

const persen = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const daftar = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' dan ' + xs[xs.length - 1]);
const pendek = (s: string) => s.replace('Kabupaten ', 'Kab. ');

// Kalimat deskripsi per bagian. Semua angka di sini bisa dicocokkan dengan grafik di sebelahnya.
export function deskripsi(d: DataLaporan): Record<Bagian, string> {
  const ada = d.perWilayah.filter((w) => w.kegiatan).sort((a, b) => b.kegiatan - a.kegiatan || b.peserta - a.peserta);
  const belum = d.perWilayah.filter((w) => !w.kegiatan);
  const kecTop = d.perKecamatan.filter((c) => c.kegiatan).sort((a, b) => b.kegiatan - a.kegiatan || b.peserta - a.peserta);
  const bulanAda = d.perBulan.filter((b) => b.kegiatan);
  const bKeg = [...bulanAda].sort((a, b) => b.kegiatan - a.kegiatan)[0];
  const bPes = [...bulanAda].sort((a, b) => b.peserta - a.peserta)[0];
  const bulanKosong = d.perBulan.filter((b) => !b.kegiatan);
  const kecil = d.kelasPeserta.slice(0, 3).reduce((s, [, n]) => s + n, 0);
  const berpeserta = d.kelasPeserta.reduce((s, [, n]) => s + n, 0);
  const t = d.terbesar[0];
  const pos = posisiKab(d);
  const kecBelum = d.kab ? d.perKecamatan.filter((c) => c.kab === d.kab && !c.kegiatan).map((c) => c.nama) : [];
  const out: Record<Bagian, string> = {
    peta: pos
      ? `${pos.w.kecTerjangkau} dari ${pos.w.kecTotal} kecamatan di ${d.kab} (${persen(pos.w.kecTerjangkau, pos.w.kecTotal)}%) sudah memiliki setidaknya satu kegiatan.` +
        (kecTop.length ? ` Terbanyak di ${daftar(kecTop.slice(0, 3).map((c) => `${c.nama} (${c.kegiatan})`))}.` : '') +
        (kecBelum.length ? ` Belum dijangkau: ${daftar(kecBelum.slice(0, 15))}${kecBelum.length > 15 ? ` dan ${kecBelum.length - 15} kecamatan lain` : ''}.` : '') +
        (d.tanpaKecamatan ? ` Sebanyak ${d.tanpaKecamatan} kegiatan belum dicatat kecamatannya sehingga tidak tampak di peta ini.` : '')
      :
      `${d.kecamatanTerjangkau} dari ${JUMLAH_KECAMATAN} kecamatan di Banten (${persen(d.kecamatanTerjangkau, JUMLAH_KECAMATAN)}%) sudah memiliki setidaknya satu kegiatan.` +
      (kecTop.length ? ` Kecamatan dengan kegiatan terbanyak: ${daftar(kecTop.slice(0, 3).map((c) => `${c.nama}, ${pendek(c.kab)} (${c.kegiatan})`))}.` : '') +
      (d.tanpaKecamatan ? ` Sebanyak ${d.tanpaKecamatan} kegiatan belum dicatat kecamatannya sehingga tidak tampak di peta ini.` : ''),
    wilayah: pos
      ? `${d.kab} mencatat ${pos.w.kegiatan} kegiatan (${pos.porsiKegiatan}% dari seluruh kegiatan di Banten), peringkat ${pos.rankKegiatan} dari ${KABKOTA.length} kabupaten/kota, ` +
        `dan ${angka(pos.w.peserta)} peserta (peringkat ${pos.rankPeserta}). ` +
        `Dibandingkan jumlah penduduk (${TAHUN_PENDUDUK}), angkanya ${desimal(pos.w.per100rb)} kegiatan per 100 ribu penduduk (peringkat ${pos.rankPenduduk}; rata-rata Banten ${desimal(pos.rataBanten)}).`
      :
      `Kegiatan menjangkau ${d.wilayahTerjangkau} dari ${KABKOTA.length} kabupaten/kota.` +
      (ada.length ? ` Terbanyak di ${daftar(ada.slice(0, 3).map((w) => `${w.nama} (${w.kegiatan} kegiatan, ${angka(w.peserta)} peserta)`))}.` : '') +
      (belum.length ? ` Belum ada kegiatan di ${daftar(belum.map((w) => w.nama))}.` : '') +
      (ada.length ? (() => {
        const r = [...d.perWilayah].sort((a, b) => b.per100rb - a.per100rb);
        const hi = r[0], lo = r[r.length - 1];
        return ` Dibandingkan jumlah penduduk (${TAHUN_PENDUDUK}), kegiatan paling rapat di ${hi.nama} (${desimal(hi.per100rb)} per 100 ribu penduduk) dan paling jarang di ${lo.nama} (${desimal(lo.per100rb)}).`;
      })() : '') +
      (ada.length ? ` Cakupan kecamatan tertinggi di ${(() => {
        const w = [...ada].sort((a, b) => b.kecTerjangkau / b.kecTotal - a.kecTerjangkau / a.kecTotal)[0];
        return `${w.nama} (${w.kecTerjangkau} dari ${w.kecTotal} kecamatan)`;
      })()}.` : ''),
    tren: bulanAda.length
      ? `Kegiatan tercatat di ${bulanAda.length} dari ${d.perBulan.length} bulan pada periode ini. Kegiatan terbanyak pada ${namaBulan(bKeg.bulan)} (${bKeg.kegiatan} kegiatan), peserta terbanyak pada ${namaBulan(bPes.bulan)} (${angka(bPes.peserta)} peserta).` +
        (bulanKosong.length && bulanKosong.length <= 4 ? ` Tidak ada kegiatan pada ${daftar(bulanKosong.map((b) => namaBulan(b.bulan)))}.` : bulanKosong.length ? ` ${bulanKosong.length} bulan tanpa kegiatan.` : '')
      : 'Belum ada kegiatan pada periode ini.',
    peserta: berpeserta
      ? `Total ${d.adaPerkiraan ? 'sekitar ' : ''}${angka(d.peserta)} peserta dari ${berpeserta} kegiatan yang mencatat jumlah peserta. ${kecil} kegiatan (${persen(kecil, berpeserta)}%) berpeserta 250 orang atau kurang.` +
        ` Lima kegiatan terbesar menyumbang ${d.porsiTerbesar}% dari total peserta; yang terbesar "${t.judul.slice(0, 90)}" (${angka(t.peserta)} peserta, ${tanggalPanjang(t.tanggal)}, ${t.mode || 'mode tidak dicatat'}).` +
        (d.tanpaPeserta ? ` ${d.tanpaPeserta} kegiatan tidak mencatat jumlah peserta.` : '')
      : 'Belum ada kegiatan yang mencatat jumlah peserta.',
    sasaran: d.sasaran.length
      ? `Sasaran yang paling sering dijangkau: ${daftar(d.sasaran.slice(0, 3).map(([n, c]) => `${n.toLowerCase()} (${c} kegiatan)`))}. Satu kegiatan bisa memiliki lebih dari satu sasaran, sehingga jumlahnya tidak sama dengan total kegiatan.`
      : 'Sasaran peserta belum dicatat.',
    topik: d.topik.length
      ? `Topik yang paling sering dibawakan: ${daftar(d.topik.slice(0, 3).map(([n, c]) => `${n.toLowerCase()} (${c} kegiatan)`))}. Tercatat ${d.topik.length} topik berbeda.`
      : 'Topik materi belum dicatat.',
    bentuk:
      (d.bentuk.length ? `Bentuk kegiatan terbanyak: ${daftar(d.bentuk.slice(0, 3).map(([n, c]) => `${n.toLowerCase()} (${c})`))}.` : 'Bentuk kegiatan belum dicatat.') +
      (d.mode.length ? ` Menurut cara pelaksanaan: ${daftar(d.mode.map(([n, c]) => `${n.toLowerCase()} ${c} kegiatan`))}.` : '') +
      (d.peran.length ? ` Peran OJK: ${daftar(d.peran.map(([n, c]) => `${n.toLowerCase()} ${c}`))}.` : ''),
    mitra: d.mitra.length
      ? `Kegiatan diselenggarakan bersama ${d.mitra.length} mitra berbeda. Mitra dengan kegiatan terbanyak: ${daftar(d.mitra.slice(0, 3).map(([n, c]) => `${n} (${c})`))}.` +
        (d.tanpaMitra ? ` ${d.tanpaMitra} kegiatan tidak mencantumkan mitra.` : '') +
        ' Nama mitra dihitung apa adanya; penulisan berbeda untuk lembaga yang sama (mis. singkatan) terhitung terpisah.'
      : 'Mitra penyelenggara belum dicatat.',
  };
  return out;
}

// Ringkasan angka yang dikirim ke AI (tanpa daftar kegiatan lengkap).
export function bahanAi(d: DataLaporan) {
  const pos = posisiKab(d);
  return {
    ...(pos
      ? {
          fokusLaporan: d.kab,
          posisiDibandingKabKotaLain: {
            peringkatKegiatan: `${pos.rankKegiatan}/${KABKOTA.length}`,
            peringkatPeserta: `${pos.rankPeserta}/${KABKOTA.length}`,
            peringkatPerPenduduk: `${pos.rankPenduduk}/${KABKOTA.length}`,
            porsiKegiatanDariBanten: pos.porsiKegiatan + '%',
            kegiatanPer100rbPenduduk: pos.w.per100rb,
            rataRataBantenPer100rb: pos.rataBanten,
          },
          kecamatanBelumDijangkau: d.perKecamatan.filter((c) => c.kab === d.kab && !c.kegiatan).map((c) => c.nama),
        }
      : {}),
    periode: d.periode,
    kegiatan: d.kegiatan,
    peserta: d.peserta,
    pesertaAdaPerkiraan: d.adaPerkiraan,
    ...(pos
      ? { kecamatanTerjangkau: `${pos.w.kecTerjangkau}/${pos.w.kecTotal}` }
      : { kabkotaTerjangkau: `${d.wilayahTerjangkau}/${KABKOTA.length}`, kecamatanTerjangkau: `${d.kecamatanTerjangkau}/${JUMLAH_KECAMATAN}` }),
    kegiatanTanpaKecamatan: d.tanpaKecamatan,
    [pos ? 'perWilayahSeluruhBanten' : 'perWilayah']: (d.banten || d).perWilayah.map((w) => ({ nama: w.nama, kegiatan: w.kegiatan, peserta: w.peserta, kecamatan: `${w.kecTerjangkau}/${w.kecTotal}`, penduduk: w.penduduk, kegiatanPer100rbPenduduk: w.per100rb })),
    kecamatanTeratas: d.perKecamatan.filter((c) => c.kegiatan).sort((a, b) => b.kegiatan - a.kegiatan).slice(0, 10).map((c) => `${c.nama}, ${c.kab}: ${c.kegiatan}`),
    perBulan: d.perBulan,
    kelasPeserta: d.kelasPeserta,
    kegiatanTerbesar: d.terbesar,
    porsiPeserta5Terbesar: d.porsiTerbesar + '%',
    sasaran: d.sasaran,
    topik: d.topik,
    bentuk: d.bentuk,
    mode: d.mode,
    jenis: d.jenis,
    peranOjk: d.peran,
    mitraTeratas: d.mitra.slice(0, 10),
  };
}
