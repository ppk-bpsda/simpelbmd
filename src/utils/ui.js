let toastContainer = null;

function ensureContainer() {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
  document.body.appendChild(toastContainer);
  return toastContainer;
}

export function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `alert alert--${type === 'success' ? 'info' : type}`;
  el.style.cssText = 'box-shadow:0 8px 24px -8px rgba(15,23,42,0.25);min-width:260px;';
  if (type === 'success') {
    el.style.background = '#ECFDF3';
    el.style.color = '#16A34A';
  }
  el.textContent = message;
  ensureContainer().appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

/**
 * Modal form serbaguna untuk Tambah/Edit data.
 *
 * Menggantikan pola "inline-form di atas tabel" yang memaksa user menggulung
 * layar ke atas setiap kali menekan Edit pada baris yang jauh di bawah.
 * Modal muncul di tengah viewport, punya header & footer yang menempel
 * (sticky) sehingga tombol Simpan selalu terlihat walau isian panjang.
 *
 * @param {object} opt
 * @param {string} opt.title        Judul modal.
 * @param {string} [opt.subtitle]   Baris keterangan kecil di bawah judul.
 * @param {string} opt.bodyHtml     HTML isi form.
 * @param {string} [opt.saveLabel]  Label tombol simpan.
 * @param {string} [opt.width]      Lebar maksimum modal (default 880px).
 * @param {() => void} [opt.onClose]  Dipanggil sekali saat modal ditutup.
 * @param {(body: HTMLElement) => any} opt.onSave
 *        Dipanggil saat Simpan ditekan. Boleh async. Kembalikan `false` bila
 *        validasi gagal supaya modal tetap terbuka; selain itu modal ditutup.
 * @returns {{ close: () => void, body: HTMLElement }}
 */
export function openFormModal({ title, subtitle = '', bodyHtml, saveLabel = 'Simpan', width = '880px', onSave, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:${width};" role="dialog" aria-modal="true" aria-label="${String(title).replace(/"/g, '&quot;')}">
      <div class="modal__header">
        <div>
          <div class="modal__title">${title}</div>
          ${subtitle ? `<div class="modal__subtitle">${subtitle}</div>` : ''}
        </div>
        <button class="modal__close" type="button" data-action="close" aria-label="Tutup">&times;</button>
      </div>
      <div class="modal__body" data-modal-body>${bodyHtml}</div>
      <div class="modal__footer">
        <div class="modal__hint">Tekan <kbd>Esc</kbd> untuk menutup &middot; <kbd>Ctrl</kbd>+<kbd>Enter</kbd> untuk menyimpan</div>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-outline" type="button" data-action="close">Batal</button>
          <button class="btn btn-solid" type="button" data-action="save">${saveLabel}</button>
        </div>
      </div>
    </div>
  `;

  const body = overlay.querySelector('[data-modal-body]');
  const saveBtn = overlay.querySelector('[data-action="save"]');
  let dirty = false;
  let saving = false;
  let closed = false;

  body.addEventListener('input', () => { dirty = true; });
  body.addEventListener('change', () => { dirty = true; });

  function close(force = false) {
    if (closed || saving) return;
    if (!force && dirty && !window.confirm('Perubahan belum disimpan. Tutup form ini?')) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown, true);
    document.body.style.overflow = prevOverflow;
    overlay.remove();
    if (typeof onClose === 'function') onClose();
  }

  async function doSave() {
    if (saving) return;
    saving = true;
    const original = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Menyimpan…';
    try {
      const result = await onSave(body);
      saving = false;
      if (result === false) {
        saveBtn.disabled = false;
        saveBtn.textContent = original;
        return;
      }
      close(true);
    } catch (err) {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = original;
      showToast(err?.message || 'Gagal menyimpan data.', 'error');
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSave(); return; }
    // Enter pada input teks biasa = simpan cepat; textarea & select dibiarkan.
    if (e.key === 'Enter' && e.target?.tagName === 'INPUT' && e.target.type !== 'checkbox' && overlay.contains(e.target)) {
      e.preventDefault();
      doSave();
    }
  }

  overlay.querySelectorAll('[data-action="close"]').forEach((el) => el.addEventListener('click', () => close()));
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  saveBtn.addEventListener('click', doSave);
  document.addEventListener('keydown', onKeyDown, true);

  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);

  // Fokuskan isian pertama supaya user bisa langsung mengetik.
  const first = body.querySelector('input:not([type="hidden"]), select, textarea');
  if (first) { first.focus(); if (first.select) first.select(); }

  return { close: () => close(true), body };
}

export function confirmDialog({ title, message, confirmLabel = 'Ya, lanjutkan', cancelLabel = 'Batal', danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(11,18,32,0.45);display:flex;align-items:center;justify-content:center;z-index:10000;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:24px;max-width:380px;width:90%;box-shadow:0 20px 60px -20px rgba(0,0,0,.4);">
        <div style="font-size:16px;font-weight:700;margin-bottom:8px;color:#0F172A;">${title}</div>
        <div style="font-size:13.5px;color:#64748B;margin-bottom:20px;line-height:1.5;">${message}</div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button data-action="cancel" class="btn btn-outline">${cancelLabel}</button>
          <button data-action="confirm" class="btn ${danger ? '' : 'btn-solid'}" style="${danger ? 'background:#DC2626;color:#fff;' : ''}">${confirmLabel}</button>
        </div>
      </div>
    `;
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
    document.body.appendChild(overlay);
  });
}
