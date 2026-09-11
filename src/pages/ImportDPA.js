import { listOpd } from '../services/opdService.js';
import {
  parseSpreadsheetFile, suggestColumnMapping, applyMappingAndValidate,
  commitDpaImport, downloadDpaTemplate, DPA_TARGET_FIELDS,
} from '../services/importService.js';
import {
  parseDpaDokumenFile, suggestDpaDokumenMapping, applyDpaDokumenMappingAndValidate,
  commitDpaDokumenImport, DPA_DOKUMEN_TARGET_FIELDS,
} from '../services/dpaDokumenService.js';
import { formatRupiah } from '../utils/format.js';
import { showToast } from '../utils/ui.js';

const STEPS = ['Unggah File', 'Mapping Kolom', 'Preview & Validasi', 'Hasil Import'];

export async function renderImportDPA(root, ctx) {
  const { tahunAnggaranId, profile } = ctx;
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  const pageState = { tab: 'rincian' };

  async function drawTabs() {
    root.innerHTML = `
      <div class="tabs" style="display:flex;gap:8px;margin-bottom:14px;">
        <button class="btn ${pageState.tab === 'rincian' ? 'btn-solid' : 'btn-outline'}" id="tab-rincian">Rincian Belanja (Kegiatan/Sub Kegiatan)</button>
        <button class="btn ${pageState.tab === 'header' ? 'btn-solid' : 'btn-outline'}" id="tab-header">Informasi Header DPA</button>
      </div>
      <div id="tab-slot"></div>
    `;
    root.querySelector('#tab-rincian').addEventListener('click', () => { pageState.tab = 'rincian'; drawTabs(); });
    root.querySelector('#tab-header').addEventListener('click', () => { pageState.tab = 'header'; drawTabs(); });

    const slot = root.querySelector('#tab-slot');
    if (pageState.tab === 'rincian') await renderImportDpaRincian(slot, { tahunAnggaranId, profile });
    else await renderImportDpaHeader(slot, { tahunAnggaranId, profile });
  }

  await drawTabs();
}

