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
