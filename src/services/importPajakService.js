import { supabase } from '../lib/supabaseClient.js';
import { normalizeKondisi } from '../validators/kibValidator.js';

// ============================================================
// Import Excel untuk modul Pajak & Perijinan.
//
// Mendukung DUA mode, terdeteksi otomatis:
//
// 1) FORMAT REGISTER (khusus) — file seperti "DAFTAR/REGISTER
//    PEMBAYARAN PAJAK ATAS KENDARAAN BERMOTOR" yang selama ini dipakai
//    Bagian Perekonomian & SDA. Judul dokumen dua baris, header kolom
//    dua baris (mis. "NOMOR" di atas "RANGKA"/"MESIN"/"POLISI"), berisi
//    data kendaraan (Nopol, Merk/Type, No Rangka, No Mesin, Tahun,
//    Pemakai, Kondisi) + "TANGGAL JATUH TEMPO PAJAK" berulang tahunan
//    (tgl-bulan saja, tanpa tahun) + kolom "KET. BAYAR" per tahun
//    (SUDAH/BELUM). Terdeteksi & diproses otomatis TANPA mapping kolom
//    manual. Boleh berisi beberapa sheet sekaligus (semua sheet yang
//    cocok formatnya digabung).
//
//    Dari format ini dibuatkan DUA jenis baris transaksi kandidat:
//      a. HISTORIS — satu baris pajak_perijinan untuk tiap tahun yang
//         berstatus "SUDAH", dengan masa_berlaku = tanggal jatuh tempo
//         pada tahun tsb. Nilai & Nomor Dokumen TIDAK ada di file,
//         diisi 0 / kosong dan ditandai perlu dilengkapi manual.
//      b. PROYEKSI — satu baris untuk siklus jatuh tempo BERIKUTNYA
//         (dihitung dari tanggal hari ini), supaya kartu KPI & reminder
//         H-30 di halaman Pajak langsung aktif untuk kendaraan tsb,
//         walau pembayaran belum tercatat. Ditandai jelas di kolom
//         Keterangan sebagai perkiraan.
//
// 2) FORMAT TABEL DATAR (fallback) — file dengan 1 baris header berisi
//    kolom-kolom transaksi pajak langsung (Nopol, Jenis, Tanggal, Nomor
//    Dokumen, Masa Berlaku, Nilai, dst). Memakai alur mapping kolom
//    manual, sama seperti Import DPA.
// ============================================================

const BULAN_ID = {
  januari: 1, february: 2, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
};

function cellStr(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return '';
  return String(v).trim();
}
function normalizeHeaderText(v) {
  return cellStr(v).toLowerCase().replace(/\s+/g, ' ');
}
function pad2(n) { return String(n).padStart(2, '0'); }
function toIsoDate(year, month, day) { return `${year}-${pad2(month)}-${pad2(day)}`; }

/** Deteksi judul dokumen "DAFTAR/REGISTER ... KENDARAAN BERMOTOR". */
function isRegisterTitle(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 3); i += 1) {
    const t = normalizeHeaderText(aoa[i]?.[0]);
    if (t.includes('register') && t.includes('kendaraan bermotor')) return true;
  }
  return false;
}

/** Cari baris header pertama (baris 1 dari 2 baris header bertingkat). */
function findHeaderRowIndex(aoa) {
  for (let i = 0; i < Math.min(aoa.length, 12); i += 1) {
    const row = aoa[i] || [];
    if (row.some((c) => normalizeHeaderText(c).includes('jatuh tempo'))) return i;
  }
  return -1;
}

/** Parse "14 AGUSTUS" / "07 Januari" dsb menjadi { day, month }. */
export function parseJatuhTempoText(raw) {
  const s = cellStr(raw);
  const m = s.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\.?$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = BULAN_ID[m[2].toLowerCase()];
  if (!month || day < 1 || day > 31) return null;
  return { day, month };
}

/** Tanggal jatuh tempo terdekat berikutnya dari { day, month }, relatif hari ini. */
export function nextOccurrenceIso(day, month, today = new Date()) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let year = today.getFullYear();
  let candidate = new Date(year, month - 1, day);
  if (candidate < t0) { year += 1; candidate = new Date(year, month - 1, day); }
  return toIsoDate(year, month, day);
}

