import { getRekapAnggaran, listKegiatanOptions } from '../services/laporanService.js';
import { formatRupiah, formatPercent } from '../utils/format.js';
import { renderExportButtons } from '../utils/report.js';

const KELOMPOK_LABEL = {
  pajak_perijinan: 'Pajak & Perijinan',
  pemeliharaan: 'Pemeliharaan',
  bbm: 'BBM',
  lainnya: 'Lainnya',
};

export async function renderLaporanAnggaran(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Laporan — Rekap Anggaran</div>
        <div class="toolbar__subtitle">Pagu, Realisasi, Sisa, dan Persentase penyerapan per Kegiatan/Sub Kegiatan/Belanja</div>
      </div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="field" style="min-width:240px;flex:1;"><label>Kegiatan</label>
          <select id="f-kegiatan"><option value="">Semua Kegiatan</option></select>
        </div>
        <div class="field" style="min-width:200px;"><label>Kelompok Belanja</label>
          <select id="f-kelompok">
            <option value="">Semua Kelompok</option>
            <option value="pajak_perijinan">Pajak & Perijinan</option>
            <option value="pemeliharaan">Pemeliharaan</option>
            <option value="bbm">BBM</option>
            <option value="lainnya">Lainnya</option>
          </select>
        </div>
      </div>
      <div id="export-slot"></div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const exportSlot = root.querySelector('#export-slot');
  const kegiatanFilter = root.querySelector('#f-kegiatan');
  const kelompokFilter = root.querySelector('#f-kelompok');

  let rows = [];
  let filtered = [];

  try {
    const [rekap, kegiatanOptions] = await Promise.all([
      getRekapAnggaran(tahunAnggaranId),
      listKegiatanOptions(tahunAnggaranId),
    ]);
    rows = rekap;
    kegiatanOptions.forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k.id;
      opt.textContent = `${k.kode_kegiatan} — ${k.nama_kegiatan}`;
      kegiatanFilter.appendChild(opt);
    });
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Rekap Anggaran.</div>`;
    console.error('[SIMPELBMD] LaporanAnggaran error:', err.message);
    return;
  }

  const columns = [
    { key: 'kodeKegiatan', label: 'Kode Kegiatan' },
    { key: 'kegiatan', label: 'Kegiatan' },
    { key: 'subKegiatan', label: 'Sub Kegiatan' },
    { key: 'kodeRekening', label: 'Kode Rekening' },
    { key: 'namaBelanja', label: 'Belanja' },
    { key: 'kelompok', label: 'Kelompok', value: (r) => KELOMPOK_LABEL[r.kelompok] || r.kelompok },
    { key: 'pagu', label: 'Pagu', numeric: true, value: (r) => formatRupiah(r.pagu) },
    { key: 'realisasi', label: 'Realisasi', numeric: true, value: (r) => formatRupiah(r.realisasi) },
    { key: 'sisa', label: 'Sisa', numeric: true, value: (r) => formatRupiah(r.sisa) },
    { key: 'persentase', label: '%', numeric: true, value: (r) => formatPercent(r.persentase) },
  ];

  function currentSubtitle() {
    const kegiatanLabel = kegiatanFilter.value
      ? kegiatanFilter.options[kegiatanFilter.selectedIndex].textContent
      : 'Semua Kegiatan';
    const kelompokLabel = kelompokFilter.value ? KELOMPOK_LABEL[kelompokFilter.value] : 'Semua Kelompok';
    return `Filter: ${kegiatanLabel} • ${kelompokLabel}`;
  }

  renderExportButtons(exportSlot, {
    title: 'Laporan Rekap Anggaran',
    getSubtitle: currentSubtitle,
    columns,
    getRows: () => filtered,
    filenameBase: 'Rekap_Anggaran',
  });

  function draw() {
    filtered = rows.filter((r) => {
      if (kegiatanFilter.value && r.kegiatanId !== kegiatanFilter.value) return false;
      if (kelompokFilter.value && r.kelompok !== kelompokFilter.value) return false;
      return true;
    });

    if (!filtered.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data</strong>Ubah filter atau tambahkan data Belanja di menu Anggaran.</div>`;
      return;
    }

    const totalPagu = filtered.reduce((s, r) => s + r.pagu, 0);
    const totalRealisasi = filtered.reduce((s, r) => s + r.realisasi, 0);

    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Kode</th><th>Kegiatan</th><th>Sub Kegiatan</th><th>Belanja</th><th>Kelompok</th><th class="num">Pagu</th><th class="num">Realisasi</th><th class="num">Sisa</th><th class="num">%</th></tr></thead>
          <tbody>
            ${filtered.map((r) => `
              <tr>
                <td>${escapeHtml(r.kodeKegiatan)}</td>
                <td>${escapeHtml(r.kegiatan)}</td>
                <td>${escapeHtml(r.subKegiatan)}</td>
                <td>${escapeHtml(r.kodeRekening)} — ${escapeHtml(r.namaBelanja)}</td>
                <td>${escapeHtml(KELOMPOK_LABEL[r.kelompok] || r.kelompok)}</td>
                <td class="num">${formatRupiah(r.pagu)}</td>
                <td class="num">${formatRupiah(r.realisasi)}</td>
                <td class="num">${formatRupiah(r.sisa)}</td>
                <td class="num">${formatPercent(r.persentase)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;">
              <td colspan="5">Total (${filtered.length} baris)</td>
              <td class="num">${formatRupiah(totalPagu)}</td>
              <td class="num">${formatRupiah(totalRealisasi)}</td>
              <td class="num">${formatRupiah(totalPagu - totalRealisasi)}</td>
              <td class="num">${formatPercent(totalPagu === 0 ? 0 : (totalRealisasi / totalPagu) * 100)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  kegiatanFilter.addEventListener('change', draw);
  kelompokFilter.addEventListener('change', draw);
  draw();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
