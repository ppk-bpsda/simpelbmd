import { supabase } from '../lib/supabaseClient.js';

export async function listAuditLogs({ tableName, action, limit = 200 } = {}) {
  let query = supabase
    .from('audit_logs')
    .select('id, user_id, action, table_name, record_id, old_data, new_data, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (tableName) query = query.eq('table_name', tableName);
  if (action) query = query.eq('action', action);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
