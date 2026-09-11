-- =========================================================
-- 0007: Dukungan Import Excel untuk modul Pajak & Perijinan
-- (fitur "Import Pajak" — register kendaraan + jatuh tempo pajak)
-- =========================================================

-- import_logs.jenis sebelumnya hanya mengizinkan 'dpa' dan 'kib'.
-- Tambahkan 'pajak' agar commitPajakImport() bisa mencatat log import
-- dengan cara yang konsisten dengan Import DPA / Import KIB.
alter table import_logs drop constraint if exists import_logs_jenis_check;
alter table import_logs add constraint import_logs_jenis_check
  check (jenis in ('dpa', 'kib', 'pajak'));
