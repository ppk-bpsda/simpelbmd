import { listBbm, listKendaraanOptions } from '../services/transaksiService.js';
import { formatRupiah, formatDate } from '../utils/format.js';
import { renderExportButtons } from '../utils/report.js';

const JENIS_OPTIONS = ['pertalite', 'pertamax', 'solar', 'dexlite', 'lainnya'];
const JENIS_LABEL = { pertalite: 'Pertalite', pertamax: 'Pertamax', solar: 'Solar', dexlite: 'Dexlite', lainnya: 'Lainnya' };

export async function renderLaporanBbm(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Laporan — Rekap BBM / Kupon</div>
        <div class="toolbar__subtitle">Riwayat pengisian BBM: liter, nilai, dan jarak tempuh per kendaraan</div>
      </div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="field" style="min-width:220px;"><label>Kendaraan</label>
          <select id="f-kendaraan"><option value="">Semua Kendaraan</option></select>
        </div>
        <div class="field" style="min-width:180px;"><label>Jenis BBM</label>
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
      listBbm(tahunAnggaranId),
      listKendaraanOptions(tahunAnggaranId),
    ]);
    rows = list.map((r) => ({
      id: r.id,
      tanggal: r.tanggal,
      kendaraanId: r.kendaraan?.id || null,
      nopol: r.kendaraan?.nopol || '-',
      jenisBbm: r.jenis_bbm,
      nomorKupon: r.nomor_kupon || '-',
      liter: Number(r.liter),
      hargaPerLiter: Number(r.harga_per_liter),
      nilai: Number(r.nilai),
      jarakTempuh: r.jarak_tempuh,
      pengemudi: r.pengemudi || '-',
      belanja: r.belanja?.nama_belanja || '-',
    }));
    kendaraanOptions.forEach((k) => {
      const opt = document.createElement('option');
      opt.value = k.id;
      opt.textContent = `${k.nopol}${k.kib?.nama_barang ? ' — ' + k.kib.nama_barang : ''}`;
      kendaraanFilter.appendChild(opt);
    });
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Rekap BBM.</div>`;
    console.error('[SIMPELBMD] LaporanBbm error:', err.message);
    return;
  }

  const columns = [
    { key: 'tanggal', label: 'Tanggal', value: (r) => formatDate(r.tanggal) },
    { key: 'nopol', label: 'Nopol' },
    { key: 'jenisBbm', label: 'Jenis BBM', value: (r) => JENIS_LABEL[r.jenisBbm] || r.jenisBbm },
    { key: 'nomorKupon', label: 'No. Kupon' },
    { key: 'liter', label: 'Liter', numeric: true, value: (r) => r.liter.toLocaleString('id-ID') },
    { key: 'hargaPerLiter', label: 'Harga/Liter', numeric: true, value: (r) => formatRupiah(r.hargaPerLiter) },
    { key: 'nilai', label: 'Nilai', numeric: true, value: (r) => formatRupiah(r.nilai) },
    { key: 'jarakTempuh', label: 'Jarak Tempuh (km)', numeric: true, value: (r) => (r.jarakTempuh ?? '-') },
    { key: 'pengemudi', label: 'Pengemudi' },
    { key: 'belanja', label: 'Belanja' },
  ];

  function currentSubtitle() {
    const kendaraanLabel = kendaraanFilter.value ? kendaraanFilter.options[kendaraanFilter.selectedIndex].textContent : 'Semua Kendaraan';
    const jenisLabel = jenisFilter.value ? JENIS_LABEL[jenisFilter.value] : 'Semua Jenis';
    const periode = dariFilter.value || sampaiFilter.value ? `Periode ${dariFilter.value || '…'} s/d ${sampaiFilter.value || '…'}` : 'Seluruh Periode';
    return `Filter: ${kendaraanLabel} • ${jenisLabel} • ${periode}`;
  }

  renderExportButtons(exportSlot, {
    title: 'Laporan Rekap BBM / Kupon',
    getSubtitle: currentSubtitle,
    columns,
    getRows: () => filtered,
    filenameBase: 'Rekap_BBM',
  });

  function draw() {
    filtered = rows.filter((r) => {
      if (kendaraanFilter.value && r.kendaraanId !== kendaraanFilter.value) return false;
      if (jenisFilter.value && r.jenisBbm !== jenisFilter.value) return false;
      if (dariFilter.value && r.tanggal < dariFilter.value) return false;
      if (sampaiFilter.value && r.tanggal > sampaiFilter.value) return false;
      return true;
    });

    if (!filtered.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data</strong>Ubah filter atau tambahkan data BBM/Kupon.</div>`;
      return;
    }

    const totalLiter = filtered.reduce((s, r) => s + r.liter, 0);
    const totalNilai = filtered.reduce((s, r) => s + r.nilai, 0);

    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Tanggal</th><th>Nopol</th><th>Jenis</th><th>No. Kupon</th><th class="num">Liter</th><th class="num">Harga/Liter</th><th class="num">Nilai</th><th class="num">Jarak (km)</th><th>Pengemudi</th><th>Belanja</th></tr></thead>
          <tbody>
            ${filtered.map((r) => `
              <tr>
                <td>${formatDate(r.tanggal)}</td>
                <td>${escapeHtml(r.nopol)}</td>
                <td>${escapeHtml(JENIS_LABEL[r.jenisBbm] || r.jenisBbm)}</td>
                <td>${escapeHtml(r.nomorKupon)}</td>
                <td class="num">${r.liter.toLocaleString('id-ID')}</td>
                <td class="num">${formatRupiah(r.hargaPerLiter)}</td>
                <td class="num">${formatRupiah(r.nilai)}</td>
                <td class="num">${r.jarakTempuh ?? '-'}</td>
                <td>${escapeHtml(r.pengemudi)}</td>
                <td>${escapeHtml(r.belanja)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="font-weight:700;">
              <td colspan="4">Total (${filtered.length} transaksi)</td>
              <td class="num">${totalLiter.toLocaleString('id-ID')}</td>
              <td></td>
              <td class="num">${formatRupiah(totalNilai)}</td>
              <td colspan="3"></td>
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
