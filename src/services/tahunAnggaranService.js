import { supabase } from '../lib/supabaseClient.js';
import { translateDbError } from './anggaranService.js';

export async function listTahunAnggaran() {
  const { data, error } = await supabase
    .from('tahun_anggaran')
    .select('id, tahun, status_aktif')
    .is('deleted_at', null)
    .order('tahun', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getDefaultTahunAnggaran() {
  const list = await listTahunAnggaran();
  return list.find((t) => t.status_aktif) || list[0] || null;
}

export async function createTahunAnggaran({ tahun }) {
  const { error } = await supabase.from('tahun_anggaran').insert({ tahun: Number(tahun) });
  if (error) throw translateDbError(error);
}

export async function softDeleteTahunAnggaran(id, userId) {
  const { error } = await supabase
    .from('tahun_anggaran')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
  if (error) throw translateDbError(error);
}

// Hanya boleh ada SATU Tahun Anggaran aktif (unique partial index di DB).
// Urutan wajib: matikan yang lama dulu, baru aktifkan yang baru — supaya
// tidak pernah ada dua baris status_aktif=true di waktu yang sama.
export async function setActiveTahunAnggaran(id) {
  const { data: current, error: fetchErr } = await supabase
    .from('tahun_anggaran')
    .select('id')
    .eq('status_aktif', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (fetchErr) throw translateDbError(fetchErr);

  if (current && current.id !== id) {
    const { error: offErr } = await supabase
      .from('tahun_anggaran')
      .update({ status_aktif: false })
      .eq('id', current.id);
    if (offErr) throw translateDbError(offErr);
  }

  const { error: onErr } = await supabase
    .from('tahun_anggaran')
    .update({ status_aktif: true })
    .eq('id', id);
  if (onErr) throw translateDbError(onErr);
}
