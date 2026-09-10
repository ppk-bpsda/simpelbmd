// supabase/functions/reset-user-password/index.ts
//
// Dipanggil dari Administrasi > User (super_admin saja) untuk mereset
// password pengguna lain. Karena login memakai username -> email sintetik,
// tidak ada alur "lupa password via email" yang natural untuk user biasa —
// jadi reset dilakukan oleh Super Admin lewat Admin API (service role).
//
// Deploy: supabase functions deploy reset-user-password

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method tidak diizinkan.' }, 405);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: callerProfile, error: callerProfileErr } = await admin
      .from('profiles')
      .select('role')
      .eq('id', callerAuth.user.id)
      .maybeSingle();
    if (callerProfileErr || callerProfile?.role !== 'super_admin') {
      return jsonResponse({ error: 'Hanya Super Admin yang dapat mereset password pengguna.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { targetUserId, newPassword } = body;

    if (!targetUserId || !newPassword) {
      return jsonResponse({ error: 'targetUserId dan newPassword wajib diisi.' }, 400);
    }
    if (String(newPassword).length < 8) {
      return jsonResponse({ error: 'Password minimal 8 karakter.' }, 400);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(targetUserId, { password: newPassword });
    if (updateErr) {
      return jsonResponse({ error: `Gagal mereset password: ${updateErr.message}` }, 500);
    }

    await admin.rpc('log_audit_event', {
      p_action: 'reset_password',
      p_table_name: 'profiles',
      p_record_id: targetUserId,
      p_old_data: null,
      p_new_data: { reset_by: callerAuth.user.id },
    });

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ error: `Terjadi kesalahan tak terduga: ${err.message}` }, 500);
  }
});
