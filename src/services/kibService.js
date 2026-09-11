import { supabase } from '../lib/supabaseClient.js';
import { translateDbError } from './anggaranService.js';

// ---------------------------------------------------------
// KENDARAAN (kib kategori='kendaraan' + tabel kendaraan)
// ---------------------------------------------------------
export async function listKendaraan(tahunAnggaranId) {
  const { data, error } = await supabase
    .from('kendaraan')
    .select(`
      id, nopol, nomor_rangka, nomor_mesin, nomor_bpkb, jenis_kendaraan, roda, status,
      penanggung_jawab, unit_kerja,
      kib:kib_id ( id, kode_barang, register, nama_barang, merk, type, tahun_perolehan, nilai_perolehan, kondisi, lokasi, opd_id, tahun_anggaran_id, opd:opd_id(nama_opd) )
    `)
    .is('deleted_at', null)
    .order('nopol');
  if (error) throw error;
  return (data || []).filter((k) => k.kib?.tahun_anggaran_id === tahunAnggaranId);
}

export async function createKendaraan({ tahunAnggaranId, opdId, kib, kendaraan }) {
  const { data: kibRow, error: kibErr } = await supabase
    .from('kib')
    .insert({
      tahun_anggaran_id: tahunAnggaranId,
      opd_id: opdId,
      kategori: 'kendaraan',
      kode_barang: kib.kode_barang || null,
      register: kib.register || null,
      nama_barang: kib.nama_barang,
      merk: kib.merk || null,
      type: kib.type || null,
      tahun_perolehan: kib.tahun_perolehan || null,
      nilai_perolehan: kib.nilai_perolehan || null,
      kondisi: kib.kondisi || null,
      lokasi: kib.lokasi || null,
      pengguna: kib.pengguna || null,
    })
    .select('id')
    .single();
  if (kibErr) throw translateDbError(kibErr);

  const { data: kendaraanRow, error: kendErr } = await supabase
    .from('kendaraan')
    .insert({
      kib_id: kibRow.id,
      nopol: kendaraan.nopol,
      nomor_rangka: kendaraan.nomor_rangka || null,
      nomor_mesin: kendaraan.nomor_mesin || null,
      nomor_bpkb: kendaraan.nomor_bpkb || null,
      jenis_kendaraan: kendaraan.jenis_kendaraan || null,
      roda: kendaraan.roda || null,
      penanggung_jawab: kendaraan.penanggung_jawab || null,
      unit_kerja: kendaraan.unit_kerja || null,
    })
    .select()
    .single();
  if (kendErr) {
    // Rollback manual: kib sudah terlanjur dibuat tapi kendaraan gagal (mis. Nopol duplikat).
    await supabase.from('kib').delete().eq('id', kibRow.id);
    throw translateDbError(kendErr);
  }
  return kendaraanRow;
}

export async function updateKendaraan(kendaraanId, kibId, { kib, kendaraan }) {
  const { error: kibErr } = await supabase
    .from('kib')
    .update({
      kode_barang: kib.kode_barang || null,
      register: kib.register || null,
      nama_barang: kib.nama_barang,
      merk: kib.merk || null,
      type: kib.type || null,
      tahun_perolehan: kib.tahun_perolehan || null,
      nilai_perolehan: kib.nilai_perolehan || null,
      kondisi: kib.kondisi || null,
      lokasi: kib.lokasi || null,
      pengguna: kib.pengguna || null,
    })
    .eq('id', kibId);
  if (kibErr) throw translateDbError(kibErr);

  const { error: kendErr } = await supabase
    .from('kendaraan')
    .update({
      nopol: kendaraan.nopol,
      nomor_rangka: kendaraan.nomor_rangka || null,
      nomor_mesin: kendaraan.nomor_mesin || null,
      nomor_bpkb: kendaraan.nomor_bpkb || null,
      jenis_kendaraan: kendaraan.jenis_kendaraan || null,
      roda: kendaraan.roda || null,
      penanggung_jawab: kendaraan.penanggung_jawab || null,
      unit_kerja: kendaraan.unit_kerja || null,
    })
    .eq('id', kendaraanId);
  if (kendErr) throw translateDbError(kendErr);
}

export async function softDeleteKendaraan(kendaraanId, kibId, userId) {
  const now = new Date().toISOString();
  const { error: e1 } = await supabase
    .from('kendaraan')
    .update({ deleted_at: now, deleted_by: userId })
    .eq('id', kendaraanId);
  if (e1) throw translateDbError(e1);

  const { error: e2 } = await supabase
    .from('kib')
    .update({ deleted_at: now, deleted_by: userId })
    .eq('id', kibId);
  if (e2) throw translateDbError(e2);
}

// ---------------------------------------------------------
// PERALATAN / ASET LAINNYA (kib saja, tanpa baris kendaraan)
// ---------------------------------------------------------
export async function listPeralatan(tahunAnggaranId, kategori) {
  let query = supabase
    .from('kib')
    .select('id, kategori, kode_barang, register, nama_barang, merk, type, spesifikasi, tahun_perolehan, jumlah, satuan, harga_satuan, nilai_perolehan, kondisi, lokasi, pengguna, keterangan, opd_id, opd:opd_id(nama_opd)')
    .eq('tahun_anggaran_id', tahunAnggaranId)
    .in('kategori', kategori ? [kategori] : ['peralatan', 'aset_lainnya'])
    .is('deleted_at', null)
    .order('nama_barang');
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createPeralatan({ tahunAnggaranId, opdId, kategori, form }) {
  const { data, error } = await supabase
    .from('kib')
    .insert({
      tahun_anggaran_id: tahunAnggaranId,
      opd_id: opdId,
      kategori,
      kode_barang: form.kode_barang || null,
      register: form.register || null,
      nama_barang: form.nama_barang,
      merk: form.merk || null,
      type: form.type || null,
      spesifikasi: form.spesifikasi || null,
      tahun_perolehan: form.tahun_perolehan || null,
      jumlah: form.jumlah || 1,
      satuan: form.satuan || null,
      harga_satuan: form.harga_satuan || null,
      nilai_perolehan: form.nilai_perolehan || null,
      kondisi: form.kondisi || null,
      lokasi: form.lokasi || null,
      pengguna: form.pengguna || null,
      keterangan: form.keterangan || null,
    })
    .select()
    .single();
  if (error) throw translateDbError(error);
  return data;
}

export async function updatePeralatan(id, { kategori, form }) {
  const { data, error } = await supabase
    .from('kib')
    .update({
      kategori,
      kode_barang: form.kode_barang || null,
      register: form.register || null,
      nama_barang: form.nama_barang,
      merk: form.merk || null,
      type: form.type || null,
      spesifikasi: form.spesifikasi || null,
      tahun_perolehan: form.tahun_perolehan || null,
      jumlah: form.jumlah || 1,
      satuan: form.satuan || null,
      harga_satuan: form.harga_satuan || null,
      nilai_perolehan: form.nilai_perolehan || null,
      kondisi: form.kondisi || null,
      lokasi: form.lokasi || null,
      pengguna: form.pengguna || null,
      keterangan: form.keterangan || null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw translateDbError(error);
  return data;
}

export async function softDeletePeralatan(id, userId) {
  const { error } = await supabase
    .from('kib')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
  if (error) throw translateDbError(error);
}
