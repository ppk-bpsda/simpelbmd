import { supabase } from '../lib/supabaseClient.js';

// ---------------------------------------------------------
// KEGIATAN
// ---------------------------------------------------------
export async function listKegiatan(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('kegiatan')
    .select('id, kode_kegiatan, nama_kegiatan, opd_id, opd:opd_id(nama_opd), created_at')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .is('deleted_at', null)
    .order('kode_kegiatan');
  if (error) throw error;
  return data;
}

export async function createKegiatan({ tahunAnggaranId, opdId, kode, nama }) {
  const { data, error } = await supabase
    .from('kegiatan')
    .insert({ tahun_anggaran_id: tahunAnggaranId, opd_id: opdId, kode_kegiatan: kode, nama_kegiatan: nama })
    .select()
    .single();
  if (error) throw translateDbError(error);
  return data;
}

export async function updateKegiatan(id, { kode, nama }) {
  const { data, error } = await supabase
    .from('kegiatan')
    .update({ kode_kegiatan: kode, nama_kegiatan: nama })
    .eq('id', id)
    .select()
    .single();
  if (error) throw translateDbError(error);
  return data;
}

export async function softDeleteKegiatan(id, userId) {
  const { error } = await supabase
    .from('kegiatan')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
  if (error) throw translateDbError(error);
}

// ---------------------------------------------------------
// SUB KEGIATAN
// ---------------------------------------------------------
export async function listSubKegiatan(kegiatanId) {
  const { data, error } = await supabase
    .from('sub_kegiatan')
    .select('id, kode_sub_kegiatan, nama_sub_kegiatan, kegiatan_id, created_at')
    .eq('kegiatan_id', kegiatanId)
    .is('deleted_at', null)
    .order('kode_sub_kegiatan');
  if (error) throw error;
  return data;
}

export async function listSubKegiatanByTahun(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('sub_kegiatan')
    .select('id, kode_sub_kegiatan, nama_sub_kegiatan, kegiatan:kegiatan_id(id, kode_kegiatan, nama_kegiatan, tahun_anggaran_id)')
    .is('deleted_at', null)
    .order('kode_sub_kegiatan');
  if (error) throw error;
  return (data || []).filter((sk) => sk.kegiatan?.tahun_anggaran_id === tahunAnggaranId);
}

export async function createSubKegiatan({ kegiatanId, kode, nama }) {
  const { data, error } = await supabase
    .from('sub_kegiatan')
    .insert({ kegiatan_id: kegiatanId, kode_sub_kegiatan: kode, nama_sub_kegiatan: nama })
    .select()
    .single();
  if (error) throw translateDbError(error);
  return data;
}

export async function updateSubKegiatan(id, { kode, nama }) {
  const { data, error } = await supabase
    .from('sub_kegiatan')
    .update({ kode_sub_kegiatan: kode, nama_sub_kegiatan: nama })
    .eq('id', id)
    .select()
    .single();
  if (error) throw translateDbError(error);
  return data;
}

export async function softDeleteSubKegiatan(id, userId) {
  const { error } = await supabase
    .from('sub_kegiatan')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
  if (error) throw translateDbError(error);
}

// ---------------------------------------------------------
// BELANJA
// ---------------------------------------------------------
export async function listBelanja(subKegiatanId) {
  const { data, error } = await supabase
    .from('belanja')
    .select('id, kode_rekening, nama_belanja, kelompok, pagu, sub_kegiatan_id, created_at')
    .eq('sub_kegiatan_id', subKegiatanId)
    .is('deleted_at', null)
    .order('kode_rekening');
  if (error) throw error;
  return data;
}

export async function listBelanjaByTahun(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('belanja')
    .select(`
      id, kode_rekening, nama_belanja, kelompok, pagu, sub_kegiatan_id,
      sub_kegiatan:sub_kegiatan_id (
        id, kode_sub_kegiatan, nama_sub_kegiatan,
        kegiatan:kegiatan_id ( id, kode_kegiatan, nama_kegiatan, tahun_anggaran_id )
      )
    `)
    .is('deleted_at', null)
    .order('kode_rekening');
  if (error) throw error;
  return (data || []).filter((b) => b.sub_kegiatan?.kegiatan?.tahun_anggaran_id === tahunAnggaranId);
}

export async function createBelanja({ subKegiatanId, kode, nama, kelompok, pagu }) {
  const { data, error } = await supabase
    .from('belanja')
    .insert({ sub_kegiatan_id: subKegiatanId, kode_rekening: kode, nama_belanja: nama, kelompok, pagu })
    .select()
    .single();
  if (error) throw translateDbError(error);
  return data;
}

export async function updateBelanja(id, { kode, nama, kelompok, pagu }) {
  const { data, error } = await supabase
    .from('belanja')
    .update({ kode_rekening: kode, nama_belanja: nama, kelompok, pagu })
    .eq('id', id)
    .select()
    .single();
  if (error) throw translateDbError(error);
  return data;
}

export async function softDeleteBelanja(id, userId) {
  const { error } = await supabase
    .from('belanja')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
  if (error) throw translateDbError(error);
}

// ---------------------------------------------------------
// Error translation: jangan tampilkan pesan teknis mentah ke user (§35).
// ---------------------------------------------------------
export function translateDbError(error) {
  const msg = error?.message || '';
  if (msg.includes('duplicate key') || error?.code === '23505') {
    return new Error('Data dengan kode tersebut sudah ada. Gunakan kode lain atau edit data yang sudah ada.');
  }
  if (msg.includes('foreign key') || error?.code === '23503') {
    return new Error('Data ini masih terhubung dengan data lain sehingga tidak dapat diproses.');
  }
  if (error?.code === '42501' || msg.toLowerCase().includes('row-level security')) {
    return new Error('Anda tidak memiliki izin untuk melakukan aksi ini.');
  }
  return new Error('Data gagal disimpan. Silakan periksa kembali isian Anda atau hubungi Administrator.');
}
