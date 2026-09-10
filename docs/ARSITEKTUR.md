# SIMPELBMD — Arsitektur Sistem

Dokumen ini adalah rancangan yang dibuat **sebelum** implementasi kode, sesuai permintaan: arsitektur, ERD, skema database, matriks role & permission, strategi RLS, struktur folder, dan roadmap pengembangan.

---

## 1. Arsitektur Sistem (High Level)

```
┌──────────────────────────────────────────────────────────────┐
│                        BROWSER (Client)                       │
│  Vite + Vanilla JS ES6 (modular) + Chart.js + hash router     │
│  - pages/  components/  layouts/  services/  validators/      │
└───────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (anon key only)
┌───────────────────────────▼────────────────────────────────────┐
│                          SUPABASE                              │
│  ┌───────────────┐ ┌───────────────┐ ┌────────────────────┐   │
│  │  Supabase Auth │ │  PostgreSQL   │ │  Supabase Storage   │   │
│  │  (users)       │ │  + RLS        │ │  (private buckets)  │   │
│  │                │ │  + Views      │ │  + signed URL       │   │
│  │                │ │  + Functions  │ │                      │   │
│  │                │ │  + Triggers   │ │                      │   │
│  └───────────────┘ └───────────────┘ └────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                             │
                        GitHub (simpelbmd) ──▶ Vercel (build & deploy)
```

Prinsip kunci:
- **Tidak ada server aplikasi kustom** — semua logika otorisasi ditegakkan di database (RLS + `SECURITY DEFINER` functions), bukan hanya di frontend.
- Frontend hanya memegang `anon key`. `service_role key` **tidak pernah** ada di frontend/GitHub — hanya dipakai di Supabase Edge Function bila benar-benar diperlukan (mis. admin membuat user baru).
- Username ≠ email. Auth Supabase tetap berbasis email secara internal, tapi mapping `username → email internal (sintetik, domain privat)` disimpan di tabel `profiles` dan tidak pernah ditampilkan ke user.

---

## 2. Alur Konsep Utama

```
Tahun Anggaran ─▶ OPD ─▶ Kegiatan ─▶ Sub Kegiatan ─▶ Belanja
                                                          │
                                                          ▼
                                              Aset/Kendaraan (KIB)
                                                          │
                              ┌───────────────┬───────────┴──────────┐
                              ▼               ▼                      ▼
                       Pajak/Perijinan   Pemeliharaan               BBM/Kupon
                              │               │                      │
                              └───────────────┴──────────┬───────────┘
                                                          ▼
                                                Realisasi & Monitoring
```

---

## 3. ERD (ringkas)

```
tahun_anggaran ──< kegiatan ──< sub_kegiatan ──< belanja
opd ──< kib
kib ──< kendaraan (1:1, khusus kategori kendaraan)
kendaraan ──< pajak_perijinan
kendaraan ──< pemeliharaan
kendaraan ──< bbm
belanja ──< pajak_perijinan / pemeliharaan / bbm  (transaksi dikaitkan ke belanja utk realisasi)
users(profiles) ──< audit_logs
dokumen  >── (polymorphic: table_name + record_id)
import_logs  (riwayat import DPA/KIB)
```

Detail kolom lengkap ada pada migration SQL (`supabase/migrations/0001_schema.sql`).

---

## 4. Matriks Role & Permission

| Modul                     | SUPER_ADMIN | ADMIN_OPD (OPD sendiri) | OPERATOR (OPD sendiri) | VIEWER (OPD sendiri) |
|---------------------------|:-----------:|:-----------------------:|:-----------------------:|:--------------------:|
| Tahun Anggaran (CRUD)     | ✅          | ❌ (read)                | ❌ (read)                | ❌ (read)             |
| OPD (CRUD)                | ✅          | ❌ (read)                | ❌ (read)                | ❌ (read)             |
| User Management           | ✅          | ❌                       | ❌                       | ❌                    |
| DPA / Kegiatan / Belanja  | ✅ CRUD     | ✅ CRUD (OPD sendiri)    | ✅ Create/Update         | 👁 Read only         |
| Import DPA/KIB            | ✅          | ✅                       | ✅ (upload only)         | ❌                    |
| KIB Kendaraan/Peralatan   | ✅ CRUD     | ✅ CRUD                  | ✅ Create/Update         | 👁 Read only         |
| Pajak/Perijinan           | ✅ CRUD     | ✅ CRUD                  | ✅ Create/Update         | 👁 Read only         |
| Pemeliharaan              | ✅ CRUD     | ✅ CRUD                  | ✅ Create/Update         | 👁 Read only         |
| BBM/Kupon                 | ✅ CRUD     | ✅ CRUD                  | ✅ Create/Update         | 👁 Read only         |
| Dashboard & Monitoring    | ✅ semua OPD| ✅ OPD sendiri           | ✅ OPD sendiri           | ✅ OPD sendiri        |
| Laporan/Export            | ✅          | ✅                       | ✅                       | ✅                    |
| Audit Log                 | ✅ (read, no delete) | 👁 OPD sendiri (read) | ❌                  | ❌                    |
| Soft-delete restore       | ✅          | ❌                       | ❌                       | ❌                    |

