import { getRingkasanAnggaran, getRingkasanPerKegiatan } from '../services/dashboardService.js';
import { formatRupiah, formatPercent, clampPercent } from '../utils/format.js';

export async function renderDashboardAnggaran(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Dashboard Anggaran</div>
        <div class="toolbar__subtitle">Rincian Pagu, Realisasi, dan Sisa Anggaran per Kegiatan</div>
      </div>
    </div>
    <div class="kpi-grid" id="kpi-slot">${skeletonCards()}</div>
    <div class="panel">
      <div class="panel__header"><div class="panel__title">Per Kegiatan</div></div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  try {
    const [ringkasan, perKegiatan] = await Promise.all([
      getRingkasanAnggaran(tahunAnggaranId),
      getRingkasanPerKegiatan(tahunAnggaranId),
    ]);

    root.querySelector('#kpi-slot').innerHTML = `
      ${kpiCard('Total Pagu', formatRupiah(ringkasan.total_pagu), null, true)}
      ${kpiCard('Total Realisasi', formatRupiah(ringkasan.total_realisasi))}
      ${kpiCard('Sisa Anggaran', formatRupiah(ringkasan.total_sisa))}
      ${kpiCard('Persentase Penyerapan', formatPercent(ringkasan.persentase_realisasi), ringkasan.persentase_realisasi)}
    `;

    const tableSlot = root.querySelector('#table-slot');
    if (!perKegiatan.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada data</strong>Tambahkan Kegiatan dan Belanja di menu Anggaran.</div>`;
      return;
    }
    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Kegiatan</th><th class="num">Pagu</th><th class="num">Realisasi</th><th class="num">Sisa</th><th class="num">%</th><th>Status</th></tr></thead>
          <tbody>
            ${perKegiatan.map((k) => `
              <tr>
                <td>${escapeHtml(k.kode_kegiatan)} — ${escapeHtml(k.nama_kegiatan)}</td>
                <td class="num">${formatRupiah(k.pagu)}</td>
                <td class="num">${formatRupiah(k.realisasi)}</td>
                <td class="num">${formatRupiah(k.sisa)}</td>
                <td class="num">${formatPercent(k.persentase)}</td>
                <td>${statusBadge(k.persentase)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    root.querySelector('#kpi-slot').innerHTML = `<div class="alert alert--error" style="grid-column:1/-1;">Gagal memuat data Dashboard Anggaran.</div>`;
    console.error('[SIMBMD] DashboardAnggaran error:', err.message);
  }
}

function statusBadge(persen) {
  if (persen > 100) return `<span class="status-badge status-badge--critical">Melebihi Pagu</span>`;
  if (persen >= 90) return `<span class="status-badge status-badge--warning">Hampir Habis</span>`;
  return `<span class="status-badge status-badge--safe">Aman</span>`;
}
function kpiCard(label, value, percent = null, accent = false) {
  return `
    <div class="kpi-card ${accent ? 'kpi-card--accent' : ''}">
      <div class="kpi-card__label">${label}</div>
      <div class="kpi-card__value">${value}</div>
      ${percent !== null ? `<div class="progress-track"><div class="progress-fill" style="width:${clampPercent(percent)}%"></div></div>` : ''}
    </div>
  `;
}
function skeletonCards() {
  return Array.from({ length: 4 }).map(() => `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`).join('');
}
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
