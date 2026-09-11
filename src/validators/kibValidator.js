export const KATEGORI_OPTIONS = [
  { value: 'kendaraan', label: 'Kendaraan' },
  { value: 'peralatan', label: 'Peralatan' },
  { value: 'aset_lainnya', label: 'Aset Lainnya' },
];

export const KONDISI_OPTIONS = [
  { value: 'baik', label: 'Baik' },
  { value: 'rusak_ringan', label: 'Rusak Ringan' },
  { value: 'rusak_berat', label: 'Rusak Berat' },
];

// Klasifikasi roda kendaraan — dipakai untuk menentukan nominal kupon BBM
// dan kode rekening belanja BBM otomatis (lihat transaksiValidator.js).
// Berbeda dari "Jenis Kendaraan" (teks bebas/deskriptif, mis. "Minibus").
export const RODA_OPTIONS = [
  { value: 'roda2', label: 'Roda 2' },
  { value: 'roda4', label: 'Roda 4' },
];

const KATEGORI_ALIASES = {
  kendaraan: ['kendaraan', 'vehicle', 'mobil', 'motor', 'roda 4', 'roda 2', 'kendaraan dinas'],
  peralatan: ['peralatan', 'equipment', 'alat', 'peralatan kantor', 'perlengkapan'],
  aset_lainnya: ['aset lainnya', 'aset', 'asset', 'lainnya', 'bmd lainnya'],
};

const KONDISI_ALIASES = {
  baik: ['baik', 'good', 'b'],
  rusak_ringan: ['rusak ringan', 'ringan', 'rr'],
  rusak_berat: ['rusak berat', 'berat', 'rb'],
};

export function normalizeKategori(raw) {
  if (!raw) return '';
  const v = String(raw).trim().toLowerCase();
  if (['kendaraan', 'peralatan', 'aset_lainnya'].includes(v)) return v;
  for (const [key, aliases] of Object.entries(KATEGORI_ALIASES)) {
    if (aliases.some((a) => v === a || v.includes(a))) return key;
  }
  return '';
}

export function normalizeKondisi(raw) {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();
  if (['baik', 'rusak_ringan', 'rusak_berat'].includes(v)) return v;
  for (const [key, aliases] of Object.entries(KONDISI_ALIASES)) {
    if (aliases.some((a) => v === a || v.includes(a))) return key;
  }
  return null;
}

export function parseNumericValue(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace(/[^0-9,.-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.');
  const n = Number(cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validasi satu baris hasil mapping kolom Import KIB.
 * Mendukung dua kategori: kendaraan (wajib Nopol) dan peralatan/aset_lainnya.
 */
export function validateKibRow(row, rowNumber) {
  const errors = [];

  const kategoriRaw = row.kategori;
  const kategori = normalizeKategori(kategoriRaw);
  const nama_barang = String(row.nama_barang || '').trim();
  const kode_barang = String(row.kode_barang || '').trim();
  const register = String(row.register || '').trim();
  const merk = String(row.merk || '').trim();
  const type = String(row.type || '').trim();
  const tahun_perolehan = row.tahun_perolehan ? Number(String(row.tahun_perolehan).replace(/\D/g, '')) : null;
  const nilai_perolehan = parseNumericValue(row.nilai_perolehan);
  const kondisi = normalizeKondisi(row.kondisi);
  const lokasi = String(row.lokasi || '').trim();
  const pengguna = String(row.pengguna || '').trim();

  const nopol = String(row.nopol || '').trim().toUpperCase();
  const nomor_rangka = String(row.nomor_rangka || '').trim().toUpperCase();
  const nomor_mesin = String(row.nomor_mesin || '').trim().toUpperCase();
  const nomor_bpkb = String(row.nomor_bpkb || '').trim();
  const jenis_kendaraan = String(row.jenis_kendaraan || '').trim();

  if (!kategoriRaw || !kategori) errors.push('Kategori tidak dikenali (isi: Kendaraan / Peralatan / Aset Lainnya)');
  if (!nama_barang) errors.push('Nama Barang kosong');
  if (kategori === 'kendaraan' && !nopol) errors.push('Nopol wajib diisi untuk kategori Kendaraan');
  if (nilai_perolehan !== null && Number.isNaN(nilai_perolehan)) errors.push('Nilai Perolehan bukan angka yang valid');
  if (nilai_perolehan !== null && nilai_perolehan < 0) errors.push('Nilai Perolehan tidak boleh negatif');
  if (tahun_perolehan !== null && (Number.isNaN(tahun_perolehan) || tahun_perolehan < 1980 || tahun_perolehan > 2100)) {
    errors.push('Tahun Perolehan tidak valid');
  }

  return {
    rowNumber,
    valid: errors.length === 0,
    errors,
    normalized: {
      kategori, kode_barang, register, nama_barang, merk, type,
      tahun_perolehan: Number.isFinite(tahun_perolehan) ? tahun_perolehan : null,
      nilai_perolehan: nilai_perolehan === null ? null : nilai_perolehan,
      kondisi, lokasi, pengguna,
      nopol, nomor_rangka, nomor_mesin, nomor_bpkb, jenis_kendaraan,
    },
  };
}
