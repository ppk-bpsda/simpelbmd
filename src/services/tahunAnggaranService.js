import { supabase } from '../lib/supabaseClient.js';

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
