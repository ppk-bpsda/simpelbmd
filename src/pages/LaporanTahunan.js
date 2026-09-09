import { getRingkasanAnggaran, getRingkasanPerKegiatan, getRealisasiBulananKelompok } from '../services/dashboardService.js';
import { getRekapPerKendaraan } from '../services/monitoringService.js';
import { renderExportToolbar } from '../components/ExportToolbar.js';
import { formatRupiah, formatPercent } from '../utils/format.js';

const BULAN_LABEL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const HEADERS_KEGIATAN = [
  { key: 'kode_kegiatan', label: 'Kode Kegiatan' },
  { key: 'nama_kegiatan', label: 'Nama Kegiatan' },
  { key: 'pagu', label: 'Pagu' },
  { key: 'realisasi', label: 'Realisasi' },
  { key: 'sisa', label: 'Sisa' },
  { key: 'persentase', label: 'Persentase (%)' },
];
const HEADERS_BULANAN = [
  { key: 'bulan', label: 'Bulan' },
  { key: 'pajak_perijinan', label: 'Pajak/Perijinan' },
  { key: 'pemeliharaan', label: 'Pemeliharaan' },
  { key: 'bbm', label: 'BBM' },
  { key: 'total', label: 'Total' },
];
const HEADERS_KENDARAAN = [
  { key: 'nopol', label: 'Nopol' },
  { key: 'total_pajak', label: 'Pajak/Perijinan' },
  { key: 'total_pemeliharaan', label: 'Pemeliharaan' },
  { key: 'total_bbm', label: 'BBM' },
  { key: 'total_kupon', label: 'Total Kupon' },
  { key: 'total', label: 'Total Biaya' },
];

