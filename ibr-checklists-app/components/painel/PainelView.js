'use client';

/**
 * Aba PAINEL — a foto instantânea da operação de hoje.
 *
 * Movida de `app/app/page.js` na Fase 1b da consolidação de abas. Nenhuma linha
 * de lógica mudou: só endereço, e os imports do que antes era escopo de módulo
 * compartilhado. Ver `docs/PLANO_CONSOLIDACAO_ABAS.md`.
 *
 * `NotificationHistory` vem junto porque a PainelView é sua única chamadora —
 * fica privado a este módulo em vez de virar superfície pública nova.
 *
 * REGRA: não pode importar de `app/`.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle, ArrowLeft, Bell, Calendar, Camera, CheckCircle2, ChevronRight,
  ThumbsUp, TrendingUp, Trophy,
} from 'lucide-react';
import { C, T, W } from '../../lib/tokens';
// O dia é sempre o do relógio da LOJA — ver lib/dates.js.
import { todayStr, addDays, lastDays, dateStrOf, tzOf } from '../../lib/dates';
import { latestPerRound } from '../../lib/rounds';
import {
  CHECKLIST_TYPE_ORDER, applicableItems, templateAtiva, templateStatus,
  templateProgress, isUnitClosed,
} from '../../lib/checklists';
import { sectorLabelFor, visibleSectors } from '../../lib/sectors';
import {
  RANKED_ROLES, RANKING_PERIOD_DEFAULT, rankingPeriod, collabIndexSentence,
  computeOperationalProfile,
} from '../../lib/ranking';
import {
  ROLE_LABELS, Eyebrow, Ticket, StarRating, Avatar, RatingLabel, StatusBadge,
  PillButton, RankBadge, PhotoModal,
} from './shared';
import { useUnits, useSectors } from './context';

export function PainelView({ unit, templates, completions, closures, canSeeAllUnits, currentUser, users, activeTypes = CHECKLIST_TYPE_ORDER }) {
  const units = useUnits(); // unidades da empresa logada (antes: constante do IBR)
  const sectorRows = useSectors(); // linhas de sectors da empresa logada
  // "Hoje" do painel é o da loja em foco. Com o escopo na rede inteira não
  // existe um dia único — usa-se o da loja base de quem está olhando, que é o
  // mesmo critério do J.I.T.
  const today = todayStr(tzOf(unit));
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const viewDate = selectedDate;

  // For IBR1: allow gestão/gerência/liderança to switch between sector views
  const hasMultipleSectors = unit.id === 'ibr1';
  const [activeSectorGroup, setActiveSectorGroup] = useState(
    currentUser?.sectorId || (hasMultipleSectors && (currentUser?.role === 'gestao' || currentUser?.role === 'gerencia' || currentUser?.role === 'lideranca') ? 'all' : currentUser?.sectorId || null)
  );

  // Resolve which physical sectors to show
  const getSectorList = (groupId) => {
    if (!hasMultipleSectors || !groupId || groupId === 'all') return unit.sectors;
    if (groupId === 'salao') return unit.sectors.filter(s => s === 'Salão');
    if (groupId === 'cozinha') return unit.sectors.filter(s => s === 'Cozinha');
    return unit.sectors;
  };

  const canSwitchSectors = hasMultipleSectors && ['gestao', 'gerencia', 'lideranca'].includes(currentUser?.role);
  const sectors = currentUser?.sectorId ? visibleSectors(unit, currentUser.sectorId, sectorRows) : getSectorList(activeSectorGroup);

  const shiftDate = (delta) => {
    const next = addDays(viewDate, delta);
    if (next <= today) setSelectedDate(next);
  };

  const dateLabel = viewDate === today
    ? 'Hoje'
    : new Date(`${viewDate}T00:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();

  // ── Rate calculation ─────────────────────────────────────────────────────
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
      const comp = completions.find(c => c.templateId === t.id && c.date === date);
      const applicable = applicableItems(t, date);
      total += applicable.length;
      done += comp ? comp.items.filter(i => i.done).length : 0;
    }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };

  const yesterday = addDays(today, -1);
  // last7 includes today + 6 previous days
  const last7 = lastDays(7, today);

  const rateToday = calcRate(viewDate, unit.id, sectors);
  const rateYesterday = viewDate === today ? calcRate(yesterday, unit.id, sectors) : null;
  const rates7 = last7.map(d => calcRate(d, unit.id, sectors)).filter(r => r !== null);
  const avg7 = rates7.length ? Math.round(rates7.reduce((a,b)=>a+b,0)/rates7.length) : null;

  // ── Sector comparison (IBR1 gestão only) ─────────────────────────────────
  const sectorGroups = hasMultipleSectors ? [
    { id: 'salao',   label: 'Salão',   sectors: unit.sectors.filter(s => s === 'Salão') },
    { id: 'cozinha', label: 'Cozinha', sectors: unit.sectors.filter(s => s === 'Cozinha') },
  ] : [];
  const sectorComparison = canSwitchSectors ? sectorGroups.map(sg => ({
    ...sg,
    rate: calcRate(viewDate, unit.id, sg.sectors),
    avg7: (() => {
      const r = last7.map(d => calcRate(d, unit.id, sg.sectors)).filter(r => r !== null);
      return r.length ? Math.round(r.reduce((a,b)=>a+b,0)/r.length) : null;
    })(),
  })) : [];

  /**
   * Ranking da equipe — o MESMO da aba Equipe, não um segundo ranking.
   *
   * Antes esta lista era `calcRanking(last7)`: percentual de tarefas concluídas
   * em 7 dias. A aba Equipe ordena pelo índice operacional. As duas apareciam
   * lado a lado no mesmo app, com nomes em ordens diferentes e números
   * diferentes para as mesmas pessoas — e quem olhasse as duas não tinha como
   * saber qual valia. Um ranking que se contradiz não é ranking.
   *
   * Agora é o mesmo cálculo, o mesmo recorte de candidatos e a mesma
   * ordenação de `EquipeView.rank`, escopado à loja em foco. O rótulo deixou de
   * prometer "últimos 7 dias" porque o índice não é de 7 dias.
   *
   * O `calcRanking` que existia aqui foi removido junto: ninguém mais o
   * chamava, e função morta que calcula ranking é a pior espécie de código
   * morto — a próxima pessoa acha que existem duas réguas de propósito.
   */
  // O Painel é MENSAL e ponto: quem abre aqui é a operação do dia, e um placar
  // que recomeça no dia 1º é o que faz constância virar objetivo. Escolher
  // período é coisa da aba Equipe, onde se analisa.
  const periodoPainel = useMemo(
    () => rankingPeriod(RANKING_PERIOD_DEFAULT, tzOf(unit), completions),
    [unit, completions],
  );
  const ranking7 = useMemo(() => {
    const ofUnit = (completions || []).filter(c => c.unitId === unit.id);
    return (users || [])
      .filter(u => RANKED_ROLES.includes(u.role) && !u.suspended && (!u.unitId || u.unitId === unit.id))
      .map(u => ({ user: u, profile: computeOperationalProfile(ofUnit, u.id, u.name, tzOf(unit), templates, units, periodoPainel) }))
      .filter(x => x.profile.checklists > 0 || x.profile.tasksDone > 0)
      .sort((a, b) => (b.profile.index ?? -1) - (a.profile.index ?? -1)
        || b.profile.tasksDone - a.profile.tasksDone
        || b.profile.checklists - a.profile.checklists);
  }, [completions, users, unit, templates, units, periodoPainel]);

  // ── Gamification: score & label ──────────────────────────────────────────
  const getRating = (rate) => {
    if (rate === null) return null;
    if (rate === 100) return { Icon: Trophy,        label: 'Perfeito!', color: C.warning, stars: 5 };
    if (rate >= 90)  return { Icon: CheckCircle2,  label: 'Excelente', color: C.success, stars: 4 };
    if (rate >= 75)  return { Icon: ThumbsUp,      label: 'Bom', color: C.success, stars: 3 };
    if (rate >= 50)  return { Icon: TrendingUp,    label: 'Regular', color: unit.color, stars: 2 };
    return { Icon: AlertTriangle, label: 'Precisa melhorar', color: C.critical, stars: 1 };
  };

  const rating = getRating(rateToday);

  return (
    <div className="zc-view space-y-4" style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>

      {/* Date navigator */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => shiftDate(-1)} style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>
          <ArrowLeft size={16} color={C.ink} />
        </button>
        <div className="flex-1 flex flex-col items-center">
          <p className="font-display" style={{ fontWeight: W.semibold, fontSize: 15, color: C.ink }}>{dateLabel}</p>
          <input type="date" value={viewDate} max={today} onChange={e => setSelectedDate(e.target.value)}
            style={{ fontSize: 11, color: C.muted, background: 'none', border: 'none', outline: 'none', textAlign: 'center', cursor: 'pointer' }} />
        </div>
        <button onClick={() => shiftDate(1)} disabled={viewDate >= today}
          style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', cursor: viewDate >= today ? 'default' : 'pointer', opacity: viewDate >= today ? 0.3 : 1 }}>
          <ChevronRight size={16} color={C.ink} />
        </button>
      </div>

      {/* IBR1 sector switcher for gestão/gerência/liderança */}
      {canSwitchSectors && (
        <div className="flex gap-2">
          <PillButton active={activeSectorGroup === 'all'} accent={unit.color} onClick={() => setActiveSectorGroup('all')}>Geral</PillButton>
          {sectorGroups.map(sg => (
            <PillButton key={sg.id} active={activeSectorGroup === sg.id} accent={unit.color} onClick={() => setActiveSectorGroup(sg.id)}>{sg.label}</PillButton>
          ))}
        </div>
      )}

      {/* Sector comparison (IBR1 gestão — only when "Geral" is selected) */}
      {canSwitchSectors && activeSectorGroup === 'all' && sectorComparison.length > 0 && (
        <>
          <Eyebrow>Comparativo de setores — {dateLabel}</Eyebrow>
          <div className="grid grid-cols-2 gap-2">
            {sectorComparison.map(sg => {
              const r = sg.rate;
              const sgRating = getRating(r);
              return (
                <button key={sg.id} onClick={() => setActiveSectorGroup(sg.id)}
                  className="text-left" style={{ background: 'none', border: 'none', padding: 0 }}>
                  <Ticket accent={r !== null && r >= 80 ? C.success : r !== null && r < 50 ? C.critical : unit.color}>
                    <p className="font-display" style={{ fontWeight: W.semibold, fontSize: 14, color: C.ink }}>{sg.label}</p>
                    <p className="font-display" style={{ fontSize: 'calc(32px * var(--zc-t-scale))', fontWeight: W.bold, color: unit.color, lineHeight: 1, margin: '4px 0' }}>
                      {r !== null ? `${r}%` : '—'}
                    </p>
                    {sgRating && <StarRating stars={sgRating.stars} size={12} color={sgRating.color} />}
                    {sg.avg7 !== null && (
                      <p style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                        Média 7d: {sg.avg7}%
                        <span style={{ marginLeft: 4, color: r !== null && r > sg.avg7 ? C.success : r !== null && r < sg.avg7 ? C.critical : C.muted, fontWeight: W.semibold }}>
                          {r !== null && r > sg.avg7 ? ' ▲' : r !== null && r < sg.avg7 ? ' ▼' : ' ='}
                        </span>
                      </p>
                    )}
                    <div style={{ width: '100%', height: 4, background: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
                      <div style={{ height: '100%', width: `${r ?? 0}%`, background: r >= 80 ? C.success : r >= 50 ? unit.color : C.critical }} />
                    </div>
                  </Ticket>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Cross-store comparative dashboard — gestão/gerência only */}
      {canSeeAllUnits && (
        <>
          <Eyebrow>Comparativo entre lojas — {dateLabel}</Eyebrow>

          {/* Main comparison cards */}
          <div className="flex flex-col gap-3">
            {units.map((u, idx) => {
              const unitClosed = isUnitClosed(closures, u.id, viewDate);
              const rate = unitClosed ? null : calcRate(viewDate, u.id, u.sectors);
              const rateYest = calcRate(yesterday, u.id, u.sectors);
              const last7u = last7.map(d => calcRate(d, u.id, u.sectors));
              const avg = last7u.filter(v => v !== null).length > 0
                ? Math.round(last7u.filter(v => v !== null).reduce((a,b) => a+b,0) / last7u.filter(v => v !== null).length)
                : null;
              const trend = rate !== null && avg !== null ? rate - avg : null;
              const getRating = (r) => {
                if (r === null) return null;
                if (r === 100) return { Icon: Trophy,       label: 'Perfeito', color: '#2F6F5E' };
                if (r >= 90) return { Icon: CheckCircle2,   label: 'Excelente', color: '#2F6F5E' };
                if (r >= 75) return { Icon: ThumbsUp,       label: 'Bom', color: u.color };
                if (r >= 50) return { Icon: TrendingUp,     label: 'Regular', color: C.warning };
                return { Icon: AlertTriangle, label: 'Atenção', color: C.critical };
              };
              const rating = getRating(rate);

              // Turno breakdown
              const turnoRate = (shift) => {
                const shiftTemplates = templates.filter(t =>
                  templateAtiva(t) &&
                  t.unitId === u.id &&
                  (Array.isArray(t.shift) ? t.shift.includes(shift) : t.shift === shift) &&
                  applicableItems(t, viewDate).length > 0
                );
                if (shiftTemplates.length === 0) return null;
                let done = 0, total = 0;
                for (const t of shiftTemplates) {
                  const comp = completions.find(c => c.templateId === t.id && c.date === viewDate);
                  total += applicableItems(t, viewDate).length;
                  done += comp ? comp.items.filter(i => i.done).length : 0;
                }
                return total > 0 ? Math.round((done/total)*100) : 0;
              };

              const sortedUnits = [...units].sort((a, b) => {
                const ra = isUnitClosed(closures, a.id, viewDate) ? -1 : (calcRate(viewDate, a.id, a.sectors) ?? -1);
                const rb = isUnitClosed(closures, b.id, viewDate) ? -1 : (calcRate(viewDate, b.id, b.sectors) ?? -1);
                return rb - ra;
              });
              const rank = sortedUnits.findIndex(su => su.id === u.id);

              return (
                <Ticket key={u.id} accent={u.color}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p style={{ fontSize: 13, fontWeight: W.semibold, color: u.color }}>{u.name}</p>
                        {!unitClosed && rate !== null && rank >= 0 && (
                          <RankBadge pos={rank + 1} size={20} />
                        )}
                      </div>
                      {unitClosed
                        ? <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Fechada hoje</p>
                        : <p className="font-display" style={{ fontSize: 'calc(36px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink, lineHeight: 1, marginTop: 4 }}>{rate ?? '—'}%</p>
                      }
                      {rating && <RatingLabel rating={rating} size={11} style={{ fontSize: 11, fontWeight: W.semibold, color: rating.color, marginTop: 2 }} />}
                    </div>
                    {!unitClosed && trend !== null && (
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: 11, color: C.muted, fontWeight: W.semibold }}>vs média 7d</p>
                        <p style={{ fontSize: 18, fontWeight: W.semibold, color: trend >= 0 ? C.success : C.critical }}>
                          {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
                        </p>
                        <p style={{ fontSize: 11, color: C.muted }}>média {avg}%</p>
                      </div>
                    )}
                  </div>

                  {!unitClosed && rate !== null && (
                    <>
                      {/* Progress bar */}
                      <div style={{ width: '100%', height: 5, background: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
                        <div style={{ height: '100%', width: `${rate}%`, background: (rate>=80)?C.success:(rate>=50)?u.color:C.critical, borderRadius: 999, transition: 'width 0.5s ease' }} />
                      </div>

                      {/* Turno breakdown */}
                      <div className="flex gap-2 mt-3">
                        {[{label:'Abertura', shift:'Manhã'},{label:'Intermediário', shift:'Tarde'},{label:'Fechamento', shift:'Tarde'}].map(({label, shift}) => {
                          const r = turnoRate(shift);
                          return r !== null ? (
                            <div key={label} style={{ flex:1, background: C.bg, borderRadius: 6, padding: '4px 6px', textAlign:'center' }}>
                              <p style={{ fontSize: 9, fontWeight: W.semibold, color: C.muted, textTransform:'uppercase' }}>{label.slice(0,4)}</p>
                              <p style={{ fontSize: 13, fontWeight: W.semibold, color: r>=80?C.success:r>=50?u.color:C.critical }}>{r}%</p>
                            </div>
                          ) : null;
                        })}

                        {/* Sparkline */}
                        <div style={{ flex: 2, background: C.bg, borderRadius: 6, padding: '4px 8px', display:'flex', alignItems:'center', gap: 2 }}>
                          {last7u.map((v, i) => (
                            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', height: 20 }}>
                              <div style={{ width:'100%', background: v===null?C.border:v>=80?C.success:v>=50?u.color:C.critical, borderRadius: 2, height: v===null?2:`${Math.max(2, (v/100)*20)}px`, opacity: i===6?1:0.6+i*0.06 }} />
                            </div>
                          ))}
                          <p style={{ fontSize: 9, color: C.muted, fontWeight: W.semibold, marginLeft: 2 }}>7d</p>
                        </div>
                      </div>
                    </>
                  )}
                </Ticket>
              );
            })}
          </div>

          {/* Ranking geral entre lojas */}
          {(() => {
            const sorted = [...units]
              .map(u => ({
                u,
                rate: isUnitClosed(closures, u.id, viewDate) ? null : calcRate(viewDate, u.id, u.sectors)
              }))
              .filter(x => x.rate !== null)
              .sort((a,b) => b.rate - a.rate);
            if (sorted.length < 2) return null;
            return (
              <>
                <Eyebrow>Ranking do dia</Eyebrow>
                <div className="flex flex-col gap-2">
                  {sorted.map(({u, rate}, i) => (
                    <div key={u.id} className="flex items-center gap-3" style={{ padding: '8px 12px', background: 'white', borderRadius: 10, border: `1.5px solid ${C.border}` }}>
                      <RankBadge pos={i + 1} size={24} />
                      <p style={{ flex:1, fontSize: 14, fontWeight: W.semibold, color: u.color }}>{u.name}</p>
                      <p className="font-display" style={{ fontSize: 'calc(18px * var(--zc-t-scale))', fontWeight: W.semibold, color: C.ink }}>{rate}%</p>
                      <div style={{ width: 60, height: 4, background: C.border, borderRadius: 999, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${rate}%`, background: rate>=80?C.success:rate>=50?u.color:C.critical }} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </>
      )}

      {/* ── GAMIFIED SCORE CARD ── */}
      {isUnitClosed(closures, unit.id, viewDate) ? (
        <Ticket accent={C.muted}>
          <div className="flex items-center gap-2">
            <Calendar size={18} color={C.muted} />
            <p style={{ fontSize: 14, fontWeight: W.semibold, color: C.muted }}>Loja fechada — nenhum checklist necessário.</p>
          </div>
        </Ticket>
      ) : (
        <>
          {/* Main score */}
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
              </div>
              {rating && (
                // Sobre a cor da loja, estrela branca: `rating.color` aqui seria
                // cor sobre cor, sem contraste garantido.
                <StarRating stars={rating.stars} size={18} color="#fff" emptyColor="rgba(255,255,255,0.4)" />
              )}
            </div>
            {/* Progress bar */}
            {rateToday !== null && (
              <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 999, overflow: 'hidden', marginTop: 16 }}>
                <div style={{ height: '100%', width: `${rateToday}%`, background: 'white', borderRadius: 999, transition: 'width 0.6s ease' }} />
              </div>
            )}
          </div>

          {/* Comparison row */}
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
                      {rateToday > avg7 ? `▲ acima da média` : rateToday < avg7 ? `▼ abaixo da média` : '= na média'}
                    </p>
                  )}
                </Ticket>
              )}
            </div>
          )}

          {/* 7-day sparkline */}
          {rates7.length > 0 && (
            <Ticket accent={C.border}>
              <Eyebrow>Últimos 7 dias</Eyebrow>
              <div className="flex items-end gap-1 mt-3" style={{ height: 40 }}>
                {[...rates7].reverse().map((r, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div style={{
                      width: '100%', height: `${Math.max(4, r * 0.4)}px`,
                      background: r >= 80 ? C.success : r >= 50 ? unit.color : C.critical,
                      borderRadius: 3, transition: 'height 0.3s ease',
                    }} />
                    <p style={{ fontSize: 9, color: C.muted, fontWeight: W.semibold }}>{r}%</p>
                  </div>
                ))}
              </div>
            </Ticket>
          )}

          {/* Per-type breakdown */}
          <Eyebrow>Por tipo de checklist</Eyebrow>
          {activeTypes.map(({ key, label, match }) => {
            const typeTemplates = templates.filter(t =>
              templateAtiva(t) &&
              t.unitId === unit.id && match(t) &&
              sectors.includes(t.sector) &&
              applicableItems(t, viewDate).length > 0
            );
            if (typeTemplates.length === 0) return null;
            // Um status por checklist, uma vez só (eram três varreduras por
            // checklist). `allDone` agora exige COMPLETO: com o estado parcial,
            // um tipo com checklist entregue pela metade deixa de ficar verde.
            const tipoStatus = typeTemplates.map(t => templateStatus(t, completions, viewDate, tzOf(unit)));
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
                    const status = templateStatus(t, completions, viewDate, tzOf(unit));
                    // A ÚLTIMA submissão do dia, não a primeira que o `find`
                    // achasse: com duas submissões, a primeira mostrava contagem e
                    // fotos desatualizadas — e é a última que carrega a união do
                    // que foi feito.
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

          {/* Ranking da equipe — penúltimo. Mesmo índice da aba Equipe: ver o
              comentário em `ranking7`. */}
          <Eyebrow>Ranking da equipe · {periodoPainel.label}</Eyebrow>
          {/* A MESMA frase da aba Equipe, da mesma fonte. Duas telas mostrando
              o mesmo ranking precisam explicá-lo com as mesmas palavras — se
              divergirem, volta a parecer que são duas réguas. */}
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
                  const collab = {
                    key: userObj.id, name: userObj.name,
                    rate: profile.index ?? 0,
                    checklists: profile.checklists, done: profile.tasksDone,
                  };
                  const barColor = collab.rate >= 80 ? C.success : collab.rate >= 50 ? unit.color : C.critical;
                  const isMe = userObj.id === currentUser?.id || collab.name === currentUser?.name;
                  const roleLabel = userObj ? ROLE_LABELS[userObj.role] : null;
                  return (
                    <div key={collab.key} style={{
                      padding: isMe ? '8px 10px' : '4px 0',
                      borderRadius: isMe ? 8 : 0,
                      background: isMe ? `${unit.color}12` : 'transparent',
                      border: isMe ? `1.5px solid ${unit.color}40` : 'none',
                    }}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                          <RankBadge pos={idx + 1} size={22} />
                          {/* Só quem tem foto ganha o círculo: preencher a lista
                              inteira de iniciais ao lado da medalha vira ruído
                              num ranking que já tem posição, nome e barra. */}
                          {userObj?.avatarUrl && <Avatar user={userObj} size={24} />}
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: isMe ? 800 : 700, color: isMe ? unit.color : C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {collab.name}{isMe ? ' · você' : ''}
                            </p>
                            {/* A pontualidade vem junto do resumo: é o
                                componente novo do índice e o que a pessoa
                                consegue mudar já no próximo turno. */}
                            <p style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
                              {roleLabel ? `${roleLabel} · ` : ''}{collab.done} tarefas · {collab.checklists} checklist{collab.checklists !== 1 ? 's' : ''}
                              {profile.punctuality != null ? ` · ${profile.punctuality}% no prazo` : ''}
                            </p>
                          </div>
                        </div>
                        {/* Índice, não percentual: 92 é uma nota composta, e o
                            "%" fazia parecer "92% das tarefas". */}
                        <span className="font-display" style={{ fontSize: 16, fontWeight: W.semibold, color: barColor, flexShrink: 0 }}>
                          {profile.index == null ? '—' : profile.index}
                        </span>
                      </div>
                      <div style={{ width: '100%', height: 5, background: C.border, borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${collab.rate}%`, background: barColor, borderRadius: 999, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Ticket>
          )}

          {/* Histórico recente saiu do Painel a pedido do piloto (12/07): a
              lista detalhada de execuções vive só em Relatórios → "Execuções
              do período", que também entra no CSV e no PDF gerados. */}
        </>
      )}

      {viewingPhoto && (
        <PhotoModal recordId={viewingPhoto.recordId} item={viewingPhoto.item} onClose={() => setViewingPhoto(null)} />
      )}

      {/* ── Histórico de notificações ──
          Quem recebe o aviso precisa poder conferir o que foi enviado. A
          condição era `canSeeAllUnits`, que é `currentUser.unitId == null` —
          ou seja, só a gestão sem loja. Gerência e liderança, que RECEBEM o
          push de atraso (PAPEIS_AMPLOS na notify-overdue), nunca viam o
          painel: para elas a aba Painel simplesmente não tinha histórico. */}
      {['gestao', 'gerencia', 'lideranca'].includes(currentUser?.role) && (
        <NotificationHistory templates={templates} units={units} last7={last7} unit={unit} />
      )}
    </div>
  );
}

/* ── Histórico de notificações ──────────────────────────────────────────────
 *
 * A fonte é `notification_log` (migration 20260729): uma linha por notificação
 * entregue, com empresa, loja, tipo, hora real e quantos aparelhos receberam.
 *
 * A fonte ANTIGA era `config`, lendo as chaves `notified_<data>` — que não são
 * histórico nenhum: são a chave de deduplicação da edge function, um array de
 * ids por dia. Dali saíam quatro defeitos: hora falsa (a do último upsert do
 * dia, repetida em todas as linhas), ids de OUTRAS empresas caindo na lista
 * como "Checklist removido" (a chave é global), nenhum tipo além de atraso, e
 * nenhuma contagem de entrega. A leitura legada continua aqui como segunda
 * fonte enquanto a notify-overdue v9 não estiver deployada — depois disso ela
 * some sozinha, porque as chaves velhas saem da janela de 7 dias.
 *
 * Erro NÃO é mais silencioso: antes um `console.warn` deixava a tela dizendo
 * "Nenhuma notificação enviada" quando na verdade a leitura tinha falhado (foi
 * assim que o painel passou semanas vazio, sem policy para `authenticated`).
 */
function NotificationHistory({ templates, units, last7, unit }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [log, setLog] = useState([]);

  const tz = tzOf(unit);
  // `last7` é um array novo a cada render do painel (lastDays roda toda vez).
  // A dependência precisa ser o CONTEÚDO, não a identidade — senão o efeito
  // dispara em todo render e a aba vira um laço de consultas.
  const dias = last7.join(',');

  const loadLog = React.useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const supabase = (await import('../../lib/supabase')).authedSupabase();
      const janela = dias.split(',');
      const desde = janela[0];   // primeiro dos 7 dias, no relógio da loja base
      const entradas = [];
      let falhaReal = null;

      // ── Fonte atual ────────────────────────────────────────────────────────
      const { data: rows, error: eLog } = await supabase
        .from('notification_log')
        .select('id, unit_id, kind, title, body, template_id, sector, deadline, targets, delivered, created_at')
        .gte('created_at', `${desde}T00:00:00`)
        .order('created_at', { ascending: false })
        .limit(200);

      // Tabela ainda não criada (migration pendente) não é erro de tela — é o
      // estado esperado até a migration rodar, e a fonte legada cobre. Qualquer
      // outro erro (permissão, rede) precisa aparecer.
      const tabelaAusente = eLog && /42P01|PGRST205|does not exist/i.test(`${eLog.code} ${eLog.message}`);
      if (eLog && !tabelaAusente) falhaReal = eLog.message;

      for (const r of (rows || [])) {
        entradas.push({
          chave: `${dateStrOf(new Date(r.created_at), tz)}|${r.template_id || r.id}`,
          kind: r.kind,
          titulo: r.template_id
            ? (templates.find(t => t.id === r.template_id)?.name || r.body || r.title)
            : r.title,
          detalhe: r.template_id ? [r.sector, r.deadline && `prazo ${r.deadline}`].filter(Boolean).join(' · ') : r.body,
          unitId: r.unit_id,
          targets: r.targets,
          delivered: r.delivered,
          quando: r.created_at,
          precisa: true,
        });
      }

      // ── Fonte legada (`config.notified_<data>`) ────────────────────────────
      const { data: cfg, error: eCfg } = await supabase
        .from('config')
        .select('key, value, updated_at')
        .in('key', janela.map(d => `notified_${d}`));
      if (eCfg && !falhaReal) falhaReal = eCfg.message;

      const vistas = new Set(entradas.map(e => e.chave));
      for (const row of (cfg || [])) {
        const date = row.key.replace('notified_', '');
        let ids = [];
        try { ids = JSON.parse(row.value || '[]'); } catch { ids = []; }
        for (const id of ids) {
          const tpl = templates.find(t => t.id === id);
          // Id que não é desta empresa: a chave `notified_` é global, e era daí
          // que vinham as linhas "Checklist removido" do painel antigo.
          if (!tpl) continue;
          const chave = `${date}|${id}`;
          if (vistas.has(chave)) continue;
          vistas.add(chave);
          entradas.push({
            chave, kind: 'atraso',
            titulo: tpl.name,
            detalhe: [tpl.sector, tpl.deadline && `prazo ${tpl.deadline}`].filter(Boolean).join(' · '),
            unitId: tpl.unitId,
            quando: row.updated_at,
            precisa: false,   // hora aproximada: é o último upsert do dia
          });
        }
      }

      if (falhaReal) { setErro(falhaReal); setLog([]); }
      else {
        entradas.sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
        setLog(entradas);
      }
    } catch (e) {
      setErro(e?.message || 'Não foi possível carregar o histórico.');
    }
    setLoading(false);
  }, [templates, dias, tz]);

  // Carrega junto com o painel: sem isso o cabeçalho não tem como dizer quantas
  // notificações existem, e "não aparece nada" vira dúvida sobre se saiu aviso.
  useEffect(() => { loadLog(); }, [loadLog]);

  const lojaDe = (unitId) => units.find(u => u.id === unitId);
  // `incompleto` nasceu na v11 da notify-overdue. Sem entrada aqui, o histórico
  // mostraria a chave crua ("incompleto") como se fosse rótulo.
  const KIND_LABEL = { atraso: 'Atraso', incompleto: 'Entregue incompleto', cadastro: 'Cadastro' };

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between w-full px-3 py-2"
        style={{ background: 'white', border: `1.5px solid ${C.border}`, borderRadius: 10, cursor: 'pointer' }}
      >
        <div className="flex items-center gap-2">
          <Bell size={15} color={erro ? C.critical : C.muted} />
          <span style={{ fontSize: 13, fontWeight: W.semibold, color: C.ink }}>Histórico de notificações</span>
          {!loading && !erro && (
            <span style={{ fontSize: 11, color: C.muted }}>
              {log.length === 0 ? 'nenhuma em 7 dias' : `${log.length} em 7 dias`}
            </span>
          )}
          {erro && <span style={{ fontSize: 11, color: C.critical, fontWeight: W.semibold }}>erro ao carregar</span>}
        </div>
        <ChevronRight size={15} color={C.muted} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {open && (
        <div className="mt-2 space-y-2" style={{ paddingBottom: 8 }}>
          {loading && <p style={{ fontSize: 13, color: C.muted, padding: '8px 4px' }}>Carregando...</p>}

          {!loading && erro && (
            <div className="px-3 py-2" style={{ background: `${C.critical}0F`, border: `1px solid ${C.critical}55`, borderRadius: 8 }}>
              <p style={{ fontSize: 12, color: C.critical, fontWeight: W.semibold }}>Não foi possível ler o histórico.</p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 2, wordBreak: 'break-word' }}>{erro}</p>
              <button onClick={loadLog} className="mt-2 px-2 py-1"
                style={{ fontSize: 11, fontWeight: W.semibold, color: C.ink, background: 'white', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}>
                Tentar de novo
              </button>
            </div>
          )}

          {!loading && !erro && log.length === 0 && (
            <div style={{ padding: '8px 4px' }}>
              <p style={{ fontSize: 13, color: C.muted }}>Nenhuma notificação enviada nos últimos 7 dias.</p>
              <p style={{ fontSize: 11, color: C.mutedLight, marginTop: 4 }}>
                Entram aqui os avisos de checklist atrasado e as confirmações de cadastro que chegaram a algum aparelho. Sem ninguém com notificação ativa, nada é enviado — e nada aparece.
              </p>
            </div>
          )}

          {!loading && !erro && log.map((entry) => {
            const loja = lojaDe(entry.unitId);
            return (
              <div key={entry.chave} className="flex items-start gap-3 px-3 py-2"
                style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: loja?.color || unit.color, marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="flex items-center justify-between gap-2">
                    <p style={{ fontSize: 12, fontWeight: W.semibold, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.titulo}
                    </p>
                    <span style={{ fontSize: 10, color: C.muted, flexShrink: 0, fontWeight: W.semibold }}>
                      {KIND_LABEL[entry.kind] || entry.kind}{loja ? ` · ${loja.name}` : entry.unitId ? ` · ${entry.unitId}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p style={{ fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.detalhe || '—'}
                    </p>
                    <p style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>
                      {entry.precisa ? '' : '~'}
                      {new Date(entry.quando).toLocaleString('pt-BR', { timeZone: tz, day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                    </p>
                  </div>
                  {entry.delivered != null && entry.targets != null && (
                    <p style={{ fontSize: 10, color: entry.delivered < entry.targets ? C.warning : C.mutedLight, marginTop: 2 }}>
                      {entry.delivered} de {entry.targets} aparelho{entry.targets === 1 ? '' : 's'}
                      {entry.delivered < entry.targets ? ' — o resto não recebeu (inscrição expirada)' : ''}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
