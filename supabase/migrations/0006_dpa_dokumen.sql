-- =========================================================
-- SIMPELBMD — 0006_dpa_dokumen.sql
--
-- Menyimpan info HEADER/registrasi dokumen DPA (Nomor DPA,
-- Tanggal Penetapan, Tahapan, Jumlah Rincian, Total Pagu, Status)
-- persis seperti export ringkasan dari aplikasi e-budgeting Pemda.
--
-- SENGAJA DIPISAH dari struktur Kegiatan/Sub Kegiatan/Belanja
-- (§4, tabel `kegiatan`/`sub_kegiatan`/`belanja`) karena granularitas
-- filenya berbeda: file ringkasan DPA hanya berisi 1 baris per
-- dokumen DPA, bukan rincian per belanja. Import header ini TIDAK
-- pernah menyentuh/menimpa data kegiatan/sub_kegiatan/belanja yang
-- sudah diisi (manual maupun via Import DPA rincian yang sudah ada).
-- =========================================================

create table dpa_dokumen (
  id uuid primary key default gen_random_uuid(),
  tahun_anggaran_id uuid not null references tahun_anggaran(id),
  opd_id uuid not null references opd(id),
  nomor_dpa text not null,
  tanggal_penetapan date,
  tahapan text,
  jumlah_rincian int,
  total_pagu numeric(18,2),
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  unique (tahun_anggaran_id, opd_id, nomor_dpa)
);
create trigger trg_dpadokumen_updated_at before update on dpa_dokumen
  for each row execute function set_updated_at();
create index idx_dpadokumen_ta on dpa_dokumen(tahun_anggaran_id);
create index idx_dpadokumen_opd on dpa_dokumen(opd_id);

alter table dpa_dokumen enable row level security;

create policy dpadokumen_select on dpa_dokumen for select
  using (is_super_admin() or opd_id = current_user_opd());
create policy dpadokumen_write on dpa_dokumen for insert
  with check (can_write() and (is_super_admin() or opd_id = current_user_opd()));
create policy dpadokumen_update on dpa_dokumen for update
  using (is_super_admin() or (can_write() and opd_id = current_user_opd()));

-- Izinkan import_logs mencatat jenis import baru 'dpa_dokumen',
-- tanpa mengubah baris log yang sudah ada untuk jenis 'dpa'/'kib'.
alter table import_logs drop constraint import_logs_jenis_check;
alter table import_logs add constraint import_logs_jenis_check
  check (jenis in ('dpa','kib','dpa_dokumen'));
