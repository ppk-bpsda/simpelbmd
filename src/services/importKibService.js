import { supabase } from '../lib/supabaseClient.js';
import { validateKibRow } from '../validators/kibValidator.js';

export { parseSpreadsheetFile } from './importService.js';

export const KIB_TARGET_FIELDS = [
  { key: 'kategori', label: 'Kategori (Kendaraan/Peralatan/Aset Lainnya)' },
  { key: 'kode_barang', label: 'Kode Barang' },
  { key: 'register', label: 'Nomor Register' },
  { key: 'nama_barang', label: 'Nama Barang' },
  { key: 'merk', label: 'Merk' },
  { key: 'type', label: 'Type' },
  { key: 'tahun_perolehan', label: 'Tahun Perolehan' },
  { key: 'nilai_perolehan', label: 'Nilai Perolehan' },
  { key: 'kondisi', label: 'Kondisi' },
  { key: 'lokasi', label: 'Lokasi' },
  { key: 'pengguna', label: 'Pengguna / Penanggung Jawab' },
  { key: 'nopol', label: 'Nomor Polisi (khusus Kendaraan)' },
  { key: 'nomor_rangka', label: 'Nomor Rangka (khusus Kendaraan)' },
  { key: 'nomor_mesin', label: 'Nomor Mesin (khusus Kendaraan)' },
  { key: 'nomor_bpkb', label: 'Nomor BPKB (khusus Kendaraan)' },
  { key: 'jenis_kendaraan', label: 'Jenis Kendaraan (khusus Kendaraan)' },
];

// Field yang wajib dipetakan (sisanya opsional) — mendukung "import cerdas" §34.
const REQUIRED_FIELDS = ['kategori', 'nama_barang'];

const FIELD_ALIASES = {
  kategori: ['kategori', 'jenis aset', 'tipe aset', 'jenis barang'],
  kode_barang: ['kode barang', 'kode aset'],
  register: ['register', 'no register', 'nomor register', 'no. register'],
  nama_barang: ['nama barang', 'uraian barang', 'nama aset'],
  merk: ['merk', 'merek'],
  type: ['type', 'tipe'],
  tahun_perolehan: ['tahun perolehan', 'thn perolehan', 'tahun'],
  nilai_perolehan: ['nilai perolehan', 'harga perolehan', 'nilai'],
  kondisi: ['kondisi'],
  lokasi: ['lokasi', 'tempat'],
  pengguna: ['pengguna', 'penanggung jawab', 'pic'],
  nopol: ['nopol', 'no polisi', 'nomor polisi', 'plat nomor', 'no. polisi'],
  nomor_rangka: ['nomor rangka', 'no rangka', 'no. rangka'],
  nomor_mesin: ['nomor mesin', 'no mesin', 'no. mesin'],
  nomor_bpkb: ['nomor bpkb', 'no bpkb', 'no. bpkb'],
  jenis_kendaraan: ['jenis kendaraan', 'tipe kendaraan'],
};

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ');
}

export function suggestKibColumnMapping(headers) {
  const mapping = {};
  for (const field of KIB_TARGET_FIELDS) {
    const aliases = FIELD_ALIASES[field.key] || [];
    const found = headers.find((h) => {
      const nh = normalizeHeader(h);
      return nh === field.key.replace(/_/g, ' ') || aliases.includes(nh);
    });
    mapping[field.key] = found || '';
  }
  return mapping;
}

export function kibRequiredFields() {
  return KIB_TARGET_FIELDS.filter((f) => REQUIRED_FIELDS.includes(f.key));
}

/**
 * Terapkan mapping + validasi tiap baris, termasuk deteksi duplikasi
 * Nopol / Nomor Rangka / Nomor Mesin DI DALAM file yang sama (§9).
 */
