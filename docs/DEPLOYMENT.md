# Panduan Deployment Produksi — SIMBMD

Dokumen ini adalah checklist dan prosedur untuk mempersiapkan SIMBMD ke
lingkungan production yang terpisah dari yang dipakai sekarang untuk
development/testing. **Langkah-langkah yang butuh akses akun (membuat project
Supabase baru, mengatur env var di Vercel Dashboard, dsb.) harus dilakukan
manual oleh Administrator** — tidak bisa dilakukan lewat kode.

## 1. Pemisahan lingkungan (Staging vs Production)

Saat ini aplikasi memakai **satu** Supabase project (`mmuxsxcnihfztmajowhl`)
untuk semua kebutuhan. Untuk production yang aman, disarankan:

| | Staging (sekarang) | Production (baru) |
|---|---|---|
| Supabase project | mmuxsxcnihfztmajowhl | project baru terpisah |
| Vercel deployment | branch `main` → domain `simpelbmd.vercel.app` | custom domain, project Vercel terpisah atau environment "Production" khusus |
| Data | boleh berisi data uji coba | hanya data riil |

**Langkah manual (di Supabase Dashboard):**
1. Buat Supabase project baru khusus production.
2. Jalankan seluruh migration secara berurutan (lihat §2).
3. Deploy Edge Functions ke project baru ini juga (lihat §3) — Edge Function
   ter-deploy per-project, tidak otomatis ikut project lama.
4. Buat user pertama (`super_admin`) secara manual lewat SQL Editor + Auth
   Dashboard (lihat catatan di bagian "Membuat akun" pada percakapan
   sebelumnya), karena `create-user` butuh SATU super_admin yang sudah ada
   untuk memanggilnya.

## 2. Menjalankan migration ke project baru

Migration ada di `supabase/migrations/`, urutkan sesuai nomor file:

```
0001_schema.sql
0002_rls_policies.sql
0003_storage_policies.sql
0004_phase5_views.sql
0005_phase7_hardening.sql
```

Cara apply (pilih salah satu):
- **Supabase CLI** (direkomendasikan): `supabase link --project-ref <ref-production>` lalu `supabase db push`.
- **Manual**: copy-paste isi tiap file secara berurutan ke SQL Editor project production.

## 3. Deploy Edge Functions

```bash
supabase functions deploy create-user --project-ref <ref-production>
supabase functions deploy reset-user-password --project-ref <ref-production>
```

Set secret tambahan (opsional, default `simbmd.local` kalau tidak diset):

```bash
supabase secrets set AUTH_INTERNAL_DOMAIN=simbmd.local --project-ref <ref-production>
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY` **otomatis**
tersedia sebagai env var di setiap Edge Function — tidak perlu di-set manual.

## 4. Environment variable di Vercel

Di **Vercel Dashboard → Project → Settings → Environment Variables**, set untuk
environment "Production":

```
VITE_SUPABASE_URL=<url project production>
VITE_SUPABASE_ANON_KEY=<anon key project production>
VITE_AUTH_INTERNAL_DOMAIN=simbmd.local
```

**JANGAN PERNAH** menaruh `SUPABASE_SERVICE_ROLE_KEY` di Vercel/frontend mana
pun — key itu hanya boleh ada di Edge Function runtime (auto-provided).

## 5. CI/CD

`.github/workflows/ci.yml` sudah ditambahkan: setiap push/PR ke `main` akan
menjalankan `npm ci && npm run build` di GitHub Actions. Ini menangkap
kegagalan build (misalnya dependency yang lupa di-commit, seperti kasus
`chart.js` sebelumnya) **sebelum** sampai ke Vercel — cek tab "Actions" di
GitHub setelah push.

Vercel sendiri sudah otomatis build & deploy tiap push ke `main` (lihat
konfigurasi project di Vercel Dashboard) — CI ini murni lapisan tambahan
untuk memberi sinyal lebih cepat + jadi status check yang bisa dipasang wajib
lolos sebelum merge PR (Settings → Branches → Branch protection rules, opsional).

## 6. Checklist sebelum go-live

- [ ] Migration 0001–0005 sudah dijalankan di project production
- [ ] Edge Functions `create-user` & `reset-user-password` sudah di-deploy
- [ ] Minimal satu akun `super_admin` sudah bisa login di project production
- [ ] Env var Vercel (production) menunjuk ke project Supabase production, BUKAN staging
- [ ] Custom domain (kalau ada) sudah terpasang & SSL aktif
- [ ] `supabase/migrations/0005_phase7_hardening.sql` sudah diverifikasi tidak merusak akses (test login tiap role: super_admin, admin_opd, operator, viewer)
- [ ] Backup/retensi database production sudah diaktifkan (Supabase Dashboard → Database → Backups)
- [ ] Domain lama (staging) tidak lagi dipakai untuk data produksi riil

## 7. Rollback

- **Kode**: Vercel menyimpan riwayat deployment — tinggal klik "Promote to
  Production" pada deployment sebelumnya di Vercel Dashboard.
- **Migration**: migration di atas bersifat additive/idempotent-safe (tidak
  ada DROP TABLE), jadi rollback skema jarang dibutuhkan. Kalau
  `0005_phase7_hardening.sql` ternyata menyebabkan akses data hilang untuk
  role tertentu, jalankan `alter view <nama> set (security_invoker = off);`
  untuk view yang bermasalah sebagai mitigasi sementara sambil RLS-nya
  diperbaiki, lalu re-apply setelah policy dikoreksi.
