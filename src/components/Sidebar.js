import { navigate, currentPath } from '../router.js';

const MENU = [
  {
    group: 'Dashboard',
    items: [
      { label: 'Overview', path: '/dashboard' },
      { label: 'Anggaran', path: '/dashboard/anggaran' },
      { label: 'Realisasi', path: '/dashboard/realisasi' },
      { label: 'Monitoring', path: '/dashboard/monitoring' },
    ],
  },
  {
    group: 'Anggaran',
    items: [
      { label: 'DPA', path: '/anggaran/dpa' },
      { label: 'Kegiatan', path: '/anggaran/kegiatan' },
      { label: 'Sub Kegiatan', path: '/anggaran/sub-kegiatan' },
      { label: 'Belanja', path: '/anggaran/belanja' },
    ],
  },
  {
    group: 'BMD / KIB',
    items: [
      { label: 'KIB Kendaraan', path: '/kib/kendaraan' },
      { label: 'KIB Peralatan', path: '/kib/peralatan' },
      { label: 'Data Aset', path: '/kib/aset' },
    ],
  },
  {
    group: 'Kendaraan',
    items: [
      { label: 'Data Kendaraan', path: '/kendaraan/data' },
      { label: 'Pajak & Perijinan', path: '/kendaraan/pajak' },
      { label: 'Pemeliharaan', path: '/kendaraan/pemeliharaan' },
      { label: 'BBM / Kupon', path: '/kendaraan/bbm' },
    ],
  },
  {
    group: 'Monitoring',
    items: [
      { label: 'Bulanan', path: '/monitoring/bulanan' },
      { label: 'Per Nopol', path: '/monitoring/nopol' },
      { label: 'Pajak', path: '/monitoring/pajak' },
      { label: 'Pemeliharaan', path: '/monitoring/pemeliharaan' },
      { label: 'BBM', path: '/monitoring/bbm' },
      { label: 'Anggaran', path: '/monitoring/anggaran' },
    ],
  },
  {
    group: 'Laporan',
    items: [
      { label: 'Rekap Anggaran', path: '/laporan/anggaran' },
      { label: 'Rekap Kendaraan', path: '/laporan/kendaraan' },
      { label: 'Rekap Pemeliharaan', path: '/laporan/pemeliharaan' },
      { label: 'Rekap Pajak', path: '/laporan/pajak' },
      { label: 'Rekap BBM', path: '/laporan/bbm' },
      { label: 'Laporan Tahunan', path: '/laporan/tahunan' },
    ],
  },
  {
    group: 'Import Data',
    items: [
      { label: 'Import DPA', path: '/import/dpa' },
      { label: 'Import KIB', path: '/import/kib' },
      { label: 'Import Master', path: '/import/master' },
    ],
  },
  {
    group: 'Administrasi',
    items: [
      { label: 'User', path: '/admin/user' },
      { label: 'OPD', path: '/admin/opd' },
      { label: 'Tahun Anggaran', path: '/admin/tahun-anggaran' },
      { label: 'Audit Log', path: '/admin/audit-log' },
      { label: 'Pengaturan', path: '/admin/pengaturan' },
    ],
  },
];

// Menu yang dibatasi per role (di luar ini akan disaring oleh RLS juga di sisi DB,
// tapi kita sembunyikan di UI agar tidak membingungkan user).
const ADMIN_ONLY_GROUPS = new Set(['Administrasi']);

export function renderSidebar(root, profile) {
  const active = currentPath();
  const isAdmin = profile?.role === 'super_admin';

  const groupsHtml = MENU.filter((g) => !ADMIN_ONLY_GROUPS.has(g.group) || isAdmin)
    .map(
      (group) => `
        <div class="sidebar__group-label">${group.group}</div>
        ${group.items
          .map(
            (item) => `
              <div class="sidebar__link${active === item.path ? ' is-active' : ''}" data-path="${item.path}">
                <span class="dot"></span><span class="label">${item.label}</span>
              </div>`
          )
          .join('')}
      `
    )
    .join('');

  root.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__brand-mark">S</div>
        <div class="sidebar__brand-text">SIMBMD</div>
      </div>
      ${groupsHtml}
    </aside>
  `;

  root.querySelectorAll('.sidebar__link').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.path));
  });
}
