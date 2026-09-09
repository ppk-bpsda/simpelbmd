import { supabase } from '../lib/supabaseClient.js';

/**
 * Mengambil ringkasan anggaran (Pagu, Realisasi, Sisa, %) untuk satu Tahun Anggaran.
 * Perhitungan dilakukan di database lewat view `v_ringkasan_anggaran`
 * (lihat supabase/migrations/0001_schema.sql) — bukan dihitung ulang di frontend,
 * agar konsisten dengan seluruh laporan lain yang memakai view yang sama.
 */
export async function getRingkasanAnggaran(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('v_ringkasan_anggaran')
    .select('*')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .maybeSingle();
  if (error) throw error;
  return (
    data || {
      total_pagu: 0,
      total_realisasi: 0,
      total_sisa: 0,
      persentase_realisasi: 0,
    }
  );
}

export async function getRingkasanPerJenisBelanja(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('v_ringkasan_jenis_belanja')
    .select('*')
    .eq('tahun_anggaran_id', tahunAnggaranId);
  if (error) throw error;
  return data || [];
}

export async function getPenyerapanBulanan(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('v_penyerapan_bulanan')
    .select('*')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .order('bulan', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getRingkasanPerKegiatan(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('v_ringkasan_per_kegiatan')
    .select('*')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .order('kode_kegiatan');
  if (error) throw error;
  return data || [];
}

export async function getRealisasiBulananKelompok(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('v_realisasi_bulanan_kelompok')
    .select('*')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .order('bulan', { ascending: true });
  if (error) throw error;
  return data || [];
}
