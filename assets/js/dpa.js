/* ==========================================================================
   SIMPELBMD — Modul DPA
   ========================================================================== */
(() => {
  let profile = null;
  let accounts = [];
  let dpaList = [];
  let editingDpaId = null;
  let deletingDpaId = null;
  let importRows = [];
  let importDpaId = null;

  const el = (id) => document.getElementById(id);

  function money(n) { return window.SIMPELBMD_UI.formatRupiah(n); }
  function tgl(d) { return window.SIMPELBMD_UI.formatTanggal(d); }

  async function boot() {
    profile = await window.SIMPELBMD_UI.bootstrapPage();
    if (!profile) return;

    const ctx = DATA.ctx();
    el("ctxYear").textContent = ctx.fiscalYear;
    el("ctxStage").value = ctx.stage;
    el("ctxStage").addEventListener("change", (e) => {
      localStorage.setItem("simpelbmd_tahapan", e.target.value);
      loadList();
    });

    accounts = await DATA.listAccounts();

    bindEvents();
    await loadList();
  }

  async function loadList() {
    const ctx = DATA.ctx();
    el("kpiPeriode").textContent = `${ctx.stage === "murni" ? "Murni" : "Perubahan"} · TA ${ctx.fiscalYear}`;
    try {
      dpaList = await DATA.listDpa(ctx);
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat data DPA: " + e.message, "bad");
      dpaList = [];
    }
    renderList();
  }

  function renderList() {
    const search = el("searchInput").value.trim().toLowerCase();
    const rows = dpaList.filter((d) => !search || d.nomor_dpa.toLowerCase().includes(search));

    const totalPagu = rows.reduce((s, d) => s + d.total_pagu, 0);
    const totalRincian = rows.reduce((s, d) => s + d.jumlah_rincian, 0);
    el("kpiTotalPagu").textContent = money(totalPagu);
    el("kpiJumlahDpa").textContent = rows.length;
    el("kpiJumlahRincian").textContent = totalRincian;

    const tbody = el("dpaTableBody");
    el("emptyState").style.display = rows.length ? "none" : "block";
    document.querySelector(".table-scroll").style.display = rows.length ? "block" : "none";

    tbody.innerHTML = rows.map((d) => `
      <tr>
        <td>${d.nomor_dpa}</td>
        <td>${tgl(d.tanggal_penetapan)}</td>
        <td><span class="badge badge-info">${d.stage === "murni" ? "Murni" : "Perubahan"}</span></td>
        <td>${d.jumlah_rincian}</td>
        <td class="cell-num">${money(d.total_pagu)}</td>
        <td>${d.is_active ? '<span class="badge badge-ok">Aktif</span>' : '<span class="badge badge-warn">Nonaktif</span>'}</td>
        <td>
          <div class="action-icons">
            <button title="Lihat / Edit" onclick="DPA_UI.openEdit('${d.id}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
            <button title="Hapus" class="danger" onclick="DPA_UI.confirmDelete('${d.id}','${d.nomor_dpa.replace(/'/g,"")}')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  // ---------------- Modal: Tambah / Edit DPA ----------------
  function accountOptionsHtml(selectedId) {
    return `<option value="">Pilih rekening…</option>` + accounts.map((a) =>
      `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${a.kode} — ${a.uraian}</option>`
    ).join("") + `<option value="__new__">+ Tambah rekening baru…</option>`;
  }

  function addDetailRow(data = {}) {
    const wrap = document.createElement("div");
    wrap.className = "detail-row";
    wrap.innerHTML = `
      <select class="row-account">${accountOptionsHtml(data.account_id)}</select>
      <input type="text" class="row-satuan" placeholder="Unit" value="${data.satuan || ""}" />
      <input type="number" class="row-volume" placeholder="0" min="0" step="0.01" value="${data.volume ?? ""}" />
      <input type="number" class="row-harga" placeholder="0" min="0" step="1" value="${data.harga_satuan ?? ""}" />
      <div class="row-jumlah">Rp 0</div>
      <button type="button" class="row-remove" title="Hapus baris">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    `;
    el("detailRowsBody").appendChild(wrap);

    const accSel = wrap.querySelector(".row-account");
    const volInput = wrap.querySelector(".row-volume");
    const hargaInput = wrap.querySelector(".row-harga");
    const jumlahEl = wrap.querySelector(".row-jumlah");

    function recalcRow() {
      const v = parseFloat(volInput.value) || 0;
      const h = parseFloat(hargaInput.value) || 0;
      jumlahEl.textContent = money(v * h);
      recalcTotal();
    }
    accSel.addEventListener("change", () => {
      if (accSel.value === "__new__") {
        accSel.value = "";
        openAccountModal(accSel);
      }
    });
    volInput.addEventListener("input", recalcRow);
    hargaInput.addEventListener("input", recalcRow);
    wrap.querySelector(".row-remove").addEventListener("click", () => { wrap.remove(); recalcTotal(); });

    recalcRow();
  }

  function recalcTotal() {
    let total = 0;
    document.querySelectorAll("#detailRowsBody .detail-row").forEach((row) => {
      const v = parseFloat(row.querySelector(".row-volume").value) || 0;
      const h = parseFloat(row.querySelector(".row-harga").value) || 0;
      total += v * h;
    });
    el("detailTotalPagu").textContent = money(total);
  }

  function collectDetailRows() {
    const rows = [];
    document.querySelectorAll("#detailRowsBody .detail-row").forEach((row) => {
      const account_id = row.querySelector(".row-account").value;
      const satuan = row.querySelector(".row-satuan").value.trim();
      const volume = parseFloat(row.querySelector(".row-volume").value) || 0;
      const harga_satuan = parseFloat(row.querySelector(".row-harga").value) || 0;
      if (account_id && volume > 0) rows.push({ account_id, satuan, volume, harga_satuan });
    });
    return rows;
  }

  async function openCreate() {
    editingDpaId = null;
    el("dpaModalTitle").textContent = "Tambah DPA";
    el("dpaFormError").classList.remove("show");
    const ctx = DATA.ctx();
    el("fFiscalYear").value = ctx.fiscalYear;
    el("fStage").value = ctx.stage === "murni" ? "Murni" : "Perubahan";
    el("fNomorDpa").value = await DATA.nextNomorDpa(ctx.fiscalYear, ctx.stage);
    el("fTanggalPenetapan").value = new Date().toISOString().slice(0, 10);
    el("fKeterangan").value = "";
    el("detailRowsBody").innerHTML = "";
    el("dpaFootNote").textContent = "";
    addDetailRow();
    recalcTotal();
    el("dpaModal").classList.add("show");
  }

  async function openEdit(id) {
    editingDpaId = id;
    el("dpaFormError").classList.remove("show");
    try {
      const detail = await DATA.getDpaDetail(id);
      el("dpaModalTitle").textContent = "Edit DPA";
      el("fFiscalYear").value = detail.fiscal_year;
      el("fStage").value = detail.stage === "murni" ? "Murni" : "Perubahan";
      el("fNomorDpa").value = detail.nomor_dpa;
      el("fTanggalPenetapan").value = detail.tanggal_penetapan;
      el("fKeterangan").value = detail.keterangan || "";
      el("detailRowsBody").innerHTML = "";
      (detail.dpa_details || []).filter((r) => !r.deleted_at).forEach((r) => addDetailRow(r));
      if (!detail.dpa_details || !detail.dpa_details.filter((r) => !r.deleted_at).length) addDetailRow();
      recalcTotal();
      el("dpaFootNote").textContent = `Dibuat ${tgl(detail.created_at)}`;
      el("dpaModal").classList.add("show");
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat detail DPA: " + e.message, "bad");
    }
  }

  function closeDpaModal() { el("dpaModal").classList.remove("show"); }

  async function saveDpa() {
    const nomor_dpa = el("fNomorDpa").value.trim();
    const tanggal_penetapan = el("fTanggalPenetapan").value;
    const keterangan = el("fKeterangan").value.trim();
    const rows = collectDetailRows();
    const errBox = el("dpaFormError");
    errBox.classList.remove("show");

    if (!nomor_dpa || !tanggal_penetapan) {
      errBox.textContent = "Nomor DPA dan Tanggal Penetapan wajib diisi.";
      errBox.classList.add("show");
      return;
    }
    if (!rows.length) {
      errBox.textContent = "Tambahkan minimal satu baris rincian rekening dengan volume lebih dari 0.";
      errBox.classList.add("show");
      return;
    }

    const btn = el("dpaSaveBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Menyimpan…';

    try {
      const ctx = DATA.ctx();
      const header = { fiscal_year: ctx.fiscalYear, stage: ctx.stage, nomor_dpa, tanggal_penetapan, keterangan };
      let dpaId = editingDpaId;
      if (editingDpaId) {
        await DATA.updateDpaHeader(profile, editingDpaId, header, dpaList.find((d) => d.id === editingDpaId));
      } else {
        const created = await DATA.createDpaHeader(profile, header);
        dpaId = created.id;
      }
      await DATA.replaceDpaDetails(profile, dpaId, rows);
      window.SIMPELBMD_UI.toast("Data DPA berhasil disimpan.");
      closeDpaModal();
      await loadList();
    } catch (e) {
      const msg = e.message?.includes("duplicate") || e.code === "23505"
        ? "Nomor DPA sudah digunakan pada Tahun Anggaran dan Tahapan ini."
        : "Data tidak dapat disimpan: " + e.message;
      errBox.textContent = msg;
      errBox.classList.add("show");
    } finally {
      btn.disabled = false;
      btn.textContent = "Simpan DPA";
    }
  }

  // ---------------- Modal: Tambah Rekening cepat ----------------
  let pendingAccountSelect = null;
  function openAccountModal(selectEl) {
    pendingAccountSelect = selectEl;
    el("newAccKode").value = "";
    el("newAccUraian").value = "";
    el("newAccJenis").value = "";
    el("accountModal").classList.add("show");
  }
  function closeAccountModal() { el("accountModal").classList.remove("show"); }

  async function saveNewAccount() {
    const kode = el("newAccKode").value.trim();
    const uraian = el("newAccUraian").value.trim();
    const jenis_belanja = el("newAccJenis").value.trim();
    if (!kode || !uraian) { window.SIMPELBMD_UI.toast("Kode dan uraian rekening wajib diisi.", "warn"); return; }
    try {
      const created = await DATA.quickCreateAccount({ kode, uraian, jenis_belanja });
      accounts.push(created);
      accounts.sort((a, b) => a.kode.localeCompare(b.kode));
      document.querySelectorAll(".row-account").forEach((sel) => {
        const current = sel.value;
        sel.innerHTML = accountOptionsHtml(current);
      });
      if (pendingAccountSelect) pendingAccountSelect.value = created.id;
      window.SIMPELBMD_UI.toast("Rekening baru berhasil ditambahkan.");
      closeAccountModal();
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal menambah rekening: " + e.message, "bad");
    }
  }

  // ---------------- Modal: Hapus ----------------
  function confirmDelete(id, nomor) {
    deletingDpaId = id;
    el("deleteConfirmText").textContent = `DPA "${nomor}" akan disembunyikan dari daftar namun tetap tersimpan untuk audit (soft delete).`;
    el("deleteModal").classList.add("show");
  }
  async function doDelete() {
    if (!deletingDpaId) return;
    try {
      await DATA.softDeleteDpa(profile, deletingDpaId, dpaList.find((d) => d.id === deletingDpaId));
      window.SIMPELBMD_UI.toast("DPA berhasil dihapus.");
      el("deleteModal").classList.remove("show");
      await loadList();
    } catch (e) {
      window.SIMPELBMD_UI.toast("Data tidak dapat dihapus: " + e.message, "bad");
    }
  }

  // ---------------- Export Excel ----------------
  function exportExcel() {
    const rows = dpaList.map((d) => ({
      "Nomor DPA": d.nomor_dpa,
      "Tanggal Penetapan": tgl(d.tanggal_penetapan),
      "Tahapan": d.stage === "murni" ? "Murni" : "Perubahan",
      "Jumlah Rincian": d.jumlah_rincian,
      "Total Pagu": d.total_pagu,
      "Status": d.is_active ? "Aktif" : "Nonaktif",
    }));
    if (!rows.length) { window.SIMPELBMD_UI.toast("Tidak ada data untuk diekspor.", "warn"); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DPA");
    const ctx = DATA.ctx();
    XLSX.writeFile(wb, `DPA_${ctx.fiscalYear}_${ctx.stage}.xlsx`);
  }

  // ---------------- Import rincian Excel (Smart Import: deteksi kolom otomatis) ----------------
  function openImportModal() {
    if (!dpaList.length) {
      window.SIMPELBMD_UI.toast("Belum ada DPA pada periode ini. Tambahkan DPA terlebih dahulu.", "warn");
      return;
    }
    SmartImport.open({
      title: "Import Rincian DPA dari Excel",
      description: "Sistem akan mendeteksi kolom kode rekening, satuan, volume, dan harga secara otomatis.",
      context: { label: "Pilih DPA Tujuan", options: dpaList.map((d) => ({ value: d.id, label: d.nomor_dpa })) },
      fields: [
        { key: "kode_rekening", label: "Kode Rekening", aliases: ["kode rek", "kode", "account code", "no rekening"], required: true, type: "text" },
        { key: "satuan", label: "Satuan", aliases: ["unit", "uom"], required: false, type: "text" },
        { key: "volume", label: "Volume", aliases: ["jumlah", "qty", "quantity"], required: true, type: "number" },
        { key: "harga_satuan", label: "Harga Satuan", aliases: ["harga", "unit price", "harga per unit"], required: true, type: "number" },
      ],
      rowHook: (data) => {
        const acc = accounts.find((a) => String(a.kode).trim().toLowerCase() === String(data.kode_rekening).trim().toLowerCase());
        if (!acc) return { errors: [`Rekening "${data.kode_rekening}" tidak ditemukan di Master Rekening`] };
        return { errors: [], patch: { account_id: acc.id } };
      },
      onImport: async (rows, dpaId) => {
        const existing = await DATA.getDpaDetail(dpaId);
        const currentRows = (existing.dpa_details || []).filter((r) => !r.deleted_at).map((r) => ({ account_id: r.account_id, satuan: r.satuan, volume: r.volume, harga_satuan: r.harga_satuan }));
        const merged = [...currentRows, ...rows.map((r) => ({ account_id: r.account_id, satuan: r.satuan, volume: r.volume, harga_satuan: r.harga_satuan }))];
        await DATA.replaceDpaDetails(profile, dpaId, merged);
      },
      afterImport: loadList,
    });
  }

  // ---------------- Modal: Tambah/Edit DPA (lanjutan) ----------------

  function bindEvents() {
    el("searchInput").addEventListener("input", renderList);
    el("btnAddDpa").addEventListener("click", openCreate);
    el("emptyAddBtn").addEventListener("click", openCreate);
    el("dpaModalClose").addEventListener("click", closeDpaModal);
    el("dpaCancelBtn").addEventListener("click", closeDpaModal);
    el("dpaSaveBtn").addEventListener("click", saveDpa);
    el("addRowBtn").addEventListener("click", () => addDetailRow());

    el("accountModalClose").addEventListener("click", closeAccountModal);
    el("accountCancelBtn").addEventListener("click", closeAccountModal);
    el("accountSaveBtn").addEventListener("click", saveNewAccount);

    el("deleteCancelBtn").addEventListener("click", () => el("deleteModal").classList.remove("show"));
    el("deleteConfirmBtn").addEventListener("click", doDelete);

    el("btnExport").addEventListener("click", exportExcel);
    el("btnImport").addEventListener("click", openImportModal);
  }

  window.DPA_UI = { openEdit, confirmDelete };
  boot();
})();
