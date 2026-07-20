import { adminGuard, jsonNoStore } from '../../../../../lib/adminApi';
import { executeAction } from '../../../../../lib/agentTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fila de aprovação do fundador: PATCH {id, decision: 'approve' | 'reject'}.
// Aprovar executa na hora e grava o resultado no ledger.
export async function PATCH(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonNoStore({ ok: false, reason: 'bad_request' }, 400); }
  const { id, decision } = body || {};
  if (typeof id !== 'string' || !['approve', 'reject'].includes(decision)) {
    return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
  }

  const { data: action, error: findErr } = await db.from('agent_actions')
    .select('*').eq('id', id).eq('status', 'proposed').maybeSingle();
  if (findErr) return jsonNoStore({ ok: false, reason: 'query_failed' }, 502);
  if (!action) return jsonNoStore({ ok: false, reason: 'not_found', message: 'ação não existe ou já foi decidida' }, 404);

  if (decision === 'reject') {
    await db.from('agent_actions').update({
      status: 'rejected', decided_at: new Date().toISOString(),
    }).eq('id', id);
    return jsonNoStore({ ok: true, status: 'rejected' });
  }

  const result = await executeAction(db, action);
  await db.from('agent_actions').update({
    status: result.ok ? 'executed' : 'failed', result,
    decided_at: new Date().toISOString(), executed_at: new Date().toISOString(),
  }).eq('id', id);
  return jsonNoStore({ ok: true, status: result.ok ? 'executed' : 'failed', result });
}
