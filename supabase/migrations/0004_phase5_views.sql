-- =========================================================
-- SIMBMD — 0004_phase5_views.sql
-- View tambahan untuk Dashboard & Monitoring lanjutan (§14-17, §26).
-- Semua perhitungan tetap di database, bukan di frontend.
-- =========================================================

-- ---------------------------------------------------------
-- Ringkasan anggaran per Kegiatan (untuk Dashboard > Anggaran).
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- Realisasi bulanan per KELOMPOK TRANSAKSI (bukan per belanja), sehingga
-- transaksi yang belum ditautkan ke rincian Belanja tetap terhitung.
-- Dipakai oleh Rekap/Monitoring Bulanan (§15).
-- ---------------------------------------------------------
create or replace view v_realisasi_bulanan_kelompok as
  select
    tahun_anggaran_id,
    extract(month from tanggal)::int as bulan,
    sumber as kelompok,
    sum(nilai) as nilai
  from v_realisasi_transaksi
  group by tahun_anggaran_id, extract(month from tanggal), sumber;
