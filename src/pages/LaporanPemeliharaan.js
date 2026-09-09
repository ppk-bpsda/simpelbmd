import { listPemeliharaan } from '../services/transaksiService.js';
import { JENIS_PEMELIHARAAN_OPTIONS } from '../validators/transaksiValidator.js';
import { renderExportToolbar } from '../components/ExportToolbar.js';
import { formatRupiah } from '../utils/format.js';

const HEADERS = [
  { key: 'tanggal', label: 'Tanggal' },
  { key: 'nopol', label: 'Nopol' },
  { key: 'jenisLabel', label: 'Jenis' },
  { key: 'bengkel', label: 'Bengkel/Penyedia' },
  { key: 'sparepart', label: 'Sparepart' },
  { key: 'jasa', label: 'Jasa' },
  { key: 'nilai', label: 'Total' },
];

export async function renderLaporanPemeliharaan(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Rekap Pemeliharaan</div>
        <div class="toolbar__subtitle">Riwayat pemeliharaan kendaraan berdasarkan filter aktif</div>
      </div>
      <div class="toolbar__actions" id="export-slot"></div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="field" style="min-width:200px;"><label>Jenis</label>
          <select id="f-jenis"><option value="">Semua Jenis</option>${JENIS_PEMELIHARAAN_OPTIONS.map((j) => `<option value="${j.value}">${j.label}</option>`).join('')}</select>
        </div>
        <div class="field" style="min-width:200px;"><label>Bengkel/Penyedia</label><input id="f-bengkel" placeholder="Cari nama bengkel..." /></div>
      </div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const jenisFilter = root.querySelector('#f-jenis');
  const bengkelFilter = root.querySelector('#f-bengkel');
  const exportSlot = root.querySelector('#export-slot');

  let allRows = [];
  let exportRows = [];
  try {
    allRows = await listPemeliharaan(tahunAnggaranId);
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data.</div>`;
    return;
  }

  function jenisLabel(v) { return (JENIS_PEMELIHARAAN_OPTIONS.find((j) => j.value === v) || {}).label || v; }
  function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }

  function draw() {
    const filtered = allRows.filter((r) => {
      if (jenisFilter.value && r.jenis !== jenisFilter.value) return false;
      if (bengkelFilter.value && !(r.bengkel || '').toLowerCase().includes(bengkelFilter.value.toLowerCase())) return false;
      return true;
    });

    exportRows = filtered.map((r) => ({
      tanggal: formatDate(r.tanggal),
      nopol: r.kendaraan?.nopol || '-',
      jenisLabel: jenisLabel(r.jenis),
      bengkel: r.bengkel || '-',
      sparepart: Number(r.sparepart),
      jasa: Number(r.jasa),
      nilai: Number(r.nilai),
    }));

    if (!filtered.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data yang sesuai filter</strong></div>`;
      return;
    }
    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>Bengkel</th><th class="num">Sparepart</th><th class="num">Jasa</th><th class="num">Total</th></tr></thead>
          <tbody>
            ${filtered.map((r) => `
              <tr>
                <td>${formatDate(r.tanggal)}</td>
                <td style="font-weight:700;">${escapeHtml(r.kendaraan?.nopol || '-')}</td>
                <td>${jenisLabel(r.jenis)}</td>
                <td>${escapeHtml(r.bengkel || '-')}</td>
                <td class="num">${formatRupiah(r.sparepart)}</td>
                <td class="num">${formatRupiah(r.jasa)}</td>
                <td class="num" style="font-weight:700;">${formatRupiah(r.nilai)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:12.5px;color:var(--gray-500);margin-top:10px;">Menampilkan ${filtered.length} dari ${allRows.length} transaksi.</p>
    `;
  }

  [jenisFilter].forEach((el) => el.addEventListener('change', draw));
  bengkelFilter.addEventListener('input', debounce(draw, 250));
  draw();

  renderExportToolbar(exportSlot, {
    title: 'Rekap Pemeliharaan',
    subtitle: `Filter aktif diterapkan — diunduh ${new Date().toLocaleDateString('id-ID')}`,
    filenameBase: 'Rekap_Pemeliharaan_SIMBMD',
    headers: HEADERS,
    getRows: () => exportRows,
  });
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
