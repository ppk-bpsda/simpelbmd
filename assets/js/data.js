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
    listAccounts, quickCreateAccount,
    listVendors, quickCreateVendor,
    listFuelTypes,
    listDpa, getDpaDetail, createDpaHeader, updateDpaHeader, softDeleteDpa, replaceDpaDetails, nextNomorDpa,
    getPaguRealisasi, getAnggaranKasBulan,
    listRealisasi, createRealisasi, updateRealisasi, setStatusRealisasi, softDeleteRealisasi, nextNomorTransaksi,
    BULAN_NAMA, listBudgetCashSummary, getCashFlowChart, getBudgetCashRows, upsertBudgetCash,
    listProcurements, getProcurementDetail, nextNomorPengadaan, createProcurement, updateProcurement, softDeleteProcurement,
    listFuelProcurements, nextNomorPengadaanBbm, createFuelProcurement, updateFuelProcurement, softDeleteFuelProcurement,
  };
})();

window.DATA = DATA;