export function applyKibMappingAndValidate(rows, mapping) {
  const seenNopol = new Map();
  const seenRangka = new Map();
  const seenMesin = new Map();

  return rows.map((raw, idx) => {
    const mappedRow = {};
    for (const field of KIB_TARGET_FIELDS) {
      const sourceHeader = mapping[field.key];
      mappedRow[field.key] = sourceHeader ? raw[sourceHeader] : '';
    }
    const rowNumber = idx + 2;
    const validation = validateKibRow(mappedRow, rowNumber);
    const dupReasons = [];

    if (validation.valid) {
      const { nopol, nomor_rangka, nomor_mesin } = validation.normalized;
      if (nopol) {
        if (seenNopol.has(nopol)) dupReasons.push(`Nopol duplikat dengan baris ${seenNopol.get(nopol)}`);
        else seenNopol.set(nopol, rowNumber);
      }
      if (nomor_rangka) {
        if (seenRangka.has(nomor_rangka)) dupReasons.push(`Nomor Rangka duplikat dengan baris ${seenRangka.get(nomor_rangka)}`);
        else seenRangka.set(nomor_rangka, rowNumber);
      }
      if (nomor_mesin) {
        if (seenMesin.has(nomor_mesin)) dupReasons.push(`Nomor Mesin duplikat dengan baris ${seenMesin.get(nomor_mesin)}`);
        else seenMesin.set(nomor_mesin, rowNumber);
      }
    }

    if (dupReasons.length) {
      return { ...validation, valid: false, isDuplicate: true, errors: dupReasons };
    }
    return { ...validation, isDuplicate: false };
  });
}

/**
 * Commit hasil import ke database dengan semantik INSERT / UPDATE / SKIP,
 * termasuk pengecekan duplikasi Nopol/Rangka/Mesin terhadap data yang SUDAH
 * ada di database (bukan hanya di dalam file) sebelum insert baru (§9).
 */
export async function commitKibImport({ tahunAnggaranId, opdId, validatedRows, fileName, userId }) {
  const validRows = validatedRows.filter((r) => r.valid);
  const summary = {
    total_baris: validatedRows.length,
    baru: 0, diperbarui: 0, tidak_berubah: 0,
    error: validatedRows.length - validRows.length,
    duplikat: validatedRows.filter((r) => r.isDuplicate).length,
    detail: [],
  };

  for (const row of validRows) {
    const n = row.normalized;
    try {
      if (n.kategori === 'kendaraan') {
        await importKendaraanRow(n, { tahunAnggaranId, opdId }, row.rowNumber, summary);
      } else {
        await importPeralatanRow(n, { tahunAnggaranId, opdId }, row.rowNumber, summary);
      }
    } catch (err) {
      summary.error += 1;
      summary.detail.push({ baris: row.rowNumber, status: 'error', pesan: err.message });
    }
  }

  validatedRows
    .filter((r) => !r.valid)
    .forEach((r) => summary.detail.push({ baris: r.rowNumber, status: r.isDuplicate ? 'duplikat' : 'error', pesan: r.errors.join('; ') }));

  await supabase.from('import_logs').insert({
    tahun_anggaran_id: tahunAnggaranId,
    opd_id: opdId,
    jenis: 'kib',
    file_name: fileName,
    total_baris: summary.total_baris,
    baru: summary.baru,
    diperbarui: summary.diperbarui,
    tidak_berubah: summary.tidak_berubah,
    error: summary.error,
    duplikat: summary.duplikat,
    detail: summary.detail,
    imported_by: userId,
  });

  return summary;
}

