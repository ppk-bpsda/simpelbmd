-- ==========================================================================
-- SIMPELBMD -- Migrasi: Kategori Kendaraan & Aturan Tarif/Rekening BBM
-- Jalankan SEKALI di Supabase SQL Editor (setelah supabase_schema.sql).
--
-- Menambahkan:
--   1. Kolom `kategori` pada tabel vehicles (Sepeda Motor / Mobil Dinas
--      Perorangan / Mobil Dinas Penumpang) -- dipakai untuk menentukan
--      tarif kupon BBM bulanan dan rekening yang dikurangi pagunya.
--   2. Tabel `vehicle_category_rates`: tarif bulanan per kategori per
--      Tahun Anggaran, dan rekening Pemeliharaan yang terkait, sehingga
--      aturan bisa berbeda tiap tahun tanpa mengubah kode aplikasi.
--   3. Data awal TA 2026 sesuai ketentuan:
--        - Sepeda Motor               = Rp200.000 / motor / bulan
--        - Mobil Dinas Perorangan     = Rp1.500.000 / mobil / bulan
--        - Mobil Dinas Penumpang      = Rp500.000 / mobil / bulan
--      Pengadaan BBM mengurangi pagu rekening Pemeliharaan Alat Angkutan
--      sesuai kategori. Khusus TA 2026, kategori "Mobil Dinas Penumpang"
--      digabung ke rekening yang sama dengan "Mobil Dinas Perorangan"
--      (5.1.02.03.002.00035), karena rekening terpisah untuk Kendaraan
--      Bermotor Penumpang tidak ada di DPA TA 2026.
-- ==========================================================================

-- 1. Kolom kategori pada vehicles
alter table vehicles add column if not exists kategori text
  check (kategori in ('Sepeda Motor', 'Mobil Dinas Perorangan', 'Mobil Dinas Penumpang') or kategori is null);

-- 2. Tabel aturan tarif & rekening per kategori per Tahun Anggaran
create table if not exists vehicle_category_rates (
  id uuid primary key default uuid_generate_v4(),
  fiscal_year int not null,
  kategori text not null check (kategori in ('Sepeda Motor', 'Mobil Dinas Perorangan', 'Mobil Dinas Penumpang')),
  tarif_bulanan numeric(18,2) not null default 0,
  account_id uuid references accounts(id),
  created_at timestamptz not null default now(),
  unique (fiscal_year, kategori)
);

alter table vehicle_category_rates enable row level security;
create policy vehicle_category_rates_read on vehicle_category_rates for select using (is_active_user());
create policy vehicle_category_rates_admin_write on vehicle_category_rates for insert with check (is_admin());
create policy vehicle_category_rates_admin_update on vehicle_category_rates for update using (is_admin());
create policy vehicle_category_rates_admin_delete on vehicle_category_rates for delete using (is_admin());

-- 3. Data awal TA 2026 (jalankan bagian ini SETELAH import_dpa_bpsda_2026.sql,
--    karena membutuhkan rekening 5.1.02.03.002.00035 dan 00038 sudah ada)
insert into vehicle_category_rates (fiscal_year, kategori, tarif_bulanan, account_id)
select 2026, 'Sepeda Motor', 200000,
  (select id from accounts where kode = '5.1.02.03.002.00038')
where not exists (select 1 from vehicle_category_rates where fiscal_year = 2026 and kategori = 'Sepeda Motor');

insert into vehicle_category_rates (fiscal_year, kategori, tarif_bulanan, account_id)
select 2026, 'Mobil Dinas Perorangan', 1500000,
  (select id from accounts where kode = '5.1.02.03.002.00035')
where not exists (select 1 from vehicle_category_rates where fiscal_year = 2026 and kategori = 'Mobil Dinas Perorangan');

-- Digabung ke rekening yang sama dengan Mobil Dinas Perorangan untuk TA 2026
insert into vehicle_category_rates (fiscal_year, kategori, tarif_bulanan, account_id)
select 2026, 'Mobil Dinas Penumpang', 500000,
  (select id from accounts where kode = '5.1.02.03.002.00035')
where not exists (select 1 from vehicle_category_rates where fiscal_year = 2026 and kategori = 'Mobil Dinas Penumpang');

-- Update kategori kendaraan yang sudah ada (opsional, jika kendaraan sudah
-- diimpor lebih dulu lewat import_kendaraan_BPSDA.xlsx tanpa kolom kategori)
-- Jalankan manual per kendaraan lewat menu Distribusi BBM > Master Kendaraan
-- bila tidak ingin menjalankan UPDATE massal berikut:
--
-- update vehicles set kategori = 'Sepeda Motor' where jenis_kendaraan ilike '%sepeda motor%';
-- update vehicles set kategori = 'Mobil Dinas Perorangan' where jenis_kendaraan ilike '%station wagon%';
-- update vehicles set kategori = 'Mobil Dinas Penumpang' where jenis_kendaraan ilike '%mini bus%';
