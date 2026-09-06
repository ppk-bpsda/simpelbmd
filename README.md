# SIMPELBMD
Sistem Manajemen Pemeliharaan & Barang Milik Daerah — static site (HTML/CSS/JS) + Supabase (Auth + Postgres).

Status: **Seluruh 8 modul utama sudah berfungsi penuh** — Login, Dashboard, DPA, Realisasi, Anggaran Kas, Pengadaan (BMD + BBM), Distribusi BBM (kendaraan + kupon), Pemeliharaan (kendaraan + peralatan), Master Data, dan Laporan. Semua CRUD, validasi, dan perhitungan terhubung langsung ke Supabase. Hanya **Pengaturan Akun** (kelola pengguna) yang masih berupa halaman "dalam pengembangan".

### Yang sudah bisa dipakai di modul DPA
- Tambah/edit DPA dengan rincian rekening dinamis (baris bisa ditambah/dihapus), Jumlah dihitung otomatis (Volume × Harga Satuan), Total Pagu otomatis.
- Tambah rekening baru langsung dari form (tanpa harus ke Master Data dulu).
- Import rincian dari Excel (kolom: `kode_rekening`, `satuan`, `volume`, `harga_satuan`) dengan preview & validasi baris sebelum disimpan.
- Export daftar DPA ke Excel.
- Soft delete dengan konfirmasi.
- Semua tersaring otomatis mengikuti Tahun Anggaran & Tahapan aktif di topbar.

### Yang sudah bisa dipakai di modul Anggaran Kas
- Ringkasan per rekening: Anggaran Kas, Realisasi, dan Sisa — dihitung otomatis dari view database.
- Grafik Cash Flow bulanan (Anggaran Kas vs Realisasi) di seluruh rekening.
- Editor 12 bulan per rekening dalam satu form: isi nilai tiap bulan, lihat realisasi (otomatis, readonly) dan sisa per bulan secara langsung, simpan sekaligus (upsert).
- Tambah rekening baru langsung dari form, export ke Excel.

### Yang sudah bisa dipakai di modul Pengadaan
**Tab Pengadaan BMD:**
- Tambah/edit pengadaan dengan rincian item barang dinamis (nama, merk/tipe, jumlah, satuan, harga satuan), Total dihitung otomatis.
- Kategori BMD (Kendaraan/Peralatan/Mesin/Perlengkapan/BMD Lainnya), status (Proses/Selesai/Dibatalkan), nomor kontrak/SPK.
- Tambah rekening & penyedia baru langsung dari form. Filter kategori, pencarian, export Excel, soft delete.

**Tab Penyediaan BBM:**
- Tambah/edit penyediaan BBM per jenis BBM, Nilai dihitung otomatis (Volume × Harga).
- Terhubung ke rekening & penyedia yang sama dengan Master Data. Export Excel, soft delete.

### Yang sudah bisa dipakai di modul Realisasi
- Tambah/edit transaksi realisasi dengan nomor transaksi otomatis.
- Saat memilih rekening & tanggal, sistem langsung menampilkan **Pagu DPA, Realisasi Sebelumnya, Sisa Pagu, dan Anggaran Kas bulan tersebut** — dihitung dari view database, bukan manual.
- **Validasi blocking**: transaksi tidak bisa disimpan jika nilainya melebihi sisa pagu DPA rekening tersebut.
- **Validasi warning**: peringatan (tetap bisa disimpan) jika transaksi membuat realisasi bulan berjalan melebihi Anggaran Kas.
- Alur status: Draft → diajukan verifikasi → Diverifikasi → disetujui/ditolak Admin. Operator tidak bisa menyetujui/menolak sendiri.
- Hapus (soft delete) hanya untuk Admin dan hanya pada status Draft.
- Filter status & rekening, pencarian, export Excel.
- Setiap aksi (buat, ubah, setujui, tolak, hapus) tercatat ke `audit_logs`.

### Yang sudah bisa dipakai di modul Distribusi BBM
- **Master Kendaraan**: CRUD lengkap (nopol, merk, tipe, jenis BBM, unit pengguna, status kendaraan).
- **Kupon BBM**: terbitkan kupon dengan alur status Dibuat → Didistribusikan → Digunakan → Direalisasikan (atau Dibatalkan). Validasi kilometer akhir tidak boleh lebih kecil dari kilometer awal maupun dari transaksi sebelumnya kendaraan yang sama. Soft delete, tidak pernah dihapus permanen.

### Yang sudah bisa dipakai di modul Pemeliharaan
- **Pemeliharaan Kendaraan**: jenis pemeliharaan terstandar (servis berkala, ganti oli, ban, rem, dst), Total dihitung otomatis (Volume × Harga + Jasa).
- **Pemeliharaan Peralatan**: terhubung ke Master Peralatan yang bisa dikelola langsung dari halaman ini (tambah/edit/hapus tanpa pindah menu).
- Riwayat per kendaraan/peralatan, filter, export Excel.

### Yang sudah bisa dipakai di modul Master Data (khusus Administrator)
- CRUD penuh untuk Rekening (nonaktifkan, bukan hapus permanen), Penyedia, Jenis BBM, dan Satuan.

### Yang sudah bisa dipakai di modul Laporan
- **Anggaran vs Realisasi**: per rekening, dengan baris Total otomatis.
- **Pemeliharaan Kendaraan**: filter rentang tanggal, Total otomatis.
- **BBM**: rekap bulanan dan rekap per kendaraan.
- Semua laporan punya tombol **Cetak/PDF** (memakai print dialog browser, sidebar & tombol otomatis disembunyikan saat cetak) dan **Export Excel**.

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

## 4. Rencana pengembangan lanjutan

| Fase | Modul | Status |
|---|---|---|
| 1–2 | Arsitektur, skema DB, desain UI dasar | ✅ Selesai |
| 3 | Autentikasi & otorisasi (RBAC admin/operator) | ✅ Selesai |
| 4 | Modul DPA (CRUD, import/export Excel) | ✅ Selesai |
| 5 | Modul Pengadaan (BMD & BBM) | ✅ Selesai |
| 6 | Anggaran Kas + grafik cash flow | ✅ Selesai |
| 7 | Realisasi + validasi pagu/anggaran kas | ✅ Selesai |
| 8 | Distribusi BBM (kendaraan, kupon) | ✅ Selesai |
| 9 | Pemeliharaan kendaraan & peralatan | ✅ Selesai |
| 10 | Laporan (preview, cetak, PDF, Excel) | ✅ Selesai |
| 11 | Master Data (rekening, penyedia, jenis BBM, satuan) | ✅ Selesai |
| 12 | Pengaturan Akun (kelola pengguna, ubah password, role) | ⏳ Berikutnya |
| 13 | Notifikasi realtime, global search lintas modul | ⏳ |
| 14 | Testing menyeluruh (fungsional, validasi, role, responsif, keamanan) | ⏳ |

Modul inti sudah lengkap dan bisa dipakai untuk operasional harian. Yang tersisa: **Pengaturan Akun** (agar Admin bisa menambah/menonaktifkan pengguna dan mengatur role langsung dari aplikasi, bukan lewat Supabase Dashboard), notifikasi dashboard yang benar-benar dinamis (saat ini masih contoh statis), dan pengujian menyeluruh sebelum dipakai produksi penuh. Beri tahu mana yang ingin dilanjutkan.
