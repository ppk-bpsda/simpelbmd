import { supabase } from '../lib/supabaseClient.js';
import { validateDpaRow } from '../validators/dpaValidator.js';

// Field internal yang wajib dipetakan saat import DPA (§8, §34).
export const DPA_TARGET_FIELDS = [
  { key: 'kode_kegiatan', label: 'Kode Kegiatan' },
  { key: 'nama_kegiatan', label: 'Nama Kegiatan' },
  { key: 'kode_sub_kegiatan', label: 'Kode Sub Kegiatan' },
  { key: 'nama_sub_kegiatan', label: 'Nama Sub Kegiatan' },
  { key: 'kode_rekening', label: 'Kode Rekening Belanja' },
  { key: 'nama_belanja', label: 'Nama Belanja' },
  { key: 'kelompok', label: 'Kelompok (Pajak/Pemeliharaan/BBM/Lainnya)' },
  { key: 'pagu', label: 'Pagu' },
];

// Alias umum header Excel -> field internal, agar user tidak harus
// mengikuti format yang sangat kaku (§34).
const FIELD_ALIASES = {
  kode_kegiatan: ['kode kegiatan', 'kodekegiatan', 'kode giat'],
  nama_kegiatan: ['nama kegiatan', 'uraian kegiatan', 'kegiatan'],
  kode_sub_kegiatan: ['kode sub kegiatan', 'kode subkegiatan', 'kode sub giat'],
  nama_sub_kegiatan: ['nama sub kegiatan', 'uraian sub kegiatan', 'sub kegiatan'],
  kode_rekening: ['kode rekening', 'kode belanja', 'rekening', 'kode akun'],
  nama_belanja: ['nama belanja', 'uraian belanja', 'belanja'],
  kelompok: ['kelompok', 'jenis belanja', 'kategori belanja', 'kategori'],
  pagu: ['pagu', 'anggaran', 'nilai pagu', 'nilai anggaran'],
};

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ');
}

/**
 * STEP 1: baca file (xlsx/xls/csv) dan kembalikan header + baris mentah.
 * Tidak menyentuh database sama sekali di sini.
 */
export async function parseSpreadsheetFile(file) {
  const allowedExt = ['.xlsx', '.xls', '.csv'];
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowedExt.includes(ext)) {
    throw new Error('Format file tidak didukung. Gunakan file .xlsx, .xls, atau .csv.');
  }
  const maxSizeBytes = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSizeBytes) {
    throw new Error('Ukuran file melebihi 10MB. Silakan pecah file menjadi beberapa bagian.');
  }

  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  if (!rows.length) {
    throw new Error('File tidak berisi data. Pastikan baris pertama adalah header kolom.');
  }

  const headers = Object.keys(rows[0]);
  return { headers, rows, sheetName: firstSheetName };
}

/**
 * STEP 2: sarankan mapping header Excel -> field internal berdasarkan alias.
 */
export function suggestColumnMapping(headers) {
  const mapping = {};
  for (const field of DPA_TARGET_FIELDS) {
    const aliases = FIELD_ALIASES[field.key] || [];
    const found = headers.find((h) => {
      const nh = normalizeHeader(h);
      return nh === field.key.replace(/_/g, ' ') || aliases.includes(nh);
    });
    mapping[field.key] = found || '';
  }
  return mapping;
}

/**
 * STEP 3: terapkan mapping ke baris mentah, lalu validasi tiap baris (§8).
 * Juga mendeteksi duplikasi kombinasi kode_rekening dalam file yang sama.
 */
export function applyMappingAndValidate(rows, mapping) {
  const seen = new Map(); // key: kegiatan|subkegiatan|rekening -> rowNumber pertama
  const results = rows.map((raw, idx) => {
    const mappedRow = {};
    for (const field of DPA_TARGET_FIELDS) {
      const sourceHeader = mapping[field.key];
      mappedRow[field.key] = sourceHeader ? raw[sourceHeader] : '';
    }
    const rowNumber = idx + 2; // +2: baris 1 = header
    const validation = validateDpaRow(mappedRow, rowNumber);

    if (validation.valid) {
      const dupKey = [
        validation.normalized.kode_kegiatan,
        validation.normalized.kode_sub_kegiatan,
        validation.normalized.kode_rekening,
      ].join('||').toLowerCase();

      if (seen.has(dupKey)) {
        return { ...validation, valid: false, isDuplicate: true, errors: [`Duplikat dengan baris ${seen.get(dupKey)} pada file ini`] };
      }
      seen.set(dupKey, rowNumber);
    }

    return { ...validation, isDuplicate: false };
  });

  return results;
}

/**
 * STEP 4: import baris yang valid ke database dengan semantik INSERT/UPDATE/SKIP.
 * Mengembalikan ringkasan hasil + mencatat ke import_logs (§8, §21).
 */
