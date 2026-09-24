import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../../../../../lib/supabase';

// ============================================================================
// Verificação diária do Zeca (assistente da Central de Ajuda).
//
// Roda antes do cron de alertas (ver vercel.json) para que a regra R9 leia um
// resultado fresco: sem este ping, "inativo" só apareceria quando alguém
// abrisse o painel e clicasse em "Testar agora" — ou seja, tarde demais.
//
// Custo: uma chamada de ~20 tokens por dia ao mesmo modelo da rota pública.
// O resultado (inclusive a falha) vai para agent_reports kind='support_probe'.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MODEL = 'claude-haiku-4-5';

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cronSecret || !serviceKey) {
    return Response.json({ ok: false, reason: 'server_misconfigured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const db = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const started = Date.now();
  let snapshot;
  if (!process.env.ANTHROPIC_API_KEY) {
    snapshot = { ok: false, error: 'ANTHROPIC_API_KEY ausente neste ambiente', ms: 0, source: 'cron' };
  } else {
    try {
      const client = new Anthropic();
      const resp = await client.messages.create({
        model: MODEL, max_tokens: 16,
        system: 'Responda exatamente: ok',
        messages: [{ role: 'user', content: 'ping' }],
      });
      const text = resp.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
      snapshot = {
        ok: true, ms: Date.now() - started, reply: text.trim().slice(0, 40), source: 'cron',
        input_tokens: resp.usage?.input_tokens ?? null, output_tokens: resp.usage?.output_tokens ?? null,
      };
    } catch (e) {
      snapshot = { ok: false, error: (e?.message || 'erro desconhecido').slice(0, 300), ms: Date.now() - started, source: 'cron' };
    }
  }

  await db.from('agent_reports').insert({
    agent: 'suporte', kind: 'support_probe',
    report_md: snapshot.ok
      ? `Verificação diária OK em ${snapshot.ms}ms.`
      : `Verificação diária FALHOU: ${snapshot.error}`,
    data_snapshot: snapshot, model: MODEL,
    input_tokens: snapshot.input_tokens ?? null, output_tokens: snapshot.output_tokens ?? null,
    calls: snapshot.ok ? 1 : 0,
  });

  return Response.json({ ok: true, probe: snapshot });
}
