import { getRingkasanAnggaran, getRingkasanPerKegiatan } from '../services/dashboardService.js';
import { renderExportToolbar } from '../components/ExportToolbar.js';
import { formatRupiah, formatPercent } from '../utils/format.js';

const HEADERS = [
  { key: 'kode_kegiatan', label: 'Kode Kegiatan' },
  { key: 'nama_kegiatan', label: 'Nama Kegiatan' },
  { key: 'pagu', label: 'Pagu' },
  { key: 'realisasi', label: 'Realisasi' },
  { key: 'sisa', label: 'Sisa' },
  { key: 'persentase', label: 'Persentase (%)' },
];

export async function renderLaporanAnggaran(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Rekap Anggaran</div>
        <div class="toolbar__subtitle">Pagu, Realisasi, dan Sisa Anggaran per Kegiatan</div>
      </div>
      <div class="toolbar__actions" id="export-slot"></div>
    </div>
    <div class="kpi-grid" id="kpi-slot" style="margin-bottom:16px;">${skeletonCards()}</div>
    <div class="panel">
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  let rows = [];
  try {
    const [ringkasan, perKegiatan] = await Promise.all([
      getRingkasanAnggaran(tahunAnggaranId),
      getRingkasanPerKegiatan(tahunAnggaranId),
    ]);
    rows = perKegiatan;

    root.querySelector('#kpi-slot').innerHTML = `
      <div class="kpi-card kpi-card--accent"><div class="kpi-card__label">Total Pagu</div><div class="kpi-card__value">${formatRupiah(ringkasan.total_pagu)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Total Realisasi</div><div class="kpi-card__value">${formatRupiah(ringkasan.total_realisasi)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Sisa Anggaran</div><div class="kpi-card__value">${formatRupiah(ringkasan.total_sisa)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Persentase</div><div class="kpi-card__value">${formatPercent(ringkasan.persentase_realisasi)}</div></div>
    `;

    const tableSlot = root.querySelector('#table-slot');
    if (!rows.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada data</strong>Tambahkan Kegiatan dan Belanja di menu Anggaran.</div>`;
    } else {
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Kode</th><th>Nama Kegiatan</th><th class="num">Pagu</th><th class="num">Realisasi</th><th class="num">Sisa</th><th class="num">%</th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td>${escapeHtml(r.kode_kegiatan)}</td>
                  <td>${escapeHtml(r.nama_kegiatan)}</td>
                  <td class="num">${formatRupiah(r.pagu)}</td>
                  <td class="num">${formatRupiah(r.realisasi)}</td>
                  <td class="num">${formatRupiah(r.sisa)}</td>
                  <td class="num">${formatPercent(r.persentase)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch (err) {
    root.querySelector('#kpi-slot').innerHTML = `<div class="alert alert--error" style="grid-column:1/-1;">Gagal memuat Rekap Anggaran.</div>`;
    console.error('[SIMBMD] LaporanAnggaran error:', err.message);
  }

  renderExportToolbar(root.querySelector('#export-slot'), {
    title: 'Rekap Anggaran',
    subtitle: `Tahun Anggaran berjalan — diunduh ${new Date().toLocaleDateString('id-ID')}`,
    filenameBase: 'Rekap_Anggaran_SIMBMD',
    headers: HEADERS,
    getRows: () => rows,
  });
}

function skeletonCards() { return Array.from({ length: 4 }).map(() => `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
