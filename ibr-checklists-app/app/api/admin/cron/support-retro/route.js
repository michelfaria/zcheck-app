import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../../../../../lib/supabase';
import { MODEL_ANALYSIS, executeAction } from '../../../../../lib/agentTeam';

// ============================================================================
// Retrospectiva semanal do Zeca (agente `suporte`) — autoaprimoramento.
//
// Toda segunda (ver vercel.json), o Zeca revisa as conversas da semana em
// support_chats (perguntas, respostas e 👍👎 dos usuários) e propõe até 3
// melhorias no formato do ledger do Core:
//   - update_prompt → diretriz curta que refina como ele responde;
//   - save_memory   → lição sobre o que os clientes perguntam / onde ele erra.
// As propostas entram em agent_actions sob as MESMAS políticas dos diretores
// (update_prompt espera aprovação do fundador em /admin/agentes; save_memory
// auto-executa se a política permitir). Aprovado, o supportAddenda da rota do
// assistente injeta o refino na próxima conversa — ciclo fechado, sem deploy.
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const norm = s => (s || '').replace(/\s+/g, ' ').trim();

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cronSecret || !serviceKey || !process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, reason: 'server_misconfigured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const db = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const [{ data: chats }, { data: refinements }, { data: memories }] = await Promise.all([
      db.from('support_chats').select('question, reply, helpful, created_at')
        .gte('created_at', since).order('created_at', { ascending: false }).limit(300),
      db.from('agent_prompts').select('system_md').eq('agent', 'suporte').limit(10),
      db.from('agent_memory').select('content').eq('agent', 'suporte').eq('archived', false).limit(8),
    ]);

    if (!chats?.length) {
      return Response.json({ ok: true, skipped: 'sem conversas na semana' });
    }

    // Amostra: negativas primeiro (onde o Zeca falhou), depois as mais recentes.
    const sample = [
      ...chats.filter(c => c.helpful === false),
      ...chats.filter(c => c.helpful !== false),
    ].slice(0, 40);
    const stats = {
      total: chats.length,
      up: chats.filter(c => c.helpful === true).length,
      down: chats.filter(c => c.helpful === false).length,
    };

    const system = `Você é o Zeca, assistente de suporte do ZCheck, em RETROSPECTIVA SEMANAL de autoaprimoramento.
Sua base de conhecimento são os artigos da Central de Ajuda; seu prompt pode receber diretrizes (update_prompt) e lições (save_memory) aprovadas pelo fundador.

Analise as conversas da semana e proponha NO MÁXIMO 3 melhorias, apenas se os dados sustentarem. Formato de saída — uma por linha, nada além disso:
update_prompt | <diretriz CURTA e acionável de como responder melhor (máx 200 caracteres)>
save_memory | <lição durável sobre as dúvidas dos clientes ou sobre um erro seu (máx 200 caracteres)>
Se a semana não justificar mudança nenhuma, responda exatamente: NADA

Critérios:
- Priorize padrões (a mesma dúvida várias vezes, o mesmo tipo de resposta com 👎), nunca casos isolados.
- Perguntas frequentes SEM artigo que as cubra viram save_memory sugerindo o tema à gestão.
- NÃO repita diretrizes/lições que você já tem (listadas abaixo).
- Diretrizes devem ser de estilo/abordagem, não fatos sobre o app.`;

    const existing = [
      refinements?.length ? `DIRETRIZES ATUAIS:\n${refinements.map(r => `- ${r.system_md}`).join('\n')}` : '',
      memories?.length ? `LIÇÕES ATUAIS:\n${memories.map(m => `- ${m.content}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n');

    const convo = sample.map(c =>
      `[${c.helpful === true ? '👍' : c.helpful === false ? '👎' : '—'}] P: ${norm(c.question).slice(0, 200)}\nR: ${norm(c.reply).slice(0, 300)}`
    ).join('\n\n');

    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL_ANALYSIS,
      max_tokens: 6000, // teto TOTAL (thinking adaptativo + texto) — ver lição da Fase 2.1
      system,
      messages: [{ role: 'user', content: `Semana: ${stats.total} conversas · ${stats.up} 👍 · ${stats.down} 👎.\n\n${existing ? existing + '\n\n' : ''}CONVERSAS (amostra):\n\n${convo}` }],
    });
    const text = resp.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') || '';

    // Relatório no mesmo ledger de agent_reports (entra no orçamento diário do time).
    const { data: report } = await db.from('agent_reports').insert({
      agent: 'suporte', kind: 'support_retro',
      report_md: text, data_snapshot: stats, model: MODEL_ANALYSIS,
      input_tokens: resp.usage?.input_tokens ?? null, output_tokens: resp.usage?.output_tokens ?? null,
      calls: 1,
    }).select('id').single();

    // Parse das propostas → agent_actions sob as políticas vigentes.
    const proposals = text.split('\n')
      .map(l => l.match(/^\s*(update_prompt|save_memory)\s*\|\s*(.+)$/))
      .filter(Boolean)
      .slice(0, 3)
      .map(m => ({ action_type: m[1], content: m[2].trim().slice(0, 300) }));

    const { data: policies } = await db.from('agent_policies').select('*');
    const policyByType = new Map((policies || []).map(p => [p.action_type, p]));
    let proposed = 0, autoExecuted = 0;
    for (const p of proposals) {
      const policy = policyByType.get(p.action_type);
      if (!policy || !policy.enabled) continue;
      const auto = policy.auto_execute === true;
      const { data: row } = await db.from('agent_actions').insert({
        agent: 'suporte', action_type: p.action_type,
        payload: { content: p.content, memory_agent: 'suporte' },
        reason: 'Retrospectiva semanal do Zeca (support_chats)',
        requires_approval: !auto, report_id: report?.id || null, status: 'proposed',
      }).select('*').single();
      proposed += 1;
      if (auto && row) {
        const result = await executeAction(db, row);
        await db.from('agent_actions').update({
          status: result.ok ? 'executed' : 'failed', result,
          decided_at: new Date().toISOString(), executed_at: new Date().toISOString(),
        }).eq('id', row.id);
        if (result.ok) autoExecuted += 1;
      }
    }

    return Response.json({ ok: true, stats, proposed, autoExecuted, none: proposals.length === 0 });
  } catch (e) {
    console.error('support-retro error:', e?.message);
    return Response.json({ ok: false, reason: e?.message || 'error' }, { status: 500 });
  }
}
