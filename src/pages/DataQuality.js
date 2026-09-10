import { runDataQualityChecks } from '../services/dataQualityService.js';

export async function renderDataQuality(root, { tahunAnggaranId }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Data Quality Center</div>
        <div class="toolbar__subtitle">Pemeriksaan otomatis kelengkapan &amp; kewajaran data — murni baca (read-only), tidak mengubah data apa pun</div>
      </div>
    </div>
    <div class="panel"><div id="body-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div></div>
  `;

  const bodySlot = root.querySelector('#body-slot');

  let issues = [];
  try {
    issues = await runDataQualityChecks(tahunAnggaranId);
  } catch (err) {
    bodySlot.innerHTML = `<div class="alert alert--error">Gagal menjalankan pemeriksaan Data Quality.</div>`;
    console.error('[SIMBMD] DataQuality error:', err.message);
    return;
  }

  const totalItems = issues.reduce((s, g) => s + g.items.length, 0);
  const criticalCount = issues.filter((g) => g.severity === 'critical').reduce((s, g) => s + g.items.length, 0);
  const warningCount = totalItems - criticalCount;

  if (!issues.length) {
    bodySlot.innerHTML = `
      <div class="report-summary" style="margin-bottom:0;">
        <div class="report-summary__card"><div class="report-summary__label">Status</div><div class="report-summary__value" style="color:var(--green-600, #16A34A);">Bersih ✓</div></div>
      </div>
      <div class="empty-state" style="margin-top:20px;"><strong>Tidak ditemukan masalah</strong>Seluruh pemeriksaan data yang tersedia saat ini tidak menemukan kejanggalan.</div>
    `;
    return;
  }

  bodySlot.innerHTML = `
    <div class="report-summary">
      <div class="report-summary__card"><div class="report-summary__label">Total Temuan</div><div class="report-summary__value">${totalItems}</div></div>
      <div class="report-summary__card"><div class="report-summary__label">Kritis</div><div class="report-summary__value" style="color:#DC2626;">${criticalCount}</div></div>
      <div class="report-summary__card"><div class="report-summary__label">Perlu Perhatian</div><div class="report-summary__value" style="color:#D97706;">${warningCount}</div></div>
      <div class="report-summary__card"><div class="report-summary__label">Kategori Pemeriksaan</div><div class="report-summary__value">${issues.length}</div></div>
    </div>

    ${issues.map((group) => `
      <div style="margin-top:24px;border:1px solid var(--gray-100);border-radius:var(--radius-md);overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;padding:14px 18px;background:${group.severity === 'critical' ? '#FEF2F2' : '#FFFBEB'};">
          <span class="status-badge status-badge--${group.severity === 'critical' ? 'critical' : 'warning'}">${group.items.length}</span>
          <div>
            <div style="font-weight:700;font-size:13.5px;color:var(--gray-900);">${escapeHtml(group.title)}</div>
            <div style="font-size:12px;color:var(--gray-500);">${escapeHtml(group.description)}</div>
          </div>
        </div>
        <div class="table-scroll">
          <table class="data-table">
            <tbody>
              ${group.items.slice(0, 50).map((it) => `<tr><td style="font-weight:600;width:32%;">${escapeHtml(it.label)}</td><td style="color:var(--gray-500);">${escapeHtml(it.detail || '')}</td></tr>`).join('')}
            </tbody>
          </table>
          ${group.items.length > 50 ? `<div style="padding:10px 18px;font-size:12px;color:var(--gray-500);">…dan ${group.items.length - 50} lainnya.</div>` : ''}
        </div>
      </div>
    `).join('')}
  `;
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
