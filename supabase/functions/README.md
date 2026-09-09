# Supabase Edge Functions — TODO (Phase 7-8)

Fungsi ini **belum diimplementasikan** pada Phase 1 (lihat brief §48: jangan
membuat fitur palsu yang terlihat bekerja). Placeholder ini mendokumentasikan
kontrak yang perlu dibuat pada Phase 7/8.

## `create-user` (rencana)

Dipanggil oleh SUPER_ADMIN dari halaman **Administrasi > User** untuk membuat
akun baru dengan identitas **username**, bukan email.

Kontrak (rencana):

```
POST /functions/v1/create-user
Authorization: Bearer <access_token milik super_admin yang login>

Body:
{
  "username": "budi.santoso",
  "password": "***",
  "nama": "Budi Santoso",
  "role": "admin_opd",
  "opd_id": "uuid-opd"
}
```

Alur di dalam function (jalan dengan `SUPABASE_SERVICE_ROLE_KEY`, **hanya**
tersedia sebagai environment variable di sisi Edge Function, tidak pernah di
frontend):

1. Verifikasi caller adalah `super_admin` (cek JWT lalu query tabel `profiles`).
2. Validasi `username` belum dipakai (unique constraint di `profiles`).
3. Bentuk email internal sintetik `${username}@${AUTH_INTERNAL_DOMAIN}`.
4. `supabase.auth.admin.createUser({ email, password, email_confirm: true })`.
5. Insert baris ke `profiles` (`id` = user id hasil langkah 4).
6. Catat ke `audit_logs` melalui `log_audit_event`.

## `import-dpa` / `import-kib` (rencana)

Untuk file besar, parsing Excel sebaiknya dilakukan di Edge Function (bukan
di browser) agar validasi konsisten dan tidak membebani client. Alur mengikuti
workflow di brief §8-9: UPLOAD → VALIDASI → PREVIEW → KONFIRMASI → IMPORT →
LOG. Endpoint ini mengembalikan hasil preview terlebih dahulu (tanpa menulis
ke database) sebelum endpoint konfirmasi terpisah benar-benar melakukan
INSERT/UPDATE/SKIP.
