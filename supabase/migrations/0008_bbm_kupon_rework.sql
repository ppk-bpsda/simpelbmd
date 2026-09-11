-- =========================================================
-- 0008: Rework modul BBM / Kupon BBM
--
-- Perubahan bisnis (diminta pengguna):
--   1. "Nomor Kupon" (teks bebas per-lembar) diganti "Jumlah Kupon"
--      (jumlah lembar kupon per transaksi).
--   2. Field "Jumlah Liter" dan "Harga per Liter" DIHAPUS — kupon BBM
--      punya nominal tetap, bukan dihitung dari liter x harga.
--   3. Kupon terdiri dari 2 nominal tetap:
--        - Rp 100.000 untuk kendaraan Roda 4
--        - Rp  25.000 untuk kendaraan Roda 2
--      Nilai transaksi = jumlah_kupon x nominal_per_kupon.
--   4. Pengadaan BBM (roda 4 & roda 2) dibebankan pada 2 kode
--      rekening belanja berbeda:
--        5.1.02.03.002.00035 — ...Kendaraan Dinas Bermotor Perorangan (R4)
--        5.1.02.03.002.00038 — ...Kendaraan Bermotor Beroda Dua (R2)
--      sehingga belanja BBM harus otomatis mengikuti jenis roda
--      kendaraan yang dipilih, bukan dipilih manual.
--
-- Untuk mendukung ini, kendaraan butuh klasifikasi "roda" yang baku
-- (kolom `jenis_kendaraan` yang ada sekarang adalah teks bebas/deskriptif
-- misalnya "Minibus", "Pick Up", sehingga tidak bisa dipakai langsung
-- sebagai penentu nominal kupon/rekening).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Klasifikasi Roda pada kendaraan
-- ---------------------------------------------------------
alter table kendaraan add column if not exists roda text check (roda in ('roda2', 'roda4'));
comment on column kendaraan.roda is
  'Klasifikasi roda (roda2/roda4) — dipakai untuk menentukan nominal kupon BBM dan kode rekening belanja BBM otomatis. Berbeda dari jenis_kendaraan (teks bebas/deskriptif, mis. "Minibus").';

-- ---------------------------------------------------------
-- 2. Tabel BBM: kolom baru (nullable dulu, diisi, baru dikunci NOT NULL)
-- ---------------------------------------------------------
alter table bbm add column if not exists roda_kendaraan text check (roda_kendaraan in ('roda2', 'roda4'));
alter table bbm add column if not exists jumlah_kupon int check (jumlah_kupon > 0);
alter table bbm add column if not exists nilai_per_kupon numeric(18,2) check (nilai_per_kupon >= 0);

comment on column bbm.roda_kendaraan is
  'Snapshot klasifikasi roda kendaraan pada saat transaksi dicatat (agar riwayat tetap konsisten walau data kendaraan berubah di kemudian hari).';
comment on column bbm.jumlah_kupon is 'Jumlah lembar kupon BBM pada transaksi ini.';
comment on column bbm.nilai_per_kupon is 'Nominal per lembar kupon: 100000 untuk roda4, 25000 untuk roda2.';

-- Backfill baris lama (jika ada) sebelum kolom lama dihapus:
-- asumsikan 1 kupon per baris lama, roda diambil dari data kendaraan
-- (fallback roda4 jika kendaraan belum diklasifikasikan).
update bbm f
set
  roda_kendaraan = coalesce(
    (select k.roda from kendaraan k where k.id = f.kendaraan_id),
    'roda4'
  ),
  jumlah_kupon = coalesce(f.jumlah_kupon, 1)
where f.roda_kendaraan is null or f.jumlah_kupon is null;

update bbm
set nilai_per_kupon = case roda_kendaraan when 'roda2' then 25000 else 100000 end
where nilai_per_kupon is null;

