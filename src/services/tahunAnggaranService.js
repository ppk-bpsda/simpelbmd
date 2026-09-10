import { supabase } from '../lib/supabaseClient.js';

export async function listTahunAnggaran() {
  const { data, error } = await supabase
    .from('tahun_anggaran')
    .select('id, tahun, status_aktif')
    .is('deleted_at', null)
    .order('tahun', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getDefaultTahunAnggaran() {
  const list = await listTahunAnggaran();
  return list.find((t) => t.status_aktif) || list[0] || null;
}

export async function createTahunAnggaran(tahun) {
  const { data, error } = await supabase.from('tahun_anggaran').insert({ tahun }).select().single();
  if (error) {
    if (error.code === '23505') throw new Error('Tahun Anggaran tersebut sudah ada.');
    throw new Error('Gagal menambahkan Tahun Anggaran.');
  }
  return data;
}

/**
 * Mengaktifkan satu Tahun Anggaran secara atomik lewat RPC (menghindari
 * race condition terhadap constraint "hanya satu TA aktif" — lihat
 * migration 0005_security_hardening.sql).
 */
export async function setTahunAnggaranAktif(id) {
  const { error } = await supabase.rpc('set_tahun_anggaran_aktif', { p_id: id });
  if (error) throw new Error('Gagal mengubah Tahun Anggaran aktif. Pastikan Anda memiliki akses Super Admin.');
}
