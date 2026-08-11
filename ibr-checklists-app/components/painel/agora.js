'use client';

/**
 * Registro AGORA — os blocos do "o que importa na operação neste momento".
 *
 * Módulo próprio porque eles têm DOIS consumidores, e §F.1 do plano exige que
 * não exista segunda implementação para divergir da primeira:
 *
 *   1. a seção AGORA do Painel consolidado (`PainelConsolidado`), sempre na
 *      primeira dobra de quem é MANAGER_ROLES;
 *   2. o pop-up de briefing (`JitPanel`), que é o único PUSH para dentro do app
 *      e por isso sobreviveu à consolidação — mas passou a renderizar
 *      exatamente estes blocos, e não mais "a página menos CSS".
 *
 * O que muda entre os dois é a COMPOSIÇÃO, declarada em cada lugar. Os blocos
 * em si são os mesmos objetos.
 *
 * REGRA: não pode importar de `app/`.
 */

import { C, R, T, W } from '../../lib/tokens';
import { AlertTriangle, Check, CheckCircle2, Circle, Clock, TrendingDown } from 'lucide-react';
import { SectionMark, FeedbackThumbs } from './shared';

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

