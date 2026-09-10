// Dipakai oleh seluruh Edge Function di folder ini. Deno tidak punya resolusi
// modul npm otomatis seperti Node — file ini di-import via path relatif
// ('../_shared/cors.ts') dari masing-masing function/index.ts.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
