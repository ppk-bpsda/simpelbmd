-- =========================================================
-- SIMBMD — 0002_rls_policies.sql
-- Helper functions (SECURITY DEFINER) + RLS untuk semua tabel.
-- Prinsip: otorisasi ditegakkan di database, bukan hanya frontend (§20).
-- =========================================================

-- ---------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------
create or replace function current_profile()
returns profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from profiles where id = auth.uid() and deleted_at is null;
$$;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'super_admin' and deleted_at is null and status = 'aktif'
  );
$$;

create or replace function current_user_opd()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select opd_id from profiles where id = auth.uid() and deleted_at is null;
$$;

create or replace function current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid() and deleted_at is null and status = 'aktif';
$$;

create or replace function can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_user_role() in ('super_admin', 'admin_opd', 'operator');
$$;

create or replace function can_manage_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_user_role() in ('super_admin', 'admin_opd');
$$;

-- ---------------------------------------------------------
-- Audit logging: trigger generik (SECURITY DEFINER) + RPC manual
-- untuk peristiwa non-tabel seperti login/logout (§21).
-- ---------------------------------------------------------
create or replace function log_audit_event(
  p_action text,
  p_table_name text,
  p_record_id uuid,
  p_old_data jsonb,
  p_new_data jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_logs (user_id, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), p_action, p_table_name, p_record_id, p_old_data, p_new_data);
end;
$$;
-- Semua user terautentikasi boleh MEMANGGIL fungsi ini (untuk mencatat aksinya
-- sendiri), tapi tidak ada seorang pun yang boleh INSERT langsung ke audit_logs
-- atau UPDATE/DELETE baris di dalamnya (lihat policy audit_logs di bawah).
grant execute on function log_audit_event(text, text, uuid, jsonb, jsonb) to authenticated;

