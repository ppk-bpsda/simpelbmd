/**
 * Halaman ini SENGAJA tidak berpura-pura berfungsi (lihat brief §48: jangan
 * membuat fitur palsu yang terlihat bekerja). Skema database untuk modul ini
 * sudah tersedia di supabase/migrations/0001_schema.sql, tetapi UI/CRUD-nya
 * dijadwalkan pada phase berikutnya (lihat docs/ARSITEKTUR.md §7 Roadmap).
 */
export function renderComingSoon(root, { title, phase }) {
  root.innerHTML = `
    <div class="panel">
      <div class="empty-state">
        <strong>${title}</strong>
        Modul ini terjadwal pada <b>${phase}</b> dan belum diimplementasikan pada rilis Phase 1 ini.
        Struktur tabel terkait sudah tersedia di database.
      </div>
    </div>
  `;
}
