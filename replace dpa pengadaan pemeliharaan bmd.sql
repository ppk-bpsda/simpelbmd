-- ==========================================================================
-- Diagnostik lanjutan -- jalankan tiap query terpisah, kirim hasilnya
-- ==========================================================================

-- 1. Definisi ASLI constraint yang sedang aktif di database (bukan asumsi
--    dari script manapun) -- ini kunci untuk tahu kenapa 'Sepeda Motor Matic'
--    ditolak padahal ada di daftar yang kita kirim.
select conname, pg_get_constraintdef(oid) as definisi
from pg_constraint
where conrelid = 'vehicle_category_rates'::regclass
  and contype = 'c';

-- 2. Apakah kode akun berikut memang ada di tabel accounts?
--    (account_id NULL di baris yang gagal tadi menandakan kode ini TIDAK
--    ketemu -- perlu dicek terlepas dari soal constraint di atas)
select *
from accounts
where kode in ('5.1.02.03.002.00038', '5.1.02.03.002.00035');

-- 3. Isi kolom vehicle_category_rates saat ini, untuk tahun 2026
select fiscal_year, kategori, tarif_bulanan, account_id
from vehicle_category_rates
where fiscal_year = 2026
order by kategori;