async function importKendaraanRow(n, ctx, rowNumber, summary) {
  const { data: existing, error: findErr } = await supabase
    .from('kendaraan')
    .select('id, kib_id, nomor_rangka, nomor_mesin, nomor_bpkb, jenis_kendaraan, kib:kib_id(id, nama_barang, merk, type, tahun_perolehan, nilai_perolehan, kondisi, lokasi, pengguna, kode_barang, register, opd_id)')
    .eq('nopol', n.nopol)
    .is('deleted_at', null)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing && existing.kib?.opd_id !== ctx.opdId) {
    summary.error += 1;
    summary.detail.push({ baris: rowNumber, status: 'error', pesan: `Nopol ${n.nopol} sudah terdaftar pada OPD lain.` });
    return;
  }

  // Cek konflik Nomor Rangka / Nomor Mesin dengan kendaraan LAIN (bukan baris ini sendiri).
  if (n.nomor_rangka) {
    const { data: conflict } = await supabase
      .from('kendaraan').select('id, nopol').eq('nomor_rangka', n.nomor_rangka).is('deleted_at', null).maybeSingle();
    if (conflict && conflict.id !== existing?.id) {
      summary.error += 1;
      summary.detail.push({ baris: rowNumber, status: 'error', pesan: `Nomor Rangka sudah dipakai oleh kendaraan Nopol ${conflict.nopol}.` });
      return;
    }
  }
  if (n.nomor_mesin) {
    const { data: conflict } = await supabase
      .from('kendaraan').select('id, nopol').eq('nomor_mesin', n.nomor_mesin).is('deleted_at', null).maybeSingle();
    if (conflict && conflict.id !== existing?.id) {
      summary.error += 1;
      summary.detail.push({ baris: rowNumber, status: 'error', pesan: `Nomor Mesin sudah dipakai oleh kendaraan Nopol ${conflict.nopol}.` });
      return;
    }
  }

  if (!existing) {
    const { data: kibRow, error: kibErr } = await supabase
      .from('kib')
      .insert({
        tahun_anggaran_id: ctx.tahunAnggaranId, opd_id: ctx.opdId, kategori: 'kendaraan',
        kode_barang: n.kode_barang || null, register: n.register || null, nama_barang: n.nama_barang,
        merk: n.merk || null, type: n.type || null, tahun_perolehan: n.tahun_perolehan,
        nilai_perolehan: n.nilai_perolehan, kondisi: n.kondisi, lokasi: n.lokasi || null, pengguna: n.pengguna || null,
      })
      .select('id').single();
    if (kibErr) throw kibErr;

    const { error: kendErr } = await supabase.from('kendaraan').insert({
      kib_id: kibRow.id, nopol: n.nopol, nomor_rangka: n.nomor_rangka || null,
      nomor_mesin: n.nomor_mesin || null, nomor_bpkb: n.nomor_bpkb || null, jenis_kendaraan: n.jenis_kendaraan || null,
    });
    if (kendErr) { await supabase.from('kib').delete().eq('id', kibRow.id); throw kendErr; }

    summary.baru += 1;
    summary.detail.push({ baris: rowNumber, status: 'baru', nopol: n.nopol });
    return;
  }

  // UPDATE path
  const kib = existing.kib;
  const unchanged =
    kib.nama_barang === n.nama_barang && kib.merk === (n.merk || null) && kib.type === (n.type || null) &&
    kib.tahun_perolehan === n.tahun_perolehan && Number(kib.nilai_perolehan || 0) === Number(n.nilai_perolehan || 0) &&
    kib.kondisi === n.kondisi && kib.lokasi === (n.lokasi || null) && kib.pengguna === (n.pengguna || null) &&
    existing.nomor_rangka === (n.nomor_rangka || null) && existing.nomor_mesin === (n.nomor_mesin || null) &&
    existing.nomor_bpkb === (n.nomor_bpkb || null) && existing.jenis_kendaraan === (n.jenis_kendaraan || null);

  if (unchanged) {
    summary.tidak_berubah += 1;
    summary.detail.push({ baris: rowNumber, status: 'tidak_berubah', nopol: n.nopol });
    return;
  }

  await supabase.from('kib').update({
    nama_barang: n.nama_barang, merk: n.merk || null, type: n.type || null, tahun_perolehan: n.tahun_perolehan,
    nilai_perolehan: n.nilai_perolehan, kondisi: n.kondisi, lokasi: n.lokasi || null, pengguna: n.pengguna || null,
    kode_barang: n.kode_barang || null, register: n.register || null,
  }).eq('id', kib.id);

  await supabase.from('kendaraan').update({
    nomor_rangka: n.nomor_rangka || null, nomor_mesin: n.nomor_mesin || null,
    nomor_bpkb: n.nomor_bpkb || null, jenis_kendaraan: n.jenis_kendaraan || null,
  }).eq('id', existing.id);

  summary.diperbarui += 1;
  summary.detail.push({ baris: rowNumber, status: 'diperbarui', nopol: n.nopol });
}

