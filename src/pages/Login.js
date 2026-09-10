import { login } from '../services/authService.js';

export function renderLogin(root, onSuccess) {
  root.innerHTML = `
    <div class="login-screen">
      <div class="login-screen__brand">
        <div class="login-screen__logo">
          <div class="login-screen__logo-mark">S</div>
          <div class="login-screen__logo-text">SIMPELBMD</div>
        </div>
        <h1 class="login-screen__headline">
          Satu sistem untuk memantau anggaran, aset, dan kendaraan daerah secara akurat dan auditable.
        </h1>
        <p class="login-screen__tagline">
          Monitoring Anggaran • KIB • Pajak/Perijinan • Pemeliharaan • BBM
        </p>
        <p class="login-screen__footnote">Sistem Informasi Monitoring Barang Milik Daerah</p>
      </div>
      <div class="login-screen__form-side">
        <div class="login-card">
          <h1>Masuk ke SIMPELBMD</h1>
          <p class="subtitle">Gunakan username dan kata sandi yang terdaftar pada OPD Anda.</p>
          <div id="login-alert-slot"></div>
          <form id="login-form" novalidate>
            <div class="field">
              <label for="username">Username</label>
              <input id="username" name="username" type="text" autocomplete="username" required />
            </div>
            <div class="field field--password">
              <label for="password">Kata Sandi</label>
              <input id="password" name="password" type="password" autocomplete="current-password" required />
              <button type="button" id="toggle-password">Lihat</button>
            </div>
            <button type="submit" class="btn-primary" id="login-submit">Masuk</button>
          </form>
          <div class="login-card__footer">
            Lupa kata sandi? Hubungi Administrator OPD Anda.
          </div>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector('#login-form');
  const alertSlot = root.querySelector('#login-alert-slot');
  const submitBtn = root.querySelector('#login-submit');
  const passwordInput = root.querySelector('#password');
  const toggleBtn = root.querySelector('#toggle-password');

  toggleBtn.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    toggleBtn.textContent = isHidden ? 'Sembunyikan' : 'Lihat';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertSlot.innerHTML = '';
    const username = form.username.value.trim();
    const password = form.password.value;

    if (!username || !password) {
      alertSlot.innerHTML = `<div class="alert alert--warning">Username dan kata sandi wajib diisi.</div>`;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Memeriksa...';

    try {
      await login(username, password);
      onSuccess();
    } catch (err) {
      alertSlot.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message)}</div>`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Masuk';
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