/**
 * Parse satu sheet (bentuk AOA hasil sheet_to_json {header:1}) yang sudah
 * dipastikan berformat Register. Mengembalikan daftar baris kendaraan
 * mentah + kolom tahun status bayar yang ditemukan.
 */
function parseRegisterSheet(aoa, sheetName) {
  const h1 = findHeaderRowIndex(aoa);
  if (h1 === -1) return null;
  const h2 = h1 + 1;
  const row1 = aoa[h1] || [];
  const row2 = aoa[h2] || [];
  const ncols = Math.max(row1.length, row2.length);

  const col = {};
  const yearCols = [];
  for (let c = 0; c < ncols; c += 1) {
    const combined = normalizeHeaderText(`${cellStr(row1[c])} ${cellStr(row2[c])}`);
    if (combined.includes('jenis')) col.jenis = c;
    else if (combined.includes('merk')) col.merk = c;
    else if (combined.includes('rangka')) col.rangka = c;
    else if (combined.includes('mesin')) col.mesin = c;
    else if (combined.includes('polisi')) col.nopol = c;
    else if (combined.includes('pemakai')) col.pemakai = c;
    else if (combined.includes('kondisi')) col.kondisi = c;
    else if (combined.includes('jatuh tempo')) col.jatuhTempo = c;
    else if (/^th\b/.test(combined)) col.tahun = c;

    const y = Number(cellStr(row2[c]));
    if (Number.isInteger(y) && y >= 2000 && y <= 2100) yearCols.push({ col: c, year: y });
  }

  if (col.nopol === undefined || col.jatuhTempo === undefined) return null;

  const vehicles = [];
  const skipped = [];
  for (let r = h2 + 1; r < aoa.length; r += 1) {
    const row = aoa[r] || [];
    if (!row.length) continue;
    const nopol = cellStr(row[col.nopol]).toUpperCase();
    const merk = cellStr(row[col.merk]);
    const jenis = cellStr(row[col.jenis]);
    if (!nopol && !merk && !jenis) continue; // baris benar-benar kosong
    if (!nopol) { skipped.push({ sheetName, rowNumber: r + 1, reason: 'Nomor Polisi kosong / baris data tidak lengkap' }); continue; }

    const jt = parseJatuhTempoText(row[col.jatuhTempo]);
    const statuses = yearCols
      .map(({ col: yc, year }) => ({ year, status: cellStr(row[yc]).toUpperCase() }))
      .filter((s) => s.status);

    vehicles.push({
      sheetName,
      rowNumber: r + 1,
      nopol,
      jenis_kendaraan: mapJenisKendaraan(jenis),
      merk,
      nomor_rangka: cellStr(row[col.rangka]).toUpperCase() || null,
      nomor_mesin: cellStr(row[col.mesin]).toUpperCase() || null,
      tahun_perolehan: parseYear(cellStr(row[col.tahun])),
      pengguna: cellStr(row[col.pemakai]) || null,
      kondisi: normalizeKondisi(cellStr(row[col.kondisi])),
      jatuhTempoRaw: cellStr(row[col.jatuhTempo]),
      jatuhTempo: jt,
      statuses,
      jatuhTempoTakTerbaca: Boolean(cellStr(row[col.jatuhTempo])) && !jt,
    });
  }

  return { sheetName, vehicles, skipped, yearCols };
}

function mapJenisKendaraan(raw) {
  const v = cellStr(raw).toUpperCase();
  if (v === 'R. 4' || v === 'R.4' || v === 'R4') return 'Roda 4';
  if (v === 'R. 2' || v === 'R.2' || v === 'R2') return 'Roda 2';
  return raw || null;
}
function parseYear(raw) {
  const n = Number(String(raw || '').replace(/\D/g, ''));
  return Number.isInteger(n) && n >= 1980 && n <= 2100 ? n : null;
}

