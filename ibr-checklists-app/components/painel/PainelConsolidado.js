'use client';

/**
 * Aba PAINEL consolidada — Fase 3 da consolidação de abas.
 *
 * Junta num só lugar o que hoje mora em três abas (Painel, J.I.T. e Dados).
 * Esta fase entrega os registros AGORA (seção 1), DIA (seção 2) e a FAIXA FIXA
 * de 7 dias (seção 4) do §C.3 de `docs/PLANO_CONSOLIDACAO_ABAS.md`. REDE
 * (seção 3) e o segmento analítico (seção 5) entram na Fase 4.
 *
 * ATRÁS DE UM INTERRUPTOR. Nada aqui alcança produção enquanto `PAINEL_V2` for
 * `false` e a URL não tiver `?v=2`. As três abas vivas continuam intactas —
 * reverter esta fase é apagar este arquivo e as linhas de roteamento em
 * `app/app/page.js`.
 *
 * A faixa fixa de 7 dias entra JÁ nesta fase, e não na 4, porque sem ela o
 * colaborador em `?v=2` fica incompleto — e é o colaborador que esta fase
 * existe para validar (§D.1).
 *
 * ── Duplicação declarada e com prazo ──────────────────────────────────────
 * Os quatro blocos do registro AGORA (`AgoraFollowUp`, `AgoraLeitura`,
 * `AgoraPrioridades`, `AgoraBase`) reimplementam JSX que hoje também vive
 * dentro de `JitPanel`. É deliberado e temporário: a Fase 3 tem contrato de
 * reversão "apagar um arquivo", e extrair de `JitPanel` agora significaria
 * mexer numa aba viva. A Fase 5 (§F.1) dissolve o `JitPanel` em dois
 * consumidores do mesmo `buildJit` — `BriefingSheet` (pop-up) e a seção AGORA
 * daqui — e é lá que a segunda cópia morre. Eles já saem exportados para que
 * essa fase seja uma troca de import, não uma reescrita.
 *
 * REGRA: não pode importar de `app/`.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle, ArrowLeft, Calendar, Camera, Check, CheckCircle2, ChevronRight,
  Circle, Clock, ThumbsUp, TrendingDown, TrendingUp, Trophy,
} from 'lucide-react';
import { C, R, T, W, successBright } from '../../lib/tokens';
// O dia é sempre o do relógio da LOJA — ver lib/dates.js.
import { todayStr, addDays, lastDays, weekdayOf, tzOf } from '../../lib/dates';
import { latestPerRound, roundProgress } from '../../lib/rounds';
import {
  CHECKLIST_TYPE_ORDER, applicableItems, templateAtiva, templateStatus,
  templateProgress, isUnitClosed,
} from '../../lib/checklists';
import { sectorLabelFor, visibleSectors } from '../../lib/sectors';
import {
  RANKED_ROLES, RANKING_PERIOD_DEFAULT, rankingPeriod, collabIndexSentence,
  computeOperationalProfile,
} from '../../lib/ranking';
import { track } from '../../lib/track';
import {
  MANAGER_ROLES, ROLE_LABELS, Eyebrow, Ticket, StarRating, Avatar, RatingLabel,
  StatusBadge, RankBadge, PhotoModal, SectionMark, FeedbackThumbs,
} from './shared';
import { useUnits, useSectors } from './context';

/* ─────────────────────────── O interruptor ─────────────────────────────── */

/**
 * Trava global da aba consolidada. Fica `false` até a Fase 5 ("virar a chave").
 * Enquanto isso, `?v=2` na URL liga a versão nova só para quem escrever o
 * parâmetro — que é como esta fase é testada com um PIN real sem expor nada.
 */
export const PAINEL_V2 = false;

/**
 * Lê o interruptor. O parâmetro só é lido DEPOIS da montagem: `/app` é estática
 * e o servidor não conhece a query, então decidir no primeiro render trocaria a
 * árvore entre servidor e cliente.
 *
 * `?v=2` sobrevive à troca de aba porque `writeUrlState` (lib/appUrlState.js)
 * reescreve a query preservando os parâmetros que não são `aba`/`loja`.
 */
export function usePainelV2() {
  const [on, setOn] = useState(PAINEL_V2);
  useEffect(() => {
    if (PAINEL_V2) return;
    try { setOn(new URLSearchParams(window.location.search).get('v') === '2'); } catch (_) {}
  }, []);
  return on;
}

/* ───────────────────── Registro AGORA — blocos (§C.3 §1) ────────────────── */

const RECOMMENDATION_ICON = {
  critical_hotspot: AlertTriangle,
  overdue_today: Clock,
  low_adherence: TrendingDown,
  all_good: CheckCircle2,
};

