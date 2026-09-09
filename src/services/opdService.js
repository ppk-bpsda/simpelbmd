import { supabase } from '../lib/supabaseClient.js';

export async function listOpd() {
  const { data, error } = await supabase
    .from('opd')
    .select('id, kode_opd, nama_opd, status')
    .is('deleted_at', null)
    .eq('status', 'aktif')
    .order('nama_opd');
  if (error) throw error;
  return data;
}
