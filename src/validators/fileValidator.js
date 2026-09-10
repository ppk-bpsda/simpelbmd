export const ALLOWED_FILE_TYPES = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg/.jpeg',
  'image/png': '.png',
  'image/webp': '.webp',
};
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export function validateFile(file) {
  if (!file) return { valid: false, error: 'Tidak ada file yang dipilih.' };
  if (!ALLOWED_FILE_TYPES[file.type]) {
    return { valid: false, error: 'Tipe file tidak didukung. Gunakan PDF, JPG, PNG, atau WEBP.' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'Ukuran file melebihi 5MB. Silakan kompres atau pindai ulang dengan resolusi lebih rendah.' };
  }
  return { valid: true, error: null };
}

export function sanitizeFileName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
}
