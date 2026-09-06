/* ==========================================================================
   SIMPELBMD — Modul Distribusi BBM (Master Kendaraan & Kupon)
   ========================================================================== */
(() => {
  let profile = null;
  let fuelTypes = [];
  let vehicles = [];
  let kuponList = [];
  let categoryRates = [];
  let editingKendId = null;
  let editingKuponId = null;
  let confirmAction = null;

  const el = (id) => document.getElementById(id);
  const money = (n) => window.SIMPELBMD_UI.formatRupiah(n);
  const tgl = (d) => window.SIMPELBMD_UI.formatTanggal(d);

  const STATUS_KEND_BADGE = { aktif: "badge-ok", pemeliharaan: "badge-warn", rusak: "badge-bad", tidak_digunakan: "badge-info", dihapuskan: "badge-bad" };
  const STATUS_KEND_LABEL = { aktif: "Aktif", pemeliharaan: "Pemeliharaan", rusak: "Rusak", tidak_digunakan: "Tidak Digunakan", dihapuskan: "Dihapuskan" };
  const STATUS_KUPON_LABEL = { dibuat: "Dibuat", didistribusikan: "Didistribusikan", digunakan: "Digunakan", direalisasikan: "Direalisasikan", dibatalkan: "Dibatalkan" };
  const STATUS_KUPON_BADGE = { dibuat: "badge-info", didistribusikan: "badge-warn", digunakan: "badge-warn", direalisasikan: "badge-ok", dibatalkan: "badge-bad" };
  const STATUS_FLOW = { dibuat: "didistribusikan", didistribusikan: "digunakan", digunakan: "direalisasikan" };

  async function boot() {
    profile = await window.SIMPELBMD_UI.bootstrapPage();
    if (!profile) return;
    fuelTypes = await DATA.listFuelTypes();
    try { categoryRates = await DATA.listVehicleCategoryRates(DATA.ctx().fiscalYear); } catch (e) { categoryRates = []; }
    bindEvents();
    await Promise.all([loadKendaraan(), loadKupon()]);
  }

  function switchTab(tab) {
    el("tabKendaraan").style.display = tab === "kend" ? "block" : "none";
    el("tabKupon").style.display = tab === "kupon" ? "block" : "none";
    el("tabKendaraanBtn").classList.toggle("active", tab === "kend");
    el("tabKuponBtn").classList.toggle("active", tab === "kupon");
  }

  // ================= MASTER KENDARAAN =================
  async function loadKendaraan() {
    try {
      vehicles = await DATA.listVehicles({ search: el("kendSearch").value.trim() || null });
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat data kendaraan: " + e.message, "bad");
      vehicles = [];
    }
    renderKendaraan();
  }

  function renderKendaraan() {
    el("kendEmptyState").style.display = vehicles.length ? "none" : "block";
    document.querySelectorAll("#tabKendaraan .table-scroll")[0].style.display = vehicles.length ? "block" : "none";

    el("kendTableBody").innerHTML = vehicles.map((v) => `
      <tr>
        <td>${v.nomor_polisi}</td>
        <td>${[v.merk, v.tipe].filter(Boolean).join(" / ") || "-"}</td>
        <td>${v.tahun || "-"}</td>
        <td>${v.kategori ? `<span class="badge badge-info">${v.kategori}</span>` : '<span class="text-muted">-</span>'}</td>
        <td>${fuelTypes.find((f) => f.id === v.fuel_type_id)?.nama || "-"}</td>
        <td>${v.unit_pengguna || "-"}</td>
        <td><span class="badge ${STATUS_KEND_BADGE[v.status]}">${STATUS_KEND_LABEL[v.status]}</span></td>
        <td>
          <div class="action-icons">
            <button title="Edit" onclick="BBM_UI.openEditKend('${v.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            <button title="Hapus" class="danger" onclick="BBM_UI.deleteKend('${v.id}','${v.nomor_polisi}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function fuelOptionsHtml(selectedId) {
    return `<option value="">Pilih jenis BBM…</option>` + fuelTypes.map((f) => `<option value="${f.id}" ${f.id === selectedId ? "selected" : ""}>${f.nama}</option>`).join("");
  }

  function openCreateKend() {
    editingKendId = null;
    el("kendModalTitle").textContent = "Tambah Kendaraan";
    el("kendFormError").classList.remove("show");
    ["fKendNopol", "fKendJenis", "fKendMerk", "fKendTipe", "fKendTahun", "fKendKapasitas", "fKendUnit", "fKendPJ"].forEach((id) => (el(id).value = ""));
    el("fKendFuelType").innerHTML = fuelOptionsHtml();
    el("fKendKategori").value = "";
    el("fKendStatus").value = "aktif";
    el("kendModal").classList.add("show");
  }

  function openEditKend(id) {
    const v = vehicles.find((x) => x.id === id);
    if (!v) return;
    editingKendId = id;
    el("kendModalTitle").textContent = "Edit Kendaraan";
    el("kendFormError").classList.remove("show");
    el("fKendNopol").value = v.nomor_polisi;
    el("fKendJenis").value = v.jenis_kendaraan || "";
    el("fKendMerk").value = v.merk || "";
    el("fKendTipe").value = v.tipe || "";
    el("fKendTahun").value = v.tahun || "";
    el("fKendFuelType").innerHTML = fuelOptionsHtml(v.fuel_type_id);
    el("fKendKategori").value = v.kategori || "";
    el("fKendKapasitas").value = v.kapasitas_mesin || "";
    el("fKendUnit").value = v.unit_pengguna || "";
    el("fKendPJ").value = v.penanggung_jawab || "";
    el("fKendStatus").value = v.status;
    el("kendModal").classList.add("show");
  }

  async function saveKendaraan() {
    const errBox = el("kendFormError");
    errBox.classList.remove("show");
    const nomor_polisi = el("fKendNopol").value.trim();
    if (!nomor_polisi) { errBox.textContent = "Nomor Polisi wajib diisi."; errBox.classList.add("show"); return; }

    const payload = {
      nomor_polisi, jenis_kendaraan: el("fKendJenis").value.trim() || null,
      merk: el("fKendMerk").value.trim() || null, tipe: el("fKendTipe").value.trim() || null,
      tahun: parseInt(el("fKendTahun").value, 10) || null,
      fuel_type_id: el("fKendFuelType").value || null,
      kategori: el("fKendKategori").value || null,
      kapasitas_mesin: el("fKendKapasitas").value.trim() || null,
      unit_pengguna: el("fKendUnit").value.trim() || null,
      penanggung_jawab: el("fKendPJ").value.trim() || null,
      status: el("fKendStatus").value,
    };

    const btn = el("kendSaveBtn");
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Menyimpan…';
    try {
      if (editingKendId) await DATA.updateVehicle(profile, editingKendId, payload, vehicles.find((v) => v.id === editingKendId));
      else await DATA.createVehicle(profile, payload);
      window.SIMPELBMD_UI.toast("Data kendaraan berhasil disimpan.");
      el("kendModal").classList.remove("show");
      await loadKendaraan();
    } catch (e) {
      errBox.textContent = e.code === "23505" ? "Nomor polisi sudah terdaftar." : "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    } finally {
      btn.disabled = false; btn.textContent = "Simpan Kendaraan";
    }
  }

  function deleteKend(id, nopol) {
    confirmAction = { type: "delete_kend", id };
    el("confirmTitle").textContent = "Hapus kendaraan?";
    el("confirmText").textContent = `Kendaraan "${nopol}" akan disembunyikan dari daftar namun tetap tersimpan untuk audit.`;
    el("confirmActionBtn").textContent = "Ya, Hapus";
    el("confirmModal").classList.add("show");
  }

  // ================= SMART IMPORT: MASTER KENDARAAN =================
  function openImportKendaraan() {
    SmartImport.open({
      title: "Import Master Kendaraan",
      description: "Unggah daftar kendaraan dinas. Kolom akan dideteksi otomatis, jenis BBM bisa dilengkapi setelah import.",
      fields: [
        { key: "nomor_polisi", label: "Nomor Polisi", aliases: ["nopol", "no polisi", "plat nomor", "license plate"], required: true, type: "text" },
        { key: "merk", label: "Merk", aliases: ["brand"], required: false, type: "text" },
        { key: "tipe", label: "Tipe", aliases: ["model", "type"], required: false, type: "text" },
        { key: "tahun", label: "Tahun", aliases: ["tahun pembuatan", "year"], required: false, type: "number" },
        { key: "jenis_kendaraan", label: "Jenis Kendaraan", aliases: ["jenis", "tipe kendaraan"], required: false, type: "text" },
        { key: "kategori", label: "Kategori", aliases: ["kategori kendaraan", "klasifikasi", "golongan"], required: false, type: "text" },
        { key: "unit_pengguna", label: "Unit Pengguna", aliases: ["unit", "bidang", "opd"], required: false, type: "text" },
        { key: "penanggung_jawab", label: "Penanggung Jawab", aliases: ["pj", "pic", "person in charge"], required: false, type: "text" },
      ],
      onImport: async (rows) => {
        const imported = await DATA.bulkUpsertVehicles(profile, rows);
        imported.forEach((v) => {
          const idx = vehicles.findIndex((x) => x.id === v.id);
          if (idx >= 0) vehicles[idx] = v; else vehicles.push(v);
        });
      },
      afterImport: () => { vehicles.sort((a, b) => a.nomor_polisi.localeCompare(b.nomor_polisi)); renderKendaraan(); },
    });
  }

  // ================= KUPON BBM =================
  async function loadKupon() {
    try {
      kuponList = await DATA.listFuelCoupons({ search: el("kuponSearch").value.trim() || null, status: el("kuponFilterStatus").value || null });
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat kupon BBM: " + e.message, "bad");
      kuponList = [];
    }
    renderKupon();
  }

  function renderKupon() {
    const active = kuponList.filter((k) => k.status !== "dibatalkan");
    el("kpiKuponVolume").textContent = active.reduce((s, k) => s + Number(k.volume || 0), 0).toLocaleString("id-ID") + " L";
    el("kpiKuponNilai").textContent = money(active.reduce((s, k) => s + Number(k.nilai || 0), 0));
    el("kpiKuponPending").textContent = kuponList.filter((k) => ["dibuat", "didistribusikan"].includes(k.status)).length;
    el("kpiKuponDone").textContent = kuponList.filter((k) => k.status === "direalisasikan").length;

    el("kuponEmptyState").style.display = kuponList.length ? "none" : "block";
    document.querySelectorAll("#tabKupon .table-scroll")[0].style.display = kuponList.length ? "block" : "none";

    el("kuponTableBody").innerHTML = kuponList.map((k) => {
      const nextStatus = STATUS_FLOW[k.status];
      return `
      <tr>
        <td>${k.nomor_kupon}</td>
        <td>${tgl(k.tanggal)}</td>
        <td>${k.vehicles?.nomor_polisi || "-"}</td>
        <td>${k.fuel_types?.nama || "-"}</td>
        <td>${Number(k.volume).toLocaleString("id-ID")} L</td>
        <td class="cell-num">${money(k.nilai)}</td>
        <td>${k.kilometer_akhir ?? "-"}</td>
        <td><span class="badge ${STATUS_KUPON_BADGE[k.status]}">${STATUS_KUPON_LABEL[k.status]}</span></td>
        <td>
          <div class="action-icons">
            ${k.status === "dibuat" ? `<button title="Edit" onclick="BBM_UI.openEditKupon('${k.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>` : ""}
            ${nextStatus ? `<button title="Lanjutkan ke ${STATUS_KUPON_LABEL[nextStatus]}" onclick="BBM_UI.advanceStatus('${k.id}','${nextStatus}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></button>` : ""}
            ${k.status !== "direalisasikan" && k.status !== "dibatalkan" ? `<button title="Batalkan" class="danger" onclick="BBM_UI.cancelKupon('${k.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` : ""}
          </div>
        </td>
      </tr>`;
    }).join("");
  }

  function vehicleOptionsHtml(selectedId) {
    return `<option value="">Pilih kendaraan…</option>` + vehicles.filter((v) => v.status === "aktif" || v.id === selectedId).map((v) => `<option value="${v.id}" ${v.id === selectedId ? "selected" : ""}>${v.nomor_polisi} — ${v.merk || ""}</option>`).join("");
  }

  function applyAutoTarif() {
    const vehicleId = el("fKuponVehicle").value;
    const v = vehicles.find((x) => x.id === vehicleId);
    if (!v || !v.kategori) {
      window.SIMPELBMD_UI.toast("Pilih kendaraan dengan kategori terisi terlebih dahulu (atur di Master Kendaraan).", "warn");
      return;
    }
    const rate = categoryRates.find((r) => r.kategori === v.kategori);
    if (!rate) {
      window.SIMPELBMD_UI.toast(`Belum ada tarif untuk kategori "${v.kategori}" pada TA ${DATA.ctx().fiscalYear}.`, "warn");
      return;
    }
    el("fKuponNilai").value = rate.tarif_bulanan;
    window.SIMPELBMD_UI.toast(`Nilai diisi Rp${Number(rate.tarif_bulanan).toLocaleString("id-ID")}/bulan sesuai kategori ${v.kategori}. Rekening BBM: ${rate.accounts?.kode || "-"}.`);
  }

  async function openCreateKupon() {
    editingKuponId = null;
    el("kuponModalTitle").textContent = "Terbitkan Kupon BBM";
    el("kuponFormError").classList.remove("show");
    el("kuponWarnBox").innerHTML = "";
    if (!vehicles.length) vehicles = await DATA.listVehicles();
    el("fKuponVehicle").innerHTML = vehicleOptionsHtml();
    el("fKuponFuelType").innerHTML = fuelOptionsHtml();
    el("fKuponTanggal").value = new Date().toISOString().slice(0, 10);
    el("fKuponVolume").value = "";
    el("fKuponNilai").value = "";
    el("fKuponPetugas").value = "";
    el("fKuponKmAwal").value = "";
    el("fKuponKmAkhir").value = "";
    el("fKuponKeterangan").value = "";
    el("kuponFootNote").textContent = "";
    el("fKuponNomor").value = await DATA.nextNomorKupon();
    el("kuponModal").classList.add("show");
  }

  function openEditKupon(id) {
    const k = kuponList.find((x) => x.id === id);
    if (!k) return;
    editingKuponId = id;
    el("kuponModalTitle").textContent = "Edit Kupon BBM";
    el("kuponFormError").classList.remove("show");
    el("kuponWarnBox").innerHTML = "";
    el("fKuponVehicle").innerHTML = vehicleOptionsHtml(k.vehicle_id);
    el("fKuponFuelType").innerHTML = fuelOptionsHtml(k.fuel_type_id);
    el("fKuponNomor").value = k.nomor_kupon;
    el("fKuponTanggal").value = k.tanggal;
    el("fKuponVolume").value = k.volume;
    el("fKuponNilai").value = k.nilai;
    el("fKuponPetugas").value = k.petugas || "";
    el("fKuponKmAwal").value = k.kilometer_awal ?? "";
    el("fKuponKmAkhir").value = k.kilometer_akhir ?? "";
    el("fKuponKeterangan").value = k.keterangan || "";
    el("kuponFootNote").textContent = `Status: ${STATUS_KUPON_LABEL[k.status]}`;
    el("kuponModal").classList.add("show");
  }

  async function saveKupon() {
    const errBox = el("kuponFormError");
    const warnBox = el("kuponWarnBox");
    errBox.classList.remove("show"); warnBox.innerHTML = "";

    const vehicle_id = el("fKuponVehicle").value;
    const nomor_kupon = el("fKuponNomor").value.trim();
    const tanggal = el("fKuponTanggal").value;
    const volume = parseFloat(el("fKuponVolume").value) || 0;
    const kmAwal = parseFloat(el("fKuponKmAwal").value) || 0;
    const kmAkhir = parseFloat(el("fKuponKmAkhir").value) || 0;

    if (!vehicle_id || !nomor_kupon || !tanggal || volume <= 0) {
      errBox.textContent = "Kendaraan, Nomor Kupon, Tanggal, dan Volume (lebih dari 0) wajib diisi.";
      errBox.classList.add("show");
      return;
    }
    if (kmAkhir && kmAwal && kmAkhir < kmAwal) {
      errBox.textContent = "Data tidak dapat disimpan: Kilometer Akhir tidak boleh lebih kecil dari Kilometer Awal.";
      errBox.classList.add("show");
      return;
    }
    if (kmAkhir) {
      const lastKm = await DATA.getLastKilometer(vehicle_id, editingKuponId);
      if (kmAkhir < lastKm) {
        errBox.textContent = `Data tidak dapat disimpan: Kilometer kendaraan (${kmAkhir}) turun dari transaksi sebelumnya (${lastKm}).`;
        errBox.classList.add("show");
        return;
      }
    }

    const payload = {
      vehicle_id, nomor_kupon, tanggal, fuel_type_id: el("fKuponFuelType").value || null,
      volume, nilai: parseFloat(el("fKuponNilai").value) || 0, petugas: el("fKuponPetugas").value.trim() || null,
      kilometer_awal: kmAwal || null, kilometer_akhir: kmAkhir || null, keterangan: el("fKuponKeterangan").value.trim() || null,
    };

    const btn = el("kuponSaveBtn");
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Menyimpan…';
    try {
      if (editingKuponId) await DATA.updateFuelCoupon(profile, editingKuponId, payload, kuponList.find((k) => k.id === editingKuponId));
      else await DATA.createFuelCoupon(profile, { ...payload, status: "dibuat" });
      window.SIMPELBMD_UI.toast("Kupon BBM berhasil disimpan.");
      el("kuponModal").classList.remove("show");
      await loadKupon();
    } catch (e) {
      errBox.textContent = e.code === "23505" ? "Nomor kupon sudah digunakan." : "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    } finally {
      btn.disabled = false; btn.textContent = "Simpan Kupon";
    }
  }

  function advanceStatus(id, nextStatus) {
    confirmAction = { type: "advance", id, nextStatus };
    const k = kuponList.find((x) => x.id === id);
    el("confirmTitle").textContent = `Ubah status ke "${STATUS_KUPON_LABEL[nextStatus]}"?`;
    el("confirmText").textContent = `Kupon "${k.nomor_kupon}" akan diperbarui statusnya.`;
    el("confirmActionBtn").textContent = "Ya, Lanjutkan";
    el("confirmModal").classList.add("show");
  }

  function cancelKupon(id) {
    confirmAction = { type: "cancel", id };
    const k = kuponList.find((x) => x.id === id);
    el("confirmTitle").textContent = "Batalkan kupon ini?";
    el("confirmText").textContent = `Kupon "${k.nomor_kupon}" akan ditandai Dibatalkan (tidak dihapus permanen).`;
    el("confirmActionBtn").textContent = "Ya, Batalkan";
    el("confirmModal").classList.add("show");
  }

  async function runConfirmAction() {
    if (!confirmAction) return;
    try {
      if (confirmAction.type === "delete_kend") {
        await DATA.softDeleteVehicle(profile, confirmAction.id, vehicles.find((v) => v.id === confirmAction.id));
        await loadKendaraan();
      } else if (confirmAction.type === "advance") {
        await DATA.setStatusFuelCoupon(profile, confirmAction.id, confirmAction.nextStatus, kuponList.find((k) => k.id === confirmAction.id));
        await loadKupon();
      } else if (confirmAction.type === "cancel") {
        await DATA.setStatusFuelCoupon(profile, confirmAction.id, "dibatalkan", kuponList.find((k) => k.id === confirmAction.id));
        await loadKupon();
      }
      window.SIMPELBMD_UI.toast("Aksi berhasil dilakukan.");
      el("confirmModal").classList.remove("show");
    } catch (e) {
      window.SIMPELBMD_UI.toast("Aksi gagal: " + e.message, "bad");
    }
  }

  function exportKupon() {
    if (!kuponList.length) { window.SIMPELBMD_UI.toast("Tidak ada data untuk diekspor.", "warn"); return; }
    const rows = kuponList.map((k) => ({
      "No. Kupon": k.nomor_kupon, "Tanggal": tgl(k.tanggal), "Nopol": k.vehicles?.nomor_polisi || "-",
      "Jenis BBM": k.fuel_types?.nama || "-", "Volume": k.volume, "Nilai": k.nilai,
      "KM Awal": k.kilometer_awal ?? "-", "KM Akhir": k.kilometer_akhir ?? "-", "Status": STATUS_KUPON_LABEL[k.status],
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KuponBBM");
    XLSX.writeFile(wb, `KuponBBM.xlsx`);
  }

  function bindEvents() {
    el("tabKendaraanBtn").addEventListener("click", () => switchTab("kend"));
    el("tabKuponBtn").addEventListener("click", () => switchTab("kupon"));

    el("kendSearch").addEventListener("input", debounce(loadKendaraan, 350));
    el("btnAddKendaraan").addEventListener("click", openCreateKend);
    el("btnImportKendaraan").addEventListener("click", openImportKendaraan);
    el("kendEmptyAddBtn").addEventListener("click", openCreateKend);
    el("kendModalClose").addEventListener("click", () => el("kendModal").classList.remove("show"));
    el("kendCancelBtn").addEventListener("click", () => el("kendModal").classList.remove("show"));
    el("kendSaveBtn").addEventListener("click", saveKendaraan);

    el("kuponSearch").addEventListener("input", debounce(loadKupon, 350));
    el("kuponFilterStatus").addEventListener("change", loadKupon);
    el("btnAddKupon").addEventListener("click", openCreateKupon);
    el("kuponEmptyAddBtn").addEventListener("click", openCreateKupon);
    el("kuponModalClose").addEventListener("click", () => el("kuponModal").classList.remove("show"));
    el("kuponCancelBtn").addEventListener("click", () => el("kuponModal").classList.remove("show"));
    el("kuponSaveBtn").addEventListener("click", saveKupon);
    el("btnAutoTarif").addEventListener("click", applyAutoTarif);
    el("btnExportKupon").addEventListener("click", exportKupon);

    el("confirmCancelBtn").addEventListener("click", () => el("confirmModal").classList.remove("show"));
    el("confirmActionBtn").addEventListener("click", runConfirmAction);
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  window.BBM_UI = { openEditKend, deleteKend, openEditKupon, advanceStatus, cancelKupon };
  boot();
})();
