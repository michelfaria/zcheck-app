'use client';

/**
 * Aba J.I.T. (Just In Time) — o resumo do que importa na operação AGORA.
 *
 * Movida de `app/app/page.js` na Fase 1b da consolidação de abas. Nenhuma linha
 * de lógica mudou: só endereço e os imports do que antes era escopo de módulo
 * compartilhado. Ver `docs/PLANO_CONSOLIDACAO_ABAS.md`.
 *
 * `buildJit` e `buildInsight` vêm junto porque são o motor desta tela: derivam
 * tudo de completions/templates/closures que já estão em memória, sem consulta
 * nova. `JitPanel` é pop-up E página (`asPage`), e as duas formas saem daqui.
 *
 * REGRA: não pode importar de `app/`.
 */

import { useState, useEffect, useRef } from 'react';

import { C, R, W, greenOnDark } from '../../lib/tokens';
// O dia é sempre o do relógio da LOJA — ver lib/dates.js.
import { todayStr, addDays, lastDays, weekStartStr, tzOfUnit } from '../../lib/dates';
import { latestPerRound, earliestPerRound } from '../../lib/rounds';
import {
  applicableItems, templateAtiva, templateStatus, completeRoundChecker,
  isUnitClosed,
} from '../../lib/checklists';
import {
  filterCompletions, countApplicableTemplatesOnDate, summarizeCompletions,
  collaboratorStats, groupStats, punctualityStats,
} from '../../lib/stats';
import { truncName } from '../../lib/format';
import { track } from '../../lib/track';
import { FeedbackThumbs } from './shared';
import { AgoraFollowUp, AgoraLeitura, AgoraPrioridades } from './agora';

/* --------------------------------- J.I.T. (H1) --------------------------------- */