export async function commitDpaImport({ tahunAnggaranId, opdId, validatedRows, fileName, userId }) {
  const validRows = validatedRows.filter((r) => r.valid);
  const summary = { total_baris: validatedRows.length, baru: 0, diperbarui: 0, tidak_berubah: 0, error: validatedRows.length - validRows.length, duplikat: validatedRows.filter((r) => r.isDuplicate).length, detail: [] };

  const kegiatanCache = new Map(); // kode_kegiatan -> id
  const subKegiatanCache = new Map(); // kegiatanId|kode_sub_kegiatan -> id

  for (const row of validRows) {
    const n = row.normalized;
    try {
      // --- Kegiatan: get or create ---
      let kegiatanId = kegiatanCache.get(n.kode_kegiatan);
      if (!kegiatanId) {
        const { data: existingKegiatan, error: findErr } = await supabase
          .from('kegiatan')
          .select('id, nama_kegiatan')
          .eq('tahun_anggaran_id', tahunAnggaranId)
          .eq('opd_id', opdId)
          .eq('kode_kegiatan', n.kode_kegiatan)
          .is('deleted_at', null)
          .maybeSingle();
        if (findErr) throw findErr;

        if (existingKegiatan) {
          kegiatanId = existingKegiatan.id;
          if (existingKegiatan.nama_kegiatan !== n.nama_kegiatan) {
            await supabase.from('kegiatan').update({ nama_kegiatan: n.nama_kegiatan }).eq('id', kegiatanId);
          }
        } else {
          const { data: created, error: insErr } = await supabase
            .from('kegiatan')
            .insert({ tahun_anggaran_id: tahunAnggaranId, opd_id: opdId, kode_kegiatan: n.kode_kegiatan, nama_kegiatan: n.nama_kegiatan })
            .select('id')
            .single();
          if (insErr) throw insErr;
          kegiatanId = created.id;
        }
        kegiatanCache.set(n.kode_kegiatan, kegiatanId);
      }

      // --- Sub Kegiatan: get or create ---
      const subKey = `${kegiatanId}|${n.kode_sub_kegiatan}`;
      let subKegiatanId = subKegiatanCache.get(subKey);
      if (!subKegiatanId) {
        const { data: existingSub, error: findSubErr } = await supabase
          .from('sub_kegiatan')
          .select('id, nama_sub_kegiatan')
          .eq('kegiatan_id', kegiatanId)
          .eq('kode_sub_kegiatan', n.kode_sub_kegiatan)
          .is('deleted_at', null)
          .maybeSingle();
        if (findSubErr) throw findSubErr;

        if (existingSub) {
          subKegiatanId = existingSub.id;
          if (existingSub.nama_sub_kegiatan !== n.nama_sub_kegiatan) {
            await supabase.from('sub_kegiatan').update({ nama_sub_kegiatan: n.nama_sub_kegiatan }).eq('id', subKegiatanId);
          }
        } else {
          const { data: createdSub, error: insSubErr } = await supabase
            .from('sub_kegiatan')
            .insert({ kegiatan_id: kegiatanId, kode_sub_kegiatan: n.kode_sub_kegiatan, nama_sub_kegiatan: n.nama_sub_kegiatan })
            .select('id')
            .single();
          if (insSubErr) throw insSubErr;
          subKegiatanId = createdSub.id;
        }
        subKegiatanCache.set(subKey, subKegiatanId);
      }

      // --- Belanja: insert / update / tidak berubah ---
      const { data: existingBelanja, error: findBelanjaErr } = await supabase
        .from('belanja')
        .select('id, nama_belanja, kelompok, pagu')
        .eq('sub_kegiatan_id', subKegiatanId)
        .eq('kode_rekening', n.kode_rekening)
        .is('deleted_at', null)
        .maybeSingle();
      if (findBelanjaErr) throw findBelanjaErr;

      if (!existingBelanja) {
        const { error: insBelanjaErr } = await supabase.from('belanja').insert({
          sub_kegiatan_id: subKegiatanId, kode_rekening: n.kode_rekening, nama_belanja: n.nama_belanja,
          kelompok: n.kelompok, pagu: n.pagu,
        });
        if (insBelanjaErr) throw insBelanjaErr;
        summary.baru += 1;
        summary.detail.push({ baris: row.rowNumber, status: 'baru', kode_rekening: n.kode_rekening });
      } else {
        const unchanged =
          existingBelanja.nama_belanja === n.nama_belanja &&
          existingBelanja.kelompok === n.kelompok &&
          Number(existingBelanja.pagu) === Number(n.pagu);

        if (unchanged) {
          summary.tidak_berubah += 1;
          summary.detail.push({ baris: row.rowNumber, status: 'tidak_berubah', kode_rekening: n.kode_rekening });
        } else {
          const { error: updBelanjaErr } = await supabase
            .from('belanja')
            .update({ nama_belanja: n.nama_belanja, kelompok: n.kelompok, pagu: n.pagu })
            .eq('id', existingBelanja.id);
          if (updBelanjaErr) throw updBelanjaErr;
          summary.diperbarui += 1;
          summary.detail.push({ baris: row.rowNumber, status: 'diperbarui', kode_rekening: n.kode_rekening });
        }
      }
    } catch (err) {
      summary.error += 1;
      summary.detail.push({ baris: row.rowNumber, status: 'error', pesan: err.message });
    }
  }

  // Catat error validasi (baris yang tidak pernah sampai ke DB) ke detail juga.
  validatedRows
    .filter((r) => !r.valid)
    .forEach((r) => summary.detail.push({ baris: r.rowNumber, status: r.isDuplicate ? 'duplikat' : 'error', pesan: r.errors.join('; ') }));

  await supabase.from('import_logs').insert({
    tahun_anggaran_id: tahunAnggaranId,
    opd_id: opdId,
    jenis: 'dpa',
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

/**
 * Template Excel yang bisa diunduh user (§34), dengan contoh satu baris
 * agar format kolom jelas.
 */
export async function downloadDpaTemplate() {
  const XLSX = await import('xlsx');
  const headerLabels = DPA_TARGET_FIELDS.map((f) => f.label);
  const example = [
    '2.10.02', 'Penyediaan BMD Penunjang Urusan Pemerintahan',
    '2.10.02.001', 'Penyediaan Pajak dan Perijinan Kendaraan Dinas',
    '5.1.02.01.01.0011', 'Belanja Pajak Kendaraan Dinas',
    'Pajak/Perijinan', 25000000,
  ];
  const ws = XLSX.utils.aoa_to_sheet([headerLabels, example]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template DPA');
  XLSX.writeFile(wb, 'Template_Import_DPA_SIMBMD.xlsx');
}
