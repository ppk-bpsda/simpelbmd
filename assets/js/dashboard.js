/* ==========================================================================
   SIMPELBMD — Dashboard (data nyata dari Supabase, bukan contoh statis)
   ========================================================================== */
(() => {
  let profile = null;
  const el = (id) => document.getElementById(id);
  const money = (n) => window.SIMPELBMD_UI.formatRupiah(n);
  const tgl = (d) => window.SIMPELBMD_UI.formatTanggal(d);
  const STATUS_BADGE = { draft: "badge-info", diverifikasi: "badge-warn", disetujui: "badge-ok", ditolak: "badge-bad" };
  const STATUS_LABEL = { draft: "Draft", diverifikasi: "Diverifikasi", disetujui: "Disetujui", ditolak: "Ditolak" };

  async function boot() {
    profile = await window.SIMPELBMD_UI.bootstrapPage();
    if (!profile) return;

    const ctx = DATA.ctx();
    el("ctxYear").textContent = ctx.fiscalYear;
    el("ctxStage").value = ctx.stage;
    el("ctxStage").addEventListener("change", (e) => { localStorage.setItem("simpelbmd_tahapan", e.target.value); loadAll(); });

    Chart.defaults.color = "#a9b8d6";
    Chart.defaults.font.family = "Inter";
    Chart.defaults.borderColor = "#1a2744";

    await loadAll();
  }

  async function loadAll() {
    const ctx = DATA.ctx();
    el("kpiPeriode").textContent = `${ctx.stage === "murni" ? "Murni" : "Perubahan"} · TA ${ctx.fiscalYear}`;
    el("chartPeriodeLabel").textContent = `Bulanan · TA ${ctx.fiscalYear}`;

    await Promise.all([
      loadAnggaranKpi(ctx),
      loadBbmKpi(),
      loadCashFlowChart(ctx),
      loadBbmChart(),
      loadPemeliharaanChart(),
      loadRecentRealisasi(ctx),
      loadNotifications(ctx),
    ]);
  }

  // ================= KPI: PAGU / REALISASI / SISA =================
  async function loadAnggaranKpi(ctx) {
    let rows = [];
    try {
      rows = await DATA.laporanAnggaranRealisasi(ctx);
    } catch (e) { /* biarkan kosong jika gagal, tampilkan Rp 0 */ }

    const pagu = rows.reduce((s, r) => s + Number(r.pagu || 0), 0);
    const realisasi = rows.reduce((s, r) => s + Number(r.realisasi || 0), 0);
    const sisa = pagu - realisasi;
    const persen = pagu > 0 ? Math.round((realisasi / pagu) * 100) : 0;

    window.SIMPELBMD_UI.animateRupiah(el("kpiPagu"), pagu);
    window.SIMPELBMD_UI.animateRupiah(el("kpiRealisasi"), realisasi);
    window.SIMPELBMD_UI.animateRupiah(el("kpiSisa"), sisa);
    el("kpiRealisasiSub").textContent = pagu > 0 ? `${persen}% dari pagu` : "Belum ada pagu DPA";
    el("kpiProgressFill").style.width = `${Math.min(persen, 100)}%`;
  }

  // ================= KPI: BBM BULAN INI =================
  async function loadBbmKpi() {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    let rows = [];
    try {
      const { data, error } = await window.SIMPELBMD.sb.from("fuel_coupons").select("volume, status").is("deleted_at", null).in("status", ["digunakan", "direalisasikan"]).gte("tanggal", from).lte("tanggal", to);
      if (error) throw error;
      rows = data || [];
    } catch (e) { /* biarkan kosong */ }
    const totalVolume = rows.reduce((s, r) => s + Number(r.volume || 0), 0);
    window.SIMPELBMD_UI.animateNumber(el("kpiBbm"), totalVolume, (n) => Math.round(n).toLocaleString("id-ID") + " L");
    el("kpiBbmSub").textContent = rows.length ? `${rows.length} transaksi bulan ini` : "Belum ada distribusi bulan ini";
  }

  // ================= CHART: ANGGARAN KAS VS REALISASI =================
  async function loadCashFlowChart(ctx) {
    let chart = { labels: DATA.BULAN_NAMA, kas: Array(12).fill(0), realisasi: Array(12).fill(0) };
    try { chart = await DATA.getCashFlowChart(ctx); } catch (e) { /* pakai default kosong */ }

    const hasData = chart.kas.some((v) => v > 0) || chart.realisasi.some((v) => v > 0);
    el("chartPaguEmpty").style.display = hasData ? "none" : "block";
    document.getElementById("chartPaguRealisasi").style.display = hasData ? "block" : "none";
    if (!hasData) return;

    new Chart(el("chartPaguRealisasi"), {
      type: "bar",
      data: {
        labels: chart.labels,
        datasets: [
          { label: "Anggaran Kas", data: chart.kas, backgroundColor: "#223154", borderRadius: 4, barPercentage: 0.55 },
          { label: "Realisasi", data: chart.realisasi, backgroundColor: "#3e63dd", borderRadius: 4, barPercentage: 0.55 },
        ],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } } },
        scales: { y: { grid: { color: "#1a2744" }, ticks: { callback: (v) => (v / 1000000).toFixed(0) + " jt" } }, x: { grid: { display: false } } },
      },
    });
  }

  // ================= CHART: KONSUMSI BBM PER KENDARAAN =================
  async function loadBbmChart() {
    let rows = [];
    try { rows = await DATA.bbmSummaryPerVehicle(); } catch (e) { /* kosong */ }
    const top = rows.filter((r) => r.vehicles && Number(r.total_volume) > 0).sort((a, b) => b.total_volume - a.total_volume).slice(0, 6);

    el("chartBbmEmpty").style.display = top.length ? "none" : "block";
    document.getElementById("chartBbm").style.display = top.length ? "block" : "none";
    if (!top.length) return;

    new Chart(el("chartBbm"), {
      type: "bar",
      data: {
        labels: top.map((r) => r.vehicles.nomor_polisi),
        datasets: [{ data: top.map((r) => r.total_volume), backgroundColor: "#00d4e0", borderRadius: 6 }],
      },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color: "#1a2744" } }, y: { grid: { display: false } } },
      },
    });
  }

  // ================= CHART: PEMELIHARAAN PER JENIS =================
  async function loadPemeliharaanChart() {
    let rows = [];
    try {
      const { data, error } = await window.SIMPELBMD.sb.from("maintenance_vehicle").select("jenis_pemeliharaan, total").is("deleted_at", null);
      if (error) throw error;
      rows = data || [];
    } catch (e) { /* kosong */ }

    const byJenis = {};
    rows.forEach((r) => { byJenis[r.jenis_pemeliharaan] = (byJenis[r.jenis_pemeliharaan] || 0) + Number(r.total || 0); });
    const entries = Object.entries(byJenis).sort((a, b) => b[1] - a[1]);

    el("chartPemeliharaanEmpty").style.display = entries.length ? "none" : "block";
    document.getElementById("chartPemeliharaan").style.display = entries.length ? "block" : "none";
    if (!entries.length) return;

    const palette = ["#3e63dd", "#00d4e0", "#34c98e", "#f2ad3d", "#6c7ea3", "#ef6a6a", "#5b9bf0", "#a9b8d6"];
    new Chart(el("chartPemeliharaan"), {
      type: "doughnut",
      data: { labels: entries.map((e) => e[0]), datasets: [{ data: entries.map((e) => e[1]), backgroundColor: palette, borderColor: "#121c33", borderWidth: 3 }] },
      options: { plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 12 } } }, cutout: "68%" },
    });
  }

  // ================= TABEL: REALISASI TERBARU =================
  async function loadRecentRealisasi(ctx) {
    let rows = [];
    try { rows = await DATA.listRealisasi(ctx); } catch (e) { /* kosong */ }
    rows = rows.slice(0, 5);

    el("recentEmpty").style.display = rows.length ? "none" : "block";
    el("recentTableWrap").style.display = rows.length ? "block" : "none";

    el("recentTableBody").innerHTML = rows.map((r) => `
      <tr>
        <td>${r.nomor_transaksi}</td><td>${tgl(r.tanggal)}</td><td>${r.accounts?.kode || "-"}</td>
        <td>${r.uraian || "-"}</td><td><span class="badge ${STATUS_BADGE[r.status]}">${STATUS_LABEL[r.status]}</span></td>
        <td class="cell-num">${money(r.nilai)}</td>
      </tr>
    `).join("");
  }

  // ================= NOTIFIKASI DINAMIS =================
  async function loadNotifications(ctx) {
    const items = [];
    try {
      const anggaran = await DATA.laporanAnggaranRealisasi(ctx);
      anggaran.filter((r) => r.persen_realisasi >= 100).forEach((r) => items.push({ title: `Realisasi rekening ${r.kode} melebihi pagu`, sub: `${r.persen_realisasi}% terserap`, badge: "badge-bad", label: "Masalah" }));
      anggaran.filter((r) => r.persen_realisasi >= 90 && r.persen_realisasi < 100).forEach((r) => items.push({ title: `Realisasi rekening ${r.kode} mendekati pagu`, sub: `${r.persen_realisasi}% terserap`, badge: "badge-warn", label: "Perhatian" }));
    } catch (e) { /* lewati */ }

    try {
      const { count } = await window.SIMPELBMD.sb.from("fuel_coupons").select("id", { count: "exact", head: true }).in("status", ["dibuat", "didistribusikan"]).is("deleted_at", null);
      if (count > 0) items.push({ title: `${count} kupon BBM belum direalisasikan`, sub: "Distribusi BBM", badge: "badge-info", label: "Info" });
    } catch (e) { /* lewati */ }

    try {
      const { count } = await window.SIMPELBMD.sb.from("realization").select("id", { count: "exact", head: true }).eq("status", "draft").eq("fiscal_year", ctx.fiscalYear).eq("stage", ctx.stage).is("deleted_at", null);
      if (count > 0) items.push({ title: `${count} transaksi realisasi masih Draft`, sub: "Belum diajukan untuk verifikasi", badge: "badge-info", label: "Info" });
    } catch (e) { /* lewati */ }

    const top = items.slice(0, 5);
    el("notifEmpty").style.display = top.length ? "none" : "block";
    el("notifList").innerHTML = top.map((n) => `
      <div class="list-row">
        <div><div class="l-main">${n.title}</div><div class="l-sub">${n.sub}</div></div>
        <span class="badge ${n.badge}">${n.label}</span>
      </div>
    `).join("");
  }

  boot();
})();
