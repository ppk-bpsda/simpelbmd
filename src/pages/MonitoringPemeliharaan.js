import { listPemeliharaan } from '../services/transaksiService.js';
import { JENIS_PEMELIHARAAN_OPTIONS } from '../validators/transaksiValidator.js';
import { formatRupiah } from '../utils/format.js';

export async function renderMonitoringPemeliharaan(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Monitoring Pemeliharaan</div>
        <div class="toolbar__subtitle">Tampilan pemantauan (read-only) — untuk mengedit, gunakan menu Kendaraan &gt; Pemeliharaan</div>
      </div>
    </div>
    <div class="kpi-grid" id="kpi-slot" style="margin-bottom:16px;">${skeletonCards()}</div>
    <div class="panel">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="field" style="min-width:200px;"><label>Jenis</label>
          <select id="f-jenis">
            <option value="">Semua Jenis</option>
            ${JENIS_PEMELIHARAAN_OPTIONS.map((j) => `<option value="${j.value}">${j.label}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="min-width:200px;"><label>Bengkel/Penyedia</label><input id="f-bengkel" placeholder="Cari nama bengkel..." /></div>
        <div class="field" style="min-width:200px;"><label>Urutkan</label>
          <select id="f-sort">
            <option value="tanggal_desc">Tanggal Terbaru</option>
            <option value="nilai_desc">Nilai Tertinggi</option>
          </select>
        </div>
      </div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const jenisFilter = root.querySelector('#f-jenis');
  const bengkelFilter = root.querySelector('#f-bengkel');
  const sortSelect = root.querySelector('#f-sort');

  let allRows = [];
  try {
    allRows = await listPemeliharaan(tahunAnggaranId);
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data.</div>`;
    return;
  }

  function draw() {
    let rows = allRows.filter((r) => {
      if (jenisFilter.value && r.jenis !== jenisFilter.value) return false;
      if (bengkelFilter.value && !(r.bengkel || '').toLowerCase().includes(bengkelFilter.value.toLowerCase())) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => sortSelect.value === 'nilai_desc' ? Number(b.nilai) - Number(a.nilai) : new Date(b.tanggal) - new Date(a.tanggal));

    const totalSparepart = rows.reduce((s, r) => s + Number(r.sparepart), 0);
    const totalJasa = rows.reduce((s, r) => s + Number(r.jasa), 0);
    const totalNilai = rows.reduce((s, r) => s + Number(r.nilai), 0);

    root.querySelector('#kpi-slot').innerHTML = `
      <div class="kpi-card"><div class="kpi-card__label">Jumlah Transaksi</div><div class="kpi-card__value">${rows.length}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Total Sparepart</div><div class="kpi-card__value">${formatRupiah(totalSparepart)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Total Jasa</div><div class="kpi-card__value">${formatRupiah(totalJasa)}</div></div>
      <div class="kpi-card kpi-card--accent"><div class="kpi-card__label">Total Biaya</div><div class="kpi-card__value">${formatRupiah(totalNilai)}</div></div>
    `;

    if (!rows.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data yang sesuai filter</strong></div>`;
      return;
    }

    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>Bengkel</th><th class="num">Sparepart</th><th class="num">Jasa</th><th class="num">Total</th></tr></thead>
          <tbody>
            ${rows.map((r) => `
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
    `;
  }

  [jenisFilter, sortSelect].forEach((el) => el.addEventListener('change', draw));
  bengkelFilter.addEventListener('input', debounce(draw, 250));
  draw();
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function jenisLabel(v) { return (JENIS_PEMELIHARAAN_OPTIONS.find((j) => j.value === v) || {}).label || v; }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }
function skeletonCards() { return Array.from({ length: 4 }).map(() => `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
