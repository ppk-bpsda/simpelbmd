import { supabase } from '../lib/supabaseClient.js';
import { translateDbError, listBelanjaByTahun } from './anggaranService.js';
import { BBM_KODE_REKENING } from '../validators/transaksiValidator.js';

// ---------------------------------------------------------
// Lookup ringan untuk dropdown (Kendaraan)
// ---------------------------------------------------------
export async function listKendaraanOptions(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('kendaraan')
    .select('id, nopol, roda, kib:kib_id(nama_barang, tahun_anggaran_id, opd_id)')
    .is('deleted_at', null)
    .order('nopol');
  if (error) throw error;
  return (data || []).filter((k) => k.kib?.tahun_anggaran_id === tahunAnggaranId);
}

// ---------------------------------------------------------
// PAJAK / PERIJINAN
// ---------------------------------------------------------
export async function listPajak(tahunAnggaranId, filters = {}) {
  let query = supabase
    .from('pajak_perijinan')
    .select(`
      id, tanggal, jenis, nomor_dokumen, masa_berlaku, nilai, sumber_anggaran, keterangan,
      kendaraan:kendaraan_id ( id, nopol, kib:kib_id(nama_barang) ),
      belanja:belanja_id ( id, nama_belanja )
    `)
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .is('deleted_at', null);
  if (filters.kendaraanId) query = query.eq('kendaraan_id', filters.kendaraanId);
  query = query.order('masa_berlaku', { ascending: true, nullsFirst: false });
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createPajak(payload) {
  const { error } = await supabase.from('pajak_perijinan').insert(payload);
  if (error) throw translateDbError(error);
}

export async function updatePajak(id, payload) {
  const { error } = await supabase.from('pajak_perijinan').update(payload).eq('id', id);
  if (error) throw translateDbError(error);
}

export async function softDeletePajak(id, userId) {
  const { error } = await supabase
    .from('pajak_perijinan')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
  if (error) throw translateDbError(error);
}

// ---------------------------------------------------------
// PEMELIHARAAN
// ---------------------------------------------------------
export async function listPemeliharaan(tahunAnggaranId, filters = {}) {
  let query = supabase
    .from('pemeliharaan')
    .select(`
      id, tanggal, jenis, bengkel, nomor_dokumen, uraian, sparepart, jasa, nilai, kilometer, keterangan,
      kendaraan:kendaraan_id ( id, nopol, kib:kib_id(nama_barang) ),
      belanja:belanja_id ( id, nama_belanja )
    `)
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .is('deleted_at', null);
  if (filters.kendaraanId) query = query.eq('kendaraan_id', filters.kendaraanId);
  query = query.order('tanggal', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createPemeliharaan(payload) {
  const { error } = await supabase.from('pemeliharaan').insert(payload);
  if (error) throw translateDbError(error);
}

export async function updatePemeliharaan(id, payload) {
  const { error } = await supabase.from('pemeliharaan').update(payload).eq('id', id);
  if (error) throw translateDbError(error);
}

export async function softDeletePemeliharaan(id, userId) {
  const { error } = await supabase
    .from('pemeliharaan')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
  if (error) throw translateDbError(error);
}

// ---------------------------------------------------------
// BBM / KUPON BBM
// ---------------------------------------------------------
export async function listBbm(tahunAnggaranId, filters = {}) {
  let query = supabase
    .from('bbm')
    .select(`
      id, tanggal, jenis_bbm, roda_kendaraan, jumlah_kupon, nilai_per_kupon, nilai,
      kilometer_awal, kilometer_akhir, jarak_tempuh, pengemudi, keterangan,
      kendaraan:kendaraan_id ( id, nopol, kib:kib_id(nama_barang) ),
      belanja:belanja_id ( id, nama_belanja )
    `)
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .is('deleted_at', null);
  if (filters.kendaraanId) query = query.eq('kendaraan_id', filters.kendaraanId);
  query = query.order('tanggal', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createBbm(payload) {
  const { error } = await supabase.from('bbm').insert(payload);
  if (error) throw translateDbError(error);
}

export async function updateBbm(id, payload) {
  const { error } = await supabase.from('bbm').update(payload).eq('id', id);
  if (error) throw translateDbError(error);
}

export async function softDeleteBbm(id, userId) {
  const { error } = await supabase
    .from('bbm')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
  if (error) throw translateDbError(error);
}

function normalizeKodeRekening(s) { return String(s || '').replace(/[^0-9]/g, ''); }

/**
 * Cari Belanja (kelompok='bbm') yang kode rekeningnya cocok dengan jenis
 * roda kendaraan pada Tahun Anggaran berjalan, tanpa perlu pemilihan
 * manual — pengadaan BBM Roda 4 dan Roda 2 dibebankan pada 2 kode
 * rekening berbeda (lihat BBM_KODE_REKENING).
 * Mengembalikan null jika belum ada rincian Belanja untuk kode tsb.
 */
export async function resolveBbmBelanja(tahunAnggaranId, roda) {
  const targetKode = BBM_KODE_REKENING[roda];
  if (!targetKode) return null;
  const targetDigits = normalizeKodeRekening(targetKode);
  const all = await listBelanjaByTahun(tahunAnggaranId);
  return all.find((b) => b.kelompok === 'bbm' && normalizeKodeRekening(b.kode_rekening) === targetDigits) || null;
}