-- ---------------------------------------------------------
-- 3. Buang view yang bergantung pada bbm.nilai (kolom generated
--    lama), lalu buang kolom & indeks lama yang sudah tidak relevan.
--    Semua view ini dibuat ulang persis seperti semula di bagian 5,
--    setelah kolom `nilai` yang baru dibuat.
-- ---------------------------------------------------------
drop view if exists v_realisasi_transaksi cascade;
drop view if exists v_rekap_per_kendaraan cascade;

drop index if exists uq_bbm_kupon;
alter table bbm drop column if exists nilai;          -- generated column lama (liter * harga_per_liter)
alter table bbm drop column if exists nomor_kupon;
alter table bbm drop column if exists liter;
alter table bbm drop column if exists harga_per_liter;

-- ---------------------------------------------------------
-- 4. Kunci kolom baru menjadi NOT NULL + generated column nilai baru
-- ---------------------------------------------------------
alter table bbm alter column roda_kendaraan set not null;
alter table bbm alter column jumlah_kupon set not null;
alter table bbm alter column nilai_per_kupon set not null;

alter table bbm add column nilai numeric(18,2) generated always as (jumlah_kupon * nilai_per_kupon) stored;

alter table bbm add constraint chk_bbm_nominal_kupon check (
  (roda_kendaraan = 'roda4' and nilai_per_kupon = 100000) or
  (roda_kendaraan = 'roda2' and nilai_per_kupon = 25000)
);

-- ---------------------------------------------------------
-- 5. Bangun ulang view yang di-drop di bagian 3 (persis seperti
--    definisi asli di 0001_schema.sql / 0004_phase5_views.sql),
--    lalu kembalikan setting security_invoker dari 0005.
-- ---------------------------------------------------------
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

create or replace view v_ringkasan_per_kegiatan as
  select
    kegiatan_id, tahun_anggaran_id, kode_kegiatan, nama_kegiatan, pagu, realisasi,
    pagu - realisasi as sisa,
    case when pagu = 0 then 0 else round(realisasi / pagu * 100, 2) end as persentase
  from (
    select
      k.id as kegiatan_id, k.tahun_anggaran_id, k.kode_kegiatan, k.nama_kegiatan,
      coalesce(sum(b.pagu), 0) as pagu,
      coalesce(sum((select coalesce(sum(r.nilai), 0) from v_realisasi_transaksi r where r.belanja_id = b.id)), 0) as realisasi
    from kegiatan k
    join sub_kegiatan sk on sk.kegiatan_id = k.id and sk.deleted_at is null
    join belanja b on b.sub_kegiatan_id = sk.id and b.deleted_at is null
    where k.deleted_at is null
    group by k.id, k.tahun_anggaran_id, k.kode_kegiatan, k.nama_kegiatan
  ) sub;

create or replace view v_realisasi_bulanan_kelompok as
  select
    tahun_anggaran_id,
    extract(month from tanggal)::int as bulan,
    sumber as kelompok,
    sum(nilai) as nilai
  from v_realisasi_transaksi
  group by tahun_anggaran_id, extract(month from tanggal), sumber;

-- Kembalikan security_invoker (di-set awalnya oleh 0005_phase7_hardening.sql;
-- reset ke default setiap kali view di-drop/create ulang, jadi harus diulang).
alter view v_realisasi_transaksi set (security_invoker = on);
alter view v_ringkasan_anggaran set (security_invoker = on);
alter view v_realisasi_per_belanja set (security_invoker = on);
alter view v_ringkasan_jenis_belanja set (security_invoker = on);
alter view v_penyerapan_bulanan set (security_invoker = on);
alter view v_rekap_per_kendaraan set (security_invoker = on);
alter view v_ringkasan_per_kegiatan set (security_invoker = on);
alter view v_realisasi_bulanan_kelompok set (security_invoker = on);

-- =========================================================
-- Catatan deploy: baris BBM yang sudah ada sebelum migrasi ini
-- (jika ada di lingkungan produksi) akan otomatis diberi
-- jumlah_kupon = 1 dan roda mengikuti data kendaraan (atau roda4
-- jika kendaraan belum diklasifikasikan). Periksa kembali data
-- lama tersebut secara manual bila diperlukan.
-- =========================================================
