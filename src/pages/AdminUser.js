import { listUsers, updateUserRole, updateUserStatus, softDeleteUser, inviteUser } from '../services/userService.js';
import { listAllOpd } from '../services/opdService.js';
import { showToast, confirmDialog } from '../utils/ui.js';

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin_opd', label: 'Admin OPD' },
  { value: 'operator', label: 'Operator' },
  { value: 'viewer', label: 'Viewer' },
];

export async function renderAdminUser(root, { profile }) {
  if (profile.role !== 'super_admin') {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Akses Ditolak</strong>Hanya Super Admin yang dapat mengelola user.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Manajemen User</div>
        <div class="toolbar__subtitle">Kelola akun, role, dan status pengguna sistem</div>
      </div>
      <div class="toolbar__actions"><button class="btn btn-solid" id="btn-add">+ Tambah User</button></div>
    </div>
    <div class="panel">
      <div id="form-slot"></div>
      <div id="table-slot"><div class="skeleton" style="height:18px;margin-bottom:10px;"></div></div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const formSlot = root.querySelector('#form-slot');
  let opdOptions = [];
  try { opdOptions = await listAllOpd(); } catch (e) { /* non-fatal */ }

  async function refresh() {
    tableSlot.innerHTML = `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`;
    try {
      const users = await listUsers();
      if (!users.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada user</strong></div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>OPD</th><th>Status</th><th>Login Terakhir</th><th></th></tr></thead>
            <tbody>
              ${users.map((u) => `
                <tr>
                  <td style="font-weight:700;">@${escapeHtml(u.username)}</td>
                  <td>${escapeHtml(u.nama)}</td>
                  <td>
                    <select data-role="${u.id}" ${u.id === profile.id ? 'disabled' : ''}>
                      ${ROLE_OPTIONS.map((r) => `<option value="${r.value}" ${u.role === r.value ? 'selected' : ''}>${r.label}</option>`).join('')}
                    </select>
                  </td>
                  <td>${escapeHtml(u.opd?.nama_opd || '-')}</td>
                  <td>
                    <select data-status="${u.id}" ${u.id === profile.id ? 'disabled' : ''}>
                      <option value="aktif" ${u.status === 'aktif' ? 'selected' : ''}>Aktif</option>
                      <option value="nonaktif" ${u.status === 'nonaktif' ? 'selected' : ''}>Nonaktif</option>
                    </select>
                  </td>
                  <td>${u.last_login_at ? new Date(u.last_login_at).toLocaleString('id-ID') : '-'}</td>
                  <td>${u.id === profile.id ? '' : `<button class="btn-danger-ghost" data-delete="${u.id}">Hapus</button>`}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      tableSlot.querySelectorAll('[data-role]').forEach((el) => {
        el.addEventListener('change', async () => {
          try { await updateUserRole(el.dataset.role, el.value); showToast('Role berhasil diubah.', 'success'); }
          catch (err) { showToast(err.message, 'error'); refresh(); }
        });
      });
      tableSlot.querySelectorAll('[data-status]').forEach((el) => {
        el.addEventListener('change', async () => {
          try { await updateUserStatus(el.dataset.status, el.value); showToast('Status berhasil diubah.', 'success'); }
          catch (err) { showToast(err.message, 'error'); refresh(); }
        });
      });
      tableSlot.querySelectorAll('[data-delete]').forEach((el) => {
        el.addEventListener('click', async () => {
          const ok = await confirmDialog({ title: 'Hapus User?', message: 'Akun akan dinonaktifkan dan dipindahkan ke arsip.', danger: true });
          if (!ok) return;
          try { await softDeleteUser(el.dataset.delete, profile.id); showToast('User berhasil dihapus.', 'success'); refresh(); }
          catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat daftar user.</div>`;
    }
  }

  function openForm() {
    formSlot.innerHTML = `
      <div class="inline-form" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
        <div class="field"><label>Username *</label><input id="f-username" placeholder="mis. budi.santoso" /></div>
        <div class="field"><label>Nama Lengkap *</label><input id="f-nama" /></div>
        <div class="field field--password"><label>Password Awal *</label><input id="f-password" type="password" /></div>
        <div class="field"><label>Role *</label>
          <select id="f-role">${ROLE_OPTIONS.map((r) => `<option value="${r.value}">${r.label}</option>`).join('')}</select>
        </div>
        <div class="field" id="f-opd-wrap"><label>OPD *</label>
          <select id="f-opd">${opdOptions.map((o) => `<option value="${o.id}">${escapeHtml(o.nama_opd)}</option>`).join('')}</select>
        </div>
        <div class="field-actions">
          <button class="btn btn-solid" id="f-save">Simpan</button>
          <button class="btn btn-outline" id="f-cancel">Batal</button>
        </div>
      </div>
      <div id="form-alert"></div>
    `;

    const roleSelect = formSlot.querySelector('#f-role');
    const opdWrap = formSlot.querySelector('#f-opd-wrap');
    roleSelect.addEventListener('change', () => { opdWrap.style.display = roleSelect.value === 'super_admin' ? 'none' : ''; });

    formSlot.querySelector('#f-cancel').addEventListener('click', () => { formSlot.innerHTML = ''; });
    formSlot.querySelector('#f-save').addEventListener('click', async () => {
      const alertSlot = formSlot.querySelector('#form-alert');
      const username = formSlot.querySelector('#f-username').value.trim();
      const nama = formSlot.querySelector('#f-nama').value.trim();
      const password = formSlot.querySelector('#f-password').value;
      const role = roleSelect.value;
      const opdId = role === 'super_admin' ? null : formSlot.querySelector('#f-opd').value;

      if (!username || !nama || !password) { showToast('Username, Nama, dan Password wajib diisi.', 'warning'); return; }
      if (password.length < 8) { showToast('Password minimal 8 karakter.', 'warning'); return; }

      const saveBtn = formSlot.querySelector('#f-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Menyimpan...';
      try {
        await inviteUser({ username, password, nama, role, opdId });
        showToast('User baru berhasil dibuat.', 'success');
        formSlot.innerHTML = '';
        refresh();
      } catch (err) {
        alertSlot.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan';
      }
    });
  }

  root.querySelector('#btn-add').addEventListener('click', openForm);
  refresh();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
