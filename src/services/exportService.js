// Semua library berat (xlsx, jspdf) di-lazy-load hanya saat tombol export
// ditekan, agar bundle utama tetap kecil (§37, konsisten dengan pola di
// importService.js / importKibService.js).

export async function exportExcel(filename, sheetName, headers, rows) {
  const XLSX = await import('xlsx');
  const aoa = [headers.map((h) => h.label), ...rows.map((r) => headers.map((h) => r[h.key] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

export async function exportExcelMultiSheet(filename, sheets) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ sheetName, headers, rows }) => {
    const aoa = [headers.map((h) => h.label), ...rows.map((r) => headers.map((h) => r[h.key] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

export function exportCsv(filename, headers, rows) {
  const escapeCell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [
    headers.map((h) => escapeCell(h.label)).join(','),
    ...rows.map((r) => headers.map((h) => escapeCell(r[h.key])).join(',')),
  ];
  // BOM \uFEFF agar Excel membaca karakter Indonesia (é, Rp, dst.) dengan benar.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

export async function exportPdf(filename, title, headers, rows, subtitle = '') {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
  doc.setFontSize(14);
  doc.text(title, 40, 40);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(subtitle, 40, 58);
  }
  autoTable(doc, {
    startY: subtitle ? 72 : 56,
    head: [headers.map((h) => h.label)],
    body: rows.map((r) => headers.map((h) => String(r[h.key] ?? ''))),
    styles: { fontSize: 8, cellPadding: 5 },
    headStyles: { fillColor: [11, 18, 32], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 40, right: 40 },
  });
  doc.save(filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
