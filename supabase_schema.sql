-- ==========================================================================
-- SIMPELBMD — Skema Database Supabase (PostgreSQL)
-- Sistem Manajemen Pemeliharaan & Barang Milik Daerah
-- Jalankan file ini di Supabase SQL Editor (Project > SQL Editor > New query)
-- ==========================================================================

create extension if not exists "uuid-ossp";

-- --------------------------------------------------------------------------
-- 0. ENUM TYPES
-- --------------------------------------------------------------------------
create type user_role as enum ('admin', 'operator');
create type budget_stage as enum ('murni', 'perubahan');
create type realization_status as enum ('draft', 'diverifikasi', 'disetujui', 'ditolak');
create type coupon_status as enum ('dibuat', 'didistribusikan', 'digunakan', 'direalisasikan', 'dibatalkan');
create type vehicle_status as enum ('aktif', 'pemeliharaan', 'rusak', 'tidak_digunakan', 'dihapuskan');
create type procurement_category as enum ('kendaraan', 'peralatan', 'mesin', 'perlengkapan', 'bmd_lainnya');
create type audit_activity as enum ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT');

-- --------------------------------------------------------------------------
-- 1. USERS  (username, bukan email, sesuai Bab 4 & 38)
--    id = auth.users.id (Supabase Auth). Email tetap disimpan sebagai
--    identitas internal untuk keperluan signIn, namun operator login
--    dengan username melalui frontend (lihat supabase-client.js).
-- --------------------------------------------------------------------------
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text unique not null,
  full_name text not null,
  role user_role not null default 'operator',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id)
);

