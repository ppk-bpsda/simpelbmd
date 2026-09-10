import { getRekapKendaraan } from '../services/laporanService.js';
import { listOpd } from '../services/opdService.js';
import { formatRupiah } from '../utils/format.js';
import { renderExportButtons } from '../utils/report.js';

export async function renderLaporanKendaraan(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  const isSuperAdmin = profile?.role === 'super_admin';

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Laporan — Rekap Kendaraan</div>
        <div class="toolbar__subtitle">Total biaya Pajak, Pemeliharaan, dan BBM per kendaraan (Nopol)</div>
      </div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        ${isSuperAdmin ? `
        <div class="field" style="min-width:220px;"><label>OPD</label>
          <select id="f-opd"><option value="">Semua OPD</option></select>
        </div>` : ''}
        <div class="field" style="min-width:200px;"><label>Status Kendaraan</label>
          <select id="f-status">
            <option value="">Semua Status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
            <option value="dihapus">Dihapus</option>
          </select>
        </div>
      </div>
      <div id="export-slot"></div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const exportSlot = root.querySelector('#export-slot');
  const opdFilter = root.querySelector('#f-opd');
  const statusFilter = root.querySelector('#f-status');

  let rows = [];
  let filtered = [];

  try {
    const tasks = [getRekapKendaraan(tahunAnggaranId)];
    if (isSuperAdmin) tasks.push(listOpd());
    const [rekap, opdList] = await Promise.all(tasks);
    rows = rekap;
    if (isSuperAdmin && opdList) {
      opdList.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.nama_opd;
        opdFilter.appendChild(opt);
      });
    }
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Rekap Kendaraan.</div>`;
    console.error('[SIMPELBMD] LaporanKendaraan error:', err.message);
    return;
  }

  const columns = [
    { key: 'nopol', label: 'Nopol' },
    { key: 'opd', label: 'OPD' },
    { key: 'jenisKendaraan', label: 'Jenis Kendaraan' },
    { key: 'unitKerja', label: 'Unit Kerja' },
    { key: 'status', label: 'Status' },
    { key: 'totalPajak', label: 'Total Pajak', numeric: true, value: (r) => formatRupiah(r.totalPajak) },
    { key: 'totalPemeliharaan', label: 'Total Pemeliharaan', numeric: true, value: (r) => formatRupiah(r.totalPemeliharaan) },
    { key: 'totalBbm', label: 'Total BBM', numeric: true, value: (r) => formatRupiah(r.totalBbm) },
    { key: 'totalKupon', label: 'Jumlah Kupon BBM', numeric: true },
    { key: 'totalBiaya', label: 'Total Biaya', numeric: true, value: (r) => formatRupiah(r.totalBiaya) },
  ];

  function currentSubtitle() {
    const opdLabel = isSuperAdmin && opdFilter.value ? opdFilter.options[opdFilter.selectedIndex].textContent : 'Semua OPD';
    const statusLabel = statusFilter.value || 'Semua Status';
    return `Filter: ${opdLabel} • Status: ${statusLabel}`;
  }

  renderExportButtons(exportSlot, {
    title: 'Laporan Rekap Kendaraan',
    getSubtitle: currentSubtitle,
    columns,
    getRows: () => filtered,
    filenameBase: 'Rekap_Kendaraan',
  });

  function draw() {
    filtered = rows.filter((r) => {
      if (isSuperAdmin && opdFilter.value && r.opdId !== opdFilter.value) return false;
      if (statusFilter.value && r.status !== statusFilter.value) return false;
      return true;
    });

    if (!filtered.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data</strong>Ubah filter atau tambahkan data Kendaraan di menu Aset & Kendaraan.</div>`;
      return;
    }

    const totalBiaya = filtered.reduce((s, r) => s + r.totalBiaya, 0);

    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Nopol</th><th>OPD</th><th>Jenis</th><th>Unit Kerja</th><th>Status</th><th class="num">Pajak</th><th class="num">Pemeliharaan</th><th class="num">BBM</th><th class="num">Kupon</th><th class="num">Total</th></tr></thead>
          <tbody>
            ${filtered.map((r) => `
              <tr>
                <td>${escapeHtml(r.nopol)}</td>
                <td>${escapeHtml(r.opd)}</td>
                <td>${escapeHtml(r.jenisKendaraan)}</td>
                <td>${escapeHtml(r.unitKerja)}</td>
                <td>${statusBadge(r.status)}</td>
                <td class="num">${formatRupiah(r.totalPajak)}</td>
                <td class="num">${formatRupiah(r.totalPemeliharaan)}</td>
                <td class="num">${formatRupiah(r.totalBbm)}</td>
                <td class="num">${r.totalKupon}</td>
                <td class="num">${formatRupiah(r.totalBiaya)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;">
              <td colspan="9">Total (${filtered.length} kendaraan)</td>
              <td class="num">${formatRupiah(totalBiaya)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  function statusBadge(s) {
    if (s === 'aktif') return `<span class="status-badge status-badge--safe">Aktif</span>`;
    if (s === 'nonaktif') return `<span class="status-badge status-badge--warning">Nonaktif</span>`;
    if (s === 'dihapus') return `<span class="status-badge status-badge--critical">Dihapus</span>`;
    return escapeHtml(s || '-');
  }

  if (isSuperAdmin) opdFilter.addEventListener('change', draw);
  statusFilter.addEventListener('change', draw);
  draw();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
