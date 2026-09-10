// supabase/functions/create-user/index.ts
//
// Deploy: supabase functions deploy create-user
// Env yang dibutuhkan (di-set otomatis oleh Supabase saat deploy, atau via
// `supabase secrets set`): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// AUTH_INTERNAL_DOMAIN (opsional, default "simbmd.local").
//
// PENTING: SUPABASE_SERVICE_ROLE_KEY hanya boleh ada di lingkungan Edge
// Function ini (server-side). Tidak pernah dikirim ke, atau disimpan di,
// frontend/browser (§18, §24).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_ROLES = ['super_admin', 'admin_opd', 'operator', 'viewer'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Tidak terautentikasi.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const internalDomain = Deno.env.get('AUTH_INTERNAL_DOMAIN') || 'simbmd.local';

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: 'Sesi tidak valid.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, status')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profileErr || !callerProfile || callerProfile.role !== 'super_admin' || callerProfile.status !== 'aktif') {
      return jsonResponse({ error: 'Hanya Super Admin yang dapat membuat user baru.' }, 403);
    }

    const body = await req.json();
    const { username, password, nama, role, opd_id } = body || {};

    if (!username || !password || !nama || !role) {
      return jsonResponse({ error: 'Username, password, nama, dan role wajib diisi.' }, 400);
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return jsonResponse({ error: 'Role tidak valid.' }, 400);
    }
    if (role !== 'super_admin' && !opd_id) {
      return jsonResponse({ error: 'OPD wajib dipilih untuk role selain Super Admin.' }, 400);
    }
    if (String(password).length < 8) {
      return jsonResponse({ error: 'Kata sandi minimal 8 karakter.' }, 400);
    }

    const normalizedUsername = String(username).trim().toLowerCase();

    const { data: existing } = await adminClient
      .from('profiles')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();
    if (existing) {
      return jsonResponse({ error: 'Username sudah digunakan. Pilih username lain.' }, 409);
    }

    const internalEmail = `${normalizedUsername}@${internalDomain}`;

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      return jsonResponse({ error: 'Gagal membuat akun autentikasi: ' + (createErr?.message || 'unknown error') }, 500);
    }

    const { error: insertErr } = await adminClient.from('profiles').insert({
      id: created.user.id,
      username: normalizedUsername,
      nama,
      role,
      opd_id: role === 'super_admin' ? null : opd_id,
      status: 'aktif',
    });
    if (insertErr) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: 'Gagal menyimpan profil user: ' + insertErr.message }, 500);
    }

    await adminClient.from('audit_logs').insert({
      user_id: userData.user.id,
      action: 'create_user',
      table_name: 'profiles',
      record_id: created.user.id,
      old_data: null,
      new_data: { username: normalizedUsername, role, opd_id },
    });

    return jsonResponse({ id: created.user.id, username: normalizedUsername }, 201);
  } catch (err) {
    return jsonResponse({ error: 'Terjadi kesalahan internal: ' + err.message }, 500);
  }
});

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
