import Anthropic from '@anthropic-ai/sdk';
import { adminGuard, jsonNoStore } from '../../../../lib/adminApi';
import { buildSearchIndex } from '../../../../lib/ajuda';
import { healthFrom, summarize, TOPICS } from '../../../../lib/supportInsights';
import { MODEL_ROUTINE } from '../../../../lib/agentTeam';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ============================================================================
// Monitoramento do Zeca (assistente de suporte público da Central de Ajuda).
//
//   GET                      → status de saúde + motivos + análise das perguntas
//   POST {action:'probe'}    → verificação AO VIVO contra a API (grava o resultado)
//   POST {action:'analyze'}  → leitura com IA dos temas e lacunas (grava o relatório)
//
// Por que existe uma verificação ao vivo: a presença de ANTHROPIC_API_KEY prova
// que a variável existe, não que ela funciona. Crédito zerado, chave revogada e
// modelo removido só aparecem numa chamada real — foi exatamente o que derrubou
// o time de agentes na Fase 2.1 sem nenhum painel acusar.
//
// O resultado do probe mora em agent_reports (kind='support_probe'), não numa
// tabela nova: o Core já lê esse ledger e assim o monitor não pede migration.
// ============================================================================

const PROBE_KIND = 'support_probe';
const THEMES_KIND = 'support_themes';

const hasApiKey = () => !!process.env.ANTHROPIC_API_KEY;

export async function GET(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [chats, helpEvents, probes, retro, themes, refinements, memories] = await Promise.all([
    db.from('support_chats').select('id, session_key, question, reply, helpful, created_at')
      .gte('created_at', since30).order('created_at', { ascending: false }).limit(2000),
    db.from('events').select('event_type, metadata, occurred_at')
      .in('event_type', ['help_search', 'help_search_results', 'help_article_viewed', 'help_article_feedback', 'help_assistant_message'])
      .gte('occurred_at', since30).order('occurred_at', { ascending: false }).limit(3000),
    db.from('agent_reports').select('id, data_snapshot, created_at').eq('kind', PROBE_KIND)
      .order('created_at', { ascending: false }).limit(10),
    db.from('agent_reports').select('id, report_md, data_snapshot, created_at, rating').eq('kind', 'support_retro')
      .order('created_at', { ascending: false }).limit(1),
    db.from('agent_reports').select('id, report_md, created_at').eq('kind', THEMES_KIND)
      .order('created_at', { ascending: false }).limit(1),
    db.from('agent_prompts').select('system_md, note, created_at').eq('agent', 'suporte')
      .order('created_at', { ascending: false }).limit(10),
    db.from('agent_memory').select('content, created_at').eq('agent', 'suporte').eq('archived', false)
      .order('created_at', { ascending: false }).limit(10),
  ]);

  // support_chats é a única fonte indispensável; o resto degrada em silêncio
  // (tabela ausente antes de um deploy, por exemplo, não pode cegar o painel).
  if (chats.error) {
    console.error('support-agent GET falhou:', chats.error.message);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: chats.error.message }, 502);
  }

  const rows = chats.data || [];
  const insights = summarize({
    chats: rows,
    helpEvents: helpEvents.error ? [] : helpEvents.data || [],
  });

  const probeRows = probes.error ? [] : probes.data || [];
  const lastProbe = probeRows[0]
    ? { ...(probeRows[0].data_snapshot || {}), at: probeRows[0].created_at }
    : null;

  const articleCount = (() => {
    try { return buildSearchIndex().length; } catch { return 0; }
  })();

  const health = healthFrom({
    hasApiKey: hasApiKey(),
    hasServiceKey: true, // adminGuard já exigiu a service key para chegar aqui
    articleCount,
    lastProbe,
    lastChatAt: insights.lastChatAt,
    chats7: insights.volume.total7,
    down7: insights.volume.down7,
  });

  return jsonNoStore({
    ok: true,
    generatedAt: new Date().toISOString(),
    health,
    config: {
      hasApiKey: hasApiKey(),
      model: 'claude-haiku-4-5',       // MODEL da rota pública do assistente
      articleCount,
      guidelines: refinements.error ? [] : refinements.data || [],
      memories: memories.error ? [] : memories.data || [],
    },
    probe: lastProbe,
    probeHistory: probeRows.map(p => ({ at: p.created_at, ...(p.data_snapshot || {}) })),
    insights,
    topicsCatalog: TOPICS.map(t => ({ id: t.id, label: t.label, article: t.article })),
    lastRetro: retro.error ? null : retro.data?.[0] || null,
    lastThemes: themes.error ? null : themes.data?.[0] || null,
  });
}

export async function POST(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonNoStore({ ok: false, reason: 'bad_request' }, 400); }

  if (body?.action === 'probe') return probe(db);
  if (body?.action === 'analyze') return analyze(db);
  return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
}

