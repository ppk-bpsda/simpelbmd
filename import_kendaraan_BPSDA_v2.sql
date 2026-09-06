-- ==========================================================================
-- SIMPELBMD -- Import/Koreksi 10 Kendaraan BPSDA dari KIB E-BMD 13 April 2026
-- Sumber: KIB_E-BMD_13_April_2026.xlsx (Aset Tetap Peralatan & Mesin,
--         Kuasa Pengguna Barang: Bagian Perekonomian dan Sumber Daya Alam)
--
-- Jalankan SETELAH migration_kategori_denominasi_v2.sql.
-- Aman dijalankan berulang (upsert berdasarkan nomor_polisi) -- akan
-- MENGOREKSI data 10 kendaraan ini bila sebelumnya sudah pernah diimpor
-- lewat import_kendaraan_BPSDA.xlsx dengan kategori yang belum terpecah
-- matic/bebek.
--
-- CATATAN: Yamaha Vega R (baris KIB nopol) tercatat memiliki riwayat 3 plat
-- karena mutasi/registrasi ulang: "N 9784 EA / N 2540 KP / N 3140 JP".
-- Skrip ini memakai plat TERBARU (N 3140 JP) sebagai nomor polisi aktif.
-- Jenis BBM (Pertalite/Pertamax/dll) TIDAK diisi otomatis -- silakan
-- lengkapi manual lewat Distribusi BBM > Master Kendaraan sesuai BBM yang
-- benar-benar dipakai tiap kendaraan.
-- ==========================================================================

insert into vehicles (nomor_polisi, merk, tipe, tahun, jenis_kendaraan, kategori, unit_pengguna, status)
values
  ('N 1365 KP', 'Mitsubishi', 'Xpander Ultimate A/T', 2021, 'Station Wagon', 'Mobil Dinas Perorangan', 'Bagian Perekonomian dan Sumber Daya Alam', 'aktif'),
  ('N 1393 KP', 'Daihatsu',   'Luxio M/T',             2021, 'Mini Bus (Penumpang 14 Orang Kebawah)', 'Mobil Dinas Penumpang', 'Bagian Perekonomian dan Sumber Daya Alam', 'aktif'),
  ('N 3140 JP', 'Yamaha',     'Vega R',                2004, 'Sepeda Motor', 'Sepeda Motor Bebek/Manual', 'Bagian Perekonomian dan Sumber Daya Alam', 'aktif'),
  ('N 2308 KP', 'Honda',      'Supra Fit',             2008, 'Sepeda Motor', 'Sepeda Motor Bebek/Manual', 'Bagian Perekonomian dan Sumber Daya Alam', 'aktif'),
  ('N 3584 JP', 'Yamaha',     'Aerox ABS',             2021, 'Sepeda Motor', 'Sepeda Motor Matic', 'Bagian Perekonomian dan Sumber Daya Alam', 'aktif'),
  ('N 3581 JP', 'Yamaha',     'FreeGo',                2021, 'Sepeda Motor', 'Sepeda Motor Matic', 'Bagian Perekonomian dan Sumber Daya Alam', 'aktif'),
  ('N 3586 JP', 'Yamaha',     'Matic Aerox',           2021, 'Sepeda Motor', 'Sepeda Motor Matic', 'Bagian Perekonomian dan Sumber Daya Alam', 'aktif'),
  ('N 3580 JP', 'Yamaha',     'Matic Aerox',           2021, 'Sepeda Motor', 'Sepeda Motor Matic', 'Bagian Perekonomian dan Sumber Daya Alam', 'aktif'),
  ('N 3583 JP', 'Yamaha',     'Matic FreeGo',          2021, 'Sepeda Motor', 'Sepeda Motor Matic', 'Bagian Perekonomian dan Sumber Daya Alam', 'aktif'),
  ('N 3585 JP', 'Yamaha',     'Matic FreeGo',          2021, 'Sepeda Motor', 'Sepeda Motor Matic', 'Bagian Perekonomian dan Sumber Daya Alam', 'aktif')
on conflict (nomor_polisi) do update set
  merk = excluded.merk, tipe = excluded.tipe, tahun = excluded.tahun,
  jenis_kendaraan = excluded.jenis_kendaraan, kategori = excluded.kategori,
  unit_pengguna = excluded.unit_pengguna;

-- Selesai. Cek hasil: Distribusi BBM > Master Kendaraan -- 10 baris, badge
-- kategori pada kolom "Kategori" harus terbaca Matic / Bebek/Manual dengan
-- benar per unit (Aerox & FreeGo = Matic, Supra Fit & Vega = Bebek/Manual).
