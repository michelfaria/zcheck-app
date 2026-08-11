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
import {
  AlertTriangle, Check, CheckCircle2, Circle, Clock, TrendingDown,
} from 'lucide-react';
import { C, R, T, W, successBright, greenOnDark } from '../../lib/tokens';
// O dia é sempre o do relógio da LOJA — ver lib/dates.js.
import { todayStr, addDays, lastDays, weekStartStr, tzOfUnit } from '../../lib/dates';
import { latestPerRound, earliestPerRound } from '../../lib/rounds';
import {
  applicableItems, templateAtiva, templateStatus, completeRoundChecker,
  isUnitClosed,
} from '../../lib/checklists';
import {
  PUNCTUALITY_PERIODS, PUNCTUALITY_GROUPS, filterCompletions,
  countApplicableTemplatesOnDate, summarizeCompletions, collaboratorStats,
  groupStats, punctualityStats,
} from '../../lib/stats';
import { truncName } from '../../lib/format';
import { track } from '../../lib/track';
import { SectionMark, FeedbackThumbs } from './shared';

/* --------------------------------- J.I.T. (H1) --------------------------------- */

/**
 * Ícone de cada recomendação, por `type`. Fica FORA dos objetos de dados de
 * propósito: `buildJit` é lógica pura e testável (tests/), e devolver componente
 * React de lá misturaria dado com apresentação. A chave é o `type`, então uma
 * recomendação nova sem entrada aqui cai no genérico em vez de quebrar.
 */
const RECOMMENDATION_ICON = {
  critical_hotspot: AlertTriangle,
  overdue_today: Clock,
  low_adherence: TrendingDown,
  all_good: CheckCircle2,
};

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
        tab: 'relatorios',
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
 * `asPage` renderiza o MESMO conteúdo sem o overlay fixo, para o J.I.T. virar
 * um destino de navegação (menu lateral > Operação > J.I.T.) além de continuar
 * abrindo sozinho no início do dia. O gestor pedia poder voltar nele quando
 * quisesse; antes, fechado o pop-up, o J.I.T. do dia sumia até amanhã.
 */
