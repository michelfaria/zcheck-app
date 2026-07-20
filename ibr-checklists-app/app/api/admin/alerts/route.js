import { adminGuard, jsonNoStore } from '../../../../lib/adminApi';
import { runIfStale, runAlertRules } from '../../../../lib/adminAlerts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Alertas do ZCheck Core.
//   GET ?badge=1  → só a contagem de abertos (poll leve do menu, sem reavaliar)
//   GET           → reavalia se estiver velho (>65min) e lista abertos+resolvidos
//   POST          → força a avaliação agora (botão "verificar agora")
//   PATCH {id, resolved} → marca/desmarca como resolvido
export async function GET(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const badgeOnly = new URL(request.url).searchParams.get('badge');
  if (badgeOnly) {
    const { count, error: qErr } = await db.from('admin_alerts')
      .select('id', { count: 'exact', head: true }).eq('resolved', false);
    if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed' }, 502);
    return jsonNoStore({ ok: true, openCount: count || 0 });
  }

  let run = null;
  try {
    run = await runIfStale(db);
  } catch (e) {
    // Avaliador falhou (ex.: migration ainda não rodada) — a listagem ainda
    // deve responder; o painel mostra o erro da avaliação separadamente.
    run = { error: e.message };
  }

  const [open, resolved, count] = await Promise.all([
    db.from('admin_alerts').select('*').eq('resolved', false)
      .order('created_at', { ascending: false }).limit(200),
    db.from('admin_alerts').select('*').eq('resolved', true)
      .order('resolved_at', { ascending: false }).limit(20),
    db.from('admin_alerts').select('id', { count: 'exact', head: true }).eq('resolved', false),
  ]);
  const firstErr = [open, resolved].find(r => r.error);
  if (firstErr) {
    console.error('alerts query falhou:', firstErr.error.message);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: firstErr.error.message }, 502);
  }

  return jsonNoStore({
    ok: true,
    generatedAt: new Date().toISOString(),
    run,
    openCount: count.count || 0,
    open: open.data,
    resolved: resolved.data,
  });
}

export async function POST(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;
  try {
    const result = await runAlertRules(db);
    return jsonNoStore({ ok: true, ...result });
  } catch (e) {
    console.error('runAlertRules falhou:', e.message);
    return jsonNoStore({ ok: false, reason: 'run_failed', message: e.message }, 502);
  }
}

export async function PATCH(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonNoStore({ ok: false, reason: 'bad_request' }, 400); }
  const { id, resolved } = body || {};
  if (typeof id !== 'string' || typeof resolved !== 'boolean') {
    return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
  }

  const { error: qErr } = await db.from('admin_alerts')
    .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null })
    .eq('id', id);
  if (qErr) {
    console.error('resolver alerta falhou:', qErr.message);
    return jsonNoStore({ ok: false, reason: 'query_failed' }, 502);
  }
  return jsonNoStore({ ok: true });
}
