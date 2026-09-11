-- =========================================================
-- 0009: Pengadaan Kupon BBM + Penyerapan/Sisa Kupon
--
-- Latar belakang (diminta pengguna):
--   Pengadaan BBM per Tahun Anggaran dianggarkan dalam bentuk LEMBAR KUPON
--   (bukan cuma rupiah), terpisah per klasifikasi roda kendaraan, misal:
--     - Roda 4: 240 lembar kupon (Rp 24.000.000 = 240 x Rp 100.000)
--     - Roda 2: 672 lembar kupon (Rp 16.800.000 = 672 x Rp  25.000)
--   Nilai ini SELAIN tercatat sebagai Pagu (rupiah) pada rincian Belanja
--   (lihat migrasi 0008 / BBM_KODE_REKENING), quota lembar kupon per jenis
--   roda perlu dicatat secara eksplisit agar penyerapan & sisa KUPON
--   (bukan cuma rupiah) bisa disajikan secara transparan di dashboard
--   Monitoring BBM (§15/§26).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Tabel Pengadaan Kupon BBM
--    Satu baris = kuota lembar kupon utk 1 Tahun Anggaran + 1 OPD + 1 roda.
-- ---------------------------------------------------------
create table pengadaan_kupon_bbm (
  id uuid primary key default gen_random_uuid(),
  tahun_anggaran_id uuid not null references tahun_anggaran(id),
  opd_id uuid not null references opd(id),
  roda text not null check (roda in ('roda2', 'roda4')),
  jumlah_kupon int not null check (jumlah_kupon >= 0),
  nilai_per_kupon numeric(18,2) not null check (nilai_per_kupon >= 0),
  nilai_pengadaan numeric(18,2) generated always as (jumlah_kupon * nilai_per_kupon) stored,
  keterangan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  deleted_at timestamptz,
  deleted_by uuid,
  constraint chk_pengadaan_kupon_nominal check (
    (roda = 'roda4' and nilai_per_kupon = 100000) or
    (roda = 'roda2' and nilai_per_kupon = 25000)
  )
);

comment on table pengadaan_kupon_bbm is
  'Kuota/pengadaan lembar Kupon BBM per Tahun Anggaran + OPD + klasifikasi roda. Dipakai untuk menghitung penyerapan & sisa kupon (bukan cuma rupiah) di dashboard Monitoring BBM.';
comment on column pengadaan_kupon_bbm.jumlah_kupon is 'Jumlah lembar kupon yang diadakan/dianggarkan pada Tahun Anggaran ini.';
comment on column pengadaan_kupon_bbm.nilai_pengadaan is 'Nilai rupiah pengadaan = jumlah_kupon x nilai_per_kupon (mengikuti nominal tetap Kupon BBM, lihat 0008).';

create unique index uq_pengadaan_kupon_bbm on pengadaan_kupon_bbm (tahun_anggaran_id, opd_id, roda)
  where deleted_at is null;
create index idx_pengadaan_kupon_ta on pengadaan_kupon_bbm(tahun_anggaran_id);
create index idx_pengadaan_kupon_opd on pengadaan_kupon_bbm(opd_id);

create trigger trg_pengadaan_kupon_bbm_updated_at before update on pengadaan_kupon_bbm
  for each row execute function set_updated_at();

create trigger trg_audit_pengadaan_kupon_bbm after insert or update or delete on pengadaan_kupon_bbm
  for each row execute function audit_table_trigger();

-- ---------------------------------------------------------
-- 2. RLS — scoped per OPD, sama seperti tabel `dokumen`/`import_logs`
--    (opd_id tersimpan langsung di baris, bukan lewat join kendaraan).
-- ---------------------------------------------------------
alter table pengadaan_kupon_bbm enable row level security;

create policy pengadaan_kupon_bbm_select on pengadaan_kupon_bbm for select
  using (is_super_admin() or opd_id = current_user_opd());

create policy pengadaan_kupon_bbm_write on pengadaan_kupon_bbm for insert
  with check (can_manage_master() and (is_super_admin() or opd_id = current_user_opd()));

create policy pengadaan_kupon_bbm_update on pengadaan_kupon_bbm for update
  using (is_super_admin() or (can_manage_master() and opd_id = current_user_opd()));

-- Catatan: sama seperti tabel lain, tidak ada policy DELETE — penghapusan
-- dilakukan lewat UPDATE kolom deleted_at/deleted_by.

-- ---------------------------------------------------------
-- 3. View ringkasan penyerapan & sisa Kupon BBM
--    (pengadaan vs. terpakai, per Tahun Anggaran + OPD + roda).
-- ---------------------------------------------------------
create or replace view v_penyerapan_kupon_bbm as
  select
    p.id as pengadaan_id,
    p.tahun_anggaran_id,
    p.opd_id,
    p.roda,
    p.jumlah_kupon as kupon_pengadaan,
    p.nilai_per_kupon,
    p.nilai_pengadaan,
    coalesce(u.kupon_terpakai, 0) as kupon_terpakai,
    coalesce(u.nilai_terpakai, 0) as nilai_terpakai,
    p.jumlah_kupon - coalesce(u.kupon_terpakai, 0) as kupon_sisa,
    p.nilai_pengadaan - coalesce(u.nilai_terpakai, 0) as nilai_sisa,
    case when p.jumlah_kupon = 0 then 0
      else round(coalesce(u.kupon_terpakai, 0)::numeric / p.jumlah_kupon * 100, 2)
    end as persentase_terpakai
  from pengadaan_kupon_bbm p
  left join (
    select
      b.tahun_anggaran_id,
      kb.opd_id,
      b.roda_kendaraan as roda,
      sum(b.jumlah_kupon) as kupon_terpakai,
      sum(b.nilai) as nilai_terpakai
    from bbm b
    join kendaraan kd on kd.id = b.kendaraan_id
    join kib kb on kb.id = kd.kib_id
    where b.deleted_at is null
    group by b.tahun_anggaran_id, kb.opd_id, b.roda_kendaraan
  ) u on u.tahun_anggaran_id = p.tahun_anggaran_id
     and u.opd_id = p.opd_id
     and u.roda = p.roda
  where p.deleted_at is null;

comment on view v_penyerapan_kupon_bbm is
  'Ringkasan pengadaan vs. penyerapan (terpakai) vs. sisa Kupon BBM, per Tahun Anggaran + OPD + roda. Dipakai oleh dashboard Monitoring BBM.';

alter view v_penyerapan_kupon_bbm set (security_invoker = on);
