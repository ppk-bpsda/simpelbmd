/* ==========================================================================
   SIMPELBMD — Data access helpers (dipakai bersama oleh modul DPA & Realisasi)
   ========================================================================== */

const DATA = (() => {
  const sb = () => window.SIMPELBMD.sb;

  function ctx() {
    return {
      fiscalYear: parseInt(localStorage.getItem("simpelbmd_ta") || "2026", 10),
      stage: localStorage.getItem("simpelbmd_tahapan") || "murni",
    };
  }

  // ---------------- Master Rekening (accounts) ----------------
  async function listAccounts() {
    const { data, error } = await sb().from("accounts").select("id, kode, uraian, jenis_belanja").eq("is_active", true).order("kode");
    if (error) throw error;
    return data;
  }

  async function quickCreateAccount({ kode, uraian, jenis_belanja }) {
    const { data, error } = await sb().from("accounts").insert({ kode, uraian, jenis_belanja }).select().single();
    if (error) throw error;
    return data;
  }

  // ---------------- Master Penyedia (vendors) ----------------
  async function listVendors() {
    const { data, error } = await sb().from("vendors").select("id, nama").is("deleted_at", null).order("nama");
    if (error) throw error;
    return data;
  }

  async function quickCreateVendor({ nama }) {
    const { data, error } = await sb().from("vendors").insert({ nama }).select().single();
    if (error) throw error;
    return data;
  }

  // ---------------- DPA ----------------
  async function listDpa({ fiscalYear, stage }) {
    const { data, error } = await sb()
      .from("dpa")
      .select("id, nomor_dpa, tanggal_penetapan, fiscal_year, stage, is_active, dpa_details(id, jumlah)")
      .eq("fiscal_year", fiscalYear)
      .eq("stage", stage)
      .is("deleted_at", null)
      .order("tanggal_penetapan", { ascending: false });
    if (error) throw error;
    return data.map((d) => ({
      ...d,
      total_pagu: (d.dpa_details || []).reduce((s, x) => s + Number(x.jumlah || 0), 0),
      jumlah_rincian: (d.dpa_details || []).length,
    }));
  }

  async function getDpaDetail(dpaId) {
    const { data, error } = await sb()
      .from("dpa")
      .select("*, dpa_details(*, accounts(kode, uraian))")
      .eq("id", dpaId)
      .single();
    if (error) throw error;
    return data;
  }

  async function createDpaHeader(profile, header) {
    const { data, error } = await sb()
      .from("dpa")
      .insert({ ...header, created_by: profile.id, updated_by: profile.id })
      .select()
      .single();
    if (error) throw error;
    await logAudit("CREATE", "dpa", data.id, profile.id, null, data);
    return data;
  }

  async function updateDpaHeader(profile, dpaId, header, before) {
    const { data, error } = await sb()
      .from("dpa")
      .update({ ...header, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", dpaId)
      .select()
      .single();
    if (error) throw error;
    await logAudit("UPDATE", "dpa", dpaId, profile.id, before, data);
    return data;
  }

  async function softDeleteDpa(profile, dpaId, before) {
    const { error } = await sb()
      .from("dpa")
      .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id })
      .eq("id", dpaId);
    if (error) throw error;
    await logAudit("DELETE", "dpa", dpaId, profile.id, before, null);
  }

  async function replaceDpaDetails(profile, dpaId, rows) {
    // Soft delete rincian lama, lalu insert rincian baru (pola replace-all sederhana untuk form editor).
    const { data: existing } = await sb().from("dpa_details").select("id").eq("dpa_id", dpaId).is("deleted_at", null);
    if (existing && existing.length) {
      await sb().from("dpa_details").update({ deleted_at: new Date().toISOString(), deleted_by: profile.id }).in(
        "id",
        existing.map((r) => r.id)
      );
    }
    if (rows.length) {
      const payload = rows.map((r) => ({
        dpa_id: dpaId,
        account_id: r.account_id,
        satuan: r.satuan,
        volume: r.volume,
        harga_satuan: r.harga_satuan,
        created_by: profile.id,
        updated_by: profile.id,
      }));
      const { error } = await sb().from("dpa_details").insert(payload);
      if (error) throw error;
    }
    await logAudit("UPDATE", "dpa_details", dpaId, profile.id, { count: existing?.length || 0 }, { count: rows.length });
  }

  // ---------------- Anggaran vs Realisasi (untuk validasi Realisasi) ----------------
  async function getPaguRealisasi(accountId, fiscalYear, stage) {
    const { data, error } = await sb()
      .from("v_anggaran_vs_realisasi")
      .select("*")
      .eq("account_id", accountId)
      .eq("fiscal_year", fiscalYear)
      .eq("stage", stage)
      .maybeSingle();
    if (error) throw error;
    return data || { pagu: 0, realisasi: 0, sisa: 0, persen_realisasi: 0 };
  }

  async function getAnggaranKasBulan(accountId, fiscalYear, stage, bulan) {
    const { data, error } = await sb()
      .from("v_anggaran_kas_vs_realisasi")
      .select("*")
      .eq("account_id", accountId)
      .eq("fiscal_year", fiscalYear)
      .eq("stage", stage)
      .eq("bulan", bulan)
      .maybeSingle();
    if (error) throw error;
    return data || { anggaran_kas: 0, realisasi: 0 };
  }

  // ---------------- Realisasi ----------------
  async function listRealisasi({ fiscalYear, stage, status, accountId, search }) {
    let q = sb()
      .from("realization")
      .select("*, accounts(kode, uraian), vendors(nama)")
      .eq("fiscal_year", fiscalYear)
      .eq("stage", stage)
      .is("deleted_at", null)
      .order("tanggal", { ascending: false });
    if (status) q = q.eq("status", status);
    if (accountId) q = q.eq("account_id", accountId);
    if (search) q = q.or(`nomor_transaksi.ilike.%${search}%,uraian.ilike.%${search}%,nomor_spj.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  async function createRealisasi(profile, row) {
    const { data, error } = await sb()
      .from("realization")
      .insert({ ...row, created_by: profile.id, updated_by: profile.id })
      .select()
      .single();
    if (error) throw error;
    await logAudit("CREATE", "realization", data.id, profile.id, null, data);
    return data;
  }

  async function updateRealisasi(profile, id, row, before) {
    const { data, error } = await sb()
      .from("realization")
      .update({ ...row, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await logAudit("UPDATE", "realization", id, profile.id, before, data);
    return data;
  }

  async function setStatusRealisasi(profile, id, status, before) {
    const { data, error } = await sb()
      .from("realization")
      .update({ status, updated_by: profile.id, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await logAudit(status === "disetujui" ? "APPROVE" : status === "ditolak" ? "REJECT" : "UPDATE", "realization", id, profile.id, before, data);
    return data;
  }

  async function softDeleteRealisasi(profile, id, before) {
    const { error } = await sb()
      .from("realization")
      .update({ deleted_at: new Date().toISOString(), deleted_by: profile.id })
      .eq("id", id);
    if (error) throw error;
    await logAudit("DELETE", "realization", id, profile.id, before, null);
  }

  async function nextNomorTransaksi(fiscalYear) {
    const { count, error } = await sb()
      .from("realization")
      .select("id", { count: "exact", head: true })
      .eq("fiscal_year", fiscalYear);
    if (error) throw error;
    return `RLS/${fiscalYear}/${String((count || 0) + 1).padStart(4, "0")}`;
  }

  async function nextNomorDpa(fiscalYear, stage) {
    const { count, error } = await sb().from("dpa").select("id", { count: "exact", head: true }).eq("fiscal_year", fiscalYear).eq("stage", stage);
    if (error) throw error;
    return `DPA/${fiscalYear}/${stage === "murni" ? "M" : "P"}/${String((count || 0) + 1).padStart(3, "0")}`;
  }

  // ---------------- Master Jenis BBM ----------------
  async function listFuelTypes() {
    const { data, error } = await sb().from("fuel_types").select("id, nama, satuan").order("nama");
    if (error) throw error;
    return data;
  }

  // ---------------- Anggaran Kas ----------------
  const BULAN_NAMA = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  async function listBudgetCashSummary({ fiscalYear, stage }) {
    const [{ data: rows, error: e1 }, { data: view, error: e2 }] = await Promise.all([
      sb().from("budget_cash").select("account_id, bulan, nilai, accounts(kode, uraian)").eq("fiscal_year", fiscalYear).eq("stage", stage).is("deleted_at", null),
      sb().from("v_anggaran_kas_vs_realisasi").select("account_id, bulan, realisasi").eq("fiscal_year", fiscalYear).eq("stage", stage),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const byAccount = {};
    (rows || []).forEach((r) => {
      if (!byAccount[r.account_id]) byAccount[r.account_id] = { account_id: r.account_id, kode: r.accounts?.kode, uraian: r.accounts?.uraian, anggaran: 0, realisasi: 0, months: {} };
      byAccount[r.account_id].anggaran += Number(r.nilai || 0);
      byAccount[r.account_id].months[r.bulan] = Number(r.nilai || 0);
    });
    (view || []).forEach((v) => {
      if (byAccount[v.account_id]) byAccount[v.account_id].realisasi += Number(v.realisasi || 0);
    });
    return Object.values(byAccount).map((a) => ({ ...a, sisa: a.anggaran - a.realisasi }));
  }

  async function getCashFlowChart({ fiscalYear, stage }) {
    const { data: rows, error: e1 } = await sb().from("budget_cash").select("bulan, nilai").eq("fiscal_year", fiscalYear).eq("stage", stage).is("deleted_at", null);
    if (e1) throw e1;
    const { data: real, error: e2 } = await sb().from("realization").select("nilai, tanggal, status").eq("fiscal_year", fiscalYear).eq("stage", stage).eq("status", "disetujui").is("deleted_at", null);
    if (e2) throw e2;
    const kasPerBulan = Array(12).fill(0);
    (rows || []).forEach((r) => { kasPerBulan[r.bulan - 1] += Number(r.nilai || 0); });
    const realPerBulan = Array(12).fill(0);
    (real || []).forEach((r) => { realPerBulan[new Date(r.tanggal).getMonth()] += Number(r.nilai || 0); });
    return { labels: BULAN_NAMA, kas: kasPerBulan, realisasi: realPerBulan };
  }

  async function getBudgetCashRows(accountId, fiscalYear, stage) {
    const { data, error } = await sb().from("budget_cash").select("bulan, nilai, uraian").eq("account_id", accountId).eq("fiscal_year", fiscalYear).eq("stage", stage).is("deleted_at", null);
    if (error) throw error;
    const byBulan = {};
    (data || []).forEach((r) => { byBulan[r.bulan] = r; });
    return Array.from({ length: 12 }, (_, i) => ({ bulan: i + 1, nilai: byBulan[i + 1]?.nilai ?? 0, uraian: byBulan[i + 1]?.uraian ?? "" }));
  }

  async function upsertBudgetCash(profile, accountId, fiscalYear, stage, rows) {
    const payload = rows.map((r) => ({
      fiscal_year: fiscalYear, stage, bulan: r.bulan, account_id: accountId, uraian: r.uraian || null,
      nilai: r.nilai, created_by: profile.id, updated_by: profile.id, updated_at: new Date().toISOString(),
    }));
    const { error } = await sb().from("budget_cash").upsert(payload, { onConflict: "fiscal_year,stage,bulan,account_id" });
    if (error) throw error;
    await logAudit("UPDATE", "budget_cash", accountId, profile.id, null, { fiscalYear, stage, rows: payload });
  }

  // ---------------- Pengadaan BMD ----------------
  async function listProcurements({ fiscalYear, stage, search }) {
    let q = sb()
      .from("procurements")
      .select("*, vendors(nama), accounts(kode, uraian), procurement_items(id, total)")
      .eq("fiscal_year", fiscalYear).eq("stage", stage).is("deleted_at", null)
      .order("tanggal", { ascending: false });
    if (search) q = q.ilike("nomor_pengadaan", `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data.map((p) => ({ ...p, total: (p.procurement_items || []).reduce((s, i) => s + Number(i.total || 0), 0), jumlah_item: (p.procurement_items || []).length }));
  }

  async function getProcurementDetail(id) {
    const { data, error } = await sb().from("procurements").select("*, procurement_items(*)").eq("id", id).single();
    if (error) throw error;
    return data;
  }

  async function nextNomorPengadaan(fiscalYear) {
    const { count, error } = await sb().from("procurements").select("id", { count: "exact", head: true }).eq("fiscal_year", fiscalYear);
    if (error) throw error;
    return `PGD/${fiscalYear}/${String((count || 0) + 1).padStart(4, "0")}`;
  }

  async function createProcurement(profile, header, items) {
    const { data, error } = await sb().from("procurements").insert({ ...header, created_by: profile.id, updated_by: profile.id }).select().single();
    if (error) throw error;
    if (items.length) {
      const { error: e2 } = await sb().from("procurement_items").insert(items.map((it) => ({ ...it, procurement_id: data.id })));
      if (e2) throw e2;
    }
    await logAudit("CREATE", "procurements", data.id, profile.id, null, data);
    return data;
  }

  async function updateProcurement(profile, id, header, items, before) {
    const { data, error } = await sb().from("procurements").update({ ...header, updated_by: profile.id, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    await sb().from("procurement_items").delete().eq("procurement_id", id);
    if (items.length) {
      const { error: e2 } = await sb().from("procurement_items").insert(items.map((it) => ({ ...it, procurement_id: id })));
      if (e2) throw e2;
    }
    await logAudit("UPDATE", "procurements", id, profile.id, before, data);
    return data;
  }

  async function softDeleteProcurement(profile, id, before) {
    const { error } = await sb().from("procurements").update({ deleted_at: new Date().toISOString(), deleted_by: profile.id }).eq("id", id);
    if (error) throw error;
    await logAudit("DELETE", "procurements", id, profile.id, before, null);
  }

  // ---------------- Penyediaan BBM (fuel_procurements) ----------------
  async function listFuelProcurements({ search }) {
    let q = sb().from("fuel_procurements").select("*, accounts(kode, uraian), vendors(nama), fuel_types(nama)").is("deleted_at", null).order("tanggal", { ascending: false });
    if (search) q = q.ilike("nomor_pengadaan", `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  async function nextNomorPengadaanBbm() {
    const { count, error } = await sb().from("fuel_procurements").select("id", { count: "exact", head: true });
    if (error) throw error;
    return `BBM/${new Date().getFullYear()}/${String((count || 0) + 1).padStart(4, "0")}`;
  }

  async function createFuelProcurement(profile, row) {
    const { data, error } = await sb().from("fuel_procurements").insert({ ...row, created_by: profile.id }).select().single();
    if (error) throw error;
    await logAudit("CREATE", "fuel_procurements", data.id, profile.id, null, data);
    return data;
  }

  async function updateFuelProcurement(profile, id, row, before) {
    const { data, error } = await sb().from("fuel_procurements").update(row).eq("id", id).select().single();
    if (error) throw error;
    await logAudit("UPDATE", "fuel_procurements", id, profile.id, before, data);
    return data;
  }

  async function softDeleteFuelProcurement(profile, id, before) {
    const { error } = await sb().from("fuel_procurements").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await logAudit("DELETE", "fuel_procurements", id, profile.id, before, null);
  }

  // ---------------- Master Kendaraan (vehicles) ----------------
  async function listVehicles({ search } = {}) {
    let q = sb().from("vehicles").select("*").is("deleted_at", null).order("nomor_polisi");
    if (search) q = q.ilike("nomor_polisi", `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  async function createVehicle(profile, row) {
    const { data, error } = await sb().from("vehicles").insert(row).select().single();
    if (error) throw error;
    await logAudit("CREATE", "vehicles", data.id, profile.id, null, data);
    return data;
  }
  async function updateVehicle(profile, id, row, before) {
    const { data, error } = await sb().from("vehicles").update(row).eq("id", id).select().single();
    if (error) throw error;
    await logAudit("UPDATE", "vehicles", id, profile.id, before, data);
    return data;
  }
  async function softDeleteVehicle(profile, id, before) {
    const { error } = await sb().from("vehicles").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await logAudit("DELETE", "vehicles", id, profile.id, before, null);
  }

  // ---------------- Kupon BBM ----------------
  async function listFuelCoupons({ search, status, vehicleId } = {}) {
    let q = sb().from("fuel_coupons").select("*, vehicles(nomor_polisi, merk, tipe), fuel_types(nama)").is("deleted_at", null).order("tanggal", { ascending: false });
    if (search) q = q.ilike("nomor_kupon", `%${search}%`);
    if (status) q = q.eq("status", status);
    if (vehicleId) q = q.eq("vehicle_id", vehicleId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  async function getLastKilometer(vehicleId, excludeCouponId) {
    let q = sb().from("fuel_coupons").select("kilometer_akhir, tanggal").eq("vehicle_id", vehicleId).is("deleted_at", null).order("tanggal", { ascending: false }).limit(5);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data || []).filter((r) => !excludeCouponId || true);
    return rows.length ? Math.max(...rows.map((r) => Number(r.kilometer_akhir || 0))) : 0;
  }
  async function nextNomorKupon() {
    const { count, error } = await sb().from("fuel_coupons").select("id", { count: "exact", head: true });
    if (error) throw error;
    return `KPN/${new Date().getFullYear()}/${String((count || 0) + 1).padStart(5, "0")}`;
  }
  async function createFuelCoupon(profile, row) {
    const { data, error } = await sb().from("fuel_coupons").insert({ ...row, created_by: profile.id, updated_by: profile.id }).select().single();
    if (error) throw error;
    await logAudit("CREATE", "fuel_coupons", data.id, profile.id, null, data);
    return data;
  }
  async function updateFuelCoupon(profile, id, row, before) {
    const { data, error } = await sb().from("fuel_coupons").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    await logAudit("UPDATE", "fuel_coupons", id, profile.id, before, data);
    return data;
  }
  async function setStatusFuelCoupon(profile, id, status, before) {
    const { data, error } = await sb().from("fuel_coupons").update({ status, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    await logAudit("UPDATE", "fuel_coupons", id, profile.id, before, data);
    return data;
  }
  async function softDeleteFuelCoupon(profile, id, before) {
    const { error } = await sb().from("fuel_coupons").update({ deleted_at: new Date().toISOString(), deleted_by: profile.id }).eq("id", id);
    if (error) throw error;
    await logAudit("DELETE", "fuel_coupons", id, profile.id, before, null);
  }
  async function bbmSummaryPerVehicle() {
    const { data, error } = await sb().from("v_bbm_per_kendaraan").select("*, vehicles(nomor_polisi, merk)");
    if (error) throw error;
    return data;
  }

  async function listVehicleCategoryRates(fiscalYear) {
    const { data, error } = await sb().from("vehicle_category_rates").select("*, accounts(kode, uraian)").eq("fiscal_year", fiscalYear);
    if (error) throw error;
    return data;
  }

  // ---------------- Master Peralatan (equipment) ----------------
  async function listEquipment({ search } = {}) {
    let q = sb().from("equipment").select("*").is("deleted_at", null).order("nama");
    if (search) q = q.ilike("nama", `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  async function createEquipment(profile, row) {
    const { data, error } = await sb().from("equipment").insert(row).select().single();
    if (error) throw error;
    await logAudit("CREATE", "equipment", data.id, profile.id, null, data);
    return data;
  }
  async function updateEquipment(profile, id, row, before) {
    const { data, error } = await sb().from("equipment").update(row).eq("id", id).select().single();
    if (error) throw error;
    await logAudit("UPDATE", "equipment", id, profile.id, before, data);
    return data;
  }
  async function softDeleteEquipment(profile, id, before) {
    const { error } = await sb().from("equipment").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await logAudit("DELETE", "equipment", id, profile.id, before, null);
  }

  // ---------------- Pemeliharaan Kendaraan ----------------
  async function listMaintenanceVehicle({ search, vehicleId } = {}) {
    let q = sb().from("maintenance_vehicle").select("*, vehicles(nomor_polisi, merk, tipe), vendors(nama)").is("deleted_at", null).order("tanggal", { ascending: false });
    if (vehicleId) q = q.eq("vehicle_id", vehicleId);
    if (search) q = q.ilike("nomor_transaksi", `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  async function nextNomorPemeliharaan() {
    const { count, error } = await sb().from("maintenance_vehicle").select("id", { count: "exact", head: true });
    if (error) throw error;
    return `PML/${new Date().getFullYear()}/${String((count || 0) + 1).padStart(4, "0")}`;
  }
  async function createMaintenanceVehicle(profile, row) {
    const { data, error } = await sb().from("maintenance_vehicle").insert({ ...row, created_by: profile.id }).select().single();
    if (error) throw error;
    await logAudit("CREATE", "maintenance_vehicle", data.id, profile.id, null, data);
    return data;
  }
  async function updateMaintenanceVehicle(profile, id, row, before) {
    const { data, error } = await sb().from("maintenance_vehicle").update(row).eq("id", id).select().single();
    if (error) throw error;
    await logAudit("UPDATE", "maintenance_vehicle", id, profile.id, before, data);
    return data;
  }
  async function softDeleteMaintenanceVehicle(profile, id, before) {
    const { error } = await sb().from("maintenance_vehicle").update({ deleted_at: new Date().toISOString(), deleted_by: profile.id }).eq("id", id);
    if (error) throw error;
    await logAudit("DELETE", "maintenance_vehicle", id, profile.id, before, null);
  }

  // ---------------- Pemeliharaan Peralatan ----------------
  async function listMaintenanceEquipment({ search, equipmentId } = {}) {
    let q = sb().from("maintenance_equipment").select("*, equipment(nama, nomor_aset), vendors(nama)").is("deleted_at", null).order("tanggal", { ascending: false });
    if (equipmentId) q = q.eq("equipment_id", equipmentId);
    if (search) q = q.ilike("nomor_transaksi", `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  async function nextNomorPemeliharaanPeralatan() {
    const { count, error } = await sb().from("maintenance_equipment").select("id", { count: "exact", head: true });
    if (error) throw error;
    return `PMP/${new Date().getFullYear()}/${String((count || 0) + 1).padStart(4, "0")}`;
  }
  async function createMaintenanceEquipment(profile, row) {
    const { data, error } = await sb().from("maintenance_equipment").insert({ ...row, created_by: profile.id }).select().single();
    if (error) throw error;
    await logAudit("CREATE", "maintenance_equipment", data.id, profile.id, null, data);
    return data;
  }
  async function updateMaintenanceEquipment(profile, id, row, before) {
    const { data, error } = await sb().from("maintenance_equipment").update(row).eq("id", id).select().single();
    if (error) throw error;
    await logAudit("UPDATE", "maintenance_equipment", id, profile.id, before, data);
    return data;
  }
  async function softDeleteMaintenanceEquipment(profile, id, before) {
    const { error } = await sb().from("maintenance_equipment").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await logAudit("DELETE", "maintenance_equipment", id, profile.id, before, null);
  }

  // ---------------- Master Data: Penyedia / Jenis BBM / Satuan (CRUD penuh) ----------------
  async function updateVendor(profile, id, row, before) {
    const { data, error } = await sb().from("vendors").update(row).eq("id", id).select().single();
    if (error) throw error;
    await logAudit("UPDATE", "vendors", id, profile.id, before, data);
    return data;
  }
  async function softDeleteVendor(profile, id, before) {
    const { error } = await sb().from("vendors").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    await logAudit("DELETE", "vendors", id, profile.id, before, null);
  }
  async function updateAccount(profile, id, row, before) {
    const { data, error } = await sb().from("accounts").update(row).eq("id", id).select().single();
    if (error) throw error;
    await logAudit("UPDATE", "accounts", id, profile.id, before, data);
    return data;
  }
  async function deactivateAccount(profile, id, before) {
    const { error } = await sb().from("accounts").update({ is_active: false }).eq("id", id);
    if (error) throw error;
    await logAudit("DELETE", "accounts", id, profile.id, before, null);
  }
  async function createFuelType(profile, row) {
    const { data, error } = await sb().from("fuel_types").insert(row).select().single();
    if (error) throw error;
    await logAudit("CREATE", "fuel_types", data.id, profile.id, null, data);
    return data;
  }
  async function listUnits() {
    const { data, error } = await sb().from("units").select("*").order("nama");
    if (error) throw error;
    return data;
  }
  async function createUnit(profile, nama) {
    const { data, error } = await sb().from("units").insert({ nama }).select().single();
    if (error) throw error;
    await logAudit("CREATE", "units", data.id, profile.id, null, data);
    return data;
  }

  // ---------------- Laporan ----------------
  async function laporanAnggaranRealisasi({ fiscalYear, stage }) {
    const { data, error } = await sb().from("v_anggaran_vs_realisasi").select("*").eq("fiscal_year", fiscalYear).eq("stage", stage).order("kode");
    if (error) throw error;
    return data;
  }
  async function laporanPemeliharaanKendaraan({ from, to, vehicleId }) {
    let q = sb().from("maintenance_vehicle").select("*, vehicles(nomor_polisi, merk), vendors(nama)").is("deleted_at", null).order("tanggal", { ascending: false });
    if (from) q = q.gte("tanggal", from);
    if (to) q = q.lte("tanggal", to);
    if (vehicleId) q = q.eq("vehicle_id", vehicleId);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }
  async function laporanBbmBulanan({ from, to }) {
    let q = sb().from("fuel_coupons").select("tanggal, volume, nilai, fuel_types(nama)").is("deleted_at", null).in("status", ["digunakan", "direalisasikan"]);
    if (from) q = q.gte("tanggal", from);
    if (to) q = q.lte("tanggal", to);
    const { data, error } = await q;
    if (error) throw error;
    const byBulan = {};
    (data || []).forEach((r) => {
      const key = new Date(r.tanggal).toISOString().slice(0, 7);
      if (!byBulan[key]) byBulan[key] = { bulan: key, volume: 0, nilai: 0 };
      byBulan[key].volume += Number(r.volume || 0);
      byBulan[key].nilai += Number(r.nilai || 0);
    });
    return Object.values(byBulan).sort((a, b) => a.bulan.localeCompare(b.bulan));
  }
  async function laporanBbmPerKendaraan() {
    return bbmSummaryPerVehicle();
  }

  // ---------------- Bulk import helpers (dipakai Smart Import) ----------------
  async function bulkUpsertAccounts(profile, rows) {
    const payload = rows.map((r) => ({ kode: r.kode, uraian: r.uraian, jenis_belanja: r.jenis_belanja || null, is_active: true }));
    const { data, error } = await sb().from("accounts").upsert(payload, { onConflict: "kode" }).select();
    if (error) throw error;
    await logAudit("CREATE", "accounts", null, profile.id, null, { count: data.length });
    return data;
  }

  async function bulkCreateVendors(profile, rows) {
    const payload = rows.map((r) => ({ nama: r.nama, npwp: r.npwp || null, kontak: r.kontak || null, alamat: r.alamat || null }));
    const { data, error } = await sb().from("vendors").insert(payload).select();
    if (error) throw error;
    await logAudit("CREATE", "vendors", null, profile.id, null, { count: data.length });
    return data;
  }

  async function bulkUpsertVehicles(profile, rows) {
    const payload = rows.map((r) => ({
      nomor_polisi: r.nomor_polisi, merk: r.merk || null, tipe: r.tipe || null,
      tahun: r.tahun || null, jenis_kendaraan: r.jenis_kendaraan || null,
      kategori: r.kategori || null,
      unit_pengguna: r.unit_pengguna || null, penanggung_jawab: r.penanggung_jawab || null,
      status: "aktif",
    }));
    const { data, error } = await sb().from("vehicles").upsert(payload, { onConflict: "nomor_polisi" }).select();
    if (error) throw error;
    await logAudit("CREATE", "vehicles", null, profile.id, null, { count: data.length });
    return data;
  }

  async function bulkUpsertEquipment(profile, rows) {
    const payload = rows.map((r) => ({
      nomor_aset: r.nomor_aset, nama: r.nama, merk: r.merk || null, tipe: r.tipe || null,
      tahun: r.tahun || null, lokasi: r.lokasi || null, kondisi: r.kondisi || null,
    }));
    const { data, error } = await sb().from("equipment").upsert(payload, { onConflict: "nomor_aset" }).select();
    if (error) throw error;
    await logAudit("CREATE", "equipment", null, profile.id, null, { count: data.length });
    return data;
  }

  // ---------------- Manajemen Pengguna (Pengaturan Akun) ----------------
  async function listUsers() {
    const { data, error } = await sb().from("users").select("*").order("username");
    if (error) throw error;
    return data;
  }

  // Membuat auth user baru TANPA mengganti sesi admin yang sedang login.
  // Menggunakan instance Supabase client terpisah (persistSession: false) khusus untuk signUp ini.
  async function adminCreateUser(admin, { username, full_name, password, role }) {
    const email = `${username.trim().toLowerCase()}@simpelbmd.local`;
    const tempClient = window.supabase.createClient(window.SIMPELBMD.SUPABASE_URL, window.SIMPELBMD.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signUpData, error: signUpError } = await tempClient.auth.signUp({ email, password });
    if (signUpError) throw new Error(signUpError.message.includes("already registered") ? "Username ini sudah terdaftar." : signUpError.message);
    const newUserId = signUpData.user?.id;
    if (!newUserId) throw new Error("Gagal membuat akun baru. Coba lagi.");

    const { data: profileRow, error: insertError } = await sb().from("users").insert({
      id: newUserId, username: username.trim().toLowerCase(), email, full_name, role, is_active: true, created_by: admin.id,
    }).select().single();
    if (insertError) throw insertError;
    await logAudit("CREATE", "users", newUserId, admin.id, null, profileRow);
    return profileRow;
  }

  async function updateUserProfile(admin, userId, patch, before) {
    const { data, error } = await sb().from("users").update({ ...patch, updated_by: admin.id, updated_at: new Date().toISOString() }).eq("id", userId).select().single();
    if (error) throw error;
    await logAudit("UPDATE", "users", userId, admin.id, before, data);
    return data;
  }

  // Verifikasi password lama dengan mencoba signIn di client terpisah, tanpa mengganggu sesi aktif.
  async function verifyCurrentPassword(email, password) {
    const tempClient = window.supabase.createClient(window.SIMPELBMD.SUPABASE_URL, window.SIMPELBMD.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await tempClient.auth.signInWithPassword({ email, password });
    return !error;
  }

  async function changeOwnPassword(newPassword) {
    const { error } = await sb().auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  // ---------------- Audit ----------------
  async function logAudit(activity, table, recordId, performedBy, before, after) {
    try {
      await sb().from("audit_logs").insert({
        activity,
        table_name: table,
        record_id: recordId,
        performed_by: performedBy,
        data_before: before,
        data_after: after,
      });
    } catch (e) {
      // Audit log tidak boleh menggagalkan transaksi utama; cukup catat ke console.
      console.warn("Audit log gagal dicatat:", e.message);
    }
  }

  return {
    ctx,
    listAccounts, quickCreateAccount, updateAccount, deactivateAccount,
    listVendors, quickCreateVendor, updateVendor, softDeleteVendor,
    listFuelTypes, createFuelType,
    listUnits, createUnit,
    listDpa, getDpaDetail, createDpaHeader, updateDpaHeader, softDeleteDpa, replaceDpaDetails, nextNomorDpa,
    getPaguRealisasi, getAnggaranKasBulan,
    listRealisasi, createRealisasi, updateRealisasi, setStatusRealisasi, softDeleteRealisasi, nextNomorTransaksi,
    BULAN_NAMA, listBudgetCashSummary, getCashFlowChart, getBudgetCashRows, upsertBudgetCash,
    listProcurements, getProcurementDetail, nextNomorPengadaan, createProcurement, updateProcurement, softDeleteProcurement,
    listFuelProcurements, nextNomorPengadaanBbm, createFuelProcurement, updateFuelProcurement, softDeleteFuelProcurement,
    listVehicles, createVehicle, updateVehicle, softDeleteVehicle,
    listFuelCoupons, getLastKilometer, nextNomorKupon, createFuelCoupon, updateFuelCoupon, setStatusFuelCoupon, softDeleteFuelCoupon, bbmSummaryPerVehicle, listVehicleCategoryRates,
    listEquipment, createEquipment, updateEquipment, softDeleteEquipment,
    listMaintenanceVehicle, nextNomorPemeliharaan, createMaintenanceVehicle, updateMaintenanceVehicle, softDeleteMaintenanceVehicle,
    listMaintenanceEquipment, nextNomorPemeliharaanPeralatan, createMaintenanceEquipment, updateMaintenanceEquipment, softDeleteMaintenanceEquipment,
    laporanAnggaranRealisasi, laporanPemeliharaanKendaraan, laporanBbmBulanan, laporanBbmPerKendaraan,
    bulkUpsertAccounts, bulkCreateVendors, bulkUpsertVehicles, bulkUpsertEquipment,
    listUsers, adminCreateUser, updateUserProfile, verifyCurrentPassword, changeOwnPassword,
  };
})();

window.DATA = DATA;
