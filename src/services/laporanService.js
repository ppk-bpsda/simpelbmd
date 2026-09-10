import { supabase } from '../lib/supabaseClient.js';
import { listBelanjaByTahun, listKegiatan } from './anggaranService.js';
import { listOpd } from './opdService.js';
import {
  getRingkasanAnggaran,
  getRingkasanPerJenisBelanja,
  getPenyerapanBulanan,
  getRingkasanPerKegiatan,
} from './dashboardService.js';

// ---------------------------------------------------------
// REKAP ANGGARAN — detail per Belanja + Kegiatan/Sub Kegiatan, dengan realisasi (§26).
// ---------------------------------------------------------
export async function getRekapAnggaran(tahunAnggaranId) {
  const belanjaList = await listBelanjaByTahun(tahunAnggaranId);
  const { data: realisasiRows, error } = await supabase
    .from('v_realisasi_per_belanja')
    .select('belanja_id, realisasi_per_belanja')
    .eq('tahun_anggaran_id', tahunAnggaranId);
  if (error) throw error;
  const realisasiMap = new Map((realisasiRows || []).map((r) => [r.belanja_id, Number(r.realisasi_per_belanja)]));

  return belanjaList.map((b) => {
    const realisasi = realisasiMap.get(b.id) || 0;
    const pagu = Number(b.pagu);
    return {
      kodeKegiatan: b.sub_kegiatan?.kegiatan?.kode_kegiatan || '-',
      kegiatan: b.sub_kegiatan?.kegiatan?.nama_kegiatan || '-',
      kegiatanId: b.sub_kegiatan?.kegiatan?.id || null,
      subKegiatan: b.sub_kegiatan?.nama_sub_kegiatan || '-',
      kodeRekening: b.kode_rekening,
      namaBelanja: b.nama_belanja,
      kelompok: b.kelompok,
      pagu,
      realisasi,
      sisa: pagu - realisasi,
      persentase: pagu === 0 ? 0 : (realisasi / pagu) * 100,
    };
  });
}

export async function listKegiatanOptions(tahunAnggaranId) {
  return listKegiatan(tahunAnggaranId);
}

// ---------------------------------------------------------
// REKAP KENDARAAN — dari v_rekap_per_kendaraan (§16), diperkaya nama OPD & identitas kendaraan.
// ---------------------------------------------------------
export async function getRekapKendaraan(tahunAnggaranId) {
  const { data: rekap, error } = await supabase
    .from('v_rekap_per_kendaraan')
    .select('*')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .order('nopol');
  if (error) throw error;

  const [opdList, kendaraanRes] = await Promise.all([
    listOpd(),
    supabase.from('kendaraan').select('id, jenis_kendaraan, status, unit_kerja').is('deleted_at', null),
  ]);
  if (kendaraanRes.error) throw kendaraanRes.error;

  const opdMap = new Map((opdList || []).map((o) => [o.id, o.nama_opd]));
  const kendMap = new Map((kendaraanRes.data || []).map((k) => [k.id, k]));

  return (rekap || []).map((r) => {
    const kd = kendMap.get(r.kendaraan_id) || {};
    return {
      kendaraanId: r.kendaraan_id,
      nopol: r.nopol,
      opdId: r.opd_id,
      opd: opdMap.get(r.opd_id) || '-',
      jenisKendaraan: kd.jenis_kendaraan || '-',
      unitKerja: kd.unit_kerja || '-',
      status: kd.status || '-',
      totalPajak: Number(r.total_pajak),
      totalPemeliharaan: Number(r.total_pemeliharaan),
      totalBbm: Number(r.total_bbm),
      totalKupon: Number(r.total_kupon),
      totalBiaya: Number(r.total_pajak) + Number(r.total_pemeliharaan) + Number(r.total_bbm),
    };
  });
}

// ---------------------------------------------------------
// LAPORAN TAHUNAN — gabungan seluruh ringkasan satu Tahun Anggaran untuk laporan akhir tahun.
// ---------------------------------------------------------
export async function getLaporanTahunan(tahunAnggaranId) {
  const [ringkasan, perJenis, perBulan, perKegiatan, rekapKendaraan] = await Promise.all([
    getRingkasanAnggaran(tahunAnggaranId),
    getRingkasanPerJenisBelanja(tahunAnggaranId),
    getPenyerapanBulanan(tahunAnggaranId),
    getRingkasanPerKegiatan(tahunAnggaranId),
    getRekapKendaraan(tahunAnggaranId),
  ]);
  return { ringkasan, perJenis, perBulan, perKegiatan, rekapKendaraan };
}
