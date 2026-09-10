# SIMBMD — Sistem Informasi Monitoring Barang Milik Daerah

Monitoring Anggaran • KIB • Pajak/Perijinan • Pemeliharaan • BBM

> Status: **Phase 1–8 selesai.** Lihat `docs/ARSITEKTUR.md` §7 untuk rincian roadmap.
> Seluruh 8 phase pada brief awal sudah diimplementasikan sebagai kode yang benar-benar berjalan (bukan mockup) — lihat bagian "Batasan yang jujur" di bawah untuk hal-hal yang secara sadar disederhanakan.

## Ringkasan fitur per Phase

**Phase 1 — Fondasi**: Login username+password (email internal disembunyikan), skema database lengkap untuk 8 phase sekaligus, RLS + RBAC 4 role, audit log otomatis, soft delete, storage privat, Dashboard Overview dengan perhitungan di database.

**Phase 2 — DPA**: CRUD Kegiatan → Sub Kegiatan → Belanja, Import DPA dari Excel/CSV dengan mapping kolom cerdas dan alur upload→preview→konfirmasi→import→log.

**Phase 3 — KIB**: CRUD KIB Kendaraan & Peralatan/Aset, Import KIB dengan deteksi duplikasi Nopol/Nomor Rangka/Nomor Mesin (di dalam file maupun terhadap database).

**Phase 4 — Transaksi**: Pajak/Perijinan (badge jatuh tempo otomatis), Pemeliharaan (kalkulasi total otomatis), BBM/Kupon (nilai & jarak tempuh otomatis, efisiensi km/liter), semuanya terhubung ke struktur Belanja sehingga otomatis masuk perhitungan Realisasi.

**Phase 5 — Dashboard & Monitoring Lanjutan**: Dashboard Anggaran/Realisasi/Monitoring, Monitoring Bulanan (pivot per kelompok), Monitoring per Nopol (rekap + detail kendaraan dengan grafik), Monitoring Pajak/Pemeliharaan/BBM/Anggaran (read-only dengan filter).

**Phase 6 — Laporan**: 6 halaman Laporan (Anggaran, Kendaraan, Pemeliharaan, Pajak, BBM, Tahunan) dengan ekspor **Excel/CSV/PDF/Print** yang selalu mengikuti filter aktif; Laporan Tahunan punya ekspor Excel multi-sheet.

**Phase 7 — Security Hardening & Data Quality**:
- **User Management** (`Administrasi > User`): Super Admin dapat membuat user baru (username+password, bukan email) lewat Edge Function `create-user` yang berjalan dengan `service_role` di server — kredensial tersebut **tidak pernah** menyentuh frontend. Termasuk kelola role, status aktif/nonaktif, dan soft delete.
- **OPD & Tahun Anggaran** (`Administrasi`): CRUD OPD; Tahun Anggaran punya tombol "Jadikan Aktif" yang memanggil RPC atomik `set_tahun_anggaran_aktif` (menghindari race condition terhadap constraint "hanya satu TA aktif").
- **Audit Log** (`Administrasi > Audit Log`): viewer dengan filter tabel/aksi; Super Admin melihat seluruh aktivitas, role lain hanya melihat aktivitasnya sendiri (ditegakkan oleh RLS, bukan hanya UI).
- **Pengaturan**: profil akun + form ganti kata sandi.
- **Data Quality Center** (`Administrasi > Data Quality Center`): pemeriksaan otomatis — Belanja tanpa Pagu, Realisasi melebihi Pagu, Kendaraan dengan Nomor Rangka/Mesin kosong, KIB Kendaraan tanpa detail, Pajak/Perijinan kedaluwarsa.
- **Login attempt lockout**: RPC `record_login_attempt`/`is_account_locked` mengunci akun 15 menit setelah 5 kali gagal berturut-turut dalam 15 menit — melengkapi (bukan menggantikan) rate limiting bawaan Supabase Auth di level project.
- **Upload dokumen tervalidasi**: komponen `FileUpload` (dipasang di form edit Pajak/Perijinan sebagai "Bukti Pembayaran") memvalidasi tipe file (PDF/JPG/PNG/WEBP) dan ukuran (maks. 5MB) di klien, menyimpan ke Supabase Storage bucket privat, dan menampilkan dokumen lewat signed URL sementara (120 detik) — bukan URL publik permanen.

**Phase 8 — Deployment**: GitHub Actions (`.github/workflows/build.yml`) menjalankan `npm run build` di setiap push/PR agar kesalahan build terdeteksi sebelum deploy; panduan lengkap GitHub → Vercel → Supabase di bawah.

## Batasan yang jujur (bukan disembunyikan)

