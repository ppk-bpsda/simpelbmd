import { listPajak, listKendaraanOptions } from '../services/transaksiService.js';
import { formatRupiah, formatDate } from '../utils/format.js';
import { renderExportButtons } from '../utils/report.js';

const JENIS_OPTIONS = ['pajak_stnk', 'pajak_kendaraan', 'kir', 'izin_trayek', 'perijinan_lainnya'];
const JENIS_LABEL = {
  pajak_stnk: 'Pajak STNK', pajak_kendaraan: 'Pajak Kendaraan', kir: 'KIR',
  izin_trayek: 'Izin Trayek', perijinan_lainnya: 'Perijinan Lainnya',
};

function jatuhTempoStatus(masaBerlaku) {
  if (!masaBerlaku) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(masaBerlaku);
  const days = Math.round((due - today) / 86400000);
  if (days < 0) return 'lewat';
  if (days <= 30) return 'segera';
  return 'aman';
}

export async function renderLaporanPajak(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Laporan — Rekap Pajak & Perijinan</div>
        <div class="toolbar__subtitle">Riwayat transaksi pajak/perijinan beserta status masa berlaku</div>
      </div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="field" style="min-width:220px;"><label>Kendaraan</label>
          <select id="f-kendaraan"><option value="">Semua Kendaraan</option></select>
        </div>
        <div class="field" style="min-width:200px;"><label>Jenis</label>
          <select id="f-jenis"><option value="">Semua Jenis</option>${JENIS_OPTIONS.map((j) => `<option value="${j}">${JENIS_LABEL[j]}</option>`).join('')}</select>
        </div>
        <div class="field" style="min-width:200px;"><label>Status Masa Berlaku</label>
          <select id="f-status">
            <option value="">Semua Status</option>
            <option value="lewat">Sudah Lewat</option>
            <option value="segera">Segera Jatuh Tempo (&le;30 hari)</option>
            <option value="aman">Masih Aman</option>
          </select>
        </div>
      </div>
      <div id="export-slot"></div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const exportSlot = root.querySelector('#export-slot');
  const kendaraanFilter = root.querySelector('#f-kendaraan');
  const jenisFilter = root.querySelector('#f-jenis');
  const statusFilter = root.querySelector('#f-status');

  let rows = [];
  let filtered = [];

  try {
    const [list, kendaraanOptions] = await Promise.all([
      listPajak(tahunAnggaranId),
      listKendaraanOptions(tahunAnggaranId),
    ]);
    rows = list.map((r) => ({
      id: r.id,
      tanggal: r.tanggal,
      kendaraanId: r.kendaraan?.id || null,
      nopol: r.kendaraan?.nopol || '-',
      jenis: r.jenis,
      nomorDokumen: r.nomor_dokumen || '-',
      masaBerlaku: r.masa_berlaku,
      nilai: Number(r.nilai),
      sumberAnggaran: r.sumber_anggaran || '-',
      belanja: r.belanja?.nama_belanja || '-',
      statusJT: jatuhTempoStatus(r.masa_berlaku),
    }));
    kendaraanOptions.forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k.id;
      opt.textContent = `${k.nopol}${k.kib?.nama_barang ? ' — ' + k.kib.nama_barang : ''}`;
      kendaraanFilter.appendChild(opt);
    });
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Rekap Pajak.</div>`;
    console.error('[SIMBMD] LaporanPajak error:', err.message);
    return;
  }

  const columns = [
    { key: 'tanggal', label: 'Tanggal', value: (r) => formatDate(r.tanggal) },
    { key: 'nopol', label: 'Nopol' },
    { key: 'jenis', label: 'Jenis', value: (r) => JENIS_LABEL[r.jenis] || r.jenis },
    { key: 'nomorDokumen', label: 'No. Dokumen' },
    { key: 'masaBerlaku', label: 'Masa Berlaku', value: (r) => formatDate(r.masaBerlaku) },
    { key: 'statusJT', label: 'Status', value: (r) => statusLabelText(r.statusJT) },
    { key: 'nilai', label: 'Nilai', numeric: true, value: (r) => formatRupiah(r.nilai) },
    { key: 'sumberAnggaran', label: 'Sumber Anggaran' },
    { key: 'belanja', label: 'Belanja' },
  ];

  function statusLabelText(s) {
    if (s === 'lewat') return 'Sudah Lewat';
    if (s === 'segera') return 'Segera Jatuh Tempo';
    if (s === 'aman') return 'Masih Aman';
    return '-';
  }
  function statusBadge(s) {
    if (s === 'lewat') return `<span class="status-badge status-badge--critical">Sudah Lewat</span>`;
    if (s === 'segera') return `<span class="status-badge status-badge--warning">Segera</span>`;
    if (s === 'aman') return `<span class="status-badge status-badge--safe">Aman</span>`;
    return '-';
  }

  function currentSubtitle() {
    const kendaraanLabel = kendaraanFilter.value ? kendaraanFilter.options[kendaraanFilter.selectedIndex].textContent : 'Semua Kendaraan';
    const jenisLabel = jenisFilter.value ? JENIS_LABEL[jenisFilter.value] : 'Semua Jenis';
    const statusLabel = statusFilter.value ? statusLabelText(statusFilter.value) : 'Semua Status';
    return `Filter: ${kendaraanLabel} • ${jenisLabel} • ${statusLabel}`;
  }

  renderExportButtons(exportSlot, {
    title: 'Laporan Rekap Pajak & Perijinan',
    getSubtitle: currentSubtitle,
    columns,
    getRows: () => filtered,
    filenameBase: 'Rekap_Pajak',
  });

  function draw() {
    filtered = rows.filter((r) => {
      if (kendaraanFilter.value && r.kendaraanId !== kendaraanFilter.value) return false;
      if (jenisFilter.value && r.jenis !== jenisFilter.value) return false;
      if (statusFilter.value && r.statusJT !== statusFilter.value) return false;
      return true;
    });

    if (!filtered.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data</strong>Ubah filter atau tambahkan data Pajak/Perijinan.</div>`;
      return;
    }

    const totalNilai = filtered.reduce((s, r) => s + r.nilai, 0);

    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>No. Dokumen</th><th>Masa Berlaku</th><th>Status</th><th class="num">Nilai</th><th>Sumber Anggaran</th><th>Belanja</th></tr></thead>
          <tbody>
            ${filtered.map((r) => `
              <tr>
                <td>${formatDate(r.tanggal)}</td>
                <td>${escapeHtml(r.nopol)}</td>
                <td>${escapeHtml(JENIS_LABEL[r.jenis] || r.jenis)}</td>
                <td>${escapeHtml(r.nomorDokumen)}</td>
                <td>${formatDate(r.masaBerlaku)}</td>
                <td>${statusBadge(r.statusJT)}</td>
                <td class="num">${formatRupiah(r.nilai)}</td>
                <td>${escapeHtml(r.sumberAnggaran)}</td>
                <td>${escapeHtml(r.belanja)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;">
              <td colspan="6">Total (${filtered.length} transaksi)</td>
              <td class="num">${formatRupiah(totalNilai)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  [kendaraanFilter, jenisFilter, statusFilter].forEach((el) => el.addEventListener('change', draw));
  draw();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
