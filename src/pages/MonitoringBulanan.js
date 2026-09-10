import { getRingkasanAnggaran, getRealisasiBulananKelompok } from '../services/dashboardService.js';
import { formatRupiah, formatPercent } from '../utils/format.js';

const BULAN_LABEL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export async function renderMonitoringBulanan(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Rekap Bulanan</div>
        <div class="toolbar__subtitle">Realisasi Pajak/Perijinan, Pemeliharaan, dan BBM per bulan</div>
      </div>
    </div>
    <div class="kpi-grid" id="kpi-slot" style="margin-bottom:16px;">${skeletonCards()}</div>
    <div class="panel">
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  try {
    const [ringkasan, rows] = await Promise.all([
      getRingkasanAnggaran(tahunAnggaranId),
      getRealisasiBulananKelompok(tahunAnggaranId),
    ]);

    root.querySelector('#kpi-slot').innerHTML = `
      <div class="kpi-card kpi-card--accent"><div class="kpi-card__label">Total Pagu</div><div class="kpi-card__value">${formatRupiah(ringkasan.total_pagu)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Total Realisasi</div><div class="kpi-card__value">${formatRupiah(ringkasan.total_realisasi)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Sisa Anggaran</div><div class="kpi-card__value">${formatRupiah(ringkasan.total_sisa)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Persentase</div><div class="kpi-card__value">${formatPercent(ringkasan.persentase_realisasi)}</div></div>
    `;

    // Pivot: bulan -> {pajak_perijinan, pemeliharaan, bbm}
    const byMonth = new Array(12).fill(0).map(() => ({ pajak_perijinan: 0, pemeliharaan: 0, bbm: 0 }));
    rows.forEach((r) => {
      const idx = Number(r.bulan) - 1;
      if (byMonth[idx] && byMonth[idx][r.kelompok] !== undefined) byMonth[idx][r.kelompok] = Number(r.nilai);
    });

    const totals = { pajak_perijinan: 0, pemeliharaan: 0, bbm: 0, total: 0 };
    byMonth.forEach((m) => {
      totals.pajak_perijinan += m.pajak_perijinan;
      totals.pemeliharaan += m.pemeliharaan;
      totals.bbm += m.bbm;
    });
    totals.total = totals.pajak_perijinan + totals.pemeliharaan + totals.bbm;

    root.querySelector('#table-slot').innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Bulan</th><th class="num">Pajak/Perijinan</th><th class="num">Pemeliharaan</th><th class="num">BBM</th><th class="num">Total</th></tr></thead>
          <tbody>
            ${byMonth.map((m, i) => {
              const total = m.pajak_perijinan + m.pemeliharaan + m.bbm;
              return `
                <tr>
                  <td>${BULAN_LABEL[i]}</td>
                  <td class="num">${formatRupiah(m.pajak_perijinan)}</td>
                  <td class="num">${formatRupiah(m.pemeliharaan)}</td>
                  <td class="num">${formatRupiah(m.bbm)}</td>
                  <td class="num" style="font-weight:700;">${formatRupiah(total)}</td>
                </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;background:var(--gray-50);">
              <td>Total</td>
              <td class="num">${formatRupiah(totals.pajak_perijinan)}</td>
              <td class="num">${formatRupiah(totals.pemeliharaan)}</td>
              <td class="num">${formatRupiah(totals.bbm)}</td>
              <td class="num">${formatRupiah(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  } catch (err) {
    root.querySelector('#kpi-slot').innerHTML = `<div class="alert alert--error" style="grid-column:1/-1;">Gagal memuat Rekap Bulanan.</div>`;
    console.error('[SIMPELBMD] MonitoringBulanan error:', err.message);
  }
}

function skeletonCards() {
  return Array.from({ length: 4 }).map(() => `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`).join('');
}
