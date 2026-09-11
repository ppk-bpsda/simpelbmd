import { supabase } from '../lib/supabaseClient.js';
import { translateDbError } from './anggaranService.js';
import { KUPON_NOMINAL } from '../validators/transaksiValidator.js';

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
 * Simpan (insert atau update) kuota pengadaan kupon untuk 1 roda tertentu.
 * Nominal per kupon SELALU mengikuti nominal tetap (lihat KUPON_NOMINAL,
 * konsisten dengan 0008/0009) — tidak bisa diisi manual.
 */
export async function upsertPengadaanKupon({ id, tahunAnggaranId, opdId, roda, jumlahKupon, keterangan }) {
  const payload = {
    tahun_anggaran_id: tahunAnggaranId,
    opd_id: opdId,
    roda,
    jumlah_kupon: jumlahKupon,
    nilai_per_kupon: KUPON_NOMINAL[roda],
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
