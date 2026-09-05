# SIMPELBMD
Sistem Manajemen Pemeliharaan & Barang Milik Daerah — static site (HTML/CSS/JS) + Supabase (Auth + Postgres).

Status: Login, shell aplikasi, dashboard, serta **modul DPA dan Realisasi sudah berfungsi penuh** (CRUD, validasi, terhubung Supabase). Modul Pengadaan, Anggaran Kas, BBM, Pemeliharaan, Laporan, dan Master Data masih berupa halaman "dalam pengembangan", menunggu giliran dibangun — persis alur Fase 3–13 di master prompt Anda.

### Yang sudah bisa dipakai di modul DPA
- Tambah/edit DPA dengan rincian rekening dinamis (baris bisa ditambah/dihapus), Jumlah dihitung otomatis (Volume × Harga Satuan), Total Pagu otomatis.
- Tambah rekening baru langsung dari form (tanpa harus ke Master Data dulu).
- Import rincian dari Excel (kolom: `kode_rekening`, `satuan`, `volume`, `harga_satuan`) dengan preview & validasi baris sebelum disimpan.
- Export daftar DPA ke Excel.
- Soft delete dengan konfirmasi.
- Semua tersaring otomatis mengikuti Tahun Anggaran & Tahapan aktif di topbar.

### Yang sudah bisa dipakai di modul Realisasi
- Tambah/edit transaksi realisasi dengan nomor transaksi otomatis.
- Saat memilih rekening & tanggal, sistem langsung menampilkan **Pagu DPA, Realisasi Sebelumnya, Sisa Pagu, dan Anggaran Kas bulan tersebut** — dihitung dari view database, bukan manual.
- **Validasi blocking**: transaksi tidak bisa disimpan jika nilainya melebihi sisa pagu DPA rekening tersebut.
- **Validasi warning**: peringatan (tetap bisa disimpan) jika transaksi membuat realisasi bulan berjalan melebihi Anggaran Kas.
- Alur status: Draft → diajukan verifikasi → Diverifikasi → disetujui/ditolak Admin. Operator tidak bisa menyetujui/menolak sendiri.
- Hapus (soft delete) hanya untuk Admin dan hanya pada status Draft.
- Filter status & rekening, pencarian, export Excel.
- Setiap aksi (buat, ubah, setujui, tolak, hapus) tercatat ke `audit_logs`.

## Struktur folder
```
simpelbmd/
├── index.html              # Halaman login
├── dashboard.html          # Dashboard (KPI, grafik, notifikasi)
├── dpa.html, pengadaan.html, anggaran-kas.html, realisasi.html,
│   bbm.html, pemeliharaan.html, laporan.html, master-data.html,
│   pengaturan.html         # Shell modul (siap diisi CRUD)
├── assets/css/style.css    # Semua styling & design tokens
├── assets/js/supabase-client.js  # Koneksi Supabase + login username
├── assets/js/app.js        # Sidebar, toast, guard, helper format
└── supabase_schema.sql     # Skema database lengkap + RLS
```

## 1. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor → New query**, tempel seluruh isi `supabase_schema.sql`, lalu **Run**. Ini membuat semua tabel (users, dpa, procurements, budget_cash, realization, vehicles, fuel_coupons, maintenance_vehicle, dst — 24+ tabel sesuai Bab 31), enum status, view perhitungan (pagu/realisasi/sisa/persentase), dan Row Level Security.
3. Buka **Project Settings → API**, salin `Project URL` dan `anon public key`.
4. Buka `assets/js/supabase-client.js`, ganti:
   ```js
   const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
   const SUPABASE_ANON_KEY = "YOUR-PUBLIC-ANON-KEY";
   ```
   dengan nilai project Anda. Anon key aman ditaruh di frontend karena semua akses data diproteksi RLS di database, bukan di key.
5. Buat akun admin pertama:
   - **Authentication → Users → Add user**: masukkan email internal (mis. `admin@simpelbmd.local`) dan password. Salin `User UID` yang dihasilkan.
   - Kembali ke **SQL Editor**, jalankan:
     ```sql
     insert into users (id, username, email, full_name, role)
     values ('<UID-tadi>', 'admin', 'admin@simpelbmd.local', 'Administrator', 'admin');
     ```
   - Login di aplikasi memakai **username** `admin` + password yang tadi dibuat (bukan email — sesuai Bab 4 & 38 spesifikasi).

## 2. Push ke GitHub

```bash
cd simpelbmd
git init
git add .
git commit -m "Inisialisasi SIMPELBMD"
git branch -M main
git remote add origin https://github.com/USERNAME/simpelbmd.git
git push -u origin main
```

## 3. Deploy ke Vercel

**Opsi A — Dashboard:**
1. Buka [vercel.com/new](https://vercel.com/new), pilih repo `simpelbmd`.
2. Framework preset: pilih **Other** (situs statis, tidak butuh build command).
3. Output directory: biarkan default (root `.`).
4. Klik **Deploy**.

**Opsi B — CLI:**
```bash
npm i -g vercel
cd simpelbmd
vercel --prod
```

Karena ini situs statis murni (tanpa build step), tidak ada environment variable server yang diperlukan — kredensial Supabase sudah tertanam di `supabase-client.js` sebagai anon key publik yang aman.

## 4. Rencana pengembangan lanjutan (mengikuti Fase 3–13 dokumen Anda)

| Fase | Modul | Status |
|---|---|---|
| 1–2 | Arsitektur, skema DB, desain UI dasar | ✅ Selesai |
| 3 | Autentikasi & otorisasi (RBAC admin/operator) | ✅ Selesai |
| 4 | Modul DPA (CRUD, import/export Excel) | ⏳ Berikutnya |
| 5 | Modul Pengadaan (BMD & BBM) | ⏳ |
| 6 | Anggaran Kas + grafik cash flow | ⏳ |
| 7 | Realisasi + validasi pagu/anggaran kas | ⏳ |
| 8 | Distribusi BBM (kendaraan, kupon) | ⏳ |
| 9 | Pemeliharaan kendaraan & peralatan | ⏳ |
| 10 | Laporan (preview, cetak, PDF, Excel) | ⏳ |
| 11 | Master Data (organisasi, rekening, dll) | ⏳ |
| 12 | Notifikasi, global search, audit trail UI | ⏳ |
| 13 | Testing (fungsional, validasi, role, responsif) | ⏳ |

Beri tahu modul mana yang ingin dibangun lebih dulu (mis. **DPA** atau **Realisasi**), dan saya lanjutkan dengan form input, tabel data (search/filter/sort/pagination), validasi, dan koneksi penuh ke Supabase untuk modul tersebut.
