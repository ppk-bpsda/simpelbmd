const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hitung status jatuh tempo Pajak/Perijinan (§11).
 * Mengembalikan { status, label, daysLeft, variant } dengan variant
 * dipetakan ke warna status (hijau/kuning/merah) sesuai §28.
 */
export function computeJatuhTempoStatus(masaBerlakuStr) {
  if (!masaBerlakuStr) {
    return { status: 'tidak_ada', label: 'Tanpa Masa Berlaku', daysLeft: null, variant: 'info' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const masaBerlaku = new Date(masaBerlakuStr);
  masaBerlaku.setHours(0, 0, 0, 0);

  const daysLeft = Math.round((masaBerlaku - today) / DAY_MS);

  if (daysLeft < 0) return { status: 'lewat', label: `Sudah Jatuh Tempo (${Math.abs(daysLeft)} hari lalu)`, daysLeft, variant: 'critical' };
  if (daysLeft <= 7) return { status: 'kritis', label: `Jatuh Tempo ${daysLeft} hari lagi`, daysLeft, variant: 'critical' };
  if (daysLeft <= 14) return { status: 'perhatian_tinggi', label: `Jatuh Tempo ${daysLeft} hari lagi`, daysLeft, variant: 'warning' };
  if (daysLeft <= 30) return { status: 'perhatian', label: `Jatuh Tempo ${daysLeft} hari lagi`, daysLeft, variant: 'warning' };
  return { status: 'aman', label: `Berlaku hingga ${masaBerlaku.toLocaleDateString('id-ID')}`, daysLeft, variant: 'safe' };
}

export const JENIS_PAJAK_OPTIONS = [
  { value: 'pajak_stnk', label: 'Pajak STNK' },
  { value: 'pajak_kendaraan', label: 'Pajak Kendaraan' },
  { value: 'kir', label: 'KIR' },
  { value: 'izin_trayek', label: 'Izin Trayek' },
  { value: 'perijinan_lainnya', label: 'Perijinan Lainnya' },
];

export const JENIS_PEMELIHARAAN_OPTIONS = [
  { value: 'servis_rutin', label: 'Servis Rutin' },
  { value: 'oli', label: 'Oli' },
  { value: 'ban', label: 'Ban' },
  { value: 'aki', label: 'Aki' },
  { value: 'mesin', label: 'Mesin' },
  { value: 'rem', label: 'Rem' },
  { value: 'kelistrikan', label: 'Kelistrikan' },
  { value: 'body', label: 'Body' },
  { value: 'ac', label: 'AC' },
  { value: 'lainnya', label: 'Perbaikan Lainnya' },
];

export const JENIS_BBM_OPTIONS = [
  { value: 'pertalite', label: 'Pertalite' },
  { value: 'pertamax', label: 'Pertamax' },
  { value: 'solar', label: 'Solar' },
  { value: 'dexlite', label: 'Dexlite' },
  { value: 'lainnya', label: 'Lainnya' },
];

// Nominal tetap per lembar Kupon BBM, ditentukan oleh klasifikasi roda
// kendaraan (kendaraan.roda — lihat kibValidator.js RODA_OPTIONS).
// R4: Rp 100.000/kupon — R2: Rp 25.000/kupon.
export const KUPON_NOMINAL = { roda4: 100000, roda2: 25000 };
export const RODA_LABEL = { roda4: 'Roda 4', roda2: 'Roda 2' };

// Kode rekening belanja BBM, mengikuti klasifikasi roda kendaraan.
export const BBM_KODE_REKENING = {
  roda4: '5.1.02.03.002.00035', // Kendaraan Dinas Bermotor Perorangan
  roda2: '5.1.02.03.002.00038', // Kendaraan Bermotor Beroda Dua
};
