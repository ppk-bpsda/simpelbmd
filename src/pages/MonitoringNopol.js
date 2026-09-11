import { Chart } from 'chart.js/auto';
import { getRekapPerKendaraan, getKendaraanIdentitas } from '../services/monitoringService.js';
import { listPajak, listPemeliharaan, listBbm } from '../services/transaksiService.js';
import { computeJatuhTempoStatus, RODA_LABEL } from '../validators/transaksiValidator.js';
import { formatRupiah } from '../utils/format.js';
import { navigate, currentQuery } from '../router.js';

const BULAN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
let monthlyChartInstance = null;
let jenisChartInstance = null;

export async function renderMonitoringNopol(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  const selectedKendaraanId = currentQuery().get('kendaraan');

  if (selectedKendaraanId) {
    await renderDetail(root, { tahunAnggaranId, kendaraanId: selectedKendaraanId });
  } else {
    await renderList(root, { tahunAnggaranId });
  }
}

async function renderList(root, { tahunAnggaranId }) {
  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Monitoring per Nopol</div>
        <div class="toolbar__subtitle">Rekap biaya per kendaraan — klik Nopol untuk melihat detail riwayat</div>
      </div>
    </div>
    <div class="panel"><div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div></div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  try {
    const rows = await getRekapPerKendaraan(tahunAnggaranId);
    if (!rows.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada data</strong>Data akan tampil setelah ada Kendaraan dan transaksi terkait.</div>`;
      return;
    }
    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Nopol</th><th class="num">Pajak</th><th class="num">Pemeliharaan</th><th class="num">BBM</th><th class="num">Total Kupon</th><th class="num">Total Biaya</th></tr></thead>
          <tbody>
            ${rows.map((r) => {
              const total = Number(r.total_pajak) + Number(r.total_pemeliharaan) + Number(r.total_bbm);
              return `
                <tr style="cursor:pointer;" data-open="${r.kendaraan_id}">
                  <td style="font-weight:700;color:var(--blue-600);">${escapeHtml(r.nopol)}</td>
                  <td class="num">${formatRupiah(r.total_pajak)}</td>
                  <td class="num">${formatRupiah(r.total_pemeliharaan)}</td>
                  <td class="num">${formatRupiah(r.total_bbm)}</td>
                  <td class="num">${r.total_kupon}</td>
                  <td class="num" style="font-weight:700;">${formatRupiah(total)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
    tableSlot.querySelectorAll('[data-open]').forEach((el) => {
      el.addEventListener('click', () => navigate(`/monitoring/nopol?kendaraan=${el.dataset.open}`));
    });
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat Rekap per Kendaraan.</div>`;
    console.error('[SIMPELBMD] MonitoringNopol list error:', err.message);
  }
}

async function renderDetail(root, { tahunAnggaranId, kendaraanId }) {
  root.innerHTML = `
    <div class="breadcrumb"><span class="crumb" id="back-link">← Kembali ke Rekap per Kendaraan</span></div>
    <div class="panel" id="identitas-slot"><div class="skeleton" style="height:60px;"></div></div>
    <div class="kpi-grid" id="kpi-slot" style="margin-bottom:16px;">${skeletonCards()}</div>
    <div class="panel">
      <div class="panel__header"><div class="panel__title">Biaya per Bulan</div></div>
      <div style="height:240px;"><canvas id="monthly-chart"></canvas></div>
    </div>
    <div class="panel">
      <div class="panel__header"><div class="panel__title">Biaya per Jenis</div></div>
      <div style="height:200px;max-width:420px;"><canvas id="jenis-chart"></canvas></div>
    </div>
    <div class="panel">
      <div class="panel__header"><div class="panel__title">Riwayat Pajak / Perijinan</div></div>
      <div id="pajak-slot"><div class="skeleton" style="height:18px;"></div></div>
    </div>
    <div class="panel">
      <div class="panel__header"><div class="panel__title">Riwayat Pemeliharaan</div></div>
      <div id="pemeliharaan-slot"><div class="skeleton" style="height:18px;"></div></div>
    </div>
    <div class="panel">
      <div class="panel__header"><div class="panel__title">Riwayat BBM</div></div>
      <div id="bbm-slot"><div class="skeleton" style="height:18px;"></div></div>
    </div>
  `;

  root.querySelector('#back-link').addEventListener('click', () => navigate('/monitoring/nopol'));

  try {
    const [identitas, pajakRows, pemeliharaanRows, bbmRows] = await Promise.all([
      getKendaraanIdentitas(kendaraanId),
      listPajak(tahunAnggaranId, { kendaraanId }),
      listPemeliharaan(tahunAnggaranId, { kendaraanId }),
      listBbm(tahunAnggaranId, { kendaraanId }),
    ]);

    drawIdentitas(root.querySelector('#identitas-slot'), identitas);

    const totalPajak = pajakRows.reduce((s, r) => s + Number(r.nilai), 0);
    const totalPemeliharaan = pemeliharaanRows.reduce((s, r) => s + Number(r.nilai), 0);
    const totalBbm = bbmRows.reduce((s, r) => s + Number(r.nilai), 0);
    const totalKupon = bbmRows.length;

    root.querySelector('#kpi-slot').innerHTML = `
      <div class="kpi-card"><div class="kpi-card__label">Total Pajak/Perijinan</div><div class="kpi-card__value">${formatRupiah(totalPajak)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Total Pemeliharaan</div><div class="kpi-card__value">${formatRupiah(totalPemeliharaan)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Total BBM</div><div class="kpi-card__value">${formatRupiah(totalBbm)}</div></div>
      <div class="kpi-card kpi-card--accent"><div class="kpi-card__label">Total Biaya</div><div class="kpi-card__value">${formatRupiah(totalPajak + totalPemeliharaan + totalBbm)}</div></div>
    `;

    drawMonthlyChart(root.querySelector('#monthly-chart'), pajakRows, pemeliharaanRows, bbmRows);
    drawJenisChart(root.querySelector('#jenis-chart'), totalPajak, totalPemeliharaan, totalBbm);

    drawPajakTable(root.querySelector('#pajak-slot'), pajakRows);
    drawPemeliharaanTable(root.querySelector('#pemeliharaan-slot'), pemeliharaanRows);
    drawBbmTable(root.querySelector('#bbm-slot'), bbmRows);
  } catch (err) {
    root.querySelector('#identitas-slot').innerHTML = `<div class="alert alert--error">Gagal memuat detail kendaraan.</div>`;
    console.error('[SIMPELBMD] MonitoringNopol detail error:', err.message);
  }
}

function drawIdentitas(el, k) {
  if (!k) { el.innerHTML = `<div class="empty-state"><strong>Kendaraan tidak ditemukan</strong></div>`; return; }
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
      <div>
        <div style="font-size:20px;font-weight:700;">${escapeHtml(k.nopol)}</div>
        <div style="color:var(--gray-500);font-size:13.5px;">${escapeHtml(k.kib?.nama_barang || '-')} — ${escapeHtml(k.kib?.merk || '')} ${escapeHtml(k.kib?.type || '')}</div>
      </div>
      <div style="text-align:right;font-size:12.5px;color:var(--gray-500);">
        <div>${escapeHtml(k.kib?.opd?.nama_opd || '-')}</div>
        <div>Register: ${escapeHtml(k.kib?.register || '-')}</div>
      </div>
    </div>
    <div class="table-scroll" style="margin-top:14px;">
      <table class="data-table">
        <tbody>
          <tr><td>Nomor Rangka</td><td>${escapeHtml(k.nomor_rangka || '-')}</td><td>Nomor Mesin</td><td>${escapeHtml(k.nomor_mesin || '-')}</td></tr>
          <tr><td>Nomor BPKB</td><td>${escapeHtml(k.nomor_bpkb || '-')}</td><td>Tahun Perolehan</td><td>${k.kib?.tahun_perolehan || '-'}</td></tr>
          <tr><td>Kondisi</td><td>${kondisiLabel(k.kib?.kondisi)}</td><td>Penanggung Jawab</td><td>${escapeHtml(k.penanggung_jawab || '-')}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

function drawMonthlyChart(canvas, pajakRows, pemeliharaanRows, bbmRows) {
  const monthly = { pajak: new Array(12).fill(0), pemeliharaan: new Array(12).fill(0), bbm: new Array(12).fill(0) };
  pajakRows.forEach((r) => { monthly.pajak[new Date(r.tanggal).getMonth()] += Number(r.nilai); });
  pemeliharaanRows.forEach((r) => { monthly.pemeliharaan[new Date(r.tanggal).getMonth()] += Number(r.nilai); });
  bbmRows.forEach((r) => { monthly.bbm[new Date(r.tanggal).getMonth()] += Number(r.nilai); });

  if (monthlyChartInstance) monthlyChartInstance.destroy();
  monthlyChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: BULAN_SHORT,
      datasets: [
        { label: 'Pajak', data: monthly.pajak, backgroundColor: 'rgba(37,99,235,0.85)' },
        { label: 'Pemeliharaan', data: monthly.pemeliharaan, backgroundColor: 'rgba(217,119,6,0.85)' },
        { label: 'BBM', data: monthly.bbm, backgroundColor: 'rgba(22,163,74,0.85)' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: '#F0F2F5' } } },
    },
  });
}

function drawJenisChart(canvas, totalPajak, totalPemeliharaan, totalBbm) {
  if (jenisChartInstance) jenisChartInstance.destroy();
  jenisChartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Pajak/Perijinan', 'Pemeliharaan', 'BBM'],
      datasets: [{ data: [totalPajak, totalPemeliharaan, totalBbm], backgroundColor: ['#2563EB', '#D97706', '#16A34A'] }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } } },
  });
}

function drawPajakTable(el, rows) {
  if (!rows.length) { el.innerHTML = emptyRow(); return; }
  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Tanggal</th><th>Jenis</th><th>No. Dokumen</th><th>Status</th><th class="num">Nilai</th></tr></thead>
      <tbody>${rows.map((r) => {
        const jt = computeJatuhTempoStatus(r.masa_berlaku);
        return `<tr><td>${formatDate(r.tanggal)}</td><td>${escapeHtml(r.jenis)}</td><td>${escapeHtml(r.nomor_dokumen || '-')}</td><td><span class="status-badge status-badge--${jt.variant}">${jt.label}</span></td><td class="num">${formatRupiah(r.nilai)}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
  `;
}
function drawPemeliharaanTable(el, rows) {
  if (!rows.length) { el.innerHTML = emptyRow(); return; }
  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Tanggal</th><th>Jenis</th><th>Bengkel</th><th class="num">KM</th><th class="num">Nilai</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${formatDate(r.tanggal)}</td><td>${escapeHtml(r.jenis)}</td><td>${escapeHtml(r.bengkel || '-')}</td><td class="num">${r.kilometer ?? '-'}</td><td class="num">${formatRupiah(r.nilai)}</td></tr>`).join('')}</tbody>
    </table></div>
  `;
}
function drawBbmTable(el, rows) {
  if (!rows.length) { el.innerHTML = emptyRow(); return; }
  el.innerHTML = `
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Tanggal</th><th>Jenis BBM</th><th>Roda</th><th class="num">Jml Kupon</th><th class="num">Nilai</th><th class="num">Jarak</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${formatDate(r.tanggal)}</td><td>${escapeHtml(r.jenis_bbm)}</td><td>${escapeHtml(RODA_LABEL[r.roda_kendaraan] || '-')}</td><td class="num">${r.jumlah_kupon}</td><td class="num">${formatRupiah(r.nilai)}</td><td class="num">${r.jarak_tempuh ?? '-'} km</td></tr>`).join('')}</tbody>
    </table></div>
  `;
}

function emptyRow() { return `<div class="empty-state"><strong>Belum ada riwayat</strong></div>`; }
function kondisiLabel(k) { const map = { baik: 'Baik', rusak_ringan: 'Rusak Ringan', rusak_berat: 'Rusak Berat' }; return map[k] || '-'; }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }
function skeletonCards() { return Array.from({ length: 4 }).map(() => `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
