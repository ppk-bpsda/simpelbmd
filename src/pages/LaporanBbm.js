import { listBbm } from '../services/transaksiService.js';
import { JENIS_BBM_OPTIONS } from '../validators/transaksiValidator.js';
import { renderExportToolbar } from '../components/ExportToolbar.js';
import { formatRupiah } from '../utils/format.js';

const BULAN_LABEL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const HEADERS = [
  { key: 'tanggal', label: 'Tanggal' },
  { key: 'nopol', label: 'Nopol' },
  { key: 'jenisLabel', label: 'Jenis BBM' },
  { key: 'nomor_kupon', label: 'No. Kupon' },
  { key: 'liter', label: 'Liter' },
  { key: 'nilai', label: 'Nilai' },
  { key: 'jarak_tempuh', label: 'Jarak (km)' },
  { key: 'efisiensiLabel', label: 'Efisiensi' },
  { key: 'pengemudi', label: 'Pengemudi' },
];

export async function renderLaporanBbm(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Rekap BBM</div>
        <div class="toolbar__subtitle">Riwayat penggunaan BBM berdasarkan filter aktif</div>
      </div>
      <div class="toolbar__actions" id="export-slot"></div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="field" style="min-width:160px;"><label>Bulan</label>
          <select id="f-bulan"><option value="">Semua Bulan</option>${BULAN_LABEL.map((b, i) => `<option value="${i + 1}">${b}</option>`).join('')}</select>
        </div>
        <div class="field" style="min-width:160px;"><label>Nopol</label><input id="f-nopol" placeholder="Cari Nopol..." /></div>
        <div class="field" style="min-width:160px;"><label>Jenis BBM</label>
          <select id="f-jenis"><option value="">Semua Jenis</option>${JENIS_BBM_OPTIONS.map((j) => `<option value="${j.value}">${j.label}</option>`).join('')}</select>
        </div>
      </div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const bulanFilter = root.querySelector('#f-bulan');
  const nopolFilter = root.querySelector('#f-nopol');
  const jenisFilter = root.querySelector('#f-jenis');
  const exportSlot = root.querySelector('#export-slot');

  let allRows = [];
  let exportRows = [];
  try {
    allRows = await listBbm(tahunAnggaranId);
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data.</div>`;
    return;
  }

  function jenisLabel(v) { return (JENIS_BBM_OPTIONS.find((j) => j.value === v) || {}).label || v; }
  function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }

  function draw() {
    const filtered = allRows.filter((r) => {
      if (bulanFilter.value && new Date(r.tanggal).getMonth() + 1 !== Number(bulanFilter.value)) return false;
      if (nopolFilter.value && !(r.kendaraan?.nopol || '').toLowerCase().includes(nopolFilter.value.toLowerCase())) return false;
      if (jenisFilter.value && r.jenis_bbm !== jenisFilter.value) return false;
      return true;
    });

    exportRows = filtered.map((r) => {
      const eff = r.jarak_tempuh && r.liter ? (r.jarak_tempuh / r.liter).toFixed(1) + ' km/L' : '-';
      return {
        tanggal: formatDate(r.tanggal),
        nopol: r.kendaraan?.nopol || '-',
        jenisLabel: jenisLabel(r.jenis_bbm),
        nomor_kupon: r.nomor_kupon || '-',
        liter: Number(r.liter),
        nilai: Number(r.nilai),
        jarak_tempuh: r.jarak_tempuh ?? '-',
        efisiensiLabel: eff,
        pengemudi: r.pengemudi || '-',
      };
    });

    if (!filtered.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data yang sesuai filter</strong></div>`;
      return;
    }
    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>No. Kupon</th><th class="num">Liter</th><th class="num">Nilai</th><th class="num">Jarak</th><th class="num">Efisiensi</th><th>Pengemudi</th></tr></thead>
          <tbody>
            ${exportRows.map((r) => `
              <tr>
                <td>${r.tanggal}</td>
                <td style="font-weight:700;">${escapeHtml(r.nopol)}</td>
                <td>${r.jenisLabel}</td>
                <td>${escapeHtml(r.nomor_kupon)}</td>
                <td class="num">${r.liter.toFixed(1)} L</td>
                <td class="num">${formatRupiah(r.nilai)}</td>
                <td class="num">${r.jarak_tempuh}</td>
                <td class="num">${r.efisiensiLabel}</td>
                <td>${escapeHtml(r.pengemudi)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:12.5px;color:var(--gray-500);margin-top:10px;">Menampilkan ${filtered.length} dari ${allRows.length} transaksi.</p>
    `;
  }

  [bulanFilter, jenisFilter].forEach((el) => el.addEventListener('change', draw));
  nopolFilter.addEventListener('input', debounce(draw, 250));
  draw();

  renderExportToolbar(exportSlot, {
    title: 'Rekap BBM',
    subtitle: `Filter aktif diterapkan — diunduh ${new Date().toLocaleDateString('id-ID')}`,
    filenameBase: 'Rekap_BBM_SIMBMD',
    headers: HEADERS,
    getRows: () => exportRows,
  });
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
