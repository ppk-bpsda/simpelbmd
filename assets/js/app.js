/* ==========================================================================
   SIMPELBMD — App shell behaviors (sidebar, topbar, toast, guard)
   ========================================================================== */

function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const collapseBtn = document.getElementById("collapseBtn");
  const burger = document.getElementById("burgerBtn");
  const scrim = document.getElementById("scrim");

  const collapsed = localStorage.getItem("simpelbmd_sidebar_collapsed") === "1";
  if (collapsed) sidebar.classList.add("collapsed");

  collapseBtn?.addEventListener("click", () => {
    sidebar.classList.toggle("collapsed");
    localStorage.setItem("simpelbmd_sidebar_collapsed", sidebar.classList.contains("collapsed") ? "1" : "0");
  });

  burger?.addEventListener("click", () => {
    sidebar.classList.add("mobile-open");
    scrim.classList.add("show");
  });
  scrim?.addEventListener("click", () => {
    sidebar.classList.remove("mobile-open");
    scrim.classList.remove("show");
  });

  // Highlight active nav item based on current filename
  const current = window.location.pathname.split("/").pop() || "dashboard.html";
  document.querySelectorAll(".nav-item").forEach((item) => {
    if (item.getAttribute("href") === current) item.classList.add("active");
  });
}

function toast(message, type = "ok") {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function renderUserChip(profile) {
  const chip = document.getElementById("userChip");
  if (!chip || !profile) return;
  const initials = (profile.full_name || profile.username || "U").slice(0, 2).toUpperCase();
  chip.innerHTML = `
    <div class="avatar">${initials}</div>
    <div class="meta">
      <div class="u-name">${profile.full_name || profile.username}</div>
      <div class="u-role">${profile.role === "admin" ? "Administrator" : "Operator"}</div>
    </div>`;
}

/* Sembunyikan menu yang tidak diperbolehkan untuk role tertentu (Bab 3). */
function applyRoleVisibility(role) {
  if (role === "admin") return; // admin melihat semua menu
  document.querySelectorAll("[data-role='admin-only']").forEach((el) => el.remove());
}

async function bootstrapPage() {
  const profile = await window.SIMPELBMD.requireAuth();
  if (!profile) return null;
  initSidebar();
  renderUserChip(profile);
  applyRoleVisibility(profile.role);
  document.getElementById("logoutBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.SIMPELBMD.logout();
  });
  return profile;
}

function formatRupiah(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

function formatTanggal(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* Animasi hitung naik untuk angka KPI. formatFn menerima angka dan mengembalikan string tampilan. */
function animateNumber(el, target, formatFn = (n) => Math.round(n).toLocaleString("id-ID"), duration = 700) {
  if (!el) return;
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReduced) { el.textContent = formatFn(target); return; }
  const start = 0;
  const startTime = performance.now();
  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (target - start) * eased;
    el.textContent = formatFn(current);
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = formatFn(target);
  }
  requestAnimationFrame(tick);
}

function animateRupiah(el, target, duration = 700) {
  animateNumber(el, target, (n) => "Rp " + Math.round(n).toLocaleString("id-ID"), duration);
}

window.SIMPELBMD_UI = { toast, bootstrapPage, formatRupiah, formatTanggal, animateNumber, animateRupiah };
