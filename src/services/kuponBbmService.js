import { supabase } from '../lib/supabaseClient.js';
import { translateDbError } from './anggaranService.js';

// ---------------------------------------------------------
// PENGADAAN KUPON BBM (kuota lembar kupon per Tahun Anggaran + OPD + roda)
// ---------------------------------------------------------

/**
 * Ambil baris pengadaan kupon untuk 1 Tahun Anggaran + 1 OPD (maksimal 2
 * baris: roda4 & roda2). Dipakai untuk mengisi form Pengadaan Kupon BBM.
 */
export async function getPengadaanKupon(tahunAnggaranId, opdId) {
  const { data, error } = await supabase
    .from('pengadaan_kupon_bbm')
    .select('id, roda, jumlah_kupon, nilai_per_kupon, nilai_pengadaan, keterangan')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .eq('opd_id', opdId)
    .is('deleted_at', null);
  if (error) throw error;
  return data || [];
}

/**
 * Nominal per lembar kupon yang BERLAKU SAAT INI untuk 1 roda pada 1 Tahun
 * Anggaran + OPD tertentu (diambil dari pengadaan_kupon_bbm — nominal ini
 * diinput manual oleh admin dan bisa berubah mengikuti fluktuasi harga BBM,
 * lihat migrasi 0010). Dipakai saat mencatat transaksi BBM baru agar nilai
 * per kupon selalu mengikuti nominal terbaru, bukan nilai tetap yang
 * di-hardcode di frontend. Mengembalikan null jika belum ada pengadaan
 * utk roda tsb pada Tahun Anggaran berjalan.
 */
export async function resolveNilaiPerKupon(tahunAnggaranId, opdId, roda) {
  if (!tahunAnggaranId || !opdId || !roda) return null;
  const { data, error } = await supabase
    .from('pengadaan_kupon_bbm')
    .select('nilai_per_kupon')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .eq('opd_id', opdId)
    .eq('roda', roda)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.nilai_per_kupon) : null;
}

/**
 * Simpan (insert atau update) kuota pengadaan kupon untuk 1 roda tertentu.
 * `nilaiPerKupon` diinput manual oleh admin (mis. mengikuti fluktuasi harga
 * BBM) — tidak lagi dikunci ke nilai tetap per roda (lihat migrasi 0010).
 */
export async function upsertPengadaanKupon({ id, tahunAnggaranId, opdId, roda, jumlahKupon, nilaiPerKupon, keterangan }) {
  const payload = {
    tahun_anggaran_id: tahunAnggaranId,
    opd_id: opdId,
    roda,
    jumlah_kupon: jumlahKupon,
    nilai_per_kupon: nilaiPerKupon,
    keterangan: keterangan || null,
  };
  if (id) {
    const { error } = await supabase.from('pengadaan_kupon_bbm').update(payload).eq('id', id);
    if (error) throw translateDbError(error);
  } else {
    const { error } = await supabase.from('pengadaan_kupon_bbm').insert(payload);
    if (error) throw translateDbError(error);
  }
}

export async function softDeletePengadaanKupon(id, userId) {
  const { error } = await supabase
    .from('pengadaan_kupon_bbm')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
  if (error) throw translateDbError(error);
}

// ---------------------------------------------------------
// PENYERAPAN & SISA KUPON (dari view v_penyerapan_kupon_bbm)
// ---------------------------------------------------------

/**
 * Ringkasan pengadaan vs. terpakai vs. sisa Kupon BBM untuk 1 Tahun
 * Anggaran. RLS pada view sudah scoped per OPD (security_invoker), jadi
 * admin_opd/operator/viewer otomatis hanya melihat OPD miliknya sendiri,
 * sementara super_admin melihat semua OPD.
 */
export async function listPenyerapanKupon(tahunAnggaranId, opdId = null) {
  let query = supabase
    .from('v_penyerapan_kupon_bbm')
    .select('*')
    .eq('tahun_anggaran_id', tahunAnggaranId);
  if (opdId) query = query.eq('opd_id', opdId);
  const { data, error } = await query.order('roda');
  if (error) throw error;
  return data || [];
}

/**
 * Ringkasan total penyerapan & sisa Kupon BBM lintas roda (roda4 + roda2),
 * digabung lintas OPD bila pemanggil melihat >1 OPD (super_admin). Dipakai
 * oleh Dashboard utama & Dashboard Monitoring untuk menyajikan realisasi
 * Kupon BBM dan sisa kupon secara transparan.
 */
export async function getKuponSummaryTotals(tahunAnggaranId, opdId = null) {
  const rows = await listPenyerapanKupon(tahunAnggaranId, opdId);
  const totals = { kuponPengadaan: 0, kuponTerpakai: 0, kuponSisa: 0, nilaiPengadaan: 0, nilaiTerpakai: 0, nilaiSisa: 0, adaData: rows.length > 0 };
  rows.forEach((r) => {
    totals.kuponPengadaan += Number(r.kupon_pengadaan) || 0;
    totals.kuponTerpakai += Number(r.kupon_terpakai) || 0;
    totals.kuponSisa += Number(r.kupon_sisa) || 0;
    totals.nilaiPengadaan += Number(r.nilai_pengadaan) || 0;
    totals.nilaiTerpakai += Number(r.nilai_terpakai) || 0;
    totals.nilaiSisa += Number(r.nilai_sisa) || 0;
  });
  totals.persentaseTerpakai = totals.kuponPengadaan ? Math.round((totals.kuponTerpakai / totals.kuponPengadaan) * 10000) / 100 : 0;
  return totals;
}
