/* ==========================================================================
   SIMPELBMD — Modul Laporan
   ========================================================================== */
(() => {
  let profile = null;
  let anggaranRows = [];
  let pmlRows = [];
  let bbmBulanan = [];
  let bbmKendaraan = [];

  const el = (id) => document.getElementById(id);
  const money = (n) => window.SIMPELBMD_UI.formatRupiah(n);
  const tgl = (d) => window.SIMPELBMD_UI.formatTanggal(d);
  const todayStr = () => new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

  async function boot() {
    profile = await window.SIMPELBMD_UI.bootstrapPage();
    if (!profile) return;
    const ctx = DATA.ctx();
    el("ctxYear").textContent = ctx.fiscalYear;
    el("ctxStage").value = ctx.stage;
    el("ctxStage").addEventListener("change", (e) => { localStorage.setItem("simpelbmd_tahapan", e.target.value); loadAnggaran(); });

    ["phDateAnggaran", "phDatePemeliharaan", "phDateBbm"].forEach((id) => (el(id).textContent = "Dicetak: " + todayStr() + " oleh " + (profile.full_name || profile.username)));

    bindEvents();
    await Promise.all([loadAnggaran(), loadPemeliharaan(), loadBbm()]);
  }

  function switchTab(tab) {
    document.querySelectorAll(".lap-tab").forEach((t) => (t.style.display = "none"));
    el(`lap-${tab}`).style.display = "block";
    document.querySelectorAll(".chip-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  }

  // ================= ANGGARAN VS REALISASI =================
  async function loadAnggaran() {
    const ctx = DATA.ctx();
    el("phSubAnggaran").textContent = `Tahun Anggaran ${ctx.fiscalYear} — ${ctx.stage === "murni" ? "Murni" : "Perubahan"}`;
    try {
      anggaranRows = await DATA.laporanAnggaranRealisasi(ctx);
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat laporan anggaran: " + e.message, "bad");
      anggaranRows = [];
    }
    renderAnggaran();
  }

  function renderAnggaran() {
    el("anggaranTableBody").innerHTML = anggaranRows.map((r) => `
      <tr>
        <td>${r.kode}</td><td>${r.uraian}</td>
        <td class="cell-num">${money(r.pagu)}</td><td class="cell-num">${money(r.realisasi)}</td>
        <td class="cell-num" style="color:${r.sisa < 0 ? "var(--bad)" : "inherit"};">${money(r.sisa)}</td>
        <td class="cell-num">${r.persen_realisasi}%</td>
      </tr>
    `).join("") || `<tr><td colspan="6" style="text-align:center;color:var(--text-3);padding:24px;">Belum ada data DPA pada periode ini.</td></tr>`;

    const totalPagu = anggaranRows.reduce((s, r) => s + Number(r.pagu || 0), 0);
    const totalReal = anggaranRows.reduce((s, r) => s + Number(r.realisasi || 0), 0);
    el("anggaranTableFoot").innerHTML = anggaranRows.length ? `
      <tr style="font-weight:600;">
        <td colspan="2">Total</td>
        <td class="cell-num">${money(totalPagu)}</td>
        <td class="cell-num">${money(totalReal)}</td>
        <td class="cell-num">${money(totalPagu - totalReal)}</td>
        <td class="cell-num">${totalPagu > 0 ? Math.round((totalReal / totalPagu) * 100) : 0}%</td>
      </tr>` : "";
  }

  function exportAnggaran() {
    if (!anggaranRows.length) { window.SIMPELBMD_UI.toast("Tidak ada data untuk diekspor.", "warn"); return; }
    const rows = anggaranRows.map((r) => ({ "Rekening": r.kode, "Uraian": r.uraian, "Pagu": r.pagu, "Realisasi": r.realisasi, "Sisa": r.sisa, "% Realisasi": r.persen_realisasi }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AnggaranRealisasi");
    const ctx = DATA.ctx();
    XLSX.writeFile(wb, `LaporanAnggaran_${ctx.fiscalYear}_${ctx.stage}.xlsx`);
  }

  // ================= PEMELIHARAAN KENDARAAN =================
  async function loadPemeliharaan() {
    const from = el("pmlFrom").value || null;
    const to = el("pmlTo").value || null;
    el("phSubPemeliharaan").textContent = from || to ? `Periode ${from ? tgl(from) : "…"} s.d. ${to ? tgl(to) : "…"}` : "Seluruh periode";
    try {
      pmlRows = await DATA.laporanPemeliharaanKendaraan({ from, to });
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat laporan pemeliharaan: " + e.message, "bad");
      pmlRows = [];
    }
    renderPemeliharaan();
  }

  function renderPemeliharaan() {
    el("pmlTableBody").innerHTML = pmlRows.map((r, i) => `
      <tr>
        <td>${i + 1}</td><td>${tgl(r.tanggal)}</td><td>${r.vehicles?.nomor_polisi || "-"}</td>
        <td>${r.vehicles?.merk || "-"}</td><td>${r.jenis_pekerjaan || r.jenis_pemeliharaan}</td>
        <td>${r.vendors?.nama || "-"}</td><td class="cell-num">${money(r.total)}</td>
      </tr>
    `).join("") || `<tr><td colspan="7" style="text-align:center;color:var(--text-3);padding:24px;">Belum ada data pada periode ini.</td></tr>`;

    const total = pmlRows.reduce((s, r) => s + Number(r.total || 0), 0);
    el("pmlTableFoot").innerHTML = pmlRows.length ? `<tr style="font-weight:600;"><td colspan="6">Total</td><td class="cell-num">${money(total)}</td></tr>` : "";
  }

  function exportPemeliharaan() {
    if (!pmlRows.length) { window.SIMPELBMD_UI.toast("Tidak ada data untuk diekspor.", "warn"); return; }
    const rows = pmlRows.map((r, i) => ({ "No": i + 1, "Tanggal": tgl(r.tanggal), "Nopol": r.vehicles?.nomor_polisi || "-", "Kendaraan": r.vehicles?.merk || "-", "Pekerjaan": r.jenis_pekerjaan || r.jenis_pemeliharaan, "Penyedia": r.vendors?.nama || "-", "Nilai": r.total }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PemeliharaanKendaraan");
    XLSX.writeFile(wb, `LaporanPemeliharaanKendaraan.xlsx`);
  }

  // ================= BBM =================
  async function loadBbm() {
    const from = el("bbmFrom").value || null;
    const to = el("bbmTo").value || null;
    try {
      [bbmBulanan, bbmKendaraan] = await Promise.all([
        DATA.laporanBbmBulanan({ from, to }),
        DATA.laporanBbmPerKendaraan(),
      ]);
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat laporan BBM: " + e.message, "bad");
      bbmBulanan = []; bbmKendaraan = [];
    }
    renderBbm();
  }

  function renderBbm() {
    el("bbmBulananBody").innerHTML = bbmBulanan.map((b) => `
      <tr><td>${new Date(b.bulan + "-01").toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</td><td class="cell-num">${b.volume.toLocaleString("id-ID")} L</td><td class="cell-num">${money(b.nilai)}</td></tr>
    `).join("") || `<tr><td colspan="3" style="text-align:center;color:var(--text-3);padding:20px;">Belum ada data.</td></tr>`;

    el("bbmKendaraanBody").innerHTML = bbmKendaraan.filter((k) => k.vehicles).map((k) => `
      <tr><td>${k.vehicles?.nomor_polisi || "-"}</td><td>${k.vehicles?.merk || "-"}</td><td>${k.jumlah_kupon || 0}</td>
      <td class="cell-num">${Number(k.total_volume || 0).toLocaleString("id-ID")} L</td><td class="cell-num">${money(k.total_nilai || 0)}</td></tr>
    `).join("") || `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:20px;">Belum ada data.</td></tr>`;
  }

  function exportBbm() {
    if (!bbmBulanan.length && !bbmKendaraan.length) { window.SIMPELBMD_UI.toast("Tidak ada data untuk diekspor.", "warn"); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bbmBulanan.map((b) => ({ "Bulan": b.bulan, "Volume": b.volume, "Nilai": b.nilai }))), "RekapBulanan");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bbmKendaraan.filter((k) => k.vehicles).map((k) => ({ "Nopol": k.vehicles?.nomor_polisi, "Merk": k.vehicles?.merk, "Jumlah Kupon": k.jumlah_kupon, "Volume": k.total_volume, "Nilai": k.total_nilai }))), "RekapKendaraan");
    XLSX.writeFile(wb, `LaporanBBM.xlsx`);
  }

  function bindEvents() {
    document.querySelectorAll(".chip-tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

    el("btnPrintAnggaran").addEventListener("click", () => window.print());
    el("btnExportAnggaran").addEventListener("click", exportAnggaran);

    el("btnFilterPml").addEventListener("click", loadPemeliharaan);
    el("btnPrintPml").addEventListener("click", () => window.print());
    el("btnExportPml").addEventListener("click", exportPemeliharaan);

    el("btnFilterBbm").addEventListener("click", loadBbm);
    el("btnPrintBbm").addEventListener("click", () => window.print());
    el("btnExportBbm").addEventListener("click", exportBbm);
  }

  boot();
})();
