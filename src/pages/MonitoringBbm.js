import { listBbm } from '../services/transaksiService.js';
import { listPenyerapanKupon } from '../services/kuponBbmService.js';
import { JENIS_BBM_OPTIONS, RODA_LABEL, KUPON_NOMINAL } from '../validators/transaksiValidator.js';
import { formatRupiah } from '../utils/format.js';

const BULAN_LABEL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const RODA_ORDER = ['roda4', 'roda2'];

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
    <div class="panel" id="kupon-panel" style="margin-bottom:16px;">
      <div class="toolbar__title" style="font-size:15px;margin-bottom:12px;">Penyerapan &amp; Sisa Kupon BBM</div>
      <div id="kupon-slot">${skeletonKuponCards()}</div>
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
        <div class="field" style="min-width:150px;"><label>Roda</label>
          <select id="f-roda"><option value="">Semua</option><option value="roda4">Roda 4</option><option value="roda2">Roda 2</option></select>
        </div>
        <div class="field" style="min-width:160px;"><label>Pengemudi</label><input id="f-pengemudi" placeholder="Cari pengemudi..." /></div>
        <div class="field" style="min-width:180px;"><label>Urutkan</label>
          <select id="f-sort">
            <option value="tanggal_desc">Tanggal Terbaru</option>
            <option value="nilai_desc">Nominal Tertinggi</option>
            <option value="kupon_desc">Jumlah Kupon Terbanyak</option>
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
  const rodaFilter = root.querySelector('#f-roda');
  const pengemudiFilter = root.querySelector('#f-pengemudi');
  const sortSelect = root.querySelector('#f-sort');

  const kuponSlot = root.querySelector('#kupon-slot');
  try {
    const penyerapan = await listPenyerapanKupon(tahunAnggaranId);
    renderKuponCards(kuponSlot, penyerapan);
  } catch (err) {
    kuponSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Pengadaan/Penyerapan Kupon BBM.</div>`;
  }

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
      if (rodaFilter.value && r.roda_kendaraan !== rodaFilter.value) return false;
      if (pengemudiFilter.value && !(r.pengemudi || '').toLowerCase().includes(pengemudiFilter.value.toLowerCase())) return false;
      return true;
    });

    rows = [...rows].sort((a, b) => {
      if (sortSelect.value === 'nilai_desc') return Number(b.nilai) - Number(a.nilai);
      if (sortSelect.value === 'kupon_desc') return Number(b.jumlah_kupon) - Number(a.jumlah_kupon);
      if (sortSelect.value === 'nopol_asc') return (a.kendaraan?.nopol || '').localeCompare(b.kendaraan?.nopol || '');
      return new Date(b.tanggal) - new Date(a.tanggal);
    });

    const totalTransaksi = rows.length;
    const totalKupon = rows.reduce((s, r) => s + Number(r.jumlah_kupon), 0);
    const totalNominal = rows.reduce((s, r) => s + Number(r.nilai), 0);
    const totalJarak = rows.reduce((s, r) => s + (r.jarak_tempuh || 0), 0);
    const rataKupon = totalTransaksi ? totalKupon / totalTransaksi : 0;
    const rataNominal = totalTransaksi ? totalNominal / totalTransaksi : 0;

    root.querySelector('#kpi-slot').innerHTML = `
      <div class="kpi-card"><div class="kpi-card__label">Total Transaksi</div><div class="kpi-card__value">${totalTransaksi}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Total Kupon</div><div class="kpi-card__value">${totalKupon}</div></div>
      <div class="kpi-card kpi-card--accent"><div class="kpi-card__label">Total Nominal</div><div class="kpi-card__value">${formatRupiah(totalNominal)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Rata-rata Kupon/Transaksi</div><div class="kpi-card__value">${rataKupon.toFixed(1)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Rata-rata Nominal/Transaksi</div><div class="kpi-card__value">${formatRupiah(rataNominal)}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Total Jarak Tempuh</div><div class="kpi-card__value">${totalJarak} km</div></div>
    `;

    if (!rows.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data yang sesuai filter</strong></div>`;
      return;
    }

    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>Roda</th><th class="num">Jml Kupon</th><th class="num">Nilai</th><th class="num">Jarak</th><th>Pengemudi</th></tr></thead>
          <tbody>
            ${rows.map((r) => `
                <tr>
                  <td>${formatDate(r.tanggal)}</td>
                  <td style="font-weight:700;">${escapeHtml(r.kendaraan?.nopol || '-')}</td>
                  <td>${jenisLabel(r.jenis_bbm)}</td>
                  <td>${escapeHtml(RODA_LABEL[r.roda_kendaraan] || '-')}</td>
                  <td class="num">${r.jumlah_kupon}</td>
                  <td class="num">${formatRupiah(r.nilai)}</td>
                  <td class="num">${r.jarak_tempuh ?? '-'}</td>
                  <td>${escapeHtml(r.pengemudi || '-')}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:12.5px;color:var(--gray-500);margin-top:10px;">Menampilkan ${rows.length} dari ${allRows.length} transaksi.</p>
    `;
  }

  [bulanFilter, jenisFilter, rodaFilter, sortSelect].forEach((el) => el.addEventListener('change', draw));
  [nopolFilter, pengemudiFilter].forEach((el) => el.addEventListener('input', debounce(draw, 250)));
  draw();
}

function renderKuponCards(slot, penyerapanRows) {
  // Gabungkan lintas OPD (untuk super_admin yang melihat >1 OPD) supaya
  // tetap menyajikan 1 angka yang jelas per jenis roda, bukan pecahan per OPD.
  const totals = {};
  RODA_ORDER.forEach((roda) => {
    totals[roda] = { pengadaan: 0, terpakai: 0, nilaiPengadaan: 0, nilaiTerpakai: 0, hasData: false };
  });
  (penyerapanRows || []).forEach((r) => {
    const t = totals[r.roda];
    if (!t) return;
    t.pengadaan += Number(r.kupon_pengadaan) || 0;
    t.terpakai += Number(r.kupon_terpakai) || 0;
    t.nilaiPengadaan += Number(r.nilai_pengadaan) || 0;
    t.nilaiTerpakai += Number(r.nilai_terpakai) || 0;
    t.hasData = true;
  });

  const anyData = RODA_ORDER.some((r) => totals[r].hasData);
  if (!anyData) {
    slot.innerHTML = `<div class="empty-state"><strong>Belum ada Pengadaan Kupon BBM</strong>Kuota lembar kupon belum diinput untuk Tahun Anggaran ini. Tambahkan di menu Kendaraan &gt; Pengadaan Kupon BBM.</div>`;
    return;
  }

  slot.innerHTML = `
    <div class="kpi-grid">
      ${RODA_ORDER.map((roda) => {
        const t = totals[roda];
        const sisa = t.pengadaan - t.terpakai;
        const nilaiSisa = t.nilaiPengadaan - t.nilaiTerpakai;
        const persentase = t.pengadaan ? Math.round((t.terpakai / t.pengadaan) * 10000) / 100 : 0;
        const barColor = persentase >= 100 ? '#dc2626' : persentase >= 80 ? '#d97706' : '#0ea5e9';
        return `
          <div class="kpi-card" style="grid-column: span 2; min-width:300px;">
            <div class="kpi-card__label" style="font-weight:700;margin-bottom:8px;">Kupon BBM ${RODA_LABEL[roda]} (${formatRupiah(KUPON_NOMINAL[roda])}/lembar)</div>
            ${t.hasData ? `
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">
                <div><div style="font-size:11px;color:var(--gray-500);">Pengadaan</div><div style="font-weight:700;">${t.pengadaan} lembar</div><div style="font-size:11.5px;color:var(--gray-500);">${formatRupiah(t.nilaiPengadaan)}</div></div>
                <div><div style="font-size:11px;color:var(--gray-500);">Terpakai</div><div style="font-weight:700;">${t.terpakai} lembar</div><div style="font-size:11.5px;color:var(--gray-500);">${formatRupiah(t.nilaiTerpakai)}</div></div>
                <div><div style="font-size:11px;color:var(--gray-500);">Sisa</div><div style="font-weight:700;${sisa < 0 ? 'color:#dc2626;' : ''}">${sisa} lembar</div><div style="font-size:11.5px;color:var(--gray-500);">${formatRupiah(nilaiSisa)}</div></div>
              </div>
              <div style="height:8px;border-radius:4px;background:var(--gray-100);overflow:hidden;margin-bottom:4px;">
                <div style="height:100%;width:${Math.min(persentase, 100)}%;background:${barColor};"></div>
              </div>
              <div style="font-size:11.5px;color:var(--gray-500);">${persentase}% terserap</div>
            ` : `<div class="empty-state" style="padding:8px 0;">Kuota belum diinput.</div>`}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function jenisLabel(v) { return (JENIS_BBM_OPTIONS.find((j) => j.value === v) || {}).label || v; }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('id-ID') : '-'; }
function skeletonCards() { return Array.from({ length: 4 }).map(() => `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
