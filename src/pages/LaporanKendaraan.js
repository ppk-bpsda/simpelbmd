import { getRekapPerKendaraan } from '../services/monitoringService.js';
import { renderExportToolbar } from '../components/ExportToolbar.js';
import { formatRupiah } from '../utils/format.js';
import { navigate } from '../router.js';

const HEADERS = [
  { key: 'nopol', label: 'Nopol' },
  { key: 'total_pajak', label: 'Pajak/Perijinan' },
  { key: 'total_pemeliharaan', label: 'Pemeliharaan' },
  { key: 'total_bbm', label: 'BBM' },
  { key: 'total_kupon', label: 'Total Kupon' },
  { key: 'total', label: 'Total Biaya' },
];

export async function renderLaporanKendaraan(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Rekap Kendaraan</div>
        <div class="toolbar__subtitle">Total biaya Pajak, Pemeliharaan, dan BBM per kendaraan</div>
      </div>
      <div class="toolbar__actions" id="export-slot"></div>
    </div>
    <div class="panel"><div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div></div>
  `;

  let rows = [];
  const tableSlot = root.querySelector('#table-slot');
  try {
    const raw = await getRekapPerKendaraan(tahunAnggaranId);
    rows = raw.map((r) => ({
      ...r,
      total: Number(r.total_pajak) + Number(r.total_pemeliharaan) + Number(r.total_bbm),
    }));

    if (!rows.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada data</strong>Data akan tampil setelah ada Kendaraan dan transaksi terkait.</div>`;
    } else {
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Nopol</th><th class="num">Pajak</th><th class="num">Pemeliharaan</th><th class="num">BBM</th><th class="num">Total Kupon</th><th class="num">Total Biaya</th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td style="font-weight:700;color:var(--blue-600);cursor:pointer;" data-open="${r.kendaraan_id}">${escapeHtml(r.nopol)}</td>
                  <td class="num">${formatRupiah(r.total_pajak)}</td>
                  <td class="num">${formatRupiah(r.total_pemeliharaan)}</td>
                  <td class="num">${formatRupiah(r.total_bbm)}</td>
                  <td class="num">${r.total_kupon}</td>
                  <td class="num" style="font-weight:700;">${formatRupiah(r.total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      tableSlot.querySelectorAll('[data-open]').forEach((el) => {
        el.addEventListener('click', () => navigate(`/monitoring/nopol?kendaraan=${el.dataset.open}`));
      });
    }
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat Rekap Kendaraan.</div>`;
    console.error('[SIMBMD] LaporanKendaraan error:', err.message);
  }

  renderExportToolbar(root.querySelector('#export-slot'), {
    title: 'Rekap Kendaraan',
    subtitle: `Tahun Anggaran berjalan — diunduh ${new Date().toLocaleDateString('id-ID')}`,
    filenameBase: 'Rekap_Kendaraan_SIMBMD',
    headers: HEADERS,
    getRows: () => rows,
  });
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
