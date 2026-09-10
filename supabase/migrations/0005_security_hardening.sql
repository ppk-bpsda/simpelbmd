-- =========================================================
-- SIMBMD — 0005_security_hardening.sql
-- Phase 7: rate limiting/lockout percobaan login, dan RPC aman untuk
-- mengganti Tahun Anggaran aktif (§18-19, §24, §32).
-- =========================================================

-- ---------------------------------------------------------
-- LOGIN ATTEMPTS: lockout sementara setelah beberapa kali gagal.
-- Ini melengkapi (bukan menggantikan) rate limiting bawaan Supabase Auth
-- di level project (lihat README §5) — perlindungan di sini bekerja di
-- level aplikasi/username, sebelum request sampai ke Supabase Auth.
-- ---------------------------------------------------------
create table login_attempts (
  username text primary key,
  attempt_count int not null default 0,
  locked_until timestamptz,
  last_attempt_at timestamptz not null default now()
);
alter table login_attempts enable row level security;
-- Sengaja TIDAK ada policy select/insert/update untuk anon/authenticated:
-- tabel ini hanya boleh disentuh lewat RPC SECURITY DEFINER di bawah.

create or replace function is_account_locked(p_username text)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select locked_until from login_attempts
  where username = lower(trim(p_username)) and locked_until is not null and locked_until > now();
$$;
grant execute on function is_account_locked(text) to anon, authenticated;

create or replace function record_login_attempt(p_username text, p_success boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(p_username));
  v_count int;
begin
  if p_success then
    delete from login_attempts where username = v_username;
    return;
  end if;

  insert into login_attempts (username, attempt_count, last_attempt_at)
  values (v_username, 1, now())
  on conflict (username) do update
    set attempt_count = case
          when login_attempts.last_attempt_at < now() - interval '15 minutes' then 1
          else login_attempts.attempt_count + 1
        end,
        last_attempt_at = now()
  returning attempt_count into v_count;

  if v_count >= 5 then
    update login_attempts
      set locked_until = now() + interval '15 minutes'
      where username = v_username;
  end if;
end;
$$;
grant execute on function record_login_attempt(text, boolean) to anon, authenticated;

-- ---------------------------------------------------------
-- Ganti Tahun Anggaran aktif secara atomik (hindari race condition
-- terhadap unique partial index one_active_tahun_anggaran di 0001).
-- ---------------------------------------------------------
create or replace function set_tahun_anggaran_aktif(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_super_admin() then
    raise exception 'Hanya Super Admin yang dapat mengubah Tahun Anggaran aktif.';
  end if;

  update tahun_anggaran set status_aktif = false where status_aktif = true;
  update tahun_anggaran set status_aktif = true where id = p_id and deleted_at is null;

  perform log_audit_event('set_active', 'tahun_anggaran', p_id, null, jsonb_build_object('status_aktif', true));
end;
$$;
grant execute on function set_tahun_anggaran_aktif(uuid) to authenticated;
