import Anthropic from '@anthropic-ai/sdk';
import { spDaysAgo } from './adminApi';
import { TIERS, billingState } from './plans';
import { sendPlainEmail } from './email';

// ============================================================================
// ZCheck Core — Time de Gestão de IA (Fase 2.1)
//
// Hierarquia: o CEO-agente (Chefe de Gabinete) orquestra 5 diretores. Cada
// ciclo diário: diretores analisam o snapshot → CEO consolida o briefing →
// ações executáveis são extraídas e entram no ledger (agent_actions), onde a
// governança decide: auto-executar (política) ou aguardar aprovação do
// fundador. Lições viram memória (agent_memory) e re-entram nos prompts —
// o flywheel que especializa os agentes conforme a base de dados cresce.
//
// Modelos (decisão do fundador): Haiku p/ roteamento/extração, Sonnet p/
// análises e briefing. Server-only: ANTHROPIC_API_KEY jamais vai ao cliente.
// ============================================================================

export const MODEL_ANALYSIS = 'claude-sonnet-5';
export const MODEL_ROUTINE = 'claude-haiku-4-5';
const DAILY_CALL_LIMIT = Number(process.env.AGENT_DAILY_LIMIT || 60);

// ── O time ───────────────────────────────────────────────────────────────────
const SHARED_CONTEXT = `
Você faz parte do time de gestão da ZCheck — SaaS multi-tenant de checklists
operacionais para negócios físicos (restaurantes, hotéis, varejo). Tagline:
"Faça bem feito. Todo dia." Modelo de negócio: assinatura mensal por tiers
(starter R$97/1 unidade, growth R$197/3, scale R$297/5), trial de 7 dias.
Piloto: IBR Group (3 lojas em Ilhabela/SP). Fundador: Michel (único humano).

Objetivo do time: escalar adoção e receita com o MÍNIMO de intervenção do
fundador, e evoluir o produto com base nos dados de uso.

Regras inegociáveis:
- Use SOMENTE os números do snapshot fornecido. NUNCA invente dados.
- Seja direto e acionável. Diagnóstico sem recomendação não vale.
- Recomendações: no máximo 3, priorizadas por impacto.
- Quando uma ação concreta do sistema resolver (estender trial, follow-up,
  desativar empresa), proponha-a explicitamente na seção "AÇÕES PROPOSTAS"
  no formato: TIPO | alvo | justificativa curta com o dado que a sustenta.
  Tipos disponíveis: extend_trial, draft_message (rascunho p/ WhatsApp),
  send_followup (E-MAIL REAL ao contato da empresa — inclua o texto completo),
  deactivate_company, activate_company, resolve_alert, save_memory, set_goal,
  update_prompt (diretriz CURTA de refino para o prompt de um agente — vira
  adendo permanente após aprovação do fundador; use quando a retrospectiva
  mostrar um padrão de erro ou acerto que mereça virar regra).
- O snapshot inclui METAS ativas com o valor atual — compare sempre o realizado
  vs a meta e diga se o ritmo alcança o prazo.
- Escreva em português, markdown enxuto.`;

