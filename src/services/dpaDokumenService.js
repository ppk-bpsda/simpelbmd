import { supabase } from '../lib/supabaseClient.js';

// ============================================================
// Import "Informasi Header DPA" — untuk file ringkasan/registrasi
// DPA yang diunduh dari aplikasi e-budgeting Pemda (Nomor DPA,
// Tanggal Penetapan, Tahapan, Jumlah Rincian, Total Pagu, Status).
//
// File semacam ini HANYA berisi satu baris ringkasan per dokumen
// DPA (bukan rincian per Kegiatan/Sub Kegiatan/Belanja), sehingga
// disimpan ke tabel terpisah `dpa_dokumen` dan TIDAK PERNAH
// menyentuh data kegiatan/sub_kegiatan/belanja yang sudah diisi.
// ============================================================

export const DPA_DOKUMEN_TARGET_FIELDS = [
  { key: 'nomor_dpa', label: 'Nomor DPA' },
  { key: 'tanggal_penetapan', label: 'Tanggal Penetapan' },
  { key: 'tahapan', label: 'Tahapan' },
  { key: 'jumlah_rincian', label: 'Jumlah Rincian' },
  { key: 'total_pagu', label: 'Total Pagu' },
  { key: 'status', label: 'Status' },
];

const FIELD_ALIASES = {
  nomor_dpa: ['nomor dpa', 'no dpa', 'no. dpa'],
  tanggal_penetapan: ['tanggal penetapan', 'tgl penetapan', 'tanggal'],
  tahapan: ['tahapan', 'tahap'],
  jumlah_rincian: ['jumlah rincian', 'jml rincian', 'rincian'],
  total_pagu: ['total pagu', 'pagu', 'jumlah pagu', 'total anggaran'],
  status: ['status'],
};

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ');
}

export function suggestDpaDokumenMapping(headers) {
  const mapping = {};
  for (const field of DPA_DOKUMEN_TARGET_FIELDS) {
    const aliases = FIELD_ALIASES[field.key] || [];
    const found = headers.find((h) => {
      const nh = normalizeHeader(h);
      return nh === field.key.replace(/_/g, ' ') || aliases.includes(nh);
    });
    mapping[field.key] = found || '';
  }
  return mapping;
}

/** Baca file (xlsx/xls/csv) berisi baris ringkasan/registrasi DPA. */
export async function parseDpaDokumenFile(file) {
  const allowedExt = ['.xlsx', '.xls', '.csv'];
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowedExt.includes(ext)) {
    throw new Error('Format file tidak didukung. Gunakan file .xlsx, .xls, atau .csv.');
  }
  const maxSizeBytes = 10 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error('Ukuran file melebihi 10MB.');
  }

  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

  if (!rows.length) {
    throw new Error('File tidak berisi data. Pastikan baris pertama adalah header kolom (Nomor DPA, Tanggal Penetapan, Tahapan, Jumlah Rincian, Total Pagu, Status).');
  }

  const headers = Object.keys(rows[0]);
  return { headers, rows, sheetName: firstSheetName };
}

