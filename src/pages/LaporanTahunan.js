import { getLaporanTahunan } from '../services/laporanService.js';
import { formatRupiah, formatPercent, NAMA_BULAN } from '../utils/format.js';

const KELOMPOK_LABEL = { pajak_perijinan: 'Pajak & Perijinan', pemeliharaan: 'Pemeliharaan', bbm: 'BBM', lainnya: 'Lainnya' };

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }

export async function renderLaporanTahunan(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Laporan Tahunan</div>
        <div class="toolbar__subtitle">Ringkasan akhir tahun: realisasi anggaran, penyerapan bulanan, dan biaya kendaraan</div>
      </div>
    </div>
    <div class="panel"><div id="body-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div></div>
  `;
  const bodySlot = root.querySelector('#body-slot');

  let data;
  try {
    data = await getLaporanTahunan(tahunAnggaranId);
  } catch (err) {
    bodySlot.innerHTML = `<div class="alert alert--error">Gagal memuat Laporan Tahunan.</div>`;
    console.error('[SIMBMD] LaporanTahunan error:', err.message);
    return;
  }

  const { ringkasan, perJenis, perBulan, perKegiatan, rekapKendaraan } = data;
  const totalPagu = Number(ringkasan?.total_pagu || 0);
  const totalRealisasi = Number(ringkasan?.total_realisasi || 0);
  const totalSisa = totalPagu - totalRealisasi;
  const persen = totalPagu === 0 ? 0 : (totalRealisasi / totalPagu) * 100;

  const jenisRows = (perJenis || []).map((r) => ({
    kelompok: KELOMPOK_LABEL[r.kelompok] || r.kelompok,
    pagu: Number(r.pagu || r.total_pagu || 0),
    realisasi: Number(r.realisasi || r.total_realisasi || 0),
  })).map((r) => ({ ...r, sisa: r.pagu - r.realisasi, persentase: r.pagu === 0 ? 0 : (r.realisasi / r.pagu) * 100 }));

  const kegiatanRows = (perKegiatan || []).map((r) => {
    const pagu = Number(r.pagu || r.total_pagu || 0);
    const realisasi = Number(r.realisasi || r.total_realisasi || 0);
    return {
      kode: r.kode_kegiatan || '-',
      nama: r.nama_kegiatan || '-',
      pagu, realisasi, sisa: pagu - realisasi,
      persentase: pagu === 0 ? 0 : (realisasi / pagu) * 100,
    };
  });

  let kumulatif = 0;
  const bulanRows = (perBulan || []).map((r) => {
    const realisasiBulan = Number(r.realisasi || 0);
    kumulatif += realisasiBulan;
    return {
      bulan: NAMA_BULAN[(Number(r.bulan) || 1) - 1] || `Bulan ${r.bulan}`,
      realisasiBulan,
      kumulatif,
      persentaseKumulatif: totalPagu === 0 ? 0 : (kumulatif / totalPagu) * 100,
    };
  });

  const topKendaraan = [...(rekapKendaraan || [])]
    .sort((a, b) => b.totalBiaya - a.totalBiaya)
    .slice(0, 10);

  bodySlot.innerHTML = `
    <div class="report-summary">
      <div class="report-summary__card"><div class="report-summary__label">Total Pagu</div><div class="report-summary__value">${formatRupiah(totalPagu)}</div></div>
      <div class="report-summary__card"><div class="report-summary__label">Total Realisasi</div><div class="report-summary__value">${formatRupiah(totalRealisasi)}</div></div>
      <div class="report-summary__card"><div class="report-summary__label">Sisa Anggaran</div><div class="report-summary__value">${formatRupiah(totalSisa)}</div></div>
      <div class="report-summary__card"><div class="report-summary__label">% Penyerapan</div><div class="report-summary__value">${formatPercent(persen)}</div></div>
    </div>

    <div id="export-slot" class="report-actions"></div>

    <h3 style="margin:22px 0 10px;font-size:14px;">Realisasi per Kelompok Belanja</h3>
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Kelompok</th><th class="num">Pagu</th><th class="num">Realisasi</th><th class="num">Sisa</th><th class="num">%</th></tr></thead>
      <tbody>${jenisRows.map((r) => `<tr><td>${escapeHtml(r.kelompok)}</td><td class="num">${formatRupiah(r.pagu)}</td><td class="num">${formatRupiah(r.realisasi)}</td><td class="num">${formatRupiah(r.sisa)}</td><td class="num">${formatPercent(r.persentase)}</td></tr>`).join('') || '<tr><td colspan="5">Tidak ada data</td></tr>'}</tbody>
    </table></div>

    <h3 style="margin:22px 0 10px;font-size:14px;">Realisasi per Kegiatan</h3>
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Kode</th><th>Kegiatan</th><th class="num">Pagu</th><th class="num">Realisasi</th><th class="num">Sisa</th><th class="num">%</th></tr></thead>
      <tbody>${kegiatanRows.map((r) => `<tr><td>${escapeHtml(r.kode)}</td><td>${escapeHtml(r.nama)}</td><td class="num">${formatRupiah(r.pagu)}</td><td class="num">${formatRupiah(r.realisasi)}</td><td class="num">${formatRupiah(r.sisa)}</td><td class="num">${formatPercent(r.persentase)}</td></tr>`).join('') || '<tr><td colspan="6">Tidak ada data</td></tr>'}</tbody>
    </table></div>

    <h3 style="margin:22px 0 10px;font-size:14px;">Penyerapan Bulanan</h3>
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Bulan</th><th class="num">Realisasi Bulan Ini</th><th class="num">Kumulatif</th><th class="num">% Kumulatif thd Pagu</th></tr></thead>
      <tbody>${bulanRows.map((r) => `<tr><td>${escapeHtml(r.bulan)}</td><td class="num">${formatRupiah(r.realisasiBulan)}</td><td class="num">${formatRupiah(r.kumulatif)}</td><td class="num">${formatPercent(r.persentaseKumulatif)}</td></tr>`).join('') || '<tr><td colspan="4">Tidak ada data</td></tr>'}</tbody>
    </table></div>

    <h3 style="margin:22px 0 10px;font-size:14px;">Top 10 Kendaraan berdasarkan Total Biaya</h3>
    <div class="table-scroll"><table class="data-table">
      <thead><tr><th>Nopol</th><th>OPD</th><th class="num">Pajak</th><th class="num">Pemeliharaan</th><th class="num">BBM</th><th class="num">Total</th></tr></thead>
      <tbody>${topKendaraan.map((r) => `<tr><td>${escapeHtml(r.nopol)}</td><td>${escapeHtml(r.opd)}</td><td class="num">${formatRupiah(r.totalPajak)}</td><td class="num">${formatRupiah(r.totalPemeliharaan)}</td><td class="num">${formatRupiah(r.totalBbm)}</td><td class="num">${formatRupiah(r.totalBiaya)}</td></tr>`).join('') || '<tr><td colspan="6">Tidak ada data</td></tr>'}</tbody>
    </table></div>
  `;

  const exportSlot = root.querySelector('#export-slot');
  exportSlot.innerHTML = `
    <button type="button" class="btn btn-solid" id="btn-excel">⬇ Excel</button>
    <button type="button" class="btn btn-outline" id="btn-csv">⬇ CSV</button>
    <button type="button" class="btn btn-outline" id="btn-pdf">⬇ PDF</button>
    <button type="button" class="btn btn-outline" id="btn-print">🖨 Cetak</button>
  `;

  const stamp = new Date().toISOString().slice(0, 10);
  const kpi = [
    ['Total Pagu', totalPagu], ['Total Realisasi', totalRealisasi],
    ['Sisa Anggaran', totalSisa], ['% Penyerapan', persen],
  ];

  exportSlot.querySelector('#btn-excel').addEventListener('click', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Laporan Tahunan'], [], ...kpi,
    ]), 'Ringkasan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Kelompok', 'Pagu', 'Realisasi', 'Sisa', '%'],
      ...jenisRows.map((r) => [r.kelompok, r.pagu, r.realisasi, r.sisa, r.persentase.toFixed(2)]),
    ]), 'Per Kelompok');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Kode', 'Kegiatan', 'Pagu', 'Realisasi', 'Sisa', '%'],
      ...kegiatanRows.map((r) => [r.kode, r.nama, r.pagu, r.realisasi, r.sisa, r.persentase.toFixed(2)]),
    ]), 'Per Kegiatan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Bulan', 'Realisasi Bulan Ini', 'Kumulatif', '% Kumulatif'],
      ...bulanRows.map((r) => [r.bulan, r.realisasiBulan, r.kumulatif, r.persentaseKumulatif.toFixed(2)]),
    ]), 'Penyerapan Bulanan');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Nopol', 'OPD', 'Pajak', 'Pemeliharaan', 'BBM', 'Total'],
      ...topKendaraan.map((r) => [r.nopol, r.opd, r.totalPajak, r.totalPemeliharaan, r.totalBbm, r.totalBiaya]),
    ]), 'Top Kendaraan');
    XLSX.writeFile(wb, `Laporan_Tahunan_${stamp}.xlsx`);
  });

  exportSlot.querySelector('#btn-csv').addEventListener('click', () => {
    const esc = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const section = (title, header, body) => [title, header.join(','), ...body.map((row) => row.map(esc).join(',')), ''];
    const lines = [
      ...section('RINGKASAN', ['Item', 'Nilai'], kpi),
      ...section('PER KELOMPOK BELANJA', ['Kelompok', 'Pagu', 'Realisasi', 'Sisa', '%'], jenisRows.map((r) => [r.kelompok, r.pagu, r.realisasi, r.sisa, r.persentase.toFixed(2)])),
      ...section('PER KEGIATAN', ['Kode', 'Kegiatan', 'Pagu', 'Realisasi', 'Sisa', '%'], kegiatanRows.map((r) => [r.kode, r.nama, r.pagu, r.realisasi, r.sisa, r.persentase.toFixed(2)])),
      ...section('PENYERAPAN BULANAN', ['Bulan', 'Realisasi Bulan Ini', 'Kumulatif', '% Kumulatif'], bulanRows.map((r) => [r.bulan, r.realisasiBulan, r.kumulatif, r.persentaseKumulatif.toFixed(2)])),
      ...section('TOP KENDARAAN', ['Nopol', 'OPD', 'Pajak', 'Pemeliharaan', 'BBM', 'Total'], topKendaraan.map((r) => [r.nopol, r.opd, r.totalPajak, r.totalPemeliharaan, r.totalBbm, r.totalBiaya])),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Laporan_Tahunan_${stamp}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  exportSlot.querySelector('#btn-pdf').addEventListener('click', async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const left = 32;
    doc.setFontSize(14); doc.setTextColor(15, 23, 42); doc.text('Laporan Tahunan', left, 36);
    doc.setFontSize(9); doc.setTextColor(100, 116, 139);
    doc.text(`Pagu ${formatRupiah(totalPagu)} • Realisasi ${formatRupiah(totalRealisasi)} • ${formatPercent(persen)}`, left, 52);

    autoTable(doc, { startY: 64, head: [['Kelompok', 'Pagu', 'Realisasi', 'Sisa', '%']], body: jenisRows.map((r) => [r.kelompok, formatRupiah(r.pagu), formatRupiah(r.realisasi), formatRupiah(r.sisa), formatPercent(r.persentase)]), styles: { fontSize: 8 }, headStyles: { fillColor: [11, 18, 32] }, margin: { left, right: left } });

    autoTable(doc, { startY: doc.lastAutoTable.finalY + 20, head: [['Kode', 'Kegiatan', 'Pagu', 'Realisasi', 'Sisa', '%']], body: kegiatanRows.map((r) => [r.kode, r.nama, formatRupiah(r.pagu), formatRupiah(r.realisasi), formatRupiah(r.sisa), formatPercent(r.persentase)]), styles: { fontSize: 8 }, headStyles: { fillColor: [11, 18, 32] }, margin: { left, right: left } });

    doc.addPage();
    doc.setFontSize(11); doc.setTextColor(15, 23, 42); doc.text('Penyerapan Bulanan & Top Kendaraan', left, 30);
    autoTable(doc, { startY: 42, head: [['Bulan', 'Realisasi Bulan Ini', 'Kumulatif', '% Kumulatif']], body: bulanRows.map((r) => [r.bulan, formatRupiah(r.realisasiBulan), formatRupiah(r.kumulatif), formatPercent(r.persentaseKumulatif)]), styles: { fontSize: 8 }, headStyles: { fillColor: [11, 18, 32] }, margin: { left, right: left } });
    autoTable(doc, { startY: doc.lastAutoTable.finalY + 20, head: [['Nopol', 'OPD', 'Pajak', 'Pemeliharaan', 'BBM', 'Total']], body: topKendaraan.map((r) => [r.nopol, r.opd, formatRupiah(r.totalPajak), formatRupiah(r.totalPemeliharaan), formatRupiah(r.totalBbm), formatRupiah(r.totalBiaya)]), styles: { fontSize: 8 }, headStyles: { fillColor: [11, 18, 32] }, margin: { left, right: left } });

    doc.save(`Laporan_Tahunan_${stamp}.pdf`);
  });

  exportSlot.querySelector('#btn-print').addEventListener('click', () => {
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) return alert('Popup diblokir browser. Izinkan popup untuk mencetak laporan ini.');
    const table = (title, header, body) => `<h3>${title}</h3><table><thead><tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    win.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Laporan Tahunan</title>
      <style>
        body{font-family:Arial,sans-serif;padding:28px;color:#0F172A;}
        h1{font-size:16px;margin:0 0 4px;} h3{font-size:12.5px;margin:22px 0 8px;}
        p.meta{font-size:10px;color:#94A3B8;margin:0 0 16px;}
        table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:4px;}
        th,td{border:1px solid #DCE2EA;padding:5px 7px;text-align:left;}
        th{background:#0B1220;color:#fff;} tbody tr:nth-child(even){background:#F5F7FA;}
        .print-btn{margin-bottom:16px;padding:8px 16px;border-radius:8px;border:1px solid #DCE2EA;background:#fff;cursor:pointer;}
        @media print{.print-btn{display:none;}}
      </style></head><body>
      <button class="print-btn" onclick="window.print()">🖨 Cetak Sekarang</button>
      <h1>Laporan Tahunan</h1>
      <p class="meta">Pagu ${formatRupiah(totalPagu)} • Realisasi ${formatRupiah(totalRealisasi)} • Penyerapan ${formatPercent(persen)} — Dicetak ${escapeHtml(new Date().toLocaleString('id-ID'))}</p>
      ${table('Realisasi per Kelompok Belanja', ['Kelompok', 'Pagu', 'Realisasi', 'Sisa', '%'], jenisRows.map((r) => [r.kelompok, formatRupiah(r.pagu), formatRupiah(r.realisasi), formatRupiah(r.sisa), formatPercent(r.persentase)]))}
      ${table('Realisasi per Kegiatan', ['Kode', 'Kegiatan', 'Pagu', 'Realisasi', 'Sisa', '%'], kegiatanRows.map((r) => [r.kode, r.nama, formatRupiah(r.pagu), formatRupiah(r.realisasi), formatRupiah(r.sisa), formatPercent(r.persentase)]))}
      ${table('Penyerapan Bulanan', ['Bulan', 'Realisasi Bulan Ini', 'Kumulatif', '% Kumulatif'], bulanRows.map((r) => [r.bulan, formatRupiah(r.realisasiBulan), formatRupiah(r.kumulatif), formatPercent(r.persentaseKumulatif)]))}
      ${table('Top 10 Kendaraan', ['Nopol', 'OPD', 'Pajak', 'Pemeliharaan', 'BBM', 'Total'], topKendaraan.map((r) => [r.nopol, r.opd, formatRupiah(r.totalPajak), formatRupiah(r.totalPemeliharaan), formatRupiah(r.totalBbm), formatRupiah(r.totalBiaya)]))}
      </body></html>`);
    win.document.close();
  });
}
