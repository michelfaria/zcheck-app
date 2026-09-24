// Prova do monitoramento do Zeca (lib/supportInsights.js): o status que o Core
// mostra, o motivo que ele dá, e a leitura das perguntas.
//
// O que este teste protege, concretamente:
//   - "inativo" tem que sair de um sinal REAL de indisponibilidade (sem chave,
//     probe falho) — nunca de pouco uso. Um assistente sem perguntas está de pé.
//   - "sem crédito" precisa ser dito com essas palavras: foi assim que a API
//     caiu na Fase 2.1, e "erro desconhecido" custou tempo de diagnóstico.
//   - a classificação por tema é o que liga pergunta a artigo: se ela deixar de
//     reconhecer PIN, foto ou preço, o painel vira uma lista de frases soltas.

import assert from 'node:assert/strict';
import { healthFrom, classify, topTerms, summarize, TOPICS } from '../lib/supportInsights.js';

const NOW = Date.parse('2026-09-24T12:00:00Z');
const hoursAgo = h => new Date(NOW - h * 36e5).toISOString();
const daysAgo = d => new Date(NOW - d * 864e5).toISOString();

// ── Saúde ────────────────────────────────────────────────────────────────────
{
  const h = healthFrom({
    hasApiKey: true, articleCount: 27, lastProbe: { ok: true, ms: 420 },
    lastChatAt: hoursAgo(2), chats7: 12, down7: 1, now: NOW,
  });
  assert.equal(h.status, 'ativo');
  assert.equal(h.reasons.length, 0, 'tudo em ordem não deve inventar motivo');
}

{
  const h = healthFrom({ hasApiKey: false, articleCount: 27, lastChatAt: hoursAgo(3), now: NOW });
  assert.equal(h.status, 'inativo');
  const r = h.reasons.find(x => x.code === 'no_api_key');
  assert.ok(r, 'sem chave precisa dizer QUAL variável falta');
  assert.match(r.detail, /ANTHROPIC_API_KEY/);
  assert.match(r.fix, /Vercel/);
}

{
  // Crédito zerado: a mensagem da API é o único lugar onde isso aparece.
  const h = healthFrom({
    hasApiKey: true, articleCount: 27, now: NOW, lastChatAt: hoursAgo(5),
    lastProbe: { ok: false, error: 'Your credit balance is too low to access the API' },
  });
  assert.equal(h.status, 'inativo');
  const r = h.reasons.find(x => x.code === 'no_credit');
  assert.ok(r, 'erro de crédito tem que ser nomeado como crédito, não como falha genérica');
  assert.match(r.fix, /[Rr]ecarregue/);
}

{
  const h = healthFrom({
    hasApiKey: true, articleCount: 27, now: NOW, lastChatAt: hoursAgo(5),
    lastProbe: { ok: false, error: 'model not found' },
  });
  assert.equal(h.status, 'inativo');
  assert.ok(h.reasons.some(x => x.code === 'probe_failed'));
  assert.ok(!h.reasons.some(x => x.code === 'no_credit'));
}

{
  // Silêncio NÃO é queda: sem tráfego o assistente continua ativo.
  const h = healthFrom({ hasApiKey: true, articleCount: 27, lastProbe: { ok: true }, lastChatAt: null, now: NOW });
  assert.equal(h.status, 'ativo');
  assert.ok(h.reasons.some(x => x.code === 'no_traffic' && x.severity === 'info'));

  const idle = healthFrom({
    hasApiKey: true, articleCount: 27, lastProbe: { ok: true }, lastChatAt: daysAgo(30), now: NOW,
  });
  assert.equal(idle.status, 'ativo');
  assert.ok(idle.reasons.some(x => x.code === 'idle'));
}

{
  // Base vazia e log desligado degradam, não derrubam.
  const h = healthFrom({ hasApiKey: true, articleCount: 0, hasServiceKey: false, lastProbe: { ok: true }, lastChatAt: hoursAgo(1), now: NOW });
  assert.equal(h.status, 'degradado');
  assert.ok(h.reasons.some(x => x.code === 'no_knowledge'));
  assert.ok(h.reasons.some(x => x.code === 'no_log'));
}

{
  // Reprovação alta só alerta com volume: 1 voto negativo em 3 conversas não é padrão.
  const pouco = healthFrom({ hasApiKey: true, articleCount: 27, lastProbe: { ok: true }, lastChatAt: hoursAgo(1), chats7: 3, down7: 2, now: NOW });
  assert.equal(pouco.status, 'ativo');
  const muito = healthFrom({ hasApiKey: true, articleCount: 27, lastProbe: { ok: true }, lastChatAt: hoursAgo(1), chats7: 20, down7: 9, now: NOW });
  assert.equal(muito.status, 'degradado');
  assert.ok(muito.reasons.some(x => x.code === 'high_negative'));
}