// ── Verificação ao vivo ─────────────────────────────────────────────────────
// Chamada mínima possível ao MESMO modelo da rota pública: prova chave, crédito
// e modelo com alguns tokens. O resultado é gravado sempre — inclusive a falha,
// que é o dado que interessa.
async function probe(db) {
  const started = Date.now();
  let snapshot;

  if (!hasApiKey()) {
    snapshot = { ok: false, error: 'ANTHROPIC_API_KEY ausente neste ambiente', ms: 0 };
  } else {
    try {
      const client = new Anthropic();
      const resp = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 16,
        system: 'Responda exatamente: ok',
        messages: [{ role: 'user', content: 'ping' }],
      });
      const text = resp.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
      snapshot = {
        ok: true, ms: Date.now() - started, reply: text.trim().slice(0, 40),
        input_tokens: resp.usage?.input_tokens ?? null,
        output_tokens: resp.usage?.output_tokens ?? null,
      };
    } catch (e) {
      snapshot = { ok: false, error: (e?.message || 'erro desconhecido').slice(0, 300), ms: Date.now() - started };
    }
  }

  const { error: qErr } = await db.from('agent_reports').insert({
    agent: 'suporte', kind: PROBE_KIND,
    report_md: snapshot.ok
      ? `Verificação ao vivo OK em ${snapshot.ms}ms.`
      : `Verificação ao vivo FALHOU: ${snapshot.error}`,
    data_snapshot: snapshot, model: 'claude-haiku-4-5',
    input_tokens: snapshot.input_tokens ?? null, output_tokens: snapshot.output_tokens ?? null,
    calls: snapshot.ok ? 1 : 0,
  });
  if (qErr) console.warn('probe: gravação falhou:', qErr.message);

  return jsonNoStore({ ok: true, probe: { ...snapshot, at: new Date().toISOString() } });
}

// ── Leitura com IA das perguntas ────────────────────────────────────────────
// A classificação por tema já roda sem IA (lib/supportInsights). Isto aqui é a
// camada que enxerga o que a regra não vê: intenção, dúvida mal formulada e
// tema novo. Modelo de rotina (Haiku) porque é agrupamento, não estratégia.
async function analyze(db) {
  if (!hasApiKey()) return jsonNoStore({ ok: false, reason: 'no_api_key' }, 503);

  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: chats, error: qErr } = await db.from('support_chats')
    .select('question, helpful, created_at')
    .gte('created_at', since30).order('created_at', { ascending: false }).limit(300);
  if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed', message: qErr.message }, 502);
  if (!chats?.length) return jsonNoStore({ ok: false, reason: 'sem_conversas' }, 400);

  const artigos = buildSearchIndex().map(a => `${a.title} — ${a.url}`).join('\n');
  const perguntas = chats.map(c =>
    `[${c.helpful === true ? '👍' : c.helpful === false ? '👎' : '—'}] ${String(c.question || '').replace(/\s+/g, ' ').slice(0, 200)}`
  ).join('\n');

  const system = `Você analisa as perguntas que usuários do ZCheck (SaaS de checklists para lojas e restaurantes) fizeram ao assistente de suporte da Central de Ajuda.

Escreva em português, texto direto, SEM preâmbulo. Estrutura exata:

## Temas recorrentes
Até 6 temas, um por linha, no formato: **Tema** — N perguntas · o que as pessoas querem de fato · artigo que cobre (ou "sem artigo").
Ordene por volume. Agrupe pela INTENÇÃO, não pelas palavras.

## Lacunas de conteúdo
Até 4 itens: assunto perguntado que nenhum artigo da lista cobre, ou que cobre mal (perguntas com 👎). Um por linha.

## O que fazer
Até 3 ações concretas para o fundador, uma por linha, começando com um verbo.

Regras: só afirme o que as perguntas sustentam; nunca invente funcionalidade; se um tema tem poucas perguntas, diga o número em vez de generalizar.`;

  const client = new Anthropic();
  const resp = await client.messages.create({
    model: MODEL_ROUTINE,
    max_tokens: 2000,
    system,
    messages: [{
      role: 'user',
      content: `ARTIGOS DA CENTRAL DE AJUDA:\n${artigos}\n\nPERGUNTAS DOS ÚLTIMOS 30 DIAS (${chats.length}):\n${perguntas}`,
    }],
  });
  const text = resp.content?.filter(b => b.type === 'text').map(b => b.text).join('\n') || '';

  const { data: report } = await db.from('agent_reports').insert({
    agent: 'suporte', kind: THEMES_KIND, report_md: text,
    data_snapshot: { perguntas: chats.length },
    model: MODEL_ROUTINE,
    input_tokens: resp.usage?.input_tokens ?? null, output_tokens: resp.usage?.output_tokens ?? null,
    calls: 1,
  }).select('id, report_md, created_at').single();

  return jsonNoStore({ ok: true, themes: report || { report_md: text, created_at: new Date().toISOString() } });
}
