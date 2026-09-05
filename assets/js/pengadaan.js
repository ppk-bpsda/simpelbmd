/* ==========================================================================
   SIMPELBMD — Modul Pengadaan (BMD & Penyediaan BBM)
   ========================================================================== */
(() => {
  let profile = null;
  let accounts = [];
  let vendors = [];
  let fuelTypes = [];
  let bmdList = [];
  let bbmList = [];
  let editingBmdId = null;
  let editingBbmId = null;
  let deleteTarget = null; // { type: 'bmd'|'bbm', id }
  let pendingAccountTarget = null; // which select id to fill after quick-add
  let pendingVendorTarget = null;

  const el = (id) => document.getElementById(id);
  const money = (n) => window.SIMPELBMD_UI.formatRupiah(n);
  const tgl = (d) => window.SIMPELBMD_UI.formatTanggal(d);
  const KATEGORI_LABEL = { kendaraan: "Kendaraan", peralatan: "Peralatan", mesin: "Mesin", perlengkapan: "Perlengkapan", bmd_lainnya: "BMD Lainnya" };
  const STATUS_BADGE = { proses: "badge-warn", selesai: "badge-ok", dibatalkan: "badge-bad" };

  async function boot() {
    profile = await window.SIMPELBMD_UI.bootstrapPage();
    if (!profile) return;

    const ctx = DATA.ctx();
    el("ctxYear").textContent = ctx.fiscalYear;
    el("ctxStage").value = ctx.stage;
    el("ctxStage").addEventListener("change", (e) => {
      localStorage.setItem("simpelbmd_tahapan", e.target.value);
      loadBmd();
    });

    [accounts, vendors, fuelTypes] = await Promise.all([DATA.listAccounts(), DATA.listVendors(), DATA.listFuelTypes()]);

    bindEvents();
    await Promise.all([loadBmd(), loadBbm()]);
  }

  // ================= TAB SWITCH =================
  function switchTab(tab) {
    el("tabBmd").style.display = tab === "bmd" ? "block" : "none";
    el("tabBbm").style.display = tab === "bbm" ? "block" : "none";
    el("tabBmdBtn").classList.toggle("active", tab === "bmd");
    el("tabBbmBtn").classList.toggle("active", tab === "bbm");
  }

  // ================= PENGADAAN BMD =================
  async function loadBmd() {
    const ctx = DATA.ctx();
    el("kpiBmdPeriode").textContent = `${ctx.stage === "murni" ? "Murni" : "Perubahan"} · TA ${ctx.fiscalYear}`;
    try {
      bmdList = await DATA.listProcurements({ ...ctx, search: el("bmdSearch").value.trim() || null });
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat pengadaan BMD: " + e.message, "bad");
      bmdList = [];
    }
    renderBmd();
  }

  function renderBmd() {
    const kategoriFilter = el("bmdFilterKategori").value;
    const rows = kategoriFilter ? bmdList.filter((p) => p.category === kategoriFilter) : bmdList;

    el("kpiBmdTotal").textContent = money(rows.reduce((s, p) => s + p.total, 0));
    el("kpiBmdJumlah").textContent = rows.length;
    const counts = {};
    rows.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    el("kpiBmdKategori").textContent = top ? KATEGORI_LABEL[top[0]] : "-";

    el("bmdEmptyState").style.display = rows.length ? "none" : "block";
    document.querySelectorAll("#tabBmd .table-scroll")[0].style.display = rows.length ? "block" : "none";

    el("bmdTableBody").innerHTML = rows.map((p) => `
      <tr>
        <td>${p.nomor_pengadaan}</td>
        <td>${tgl(p.tanggal)}</td>
        <td><span class="badge badge-info">${KATEGORI_LABEL[p.category] || p.category}</span></td>
        <td>${p.vendors?.nama || "-"}</td>
        <td>${p.jumlah_item}</td>
        <td class="cell-num">${money(p.total)}</td>
        <td><span class="badge ${STATUS_BADGE[p.status] || "badge-info"}">${p.status}</span></td>
        <td>
          <div class="action-icons">
            <button title="Edit" onclick="PGD_UI.openEditBmd('${p.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            <button title="Hapus" class="danger" onclick="PGD_UI.confirmDelete('bmd','${p.id}','${p.nomor_pengadaan.replace(/'/g, "")}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function accountOptionsHtml(selectedId) {
    return `<option value="">Pilih rekening…</option>` + accounts.map((a) => `<option value="${a.id}" ${a.id === selectedId ? "selected" : ""}>${a.kode} — ${a.uraian}</option>`).join("") + `<option value="__new__">+ Tambah rekening baru…</option>`;
  }
  function vendorOptionsHtml(selectedId) {
    return `<option value="">Pilih penyedia…</option>` + vendors.map((v) => `<option value="${v.id}" ${v.id === selectedId ? "selected" : ""}>${v.nama}</option>`).join("") + `<option value="__new__">+ Tambah penyedia baru…</option>`;
  }
  function fuelOptionsHtml(selectedId) {
    return `<option value="">Pilih jenis BBM…</option>` + fuelTypes.map((f) => `<option value="${f.id}" ${f.id === selectedId ? "selected" : ""}>${f.nama}</option>`).join("");
  }

  function addBmdItemRow(data = {}) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:grid;grid-template-columns:1.6fr 1fr 0.7fr 0.9fr 1fr 34px;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line-soft);";
    wrap.innerHTML = `
      <input type="text" class="it-nama" placeholder="Nama barang" value="${data.nama_barang || ""}" />
      <input type="text" class="it-merk" placeholder="Merk / Tipe" value="${[data.merk, data.tipe].filter(Boolean).join(" / ")}" />
      <input type="number" class="it-jumlah" placeholder="0" min="0" step="1" value="${data.jumlah ?? ""}" />
      <input type="text" class="it-satuan" placeholder="Unit" value="${data.satuan || ""}" />
      <input type="number" class="it-harga" placeholder="0" min="0" step="1" value="${data.harga_satuan ?? ""}" />
      <button type="button" class="row-remove" title="Hapus"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
    `;
    el("bmdItemRowsBody").appendChild(wrap);
    wrap.querySelectorAll("input").forEach((inp) => inp.addEventListener("input", recalcBmdTotal));
    wrap.querySelector(".row-remove").addEventListener("click", () => { wrap.remove(); recalcBmdTotal(); });
    recalcBmdTotal();
  }

  function recalcBmdTotal() {
    let total = 0;
    el("bmdItemRowsBody").querySelectorAll("div").forEach((row) => {
      const j = parseFloat(row.querySelector(".it-jumlah")?.value) || 0;
      const h = parseFloat(row.querySelector(".it-harga")?.value) || 0;
      total += j * h;
    });
    el("bmdTotal").textContent = money(total);
  }

  function collectBmdItems() {
    const items = [];
    el("bmdItemRowsBody").querySelectorAll("div").forEach((row) => {
      const nama_barang = row.querySelector(".it-nama")?.value.trim();
      const merkTipe = row.querySelector(".it-merk")?.value.trim() || "";
      const [merk, tipe] = merkTipe.split("/").map((s) => s?.trim());
      const jumlah = parseFloat(row.querySelector(".it-jumlah")?.value) || 0;
      const satuan = row.querySelector(".it-satuan")?.value.trim();
      const harga_satuan = parseFloat(row.querySelector(".it-harga")?.value) || 0;
      if (nama_barang && jumlah > 0) items.push({ nama_barang, merk: merk || null, tipe: tipe || null, jumlah, satuan, harga_satuan });
    });
    return items;
  }

  async function openCreateBmd() {
    editingBmdId = null;
    el("bmdModalTitle").textContent = "Tambah Pengadaan BMD";
    el("bmdFormError").classList.remove("show");
    el("fBmdAccount").innerHTML = accountOptionsHtml();
    el("fBmdVendor").innerHTML = vendorOptionsHtml();
    el("fBmdKategori").value = "kendaraan";
    el("fBmdStatus").value = "proses";
    el("fBmdTanggal").value = new Date().toISOString().slice(0, 10);
    el("fBmdKontrak").value = "";
    el("fBmdTglKontrak").value = "";
    el("fBmdKeterangan").value = "";
    el("bmdItemRowsBody").innerHTML = "";
    addBmdItemRow();
    const ctx = DATA.ctx();
    el("fBmdNomor").value = await DATA.nextNomorPengadaan(ctx.fiscalYear);
    el("bmdModal").classList.add("show");
  }

  async function openEditBmd(id) {
    editingBmdId = id;
    el("bmdFormError").classList.remove("show");
    try {
      const p = await DATA.getProcurementDetail(id);
      el("bmdModalTitle").textContent = "Edit Pengadaan BMD";
      el("fBmdAccount").innerHTML = accountOptionsHtml(p.account_id);
      el("fBmdVendor").innerHTML = vendorOptionsHtml(p.vendor_id);
      el("fBmdNomor").value = p.nomor_pengadaan;
      el("fBmdTanggal").value = p.tanggal;
      el("fBmdKategori").value = p.category;
      el("fBmdStatus").value = p.status;
      el("fBmdKontrak").value = p.nomor_kontrak || "";
      el("fBmdTglKontrak").value = p.tanggal_kontrak || "";
      el("fBmdKeterangan").value = p.keterangan || "";
      el("bmdItemRowsBody").innerHTML = "";
      (p.procurement_items || []).forEach((it) => addBmdItemRow(it));
      if (!p.procurement_items?.length) addBmdItemRow();
      el("bmdModal").classList.add("show");
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat detail pengadaan: " + e.message, "bad");
    }
  }

  async function saveBmd() {
    const errBox = el("bmdFormError");
    errBox.classList.remove("show");
    const account_id = el("fBmdAccount").value;
    const vendor_id = el("fBmdVendor").value;
    const nomor_pengadaan = el("fBmdNomor").value.trim();
    const tanggal = el("fBmdTanggal").value;
    const items = collectBmdItems();

    if (!nomor_pengadaan || !tanggal || account_id === "__new__" || vendor_id === "__new__") {
      errBox.textContent = "Nomor Pengadaan dan Tanggal wajib diisi, dan lengkapi pilihan rekening/penyedia.";
      errBox.classList.add("show");
      return;
    }
    if (!items.length) {
      errBox.textContent = "Tambahkan minimal satu item barang dengan jumlah lebih dari 0.";
      errBox.classList.add("show");
      return;
    }

    const btn = el("bmdSaveBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Menyimpan…';
    try {
      const ctx = DATA.ctx();
      const header = {
        fiscal_year: ctx.fiscalYear, stage: ctx.stage, nomor_pengadaan, tanggal,
        account_id: account_id || null, vendor_id: vendor_id || null,
        category: el("fBmdKategori").value, status: el("fBmdStatus").value,
        nomor_kontrak: el("fBmdKontrak").value.trim() || null,
        tanggal_kontrak: el("fBmdTglKontrak").value || null,
        keterangan: el("fBmdKeterangan").value.trim() || null,
      };
      if (editingBmdId) {
        await DATA.updateProcurement(profile, editingBmdId, header, items, bmdList.find((p) => p.id === editingBmdId));
      } else {
        await DATA.createProcurement(profile, header, items);
      }
      window.SIMPELBMD_UI.toast("Data pengadaan berhasil disimpan.");
      el("bmdModal").classList.remove("show");
      await loadBmd();
    } catch (e) {
      errBox.textContent = e.code === "23505" ? "Nomor pengadaan sudah digunakan pada Tahun Anggaran ini." : "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    } finally {
      btn.disabled = false;
      btn.textContent = "Simpan Pengadaan";
    }
  }

  function exportBmd() {
    if (!bmdList.length) { window.SIMPELBMD_UI.toast("Tidak ada data untuk diekspor.", "warn"); return; }
    const rows = bmdList.map((p) => ({
      "No. Pengadaan": p.nomor_pengadaan, "Tanggal": tgl(p.tanggal), "Kategori": KATEGORI_LABEL[p.category],
      "Penyedia": p.vendors?.nama || "-", "Jumlah Item": p.jumlah_item, "Total": p.total, "Status": p.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PengadaanBMD");
    const ctx = DATA.ctx();
    XLSX.writeFile(wb, `PengadaanBMD_${ctx.fiscalYear}_${ctx.stage}.xlsx`);
  }

  // ================= PENYEDIAAN BBM =================
  async function loadBbm() {
    try {
      bbmList = await DATA.listFuelProcurements({ search: el("bbmSearch").value.trim() || null });
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat penyediaan BBM: " + e.message, "bad");
      bbmList = [];
    }
    renderBbm();
  }

  function renderBbm() {
    el("kpiBbmTotal").textContent = money(bbmList.reduce((s, b) => s + Number(b.nilai || 0), 0));
    el("kpiBbmVolume").textContent = bbmList.reduce((s, b) => s + Number(b.volume || 0), 0).toLocaleString("id-ID") + " L";
    el("kpiBbmJumlah").textContent = bbmList.length;

    el("bbmEmptyState").style.display = bbmList.length ? "none" : "block";
    document.querySelectorAll("#tabBbm .table-scroll")[0].style.display = bbmList.length ? "block" : "none";

    el("bbmTableBody").innerHTML = bbmList.map((b) => `
      <tr>
        <td>${b.nomor_pengadaan}</td>
        <td>${tgl(b.tanggal)}</td>
        <td>${b.fuel_types?.nama || "-"}</td>
        <td>${Number(b.volume).toLocaleString("id-ID")} L</td>
        <td class="cell-num">${money(b.harga)}</td>
        <td class="cell-num">${money(b.nilai)}</td>
        <td>${b.vendors?.nama || "-"}</td>
        <td>
          <div class="action-icons">
            <button title="Edit" onclick="PGD_UI.openEditBbm('${b.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            <button title="Hapus" class="danger" onclick="PGD_UI.confirmDelete('bbm','${b.id}','${b.nomor_pengadaan.replace(/'/g, "")}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
          </div>
        </td>
      </tr>
    `).join("");
  }

  function recalcBbmNilai() {
    const v = parseFloat(el("fBbmVolume").value) || 0;
    const h = parseFloat(el("fBbmHarga").value) || 0;
    el("fBbmNilai").value = money(v * h);
  }

  async function openCreateBbm() {
    editingBbmId = null;
    el("bbmModalTitle").textContent = "Tambah Penyediaan BBM";
    el("bbmFormError").classList.remove("show");
    el("fBbmAccount").innerHTML = accountOptionsHtml();
    el("fBbmFuelType").innerHTML = fuelOptionsHtml();
    el("fBbmVendor").innerHTML = vendorOptionsHtml();
    el("fBbmTanggal").value = new Date().toISOString().slice(0, 10);
    el("fBbmVolume").value = "";
    el("fBbmHarga").value = "";
    el("fBbmNilai").value = "Rp 0";
    el("fBbmPeriode").value = "";
    el("fBbmKeterangan").value = "";
    el("fBbmNomor").value = await DATA.nextNomorPengadaanBbm();
    el("bbmModal").classList.add("show");
  }

  function openEditBbm(id) {
    const b = bbmList.find((x) => x.id === id);
    if (!b) return;
    editingBbmId = id;
    el("bbmModalTitle").textContent = "Edit Penyediaan BBM";
    el("bbmFormError").classList.remove("show");
    el("fBbmAccount").innerHTML = accountOptionsHtml(b.account_id);
    el("fBbmFuelType").innerHTML = fuelOptionsHtml(b.fuel_type_id);
    el("fBbmVendor").innerHTML = vendorOptionsHtml(b.vendor_id);
    el("fBbmNomor").value = b.nomor_pengadaan;
    el("fBbmTanggal").value = b.tanggal;
    el("fBbmVolume").value = b.volume;
    el("fBbmHarga").value = b.harga;
    recalcBbmNilai();
    el("fBbmPeriode").value = b.periode || "";
    el("fBbmKeterangan").value = b.keterangan || "";
    el("bbmModal").classList.add("show");
  }

  async function saveBbm() {
    const errBox = el("bbmFormError");
    errBox.classList.remove("show");
    const nomor_pengadaan = el("fBbmNomor").value.trim();
    const tanggal = el("fBbmTanggal").value;
    const account_id = el("fBbmAccount").value;
    const fuel_type_id = el("fBbmFuelType").value;
    const volume = parseFloat(el("fBbmVolume").value) || 0;
    const harga = parseFloat(el("fBbmHarga").value) || 0;
    const vendor_id = el("fBbmVendor").value;

    if (!nomor_pengadaan || !tanggal || !fuel_type_id || volume <= 0 || harga <= 0 || account_id === "__new__" || vendor_id === "__new__") {
      errBox.textContent = "Lengkapi Nomor Pengadaan, Tanggal, Jenis BBM, Volume dan Harga (lebih dari 0).";
      errBox.classList.add("show");
      return;
    }

    const btn = el("bbmSaveBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Menyimpan…';
    const payload = {
      nomor_pengadaan, tanggal, account_id: account_id || null, fuel_type_id,
      volume, harga, vendor_id: vendor_id || null,
      periode: el("fBbmPeriode").value.trim() || null, keterangan: el("fBbmKeterangan").value.trim() || null,
    };
    try {
      if (editingBbmId) await DATA.updateFuelProcurement(profile, editingBbmId, payload, bbmList.find((b) => b.id === editingBbmId));
      else await DATA.createFuelProcurement(profile, payload);
      window.SIMPELBMD_UI.toast("Data penyediaan BBM berhasil disimpan.");
      el("bbmModal").classList.remove("show");
      await loadBbm();
    } catch (e) {
      errBox.textContent = "Data tidak dapat disimpan: " + e.message;
      errBox.classList.add("show");
    } finally {
      btn.disabled = false;
      btn.textContent = "Simpan Penyediaan";
    }
  }

  function exportBbm() {
    if (!bbmList.length) { window.SIMPELBMD_UI.toast("Tidak ada data untuk diekspor.", "warn"); return; }
    const rows = bbmList.map((b) => ({
      "No. Pengadaan": b.nomor_pengadaan, "Tanggal": tgl(b.tanggal), "Jenis BBM": b.fuel_types?.nama || "-",
      "Volume": b.volume, "Harga": b.harga, "Nilai": b.nilai, "Penyedia": b.vendors?.nama || "-",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PenyediaanBBM");
    XLSX.writeFile(wb, `PenyediaanBBM.xlsx`);
  }

  // ================= Quick add: rekening & penyedia (dipakai kedua tab) =================
  function openAccountModal(targetSelectId) { pendingAccountTarget = targetSelectId; el("newAccKode").value = ""; el("newAccUraian").value = ""; el("newAccJenis").value = ""; el("accountModal").classList.add("show"); }
  function openVendorModal(targetSelectId) { pendingVendorTarget = targetSelectId; el("newVendorNama").value = ""; el("vendorModal").classList.add("show"); }

  async function saveNewAccount() {
    const kode = el("newAccKode").value.trim();
    const uraian = el("newAccUraian").value.trim();
    const jenis_belanja = el("newAccJenis").value.trim();
    if (!kode || !uraian) { window.SIMPELBMD_UI.toast("Kode dan uraian rekening wajib diisi.", "warn"); return; }
    try {
      const created = await DATA.quickCreateAccount({ kode, uraian, jenis_belanja });
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

  // ================= Delete confirm (shared) =================
  function confirmDelete(type, id, label) {
    deleteTarget = { type, id };
    el("deleteConfirmText").textContent = `Data "${label}" akan disembunyikan dari daftar namun tetap tersimpan untuk audit (soft delete).`;
    el("deleteModal").classList.add("show");
  }
  async function doDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "bmd") {
        await DATA.softDeleteProcurement(profile, deleteTarget.id, bmdList.find((p) => p.id === deleteTarget.id));
        await loadBmd();
      } else {
        await DATA.softDeleteFuelProcurement(profile, deleteTarget.id, bbmList.find((b) => b.id === deleteTarget.id));
        await loadBbm();
      }
      window.SIMPELBMD_UI.toast("Data berhasil dihapus.");
      el("deleteModal").classList.remove("show");
    } catch (e) {
      window.SIMPELBMD_UI.toast("Data tidak dapat dihapus: " + e.message, "bad");
    }
  }

  function bindEvents() {
    el("tabBmdBtn").addEventListener("click", () => switchTab("bmd"));
    el("tabBbmBtn").addEventListener("click", () => switchTab("bbm"));

    el("bmdSearch").addEventListener("input", debounce(loadBmd, 350));
    el("bmdFilterKategori").addEventListener("change", renderBmd);
    el("btnAddBmd").addEventListener("click", openCreateBmd);
    el("bmdEmptyAddBtn").addEventListener("click", openCreateBmd);
    el("bmdModalClose").addEventListener("click", () => el("bmdModal").classList.remove("show"));
    el("bmdCancelBtn").addEventListener("click", () => el("bmdModal").classList.remove("show"));
    el("bmdSaveBtn").addEventListener("click", saveBmd);
    el("bmdAddRowBtn").addEventListener("click", () => addBmdItemRow());
    el("btnExportBmd").addEventListener("click", exportBmd);
    el("fBmdAccount").addEventListener("change", (e) => { if (e.target.value === "__new__") { e.target.value = ""; openAccountModal("fBmdAccount"); } });
    el("fBmdVendor").addEventListener("change", (e) => { if (e.target.value === "__new__") { e.target.value = ""; openVendorModal("fBmdVendor"); } });

    el("bbmSearch").addEventListener("input", debounce(loadBbm, 350));
    el("btnAddBbm").addEventListener("click", openCreateBbm);
    el("bbmEmptyAddBtn").addEventListener("click", openCreateBbm);
    el("bbmModalClose").addEventListener("click", () => el("bbmModal").classList.remove("show"));
    el("bbmCancelBtn").addEventListener("click", () => el("bbmModal").classList.remove("show"));
    el("bbmSaveBtn").addEventListener("click", saveBbm);
    el("fBbmVolume").addEventListener("input", recalcBbmNilai);
    el("fBbmHarga").addEventListener("input", recalcBbmNilai);
    el("btnExportBbm").addEventListener("click", exportBbm);
    el("fBbmAccount").addEventListener("change", (e) => { if (e.target.value === "__new__") { e.target.value = ""; openAccountModal("fBbmAccount"); } });
    el("fBbmVendor").addEventListener("change", (e) => { if (e.target.value === "__new__") { e.target.value = ""; openVendorModal("fBbmVendor"); } });

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

  window.PGD_UI = { openEditBmd, openEditBbm, confirmDelete };
  boot();
})();