export async function renderLaporanTahunan(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Laporan Tahunan</div>
        <div class="toolbar__subtitle">Ringkasan menyeluruh: Anggaran, Rekap Bulanan, dan Rekap Kendaraan dalam satu Tahun Anggaran</div>
      </div>
      <div class="toolbar__actions">
        <button class="btn btn-solid" id="btn-export-all">⬇ Unduh Laporan Lengkap (Excel, 3 sheet)</button>
        <button class="btn btn-outline" id="btn-print-all">🖨 Print Semua</button>
      </div>
    </div>
    <div class="kpi-grid" id="kpi-slot" style="margin-bottom:16px;">${skeletonCards()}</div>

    <div class="panel">
      <div class="panel__header">
        <div class="panel__title">1. Ringkasan Anggaran per Kegiatan</div>
        <div class="toolbar__actions" id="export-kegiatan-slot"></div>
      </div>
      <div id="kegiatan-slot"><div class="skeleton" style="height:18px;"></div></div>
    </div>

    <div class="panel">
      <div class="panel__header">
        <div class="panel__title">2. Rekap Bulanan</div>
        <div class="toolbar__actions" id="export-bulanan-slot"></div>
      </div>
      <div id="bulanan-slot"><div class="skeleton" style="height:18px;"></div></div>
    </div>

    <div class="panel">
      <div class="panel__header">
        <div class="panel__title">3. Rekap per Kendaraan</div>
        <div class="toolbar__actions" id="export-kendaraan-slot"></div>
      </div>
      <div id="kendaraan-slot"><div class="skeleton" style="height:18px;"></div></div>
    </div>
  `;

  let kegiatanRows = [];
  let bulananRows = [];
  let kendaraanRows = [];

  try {
    const [ringkasan, perKegiatan, realisasiBulanan, rekapKendaraanRaw] = await Promise.all([
      getRingkasanAnggaran(tahunAnggaranId),
      getRingkasanPerKegiatan(tahunAnggaranId),
      getRealisasiBulananKelompok(tahunAnggaranId),
      getRekapPerKendaraan(tahunAnggaranId),
    ]);

    kegiatanRows = perKegiatan;

    const byMonth = new Array(12).fill(0).map(() => ({ pajak_perijinan: 0, pemeliharaan: 0, bbm: 0 }));
    realisasiBulanan.forEach((r) => {
      const idx = Number(r.bulan) - 1;
      if (byMonth[idx] && byMonth[idx][r.kelompok] !== undefined) byMonth[idx][r.kelompok] = Number(r.nilai);
    });
    bulananRows = byMonth.map((m, i) => ({
      bulan: BULAN_LABEL[i],
      pajak_perijinan: m.pajak_perijinan,
      pemeliharaan: m.pemeliharaan,
      bbm: m.bbm,
      total: m.pajak_perijinan + m.pemeliharaan + m.bbm,
    }));

    kendaraanRows = rekapKendaraanRaw.map((r) => ({
      ...r,
      total: Number(r.total_pajak) + Number(r.total_pemeliharaan) + Number(r.total_bbm),
    }));

    root.querySelector('#kpi-slot').innerHTML = `
      <div class="kpi-card kpi-card--accent"><div class="kpi-card__label">Total Pagu</div><div class="kpi-card__value">${formatRupiah(ringkasan.total_pagu)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Total Realisasi</div><div class="kpi-card__value">${formatRupiah(ringkasan.total_realisasi)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Sisa Anggaran</div><div class="kpi-card__value">${formatRupiah(ringkasan.total_sisa)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Persentase Penyerapan</div><div class="kpi-card__value">${formatPercent(ringkasan.persentase_realisasi)}</div></div>
    `;

    drawKegiatanTable(root.querySelector('#kegiatan-slot'), kegiatanRows);
    drawBulananTable(root.querySelector('#bulanan-slot'), bulananRows);
    drawKendaraanTable(root.querySelector('#kendaraan-slot'), kendaraanRows);
  } catch (err) {
    root.querySelector('#kpi-slot').innerHTML = `<div class="alert alert--error" style="grid-column:1/-1;">Gagal memuat Laporan Tahunan.</div>`;
    console.error('[SIMBMD] LaporanTahunan error:', err.message);
    return;
  }

  const todayLabel = new Date().toLocaleDateString('id-ID');

  renderExportToolbar(root.querySelector('#export-kegiatan-slot'), {
    title: 'Ringkasan Anggaran per Kegiatan', subtitle: `Laporan Tahunan — diunduh ${todayLabel}`,
    filenameBase: 'Laporan_Tahunan_Anggaran_SIMBMD', headers: HEADERS_KEGIATAN, getRows: () => kegiatanRows,
  });
  renderExportToolbar(root.querySelector('#export-bulanan-slot'), {
    title: 'Rekap Bulanan', subtitle: `Laporan Tahunan — diunduh ${todayLabel}`,
    filenameBase: 'Laporan_Tahunan_Bulanan_SIMBMD', headers: HEADERS_BULANAN, getRows: () => bulananRows,
  });
  renderExportToolbar(root.querySelector('#export-kendaraan-slot'), {
    title: 'Rekap per Kendaraan', subtitle: `Laporan Tahunan — diunduh ${todayLabel}`,
    filenameBase: 'Laporan_Tahunan_Kendaraan_SIMBMD', headers: HEADERS_KENDARAAN, getRows: () => kendaraanRows,
  });

  root.querySelector('#btn-export-all').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Menyiapkan...';
    try {
      const { exportExcelMultiSheet } = await import('../services/exportService.js');
      await exportExcelMultiSheet('Laporan_Tahunan_SIMBMD.xlsx', [
        { sheetName: 'Ringkasan Anggaran', headers: HEADERS_KEGIATAN, rows: kegiatanRows },
        { sheetName: 'Rekap Bulanan', headers: HEADERS_BULANAN, rows: bulananRows },
        { sheetName: 'Rekap Kendaraan', headers: HEADERS_KENDARAAN, rows: kendaraanRows },
      ]);
    } catch (err) {
      console.error('[SIMBMD] Export Laporan Tahunan gagal:', err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });

  root.querySelector('#btn-print-all').addEventListener('click', () => window.print());
}

function drawKegiatanTable(el, rows) {
  if (!rows.length) { el.innerHTML = emptyState(); return; }
  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Kode</th><th>Nama Kegiatan</th><th class="num">Pagu</th><th class="num">Realisasi</th><th class="num">Sisa</th><th class="num">%</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td>${escapeHtml(r.kode_kegiatan)}</td><td>${escapeHtml(r.nama_kegiatan)}</td>
          <td class="num">${formatRupiah(r.pagu)}</td><td class="num">${formatRupiah(r.realisasi)}</td>
          <td class="num">${formatRupiah(r.sisa)}</td><td class="num">${formatPercent(r.persentase)}</td>
        </tr>`).join('')}</tbody>
    </table></div>
  `;
}
function drawBulananTable(el, rows) {
  const totals = rows.reduce((acc, r) => ({
    pajak_perijinan: acc.pajak_perijinan + r.pajak_perijinan, pemeliharaan: acc.pemeliharaan + r.pemeliharaan,
    bbm: acc.bbm + r.bbm, total: acc.total + r.total,
  }), { pajak_perijinan: 0, pemeliharaan: 0, bbm: 0, total: 0 });
  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Bulan</th><th class="num">Pajak/Perijinan</th><th class="num">Pemeliharaan</th><th class="num">BBM</th><th class="num">Total</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr><td>${r.bulan}</td><td class="num">${formatRupiah(r.pajak_perijinan)}</td><td class="num">${formatRupiah(r.pemeliharaan)}</td><td class="num">${formatRupiah(r.bbm)}</td><td class="num" style="font-weight:700;">${formatRupiah(r.total)}</td></tr>
      `).join('')}</tbody>
      <tfoot><tr style="font-weight:700;background:var(--gray-50);">
        <td>Total</td><td class="num">${formatRupiah(totals.pajak_perijinan)}</td><td class="num">${formatRupiah(totals.pemeliharaan)}</td><td class="num">${formatRupiah(totals.bbm)}</td><td class="num">${formatRupiah(totals.total)}</td>
      </tr></tfoot>
    </table></div>
  `;
}
function drawKendaraanTable(el, rows) {
  if (!rows.length) { el.innerHTML = emptyState(); return; }
  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Nopol</th><th class="num">Pajak</th><th class="num">Pemeliharaan</th><th class="num">BBM</th><th class="num">Total Kupon</th><th class="num">Total</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr>
          <td style="font-weight:700;">${escapeHtml(r.nopol)}</td>
          <td class="num">${formatRupiah(r.total_pajak)}</td><td class="num">${formatRupiah(r.total_pemeliharaan)}</td>
          <td class="num">${formatRupiah(r.total_bbm)}</td><td class="num">${r.total_kupon}</td>
          <td class="num" style="font-weight:700;">${formatRupiah(r.total)}</td>
        </tr>`).join('')}</tbody>
    </table></div>
  `;
}

function emptyState() { return `<div class="empty-state"><strong>Belum ada data</strong></div>`; }
function skeletonCards() { return Array.from({ length: 4 }).map(() => `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
