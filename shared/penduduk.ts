// Jumlah penduduk per kabupaten/kota, untuk ukuran "kegiatan per 100 ribu penduduk".
// Sumber: BPS Provinsi Banten, "Jumlah Penduduk Menurut Kabupaten/Kota di Provinsi Banten tahun 2020, 2024,
// dan 2025" (Satu Data Banten, data.bantenprov.go.id). Angka asli dalam ribu jiwa; total 12.537,44 ribu.
// Perbarui angka dan TAHUN_PENDUDUK di sini bila BPS merilis data tahun berikutnya.
export const TAHUN_PENDUDUK = 2025;
export const SUMBER_PENDUDUK = `BPS Provinsi Banten, jumlah penduduk menurut kabupaten/kota tahun ${TAHUN_PENDUDUK}`;

export const PENDUDUK: Record<string, number> = {
  'Kabupaten Pandeglang': 1_338_370,
  'Kabupaten Lebak': 1_463_820,
  'Kabupaten Tangerang': 3_435_160,
  'Kabupaten Serang': 1_720_320,
  'Kota Tangerang': 1_971_650,
  'Kota Cilegon': 460_400,
  'Kota Serang': 745_560,
  'Kota Tangerang Selatan': 1_402_160,
};

// Kegiatan per 100 ribu penduduk, dibulatkan 1 desimal.
export const per100rb = (kegiatan: number, kab: string) => (PENDUDUK[kab] ? Math.round((kegiatan / PENDUDUK[kab]) * 1_000_000) / 10 : 0);
export const desimal = (n: number) => n.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