- Edge Function `create-user` sudah ditulis lengkap (`supabase/functions/create-user/index.ts`) tetapi **perlu di-deploy manual** lewat Supabase CLI (lihat §3) — tidak bisa otomatis ter-deploy hanya dari repository ini.
- Rate limiting login di sini bekerja di level aplikasi (per-username, via tabel `login_attempts`). Untuk perlindungan brute-force yang lebih kuat di level jaringan/IP, aktifkan juga **Supabase Dashboard → Authentication → Rate Limits**.
- Notification center real-time (§32 pada brief) belum berupa lonceng notifikasi terpusat — indikator jatuh tempo/anggaran sudah tersedia tersebar di Dashboard, Monitoring, dan Data Quality Center.
- Import Master (data referensi selain DPA/KIB) masih ditandai "Segera Hadir" karena brief tidak merinci struktur datanya secara spesifik.

## 1. Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local   # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY project Anda sendiri
npm run dev
```

Build produksi:
```bash
npm run build
npm run preview
```

## 2. Setup Supabase (database, auth, storage)

1. Buat project di [supabase.com](https://supabase.com) (atau pakai project development yang sudah tersambung di `.env.example` — **ganti dengan project Anda sendiri untuk produksi**).
2. Di **SQL Editor**, jalankan berurutan:
   ```
   supabase/migrations/0001_schema.sql
   supabase/migrations/0002_rls_policies.sql
   supabase/migrations/0003_storage_policies.sql
   supabase/migrations/0004_phase5_views.sql
   supabase/migrations/0005_security_hardening.sql
   ```
3. (Opsional, development) jalankan `supabase/seed.sql` — akun `superadmin` / `SimBmd#2026` (wajib diganti sebelum produksi).

## 3. Deploy Edge Function `create-user` (wajib untuk Manajemen User)

```bash
npm install -g supabase
supabase login
supabase link --project-ref <project-ref-anda>
supabase secrets set AUTH_INTERNAL_DOMAIN=simbmd.local
supabase functions deploy create-user
```

Tanpa langkah ini, halaman **Administrasi > User** tetap tampil tetapi tombol "Tambah User" akan menampilkan pesan error yang jelas (bukan gagal diam-diam) yang mengarahkan untuk men-deploy function ini terlebih dahulu.

**Membuat user Super Admin pertama secara manual** (sebelum Edge Function ada, atau sebagai alternatif seed):
- Buat user di **Supabase Dashboard → Authentication → Users** dengan email internal apa saja (mis. `admin@simbmd.local`).
- Insert baris ke tabel `profiles`: `id` = UUID user tersebut, `username`, `role = 'super_admin'`, `opd_id = null`, `status = 'aktif'`.

## 4. Login pertama kali

Gunakan **Username**, bukan email:
```
Username: superadmin
Password: SimBmd#2026
```

## 5. Deployment GitHub + Vercel

### GitHub
```bash
git init
git add .
git commit -m "feat: phase 1-8 - fondasi sampai deployment"
git branch -M main
git remote add origin https://github.com/<org>/sim-bmd.git
git push -u origin main
```
`.github/workflows/build.yml` otomatis menjalankan `npm run build` di setiap push/PR ke `main`/`development`.

### Vercel
1. Import repository `sim-bmd`.
2. Build command: `npm run build`, Output directory: `dist`.
3. Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. **Jangan** menambahkan `SUPABASE_SERVICE_ROLE_KEY` di sini — key itu hanya untuk Edge Function.
4. Deploy.

## 6. Checklist keamanan sebelum produksi

- [ ] Password akun `superadmin` seed sudah diganti / akun seed dihapus.
- [ ] `.env.example`/Vercel env diganti dengan kredensial project produksi sendiri.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` tidak pernah muncul di frontend/git history — hanya sebagai secret Edge Function.
- [ ] Edge Function `create-user` sudah di-deploy (§3) sebelum mengandalkan Manajemen User dari UI.
- [ ] RLS aktif untuk semua tabel (`select relrowsecurity from pg_class where relname = '...'`).
- [ ] Bucket `documents` tetap `public = false`.
- [ ] Rate limiting login diaktifkan di **Supabase Dashboard → Authentication → Rate Limits** (melengkapi lockout aplikasi di `login_attempts`).
- [ ] Jalankan **Data Quality Center** (`/admin/data-quality`) sebelum go-live untuk memastikan data DPA/KIB awal sudah konsisten.

## 7. Struktur folder & arsitektur

Lihat `docs/ARSITEKTUR.md` untuk ERD, matriks role/permission, strategi RLS, struktur folder lengkap, dan roadmap Phase 1–8.
