-- ==========================================================================
-- SIMPELBMD — Reset Data (kembalikan aplikasi ke kondisi baru/kosong)
-- Jalankan di Supabase SQL Editor kapan pun Anda ingin menghapus SEMUA data
-- transaksi & master yang pernah diinput (mis. setelah masa uji coba),
-- tanpa menghapus akun login Anda.
--
-- YANG DIHAPUS: seluruh DPA, pengadaan, anggaran kas, realisasi, kendaraan,
-- peralatan, kupon BBM, pemeliharaan, rekening, penyedia, dan audit log.
--
-- YANG TETAP ADA (tidak terhapus):
--   - Tabel `users`      -> akun login Anda tetap bisa dipakai
--   - Tabel `fiscal_years` -> daftar Tahun Anggaran (2026, 2027, dst)
--   - Tabel `fuel_types`  -> jenis BBM dasar (Pertalite, Pertamax, dst)
--   - Tabel `units`       -> satuan dasar (Unit, Buah, Liter, dst)
--
-- PERINGATAN: tindakan ini TIDAK BISA DIBATALKAN. Pastikan Anda benar-benar
-- ingin mengosongkan data sebelum menjalankan skrip ini.
-- ==========================================================================

truncate table
  dpa_details,
  dpa,
  procurement_items,
  procurements,
  fuel_procurements,
  budget_cash,
  attachments,
  realization,
  fuel_coupons,
  maintenance_vehicle,
  maintenance_equipment,
  vehicles,
  equipment,
  vendors,
  accounts,
  audit_logs
restart identity cascade;

-- Setelah dijalankan, Dashboard akan otomatis menampilkan semua KPI sebagai
-- Rp 0 / kosong, dan setiap modul akan menampilkan pesan "Belum ada data"
-- (empty state) hingga Anda mulai menginput data yang sebenarnya.

-- CATATAN: jika Anda juga ingin menghapus semua pengguna KECUALI akun Anda
-- sendiri, jalankan baris berikut secara terpisah dan GANTI nilai UUID
-- dengan User UID akun Anda dari Authentication > Users:
--
-- delete from users where id <> '<UUID-akun-Anda>';
-- (Menghapus baris di atas tidak menghapus akun dari Supabase Auth secara
--  otomatis — hapus juga secara manual di Authentication > Users bila perlu.)
