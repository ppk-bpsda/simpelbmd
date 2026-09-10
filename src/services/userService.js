import { supabase } from '../lib/supabaseClient.js';
import { translateDbError } from './anggaranService.js';

export async function listUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, nama, role, status, opd_id, last_login_at, created_at, opd:opd_id(nama_opd)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateUserRole(id, role) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  if (error) throw translateDbError(error);
}

export async function updateUserStatus(id, status) {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
  if (error) throw translateDbError(error);
}

export async function updateUserOpd(id, opdId) {
  const { error } = await supabase.from('profiles').update({ opd_id: opdId }).eq('id', id);
  if (error) throw translateDbError(error);
}

export async function softDeleteUser(id, deletedBy) {
  const { error } = await supabase
    .from('profiles')
    .update({ deleted_at: new Date().toISOString(), deleted_by: deletedBy, status: 'nonaktif' })
    .eq('id', id);
  if (error) throw translateDbError(error);
}

/**
 * Membuat user baru lewat Edge Function `create-user` (service_role di sisi
 * server, TIDAK PERNAH di frontend). Lihat supabase/functions/create-user.
 */
export async function inviteUser({ username, password, nama, role, opdId }) {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { username, password, nama, role, opd_id: opdId },
  });
  if (error) {
    throw new Error(
      'Gagal membuat user baru. Pastikan Edge Function "create-user" sudah di-deploy (lihat supabase/functions/create-user), lalu coba lagi.'
    );
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