/**
 * STEP 1: baca file, deteksi format Register di SEMUA sheet, gabungkan
 * hasilnya. Jika tak satu pun sheet cocok, fallback ke mode tabel datar
 * (1 sheet pertama, mapping kolom manual — sama seperti Import DPA).
 */
export async function parsePajakFile(file) {
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

  const matchedSheets = [];
  for (const sheetName of workbook.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' });
    if (!isRegisterTitle(aoa)) continue;
    const parsed = parseRegisterSheet(aoa, sheetName);
    if (parsed && parsed.vehicles.length) matchedSheets.push(parsed);
  }

  if (matchedSheets.length) {
    const candidates = buildCandidatesFromRegister(matchedSheets);
    const allSkipped = matchedSheets.flatMap((s) => s.skipped);
    return {
      isRegisterFormat: true,
      sheetNames: matchedSheets.map((s) => s.sheetName),
      candidates,
      skipped: allSkipped,
    };
  }

  // Fallback: tabel datar, sheet pertama, mapping manual.
  const firstSheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '', raw: false });
  if (!rows.length) {
    throw new Error('File tidak berisi data, dan tidak terdeteksi sebagai format Register Kendaraan yang dikenali. Pastikan baris pertama adalah header kolom.');
  }
  return { isRegisterFormat: false, headers: Object.keys(rows[0]), rows, sheetName: firstSheetName };
}

/**
 * Ubah daftar kendaraan (dari satu / beberapa sheet Register) menjadi
 * daftar KANDIDAT transaksi pajak_perijinan siap-preview, digabung
 * per-Nopol supaya kendaraan yang sama di beberapa sheet tidak
 * dua kali diinput sebagai kendaraan master terpisah.
 */
function buildCandidatesFromRegister(sheets) {
  const byNopol = new Map();
  for (const sheet of sheets) {
    for (const v of sheet.vehicles) {
      if (!byNopol.has(v.nopol)) byNopol.set(v.nopol, v);
      // Jika nopol sama muncul di beberapa sheet, gabungkan info status
      // bayar (union) & lengkapi field yang kosong dari sheet lain.
      else {
        const existing = byNopol.get(v.nopol);
        existing.statuses = [...existing.statuses, ...v.statuses];
        for (const key of ['merk', 'nomor_rangka', 'nomor_mesin', 'tahun_perolehan', 'pengguna', 'kondisi', 'jenis_kendaraan']) {
          if (!existing[key] && v[key]) existing[key] = v[key];
        }
        if (!existing.jatuhTempo && v.jatuhTempo) { existing.jatuhTempo = v.jatuhTempo; existing.jatuhTempoRaw = v.jatuhTempoRaw; }
      }
    }
  }

  const candidates = [];
  const today = new Date();

  for (const v of byNopol.values()) {
    const kendaraanInfo = {
      nopol: v.nopol,
      merk: v.merk || null,
      nama_barang: v.merk || v.jenis_kendaraan || 'Kendaraan',
      jenis_kendaraan: v.jenis_kendaraan,
      nomor_rangka: v.nomor_rangka,
      nomor_mesin: v.nomor_mesin,
      tahun_perolehan: v.tahun_perolehan,
      pengguna: v.pengguna,
      kondisi: v.kondisi,
    };

    if (!v.jatuhTempo) {
      candidates.push({
        nopol: v.nopol, sheetName: v.sheetName, rowNumber: v.rowNumber, kendaraanInfo,
        tipe: 'tanpa_tanggal', jenis: 'pajak_kendaraan', tanggal: null, masa_berlaku: null,
        nilai: 0, nomor_dokumen: null,
        keterangan: `Diimpor dari ${v.sheetName}. Tanggal jatuh tempo "${v.jatuhTempoRaw || '-'}" tidak bisa dibaca — data kendaraan tetap disiapkan, transaksi pajak silakan ditambahkan manual.`,
        valid: false, error: 'Tanggal jatuh tempo tidak terbaca, transaksi pajak tidak dibuat otomatis (data kendaraan tetap diimpor).',
      });
      continue;
    }

    const seenMasaBerlaku = new Set();

    // a. Baris historis: satu per tahun berstatus "SUDAH".
    const sudahTahun = v.statuses.filter((s) => s.status === 'SUDAH').map((s) => s.year);
    for (const year of sudahTahun) {
      const masaBerlaku = toIsoDate(year, v.jatuhTempo.month, v.jatuhTempo.day);
      if (seenMasaBerlaku.has(masaBerlaku)) continue;
      seenMasaBerlaku.add(masaBerlaku);
      candidates.push({
        nopol: v.nopol, sheetName: v.sheetName, rowNumber: v.rowNumber, kendaraanInfo,
        tipe: 'historis', tahunSiklus: year, jenis: 'pajak_kendaraan',
        tanggal: masaBerlaku, masa_berlaku: masaBerlaku, nilai: 0, nomor_dokumen: null,
        keterangan: `Diimpor dari ${v.sheetName} — status "SUDAH" tahun ${year}. Nilai & Nomor Dokumen belum tersedia di file, mohon dilengkapi.`,
        valid: true,
      });
    }

    // b. Baris proyeksi: siklus jatuh tempo berikutnya (untuk aktifkan reminder H-30).
    const proyeksiIso = nextOccurrenceIso(v.jatuhTempo.day, v.jatuhTempo.month, today);
    if (!seenMasaBerlaku.has(proyeksiIso)) {
      candidates.push({
        nopol: v.nopol, sheetName: v.sheetName, rowNumber: v.rowNumber, kendaraanInfo,
        tipe: 'proyeksi', jenis: 'pajak_kendaraan',
        tanggal: proyeksiIso, masa_berlaku: proyeksiIso, nilai: 0, nomor_dokumen: null,
        keterangan: `PERKIRAAN siklus jatuh tempo berikutnya (dari pola tanggal "${v.jatuhTempoRaw}") — belum tercatat dibayar. Perbarui Tanggal/Nilai/Nomor Dokumen setelah pembayaran dilakukan.`,
        valid: true,
      });
    }
  }

  return candidates.sort((a, b) => a.nopol.localeCompare(b.nopol) || (a.masa_berlaku || '').localeCompare(b.masa_berlaku || ''));
}

