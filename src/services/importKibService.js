import { supabase } from '../lib/supabaseClient.js';
import { validateKibRow } from '../validators/kibValidator.js';

export { parseSpreadsheetFile } from './importService.js';

// ============================================================
// Dukungan import LANGSUNG dari format resmi Daftar BMD (KIB)
// yang diunduh dari aplikasi e-BMD Pemda — "FORMAT II.O.1.2"
// (Aset Tetap Peralatan & Mesin, Intrakomptabel & Ekstrakomptabel).
//
// File resmi ini TIDAK berbentuk tabel datar (1 baris header +
// baris data). Strukturnya:
//   - Baris 1-9   : judul dokumen & info Kuasa Pengguna Barang
//   - Baris 10-12 : header kolom bertingkat
//   - Baris data  : kode barang tersebar di kolom A-H, diselingi
//                   baris kategori/subtotal (tanpa detail barang)
//                   dan baris detail barang (dengan NIBAR, Nomor
//                   Register, Spesifikasi, Nopol, dst.)
//
// Fungsi di bawah ini mendeteksi format tsb secara otomatis lalu
// mengubahnya menjadi baris "virtual" dengan properti = label
// KIB_TARGET_FIELDS, sehingga alur mapping/validasi/commit yang
// SUDAH ADA (applyKibMappingAndValidate, commitKibImport, dst.)
// tidak perlu diubah sama sekali — dan data yang sudah pernah
// diimpor/diisi manual tidak tersentuh oleh perubahan ini.
// ============================================================

// Posisi kolom (0-based) sesuai FORMAT II.O.1.2 baku.
const KIB_OFFICIAL_COLS = {
  kodeLevels: [0, 1, 2, 3, 4, 5], // A-F: segmen kode barang bertingkat
  kodeLeaf: 7, // H: segmen kode barang level barang (mis. "003")
  namaKategori: 8, // I: nama klasifikasi/kategori barang
  nibar: 11, // L
  register: 12, // M: Nomor Register
  spesifikasiNama: 13, // N: Spesifikasi Nama Barang
  spesifikasiLainnya: 14, // O
  merkTipe: 16, // Q: "Merk: ..."
  lokasi: 17, // R
  nopol: 18, // S
  nomorRangka: 19, // T
  nomorBpkb: 20, // U
  jumlah: 21, // V
  satuan: 22, // W
  hargaSatuan: 24, // Y
  nilaiPerolehan: 25, // Z
  caraPerolehan: 26, // AA
  tanggalPerolehan: 27, // AB
  statusPenggunaan: 28, // AC: Kuasa Pengguna / OPD (dipakai sebagai "pengguna")
  keterangan: 30, // AE
};

function cellStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/**
 * Mendeteksi kode format resmi KIB dari sel A1, mis. "FORMAT II.O.1.2".
 * Mengembalikan null jika file bukan format resmi KIB.
 */
function detectKibOfficialFormatCode(aoa) {
  const firstCell = aoa?.[0]?.[0];
  if (typeof firstCell !== 'string') return null;
  const match = firstCell.trim().toUpperCase().match(/FORMAT\s+(II\.O\.\d+\.\d+)/);
  return match ? match[1] : null;
}

/** Ekstrak tahun dari nilai tanggal, mendukung Date object maupun string dd/mm/yyyy. */
function extractYear(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.getFullYear();
  const str = String(raw);
  const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return Number(dmy[3]);
  const anyYear = str.match(/(\d{4})/);
  return anyYear ? Number(anyYear[1]) : null;
}

/**
 * Cari beberapa baris info header dokumen (Kuasa Pengguna Barang, Kode
 * Lokasi, Tahun) untuk ditampilkan sebagai konfirmasi visual ke user,
 * murni informasional — tidak mempengaruhi hasil parsing baris barang.
 */
function extractKibDocMeta(aoa) {
  const meta = { satuanKerja: '', kodeLokasi: '', tahun: '', judul: '' };
  for (let i = 0; i < Math.min(aoa.length, 12); i += 1) {
    const row = aoa[i] || [];
    const label = cellStr(row[0]).toLowerCase();
    if (label.startsWith('kuasa pengguna barang')) meta.satuanKerja = cellStr(row[10] ?? row[9]);
    else if (label.startsWith('kode lokasi')) meta.kodeLokasi = cellStr(row[10] ?? row[9]);
    else if (/^tahun\s+\d{4}$/.test(label)) meta.tahun = label.replace('tahun', '').trim();
    else if (i === 1) meta.judul = cellStr(row[0]);
  }
  return meta;
}

/**
 * Parse array-of-array (hasil sheet_to_json {header:1}) format resmi
 * KIB "FORMAT II.O.1.2" menjadi baris siap pakai untuk pipeline import
 * yang sudah ada. Satu baris hasil = satu unit barang.
 */
