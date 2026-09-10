import { runDataQualityChecks } from '../services/dataQualityService.js';
import { formatRupiah, formatPercent } from '../utils/format.js';
import { navigate } from '../router.js';

export async function renderDataQuality(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Data Quality Center</div>
        <div class="toolbar__subtitle">Pemeriksaan otomatis terhadap konsistensi dan kelengkapan data</div>
      </div>
    </div>
    <div class="kpi-grid" id="kpi-slot" style="margin-bottom:16px;">${skeletonCards()}</div>
    <div id="sections-slot"></div>
  `;

  try {
    const result = await runDataQualityChecks(tahunAnggaranId);
    const totalIssues =
      result.belanjaTanpaPagu.length + result.realisasiMelebihiPagu.length +
      result.kendaraanTidakLengkap.length + result.kibTanpaDetail.length + result.pajakKedaluwarsa.length;

    root.querySelector('#kpi-slot').innerHTML = `
      <div class="kpi-card" style="border-left:3px solid ${totalIssues > 0 ? 'var(--status-critical)' : 'var(--status-safe)'};">
        <div class="kpi-card__label">Total Peringatan</div>
        <div class="kpi-card__value" style="color:${totalIssues > 0 ? 'var(--status-critical)' : 'var(--status-safe)'};">${totalIssues}</div>
      </div>
      <div class="kpi-card"><div class="kpi-card__label">Belanja Tanpa Pagu</div><div class="kpi-card__value">${result.belanjaTanpaPagu.length}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Realisasi Melebihi Pagu</div><div class="kpi-card__value">${result.realisasiMelebihiPagu.length}</div></div>
      <div class="kpi-card"><div class="kpi-card__label">Pajak Kedaluwarsa</div><div class="kpi-card__value">${result.pajakKedaluwarsa.length}</div></div>
    `;

    const sections = root.querySelector('#sections-slot');
    sections.innerHTML = `
      ${section(
        'Belanja Tanpa Pagu (Pagu = 0)',
        'DPA kemungkinan belum lengkap diinput untuk rincian belanja berikut.',
        result.belanjaTanpaPagu,
        (b) => `<td>${escapeHtml(b.sub_kegiatan.kegiatan.nama_kegiatan)}</td><td>${escapeHtml(b.kode_rekening)} — ${escapeHtml(b.nama_belanja)}</td>`,
        ['Kegiatan', 'Belanja']
      )}
      ${section(
        'Realisasi Melebihi Pagu',
        'Rincian belanja berikut sudah terealisasi melebihi 100% dari Pagu yang tersedia.',
        result.realisasiMelebihiPagu,
        (b) => `<td>${escapeHtml(b.nama_belanja)}</td><td class="num">${formatRupiah(b.pagu)}</td><td class="num">${formatRupiah(b.realisasi)}</td><td class="num">${formatPercent((b.realisasi / b.pagu) * 100)}</td>`,
        ['Belanja', 'Pagu', 'Realisasi', '%']
      )}
      ${section(
        'Kendaraan dengan Data Tidak Lengkap',
        'Nomor Rangka atau Nomor Mesin belum diisi — lengkapi lewat menu KIB Kendaraan.',
        result.kendaraanTidakLengkap,
        (k) => `<td style="font-weight:700;color:var(--blue-600);cursor:pointer;" data-nav="/kib/kendaraan">${escapeHtml(k.nopol)}</td><td>${escapeHtml(k.kib?.nama_barang || '-')}</td><td>${k.nomor_rangka || '<span style="color:var(--status-critical);">kosong</span>'}</td><td>${k.nomor_mesin || '<span style="color:var(--status-critical);">kosong</span>'}</td>`,
        ['Nopol', 'Nama Barang', 'Nomor Rangka', 'Nomor Mesin']
      )}
      ${section(
        'KIB Kendaraan Tanpa Detail',
        'Data KIB berkategori Kendaraan namun tidak memiliki data identitas kendaraan (Nopol, dst).',
        result.kibTanpaDetail,
        (k) => `<td>${escapeHtml(k.nama_barang)}</td><td>${escapeHtml(k.register || '-')}</td>`,
        ['Nama Barang', 'Register']
      )}
      ${section(
        'Pajak/Perijinan Kedaluwarsa',
        'Transaksi berikut sudah melewati Masa Berlaku dan perlu segera diperbarui.',
        result.pajakKedaluwarsa,
        (p) => `<td style="font-weight:700;color:var(--blue-600);cursor:pointer;" data-nav="/kendaraan/pajak">${escapeHtml(p.kendaraan?.nopol || '-')}</td><td>${escapeHtml(p.jenis)}</td><td>${p.masa_berlaku ? new Date(p.masa_berlaku).toLocaleDateString('id-ID') : '-'}</td>`,
        ['Nopol', 'Jenis', 'Masa Berlaku']
      )}
    `;

    sections.querySelectorAll('[data-nav]').forEach((el) => el.addEventListener('click', () => navigate(el.dataset.nav)));
  } catch (err) {
    root.querySelector('#kpi-slot').innerHTML = `<div class="alert alert--error" style="grid-column:1/-1;">Gagal menjalankan pemeriksaan Data Quality.</div>`;
    console.error('[SIMBMD] DataQuality error:', err.message);
  }
}

function section(title, desc, rows, rowRenderer, columns) {
  return `
    <div class="panel">
      <div class="panel__header">
        <div>
          <div class="panel__title">${title} ${rows.length ? `<span class="status-badge status-badge--critical" style="margin-left:6px;">${rows.length}</span>` : `<span class="status-badge status-badge--safe" style="margin-left:6px;">Aman</span>`}</div>
          <div class="panel__subtitle">${desc}</div>
        </div>
      </div>
      ${rows.length === 0
        ? `<div class="empty-state"><strong>Tidak ada masalah ditemukan</strong></div>`
        : `<div class="table-scroll"><table class="data-table">
            <thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
            <tbody>${rows.slice(0, 50).map((r) => `<tr>${rowRenderer(r)}</tr>`).join('')}</tbody>
          </table></div>
          ${rows.length > 50 ? `<p style="font-size:12px;color:var(--gray-500);margin-top:8px;">Menampilkan 50 dari ${rows.length} temuan.</p>` : ''}`
      }
    </div>
  `;
}

function skeletonCards() { return Array.from({ length: 4 }).map(() => `<div class="kpi-card"><div class="skeleton" style="height:12px;width:60%;margin-bottom:10px;"></div><div class="skeleton" style="height:22px;width:80%;"></div></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