/**
 * Commit hasil parsing format Register ke database:
 *  1. Upsert kendaraan master data (KIB + kendaraan) per Nopol unik.
 *  2. Insert transaksi pajak_perijinan untuk tiap kandidat valid,
 *     dilewati (skip) bila sudah ada baris dengan kendaraan+masa_berlaku
 *     yang sama (mencegah duplikasi saat file diimpor berulang).
 */
export async function commitPajakRegisterImport({ tahunAnggaranId, opdId, candidates, fileName, userId }) {
  const summary = {
    total_baris: candidates.length,
    kendaraan_baru: 0, kendaraan_diperbarui: 0,
    transaksi_baru: 0, transaksi_dilewati: 0,
    tidak_lengkap: candidates.filter((c) => !c.valid).length,
    error: 0,
    detail: [],
  };

  const kendaraanIdByNopol = new Map();
  const uniqueVehicles = new Map();
  for (const c of candidates) if (!uniqueVehicles.has(c.nopol)) uniqueVehicles.set(c.nopol, c.kendaraanInfo);

  for (const [nopol, info] of uniqueVehicles) {
    try {
      const { id, created } = await upsertKendaraan(info, { tahunAnggaranId, opdId });
      kendaraanIdByNopol.set(nopol, id);
      if (created) summary.kendaraan_baru += 1; else summary.kendaraan_diperbarui += 1;
    } catch (err) {
      summary.error += 1;
      summary.detail.push({ nopol, status: 'error', pesan: `Gagal menyiapkan data kendaraan: ${err.message}` });
    }
  }

  for (const c of candidates) {
    if (!c.valid) {
      summary.detail.push({ nopol: c.nopol, status: 'tidak_lengkap', pesan: c.error });
      continue;
    }
    const kendaraanId = kendaraanIdByNopol.get(c.nopol);
    if (!kendaraanId) continue; // kendaraan gagal disiapkan, sudah dicatat di atas

    try {
      const { data: existing, error: findErr } = await supabase
        .from('pajak_perijinan')
        .select('id')
        .eq('kendaraan_id', kendaraanId)
        .eq('masa_berlaku', c.masa_berlaku)
        .is('deleted_at', null)
        .maybeSingle();
      if (findErr) throw findErr;

      if (existing) {
        summary.transaksi_dilewati += 1;
        summary.detail.push({ nopol: c.nopol, status: 'dilewati', pesan: `Sudah ada transaksi dengan masa berlaku ${c.masa_berlaku}.` });
        continue;
      }

      const { error: insErr } = await supabase.from('pajak_perijinan').insert({
        tahun_anggaran_id: tahunAnggaranId,
        kendaraan_id: kendaraanId,
        belanja_id: null,
        tanggal: c.tanggal,
        jenis: c.jenis,
        nomor_dokumen: c.nomor_dokumen,
        masa_berlaku: c.masa_berlaku,
        nilai: c.nilai,
        keterangan: c.keterangan,
      });
      if (insErr) throw insErr;

      summary.transaksi_baru += 1;
      summary.detail.push({ nopol: c.nopol, status: c.tipe === 'proyeksi' ? 'proyeksi_ditambahkan' : 'baru', pesan: `Masa berlaku ${c.masa_berlaku}` });
    } catch (err) {
      summary.error += 1;
      summary.detail.push({ nopol: c.nopol, status: 'error', pesan: err.message });
    }
  }

  await supabase.from('import_logs').insert({
    tahun_anggaran_id: tahunAnggaranId,
    opd_id: opdId,
    jenis: 'pajak',
    file_name: fileName,
    total_baris: summary.total_baris,
    baru: summary.transaksi_baru,
    diperbarui: summary.kendaraan_diperbarui,
    tidak_berubah: summary.transaksi_dilewati,
    error: summary.error,
    duplikat: summary.transaksi_dilewati,
    detail: summary.detail,
    imported_by: userId,
  });

  return summary;
}