-- --------------------------------------------------------------------------
-- 2. STRUKTUR ANGGARAN & ORGANISASI
-- --------------------------------------------------------------------------
create table fiscal_years (
  id uuid primary key default uuid_generate_v4(),
  year int unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table urusan (
  id uuid primary key default uuid_generate_v4(),
  kode text unique not null,
  nama text not null
);

create table organisasi (
  id uuid primary key default uuid_generate_v4(),
  urusan_id uuid references urusan(id),
  kode text unique not null,
  nama text not null
);

create table programs (
  id uuid primary key default uuid_generate_v4(),
  organisasi_id uuid references organisasi(id),
  kode text not null,
  nama text not null
);

create table activities (
  id uuid primary key default uuid_generate_v4(),
  program_id uuid references programs(id),
  kode text not null,
  nama text not null
);

create table subactivities (
  id uuid primary key default uuid_generate_v4(),
  activity_id uuid references activities(id),
  kode text not null,
  nama text not null
);

create table accounts ( -- Master Rekening
  id uuid primary key default uuid_generate_v4(),
  kode text unique not null,
  uraian text not null,
  jenis_belanja text,
  is_active boolean not null default true
);

create table vendors ( -- Master Penyedia
  id uuid primary key default uuid_generate_v4(),
  nama text not null,
  npwp text,
  alamat text,
  kontak text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table fuel_types ( -- Master Jenis BBM
  id uuid primary key default uuid_generate_v4(),
  nama text unique not null,
  satuan text not null default 'liter'
);

create table units ( -- Master Satuan
  id uuid primary key default uuid_generate_v4(),
  nama text unique not null
);

-- --------------------------------------------------------------------------
-- 3. DPA & RINCIAN (Bab 7)
-- --------------------------------------------------------------------------
create table dpa (
  id uuid primary key default uuid_generate_v4(),
  fiscal_year int not null references fiscal_years(year),
  stage budget_stage not null,
  nomor_dpa text not null,
  tanggal_penetapan date not null,
  organisasi_id uuid references organisasi(id),
  program_id uuid references programs(id),
  activity_id uuid references activities(id),
  subactivity_id uuid references subactivities(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz,
  deleted_by uuid references users(id),
  unique (fiscal_year, stage, nomor_dpa)
);

create table dpa_details (
  id uuid primary key default uuid_generate_v4(),
  dpa_id uuid not null references dpa(id) on delete cascade,
  account_id uuid not null references accounts(id),
  satuan text,
  volume numeric(18,2) not null default 0,
  harga_satuan numeric(18,2) not null default 0,
  -- Jumlah dihitung otomatis, TIDAK diinput manual (Bab 7 & 21)
  jumlah numeric(18,2) generated always as (volume * harga_satuan) stored,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz,
  deleted_by uuid references users(id)
);
create index idx_dpa_details_dpa on dpa_details(dpa_id);
create index idx_dpa_details_account on dpa_details(account_id);

-- --------------------------------------------------------------------------
-- 4. PENGADAAN BMD & BBM (Bab 8)
-- --------------------------------------------------------------------------
create table procurements (
  id uuid primary key default uuid_generate_v4(),
  nomor_pengadaan text not null,
  tanggal date not null,
  fiscal_year int not null references fiscal_years(year),
  stage budget_stage not null,
  account_id uuid references accounts(id),
  subactivity_id uuid references subactivities(id),
  category procurement_category not null,
  vendor_id uuid references vendors(id),
  nomor_kontrak text,
  tanggal_kontrak date,
  status text not null default 'proses',
  keterangan text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz,
  deleted_by uuid references users(id),
  unique (fiscal_year, nomor_pengadaan)
);

create table procurement_items (
  id uuid primary key default uuid_generate_v4(),
  procurement_id uuid not null references procurements(id) on delete cascade,
  nama_barang text not null,
  merk text,
  tipe text,
  spesifikasi text,
  jumlah numeric(18,2) not null default 0,
  satuan text,
  harga_satuan numeric(18,2) not null default 0,
  total numeric(18,2) generated always as (jumlah * harga_satuan) stored,
  created_at timestamptz not null default now()
);
create index idx_procurement_items_proc on procurement_items(procurement_id);

create table fuel_procurements ( -- Penyediaan BBM
  id uuid primary key default uuid_generate_v4(),
  nomor_pengadaan text not null,
  tanggal date not null,
  account_id uuid references accounts(id),
  fuel_type_id uuid references fuel_types(id),
  volume numeric(18,2) not null,
  harga numeric(18,2) not null,
  nilai numeric(18,2) generated always as (volume * harga) stored,
  vendor_id uuid references vendors(id),
  periode text,
  keterangan text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  deleted_at timestamptz
);

-- --------------------------------------------------------------------------
-- 5. ANGGARAN KAS (Bab 9)
-- --------------------------------------------------------------------------
create table budget_cash (
  id uuid primary key default uuid_generate_v4(),
  fiscal_year int not null references fiscal_years(year),
  stage budget_stage not null,
  bulan int not null check (bulan between 1 and 12),
  account_id uuid not null references accounts(id),
  uraian text,
  nilai numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz,
  unique (fiscal_year, stage, bulan, account_id)
);

-- --------------------------------------------------------------------------
-- 6. REALISASI (Bab 10) — satu sumber kebenaran perhitungan (Bab 21)
-- --------------------------------------------------------------------------
create table realization (
  id uuid primary key default uuid_generate_v4(),
  nomor_transaksi text not null,
  tanggal date not null,
  fiscal_year int not null references fiscal_years(year),
  stage budget_stage not null,
  account_id uuid not null references accounts(id),
  uraian text,
  nomor_spj text,
  nomor_bukti text,
  vendor_id uuid references vendors(id),
  nilai numeric(18,2) not null,
  jenis_belanja text,
  status realization_status not null default 'draft',
  keterangan text,
  -- Referensi opsional ke sumber transaksi agar dapat ditelusuri (Bab 44/52)
  source_type text, -- 'procurement' | 'maintenance_vehicle' | 'maintenance_equipment' | 'fuel' | null
  source_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references users(id),
  deleted_at timestamptz,
  deleted_by uuid references users(id),
  unique (fiscal_year, nomor_transaksi)
);
create index idx_realization_account on realization(account_id);
create index idx_realization_fy on realization(fiscal_year, stage);

create table attachments (
  id uuid primary key default uuid_generate_v4(),
  realization_id uuid references realization(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_size int,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references users(id)
);

-- --------------------------------------------------------------------------
-- 7. KENDARAAN, BBM, KUPON (Bab 11-13)
-- --------------------------------------------------------------------------
create table vehicles (
  id uuid primary key default uuid_generate_v4(),
  nomor_polisi text unique not null,
  merk text,
  tipe text,
  tahun int,
  jenis_kendaraan text,
  fuel_type_id uuid references fuel_types(id),
  kapasitas_mesin text,
  unit_pengguna text,
  penanggung_jawab text,
  status vehicle_status not null default 'aktif',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table fuel_coupons (
  id uuid primary key default uuid_generate_v4(),
  nomor_kupon text unique not null,
  tanggal date not null,
  vehicle_id uuid not null references vehicles(id),
  fuel_type_id uuid references fuel_types(id),
  volume numeric(18,2) not null,
  nilai numeric(18,2) not null default 0,
  petugas text,
  kilometer_awal numeric(12,2),
  kilometer_akhir numeric(12,2),
  status coupon_status not null default 'dibuat',
  keterangan text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now(),
  -- Soft delete wajib (Bab 13) — kupon terealisasi tidak boleh dihapus permanen
  deleted_at timestamptz,
  deleted_by uuid references users(id)
);
create index idx_fuel_coupons_vehicle on fuel_coupons(vehicle_id);

-- --------------------------------------------------------------------------
-- 8. PEMELIHARAAN KENDARAAN & PERALATAN (Bab 14-15)
-- --------------------------------------------------------------------------
create table maintenance_vehicle (
  id uuid primary key default uuid_generate_v4(),
  nomor_transaksi text not null,
  tanggal date not null,
  vehicle_id uuid not null references vehicles(id),
  kilometer numeric(12,2),
  jenis_pemeliharaan text not null,
  jenis_pekerjaan text,
  suku_cadang text,
  jasa numeric(18,2) default 0,
  volume numeric(18,2) default 1,
  satuan text,
  harga numeric(18,2) default 0,
  total numeric(18,2) generated always as (volume * harga + coalesce(jasa,0)) stored,
  vendor_id uuid references vendors(id),
  nomor_nota text,
  nomor_spk text,
  account_id uuid references accounts(id),
  realization_id uuid references realization(id),
  keterangan text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  deleted_at timestamptz,
  deleted_by uuid references users(id)
);
create index idx_maint_vehicle_vehicle on maintenance_vehicle(vehicle_id);

create table equipment ( -- Master Peralatan
  id uuid primary key default uuid_generate_v4(),
  nomor_aset text unique not null,
  nama text not null,
  merk text,
  tipe text,
  tahun int,
  lokasi text,
  kondisi text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table maintenance_equipment (
  id uuid primary key default uuid_generate_v4(),
  nomor_transaksi text not null,
  equipment_id uuid not null references equipment(id),
  tanggal date not null,
  jenis_pekerjaan text,
  vendor_id uuid references vendors(id),
  biaya numeric(18,2) default 0,
  account_id uuid references accounts(id),
  realization_id uuid references realization(id),
  keterangan text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  deleted_at timestamptz
);
create index idx_maint_equipment_equipment on maintenance_equipment(equipment_id);

-- --------------------------------------------------------------------------
-- 9. AUDIT TRAIL (Bab 23)
-- --------------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default uuid_generate_v4(),
  activity audit_activity not null,
  table_name text,
  record_id uuid,
  data_before jsonb,
  data_after jsonb,
  performed_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index idx_audit_logs_table on audit_logs(table_name, record_id);

-- ==========================================================================
-- 10. VIEWS UNTUK PERHITUNGAN — satu sumber kebenaran (Bab 21)
-- ==========================================================================
create or replace view v_dpa_pagu
with (security_invoker = on) as
select
  d.fiscal_year, d.stage, dd.account_id,
  sum(dd.jumlah) as pagu
from dpa d
join dpa_details dd on dd.dpa_id = d.id and dd.deleted_at is null
where d.deleted_at is null and d.is_active = true
group by d.fiscal_year, d.stage, dd.account_id;

create or replace view v_realisasi_per_rekening
with (security_invoker = on) as
select
  fiscal_year, stage, account_id,
  sum(nilai) filter (where status = 'disetujui') as total_realisasi
from realization
where deleted_at is null
group by fiscal_year, stage, account_id;

create or replace view v_anggaran_vs_realisasi
with (security_invoker = on) as
select
  p.fiscal_year, p.stage, p.account_id, a.kode, a.uraian,
  p.pagu,
  coalesce(r.total_realisasi, 0) as realisasi,
  p.pagu - coalesce(r.total_realisasi, 0) as sisa,
  case when p.pagu > 0 then round(coalesce(r.total_realisasi,0) / p.pagu * 100, 2) else 0 end as persen_realisasi
from v_dpa_pagu p
left join v_realisasi_per_rekening r
  on r.fiscal_year = p.fiscal_year and r.stage = p.stage and r.account_id = p.account_id
join accounts a on a.id = p.account_id;

create or replace view v_anggaran_kas_vs_realisasi
with (security_invoker = on) as
select
  bc.fiscal_year, bc.stage, bc.bulan, bc.account_id,
  bc.nilai as anggaran_kas,
  coalesce(sum(r.nilai) filter (where r.status = 'disetujui' and extract(month from r.tanggal) = bc.bulan), 0) as realisasi
from budget_cash bc
left join realization r
  on r.fiscal_year = bc.fiscal_year and r.stage = bc.stage and r.account_id = bc.account_id and r.deleted_at is null
where bc.deleted_at is null
group by bc.fiscal_year, bc.stage, bc.bulan, bc.account_id, bc.nilai;

create or replace view v_bbm_per_kendaraan
with (security_invoker = on) as
select
  vehicle_id,
  sum(volume) filter (where status in ('digunakan','direalisasikan')) as total_volume,
  sum(nilai) filter (where status in ('digunakan','direalisasikan')) as total_nilai,
  count(*) as jumlah_kupon
from fuel_coupons
where deleted_at is null
group by vehicle_id;

create or replace view v_pemeliharaan_per_kendaraan
with (security_invoker = on) as
select vehicle_id, count(*) as jumlah_transaksi, sum(total) as total_biaya
from maintenance_vehicle
where deleted_at is null
group by vehicle_id;

-- ==========================================================================
-- 11. ROW LEVEL SECURITY
-- ==========================================================================
alter table users enable row level security;
alter table fiscal_years enable row level security;
alter table urusan enable row level security;
alter table organisasi enable row level security;
alter table programs enable row level security;
alter table activities enable row level security;
alter table subactivities enable row level security;
alter table accounts enable row level security;
alter table vendors enable row level security;
alter table fuel_types enable row level security;
alter table units enable row level security;
alter table dpa enable row level security;
alter table dpa_details enable row level security;
alter table procurements enable row level security;
alter table procurement_items enable row level security;
alter table fuel_procurements enable row level security;
alter table budget_cash enable row level security;
alter table realization enable row level security;
alter table attachments enable row level security;
alter table vehicles enable row level security;
alter table fuel_coupons enable row level security;
alter table maintenance_vehicle enable row level security;
alter table equipment enable row level security;
alter table maintenance_equipment enable row level security;
alter table audit_logs enable row level security;

-- Helper: cek role user yang sedang login
create or replace function is_admin() returns boolean as $$
  select exists (select 1 from users where id = auth.uid() and role = 'admin' and is_active = true);
$$ language sql security definer stable;

create or replace function is_active_user() returns boolean as $$
  select exists (select 1 from users where id = auth.uid() and is_active = true);
$$ language sql security definer stable;

-- Users: setiap orang bisa membaca daftar user aktif (untuk lookup username saat
-- login) tetapi hanya admin yang boleh mengubah/menghapus/menambah.
create policy users_select on users for select using (true);
create policy users_admin_write on users for insert with check (is_admin());
create policy users_admin_update on users for update using (is_admin());
create policy users_self_update_password on users for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Master data: semua user aktif boleh baca; hanya admin boleh tulis (Bab 3 & 16)
do $$
declare t text;
begin
  for t in select unnest(array[
    'fiscal_years','urusan','organisasi','programs','activities','subactivities',
    'accounts','vendors','fuel_types','units','vehicles','equipment'
  ])
  loop
    execute format('create policy %I_read on %I for select using (is_active_user());', t, t);
    execute format('create policy %I_admin_write on %I for insert with check (is_admin());', t, t);
    execute format('create policy %I_admin_update on %I for update using (is_admin());', t, t);
    execute format('create policy %I_admin_delete on %I for delete using (is_admin());', t, t);
  end loop;
end $$;

-- Tabel transaksional: semua user aktif boleh baca & buat; update/delete
-- dibatasi (operator tidak boleh menghapus data penting tanpa otorisasi, Bab 3).
do $$
declare t text;
begin
  for t in select unnest(array[
    'dpa','dpa_details','procurements','procurement_items','fuel_procurements',
    'budget_cash','realization','attachments','fuel_coupons',
    'maintenance_vehicle','maintenance_equipment'
  ])
  loop
    execute format('create policy %I_read on %I for select using (is_active_user());', t, t);
    execute format('create policy %I_insert on %I for insert with check (is_active_user());', t, t);
    execute format('create policy %I_update on %I for update using (is_active_user());', t, t);
    execute format('create policy %I_admin_delete on %I for delete using (is_admin());', t, t);
  end loop;
end $$;

-- Audit logs: semua user aktif boleh menulis (untuk mencatat aktivitasnya
-- sendiri) dan membaca; hanya admin yang boleh melihat semua log jika ingin
-- dibatasi lebih lanjut, sesuaikan policy select di bawah.
create policy audit_logs_insert on audit_logs for insert with check (is_active_user());
create policy audit_logs_read on audit_logs for select using (is_admin());

-- ==========================================================================
-- 12. DATA AWAL (opsional) — jenis BBM, satuan dasar
-- ==========================================================================
insert into fuel_types (nama, satuan) values
  ('Pertalite', 'liter'), ('Pertamax', 'liter'), ('Solar', 'liter'), ('Dexlite', 'liter')
on conflict do nothing;

insert into units (nama) values ('Unit'), ('Buah'), ('Liter'), ('Paket'), ('Set')
on conflict do nothing;

insert into fiscal_years (year, is_active) values (2026, true), (2027, false)
on conflict do nothing;

-- ==========================================================================
-- CATATAN SETUP AKUN PERTAMA (dijalankan manual, bukan bagian file ini):
-- 1. Buat user via Supabase Auth (Dashboard > Authentication > Add user)
--    dengan email internal, misalnya admin@simpelbmd.local
-- 2. Insert baris pada tabel `users` dengan id yang SAMA dengan auth.users.id:
--    insert into users (id, username, email, full_name, role)
--    values ('<uuid-dari-auth-users>', 'admin', 'admin@simpelbmd.local', 'Administrator', 'admin');
-- ==========================================================================
