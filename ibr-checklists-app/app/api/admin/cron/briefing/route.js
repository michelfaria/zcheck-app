import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../../../../../lib/supabase';
import { runDailyCycle } from '../../../../../lib/agentTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Briefing diário do time de gestão — Vercel Cron às 7h de Brasília
// (10:00 UTC, ver vercel.json). Auth por CRON_SECRET, como o cron de alertas.
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cronSecret || !serviceKey) {
    console.error('CRON_SECRET ou SUPABASE_SERVICE_ROLE_KEY ausente — cron do briefing desabilitado.');
    return Response.json({ ok: false, reason: 'server_misconfigured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const db = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const result = await runDailyCycle(db);
    return Response.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('cron do briefing falhou:', e.message);
    return Response.json({ ok: false, reason: 'cycle_failed', message: e.message }, { status: 502 });
  }
}
