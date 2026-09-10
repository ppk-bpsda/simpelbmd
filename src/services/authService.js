import { supabase } from '../lib/supabaseClient.js';

const INTERNAL_DOMAIN = import.meta.env.VITE_AUTH_INTERNAL_DOMAIN || 'simbmd.local';

/**
 * Username tidak pernah dikirim sebagai "email" yang terlihat oleh user.
 * Supabase Auth tetap butuh format email secara internal, jadi kita bentuk
 * alamat sintetik: <username>@<domain-internal>. Domain ini tidak pernah
 * ditampilkan di UI dan hanya dipakai sebagai jembatan ke Supabase Auth.
 *
 * PENTING (lihat README bagian Auth): mapping username -> email/uid dikelola
 * lewat tabel `profiles` (unique constraint pada `username`), sehingga proses
 * signup/reset dapat divalidasi di server tanpa membocorkan email internal.
 */
function usernameToInternalEmail(username) {
  const normalized = String(username).trim().toLowerCase();
  return `${normalized}@${INTERNAL_DOMAIN}`;
}

export async function login(username, password) {
  const email = usernameToInternalEmail(username);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Pesan generik: jangan bocorkan apakah username ada atau tidak (mitigasi enumeration).
    throw new Error('Username atau kata sandi salah, atau akun sedang tidak aktif.');
  }
  return data;
}

export async function logout() {
  await recordAuditEvent('logout');
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentProfile() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, nama, role, opd_id, status, last_login_at')
    .eq('id', user.id)
    .is('deleted_at', null)
    .single();

  if (error) {
    console.error('[SIMBMD] Gagal memuat profil pengguna', error.message);
    return null;
  }
  return data;
}

export function onAuthStateChange(callback) {
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => sub.subscription.unsubscribe();
}

// Audit log ditulis lewat RPC SECURITY DEFINER agar user biasa tidak bisa
// memalsukan/menghapus baris audit secara langsung (lihat migration 0002).
async function recordAuditEvent(action, meta = {}) {
  try {
    await supabase.rpc('log_audit_event', {
      p_action: action,
      p_table_name: 'auth',
      p_record_id: null,
      p_old_data: null,
      p_new_data: meta,
    });
  } catch (e) {
    // Kegagalan audit tidak boleh menghentikan alur utama, cukup dicatat di konsol dev.
    console.warn('[SIMBMD] Audit log gagal dicatat:', e.message);
  }
}
