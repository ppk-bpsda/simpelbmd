import { changePassword } from '../services/authService.js';
import { showToast } from '../utils/ui.js';

const ROLE_LABEL = {
  super_admin: 'Super Admin', admin_opd: 'Admin OPD', operator: 'Operator', viewer: 'Viewer',
};

export async function renderAdminPengaturan(root, { profile }) {
  root.innerHTML = `
    <div class="toolbar">
      <div>
        <div class="toolbar__title">Pengaturan</div>
        <div class="toolbar__subtitle">Profil akun dan keamanan</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel__header"><div class="panel__title">Profil Saya</div></div>
      <div class="table-scroll">
        <table class="data-table">
          <tbody>
            <tr><td style="width:180px;">Nama</td><td>${escapeHtml(profile.nama)}</td></tr>
            <tr><td>Username</td><td>@${escapeHtml(profile.username)}</td></tr>
            <tr><td>Role</td><td><span class="status-badge status-badge--info">${ROLE_LABEL[profile.role] || profile.role}</span></td></tr>
            <tr><td>OPD</td><td>${profile.role === 'super_admin' ? 'Seluruh OPD' : (profile.opd_id || '-')}</td></tr>
            <tr><td>Login Terakhir</td><td>${profile.last_login_at ? new Date(profile.last_login_at).toLocaleString('id-ID') : '-'}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="panel" style="max-width:480px;">
      <div class="panel__header"><div class="panel__title">Ganti Kata Sandi</div></div>
      <div id="pw-alert"></div>
      <div class="field field--password"><label>Kata Sandi Baru</label>
        <input id="f-newpw" type="password" autocomplete="new-password" />
        <button type="button" id="toggle-pw">Lihat</button>
      </div>
      <div class="field"><label>Ulangi Kata Sandi Baru</label><input id="f-newpw2" type="password" autocomplete="new-password" /></div>
      <button class="btn btn-solid" id="btn-change-pw">Simpan Kata Sandi Baru</button>
    </div>
  `;

  const pwInput = root.querySelector('#f-newpw');
  root.querySelector('#toggle-pw').addEventListener('click', (e) => {
    const isHidden = pwInput.type === 'password';
    pwInput.type = isHidden ? 'text' : 'password';
    e.currentTarget.textContent = isHidden ? 'Sembunyikan' : 'Lihat';
  });

  root.querySelector('#btn-change-pw').addEventListener('click', async () => {
    const alertSlot = root.querySelector('#pw-alert');
    alertSlot.innerHTML = '';
    const pw1 = pwInput.value;
    const pw2 = root.querySelector('#f-newpw2').value;

    if (pw1.length < 8) { alertSlot.innerHTML = `<div class="alert alert--warning">Kata sandi minimal 8 karakter.</div>`; return; }
    if (pw1 !== pw2) { alertSlot.innerHTML = `<div class="alert alert--warning">Konfirmasi kata sandi tidak cocok.</div>`; return; }

    const btn = root.querySelector('#btn-change-pw');
    btn.disabled = true;
    btn.textContent = 'Menyimpan...';
    try {
      await changePassword(pw1);
      showToast('Kata sandi berhasil diubah.', 'success');
      pwInput.value = '';
      root.querySelector('#f-newpw2').value = '';
    } catch (err) {
      alertSlot.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Simpan Kata Sandi Baru';
    }
  });
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
