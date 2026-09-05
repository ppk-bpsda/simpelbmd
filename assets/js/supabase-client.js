/* ==========================================================================
   SIMPELBMD — Supabase client & auth helpers
   Ganti SUPABASE_URL dan SUPABASE_ANON_KEY dengan milik project Anda.
   Anon key AMAN untuk ditaruh di frontend selama Row Level Security (RLS)
   sudah diaktifkan pada semua tabel (lihat supabase_schema.sql).
   ========================================================================== */

const SUPABASE_URL = "https://srbodvzjspkozdgpmlby.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNyYm9kdnpqc3Brb3pkZ3BtbGJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1NDkxNzYsImV4cCI6MjEwNDEyNTE3Nn0.ytze246lI0mIezYDBKAszXmc0D11QG580zQfgCXsQ0Y";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* Karena aplikasi ini login dengan USERNAME (bukan email, sesuai Bab 4 & 38
   master prompt), kita simpan mapping username -> email internal di tabel
   `users`. Alur login:
     1. Cari email berdasarkan username pada tabel public.users
     2. signInWithPassword menggunakan email internal tsb
   Email internal tidak pernah ditampilkan ke operator. */

async function loginWithUsername(username, password) {
  const { data: profile, error: lookupError } = await sb
    .from("users")
    .select("id, email, full_name, role, is_active")
    .eq("username", username)
    .maybeSingle();

  if (lookupError) throw new Error("Tidak dapat menghubungi server. Coba lagi.");
  if (!profile) throw new Error("Username atau password salah.");
  if (!profile.is_active) throw new Error("Akun Anda dinonaktifkan. Hubungi administrator.");

  const { data, error } = await sb.auth.signInWithPassword({
    email: profile.email,
    password,
  });
  if (error) throw new Error("Username atau password salah.");

  await sb.from("audit_logs").insert({
    activity: "LOGIN",
    table_name: "users",
    record_id: profile.id,
    performed_by: profile.id,
  });

  return { session: data.session, profile };
}

async function logout() {
  const { data: userData } = await sb.auth.getUser();
  if (userData?.user) {
    await sb.from("audit_logs").insert({
      activity: "LOGOUT",
      table_name: "users",
      record_id: userData.user.id,
      performed_by: userData.user.id,
    });
  }
  await sb.auth.signOut();
  window.location.href = "index.html";
}

async function getCurrentProfile() {
  const { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) return null;
  const { data: profile } = await sb
    .from("users")
    .select("id, username, full_name, role, is_active")
    .eq("id", sessionData.session.user.id)
    .maybeSingle();
  return profile || null;
}

/* Panggil di setiap halaman selain index.html untuk memastikan user sudah login. */
async function requireAuth() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active) {
    window.location.href = "index.html";
    return null;
  }
  return profile;
}

window.SIMPELBMD = { sb, loginWithUsername, logout, getCurrentProfile, requireAuth };
