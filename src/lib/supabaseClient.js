import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Jangan pernah membocorkan detail teknis ke UI produksi; ini hanya log konsol dev.
  console.error(
    '[SIMPELBMD] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diset. Salin .env.example ke .env.local.'
  );
}

// Hanya anon key yang boleh berada di sini. service_role key TIDAK PERNAH dipakai di frontend.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
