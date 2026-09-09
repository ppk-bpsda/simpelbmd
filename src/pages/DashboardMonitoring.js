import { listPajak } from '../services/transaksiService.js';
import { getRekapPerKendaraan } from '../services/monitoringService.js';
import { computeJatuhTempoStatus } from '../validators/transaksiValidator.js';
import { formatRupiah } from '../utils/format.js';
import { navigate } from '../router.js';

export async function renderDashboardMonitoring(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Monitoring</div>
        <div class="toolbar__subtitle">Ringkasan lintas modul untuk pemantauan harian</div>
      </div>
    </div>
    <div class="kpi-grid" id="kpi-slot">${skeletonCards()}</div>
    <div class="panel">
      <div class="panel__header"><div class="panel__title">5 Kendaraan dengan Biaya Tertinggi</div></div>
      <div id="top-kendaraan-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
    <div class="toolbar__actions" style="margin-top:4px;flex-wrap:wrap;">
      <button class="btn btn-outline" data-nav="/monitoring/bulanan">📅 Monitoring Bulanan</button>
      <button class="btn btn-outline" data-nav="/monitoring/nopol">🚗 Monitoring per Nopol</button>
      <button class="btn btn-outline" data-nav="/monitoring/pajak">📄 Monitoring Pajak</button>
      <button class="btn btn-outline" data-nav="/monitoring/pemeliharaan">🔧 Monitoring Pemeliharaan</button>
      <button class="btn btn-outline" data-nav="/monitoring/bbm">⛽ Monitoring BBM</button>
      <button class="btn btn-outline" data-nav="/monitoring/anggaran">💰 Monitoring Anggaran</button>
    </div>
  `;

  root.querySelectorAll('[data-nav]').forEach((el) => el.addEventListener('click', () => navigate(el.dataset.nav)));

  try {
    const [pajakRows, rekapKendaraan] = await Promise.all([
      listPajak(tahunAnggaranId),
      getRekapPerKendaraan(tahunAnggaranId),
    ]);

    const dueCounts = { lewat: 0, kritis: 0, perhatian: 0, perhatian_tinggi: 0 };
    pajakRows.forEach((r) => {
      const jt = computeJatuhTempoStatus(r.masa_berlaku);
      if (dueCounts[jt.status] !== undefined) dueCounts[jt.status] += 1;
    });
    const totalPerluPerhatian = dueCounts.lewat + dueCounts.kritis + dueCounts.perhatian + dueCounts.perhatian_tinggi;

    const totalBiayaKendaraan = rekapKendaraan.reduce((sum, k) => sum + Number(k.total_pajak) + Number(k.total_pemeliharaan) + Number(k.total_bbm), 0);

    root.querySelector('#kpi-slot').innerHTML = `
      <div class="kpi-card" style="border-left:3px solid var(--status-critical);">
        <div class="kpi-card__label">Pajak/Perijinan Perlu Perhatian</div>
        <div class="kpi-card__value" style="color:${totalPerluPerhatian > 0 ? 'var(--status-critical)' : 'var(--status-safe)'};">${totalPerluPerhatian}</div>
        <div class="kpi-card__meta">jatuh tempo &le; 30 hari atau sudah lewat</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Total Biaya Kendaraan</div>
        <div class="kpi-card__value">${formatRupiah(totalBiayaKendaraan)}</div>
        <div class="kpi-card__meta">akumulasi Pajak + Pemeliharaan + BBM</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Jumlah Kendaraan Termonitor</div>
        <div class="kpi-card__value">${rekapKendaraan.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-card__label">Total Kupon BBM Terpakai</div>
        <div class="kpi-card__value">${rekapKendaraan.reduce((s, k) => s + Number(k.total_kupon), 0)}</div>
      </div>
    `;

    const top5 = [...rekapKendaraan]
      .map((k) => ({ ...k, total: Number(k.total_pajak) + Number(k.total_pemeliharaan) + Number(k.total_bbm) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    const topSlot = root.querySelector('#top-kendaraan-slot');
    if (!top5.length) {
      topSlot.innerHTML = `<div class="empty-state"><strong>Belum ada data</strong>Data akan tampil setelah ada transaksi kendaraan.</div>`;
    } else {
      topSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Nopol</th><th class="num">Pajak</th><th class="num">Pemeliharaan</th><th class="num">BBM</th><th class="num">Total</th></tr></thead>
            <tbody>
              ${top5.map((k) => `
                <tr>
                  <td style="font-weight:700;cursor:pointer;color:var(--blue-600);" data-open-nopol="${k.kendaraan_id}">${escapeHtml(k.nopol)}</td>
                  <td class="num">${formatRupiah(k.total_pajak)}</td>
                  <td class="num">${formatRupiah(k.total_pemeliharaan)}</td>
                  <td class="num">${formatRupiah(k.total_bbm)}</td>
                  <td class="num" style="font-weight:700;">${formatRupiah(k.total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      topSlot.querySelectorAll('[data-open-nopol]').forEach((el) => {
        el.addEventListener('click', () => navigate(`/monitoring/nopol?kendaraan=${el.dataset.openNopol}`));
      });
    }
  } catch (err) {
    root.querySelector('#kpi-slot').innerHTML = `<div class="alert alert--error" style="grid-column:1/-1;">Gagal memuat ringkasan monitoring.</div>`;
    console.error('[SIMBMD] DashboardMonitoring error:', err.message);
  }
}

function skeletonCards() {
  return Array.from({ length: 4 }).map(() => `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`).join('');
}
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
