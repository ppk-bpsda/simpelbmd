/* ==========================================================================
   SIMPELBMD — Modul Realisasi
   ========================================================================== */
(() => {
  let profile = null;
  let accounts = [];
  let vendors = [];
  let realList = [];
  let editingId = null;
  let confirmAction = null;
  let pendingVendorNeeded = false;

  const el = (id) => document.getElementById(id);
  const money = (n) => window.SIMPELBMD_UI.formatRupiah(n);
  const tgl = (d) => window.SIMPELBMD_UI.formatTanggal(d);

  const STATUS_LABEL = { draft: "Draft", diverifikasi: "Diverifikasi", disetujui: "Disetujui", ditolak: "Ditolak" };
  const STATUS_BADGE = { draft: "badge-info", diverifikasi: "badge-warn", disetujui: "badge-ok", ditolak: "badge-bad" };

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

    [accounts, vendors] = await Promise.all([DATA.listAccounts(), DATA.listVendors()]);
    el("filterAccount").innerHTML += accounts.map((a) => `<option value="${a.id}">${a.kode} — ${a.uraian}</option>`).join("");

    bindEvents();
    await loadList();
  }

  async function loadList() {
    const ctx = DATA.ctx();
    el("kpiPeriode").textContent = `${ctx.stage === "murni" ? "Murni" : "Perubahan"} · TA ${ctx.fiscalYear}`;
    try {
      realList = await DATA.listRealisasi({
        fiscalYear: ctx.fiscalYear, stage: ctx.stage,
        status: el("filterStatus").value || null,
        accountId: el("filterAccount").value || null,
        search: el("searchInput").value.trim() || null,
      });
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat data realisasi: " + e.message, "bad");
      realList = [];
    }
    renderList();
  }

  function renderList() {
    const totalNilai = realList.reduce((s, r) => s + Number(r.nilai || 0), 0);
    const disetujui = realList.filter((r) => r.status === "disetujui").length;
    const pending = realList.filter((r) => r.status === "draft" || r.status === "diverifikasi").length;
    const ditolak = realList.filter((r) => r.status === "ditolak").length;
    el("kpiTotalRealisasi").textContent = money(totalNilai);
    el("kpiDisetujui").textContent = disetujui;
    el("kpiPending").textContent = pending;
    el("kpiDitolak").textContent = ditolak;

    el("emptyState").style.display = realList.length ? "none" : "block";
    document.querySelector(".table-scroll").style.display = realList.length ? "block" : "none";

    el("realTableBody").innerHTML = realList.map((r) => {
      const canEdit = r.status === "draft";
      const canDelete = profile.role === "admin" && r.status === "draft";
      const canVerify = r.status === "draft";
      const canDecide = profile.role === "admin" && r.status === "diverifikasi";
      return `
      <tr>
        <td>${r.nomor_transaksi}</td>
        <td>${tgl(r.tanggal)}</td>
        <td>${r.accounts?.kode || "-"}</td>
        <td>${r.uraian || "-"}</td>
        <td>${r.vendors?.nama || "-"}</td>
        <td class="cell-num">${money(r.nilai)}</td>
        <td><span class="badge ${STATUS_BADGE[r.status]}">${STATUS_LABEL[r.status]}</span></td>
        <td>
          <div class="action-icons">
            ${canEdit ? `<button title="Edit" onclick="REAL_UI.openEdit('${r.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>` : ""}
            ${canVerify ? `<button title="Ajukan Verifikasi" onclick="REAL_UI.ask('${r.id}','verify')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg></button>` : ""}
            ${canDecide ? `<button title="Setujui" onclick="REAL_UI.ask('${r.id}','approve')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6 9 17l-5-5"/></svg></button>` : ""}
            ${canDecide ? `<button title="Tolak" class="danger" onclick="REAL_UI.ask('${r.id}','reject')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` : ""}
            ${canDelete ? `<button title="Hapus" class="danger" onclick="REAL_UI.ask('${r.id}','delete')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>` : ""}
          </div>
        </td>
      </tr>`;
    }).join("");
  }

  // ---------------- Modal: Tambah/Edit ----------------
  function accountOptionsHtml(selectedId) {
    return `<option value="">Pilih rekening…</option>` + accounts.map((a) =>
      `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${a.kode} — ${a.uraian}</option>`
    ).join("") + `<option value="__new__">+ Tambah rekening baru…</option>`;
  }
  function vendorOptionsHtml(selectedId) {
    return `<option value="">— Tanpa penyedia —</option>` + vendors.map((v) =>
      `<option value="${v.id}" ${v.id === selectedId ? "selected" : ""}>${v.nama}</option>`
    ).join("") + `<option value="__new__">+ Tambah penyedia baru…</option>`;
  }

  async function refreshCalcStrip() {
    const accountId = el("fAccount").value;
    const tanggal = el("fTanggal").value;
    if (!accountId || accountId === "__new__" || !tanggal) { el("calcStrip").style.display = "none"; return; }
    const ctx = DATA.ctx();
    const bulan = new Date(tanggal).getMonth() + 1;
    try {
      const [pr, kas] = await Promise.all([
        DATA.getPaguRealisasi(accountId, ctx.fiscalYear, ctx.stage),
        DATA.getAnggaranKasBulan(accountId, ctx.fiscalYear, ctx.stage, bulan),
      ]);
      el("calcPagu").textContent = money(pr.pagu);
      el("calcRealisasi").textContent = money(pr.realisasi);
      const sisaEl = el("calcSisa");
      sisaEl.textContent = money(pr.sisa);
      sisaEl.parentElement.classList.toggle("neg", pr.sisa < 0);
      el("calcKas").textContent = money(kas.anggaran_kas);
      el("calcStrip").style.display = "flex";
      el("calcStrip").dataset.sisaPagu = pr.sisa;
      el("calcStrip").dataset.anggaranKas = kas.anggaran_kas;
      el("calcStrip").dataset.realisasiKasBulan = kas.realisasi;
    } catch (e) {
      el("calcStrip").style.display = "none";
    }
  }

  function openCreate() {
    editingId = null;
    el("realModalTitle").textContent = "Tambah Realisasi";
    el("realFormError").classList.remove("show");
    el("realWarnBox").innerHTML = "";
    el("fAccount").innerHTML = accountOptionsHtml();
    el("fVendor").innerHTML = vendorOptionsHtml();
    el("fTanggal").value = new Date().toISOString().slice(0, 10);
    el("fUraian").value = "";
    el("fNomorSpj").value = "";
    el("fNomorBukti").value = "";
    el("fNilai").value = "";
    el("fJenisBelanja").value = "";
    el("fKeterangan").value = "";
    el("realFootNote").textContent = "";
    el("calcStrip").style.display = "none";
    DATA.nextNomorTransaksi(DATA.ctx().fiscalYear).then((n) => { el("fNomorTransaksi").value = n; });
    el("realModal").classList.add("show");
  }

  function openEdit(id) {
    const r = realList.find((x) => x.id === id);
    if (!r) return;
    editingId = id;
    el("realModalTitle").textContent = "Edit Realisasi";
    el("realFormError").classList.remove("show");
    el("realWarnBox").innerHTML = "";
    el("fAccount").innerHTML = accountOptionsHtml(r.account_id);
    el("fVendor").innerHTML = vendorOptionsHtml(r.vendor_id);
    el("fNomorTransaksi").value = r.nomor_transaksi;
    el("fTanggal").value = r.tanggal;
    el("fUraian").value = r.uraian || "";
    el("fNomorSpj").value = r.nomor_spj || "";
    el("fNomorBukti").value = r.nomor_bukti || "";
    el("fNilai").value = r.nilai;
    el("fJenisBelanja").value = r.jenis_belanja || "";
    el("fKeterangan").value = r.keterangan || "";
    el("realFootNote").textContent = `Status saat ini: ${STATUS_LABEL[r.status]}`;
    refreshCalcStrip();
    el("realModal").classList.add("show");
  }

  function closeModal() { el("realModal").classList.remove("show"); }

  async function saveRealisasi() {
    const errBox = el("realFormError");
    const warnBox = el("realWarnBox");
    errBox.classList.remove("show");
    warnBox.innerHTML = "";

    const account_id = el("fAccount").value;
    const nomor_transaksi = el("fNomorTransaksi").value.trim();
    const tanggal = el("fTanggal").value;
    const nilai = parseFloat(el("fNilai").value) || 0;
    const vendor_id = el("fVendor").value || null;

    if (!account_id || account_id === "__new__" || !nomor_transaksi || !tanggal || nilai <= 0) {
      errBox.textContent = "Rekening, Nomor Transaksi, Tanggal, dan Nilai (lebih dari 0) wajib diisi.";
      errBox.classList.add("show");
      return;
    }

    // Validasi blocking: realisasi tidak boleh melebihi pagu DPA (Bab 10 & 22)
    const ctx = DATA.ctx();
    const pr = await DATA.getPaguRealisasi(account_id, ctx.fiscalYear, ctx.stage);
    const realisasiTerpakai = editingId
      ? pr.realisasi - Number(realList.find((r) => r.id === editingId)?.nilai || 0)
      : pr.realisasi;
    const sisaSetelahEdit = pr.pagu - realisasiTerpakai;

    if (nilai > sisaSetelahEdit) {
      errBox.innerHTML = `Data tidak dapat disimpan karena nilai realisasi (${money(nilai)}) melebihi sisa pagu DPA rekening ini (${money(sisaSetelahEdit)}).`;
      errBox.classList.add("show");
      return;
    }

    // Validasi warning: melebihi anggaran kas bulan tsb — tetap bisa disimpan dengan konfirmasi
    const bulan = new Date(tanggal).getMonth() + 1;
    const kas = await DATA.getAnggaranKasBulan(account_id, ctx.fiscalYear, ctx.stage, bulan);
    const kasTerpakai = kas.realisasi + nilai;
    if (kas.anggaran_kas > 0 && kasTerpakai > kas.anggaran_kas) {
      warnBox.innerHTML = `<div class="alert alert-warn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 2 18a1.8 1.8 0 0 0 1.6 2.7h16.8A1.8 1.8 0 0 0 22 18L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z"/></svg><div>Nilai transaksi ini akan membuat realisasi bulan berjalan melebihi Anggaran Kas rekening ini (${money(kas.anggaran_kas)}). Simpan tetap dilanjutkan sebagai Draft untuk diverifikasi.</div></div>`;
    }

    const btn = el("realSaveBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Menyimpan…';

    const payload = {
      fiscal_year: ctx.fiscalYear, stage: ctx.stage, account_id, nomor_transaksi, tanggal,
      uraian: el("fUraian").value.trim(), nomor_spj: el("fNomorSpj").value.trim(), nomor_bukti: el("fNomorBukti").value.trim(),
      vendor_id, nilai, jenis_belanja: el("fJenisBelanja").value.trim(), keterangan: el("fKeterangan").value.trim(),
    };

    try {
      if (editingId) {
        await DATA.updateRealisasi(profile, editingId, payload, realList.find((r) => r.id === editingId));
      } else {
        payload.status = "draft";
        await DATA.createRealisasi(profile, payload);
      }
      window.SIMPELBMD_UI.toast("Data realisasi berhasil disimpan.");
      closeModal();
      await loadList();
    } catch (e) {
      errBox.textContent = e.code === "23505"
        ? "Nomor transaksi sudah digunakan pada Tahun Anggaran ini."
        : "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    } finally {
      btn.disabled = false;
      btn.textContent = "Simpan Realisasi";
    }
  }

  // ---------------- Quick add: rekening & penyedia ----------------
  function bindComboQuickAdd() {
    el("fAccount").addEventListener("change", (e) => {
      if (e.target.value === "__new__") { e.target.value = ""; el("accountModal").classList.add("show"); }
      else refreshCalcStrip();
    });
    el("fTanggal").addEventListener("change", refreshCalcStrip);
    el("fVendor").addEventListener("change", (e) => {
      if (e.target.value === "__new__") { e.target.value = ""; el("vendorModal").classList.add("show"); }
    });
  }

  async function saveNewAccount() {
    const kode = el("newAccKode").value.trim();
    const uraian = el("newAccUraian").value.trim();
    const jenis_belanja = el("newAccJenis").value.trim();
    if (!kode || !uraian) { window.SIMPELBMD_UI.toast("Kode dan uraian rekening wajib diisi.", "warn"); return; }
    try {
      const created = await DATA.quickCreateAccount({ kode, uraian, jenis_belanja });
      accounts.push(created);
      accounts.sort((a, b) => a.kode.localeCompare(b.kode));
      el("fAccount").innerHTML = accountOptionsHtml(created.id);
      el("filterAccount").innerHTML = `<option value="">Semua Rekening</option>` + accounts.map((a) => `<option value="${a.id}">${a.kode} — ${a.uraian}</option>`).join("");
      window.SIMPELBMD_UI.toast("Rekening baru berhasil ditambahkan.");
      el("accountModal").classList.remove("show");
      refreshCalcStrip();
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal menambah rekening: " + e.message, "bad");
    }
  }

  async function saveNewVendor() {
    const nama = el("newVendorNama").value.trim();
    if (!nama) { window.SIMPELBMD_UI.toast("Nama penyedia wajib diisi.", "warn"); return; }
    try {
      const created = await DATA.quickCreateVendor({ nama });
      vendors.push(created);
      el("fVendor").innerHTML = vendorOptionsHtml(created.id);
      window.SIMPELBMD_UI.toast("Penyedia baru berhasil ditambahkan.");
      el("vendorModal").classList.remove("show");
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal menambah penyedia: " + e.message, "bad");
    }
  }

  // ---------------- Konfirmasi aksi (verify / approve / reject / delete) ----------------
  function ask(id, action) {
    confirmAction = { id, action };
    const r = realList.find((x) => x.id === id);
    const cfg = {
      verify: { title: "Ajukan verifikasi?", text: `Transaksi "${r.nomor_transaksi}" akan diajukan untuk diverifikasi administrator.`, btn: "Ajukan" },
      approve: { title: "Setujui transaksi?", text: `Transaksi "${r.nomor_transaksi}" senilai ${money(r.nilai)} akan disetujui dan dihitung sebagai realisasi resmi.`, btn: "Setujui" },
      reject: { title: "Tolak transaksi?", text: `Transaksi "${r.nomor_transaksi}" akan ditolak dan tidak dihitung sebagai realisasi.`, btn: "Tolak" },
      delete: { title: "Hapus transaksi?", text: `Transaksi "${r.nomor_transaksi}" akan disembunyikan dari daftar namun tetap tersimpan untuk audit (soft delete).`, btn: "Ya, Hapus" },
    }[action];
    el("confirmTitle").textContent = cfg.title;
    el("confirmText").textContent = cfg.text;
    el("confirmActionBtn").textContent = cfg.btn;
    el("confirmModal").classList.add("show");
  }

  async function runConfirmAction() {
    if (!confirmAction) return;
    const { id, action } = confirmAction;
    const before = realList.find((r) => r.id === id);
    try {
      if (action === "verify") await DATA.setStatusRealisasi(profile, id, "diverifikasi", before);
      if (action === "approve") await DATA.setStatusRealisasi(profile, id, "disetujui", before);
      if (action === "reject") await DATA.setStatusRealisasi(profile, id, "ditolak", before);
      if (action === "delete") await DATA.softDeleteRealisasi(profile, id, before);
      window.SIMPELBMD_UI.toast("Aksi berhasil dilakukan.");
      el("confirmModal").classList.remove("show");
      await loadList();
    } catch (e) {
      window.SIMPELBMD_UI.toast("Aksi gagal: " + e.message, "bad");
    }
  }

  // ---------------- Export Excel ----------------
  function exportExcel() {
    if (!realList.length) { window.SIMPELBMD_UI.toast("Tidak ada data untuk diekspor.", "warn"); return; }
    const rows = realList.map((r) => ({
      "No. Transaksi": r.nomor_transaksi, "Tanggal": tgl(r.tanggal), "Rekening": r.accounts?.kode || "-",
      "Uraian": r.uraian || "-", "No. SPJ": r.nomor_spj || "-", "Penyedia": r.vendors?.nama || "-",
      "Nilai": r.nilai, "Status": STATUS_LABEL[r.status],
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Realisasi");
    const ctx = DATA.ctx();
    XLSX.writeFile(wb, `Realisasi_${ctx.fiscalYear}_${ctx.stage}.xlsx`);
  }

  function bindEvents() {
    el("searchInput").addEventListener("input", debounce(loadList, 350));
    el("filterStatus").addEventListener("change", loadList);
    el("filterAccount").addEventListener("change", loadList);
    el("btnAddRealisasi").addEventListener("click", openCreate);
    el("emptyAddBtn").addEventListener("click", openCreate);
    el("realModalClose").addEventListener("click", closeModal);
    el("realCancelBtn").addEventListener("click", closeModal);
    el("realSaveBtn").addEventListener("click", saveRealisasi);
    bindComboQuickAdd();

    el("accountModalClose").addEventListener("click", () => el("accountModal").classList.remove("show"));
    el("accountCancelBtn").addEventListener("click", () => el("accountModal").classList.remove("show"));
    el("accountSaveBtn").addEventListener("click", saveNewAccount);

    el("vendorModalClose").addEventListener("click", () => el("vendorModal").classList.remove("show"));
    el("vendorCancelBtn").addEventListener("click", () => el("vendorModal").classList.remove("show"));
    el("vendorSaveBtn").addEventListener("click", saveNewVendor);

    el("confirmCancelBtn").addEventListener("click", () => el("confirmModal").classList.remove("show"));
    el("confirmActionBtn").addEventListener("click", runConfirmAction);

    el("btnExport").addEventListener("click", exportExcel);
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  window.REAL_UI = { openEdit, ask };
  boot();
})();
