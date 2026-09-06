/* ==========================================================================
   SIMPELBMD — Modul Pemeliharaan (Kendaraan & Peralatan)
   ========================================================================== */
(() => {
  let profile = null;
  let vehicles = [];
  let equipmentList = [];
  let vendors = [];
  let accounts = [];
  let kendList = [];
  let alatList = [];
  let editingKendId = null;
  let editingAlatId = null;
  let editingEqId = null;
  let deleteTarget = null;

  const el = (id) => document.getElementById(id);
  const money = (n) => window.SIMPELBMD_UI.formatRupiah(n);
  const tgl = (d) => window.SIMPELBMD_UI.formatTanggal(d);

  async function boot() {
    profile = await window.SIMPELBMD_UI.bootstrapPage();
    if (!profile) return;
    [vehicles, equipmentList, vendors, accounts] = await Promise.all([
      DATA.listVehicles(), DATA.listEquipment(), DATA.listVendors(), DATA.listAccounts(),
    ]);
    el("kendFilterVehicle").innerHTML += vehicles.map((v) => `<option value="${v.id}">${v.nomor_polisi}</option>`).join("");
    bindEvents();
    await Promise.all([loadKend(), loadAlat()]);
  }

  function switchTab(tab) {
    el("tabKend").style.display = tab === "kend" ? "block" : "none";
    el("tabAlat").style.display = tab === "alat" ? "block" : "none";
    el("tabKendBtn").classList.toggle("active", tab === "kend");
    el("tabAlatBtn").classList.toggle("active", tab === "alat");
  }

  // ================= PEMELIHARAAN KENDARAAN =================
  async function loadKend() {
    try {
      kendList = await DATA.listMaintenanceVehicle({ search: el("kendSearch").value.trim() || null, vehicleId: el("kendFilterVehicle").value || null });
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat data pemeliharaan: " + e.message, "bad");
      kendList = [];
    }
    renderKend();
  }

  function renderKend() {
    el("kpiKendBiaya").textContent = money(kendList.reduce((s, k) => s + Number(k.total || 0), 0));
    el("kpiKendJumlah").textContent = kendList.length;
    el("kpiKendUnik").textContent = new Set(kendList.map((k) => k.vehicle_id)).size;

    el("kendEmptyState").style.display = kendList.length ? "none" : "block";
    document.querySelectorAll("#tabKend .table-scroll")[0].style.display = kendList.length ? "block" : "none";

    el("kendTableBody").innerHTML = kendList.map((k) => `
      <tr>
        <td>${k.nomor_transaksi}</td>
        <td>${tgl(k.tanggal)}</td>
        <td>${k.vehicles?.nomor_polisi || "-"}</td>
        <td>${k.jenis_pekerjaan || k.jenis_pemeliharaan}</td>
        <td>${k.vendors?.nama || "-"}</td>
        <td>${k.kilometer ?? "-"}</td>
        <td class="cell-num">${money(k.total)}</td>
        <td>
          <div class="action-icons">
            <button title="Edit" onclick="PML_UI.openEditKend('${k.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            <button title="Hapus" class="danger" onclick="PML_UI.confirmDelete('kend','${k.id}','${k.nomor_transaksi.replace(/'/g, "")}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function vehicleOptionsHtml(selectedId) {
    return `<option value="">Pilih kendaraan…</option>` + vehicles.map((v) => `<option value="${v.id}" ${v.id === selectedId ? "selected" : ""}>${v.nomor_polisi} — ${v.merk || ""}</option>`).join("");
  }
  function vendorOptionsHtml(selectedId) {
    return `<option value="">Pilih penyedia…</option>` + vendors.map((v) => `<option value="${v.id}" ${v.id === selectedId ? "selected" : ""}>${v.nama}</option>`).join("") + `<option value="__new__">+ Tambah penyedia baru…</option>`;
  }
  function accountOptionsHtml(selectedId) {
    return `<option value="">Pilih rekening…</option>` + accounts.map((a) => `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${a.kode} — ${a.uraian}</option>`).join("") + `<option value="__new__">+ Tambah rekening baru…</option>`;
  }
  function equipmentOptionsHtml(selectedId) {
    return `<option value="">Pilih peralatan…</option>` + equipmentList.map((e) => `<option value="${e.id}" ${e.id === selectedId ? "selected" : ""}>${e.nomor_aset} — ${e.nama}</option>`).join("");
  }

  function recalcKendTotal() {
    const v = parseFloat(el("fKendVolume").value) || 0;
    const h = parseFloat(el("fKendHarga").value) || 0;
    const j = parseFloat(el("fKendJasa").value) || 0;
    el("fKendTotal").value = money(v * h + j);
  }

  async function openCreateKend() {
    editingKendId = null;
    el("kendModalTitle").textContent = "Tambah Pemeliharaan Kendaraan";
    el("kendFormError").classList.remove("show");
    el("fKendVehicle").innerHTML = vehicleOptionsHtml();
    el("fKendVendor").innerHTML = vendorOptionsHtml();
    el("fKendAccount").innerHTML = accountOptionsHtml();
    el("fKendTanggal").value = new Date().toISOString().slice(0, 10);
    el("fKendJenisPem").value = "Servis berkala";
    ["fKendJenisKerja", "fKendSukuCadang", "fKendKm", "fKendSatuan", "fKendNota", "fKendSpk", "fKendKeterangan"].forEach((id) => (el(id).value = ""));
    el("fKendVolume").value = 1;
    el("fKendHarga").value = "";
    el("fKendJasa").value = 0;
    recalcKendTotal();
    el("fKendNomor").value = await DATA.nextNomorPemeliharaan();
    el("kendModal").classList.add("show");
  }

  function openEditKend(id) {
    const k = kendList.find((x) => x.id === id);
    if (!k) return;
    editingKendId = id;
    el("kendModalTitle").textContent = "Edit Pemeliharaan Kendaraan";
    el("kendFormError").classList.remove("show");
    el("fKendVehicle").innerHTML = vehicleOptionsHtml(k.vehicle_id);
    el("fKendVendor").innerHTML = vendorOptionsHtml(k.vendor_id);
    el("fKendAccount").innerHTML = accountOptionsHtml(k.account_id);
    el("fKendNomor").value = k.nomor_transaksi;
    el("fKendTanggal").value = k.tanggal;
    el("fKendKm").value = k.kilometer ?? "";
    el("fKendJenisPem").value = k.jenis_pemeliharaan;
    el("fKendJenisKerja").value = k.jenis_pekerjaan || "";
    el("fKendSukuCadang").value = k.suku_cadang || "";
    el("fKendVolume").value = k.volume ?? 1;
    el("fKendSatuan").value = k.satuan || "";
    el("fKendHarga").value = k.harga ?? "";
    el("fKendJasa").value = k.jasa ?? 0;
    recalcKendTotal();
    el("fKendNota").value = k.nomor_nota || "";
    el("fKendSpk").value = k.nomor_spk || "";
    el("fKendKeterangan").value = k.keterangan || "";
    el("kendModal").classList.add("show");
  }

  async function saveKend() {
    const errBox = el("kendFormError");
    errBox.classList.remove("show");
    const vehicle_id = el("fKendVehicle").value;
    const nomor_transaksi = el("fKendNomor").value.trim();
    const tanggal = el("fKendTanggal").value;
    if (!vehicle_id || !nomor_transaksi || !tanggal) {
      errBox.textContent = "Kendaraan, Nomor Transaksi, dan Tanggal wajib diisi.";
      errBox.classList.add("show");
      return;
    }
    const payload = {
      vehicle_id, nomor_transaksi, tanggal,
      kilometer: parseFloat(el("fKendKm").value) || null,
      jenis_pemeliharaan: el("fKendJenisPem").value,
      jenis_pekerjaan: el("fKendJenisKerja").value.trim() || null,
      suku_cadang: el("fKendSukuCadang").value.trim() || null,
      volume: parseFloat(el("fKendVolume").value) || 1,
      satuan: el("fKendSatuan").value.trim() || null,
      harga: parseFloat(el("fKendHarga").value) || 0,
      jasa: parseFloat(el("fKendJasa").value) || 0,
      vendor_id: el("fKendVendor").value || null,
      account_id: el("fKendAccount").value || null,
      nomor_nota: el("fKendNota").value.trim() || null,
      nomor_spk: el("fKendSpk").value.trim() || null,
      keterangan: el("fKendKeterangan").value.trim() || null,
    };
    const btn = el("kendSaveBtn");
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Menyimpan…';
    try {
      if (editingKendId) await DATA.updateMaintenanceVehicle(profile, editingKendId, payload, kendList.find((k) => k.id === editingKendId));
      else await DATA.createMaintenanceVehicle(profile, payload);
      window.SIMPELBMD_UI.toast("Data pemeliharaan berhasil disimpan.");
      el("kendModal").classList.remove("show");
      await loadKend();
    } catch (e) {
      errBox.textContent = "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    } finally {
      btn.disabled = false; btn.textContent = "Simpan Pemeliharaan";
    }
  }

  function exportKend() {
    if (!kendList.length) { window.SIMPELBMD_UI.toast("Tidak ada data untuk diekspor.", "warn"); return; }
    const rows = kendList.map((k) => ({
      "No. Transaksi": k.nomor_transaksi, "Tanggal": tgl(k.tanggal), "Nopol": k.vehicles?.nomor_polisi || "-",
      "Jenis Pekerjaan": k.jenis_pekerjaan || k.jenis_pemeliharaan, "Bengkel": k.vendors?.nama || "-",
      "Kilometer": k.kilometer ?? "-", "Total": k.total,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PemeliharaanKendaraan");
    XLSX.writeFile(wb, `PemeliharaanKendaraan.xlsx`);
  }

  // ================= PEMELIHARAAN PERALATAN =================
  async function loadAlat() {
    try {
      alatList = await DATA.listMaintenanceEquipment({ search: el("alatSearch").value.trim() || null });
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat data pemeliharaan peralatan: " + e.message, "bad");
      alatList = [];
    }
    renderAlat();
  }

  function renderAlat() {
    el("kpiAlatBiaya").textContent = money(alatList.reduce((s, a) => s + Number(a.biaya || 0), 0));
    el("kpiAlatJumlah").textContent = alatList.length;
    el("kpiAlatMaster").textContent = equipmentList.length;

    el("alatEmptyState").style.display = alatList.length ? "none" : "block";
    document.querySelectorAll("#tabAlat .table-scroll")[0].style.display = alatList.length ? "block" : "none";

    el("alatTableBody").innerHTML = alatList.map((a) => `
      <tr>
        <td>${a.nomor_transaksi}</td>
        <td>${tgl(a.tanggal)}</td>
        <td>${a.equipment?.nama || "-"}</td>
        <td>${a.jenis_pekerjaan || "-"}</td>
        <td>${a.vendors?.nama || "-"}</td>
        <td class="cell-num">${money(a.biaya)}</td>
        <td>
          <div class="action-icons">
            <button title="Edit" onclick="PML_UI.openEditAlat('${a.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            <button title="Hapus" class="danger" onclick="PML_UI.confirmDelete('alat','${a.id}','${a.nomor_transaksi.replace(/'/g, "")}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  async function openCreateAlat() {
    editingAlatId = null;
    el("alatModalTitle").textContent = "Tambah Pemeliharaan Peralatan";
    el("alatFormError").classList.remove("show");
    el("fAlatEquipment").innerHTML = equipmentOptionsHtml();
    el("fAlatVendor").innerHTML = vendorOptionsHtml();
    el("fAlatAccount").innerHTML = accountOptionsHtml();
    el("fAlatTanggal").value = new Date().toISOString().slice(0, 10);
    el("fAlatJenisKerja").value = "";
    el("fAlatBiaya").value = "";
    el("fAlatKeterangan").value = "";
    el("fAlatNomor").value = await DATA.nextNomorPemeliharaanPeralatan();
    el("alatModal").classList.add("show");
  }

  function openEditAlat(id) {
    const a = alatList.find((x) => x.id === id);
    if (!a) return;
    editingAlatId = id;
    el("alatModalTitle").textContent = "Edit Pemeliharaan Peralatan";
    el("alatFormError").classList.remove("show");
    el("fAlatEquipment").innerHTML = equipmentOptionsHtml(a.equipment_id);
    el("fAlatVendor").innerHTML = vendorOptionsHtml(a.vendor_id);
    el("fAlatAccount").innerHTML = accountOptionsHtml(a.account_id);
    el("fAlatNomor").value = a.nomor_transaksi;
    el("fAlatTanggal").value = a.tanggal;
    el("fAlatJenisKerja").value = a.jenis_pekerjaan || "";
    el("fAlatBiaya").value = a.biaya ?? "";
    el("fAlatKeterangan").value = a.keterangan || "";
    el("alatModal").classList.add("show");
  }

  async function saveAlat() {
    const errBox = el("alatFormError");
    errBox.classList.remove("show");
    const equipment_id = el("fAlatEquipment").value;
    const nomor_transaksi = el("fAlatNomor").value.trim();
    const tanggal = el("fAlatTanggal").value;
    if (!equipment_id || !nomor_transaksi || !tanggal) {
      errBox.textContent = "Peralatan, Nomor Transaksi, dan Tanggal wajib diisi.";
      errBox.classList.add("show");
      return;
    }
    const payload = {
      equipment_id, nomor_transaksi, tanggal,
      jenis_pekerjaan: el("fAlatJenisKerja").value.trim() || null,
      vendor_id: el("fAlatVendor").value || null,
      account_id: el("fAlatAccount").value || null,
      biaya: parseFloat(el("fAlatBiaya").value) || 0,
      keterangan: el("fAlatKeterangan").value.trim() || null,
    };
    const btn = el("alatSaveBtn");
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Menyimpan…';
    try {
      if (editingAlatId) await DATA.updateMaintenanceEquipment(profile, editingAlatId, payload, alatList.find((a) => a.id === editingAlatId));
      else await DATA.createMaintenanceEquipment(profile, payload);
      window.SIMPELBMD_UI.toast("Data pemeliharaan berhasil disimpan.");
      el("alatModal").classList.remove("show");
      await loadAlat();
    } catch (e) {
      errBox.textContent = "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    } finally {
      btn.disabled = false; btn.textContent = "Simpan Pemeliharaan";
    }
  }

  function exportAlat() {
    if (!alatList.length) { window.SIMPELBMD_UI.toast("Tidak ada data untuk diekspor.", "warn"); return; }
    const rows = alatList.map((a) => ({
      "No. Transaksi": a.nomor_transaksi, "Tanggal": tgl(a.tanggal), "Peralatan": a.equipment?.nama || "-",
      "Jenis Pekerjaan": a.jenis_pekerjaan || "-", "Penyedia": a.vendors?.nama || "-", "Biaya": a.biaya,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PemeliharaanPeralatan");
    XLSX.writeFile(wb, `PemeliharaanPeralatan.xlsx`);
  }

  // ================= MASTER PERALATAN (dalam modal) =================
  function renderEqTable() {
    el("eqTableBody").innerHTML = equipmentList.map((e) => `
      <tr>
        <td>${e.nomor_aset}</td><td>${e.nama}</td><td>${[e.merk, e.tipe].filter(Boolean).join(" / ") || "-"}</td>
        <td>${e.lokasi || "-"}</td><td>${e.kondisi || "-"}</td>
        <td>
          <div class="action-icons">
            <button title="Edit" onclick="PML_UI.openEditEquipment('${e.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            <button title="Hapus" class="danger" onclick="PML_UI.confirmDelete('equipment','${e.id}','${e.nama.replace(/'/g, "")}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function openEquipmentManager() {
    editingEqId = null;
    clearEqForm();
    renderEqTable();
    el("equipmentModal").classList.add("show");
  }

  function clearEqForm() {
    ["fEqNomor", "fEqNama", "fEqLokasi", "fEqMerk", "fEqTipe", "fEqTahun", "fEqKondisi"].forEach((id) => (el(id).value = ""));
    el("equipFormError").classList.remove("show");
  }

  function openEditEquipment(id) {
    const e = equipmentList.find((x) => x.id === id);
    if (!e) return;
    editingEqId = id;
    el("fEqNomor").value = e.nomor_aset;
    el("fEqNama").value = e.nama;
    el("fEqLokasi").value = e.lokasi || "";
    el("fEqMerk").value = e.merk || "";
    el("fEqTipe").value = e.tipe || "";
    el("fEqTahun").value = e.tahun || "";
    el("fEqKondisi").value = e.kondisi || "";
    el("eqAddBtn").textContent = "Simpan Perubahan";
  }

  async function saveEquipment() {
    const errBox = el("equipFormError");
    errBox.classList.remove("show");
    const nomor_aset = el("fEqNomor").value.trim();
    const nama = el("fEqNama").value.trim();
    if (!nomor_aset || !nama) { errBox.textContent = "Nomor Aset dan Nama Peralatan wajib diisi."; errBox.classList.add("show"); return; }
    const payload = {
      nomor_aset, nama, lokasi: el("fEqLokasi").value.trim() || null,
      merk: el("fEqMerk").value.trim() || null, tipe: el("fEqTipe").value.trim() || null,
      tahun: parseInt(el("fEqTahun").value, 10) || null, kondisi: el("fEqKondisi").value.trim() || null,
    };
    try {
      if (editingEqId) {
        const updated = await DATA.updateEquipment(profile, editingEqId, payload, equipmentList.find((e) => e.id === editingEqId));
        equipmentList = equipmentList.map((e) => (e.id === editingEqId ? updated : e));
      } else {
        const created = await DATA.createEquipment(profile, payload);
        equipmentList.push(created);
      }
      window.SIMPELBMD_UI.toast("Data peralatan berhasil disimpan.");
      editingEqId = null;
      clearEqForm();
      el("eqAddBtn").textContent = "+ Tambah Peralatan";
      renderEqTable();
    } catch (e) {
      errBox.textContent = e.code === "23505" ? "Nomor aset sudah digunakan." : "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    }
  }

  // ================= SMART IMPORT: MASTER PERALATAN =================
  function openImportEquipment() {
    SmartImport.open({
      title: "Import Master Peralatan",
      description: "Unggah daftar peralatan/perlengkapan. Kolom akan dideteksi otomatis.",
      fields: [
        { key: "nomor_aset", label: "Nomor Aset", aliases: ["no aset", "kode aset", "asset number", "kode barang"], required: true, type: "text" },
        { key: "nama", label: "Nama Peralatan", aliases: ["nama barang", "nama alat", "item name"], required: true, type: "text" },
        { key: "merk", label: "Merk", aliases: ["brand"], required: false, type: "text" },
        { key: "tipe", label: "Tipe", aliases: ["model"], required: false, type: "text" },
        { key: "tahun", label: "Tahun", aliases: ["tahun perolehan", "year"], required: false, type: "number" },
        { key: "lokasi", label: "Lokasi", aliases: ["ruangan", "location"], required: false, type: "text" },
        { key: "kondisi", label: "Kondisi", aliases: ["condition"], required: false, type: "text" },
      ],
      onImport: async (rows) => {
        const imported = await DATA.bulkUpsertEquipment(profile, rows);
        imported.forEach((eq) => {
          const idx = equipmentList.findIndex((x) => x.id === eq.id);
          if (idx >= 0) equipmentList[idx] = eq; else equipmentList.push(eq);
        });
      },
      afterImport: () => { equipmentList.sort((a, b) => a.nama.localeCompare(b.nama)); renderEqTable(); },
    });
  }

  // ================= Konfirmasi hapus (shared) =================
  function confirmDelete(type, id, label) {
    deleteTarget = { type, id };
    el("deleteConfirmText").textContent = `Data "${label}" akan disembunyikan dari daftar namun tetap tersimpan untuk audit.`;
    el("deleteModal").classList.add("show");
  }
  async function doDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "kend") { await DATA.softDeleteMaintenanceVehicle(profile, deleteTarget.id, kendList.find((k) => k.id === deleteTarget.id)); await loadKend(); }
      if (deleteTarget.type === "alat") { await DATA.softDeleteMaintenanceEquipment(profile, deleteTarget.id, alatList.find((a) => a.id === deleteTarget.id)); await loadAlat(); }
      if (deleteTarget.type === "equipment") {
        await DATA.softDeleteEquipment(profile, deleteTarget.id, equipmentList.find((e) => e.id === deleteTarget.id));
        equipmentList = equipmentList.filter((e) => e.id !== deleteTarget.id);
        renderEqTable();
      }
      window.SIMPELBMD_UI.toast("Data berhasil dihapus.");
      el("deleteModal").classList.remove("show");
    } catch (e) {
      window.SIMPELBMD_UI.toast("Data tidak dapat dihapus: " + e.message, "bad");
    }
  }

  // ================= Quick add: rekening & penyedia (dipakai kedua tab) =================
  let pendingAccountTarget = null;
  let pendingVendorTarget = null;
  async function saveNewAccount() {
    const kode = el("newAccKode").value.trim();
    const uraian = el("newAccUraian").value.trim();
    if (!kode || !uraian) { window.SIMPELBMD_UI.toast("Kode dan uraian rekening wajib diisi.", "warn"); return; }
    try {
      const created = await DATA.quickCreateAccount({ kode, uraian, jenis_belanja: el("newAccJenis").value.trim() });
      accounts.push(created); accounts.sort((a, b) => a.kode.localeCompare(b.kode));
      if (pendingAccountTarget) el(pendingAccountTarget).innerHTML = accountOptionsHtml(created.id);
      window.SIMPELBMD_UI.toast("Rekening baru berhasil ditambahkan.");
      el("accountModal").classList.remove("show");
    } catch (e) { window.SIMPELBMD_UI.toast("Gagal menambah rekening: " + e.message, "bad"); }
  }
  async function saveNewVendor() {
    const nama = el("newVendorNama").value.trim();
    if (!nama) { window.SIMPELBMD_UI.toast("Nama penyedia wajib diisi.", "warn"); return; }
    try {
      const created = await DATA.quickCreateVendor({ nama });
      vendors.push(created);
      if (pendingVendorTarget) el(pendingVendorTarget).innerHTML = vendorOptionsHtml(created.id);
      window.SIMPELBMD_UI.toast("Penyedia baru berhasil ditambahkan.");
      el("vendorModal").classList.remove("show");
    } catch (e) { window.SIMPELBMD_UI.toast("Gagal menambah penyedia: " + e.message, "bad"); }
  }

  function bindEvents() {
    el("tabKendBtn").addEventListener("click", () => switchTab("kend"));
    el("tabAlatBtn").addEventListener("click", () => switchTab("alat"));

    el("kendSearch").addEventListener("input", debounce(loadKend, 350));
    el("kendFilterVehicle").addEventListener("change", loadKend);
    el("btnAddKend").addEventListener("click", openCreateKend);
    el("kendEmptyAddBtn").addEventListener("click", openCreateKend);
    el("kendModalClose").addEventListener("click", () => el("kendModal").classList.remove("show"));
    el("kendCancelBtn").addEventListener("click", () => el("kendModal").classList.remove("show"));
    el("kendSaveBtn").addEventListener("click", saveKend);
    ["fKendVolume", "fKendHarga", "fKendJasa"].forEach((id) => el(id).addEventListener("input", recalcKendTotal));
    el("btnExportKend").addEventListener("click", exportKend);
    el("fKendVendor").addEventListener("change", (e) => { if (e.target.value === "__new__") { e.target.value = ""; pendingVendorTarget = "fKendVendor"; el("vendorModal").classList.add("show"); } });
    el("fKendAccount").addEventListener("change", (e) => { if (e.target.value === "__new__") { e.target.value = ""; pendingAccountTarget = "fKendAccount"; el("accountModal").classList.add("show"); } });

    el("alatSearch").addEventListener("input", debounce(loadAlat, 350));
    el("btnAddAlat").addEventListener("click", openCreateAlat);
    el("alatEmptyAddBtn").addEventListener("click", openCreateAlat);
    el("alatModalClose").addEventListener("click", () => el("alatModal").classList.remove("show"));
    el("alatCancelBtn").addEventListener("click", () => el("alatModal").classList.remove("show"));
    el("alatSaveBtn").addEventListener("click", saveAlat);
    el("btnExportAlat").addEventListener("click", exportAlat);
    el("fAlatVendor").addEventListener("change", (e) => { if (e.target.value === "__new__") { e.target.value = ""; pendingVendorTarget = "fAlatVendor"; el("vendorModal").classList.add("show"); } });
    el("fAlatAccount").addEventListener("change", (e) => { if (e.target.value === "__new__") { e.target.value = ""; pendingAccountTarget = "fAlatAccount"; el("accountModal").classList.add("show"); } });

    el("btnManageEquipment").addEventListener("click", openEquipmentManager);
    el("equipmentModalClose").addEventListener("click", () => el("equipmentModal").classList.remove("show"));
    el("equipmentDoneBtn").addEventListener("click", () => { el("equipmentModal").classList.remove("show"); renderAlat(); });
    el("eqAddBtn").addEventListener("click", saveEquipment);
    el("eqImportBtn").addEventListener("click", openImportEquipment);

    el("accountModalClose").addEventListener("click", () => el("accountModal").classList.remove("show"));
    el("accountCancelBtn").addEventListener("click", () => el("accountModal").classList.remove("show"));
    el("accountSaveBtn").addEventListener("click", saveNewAccount);
    el("vendorModalClose").addEventListener("click", () => el("vendorModal").classList.remove("show"));
    el("vendorCancelBtn").addEventListener("click", () => el("vendorModal").classList.remove("show"));
    el("vendorSaveBtn").addEventListener("click", saveNewVendor);

    el("deleteCancelBtn").addEventListener("click", () => el("deleteModal").classList.remove("show"));
    el("deleteConfirmBtn").addEventListener("click", doDelete);
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  window.PML_UI = { openEditKend, openEditAlat, openEditEquipment, confirmDelete };
  boot();
})();
