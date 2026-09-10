-- =========================================================
-- SIMPELBMD — seed.sql
-- Data contoh/dummy (§42). HANYA untuk environment development/staging.
-- JANGAN dijalankan di database produksi.
-- =========================================================

-- ---------------------------------------------------------
-- 1. OPD contoh
-- ---------------------------------------------------------
insert into opd (id, kode_opd, nama_opd, status) values
  ('11111111-1111-1111-1111-111111111111', 'OPD-01', 'Dinas Perhubungan (Contoh)', 'aktif'),
  ('22222222-2222-2222-2222-222222222222', 'OPD-02', 'Dinas Pekerjaan Umum (Contoh)', 'aktif')
on conflict (kode_opd) do nothing;

-- ---------------------------------------------------------
-- 2. Tahun Anggaran 2026 (aktif)
-- ---------------------------------------------------------
insert into tahun_anggaran (id, tahun, status_aktif) values
  ('aaaaaaaa-0000-0000-0000-000000000026', 2026, true)
on conflict (tahun) do nothing;

-- ---------------------------------------------------------
-- 3. Bootstrap user SUPER_ADMIN untuk development lokal
-- Username: superadmin   Password: SimpelBmd#2026 (GANTI setelah login pertama!)
-- Trik ini hanya untuk seed LOKAL; di produksi, user dibuat lewat Edge
-- Function `create-user` (service_role), bukan lewat SQL manual.
-- ---------------------------------------------------------
do $$
declare
  v_user_id uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
begin
  if not exists (select 1 from auth.users where id = v_user_id) then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'superadmin@simbmd.local', crypt('SimpelBmd#2026', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}', '{}'
    );
  end if;

  insert into profiles (id, username, nama, role, opd_id, status)
  values (v_user_id, 'superadmin', 'Administrator Sistem', 'super_admin', null, 'aktif')
  on conflict (id) do nothing;
end $$;

-- ---------------------------------------------------------
-- 4. Kegiatan & Sub Kegiatan & Belanja (contoh, data fiktif)
-- ---------------------------------------------------------
insert into kegiatan (id, tahun_anggaran_id, opd_id, kode_kegiatan, nama_kegiatan) values
  ('bbbbbbbb-0001-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000026',
   '11111111-1111-1111-1111-111111111111', '2.10.02', 'Penyediaan BMD Penunjang Urusan Pemerintahan'),
  ('bbbbbbbb-0002-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000026',
   '11111111-1111-1111-1111-111111111111', '2.10.03', 'Pemeliharaan Barang Milik Daerah Penunjang Urusan Pemerintahan')
on conflict do nothing;

insert into sub_kegiatan (id, kegiatan_id, kode_sub_kegiatan, nama_sub_kegiatan) values
  ('cccccccc-0001-0000-0000-000000000001', 'bbbbbbbb-0001-0000-0000-000000000001', '2.10.02.001', 'Penyediaan Pajak dan Perijinan Kendaraan Dinas'),
  ('cccccccc-0002-0000-0000-000000000002', 'bbbbbbbb-0002-0000-0000-000000000002', '2.10.03.001', 'Pemeliharaan Kendaraan Dinas dan Operasional')
on conflict do nothing;

insert into belanja (id, sub_kegiatan_id, kode_rekening, nama_belanja, kelompok, pagu) values
  ('dddddddd-0001-0000-0000-000000000001', 'cccccccc-0001-0000-0000-000000000001',
   '5.1.02.01.01.0011', 'Belanja Pajak Kendaraan Dinas', 'pajak_perijinan', 25000000),
  ('dddddddd-0002-0000-0000-000000000002', 'cccccccc-0002-0000-0000-000000000002',
   '5.1.02.02.05.0001', 'Belanja Pemeliharaan Kendaraan Dinas', 'pemeliharaan', 60000000),
  ('dddddddd-0003-0000-0000-000000000003', 'cccccccc-0002-0000-0000-000000000002',
   '5.1.02.02.01.0003', 'Belanja BBM Kendaraan Dinas', 'bbm', 40000000)
on conflict do nothing;

-- ---------------------------------------------------------
-- 5. KIB + Kendaraan contoh (data fiktif)
-- ---------------------------------------------------------
insert into kib (id, tahun_anggaran_id, opd_id, kategori, kode_barang, register, nama_barang, merk, type,
                  tahun_perolehan, nilai_perolehan, kondisi, lokasi, pengguna)
values
  ('eeeeeeee-0001-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000026',
   '11111111-1111-1111-1111-111111111111', 'kendaraan', '3.02.01.01.001', 'REG-0001',
   'Kendaraan Operasional Roda 4', 'Toyota', 'Innova Zenix', 2023, 380000000, 'baik',
   'Garasi Kantor Dinas', 'Kepala Dinas')
on conflict do nothing;

insert into kendaraan (id, kib_id, nopol, nomor_rangka, nomor_mesin, nomor_bpkb, jenis_kendaraan,
                        status, penanggung_jawab, unit_kerja)
values
  ('ffffffff-0001-0000-0000-000000000001', 'eeeeeeee-0001-0000-0000-000000000001',
   'N 1234 AB', 'MHFXX1234567890', 'DE1234567', 'BPKB-000123456', 'Minibus',
   'aktif', 'Budi Santoso', 'Sekretariat')
on conflict do nothing;

-- ---------------------------------------------------------
-- 6. Transaksi contoh: pajak, pemeliharaan, BBM
-- ---------------------------------------------------------
insert into pajak_perijinan (kendaraan_id, belanja_id, tahun_anggaran_id, tanggal, jenis,
                              nomor_dokumen, masa_berlaku, nilai, sumber_anggaran)
values
  ('ffffffff-0001-0000-0000-000000000001', 'dddddddd-0001-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000026', '2026-02-10', 'pajak_stnk',
   'STNK-2026-0001', '2027-02-09', 3200000, 'APBD');

insert into pemeliharaan (kendaraan_id, belanja_id, tahun_anggaran_id, tanggal, jenis, bengkel,
                           nomor_dokumen, uraian, sparepart, jasa, kilometer)
values
  ('ffffffff-0001-0000-0000-000000000001', 'dddddddd-0002-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000026', '2026-03-05', 'servis_rutin', 'Bengkel Resmi Toyota',
   'INV-2026-0088', 'Servis berkala 20.000 km', 850000, 450000, 20120);

insert into bbm (kendaraan_id, belanja_id, tahun_anggaran_id, tanggal, jenis_bbm, nomor_kupon,
                  liter, harga_per_liter, kilometer_awal, kilometer_akhir, pengemudi)
values
  ('ffffffff-0001-0000-0000-000000000001', 'dddddddd-0003-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000026', '2026-03-12', 'pertamax', 'KUP-2026-000045',
   40, 13500, 20120, 20410, 'Ahmad Yani');
