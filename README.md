# SIMBMD — Sistem Informasi Monitoring Barang Milik Daerah

Monitoring Anggaran • KIB • Pajak/Perijinan • Pemeliharaan • BBM

> Status: **Phase 6 (Laporan) — selesai.** Lihat `docs/ARSITEKTUR.md` §7 untuk roadmap lengkap Phase 1–8.
> Phase 7 (User Management via Edge Function, Data Quality Center, hardening keamanan lanjutan) dan Phase 8 (deployment produksi) masih ditandai jelas sebagai "Segera Hadir" di UI — bukan fitur palsu yang terlihat bekerja padahal tidak.

## Yang sudah berfungsi nyata

**Phase 1 — Fondasi**
- Login **username + password** lewat Supabase Auth (email internal disembunyikan dari user).
- Skema database **lengkap** untuk seluruh 8 phase sejak awal (`supabase/migrations/0001_schema.sql`), sehingga modul berikutnya tidak memerlukan rebuild struktur.
- Row Level Security aktif di semua tabel sensitif + RBAC (`super_admin`, `admin_opd`, `operator`, `viewer`) — lihat `0002_rls_policies.sql`.
- Trigger audit log otomatis untuk insert/update/delete pada tabel master & transaksi.
- Soft delete (`deleted_at`/`deleted_by`) di seluruh tabel master dan transaksi.
- Storage bucket privat + policy per-OPD (`0003_storage_policies.sql`).
- Dashboard Overview: Pagu, Realisasi, Sisa, % Penyerapan, ringkasan per jenis belanja, grafik penyerapan bulanan — **seluruhnya dihitung di database** lewat SQL view, bukan di-hardcode di frontend.

**Phase 2 — DPA**
- CRUD **Kegiatan → Sub Kegiatan → Belanja** dengan drill-down, validasi, dan soft delete.
- **Import DPA** dari Excel/CSV: Upload → Validasi file → Mapping kolom (dengan saran otomatis) → Preview + baris bermasalah → Konfirmasi → Import (INSERT/UPDATE/SKIP) → Ringkasan hasil → tercatat di `import_logs`.
- Unduh template Excel siap pakai.

**Phase 3 — KIB Kendaraan & Peralatan**
- CRUD **KIB Kendaraan** (data KIB + identitas kendaraan dalam satu form) dan **KIB Peralatan/Aset Lainnya** (dengan tab kategori).
- **Import KIB** dengan deteksi duplikasi **Nopol, Nomor Rangka, dan Nomor Mesin** — baik di dalam file yang sama maupun terhadap data yang sudah ada di database — sebelum insert baru dilakukan.

**Phase 4 — Transaksi Kendaraan**
- **Pajak & Perijinan**: badge status jatuh tempo otomatis (≤7/≤14/≤30 hari, sudah lewat, aman).
- **Pemeliharaan**: preview total (sparepart + jasa) otomatis, nilai final dihitung database (`generated column`).
- **BBM/Kupon**: preview Nilai (liter × harga) dan Jarak Tempuh otomatis, validasi KM mundur, efisiensi km/liter.
- Ketiga modul memakai komponen **Kegiatan → Sub Kegiatan → Belanja** berjenjang yang sama, sehingga transaksi otomatis mengalir ke Realisasi & Sisa Anggaran di Dashboard.

**Phase 5 — Dashboard & Monitoring Lanjutan**
- Dashboard **Anggaran** (per Kegiatan), **Realisasi** (tren kumulatif vs Pagu), dan **Monitoring** (ringkasan lintas modul).
- Monitoring **Bulanan** (pivot Bulan × Pajak/Pemeliharaan/BBM), **per Nopol** (rekap + detail kendaraan lengkap dengan grafik), serta **Pajak/Pemeliharaan/BBM/Anggaran** (tampilan read-only dengan filter, termasuk perhitungan efisiensi BBM).