/** 1.1 — "Você marcou para tratar": planos abertos de dias ANTERIORES. */
export function AgoraFollowUp({ plans, answers, onResolve, onKeep, ageOf }) {
  if (!plans.length) return null;
  return (
    <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.warning}40`, borderLeft: `4px solid ${C.warning}`, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <SectionMark color={C.warning} />
        <p style={{ fontSize: T.label, fontWeight: W.semibold, color: C.warning, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Você marcou para tratar
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {plans.map(plan => (
          <div key={plan.id}>
            <p style={{ fontSize: T.bodySm, color: C.ink, lineHeight: 1.45 }}>{plan.recText}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: T.label, color: C.muted }}>
                {ageOf(plan) === 1 ? 'ontem' : `há ${ageOf(plan)} dias`}
              </span>
              {answers[plan.id] === 'done' ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: T.caption, fontWeight: W.semibold, color: C.success, marginLeft: 'auto' }}>
                  <Check size={13} aria-hidden /> Resolvido
                </span>
              ) : answers[plan.id] === 'kept' ? (
                <span style={{ fontSize: T.caption, fontWeight: W.semibold, color: C.warning, marginLeft: 'auto' }}>Fica para hoje</span>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                  <button onClick={() => onResolve(plan)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: R.sm, border: 'none', background: C.success, color: 'white', fontSize: T.label, fontWeight: W.semibold, cursor: 'pointer' }}>
                    <Check size={12} aria-hidden /> Resolvido
                  </button>
                  <button onClick={() => onKeep(plan)}
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
  );
}

/** 1.2 — "Leitura da operação": o insight rule-based do `buildInsight`. */
export function AgoraLeitura({ insight, accent, feedback, actioned, onRate, onAct }) {
  if (!insight) return null;
  return (
    <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${accent}40`, borderLeft: `4px solid ${accent}`, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <SectionMark color={accent} />
        <p style={{ fontSize: 10.5, fontWeight: W.semibold, color: accent, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Leitura da operação</p>
      </div>
      <p className="font-display" style={{ fontSize: 15, fontWeight: W.semibold, color: C.ink, marginBottom: 5 }}>{insight.headline}</p>
      <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 12 }}>{insight.evidence}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {insight.unitId && (
          <button onClick={onAct}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 9, background: actioned ? `${C.success}18` : accent, color: actioned ? C.success : 'white', border: 'none', fontSize: 12.5, fontWeight: W.semibold, cursor: 'pointer' }}>
            {actioned ? <><Check size={14} aria-hidden /> Vou agir nisso</> : 'Agir sobre isso →'}
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          {feedback ? (
            <span style={{ fontSize: 11.5, color: C.success, fontWeight: W.semibold }}>Valeu pelo retorno!</span>
          ) : (
            <>
              <span style={{ fontSize: 11.5, color: C.mutedLight, fontWeight: W.semibold }}>Foi útil?</span>
              <FeedbackThumbs onRate={onRate} size={14} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 1.3 — "Prioridades agora": até 3 recomendações, cada uma com [ Tratar ]. */
export function AgoraPrioridades({ recs, actioned, onClickRec, onActionRec }) {
  if (!recs.length) return null;
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, paddingLeft: 2 }}>Prioridades agora</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {recs.map(rec => {
          const RecIcon = RECOMMENDATION_ICON[rec.type] || Circle;
          // A cor carrega a urgência; o desenho, a natureza do alerta.
          const recColor = rec.type === 'all_good' ? C.success
            : rec.type === 'critical_hotspot' ? C.critical : C.warning;
          return (
            <div key={rec.id} onClick={() => onClickRec(rec)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '12px 12px', cursor: rec.tab || rec.unitId ? 'pointer' : 'default' }}>
              <RecIcon size={17} color={recColor} aria-hidden style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ flex: 1, fontSize: 13.5, color: C.ink, lineHeight: 1.45 }}>{rec.text}</p>
              {rec.type !== 'all_good' && (
                <button onClick={e => onActionRec(rec, e)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, alignSelf: 'center', padding: '5px 10px', borderRadius: 8, border: `1px solid ${actioned[rec.id] ? C.success : C.border}`, background: actioned[rec.id] ? `${C.success}15` : 'white', color: actioned[rec.id] ? C.success : C.muted, fontSize: 11, fontWeight: W.semibold, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {actioned[rec.id] ? <><Check size={11} aria-hidden /> No plano</> : 'Tratar'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 1.4 — "Base da operação · agora": as CINCO células de estrutura de cadastro.
 *
 * Das oito de hoje (`JitPanel`, painel lateral), três saem: execuções hoje,
 * evidências hoje e críticos abertos hoje duplicam os StatCards de Dados, que
 * têm período e filtros (§B.4). A nona célula do código atual — "atrasados
 * agora" — é absorvida pela linha `n/N · atrasados` do score do dia (§C.3 2.1).
 */
export function AgoraBase({ base, scopeLabel }) {
  if (!base) return null;
  const Cell = ({ label, value }) => (
    <div style={{ padding: '8px 0' }}>
      <p className="font-display" style={{ fontSize: 'calc(20px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink, lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>{label}</p>
    </div>
  );
  return (
    <section style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: R.md, padding: 16 }}>
      <h3 style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>
        Base da operação · agora
      </h3>
      {scopeLabel && <p style={{ fontSize: T.caption, color: C.mutedLight, marginTop: 2 }}>{scopeLabel}</p>}
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
        <Cell label={`unidades${base.unitsClosed ? ` · ${base.unitsClosed} de folga` : ''}`} value={base.units} />
        <Cell label="setores" value={base.sectors} />
        <Cell label="checklists ativos" value={base.templates} />
        <Cell label="pessoas executando hoje" value={base.peopleToday} />
      </div>
    </section>
  );
}

/* ───────────────────── Seção REDE — comparativo entre lojas ─────────────── */

/**
 * 3.1 — a fusão de P4 (comparativo entre lojas) com J8 (situação por loja), com
 * P5 (ranking do dia) absorvido (§C.3).
 *
 * As duas perguntas sobreviveram porque são diferentes (§B.3): P4 pergunta "quem
 * está melhor no dia X?", J8 pergunta "onde eu olho primeiro AGORA?". Uma loja
 * com 95% e um checklist atrasado sobe ao topo das duas, em direções opostas.
 *
 * **A ordenação é a de P4 — desempenho.** J8 vira um par de sinais na linha de
 * baixo do cartão, não uma segunda lista. Motivo: esta seção mora no registro
 * DIA, que é navegável por data, e "urgência" não tem leitura em 12/07 — os
 * atrasados de hoje não são os daquele dia. Por isso os sinais só aparecem com
 * `viewDate === today`, a mesma regra de "Por setor · hoje".
 *
 * P5 morre porque era duplicata INTERNA: mesmos dados, mesma ordenação e o mesmo
 * `RankBadge` que os cartões acima dele já mostravam.
 */
function SecaoRede({ units, calcRate, closures, viewDate, today, yesterday, last7, dateLabel, sinaisPorLoja, onNavigate, turnoRate }) {
  // Menos de duas lojas: a seção inteira some, título incluso (§C.6). Comparar
  // uma loja com ela mesma é um cabeçalho sem conteúdo.
  if ((units || []).length < 2) return null;

  const comEscopo = units.map(u => {
    const fechada = isUnitClosed(closures, u.id, viewDate);
    const rate = fechada ? null : calcRate(viewDate, u.id, u.sectors);
    const last7u = last7.map(d => calcRate(d, u.id, u.sectors));
    const validos = last7u.filter(v => v !== null);
    const avg = validos.length ? Math.round(validos.reduce((a, b) => a + b, 0) / validos.length) : null;
    return { u, fechada, rate, last7u, avg, trend: rate !== null && avg !== null ? rate - avg : null };
  });
  // Uma ordenação só, calculada uma vez. A versão do Painel de hoje reordenava
  // a lista inteira DENTRO do map — uma vez por loja, com `calcRate` rodando de
  // novo em cada comparação.
  const ranked = [...comEscopo].filter(x => !x.fechada && x.rate !== null).sort((a, b) => b.rate - a.rate);
  const posDe = id => ranked.findIndex(x => x.u.id === id);

  return (
    <>
      <Eyebrow>Comparativo entre lojas — {dateLabel}</Eyebrow>
      <div className="flex flex-col gap-3">
        {comEscopo.map(({ u, fechada, rate, last7u, avg, trend }) => {
          const pos = posDe(u.id);
          const sinais = viewDate === today ? sinaisPorLoja[u.id] : null;
          const rateYest = calcRate(yesterday, u.id, u.sectors);
          return (
            <Ticket key={u.id} accent={u.color}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p style={{ fontSize: 13, fontWeight: W.semibold, color: u.color }}>{u.name}</p>
                    {pos >= 0 && <RankBadge pos={pos + 1} size={20} />}
                  </div>
                  {fechada
                    ? <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Fechada</p>
                    : <p className="font-display" style={{ fontSize: 'calc(36px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink, lineHeight: 1, marginTop: 4 }}>{rate ?? '—'}%</p>
                  }
                  {rateYest !== null && !fechada && (
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>ontem {rateYest}%</p>
                  )}
                </div>
                {!fechada && trend !== null && (
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 11, color: C.muted, fontWeight: W.semibold }}>vs média 7d</p>
                    <p style={{ fontSize: 18, fontWeight: W.semibold, color: trend >= 0 ? C.success : C.critical }}>
                      {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
                    </p>
                    <p style={{ fontSize: 11, color: C.muted }}>média {avg}%</p>
                  </div>
                )}
              </div>

              {/* Os sinais de urgência do J.I.T., na linha de baixo. É o que J8
                  respondia; aqui ele deixa de ser lista separada e vira atributo
                  da loja — mas só quando a data em foco é hoje. */}
              {sinais && sinais.texto && (
                <p style={{ fontSize: T.label, color: sinais.critico ? C.critical : C.muted, marginTop: 8, lineHeight: 1.4 }}>
                  {sinais.texto}
                </p>
              )}

              {!fechada && rate !== null && (
                <>
                  <div style={{ width: '100%', height: 5, background: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
                    <div style={{ height: '100%', width: `${rate}%`, background: rate >= 80 ? C.success : rate >= 50 ? u.color : C.critical, borderRadius: 999, transition: 'width 0.5s ease' }} />
                  </div>

                  <div className="flex gap-2 mt-3">
                    {[{ label: 'Abertura', shift: 'Manhã' }, { label: 'Fechamento', shift: 'Tarde' }].map(({ label, shift }) => {
                      const r = turnoRate(u, shift);
                      return r !== null ? (
                        <div key={label} style={{ flex: 1, background: C.bg, borderRadius: 6, padding: '4px 6px', textAlign: 'center' }}>
                          <p style={{ fontSize: 9, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase' }}>{label.slice(0, 4)}</p>
                          <p style={{ fontSize: 13, fontWeight: W.semibold, color: r >= 80 ? C.success : r >= 50 ? u.color : C.critical }}>{r}%</p>
                        </div>
                      ) : null;
                    })}
                    <div style={{ flex: 2, background: C.bg, borderRadius: 6, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 2 }}>
                      {last7u.map((v, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 20 }}>
                          <div style={{ width: '100%', background: v === null ? C.border : v >= 80 ? C.success : v >= 50 ? u.color : C.critical, borderRadius: 2, height: v === null ? 2 : `${Math.max(2, (v / 100) * 20)}px`, opacity: i === 6 ? 1 : 0.6 + i * 0.06 }} />
                        </div>
                      ))}
                      <p style={{ fontSize: 9, color: C.muted, fontWeight: W.semibold, marginLeft: 2 }}>7d</p>
                    </div>
                  </div>
                </>
              )}

              {/* A afordância de J8: o cartão leva para a loja. */}
              <button onClick={() => onNavigate?.(u.id, 'painel')}
                style={{ marginTop: 10, width: '100%', padding: '7px 0', borderRadius: R.sm, border: `1px solid ${C.border}`, background: 'white', color: u.color, fontSize: T.label, fontWeight: W.semibold, cursor: 'pointer' }}>
                Ver {u.name} →
              </button>
            </Ticket>
          );
        })}
      </div>

      {/* Entrada contextual para Unidades, que ficou fora da barra inferior de
          propósito (§D.2) — consulta periódica, não uso diário. */}
      <button onClick={() => onNavigate?.(null, 'unidades')}
        style={{ width: '100%', padding: '10px 0', borderRadius: R.sm, border: `1px solid ${C.border}`, background: 'white', color: C.ink, fontSize: T.bodySm, fontWeight: W.semibold, cursor: 'pointer' }}>
        Ver todas as lojas →
      </button>
    </>
  );
}

/* ──────────────────────────── A aba consolidada ─────────────────────────── */

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function PainelConsolidado({
  unit, templates, completions, closures, canSeeAllUnits, currentUser, users,
  activeTypes = CHECKLIST_TYPE_ORDER,
  // Registro AGORA — tudo vem do mesmo `buildJit` que alimenta a aba J.I.T.
  jit, actionPlans, plansLoaded, onCreatePlan, onCompletePlan, onNavigate,
}) {
  const units = useUnits();
  const sectorRows = useSectors();
  const tz = tzOf(unit);
  const today = todayStr(tz);
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const viewDate = selectedDate;

  /**
   * A fronteira de acesso, avaliada UMA vez (§D). Todo bloco que o colaborador
   * não pode ver fica dentro de `{isManager && ...}` — não basta depender de um
   * dado que ele não tem hoje, porque um dia esse dado passa a existir.
   */
  const isManager = MANAGER_ROLES.includes(currentUser?.role);

  const sectors = currentUser?.sectorId
    ? visibleSectors(unit, currentUser.sectorId, sectorRows)
    : unit.sectors;

  const shiftDate = (delta) => {
    const next = addDays(viewDate, delta);
    if (next <= today) setSelectedDate(next);
  };

  const dateLabel = viewDate === today
    ? 'Hoje'
    : new Date(`${viewDate}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();

  /**
   * Cobertura do previsto no dia: tarefas feitas ÷ tarefas previstas.
   *
   * Cópia literal de `PainelView.calcRate`, já com a correção da Fase 2 (usa
   * `roundProgress` em vez de varrer `completions` com `.find()`, que lia a
   * PRIMEIRA submissão da rodada e deixava reexecução fora da conta). Fica
   * duplicada aqui pelo mesmo motivo dos blocos do AGORA: a Fase 3 não toca em
   * `PainelView`, que continua servindo a aba viva. A Fase 5 apaga o original.
   */
  const calcRate = (date, unitId, filterSectors) => {
    if (isUnitClosed(closures, unitId, date)) return null;
    const dayTemplates = templates.filter(t =>
      templateAtiva(t) &&
      t.unitId === unitId &&
      filterSectors.includes(t.sector) &&
      applicableItems(t, date).length > 0
    );
    if (dayTemplates.length === 0) return null;
    let done = 0, total = 0;
    for (const t of dayTemplates) {
      const p = roundProgress(
        completions,
        { templateId: t.id, unitId, date },
        applicableItems(t, date).map(i => i.id),
      );
      total += p.total;
      done += p.done;
    }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };

  const yesterday = addDays(today, -1);
  const last7 = lastDays(7, today);

  const rateToday = calcRate(viewDate, unit.id, sectors);
  const rateYesterday = viewDate === today ? calcRate(yesterday, unit.id, sectors) : null;
  // A média dos 7 dias continua ignorando os dias sem previsto — mesma conta de
  // hoje, para o número do bloco "Média 7 dias" não mudar de significado.
  const rates7 = last7.map(d => calcRate(d, unit.id, sectors)).filter(r => r !== null);
  const avg7 = rates7.length ? Math.round(rates7.reduce((a, b) => a + b, 0) / rates7.length) : null;

  /**
   * `n/N · atrasados` do dia — a linha que o J.I.T. tem e o Painel não (§B.2).
   *
   * NÃO vem de `jit.today`: aquele objeto é de HOJE e da loja inteira, e este
   * bloco é navegável por data e escopado ao setor de quem olha. Um colaborador
   * do Salão veria "87%" (só Salão) sobre "9 de 13" (loja toda) — dois números
   * que não conversam. Aqui a contagem sai dos MESMOS `templateStatus` que o
   * bloco "Por tipo de checklist" logo abaixo já renderiza um a um, então o
   * agregado e o detalhe nunca podem divergir. É reagrupamento do que ele já
   * vê, não dado novo (§D.1 bloco 3).
   */
  const dayCount = useMemo(() => {
    const prev = templates.filter(t =>
      templateAtiva(t) &&
      t.unitId === unit.id &&
      sectors.includes(t.sector) &&
      applicableItems(t, viewDate).length > 0
    );
    const status = prev.map(t => templateStatus(t, completions, viewDate, tz));
    return {
      expected: prev.length,
      done: status.filter(s => s === 'done').length,
      overdue: status.filter(s => s === 'overdue').length,
    };
  }, [templates, completions, unit.id, sectors, viewDate, tz]);

  /**
   * Aderência por dia · 7 dias — o cálculo de hoje (`calcRate`) com a
   * apresentação do J.I.T. (§D.1 bloco 6): rótulo de dia da semana e dia sem
   * previsto desenhado como lacuna, em vez de sumir da série.
   *
   * A ordem passa a ser cronológica (mais antigo à esquerda). A versão atual
   * inverte a série (`[...rates7].reverse()`), o que só não confunde porque não
   * há rótulo nenhum embaixo das barras — assim que o dia da semana aparece, a
   * direção vira algo que se lê, e ela precisa ser a natural.
   */
  const serie7 = useMemo(() => last7.map(d => ({
    date: d,
    rate: calcRate(d, unit.id, sectors),
    weekday: WEEKDAY_SHORT[weekdayOf(d)],
    isToday: d === today,
  })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [templates, completions, closures, unit.id, sectors, today]);

  // O Painel é MENSAL e ponto — mesma régua da aba Equipe. Cópia literal de
  // `PainelView.ranking7`: §B.7 registra que a `main` já resolveu esta
  // sobreposição escolhendo o índice operacional, e a linha de base de §D.1 é o
  // Painel ATUAL. Trocar o motor aqui mudaria o que o colaborador lê hoje.
  const periodoPainel = useMemo(
    () => rankingPeriod(RANKING_PERIOD_DEFAULT, tz, completions),
    [tz, completions],
  );
  const ranking7 = useMemo(() => {
    const ofUnit = (completions || []).filter(c => c.unitId === unit.id);
    return (users || [])
      .filter(u => RANKED_ROLES.includes(u.role) && !u.suspended && (!u.unitId || u.unitId === unit.id))
      .map(u => ({ user: u, profile: computeOperationalProfile(ofUnit, u.id, u.name, tz, templates, units, periodoPainel) }))
      .filter(x => x.profile.checklists > 0 || x.profile.tasksDone > 0)
      .sort((a, b) => (b.profile.index ?? -1) - (a.profile.index ?? -1)
        || b.profile.tasksDone - a.profile.tasksDone
        || b.profile.checklists - a.profile.checklists);
  }, [completions, users, unit.id, templates, units, periodoPainel, tz]);

  /**
   * Aderência de um turno, para os cartões de REDE.
   *
   * Reescrito sobre `roundProgress`. A versão do Painel de hoje ainda usa o
   * padrão que a Fase 2 aposentou do `calcRate`:
   *
   *     const comp = completions.find(c => c.templateId === t.id && c.date === viewDate);
   *     done += comp ? comp.items.filter(i => i.done).length : 0;
   *
   * — primeira submissão da rodada (reexecução não conta), item feito fora da
   * recorrência do dia entrando no numerador (taxa podendo estourar 100%) e
   * casamento sem `unitId`. Levar isso para a tela nova seria promover o bloco
   * defeituoso e apagar o corrigido, que é exatamente o erro que §B.6 descreve.
   *
   * O recorte de setor deixa de ser omissão: aqui o cartão É a loja inteira,
   * então varrer todos os setores dela é o escopo certo, e não um esquecimento
   * (a ressalva de §A.1 P4b some por construção).
   */
  const turnoRate = (u, shift) => {
    if (isUnitClosed(closures, u.id, viewDate)) return null;
    const doTurno = templates.filter(t =>
      templateAtiva(t) &&
      t.unitId === u.id &&
      (u.sectors || []).includes(t.sector) &&
      (Array.isArray(t.shift) ? t.shift.includes(shift) : t.shift === shift) &&
      applicableItems(t, viewDate).length > 0
    );
    if (doTurno.length === 0) return null;
    let done = 0, total = 0;
    for (const t of doTurno) {
      const p = roundProgress(
        completions,
        { templateId: t.id, unitId: u.id, date: viewDate },
        applicableItems(t, viewDate).map(i => i.id),
      );
      total += p.total;
      done += p.done;
    }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };

  /**
   * Os sinais de urgência de J8, indexados por loja. Vêm prontos do `buildJit`;
   * aqui só viram frase — a mesma que a aba J.I.T. monta, para as duas telas não
   * descreverem o mesmo estado com palavras diferentes.
   */
  const sinaisPorLoja = useMemo(() => {
    const out = {};
    for (const s of (jit?.stores || [])) {
      const partes = [];
      if (s.closedToday) partes.push('fechada hoje');
      else {
        if (s.overdue > 0) partes.push(`${s.overdue} atrasado${s.overdue > 1 ? 's' : ''}`);
        if (s.criticalHotspots > 0) partes.push(`${s.criticalHotspots} crítico${s.criticalHotspots > 1 ? 's' : ''} recorrente${s.criticalHotspots > 1 ? 's' : ''}`);
        if (s.pendingToday > 0) partes.push(`${s.pendingToday} pendente${s.pendingToday > 1 ? 's' : ''} hoje`);
        if (partes.length === 0) partes.push('em dia');
      }
      out[s.unitId] = { texto: partes.join(' · '), critico: s.overdue > 0 || s.criticalHotspots > 0 };
    }
    return out;
  }, [jit]);

  const getRating = (rate) => {
    if (rate === null) return null;
    if (rate === 100) return { Icon: Trophy,        label: 'Perfeito!', color: C.warning, stars: 5 };
    if (rate >= 90)  return { Icon: CheckCircle2,  label: 'Excelente', color: C.success, stars: 4 };
    if (rate >= 75)  return { Icon: ThumbsUp,      label: 'Bom', color: C.success, stars: 3 };
    if (rate >= 50)  return { Icon: TrendingUp,    label: 'Regular', color: unit.color, stars: 2 };
    return { Icon: AlertTriangle, label: 'Precisa melhorar', color: C.critical, stars: 1 };
  };
  const rating = getRating(rateToday);

  const diaFechado = isUnitClosed(closures, unit.id, viewDate);

  return (
    <div className="zc-view space-y-4" style={{ paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))' }}>

      {/* ═══ 1 · AGORA — MANAGER_ROLES, e só no dia de hoje ═══════════════ */}
      {isManager && (
        viewDate === today ? (
          <SecaoAgora
            jit={jit} accent={unit.color} currentUser={currentUser}
            actionPlans={actionPlans} plansLoaded={plansLoaded}
            onCreatePlan={onCreatePlan} onCompletePlan={onCompletePlan}
            onNavigate={onNavigate} completions={completions}
          />
        ) : (
          /* Sair de hoje colapsa o AGORA (§C.2). Números ao vivo ao lado de uma
             data passada são lidos como se pertencessem a ela. */
          <div className="flex items-center justify-between gap-2" style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: R.md, padding: '10px 14px' }}>
            <p style={{ fontSize: T.bodySm, color: C.muted }}>
              Você está vendo {new Date(`${viewDate}T00:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </p>
            <button onClick={() => setSelectedDate(today)}
              style={{ padding: '6px 12px', borderRadius: R.sm, border: `1px solid ${C.border}`, background: 'white', color: C.ink, fontSize: T.label, fontWeight: W.semibold, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Voltar para hoje
            </button>
          </div>
        )
      )}

      {/* ═══ 2 · DIA ══════════════════════════════════════════════════════ */}

      {/* 2.0 — navegador de data: deixa de fingir governar a página inteira e
          vira o cabeçalho desta seção. A faixa de 7 dias abaixo não obedece a
          ele, e agora isso está dito pela posição. */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => shiftDate(-1)} aria-label="Dia anterior"
          style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
          <ArrowLeft size={16} color={C.ink} />
        </button>
        <div className="flex-1 flex flex-col items-center">
          <p className="font-display" style={{ fontWeight: W.semibold, fontSize: 15, color: C.ink }}>Dia · {dateLabel}</p>
          <input type="date" value={viewDate} max={today} onChange={e => setSelectedDate(e.target.value)}
            aria-label="Escolher o dia"
            style={{ fontSize: 11, color: C.muted, background: 'none', border: 'none', outline: 'none', textAlign: 'center', cursor: 'pointer' }} />
        </div>
        <button onClick={() => shiftDate(1)} disabled={viewDate >= today} aria-label="Próximo dia"
          style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', cursor: viewDate >= today ? 'default' : 'pointer', opacity: viewDate >= today ? 0.3 : 1 }}>
          <ChevronRight size={16} color={C.ink} />
        </button>
      </div>

      {diaFechado ? (
        /* 2.0b — loja fechada suprime SÓ a seção DIA. A faixa fixa de 7 dias
           continua abaixo: a série não deixa de existir porque a loja fechou
           hoje (§D.1 bloco 2 — a única coisa que o colaborador passa a ver a
           mais, e são dois blocos que já são dele). */
        <Ticket accent={C.muted}>
          <div className="flex items-center gap-2">
            <Calendar size={18} color={C.muted} />
            <p style={{ fontSize: 14, fontWeight: W.semibold, color: C.muted }}>Loja fechada — nenhum checklist necessário.</p>
          </div>
        </Ticket>
      ) : (
        <>
          {/* 2.1 — score do dia, com o denominador que ele escondia */}
          <div className="p-4" style={{ background: unit.color, borderRadius: 12 }}>
            <div className="flex items-end justify-between">
              <div>
                <p style={{ fontSize: 12, fontWeight: W.semibold, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  {unit.name}{sectorLabelFor(currentUser?.sectorId, sectorRows) ? ` · ${sectorLabelFor(currentUser?.sectorId, sectorRows)}` : ''}
                </p>
                <p className="font-display" style={{ fontSize: 'calc(56px * var(--zc-t-scale))', fontWeight: W.bold, color: 'white', lineHeight: 1, marginTop: 4 }}>
                  {rateToday !== null ? `${rateToday}%` : '—'}
                </p>
                {rating && <RatingLabel rating={rating} size={15} style={{ fontSize: 15, fontWeight: W.semibold, color: 'rgba(255,255,255,0.9)', marginTop: 4 }} />}
                {dayCount.expected > 0 && (
                  <p style={{ fontSize: 13, fontWeight: W.semibold, color: 'rgba(255,255,255,0.85)', marginTop: 6 }}>
                    {dayCount.done} de {dayCount.expected} checklist{dayCount.expected === 1 ? '' : 's'}
                    {dayCount.overdue > 0 ? ` · ${dayCount.overdue} atrasado${dayCount.overdue === 1 ? '' : 's'}` : ''}
                  </p>
                )}
              </div>
              {rating && (
                // Sobre a cor da loja, estrela branca: `rating.color` aqui seria
                // cor sobre cor, sem contraste garantido.
                <StarRating stars={rating.stars} size={18} color="#fff" emptyColor="rgba(255,255,255,0.4)" />
              )}
            </div>
            {rateToday !== null && (
              <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden', marginTop: 16 }}>
                <div style={{ height: '100%', width: `${rateToday}%`, background: 'white', borderRadius: 999, transition: 'width 0.6s ease' }} />
              </div>
            )}
          </div>

          {/* Sem previsto no dia: dizer o motivo, em vez de deixar um "—" mudo */}
          {rateToday === null && (
            <p style={{ fontSize: T.bodySm, color: C.muted }}>
              Nenhum checklist previsto para este dia neste setor.
            </p>
          )}

          {/* 2.2 — ontem / média 7 dias */}
          {(rateYesterday !== null || avg7 !== null) && (
            <div className="grid grid-cols-2 gap-2">
              {rateYesterday !== null && (
                <Ticket accent={C.border}>
                  <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ontem</p>
                  <p className="font-display" style={{ fontSize: 'calc(22px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink, marginTop: 2 }}>{rateYesterday}%</p>
                  {rateToday !== null && (
                    <p style={{ fontSize: 12, fontWeight: W.semibold, marginTop: 4,
                      color: rateToday > rateYesterday ? C.success : rateToday < rateYesterday ? C.critical : C.muted }}>
                      {rateToday > rateYesterday ? `▲ +${rateToday - rateYesterday}pp` :
                       rateToday < rateYesterday ? `▼ ${rateToday - rateYesterday}pp` : '= igual'}
                    </p>
                  )}
                </Ticket>
              )}
              {avg7 !== null && (
                <Ticket accent={C.border}>
                  <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Média 7 dias</p>
                  <p className="font-display" style={{ fontSize: 'calc(22px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink, marginTop: 2 }}>{avg7}%</p>
                  {rateToday !== null && (
                    <p style={{ fontSize: 12, fontWeight: W.semibold, marginTop: 4,
                      color: rateToday > avg7 ? C.success : rateToday < avg7 ? C.critical : C.muted }}>
                      {rateToday > avg7 ? '▲ acima da média' : rateToday < avg7 ? '▼ abaixo da média' : '= na média'}
                    </p>
                  )}
                </Ticket>
              )}
            </div>
          )}

          {/* ═══ 3 · REDE ═════════════════════════════════════════════════
              Posição: §C.3 numera REDE como seção 3, DEPOIS de 2.3/2.4 — mas o
              wireframe de gerência (§C.5) e a tabela "primeira dobra por papel"
              põem o comparativo entre lojas logo após o score, antes do detalhe
              por tipo. Seguimos os dois últimos: eles raciocinam sobre a ordem
              de LEITURA, e a lista numerada é inventário de seções. Para quem
              está com "Todas as lojas" no cabeçalho, o detalhe por tipo de UMA
              loja antes da comparação da rede é a ordem errada. */}
          {canSeeAllUnits && (
            <SecaoRede
              units={units} calcRate={calcRate} closures={closures}
              viewDate={viewDate} today={today} yesterday={yesterday} last7={last7}
              dateLabel={dateLabel} sinaisPorLoja={sinaisPorLoja}
              onNavigate={onNavigate} turnoRate={turnoRate}
            />
          )}

          {/* 2.3 — por tipo de checklist (o "o que falta hoje" de quem executa) */}
          <Eyebrow>Por tipo de checklist</Eyebrow>
          {activeTypes.map(({ key, label, match }) => {
            const typeTemplates = templates.filter(t =>
              templateAtiva(t) &&
              t.unitId === unit.id && match(t) &&
              sectors.includes(t.sector) &&
              applicableItems(t, viewDate).length > 0
            );
            if (typeTemplates.length === 0) return null;
            const tipoStatus = typeTemplates.map(t => templateStatus(t, completions, viewDate, tz));
            const allDone = tipoStatus.every(s => s === 'done');
            const anyOverdue = tipoStatus.some(s => s === 'overdue');
            const anyPartial = tipoStatus.some(s => s === 'partial');
            const doneCount = tipoStatus.filter(s => s === 'done').length;
            return (
              <Ticket key={key} accent={allDone ? C.success : anyOverdue ? C.critical : anyPartial ? C.warning : unit.color}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-display" style={{ fontSize: 14, fontWeight: W.semibold, color: C.ink }}>{label}</p>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 12, fontWeight: W.semibold, color: allDone ? C.success : anyOverdue ? C.critical : anyPartial ? C.warning : unit.color }}>
                      {doneCount}/{typeTemplates.length}
                    </span>
                    {allDone && <CheckCircle2 size={16} color={C.success} />}
                    {anyOverdue && !allDone && <AlertTriangle size={16} color={C.critical} />}
                  </div>
                </div>
                <div className="space-y-2">
                  {sectors.map(sector => {
                    const t = typeTemplates.find(t => t.sector === sector);
                    if (!t) return null;
                    const status = templateStatus(t, completions, viewDate, tz);
                    // A ÚLTIMA submissão do dia, não a primeira: com duas, a
                    // primeira mostrava contagem e fotos desatualizadas.
                    const comp = latestPerRound(completions.filter(c => c.templateId === t.id && c.unitId === t.unitId && c.date === viewDate))[0];
                    const prog = templateProgress(t, completions, viewDate);
                    const doneItems = prog.done;
                    const totalItems = prog.total || (comp ? comp.items.length : 0);
                    const photoItems = comp ? comp.items.filter(i => i.hasPhoto) : [];
                    return (
                      <div key={sector}>
                        <div className="flex items-center justify-between gap-2">
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.ink }}>{sector}</p>
                            <p style={{ fontSize: 11, color: C.muted }}>
                              {comp
                                ? `${comp.operatorName} · ${new Date(comp.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                                : t.deadline ? `até ${t.deadline}` : 'pendente'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                            <span className="font-mono-ibr" style={{ fontSize: 12, fontWeight: W.semibold, color: doneItems === totalItems && totalItems > 0 ? C.success : C.muted }}>
                              {doneItems}/{totalItems}
                            </span>
                            <StatusBadge status={status} />
                          </div>
                        </div>
                        {photoItems.length > 0 && (
                          <div className="flex gap-2 mt-1">
                            {photoItems.map(i => (
                              <button key={i.id} onClick={() => setViewingPhoto({ recordId: comp.id, item: i })}
                                className="flex items-center gap-1"
                                style={{ fontSize: 10, fontWeight: W.semibold, color: unit.color, background: 'none', border: `1px solid ${C.border}`, borderRadius: 4, padding: '2px 6px' }}>
                                <Camera size={10} /> Foto
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Ticket>
            );
          })}

          {/* 2.4 — por setor · hoje. Substitui o comparativo de setores do
              Painel (que era literal 'Salão'/'Cozinha' travado em `ibr1`) pelo
              agregado dinâmico do J.I.T. Só aparece no dia de hoje: o título diz
              "hoje" e `jit.sectors` é de hoje — mostrá-lo sobre uma data passada
              seria a mesma mentira que o colapso do AGORA existe para evitar. */}
          {isManager && viewDate === today && (jit?.sectors || []).length > 0 && (
            <>
              <Eyebrow>Por setor · hoje</Eyebrow>
              <Ticket accent={C.border}>
                {jit.sectors.map(sc => (
                  <div key={sc.name} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: T.bodySm, fontWeight: W.medium, color: C.ink }}>{sc.name}</span>
                      <span className="font-display" style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: sc.rate >= 80 ? C.success : sc.rate >= 50 ? C.warning : C.critical }}>
                        {sc.rate}%
                      </span>
                    </div>
                    <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>
                      {sc.checklists} checklist{sc.checklists > 1 ? 's' : ''}
                      {sc.criticalPending ? ` · ${sc.criticalPending} crítico${sc.criticalPending > 1 ? 's' : ''} pendente${sc.criticalPending > 1 ? 's' : ''}` : ''}
                    </p>
                    <div style={{ height: 5, borderRadius: R.pill, background: C.bg, marginTop: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(2, Math.min(100, sc.rate))}%`, background: sc.rate >= 80 ? successBright : sc.rate >= 50 ? C.warning : C.critical, borderRadius: R.pill }} />
                    </div>
                  </div>
                ))}
              </Ticket>
            </>
          )}
        </>
      )}

      {/* ═══ 4 · FAIXA FIXA · 7 DIAS ══════════════════════════════════════
          Sem gate, sem seletor, sem segmento, e FORA da supressão de loja
          fechada. São os dois blocos que o colaborador tem hoje e que não podem
          morar atrás de um controle que ele não recebe (§C.2). */}

      {/* 4.1 — aderência por dia */}
      {serie7.some(d => d.rate !== null) && (
        <Ticket accent={C.border}>
          <Eyebrow>Aderência por dia · 7 dias</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 96, marginTop: 12 }}>
            {serie7.map(d => (
              <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span className="font-display" style={{ fontSize: T.label, fontWeight: W.semibold, color: d.isToday ? C.ink : C.mutedLight }}>
                  {d.rate !== null ? `${d.rate}%` : '—'}
                </span>
                <div style={{ width: '100%', height: 56, display: 'flex', alignItems: 'flex-end' }}>
                  <div title={`${d.weekday}: ${d.rate !== null ? `${d.rate}%` : 'sem checklist previsto'}`}
                    style={{
                      width: '100%',
                      height: `${Math.max(3, (d.rate ?? 0))}%`,
                      // Dia sem previsto é cinza, não vermelho: `null >= 50` é
                      // falso e cairia em "crítico" — pintar de falha um dia em
                      // que não havia nada a fazer é a mentira que a lacuna
                      // existe para evitar.
                      background: d.rate === null ? C.border
                        : d.isToday ? C.ink
                        : d.rate >= 80 ? successBright : d.rate >= 50 ? C.warning : C.critical,
                      borderRadius: '3px 3px 0 0',
                      // Dia sem previsto vira lacuna visível em vez de sumir da
                      // série — o padrão que o J.I.T. já usava e acertava.
                      opacity: d.rate !== null ? 1 : 0.25,
                    }} />
                </div>
                <span style={{ fontSize: T.label, color: C.mutedLight }}>{d.weekday}</span>
              </div>
            ))}
          </div>
        </Ticket>
      )}

      {/* 4.2 — ranking da equipe */}
      <Eyebrow>Ranking da equipe · {periodoPainel.label}</Eyebrow>
      <p style={{ fontSize: T.caption, color: C.muted, margin: '4px 0 10px' }}>
        Ordenado pelo índice operacional de {periodoPainel.label}: {collabIndexSentence()}.
      </p>
      {ranking7.length === 0 ? (
        <Ticket accent={C.border}>
          <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '8px 0' }}>Ninguém com execuções nesta loja ainda.</p>
        </Ticket>
      ) : (
        <Ticket accent={C.border}>
          <div className="space-y-3">
            {ranking7.map(({ user: userObj, profile }, idx) => {
              const valor = profile.index ?? 0;
              const barColor = valor >= 80 ? C.success : valor >= 50 ? unit.color : C.critical;
              const isMe = userObj.id === currentUser?.id || userObj.name === currentUser?.name;
              const roleLabel = userObj ? ROLE_LABELS[userObj.role] : null;
              return (
                <div key={userObj.id} style={{
                  padding: isMe ? '8px 10px' : '4px 0',
                  borderRadius: isMe ? 8 : 0,
                  background: isMe ? `${unit.color}12` : 'transparent',
                  border: isMe ? `1.5px solid ${unit.color}40` : 'none',
                }}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                      <RankBadge pos={idx + 1} size={22} />
                      {userObj?.avatarUrl && <Avatar user={userObj} size={24} />}
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: isMe ? 800 : 700, color: isMe ? unit.color : C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {userObj.name}{isMe ? ' · você' : ''}
                        </p>
                        <p style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
                          {roleLabel ? `${roleLabel} · ` : ''}{profile.tasksDone} tarefas · {profile.checklists} checklist{profile.checklists !== 1 ? 's' : ''}
                          {profile.punctuality != null ? ` · ${profile.punctuality}% no prazo` : ''}
                        </p>
                      </div>
                    </div>
                    {/* Índice, não percentual: 92 é uma nota composta. */}
                    <span className="font-display" style={{ fontSize: 16, fontWeight: W.semibold, color: barColor, flexShrink: 0 }}>
                      {profile.index == null ? '—' : profile.index}
                    </span>
                  </div>
                  <div style={{ width: '100%', height: 5, background: C.border, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${valor}%`, background: barColor, borderRadius: 999, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Ticket>
      )}

      {/* Seções 3 (REDE) e 5 (segmento analítico + Exportar): Fase 4. */}

      {viewingPhoto && (
        <PhotoModal recordId={viewingPhoto.recordId} item={viewingPhoto.item} onClose={() => setViewingPhoto(null)} />
      )}
    </div>
  );
}

/* ───────────────── Registro AGORA — o estado e a composição ─────────────── */

/**
 * A seção AGORA vive num componente próprio porque ela tem estado próprio
 * (planos respondidos, feedback do insight, recomendações já tratadas) e porque
 * é ela, inteira, que o pop-up de briefing passa a renderizar na Fase 5 (§F.1).
 *
 * Telemetria (§F.2): emite `painel_agora_viewed` com `source: 'painel'` — valor
 * novo, uma vez por usuário por dia. NÃO emite `jit_opened`: aquele evento
 * dispara por montagem, e com o AGORA na primeira dobra do Painel ele passaria
 * a contar toda visita à aba, afogando o `'manual'` que mede hábito de verdade.
 * Todo evento daqui leva `ui: 2` no metadata, para separar as duas eras sem
 * tocar em `action_source`.
 */
function SecaoAgora({ jit, accent, currentUser, actionPlans, plansLoaded, onCreatePlan, onCompletePlan, onNavigate, completions }) {
  const [actioned, setActioned] = useState(() =>
    Object.fromEntries((actionPlans || []).map(p => [p.recId, true])));
  const [planAnswers, setPlanAnswers] = useState({});
  const [insightFeedback, setInsightFeedback] = useState(null);
  const [insightActioned, setInsightActioned] = useState(false);

  // Os planos chegam por fetch e podem aterrissar depois da montagem — mescla
  // sem apagar o que o gestor marcou nesta sessão.
  useEffect(() => {
    if (!actionPlans?.length) return;
    setActioned(a => ({ ...Object.fromEntries(actionPlans.map(p => [p.recId, true])), ...a }));
  }, [actionPlans]);

  const jitDate = jit?.date;
  useEffect(() => {
    if (!jitDate || !currentUser?.id) return;
    const chave = `zc_painel_agora_${currentUser.id}_${jitDate}`;
    try {
      if (localStorage.getItem(chave)) return;
      localStorage.setItem(chave, '1');
    } catch (_) { /* modo privado: perde a dedupe, não a tela */ }
    track('painel_agora_viewed', { source: 'painel', metadata: { ui: 2 } });
  }, [jitDate, currentUser?.id]);

  // Fica acima do return antecipado: hook não pode ser condicional.
  const scopeUnitId = jit?.scopeUnitId;
  const ultimaExec = useMemo(() => {
    const doDia = (completions || []).filter(c =>
      c.date === jitDate && (!scopeUnitId || c.unitId === scopeUnitId) && c.completedAt);
    if (!doDia.length) return null;
    return doDia.reduce((a, b) => (a.completedAt > b.completedAt ? a : b)).completedAt;
  }, [completions, jitDate, scopeUnitId]);

  if (!jit) return null;

  const insight = jit.insight;
  const pendingPlans = (actionPlans || []).filter(p => p.jitDate !== jit.date);
  const planAgeDays = p => Math.max(1, Math.round((new Date(`${jit.date}T00:00:00`) - new Date(`${p.jitDate}T00:00:00`)) / 86400000));

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
    track('ai_insight_feedback', { source: 'jit', unitId: insight.unitId || undefined,
      metadata: { ui: 2, insight_id: insight.id, type: insight.type, answer: ans } });
  };
  const actOnInsight = () => {
    if (!insight) return;
    if (!insightActioned) {
      setInsightActioned(true);
      track('ai_insight_actioned', { source: 'jit', unitId: insight.unitId || undefined,
        metadata: { ui: 2, insight_id: insight.id, type: insight.type } });
    }
    if (insight.unitId) onNavigate?.(insight.unitId, 'painel');
  };

  const clickRec = rec => {
    track('recommendation_clicked', { source: 'jit', unitId: rec.unitId || undefined,
      metadata: { ui: 2, rec_id: rec.id, type: rec.type } });
    if (rec.tab || rec.unitId) onNavigate?.(rec.unitId, rec.tab);
  };
  const actionRec = async (rec, e) => {
    e.stopPropagation();
    if (actioned[rec.id]) return;
    setActioned(a => ({ ...a, [rec.id]: true }));
    track('recommendation_actioned', { source: 'jit', unitId: rec.unitId || undefined,
      metadata: { ui: 2, rec_id: rec.id, type: rec.type } });
    const plan = await onCreatePlan(rec);
    if (plan) {
      track('action_plan_created', { source: 'jit', unitId: rec.unitId || undefined,
        metadata: { ui: 2, plan_id: plan.id, rec_id: rec.id, rec_type: rec.type } });
    }
  };

  const recs = jit.recommendations || [];
  // Vazio POSITIVO (§C.6): "sem dado" e "nada a fazer" não podem ler igual.
  const nadaAFazer = !pendingPlans.length && !insight && recs.every(r => r.type === 'all_good');

  return (
    <section aria-label="Agora" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Agora</p>
        <p style={{ fontSize: T.caption, color: C.mutedLight, marginTop: 2 }}>{jit.scopeLabel}</p>
      </div>

      {/* O follow-up só entra quando os planos chegaram: sem isso o gestor com
          pendência vê a seção sem ela por um instante e lê como "resolvido". */}
      {plansLoaded ? (
        <AgoraFollowUp plans={pendingPlans} answers={planAnswers} onResolve={resolvePlan} onKeep={keepPlan} ageOf={planAgeDays} />
      ) : (
        <div aria-hidden style={{ height: 8, borderRadius: R.pill, background: C.border, opacity: 0.5 }} />
      )}

      <AgoraLeitura insight={insight} accent={accent} feedback={insightFeedback}
        actioned={insightActioned} onRate={rateInsight} onAct={actOnInsight} />

      {nadaAFazer ? (
        <div style={{ background: 'white', borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 16px' }}>
          <p style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.success }}>Nada exigindo ação agora.</p>
          <p style={{ fontSize: T.caption, color: C.muted, marginTop: 4 }}>
            {ultimaExec
              ? `Última execução às ${new Date(ultimaExec).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
              : 'Nenhuma execução registrada hoje ainda.'}
          </p>
        </div>
      ) : (
        <AgoraPrioridades recs={recs} actioned={actioned} onClickRec={clickRec} onActionRec={actionRec} />
      )}

      <AgoraBase base={jit.base} scopeLabel={jit.scopeLabel} />
    </section>
  );
}
