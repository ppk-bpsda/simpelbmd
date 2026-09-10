import { listAuditLogs, listAuditTableNames } from '../services/auditLogService.js';
import { formatDate } from '../utils/format.js';
import { renderExportButtons } from '../utils/report.js';

const ACTION_LABEL = { insert: 'Tambah', update: 'Ubah', delete: 'Hapus' };
function actionBadge(a) {
  if (a === 'insert') return `<span class="status-badge status-badge--safe">Tambah</span>`;
  if (a === 'update') return `<span class="status-badge status-badge--warning">Ubah</span>`;
  if (a === 'delete') return `<span class="status-badge status-badge--critical">Hapus</span>`;
  return escapeHtml(a || '-');
}

export async function renderAdminAuditLog(root, { profile }) {
  const isSuperAdmin = profile?.role === 'super_admin';

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Administrasi — Audit Log</div>
        <div class="toolbar__subtitle">${isSuperAdmin ? 'Seluruh aktivitas insert/update/delete di sistem' : 'Aktivitas milik akun Anda sendiri'}</div>
      </div>
    </div>
    <div class="panel">
      ${!isSuperAdmin ? `<div class="alert alert--info" style="margin-bottom:16px;">Anda hanya dapat melihat riwayat aktivitas akun Anda sendiri. Hubungi Super Admin untuk melihat audit log lintas pengguna.</div>` : ''}
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="field" style="min-width:180px;"><label>Tabel</label><select id="f-table"><option value="">Semua Tabel</option></select></div>
        <div class="field" style="min-width:160px;"><label>Aksi</label>
          <select id="f-action"><option value="">Semua Aksi</option><option value="insert">Tambah</option><option value="update">Ubah</option><option value="delete">Hapus</option></select>
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
  const tableFilter = root.querySelector('#f-table');
  const actionFilter = root.querySelector('#f-action');
  const dariFilter = root.querySelector('#f-dari');
  const sampaiFilter = root.querySelector('#f-sampai');

  try {
    const tableNames = await listAuditTableNames();
    tableNames.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t;
      tableFilter.appendChild(opt);
    });
  } catch (e) { /* non-fatal, dropdown tetap "Semua Tabel" */ }

  let rows = [];

  const columns = [
    { key: 'created_at', label: 'Waktu', value: (r) => new Date(r.created_at).toLocaleString('id-ID') },
    { key: 'actor', label: 'Pengguna', value: (r) => r.actor?.nama ? `${r.actor.nama} (${r.actor.username})` : (r.user_id || 'Sistem') },
    { key: 'action', label: 'Aksi', value: (r) => ACTION_LABEL[r.action] || r.action },
    { key: 'table_name', label: 'Tabel' },
    { key: 'record_id', label: 'Record ID' },
  ];

  function currentSubtitle() {
    const t = tableFilter.value || 'Semua Tabel';
    const a = actionFilter.value ? ACTION_LABEL[actionFilter.value] : 'Semua Aksi';
    return `Filter: ${t} • ${a}`;
  }

  renderExportButtons(exportSlot, {
    title: 'Audit Log',
    getSubtitle: currentSubtitle,
    columns,
    getRows: () => rows,
    filenameBase: 'Audit_Log',
  });

  async function load() {
    tableSlot.innerHTML = `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`;
    try {
      rows = await listAuditLogs({
        tableName: tableFilter.value || undefined,
        action: actionFilter.value || undefined,
        dari: dariFilter.value || undefined,
        sampai: sampaiFilter.value || undefined,
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat Audit Log.</div>`;
      console.error('[SIMPELBMD] AdminAuditLog error:', err.message);
      return;
    }
    draw();
  }

  function draw() {
    if (!rows.length) {
      tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada aktivitas</strong>Ubah filter atau coba rentang tanggal lain.</div>`;
      return;
    }
    tableSlot.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Tabel</th><th>Record ID</th><th></th></tr></thead>
          <tbody>
            ${rows.map((r, i) => `
              <tr>
                <td>${new Date(r.created_at).toLocaleString('id-ID')}</td>
                <td>${r.actor?.nama ? `${escapeHtml(r.actor.nama)} <span style="color:var(--gray-500);">(${escapeHtml(r.actor.username)})</span>` : (r.user_id ? escapeHtml(r.user_id) : 'Sistem')}</td>
                <td>${actionBadge(r.action)}</td>
                <td>${escapeHtml(r.table_name || '-')}</td>
                <td style="font-family:monospace;font-size:11.5px;">${escapeHtml((r.record_id || '-').toString().slice(0, 8))}</td>
                <td><button class="btn-ghost" data-detail="${i}">Detail</button></td>
              </tr>
              <tr class="audit-detail-row" data-detail-row="${i}" style="display:none;">
                <td colspan="6">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:8px 0;">
                    <div><div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:4px;">DATA SEBELUM</div><pre style="background:var(--gray-50);border-radius:8px;padding:10px;font-size:11px;max-height:220px;overflow:auto;">${escapeHtml(JSON.stringify(r.old_data, null, 2) || '—')}</pre></div>
                    <div><div style="font-size:11px;font-weight:700;color:var(--gray-500);margin-bottom:4px;">DATA SESUDAH</div><pre style="background:var(--gray-50);border-radius:8px;padding:10px;font-size:11px;max-height:220px;overflow:auto;">${escapeHtml(JSON.stringify(r.new_data, null, 2) || '—')}</pre></div>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    tableSlot.querySelectorAll('[data-detail]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = tableSlot.querySelector(`[data-detail-row="${btn.dataset.detail}"]`);
        row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
      });
    });
  }

  [tableFilter, actionFilter, dariFilter, sampaiFilter].forEach((el) => el.addEventListener('change', load));
  load();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