// Deriva o J.I.T. 100% dos dados existentes (completions + templates + closures).
// Escopo: uma loja (líder) ou todas (gerência/gestão, scopeUnitId = null).
//
// `baseUnitId` só existe por causa do fuso: com o escopo na rede inteira não há
// um "hoje" único (as lojas podem estar em fusos diferentes), então o dia é o
// da loja base de quem está olhando. Com escopo de uma loja só, é o dela.
export function buildJit(completions, templates, closures, units, scopeUnitId, baseUnitId = null) {
  const tz = tzOfUnit(units, scopeUnitId || baseUnitId);
  const today = todayStr(tz);
  const yStr = addDays(today, -1);
  const unitIds = scopeUnitId ? [scopeUnitId] : units.map(u => u.id);
  const unitName = id => units.find(u => u.id === id)?.name || id;

  // Mapa itemId → texto, para nomear itens críticos nas recomendações.
  const itemText = new Map();
  templates.forEach(t => (t.items || []).forEach(i => { if (!itemText.has(i.id)) itemText.set(i.id, i.text); }));

  const scopeFilter = dates => (scopeUnitId ? { dates, unitId: scopeUnitId } : { dates });

  // ── Ontem ──
  // `latestPerRound`: o mesmo checklist submetido duas vezes no dia é UMA rodada.
  // Sem isso o J.I.T. contava 19 entregas para 13 previstos e anunciava 146% de
  // aderência — número que não significa nada e que a gestão lia como elogio.
  // Também corrige `ySummary` e o `groupStats` por loja, que somavam os itens da
  // mesma rodada duas vezes.
  const yFiltered = latestPerRound(filterCompletions(completions, scopeFilter([yStr])));
  const ySummary = summarizeCompletions(yFiltered);
  let yExpected = 0;
  unitIds.forEach(uid => { if (!isUnitClosed(closures, uid, yStr)) yExpected += countApplicableTemplatesOnDate(templates, { unitId: uid }, yStr); });
  // Só entrega COMPLETA conta como entrega (30/07/2026). O parcial vira número
  // próprio: a aderência cai, e a tela precisa poder dizer POR QUE caiu.
  const completa = completeRoundChecker(templates);
  const yDone = yFiltered.filter(completa).length;
  const yPartial = yFiltered.length - yDone;
  const yAdherence = yExpected ? Math.round((yDone / yExpected) * 100) : null;

  // ── Hoje ──
  let tExpected = 0;
  unitIds.forEach(uid => { if (!isUnitClosed(closures, uid, today)) tExpected += countApplicableTemplatesOnDate(templates, { unitId: uid }, today); });
  const tRounds = latestPerRound(filterCompletions(completions, scopeFilter([today])));
  const tDone = tRounds.filter(completa).length;
  const tPartial = tRounds.length - tDone;
  const scopeTemplates = templates.filter(t =>
    templateAtiva(t) &&
    (!scopeUnitId || t.unitId === scopeUnitId) &&
    !isUnitClosed(closures, t.unitId, today) &&
    applicableItems(t, today).length > 0);
  const overdue = scopeTemplates.filter(t => templateStatus(t, completions, today, tzOfUnit(units, t.unitId)) === 'overdue');

  // ── Recomendações (rule-based; IA generativa fica para depois — §16) ──
  const recs = [];

  // 1. Itens críticos que ficaram pendentes ≥2× nos últimos 7 dias.
  const last7 = lastDays(7, addDays(today, -1));
  // Uma rodada por dia: sem isso, um crítico pendente em duas submissões do MESMO
  // dia já batia o limite de "≥2× nos últimos 7 dias" e virava recomendação —
  // hotspot inventado a partir de uma reexecução.
  const f7 = latestPerRound(filterCompletions(completions, scopeUnitId ? { dates: last7, unitId: scopeUnitId } : { dates: last7 }));
  const hotspot = new Map();
  f7.forEach(c => (c.items || []).forEach(i => {
    if (i.critical && !i.done) { const k = `${c.unitId}|${i.id}`; hotspot.set(k, (hotspot.get(k) || 0) + 1); }
  }));
  [...hotspot.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).forEach(([k, n]) => {
    const [uid, iid] = k.split('|');
    recs.push({
      id: `hotspot_${k}`, type: 'critical_hotspot',
      text: `${unitName(uid)}: "${truncName(itemText.get(iid) || 'item crítico', 40)}" ficou pendente ${n}× nos últimos 7 dias. Priorize hoje.`,
      unitId: uid, tab: 'painel',
    });
  });

  // 2. Checklists atrasados agora.
  if (overdue.length > 0) {
    const u0 = overdue[0];
    recs.push({
      id: 'overdue_today', type: 'overdue_today',
      text: overdue.length === 1
        ? `"${truncName(u0.name, 36)}" está atrasado em ${unitName(u0.unitId)}.`
        : `${overdue.length} checklists estão atrasados agora. Acompanhe as equipes.`,
      unitId: scopeUnitId ? null : u0.unitId, tab: 'painel',
    });
  }

  // 3. Loja com pior aderência ontem (só na visão multi-loja).
  if (!scopeUnitId && yFiltered.length > 0) {
    const worst = groupStats(yFiltered, 'loja', units).filter(g => g.checklists > 0).sort((a, b) => a.rate - b.rate)[0];
    if (worst && worst.rate < 80) {
      recs.push({
        id: 'low_adherence', type: 'low_adherence',
        text: `${worst.key} fechou ontem com ${Math.round(worst.rate)}% de conclusão. Reforce a rotina hoje.`,
        // Era 'relatorios'. A aba não existe mais, e `onNavigate` se protege com
        // `allowedTabs.includes(targetTab)` — então sem esta linha o cartão
        // viraria clique morto SILENCIOSO: responde ao toque e não acontece
        // nada. As outras três recomendações já apontavam para 'painel'.
        tab: 'painel',
      });
    }
  }

  // Fallback positivo — nunca deixar o J.I.T. vazio.
  if (recs.length === 0) {
    recs.push({
      id: 'all_good', type: 'all_good',
      text: yAdherence != null && yAdherence >= 90
        ? `Ontem fechou com ${yAdherence}% de aderência. Mantenha o ritmo hoje.`
        : 'Sem alertas críticos. Comece o dia acompanhando as aberturas.',
      tab: 'painel',
    });
  }

  // ── Situação por loja (só na visão multi-loja) ──────────────────────────
  // Onde o gestor deve olhar primeiro. Cada loja recebe um score de atenção;
  // ordenado do mais crítico ao menos. Um líder de uma loja só (scopeUnitId
  // definido) não vê ranking entre lojas — não é escopo dele.
  let stores = [];
  if (!scopeUnitId && unitIds.length > 1) {
    // aderência de ONTEM por loja (item-level), para contexto de tendência
    const yByStore = {};
    groupStats(yFiltered, 'loja', units).forEach(g => { yByStore[g.key] = Math.round(g.rate); });

    stores = unitIds.map(uid => {
      const closedToday = isUnitClosed(closures, uid, today);
      const overdueCount = overdue.filter(t => t.unitId === uid).length;
      // itens críticos recorrentes (≥2× em 7d) desta loja
      const criticalHotspots = [...hotspot.entries()]
        .filter(([k, n]) => n >= 2 && k.split('|')[0] === uid).length;
      const expectedToday = closedToday ? 0 : countApplicableTemplatesOnDate(templates, { unitId: uid }, today);
      const doneToday = filterCompletions(completions, { dates: [today], unitId: uid }).length;
      const pendingToday = Math.max(0, expectedToday - doneToday);
      // score de atenção: atraso pesa mais, depois crítico recorrente, depois pendência
      const score = overdueCount * 10 + criticalHotspots * 5 + pendingToday;
      return {
        unitId: uid, name: unitName(uid), closedToday,
        overdue: overdueCount, criticalHotspots, pendingToday,
        expectedToday, doneToday, yAdherence: yByStore[unitName(uid)] ?? null,
        score,
      };
    }).sort((a, b) => b.score - a.score);
  }

  // ── Insight do dia (H4) ────────────────────────────────────────────────────
  // Análise automática que conecta pontos que um humano teria que garimpar:
  // tendência, falha crítica recorrente ou loja destoante. Hoje é rule-based;
  // o contrato de eventos é o mesmo se depois virar LLM (§16 da revisão).
  const insight = buildInsight({ completions, units, unitIds, scopeUnitId, unitName, itemText, hotspot, yFiltered, yAdherence, today });

  // ── Blocos extras, para a versão PÁGINA do J.I.T. (coluna lateral) ──────
  // Não entram no pop-up: ali a tela é estreita e o J.I.T. precisa ser curto.
  // Numa página de desktop, sobra largura — e o gestor já pediu "setor" e
  // gráfico. Tudo derivado dos MESMOS dados; nenhuma consulta nova.

  // (a) Por setor, hoje. `groupStats` já sabe agrupar por setor.
  const tFiltered = latestPerRound(filterCompletions(completions, scopeFilter([today])));
  const sectors = groupStats(tFiltered, 'setor', units)
    .map(g => ({ name: g.key, checklists: g.checklists, rate: Math.round(g.rate), criticalPending: g.criticalPending }))
    .slice(0, 8);

  // (b) Tendência de 7 dias (item-level), do mais antigo ao mais recente — é a
  // ordem de leitura de um gráfico de barras.
  const trend7 = [];
  for (const ds of lastDays(7, today)) {
    const f = filterCompletions(completions, scopeUnitId ? { dates: [ds], unitId: scopeUnitId } : { dates: [ds] });
    const sm = summarizeCompletions(f);
    trend7.push({
      date: ds,
      weekday: new Date(`${ds}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' }).replace('.', '').slice(0, 3),
      rate: f.length ? Math.round(sm.rate) : 0,
      checklists: f.length,
      isToday: ds === today,
    });
  }

  // (c) Críticos recorrentes — o `hotspot` já está calculado para as
  // recomendações; aqui ele vira lista, não só as 2 primeiras.
  const criticalTop = [...hotspot.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, n]) => {
      const [uid, iid] = k.split('|');
      return { unitId: uid, unitName: unitName(uid), text: itemText.get(iid) || 'item crítico', count: n };
    });

  // (d) Quem executou hoje.
  const peopleToday = collaboratorStats(tFiltered).slice(0, 5);

  // (e) Pontualidade — no prazo × fora do prazo, por loja e por setor.
  //
  // Dois recortes de tempo porque um só mente: "hoje" às 9h ainda não tem os
  // fechamentos da noite e faria a operação parecer pontual todo dia de manhã;
  // "7 dias" é o hábito, mas esconde o que quebrou nesta manhã. O gestor
  // alterna entre os dois na tela — o cálculo dos dois é barato e já está tudo
  // em memória.
  const dates7 = lastDays(7, today);
  // Pontualidade usa a PRIMEIRA submissão da rodada, não a última: uma entrega
  // feita no prazo não vira atrasada porque alguém reabriu uma tarefa e submeteu
  // de novo horas depois. Sem desduplicar, a mesma rodada aparecia duas vezes —
  // uma no prazo e outra fora — e era isso que produzia "10 no prazo, 9 fora"
  // num dia de 13 checklists previstos.
  // Parte da lista CRUA de propósito: `tFiltered` já foi reduzido à última
  // submissão de cada rodada, e filtrar a primeira sobre isso não teria efeito.
  const punctuality = {
    today: punctualityStats(earliestPerRound(filterCompletions(completions, scopeFilter([today]))), templates, units),
    last7: punctualityStats(earliestPerRound(filterCompletions(completions, scopeFilter(dates7))), templates, units),
  };

  /**
   * Status da BASE da empresa, agora. O J.I.T. deixou de ser "o resumo de hoje"
   * e passou a ser "o estado da operação neste momento" — e estado inclui a
   * estrutura, não só a execução: quantas unidades existem, quantas estão de
   * folga hoje, quantos checklists ativos, quanta gente pôs a mão.
   * Tudo derivado do que já está em memória; nenhuma consulta nova.
   */
  const tAll = filterCompletions(completions, scopeFilter([today]));
  const tSummary = summarizeCompletions(tAll);
  const base = {
    units: unitIds.length,
    unitsClosed: unitIds.filter(uid => isUnitClosed(closures, uid, today)).length,
    sectors: new Set(templates.filter(t => templateAtiva(t) && (!scopeUnitId || t.unitId === scopeUnitId)).map(t => t.sector).filter(Boolean)).size,
    templates: templates.filter(t => templateAtiva(t) && (!scopeUnitId || t.unitId === scopeUnitId)).length,
    peopleToday: new Set(tAll.map(c => c.operatorUserId || c.operatorName).filter(Boolean)).size,
    executionsToday: tAll.length,
    criticalOpenToday: tSummary.criticalPending,
    evidencesToday: tSummary.photos,
  };

  return {
    date: today,
    scopeUnitId: scopeUnitId || null,
    scopeLabel: scopeUnitId ? unitName(scopeUnitId) : `todas as ${unitIds.length} unidade${unitIds.length === 1 ? '' : 's'}`,
    base,
    // `checklists` = entregas COMPLETAS (o numerador da aderência); `partial` = as
    // que foram submetidas incompletas. `pending` desconta as duas, senão a soma
    // "concluídos + pendentes" não fecha com os previstos e a tela mente de outro
    // jeito: um checklist entregue pela metade não é pendente nem concluído.
    yesterday: { adherence: yAdherence, checklists: yDone, partial: yPartial, expected: yExpected, rate: Math.round(ySummary.rate), criticalPending: ySummary.criticalPending },
    today: { expected: tExpected, done: tDone, partial: tPartial, pending: Math.max(0, tExpected - tDone - tPartial), overdue: overdue.length },
    recommendations: recs.slice(0, 3),
    stores,
    insight,
    sectors,
    trend7,
    criticalTop,
    peopleToday,
    punctuality,
  };
}

// Motor de insight (H4) — escolhe o padrão MAIS relevante dos dados recentes.
// Prioridade: queda de tendência > falha crítica recorrente > loja destoante > estável.
// `today` vem de quem chama (buildJit), já resolvido no fuso da loja em escopo
// — recalcular aqui daria um dia diferente para uma loja fora de Brasília.
function buildInsight({ completions, units, unitIds, scopeUnitId, unitName, itemText, hotspot, yFiltered, yAdherence, today }) {
  const wkThis = weekStartStr(today);
  const wkPrev = weekStartStr(addDays(today, -7));

  // Últimos 14 dias no escopo, agrupados por unidade × semana (item-level).
  const dates14 = lastDays(14, today);
  const f14 = filterCompletions(completions, scopeUnitId ? { dates: dates14, unitId: scopeUnitId } : { dates: dates14 });
  const perUnitWk = {};
  f14.forEach(c => {
    const wk = weekStartStr(c.date);
    if (wk !== wkThis && wk !== wkPrev) return;
    perUnitWk[c.unitId] = perUnitWk[c.unitId] || {};
    const slot = (perUnitWk[c.unitId][wk] = perUnitWk[c.unitId][wk] || { total: 0, done: 0 });
    (c.items || []).forEach(i => { slot.total++; if (i.done) slot.done++; });
  });

  // 1. Maior queda de tendência semana-a-semana (≥15 p.p., base mínima de 5 itens).
  let worstDrop = null;
  Object.entries(perUnitWk).forEach(([u, wks]) => {
    const t = wks[wkThis], p = wks[wkPrev];
    if (t && p && t.total >= 5 && p.total >= 5) {
      const rt = Math.round((t.done / t.total) * 100);
      const rp = Math.round((p.done / p.total) * 100);
      const drop = rp - rt;
      if (drop >= 15 && (!worstDrop || drop > worstDrop.drop)) worstDrop = { unitId: u, rt, rp, drop };
    }
  });
  if (worstDrop) {
    return {
      id: `trend_${worstDrop.unitId}`, type: 'trend_decline',
      headline: `${unitName(worstDrop.unitId)} está caindo de rendimento`,
      evidence: `A conclusão passou de ${worstDrop.rp}% na semana passada para ${worstDrop.rt}% esta semana (−${worstDrop.drop} p.p.). Vale entender o que mudou na operação e agir hoje, antes de virar hábito.`,
      unitId: worstDrop.unitId,
    };
  }

  // 2. Falha crítica recorrente (≥3× em 7 dias).
  let topHot = null;
  [...hotspot.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
    if (!topHot && n >= 3) { const [u, iid] = k.split('|'); topHot = { unitId: u, iid, n }; }
  });
  if (topHot) {
    return {
      id: `crit_${topHot.unitId}_${topHot.iid}`, type: 'recurring_critical',
      headline: `Falha crítica que se repete em ${unitName(topHot.unitId)}`,
      evidence: `"${truncName(itemText.get(topHot.iid) || 'item crítico', 44)}" ficou pendente ${topHot.n}× nos últimos 7 dias. É um risco recorrente — ataque a causa, não só a tarefa do dia.`,
      unitId: topHot.unitId,
    };
  }

  // 3. Loja destoante ontem (diferença ≥25 p.p. entre melhor e pior).
  if (!scopeUnitId && yFiltered.length > 0) {
    const groups = groupStats(yFiltered, 'loja', units).filter(g => g.checklists > 0);
    const worst = [...groups].sort((a, b) => a.rate - b.rate)[0];
    const best = [...groups].sort((a, b) => b.rate - a.rate)[0];
    if (worst && best && best.rate - worst.rate >= 25) {
      return {
        id: `outlier_${worst.key}`, type: 'sector_outlier',
        headline: `${worst.key} destoa das outras lojas`,
        evidence: `Ontem ${worst.key} fechou com ${Math.round(worst.rate)}% enquanto ${best.key} fez ${Math.round(best.rate)}%. A diferença sugere um problema local, não geral — olhe o que a ${best.key} faz diferente.`,
      };
    }
  }

  // 4. Baixa atividade / estável / dados insuficientes.
  const lowActivity = yAdherence != null && yAdherence < 50;
  return {
    id: lowActivity ? 'low_activity' : 'stable',
    type: lowActivity ? 'low_activity' : 'stable',
    headline: yAdherence != null && yAdherence >= 85
      ? 'Operação saudável e estável'
      : lowActivity ? 'Baixa atividade registrada ontem' : 'Sem padrões críticos hoje',
    evidence: yAdherence == null
      ? 'Ainda não há dados suficientes para uma análise mais profunda. Conforme a rotina roda, os insights ficam mais precisos.'
      : lowActivity
        ? `Só ${yAdherence}% dos checklists previstos foram concluídos ontem. Confirme se as equipes estão registrando a rotina no app — sem dado, não há como acompanhar a operação.`
        : `A aderência de ontem (${yAdherence}%) está dentro do esperado. Bom momento para reforçar o que está funcionando.`,
  };
}

/**
 * O pop-up de briefing — o único PUSH para dentro do app.
 *
 * Sobreviveu à consolidação porque é a única coisa que CHEGA ao gestor sem ele
 * ir buscar: `jit_opened` com `source: auto|manual` é a métrica de hábito, e
 * `jit_skipped` é o que distingue "dia quieto" de "gestor abandonou". Sem ele o
 * briefing viraria algo que se precisa lembrar de rolar até — e rolagem é
 * justamente o que a consolidação cortou.
 *
 * O que mudou: ele deixou de ser "a página do J.I.T. dentro de uma gaveta".
 * Antes, pop-up e página eram o mesmo componente com um flag `asPage`, e a
 * página era o superset. Com a página virando o Painel inteiro, herdar isso
 * daria 12+ blocos num sheet de 92vh. Agora ele renderiza EXATAMENTE o registro
 * AGORA — os mesmos componentes de `./agora` que o Painel usa, sem segunda
 * implementação — e o resto vive no Painel, nos registros onde faz sentido.
 *
 * Saíram: Ontem e Hoje (fundidos no score do dia), Entrega no prazo (segmento
 * Tendência), Situação por loja (seção REDE) e toda a coluna lateral, que nunca
 * renderizou no sheet de qualquer forma.
 */
export function JitPanel({ jit, currentUser, accent, openSource, actionPlans, onCreatePlan, onCompletePlan, onClose, onNavigate }) {
  const startRef = useRef(Date.now());
  // A memória do J.I.T.: recomendação com plano aberto nasce marcada — fechar e
  // reabrir o pop-up não "desfaz" mais o compromisso.
  const [actioned, setActioned] = useState(() =>
    Object.fromEntries((actionPlans || []).map(p => [p.recId, true])));
  useEffect(() => {
    if (!actionPlans?.length) return;
    setActioned(a => ({ ...Object.fromEntries(actionPlans.map(p => [p.recId, true])), ...a }));
  }, [actionPlans]);
  // Esc fecha: uma saída que não depende de acertar o × com o dedo.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [planAnswers, setPlanAnswers] = useState({});
  const [survey, setSurvey] = useState(null);
  const [insightFeedback, setInsightFeedback] = useState(null);
  const [insightActioned, setInsightActioned] = useState(false);
  const insight = jit.insight;
  const pendingPlans = (actionPlans || []).filter(p => p.jitDate !== jit.date);
  const planAgeDays = p => Math.max(1, Math.round((new Date(`${jit.date}T00:00:00`) - new Date(`${p.jitDate}T00:00:00`)) / 86400000));

  useEffect(() => {
    track('jit_opened', { source: openSource, metadata: { ui: 2, recommendations: jit.recommendations.length } });
    if (insight) track('ai_insight_viewed', { source: 'jit', unitId: insight.unitId || undefined, metadata: { ui: 2, insight_id: insight.id, type: insight.type } });
    const start = startRef.current;
    return () => {
      track('jit_dwell', { source: openSource, metadata: { ui: 2, seconds: Math.round((Date.now() - start) / 1000) } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolvePlan = async plan => {
    if (planAnswers[plan.id]) return;
    setPlanAnswers(a => ({ ...a, [plan.id]: 'done' }));
    const ok = await onCompletePlan(plan);
    if (ok) {
      track('action_plan_completed', { source: 'jit', unitId: plan.unitId || undefined,
        metadata: { ui: 2, plan_id: plan.id, rec_id: plan.recId, rec_type: plan.recType, age_days: planAgeDays(plan) } });
    }
  };
  const keepPlan = plan => {
    if (planAnswers[plan.id]) return;
    setPlanAnswers(a => ({ ...a, [plan.id]: 'kept' }));
  };
  const rateInsight = ans => {
    if (insightFeedback || !insight) return;
    setInsightFeedback(ans);
    track('ai_insight_feedback', { source: 'jit', unitId: insight.unitId || undefined, metadata: { ui: 2, insight_id: insight.id, type: insight.type, answer: ans } });
  };
  const actOnInsight = () => {
    if (!insight) return;
    if (!insightActioned) {
      setInsightActioned(true);
      track('ai_insight_actioned', { source: 'jit', unitId: insight.unitId || undefined, metadata: { ui: 2, insight_id: insight.id, type: insight.type } });
    }
    if (insight.unitId) onNavigate?.(insight.unitId, 'painel');
  };
  const clickRec = rec => {
    track('recommendation_clicked', { source: 'jit', unitId: rec.unitId || undefined, metadata: { ui: 2, rec_id: rec.id, type: rec.type } });
    if (rec.tab || rec.unitId) onNavigate?.(rec.unitId, rec.tab);
  };
  const actionRec = async (rec, e) => {
    e.stopPropagation();
    if (actioned[rec.id]) return;
    setActioned(a => ({ ...a, [rec.id]: true }));
    track('recommendation_actioned', { source: 'jit', unitId: rec.unitId || undefined, metadata: { ui: 2, rec_id: rec.id, type: rec.type } });
    const plan = await onCreatePlan(rec);
    if (plan) {
      track('action_plan_created', { source: 'jit', unitId: rec.unitId || undefined,
        metadata: { ui: 2, plan_id: plan.id, rec_id: rec.id, rec_type: rec.type } });
    }
  };
  const answerSurvey = ans => {
    if (survey) return;
    setSurvey(ans);
    track('survey_answered', { source: 'jit', metadata: { ui: 2, question: 'briefing_helped_prioritize', answer: ans } });
  };

  const dateLabel = new Date(`${jit.date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const [tick, setTick] = useState(() => new Date());
  useEffect(() => {
    setTick(new Date());
    const id = setInterval(() => setTick(new Date()), 60000);
    return () => clearInterval(id);
  }, [jit]);
  const updatedAt = tick.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div onClick={onClose}
      className="zc-sheet zc-sheet--drawer"
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,60,92,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
      <div onClick={e => e.stopPropagation()}
        className="zc-sheet-panel"
        style={{ width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', background: C.bg, borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.3)', paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}>

        {/* Cabeçalho sticky: o × ficava rolando para fora da tela junto com o
            conteúdo. Alvo de toque de 40px, o mínimo de acessibilidade. */}
        <div style={{ background: accent, color: 'white', padding: '20px 20px 18px', borderRadius: '20px 20px 0 0', position: 'sticky', top: 0, zIndex: 2 }}>
          <button type="button" onClick={onClose} aria-label="Fechar"
            style={{ position: 'absolute', top: 12, right: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white', borderRadius: 999,
              width: 40, height: 40, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0, zIndex: 3 }}>×</button>
          <p style={{ fontSize: 11, fontWeight: W.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>Agora</p>
          <p className="font-display" style={{ fontSize: 'calc(22px * var(--zc-t-scale))', fontWeight: W.bold, marginTop: 6 }}>Sua operação agora</p>
          <p style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
            <span style={{ textTransform: 'capitalize' }}>{dateLabel}</span>
            {' · '}
            <span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: R.pill, background: greenOnDark, marginRight: 5, verticalAlign: 'middle' }} />
            atualizado às {updatedAt}
            {jit.scopeLabel ? ` · ${jit.scopeLabel}` : ''}
          </p>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AgoraFollowUp plans={pendingPlans} answers={planAnswers} onResolve={resolvePlan} onKeep={keepPlan} ageOf={planAgeDays} />
          <AgoraLeitura insight={insight} accent={accent} feedback={insightFeedback}
            actioned={insightActioned} onRate={rateInsight} onAct={actOnInsight} />
          <AgoraPrioridades recs={jit.recommendations || []} actioned={actioned}
            onClickRec={clickRec} onActionRec={actionRec} />

          <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', textAlign: 'center' }}>
            {survey ? (
              <p style={{ fontSize: 13, color: C.success, fontWeight: W.semibold }}>Obrigado pelo retorno!</p>
            ) : (
              <>
                <p style={{ fontSize: 13, color: C.ink, marginBottom: 10, fontWeight: W.semibold }}>Isto te ajudou a priorizar?</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <FeedbackThumbs onRate={answerSurvey} size={17} />
                </div>
              </>
            )}
          </div>

          {/* O destino deixou de ser "a operação" genérica: é o Painel, onde o
              mesmo AGORA continua visível junto do resto do dia. */}
          <button onClick={onClose} style={{ padding: '14px 0', borderRadius: 12, background: accent, color: 'white', border: 'none', fontWeight: W.semibold, fontSize: 15, cursor: 'pointer', marginTop: 2 }}>
            Abrir o painel →
          </button>
        </div>
      </div>
    </div>
  );
}
