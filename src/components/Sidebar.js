import { navigate, currentPath } from '../router.js';

// Ikon inline (stroke, minimal, konsisten dengan tema navy/cyan)
const ICONS = {
  dashboard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  anggaran:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="6" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><circle cx="17" cy="14.5" r="1.4" fill="currentColor" stroke="none"/></svg>',
  aset:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 16V8l4-3h7l4 3v8"/><rect x="3" y="16" width="18" height="3" rx="1"/><circle cx="7.5" cy="19.5" r="1.3"/><circle cx="16.5" cy="19.5" r="1.3"/><path d="M14 5v6"/></svg>',
  monitoring:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 20V10M9 20V4M15 20v-7M21 20V8"/></svg>',
  admin:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l7 3v5c0 5-3.2 8-7 10-3.8-2-7-5-7-10V6l7-3z"/><path d="M9.5 12l1.8 1.8 3.2-3.6"/></svg>',
};

const CHEVRON =
  '<svg class="sidebar__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>';

const MENU = [
  {
    key: 'dashboard',
    group: 'Dashboard',
    icon: ICONS.dashboard,
    items: [
      { label: 'Overview', path: '/dashboard' },
      { label: 'Anggaran', path: '/dashboard/anggaran' },
      { label: 'Realisasi', path: '/dashboard/realisasi' },
      { label: 'Monitoring', path: '/dashboard/monitoring' },
    ],
  },
  {
    key: 'anggaran',
    group: 'Anggaran & DPA',
    icon: ICONS.anggaran,
    items: [
      { label: 'DPA', path: '/anggaran/dpa' },
      { label: 'Kegiatan', path: '/anggaran/kegiatan' },
      { label: 'Sub Kegiatan', path: '/anggaran/sub-kegiatan' },
      { label: 'Belanja', path: '/anggaran/belanja' },
      { label: 'Import DPA', path: '/import/dpa' },
    ],
  },
  {
    key: 'aset',
    group: 'Aset & Kendaraan (BMD)',
    icon: ICONS.aset,
    items: [
      { label: 'Data Kendaraan (KIB)', path: '/kendaraan/data' },
      { label: 'KIB Peralatan', path: '/kib/peralatan' },
      { label: 'Data Aset Lainnya', path: '/kib/aset' },
      { label: 'Pajak & Perijinan', path: '/kendaraan/pajak' },
      { label: 'Pemeliharaan', path: '/kendaraan/pemeliharaan' },
      { label: 'BBM / Kupon', path: '/kendaraan/bbm' },
      { label: 'Pengadaan Kupon BBM', path: '/kendaraan/bbm-pengadaan' },
      { label: 'Import KIB', path: '/import/kib' },
      { label: 'Import Pajak', path: '/import/pajak' },
      { label: 'Import Master', path: '/import/master' },
    ],
  },
  {
    key: 'monitoring',
    group: 'Monitoring & Laporan',
    icon: ICONS.monitoring,
    items: [
      { label: 'Monitoring Bulanan', path: '/monitoring/bulanan' },
      { label: 'Monitoring per Nopol', path: '/monitoring/nopol' },
      { label: 'Monitoring Pajak', path: '/monitoring/pajak' },
      { label: 'Monitoring Pemeliharaan', path: '/monitoring/pemeliharaan' },
      { label: 'Monitoring BBM', path: '/monitoring/bbm' },
      { label: 'Monitoring Anggaran', path: '/monitoring/anggaran' },
      { label: 'Rekap Anggaran', path: '/laporan/anggaran' },
      { label: 'Rekap Kendaraan', path: '/laporan/kendaraan' },
      { label: 'Rekap Pemeliharaan', path: '/laporan/pemeliharaan' },
      { label: 'Rekap Pajak', path: '/laporan/pajak' },
      { label: 'Rekap BBM', path: '/laporan/bbm' },
      { label: 'Laporan Tahunan', path: '/laporan/tahunan' },
    ],
  },
  {
    key: 'admin',
    group: 'Administrasi',
    icon: ICONS.admin,
    items: [
      { label: 'User', path: '/admin/user' },
      { label: 'OPD', path: '/admin/opd' },
      { label: 'Tahun Anggaran', path: '/admin/tahun-anggaran' },
      { label: 'Audit Log', path: '/admin/audit-log' },
      { label: 'Data Quality Center', path: '/admin/data-quality' },
      { label: 'Pengaturan', path: '/admin/pengaturan' },
    ],
  },
];

// Menu yang dibatasi per role (di luar ini akan disaring oleh RLS juga di sisi DB,
// tapi kita sembunyikan di UI agar tidak membingungkan user).
const ADMIN_ONLY_GROUPS = new Set(['Administrasi']);

// State accordion disimpan di level modul supaya tetap terbuka saat navigasi
// (Sidebar di-render ulang tiap hashchange DAN tiap toggle grup, tapi modul ini
// tidak pernah di-reload, jadi state di sini bertahan selama sesi berjalan).
let expandedKey = null;
let initialized = false;
let lastActivePath = null; // dipakai untuk membedakan "navigasi sungguhan" vs "re-render karena toggle"

function findGroupKeyByPath(path) {
  const found = MENU.find((g) => g.items.some((i) => i.path === path));
  return found?.key || MENU[0].key;
}

export function renderSidebar(root, profile) {
  const active = currentPath();
  const isAdmin = profile?.role === 'super_admin';

  if (!initialized) {
    // Render pertama kali: buka grup yang berisi halaman aktif.
    expandedKey = findGroupKeyByPath(active);
    initialized = true;
    lastActivePath = active;
  } else if (active !== lastActivePath) {
    // Route benar-benar berubah (navigasi) -> otomatis buka grup pemilik halaman baru.
    expandedKey = findGroupKeyByPath(active);
    lastActivePath = active;
  }
  // Kalau active sama dengan sebelumnya, berarti render ini dipicu oleh klik
  // toggle accordion sendiri -> expandedKey (yang sudah di-set oleh handler klik)
  // TIDAK boleh ditimpa di sini.

  const visibleGroups = MENU.filter((g) => !ADMIN_ONLY_GROUPS.has(g.group) || isAdmin);

  const groupsHtml = visibleGroups
    .map((group) => {
      const isOpen = group.key === expandedKey;
      const hasActive = group.items.some((i) => i.path === active);
      return `
        <div class="sidebar__group${hasActive ? ' has-active' : ''}">
          <button type="button" class="sidebar__group-header${isOpen ? ' is-open' : ''}" data-key="${group.key}">
            <span class="sidebar__group-icon">${group.icon}</span>
            <span class="sidebar__group-title">${group.group}</span>
            ${CHEVRON}
          </button>
          <div class="sidebar__panel${isOpen ? ' is-open' : ''}">
            <div class="sidebar__panel-inner">
              ${group.items
                .map(
                  (item) => `
                    <div class="sidebar__link${active === item.path ? ' is-active' : ''}" data-path="${item.path}">
                      <span class="dot"></span><span class="label">${item.label}</span>
                    </div>`
                )
                .join('')}
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  root.innerHTML = `
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__brand-mark">S</div>
        <div class="sidebar__brand-text">SIMPELBMD</div>
      </div>
      <nav class="sidebar__nav">
        ${groupsHtml}
      </nav>
    </aside>
  `;

  root.querySelectorAll('.sidebar__group-header').forEach((el) => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      expandedKey = expandedKey === key ? null : key;
      renderSidebar(root, profile);
    });
  });

  root.querySelectorAll('.sidebar__link').forEach((el) => {
    el.addEventListener('click', () => navigate(el.dataset.path));
  });
}