function parseDateValue(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  const str = String(raw).trim();
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const ymd = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}`;
  return null;
}

function parseNumericValue(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace(/[^0-9,.-]/g, '');
  const n = Number(cleaned.replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

export function validateDpaDokumenRow(row, rowNumber) {
  const errors = [];
  const nomor_dpa = String(row.nomor_dpa || '').trim();
  const tanggal_penetapan = parseDateValue(row.tanggal_penetapan);
  const tahapan = String(row.tahapan || '').trim();
  const jumlah_rincian = row.jumlah_rincian !== '' && row.jumlah_rincian !== null && row.jumlah_rincian !== undefined
    ? Number(String(row.jumlah_rincian).replace(/\D/g, '')) : null;
  const total_pagu = parseNumericValue(row.total_pagu);
  const status = String(row.status || '').trim();

  if (!nomor_dpa) errors.push('Nomor DPA kosong');
  if (row.tanggal_penetapan && !tanggal_penetapan) errors.push('Tanggal Penetapan tidak dikenali formatnya');
  if (total_pagu !== null && Number.isNaN(total_pagu)) errors.push('Total Pagu bukan angka yang valid');

  return {
    rowNumber,
    valid: errors.length === 0,
    errors,
    normalized: { nomor_dpa, tanggal_penetapan, tahapan, jumlah_rincian, total_pagu, status },
  };
}

export function applyDpaDokumenMappingAndValidate(rows, mapping) {
  return rows.map((raw, idx) => {
    const mappedRow = {};
    for (const field of DPA_DOKUMEN_TARGET_FIELDS) {
      const sourceHeader = mapping[field.key];
      mappedRow[field.key] = sourceHeader ? raw[sourceHeader] : '';
    }
    return validateDpaDokumenRow(mappedRow, idx + 2);
  });
}

/**
 * Simpan info header DPA dengan semantik INSERT/UPDATE/SKIP berdasarkan
 * Nomor DPA (unik per tahun anggaran + OPD). TIDAK menyentuh tabel
 * kegiatan/sub_kegiatan/belanja sama sekali.
 */
export async function commitDpaDokumenImport({ tahunAnggaranId, opdId, validatedRows, fileName, userId }) {
  const validRows = validatedRows.filter((r) => r.valid);
  const summary = {
    total_baris: validatedRows.length,
    baru: 0, diperbarui: 0, tidak_berubah: 0,
    error: validatedRows.length - validRows.length,
    duplikat: 0,
    detail: [],
  };

  for (const row of validRows) {
    const n = row.normalized;
    try {
      const { data: existing, error: findErr } = await supabase
        .from('dpa_dokumen')
        .select('id, tanggal_penetapan, tahapan, jumlah_rincian, total_pagu, status')
        .eq('tahun_anggaran_id', tahunAnggaranId)
        .eq('opd_id', opdId)
        .eq('nomor_dpa', n.nomor_dpa)
        .is('deleted_at', null)
        .maybeSingle();
      if (findErr) throw findErr;

      if (!existing) {
        const { error: insErr } = await supabase.from('dpa_dokumen').insert({
          tahun_anggaran_id: tahunAnggaranId, opd_id: opdId, nomor_dpa: n.nomor_dpa,
          tanggal_penetapan: n.tanggal_penetapan, tahapan: n.tahapan || null,
          jumlah_rincian: n.jumlah_rincian, total_pagu: n.total_pagu, status: n.status || null,
        });
        if (insErr) throw insErr;
        summary.baru += 1;
        summary.detail.push({ baris: row.rowNumber, status: 'baru', nomor_dpa: n.nomor_dpa });
        continue;
      }

      const unchanged =
        existing.tanggal_penetapan === n.tanggal_penetapan &&
        existing.tahapan === (n.tahapan || null) &&
        Number(existing.jumlah_rincian || 0) === Number(n.jumlah_rincian || 0) &&
        Number(existing.total_pagu || 0) === Number(n.total_pagu || 0) &&
        existing.status === (n.status || null);

      if (unchanged) {
        summary.tidak_berubah += 1;
        summary.detail.push({ baris: row.rowNumber, status: 'tidak_berubah', nomor_dpa: n.nomor_dpa });
        continue;
      }

      const { error: updErr } = await supabase.from('dpa_dokumen').update({
        tanggal_penetapan: n.tanggal_penetapan, tahapan: n.tahapan || null,
        jumlah_rincian: n.jumlah_rincian, total_pagu: n.total_pagu, status: n.status || null,
      }).eq('id', existing.id);
      if (updErr) throw updErr;
      summary.diperbarui += 1;
      summary.detail.push({ baris: row.rowNumber, status: 'diperbarui', nomor_dpa: n.nomor_dpa });
    } catch (err) {
      summary.error += 1;
      summary.detail.push({ baris: row.rowNumber, status: 'error', pesan: err.message });
    }
  }

  validatedRows
    .filter((r) => !r.valid)
    .forEach((r) => summary.detail.push({ baris: r.rowNumber, status: 'error', pesan: r.errors.join('; ') }));

  await supabase.from('import_logs').insert({
    tahun_anggaran_id: tahunAnggaranId,
    opd_id: opdId,
    jenis: 'dpa_dokumen',
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

/** Daftar dokumen DPA (header) yang sudah tersimpan untuk tahun anggaran + OPD tertentu. */
export async function listDpaDokumen({ tahunAnggaranId, opdId }) {
  const { data, error } = await supabase
    .from('dpa_dokumen')
    .select('id, nomor_dpa, tanggal_penetapan, tahapan, jumlah_rincian, total_pagu, status, updated_at')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .eq('opd_id', opdId)
    .is('deleted_at', null)
    .order('tanggal_penetapan', { ascending: false });
  if (error) throw error;
  return data || [];
}
