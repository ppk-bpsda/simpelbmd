import { supabase } from '../lib/supabaseClient.js';
import { translateDbError } from './anggaranService.js';

async function invokeAdminFunction(fnName, body) {
  const { data, error } = await supabase.functions.invoke(fnName, { body });
  if (error) {
    let message = error.message || 'Gagal menghubungi server.';
    try {
      const ctx = typeof error.context?.json === 'function' ? await error.context.json() : null;
      if (ctx?.error) message = ctx.error;
    } catch (_) { /* fallback ke error.message */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function listUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, nama, role, opd_id, status, last_login_at, created_at, opd:opd_id(nama_opd)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Membuat user baru — HARUS lewat Edge Function (service role) karena RLS
// tabel profiles sengaja tidak punya policy INSERT untuk client mana pun.
export async function createUser({ username, password, nama, role, opdId }) {
  return invokeAdminFunction('create-user', { username, password, nama, role, opd_id: opdId });
}

// Reset password — HARUS lewat Edge Function (Admin API, service role).
export async function resetUserPassword(targetUserId, newPassword) {
  return invokeAdminFunction('reset-user-password', { targetUserId, newPassword });
}

// Update role/OPD/nama/status — super_admin BOLEH langsung lewat client
// (lihat policy profiles_update_super_admin di 0002_rls_policies.sql),
// tidak perlu Edge Function untuk ini.
export async function updateUserProfile(id, { nama, role, opdId, status }) {
  const payload = { nama, role, status };
  payload.opd_id = role === 'super_admin' ? null : opdId;
  const { error } = await supabase.from('profiles').update(payload).eq('id', id);
  if (error) throw translateDbError(error);
}

// Nonaktifkan akun (soft): user tidak bisa login lagi karena getCurrentProfile()
// mensyaratkan status === 'aktif', tanpa perlu menghapus akun Auth-nya.
export async function setUserStatus(id, status) {
  const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
  if (error) throw translateDbError(error);
}
