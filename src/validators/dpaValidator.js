// Kelompok dipakai untuk agregasi dashboard jenis belanja (§4).
export const KELOMPOK_OPTIONS = [
  { value: 'pajak_perijinan', label: 'Pajak / Perijinan' },
  { value: 'pemeliharaan', label: 'Pemeliharaan' },
  { value: 'bbm', label: 'BBM / Kupon BBM' },
  { value: 'lainnya', label: 'Lainnya' },
];

const KELOMPOK_ALIASES = {
  pajak_perijinan: ['pajak', 'perijinan', 'pajak perijinan', 'pajak/perijinan', 'perizinan', 'stnk', 'kir'],
  pemeliharaan: ['pemeliharaan', 'maintenance', 'perawatan', 'servis'],
  bbm: ['bbm', 'bahan bakar', 'kupon bbm', 'fuel'],
};

export function normalizeKelompok(raw) {
  if (!raw) return 'lainnya';
  const v = String(raw).trim().toLowerCase();
  if (['pajak_perijinan', 'pemeliharaan', 'bbm', 'lainnya'].includes(v)) return v;
  for (const [key, aliases] of Object.entries(KELOMPOK_ALIASES)) {
    if (aliases.some((a) => v.includes(a))) return key;
  }
  return 'lainnya';
}

export function parseNumericPagu(raw) {
  if (raw === null || raw === undefined || raw === '') return NaN;
  if (typeof raw === 'number') return raw;
  // Dukung format "Rp 25.000.000" atau "25,000,000" atau "25000000".
  const cleaned = String(raw).replace(/[^0-9,.-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.');
  const n = Number(cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validasi satu baris DPA hasil mapping kolom.
 * Mengembalikan { valid: boolean, errors: string[], normalized: {...} }
 */
export function validateDpaRow(row, rowNumber) {
  const errors = [];

  const kode_kegiatan = String(row.kode_kegiatan || '').trim();
  const nama_kegiatan = String(row.nama_kegiatan || '').trim();
  const kode_sub_kegiatan = String(row.kode_sub_kegiatan || '').trim();
  const nama_sub_kegiatan = String(row.nama_sub_kegiatan || '').trim();
  const kode_rekening = String(row.kode_rekening || '').trim();
  const nama_belanja = String(row.nama_belanja || '').trim();
  const kelompok = normalizeKelompok(row.kelompok);
  const pagu = parseNumericPagu(row.pagu);

  if (!kode_kegiatan) errors.push('Kode Kegiatan kosong');
  if (!nama_kegiatan) errors.push('Nama Kegiatan kosong');
  if (!kode_sub_kegiatan) errors.push('Kode Sub Kegiatan kosong');
  if (!nama_sub_kegiatan) errors.push('Nama Sub Kegiatan kosong');
  if (!kode_rekening) errors.push('Kode Rekening Belanja kosong');
  if (!nama_belanja) errors.push('Nama Belanja kosong');
  if (Number.isNaN(pagu)) errors.push('Pagu bukan angka yang valid');
  else if (pagu < 0) errors.push('Pagu tidak boleh negatif');

  return {
    rowNumber,
    valid: errors.length === 0,
    errors,
    normalized: {
      kode_kegiatan, nama_kegiatan, kode_sub_kegiatan, nama_sub_kegiatan,
      kode_rekening, nama_belanja, kelompok, pagu,
    },
  };
}
