import { supabase } from '../lib/supabaseClient.js';
import { translateDbError } from './anggaranService.js';

export async function listOpd() {
  const { data, error } = await supabase
    .from('opd')
    .select('id, kode_opd, nama_opd, status')
    .is('deleted_at', null)
    .eq('status', 'aktif')
    .order('nama_opd');
  if (error) throw error;
  return data;
}

// Dipakai halaman Administrasi > OPD — menampilkan semua OPD (termasuk nonaktif),
// beda dari listOpd() di atas yang dipakai dropdown (hanya OPD aktif).
export async function listOpdAll() {
  const { data, error } = await supabase
    .from('opd')
    .select('id, kode_opd, nama_opd, status, created_at')
    .is('deleted_at', null)
    .order('nama_opd');
  if (error) throw error;
  return data;
}

export async function createOpd({ kode, nama }) {
  const { error } = await supabase.from('opd').insert({ kode_opd: kode, nama_opd: nama });
  if (error) throw translateDbError(error);
}

export async function updateOpd(id, { kode, nama, status }) {
  const payload = { kode_opd: kode, nama_opd: nama };
  if (status) payload.status = status;
  const { error } = await supabase.from('opd').update(payload).eq('id', id);
  if (error) throw translateDbError(error);
}

export async function softDeleteOpd(id, userId) {
  const { error } = await supabase
    .from('opd')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
  if (error) throw translateDbError(error);
}
