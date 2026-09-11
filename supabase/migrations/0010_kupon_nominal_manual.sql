-- =========================================================
-- 0010: Nominal Kupon BBM manual (mengikuti fluktuasi harga BBM)
--
-- Sebelumnya (0008/0009) nominal per lembar kupon DIKUNCI ke nilai tetap
-- (Rp100.000 utk roda4, Rp25.000 utk roda2) lewat CHECK constraint.
-- Sekarang, atas permintaan pengguna, nominal tsb perlu bisa diubah manual
-- oleh admin (mis. karena fluktuasi harga BBM), sehingga:
--   - `pengadaan_kupon_bbm.nilai_per_kupon` diinput bebas oleh admin saat
--     mencatat pengadaan kupon tiap Tahun Anggaran (masih wajib >= 0).
--   - `bbm.nilai_per_kupon` tetap berupa SNAPSHOT nominal yang berlaku
--     pada saat transaksi dicatat (diambil otomatis dari pengadaan yang
--     berlaku saat itu oleh aplikasi) — transaksi lama TIDAK ikut berubah
--     kalau nominal pengadaan diubah di kemudian hari.
-- =========================================================

alter table bbm drop constraint if exists chk_bbm_nominal_kupon;
alter table pengadaan_kupon_bbm drop constraint if exists chk_pengadaan_kupon_nominal;

comment on column bbm.nilai_per_kupon is
  'Nominal per lembar kupon pada saat transaksi dicatat (snapshot). Diambil otomatis oleh aplikasi dari pengadaan_kupon_bbm yang berlaku saat itu — TIDAK lagi dikunci ke nilai tetap, karena nominal kupon bisa berubah mengikuti fluktuasi harga BBM antar Tahun Anggaran (atau saat pengadaan direvisi).';

comment on column pengadaan_kupon_bbm.nilai_per_kupon is
  'Nominal per lembar kupon, diinput MANUAL oleh admin saat mencatat pengadaan (bisa berbeda tiap Tahun Anggaran mengikuti fluktuasi harga BBM). Tidak lagi dikunci ke nilai tetap Rp100.000/Rp25.000 seperti pada migrasi 0008/0009.';
