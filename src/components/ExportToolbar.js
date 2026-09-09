/**
 * Render tombol Excel/CSV/PDF/Print. `getRows()` dipanggil ULANG setiap kali
 * tombol ditekan, sehingga export selalu mengikuti filter yang sedang aktif
 * di halaman (§30-31), bukan snapshot data saat halaman pertama dimuat.
 */
export function renderExportToolbar(container, { title, subtitle = '', filenameBase, headers, getRows }) {
  container.innerHTML = `
    <button class="btn btn-outline" id="btn-export-excel">⬇ Excel</button>
    <button class="btn btn-outline" id="btn-export-csv">⬇ CSV</button>
    <button class="btn btn-outline" id="btn-export-pdf">⬇ PDF</button>
    <button class="btn btn-outline" id="btn-export-print">🖨 Print</button>
  `;

  container.querySelector('#btn-export-excel').addEventListener('click', (e) =>
    withLoading(e.currentTarget, async () => {
      const { exportExcel } = await import('../services/exportService.js');
      await exportExcel(`${filenameBase}.xlsx`, title, headers, getRows());
    })
  );

  container.querySelector('#btn-export-csv').addEventListener('click', (e) =>
    withLoading(e.currentTarget, async () => {
      const { exportCsv } = await import('../services/exportService.js');
      exportCsv(`${filenameBase}.csv`, headers, getRows());
    })
  );

  container.querySelector('#btn-export-pdf').addEventListener('click', (e) =>
    withLoading(e.currentTarget, async () => {
      const { exportPdf } = await import('../services/exportService.js');
      await exportPdf(`${filenameBase}.pdf`, title, headers, getRows(), subtitle);
    })
  );

  container.querySelector('#btn-export-print').addEventListener('click', () => window.print());
}

async function withLoading(btn, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Menyiapkan...';
  try {
    await fn();
  } catch (err) {
    console.error('[SIMBMD] Export gagal:', err.message);
    btn.textContent = 'Gagal, coba lagi';
    setTimeout(() => { btn.textContent = original; }, 2000);
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  btn.textContent = original;
}