export const AGENTS = {
  ceo: {
    name: 'Chefe de Gabinete',
    system: `${SHARED_CONTEXT}

Você é o CHEFE DE GABINETE — o CEO operacional do dia a dia. Você recebe as
análises dos 5 diretores e produz o briefing executivo diário do fundador.
Estrutura obrigatória:
## O dia em um parágrafo
## Decisões que exigem o fundador
(apenas o que REALMENTE precisa dele; se nada, diga "Nenhuma — time no controle.")
## Prioridades de hoje
(3 itens, donos claros — qual diretor cuida de cada uma)
## Ações propostas
(consolide as AÇÕES PROPOSTAS dos diretores que você endossa, mesmo formato)
## Lições para a memória
(0 a 3 aprendizados duráveis desta análise, formato: save_memory | agente | lição)`,
  },
  produto: {
    name: 'Diretor de Produto',
    system: `${SHARED_CONTEXT}

Você é o DIRETOR DE PRODUTO. Foco: funil de ativação, abandono de checklists,
itens mais falhados, fricção de UX. Procure onde os usuários travam e o que no
produto explica os números. Estrutura: ## Diagnóstico · ## Números-chave ·
## Recomendações · ## Ações propostas (se houver).`,
  },
  growth: {
    name: 'Diretor de Growth',
    system: `${SHARED_CONTEXT}

Você é o DIRETOR DE GROWTH. Foco: ativação (código→login→1º checklist→5+),
retenção, DAU/WAU, PWA, empresas/unidades em risco de churn de uso. Compare
unidades entre si (o comparativo entre as lojas do IBR é ouro). Estrutura:
## Diagnóstico · ## Números-chave · ## Recomendações · ## Ações propostas.`,
  },
  cs: {
    name: 'Diretor de Customer Success',
    system: `${SHARED_CONTEXT}

Você é o DIRETOR DE CS. Foco: saúde por tenant, trials perto de vencer (dias
restantes × engajamento), usuários ativados que sumiram, alertas abertos.
Quando um follow-up humano ajudar, proponha draft_message com o TEXTO PRONTO
da mensagem (WhatsApp, tom direto e caloroso, máx 400 caracteres) no payload.
Estrutura: ## Diagnóstico · ## Números-chave · ## Recomendações · ## Ações propostas.`,
  },
  ops: {
    name: 'Diretor de Operações',
    system: `${SHARED_CONTEXT}

Você é o DIRETOR DE OPS/QUALIDADE. Foco: padrões operacionais nos checklists
dos clientes — horários de pico, taxa de conclusão, itens críticos falhando em
sequência, diferenças entre turnos/lojas. O que os dados dizem sobre a operação
REAL dos clientes e como a ZCheck pode ajudá-los a operar melhor. Estrutura:
## Diagnóstico · ## Números-chave · ## Recomendações · ## Ações propostas.`,
  },
  financeiro: {
    name: 'Diretor Financeiro',
    system: `${SHARED_CONTEXT}

Você é o DIRETOR FINANCEIRO. Foco: MRR/ARR, funil de vendas, conversão de
trial, projeções por engajamento, risco de churn de receita, custo do time de
IA (chamadas). Estrutura: ## Diagnóstico · ## Números-chave · ## Recomendações
· ## Ações propostas.`,
  },
};

const DIRECTORS = ['produto', 'growth', 'cs', 'ops', 'financeiro'];

// ── Cliente Claude ───────────────────────────────────────────────────────────
function claude() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY ausente — configure na Vercel para ativar o time de agentes.');
  }
  return new Anthropic();
}

// ── Governança: limite diário (janela móvel de 24h) ─────────────────────────
export async function usageToday(db) {
  const since = new Date(Date.now() - 24 * 36e5).toISOString();
  const { data } = await db.from('agent_reports').select('calls').gte('created_at', since).limit(2000);
  const calls = (data || []).reduce((s, r) => s + (r.calls || 1), 0);
  return { calls, limit: DAILY_CALL_LIMIT };
}

async function assertBudget(db, needed) {
  const { calls, limit } = await usageToday(db);
  if (calls + needed > limit) {
    throw new Error(`limite diário de chamadas atingido (${calls}/${limit}) — ajuste AGENT_DAILY_LIMIT ou aguarde.`);
  }
}