export function JitPanel({ jit, currentUser, accent, openSource, actionPlans, onCreatePlan, onCompletePlan, onClose, onNavigate, asPage = false }) {
  const startRef = useRef(Date.now());
  // A memória do J.I.T.: recomendações que já têm plano aberto nascem marcadas
  // — fechar e reabrir o modal não "desfaz" mais o compromisso.
  const [actioned, setActioned] = useState(() =>
    Object.fromEntries((actionPlans || []).map(p => [p.recId, true])));
  // Os planos chegam por fetch assíncrono e podem aterrissar depois do modal
  // montar — mescla sem apagar o que o gestor marcou nesta sessão.
  useEffect(() => {
    if (!actionPlans?.length) return;
    setActioned(a => ({ ...Object.fromEntries(actionPlans.map(p => [p.recId, true])), ...a }));
  }, [actionPlans]);
  // Esc fecha: um caminho de saída que não depende de acertar o × com o dedo.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Follow-up: planos abertos de dias ANTERIORES, cobrados no topo do J.I.T.
  const pendingPlans = (actionPlans || []).filter(p => p.jitDate !== jit.date);
  const [planAnswers, setPlanAnswers] = useState({}); // planId → 'done' | 'kept'
  const [survey, setSurvey] = useState(null);
  const [insightFeedback, setInsightFeedback] = useState(null);
  const [insightActioned, setInsightActioned] = useState(false);
  const insight = jit.insight;

  // Pontualidade: recorte de tempo e de agrupamento. Padrão "7 dias" porque
  // "hoje" às 9h ainda não tem os fechamentos da noite — abrir no recorte que
  // parece ótimo toda manhã seria enganar o gestor logo na primeira leitura.
  const [punPeriod, setPunPeriod] = useState('last7');
  const [punGroup, setPunGroup] = useState('loja');

  const planAgeDays = p => Math.max(1, Math.round((new Date(`${jit.date}T00:00:00`) - new Date(`${p.jitDate}T00:00:00`)) / 86400000));

  const resolvePlan = async plan => {
    if (planAnswers[plan.id]) return;
    setPlanAnswers(a => ({ ...a, [plan.id]: 'done' }));
    const ok = await onCompletePlan(plan);
    if (ok) {
      track('action_plan_completed', { source: 'jit', unitId: plan.unitId || undefined,
        metadata: { plan_id: plan.id, rec_id: plan.recId, rec_type: plan.recType, age_days: planAgeDays(plan) } });
    }
  };
  const keepPlan = plan => {
    if (planAnswers[plan.id]) return;
    setPlanAnswers(a => ({ ...a, [plan.id]: 'kept' }));
  };

  // Instrumentação de abertura + tempo em tela (dwell consolidado em 1 evento — §8).
  useEffect(() => {
    track('jit_opened', { source: openSource, metadata: { recommendations: jit.recommendations.length } });
    if (insight) track('ai_insight_viewed', { source: 'jit', unitId: insight.unitId || undefined, metadata: { insight_id: insight.id, type: insight.type } });
    const start = startRef.current;
    return () => {
      track('jit_dwell', { source: openSource, metadata: { seconds: Math.round((Date.now() - start) / 1000) } });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rateInsight = ans => {
    if (insightFeedback || !insight) return;
    setInsightFeedback(ans);
    track('ai_insight_feedback', { source: 'jit', unitId: insight.unitId || undefined, metadata: { insight_id: insight.id, type: insight.type, answer: ans } });
  };
  const actOnInsight = () => {
    if (!insight) return;
    if (!insightActioned) {
      setInsightActioned(true);
      track('ai_insight_actioned', { source: 'jit', unitId: insight.unitId || undefined, metadata: { insight_id: insight.id, type: insight.type } });
    }
    if (insight.unitId) onNavigate(insight.unitId, 'painel');
  };

  const clickRec = rec => {
    track('recommendation_clicked', { source: 'jit', unitId: rec.unitId || undefined, metadata: { rec_id: rec.id, type: rec.type } });
    if (rec.tab || rec.unitId) onNavigate(rec.unitId, rec.tab);
  };
  const actionRec = async (rec, e) => {
    e.stopPropagation();
    if (actioned[rec.id]) return;
    setActioned(a => ({ ...a, [rec.id]: true }));
    track('recommendation_actioned', { source: 'jit', unitId: rec.unitId || undefined, metadata: { rec_id: rec.id, type: rec.type } });
    // Persiste o compromisso: é isso que faz o J.I.T. cobrar depois.
    const plan = await onCreatePlan(rec);
    if (plan) {
      track('action_plan_created', { source: 'jit', unitId: rec.unitId || undefined,
        metadata: { plan_id: plan.id, rec_id: rec.id, rec_type: rec.type } });
    }
  };
  const answerSurvey = ans => {
    if (survey) return;
    setSurvey(ans);
    track('survey_answered', { source: 'jit', metadata: { question: 'briefing_helped_prioritize', answer: ans } });
  };

  const y = jit.yesterday, t = jit.today;
  const dateLabel = new Date(`${jit.date}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const firstName = (currentUser?.name || '').split(' ')[0];
  const scopeLabel = jit.scopeLabel || '';

  /**
   * Carimbo de frescor. O J.I.T. não é um resumo de manhã que envelhece durante
   * o dia: `completions` chega por realtime (subscribeToCompletions) e o
   * J.I.T. é um useMemo sobre ele, então o conteúdo já se refaz sozinho a cada
   * execução registrada. O relógio existe para o gestor VER isso — sem ele, um
   * painel ao vivo é indistinguível de um painel parado.
   */
  const [tick, setTick] = useState(() => new Date());
  useEffect(() => {
    setTick(new Date());
    const id = setInterval(() => setTick(new Date()), 60000);
    return () => clearInterval(id);
  }, [jit]);
  const updatedAt = tick.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const Stat = ({ label, value, sub, color }) => (
    <div style={{ flex: 1, textAlign: 'center', padding: '10px 6px' }}>
      <p style={{ fontSize: 26, fontWeight: W.bold, color: color || C.ink, lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 11, color: C.muted, marginTop: 4, fontWeight: W.semibold }}>{label}</p>
      {sub && <p style={{ fontSize: 10, color: C.mutedLight, marginTop: 2 }}>{sub}</p>}
    </div>
  );

  // ── Painéis laterais: só na versão PÁGINA ────────────────────────────────
  // No pop-up a tela é estreita e o J.I.T. tem de ser curto. Numa página de
  // desktop sobrava metade do monitor em branco — o que lê como "falta coisa",
  // não como respiro. Tudo aqui vem do mesmo `J.I.T.`; nenhuma consulta nova.
  const Card = ({ title, children, sub }) => (
    <section style={{
      background: '#fff', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 16,
    }}>
      <h3 style={{
        fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase',
        letterSpacing: '0.06em', color: C.muted,
      }}>{title}</h3>
      {sub && <p style={{ fontSize: T.caption, color: C.mutedLight, marginTop: 2 }}>{sub}</p>}
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );

  const Row = ({ label, right, meta, rate, tone = C.ink }) => (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: T.bodySm, fontWeight: W.medium, color: C.ink, minWidth: 0, flex: 1 }}>{label}</span>
        <span className="font-display" style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: tone }}>{right}</span>
      </div>
      {meta && <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>{meta}</p>}
      {typeof rate === 'number' && (
        <div style={{ height: 5, borderRadius: R.pill, background: C.bg, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.max(2, Math.min(100, rate))}%`, background: rate >= 80 ? successBright : rate >= 50 ? C.warning : C.critical, borderRadius: R.pill }} />
        </div>
      )}
    </div>
  );

  const trend = jit.trend7 || [];
  const maxTrend = Math.max(100, ...trend.map(d => d.rate));

  // ── Pontualidade: derivados ──────────────────────────────────────────────
  const pun = jit.punctuality?.[punPeriod] || null;
  const punPeriodLabel = punPeriod === 'today' ? 'hoje' : 'nos últimos 7 dias';
  // Numa loja só, "por loja" é uma lista de um item — o recorte que importa
  // ali é o setor, e o seletor com uma opção viável seria ruído.
  const punCanGroupByUnit = !jit.scopeUnitId && (pun?.byUnit || []).length > 1;
  const punGroupEff = punCanGroupByUnit ? punGroup : 'setor';
  const punGroups = (punGroupEff === 'loja' ? pun?.byUnit : pun?.bySector) || [];
  // 90/70: o corte é mais duro que o da aderência (80/50) de propósito —
  // "quase sempre no horário" não é o mesmo padrão que "quase tudo feito".
  const punTone = r => (r >= 90 ? C.success : r >= 70 ? C.warning : C.critical);
  const punBar = r => (r >= 90 ? successBright : r >= 70 ? C.warning : C.critical);
  const segStyle = active => ({
    padding: '4px 10px', borderRadius: R.pill, cursor: 'pointer',
    border: `1px solid ${active ? C.ink : C.border}`,
    background: active ? C.ink : 'white',
    color: active ? 'white' : C.muted,
    fontSize: T.label, fontWeight: W.semibold, whiteSpace: 'nowrap',
  });
  const changePun = (kind, value) => {
    if (kind === 'period') setPunPeriod(value); else setPunGroup(value);
    track('jit_punctuality_filtered', {
      source: openSource,
      metadata: { period: kind === 'period' ? value : punPeriod, group_by: kind === 'group' ? value : punGroupEff },
    });
  };

  const b = jit.base;
  const BaseCell = ({ label, value, tone }) => (
    <div style={{ padding: '8px 0' }}>
      <p className="font-display" style={{ fontSize: 'calc(20px * var(--zc-t-scale))', fontWeight: W.bold, color: tone || C.ink, lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>{label}</p>
    </div>
  );

  const sidePanels = (
    <aside className="zc-jit-aside">
      {b && (
        <Card title="Base da operação · agora" sub={scopeLabel}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
            <BaseCell label={`unidades${b.unitsClosed ? ` · ${b.unitsClosed} de folga` : ''}`} value={b.units} />
            <BaseCell label="setores" value={b.sectors} />
            <BaseCell label="checklists ativos" value={b.templates} />
            <BaseCell label="pessoas executando hoje" value={b.peopleToday} />
            <BaseCell label="execuções hoje" value={b.executionsToday} />
            <BaseCell label="evidências hoje" value={b.evidencesToday} />
            <BaseCell label="críticos abertos hoje" value={b.criticalOpenToday}
              tone={b.criticalOpenToday ? C.critical : C.success} />
            <BaseCell label="atrasados agora" value={jit.today.overdue}
              tone={jit.today.overdue ? C.warning : C.success} />
          </div>
        </Card>
      )}
      {trend.length > 0 && (
        <Card title="Aderência · 7 dias" sub="% de tarefas concluídas por dia">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 96 }}>
            {trend.map(d => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span className="font-display" style={{ fontSize: T.label, fontWeight: W.semibold, color: d.isToday ? C.ink : C.mutedLight }}>
                  {d.checklists ? `${d.rate}%` : '—'}
                </span>
                <div style={{ width: '100%', height: 56, display: 'flex', alignItems: 'flex-end' }}>
                  <div title={`${d.weekday}: ${d.rate}%`} style={{
                    width: '100%',
                    height: `${Math.max(3, (d.rate / maxTrend) * 100)}%`,
                    background: d.isToday ? C.ink : (d.rate >= 80 ? successBright : d.rate >= 50 ? C.warning : C.critical),
                    borderRadius: '3px 3px 0 0',
                    opacity: d.checklists ? 1 : 0.25,
                  }} />
                </div>
                <span style={{ fontSize: T.label, color: C.mutedLight, textTransform: 'capitalize' }}>{d.weekday}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {(jit.sectors || []).length > 0 && (
        <Card title="Por setor · hoje" sub="conclusão de tarefas no setor">
          {jit.sectors.map(sc => (
            <Row key={sc.name} label={sc.name} right={`${sc.rate}%`} rate={sc.rate}
              tone={sc.rate >= 80 ? C.success : sc.rate >= 50 ? C.warning : C.critical}
              meta={`${sc.checklists} checklist${sc.checklists > 1 ? 's' : ''}${sc.criticalPending ? ` · ${sc.criticalPending} crítico${sc.criticalPending > 1 ? 's' : ''} pendente${sc.criticalPending > 1 ? 's' : ''}` : ''}`} />
          ))}
        </Card>
      )}

      {(jit.criticalTop || []).length > 0 && (
        <Card title="Críticos recorrentes" sub="pendentes 2× ou mais nos últimos 7 dias">
          {jit.criticalTop.map((c, i) => (
            <Row key={`${c.unitId}-${i}`} label={truncName(c.text, 44)} right={`${c.count}×`} tone={C.critical}
              meta={c.unitName} />
          ))}
        </Card>
      )}

      {(jit.peopleToday || []).length > 0 && (
        <Card title="Quem executou hoje">
          {jit.peopleToday.map(pp => (
            <Row key={pp.key} label={truncName(pp.name, 26)} right={`${pp.tasksDone}`}
              meta={`${pp.checklists} checklist${pp.checklists > 1 ? 's' : ''} · ${pp.tasksDone} tarefa${pp.tasksDone > 1 ? 's' : ''}`} />
          ))}
        </Card>
      )}
    </aside>
  );

  const Shell = ({ children }) => (asPage ? (
    <div className="zc-jit-page">
      <div className="zc-jit-panel">{children}</div>
      {sidePanels}
    </div>
  ) : (
    <div onClick={onClose}
      className="zc-sheet zc-sheet--drawer"
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(6,60,92,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', backdropFilter: 'blur(2px)' }}>
      <div onClick={e => e.stopPropagation()}
        className="zc-sheet-panel"
        style={{ width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', background: C.bg, borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.3)', paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}>
        {children}
      </div>
    </div>
  ));

  return (
    <Shell>
      <>
        {/* Cabeçalho — sticky: o J.I.T. é longo e o X ficava rolando para fora
            da tela junto com ele. */}
        <div style={{ background: accent, color: 'white', padding: '20px 20px 18px', borderRadius: '20px 20px 0 0', position: 'sticky', top: 0, zIndex: 2 }}>
          {/* Alvo de toque de 40px (era 30, abaixo do mínimo de acessibilidade) e
              flex de verdade, para o × ficar no centro do alvo e não só perto dele.
              O padding-box inteiro clica: o raio arredondado antes recortava os
              cantos do alvo. */}
          {/* Numa PÁGINA não existe "fechar": o destino é o próprio menu. O × só
              faz sentido no pop-up de abertura. */}
          {!asPage && <button type="button" onClick={onClose} aria-label="Fechar J.I.T."
            style={{ position: 'absolute', top: 12, right: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white', borderRadius: 999,
              width: 40, height: 40, fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0, zIndex: 3 }}>×</button>}
          <p style={{ fontSize: 11, fontWeight: W.semibold, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>J.I.T. · Just In Time</p>
          <p className="font-display" style={{ fontSize: 'calc(22px * var(--zc-t-scale))', fontWeight: W.bold, marginTop: 6 }}>Sua operação agora</p>
          <p style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
            <span style={{ textTransform: 'capitalize' }}>{dateLabel}</span>
            {' · '}
            <span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: R.pill, background: greenOnDark, marginRight: 5, verticalAlign: 'middle' }} />
            atualizado às {updatedAt}
            {scopeLabel ? ` · ${scopeLabel}` : ''}
          </p>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Follow-up (H1) — o que foi marcado "Tratar" volta até ser resolvido */}
          {pendingPlans.length > 0 && (
            <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.warning}40`, borderLeft: `4px solid ${C.warning}`, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <SectionMark color={C.warning} />
                <p style={{ fontSize: T.label, fontWeight: W.semibold, color: C.warning, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Você marcou para tratar
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingPlans.map(plan => (
                  <div key={plan.id}>
                    <p style={{ fontSize: T.bodySm, color: C.ink, lineHeight: 1.45 }}>{plan.recText}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: T.label, color: C.muted }}>
                        {planAgeDays(plan) === 1 ? 'ontem' : `há ${planAgeDays(plan)} dias`}
                      </span>
                      {planAnswers[plan.id] === 'done' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: T.caption, fontWeight: W.semibold, color: C.success, marginLeft: 'auto' }}>
                          <Check size={13} aria-hidden /> Resolvido
                        </span>
                      ) : planAnswers[plan.id] === 'kept' ? (
                        <span style={{ fontSize: T.caption, fontWeight: W.semibold, color: C.warning, marginLeft: 'auto' }}>Fica para hoje</span>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                          <button onClick={() => resolvePlan(plan)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: R.sm, border: 'none', background: C.success, color: 'white', fontSize: T.label, fontWeight: W.semibold, cursor: 'pointer' }}>
                            <Check size={12} aria-hidden /> Resolvido
                          </button>
                          <button onClick={() => keepPlan(plan)}
                            style={{ padding: '6px 12px', borderRadius: R.sm, border: `1px solid ${C.border}`, background: 'white', color: C.muted, fontSize: T.label, fontWeight: W.semibold, cursor: 'pointer' }}>
                            Ainda não
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Insight do dia (H4) — análise automática no topo do J.I.T. */}
          {insight && (
            <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${accent}40`, borderLeft: `4px solid ${accent}`, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <SectionMark color={accent} />
                <p style={{ fontSize: 10.5, fontWeight: W.semibold, color: accent, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Leitura da operação</p>
              </div>
              <p className="font-display" style={{ fontSize: 15, fontWeight: W.semibold, color: C.ink, marginBottom: 5 }}>{insight.headline}</p>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>{insight.evidence}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {insight.unitId && (
                  <button onClick={actOnInsight}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 9, background: insightActioned ? `${C.success}18` : accent, color: insightActioned ? C.success : 'white', border: 'none', fontSize: 12.5, fontWeight: W.semibold, cursor: 'pointer' }}>
                    {insightActioned ? <><Check size={14} aria-hidden /> Vou agir nisso</> : 'Agir sobre isso →'}
                  </button>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                  {insightFeedback ? (
                    <span style={{ fontSize: 11.5, color: C.success, fontWeight: W.semibold }}>Valeu pelo retorno!</span>
                  ) : (
                    <>
                      <span style={{ fontSize: 11.5, color: C.mutedLight, fontWeight: W.semibold }}>Foi útil?</span>
                      <FeedbackThumbs onRate={rateInsight} size={14} />
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Ontem */}
          <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: '6px 8px' }}>
            <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 8px 2px' }}>Ontem</p>
            <div style={{ display: 'flex' }}>
              <Stat label="Aderência" value={y.adherence != null ? `${y.adherence}%` : '—'} color={y.adherence == null ? C.mutedLight : y.adherence >= 80 ? C.success : C.critical} />
              {/* "Completos", não "Checklists": desde 30/07 a aderência conta só
                  entrega completa, e o parcial ganhou número próprio ao lado —
                  sem ele, o índice cai e a tela não explica o motivo. */}
              <Stat label="Completos" value={`${y.checklists}${y.expected ? `/${y.expected}` : ''}`} />
              {y.partial > 0 && <Stat label="Parciais" value={y.partial} color={C.warning} />}
              <Stat label="Críticos pend." value={y.criticalPending} color={y.criticalPending > 0 ? C.critical : C.ink} />
            </div>
          </div>

          {/* Hoje */}
          <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: '6px 8px' }}>
            <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 8px 2px' }}>Hoje</p>
            <div style={{ display: 'flex' }}>
              <Stat label="Previstos" value={t.expected} />
              <Stat label="Completos" value={t.done} color={C.success} />
              {t.partial > 0 && <Stat label="Parciais" value={t.partial} color={C.warning} />}
              <Stat label="Pendentes" value={t.pending} />
              <Stat label="Atrasados" value={t.overdue} color={t.overdue > 0 ? C.critical : C.ink} />
            </div>
          </div>

          {/* Entrega no prazo — quantos checklists fecharam dentro do horário e
              quantos passaram dele, com recorte por loja e por setor.
              "Atrasados" acima conta o que AINDA não foi feito e já venceu;
              aqui conta o que FOI feito e a que horas. São perguntas
              diferentes e por isso não podem morar no mesmo bloco. */}
          {pun && (
            <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Entrega no prazo
                </p>
                <div role="group" aria-label="Período" style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                  {PUNCTUALITY_PERIODS.map(p => (
                    <button key={p.id} type="button" aria-pressed={punPeriod === p.id}
                      onClick={() => changePun('period', p.id)} style={segStyle(punPeriod === p.id)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {pun.total === 0 ? (
                <p style={{ fontSize: T.bodySm, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
                  {pun.noDeadline > 0
                    ? `Nenhum checklist COM prazo foi concluído ${punPeriodLabel}. Os ${pun.noDeadline} concluídos não têm horário definido — dê um prazo ao checklist em Gerenciar para acompanhar pontualidade.`
                    : `Nenhum checklist concluído ${punPeriodLabel}.`}
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, marginTop: 12 }}>
                    <div>
                      <p className="font-display" style={{ fontSize: 26, fontWeight: W.bold, color: C.success, lineHeight: 1 }}>{pun.onTime}</p>
                      <p style={{ fontSize: 11, color: C.muted, fontWeight: W.semibold, marginTop: 4 }}>no prazo</p>
                    </div>
                    <div>
                      <p className="font-display" style={{ fontSize: 26, fontWeight: W.bold, color: pun.late > 0 ? C.critical : C.mutedLight, lineHeight: 1 }}>{pun.late}</p>
                      <p style={{ fontSize: 11, color: C.muted, fontWeight: W.semibold, marginTop: 4 }}>fora do prazo</p>
                    </div>
                    <p className="font-display" style={{ marginLeft: 'auto', fontSize: 20, fontWeight: W.bold, color: punTone(pun.rate) }}>
                      {pun.rate}%
                    </p>
                  </div>
                  <div role="img" aria-label={`${pun.onTime} de ${pun.total} checklists concluídos no prazo (${pun.rate}%)`}
                    style={{ display: 'flex', height: 8, borderRadius: R.pill, overflow: 'hidden', background: C.bg, marginTop: 10 }}>
                    <div style={{ width: `${pun.rate}%`, background: successBright }} />
                    <div style={{ flex: 1, background: C.critical }} />
                  </div>

                  {punGroups.length > 0 && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                        <p style={{ fontSize: T.label, color: C.mutedLight, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Por {punGroupEff}
                        </p>
                        {punCanGroupByUnit && (
                          <div role="group" aria-label="Agrupar por" style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                            {PUNCTUALITY_GROUPS.map(g => (
                              <button key={g.id} type="button" aria-pressed={punGroupEff === g.id}
                                onClick={() => changePun('group', g.id)} style={segStyle(punGroupEff === g.id)}>
                                {g.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        {punGroups.slice(0, 6).map(g => (
                          <div key={g.key} style={{ padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                              <span style={{ flex: 1, minWidth: 0, fontSize: T.bodySm, fontWeight: W.medium, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {g.name}
                              </span>
                              <span className="font-display" style={{ flexShrink: 0, fontSize: T.bodySm, fontWeight: W.semibold, color: punTone(g.rate) }}>
                                {g.rate}%
                              </span>
                            </div>
                            <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>
                              {g.onTime} no prazo · {g.late} fora do prazo
                            </p>
                            <div style={{ height: 5, borderRadius: R.pill, background: C.bg, marginTop: 5, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${Math.max(2, g.rate)}%`, background: punBar(g.rate), borderRadius: R.pill }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {pun.noDeadline > 0 && (
                    <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 10, lineHeight: 1.45 }}>
                      + {pun.noDeadline} checklist{pun.noDeadline > 1 ? 's' : ''} sem horário definido — fora desta conta, porque não há prazo a cumprir.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Recomendações */}
          <div>
            <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingLeft: 2 }}>Prioridades agora</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {jit.recommendations.map(rec => {
                const RecIcon = RECOMMENDATION_ICON[rec.type] || Circle;
                // A cor carrega a urgência; o desenho, a natureza do alerta.
                const recColor = rec.type === 'all_good' ? C.success
                  : rec.type === 'critical_hotspot' ? C.critical : C.warning;
                return (
                <div key={rec.id} onClick={() => clickRec(rec)}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 12px', cursor: rec.tab || rec.unitId ? 'pointer' : 'default' }}>
                  <RecIcon size={17} color={recColor} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ flex: 1, fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>{rec.text}</p>
                  {rec.type !== 'all_good' && (
                    <button onClick={e => actionRec(rec, e)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, alignSelf: 'center', padding: '5px 10px', borderRadius: 8, border: `1px solid ${actioned[rec.id] ? C.success : C.border}`, background: actioned[rec.id] ? `${C.success}15` : 'white', color: actioned[rec.id] ? C.success : C.muted, fontSize: 11, fontWeight: W.semibold, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {actioned[rec.id] ? <><Check size={11} aria-hidden /> No plano</> : 'Tratar'}
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          </div>

          {/* Situação por loja — só na visão multi-loja. Onde olhar primeiro. */}
          {jit.stores && jit.stores.length > 0 && (
            <div>
              <p style={{ fontSize: T.label, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingLeft: 2 }}>Situação por loja</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {jit.stores.map(s => {
                  const critico = s.overdue > 0 || s.criticalHotspots > 0;
                  const barra = critico ? C.critical : s.pendingToday > 0 ? C.warning : C.success;
                  const sinais = [];
                  if (s.closedToday) sinais.push('fechada hoje');
                  else {
                    if (s.overdue > 0) sinais.push(`${s.overdue} atrasado${s.overdue > 1 ? 's' : ''}`);
                    if (s.criticalHotspots > 0) sinais.push(`${s.criticalHotspots} crítico${s.criticalHotspots > 1 ? 's' : ''} recorrente${s.criticalHotspots > 1 ? 's' : ''}`);
                    if (s.pendingToday > 0) sinais.push(`${s.pendingToday} pendente${s.pendingToday > 1 ? 's' : ''} hoje`);
                    if (sinais.length === 0) sinais.push('em dia');
                  }
                  return (
                    <button key={s.unitId} onClick={() => onNavigate(s.unitId, 'painel')}
                      className="flex items-stretch gap-2"
                      style={{ background: 'white', borderRadius: R.md, border: `1px solid ${C.border}`, padding: 0, cursor: 'pointer', textAlign: 'left', overflow: 'hidden' }}>
                      <span style={{ width: 4, flexShrink: 0, background: barra }} />
                      <span style={{ flex: 1, padding: '10px 12px', minWidth: 0 }}>
                        <span className="flex items-center justify-between gap-2">
                          <span style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink }}>{s.name}</span>
                          {s.yAdherence != null && (
                            <span style={{ fontSize: T.label, color: C.muted, flexShrink: 0 }}>ontem {s.yAdherence}%</span>
                          )}
                        </span>
                        <span style={{ display: 'block', fontSize: T.label, color: critico ? C.critical : C.muted, marginTop: 2, lineHeight: 1.4 }}>
                          {sinais.join(' · ')}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Micro-pergunta qualitativa (§10) */}
          <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 14px', textAlign: 'center' }}>
            {survey ? (
              <p style={{ fontSize: 13, color: C.success, fontWeight: W.semibold }}>Obrigado pelo retorno!</p>
            ) : (
              <>
                <p style={{ fontSize: 13, color: C.ink, marginBottom: 10, fontWeight: W.semibold }}>O J.I.T. te ajudou a priorizar?</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <FeedbackThumbs onRate={answerSurvey} size={17} />
                </div>
              </>
            )}
          </div>

          <button onClick={onClose} style={{ padding: '14px 0', borderRadius: 12, background: accent, color: 'white', border: 'none', fontWeight: W.semibold, fontSize: 15, cursor: 'pointer', marginTop: 2 }}>
            Ir para a operação →
          </button>
        </div>
      </>
    </Shell>
  );
}
