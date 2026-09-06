/* ==========================================================================
   SIMPELBMD — Modul Master Data (Rekening, Penyedia, Jenis BBM, Satuan)
   ========================================================================== */
(() => {
  let profile = null;
  let accounts = [];
  let vendors = [];
  let fuelTypes = [];
  let units = [];
  let editingRekId = null;
  let editingVenId = null;
  let deleteTarget = null;

  const el = (id) => document.getElementById(id);

  async function boot() {
    profile = await window.SIMPELBMD_UI.bootstrapPage();
    if (!profile) return;
    if (profile.role !== "admin") {
      document.querySelector(".content").innerHTML = `
        <div class="empty-state">
          <div class="e-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg></div>
          <h4>Akses terbatas</h4><p>Master Data hanya dapat diakses oleh Administrator.</p>
          <a class="btn btn-primary btn-sm" href="dashboard.html">Kembali ke Dashboard</a>
        </div>`;
      return;
    }
    bindEvents();
    await loadAll();
  }

  async function loadAll() {
    [accounts, vendors, fuelTypes, units] = await Promise.all([
      window.SIMPELBMD.sb.from("accounts").select("*").order("kode").then((r) => r.data || []),
      DATA.listVendors(),
      DATA.listFuelTypes(),
      DATA.listUnits(),
    ]);
    renderRekening();
    renderPenyedia();
    renderFuel();
    renderUnit();
  }

  function switchTab(tab) {
    document.querySelectorAll(".md-tab").forEach((t) => (t.style.display = "none"));
    el(`tab-${tab}`).style.display = "block";
    document.querySelectorAll(".chip-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  }

  // ================= REKENING =================
  function renderRekening() {
    const search = (el("rekSearch").value || "").trim().toLowerCase();
    const rows = accounts.filter((a) => !search || a.kode.toLowerCase().includes(search) || a.uraian.toLowerCase().includes(search));
    el("rekTableBody").innerHTML = rows.map((a) => `
      <tr>
        <td>${a.kode}</td><td>${a.uraian}</td><td>${a.jenis_belanja || "-"}</td>
        <td>${a.is_active ? '<span class="badge badge-ok">Aktif</span>' : '<span class="badge badge-bad">Nonaktif</span>'}</td>
        <td><div class="action-icons">
          <button title="Edit" onclick="MD_UI.openEditRek('${a.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          ${a.is_active ? `<button title="Nonaktifkan" class="danger" onclick="MD_UI.confirmDelete('rekening','${a.id}','${a.kode}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` : ""}
        </div></td>
      </tr>`).join("") || `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:24px;">Belum ada data rekening.</td></tr>`;
  }

  function openCreateRek() {
    editingRekId = null;
    el("rekModalTitle").textContent = "Tambah Rekening";
    el("rekFormError").classList.remove("show");
    ["fRekKode", "fRekUraian", "fRekJenis"].forEach((id) => (el(id).value = ""));
    el("rekModal").classList.add("show");
  }
  function openEditRek(id) {
    const a = accounts.find((x) => x.id === id);
    if (!a) return;
    editingRekId = id;
    el("rekModalTitle").textContent = "Edit Rekening";
    el("rekFormError").classList.remove("show");
    el("fRekKode").value = a.kode;
    el("fRekUraian").value = a.uraian;
    el("fRekJenis").value = a.jenis_belanja || "";
    el("rekModal").classList.add("show");
  }
  async function saveRek() {
    const errBox = el("rekFormError");
    errBox.classList.remove("show");
    const kode = el("fRekKode").value.trim();
    const uraian = el("fRekUraian").value.trim();
    if (!kode || !uraian) { errBox.textContent = "Kode dan uraian wajib diisi."; errBox.classList.add("show"); return; }
    const payload = { kode, uraian, jenis_belanja: el("fRekJenis").value.trim() || null };
    try {
      if (editingRekId) {
        const updated = await DATA.updateAccount(profile, editingRekId, payload, accounts.find((a) => a.id === editingRekId));
        accounts = accounts.map((a) => (a.id === editingRekId ? updated : a));
      } else {
        const created = await DATA.quickCreateAccount(payload);
        accounts.push(created);
      }
      accounts.sort((a, b) => a.kode.localeCompare(b.kode));
      window.SIMPELBMD_UI.toast("Data rekening berhasil disimpan.");
      el("rekModal").classList.remove("show");
      renderRekening();
    } catch (e) {
      errBox.textContent = e.code === "23505" ? "Kode rekening sudah digunakan." : "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    }
  }

  // ================= PENYEDIA =================
  function renderPenyedia() {
    const search = (el("venSearch").value || "").trim().toLowerCase();
    const rows = vendors.filter((v) => !search || v.nama.toLowerCase().includes(search));
    el("venTableBody").innerHTML = rows.map((v) => `
      <tr>
        <td>${v.nama}</td><td>${v.npwp || "-"}</td><td>${v.kontak || "-"}</td><td>${v.alamat || "-"}</td>
        <td><div class="action-icons">
          <button title="Edit" onclick="MD_UI.openEditVen('${v.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          <button title="Hapus" class="danger" onclick="MD_UI.confirmDelete('penyedia','${v.id}','${v.nama.replace(/'/g, "")}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
        </div></td>
      </tr>`).join("") || `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:24px;">Belum ada data penyedia.</td></tr>`;
  }
  function openCreateVen() {
    editingVenId = null;
    el("venModalTitle").textContent = "Tambah Penyedia";
    el("venFormError").classList.remove("show");
    ["fVenNama", "fVenNpwp", "fVenKontak", "fVenAlamat"].forEach((id) => (el(id).value = ""));
    el("venModal").classList.add("show");
  }
  function openEditVen(id) {
    const v = vendors.find((x) => x.id === id);
    if (!v) return;
    editingVenId = id;
    el("venModalTitle").textContent = "Edit Penyedia";
    el("venFormError").classList.remove("show");
    el("fVenNama").value = v.nama;
    el("fVenNpwp").value = v.npwp || "";
    el("fVenKontak").value = v.kontak || "";
    el("fVenAlamat").value = v.alamat || "";
    el("venModal").classList.add("show");
  }
  async function saveVen() {
    const errBox = el("venFormError");
    errBox.classList.remove("show");
    const nama = el("fVenNama").value.trim();
    if (!nama) { errBox.textContent = "Nama penyedia wajib diisi."; errBox.classList.add("show"); return; }
    const payload = { nama, npwp: el("fVenNpwp").value.trim() || null, kontak: el("fVenKontak").value.trim() || null, alamat: el("fVenAlamat").value.trim() || null };
    try {
      if (editingVenId) {
        const updated = await DATA.updateVendor(profile, editingVenId, payload, vendors.find((v) => v.id === editingVenId));
        vendors = vendors.map((v) => (v.id === editingVenId ? updated : v));
      } else {
        const created = await DATA.quickCreateVendor(payload);
        vendors.push(created);
      }
      window.SIMPELBMD_UI.toast("Data penyedia berhasil disimpan.");
      el("venModal").classList.remove("show");
      renderPenyedia();
    } catch (e) {
      errBox.textContent = "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    }
  }

  // ================= JENIS BBM =================
  function renderFuel() {
    el("fuelTableBody").innerHTML = fuelTypes.map((f) => `<tr><td>${f.nama}</td><td>${f.satuan}</td></tr>`).join("") || `<tr><td colspan="2" style="text-align:center;color:var(--text-3);padding:24px;">Belum ada jenis BBM.</td></tr>`;
  }
  async function saveFuel() {
    const errBox = el("fuelFormError");
    errBox.classList.remove("show");
    const nama = el("fFuelNama").value.trim();
    const satuan = el("fFuelSatuan").value.trim() || "liter";
    if (!nama) { errBox.textContent = "Nama jenis BBM wajib diisi."; errBox.classList.add("show"); return; }
    try {
      const created = await DATA.createFuelType(profile, { nama, satuan });
      fuelTypes.push(created);
      window.SIMPELBMD_UI.toast("Jenis BBM berhasil ditambahkan.");
      el("fuelModal").classList.remove("show");
      renderFuel();
    } catch (e) {
      errBox.textContent = e.code === "23505" ? "Jenis BBM ini sudah ada." : "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    }
  }

  // ================= SATUAN =================
  function renderUnit() {
    el("unitTableBody").innerHTML = units.map((u) => `<tr><td>${u.nama}</td></tr>`).join("") || `<tr><td style="text-align:center;color:var(--text-3);padding:24px;">Belum ada satuan.</td></tr>`;
  }
  async function saveUnit() {
    const errBox = el("unitFormError");
    errBox.classList.remove("show");
    const nama = el("fUnitNama").value.trim();
    if (!nama) { errBox.textContent = "Nama satuan wajib diisi."; errBox.classList.add("show"); return; }
    try {
      const created = await DATA.createUnit(profile, nama);
      units.push(created);
      window.SIMPELBMD_UI.toast("Satuan berhasil ditambahkan.");
      el("unitModal").classList.remove("show");
      renderUnit();
    } catch (e) {
      errBox.textContent = e.code === "23505" ? "Satuan ini sudah ada." : "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    }
  }

  // ================= Konfirmasi nonaktif/hapus =================
  function confirmDelete(type, id, label) {
    deleteTarget = { type, id };
    el("deleteConfirmText").textContent = type === "rekening"
      ? `Rekening "${label}" akan dinonaktifkan dan tidak muncul lagi sebagai pilihan baru.`
      : `Penyedia "${label}" akan disembunyikan dari daftar namun tetap tersimpan untuk audit.`;
    el("deleteModal").classList.add("show");
  }
  async function doDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "rekening") {
        await DATA.deactivateAccount(profile, deleteTarget.id, accounts.find((a) => a.id === deleteTarget.id));
        accounts = accounts.map((a) => (a.id === deleteTarget.id ? { ...a, is_active: false } : a));
        renderRekening();
      } else {
        await DATA.softDeleteVendor(profile, deleteTarget.id, vendors.find((v) => v.id === deleteTarget.id));
        vendors = vendors.filter((v) => v.id !== deleteTarget.id);
        renderPenyedia();
      }
      window.SIMPELBMD_UI.toast("Data berhasil diperbarui.");
      el("deleteModal").classList.remove("show");
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memperbarui data: " + e.message, "bad");
    }
  }

  function bindEvents() {
    document.querySelectorAll(".chip-tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

    el("rekSearch").addEventListener("input", renderRekening);
    el("btnAddRek").addEventListener("click", openCreateRek);
    el("rekModalClose").addEventListener("click", () => el("rekModal").classList.remove("show"));
    el("rekCancelBtn").addEventListener("click", () => el("rekModal").classList.remove("show"));
    el("rekSaveBtn").addEventListener("click", saveRek);

    el("venSearch").addEventListener("input", renderPenyedia);
    el("btnAddVen").addEventListener("click", openCreateVen);
    el("venModalClose").addEventListener("click", () => el("venModal").classList.remove("show"));
    el("venCancelBtn").addEventListener("click", () => el("venModal").classList.remove("show"));
    el("venSaveBtn").addEventListener("click", saveVen);

    el("btnAddFuel").addEventListener("click", () => { el("fFuelNama").value = ""; el("fFuelSatuan").value = "liter"; el("fuelFormError").classList.remove("show"); el("fuelModal").classList.add("show"); });
    el("fuelModalClose").addEventListener("click", () => el("fuelModal").classList.remove("show"));
    el("fuelCancelBtn").addEventListener("click", () => el("fuelModal").classList.remove("show"));
    el("fuelSaveBtn").addEventListener("click", saveFuel);

    el("btnAddUnit").addEventListener("click", () => { el("fUnitNama").value = ""; el("unitFormError").classList.remove("show"); el("unitModal").classList.add("show"); });
    el("unitModalClose").addEventListener("click", () => el("unitModal").classList.remove("show"));
    el("unitCancelBtn").addEventListener("click", () => el("unitModal").classList.remove("show"));
    el("unitSaveBtn").addEventListener("click", saveUnit);

    el("deleteCancelBtn").addEventListener("click", () => el("deleteModal").classList.remove("show"));
    el("deleteConfirmBtn").addEventListener("click", doDelete);
  }

  window.MD_UI = { openEditRek, openEditVen, confirmDelete };
  boot();
})();