async function upsertKendaraan(info, ctx) {
  const { data: existing, error: findErr } = await supabase
    .from('kendaraan')
    .select('id, kib_id, kib:kib_id(id, opd_id, pengguna, kondisi, merk, tahun_perolehan)')
    .eq('nopol', info.nopol)
    .is('deleted_at', null)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    // Lengkapi field yang masih kosong di database dari data file, tanpa
    // pernah menimpa data yang sudah diisi manual sebelumnya.
    const kib = existing.kib || {};
    const kibPatch = {};
    if (!kib.pengguna && info.pengguna) kibPatch.pengguna = info.pengguna;
    if (!kib.kondisi && info.kondisi) kibPatch.kondisi = info.kondisi;
    if (!kib.merk && info.merk) kibPatch.merk = info.merk;
    if (!kib.tahun_perolehan && info.tahun_perolehan) kibPatch.tahun_perolehan = info.tahun_perolehan;
    if (Object.keys(kibPatch).length) {
      await supabase.from('kib').update(kibPatch).eq('id', existing.kib_id);
    }
    const kendPatch = {};
    if (!existing.nomor_rangka && info.nomor_rangka) kendPatch.nomor_rangka = info.nomor_rangka;
    if (!existing.nomor_mesin && info.nomor_mesin) kendPatch.nomor_mesin = info.nomor_mesin;
    if (!existing.jenis_kendaraan && info.jenis_kendaraan) kendPatch.jenis_kendaraan = info.jenis_kendaraan;
    if (Object.keys(kendPatch).length) {
      await supabase.from('kendaraan').update(kendPatch).eq('id', existing.id);
    }
    return { id: existing.id, created: false };
  }

  const { data: kibRow, error: kibErr } = await supabase
    .from('kib')
    .insert({
      tahun_anggaran_id: ctx.tahunAnggaranId, opd_id: ctx.opdId, kategori: 'kendaraan',
      nama_barang: info.nama_barang, merk: info.merk || null, tahun_perolehan: info.tahun_perolehan,
      kondisi: info.kondisi, pengguna: info.pengguna || null,
    })
    .select('id').single();
  if (kibErr) throw kibErr;

  const { data: kendRow, error: kendErr } = await supabase
    .from('kendaraan')
    .insert({
      kib_id: kibRow.id, nopol: info.nopol, nomor_rangka: info.nomor_rangka,
      nomor_mesin: info.nomor_mesin, jenis_kendaraan: info.jenis_kendaraan,
    })
    .select('id').single();
  if (kendErr) { await supabase.from('kib').delete().eq('id', kibRow.id); throw kendErr; }

  return { id: kendRow.id, created: true };
}

