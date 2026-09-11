import { getRingkasanAnggaran, getRingkasanPerJenisBelanja, getPenyerapanBulanan } from '../services/dashboardService.js';
import { getKuponSummaryTotals } from '../services/kuponBbmService.js';
import { renderMonthlyAbsorptionChart } from '../charts/monthlyAbsorptionChart.js';
import { formatRupiah, formatPercent, clampPercent } from '../utils/format.js';

export async function renderDashboard(root, { tahunAnggaranId }) {
  root.innerHTML = `
    <div class="kpi-grid" id="kpi-slot">
      ${skeletonCard()}${skeletonCard()}${skeletonCard()}${skeletonCard()}
    </div>

    <div class="panel">
      <div class="panel__header">
        <div>
          <div class="panel__title">Penyerapan Anggaran Bulanan</div>
          <div class="panel__subtitle">Pagu vs Realisasi per bulan, Tahun Anggaran berjalan</div>
        </div>
      </div>
      <div style="height:280px;"><canvas id="monthly-chart"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel__header">
        <div>
          <div class="panel__title">Ringkasan per Jenis Belanja</div>
          <div class="panel__subtitle">Pajak/Perijinan • Pemeliharaan • BBM/Kupon BBM (anggaran rupiah)</div>
        </div>
      </div>
      <div id="jenis-belanja-slot" class="kpi-grid"></div>
    </div>

    <div class="panel">
      <div class="panel__header">
        <div>
          <div class="panel__title">Realisasi &amp; Sisa Kupon BBM</div>
          <div class="panel__subtitle">Penyerapan lembar kupon terhadap pengadaan Tahun Anggaran berjalan</div>
        </div>
      </div>
      <div id="kupon-slot" class="kpi-grid"></div>
    </div>
  `;

  if (!tahunAnggaranId) {
    root.querySelector('#kpi-slot').innerHTML = emptyState(
      'Belum ada Tahun Anggaran aktif',
      'Tambahkan Tahun Anggaran terlebih dahulu di menu Administrasi.'
    );
    return;
  }

  try {
    const [ringkasan, jenisBelanja, bulanan, kupon] = await Promise.all([
      getRingkasanAnggaran(tahunAnggaranId),
      getRingkasanPerJenisBelanja(tahunAnggaranId),
      getPenyerapanBulanan(tahunAnggaranId),
      getKuponSummaryTotals(tahunAnggaranId),
    ]);

    root.querySelector('#kpi-slot').innerHTML = `
      ${kpiCard('Total Pagu', formatRupiah(ringkasan.total_pagu), null, true)}
      ${kpiCard('Total Realisasi', formatRupiah(ringkasan.total_realisasi))}
      ${kpiCard('Sisa Anggaran', formatRupiah(ringkasan.total_sisa))}
      ${kpiCard('Persentase Penyerapan', formatPercent(ringkasan.persentase_realisasi), ringkasan.persentase_realisasi)}
    `;

    const jenisSlot = root.querySelector('#jenis-belanja-slot');
    if (!jenisBelanja.length) {
      jenisSlot.innerHTML = emptyState('Belum ada data', 'Data akan tampil setelah DPA dan transaksi diinput.');
    } else {
      jenisSlot.innerHTML = jenisBelanja
        .map(
          (jb) => `
            <div class="kpi-card">
              <div class="kpi-card__label">${jb.kelompok}</div>
              <div class="kpi-card__value">${formatRupiah(jb.realisasi)}</div>
              <div class="kpi-card__meta">dari pagu ${formatRupiah(jb.pagu)}</div>
              <div class="progress-track"><div class="progress-fill" style="width:${clampPercent(jb.persentase)}%"></div></div>
            </div>`
        )
        .join('');
    }

    const kuponSlot = root.querySelector('#kupon-slot');
    if (!kupon.adaData) {
      kuponSlot.innerHTML = emptyState('Belum ada Pengadaan Kupon BBM', 'Kuota lembar kupon belum diinput. Tambahkan di menu Kendaraan > Pengadaan Kupon BBM.');
    } else {
      kuponSlot.innerHTML = `
        <div class="kpi-card">
          <div class="kpi-card__label">Realisasi BBM (Kupon)</div>
          <div class="kpi-card__value">${kupon.kuponTerpakai} lembar</div>
          <div class="kpi-card__meta">${formatRupiah(kupon.nilaiTerpakai)} dari pengadaan ${kupon.kuponPengadaan} lembar (${formatRupiah(kupon.nilaiPengadaan)})</div>
          <div class="progress-track"><div class="progress-fill" style="width:${clampPercent(kupon.persentaseTerpakai)}%"></div></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__label">Sisa Kupon BBM Tersedia</div>
          <div class="kpi-card__value" style="color:${kupon.kuponSisa < 0 ? 'var(--status-critical)' : 'inherit'};">${kupon.kuponSisa} lembar</div>
          <div class="kpi-card__meta">${formatRupiah(kupon.nilaiSisa)}</div>
        </div>
      `;
    }

    const canvas = root.querySelector('#monthly-chart');
    if (bulanan.length) {
      renderMonthlyAbsorptionChart(canvas, bulanan);
    } else {
      canvas.replaceWith(
        Object.assign(document.createElement('div'), {
          innerHTML: emptyState('Belum ada transaksi', 'Grafik akan tampil setelah ada realisasi bulanan.'),
        })
      );
    }
  } catch (err) {
    root.querySelector('#kpi-slot').innerHTML = `<div class="alert alert--error" style="grid-column:1/-1;">
      Gagal memuat data dashboard. Silakan periksa koneksi Anda atau hubungi Administrator.
    </div>`;
    console.error('[SIMPELBMD] Dashboard error:', err.message);
  }
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

function skeletonCard() {
  return `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`;
}

function emptyState(title, desc) {
  return `<div class="empty-state" style="grid-column:1/-1;"><strong>${title}</strong>${desc}</div>`;
}
