import { listPajak } from '../services/transaksiService.js';
import { computeJatuhTempoStatus, JENIS_PAJAK_OPTIONS } from '../validators/transaksiValidator.js';
import { renderExportToolbar } from '../components/ExportToolbar.js';
import { formatRupiah } from '../utils/format.js';

const HEADERS = [
  { key: 'tanggal', label: 'Tanggal' },
  { key: 'nopol', label: 'Nopol' },
  { key: 'jenisLabel', label: 'Jenis' },
  { key: 'nomor_dokumen', label: 'No. Dokumen' },
  { key: 'masaBerlakuLabel', label: 'Masa Berlaku' },
  { key: 'statusLabel', label: 'Status' },
  { key: 'nilai', label: 'Nilai' },
];

export async function renderLaporanPajak(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Rekap Pajak &amp; Perijinan</div>
        <div class="toolbar__subtitle">Riwayat pajak/perijinan berdasarkan filter aktif</div>
      </div>
      <div class="toolbar__actions" id="export-slot"></div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="field" style="min-width:200px;"><label>Status Jatuh Tempo</label>
          <select id="f-status">
            <option value="">Semua Status</option>
            <option value="lewat">Sudah Jatuh Tempo</option>
            <option value="kritis">&le; 7 hari</option>
            <option value="perhatian_tinggi">&le; 14 hari</option>
            <option value="perhatian">&le; 30 hari</option>
            <option value="aman">Aman</option>
          </select>
        </div>
        <div class="field" style="min-width:200px;"><label>Jenis</label>
          <select id="f-jenis"><option value="">Semua Jenis</option>${JENIS_PAJAK_OPTIONS.map((j) => `<option value="${j.value}">${j.label}</option>`).join('')}</select>
        </div>
      </div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const statusFilter = root.querySelector('#f-status');
  const jenisFilter = root.querySelector('#f-jenis');
  const exportSlot = root.querySelector('#export-slot');

  let allRows = [];
  let exportRows = [];
  try {
    allRows = await listPajak(tahunAnggaranId);
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data.</div>`;
    return;
  }

  function jenisLabel(v) { return (JENIS_PAJAK_OPTIONS.find((j) => j.value === v) || {}).label || v; }
  function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }

  function draw() {
    const filtered = allRows.filter((r) => {
      if (jenisFilter.value && r.jenis !== jenisFilter.value) return false;
      if (statusFilter.value && computeJatuhTempoStatus(r.masa_berlaku).status !== statusFilter.value) return false;
      return true;
    });

    exportRows = filtered.map((r) => {
      const jt = computeJatuhTempoStatus(r.masa_berlaku);
      return {
        tanggal: formatDate(r.tanggal),
        nopol: r.kendaraan?.nopol || '-',
        jenisLabel: jenisLabel(r.jenis),
        nomor_dokumen: r.nomor_dokumen || '-',
        masaBerlakuLabel: formatDate(r.masa_berlaku),
        statusLabel: jt.label,
        nilai: Number(r.nilai),
      };
    });

    if (!filtered.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data yang sesuai filter</strong></div>`;
      return;
    }
    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>No. Dokumen</th><th>Status</th><th class="num">Nilai</th></tr></thead>
          <tbody>
            ${filtered.map((r) => {
              const jt = computeJatuhTempoStatus(r.masa_berlaku);
              return `
                <tr>
                  <td>${formatDate(r.tanggal)}</td>
                  <td style="font-weight:700;">${escapeHtml(r.kendaraan?.nopol || '-')}</td>
                  <td>${jenisLabel(r.jenis)}</td>
                  <td>${escapeHtml(r.nomor_dokumen || '-')}</td>
                  <td><span class="status-badge status-badge--${jt.variant}">${jt.label}</span></td>
                  <td class="num">${formatRupiah(r.nilai)}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:12.5px;color:var(--gray-500);margin-top:10px;">Menampilkan ${filtered.length} dari ${allRows.length} transaksi.</p>
    `;
  }

  [statusFilter, jenisFilter].forEach((el) => el.addEventListener('change', draw));
  draw();

  renderExportToolbar(exportSlot, {
    title: 'Rekap Pajak & Perijinan',
    subtitle: `Filter aktif diterapkan — diunduh ${new Date().toLocaleDateString('id-ID')}`,
    filenameBase: 'Rekap_Pajak_SIMBMD',
    headers: HEADERS,
    getRows: () => exportRows,
  });
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