// ── Prompts versionáveis + memória (flywheel) ───────────────────────────────
// agent_prompts são ADENDOS incrementais ao prompt-base (nunca substituição):
// cada linha aprovada via update_prompt vira uma diretriz permanente. Assim os
// agentes se refinam sem risco de perder o núcleo do papel deles.
async function systemFor(db, agentId) {
  const base = AGENTS[agentId]?.system || SHARED_CONTEXT;
  const [{ data: refinements }, { data: memories }] = await Promise.all([
    db.from('agent_prompts').select('system_md').eq('agent', agentId)
      .order('created_at', { ascending: true }).limit(10),
    db.from('agent_memory').select('content').eq('agent', agentId).eq('archived', false)
      .order('created_at', { ascending: false }).limit(8),
  ]);
  let system = base;
  if (refinements?.length) {
    system += `\n\nDIRETRIZES REFINADAS (auto-melhoria aprovada pelo fundador — siga-as):\n` +
      refinements.map(r => `- ${r.system_md}`).join('\n');
  }
  if (memories?.length) {
    system += `\n\nMEMÓRIA (lições que você aprendeu em ciclos anteriores — use-as):\n` +
      memories.map(m => `- ${m.content}`).join('\n');
  }
  return system;
}

// ── Metas com valor atual (usado no snapshot e no painel) ───────────────────
export async function goalsWithCurrent(db) {
  const [{ data: goals }, { data: health }, { data: companies }] = await Promise.all([
    db.from('agent_goals').select('*').eq('status', 'active').order('created_at'),
    db.from('admin_company_health').select('company_id, completions_7d, last_activity'),
    db.from('companies').select('id, plan_tier, subscription_status, trial_ends_at'),
  ]);
  if (!goals?.length) return [];

  const now = Date.now();
  let mrr = 0, paying = 0, trials = 0;
  for (const c of companies || []) {
    const b = billingState(c, now);
    if (b.state === 'active' && c.plan_tier && TIERS[c.plan_tier]) { mrr += TIERS[c.plan_tier].price; paying += 1; }
    if (b.state === 'trialing') trials += 1;
  }
  const checklists7d = (health || []).reduce((s, h) => s + (h.completions_7d || 0), 0);
  const active7d = (health || []).filter(h => h.completions_7d > 0).length;

  const currentByMetric = {
    mrr, paying_companies: paying, trials_active: trials,
    checklists_7d: checklists7d, active_companies_7d: active7d,
  };
  return goals.map(g => ({
    id: g.id, metric: g.metric, label: g.label, target: Number(g.target),
    unit: g.unit, deadline: g.deadline, created_by: g.created_by,
    current: currentByMetric[g.metric] ?? null, // custom → acompanhamento manual
  }));
}

