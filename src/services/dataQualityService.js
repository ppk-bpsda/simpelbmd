import { supabase } from '../lib/supabaseClient.js';
import { listBelanjaByTahun } from './anggaranService.js';
import { listPajak } from './transaksiService.js';
import { computeJatuhTempoStatus } from '../validators/transaksiValidator.js';

/**
 * Belanja dengan Pagu = 0 — kemungkinan DPA belum lengkap diinput (§33).
 */
export async function getBelanjaTanpaPagu(tahunAnggaranId) {
  const rows = await listBelanjaByTahun(tahunAnggaranId);
  return rows.filter((b) => Number(b.pagu) === 0);
}

/**
 * Belanja yang realisasinya melebihi Pagu (>100%) — indikasi potensi
 * pelampauan anggaran yang perlu ditinjau (§33).
 */
export async function getRealisasiMelebihiPagu(tahunAnggaranId) {
  const [belanjaList, { data: realisasiRows, error }] = await Promise.all([
    listBelanjaByTahun(tahunAnggaranId),
    supabase.from('v_realisasi_per_belanja').select('belanja_id, realisasi_per_belanja').eq('tahun_anggaran_id', tahunAnggaranId),
  ]);
  if (error) throw error;
  const realisasiMap = new Map((realisasiRows || []).map((r) => [r.belanja_id, Number(r.realisasi_per_belanja)]));

  return belanjaList
    .map((b) => ({ ...b, realisasi: realisasiMap.get(b.id) || 0 }))
    .filter((b) => Number(b.pagu) > 0 && b.realisasi > Number(b.pagu));
}

/**
 * Kendaraan dengan Nomor Rangka atau Nomor Mesin kosong — data KIB belum
 * lengkap, menghambat pelacakan/keabsahan aset (§33).
 */
export async function getKendaraanDataTidakLengkap(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('kendaraan')
    .select('id, nopol, nomor_rangka, nomor_mesin, kib:kib_id(nama_barang, tahun_anggaran_id)')
    .is('deleted_at', null)
    .or('nomor_rangka.is.null,nomor_mesin.is.null');
  if (error) throw error;
  return (data || []).filter((k) => k.kib?.tahun_anggaran_id === tahunAnggaranId);
}

/**
 * KIB berkategori kendaraan tetapi tidak punya baris kendaraan terkait
 * (seharusnya tidak terjadi lewat alur aplikasi normal, tapi tetap
 * diperiksa untuk berjaga-jaga terhadap inkonsistensi data, mis. akibat
 * intervensi manual di database) (§33).
 */
export async function getKibKendaraanTanpaDetail(tahunAnggaranId) {
  const { data: kibList, error } = await supabase
    .from('kib')
    .select('id, nama_barang, register')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .eq('kategori', 'kendaraan')
    .is('deleted_at', null);
  if (error) throw error;
  if (!kibList.length) return [];

  const { data: kendaraanList, error: err2 } = await supabase
    .from('kendaraan')
    .select('kib_id')
    .in('kib_id', kibList.map((k) => k.id))
    .is('deleted_at', null);
  if (err2) throw err2;

  const withDetail = new Set((kendaraanList || []).map((k) => k.kib_id));
  return kibList.filter((k) => !withDetail.has(k.id));
}

/**
 * Pajak/Perijinan yang sudah kedaluwarsa (§11, §33).
 */
export async function getPajakKedaluwarsa(tahunAnggaranId) {
  const rows = await listPajak(tahunAnggaranId);
  return rows.filter((r) => computeJatuhTempoStatus(r.masa_berlaku).status === 'lewat');
}

/**
 * Jalankan seluruh pemeriksaan sekaligus untuk Data Quality Center.
 */
export async function runDataQualityChecks(tahunAnggaranId) {
  const [belanjaTanpaPagu, realisasiMelebihiPagu, kendaraanTidakLengkap, kibTanpaDetail, pajakKedaluwarsa] = await Promise.all([
    getBelanjaTanpaPagu(tahunAnggaranId),
    getRealisasiMelebihiPagu(tahunAnggaranId),
    getKendaraanDataTidakLengkap(tahunAnggaranId),
    getKibKendaraanTanpaDetail(tahunAnggaranId),
    getPajakKedaluwarsa(tahunAnggaranId),
  ]);
  return { belanjaTanpaPagu, realisasiMelebihiPagu, kendaraanTidakLengkap, kibTanpaDetail, pajakKedaluwarsa };
}
