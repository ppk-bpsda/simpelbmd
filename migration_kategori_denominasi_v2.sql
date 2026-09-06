-- ==========================================================================
-- SIMPELBMD -- Migrasi v2: Sub-kategori Sepeda Motor & Kupon BBM Denominasi
-- Jalankan SEKALI di Supabase SQL Editor, SETELAH:
--   1. import_dpa_bpsda_2026.sql
--   2. migration_kategori_kendaraan.sql
--
-- LATAR BELAKANG (klarifikasi dari Anda):
--   - Tarif BBM ternyata BERBEDA di dalam kategori "Sepeda Motor" itu
--     sendiri: motor matic (Aerox/FreeGo) Rp200.000/bulan, motor
--     bebek/manual (Supra Fit/Vega) Rp100.000/bulan. Kategori mobil
--     sudah sesuai (Mitsubishi = Mobil Dinas Perorangan Rp1.500.000,
--     Luxio = Mobil Dinas Penumpang Rp500.000) -- tidak perlu diubah.
--   - Distribusi BBM memakai kupon fisik pecahan Rp100.000 & Rp25.000,
--     BUKAN dihitung dari volume liter x harga per liter (harga BBM
--     fluktuatif sehingga tidak praktis dipakai sebagai dasar hitung).
--
-- PERUBAHAN:
--   1. Kategori kendaraan dipecah: "Sepeda Motor" -> "Sepeda Motor Matic"
--      dan "Sepeda Motor Bebek/Manual". Kategori mobil tidak berubah.
--   2. Tarif per kategori TA 2026 diperbarui sesuai poin di atas.
--   3. Kolom `volume` pada fuel_coupons dibuat opsional (boleh kosong),
--      dan ditambah kolom `lembar_100000` & `lembar_25000` untuk mencatat
--      jumlah lembar kupon per pecahan (bukan nomor kupon per lembar).
-- ==========================================================================

-- 1. Perluas pilihan kategori kendaraan (motor dipecah jadi 2)
alter table vehicles drop constraint if exists vehicles_kategori_check;
alter table vehicles add constraint vehicles_kategori_check
  check (kategori in (
    'Sepeda Motor Matic', 'Sepeda Motor Bebek/Manual',
    'Mobil Dinas Perorangan', 'Mobil Dinas Penumpang'
  ) or kategori is null);

alter table vehicle_category_rates drop constraint if exists vehicle_category_rates_kategori_check;
alter table vehicle_category_rates add constraint vehicle_category_rates_kategori_check
  check (kategori in (
    'Sepeda Motor Matic', 'Sepeda Motor Bebek/Manual',
    'Mobil Dinas Perorangan', 'Mobil Dinas Penumpang'
  ));

-- Migrasi kendaraan yang sudah bernilai kategori lama 'Sepeda Motor'
-- (bila sudah pernah diimpor lewat import_kendaraan_BPSDA.xlsx) berdasarkan
-- merk -- Aerox/FreeGo = matic, Supra/Vega = bebek/manual.
update vehicles set kategori = 'Sepeda Motor Matic'
  where kategori = 'Sepeda Motor' and (merk ilike '%aerox%' or merk ilike '%freego%' or tipe ilike '%aerox%' or tipe ilike '%freego%');
update vehicles set kategori = 'Sepeda Motor Bebek/Manual'
  where kategori = 'Sepeda Motor' and (merk ilike '%supra%' or merk ilike '%vega%' or tipe ilike '%supra%' or tipe ilike '%vega%');
-- Sisa kendaraan berkategori 'Sepeda Motor' generik (jika ada, tidak cocok pola
-- di atas) dibiarkan apa adanya -- perlu ditentukan manual lewat Master Kendaraan.

-- 2. Ganti baris tarif TA 2026: hapus baris 'Sepeda Motor' lama, tambah 2 baris baru
delete from vehicle_category_rates where fiscal_year = 2026 and kategori = 'Sepeda Motor';

insert into vehicle_category_rates (fiscal_year, kategori, tarif_bulanan, account_id)
select 2026, 'Sepeda Motor Matic', 200000,
  (select id from accounts where kode = '5.1.02.03.002.00038')
where not exists (select 1 from vehicle_category_rates where fiscal_year = 2026 and kategori = 'Sepeda Motor Matic');

insert into vehicle_category_rates (fiscal_year, kategori, tarif_bulanan, account_id)
select 2026, 'Sepeda Motor Bebek/Manual', 100000,
  (select id from accounts where kode = '5.1.02.03.002.00038')
where not exists (select 1 from vehicle_category_rates where fiscal_year = 2026 and kategori = 'Sepeda Motor Bebek/Manual');

-- Kategori mobil TA 2026 sudah benar dari migration_kategori_kendaraan.sql
-- (Mobil Dinas Perorangan = Rp1.500.000, Mobil Dinas Penumpang = Rp500.000),
-- tidak perlu diubah -- disertakan di sini hanya sebagai jaga-jaga bila belum ada:
insert into vehicle_category_rates (fiscal_year, kategori, tarif_bulanan, account_id)
select 2026, 'Mobil Dinas Perorangan', 1500000,
  (select id from accounts where kode = '5.1.02.03.002.00035')
where not exists (select 1 from vehicle_category_rates where fiscal_year = 2026 and kategori = 'Mobil Dinas Perorangan');

insert into vehicle_category_rates (fiscal_year, kategori, tarif_bulanan, account_id)
select 2026, 'Mobil Dinas Penumpang', 500000,
  (select id from accounts where kode = '5.1.02.03.002.00035')
where not exists (select 1 from vehicle_category_rates where fiscal_year = 2026 and kategori = 'Mobil Dinas Penumpang');

-- 3. Kupon BBM: volume jadi opsional, tambah kolom pecahan kupon
alter table fuel_coupons alter column volume drop not null;
alter table fuel_coupons add column if not exists lembar_100000 int not null default 0;
alter table fuel_coupons add column if not exists lembar_25000 int not null default 0;
alter table fuel_coupons add constraint fuel_coupons_lembar_nonneg
  check (lembar_100000 >= 0 and lembar_25000 >= 0);

-- Selesai. Setelah ini jalankan `import_kendaraan_BPSDA_v2.sql` untuk mengoreksi
-- data 10 kendaraan sesuai KIB (kategori matic/bebek yang benar per unit).