// ── Snapshot de dados (o que o time enxerga) ─────────────────────────────────
export async function buildSnapshot(db) {
  const since14 = spDaysAgo(14);
  const [companies, health, units, daily, eventsDaily, userComp, failed, alerts, ranking] =
    await Promise.all([
      db.from('companies').select('id, name, slug, active, plan_tier, subscription_status, trial_ends_at, current_period_end, onboarded_at, contact_email, contact_whatsapp'),
      db.from('admin_company_health').select('*'),
      db.from('admin_unit_health').select('*'),
      db.from('admin_completions_daily').select('*').gte('day', since14).limit(3000),
      db.from('admin_events_daily').select('*').gte('day', since14).limit(3000),
      db.from('admin_user_completions').select('*').limit(2000),
      db.from('admin_failed_items').select('*').order('missed', { ascending: false }).limit(10),
      db.from('admin_alerts').select('agent:rule, severity, message, created_at').eq('resolved', false)
        .order('created_at', { ascending: false }).limit(10),
      db.from('admin_user_ranking').select('*').order('completions_30d', { ascending: false }).limit(10),
    ]);

  const healthById = new Map((health.data || []).map(h => [h.company_id, h]));
  const now = Date.now();
  let mrr = 0;
  const empresas = (companies.data || []).map(c => {
    const h = healthById.get(c.id) || {};
    const b = billingState(c, now);
    const tier = c.plan_tier ? TIERS[c.plan_tier] : null;
    if (b.state === 'active' && tier) mrr += tier.price;
    return {
      id: c.id, nome: c.name, ativa: c.active, estado_billing: b.state,
      tier: c.plan_tier, trial_dias_restantes: b.state === 'trialing' ? b.daysLeft : null,
      unidades: h.units || 0, usuarios: h.users || 0,
      checklists_7d: h.completions_7d || 0, checklists_30d: h.completions_30d || 0,
      ultima_atividade: h.last_activity || null,
      tem_email_contato: !!c.contact_email, tem_whatsapp_contato: !!c.contact_whatsapp,
    };
  });

  // Série diária agregada (14d) + funil de eventos
  const porDia = {};
  for (const r of daily.data || []) {
    const d = String(r.day).slice(0, 10);
    porDia[d] = (porDia[d] || 0) + r.completions;
  }
  const eventos = {};
  for (const r of eventsDaily.data || []) {
    eventos[r.event_type] = (eventos[r.event_type] || 0) + r.events;
  }

  const metas = await goalsWithCurrent(db);
  const usuarios = userComp.data || [];
  return {
    gerado_em: new Date().toISOString(),
    mrr_brl: mrr,
    metas_ativas: metas.map(g => ({
      metrica: g.metric, meta: g.label, alvo: g.target, unidade: g.unit,
      prazo: g.deadline, valor_atual: g.current,
    })),
    empresas: empresas.slice(0, 20),
    unidades: (units.data || []).slice(0, 20).map(u => ({
      id: u.unit_id, empresa: u.company_id, nome: u.name,
      checklists_7d: u.completions_7d, checklists_30d: u.completions_30d,
      operadores_7d: u.operators_7d, ultimo_checklist: u.last_completion,
    })),
    checklists_por_dia_14d: porDia,
    eventos_14d: eventos,
    ativacao: {
      usuarios_com_1mais: usuarios.filter(u => u.completions >= 1).length,
      usuarios_ativados_5mais: usuarios.filter(u => u.completions >= 5).length,
      ativados_sumidos_7d: usuarios.filter(u => u.completions >= 5 && u.last_completion
        && (now - new Date(u.last_completion).getTime()) > 7 * 864e5).length,
    },
    itens_mais_falhados: (failed.data || []).map(f => ({
      item: f.item_text, checklist: f.template_name, critico: f.critical, falhas: f.missed,
    })),
    alertas_abertos: alerts.data || [],
    top_usuarios: (ranking.data || []).map(u => ({
      nome: u.name, empresa: u.company_id, checklists_30d: u.completions_30d,
    })),
  };
}

// ── Chamada ao modelo ────────────────────────────────────────────────────────
async function ask(client, { model, system, user, maxTokens = 6000 }) {
  const response = await client.messages.create({
    model, max_tokens: maxTokens, system,
    messages: [{ role: 'user', content: user }],
  });
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  return { text, usage: response.usage, model: response.model };
}

async function saveReport(db, { agent, kind, question, text, snapshot, usage, model, calls = 1 }) {
  const { data } = await db.from('agent_reports').insert({
    agent, kind, question: question || null, report_md: text,
    data_snapshot: snapshot ?? {}, model,
    input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null,
    calls,
  }).select('id').single();
  return data?.id;
}