function parseKibOfficialAoa(aoa) {
  const c = KIB_OFFICIAL_COLS;
  const rows = [];

  for (const row of aoa) {
    if (!row || !row.length) continue;
    const leaf = cellStr(row[c.kodeLeaf]);
    const register = cellStr(row[c.register]);
    // Baris detail barang = punya kode level terkecil (H) DAN Nomor Register.
    // Baris kategori/subtotal punya kode di kolom A-F saja, H & M kosong.
    if (!leaf || !register) continue;

    const kodeSegments = [...c.kodeLevels.map((idx) => cellStr(row[idx])), leaf].filter(Boolean);
    const namaBarang = cellStr(row[c.spesifikasiNama]) || cellStr(row[c.namaKategori]);
    const merkRaw = cellStr(row[c.merkTipe]);
    const merk = merkRaw.replace(/^merk\s*:\s*/i, '').trim();
    const nopol = cellStr(row[c.nopol]);
    const nomorRangka = cellStr(row[c.nomorRangka]);
    const nomorBpkb = cellStr(row[c.nomorBpkb]);
    const isKendaraan = Boolean(nopol || nomorRangka);
    const nilaiPerolehan = row[c.nilaiPerolehan];
    const tahun = extractYear(row[c.tanggalPerolehan]);

    // Properti object memakai LABEL field (bukan key) agar identik dengan
    // apa yang dipakai suggestKibColumnMapping/applyKibMappingAndValidate
    // (raw[sourceHeader] di mana sourceHeader = label kolom terpetakan).
    const mapped = {};
    for (const field of KIB_TARGET_FIELDS) {
      switch (field.key) {
        case 'kategori': mapped[field.label] = isKendaraan ? 'Kendaraan' : 'Peralatan'; break;
        case 'kode_barang': mapped[field.label] = kodeSegments.join('.'); break;
        case 'register': mapped[field.label] = register || cellStr(row[c.nibar]); break;
        case 'nama_barang': mapped[field.label] = namaBarang; break;
        case 'merk': mapped[field.label] = merk; break;
        case 'type': mapped[field.label] = ''; break;
        case 'tahun_perolehan': mapped[field.label] = tahun ?? ''; break;
        case 'nilai_perolehan': mapped[field.label] = nilaiPerolehan ?? ''; break;
        case 'kondisi': mapped[field.label] = ''; break; // tidak tersedia di format resmi ini
        case 'lokasi': mapped[field.label] = cellStr(row[c.lokasi]); break;
        case 'pengguna': mapped[field.label] = cellStr(row[c.statusPenggunaan]); break;
        case 'nopol': mapped[field.label] = nopol; break;
        case 'nomor_rangka': mapped[field.label] = nomorRangka; break;
        case 'nomor_mesin': mapped[field.label] = ''; break; // tidak ada kolom terpisah di format resmi ini
        case 'nomor_bpkb': mapped[field.label] = nomorBpkb; break;
        case 'jenis_kendaraan': mapped[field.label] = isKendaraan ? cellStr(row[c.namaKategori]) : ''; break;
        default: mapped[field.label] = '';
      }
    }
    rows.push(mapped);
  }

  return rows;
}

/**
 * STEP 1 (khusus KIB): baca file lalu deteksi apakah formatnya adalah
 * format resmi e-BMD "FORMAT II.O.1.2". Jika ya, otomatis di-parse tanpa
 * perlu mapping kolom manual. Jika tidak, jatuh kembali (fallback) ke
 * pembacaan tabel datar biasa (mode lama / template SIMPELBMD).
 */
export async function parseKibFile(file) {
  const allowedExt = ['.xlsx', '.xls', '.csv'];
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowedExt.includes(ext)) {
    throw new Error('Format file tidak didukung. Gunakan file .xlsx, .xls, atau .csv.');
  }
  const maxSizeBytes = 10 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    throw new Error('Ukuran file melebihi 10MB. Silakan pecah file menjadi beberapa bagian.');
  }

  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  // raw:true di sini (bukan raw:false seperti parser tabel datar) supaya
  // kolom angka (Nilai Perolehan dkk.) datang sebagai number asli, bukan
  // string berformat ribuan ("252,000,000.00") yang tidak bisa dibaca ulang
  // oleh parseNumericValue di kibValidator.
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

  const formatCode = detectKibOfficialFormatCode(aoa);

  if (formatCode === 'II.O.1.2') {
    const parsedRows = parseKibOfficialAoa(aoa);
    if (!parsedRows.length) {
      throw new Error('Format resmi KIB (II.O.1.2) terdeteksi, tetapi tidak ada baris detail barang yang bisa dibaca.');
    }
    return {
      headers: KIB_TARGET_FIELDS.map((f) => f.label),
      rows: parsedRows,
      sheetName: firstSheetName,
      isOfficialFormat: true,
      meta: { ...extractKibDocMeta(aoa), formatCode, totalBarisTerdeteksi: parsedRows.length },
    };
  }

  if (formatCode) {
    // Format resmi KIB lain terdeteksi (mis. Tanah/Gedung/Aset Lainnya) yang
    // belum didukung secara otomatis — jangan dipaksakan, minta bantuan admin.
    throw new Error(`Format resmi KIB "${formatCode}" terdeteksi, namun belum didukung secara otomatis. Saat ini hanya FORMAT II.O.1.2 (Peralatan & Mesin) yang didukung. Silakan gunakan Template Excel SIMPELBMD, atau hubungi admin untuk menambahkan dukungan format ini.`);
  }

  // Bukan format resmi -> fallback ke mode tabel datar (mode lama).
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  if (!rows.length) {
    throw new Error('File tidak berisi data. Pastikan baris pertama adalah header kolom.');
  }
  return { headers: Object.keys(rows[0]), rows, sheetName: firstSheetName, isOfficialFormat: false };
}

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
