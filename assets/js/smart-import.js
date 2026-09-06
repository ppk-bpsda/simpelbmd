/* ==========================================================================
   SIMPELBMD — Smart Import Engine
   Modul generik untuk mengunggah Excel/CSV ke modul mana pun. Sistem secara
   otomatis mendeteksi kolom yang relevan (walau nama header berbeda-beda,
   mis. "Kode Rek", "Kode Rekening", "account_code") lalu memvalidasi baris
   sebelum disimpan.

   Cara pakai dari modul lain:
     SmartImport.open({
       title: "Import Master Rekening",
       description: "Kolom akan dideteksi otomatis dari file Anda.",
       fields: [
         { key: "kode", label: "Kode Rekening", aliases: ["kode rek","account code"], required: true, type: "text" },
         { key: "uraian", label: "Uraian", required: true, type: "text" },
       ],
       context: {  // opsional: pilihan yang wajib ditentukan sebelum upload
         label: "Pilih DPA Tujuan",
         options: [{ value: "id1", label: "DPA/2026/M/001" }],
       },
       rowHook: (data) => ({ errors: [], patch: {} }), // opsional: validasi/enrichment lanjutan per baris
       onImport: async (rows, contextValue) => { ... simpan ke Supabase ... },
     });
   ========================================================================== */
