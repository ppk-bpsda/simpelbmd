import { listBelanjaByTahun } from '../services/anggaranService.js';
import { supabase } from '../lib/supabaseClient.js';
import { formatRupiah, formatPercent } from '../utils/format.js';

export async function renderMonitoringAnggaran(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Monitoring Anggaran</div>
        <div class="toolbar__subtitle">Detail Pagu, Realisasi, dan status penyerapan hingga level Belanja</div>
      </div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="field" style="min-width:220px;"><label>Status</label>
          <select id="f-status">
            <option value="">Semua Status</option>
            <option value="aman">Aman</option>
            <option value="hampir_habis">Hampir Habis (&ge;90%)</option>
            <option value="melebihi">Melebihi Pagu</option>
          </select>
        </div>
      </div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const statusFilter = root.querySelector('#f-status');

  let rows = [];
  try {
    const belanjaList = await listBelanjaByTahun(tahunAnggaranId);
    const { data: realisasiRows, error } = await supabase
      .from('v_realisasi_per_belanja')
      .select('belanja_id, realisasi_per_belanja')
      .eq('tahun_anggaran_id', tahunAnggaranId);
    if (error) throw error;
    const realisasiMap = new Map((realisasiRows || []).map((r) => [r.belanja_id, Number(r.realisasi_per_belanja)]));

    rows = belanjaList.map((b) => {
      const realisasi = realisasiMap.get(b.id) || 0;
      const pagu = Number(b.pagu);
      const persentase = pagu === 0 ? 0 : (realisasi / pagu) * 100;
      return {
        kegiatan: b.sub_kegiatan.kegiatan.nama_kegiatan,
        subKegiatan: b.sub_kegiatan.nama_sub_kegiatan,
        namaBelanja: b.nama_belanja,
        kodeRekening: b.kode_rekening,
        pagu, realisasi, sisa: pagu - realisasi, persentase,
      };
    });
  } catch (err) {
    tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data Monitoring Anggaran.</div>`;
    console.error('[SIMPELBMD] MonitoringAnggaran error:', err.message);
    return;
  }

  function statusOf(p) {
    if (p > 100) return 'melebihi';
    if (p >= 90) return 'hampir_habis';
    return 'aman';
  }
  function statusBadge(p) {
    const s = statusOf(p);
    if (s === 'melebihi') return `<span class="status-badge status-badge--critical">Melebihi Pagu</span>`;
    if (s === 'hampir_habis') return `<span class="status-badge status-badge--warning">Hampir Habis</span>`;
    return `<span class="status-badge status-badge--safe">Aman</span>`;
  }

  function draw() {
    const filtered = statusFilter.value ? rows.filter((r) => statusOf(r.persentase) === statusFilter.value) : rows;
    if (!filtered.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada data</strong>Tambahkan Belanja di menu Anggaran atau ubah filter.</div>`;
      return;
    }
    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Kegiatan</th><th>Sub Kegiatan</th><th>Belanja</th><th class="num">Pagu</th><th class="num">Realisasi</th><th class="num">Sisa</th><th class="num">%</th><th>Status</th></tr></thead>
          <tbody>
            ${filtered.map((r) => `
              <tr>
                <td>${escapeHtml(r.kegiatan)}</td>
                <td>${escapeHtml(r.subKegiatan)}</td>
                <td>${escapeHtml(r.kodeRekening)} — ${escapeHtml(r.namaBelanja)}</td>
                <td class="num">${formatRupiah(r.pagu)}</td>
                <td class="num">${formatRupiah(r.realisasi)}</td>
                <td class="num">${formatRupiah(r.sisa)}</td>
                <td class="num">${formatPercent(r.persentase)}</td>
                <td>${statusBadge(r.persentase)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:12.5px;color:var(--gray-500);margin-top:10px;">Menampilkan ${filtered.length} dari ${rows.length} rincian Belanja.</p>
    `;
  }

  statusFilter.addEventListener('change', draw);
  draw();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
