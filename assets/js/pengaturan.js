/* ==========================================================================
   SIMPELBMD — Modul Pengaturan Akun
   ========================================================================== */
(() => {
  let profile = null;
  let users = [];
  let editingUserId = null;

  const el = (id) => document.getElementById(id);

  async function boot() {
    profile = await window.SIMPELBMD_UI.bootstrapPage();
    if (!profile) return;

    el("profUsername").value = profile.username;
    el("profRole").value = profile.role === "admin" ? "Administrator" : "Operator";
    el("profFullName").value = profile.full_name || "";

    bindEvents();
    if (profile.role === "admin") await loadUsers();
  }

  function switchTab(tab) {
    document.querySelectorAll(".set-tab").forEach((t) => (t.style.display = "none"));
    el(`tab-${tab}`).style.display = "block";
    document.querySelectorAll(".chip-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  }

  // ================= PROFIL SAYA =================
  async function saveProfile() {
    const errBox = el("profFormError");
    errBox.classList.remove("show");
    const full_name = el("profFullName").value.trim();
    if (!full_name) { errBox.textContent = "Nama lengkap wajib diisi."; errBox.classList.add("show"); return; }
    try {
      await DATA.updateUserProfile(profile, profile.id, { full_name }, profile);
      profile.full_name = full_name;
      window.SIMPELBMD_UI.toast("Nama berhasil diperbarui.");
    } catch (e) {
      errBox.textContent = "Gagal menyimpan: " + e.message;
      errBox.classList.add("show");
    }
  }

  async function changePassword() {
    const errBox = el("pwFormError");
    errBox.classList.remove("show");
    const current = el("pwCurrent").value;
    const next = el("pwNew").value;
    const confirm = el("pwConfirm").value;

    if (!current || !next || !confirm) { errBox.textContent = "Semua kolom wajib diisi."; errBox.classList.add("show"); return; }
    if (next.length < 6) { errBox.textContent = "Password baru minimal 6 karakter."; errBox.classList.add("show"); return; }
    if (next !== confirm) { errBox.textContent = "Konfirmasi password baru tidak sama."; errBox.classList.add("show"); return; }

    const btn = el("pwSaveBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Memproses…';
    try {
      const valid = await DATA.verifyCurrentPassword(profile.email, current);
      if (!valid) throw new Error("Password saat ini salah.");
      await DATA.changeOwnPassword(next);
      window.SIMPELBMD_UI.toast("Password berhasil diubah.");
      el("pwCurrent").value = ""; el("pwNew").value = ""; el("pwConfirm").value = "";
    } catch (e) {
      errBox.textContent = e.message;
      errBox.classList.add("show");
    } finally {
      btn.disabled = false;
      btn.textContent = "Ubah Password";
    }
  }

  // ================= MANAJEMEN PENGGUNA (ADMIN) =================
  async function loadUsers() {
    try {
      users = await DATA.listUsers();
    } catch (e) {
      window.SIMPELBMD_UI.toast("Gagal memuat daftar pengguna: " + e.message, "bad");
      users = [];
    }
    renderUsers();
  }

  function renderUsers() {
    const search = (el("userSearch")?.value || "").trim().toLowerCase();
    const rows = users.filter((u) => !search || u.username.toLowerCase().includes(search) || (u.full_name || "").toLowerCase().includes(search));
    el("userTableBody").innerHTML = rows.map((u) => `
      <tr>
        <td>${u.username}</td><td>${u.full_name || "-"}</td>
        <td><span class="badge ${u.role === "admin" ? "badge-info" : "badge-ok"}">${u.role === "admin" ? "Administrator" : "Operator"}</span></td>
        <td>${u.is_active ? '<span class="badge badge-ok">Aktif</span>' : '<span class="badge badge-bad">Nonaktif</span>'}</td>
        <td>
          <div class="action-icons">
            <button title="Edit" onclick="SET_UI.openEditUser('${u.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          </div>
        </td>
      </tr>
    `).join("") || `<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:24px;">Belum ada pengguna lain.</td></tr>`;
  }

  function openCreateUser() {
    el("userFormError").classList.remove("show");
    ["fUserUsername", "fUserFullName", "fUserPassword"].forEach((id) => (el(id).value = ""));
    el("fUserRole").value = "operator";
    el("userModal").classList.add("show");
  }

  async function saveNewUser() {
    const errBox = el("userFormError");
    errBox.classList.remove("show");
    const username = el("fUserUsername").value.trim().toLowerCase().replace(/\s+/g, ".");
    const full_name = el("fUserFullName").value.trim();
    const password = el("fUserPassword").value;
    const role = el("fUserRole").value;

    if (!username || !full_name || !password) { errBox.textContent = "Semua kolom wajib diisi."; errBox.classList.add("show"); return; }
    if (password.length < 6) { errBox.textContent = "Password minimal 6 karakter."; errBox.classList.add("show"); return; }

    const btn = el("userSaveBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Membuat…';
    try {
      const created = await DATA.adminCreateUser(profile, { username, full_name, password, role });
      users.push(created);
      users.sort((a, b) => a.username.localeCompare(b.username));
      window.SIMPELBMD_UI.toast(`Pengguna "${username}" berhasil dibuat.`);
      el("userModal").classList.remove("show");
      renderUsers();
    } catch (e) {
      errBox.textContent = e.message;
      errBox.classList.add("show");
    } finally {
      btn.disabled = false;
      btn.textContent = "Buat Pengguna";
    }
  }

  function openEditUser(id) {
    const u = users.find((x) => x.id === id);
    if (!u) return;
    editingUserId = id;
    el("userEditFormError").classList.remove("show");
    el("fUserEditUsername").value = u.username;
    el("fUserEditFullName").value = u.full_name || "";
    el("fUserEditRole").value = u.role;
    el("fUserEditActive").checked = u.is_active;
    el("userEditModal").classList.add("show");
  }

  async function saveEditUser() {
    const errBox = el("userEditFormError");
    errBox.classList.remove("show");
    const full_name = el("fUserEditFullName").value.trim();
    if (!full_name) { errBox.textContent = "Nama lengkap wajib diisi."; errBox.classList.add("show"); return; }
    if (editingUserId === profile.id && !el("fUserEditActive").checked) {
      errBox.textContent = "Anda tidak dapat menonaktifkan akun Anda sendiri.";
      errBox.classList.add("show");
      return;
    }
    const payload = { full_name, role: el("fUserEditRole").value, is_active: el("fUserEditActive").checked };
    try {
      const updated = await DATA.updateUserProfile(profile, editingUserId, payload, users.find((u) => u.id === editingUserId));
      users = users.map((u) => (u.id === editingUserId ? updated : u));
      window.SIMPELBMD_UI.toast("Data pengguna berhasil diperbarui.");
      el("userEditModal").classList.remove("show");
      renderUsers();
    } catch (e) {
      errBox.textContent = "Gagal menyimpan: " + e.message;
      errBox.classList.add("show");
    }
  }

  function bindEvents() {
    document.querySelectorAll(".chip-tabs button").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

    el("profSaveBtn").addEventListener("click", saveProfile);
    el("pwSaveBtn").addEventListener("click", changePassword);

    if (profile.role === "admin") {
      el("userSearch")?.addEventListener("input", renderUsers);
      el("btnAddUser")?.addEventListener("click", openCreateUser);
      el("userModalClose")?.addEventListener("click", () => el("userModal").classList.remove("show"));
      el("userCancelBtn")?.addEventListener("click", () => el("userModal").classList.remove("show"));
      el("userSaveBtn")?.addEventListener("click", saveNewUser);

      el("userEditModalClose")?.addEventListener("click", () => el("userEditModal").classList.remove("show"));
      el("userEditCancelBtn")?.addEventListener("click", () => el("userEditModal").classList.remove("show"));
      el("userEditSaveBtn")?.addEventListener("click", saveEditUser);
    }
  }

  window.SET_UI = { openEditUser };
  boot();
})();