// ============================================================
// MODE FALLBACK: tabel datar dengan mapping kolom manual.
// ============================================================

export const PAJAK_TARGET_FIELDS = [
  { key: 'nopol', label: 'Nomor Polisi' },
  { key: 'jenis', label: 'Jenis (Pajak STNK/Pajak Kendaraan/KIR/Izin Trayek/Lainnya)' },
  { key: 'tanggal', label: 'Tanggal Transaksi' },
  { key: 'nomor_dokumen', label: 'Nomor Dokumen' },
  { key: 'masa_berlaku', label: 'Masa Berlaku / Jatuh Tempo' },
  { key: 'nilai', label: 'Nilai (Rp)' },
  { key: 'sumber_anggaran', label: 'Sumber Anggaran' },
  { key: 'keterangan', label: 'Keterangan' },
];
const REQUIRED_FLAT_FIELDS = ['nopol', 'jenis', 'tanggal'];

const FLAT_FIELD_ALIASES = {
  nopol: ['nopol', 'no polisi', 'nomor polisi', 'plat nomor'],
  jenis: ['jenis', 'jenis pajak', 'jenis perijinan'],
  tanggal: ['tanggal', 'tanggal transaksi', 'tgl'],
  nomor_dokumen: ['nomor dokumen', 'no dokumen', 'no. dokumen'],
  masa_berlaku: ['masa berlaku', 'jatuh tempo', 'tanggal jatuh tempo'],
  nilai: ['nilai', 'nominal', 'jumlah bayar'],
  sumber_anggaran: ['sumber anggaran', 'sumber dana'],
  keterangan: ['keterangan', 'catatan'],
};
const JENIS_ALIASES = {
  pajak_stnk: ['pajak stnk', 'stnk'],
  pajak_kendaraan: ['pajak kendaraan', 'pkb', 'pajak kendaraan bermotor'],
  kir: ['kir'],
  izin_trayek: ['izin trayek'],
  perijinan_lainnya: ['perijinan lainnya', 'lainnya', 'perizinan lainnya'],
};

function normHeader(h) { return String(h || '').trim().toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' '); }

export function suggestPajakColumnMapping(headers) {
  const mapping = {};
  for (const field of PAJAK_TARGET_FIELDS) {
    const aliases = FLAT_FIELD_ALIASES[field.key] || [];
    const found = headers.find((h) => aliases.includes(normHeader(h)));
    mapping[field.key] = found || '';
  }
  return mapping;
}
export function pajakRequiredFields() { return PAJAK_TARGET_FIELDS.filter((f) => REQUIRED_FLAT_FIELDS.includes(f.key)); }

