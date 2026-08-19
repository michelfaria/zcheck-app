'use client';

/**
 * Aba PAINEL — a operação inteira numa tela só.
 *
 * Reúne o que antes eram três abas concorrentes (Painel, J.I.T. e Relatórios):
 * elas faziam a MESMA pergunta em três recortes de tempo, e obrigavam a escolher
 * o recorte antes de saber o que se procurava. Ver
 * `docs/PLANO_CONSOLIDACAO_ABAS.md`.
 *
 * Quatro registros, de cima para baixo:
 *
 *   1. AGORA    — o que exige ação neste momento, e a fila de conferência.
 *                 Só MANAGER_ROLES. Colapsa quando a data em foco não é hoje.
 *   2. DIA      — navegável por data: score, ontem/média, por tipo, por setor.
 *   3. REDE     — comparativo entre lojas. Só quem enxerga mais de uma.
 *   4. 7 DIAS   — faixa FIXA, sem seletor e sem gate: aderência e ranking. Os
 *                 dois blocos que o colaborador tem e que por isso não podem
 *                 morar atrás de um controle que ele não recebe (§C.2).
 *   5. PERÍODO  — a faixa com seletor, Exportar e as três lentes. Tudo dentro do
 *                 ÚNICO `{isManager && …}` grande da aba: bloco novo aqui herda
 *                 o gate por construção.
 *
 * A fronteira de acesso é verificada a cada commit por
 * `tests/painel-render.spec.mjs`, bloco a bloco — a restrição dura nº 1 do plano
 * ("a linha do colaborador não muda uma vírgula") deixou de depender de alguém
 * lembrar de conferir com um PIN.
 *
 * REGRA: não pode importar de `app/`.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle, ArrowLeft, Calendar, Camera, CheckCircle2, ChevronRight,
  ClipboardCheck, Download, ThumbsUp, TrendingUp, Trophy,
  // J14 nomeia o item que reincide — o ícone carrega a natureza do alerta.
  AlertOctagon,
} from 'lucide-react';
import { C, R, T, W, successBright } from '../../lib/tokens';
// O dia é sempre o do relógio da LOJA — ver lib/dates.js.
import { todayStr, addDays, lastDays, weekdayOf, tzOf } from '../../lib/dates';
import { latestPerRound, roundProgress } from '../../lib/rounds';
import {
  CHECKLIST_TYPE_ORDER, applicableItems, templateAtiva, templateStatus,
  templateProgress, isUnitClosed, isUnitOff, unitActiveOn,
} from '../../lib/checklists';
import { fmtDataCurta } from '../../lib/format';
import { sectorLabelFor, visibleSectors } from '../../lib/sectors';
import {
  RANKED_ROLES, RANKING_PERIOD_DEFAULT, rankingPeriod, collabIndexSentence,
  computeOperationalProfile,
} from '../../lib/ranking';
import { PERIODS, PUNCTUALITY_PERIODS, PUNCTUALITY_GROUPS } from '../../lib/stats';
import { track } from '../../lib/track';
import { useRelatorio } from './useRelatorio';
import { AgoraFollowUp, AgoraLeitura, AgoraPrioridades, AgoraBase } from './agora';
import { ReportsBody, ConferenceQueue, DisputeCard, useFilaConferencia } from './ReportsView';
import { NotificationHistory } from './NotificationHistory';
import {
  MANAGER_ROLES, ROLE_LABELS, Eyebrow, Ticket, StarRating, Avatar, RatingLabel,
  StatusBadge, RankBadge, PhotoModal, PillButton,
} from './shared';
import { useUnits, useSectors } from './context';

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
function SecaoRede({ units, calcRate, closures, viewDate, today, yesterday, last7, dateLabel, sinaisPorLoja, onNavigate, turnoRate, focoUnitId }) {
  /**
   * Trocar a loja reescreve o topo da página — o score do dia, o "por tipo", o
   * "por setor". No celular isso acontece inteiramente ACIMA da dobra: quem
   * tocou o botão continua olhando os cartões de rede e não vê nada mudar.
   * Subir junto é o que torna a ação perceptível.
   */
  const irParaLoja = id => {
    onNavigate?.(id, 'painel');
    requestAnimationFrame(() => {
      const main = typeof document !== 'undefined' && document.getElementById('zc-main-content');
      if (main && main.scrollHeight > main.clientHeight + 4) main.scrollTo({ top: 0, behavior: 'smooth' });
      else if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  // Menos de duas lojas: a seção inteira some, título incluso (§C.6). Comparar
  // uma loja com ela mesma é um cabeçalho sem conteúdo.
  if ((units || []).length < 2) return null;

  const comEscopo = units.map(u => {
    // `inativa` é separado de `fechada` só para o rótulo: para a CONTA os dois
    // fazem a mesma coisa — a loja sai do ranking em vez de entrar com 0% e
    // puxar a rede para baixo por um dia que ela não operou.
    const inativa = !unitActiveOn(u, viewDate);
    const fechada = inativa || isUnitClosed(closures, u.id, viewDate);
    const rate = fechada ? null : calcRate(viewDate, u.id, u.sectors);
    const last7u = last7.map(d => calcRate(d, u.id, u.sectors));
    const validos = last7u.filter(v => v !== null);
    const avg = validos.length ? Math.round(validos.reduce((a, b) => a + b, 0) / validos.length) : null;
    return { u, fechada, inativa, rate, last7u, avg, trend: rate !== null && avg !== null ? rate - avg : null };
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
        {comEscopo.map(({ u, fechada, inativa, rate, last7u, avg, trend }) => {
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
                    ? <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                        {inativa ? `Ativa a partir de ${fmtDataCurta(u.activeFrom)}` : 'Fechada'}
                      </p>
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

              {/* A afordância de J8: o cartão leva para a loja.
                  A loja que JÁ é o escopo da tela não ganha botão — ele seria um
                  no-op (`setUnitId` para o mesmo id, `setTab` para a aba em que
                  já se está) e um botão que não faz nada lê como quebrado. Foi
                  assim que este botão foi reportado em 11/08. */}
              {u.id === focoUnitId ? (
                <p style={{ marginTop: 10, fontSize: T.label, fontWeight: W.semibold, color: C.mutedLight, textAlign: 'center' }}>
                  loja em foco nesta tela
                </p>
              ) : (
                <button onClick={() => irParaLoja(u.id)}
                  style={{ marginTop: 10, width: '100%', padding: '7px 0', borderRadius: R.sm, border: `1px solid ${C.border}`, background: 'white', color: u.color, fontSize: T.label, fontWeight: W.semibold, cursor: 'pointer' }}>
                  Ver {u.name} →
                </button>
              )}
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

/* ─────────────── Seção 5 — a faixa PERÍODO e o segmento analítico ───────── */

const SEGMENTOS = [
  { id: 'tendencia', label: 'Tendência' },
  { id: 'pessoas',   label: 'Pessoas' },
  { id: 'registros', label: 'Registros' },
];

/**
 * Tudo daqui para baixo está dentro do ÚNICO `{isManager && …}` da aba (§C.3):
 * a faixa de período, o Exportar e os três segmentos. Um bloco novo acrescentado
 * aqui herda o gate por construção — é isso que torna a auditoria de §D.1 barata,
 * porque só o que está ACIMA desta linha precisa ser conferido um a um.
 *
 * O conteúdo dos segmentos é o `ReportsBody`, o MESMO componente que a aba Dados
 * renderiza, recebendo `segment` e `embedded`. Não existe segunda cópia dos
 * blocos analíticos, e por isso não existe o que divergir entre as duas telas.
 */
function SecaoSegmento({ rel, props, userId, jit, units, last7 }) {
  const {
    period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo,
    selectedMonth, setSelectedMonth, exportCSV, exportPDF,
  } = rel;
  const accent = props.unit.color;

  // O segmento aberto sobrevive à sessão: quem confere volta em Registros, quem
  // analisa volta em Tendência (§C.4).
  const chave = `zc_painel_seg_${userId || 'anon'}`;
  const [seg, setSeg] = useState('tendencia');
  useEffect(() => {
    try {
      const v = localStorage.getItem(chave);
      if (v && SEGMENTOS.some(s => s.id === v)) setSeg(v);
    } catch (_) {}
  }, [chave]);
  const trocarSeg = id => {
    setSeg(id);
    try { localStorage.setItem(chave, id); } catch (_) {}
    track('painel_segment_changed', { source: 'painel', metadata: { ui: 2, segment: id } });
  };

  const [exportOpen, setExportOpen] = useState(false);
  const exportar = (fn, formato) => {
    setExportOpen(false);
    track('report_exported', { source: 'painel', metadata: { ui: 2, format: formato, period } });
    fn();
  };

  return (
    <section aria-label="Análise" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
      <div style={{ height: 1, background: C.border }} />

      {/* Faixa PERÍODO + Exportar. O botão saiu do fim da lista paginada de 25
          execuções, onde estava a ~4 telas de rolagem do topo no celular. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select value={period} onChange={e => setPeriod(e.target.value)} aria-label="Período"
          style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink, background: 'white', padding: '8px 10px', border: `1.5px solid ${C.border}`, borderRadius: R.sm, outline: 'none' }}>
          {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>

        {period === 'month' && (
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} aria-label="Mês"
            style={{ fontSize: T.bodySm, color: C.ink, background: 'white', padding: '8px 10px', border: `1.5px solid ${C.border}`, borderRadius: R.sm }} />
        )}
        {period === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} aria-label="De"
              style={{ fontSize: T.bodySm, color: C.ink, background: 'white', padding: '8px 10px', border: `1.5px solid ${C.border}`, borderRadius: R.sm }} />
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} aria-label="Até"
              style={{ fontSize: T.bodySm, color: C.ink, background: 'white', padding: '8px 10px', border: `1.5px solid ${C.border}`, borderRadius: R.sm }} />
          </>
        )}

        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <button onClick={() => setExportOpen(o => !o)} aria-expanded={exportOpen}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: R.sm, border: 'none', background: accent, color: 'white', fontSize: T.bodySm, fontWeight: W.semibold, cursor: 'pointer' }}>
            <Download size={14} aria-hidden /> Exportar
          </button>
          {exportOpen && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 20, background: 'white', border: `1px solid ${C.border}`, borderRadius: R.sm, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden', minWidth: 150 }}>
              <button onClick={() => exportar(exportCSV, 'csv')} style={menuItem}>Excel / CSV</button>
              <button onClick={() => exportar(exportPDF, 'pdf')} style={{ ...menuItem, borderTop: `1px solid ${C.border}` }}>PDF</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {SEGMENTOS.map(s => (
          <PillButton key={s.id} active={seg === s.id} accent={accent} onClick={() => trocarSeg(s.id)}>
            {s.label}
          </PillButton>
        ))}
      </div>

      {/* J6 — o único agregado de pontualidade do app (§B.5: a etiqueta "fora
          do prazo" de R6 é o drill-down, não equivalente: não tem taxa, não
          agrupa e não trata checklist sem prazo). Vinha do J.I.T., que deixou
          de ser aba. */}
      {seg === 'tendencia' && <EntregaNoPrazo jit={jit} />}

      <ReportsBody {...props} rel={rel} segment={seg} embedded />

      {/* J14 — a única lista que NOMEIA o item que reincide. "Críticos
          pendentes" dos StatCards é contagem; isto é o drill-down. */}
      {seg === 'registros' && (jit?.criticalTop || []).length > 0 && (
        <div>
          <Eyebrow>Críticos recorrentes</Eyebrow>
          <p style={{ fontSize: T.caption, color: C.mutedLight, margin: '2px 0 8px' }}>
            pendentes 2× ou mais nos últimos 7 dias
          </p>
          <Ticket accent={C.critical}>
            {jit.criticalTop.map((c, i) => (
              <div key={`${c.unitId}-${i}`} style={{ padding: '8px 0', borderBottom: i < jit.criticalTop.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <AlertOctagon size={14} color={C.critical} aria-hidden style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: T.bodySm, fontWeight: W.medium, color: C.ink }}>{c.text}</span>
                  <span className="font-display" style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: C.critical }}>{c.count}×</span>
                </div>
                <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2, paddingLeft: 22 }}>{c.unitName}</p>
              </div>
            ))}
          </Ticket>
        </div>
      )}

      {/* P13 — a única superfície de `notification_log`. Quem RECEBE o push de
          atraso (gerência e liderança) precisa poder conferir o que saiu; sem
          isto, "não chegou nada" vira dúvida sobre se houve aviso. */}
      {seg === 'registros' && (
        <NotificationHistory templates={props.templates} units={units} last7={last7} unit={props.unit} />
      )}
    </section>
  );
}

/**
 * J6 — "Entrega no prazo". Migrado do J.I.T., que deixou de ser aba.
 *
 * Mede coisa diferente de "Atrasados": aquele conta o que AINDA não foi feito e
 * já venceu; este conta o que FOI feito e a que horas. Guarda o segmento local
 * Hoje/7 dias porque nenhum controle global serve — às 9h da manhã "hoje" ainda
 * não tem os fechamentos da noite, e abrir no recorte que parece ótimo toda
 * manhã seria enganar o gestor na primeira leitura. O padrão é 7 dias.
 */
function EntregaNoPrazo({ jit }) {
  const [periodo, setPeriodo] = useState('last7');
  const [grupo, setGrupo] = useState('loja');
  const pun = jit?.punctuality?.[periodo] || null;
  if (!pun) return null;

  const label = periodo === 'today' ? 'hoje' : 'nos últimos 7 dias';
  // Numa loja só, "por loja" é lista de um item — o recorte que importa ali é o
  // setor, e um seletor com uma opção viável seria ruído.
  const podeAgruparPorLoja = !jit.scopeUnitId && (pun.byUnit || []).length > 1;
  const grupoEf = podeAgruparPorLoja ? grupo : 'setor';
  const grupos = (grupoEf === 'loja' ? pun.byUnit : pun.bySector) || [];
  // 90/70: mais duro que o corte de aderência (80/50) de propósito — "quase
  // sempre no horário" não é o mesmo padrão que "quase tudo feito".
  const tom = r => (r >= 90 ? C.success : r >= 70 ? C.warning : C.critical);
  const barra = r => (r >= 90 ? successBright : r >= 70 ? C.warning : C.critical);
  const pill = ativo => ({
    padding: '4px 10px', borderRadius: R.pill, cursor: 'pointer',
    border: `1px solid ${ativo ? C.ink : C.border}`,
    background: ativo ? C.ink : 'white', color: ativo ? 'white' : C.muted,
    fontSize: T.label, fontWeight: W.semibold, whiteSpace: 'nowrap',
  });

  return (
    <div style={{ background: 'white', borderRadius: 14, border: `1px solid ${C.border}`, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Entrega no prazo
        </p>
        <div role="group" aria-label="Período" style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {PUNCTUALITY_PERIODS.map(p => (
            <button key={p.id} type="button" aria-pressed={periodo === p.id}
              onClick={() => setPeriodo(p.id)} style={pill(periodo === p.id)}>{p.label}</button>
          ))}
        </div>
      </div>

      {pun.total === 0 ? (
        <p style={{ fontSize: T.bodySm, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
          {pun.noDeadline > 0
            ? `Nenhum checklist COM prazo foi concluído ${label}. Os ${pun.noDeadline} concluídos não têm horário definido — dê um prazo ao checklist em Gerenciar para acompanhar pontualidade.`
            : `Nenhum checklist concluído ${label}.`}
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
            <p className="font-display" style={{ marginLeft: 'auto', fontSize: 20, fontWeight: W.bold, color: tom(pun.rate) }}>{pun.rate}%</p>
          </div>
          <div role="img" aria-label={`${pun.onTime} de ${pun.total} checklists concluídos no prazo (${pun.rate}%)`}
            style={{ display: 'flex', height: 8, borderRadius: R.pill, overflow: 'hidden', background: C.bg, marginTop: 10 }}>
            <div style={{ width: `${pun.rate}%`, background: successBright }} />
            <div style={{ flex: 1, background: C.critical }} />
          </div>

          {grupos.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                <p style={{ fontSize: T.label, color: C.mutedLight, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Por {grupoEf}
                </p>
                {podeAgruparPorLoja && (
                  <div role="group" aria-label="Agrupar por" style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                    {PUNCTUALITY_GROUPS.map(g => (
                      <button key={g.id} type="button" aria-pressed={grupoEf === g.id}
                        onClick={() => setGrupo(g.id)} style={pill(grupoEf === g.id)}>{g.label}</button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 4 }}>
                {grupos.slice(0, 6).map(g => (
                  <div key={g.key} style={{ padding: '8px 0', borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: T.bodySm, fontWeight: W.medium, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
                      <span className="font-display" style={{ flexShrink: 0, fontSize: T.bodySm, fontWeight: W.semibold, color: tom(g.rate) }}>{g.rate}%</span>
                    </div>
                    <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>{g.onTime} no prazo · {g.late} fora do prazo</p>
                    <div style={{ height: 5, borderRadius: R.pill, background: C.bg, marginTop: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.max(2, g.rate)}%`, background: barra(g.rate), borderRadius: R.pill }} />
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
  );
}

const menuItem = {
  display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
  background: 'white', border: 'none', cursor: 'pointer',
  fontSize: T.bodySm, fontWeight: W.semibold, color: C.ink,
};

/* ──────────────────────────── A aba consolidada ─────────────────────────── */

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/**
 * A aba, e a decisão de QUEM paga o motor analítico.
 *
 * `useRelatorio` deriva `filtered`, `summary`, `groups`, `collaborators` e a
 * produtividade da empresa inteira. Hook não pode ser condicional, então
 * chamá-lo no corpo da aba fazia esse cálculo rodar a cada render **para todo
 * papel** — inclusive para o colaborador, que não vê um único número dele. Não
 * era vazamento (nada renderiza fora do gate, e `tests/painel-render.spec.mjs`
 * prova isso a cada commit); era conta paga no aparelho de quem não pediu, e o
 * custo cresce com o tamanho do tenant.
 *
 * A regra "hook não pode ser condicional" vale DENTRO de um componente. Um
 * componente inteiro pode ser renderizado condicionalmente — e é isso aqui: o
 * hook mudou de endereço para um componente que só monta para MANAGER_ROLES.
 * Para o colaborador, `rel` chega `null` e nenhum dos dois consumidores existe.
 */
export function PainelConsolidado(props) {
  return MANAGER_ROLES.includes(props.currentUser?.role)
    ? <PainelComRelatorio {...props} />
    : <PainelCorpo {...props} rel={null} relProps={null} />;
}

/** Só monta para gestão — é aqui, e só aqui, que o motor analítico roda. */
function PainelComRelatorio(props) {
  const {
    unit, templates, completions, closures, users, canSeeAllUnits,
    allUnitsSelected = false, currentUser, onReview, disputes = [], onResolveDispute,
    activeTypes = CHECKLIST_TYPE_ORDER,
  } = props;
  const relProps = {
    unit, templates, completions, closures, users, canSeeAllUnits,
    allUnitsSelected, currentUser, onReview, disputes, onResolveDispute, activeTypes,
  };
  const rel = useRelatorio(relProps);
  return <PainelCorpo {...props} rel={rel} relProps={relProps} />;
}

function PainelCorpo({
  unit, templates, completions, closures, canSeeAllUnits, currentUser, users,
  activeTypes = CHECKLIST_TYPE_ORDER,
  // Registro AGORA — tudo vem do mesmo `buildJit` que alimenta a aba J.I.T.
  jit, actionPlans, plansLoaded, onCreatePlan, onCompletePlan, onNavigate,
  // Segmento analítico — os mesmos contratos que a aba Dados recebe hoje.
  allUnitsSelected = false, onReview, disputes = [], onResolveDispute,
  // Vêm de `PainelComRelatorio`; `null` para quem não é gestão.
  rel, relProps,
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
   * Veio da `PainelView` (removida na Fase 6), já com a correção da Fase 2 (usa
   * `roundProgress` em vez de varrer `completions` com `.find()`, que lia a
   * PRIMEIRA submissão da rodada e deixava reexecução fora da conta). Fica
   * duplicada aqui pelo mesmo motivo dos blocos do AGORA: a Fase 3 não toca em
   * `PainelView`, que continua servindo a aba viva. A Fase 5 apaga o original.
   */
  const calcRate = (date, unitId, filterSectors) => {
    // `null` = dia sem taxa, não dia com 0%. É o que tira o dia da faixa de 7d e
    // da média — vale para folga e, desde 15/08/2026, para o período anterior à
    // ativação da loja. Sem isso a estreia vinha com uma semana de zeros atrás.
    if (isUnitOff(units, closures, unitId, date)) return null;
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
  // ranking da antiga `PainelView`: §B.7 registra que a `main` já resolveu esta
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
    if (isUnitOff(units, closures, u.id, viewDate)) return null;
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
      if (s.naoAtivaAinda) partes.push('ainda não ativa');
      else if (s.closedToday) partes.push('fechada hoje');
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

  const diaInativo = !unitActiveOn(unit, viewDate);
  const diaFechado = diaInativo || isUnitClosed(closures, unit.id, viewDate);

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

      {/* ═══ 1b · CONFERÊNCIA — a fila de trabalho de quem confere ═══════════
          Logo abaixo do AGORA e ANTES do dia: é a única coisa desta tela em que
          alguém está esperando resposta. Não depende da data do navegador. */}
      {isManager && rel?.canReview && (
        <SecaoConferencia
          rel={rel} templates={templates} units={units} accent={unit.color}
          completions={completions} disputes={disputes} onResolveDispute={onResolveDispute}
        />
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
            <p style={{ fontSize: 14, fontWeight: W.semibold, color: C.muted }}>
              {diaInativo
                ? `Loja ativa a partir de ${fmtDataCurta(unit.activeFrom)} — antes disso nada é cobrado.`
                : 'Loja fechada — nenhum checklist necessário.'}
            </p>
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
                {/* "Feito do previsto" (Conjunto A, §B.6): é o que este número
                    sempre mediu — tarefas feitas ÷ tarefas PREVISTAS. Sem o
                    rótulo, ele ficava a uma rolagem do "Feito do entregue" dos
                    StatCards, que quase sempre marca ~100%, e os dois pareciam
                    se contradizer. */}
                {rateToday !== null && (
                  <p style={{ fontSize: 11, fontWeight: W.semibold, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 6 }}>
                    Feito do previsto
                  </p>
                )}
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
              /* Com "Todas" no cabeçalho nenhuma loja é o foco, e todas as
                 lojas ganham botão. */
              focoUnitId={allUnitsSelected ? null : unit.id}
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

      {/* ═══ 5 · SEGMENTO ANALÍTICO ═══════════════════════════════════════
          O único `isManager` de bloco grande da aba. Ver §C.3: a fronteira de
          acesso é uma linha só, e tudo daqui para baixo está dentro dela. */}
      {isManager && (
        <SecaoSegmento rel={rel} props={relProps} userId={currentUser?.id} jit={jit} units={units} last7={last7} />
      )}

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
      // O "visto do dia" do briefing é carimbado AQUI, e não no efeito de
      // auto-abertura (§F.1): o briefing foi visto quando esta seção renderizou,
      // não quando a aba por acaso era 'painel' com os dados ainda chegando.
      // Sem isso, quem lê o briefing rolando o Painel recebe o pop-up de novo no
      // login seguinte — e é assim que se treina alguém a fechar no reflexo.
      localStorage.setItem(`zc_jit_seen_${currentUser.id}_${jitDate}`, '1');
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

/* ───────────────────────── Seção CONFERÊNCIA ────────────────────────────── */

/**
 * A fila de Conferir, como SEÇÃO PRÓPRIA — e não como o último bloco do AGORA.
 *
 * Mudança de arquitetura que §C não previu e §B.7 descobriu: conferir é fila
 * de TRABALHO, não análise. Alguém está esperando resposta. Na aba Dados ela
 * vive atrás do seletor Conferir/Análise; aqui ela ficava no fim do AGORA,
 * depois de follow-up, leitura, prioridades e base — comprimida entre blocos de
 * leitura, sem cabeçalho, sem contagem, e a linha era um chevron cinza que
 * ninguém lia como "aprove aqui" (pedido de 18/08/2026).
 *
 * O que muda: (1) cartão com borda na cor da loja e um número grande — quantas
 * rodadas esperam — que se lê antes de qualquer rolagem; (2) "Conferir próxima"
 * abre direto a mais urgente, para trabalhar a fila sem procurar; (3) as
 * justificativas abertas continuam PRIMEIRO, porque nelas alguém está bloqueado
 * esperando; (4) a seção não colapsa ao navegar para outro dia — a fila é do
 * período (últimos 7 dias por padrão), não do dia do navegador.
 *
 * Gate: `canReview`, que o motor já calcula com MANAGER_ROLES. O portão de
 * verdade continua sendo a RPC `review_completion`, que confere o papel pelo
 * token. Só monta dentro do `{isManager && …}` do corpo — para colaborador
 * `rel` é `null` e nada aqui existe.
 */
function SecaoConferencia({ rel, templates, units, accent, completions, disputes, onResolveDispute }) {
  const { totalPendente, pedindoAtencao, proxima, conferidas } = useFilaConferencia(rel.filtered, templates, units);
  const abertas = (disputes || []).filter(d => d.status === 'aberta');
  const tudoEmDia = totalPendente === 0 && abertas.length === 0;
  // "7 dias" vira "últimos 7 dias"; "Hoje", "Tudo" e mês ficam como estão.
  const periodo = /^\d+ dias$/.test(rel.periodLabel || '')
    ? `últimos ${rel.periodLabel}`
    : (rel.periodLabel || '').toLowerCase();

  return (
    <section aria-label="Conferência de checklists"
      style={{
        background: 'white', borderRadius: 14,
        border: `1px solid ${tudoEmDia ? C.border : `${accent}55`}`,
        borderTop: `4px solid ${tudoEmDia ? C.success : accent}`,
        padding: '14px 14px 6px',
      }}>
      {/* Cabeçalho: o número, o que ele significa, e a ação. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ fontSize: 11, fontWeight: W.semibold, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClipboardCheck size={14} aria-hidden /> Conferência de checklists
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span className="font-display" style={{ fontSize: 'calc(34px * var(--zc-t-scale))', fontWeight: W.bold, lineHeight: 1, color: tudoEmDia ? C.success : C.ink }}>
              {totalPendente}
            </span>
            <span style={{ fontSize: T.body, fontWeight: W.semibold, color: C.ink }}>
              {totalPendente === 1 ? 'rodada aguardando você' : 'rodadas aguardando você'}
            </span>
          </div>
          <p style={{ fontSize: T.caption, color: C.muted, marginTop: 4 }}>
            {tudoEmDia
              ? `Tudo conferido${periodo ? ` — ${periodo}` : ''}.${conferidas.length ? ` ${conferidas.length} ${conferidas.length === 1 ? 'conferida' : 'conferidas'} no período.` : ''}`
              : <>
                  {pedindoAtencao > 0
                    ? <span style={{ color: C.warning, fontWeight: W.semibold }}>{pedindoAtencao} pedindo atenção</span>
                    : <span style={{ color: C.success, fontWeight: W.semibold }}>nenhuma com sinal de problema</span>}
                  {abertas.length > 0 && (
                    <> · <span style={{ color: C.critical, fontWeight: W.semibold }}>{abertas.length} {abertas.length === 1 ? 'justificativa aberta' : 'justificativas abertas'}</span></>
                  )}
                  {periodo ? ` · ${periodo}` : ''}
                </>}
          </p>
        </div>

        {proxima && (
          <button onClick={() => rel.setReviewing(proxima)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: R.sm, border: 'none', background: accent, color: 'white', fontSize: T.bodySm, fontWeight: W.semibold, cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'center' }}>
            Conferir próxima <ChevronRight size={16} aria-hidden />
          </button>
        )}
      </div>

      {/* Em dia e sem histórico no período, o cabeçalho já disse tudo — o
          "Nada para conferir" da fila seria a mesma frase duas vezes. */}
      {(!tudoEmDia || conferidas.length > 0) && (
        <>
          <div style={{ height: 1, background: C.border, margin: '12px 0' }} />

          {/* Justificativas primeiro: é a única coisa aqui em que outra pessoa
              está bloqueada esperando por uma resposta. */}
          {abertas.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Eyebrow>Justificativas aguardando você</Eyebrow>
              <div className="space-y-2" style={{ marginTop: 8 }}>
                {abertas.map(d => (
                  <DisputeCard key={`${d.completionId}|${d.itemId}`} dispute={d} accent={accent}
                    completions={completions} onResolve={onResolveDispute} />
                ))}
              </div>
            </div>
          )}

          <ConferenceQueue
            completions={rel.filtered} templates={templates} units={units}
            accent={accent} onOpen={c => rel.setReviewing(c)}
          />
        </>
      )}
      {tudoEmDia && conferidas.length === 0 && <div style={{ height: 8 }} />}
    </section>
  );
}
