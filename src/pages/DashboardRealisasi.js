import { getRingkasanAnggaran, getPenyerapanBulanan } from '../services/dashboardService.js';
import { renderCumulativeRealisasiChart } from '../charts/cumulativeRealisasiChart.js';
import { formatRupiah, formatPercent } from '../utils/format.js';

export async function renderDashboardRealisasi(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Dashboard Realisasi</div>
        <div class="toolbar__subtitle">Tren realisasi kumulatif dibandingkan Pagu sepanjang tahun</div>
      </div>
    </div>
    <div class="kpi-grid" id="kpi-slot">${skeletonCards()}</div>
    <div class="panel">
      <div class="panel__header"><div class="panel__title">Realisasi Kumulatif vs Pagu</div></div>
      <div style="height:300px;"><canvas id="cum-chart"></canvas></div>
    </div>
  `;

  try {
    const [ringkasan, bulanan] = await Promise.all([
      getRingkasanAnggaran(tahunAnggaranId),
      getPenyerapanBulanan(tahunAnggaranId),
    ]);

    const currentMonthIdx = new Date().getMonth() + 1;
    const bulanIni = bulanan.find((b) => Number(b.bulan) === currentMonthIdx);
    const bulanLalu = bulanan.find((b) => Number(b.bulan) === currentMonthIdx - 1);
    const nilaiBulanIni = bulanIni ? Number(bulanIni.realisasi) : 0;
    const nilaiBulanLalu = bulanLalu ? Number(bulanLalu.realisasi) : 0;
    const growth = nilaiBulanLalu === 0 ? null : ((nilaiBulanIni - nilaiBulanLalu) / nilaiBulanLalu) * 100;

    root.querySelector('#kpi-slot').innerHTML = `
      <div class="kpi-card kpi-card--accent">
        <div class="kpi-card__label">Total Realisasi</div>
        <div class="kpi-card__value">${formatRupiah(ringkasan.total_realisasi)}</div>
        <div class="kpi-card__meta">dari Pagu ${formatRupiah(ringkasan.total_pagu)} (${formatPercent(ringkasan.persentase_realisasi)})</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Realisasi Bulan Ini</div>
        <div class="kpi-card__value">${formatRupiah(nilaiBulanIni)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Realisasi Bulan Lalu</div>
        <div class="kpi-card__value">${formatRupiah(nilaiBulanLalu)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Perubahan vs Bulan Lalu</div>
        <div class="kpi-card__value" style="color:${growth === null ? 'var(--gray-500)' : growth >= 0 ? 'var(--status-warning)' : 'var(--status-safe)'};">
          ${growth === null ? '-' : (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%'}
        </div>
      </div>
    `;

    if (bulanan.length) {
      renderCumulativeRealisasiChart(root.querySelector('#cum-chart'), bulanan, Number(ringkasan.total_pagu));
    } else {
      root.querySelector('#cum-chart').replaceWith(
        Object.assign(document.createElement('div'), { innerHTML: `<div class="empty-state"><strong>Belum ada transaksi</strong>Grafik akan tampil setelah ada realisasi bulanan.</div>` })
      );
    }
  } catch (err) {
    root.querySelector('#kpi-slot').innerHTML = `<div class="alert alert--error" style="grid-column:1/-1;">Gagal memuat data Dashboard Realisasi.</div>`;
    console.error('[SIMPELBMD] DashboardRealisasi error:', err.message);
  }
}

function skeletonCards() {
  return Array.from({ length: 4 }).map(() => `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`).join('');
}
