-- =========================================================
-- SIMPELBMD — 0001_schema.sql
-- Skema inti dibangun lengkap dari awal (mencakup kebutuhan
-- Phase 1-8) agar modul berikutnya tidak memerlukan perubahan
-- struktural besar. Lihat docs/ARSITEKTUR.md untuk ERD.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- Util: trigger function untuk kolom updated_at
-- ---------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- 1. OPD
-- =========================================================
create table opd (
  id uuid primary key default gen_random_uuid(),
  kode_opd text not null unique,
  nama_opd text not null,
  status text not null default 'aktif' check (status in ('aktif','nonaktif')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
);
create trigger trg_opd_updated_at before update on opd
  for each row execute function set_updated_at();

-- =========================================================
-- 2. TAHUN ANGGARAN
-- =========================================================
create table tahun_anggaran (
  id uuid primary key default gen_random_uuid(),
  tahun int not null unique check (tahun between 2000 and 2100),
  status_aktif boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
);
create trigger trg_ta_updated_at before update on tahun_anggaran
  for each row execute function set_updated_at();
-- Hanya boleh ada satu Tahun Anggaran aktif pada satu waktu.
create unique index one_active_tahun_anggaran on tahun_anggaran ((status_aktif)) where status_aktif;

-- =========================================================
-- 3. PROFILES (mapping ke auth.users, menyimpan username & role)
-- =========================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  nama text not null,
  role text not null check (role in ('super_admin','admin_opd','operator','viewer')),
  opd_id uuid references opd(id),
  status text not null default 'aktif' check (status in ('aktif','nonaktif')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  constraint chk_opd_scope check (
    (role = 'super_admin') or (opd_id is not null)
  )
);
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create index idx_profiles_opd on profiles(opd_id);

-- =========================================================
-- 4. KEGIATAN / SUB KEGIATAN / BELANJA (struktur DPA)
-- =========================================================
create table kegiatan (
  id uuid primary key default gen_random_uuid(),
  tahun_anggaran_id uuid not null references tahun_anggaran(id),
  opd_id uuid not null references opd(id),
  kode_kegiatan text not null,
  nama_kegiatan text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  unique (tahun_anggaran_id, opd_id, kode_kegiatan)
);
create trigger trg_kegiatan_updated_at before update on kegiatan
  for each row execute function set_updated_at();
create index idx_kegiatan_ta on kegiatan(tahun_anggaran_id);
create index idx_kegiatan_opd on kegiatan(opd_id);

create table sub_kegiatan (
  id uuid primary key default gen_random_uuid(),
  kegiatan_id uuid not null references kegiatan(id),
  kode_sub_kegiatan text not null,
  nama_sub_kegiatan text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  unique (kegiatan_id, kode_sub_kegiatan)
);
create trigger trg_subkegiatan_updated_at before update on sub_kegiatan
  for each row execute function set_updated_at();
create index idx_subkegiatan_kegiatan on sub_kegiatan(kegiatan_id);

create table belanja (
  id uuid primary key default gen_random_uuid(),
  sub_kegiatan_id uuid not null references sub_kegiatan(id),
  kode_rekening text not null,
  nama_belanja text not null,
  -- Kelompok dipakai untuk agregasi dashboard (§4 dashboard jenis belanja).
  kelompok text not null check (kelompok in ('pajak_perijinan','pemeliharaan','bbm','lainnya')),
  pagu numeric(18,2) not null default 0 check (pagu >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  unique (sub_kegiatan_id, kode_rekening)
);
create trigger trg_belanja_updated_at before update on belanja
  for each row execute function set_updated_at();
create index idx_belanja_subkegiatan on belanja(sub_kegiatan_id);
create index idx_belanja_kelompok on belanja(kelompok);

-- =========================================================
-- 5. KIB (kendaraan & peralatan/aset dalam satu registry aset)
-- =========================================================
create table kib (
  id uuid primary key default gen_random_uuid(),
  tahun_anggaran_id uuid not null references tahun_anggaran(id),
  opd_id uuid not null references opd(id),
  kategori text not null check (kategori in ('kendaraan','peralatan','aset_lainnya')),
  kode_barang text,
  register text,
  nama_barang text not null,
  merk text,
  type text,
  spesifikasi text,
  tahun_perolehan int,
  jumlah numeric(12,2) not null default 1 check (jumlah >= 0),
  satuan text,
  harga_satuan numeric(18,2),
  nilai_perolehan numeric(18,2),
  kondisi text check (kondisi in ('baik','rusak_ringan','rusak_berat')),
  lokasi text,
  pengguna text,
  keterangan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
);
create trigger trg_kib_updated_at before update on kib
  for each row execute function set_updated_at();
create index idx_kib_ta on kib(tahun_anggaran_id);
create index idx_kib_opd on kib(opd_id);
create index idx_kib_kategori on kib(kategori);
create unique index uq_kib_register on kib(tahun_anggaran_id, opd_id, register)
  where register is not null and deleted_at is null;

-- =========================================================
-- 6. KENDARAAN (spesialisasi KIB kategori 'kendaraan')
-- =========================================================
create table kendaraan (
  id uuid primary key default gen_random_uuid(),
  kib_id uuid not null unique references kib(id),
  nopol text not null,
  nomor_rangka text,
  nomor_mesin text,
  nomor_bpkb text,
  jenis_kendaraan text,
  status text not null default 'aktif' check (status in ('aktif','nonaktif','dihapus')),
  penanggung_jawab text,
  unit_kerja text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
);
create trigger trg_kendaraan_updated_at before update on kendaraan
  for each row execute function set_updated_at();
create unique index uq_kendaraan_nopol on kendaraan(nopol) where deleted_at is null;
create unique index uq_kendaraan_rangka on kendaraan(nomor_rangka) where nomor_rangka is not null and deleted_at is null;
create unique index uq_kendaraan_mesin on kendaraan(nomor_mesin) where nomor_mesin is not null and deleted_at is null;
create index idx_kendaraan_kib on kendaraan(kib_id);

-- =========================================================
-- 7. PAJAK / PERIJINAN
-- =========================================================
create table pajak_perijinan (
  id uuid primary key default gen_random_uuid(),
  kendaraan_id uuid not null references kendaraan(id),
  belanja_id uuid references belanja(id),
  tahun_anggaran_id uuid not null references tahun_anggaran(id),
  tanggal date not null,
  jenis text not null check (jenis in ('pajak_stnk','pajak_kendaraan','kir','izin_trayek','perijinan_lainnya')),
  nomor_dokumen text,
  masa_berlaku date,
  nilai numeric(18,2) not null default 0 check (nilai >= 0),
  sumber_anggaran text,
  keterangan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
);
create trigger trg_pajak_updated_at before update on pajak_perijinan
  for each row execute function set_updated_at();
create index idx_pajak_kendaraan on pajak_perijinan(kendaraan_id);
create index idx_pajak_ta on pajak_perijinan(tahun_anggaran_id);
create index idx_pajak_masaberlaku on pajak_perijinan(masa_berlaku);

-- =========================================================
-- 8. PEMELIHARAAN
-- =========================================================
create table pemeliharaan (
  id uuid primary key default gen_random_uuid(),
  kendaraan_id uuid not null references kendaraan(id),
  belanja_id uuid references belanja(id),
  tahun_anggaran_id uuid not null references tahun_anggaran(id),
  tanggal date not null,
  jenis text not null check (jenis in ('servis_rutin','oli','ban','aki','mesin','rem','kelistrikan','body','ac','lainnya')),
  bengkel text,
  nomor_dokumen text,
  uraian text,
  sparepart numeric(18,2) not null default 0 check (sparepart >= 0),
  jasa numeric(18,2) not null default 0 check (jasa >= 0),
  nilai numeric(18,2) generated always as (sparepart + jasa) stored,
  kilometer int,
  keterangan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
);
create trigger trg_pemeliharaan_updated_at before update on pemeliharaan
  for each row execute function set_updated_at();
create index idx_pemeliharaan_kendaraan on pemeliharaan(kendaraan_id);
create index idx_pemeliharaan_ta on pemeliharaan(tahun_anggaran_id);

-- =========================================================
-- 9. BBM / KUPON BBM
-- =========================================================
create table bbm (
  id uuid primary key default gen_random_uuid(),
  kendaraan_id uuid not null references kendaraan(id),
  belanja_id uuid references belanja(id),
  tahun_anggaran_id uuid not null references tahun_anggaran(id),
  tanggal date not null,
  jenis_bbm text not null check (jenis_bbm in ('pertalite','pertamax','solar','dexlite','lainnya')),
  nomor_kupon text,
  liter numeric(10,2) not null check (liter > 0),
  harga_per_liter numeric(18,2) not null check (harga_per_liter >= 0),
  nilai numeric(18,2) generated always as (liter * harga_per_liter) stored,
  kilometer_awal int,
  kilometer_akhir int,
  jarak_tempuh int generated always as (
    case when kilometer_akhir is not null and kilometer_awal is not null
      then kilometer_akhir - kilometer_awal
      else null end
  ) stored,
  pengemudi text,
  keterangan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  constraint chk_bbm_km check (kilometer_akhir is null or kilometer_awal is null or kilometer_akhir >= kilometer_awal)
);
create trigger trg_bbm_updated_at before update on bbm
  for each row execute function set_updated_at();
create index idx_bbm_kendaraan on bbm(kendaraan_id);
create index idx_bbm_ta on bbm(tahun_anggaran_id);
create unique index uq_bbm_kupon on bbm(nomor_kupon) where nomor_kupon is not null and deleted_at is null;

-- =========================================================
-- 10. DOKUMEN (lampiran polymorphic ke berbagai tabel transaksi)
-- =========================================================
create table dokumen (
  id uuid primary key default gen_random_uuid(),
  jenis text not null,
  file_path text not null,
  table_name text not null,
  record_id uuid not null,
  opd_id uuid references opd(id),
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
);
create index idx_dokumen_ref on dokumen(table_name, record_id);
create index idx_dokumen_opd on dokumen(opd_id);

-- =========================================================
-- 11. AUDIT LOG (tidak boleh mudah dihapus, lihat 0002 untuk RLS)
-- =========================================================
create table audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id),
  action text not null,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_audit_user on audit_logs(user_id);
create index idx_audit_table on audit_logs(table_name, record_id);
create index idx_audit_created on audit_logs(created_at);

-- =========================================================
-- 12. IMPORT LOGS (riwayat import DPA / KIB, §8-9)
-- =========================================================
create table import_logs (
  id uuid primary key default gen_random_uuid(),
  tahun_anggaran_id uuid references tahun_anggaran(id),
  opd_id uuid references opd(id),
  jenis text not null check (jenis in ('dpa','kib')),
  file_name text,
  total_baris int not null default 0,
  baru int not null default 0,
  diperbarui int not null default 0,
  tidak_berubah int not null default 0,
  error int not null default 0,
  duplikat int not null default 0,
  detail jsonb,
  imported_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_importlogs_ta on import_logs(tahun_anggaran_id);

-- =========================================================
-- 13. VIEWS untuk dashboard (perhitungan terpusat di DB, §26)
-- =========================================================

-- Realisasi gabungan (pajak + pemeliharaan + bbm), dikaitkan ke belanja utk kelompok.
create or replace view v_realisasi_transaksi as
  select belanja_id, tahun_anggaran_id, nilai, tanggal, 'pajak_perijinan'::text as sumber
    from pajak_perijinan where deleted_at is null
  union all
  select belanja_id, tahun_anggaran_id, nilai, tanggal, 'pemeliharaan'::text as sumber
    from pemeliharaan where deleted_at is null
  union all
  select belanja_id, tahun_anggaran_id, nilai, tanggal, 'bbm'::text as sumber
    from bbm where deleted_at is null;

create or replace view v_ringkasan_anggaran as
  select
    ta.id as tahun_anggaran_id,
    coalesce(sum(b.pagu), 0) as total_pagu,
    coalesce((select sum(r.nilai) from v_realisasi_transaksi r where r.tahun_anggaran_id = ta.id), 0) as total_realisasi,
    coalesce(sum(b.pagu), 0) - coalesce((select sum(r.nilai) from v_realisasi_transaksi r where r.tahun_anggaran_id = ta.id), 0) as total_sisa,
    case when coalesce(sum(b.pagu), 0) = 0 then 0
      else round(
        coalesce((select sum(r.nilai) from v_realisasi_transaksi r where r.tahun_anggaran_id = ta.id), 0)
        / sum(b.pagu) * 100, 2)
    end as persentase_realisasi
  from tahun_anggaran ta
  left join kegiatan k on k.tahun_anggaran_id = ta.id and k.deleted_at is null
  left join sub_kegiatan sk on sk.kegiatan_id = k.id and sk.deleted_at is null
  left join belanja b on b.sub_kegiatan_id = sk.id and b.deleted_at is null
  where ta.deleted_at is null
  group by ta.id;

create or replace view v_realisasi_per_belanja as
  select
    ta.id as tahun_anggaran_id,
    b.id as belanja_id,
    b.kelompok,
    b.pagu,
    coalesce((select sum(r.nilai) from v_realisasi_transaksi r
                where r.belanja_id = b.id) , 0) as realisasi_per_belanja
  from tahun_anggaran ta
  join kegiatan k on k.tahun_anggaran_id = ta.id and k.deleted_at is null
  join sub_kegiatan sk on sk.kegiatan_id = k.id and sk.deleted_at is null
  join belanja b on b.sub_kegiatan_id = sk.id and b.deleted_at is null
  where ta.deleted_at is null;

-- Agregasi per kelompok (pajak_perijinan / pemeliharaan / bbm / lainnya) — ini
-- yang dipanggil oleh dashboardService.js.
create or replace view v_ringkasan_jenis_belanja as
  select
    tahun_anggaran_id,
    kelompok,
    sum(pagu) as pagu,
    sum(realisasi_per_belanja) as realisasi,
    sum(pagu) - sum(realisasi_per_belanja) as sisa,
    case when sum(pagu) = 0 then 0 else round(sum(realisasi_per_belanja) / sum(pagu) * 100, 2) end as persentase
  from v_realisasi_per_belanja
  group by tahun_anggaran_id, kelompok;

create or replace view v_penyerapan_bulanan as
  select
    r.tahun_anggaran_id,
    extract(month from r.tanggal)::int as bulan,
    sum(r.nilai) as realisasi,
    (select total_pagu from v_ringkasan_anggaran ra where ra.tahun_anggaran_id = r.tahun_anggaran_id) as pagu
  from v_realisasi_transaksi r
  group by r.tahun_anggaran_id, extract(month from r.tanggal);

-- Rekap per kendaraan/Nopol (§16)
create or replace view v_rekap_per_kendaraan as
  select
    kd.id as kendaraan_id,
    kd.nopol,
    kb.opd_id,
    kb.tahun_anggaran_id,
    coalesce((select sum(p.nilai) from pajak_perijinan p where p.kendaraan_id = kd.id and p.deleted_at is null), 0) as total_pajak,
    coalesce((select sum(m.nilai) from pemeliharaan m where m.kendaraan_id = kd.id and m.deleted_at is null), 0) as total_pemeliharaan,
    coalesce((select sum(f.nilai) from bbm f where f.kendaraan_id = kd.id and f.deleted_at is null), 0) as total_bbm,
    coalesce((select count(f.id) from bbm f where f.kendaraan_id = kd.id and f.deleted_at is null), 0) as total_kupon
  from kendaraan kd
  join kib kb on kb.id = kd.kib_id
  where kd.deleted_at is null;