(() => {
  let modalEl;
  let cfg = null;
  let headers = [];
  let rawRows = [];
  let mapping = {};
  let mappedRows = [];
  let step = "upload"; // upload -> mapping -> preview

  function normalize(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] : 1 + Math.min(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1]);
      }
    }
    return d[m][n];
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.85;
    const dist = levenshtein(a, b);
    return 1 - dist / Math.max(a.length, b.length);
  }

  function autoMapHeaders() {
    mapping = {};
    const used = new Set();
    cfg.fields.forEach((f) => {
      const candidates = [normalize(f.label), ...(f.aliases || []).map(normalize)];
      let bestIdx = -1, bestScore = 0;
      headers.forEach((h, idx) => {
        if (used.has(idx)) return;
        const hNorm = normalize(h);
        if (!hNorm) return;
        const score = Math.max(...candidates.map((c) => similarity(hNorm, c)));
        if (score > bestScore && score >= 0.6) { bestScore = score; bestIdx = idx; }
      });
      mapping[f.key] = bestIdx;
      if (bestIdx >= 0) used.add(bestIdx);
    });
  }

  function el(id) { return modalEl.querySelector("#" + id); }

  function ensureModal() {
    if (modalEl) return;
    modalEl = document.createElement("div");
    modalEl.className = "modal-scrim";
    modalEl.innerHTML = `
      <div class="modal-box modal-wide">
        <div class="modal-head">
          <div><h3 id="si-title">Import Data</h3><div class="m-sub" id="si-desc"></div></div>
          <button class="modal-close" id="si-close">&times;</button>
        </div>
        <div class="modal-body">
          <div id="si-step-upload">
            <div id="si-context-wrap" style="display:none;" class="field">
              <label id="si-context-label"></label>
              <select id="si-context-select"></select>
            </div>
            <div class="field">
              <label>File Excel (.xlsx) atau CSV (.csv)</label>
              <input type="file" id="si-file" accept=".xlsx,.xls,.csv" />
              <div class="hint">Sistem akan otomatis mendeteksi kolom yang sesuai, walau nama header di file Anda berbeda dari nama field aplikasi.</div>
            </div>
            <div class="form-error" id="si-upload-error"></div>
          </div>

          <div id="si-step-mapping" style="display:none;">
            <div class="alert alert-info"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg><div>Periksa pemetaan kolom di bawah. Ubah jika sistem salah mendeteksi.</div></div>
            <div class="detail-rows" id="si-mapping-rows" style="grid-template-columns:1fr;">
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;background:var(--panel-raised);font-size:11px;color:var(--text-3);padding:9px 12px;border-bottom:1px solid var(--line-soft);">
                <div>Field Aplikasi</div><div>Kolom di File Anda</div><div>Contoh Nilai</div>
              </div>
              <div id="si-mapping-body"></div>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:14px;">
              <button class="btn btn-primary btn-sm" id="si-apply-mapping">Lanjut ke Preview</button>
            </div>
          </div>

          <div id="si-step-preview" style="display:none;">
            <div id="si-preview-summary" class="alert alert-info"></div>
            <div class="table-scroll" style="max-height:340px;overflow-y:auto;">
              <table class="data-table" id="si-preview-table"></table>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <span class="foot-note" id="si-foot-note"></span>
          <button class="btn btn-ghost btn-sm" id="si-back">Kembali</button>
          <button class="btn btn-ghost btn-sm" id="si-cancel">Batal</button>
          <button class="btn btn-primary btn-sm" id="si-confirm" style="display:none;" disabled>Konfirmasi Import</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    el("si-close").addEventListener("click", close);
    el("si-cancel").addEventListener("click", close);
    el("si-file").addEventListener("change", handleFile);
    el("si-apply-mapping").addEventListener("click", () => { readMappingFromUI(); applyMappingAndValidate(); showStep("preview"); });
    el("si-confirm").addEventListener("click", confirmImport);
    el("si-back").addEventListener("click", () => {
      if (step === "preview") showStep("mapping");
      else if (step === "mapping") showStep("upload");
    });
  }

  function showStep(s) {
    step = s;
    el("si-step-upload").style.display = s === "upload" ? "block" : "none";
    el("si-step-mapping").style.display = s === "mapping" ? "block" : "none";
    el("si-step-preview").style.display = s === "preview" ? "block" : "none";
    el("si-back").style.display = s === "upload" ? "none" : "inline-flex";
    el("si-confirm").style.display = s === "preview" ? "inline-flex" : "none";
  }

  function handleFile(e) {
    const file = e.target.files[0];
    el("si-upload-error").classList.remove("show");
    if (!file) return;
    if (cfg.context) {
      const ctxVal = el("si-context-select").value;
      if (!ctxVal) {
        el("si-upload-error").textContent = "Pilih " + cfg.context.label.toLowerCase() + " terlebih dahulu.";
        el("si-upload-error").classList.add("show");
        e.target.value = "";
        return;
      }
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        headers = (aoa[0] || []).map((h) => String(h).trim());
        rawRows = aoa.slice(1).filter((r) => r.some((c) => String(c).trim() !== ""));
        if (!rawRows.length) {
          el("si-upload-error").textContent = "File tidak berisi data. Pastikan baris pertama adalah header kolom.";
          el("si-upload-error").classList.add("show");
          return;
        }
        autoMapHeaders();
        renderMappingUI();
        showStep("mapping");
      } catch (err) {
        el("si-upload-error").textContent = "Gagal membaca file: " + err.message;
        el("si-upload-error").classList.add("show");
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function renderMappingUI() {
    el("si-mapping-body").innerHTML = cfg.fields.map((f) => {
      const idx = mapping[f.key];
      const sample = idx >= 0 && rawRows[0] ? rawRows[0][idx] : "";
      const options = `<option value="-1">— Tidak dipetakan —</option>` + headers.map((h, i) => `<option value="${i}" ${i === idx ? "selected" : ""}>${h || "(kolom " + (i + 1) + ")"}</option>`).join("");
      return `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:9px 12px;border-bottom:1px solid var(--line-soft);align-items:center;">
          <div style="font-size:13.5px;color:var(--text-1);">${f.label}${f.required ? ' <span style="color:var(--bad);">*</span>' : ""}</div>
          <select class="si-map-select" data-key="${f.key}">${options}</select>
          <div style="font-size:12.5px;color:var(--text-3);" class="si-sample" data-key="${f.key}">${sample}</div>
        </div>`;
    }).join("");
    modalEl.querySelectorAll(".si-map-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const key = sel.dataset.key;
        const idx = parseInt(sel.value, 10);
        mapping[key] = idx;
        const sample = idx >= 0 && rawRows[0] ? rawRows[0][idx] : "";
        modalEl.querySelector(`.si-sample[data-key="${key}"]`).textContent = sample;
      });
    });
  }

  function readMappingFromUI() {
    modalEl.querySelectorAll(".si-map-select").forEach((sel) => { mapping[sel.dataset.key] = parseInt(sel.value, 10); });
  }

  function coerce(val, type) {
    if (val === undefined || val === null || val === "") return undefined;
    if (type === "number") { const n = parseFloat(String(val).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? undefined : n; }
    if (type === "date") {
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      const d = new Date(val);
      return isNaN(d.getTime()) ? String(val).trim() : d.toISOString().slice(0, 10);
    }
    return String(val).trim();
  }

  function applyMappingAndValidate() {
    mappedRows = rawRows.map((rowArr) => {
      const data = {};
      const errors = [];
      cfg.fields.forEach((f) => {
        const idx = mapping[f.key];
        const raw = idx >= 0 ? rowArr[idx] : undefined;
        const val = coerce(raw, f.type);
        if (f.required && val === undefined) errors.push(`${f.label} kosong`);
        data[f.key] = val;
      });
      if (!errors.length && cfg.rowHook) {
        const result = cfg.rowHook(data) || {};
        if (result.errors?.length) errors.push(...result.errors);
        if (result.patch) Object.assign(data, result.patch);
      }
      return { data, errors, valid: errors.length === 0 };
    });
    renderPreview();
  }

  function renderPreview() {
    const validCount = mappedRows.filter((r) => r.valid).length;
    el("si-preview-summary").innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg><div>${mappedRows.length} baris ditemukan · <strong>${validCount} valid</strong> · ${mappedRows.length - validCount} bermasalah.</div>`;

    const table = el("si-preview-table");
    const cols = cfg.fields.map((f) => f.label);
    table.innerHTML = `
      <thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}<th>Status</th></tr></thead>
      <tbody>${mappedRows.map((r) => `
        <tr>
          ${cfg.fields.map((f) => `<td>${r.data[f.key] ?? "-"}</td>`).join("")}
          <td>${r.valid ? '<span class="badge badge-ok">Valid</span>' : `<span class="badge badge-bad" title="${r.errors.join(", ")}">Error</span>`}</td>
        </tr>`).join("")}</tbody>`;

    el("si-confirm").disabled = validCount === 0;
    el("si-foot-note").textContent = mappedRows.length - validCount > 0 ? "Baris bermasalah akan dilewati saat import." : "";
  }

  async function confirmImport() {
    const validRows = mappedRows.filter((r) => r.valid).map((r) => r.data);
    if (!validRows.length) return;
    const btn = el("si-confirm");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Mengimpor…';
    try {
      const contextValue = cfg.context ? el("si-context-select").value : null;
      await cfg.onImport(validRows, contextValue);
      window.SIMPELBMD_UI.toast(`${validRows.length} baris berhasil diimpor.`);
      close();
      if (cfg.afterImport) cfg.afterImport();
    } catch (e) {
      window.SIMPELBMD_UI.toast("Import gagal: " + e.message, "bad");
      btn.disabled = false;
      btn.textContent = "Konfirmasi Import";
    }
  }

  function close() {
    modalEl.classList.remove("show");
    el("si-file").value = "";
    el("si-upload-error").classList.remove("show");
  }

  function open(config) {
    ensureModal();
    cfg = config;
    headers = []; rawRows = []; mapping = {}; mappedRows = [];
    el("si-title").textContent = config.title || "Import Data";
    el("si-desc").textContent = config.description || "";
    el("si-confirm").textContent = "Konfirmasi Import";
    if (config.context) {
      el("si-context-wrap").style.display = "block";
      el("si-context-label").textContent = config.context.label;
      el("si-context-select").innerHTML = `<option value="">Pilih…</option>` + config.context.options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
    } else {
      el("si-context-wrap").style.display = "none";
    }
    showStep("upload");
    modalEl.classList.add("show");
  }

  window.SmartImport = { open };
})();