// ── Extração de ações (Haiku, saída estruturada) ────────────────────────────
const ACTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['actions'],
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['agent', 'action_type', 'reason', 'payload'],
        properties: {
          agent: { type: 'string', enum: ['ceo', 'produto', 'growth', 'cs', 'ops', 'financeiro'] },
          action_type: {
            type: 'string',
            enum: ['extend_trial', 'draft_message', 'send_followup', 'deactivate_company', 'activate_company', 'resolve_alert', 'save_memory', 'set_goal', 'update_prompt'],
          },
          reason: { type: 'string' },
          payload: {
            type: 'object',
            additionalProperties: false,
            required: [],
            properties: {
              company_id: { type: 'string' },
              alert_message: { type: 'string' },
              message: { type: 'string' },
              subject: { type: 'string' },
              content: { type: 'string' },
              memory_agent: { type: 'string' },
              goal_metric: { type: 'string', enum: ['mrr', 'paying_companies', 'trials_active', 'checklists_7d', 'active_companies_7d', 'custom'] },
              goal_label: { type: 'string' },
              goal_target: { type: 'number' },
              goal_unit: { type: 'string' },
              goal_deadline: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

async function extractActions(client, briefingMd) {
  const response = await client.messages.create({
    model: MODEL_ROUTINE,
    max_tokens: 2000,
    system: 'Extraia as ações propostas do briefing (seções "Ações propostas", "Lições para a memória" e "Refinos propostos" — TODAS as lições viram save_memory). Para save_memory: a lição em payload.content e o agente dono em payload.memory_agent. Para update_prompt: a diretriz curta em payload.content e o agente alvo em payload.memory_agent. Para draft_message: payload.message DEVE conter o texto pronto da mensagem — procure-o nas análises dos diretores (geralmente o CS escreve a mensagem completa); se não existir texto pronto em lugar nenhum, redija você uma mensagem curta de WhatsApp (máx 400 caracteres, tom direto e caloroso) fiel à justificativa; e payload.company_id = empresa alvo. Máximo 8 ações.',
    messages: [{ role: 'user', content: briefingMd }],
    output_config: { format: { type: 'json_schema', schema: ACTIONS_SCHEMA } },
  });
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  try { return { actions: JSON.parse(text).actions || [], usage: response.usage }; }
  catch { return { actions: [], usage: response.usage }; }
}

// ── Executor de ações (com governança) ──────────────────────────────────────
export async function executeAction(db, action) {
  const { action_type: type, payload = {} } = action;
  try {
    if (type === 'save_memory') {
      await db.from('agent_memory').insert({
        agent: payload.memory_agent || action.agent, content: payload.content || action.reason,
        source_report_id: action.report_id || null,
      });
      return { ok: true, note: 'lição registrada na memória' };
    }
    if (type === 'draft_message') {
      // "Executar" = materializar o rascunho no result — pronto p/ copiar.
      return { ok: true, draft: payload.message, company_id: payload.company_id || null };
    }
    if (type === 'send_followup') {
      // E-mail REAL via Brevo, ao contato cadastrado da empresa. Sempre passa
      // pela aprovação do fundador (política) antes de chegar aqui.
      if (!payload.message) return { ok: false, error: 'follow-up sem texto (payload.message)' };
      const { data: co } = await db.from('companies')
        .select('id, name, contact_email').eq('id', payload.company_id).maybeSingle();
      if (!co) return { ok: false, error: `empresa ${payload.company_id} não existe` };
      if (!co.contact_email) return { ok: false, error: `empresa ${co.id} sem contact_email — cadastre no drill-down de Empresas` };
      const sent = await sendPlainEmail(
        co.contact_email,
        payload.subject || `ZCheck · um toque rápido sobre a ${co.name || co.id}`,
        payload.message,
      );
      if (!sent.ok) return { ok: false, error: `Brevo: ${sent.reason}` };
      return { ok: true, sent_to: co.contact_email };
    }
    if (type === 'set_goal') {
      if (!payload.goal_label || payload.goal_target == null) {
        return { ok: false, error: 'meta sem label ou target' };
      }
      const { error } = await db.from('agent_goals').insert({
        metric: payload.goal_metric || 'custom', label: payload.goal_label,
        target: payload.goal_target, unit: payload.goal_unit || null,
        deadline: payload.goal_deadline || null, created_by: action.agent === 'founder' ? 'founder' : 'ceo',
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    if (type === 'extend_trial') {
      const { data: co } = await db.from('companies')
        .select('id, trial_ends_at').eq('id', payload.company_id).maybeSingle();
      if (!co) return { ok: false, error: `empresa ${payload.company_id} não existe` };
      const base = Math.max(Date.now(), co.trial_ends_at ? new Date(co.trial_ends_at).getTime() : 0);
      const newEnd = new Date(base + 7 * 864e5).toISOString();
      const { error } = await db.from('companies')
        .update({ trial_ends_at: newEnd, subscription_status: 'trialing' }).eq('id', co.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, trial_ends_at: newEnd };
    }
    if (type === 'deactivate_company' || type === 'activate_company') {
      const active = type === 'activate_company';
      const { error } = await db.from('companies').update({ active }).eq('id', payload.company_id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, active };
    }
    if (type === 'resolve_alert') {
      const { error } = await db.from('admin_alerts')
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq('resolved', false).ilike('message', `%${(payload.alert_message || '').slice(0, 60)}%`);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    if (type === 'update_prompt') {
      await db.from('agent_prompts').insert({
        agent: payload.memory_agent || action.agent, system_md: payload.content, note: action.reason,
      });
      return { ok: true };
    }
    return { ok: false, error: `tipo desconhecido: ${type}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function ledgerActions(db, actions, reportId) {
  if (!actions.length) return { proposed: 0, autoExecuted: 0 };
  const { data: policies } = await db.from('agent_policies').select('*');
  const policyByType = new Map((policies || []).map(p => [p.action_type, p]));
  let proposed = 0, autoExecuted = 0;

  for (const a of actions) {
    const policy = policyByType.get(a.action_type);
    if (!policy || !policy.enabled) continue; // kill-switch: tipo desligado
    const auto = policy.auto_execute === true;
    const { data: row } = await db.from('agent_actions').insert({
      agent: a.agent, action_type: a.action_type, payload: a.payload || {},
      reason: a.reason, requires_approval: !auto, report_id: reportId,
      status: 'proposed',
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
  return { proposed, autoExecuted };
}

// ── Retrospectiva semanal (auto-avaliação — fecha o flywheel) ───────────────
// Compara o que o time recomendou há ~1 semana (briefing + snapshot da época,
// que ficam guardados em agent_reports) com o snapshot ATUAL, cruza com as
// decisões do fundador (aprovações/rejeições e 👍/👎) e produz: acertos, erros
// e refinos de prompt propostos (update_prompt → fila de aprovação).
async function runWeeklyRetro(db, client, snapshot) {
  const [prevBriefing, actions, rated] = await Promise.all([
    db.from('agent_reports').select('report_md, data_snapshot, created_at')
      .eq('kind', 'briefing').lt('created_at', new Date(Date.now() - 3 * 864e5).toISOString())
      .order('created_at', { ascending: false }).limit(1),
    db.from('agent_actions').select('agent, action_type, status, reason, requires_approval, created_at')
      .gte('created_at', new Date(Date.now() - 8 * 864e5).toISOString()).limit(200),
    db.from('agent_reports').select('agent, kind, rating')
      .not('rating', 'is', null)
      .gte('created_at', new Date(Date.now() - 14 * 864e5).toISOString()).limit(200),
  ]);

  const prev = prevBriefing.data?.[0] || null;
  const stats = {};
  for (const a of actions.data || []) {
    stats[a.agent] = stats[a.agent] || { propostas: 0, aprovadas_ou_executadas: 0, rejeitadas: 0, falharam: 0 };
    stats[a.agent].propostas += 1;
    if (a.status === 'executed' || a.status === 'approved') stats[a.agent].aprovadas_ou_executadas += 1;
    if (a.status === 'rejected') stats[a.agent].rejeitadas += 1;
    if (a.status === 'failed') stats[a.agent].falharam += 1;
  }
  const ratings = {};
  for (const r of rated.data || []) {
    ratings[r.agent] = ratings[r.agent] || { positivos: 0, negativos: 0 };
    if (r.rating === 1) ratings[r.agent].positivos += 1; else ratings[r.agent].negativos += 1;
  }

  const { text, usage, model } = await ask(client, {
    model: MODEL_ANALYSIS, maxTokens: 8000,
    system: (await systemFor(db, 'ceo')) + `

MODO RETROSPECTIVA SEMANAL: você vai auditar o próprio time. Estrutura:
## O que recomendamos × o que aconteceu
(compare o snapshot da semana passada com o atual, número a número)
## Acertos e erros do time
(seja honesto — rejeição do fundador e 👎 são sinal de erro de calibragem)
## Desempenho por diretor
(taxa de aprovação das ações e ratings)
## Refinos propostos
(0 a 4 itens, formato: update_prompt | agente | diretriz curta e específica que
evitaria o erro ou repetiria o acerto — não proponha refino genérico)
## Lições para a memória (0 a 3, formato save_memory | agente | lição)`,
    user: `SNAPSHOT DE ~1 SEMANA ATRÁS (${prev ? new Date(prev.created_at).toLocaleDateString('pt-BR') : 'indisponível'}):\n` +
      (prev ? JSON.stringify(prev.data_snapshot) : '(sem briefing anterior — primeira retrospectiva; avalie só as ações e ratings)') +
      `\n\nBRIEFING DAQUELA SEMANA:\n${prev ? prev.report_md : '(nenhum)'}` +
      `\n\nSNAPSHOT ATUAL:\n${JSON.stringify(snapshot)}` +
      `\n\nAÇÕES DO TIME NOS ÚLTIMOS 7 DIAS (com decisão do fundador):\n${JSON.stringify(stats)}` +
      `\n\nRATINGS DO FUNDADOR (👍/👎 nos relatórios, 14d):\n${JSON.stringify(ratings)}` +
      `\n\nProduza a retrospectiva semanal.`,
  });
  const retroId = await saveReport(db, {
    agent: 'ceo', kind: 'retro', text, snapshot: {}, usage, model,
  });
  const { actions: retroActions } = await extractActions(client, text);
  await saveReport(db, {
    agent: 'ceo', kind: 'analysis', text: `[extração da retro] ${retroActions.length} ação(ões).`,
    snapshot: {}, usage: null, model: MODEL_ROUTINE,
  });
  const ledger = await ledgerActions(db, retroActions, retroId);
  return { retroId, ...ledger };
}

// ── Ciclo diário completo (cron 7h ou botão) ────────────────────────────────
export async function runDailyCycle(db, { forceWeekly = false } = {}) {
  const isMondaySP = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDay() === 1;
  const weekly = forceWeekly || isMondaySP;
  await assertBudget(db, DIRECTORS.length + 2 + (weekly ? 2 : 0));
  const client = claude();
  const snapshot = await buildSnapshot(db);

  // Segunda-feira: a retrospectiva roda ANTES dos diretores — as lições
  // auto-executadas (save_memory) já entram nos prompts do próprio ciclo.
  let retro = null;
  if (weekly) {
    try { retro = await runWeeklyRetro(db, client, snapshot); }
    catch (e) { console.error('retro falhou (ciclo segue):', e.message); }
  }
  const snapshotJson = JSON.stringify(snapshot);

  // 1. Diretores analisam em paralelo
  const analyses = await Promise.all(DIRECTORS.map(async agentId => {
    const system = await systemFor(db, agentId);
    const { text, usage, model } = await ask(client, {
      model: MODEL_ANALYSIS, system, maxTokens: 6000,
      user: `Snapshot de hoje (JSON):\n${snapshotJson}\n\nProduza sua análise diária.`,
    });
    await saveReport(db, { agent: agentId, kind: 'analysis', text, snapshot: {}, usage, model });
    return { agentId, text };
  }));

  // 2. CEO consolida. Às segundas, o briefing inclui a REVISÃO SEMANAL:
  // progresso vs metas e propostas de ajuste (set_goal).
  const weeklyAsk = weekly
    ? `\n\nHOJE É SEGUNDA-FEIRA: inclua também a seção "## Revisão semanal de metas" — para cada meta ativa do snapshot, realizado vs alvo e se o ritmo alcança o prazo. Se as metas estiverem desatualizadas (ou não existirem), proponha novas via set_goal nas Ações propostas (payload: goal_metric, goal_label, goal_target, goal_unit, goal_deadline) — metas AMBICIOSAS mas ancoradas nos dados.`
    : '';
  const ceoSystem = await systemFor(db, 'ceo');
  const { text: briefing, usage, model } = await ask(client, {
    model: MODEL_ANALYSIS, system: ceoSystem, maxTokens: 8000,
    user: `Snapshot de hoje (JSON):\n${snapshotJson}\n\nAnálises dos diretores:\n\n` +
      analyses.map(a => `=== ${AGENTS[a.agentId].name} ===\n${a.text}`).join('\n\n') +
      `\n\nProduza o briefing executivo do dia.${weeklyAsk}`,
  });
  const reportId = await saveReport(db, {
    agent: 'ceo', kind: 'briefing', text: briefing, snapshot, usage, model,
  });

  // 3. Ações → ledger (auto-executa o permitido; resto aguarda o fundador).
  // O extrator recebe briefing + análises: o texto pronto dos follow-ups
  // costuma estar na análise do CS, não no briefing consolidado.
  const actionSource = `${briefing}\n\n=== ANÁLISES DOS DIRETORES (fonte para payloads completos) ===\n\n` +
    analyses.map(a => `--- ${AGENTS[a.agentId].name} ---\n${a.text}`).join('\n\n');
  const { actions, usage: exUsage } = await extractActions(client, actionSource);
  await saveReport(db, {
    agent: 'ceo', kind: 'analysis', text: `[extração de ações] ${actions.length} ação(ões) extraída(s).`,
    snapshot: {}, usage: exUsage, model: MODEL_ROUTINE,
  });
  const ledger = await ledgerActions(db, actions, reportId);

  return {
    ok: true, reportId, directors: analyses.length, ...ledger,
    weekly, retro: retro ? { proposed: retro.proposed, autoExecuted: retro.autoExecuted } : null,
  };
}

// ── Chat "pergunte aos dados" ────────────────────────────────────────────────
const ROUTE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['agent'],
  properties: { agent: { type: 'string', enum: ['ceo', 'produto', 'growth', 'cs', 'ops', 'financeiro'] } },
};

export async function askTeam(db, question) {
  await assertBudget(db, 2);
  const client = claude();

  const routing = await client.messages.create({
    model: MODEL_ROUTINE, max_tokens: 200,
    system: 'Roteie a pergunta para o agente certo do time de gestão da ZCheck: produto (funil, UX, abandono), growth (ativação, retenção, DAU), cs (saúde de clientes, trials, churn), ops (operação dos clientes, checklists, qualidade), financeiro (MRR, receita, conversão), ceo (visão geral, prioridades, decisões).',
    messages: [{ role: 'user', content: question }],
    output_config: { format: { type: 'json_schema', schema: ROUTE_SCHEMA } },
  });
  let agentId = 'ceo';
  try { agentId = JSON.parse(routing.content.filter(b => b.type === 'text').map(b => b.text).join('')).agent; }
  catch { /* fica no ceo */ }

  const snapshot = await buildSnapshot(db);
  const system = await systemFor(db, agentId);
  const { text, usage, model } = await ask(client, {
    model: MODEL_ANALYSIS, system, maxTokens: 6000,
    user: `Snapshot atual (JSON):\n${JSON.stringify(snapshot)}\n\nPergunta do fundador: ${question}\n\nResponda direto à pergunta.`,
  });
  const reportId = await saveReport(db, { agent: agentId, kind: 'chat', question, text, snapshot: {}, usage, model, calls: 2 });
  return { agent: agentId, agentName: AGENTS[agentId].name, answer: text, reportId };
}
