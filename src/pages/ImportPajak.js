import { listOpd } from '../services/opdService.js';
import {
  parsePajakFile, commitPajakRegisterImport,
  suggestPajakColumnMapping, applyPajakFlatMapping, commitPajakFlatImport,
  PAJAK_TARGET_FIELDS, pajakRequiredFields,
} from '../services/importPajakService.js';
import { formatRupiah, formatDate } from '../utils/format.js';
import { showToast } from '../utils/ui.js';

export async function renderImportPajak(root, { tahunAnggaranId, profile }) {
  if (!tahunAnggaranId) {
    root.innerHTML = `<div class="panel"><div class="empty-state"><strong>Belum ada Tahun Anggaran aktif</strong>Tambahkan Tahun Anggaran terlebih dahulu.</div></div>`;
    return;
  }

  const state = {
    step: 0, file: null, isRegisterFormat: false,
    candidates: [], skipped: [],
    headers: [], rawRows: [], mapping: {}, validated: [],
    opdId: profile.role === 'super_admin' ? '' : profile.opd_id,
    opdOptions: [], summary: null,
  };

  if (profile.role === 'super_admin') {
    try { state.opdOptions = await listOpd(); } catch (e) { /* non-fatal */ }
  }

  function stepsFor() {
    return state.isRegisterFormat
      ? ['Unggah File', 'Preview & Konfirmasi', 'Hasil Import']
      : ['Unggah File', 'Mapping Kolom', 'Preview & Validasi', 'Hasil Import'];
  }

  function draw() {
    const steps = stepsFor();
    root.innerHTML = `
      <div class="toolbar">
        <div>
          <div class="toolbar__title">Import Pajak &amp; Perijinan</div>
          <div class="toolbar__subtitle">Register kendaraan + jatuh tempo pajak, atau tabel transaksi pajak biasa</div>
        </div>
      </div>
      <div class="stepper-nav">
        ${steps.map((s, i) => `<div class="stepper-nav__item ${i === state.step ? 'is-active' : i < state.step ? 'is-done' : ''}">${i + 1}. ${s}</div>`).join('')}
      </div>
      <div class="panel" id="step-slot"></div>
    `;

    const slot = root.querySelector('#step-slot');
    if (state.step === 0) drawUploadStep(slot);
    else if (state.isRegisterFormat) {
      if (state.step === 1) drawRegisterPreviewStep(slot);
      else drawRegisterResultStep(slot);
    } else {
      if (state.step === 1) drawMappingStep(slot);
      else if (state.step === 2) drawFlatPreviewStep(slot);
      else drawFlatResultStep(slot);
    }
  }

  // ------------------------------------------------------
  // STEP 0: Upload
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
        Format didukung: .xlsx, .xls, .csv (maks. 10MB).
        File "Daftar/Register Pembayaran Pajak Kendaraan Bermotor" (format instansi, dengan kolom Nopol,
        Merk/Type, No Rangka/Mesin, Tanggal Jatuh Tempo Pajak, dan Ket. Bayar per tahun) dikenali otomatis —
        semua sheet yang cocok akan digabung, tanpa perlu mapping kolom manual.
        Format tabel transaksi biasa (Nopol, Jenis, Tanggal, Nilai, dst.) tetap didukung lewat mapping manual.
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
        const parsed = await parsePajakFile(file);
        state.file = file;
        state.isRegisterFormat = parsed.isRegisterFormat;

        if (parsed.isRegisterFormat) {
          state.candidates = parsed.candidates;
          state.skipped = parsed.skipped;
          state.uploadNotice = `Format Register Kendaraan terdeteksi otomatis pada sheet: ${parsed.sheetNames.map(escapeHtml).join(', ')}. `
            + `${new Set(parsed.candidates.map((c) => c.nopol)).size} kendaraan ditemukan, `
            + `${parsed.candidates.filter((c) => c.tipe === 'historis').length} riwayat pembayaran, `
            + `${parsed.candidates.filter((c) => c.tipe === 'proyeksi').length} perkiraan jatuh tempo berikutnya.`;
        } else {
          state.headers = parsed.headers;
          state.rawRows = parsed.rows;
          state.mapping = suggestPajakColumnMapping(parsed.headers);
          state.uploadNotice = 'Format Register Kendaraan tidak terdeteksi — menggunakan mode mapping kolom manual untuk tabel transaksi biasa.';
        }

        state.step = 1;
        draw();
      } catch (err) {
        alertSlot.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
      }
    }
  }

  // ------------------------------------------------------
  // MODE REGISTER — STEP 1: Preview & konfirmasi (tanpa mapping manual)
  // ------------------------------------------------------
  function drawRegisterPreviewStep(slot) {
    const valid = state.candidates.filter((c) => c.valid);
    const invalid = state.candidates.filter((c) => !c.valid);
    const historis = valid.filter((c) => c.tipe === 'historis');
    const proyeksi = valid.filter((c) => c.tipe === 'proyeksi');

    slot.innerHTML = `
      ${state.uploadNotice ? `<div class="alert alert--info" style="margin-bottom:14px;">${state.uploadNotice}</div>` : ''}
      <div class="summary-grid" style="margin-bottom:18px;">
        <div class="summary-chip" style="background:var(--status-safe-bg);"><div class="summary-chip__value" style="color:var(--status-safe);">${historis.length}</div><div class="summary-chip__label">Riwayat "Sudah Bayar"</div></div>
        <div class="summary-chip" style="background:var(--status-warning-bg);"><div class="summary-chip__value" style="color:var(--status-warning);">${proyeksi.length}</div><div class="summary-chip__label">Perkiraan Jatuh Tempo Berikutnya</div></div>
        <div class="summary-chip" style="background:var(--status-critical-bg);"><div class="summary-chip__value" style="color:var(--status-critical);">${invalid.length + state.skipped.length}</div><div class="summary-chip__label">Bermasalah / Dilewati</div></div>
      </div>

      <div class="alert alert--warning" style="margin-bottom:16px;">
        File ini tidak berisi Nilai (Rp) dan Nomor Dokumen pembayaran. Baris yang diimpor akan memakai <b>Nilai = Rp 0</b>
        dan Nomor Dokumen kosong — silakan lengkapi lewat menu <b>Pajak &amp; Perijinan</b> setelah import.
        Baris "Perkiraan" adalah proyeksi tanggal jatuh tempo berikutnya (dihitung dari hari ini) supaya kartu
        pengingat H-30 langsung aktif; sesuaikan tanggalnya begitu pembayaran benar-benar dilakukan.
      </div>

      ${state.skipped.length ? `
        <div class="panel__title" style="margin-bottom:10px;color:var(--status-critical);">Baris Dilewati (data tidak lengkap)</div>
        <div class="table-scroll" style="margin-bottom:20px;">
          <table class="data-table">
            <thead><tr><th>Sheet</th><th>Baris</th><th>Alasan</th></tr></thead>
            <tbody>${state.skipped.slice(0, 50).map((s) => `<tr><td>${escapeHtml(s.sheetName)}</td><td>${s.rowNumber}</td><td style="color:var(--status-critical);">${escapeHtml(s.reason)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : ''}

      ${invalid.length ? `
        <div class="panel__title" style="margin-bottom:10px;color:var(--status-warning);">Kendaraan Tanpa Transaksi Otomatis</div>
        <div class="table-scroll" style="margin-bottom:20px;">
          <table class="data-table">
            <thead><tr><th>Nopol</th><th>Sheet / Baris</th><th>Keterangan</th></tr></thead>
            <tbody>${invalid.slice(0, 50).map((c) => `<tr><td style="font-weight:700;">${escapeHtml(c.nopol)}</td><td>${escapeHtml(c.sheetName)} / ${c.rowNumber}</td><td style="color:var(--status-warning);">${escapeHtml(c.error)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : ''}

      <div class="panel__title" style="margin-bottom:10px;">Preview Transaksi yang Akan Diimpor (${valid.length})</div>
      <div class="table-scroll" style="margin-bottom:20px;">
        <table class="data-table">
          <thead><tr><th>Nopol</th><th>Kendaraan</th><th>Tipe</th><th>Masa Berlaku</th><th class="num">Nilai</th></tr></thead>
          <tbody>
            ${valid.slice(0, 80).map((c) => `
              <tr>
                <td style="font-weight:700;">${escapeHtml(c.nopol)}</td>
                <td>${escapeHtml(c.kendaraanInfo.nama_barang || '-')}</td>
                <td><span class="status-badge status-badge--${c.tipe === 'historis' ? 'safe' : 'warning'}">${c.tipe === 'historis' ? `Riwayat ${c.tahunSiklus}` : 'Perkiraan'}</span></td>
                <td>${formatDate(c.masa_berlaku)}</td>
                <td class="num">${formatRupiah(c.nilai)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${valid.length > 80 ? `<p style="font-size:12.5px;color:var(--gray-500);">Menampilkan 80 dari ${valid.length} baris.</p>` : ''}

      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn btn-outline" id="btn-back">← Unggah Ulang</button>
        <button class="btn btn-solid" id="btn-confirm" ${valid.length === 0 ? 'disabled' : ''}>
          Konfirmasi &amp; Import ${valid.length} Transaksi
        </button>
      </div>
    `;

    slot.querySelector('#btn-back').addEventListener('click', () => { resetToUpload(); draw(); });
    slot.querySelector('#btn-confirm').addEventListener('click', async () => {
      const btn = slot.querySelector('#btn-confirm');
      btn.disabled = true;
      btn.textContent = 'Mengimpor...';
      try {
        state.summary = await commitPajakRegisterImport({
          tahunAnggaranId, opdId: state.opdId, candidates: valid,
          fileName: state.file?.name || '(tidak diketahui)', userId: profile.id,
        });
        state.step = 2;
        draw();
      } catch (err) {
        showToast('Import gagal: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = `Konfirmasi & Import ${valid.length} Transaksi`;
      }
    });
  }

  function drawRegisterResultStep(slot) {
    const s = state.summary;
    slot.innerHTML = `
      <div class="alert alert--info" style="background:var(--status-safe-bg);color:var(--status-safe);">
        Import selesai dan telah dicatat pada Import Log.
      </div>
      <div class="summary-grid" style="margin:16px 0;">
        <div class="summary-chip" style="background:var(--status-safe-bg);"><div class="summary-chip__value" style="color:var(--status-safe);">${s.kendaraan_baru}</div><div class="summary-chip__label">Kendaraan Baru</div></div>
        <div class="summary-chip" style="background:var(--status-info-bg);"><div class="summary-chip__value" style="color:var(--status-info);">${s.kendaraan_diperbarui}</div><div class="summary-chip__label">Kendaraan Diperbarui</div></div>
        <div class="summary-chip" style="background:var(--status-safe-bg);"><div class="summary-chip__value" style="color:var(--status-safe);">${s.transaksi_baru}</div><div class="summary-chip__label">Transaksi Baru</div></div>
        <div class="summary-chip" style="background:var(--gray-100);"><div class="summary-chip__value">${s.transaksi_dilewati}</div><div class="summary-chip__label">Transaksi Dilewati (sudah ada)</div></div>
        <div class="summary-chip" style="background:var(--status-critical-bg);"><div class="summary-chip__value" style="color:var(--status-critical);">${s.error}</div><div class="summary-chip__label">Error</div></div>
      </div>
      <div class="alert alert--warning" style="margin-bottom:16px;">
        Jangan lupa lengkapi <b>Nilai</b> dan <b>Nomor Dokumen</b> transaksi yang baru diimpor lewat menu
        <b>Pajak &amp; Perijinan</b> — kedua field itu tidak tersedia di file sumber.
      </div>
      ${s.detail.some((d) => d.status === 'error') ? `
        <div class="panel__title" style="margin-bottom:10px;">Rincian Error</div>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Nopol</th><th>Pesan</th></tr></thead>
            <tbody>${s.detail.filter((d) => d.status === 'error').slice(0, 50).map((d) => `<tr><td>${escapeHtml(d.nopol || '-')}</td><td style="color:var(--status-critical);">${escapeHtml(d.pesan || '-')}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : ''}
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn btn-solid" id="btn-new">Import File Lain</button>
      </div>
    `;
    slot.querySelector('#btn-new').addEventListener('click', () => { resetToUpload(); draw(); });
  }

  // ------------------------------------------------------
  // MODE FALLBACK (tabel datar) — mapping manual
  // ------------------------------------------------------
  function drawMappingStep(slot) {
    slot.innerHTML = `
      ${state.uploadNotice ? `<div class="alert alert--info" style="margin-bottom:14px;">${state.uploadNotice}</div>` : ''}
      <p style="font-size:13.5px;color:var(--gray-500);margin-top:0;">
        File <b>${escapeHtml(state.file?.name || '')}</b> memiliki ${state.rawRows.length} baris data.
        Kendaraan (Nopol) harus sudah terdaftar di menu <b>Data Kendaraan (KIB)</b> — baris dengan Nopol yang
        belum terdaftar akan gagal saat import.
      </p>
      <div class="mapping-grid">
        ${PAJAK_TARGET_FIELDS.map((f) => `
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
    slot.querySelector('#btn-back').addEventListener('click', () => { resetToUpload(); draw(); });
    slot.querySelector('#btn-next').addEventListener('click', () => {
      const requiredMissing = pajakRequiredFields().filter((f) => !state.mapping[f.key]);
      if (requiredMissing.length) {
        showToast(`Kolom berikut belum dipetakan: ${requiredMissing.map((f) => f.label).join(', ')}`, 'warning');
        return;
      }
      state.validated = applyPajakFlatMapping(state.rawRows, state.mapping);
      state.step = 2;
      draw();
    });
  }

  function drawFlatPreviewStep(slot) {
    const validRows = state.validated.filter((r) => r.valid);
    const errorRows = state.validated.filter((r) => !r.valid);

    slot.innerHTML = `
      <div class="summary-grid" style="margin-bottom:18px;">
        <div class="summary-chip" style="background:var(--status-safe-bg);"><div class="summary-chip__value" style="color:var(--status-safe);">${validRows.length}</div><div class="summary-chip__label">Baris Valid</div></div>
        <div class="summary-chip" style="background:var(--status-critical-bg);"><div class="summary-chip__value" style="color:var(--status-critical);">${errorRows.length}</div><div class="summary-chip__label">Baris Bermasalah</div></div>
        <div class="summary-chip" style="background:var(--gray-100);"><div class="summary-chip__value">${state.validated.length}</div><div class="summary-chip__label">Total Baris</div></div>
      </div>
      ${errorRows.length ? `
        <div class="panel__title" style="margin-bottom:10px;">Baris Bermasalah (tidak akan diimpor)</div>
        <div class="table-scroll" style="margin-bottom:20px;">
          <table class="data-table">
            <thead><tr><th>Baris</th><th>Alasan</th></tr></thead>
            <tbody>${errorRows.slice(0, 50).map((r) => `<tr><td>${r.rowNumber}</td><td style="color:var(--status-critical);">${r.errors.join('; ')}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : ''}
      <div class="panel__title" style="margin-bottom:10px;">Preview Data Valid (akan diimpor)</div>
      <div class="table-scroll" style="margin-bottom:20px;">
        <table class="data-table">
          <thead><tr><th>Nopol</th><th>Jenis</th><th>Tanggal</th><th>Masa Berlaku</th><th class="num">Nilai</th></tr></thead>
          <tbody>
            ${validRows.slice(0, 50).map((r) => `
              <tr>
                <td style="font-weight:700;">${escapeHtml(r.normalized.nopol)}</td>
                <td>${escapeHtml(r.normalized.jenis)}</td>
                <td>${formatDate(r.normalized.tanggal)}</td>
                <td>${formatDate(r.normalized.masa_berlaku)}</td>
                <td class="num">${formatRupiah(r.normalized.nilai)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${validRows.length > 50 ? `<p style="font-size:12.5px;color:var(--gray-500);">Menampilkan 50 dari ${validRows.length} baris valid.</p>` : ''}
      <div style="display:flex;gap:10px;margin-top:10px;">
        <button class="btn btn-outline" id="btn-back">← Kembali ke Mapping</button>
        <button class="btn btn-solid" id="btn-confirm" ${validRows.length === 0 ? 'disabled' : ''}>Konfirmasi &amp; Import ${validRows.length} Baris</button>
      </div>
      <p style="font-size:12px;color:var(--gray-500);margin-top:10px;">
        Sistem akan mencocokkan tiap Nopol ke data Kendaraan (KIB) yang sudah ada, dan melewati baris dengan
        Nopol + Masa Berlaku yang sudah pernah tercatat.
      </p>
    `;

    slot.querySelector('#btn-back').addEventListener('click', () => { state.step = 1; draw(); });
    slot.querySelector('#btn-confirm').addEventListener('click', async () => {
      const btn = slot.querySelector('#btn-confirm');
      btn.disabled = true;
      btn.textContent = 'Mengimpor...';
      try {
        state.summary = await commitPajakFlatImport({
          tahunAnggaranId, opdId: state.opdId, validatedRows: state.validated,
          fileName: state.file?.name || '(tidak diketahui)', userId: profile.id,
        });
        state.step = 3;
        draw();
      } catch (err) {
        showToast('Import gagal: ' + err.message, 'error');
        btn.disabled = false;
        btn.textContent = `Konfirmasi & Import ${validRows.length} Baris`;
      }
    });
  }

  function drawFlatResultStep(slot) {
    const s = state.summary;
    slot.innerHTML = `
      <div class="alert alert--info" style="background:var(--status-safe-bg);color:var(--status-safe);">
        Import selesai dan telah dicatat pada Import Log.
      </div>
      <div class="summary-grid" style="margin:16px 0;">
        <div class="summary-chip" style="background:var(--status-safe-bg);"><div class="summary-chip__value" style="color:var(--status-safe);">${s.baru}</div><div class="summary-chip__label">Transaksi Baru</div></div>
        <div class="summary-chip" style="background:var(--gray-100);"><div class="summary-chip__value">${s.duplikat}</div><div class="summary-chip__label">Duplikat</div></div>
        <div class="summary-chip" style="background:var(--status-warning-bg);"><div class="summary-chip__value" style="color:var(--status-warning);">${s.tidak_ditemukan}</div><div class="summary-chip__label">Nopol Tidak Ditemukan</div></div>
        <div class="summary-chip" style="background:var(--status-critical-bg);"><div class="summary-chip__value" style="color:var(--status-critical);">${s.error}</div><div class="summary-chip__label">Error</div></div>
      </div>
      ${s.detail.some((d) => d.status === 'error') ? `
        <div class="panel__title" style="margin-bottom:10px;">Rincian Error</div>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Baris</th><th>Pesan</th></tr></thead>
            <tbody>${s.detail.filter((d) => d.status === 'error').slice(0, 50).map((d) => `<tr><td>${d.baris || '-'}</td><td style="color:var(--status-critical);">${escapeHtml(d.pesan || '-')}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      ` : ''}
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn btn-solid" id="btn-new">Import File Lain</button>
      </div>
    `;
    slot.querySelector('#btn-new').addEventListener('click', () => { resetToUpload(); draw(); });
  }

  function resetToUpload() {
    state.step = 0; state.file = null; state.isRegisterFormat = false;
    state.candidates = []; state.skipped = []; state.headers = []; state.rawRows = [];
    state.mapping = {}; state.validated = []; state.summary = null; state.uploadNotice = '';
  }

  draw();
}

function escapeHtml(str) { const div = document.createElement('div'); div.textContent = str ?? ''; return div.innerHTML; }
function escapeAttr(str) { return String(str ?? '').replace(/"/g, '&quot;'); }
