import { supabase } from '../lib/supabaseClient.js';
import { translateDbError } from './anggaranService.js';

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

export async function listAllOpd() {
  const { data, error } = await supabase
    .from('opd')
    .select('id, kode_opd, nama_opd, status')
    .is('deleted_at', null)
    .order('nama_opd');
  if (error) throw error;
  return data;
}

export async function createOpd({ kode, nama }) {
  const { data, error } = await supabase.from('opd').insert({ kode_opd: kode, nama_opd: nama }).select().single();
  if (error) throw translateDbError(error);
  return data;
}

export async function updateOpd(id, { kode, nama, status }) {
  const { data, error } = await supabase
    .from('opd')
    .update({ kode_opd: kode, nama_opd: nama, status })
    .eq('id', id)
    .select()
    .single();
  if (error) throw translateDbError(error);
  return data;
}