Catatan: OPERATOR **tidak dapat menghapus** (delete diarahkan ke soft delete dan hanya ADMIN_OPD/SUPER_ADMIN yang dapat melakukannya).

---

## 5. Strategi RLS

1. Setiap tabel transaksi menyimpan `opd_id` (langsung atau melalui join `kib`/`kendaraan`).
2. Fungsi helper `SECURITY DEFINER`:
   - `auth.current_profile()` → mengembalikan role + opd_id user yang sedang login (dibaca dari tabel `profiles`, bukan JWT mentah, agar mudah direvokasi).
   - `is_super_admin()`, `is_admin_opd()`, `opd_of_user()`.
3. Policy pola umum per tabel:
   - `SELECT`: `is_super_admin() OR opd_id = opd_of_user()`
   - `INSERT/UPDATE`: role IN (super_admin, admin_opd, operator) DAN `opd_id = opd_of_user()` (kecuali super_admin)
   - `DELETE` (soft delete via UPDATE `deleted_at`): hanya admin_opd/super_admin
   - VIEWER: hanya `SELECT`, tidak ada policy untuk write.
4. `audit_logs`: `INSERT` oleh trigger (SECURITY DEFINER, bukan langsung oleh user), `SELECT` terbatas, **tidak ada** policy `DELETE`/`UPDATE` untuk role apa pun selain lewat fungsi admin khusus (dan sebaiknya dikunci total, hanya bisa dibersihkan lewat retensi terjadwal di server).
5. Storage: bucket `documents` bersifat **private**; akses baca melalui `createSignedUrl` setelah RLS pada tabel `dokumen` memverifikasi kepemilikan OPD.

---

## 6. Struktur Folder

```
simpelbmd/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── .gitignore
├── README.md
├── src/
│   ├── main.js              # bootstrap + router
│   ├── app.js                # inisialisasi layout & guard auth
│   ├── router.js
│   ├── lib/
│   │   └── supabaseClient.js
│   ├── services/             # akses data (1 modul = 1 domain)
│   │   ├── authService.js
│   │   ├── anggaranService.js
│   │   ├── kibService.js
│   │   ├── pajakService.js
│   │   ├── pemeliharaanService.js
│   │   ├── bbmService.js
│   │   ├── importService.js
│   │   └── auditService.js
│   ├── validators/
│   ├── utils/
│   ├── charts/
│   ├── components/
│   ├── layouts/
│   │   └── MainLayout.js
│   ├── pages/
│   │   ├── Login.js
│   │   └── Dashboard.js
│   └── styles/
│       └── main.css
├── supabase/
│   ├── migrations/
│   │   ├── 0001_schema.sql
│   │   ├── 0002_rls_policies.sql
│   │   └── 0003_storage_policies.sql
│   ├── functions/
│   └── seed.sql
└── public/
```

---

## 7. Roadmap Pengembangan (mengikuti brief §49)

| Phase | Isi | Status di deliverable ini |
|-------|-----|----------------------------|
| 1 | Project setup, Supabase client, auth, layout, sidebar, dashboard dasar | ✅ Selesai |
| 2 | DPA: kegiatan, sub kegiatan, belanja, import DPA | ✅ Selesai |
| 3 | KIB: kendaraan, peralatan, import KIB | ✅ Selesai |
| 4 | Transaksi: pajak, perijinan, pemeliharaan, BBM | ✅ Selesai |
| 5 | Dashboard lanjutan: anggaran, realisasi, bulanan, per-nopol | ✅ **Dibangun sekarang** |
| 6 | Reporting: Excel/PDF/print | ⏳ belum |
| 7 | Security hardening: audit lanjutan, rate limiting login, upload validation | 🔶 fondasi RLS/audit sudah ada, hardening lanjut menyusul |
| 8 | Deployment produksi (GitHub + Vercel + Supabase prod) | ⏳ instruksi disiapkan di README |

Skema database (migration) sengaja dibuat **lengkap dari awal** (mencakup kebutuhan Phase 1–8) sesuai instruksi, supaya modul berikutnya tidak memerlukan perubahan struktural besar.
