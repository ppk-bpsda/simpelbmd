import { listAuditLogs } from '../services/auditService.js';

const ACTION_LABEL = {
  insert: 'Tambah', update: 'Ubah', delete: 'Hapus', login: 'Login', logout: 'Logout',
  create_user: 'Buat User', set_active: 'Ubah Status Aktif',
};

export async function renderAdminAuditLog(root, { profile }) {
  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Audit Log</div>
        <div class="toolbar__subtitle">${profile.role === 'super_admin' ? 'Seluruh aktivitas sistem' : 'Aktivitas yang Anda lakukan'} — log tidak dapat dihapus oleh operator biasa</div>
      </div>
    </div>
    <div class="panel">
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="field" style="min-width:200px;"><label>Tabel</label>
          <select id="f-table">
            <option value="">Semua Tabel</option>
            <option value="kegiatan">Kegiatan</option>
            <option value="sub_kegiatan">Sub Kegiatan</option>
            <option value="belanja">Belanja</option>
            <option value="kib">KIB</option>
            <option value="kendaraan">Kendaraan</option>
            <option value="pajak_perijinan">Pajak/Perijinan</option>
            <option value="pemeliharaan">Pemeliharaan</option>
            <option value="bbm">BBM</option>
            <option value="profiles">User</option>
            <option value="opd">OPD</option>
            <option value="tahun_anggaran">Tahun Anggaran</option>
            <option value="auth">Login/Logout</option>
          </select>
        </div>
        <div class="field" style="min-width:200px;"><label>Aksi</label>
          <select id="f-action">
            <option value="">Semua Aksi</option>
            <option value="insert">Tambah</option>
            <option value="update">Ubah</option>
            <option value="delete">Hapus</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
          </select>
        </div>
      </div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const tableFilter = root.querySelector('#f-table');
  const actionFilter = root.querySelector('#f-action');

  async function draw() {
    tableSlot.innerHTML = `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`;
    try {
      const rows = await listAuditLogs({ tableName: tableFilter.value || undefined, action: actionFilter.value || undefined });
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Tidak ada aktivitas</strong></div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Waktu</th><th>Aksi</th><th>Tabel</th><th>Detail</th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td style="white-space:nowrap;">${new Date(r.created_at).toLocaleString('id-ID')}</td>
                  <td><span class="status-badge status-badge--info">${ACTION_LABEL[r.action] || r.action}</span></td>
                  <td>${r.table_name || '-'}</td>
                  <td style="max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeAttr(summarize(r))}">${escapeHtml(summarize(r))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p style="font-size:12px;color:var(--gray-500);margin-top:10px;">Menampilkan hingga 200 aktivitas terbaru.</p>
      `;
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat Audit Log.</div>`;
    }
  }

  function summarize(r) {
    if (r.new_data) return JSON.stringify(r.new_data);
    if (r.old_data) return JSON.stringify(r.old_data);
    return '-';
  }

  [tableFilter, actionFilter].forEach((el) => el.addEventListener('change', draw));
  draw();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