**Phase 6 — Laporan (baru)**
- Enam halaman Laporan: **Rekap Anggaran, Rekap Kendaraan, Rekap Pemeliharaan, Rekap Pajak, Rekap BBM,** dan **Laporan Tahunan** (gabungan 3 sub-laporan dalam satu halaman).
- Setiap laporan punya toolbar ekspor **Excel (.xlsx), CSV, PDF,** dan **Print**, yang selalu mengikuti filter yang sedang aktif di layar (bukan snapshot data awal).
- **Laporan Tahunan** punya tombol tambahan "Unduh Laporan Lengkap" yang menghasilkan satu file Excel **multi-sheet** (Ringkasan Anggaran, Rekap Bulanan, Rekap Kendaraan sekaligus).
- Print memakai stylesheet `@media print` khusus yang menyembunyikan sidebar/topbar/tombol aksi, sehingga hasil cetak/"Save as PDF" dari dialog print browser tetap rapi.
- Library berat (`xlsx`, `jspdf`) di-*lazy load* hanya saat tombol ekspor terkait ditekan, agar bundle utama tetap kecil (§37 performa) — lihat `src/services/exportService.js`.

## Yang belum diimplementasikan (TODO eksplisit)

- Halaman **Administrasi** (User, OPD, Tahun Anggaran, Audit Log, Pengaturan) dan **Import Master** — ditampilkan sebagai "Segera Hadir", dijadwalkan Phase 7–8. Skema tabelnya sudah siap.
- Edge Function `create-user` untuk manajemen user oleh Super Admin tanpa menyentuh SQL manual — lihat `supabase/functions/README.md`.
- Rate limiting login & hardening keamanan lanjutan (Phase 7).
- Notification center (§32) dan Data Quality Center (§33) belum punya halaman UI tersendiri; komponennya (badge jatuh tempo, status anggaran) sudah muncul tersebar di Dashboard/Monitoring.

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

## 2. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com) (atau gunakan project yang sudah ada — nilai contoh di `.env.example` mengarah ke project development yang dipakai selama pembangunan aplikasi ini; **ganti dengan project Anda sendiri untuk produksi**).
2. Buka **SQL Editor**, jalankan berurutan:
   ```
   supabase/migrations/0001_schema.sql
   supabase/migrations/0002_rls_policies.sql
   supabase/migrations/0003_storage_policies.sql
   supabase/migrations/0004_phase5_views.sql
   ```
3. (Opsional, hanya development) jalankan `supabase/seed.sql` untuk data contoh + akun `superadmin` (password `SimBmd#2026` — **wajib diganti/dihapus sebelum produksi**).
4. **Membuat user admin secara manual** (alternatif dari seed, mis. untuk akun produksi pertama):
   - Buat user di **Supabase Dashboard → Authentication → Users**, dengan email internal apa saja (mis. `admin@simbmd.local`) dan password awal. Email ini tidak pernah ditampilkan ke pengguna — UI SIMBMD hanya meminta *username*.
   - Catat `user id` (UUID) yang dihasilkan.
   - Insert baris ke tabel `profiles`: `id` = UUID tersebut, `username` = username login yang diinginkan, `role = 'super_admin'`, `opd_id = null`, `status = 'aktif'`.
   - Selanjutnya, pembuatan user baru sebaiknya lewat halaman **Administrasi → User** (Phase 7), yang memanggil Supabase Admin API dari Edge Function — bukan lewat SQL manual atau frontend langsung.

## 3. Login pertama kali

Gunakan **Username**, bukan email — contoh dari seed data:

```
Username: superadmin
Password: SimBmd#2026
```

## 4. Deployment

### GitHub
```bash
git init
git add .
git commit -m "feat: phase 1-6 - foundation through laporan/export"
git branch -M main
git remote add origin https://github.com/<org>/sim-bmd.git
git push -u origin main
```

### Vercel
1. Import repository `sim-bmd`.
2. Build command: `npm run build`, Output directory: `dist`.
3. Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. **Jangan pernah** menambahkan `SUPABASE_SERVICE_ROLE_KEY` di sini.
4. Deploy.

## 5. Keamanan — hal yang WAJIB diperiksa sebelum produksi

- [ ] Password akun `superadmin` seed sudah diganti / akun seed dihapus.
- [ ] `.env.example` diganti dengan kredensial project produksi Anda sendiri (bukan project development bawaan).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` tidak pernah muncul di frontend/git history — hanya dipakai di Edge Function.
- [ ] RLS aktif untuk semua tabel (`select relrowsecurity from pg_class where relname = '...'`).
- [ ] Bucket `documents` tetap `public = false`.
- [ ] Rate limiting login diaktifkan di **Supabase Dashboard → Authentication → Rate Limits**.

## 6. Struktur folder

Lihat `docs/ARSITEKTUR.md` §6 untuk struktur folder lengkap, §3 untuk ERD/matriks role, dan §7 untuk roadmap Phase 1–8.
