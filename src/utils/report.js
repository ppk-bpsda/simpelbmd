import { escapeHtml, cellValue, triggerDownload } from './reportHelpers.js';

/**
 * Toolkit export/print bersama untuk seluruh halaman Laporan (Phase 6).
 * Semua fungsi menerima data yang SUDAH difilter oleh halaman pemanggil —
 * tidak ada query database di sini, murni transformasi data -> file/print.
 *
 * XLSX/jsPDF di-import secara dinamis (baru diambil saat tombol export
 * benar-benar diklik) supaya bundle awal aplikasi tetap ringan — pola yang
 * sama dipakai di importKibService.js/importService.js.
 *
 * `columns` punya bentuk: [{ key, label, numeric?, value?(row) }]
 * - `value(row)` opsional untuk kolom hasil turunan / format khusus.
 * - kalau tidak ada `value`, dipakai `row[key]` apa adanya.
 */

// ---------------------------------------------------------
// EXCEL (.xlsx) — pakai SheetJS. Di-import dinamis saat dipakai.
// ---------------------------------------------------------
export async function exportToExcel({ title, subtitle, columns, rows, filename, sheetName = 'Laporan' }) {
  const XLSX = await import('xlsx');
  const aoa = [];
  aoa.push([title]);
  if (subtitle) aoa.push([subtitle]);
  aoa.push([]);
  aoa.push(columns.map((c) => c.label));
  rows.forEach((r) => aoa.push(columns.map((c) => cellValue(c, r))));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(columns.length - 1, 0) } }];
  ws['!cols'] = columns.map((c) => ({ wch: Math.max(12, c.label.length + 4) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

// ---------------------------------------------------------
// CSV — dibuat manual (tidak butuh library tambahan).
// ---------------------------------------------------------
export function exportToCSV({ columns, rows, filename }) {
  const escapeCsv = (val) => {
    const s = String(val ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    columns.map((c) => escapeCsv(c.label)).join(','),
    ...rows.map((r) => columns.map((c) => escapeCsv(cellValue(c, r))).join(',')),
  ];
  // BOM di depan supaya Excel versi Indonesia langsung membaca UTF-8 dengan benar.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

// ---------------------------------------------------------
// PDF — jsPDF + jspdf-autotable, di-import dinamis saat dipakai. Orientasi
// landscape default (tabel lebar).
// ---------------------------------------------------------
export async function exportToPDF({ title, subtitle, columns, rows, filename, orientation = 'landscape' }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation, unit: 'pt', format: 'a4' });
  const marginLeft = 32;

  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(title, marginLeft, 36);

  let startY = 48;
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, marginLeft, 52);
    startY = 64;
  }

  autoTable(doc, {
    startY,
    head: [columns.map((c) => c.label)],
    body: rows.map((r) => columns.map((c) => {
      const v = cellValue(c, r);
      return typeof v === 'number' ? v.toLocaleString('id-ID') : String(v);
    })),
    styles: { fontSize: 8, cellPadding: 5, textColor: [51, 65, 85] },
    headStyles: { fillColor: [11, 18, 32], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: columns.reduce((acc, c, i) => {
      if (c.numeric) acc[i] = { halign: 'right' };
      return acc;
    }, {}),
    margin: { left: marginLeft, right: marginLeft },
    didDrawPage: () => {
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Dicetak ${new Date().toLocaleString('id-ID')} — Halaman ${doc.internal.getCurrentPageInfo().pageNumber}/${pageCount}`,
        marginLeft,
        doc.internal.pageSize.getHeight() - 18
      );
    },
  });

  doc.save(filename);
}

// ---------------------------------------------------------
// PRINT — window terpisah dengan layout print-friendly (bisa disimpan sbg PDF via dialog print browser).
// ---------------------------------------------------------
export function printReport({ title, subtitle, columns, rows }) {
  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) {
    alert('Popup diblokir browser. Izinkan popup untuk mencetak laporan ini.');
    return;
  }
  const theadHtml = columns.map((c) => `<th class="${c.numeric ? 'num' : ''}">${escapeHtml(c.label)}</th>`).join('');
  const rowsHtml = rows
    .map((r) => `<tr>${columns.map((c) => {
      const v = cellValue(c, r);
      const display = typeof v === 'number' ? v.toLocaleString('id-ID') : escapeHtml(String(v));
      return `<td class="${c.numeric ? 'num' : ''}">${display}</td>`;
    }).join('')}</tr>`)
    .join('');

  win.document.write(`<!DOCTYPE html>
    <html lang="id"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; padding: 28px; color: #0F172A; }
      h1 { font-size: 16px; margin: 0 0 2px; }
      p.sub { font-size: 11px; color: #64748B; margin: 0 0 18px; }
      p.meta { font-size: 10px; color: #94A3B8; margin: 0 0 18px; }
      table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
      th, td { border: 1px solid #DCE2EA; padding: 6px 8px; text-align: left; }
      th { background: #0B1220; color: #fff; }
      td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
      tbody tr:nth-child(even) { background: #F5F7FA; }
      .print-btn { margin-bottom: 16px; padding: 8px 16px; border-radius: 8px; border: 1px solid #DCE2EA; background: #fff; cursor: pointer; font-size: 13px; }
      @media print { .print-btn { display: none; } body { padding: 0; } }
    </style></head>
    <body>
      <button class="print-btn" onclick="window.print()">🖨 Cetak Sekarang</button>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ''}
      <p class="meta">Dicetak: ${escapeHtml(new Date().toLocaleString('id-ID'))} — Total ${rows.length} baris</p>
      <table><thead><tr>${theadHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
    </body></html>`);
  win.document.close();
}

// ---------------------------------------------------------
// UI helper: render 4 tombol export + wiring-nya, dipakai di semua halaman Laporan.
// getRows() dipanggil SAAT tombol diklik supaya selalu memakai data hasil filter TERKINI.
// ---------------------------------------------------------
export function renderExportButtons(container, { title, getSubtitle, columns, getRows, filenameBase }) {
  container.innerHTML = `
    <div class="report-actions">
      <button type="button" class="btn btn-solid" data-x="excel">⬇ Excel</button>
      <button type="button" class="btn btn-outline" data-x="csv">⬇ CSV</button>
      <button type="button" class="btn btn-outline" data-x="pdf">⬇ PDF</button>
      <button type="button" class="btn btn-outline" data-x="print">🖨 Cetak</button>
    </div>
  `;

  const stamp = new Date().toISOString().slice(0, 10);

  container.querySelector('[data-x="excel"]').addEventListener('click', async () => {
    const rows = getRows();
    if (!rows.length) return alert('Tidak ada data untuk diexport pada filter saat ini.');
    await exportToExcel({ title, subtitle: getSubtitle?.(), columns, rows, filename: `${filenameBase}_${stamp}.xlsx` });
  });
  container.querySelector('[data-x="csv"]').addEventListener('click', () => {
    const rows = getRows();
    if (!rows.length) return alert('Tidak ada data untuk diexport pada filter saat ini.');
    exportToCSV({ columns, rows, filename: `${filenameBase}_${stamp}.csv` });
  });
  container.querySelector('[data-x="pdf"]').addEventListener('click', async () => {
    const rows = getRows();
    if (!rows.length) return alert('Tidak ada data untuk diexport pada filter saat ini.');
    await exportToPDF({ title, subtitle: getSubtitle?.(), columns, rows, filename: `${filenameBase}_${stamp}.pdf` });
  });
  container.querySelector('[data-x="print"]').addEventListener('click', () => {
    const rows = getRows();
    if (!rows.length) return alert('Tidak ada data untuk dicetak pada filter saat ini.');
    printReport({ title, subtitle: getSubtitle?.(), columns, rows });
  });
}
