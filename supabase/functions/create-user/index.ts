// supabase/functions/create-user/index.ts
//
// Kontrak: lihat supabase/functions/README.md.
// Dipanggil dari Administrasi > User (super_admin saja) untuk membuat akun
// baru dengan identitas USERNAME, bukan email. Jalan dengan
// SUPABASE_SERVICE_ROLE_KEY (auto-tersedia sebagai env var runtime Edge
// Function) — kunci ini TIDAK PERNAH ada di frontend/browser.
//
// Deploy: supabase functions deploy create-user
// Env tambahan (opsional): supabase secrets set AUTH_INTERNAL_DOMAIN=simbmd.local

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const VALID_ROLES = ['super_admin', 'admin_opd', 'operator', 'viewer'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method tidak diizinkan.' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const AUTH_INTERNAL_DOMAIN = Deno.env.get('AUTH_INTERNAL_DOMAIN') || 'simbmd.local';

    // 1. Verifikasi identitas caller lewat token JWT-nya sendiri (bukan service role).
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return jsonResponse({ error: 'Unauthorized: token tidak ditemukan.' }, 401);

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerAuth, error: callerAuthErr } = await callerClient.auth.getUser(token);
    if (callerAuthErr || !callerAuth?.user) {
      return jsonResponse({ error: 'Unauthorized: sesi tidak valid atau kedaluwarsa.' }, 401);
    }

    // 2. Client admin (service role) — HANYA dipakai di server ini, bypass RLS.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 3. Caller WAJIB super_admin.
    const { data: callerProfile, error: callerProfileErr } = await admin
      .from('profiles')
      .select('role')
      .eq('id', callerAuth.user.id)
      .maybeSingle();
    if (callerProfileErr || callerProfile?.role !== 'super_admin') {
      return jsonResponse({ error: 'Hanya Super Admin yang dapat membuat pengguna baru.' }, 403);
    }

    // 4. Validasi payload.
    const body = await req.json().catch(() => ({}));
    const { username, password, nama, role, opd_id: opdId } = body;

    if (!username || !password || !nama || !role) {
      return jsonResponse({ error: 'username, password, nama, dan role wajib diisi.' }, 400);
    }
    if (!VALID_ROLES.includes(role)) {
      return jsonResponse({ error: 'Role tidak valid.' }, 400);
    }
    if (role !== 'super_admin' && !opdId) {
      return jsonResponse({ error: 'OPD wajib dipilih untuk role selain Super Admin.' }, 400);
    }
    if (String(password).length < 8) {
      return jsonResponse({ error: 'Password minimal 8 karakter.' }, 400);
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(normalizedUsername)) {
      return jsonResponse({ error: 'Username hanya boleh huruf kecil, angka, titik, underscore, atau strip.' }, 400);
    }

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();
    if (existingProfile) {
      return jsonResponse({ error: 'Username sudah dipakai. Gunakan username lain.' }, 409);
    }

    const email = `${normalizedUsername}@${AUTH_INTERNAL_DOMAIN}`;

    // 5. Buat user di Supabase Auth (auto-confirm, karena tidak ada alur email nyata).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return jsonResponse({ error: `Gagal membuat akun: ${createErr?.message || 'unknown error'}` }, 500);
    }

    // 6. Insert baris profiles. Kalau gagal, rollback auth user supaya tidak ada akun "yatim".
    const { error: insertErr } = await admin.from('profiles').insert({
      id: created.user.id,
      username: normalizedUsername,
      nama,
      role,
      opd_id: role === 'super_admin' ? null : opdId,
      status: 'aktif',
    });
    if (insertErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: `Gagal menyimpan profil pengguna: ${insertErr.message}` }, 500);
    }

    // 7. Catat ke audit_logs lewat RPC yang sudah ada (SECURITY DEFINER).
    await admin.rpc('log_audit_event', {
      p_action: 'create_user',
      p_table_name: 'profiles',
      p_record_id: created.user.id,
      p_old_data: null,
      p_new_data: { username: normalizedUsername, nama, role, opd_id: opdId || null, created_by: callerAuth.user.id },
    });

    return jsonResponse({ success: true, userId: created.user.id, username: normalizedUsername });
  } catch (err) {
    return jsonResponse({ error: `Terjadi kesalahan tak terduga: ${err.message}` }, 500);
  }
});
