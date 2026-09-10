// Helper ringan untuk toolkit export (utils/report.js) — sengaja dipisah dari
// file itu supaya TIDAK ikut tertarik saat XLSX/jsPDF di-dynamic-import,
// karena helper ini juga dipakai oleh kode yang jalan sebelum tombol export diklik.

export function cellValue(col, row) {
  const v = col.value ? col.value(row) : row[col.key];
  return v === null || v === undefined ? '' : v;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
