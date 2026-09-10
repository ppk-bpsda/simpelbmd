import { supabase } from '../lib/supabaseClient.js';
import { validateFile, sanitizeFileName } from '../validators/fileValidator.js';

const BUCKET = 'documents';

/**
 * Upload dokumen ke bucket privat. Path mengikuti konvensi
 * {opd_id}/{table_name}/{record_id}/{timestamp}_{filename} agar storage
 * policy (0003_storage_policies.sql) dapat memvalidasi opd_id langsung
 * dari path tanpa join ke tabel lain.
 */
export async function uploadDocument({ file, jenis, opdId, tableName, recordId, uploadedBy }) {
  const { valid, error: validationError } = validateFile(file);
  if (!valid) throw new Error(validationError);

  const path = `${opdId}/${tableName}/${recordId}/${Date.now()}_${sanitizeFileName(file.name)}`;

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (uploadErr) throw new Error('Gagal mengunggah file. Silakan periksa koneksi Anda dan coba lagi.');

  const { data, error: insertErr } = await supabase
    .from('dokumen')
    .insert({ jenis, file_path: path, table_name: tableName, record_id: recordId, opd_id: opdId, uploaded_by: uploadedBy })
    .select()
    .single();

  if (insertErr) {
    await supabase.storage.from(BUCKET).remove([path]); // rollback file jika gagal catat metadata
    throw new Error('File terunggah tetapi gagal dicatat. Silakan coba lagi.');
  }
  return data;
}

export async function listDocuments(tableName, recordId) {
  const { data, error } = await supabase
    .from('dokumen')
    .select('id, jenis, file_path, uploaded_at')
    .eq('table_name', tableName)
    .eq('record_id', recordId)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getSignedUrl(filePath) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 120);
  if (error) throw new Error('Gagal membuka dokumen. File mungkin sudah tidak tersedia.');
  return data.signedUrl;
}

export async function softDeleteDocument(id, userId) {
  const { error } = await supabase
    .from('dokumen')
    .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id);
  if (error) throw new Error('Gagal menghapus dokumen.');
}