// ── Classificação ────────────────────────────────────────────────────────────
{
  assert.equal(classify('esqueci meu PIN, como recupero?'), 'pin_login');
  assert.equal(classify('a foto não anexa no checklist'), 'foto');
  assert.equal(classify('quanto custa pra colocar mais uma loja?'), 'plano_cobranca');
  assert.equal(classify('o checklist não aparece no celular do Nicolas'), 'checklist_sumiu');
  assert.equal(classify('como faço pra exportar o relatório em PDF'), 'relatorios');
  assert.equal(classify('bom dia'), null, 'pergunta sem assunto não pode ser forçada num tema');
  // Todo tema precisa de rótulo legível — o painel mostra o label, não o id.
  for (const t of TOPICS) assert.ok(t.label && t.label !== t.id, `tema ${t.id} sem rótulo`);
}

// ── Termos ───────────────────────────────────────────────────────────────────
{
  const terms = topTerms([
    'como troco o pin do colaborador',
    'o pin do colaborador não funciona',
    'trocar pin do colaborador novo',
    'bom dia tudo bem',
  ]);
  const listed = terms.map(t => t.term);
  assert.ok(listed.includes('pin colaborador'), 'bigrama repetido tem que aparecer');
  assert.ok(!listed.includes('dia'), 'termo de uma ocorrência é ruído');
  assert.ok(!listed.includes('como'), 'stopword não pode virar tema');
}

// ── Consolidação ─────────────────────────────────────────────────────────────
{
  const chats = [
    { session_key: 's1', question: 'esqueci meu pin', reply: 'r', helpful: false, created_at: hoursAgo(1) },
    { session_key: 's1', question: 'e o pin do gerente?', reply: 'r', helpful: true, created_at: hoursAgo(2) },
    { session_key: 's2', question: 'a foto não salva', reply: 'r', helpful: null, created_at: daysAgo(3) },
    { session_key: 's3', question: 'como cadastro uma promoção de aniversário', reply: 'r', helpful: null, created_at: daysAgo(10) },
    { session_key: 's4', question: 'esqueci meu pin de novo', reply: 'r', helpful: null, created_at: daysAgo(45) }, // fora dos 30d
  ];
  const helpEvents = [
    { event_type: 'help_search_results', metadata: { query: 'nota fiscal', results: 0 }, occurred_at: daysAgo(2) },
    { event_type: 'help_search_results', metadata: { query: 'nota fiscal', results: 0 }, occurred_at: daysAgo(1) },
    { event_type: 'help_search_results', metadata: { query: 'pin', results: 4 }, occurred_at: daysAgo(1) },
    { event_type: 'help_article_viewed', metadata: { article: 'conta-e-acesso/esqueci-meu-pin-ou-codigo' }, occurred_at: daysAgo(1) },
    { event_type: 'help_article_feedback', metadata: { article: 'usando-checklists/checklist-atrasado', helpful: false }, occurred_at: daysAgo(1) },
  ];
  const s = summarize({ chats, helpEvents, now: NOW });

  assert.equal(s.volume.total7, 3, 'a janela de 7 dias não pode pegar a conversa de 10 dias atrás');
  assert.equal(s.volume.total30, 4, 'conversa de 45 dias fica fora dos 30d');
  assert.equal(s.volume.sessions30, 3, 'duas perguntas da mesma sessão contam como uma sessão');
  assert.equal(s.volume.up30, 1);
  assert.equal(s.volume.down30, 1);
  assert.equal(s.volume.approval30, 50, '% é sobre quem avaliou, não sobre o total');

  const pin = s.topics.find(t => t.id === 'pin_login');
  assert.equal(pin.count, 2);
  assert.equal(pin.down, 1);
  assert.ok(pin.article, 'tema com artigo tem que trazer o link para o painel');

  assert.equal(s.untagged.count, 1, 'pergunta sobre promoção não tem tema — é lacuna');
  assert.match(s.untagged.examples[0], /promoção/);

  assert.deepEqual(s.central.zeroResults[0], { key: 'nota fiscal', count: 2 });
  assert.equal(s.central.searches30, 3);
  assert.equal(s.central.badArticles[0].key, 'usando-checklists/checklist-atrasado');

  assert.equal(s.negatives.length, 1);
  assert.match(s.negatives[0].question, /esqueci meu pin/);
  assert.equal(s.daily.length, 3, 'um ponto por dia com conversa');
  assert.equal(s.lastChatAt, chats[0].created_at);
}

// Sem nada gravado, a consolidação não pode explodir nem inventar número.
{
  const s = summarize({ chats: [], helpEvents: [], now: NOW });
  assert.equal(s.volume.total30, 0);
  assert.equal(s.volume.approval30, null, 'sem avaliação não existe 0% — existe "—"');
  assert.deepEqual(s.topics, []);
  assert.equal(s.lastChatAt, null);
}

console.log('support-insights: ok');