async function renderImportDpaRincian(root, { tahunAnggaranId, profile }) {
  const state = {
    step: 0,
    file: null,
    headers: [],
    rawRows: [],
    mapping: {},
    validated: [],
    opdId: profile.role === 'super_admin' ? '' : profile.opd_id,
    opdOptions: [],
    importing: false,
    summary: null,
  };

  if (profile.role === 'super_admin') {
    try { state.opdOptions = await listOpd(); } catch (e) { /* non-fatal */ }
  }

  function draw() {
    root.innerHTML = `
      <div class="toolbar">
        <div>
          <div class="toolbar__title">Import DPA</div>
          <div class="toolbar__subtitle">Kegiatan → Sub Kegiatan → Belanja → Pagu, dari file Excel/CSV</div>
        </div>
        <div class="toolbar__actions">
          <button class="btn btn-outline" id="btn-template">⬇ Unduh Template Excel</button>
        </div>
      </div>
      <div class="stepper-nav">
        ${STEPS.map((s, i) => `<div class="stepper-nav__item ${i === state.step ? 'is-active' : i < state.step ? 'is-done' : ''}">${i + 1}. ${s}</div>`).join('')}
      </div>
      <div class="panel" id="step-slot"></div>
    `;

    root.querySelector('#btn-template').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Menyiapkan...';
      try {
        await downloadDpaTemplate();
      } catch (err) {
        showToast('Gagal membuat template. Silakan coba lagi.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });

    const slot = root.querySelector('#step-slot');
    if (state.step === 0) drawUploadStep(slot);
    else if (state.step === 1) drawMappingStep(slot);
    else if (state.step === 2) drawPreviewStep(slot);
    else drawResultStep(slot);
  }

  // ------------------------------------------------------
  // STEP 0: Upload + pilih OPD tujuan (§8 UPLOAD -> VALIDASI FILE)
  // ------------------------------------------------------
  function drawUploadStep(slot) {
    const opdFieldHtml = profile.role === 'super_admin'
      ? `<div class="field" style="max-width:420px;">
          <label>OPD Tujuan</label>
          <select id="opd-select">
            <option value="">— Pilih OPD —</option>
            ${state.opdOptions.map((o) => `<option value="${o.id}" ${o.id === state.opdId ? 'selected' : ''}>${escapeHtml(o.nama_opd)}</option>`).join('')}
          </select>
        </div>`
      : `<div class="alert alert--info" style="max-width:420px;">Import akan ditujukan untuk OPD Anda.</div>`;

    slot.innerHTML = `
      ${opdFieldHtml}
      <div style="height:14px;"></div>
      <div class="dropzone" id="dropzone">
        <strong>Seret file ke sini atau klik untuk memilih</strong>
        Format didukung: .xlsx, .xls, .csv (maks. 10MB)
        <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display:none;" />
      </div>
      <div id="upload-alert"></div>
    `;

    if (profile.role === 'super_admin') {
      slot.querySelector('#opd-select').addEventListener('change', (e) => { state.opdId = e.target.value; });
    }

    const dropzone = slot.querySelector('#dropzone');
    const fileInput = slot.querySelector('#file-input');
    const alertSlot = slot.querySelector('#upload-alert');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    async function handleFile(file) {
      if (!state.opdId) {
        alertSlot.innerHTML = `<div class="alert alert--warning">Pilih OPD tujuan terlebih dahulu.</div>`;
        return;
      }
      alertSlot.innerHTML = `<div class="alert alert--info">Membaca file...</div>`;
      try {
        const { headers, rows } = await parseSpreadsheetFile(file);
        state.file = file;
        state.headers = headers;
        state.rawRows = rows;
        state.mapping = suggestColumnMapping(headers);
        state.step = 1;
        draw();
      } catch (err) {
        alertSlot.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
      }
    }
  }

  // ------------------------------------------------------
  // STEP 1: Mapping kolom (§34) - user dapat menyesuaikan saran mapping
  // ------------------------------------------------------
  function drawMappingStep(slot) {
    slot.innerHTML = `
      <p style="font-size:13.5px;color:var(--gray-500);margin-top:0;">
        File <b>${escapeHtml(state.file?.name || '')}</b> memiliki ${state.rawRows.length} baris data.
        Cocokkan kolom pada file Anda dengan field yang dibutuhkan sistem.
      </p>
      <div class="mapping-grid">
        ${DPA_TARGET_FIELDS.map((f) => `
          <div class="mapping-row">
            <label>${f.label}</label>
            <select data-field="${f.key}">
              <option value="">— Tidak dipetakan —</option>
              ${state.headers.map((h) => `<option value="${escapeAttr(h)}" ${state.mapping[f.key] === h ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button class="btn btn-outline" id="btn-back">← Kembali</button>
        <button class="btn btn-solid" id="btn-next">Lanjut ke Preview →</button>
      </div>
    `;

    slot.querySelectorAll('[data-field]').forEach((sel) => {
      sel.addEventListener('change', (e) => { state.mapping[sel.dataset.field] = e.target.value; });
    });
    slot.querySelector('#btn-back').addEventListener('click', () => { state.step = 0; draw(); });
    slot.querySelector('#btn-next').addEventListener('click', () => {
      const requiredMissing = DPA_TARGET_FIELDS.filter((f) => !state.mapping[f.key]);
      if (requiredMissing.length) {
        showToast(`Kolom berikut belum dipetakan: ${requiredMissing.map((f) => f.label).join(', ')}`, 'warning');
        return;
      }
      state.validated = applyMappingAndValidate(state.rawRows, state.mapping);
      state.step = 2;
      draw();
    });
  }

  // ------------------------------------------------------
  // STEP 2: Preview + tampilkan error per baris (§8 PREVIEW -> VALIDASI -> ERROR)
  // ------------------------------------------------------
  function drawPreviewStep(slot) {
    const validCount = state.validated.filter((r) => r.valid).length;
    const errorRows = state.validated.filter((r) => !r.valid);

    slot.innerHTML = `
      <div class="summary-grid" style="margin-bottom:18px;">
        <div class="summary-chip" style="background:var(--status-safe-bg);"><div class="summary-chip__value" style="color:var(--status-safe);">${validCount}</div><div class="summary-chip__label">Baris Valid</div></div>
        <div class="summary-chip" style="background:var(--status-critical-bg);"><div class="summary-chip__value" style="color:var(--status-critical);">${errorRows.length}</div><div class="summary-chip__label">Baris Bermasalah</div></div>
        <div class="summary-chip" style="background:var(--gray-100);"><div class="summary-chip__value">${state.validated.length}</div><div class="summary-chip__label">Total Baris</div></div>
      </div>

      ${errorRows.length ? `
        <div class="panel__title" style="margin-bottom:10px;">Baris Bermasalah (tidak akan diimpor)</div>
        <div class="table-scroll" style="margin-bottom:20px;">
          <table class="data-table">
            <thead><tr><th>Baris</th><th>Alasan</th></tr></thead>
            <tbody>
              ${errorRows.slice(0, 50).map((r) => `<tr><td>${r.rowNumber}</td><td style="color:var(--status-critical);">${r.errors.join('; ')}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${errorRows.length > 50 ? `<p style="font-size:12.5px;color:var(--gray-500);">Menampilkan 50 dari ${errorRows.length} baris bermasalah.</p>` : ''}
      ` : ''}

      <div class="panel__title" style="margin-bottom:10px;">Preview Data Valid (akan diimpor)</div>
      <div class="table-scroll" style="margin-bottom:20px;">
        <table class="data-table">
          <thead><tr><th>Kegiatan</th><th>Sub Kegiatan</th><th>Kode Rekening</th><th>Nama Belanja</th><th>Kelompok</th><th class="num">Pagu</th></tr></thead>
          <tbody>
            ${state.validated.filter((r) => r.valid).slice(0, 50).map((r) => `
              <tr>
                <td>${escapeHtml(r.normalized.kode_kegiatan)}</td>
                <td>${escapeHtml(r.normalized.kode_sub_kegiatan)}</td>
                <td>${escapeHtml(r.normalized.kode_rekening)}</td>
                <td>${escapeHtml(r.normalized.nama_belanja)}</td>
                <td>${escapeHtml(r.normalized.kelompok)}</td>
                <td class="num">${formatRupiah(r.normalized.pagu)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${validCount > 50 ? `<p style="font-size:12.5px;color:var(--gray-500);">Menampilkan 50 dari ${validCount} baris valid.</p>` : ''}

      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn btn-outline" id="btn-back">← Kembali ke Mapping</button>
        <button class="btn btn-solid" id="btn-confirm" ${validCount === 0 ? 'disabled' : ''}>
          Konfirmasi & Import ${validCount} Baris
        </button>
      </div>
    `;

    slot.querySelector('#btn-back').addEventListener('click', () => { state.step = 1; draw(); });
    slot.querySelector('#btn-confirm').addEventListener('click', async () => {
      state.importing = true;
      slot.querySelector('#btn-confirm').disabled = true;
      slot.querySelector('#btn-confirm').textContent = 'Mengimpor...';
      try {
        state.summary = await commitDpaImport({
          tahunAnggaranId,
          opdId: state.opdId,
          validatedRows: state.validated,
          fileName: state.file?.name || '(tidak diketahui)',
          userId: profile.id,
        });
        state.step = 3;
        draw();
      } catch (err) {
        showToast('Import gagal: ' + err.message, 'error');
        slot.querySelector('#btn-confirm').disabled = false;
        slot.querySelector('#btn-confirm').textContent = `Konfirmasi & Import ${validCount} Baris`;
      }
    });
  }

  // ------------------------------------------------------
  // STEP 3: Hasil import (§8 IMPORT KE DATABASE -> LOG IMPORT -> SELESAI)
  // ------------------------------------------------------
  function drawResultStep(slot) {
    const s = state.summary;
    slot.innerHTML = `
      <div class="alert alert--info" style="background:var(--status-safe-bg);color:var(--status-safe);">
        Import selesai dan telah dicatat pada Audit/Import Log.
      </div>
      <div class="summary-grid" style="margin:16px 0;">
        <div class="summary-chip" style="background:var(--status-safe-bg);"><div class="summary-chip__value" style="color:var(--status-safe);">${s.baru}</div><div class="summary-chip__label">Data Baru</div></div>
        <div class="summary-chip" style="background:var(--status-info-bg);"><div class="summary-chip__value" style="color:var(--status-info);">${s.diperbarui}</div><div class="summary-chip__label">Diperbarui</div></div>
        <div class="summary-chip" style="background:var(--gray-100);"><div class="summary-chip__value">${s.tidak_berubah}</div><div class="summary-chip__label">Tidak Berubah</div></div>
        <div class="summary-chip" style="background:var(--status-warning-bg);"><div class="summary-chip__value" style="color:var(--status-warning);">${s.duplikat}</div><div class="summary-chip__label">Duplikat</div></div>
        <div class="summary-chip" style="background:var(--status-critical-bg);"><div class="summary-chip__value" style="color:var(--status-critical);">${s.error}</div><div class="summary-chip__label">Error</div></div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-solid" id="btn-new">Import File Lain</button>
      </div>
    `;
    slot.querySelector('#btn-new').addEventListener('click', () => {
      state.step = 0; state.file = null; state.headers = []; state.rawRows = [];
      state.mapping = {}; state.validated = []; state.summary = null;
      draw();
    });
  }

  draw();
}

// ============================================================
// TAB: Informasi Header DPA — untuk file ringkasan/registrasi DPA
// (Nomor DPA, Tanggal Penetapan, Tahapan, Jumlah Rincian, Total
// Pagu, Status) seperti hasil unduhan dari aplikasi e-budgeting.
//
// Alur sengaja lebih ringkas (tanpa mapping kolom manual — hanya
// 6 kolom tetap) dan disimpan ke tabel terpisah `dpa_dokumen`.
// TIDAK PERNAH menyentuh data Kegiatan/Sub Kegiatan/Belanja.
// ============================================================
async function renderImportDpaHeader(root, { tahunAnggaranId, profile }) {
  const state = {
    step: 0, file: null, headers: [], rawRows: [], mapping: {}, validated: [],
    opdId: profile.role === 'super_admin' ? '' : profile.opd_id,
    opdOptions: [], summary: null,
  };

  if (profile.role === 'super_admin') {
    try { state.opdOptions = await listOpd(); } catch (e) { /* non-fatal */ }
  }

  function draw() {
    root.innerHTML = `
      <div class="panel">
        <div class="panel__title" style="margin-bottom:6px;">Informasi Header DPA</div>
        <p style="font-size:13px;color:var(--gray-500);margin-top:0;">
          Untuk file ringkasan/registrasi DPA (Nomor DPA, Tanggal Penetapan, Tahapan, Jumlah Rincian, Total Pagu, Status).
          Data ini disimpan terpisah dan <b>tidak mengubah</b> data Kegiatan/Sub Kegiatan/Belanja yang sudah Anda isi.
        </p>
        <div id="header-step-slot"></div>
      </div>
    `;
    const slot = root.querySelector('#header-step-slot');
    if (state.step === 0) drawUploadStep(slot);
    else if (state.step === 1) drawPreviewStep(slot);
    else drawResultStep(slot);
  }

  function drawUploadStep(slot) {
    const opdFieldHtml = profile.role === 'super_admin'
      ? `<div class="field" style="max-width:420px;">
          <label>OPD Tujuan</label>
          <select id="opd-select">
            <option value="">— Pilih OPD —</option>
            ${state.opdOptions.map((o) => `<option value="${o.id}" ${o.id === state.opdId ? 'selected' : ''}>${escapeHtml(o.nama_opd)}</option>`).join('')}
          </select>
        </div>`
      : `<div class="alert alert--info" style="max-width:420px;">Import akan ditujukan untuk OPD Anda.</div>`;

    slot.innerHTML = `
      ${opdFieldHtml}
      <div style="height:14px;"></div>
      <div class="dropzone" id="dropzone">
        <strong>Seret file ke sini atau klik untuk memilih</strong>
        Format didukung: .xlsx, .xls, .csv (maks. 10MB). Kolom dikenali otomatis: Nomor DPA, Tanggal Penetapan, Tahapan, Jumlah Rincian, Total Pagu, Status.
        <input type="file" id="file-input" accept=".xlsx,.xls,.csv" style="display:none;" />
      </div>
      <div id="upload-alert"></div>
    `;

    if (profile.role === 'super_admin') {
      slot.querySelector('#opd-select').addEventListener('change', (e) => { state.opdId = e.target.value; });
    }

    const dropzone = slot.querySelector('#dropzone');
    const fileInput = slot.querySelector('#file-input');
    const alertSlot = slot.querySelector('#upload-alert');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });

    async function handleFile(file) {
      if (!state.opdId) {
        alertSlot.innerHTML = `<div class="alert alert--warning">Pilih OPD tujuan terlebih dahulu.</div>`;
        return;
      }
      alertSlot.innerHTML = `<div class="alert alert--info">Membaca file...</div>`;
      try {
        const { headers, rows } = await parseDpaDokumenFile(file);
        const mapping = suggestDpaDokumenMapping(headers);
        const missing = DPA_DOKUMEN_TARGET_FIELDS.filter((f) => f.key !== 'tahapan' && f.key !== 'status' && !mapping[f.key]);
        if (missing.length) {
          alertSlot.innerHTML = `<div class="alert alert--error">Kolom berikut tidak ditemukan di file: ${missing.map((f) => f.label).join(', ')}. Pastikan header kolom sesuai (mis. "Nomor DPA", "Tanggal Penetapan").</div>`;
          return;
        }
        state.file = file;
        state.headers = headers;
        state.rawRows = rows;
        state.mapping = mapping;
        state.validated = applyDpaDokumenMappingAndValidate(rows, mapping);
        state.step = 1;
        draw();
      } catch (err) {
        alertSlot.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
      }
    }
  }

  function drawPreviewStep(slot) {
    const validRows = state.validated.filter((r) => r.valid);
    const errorRows = state.validated.filter((r) => !r.valid);

    slot.innerHTML = `
      <div class="summary-grid" style="margin-bottom:18px;">
        <div class="summary-chip" style="background:var(--status-safe-bg);"><div class="summary-chip__value" style="color:var(--status-safe);">${validRows.length}</div><div class="summary-chip__label">Baris Valid</div></div>
        <div class="summary-chip" style="background:var(--status-critical-bg);"><div class="summary-chip__value" style="color:var(--status-critical);">${errorRows.length}</div><div class="summary-chip__label">Baris Bermasalah</div></div>
        <div class="summary-chip" style="background:var(--gray-100);"><div class="summary-chip__value">${state.validated.length}</div><div class="summary-chip__label">Total Baris</div></div>
      </div>
      ${errorRows.length ? `
        <div class="panel__title" style="margin-bottom:10px;">Baris Bermasalah</div>
        <div class="table-scroll" style="margin-bottom:20px;">
          <table class="data-table">
            <thead><tr><th>Baris</th><th>Alasan</th></tr></thead>
            <tbody>${errorRows.map((r) => `<tr><td>${r.rowNumber}</td><td style="color:var(--status-critical);">${r.errors.join('; ')}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : ''}
      <div class="panel__title" style="margin-bottom:10px;">Preview (akan disimpan)</div>
      <div class="table-scroll" style="margin-bottom:20px;">
        <table class="data-table">
          <thead><tr><th>Nomor DPA</th><th>Tanggal Penetapan</th><th>Tahapan</th><th>Jumlah Rincian</th><th class="num">Total Pagu</th><th>Status</th></tr></thead>
          <tbody>
            ${validRows.map((r) => `
              <tr>
                <td>${escapeHtml(r.normalized.nomor_dpa)}</td>
                <td>${escapeHtml(r.normalized.tanggal_penetapan || '-')}</td>
                <td>${escapeHtml(r.normalized.tahapan || '-')}</td>
                <td>${r.normalized.jumlah_rincian ?? '-'}</td>
                <td class="num">${formatRupiah(r.normalized.total_pagu || 0)}</td>
                <td>${escapeHtml(r.normalized.status || '-')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn btn-outline" id="btn-back">← Kembali</button>
        <button class="btn btn-solid" id="btn-confirm" ${validRows.length === 0 ? 'disabled' : ''}>Konfirmasi &amp; Simpan ${validRows.length} Baris</button>
      </div>
    `;

    slot.querySelector('#btn-back').addEventListener('click', () => { state.step = 0; draw(); });
    slot.querySelector('#btn-confirm').addEventListener('click', async () => {
      const btn = slot.querySelector('#btn-confirm');
      btn.disabled = true;
      btn.textContent = 'Menyimpan...';
      try {
        state.summary = await commitDpaDokumenImport({
          tahunAnggaranId,
          opdId: state.opdId,
          validatedRows: state.validated,
          fileName: state.file?.name || '(tidak diketahui)',
          userId: profile.id,
        });
        state.step = 2;
        draw();
      } catch (err) {
        showToast('Gagal menyimpan: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = `Konfirmasi & Simpan ${validRows.length} Baris`;
      }
    });
  }

  function drawResultStep(slot) {
    const s = state.summary;
    slot.innerHTML = `
      <div class="alert alert--info" style="background:var(--status-safe-bg);color:var(--status-safe);">
        Informasi header DPA berhasil disimpan (data Kegiatan/Sub Kegiatan/Belanja tidak diubah).
      </div>
      <div class="summary-grid" style="margin:16px 0;">
        <div class="summary-chip" style="background:var(--status-safe-bg);"><div class="summary-chip__value" style="color:var(--status-safe);">${s.baru}</div><div class="summary-chip__label">Baru</div></div>
        <div class="summary-chip" style="background:var(--status-info-bg);"><div class="summary-chip__value" style="color:var(--status-info);">${s.diperbarui}</div><div class="summary-chip__label">Diperbarui</div></div>
        <div class="summary-chip" style="background:var(--gray-100);"><div class="summary-chip__value">${s.tidak_berubah}</div><div class="summary-chip__label">Tidak Berubah</div></div>
        <div class="summary-chip" style="background:var(--status-critical-bg);"><div class="summary-chip__value" style="color:var(--status-critical);">${s.error}</div><div class="summary-chip__label">Error</div></div>
      </div>
      <div style="display:flex;gap:10px;">
        <button class="btn btn-solid" id="btn-new">Import File Lain</button>
      </div>
    `;
    slot.querySelector('#btn-new').addEventListener('click', () => {
      state.step = 0; state.file = null; state.headers = []; state.rawRows = [];
      state.mapping = {}; state.validated = []; state.summary = null;
      draw();
    });
  }

  draw();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
