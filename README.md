# SIMBMD — Sistem Informasi Monitoring Barang Milik Daerah

Monitoring Anggaran • KIB • Pajak/Perijinan • Pemeliharaan • BBM

## Status saat ini: Phase 1–7 selesai, Phase 8 (deployment production) — tooling siap, provisioning akun manual masih diperlukan

Yang sudah berfungsi nyata (bukan mockup):
- Skema database lengkap untuk seluruh 8 phase (lihat `supabase/migrations/0001_schema.sql`), sehingga modul berikutnya tidak memerlukan rebuild struktur.
- Row Level Security aktif di setiap tabel sensitif, dengan RBAC (`super_admin`, `admin_opd`, `operator`, `viewer`) — lihat `0003_rls.sql`.
- Login username/password: `resolve_username_login` RPC memetakan username ke handle internal Supabase Auth tanpa pernah menampilkan email ke UI.
- Audit log otomatis (trigger) untuk insert/update/delete pada tabel transaksi dan master data.
- Soft delete (`deleted_at`/`deleted_by`) pada tabel master dan transaksi.
- Private storage bucket + policy untuk dokumen (signed URL, bukan public).
- View agregasi (`v_ringkasan_anggaran`, `v_realisasi_bulanan`, `v_rekap_kendaraan`) — Pagu/Realisasi/Sisa dihitung di PostgreSQL, bukan di browser.
- Dashboard overview: KPI cards (Pagu, Realisasi, Sisa, Persentase) + grafik penyerapan bulanan, keduanya membaca data asli dari Supabase.
- Layout aplikasi: sidebar sesuai struktur menu final, topbar dengan selector Tahun Anggaran dan info user/role.
- Seed data contoh (fiktif) untuk TA 2026: 1 kegiatan pemeliharaan, 1 kendaraan, 1 transaksi pajak/pemeliharaan/BBM masing-masing.

**Phase 2 — Modul DPA (baru):**
- Halaman **DPA** (`#/anggaran/dpa`, juga dipakai oleh menu Kegiatan & Belanja): tree Kegiatan → Sub Kegiatan → Belanja, tambah data manual, pagu per belanja langsung ter-update ke dashboard (karena dashboard membaca dari view, bukan cache).
- Halaman **Import DPA** (`#/import/dpa`): alur penuh sesuai spec — Upload → Validasi File (tipe & ukuran) → Pemetaan Kolom (auto-guess dengan alias umum seperti "No Rekening"/"Kode Rekening", bisa diubah manual) → Preview & Validasi per baris (baris error ditampilkan terpisah, tidak ikut diimpor) → Konfirmasi eksplisit dari user → Import (insert kegiatan/sub kegiatan baru bila belum ada, update pagu bila belanja sudah ada, tidak pernah menghapus data lama) → Log ke `dpa_import_log` → ringkasan hasil (Data Baru/Diperbarui/Tidak Berubah/Error).
- Tombol "Unduh Template Excel" menghasilkan file `.xlsx` dengan header dan satu baris contoh.

Modul lain sudah berfungsi nyata melalui Phase 3-7 (KIB, transaksi Pajak/Pemeliharaan/BBM, monitoring per-Nopol, laporan/export, Data Quality Center, User Management). Satu-satunya halaman yang masih placeholder eksplisit adalah **Administrasi > Pengaturan** (`#/admin/pengaturan`) — belum ada spesifikasi kontennya. Roadmap lengkap ada di bawah.

