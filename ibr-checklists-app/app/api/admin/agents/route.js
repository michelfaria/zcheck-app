import { adminGuard, jsonNoStore } from '../../../../lib/adminApi';
import { runDailyCycle, askTeam, usageToday, AGENTS, goalsWithCurrent } from '../../../../lib/agentTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // ciclo completo = 7 chamadas ao modelo

// Time de gestão de IA.
//   GET  → estado: briefing do dia, fila de aprovação, histórico, uso, políticas
//   POST {action:'run_cycle'}        → roda o ciclo diário agora
//   POST {action:'ask', question}    → chat "pergunte aos dados"
export async function GET(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const [briefing, retro, refinements, reports, pending, recent, usage, policies, memories, goals, contacts] = await Promise.all([
    db.from('agent_reports').select('*').eq('kind', 'briefing')
      .order('created_at', { ascending: false }).limit(1),
    db.from('agent_reports').select('*').eq('kind', 'retro')
      .order('created_at', { ascending: false }).limit(1),
    db.from('agent_prompts').select('agent, system_md, note, created_at')
      .order('created_at', { ascending: false }).limit(10),
    db.from('agent_reports').select('id, agent, kind, question, created_at, model, calls')
      .order('created_at', { ascending: false }).limit(30),
    db.from('agent_actions').select('*').eq('status', 'proposed')
      .order('created_at', { ascending: false }).limit(50),
    db.from('agent_actions').select('*').neq('status', 'proposed')
      .order('created_at', { ascending: false }).limit(15),
    usageToday(db),
    db.from('agent_policies').select('*').order('action_type'),
    db.from('agent_memory').select('agent, content, created_at').eq('archived', false)
      .order('created_at', { ascending: false }).limit(12),
    goalsWithCurrent(db),
    db.from('companies').select('id, contact_email, contact_whatsapp'),
  ]);

  const firstErr = [briefing, reports, pending, recent, policies, memories].find(r => r.error);
  if (firstErr) {
    console.error('agents GET falhou:', firstErr.error.message);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: firstErr.error.message }, 502);
  }

  return jsonNoStore({
    ok: true,
    generatedAt: new Date().toISOString(),
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    agents: Object.fromEntries(Object.entries(AGENTS).map(([id, a]) => [id, a.name])),
    briefing: briefing.data[0] || null,
    retro: retro.data?.[0] || null,
    refinements: refinements.data || [],
    reports: reports.data,
    pendingActions: pending.data,
    recentActions: recent.data,
    usage,
    policies: policies.data,
    memories: memories.data,
    goals,
    contacts: Object.fromEntries((contacts.data || []).map(c =>
      [c.id, { email: c.contact_email, whatsapp: c.contact_whatsapp }])),
  });
}

export async function POST(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonNoStore({ ok: false, reason: 'bad_request' }, 400); }

  try {
    if (body?.action === 'run_cycle') {
      const result = await runDailyCycle(db, { forceWeekly: body.weekly === true });
      return jsonNoStore({ ok: true, ...result });
    }
    if (body?.action === 'ask' && typeof body.question === 'string' && body.question.trim()) {
      const result = await askTeam(db, body.question.trim().slice(0, 2000));
      return jsonNoStore({ ok: true, ...result });
    }
    if (body?.action === 'add_goal' && body.goal) {
      const g = body.goal;
      if (!g.label || g.target == null) return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
      const { error: qErr } = await db.from('agent_goals').insert({
        metric: g.metric || 'custom', label: String(g.label).slice(0, 200),
        target: Number(g.target), unit: g.unit || null, deadline: g.deadline || null,
        created_by: 'founder',
      });
      if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed', message: qErr.message }, 502);
      return jsonNoStore({ ok: true });
    }
    if (body?.action === 'archive_goal' && typeof body.id === 'string') {
      const { error: qErr } = await db.from('agent_goals')
        .update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', body.id);
      if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed' }, 502);
      return jsonNoStore({ ok: true });
    }
    return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
  } catch (e) {
    console.error('agents POST falhou:', e.message);
    return jsonNoStore({ ok: false, reason: 'agent_failed', message: e.message }, 502);
  }
}

// Feedback do fundador num relatório: 👍 (1) / 👎 (-1). Entra na retrospectiva
// semanal como sinal de calibragem dos agentes.
export async function PATCH(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonNoStore({ ok: false, reason: 'bad_request' }, 400); }
  const { report_id: reportId, rating } = body || {};
  if (typeof reportId !== 'string' || ![1, -1, null].includes(rating)) {
    return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
  }
  const { error: qErr } = await db.from('agent_reports').update({ rating }).eq('id', reportId);
  if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed', message: qErr.message }, 502);
  return jsonNoStore({ ok: true });
}
