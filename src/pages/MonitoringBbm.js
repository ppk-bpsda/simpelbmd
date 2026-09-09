import { listBbm } from '../services/transaksiService.js';
import { JENIS_BBM_OPTIONS } from '../validators/transaksiValidator.js';
import { formatRupiah } from '../utils/format.js';

const BULAN_LABEL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export async function renderMonitoringBbm(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Monitoring BBM</div>
        <div class="toolbar__subtitle">Tampilan pemantauan (read-only) — untuk mengedit, gunakan menu Kendaraan &gt; BBM / Kupon</div>
      </div>
    </div>
    <div class="kpi-grid" id="kpi-slot" style="margin-bottom:16px;">${skeletonCards()}</div>
    <div class="panel">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="field" style="min-width:160px;"><label>Bulan</label>
          <select id="f-bulan"><option value="">Semua Bulan</option>${BULAN_LABEL.map((b, i) => `<option value="${i + 1}">${b}</option>`).join('')}</select>
        </div>
        <div class="field" style="min-width:160px;"><label>Nopol</label><input id="f-nopol" placeholder="Cari Nopol..." /></div>
        <div class="field" style="min-width:160px;"><label>Jenis BBM</label>
          <select id="f-jenis"><option value="">Semua Jenis</option>${JENIS_BBM_OPTIONS.map((j) => `<option value="${j.value}">${j.label}</option>`).join('')}</select>
        </div>
        <div class="field" style="min-width:160px;"><label>Pengemudi</label><input id="f-pengemudi" placeholder="Cari pengemudi..." /></div>
        <div class="field" style="min-width:180px;"><label>Urutkan</label>
          <select id="f-sort">
            <option value="tanggal_desc">Tanggal Terbaru</option>
            <option value="nilai_desc">Nominal Tertinggi</option>
            <option value="liter_desc">Liter Terbanyak</option>
            <option value="nopol_asc">Nopol (A-Z)</option>
          </select>
        </div>
      </div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const bulanFilter = root.querySelector('#f-bulan');
  const nopolFilter = root.querySelector('#f-nopol');
  const jenisFilter = root.querySelector('#f-jenis');
  const pengemudiFilter = root.querySelector('#f-pengemudi');
  const sortSelect = root.querySelector('#f-sort');

  let allRows = [];
  try {
    allRows = await listBbm(tahunAnggaranId);
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data.</div>`;
    return;
  }

  function draw() {
    let rows = allRows.filter((r) => {
      if (bulanFilter.value && new Date(r.tanggal).getMonth() + 1 !== Number(bulanFilter.value)) return false;
      if (nopolFilter.value && !(r.kendaraan?.nopol || '').toLowerCase().includes(nopolFilter.value.toLowerCase())) return false;
      if (jenisFilter.value && r.jenis_bbm !== jenisFilter.value) return false;
      if (pengemudiFilter.value && !(r.pengemudi || '').toLowerCase().includes(pengemudiFilter.value.toLowerCase())) return false;
      return true;
    });

    rows = [...rows].sort((a, b) => {
      if (sortSelect.value === 'nilai_desc') return Number(b.nilai) - Number(a.nilai);
      if (sortSelect.value === 'liter_desc') return Number(b.liter) - Number(a.liter);
      if (sortSelect.value === 'nopol_asc') return (a.kendaraan?.nopol || '').localeCompare(b.kendaraan?.nopol || '');
      return new Date(b.tanggal) - new Date(a.tanggal);
    });

    const totalKupon = rows.length;
    const totalLiter = rows.reduce((s, r) => s + Number(r.liter), 0);
    const totalNominal = rows.reduce((s, r) => s + Number(r.nilai), 0);
    const totalJarak = rows.reduce((s, r) => s + (r.jarak_tempuh || 0), 0);
    const rataLiter = totalKupon ? totalLiter / totalKupon : 0;
    const rataNominal = totalKupon ? totalNominal / totalKupon : 0;
    const efisiensi = totalLiter > 0 ? totalJarak / totalLiter : 0;

    root.querySelector('#kpi-slot').innerHTML = `
      <div class="kpi-card"><div class="kpi-card__label">Total Kupon</div><div class="kpi-card__value">${totalKupon}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Total Liter</div><div class="kpi-card__value">${totalLiter.toFixed(1)} L</div></div>
      <div class="kpi-card kpi-card--accent"><div class="kpi-card__label">Total Nominal</div><div class="kpi-card__value">${formatRupiah(totalNominal)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Rata-rata Liter/Transaksi</div><div class="kpi-card__value">${rataLiter.toFixed(1)} L</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Rata-rata Nominal/Transaksi</div><div class="kpi-card__value">${formatRupiah(rataNominal)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Total Jarak Tempuh</div><div class="kpi-card__value">${totalJarak} km</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Efisiensi Rata-rata</div><div class="kpi-card__value">${efisiensi ? efisiensi.toFixed(1) + ' km/L' : '-'}</div></div>
    `;

    if (!rows.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data yang sesuai filter</strong></div>`;
      return;
    }

    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>No. Kupon</th><th class="num">Liter</th><th class="num">Nilai</th><th class="num">Jarak</th><th class="num">Efisiensi</th><th>Pengemudi</th></tr></thead>
          <tbody>
            ${rows.map((r) => {
              const eff = r.jarak_tempuh && r.liter ? (r.jarak_tempuh / r.liter).toFixed(1) + ' km/L' : '-';
              return `
                <tr>
                  <td>${formatDate(r.tanggal)}</td>
                  <td style="font-weight:700;">${escapeHtml(r.kendaraan?.nopol || '-')}</td>
                  <td>${jenisLabel(r.jenis_bbm)}</td>
                  <td>${escapeHtml(r.nomor_kupon || '-')}</td>
                  <td class="num">${Number(r.liter).toFixed(1)} L</td>
                  <td class="num">${formatRupiah(r.nilai)}</td>
                  <td class="num">${r.jarak_tempuh ?? '-'}</td>
                  <td class="num">${eff}</td>
                  <td>${escapeHtml(r.pengemudi || '-')}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:12.5px;color:var(--gray-500);margin-top:10px;">Menampilkan ${rows.length} dari ${allRows.length} transaksi.</p>
    `;
  }

  [bulanFilter, jenisFilter, sortSelect].forEach((el) => el.addEventListener('change', draw));
  [nopolFilter, pengemudiFilter].forEach((el) => el.addEventListener('input', debounce(draw, 250)));
  draw();
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function jenisLabel(v) { return (JENIS_BBM_OPTIONS.find((j) => j.value === v) || {}).label || v; }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }
function skeletonCards() { return Array.from({ length: 4 }).map(() => `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
