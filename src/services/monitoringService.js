import { supabase } from '../lib/supabaseClient.js';

/**
 * Rekap biaya per kendaraan (§16), bersumber dari view v_rekap_per_kendaraan
 * yang sudah menjumlahkan Pajak, Pemeliharaan, dan BBM per kendaraan_id.
 */
export async function getRekapPerKendaraan(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('v_rekap_per_kendaraan')
    .select('*')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .order('nopol');
  if (error) throw error;
  return data || [];
}

/**
 * Identitas KIB + kendaraan untuk halaman Detail Kendaraan (§16).
 */
export async function getKendaraanIdentitas(kendaraanId) {
  const { data, error } = await supabase
    .from('kendaraan')
    .select(`
      id, nopol, nomor_rangka, nomor_mesin, nomor_bpkb, jenis_kendaraan, status,
      penanggung_jawab, unit_kerja,
      kib:kib_id ( kode_barang, register, nama_barang, merk, type, tahun_perolehan, nilai_perolehan, kondisi, lokasi, opd:opd_id(nama_opd) )
    `)
    .eq('id', kendaraanId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