async function importPeralatanRow(n, ctx, rowNumber, summary) {
  let existing = null;
  if (n.register) {
    const { data, error } = await supabase
      .from('kib')
      .select('id, nama_barang, merk, type, tahun_perolehan, nilai_perolehan, kondisi, lokasi, pengguna, kode_barang, kategori')
      .eq('tahun_anggaran_id', ctx.tahunAnggaranId).eq('opd_id', ctx.opdId).eq('register', n.register)
      .is('deleted_at', null).maybeSingle();
    if (error) throw error;
    existing = data;
  }

  if (!existing) {
    const { error } = await supabase.from('kib').insert({
      tahun_anggaran_id: ctx.tahunAnggaranId, opd_id: ctx.opdId, kategori: n.kategori,
      kode_barang: n.kode_barang || null, register: n.register || null, nama_barang: n.nama_barang,
      merk: n.merk || null, type: n.type || null, tahun_perolehan: n.tahun_perolehan,
      nilai_perolehan: n.nilai_perolehan, kondisi: n.kondisi, lokasi: n.lokasi || null, pengguna: n.pengguna || null,
    });
    if (error) throw error;
    summary.baru += 1;
    summary.detail.push({ baris: rowNumber, status: 'baru', register: n.register || '-' });
    return;
  }

  const unchanged =
    existing.nama_barang === n.nama_barang && existing.merk === (n.merk || null) && existing.type === (n.type || null) &&
    existing.tahun_perolehan === n.tahun_perolehan && Number(existing.nilai_perolehan || 0) === Number(n.nilai_perolehan || 0) &&
    existing.kondisi === n.kondisi && existing.lokasi === (n.lokasi || null) && existing.pengguna === (n.pengguna || null) &&
    existing.kategori === n.kategori;

  if (unchanged) {
    summary.tidak_berubah += 1;
    summary.detail.push({ baris: rowNumber, status: 'tidak_berubah', register: n.register });
    return;
  }

  await supabase.from('kib').update({
    kategori: n.kategori, nama_barang: n.nama_barang, merk: n.merk || null, type: n.type || null,
    tahun_perolehan: n.tahun_perolehan, nilai_perolehan: n.nilai_perolehan, kondisi: n.kondisi,
    lokasi: n.lokasi || null, pengguna: n.pengguna || null, kode_barang: n.kode_barang || null,
  }).eq('id', existing.id);

  summary.diperbarui += 1;
  summary.detail.push({ baris: rowNumber, status: 'diperbarui', register: n.register });
}

export async function downloadKibTemplate() {
  const XLSX = await import('xlsx');
  const headerLabels = KIB_TARGET_FIELDS.map((f) => f.label);
  const exampleKendaraan = [
    'Kendaraan', '3.02.01.01.001', 'REG-0002', 'Kendaraan Operasional Roda 2', 'Honda', 'Vario 160',
    2024, 24500000, 'Baik', 'Garasi Kantor', 'Staf Lapangan',
    'N 5678 CD', 'MHXX9876543210', 'JF1234567', 'BPKB-000998877', 'Sepeda Motor',
  ];
  const examplePeralatan = [
    'Peralatan', '3.06.02.03.010', 'REG-0003', 'AC Split 1 PK', 'Daikin', 'FTV25',
    2025, 4500000, 'Baik', 'Ruang Kepala Dinas', 'Sekretariat',
    '', '', '', '', '',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headerLabels, exampleKendaraan, examplePeralatan]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template KIB');
  XLSX.writeFile(wb, 'Template_Import_KIB_SIMPELBMD.xlsx');
}
