-- ==========================================================================
-- SIMPELBMD — Perbaikan: Security Definer View
-- Jalankan file ini SEKALI di Supabase SQL Editor jika Anda sudah pernah
-- menjalankan supabase_schema.sql sebelumnya (schema tersebut sudah
-- diperbarui juga, lihat catatan di bagian bawah file ini).
--
-- Penyebab: view yang dibuat lewat SQL Editor Supabase berjalan sebagai role
-- `postgres` (SECURITY DEFINER secara implisit), sehingga bisa melewati RLS
-- milik user yang sedang login. Perbaikan: set security_invoker = on agar
-- view mematuhi RLS dan hak akses user pemanggil, sesuai rekomendasi
-- Supabase Database Linter (0010_security_definer_view).
-- ==========================================================================

alter view v_dpa_pagu set (security_invoker = on);
alter view v_realisasi_per_rekening set (security_invoker = on);
alter view v_anggaran_vs_realisasi set (security_invoker = on);
alter view v_anggaran_kas_vs_realisasi set (security_invoker = on);
alter view v_bbm_per_kendaraan set (security_invoker = on);
alter view v_pemeliharaan_per_kendaraan set (security_invoker = on);

-- Verifikasi (opsional) — semua baris berikut harus menunjukkan "on":
-- select relname, reloptions from pg_class
-- where relname like 'v_%' and relkind = 'v';