function normalizeJenis(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (['pajak_stnk', 'pajak_kendaraan', 'kir', 'izin_trayek', 'perijinan_lainnya'].includes(v)) return v;
  for (const [key, aliases] of Object.entries(JENIS_ALIASES)) {
    if (aliases.some((a) => v === a || v.includes(a))) return key;
  }
  return '';
}
function parseFlatDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return toIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) return toIsoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : toIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function parseFlatNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return 0;
  const n = Number(String(raw).replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/** Validasi + normalisasi baris mode tabel datar. Nopol dicocokkan ke DB saat commit (bukan di sini). */
export function applyPajakFlatMapping(rows, mapping) {
  return rows.map((raw, idx) => {
    const rowNumber = idx + 2;
    const errors = [];
    const nopol = String(raw[mapping.nopol] || '').trim().toUpperCase();
    const jenis = normalizeJenis(raw[mapping.jenis]);
    const tanggal = parseFlatDate(raw[mapping.tanggal]);
    const masa_berlaku = mapping.masa_berlaku ? parseFlatDate(raw[mapping.masa_berlaku]) : null;
    const nilai = parseFlatNumber(raw[mapping.nilai]);

    if (!nopol) errors.push('Nomor Polisi kosong');
    if (!jenis) errors.push('Jenis tidak dikenali');
    if (!tanggal) errors.push('Tanggal Transaksi kosong / format tidak valid');
    if (Number.isNaN(nilai)) errors.push('Nilai bukan angka yang valid');

    return {
      rowNumber, valid: errors.length === 0, errors,
      normalized: {
        nopol, jenis, tanggal, masa_berlaku, nilai: Number.isNaN(nilai) ? 0 : nilai,
        nomor_dokumen: mapping.nomor_dokumen ? String(raw[mapping.nomor_dokumen] || '').trim() || null : null,
        sumber_anggaran: mapping.sumber_anggaran ? String(raw[mapping.sumber_anggaran] || '').trim() || null : null,
        keterangan: mapping.keterangan ? String(raw[mapping.keterangan] || '').trim() || null : null,
      },
    };
  });
}

/** Commit mode tabel datar: kendaraan HARUS sudah terdaftar di KIB (dicocokkan lewat Nopol). */
export async function commitPajakFlatImport({ tahunAnggaranId, validatedRows, fileName, opdId, userId }) {
  const validRows = validatedRows.filter((r) => r.valid);
  const summary = { total_baris: validatedRows.length, baru: 0, error: validatedRows.length - validRows.length, tidak_ditemukan: 0, duplikat: 0, detail: [] };

  for (const row of validRows) {
    const n = row.normalized;
    try {
      const { data: kendaraan, error: findErr } = await supabase
        .from('kendaraan').select('id').eq('nopol', n.nopol).is('deleted_at', null).maybeSingle();
      if (findErr) throw findErr;
      if (!kendaraan) {
        summary.tidak_ditemukan += 1;
        summary.detail.push({ baris: row.rowNumber, status: 'error', pesan: `Nopol ${n.nopol} belum terdaftar di data KIB Kendaraan.` });
        continue;
      }
      if (n.masa_berlaku) {
        const { data: existing } = await supabase
          .from('pajak_perijinan').select('id').eq('kendaraan_id', kendaraan.id).eq('masa_berlaku', n.masa_berlaku).is('deleted_at', null).maybeSingle();
        if (existing) {
          summary.duplikat += 1;
          summary.detail.push({ baris: row.rowNumber, status: 'duplikat', pesan: `Sudah ada transaksi Nopol ${n.nopol} dengan masa berlaku sama.` });
          continue;
        }
      }
      const { error: insErr } = await supabase.from('pajak_perijinan').insert({
        tahun_anggaran_id: tahunAnggaranId, kendaraan_id: kendaraan.id, jenis: n.jenis,
        tanggal: n.tanggal, nomor_dokumen: n.nomor_dokumen, masa_berlaku: n.masa_berlaku,
        nilai: n.nilai, sumber_anggaran: n.sumber_anggaran, keterangan: n.keterangan,
      });
      if (insErr) throw insErr;
      summary.baru += 1;
      summary.detail.push({ baris: row.rowNumber, status: 'baru', nopol: n.nopol });
    } catch (err) {
      summary.error += 1;
      summary.detail.push({ baris: row.rowNumber, status: 'error', pesan: err.message });
    }
  }

  validatedRows.filter((r) => !r.valid).forEach((r) => summary.detail.push({ baris: r.rowNumber, status: 'error', pesan: r.errors.join('; ') }));

  await supabase.from('import_logs').insert({
    tahun_anggaran_id: tahunAnggaranId, opd_id: opdId, jenis: 'pajak', file_name: fileName,
    total_baris: summary.total_baris, baru: summary.baru, diperbarui: 0, tidak_berubah: summary.duplikat,
    error: summary.error + summary.tidak_ditemukan, duplikat: summary.duplikat, detail: summary.detail, imported_by: userId,
  });

  return summary;
}
