-- 0005_phase7_hardening.sql
-- Phase 7: security hardening.
--
-- Supabase Database Linter (lint 0010_security_definer_view) menandai 8 view
-- berikut sebagai ERROR karena dibuat tanpa `security_invoker`, sehingga
-- berjalan dengan hak akses PEMILIK view (bukan user yang query) — artinya
-- RLS pada tabel di baliknya berpotensi ter-bypass.
--
-- Fix: set `security_invoker = on` supaya view menghormati RLS & permission
-- dari role yang memanggilnya (biasanya `authenticated` lewat PostgREST),
-- bukan lagi permission pemilik view. Tidak perlu DROP/CREATE ulang.
--
-- CATATAN PENTING sebelum menjalankan migration ini di production:
-- setelah security_invoker=on, pastikan role `authenticated` benar-benar
-- punya izin SELECT (lewat RLS) ke seluruh tabel dasar view ini untuk semua
-- role aplikasi (super_admin/admin_opd/operator/viewer) — sudah dicek
-- konsisten dengan policy di 0002_rls_policies.sql per Sept 2026, tapi wajib
-- diuji ulang di staging sebelum apply ke production.

alter view v_realisasi_transaksi set (security_invoker = on);
alter view v_ringkasan_anggaran set (security_invoker = on);
alter view v_realisasi_per_belanja set (security_invoker = on);
alter view v_ringkasan_jenis_belanja set (security_invoker = on);
alter view v_penyerapan_bulanan set (security_invoker = on);
alter view v_rekap_per_kendaraan set (security_invoker = on);
alter view v_ringkasan_per_kegiatan set (security_invoker = on);
alter view v_realisasi_bulanan_kelompok set (security_invoker = on);
