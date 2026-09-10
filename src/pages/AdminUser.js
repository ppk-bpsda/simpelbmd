import { listUsers, createUser, updateUserProfile, setUserStatus, resetUserPassword } from '../services/userAdminService.js';
import { listOpdAll } from '../services/opdService.js';
import { showToast, confirmDialog } from '../utils/ui.js';
import { formatDate } from '../utils/format.js';

const ROLE_LABEL = { super_admin: 'Super Admin', admin_opd: 'Admin OPD', operator: 'Operator', viewer: 'Viewer' };

export async function renderAdminUser(root, { profile }) {
  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Administrasi — User</div>
        <div class="toolbar__subtitle">Kelola akun pengguna, peran (role), dan OPD</div>
      </div>
      <div class="toolbar__actions"><button class="btn btn-solid" id="btn-add">+ Tambah User</button></div>
    </div>
    <div class="panel">
      <div id="form-slot"></div>
      <div id="table-slot">${loadingRows()}</div>
    </div>
  `;

  const tableSlot = root.querySelector('#table-slot');
  const formSlot = root.querySelector('#form-slot');
  let opdOptions = [];

  try {
    opdOptions = await listOpdAll();
  } catch (e) { /* non-fatal */ }

  async function refresh() {
    tableSlot.innerHTML = loadingRows();
    try {
      const rows = await listUsers();
      if (!rows.length) {
        tableSlot.innerHTML = `<div class="empty-state"><strong>Belum ada user</strong>Tambahkan user baru untuk mulai memberi akses.</div>`;
        return;
      }
      tableSlot.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>OPD</th><th>Status</th><th>Login Terakhir</th><th></th></tr></thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td style="font-family:monospace;">${escapeHtml(r.username)}</td>
                  <td>${escapeHtml(r.nama)}</td>
                  <td>${escapeHtml(ROLE_LABEL[r.role] || r.role)}</td>
                  <td>${escapeHtml(r.opd?.nama_opd || (r.role === 'super_admin' ? 'Semua OPD' : '-'))}</td>
                  <td>${statusBadge(r.status)}</td>
                  <td>${r.last_login_at ? formatDate(r.last_login_at) : 'Belum pernah'}</td>
                  <td style="white-space:nowrap;">
                    <button class="btn-ghost" data-edit="${r.id}">Edit</button>
                    <button class="btn-ghost" data-reset="${r.id}" data-username="${escapeAttr(r.username)}">Reset Password</button>
                    ${r.id === profile.id ? '' : `<button class="btn-danger-ghost" data-toggle="${r.id}" data-status="${r.status}">${r.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}</button>`}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      rows.forEach((r) => {
        tableSlot.querySelector(`[data-edit="${r.id}"]`).addEventListener('click', () => openEditForm(r));
      });
      tableSlot.querySelectorAll('[data-reset]').forEach((el) => {
        el.addEventListener('click', () => openResetForm(el.dataset.reset, el.dataset.username));
      });
      tableSlot.querySelectorAll('[data-toggle]').forEach((el) => {
        el.addEventListener('click', async () => {
          const nextStatus = el.dataset.status === 'aktif' ? 'nonaktif' : 'aktif';
          const ok = await confirmDialog({
            title: nextStatus === 'nonaktif' ? 'Nonaktifkan user ini?' : 'Aktifkan user ini?',
            message: nextStatus === 'nonaktif'
              ? 'User tidak akan bisa login lagi sampai diaktifkan kembali. Akun tidak dihapus.'
              : 'User akan bisa login kembali seperti biasa.',
            danger: nextStatus === 'nonaktif',
          });
          if (!ok) return;
          try {
            await setUserStatus(el.dataset.toggle, nextStatus);
            showToast('Status user berhasil diubah.', 'success');
            refresh();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    } catch (err) {
      tableSlot.innerHTML = `<div class="alert alert--error">Gagal memuat data User.</div>`;
      console.error('[SIMPELBMD] AdminUser listUsers error:', err.message);
    }
  }

  function opdSelectHtml(selectedId) {
    return `<select id="f-opd">${opdOptions.map((o) => `<option value="${o.id}" ${o.id === selectedId ? 'selected' : ''}>${escapeHtml(o.nama_opd)}</option>`).join('')}</select>`;
  }
  function roleSelectHtml(selectedRole) {
    return `<select id="f-role">${Object.entries(ROLE_LABEL).map(([v, l]) => `<option value="${v}" ${v === selectedRole ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  }

  function toggleOpdFieldVisibility(container) {
    const roleSelect = container.querySelector('#f-role');
    const opdField = container.querySelector('#f-opd-field');
    const update = () => { opdField.style.display = roleSelect.value === 'super_admin' ? 'none' : ''; };
    roleSelect.addEventListener('change', update);
    update();
  }

  function openCreateForm() {
    formSlot.innerHTML = `
      <div class="inline-form">
        <div class="field"><label>Username</label><input id="f-username" placeholder="budi.santoso" /></div>
        <div class="field"><label>Password Awal</label><input id="f-password" type="text" placeholder="min. 8 karakter" /></div>
        <div class="field" style="grid-column: span 2;"><label>Nama Lengkap</label><input id="f-nama" /></div>
        <div class="field"><label>Role</label>${roleSelectHtml('operator')}</div>
        <div class="field" id="f-opd-field"><label>OPD</label>${opdSelectHtml(profile.opd_id)}</div>
        <div class="field-actions">
          <button class="btn btn-solid" id="f-save">Simpan</button>
          <button class="btn btn-outline" id="f-cancel">Batal</button>
        </div>
      </div>
    `;
    toggleOpdFieldVisibility(formSlot);
    formSlot.querySelector('#f-cancel').addEventListener('click', () => { formSlot.innerHTML = ''; });
    formSlot.querySelector('#f-save').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const username = formSlot.querySelector('#f-username').value.trim();
      const password = formSlot.querySelector('#f-password').value;
      const nama = formSlot.querySelector('#f-nama').value.trim();
      const role = formSlot.querySelector('#f-role').value;
      const opdSelect = formSlot.querySelector('#f-opd');
      const opdId = opdSelect ? opdSelect.value : null;

      if (!username || !password || !nama) {
        showToast('Username, password, dan nama wajib diisi.', 'warning');
        return;
      }
      if (password.length < 8) {
        showToast('Password minimal 8 karakter.', 'warning');
        return;
      }
      btn.disabled = true; btn.textContent = 'Menyimpan…';
      try {
        await createUser({ username, password, nama, role, opdId });
        showToast('User baru berhasil dibuat.', 'success');
        formSlot.innerHTML = '';
        refresh();
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Simpan';
      }
    });
  }

  function openEditForm(user) {
    formSlot.innerHTML = `
      <div class="inline-form">
        <div class="field"><label>Username</label><input value="${escapeAttr(user.username)}" disabled style="opacity:.6;" /></div>
        <div class="field" style="grid-column: span 2;"><label>Nama Lengkap</label><input id="f-nama" value="${escapeAttr(user.nama)}" /></div>
        <div class="field"><label>Role</label>${roleSelectHtml(user.role)}</div>
        <div class="field" id="f-opd-field"><label>OPD</label>${opdSelectHtml(user.opd_id)}</div>
        <div class="field-actions">
          <button class="btn btn-solid" id="f-save">Simpan Perubahan</button>
          <button class="btn btn-outline" id="f-cancel">Batal</button>
        </div>
      </div>
    `;
    toggleOpdFieldVisibility(formSlot);
    formSlot.querySelector('#f-cancel').addEventListener('click', () => { formSlot.innerHTML = ''; });
    formSlot.querySelector('#f-save').addEventListener('click', async () => {
      const nama = formSlot.querySelector('#f-nama').value.trim();
      const role = formSlot.querySelector('#f-role').value;
      const opdSelect = formSlot.querySelector('#f-opd');
      const opdId = opdSelect ? opdSelect.value : null;
      if (!nama) {
        showToast('Nama wajib diisi.', 'warning');
        return;
      }
      if (role !== 'super_admin' && !opdId) {
        showToast('OPD wajib dipilih untuk role selain Super Admin.', 'warning');
        return;
      }
      try {
        await updateUserProfile(user.id, { nama, role, opdId, status: user.status });
        showToast('Perubahan berhasil disimpan.', 'success');
        formSlot.innerHTML = '';
        refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  function openResetForm(userId, username) {
    formSlot.innerHTML = `
      <div class="inline-form">
        <div class="field" style="grid-column: span 2;"><label>Reset Password untuk <strong>${escapeHtml(username)}</strong></label>
          <input id="f-newpass" type="text" placeholder="Password baru, min. 8 karakter" />
        </div>
        <div class="field-actions">
          <button class="btn btn-solid" id="f-save">Reset Password</button>
          <button class="btn btn-outline" id="f-cancel">Batal</button>
        </div>
      </div>
    `;
    formSlot.querySelector('#f-cancel').addEventListener('click', () => { formSlot.innerHTML = ''; });
    formSlot.querySelector('#f-save').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const newPassword = formSlot.querySelector('#f-newpass').value;
      if (!newPassword || newPassword.length < 8) {
        showToast('Password baru minimal 8 karakter.', 'warning');
        return;
      }
      const ok = await confirmDialog({
        title: 'Reset password user ini?',
        message: `Password lama ${escapeHtml(username)} akan langsung tidak berlaku. Pastikan Anda menyampaikan password baru ke user secara aman.`,
        danger: true,
      });
      if (!ok) return;
      btn.disabled = true; btn.textContent = 'Memproses…';
      try {
        await resetUserPassword(userId, newPassword);
        showToast('Password berhasil direset.', 'success');
        formSlot.innerHTML = '';
      } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.textContent = 'Reset Password';
      }
    });
  }

  function statusBadge(s) {
    return s === 'aktif'
      ? `<span class="status-badge status-badge--safe">Aktif</span>`
      : `<span class="status-badge status-badge--warning">Nonaktif</span>`;
  }

  root.querySelector('#btn-add').addEventListener('click', openCreateForm);
  refresh();
}

function loadingRows() { return Array.from({ length: 3 }).map(() => `<div class="skeleton" style="height:18px;margin-bottom:10px;"></div>`).join(''); }
function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
