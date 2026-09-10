import { listBelanjaByTahun, listSubKegiatanByTahun } from './anggaranService.js';
import { listPajak, listKendaraanOptions } from './transaksiService.js';
import { supabase } from '../lib/supabaseClient.js';

/**
 * Seluruh pemeriksaan di sini bersifat READ-ONLY dan menghormati RLS yang
 * sudah ada (tidak ada bypass apa pun) — hasilnya otomatis terbatas sesuai
 * hak akses (OPD) user yang sedang login.
 */
export async function runDataQualityChecks(tahunAnggaranId) {
  const [belanjaList, subKegiatanList, pajakList, kendaraanOptions, kendaraanDetail] = await Promise.all([
    listBelanjaByTahun(tahunAnggaranId),
    listSubKegiatanByTahun(tahunAnggaranId),
    listPajak(tahunAnggaranId),
    listKendaraanOptions(tahunAnggaranId),
    supabase.from('kendaraan').select('id, nopol, nomor_rangka, nomor_mesin, nomor_bpkb, jenis_kendaraan, unit_kerja, status').is('deleted_at', null),
  ]);
  if (kendaraanDetail.error) throw kendaraanDetail.error;

  const issues = [];

  // 1. Sub Kegiatan tanpa Belanja sama sekali.
  const subKegiatanWithBelanja = new Set(belanjaList.map((b) => b.sub_kegiatan?.id).filter(Boolean));
  const subKegiatanKosong = subKegiatanList.filter((sk) => !subKegiatanWithBelanja.has(sk.id));
  if (subKegiatanKosong.length) {
    issues.push({
      key: 'sub_kegiatan_kosong',
      severity: 'warning',
      title: 'Sub Kegiatan tanpa Belanja',
      description: 'Sub Kegiatan berikut belum punya rincian Belanja sama sekali pada Tahun Anggaran ini.',
      items: subKegiatanKosong.map((sk) => ({
        label: `${sk.kode_sub_kegiatan} — ${sk.nama_sub_kegiatan}`,
        detail: sk.kegiatan?.nama_kegiatan || '-',
      })),
    });
  }

  // 2. Belanja dengan Pagu = 0.
  const belanjaPaguKosong = belanjaList.filter((b) => Number(b.pagu) === 0);
  if (belanjaPaguKosong.length) {
    issues.push({
      key: 'belanja_pagu_nol',
      severity: 'warning',
      title: 'Belanja dengan Pagu Rp 0',
      description: 'Kemungkinan salah input atau belum diisi nominalnya.',
      items: belanjaPaguKosong.map((b) => ({
        label: `${b.kode_rekening} — ${b.nama_belanja}`,
        detail: b.sub_kegiatan?.nama_sub_kegiatan || '-',
      })),
    });
  }

  // 3. Kendaraan aktif dengan data KIB tidak lengkap (nomor rangka/mesin/BPKB kosong).
  const kendaraanTidakLengkap = (kendaraanDetail.data || []).filter(
    (k) => k.status === 'aktif' && (!k.nomor_rangka || !k.nomor_mesin || !k.nomor_bpkb || !k.jenis_kendaraan)
  );
  if (kendaraanTidakLengkap.length) {
    issues.push({
      key: 'kib_tidak_lengkap',
      severity: 'warning',
      title: 'Data KIB Kendaraan Belum Lengkap',
      description: 'Kendaraan aktif berikut belum lengkap nomor rangka/mesin/BPKB atau jenis kendaraannya.',
      items: kendaraanTidakLengkap.map((k) => ({
        label: k.nopol,
        detail: [
          !k.nomor_rangka && 'No. Rangka kosong',
          !k.nomor_mesin && 'No. Mesin kosong',
          !k.nomor_bpkb && 'No. BPKB kosong',
          !k.jenis_kendaraan && 'Jenis kendaraan kosong',
        ].filter(Boolean).join(', '),
      })),
    });
  }

  // 4. Kendaraan aktif tanpa Pajak STNK tahun ini (belum ada transaksi sama sekali).
  const kendaraanDenganPajakStnk = new Set(
    pajakList.filter((p) => p.jenis === 'pajak_stnk').map((p) => p.kendaraan?.id).filter(Boolean)
  );
  const kendaraanAktifIds = new Set((kendaraanDetail.data || []).filter((k) => k.status === 'aktif').map((k) => k.id));
  const kendaraanTanpaPajak = kendaraanOptions.filter((k) => kendaraanAktifIds.has(k.id) && !kendaraanDenganPajakStnk.has(k.id));
  if (kendaraanTanpaPajak.length) {
    issues.push({
      key: 'tanpa_pajak_stnk',
      severity: 'critical',
      title: 'Kendaraan Aktif Belum Ada Pajak STNK Tahun Ini',
      description: 'Belum ada satu pun transaksi Pajak STNK yang tercatat untuk kendaraan ini pada Tahun Anggaran berjalan.',
      items: kendaraanTanpaPajak.map((k) => ({ label: k.nopol, detail: k.kib?.nama_barang || '-' })),
    });
  }

  // 5. Pajak/Perijinan yang sudah lewat masa berlaku (berdasarkan transaksi TERAKHIR per kendaraan+jenis).
  const latestByKey = new Map();
  pajakList.forEach((p) => {
    if (!p.masa_berlaku) return;
    const key = `${p.kendaraan?.id}__${p.jenis}`;
    const existing = latestByKey.get(key);
    if (!existing || new Date(p.masa_berlaku) > new Date(existing.masa_berlaku)) {
      latestByKey.set(key, p);
    }
  });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const lewatJatuhTempo = [...latestByKey.values()].filter((p) => new Date(p.masa_berlaku) < today);
  if (lewatJatuhTempo.length) {
    issues.push({
      key: 'jatuh_tempo_lewat',
      severity: 'critical',
      title: 'Pajak/Perijinan Sudah Lewat Masa Berlaku',
      description: 'Berdasarkan transaksi terakhir yang tercatat — mungkin sudah diperpanjang tapi belum diinput.',
      items: lewatJatuhTempo.map((p) => ({
        label: `${p.kendaraan?.nopol || '-'} — ${JENIS_PAJAK_LABEL[p.jenis] || p.jenis}`,
        detail: `Masa berlaku terakhir: ${new Date(p.masa_berlaku).toLocaleDateString('id-ID')}`,
      })),
    });
  }

  return issues;
}

const JENIS_PAJAK_LABEL = {
  pajak_stnk: 'Pajak STNK', pajak_kendaraan: 'Pajak Kendaraan', kir: 'KIR',
  izin_trayek: 'Izin Trayek', perijinan_lainnya: 'Perijinan Lainnya',
};
