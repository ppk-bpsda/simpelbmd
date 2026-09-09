import { renderSidebar } from '../components/Sidebar.js';
import { renderTopbar } from '../components/Topbar.js';
import { startRouter, registerRoute, navigate } from '../router.js';
import { renderDashboard } from '../pages/Dashboard.js';
import { renderComingSoon } from '../pages/ComingSoon.js';
import { renderKegiatan } from '../pages/Kegiatan.js';
import { renderSubKegiatan } from '../pages/SubKegiatan.js';
import { renderBelanja } from '../pages/Belanja.js';
import { renderImportDPA } from '../pages/ImportDPA.js';
import { renderKibKendaraan } from '../pages/KibKendaraan.js';
import { renderKibPeralatan } from '../pages/KibPeralatan.js';
import { renderImportKIB } from '../pages/ImportKIB.js';
import { renderPajak } from '../pages/Pajak.js';
import { renderPemeliharaan } from '../pages/Pemeliharaan.js';
import { renderBbm } from '../pages/Bbm.js';
import { renderDashboardAnggaran } from '../pages/DashboardAnggaran.js';
import { renderDashboardRealisasi } from '../pages/DashboardRealisasi.js';
import { renderDashboardMonitoring } from '../pages/DashboardMonitoring.js';
import { renderMonitoringBulanan } from '../pages/MonitoringBulanan.js';
import { renderMonitoringNopol } from '../pages/MonitoringNopol.js';
import { renderMonitoringPajak } from '../pages/MonitoringPajak.js';
import { renderMonitoringPemeliharaan } from '../pages/MonitoringPemeliharaan.js';
import { renderMonitoringBbm } from '../pages/MonitoringBbm.js';
import { renderMonitoringAnggaran } from '../pages/MonitoringAnggaran.js';
import { listTahunAnggaran, getDefaultTahunAnggaran } from '../services/tahunAnggaranService.js';

const PHASE_LATER_ROUTES = ['/import/master'];
const PHASE_6_ROUTES = ['/laporan/anggaran', '/laporan/kendaraan', '/laporan/pemeliharaan', '/laporan/pajak', '/laporan/bbm', '/laporan/tahunan'];
const PHASE_ADMIN_ROUTES = ['/admin/user', '/admin/opd', '/admin/tahun-anggaran', '/admin/audit-log', '/admin/pengaturan'];

function registerPlaceholderRoutes(outlet, title, routesList, phaseLabel) {
  routesList.forEach((path) => {
    registerRoute(path, (el) => renderComingSoon(el, { title, phase: phaseLabel }));
  });
}

export async function mountAppShell(root, profile) {
  root.innerHTML = `
    <div class="shell">
      <div id="sidebar-slot"></div>
      <div>
        <div id="topbar-slot"></div>
        <main class="content" id="content-outlet"></main>
      </div>
    </div>
  `;

  const sidebarSlot = root.querySelector('#sidebar-slot');
  const topbarSlot = root.querySelector('#topbar-slot');
  const outlet = root.querySelector('#content-outlet');

  const tahunList = await listTahunAnggaran().catch(() => []);
  let activeTahun = await getDefaultTahunAnggaran().catch(() => null);

  function registerDpaRoutes() {
    const ctx = () => ({ tahunAnggaranId: activeTahun?.id, profile });
    registerRoute('/dashboard', (el) => renderDashboard(el, ctx()));
    registerRoute('/anggaran/dpa', (el) => renderKegiatan(el, ctx()));
    registerRoute('/anggaran/kegiatan', (el) => renderKegiatan(el, ctx()));
    registerRoute('/anggaran/sub-kegiatan', (el) => renderSubKegiatan(el, ctx()));
    registerRoute('/anggaran/belanja', (el) => renderBelanja(el, ctx()));
    registerRoute('/import/dpa', (el) => renderImportDPA(el, ctx()));
    registerRoute('/kib/kendaraan', (el) => renderKibKendaraan(el, ctx()));
    registerRoute('/kendaraan/data', (el) => renderKibKendaraan(el, ctx()));
    registerRoute('/kib/peralatan', (el) => renderKibPeralatan(el, { ...ctx(), defaultKategori: 'peralatan' }));
    registerRoute('/kib/aset', (el) => renderKibPeralatan(el, { ...ctx(), defaultKategori: 'aset_lainnya' }));
    registerRoute('/import/kib', (el) => renderImportKIB(el, ctx()));
    registerRoute('/kendaraan/pajak', (el) => renderPajak(el, ctx()));
    registerRoute('/kendaraan/pemeliharaan', (el) => renderPemeliharaan(el, ctx()));
    registerRoute('/kendaraan/bbm', (el) => renderBbm(el, ctx()));
    registerRoute('/dashboard/anggaran', (el) => renderDashboardAnggaran(el, ctx()));
    registerRoute('/dashboard/realisasi', (el) => renderDashboardRealisasi(el, ctx()));
    registerRoute('/dashboard/monitoring', (el) => renderDashboardMonitoring(el, ctx()));
    registerRoute('/monitoring/bulanan', (el) => renderMonitoringBulanan(el, ctx()));
    registerRoute('/monitoring/nopol', (el) => renderMonitoringNopol(el, ctx()));
    registerRoute('/monitoring/pajak', (el) => renderMonitoringPajak(el, ctx()));
    registerRoute('/monitoring/pemeliharaan', (el) => renderMonitoringPemeliharaan(el, ctx()));
    registerRoute('/monitoring/bbm', (el) => renderMonitoringBbm(el, ctx()));
    registerRoute('/monitoring/anggaran', (el) => renderMonitoringAnggaran(el, ctx()));
  }

  function drawChrome() {
    renderSidebar(sidebarSlot, profile);
    renderTopbar(topbarSlot, {
      profile,
      tahunList,
      activeTahunId: activeTahun?.id,
      onTahunChange: (id) => {
        activeTahun = tahunList.find((t) => String(t.id) === String(id));
        registerDpaRoutes();
        navigate('/dashboard');
      },
    });
  }

  registerDpaRoutes();
  registerPlaceholderRoutes(outlet, 'Import Data', PHASE_LATER_ROUTES, 'Phase 7-8');
  registerPlaceholderRoutes(outlet, 'Laporan', PHASE_6_ROUTES, 'Phase 6');
  registerPlaceholderRoutes(outlet, 'Administrasi', PHASE_ADMIN_ROUTES, 'Phase 7-8');

  drawChrome();

  startRouter(outlet, (el) =>
    renderComingSoon(el, { title: 'Halaman tidak ditemukan', phase: 'N/A' })
  );

  window.addEventListener('hashchange', () => {
    sidebarSlot.querySelectorAll('.sidebar__link').forEach((el) => el.classList.remove('is-active'));
    renderSidebar(sidebarSlot, profile);
  });
}
