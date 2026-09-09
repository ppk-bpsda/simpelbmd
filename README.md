# SIMBMD — Sistem Informasi Monitoring Barang Milik Daerah

Monitoring Anggaran • KIB • Pajak/Perijinan • Pemeliharaan • BBM

## Status saat ini: Phase 1 (Foundation) + Phase 2 (DPA) — selesai

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

Modul lain (import KIB, transaksi CRUD penuh, monitoring per-Nopol, laporan/export, notifikasi jatuh tempo, data quality center, user management UI) masih placeholder berlabel jelas "belum diimplementasikan" — sesuai prinsip di master prompt untuk tidak membuat fitur palsu yang terlihat bekerja. Roadmap-nya ada di bawah.

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
| 3 | Modul KIB: CRUD kendaraan & peralatan, import Excel dengan deteksi duplikat (Nopol/rangka/mesin), mapping kolom fleksibel | ⬜ Belum |
| 4 | Transaksi: Pajak/Perijinan (dengan reminder jatuh tempo), Pemeliharaan, BBM/Kupon (dengan perhitungan otomatis) | ⬜ Belum |
| 5 | Dashboard lanjutan: monitoring per Nopol, grafik per jenis belanja, notification center | ⬜ Belum |
| 6 | Reporting: export Excel/CSV/PDF/print berdasarkan filter aktif | ⬜ Belum |
| 7 | Security hardening: halaman User Management (via Edge Function + Admin API), Data Quality Center, audit log viewer | ⬜ Belum |
| 8 | Deployment production: GitHub Actions (opsional), Vercel production env, Supabase production project | ⬜ Belum |

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
