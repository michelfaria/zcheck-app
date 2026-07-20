import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../../../../../lib/supabase';
import { runAlertRules } from '../../../../../lib/adminAlerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Backstop agendado do motor de alertas (Vercel Cron — ver vercel.json).
// Auth: o Vercel manda `Authorization: Bearer ${CRON_SECRET}` quando a env
// CRON_SECRET existe. Sem o header correto, 401 — o portão do middleware não
// cobre esta rota (o cron não tem cookie), por isso o segredo próprio.
//
// Obs.: o painel /admin/alertas também reavalia sozinho quando os dados têm
// mais de 65 min — o cron é a rede de segurança para dias sem ninguém no Core.
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cronSecret || !serviceKey) {
    console.error('CRON_SECRET ou SUPABASE_SERVICE_ROLE_KEY ausente — cron de alertas desabilitado.');
    return Response.json({ ok: false, reason: 'server_misconfigured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const db = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const result = await runAlertRules(db);
    return Response.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('cron de alertas falhou:', e.message);
    return Response.json({ ok: false, reason: 'run_failed', message: e.message }, { status: 502 });
  }
}
