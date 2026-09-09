import { logout } from '../services/authService.js';

const ROLE_LABEL = {
  super_admin: 'Super Admin',
  admin_opd: 'Admin OPD',
  operator: 'Operator',
  viewer: 'Viewer',
};

export function renderTopbar(root, { profile, tahunList, activeTahunId, onTahunChange }) {
  const initials = (profile?.nama || profile?.username || '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  root.innerHTML = `
    <header class="topbar">
      <div class="topbar__left">
        <select class="topbar__year-select" id="tahun-select">
          ${tahunList
            .map(
              (t) =>
                `<option value="${t.id}" ${t.id === activeTahunId ? 'selected' : ''}>TA ${t.tahun}</option>`
            )
            .join('')}
        </select>
        <div class="topbar__search">
          <span>🔍</span>
          <input type="text" placeholder="Cari Nopol, nama barang, nomor dokumen..." id="global-search" />
        </div>
      </div>
      <div class="topbar__right">
        <span class="badge-role">${ROLE_LABEL[profile?.role] || '—'}</span>
        <div class="topbar__user" id="user-menu-trigger">
          <div class="topbar__avatar">${initials}</div>
          <div>
            <div style="font-size:13px;font-weight:600;">${profile?.nama || profile?.username || 'Pengguna'}</div>
            <div style="font-size:11.5px;color:var(--gray-500);">@${profile?.username || ''}</div>
          </div>
        </div>
        <button id="logout-btn" class="btn-primary" style="width:auto;padding:8px 14px;font-size:13px;">Keluar</button>
      </div>
    </header>
  `;

  root.querySelector('#tahun-select').addEventListener('change', (e) => {
    onTahunChange(e.target.value);
  });

  root.querySelector('#logout-btn').addEventListener('click', async () => {
    await logout();
    window.location.reload();
  });
}
