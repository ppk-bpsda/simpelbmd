import { getSession, getCurrentProfile, onAuthStateChange } from './services/authService.js';
import { renderLogin } from './pages/Login.js';
import { mountAppShell } from './layouts/MainLayout.js';

export async function bootstrapApp(root) {
  const session = await getSession();

  if (!session) {
    renderLogin(root, () => bootstrapApp(root));
    return;
  }

  const profile = await getCurrentProfile();

  if (!profile || profile.status !== 'aktif') {
    root.innerHTML = `
      <div class="login-screen">
        <div class="login-screen__form-side" style="grid-column:1/-1;">
          <div class="login-card">
            <div class="alert alert--error">
              Akun Anda belum aktif atau profil tidak ditemukan. Silakan hubungi Super Admin.
            </div>
          </div>
        </div>
      </div>`;
    return;
  }

  await mountAppShell(root, profile);

  onAuthStateChange((session) => {
    if (!session) {
      bootstrapApp(root);
    }
  });
}
