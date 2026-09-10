import { supabase } from '../lib/supabaseClient.js';

// Catatan RLS (lihat supabase/migrations/0002_rls_policies.sql):
// - super_admin: melihat SEMUA baris audit_logs.
// - role lain (termasuk admin_opd): HANYA melihat baris miliknya sendiri
//   (user_id = auth.uid()), BUKAN seluruh aksi di OPD-nya. Ini keterbatasan
//   yang sudah ada di RLS saat ini, bukan bug di query di bawah ini.
export async function listAuditLogs({ tableName, action, dari, sampai, limit = 300 } = {}) {
  let query = supabase
    .from('audit_logs')
    .select('id, user_id, action, table_name, record_id, old_data, new_data, created_at, actor:user_id(username, nama)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (tableName) query = query.eq('table_name', tableName);
  if (action) query = query.eq('action', action);
  if (dari) query = query.gte('created_at', `${dari}T00:00:00`);
  if (sampai) query = query.lte('created_at', `${sampai}T23:59:59`);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function listAuditTableNames() {
  // Ambil daftar table_name yang pernah tercatat, untuk isi dropdown filter.
  const { data, error } = await supabase.from('audit_logs').select('table_name').limit(2000);
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.table_name).filter(Boolean))].sort();
}
