/* ==========================================================================
   SIMPELBMD — Modul Anggaran Kas
   ========================================================================== */
(() => {
  let profile = null;
  let accounts = [];
  let summary = [];
  let chartInstance = null;

  const el = (id) => document.getElementById(id);
  const money = (n) => window.SIMPELBMD_UI.formatRupiah(n);

  async function boot() {
    profile = await window.SIMPELBMD_UI.bootstrapPage();
    if (!profile) return;

    const ctx = DATA.ctx();
    el("ctxYear").textContent = ctx.fiscalYear;
    el("ctxStage").value = ctx.stage;
    el("ctxStage").addEventListener("change", (e) => {
      localStorage.setItem("simpelbmd_tahapan", e.target.value);
      loadAll();
    });

    accounts = await DATA.listAccounts();
    bindEvents();
    await loadAll();
  }

  async function loadAll() {
    const ctx = DATA.ctx();
    el("kpiPeriode").textContent = `${ctx.stage === "murni" ? "Murni" : "Perubahan"} · TA ${ctx.fiscalYear}`;
    try {
      summary = await DATA.listBudgetCashSummary(ctx);
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat Anggaran Kas: " + e.message, "bad");
      summary = [];
    }
    renderSummary();
    renderChart();
  }

  function renderSummary() {
    const search = el("searchInput").value.trim().toLowerCase();
    const rows = summary.filter((s) => !search || (s.kode || "").toLowerCase().includes(search) || (s.uraian || "").toLowerCase().includes(search));

    const totalKas = rows.reduce((s, r) => s + r.anggaran, 0);
    const totalReal = rows.reduce((s, r) => s + r.realisasi, 0);
    el("kpiTotalKas").textContent = money(totalKas);
    el("kpiTotalReal").textContent = money(totalReal);
    el("kpiPersen").textContent = `${totalKas > 0 ? Math.round((totalReal / totalKas) * 100) : 0}% terserap`;
    el("kpiSisa").textContent = money(totalKas - totalReal);

    el("emptyState").style.display = rows.length ? "none" : "block";
    document.querySelector(".table-scroll").style.display = rows.length ? "block" : "none";

    el("kasTableBody").innerHTML = rows.map((r) => `
      <tr>
        <td>${r.kode || "-"}</td>
        <td>${r.uraian || "-"}</td>
        <td class="cell-num">${money(r.anggaran)}</td>
        <td class="cell-num">${money(r.realisasi)}</td>
        <td class="cell-num" style="color:${r.sisa < 0 ? "var(--bad)" : "var(--text-1)"};">${money(r.sisa)}</td>
        <td>
          <div class="action-icons">
            <button title="Edit 12 bulan" onclick="KAS_UI.openEdit('${r.account_id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  async function renderChart() {
    const ctx = DATA.ctx();
    let chart;
    try {
      chart = await DATA.getCashFlowChart(ctx);
    } catch (e) {
      return;
    }
    if (chartInstance) chartInstance.destroy();
    Chart.defaults.color = "#a9b8d6";
    Chart.defaults.font.family = "Inter";
    chartInstance = new Chart(el("chartCashFlow"), {
      type: "line",
      data: {
        labels: chart.labels,
        datasets: [
          { label: "Anggaran Kas", data: chart.kas, borderColor: "#3e63dd", backgroundColor: "rgba(62,99,221,0.12)", fill: true, tension: 0.35, pointRadius: 3 },
          { label: "Realisasi", data: chart.realisasi, borderColor: "#00d4e0", backgroundColor: "rgba(0,212,224,0.1)", fill: true, tension: 0.35, pointRadius: 3 },
        ],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } } },
        scales: { y: { grid: { color: "#1a2744" }, ticks: { callback: (v) => (v / 1000000).toFixed(0) + " jt" } }, x: { grid: { display: false } } },
      },
    });
  }

  // ---------------- Modal: edit 12 bulan per rekening ----------------
  function accountOptionsHtml(selectedId) {
    return `<option value="">Pilih rekening…</option>` + accounts.map((a) =>
      `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${a.kode} — ${a.uraian}</option>`
    ).join("") + `<option value="__new__">+ Tambah rekening baru…</option>`;
  }

  async function renderKasRows(accountId) {
    el("kasRowsBody").innerHTML = "";
    if (!accountId || accountId === "__new__") return;
    const ctx = DATA.ctx();
    let rows;
    try {
      rows = await DATA.getBudgetCashRows(accountId, ctx.fiscalYear, ctx.stage);
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat rincian bulanan: " + e.message, "bad");
      return;
    }
    // Realisasi per bulan untuk rekening ini (untuk kolom informasi, readonly)
    const view = await window.SIMPELBMD.sb.from("v_anggaran_kas_vs_realisasi").select("bulan, realisasi").eq("account_id", accountId).eq("fiscal_year", ctx.fiscalYear).eq("stage", ctx.stage);
    const realByBulan = {};
    (view.data || []).forEach((v) => { realByBulan[v.bulan] = Number(v.realisasi || 0); });

    rows.forEach((r) => {
      const realisasi = realByBulan[r.bulan] || 0;
      const div = document.createElement("div");
      div.className = "detail-row";
      div.style.gridTemplateColumns = "1fr 1fr 1fr 1fr";
      div.innerHTML = `
        <div style="align-self:center;font-size:13.5px;color:var(--text-1);">${DATA.BULAN_NAMA[r.bulan - 1]}</div>
        <input type="number" class="kas-nilai" min="0" step="1" data-bulan="${r.bulan}" value="${r.nilai || ""}" placeholder="0" />
        <div style="align-self:center;font-size:13px;color:var(--text-3);">${money(realisasi)}</div>
        <div class="row-jumlah kas-sisa" data-bulan-sisa="${r.bulan}">${money((r.nilai || 0) - realisasi)}</div>
      `;
      el("kasRowsBody").appendChild(div);
      div.querySelector(".kas-nilai").dataset.realisasi = realisasi;
    });

    el("kasRowsBody").querySelectorAll(".kas-nilai").forEach((inp) => {
      inp.addEventListener("input", () => {
        const bulan = inp.dataset.bulan;
        const nilai = parseFloat(inp.value) || 0;
        const realisasi = parseFloat(inp.dataset.realisasi) || 0;
        el(`kasRowsBody`).querySelector(`.kas-sisa[data-bulan-sisa="${bulan}"]`).textContent = money(nilai - realisasi);
        recalcTotalTahun();
      });
    });
    recalcTotalTahun();
  }

  function recalcTotalTahun() {
    let total = 0;
    document.querySelectorAll(".kas-nilai").forEach((inp) => { total += parseFloat(inp.value) || 0; });
    el("kasTotalTahun").textContent = money(total);
  }

  async function openCreate() {
    el("kasModalTitle").textContent = "Susun Anggaran Kas";
    el("kasFormError").classList.remove("show");
    el("fKasAccount").innerHTML = accountOptionsHtml();
    el("kasRowsBody").innerHTML = "";
    el("kasTotalTahun").textContent = "Rp 0";
    el("kasModal").classList.add("show");
  }

  async function openEdit(accountId) {
    el("kasModalTitle").textContent = "Edit Anggaran Kas";
    el("kasFormError").classList.remove("show");
    el("fKasAccount").innerHTML = accountOptionsHtml(accountId);
    await renderKasRows(accountId);
    el("kasModal").classList.add("show");
  }

  function closeModal() { el("kasModal").classList.remove("show"); }

  async function saveKas() {
    const accountId = el("fKasAccount").value;
    const errBox = el("kasFormError");
    errBox.classList.remove("show");
    if (!accountId || accountId === "__new__") {
      errBox.textContent = "Pilih rekening terlebih dahulu.";
      errBox.classList.add("show");
      return;
    }
    const rows = Array.from(document.querySelectorAll(".kas-nilai")).map((inp) => ({ bulan: parseInt(inp.dataset.bulan, 10), nilai: parseFloat(inp.value) || 0 }));
    const btn = el("kasSaveBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Menyimpan…';
    try {
      const ctx = DATA.ctx();
      await DATA.upsertBudgetCash(profile, accountId, ctx.fiscalYear, ctx.stage, rows);
      window.SIMPELBMD_UI.toast("Anggaran Kas berhasil disimpan.");
      closeModal();
      await loadAll();
    } catch (e) {
      errBox.textContent = "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    } finally {
      btn.disabled = false;
      btn.textContent = "Simpan Anggaran Kas";
    }
  }

  // ---------------- Quick add rekening ----------------
  async function saveNewAccount() {
    const kode = el("newAccKode").value.trim();
    const uraian = el("newAccUraian").value.trim();
    const jenis_belanja = el("newAccJenis").value.trim();
    if (!kode || !uraian) { window.SIMPELBMD_UI.toast("Kode dan uraian rekening wajib diisi.", "warn"); return; }
    try {
      const created = await DATA.quickCreateAccount({ kode, uraian, jenis_belanja });
      accounts.push(created);
      accounts.sort((a, b) => a.kode.localeCompare(b.kode));
      el("fKasAccount").innerHTML = accountOptionsHtml(created.id);
      await renderKasRows(created.id);
      window.SIMPELBMD_UI.toast("Rekening baru berhasil ditambahkan.");
      el("accountModal").classList.remove("show");
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal menambah rekening: " + e.message, "bad");
    }
  }

  // ---------------- Export ----------------
  function exportExcel() {
    if (!summary.length) { window.SIMPELBMD_UI.toast("Tidak ada data untuk diekspor.", "warn"); return; }
    const rows = summary.map((r) => ({ "Rekening": r.kode, "Uraian": r.uraian, "Anggaran Kas": r.anggaran, "Realisasi": r.realisasi, "Sisa": r.sisa }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AnggaranKas");
    const ctx = DATA.ctx();
    XLSX.writeFile(wb, `AnggaranKas_${ctx.fiscalYear}_${ctx.stage}.xlsx`);
  }

  function bindEvents() {
    el("searchInput").addEventListener("input", renderSummary);
    el("btnAddKas").addEventListener("click", openCreate);
    el("emptyAddBtn").addEventListener("click", openCreate);
    el("kasModalClose").addEventListener("click", closeModal);
    el("kasCancelBtn").addEventListener("click", closeModal);
    el("kasSaveBtn").addEventListener("click", saveKas);
    el("fKasAccount").addEventListener("change", (e) => {
      if (e.target.value === "__new__") { e.target.value = ""; el("accountModal").classList.add("show"); }
      else renderKasRows(e.target.value);
    });
    el("accountModalClose").addEventListener("click", () => el("accountModal").classList.remove("show"));
    el("accountCancelBtn").addEventListener("click", () => el("accountModal").classList.remove("show"));
    el("accountSaveBtn").addEventListener("click", saveNewAccount);
    el("btnExport").addEventListener("click", exportExcel);
  }

  window.KAS_UI = { openEdit };
  boot();
})();