create or replace function audit_table_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    values (auth.uid(), 'insert', tg_table_name, new.id, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    values (auth.uid(), 'update', tg_table_name, new.id, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    insert into audit_logs (user_id, action, table_name, record_id, old_data, new_data)
    values (auth.uid(), 'delete', tg_table_name, old.id, to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'kegiatan','sub_kegiatan','belanja','kib','kendaraan',
    'pajak_perijinan','pemeliharaan','bbm','profiles','opd','tahun_anggaran'
  ]
  loop
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on %1$s
         for each row execute function audit_table_trigger();', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------
-- Enable RLS di semua tabel sensitif
-- ---------------------------------------------------------
alter table opd enable row level security;
alter table tahun_anggaran enable row level security;
alter table profiles enable row level security;
alter table kegiatan enable row level security;
alter table sub_kegiatan enable row level security;
alter table belanja enable row level security;
alter table kib enable row level security;
alter table kendaraan enable row level security;
alter table pajak_perijinan enable row level security;
alter table pemeliharaan enable row level security;
alter table bbm enable row level security;
alter table dokumen enable row level security;
alter table audit_logs enable row level security;
alter table import_logs enable row level security;

-- ---------------------------------------------------------
-- OPD & TAHUN ANGGARAN: read untuk semua yang login, write hanya super admin
-- ---------------------------------------------------------
create policy opd_select on opd for select using (auth.uid() is not null);
create policy opd_write on opd for insert with check (is_super_admin());
create policy opd_update on opd for update using (is_super_admin());

create policy ta_select on tahun_anggaran for select using (auth.uid() is not null);
create policy ta_write on tahun_anggaran for insert with check (is_super_admin());
create policy ta_update on tahun_anggaran for update using (is_super_admin());

-- ---------------------------------------------------------
-- PROFILES: user melihat profil sendiri; super admin melihat & mengelola semua.
-- Pembuatan profil baru dilakukan lewat Edge Function ber-service_role
-- (lihat supabase/functions/create-user), BUKAN langsung oleh client.
-- ---------------------------------------------------------
create policy profiles_select_self on profiles for select using (id = auth.uid());
create policy profiles_select_all_super_admin on profiles for select using (is_super_admin());
create policy profiles_update_self on profiles for update using (id = auth.uid())
  with check (id = auth.uid());
create policy profiles_update_super_admin on profiles for update using (is_super_admin());

-- ---------------------------------------------------------
-- KEGIATAN / SUB KEGIATAN / BELANJA: scoped by OPD (kegiatan punya opd_id;
-- sub_kegiatan & belanja mewarisi lewat join).
-- ---------------------------------------------------------
create policy kegiatan_select on kegiatan for select
  using (is_super_admin() or opd_id = current_user_opd());
create policy kegiatan_write on kegiatan for insert
  with check (can_write() and (is_super_admin() or opd_id = current_user_opd()));
create policy kegiatan_update on kegiatan for update
  using (is_super_admin() or (can_write() and opd_id = current_user_opd()));

create policy subkegiatan_select on sub_kegiatan for select
  using (is_super_admin() or exists (
    select 1 from kegiatan k where k.id = sub_kegiatan.kegiatan_id and k.opd_id = current_user_opd()
  ));
create policy subkegiatan_write on sub_kegiatan for insert
  with check (can_write() and (is_super_admin() or exists (
    select 1 from kegiatan k where k.id = sub_kegiatan.kegiatan_id and k.opd_id = current_user_opd()
  )));
create policy subkegiatan_update on sub_kegiatan for update
  using (is_super_admin() or (can_write() and exists (
    select 1 from kegiatan k where k.id = sub_kegiatan.kegiatan_id and k.opd_id = current_user_opd()
  )));

create policy belanja_select on belanja for select
  using (is_super_admin() or exists (
    select 1 from sub_kegiatan sk join kegiatan k on k.id = sk.kegiatan_id
    where sk.id = belanja.sub_kegiatan_id and k.opd_id = current_user_opd()
  ));
create policy belanja_write on belanja for insert
  with check (can_write() and (is_super_admin() or exists (
    select 1 from sub_kegiatan sk join kegiatan k on k.id = sk.kegiatan_id
    where sk.id = belanja.sub_kegiatan_id and k.opd_id = current_user_opd()
  )));
create policy belanja_update on belanja for update
  using (is_super_admin() or (can_write() and exists (
    select 1 from sub_kegiatan sk join kegiatan k on k.id = sk.kegiatan_id
    where sk.id = belanja.sub_kegiatan_id and k.opd_id = current_user_opd()
  )));

-- ---------------------------------------------------------
-- KIB & KENDARAAN
-- ---------------------------------------------------------
create policy kib_select on kib for select
  using (is_super_admin() or opd_id = current_user_opd());
create policy kib_write on kib for insert
  with check (can_write() and (is_super_admin() or opd_id = current_user_opd()));
create policy kib_update on kib for update
  using (is_super_admin() or (can_write() and opd_id = current_user_opd()));

create policy kendaraan_select on kendaraan for select
  using (is_super_admin() or exists (
    select 1 from kib where kib.id = kendaraan.kib_id and kib.opd_id = current_user_opd()
  ));
create policy kendaraan_write on kendaraan for insert
  with check (can_write() and (is_super_admin() or exists (
    select 1 from kib where kib.id = kendaraan.kib_id and kib.opd_id = current_user_opd()
  )));
create policy kendaraan_update on kendaraan for update
  using (is_super_admin() or (can_write() and exists (
    select 1 from kib where kib.id = kendaraan.kib_id and kib.opd_id = current_user_opd()
  )));

-- ---------------------------------------------------------
-- TRANSAKSI: PAJAK / PERIJINAN, PEMELIHARAAN, BBM
-- Scoping lewat kendaraan -> kib -> opd_id.
-- ---------------------------------------------------------
create policy pajak_select on pajak_perijinan for select
  using (is_super_admin() or exists (
    select 1 from kendaraan kd join kib on kib.id = kd.kib_id
    where kd.id = pajak_perijinan.kendaraan_id and kib.opd_id = current_user_opd()
  ));
create policy pajak_write on pajak_perijinan for insert
  with check (can_write() and (is_super_admin() or exists (
    select 1 from kendaraan kd join kib on kib.id = kd.kib_id
    where kd.id = pajak_perijinan.kendaraan_id and kib.opd_id = current_user_opd()
  )));
create policy pajak_update on pajak_perijinan for update
  using (is_super_admin() or (can_write() and exists (
    select 1 from kendaraan kd join kib on kib.id = kd.kib_id
    where kd.id = pajak_perijinan.kendaraan_id and kib.opd_id = current_user_opd()
  )));

create policy pemeliharaan_select on pemeliharaan for select
  using (is_super_admin() or exists (
    select 1 from kendaraan kd join kib on kib.id = kd.kib_id
    where kd.id = pemeliharaan.kendaraan_id and kib.opd_id = current_user_opd()
  ));
create policy pemeliharaan_write on pemeliharaan for insert
  with check (can_write() and (is_super_admin() or exists (
    select 1 from kendaraan kd join kib on kib.id = kd.kib_id
    where kd.id = pemeliharaan.kendaraan_id and kib.opd_id = current_user_opd()
  )));
create policy pemeliharaan_update on pemeliharaan for update
  using (is_super_admin() or (can_write() and exists (
    select 1 from kendaraan kd join kib on kib.id = kd.kib_id
    where kd.id = pemeliharaan.kendaraan_id and kib.opd_id = current_user_opd()
  )));

create policy bbm_select on bbm for select
  using (is_super_admin() or exists (
    select 1 from kendaraan kd join kib on kib.id = kd.kib_id
    where kd.id = bbm.kendaraan_id and kib.opd_id = current_user_opd()
  ));
create policy bbm_write on bbm for insert
  with check (can_write() and (is_super_admin() or exists (
    select 1 from kendaraan kd join kib on kib.id = kd.kib_id
    where kd.id = bbm.kendaraan_id and kib.opd_id = current_user_opd()
  )));
create policy bbm_update on bbm for update
  using (is_super_admin() or (can_write() and exists (
    select 1 from kendaraan kd join kib on kib.id = kd.kib_id
    where kd.id = bbm.kendaraan_id and kib.opd_id = current_user_opd()
  )));

-- ---------------------------------------------------------
-- DOKUMEN: scoped by opd_id yang dicatat saat upload.
-- ---------------------------------------------------------
create policy dokumen_select on dokumen for select
  using (is_super_admin() or opd_id = current_user_opd());
create policy dokumen_write on dokumen for insert
  with check (can_write() and (is_super_admin() or opd_id = current_user_opd()));

-- ---------------------------------------------------------
-- IMPORT LOGS: sama seperti dokumen, scoped per OPD.
-- ---------------------------------------------------------
create policy importlogs_select on import_logs for select
  using (is_super_admin() or opd_id = current_user_opd());
create policy importlogs_write on import_logs for insert
  with check (can_write() and (is_super_admin() or opd_id = current_user_opd()));

-- ---------------------------------------------------------
-- AUDIT LOGS: hanya bisa dibaca (super admin baca semua, admin_opd baca
-- miliknya sendiri sebagai user). TIDAK ADA policy UPDATE/DELETE untuk
-- role mana pun — baris audit hanya bisa masuk lewat trigger/RPC di atas.
-- ---------------------------------------------------------
create policy auditlogs_select_super_admin on audit_logs for select
  using (is_super_admin());
create policy auditlogs_select_self on audit_logs for select
  using (user_id = auth.uid());

-- Catatan: kebijakan DELETE pada tabel-tabel di atas SENGAJA tidak dibuat.
-- Penghapusan data dilakukan melalui UPDATE kolom deleted_at/deleted_by
-- (soft delete, §22), dan hanya diperbolehkan untuk role admin_opd/super_admin
-- lewat pengecekan can_manage_master() pada layer service/RPC terkait.