**Phase 7 — Administrasi & hardening (baru):**
- **User Management** (`#/admin/user`, super_admin): daftar user, tambah user baru (lewat Edge Function `create-user` ber-service_role, karena RLS `profiles` sengaja tidak mengizinkan INSERT langsung dari client), ubah role/OPD/nama (langsung lewat client karena super_admin sudah diizinkan RLS), nonaktifkan/aktifkan akun, reset password (lewat Edge Function `reset-user-password`).
- **OPD** & **Tahun Anggaran** (`#/admin/opd`, `#/admin/tahun-anggaran`): CRUD dasar; mengaktifkan Tahun Anggaran otomatis menonaktifkan yang lama (dijaga unique partial index di DB, bukan cuma di UI).
- **Audit Log** (`#/admin/audit-log`): viewer read-only atas tabel `audit_logs` yang sudah lama tercatat trigger-nya sejak Phase 1, dengan filter tabel/aksi/tanggal dan detail before/after per baris.
- **Data Quality Center** (`#/admin/data-quality`): pemeriksaan read-only (Sub Kegiatan tanpa Belanja, Belanja Pagu Rp0, KIB kendaraan tidak lengkap, kendaraan aktif belum ada Pajak STNK tahun berjalan, Pajak/Perijinan lewat masa berlaku).
- **Security hardening**: migration `0005_phase7_hardening.sql` memperbaiki 8 view yang ditandai ERROR oleh Supabase Database Linter (`security_definer_view`) dengan mengaktifkan `security_invoker`.
- **CI**: `.github/workflows/ci.yml` menjalankan `npm ci && npm run build` di setiap push/PR untuk menangkap kegagalan build sebelum sampai ke Vercel.
- **Deployment**: lihat `docs/DEPLOYMENT.md` untuk checklist pemisahan environment staging/production.

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local   # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
npm run dev
```

Build produksi:

```bash
npm run build
```

## Setup Supabase

1. Buat project baru di Supabase.
2. Jalankan migration secara berurutan (Supabase CLI atau SQL Editor):
   ```
   supabase/migrations/0001_schema.sql
   supabase/migrations/0002_views.sql
   supabase/migrations/0003_rls.sql
   supabase/migrations/0004_auth_username.sql
   supabase/migrations/0005_triggers.sql
   supabase/migrations/0006_storage.sql
   ```
3. (Opsional, dev only) Jalankan `supabase/seed.sql` untuk data contoh.
4. **User admin pertama** — tidak bisa dibuat lewat SQL biasa karena harus melalui Supabase Auth:
   - Buat user di Supabase Dashboard → Authentication → Users, dengan email placeholder apa saja (mis. `admin@internal.simbmd.local`) dan password awal.
   - Catat `user id` yang dihasilkan.
   - Insert baris `profiles` dengan `id` = user id tersebut, `username` = username yang ingin dipakai untuk login, `role = 'super_admin'`, `opd_id` sesuai OPD.
   - Selanjutnya, pembuatan user baru sebaiknya melalui halaman Administrasi → User (Phase 7), yang akan memanggil Supabase Admin API dari Edge Function — bukan dari frontend.

## Deployment

- **GitHub**: push folder ini sebagai repo `sim-bmd`, branch `main` + `development`.
- **Vercel**: import repo, set environment variables `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` di Vercel project settings (jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` di Vercel env yang exposed ke frontend build).
- **Supabase**: gunakan project terpisah untuk production; jalankan migration yang sama.

## Keamanan — hal yang wajib diperhatikan sebelum production

- `SUPABASE_SERVICE_ROLE_KEY` tidak pernah dipakai di frontend. Jika Phase 7 (user management, import Excel besar) membutuhkan hak istimewa, gunakan Supabase Edge Function dengan secret tersimpan di environment Supabase, bukan Vercel.
- Rate limiting percobaan login sebaiknya dikonfigurasi di level Supabase Auth (lihat pengaturan project) di luar kode aplikasi ini.
- Validasi file upload (tipe, ukuran) sudah diberlakukan di bucket policy (`0006_storage.sql`), tapi validasi tambahan di sisi client (sebelum upload) perlu ditambahkan di Phase 4/7 untuk UX yang lebih baik.

## Roadmap Phase 2–8

| Phase | Cakupan | Status |
|---|---|---|
| 1 | Foundation, auth, skema DB penuh, RLS, dashboard shell | ✅ Selesai |
| 2 | Modul DPA: CRUD kegiatan/sub kegiatan/belanja, import Excel dengan preview & validasi | ✅ Selesai |
| 3 | Modul KIB: CRUD kendaraan & peralatan, import Excel dengan deteksi duplikat (Nopol/rangka/mesin), mapping kolom fleksibel | ✅ Selesai |
| 4 | Transaksi: Pajak/Perijinan (dengan reminder jatuh tempo), Pemeliharaan, BBM/Kupon (dengan perhitungan otomatis) | ✅ Selesai |
| 5 | Dashboard lanjutan: monitoring per Nopol, grafik per jenis belanja, notification center | ✅ Selesai |
| 6 | Reporting: export Excel/CSV/PDF/print berdasarkan filter aktif | ✅ Selesai |
| 7 | Security hardening: halaman User Management (via Edge Function + Admin API), Data Quality Center, audit log viewer | ✅ Selesai |
| 8 | Deployment production: GitHub Actions (opsional), Vercel production env, Supabase production project | 🟡 Tooling siap — provisioning akun/project production masih perlu dilakukan manual, lihat `docs/DEPLOYMENT.md` |

## Struktur folder

```
sim-bmd/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── src/
│   ├── main.js
│   ├── components/      # Sidebar, Topbar
│   ├── layouts/          # AppLayout
│   ├── pages/            # LoginPage, DashboardPage, ...
│   ├── services/         # authService, anggaranService, ...
│   ├── lib/               # supabaseClient
│   ├── utils/             # format.js
│   ├── validators/        # (Phase 2+: Excel/import validation)
│   ├── charts/             # (Phase 5+)
│   └── styles/             # main.css (design tokens)
└── supabase/
    ├── migrations/        # 0001–0006, urutan penting
    └── seed.sql
```
