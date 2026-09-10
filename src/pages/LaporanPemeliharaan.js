import { listPemeliharaan, listKendaraanOptions } from '../services/transaksiService.js';
import { formatRupiah, formatDate } from '../utils/format.js';
import { renderExportButtons } from '../utils/report.js';

const JENIS_OPTIONS = ['servis_rutin', 'oli', 'ban', 'aki', 'mesin', 'rem', 'kelistrikan', 'body', 'ac', 'lainnya'];
const JENIS_LABEL = {
  servis_rutin: 'Servis Rutin', oli: 'Oli', ban: 'Ban', aki: 'Aki', mesin: 'Mesin',
  rem: 'Rem', kelistrikan: 'Kelistrikan', body: 'Body', ac: 'AC', lainnya: 'Lainnya',
};

export async function renderLaporanPemeliharaan(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Laporan — Rekap Pemeliharaan</div>
        <div class="toolbar__subtitle">Riwayat transaksi pemeliharaan kendaraan (sparepart + jasa)</div>
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
        <div class="field" style="min-width:170px;"><label>Dari Tanggal</label><input type="date" id="f-dari" /></div>
        <div class="field" style="min-width:170px;"><label>Sampai Tanggal</label><input type="date" id="f-sampai" /></div>
      </div>
      <div id="export-slot"></div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const exportSlot = root.querySelector('#export-slot');
  const kendaraanFilter = root.querySelector('#f-kendaraan');
  const jenisFilter = root.querySelector('#f-jenis');
  const dariFilter = root.querySelector('#f-dari');
  const sampaiFilter = root.querySelector('#f-sampai');

  let rows = [];
  let filtered = [];

  try {
    const [list, kendaraanOptions] = await Promise.all([
      listPemeliharaan(tahunAnggaranId),
      listKendaraanOptions(tahunAnggaranId),
    ]);
    rows = list.map((r) => ({
      id: r.id,
      tanggal: r.tanggal,
      kendaraanId: r.kendaraan?.id || null,
      nopol: r.kendaraan?.nopol || '-',
      namaBarang: r.kendaraan?.kib?.nama_barang || '-',
      jenis: r.jenis,
      bengkel: r.bengkel || '-',
      nomorDokumen: r.nomor_dokumen || '-',
      uraian: r.uraian || '-',
      sparepart: Number(r.sparepart),
      jasa: Number(r.jasa),
      nilai: Number(r.nilai),
      belanja: r.belanja?.nama_belanja || '-',
    }));
    kendaraanOptions.forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k.id;
      opt.textContent = `${k.nopol}${k.kib?.nama_barang ? ' — ' + k.kib.nama_barang : ''}`;
      kendaraanFilter.appendChild(opt);
    });
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Rekap Pemeliharaan.</div>`;
    console.error('[SIMPELBMD] LaporanPemeliharaan error:', err.message);
    return;
  }

  const columns = [
    { key: 'tanggal', label: 'Tanggal', value: (r) => formatDate(r.tanggal) },
    { key: 'nopol', label: 'Nopol' },
    { key: 'jenis', label: 'Jenis', value: (r) => JENIS_LABEL[r.jenis] || r.jenis },
    { key: 'bengkel', label: 'Bengkel' },
    { key: 'nomorDokumen', label: 'No. Dokumen' },
    { key: 'uraian', label: 'Uraian' },
    { key: 'sparepart', label: 'Sparepart', numeric: true, value: (r) => formatRupiah(r.sparepart) },
    { key: 'jasa', label: 'Jasa', numeric: true, value: (r) => formatRupiah(r.jasa) },
    { key: 'nilai', label: 'Total', numeric: true, value: (r) => formatRupiah(r.nilai) },
    { key: 'belanja', label: 'Belanja' },
  ];

  function currentSubtitle() {
    const kendaraanLabel = kendaraanFilter.value ? kendaraanFilter.options[kendaraanFilter.selectedIndex].textContent : 'Semua Kendaraan';
    const jenisLabel = jenisFilter.value ? JENIS_LABEL[jenisFilter.value] : 'Semua Jenis';
    const periode = dariFilter.value || sampaiFilter.value ? `Periode ${dariFilter.value || '…'} s/d ${sampaiFilter.value || '…'}` : 'Seluruh Periode';
    return `Filter: ${kendaraanLabel} • ${jenisLabel} • ${periode}`;
  }

  renderExportButtons(exportSlot, {
    title: 'Laporan Rekap Pemeliharaan',
    getSubtitle: currentSubtitle,
    columns,
    getRows: () => filtered,
    filenameBase: 'Rekap_Pemeliharaan',
  });

  function draw() {
    filtered = rows.filter((r) => {
      if (kendaraanFilter.value && r.kendaraanId !== kendaraanFilter.value) return false;
      if (jenisFilter.value && r.jenis !== jenisFilter.value) return false;
      if (dariFilter.value && r.tanggal < dariFilter.value) return false;
      if (sampaiFilter.value && r.tanggal > sampaiFilter.value) return false;
      return true;
    });

    if (!filtered.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data</strong>Ubah filter atau tambahkan data Pemeliharaan.</div>`;
      return;
    }

    const totalNilai = filtered.reduce((s, r) => s + r.nilai, 0);

    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>Bengkel</th><th>No. Dokumen</th><th>Uraian</th><th class="num">Sparepart</th><th class="num">Jasa</th><th class="num">Total</th><th>Belanja</th></tr></thead>
          <tbody>
            ${filtered.map((r) => `
              <tr>
                <td>${formatDate(r.tanggal)}</td>
                <td>${escapeHtml(r.nopol)}</td>
                <td>${escapeHtml(JENIS_LABEL[r.jenis] || r.jenis)}</td>
                <td>${escapeHtml(r.bengkel)}</td>
                <td>${escapeHtml(r.nomorDokumen)}</td>
                <td>${escapeHtml(r.uraian)}</td>
                <td class="num">${formatRupiah(r.sparepart)}</td>
                <td class="num">${formatRupiah(r.jasa)}</td>
                <td class="num">${formatRupiah(r.nilai)}</td>
                <td>${escapeHtml(r.belanja)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;">
              <td colspan="8">Total (${filtered.length} transaksi)</td>
              <td class="num">${formatRupiah(totalNilai)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  [kendaraanFilter, jenisFilter, dariFilter, sampaiFilter].forEach((el) => el.addEventListener('change', draw));
  draw();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
