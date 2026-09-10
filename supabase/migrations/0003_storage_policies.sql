-- =========================================================
-- SIMPELBMD — 0003_storage_policies.sql
-- Bucket dokumen bersifat PRIVATE. Akses baca menggunakan
-- signed URL yang dibuat dari sisi client setelah RLS pada
-- tabel `dokumen` memverifikasi kepemilikan OPD (§23-24).
-- =========================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Konvensi path objek: {opd_id}/{table_name}/{record_id}/{filename}
-- Ini memungkinkan policy storage memeriksa opd_id langsung dari path,
-- tanpa perlu join ke tabel lain.

create policy storage_documents_select on storage.objects
  for select
  using (
    bucket_id = 'documents'
    and (
      is_super_admin()
      or (storage.foldername(name))[1] = current_user_opd()::text
    )
  );

create policy storage_documents_insert on storage.objects
  for insert
  with check (
    bucket_id = 'documents'
    and can_write()
    and (
      is_super_admin()
      or (storage.foldername(name))[1] = current_user_opd()::text
    )
  );

-- Update/replace file hanya oleh yang berwenang menulis di OPD terkait.
create policy storage_documents_update on storage.objects
  for update
  using (
    bucket_id = 'documents'
    and (
      is_super_admin()
      or (can_write() and (storage.foldername(name))[1] = current_user_opd()::text)
    )
  );

-- Tidak ada policy DELETE untuk role selain super admin — penghapusan
-- dokumen mengikuti prinsip soft delete pada tabel `dokumen`, bukan
-- menghapus objek storage secara langsung dari client biasa.
create policy storage_documents_delete_super_admin on storage.objects
  for delete
  using (bucket_id = 'documents' and is_super_admin());

-- Validasi tipe & ukuran file idealnya juga ditegakkan di sisi klien
-- (lihat src/validators/) dan, untuk kepastian, lewat Edge Function
-- yang memeriksa content-type sebelum menghasilkan signed upload URL
-- (lihat supabase/functions/README.md).
