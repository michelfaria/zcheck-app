'use client';

/**
 * Aba RELATÓRIOS (rotulada "Dados" na barra inferior) — o histórico, a
 * produtividade, a exportação em PDF e a fila de conferência.
 *
 * Movida de `app/app/page.js` na Fase 1b da consolidação de abas. Nenhuma linha
 * de lógica mudou: só endereço e os imports do que antes era escopo de módulo
 * compartilhado. Ver `docs/PLANO_CONSOLIDACAO_ABAS.md`.
 *
 * REGRA: não pode importar de `app/`.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle, Camera, CheckCheck, CheckCircle2, ChevronRight, Circle,
  ClipboardCheck, Download, Printer, X,
} from 'lucide-react';
import { C, R, T, W } from '../../lib/tokens';
// O dia é sempre o do relógio da LOJA — ver lib/dates.js.
import { todayStr, tzOf, weekdayOf } from '../../lib/dates';
import { latestPerRound, roundKey } from '../../lib/rounds';
import {
  CHECKLIST_TYPE_ORDER, completionOnTime, deadlineIndex, isUnitClosed,
} from '../../lib/checklists';
import {
  PERIODS, periodDates, filterCompletions, countApplicableTemplatesOnDate,
  summarizeCompletions, collaboratorStats, groupStats, computeProductivity,
} from '../../lib/stats';
import { classificarRodada, agruparPorChecklist } from '../../lib/conferencia';
import { truncName } from '../../lib/format';
import {
  MANAGER_ROLES, Eyebrow, Ticket, EmptyState, PillButton, StatCard, RateBar,
  PhotoModal,
} from './shared';
import { useUnits } from './context';

/* --- peças privadas desta aba: vieram junto de page.js --- */




const formatDateTime = iso => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

// Linha do comparativo de produtividade. A barra vai até 150 de score, com a
// marca vertical em 100 (média da empresa) como referência visual.
function ProdRow({ entry, accent }) {
  const score = entry.score;
  const color = score == null ? C.muted : score >= 110 ? C.success : score >= 90 ? accent : score >= 70 ? C.warning : C.critical;
  const barPct = score == null ? 0 : Math.min(score, 150) / 1.5;
  return (
    <Ticket accent={color}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</p>
        <p className="font-display" style={{ fontWeight: W.semibold, color, flexShrink: 0 }}>
          {score == null ? 'sem ritmo' : score}
        </p>
      </div>
      <div style={{ position: 'relative', width: '100%', height: 6, background: C.border, borderRadius: 999, overflow: 'hidden', marginTop: 6 }}>
        <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 999 }} />
        <div style={{ position: 'absolute', left: `${100 / 1.5}%`, top: 0, bottom: 0, width: 2, background: C.ink, opacity: 0.35 }} />
      </div>
      <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
        {entry.rate != null ? `${entry.rate.toFixed(1)} pts/h · ` : ''}
        {Math.round(entry.points)} ponto{Math.round(entry.points) !== 1 ? 's' : ''} · {entry.tasks} tarefa{entry.tasks !== 1 ? 's' : ''}
        {entry.criticals > 0 && ` (${entry.criticals} crítica${entry.criticals > 1 ? 's' : ''})`}
        {entry.fullChecklists >= 0.5 && ` · ${Math.round(entry.fullChecklists)} checklist${Math.round(entry.fullChecklists) !== 1 ? 's' : ''} 100%`}
      </p>
    </Ticket>
  );
}

// Paginação das execuções no Relatórios. 25 por página: cabe numa tela de
// desktop sem rolar e ainda é uma leitura razoável no celular.
const EXEC_PAGE_SIZE = 25;

// Os selos de uma rodada, na ordem de gravidade. Um só é escolhido para a
// linha: empilhar quatro etiquetas numa lista de conferência vira ruído.
const SELOS = [
  ['criticoPendente', 'Crítico não executado', C.critical],
  ['semFoto', 'Faltou foto', C.warning],
  ['foraDoPrazo', 'Fora do prazo', C.warning],
  ['incompleta', 'Incompleta', C.warning],
  ['notaOperador', 'Tem observação', C.ink],
];
const seloDe = f => SELOS.find(([k]) => f[k]);

/**
 * FILA DE CONFERÊNCIA agrupada por checklist × setor.
 *
 * O eixo é o CHECKLIST porque é onde a repetição mora e onde o julgamento é o
 * mesmo julgamento: o critério de "Fechamento Cozinha bem-feito" não muda entre
 * segunda e domingo. Agrupar por dia repetiria o eixo do Painel; por loja não
 * ajuda quem só tem uma.
 *
 * DUAS FAIXAS, e a divisão é deliberada: agrupamento é bom para repetição e
 * ruim para exceção. Um crítico não executado é único — enterrá-lo dentro de um
 * grupo de 21 rodadas seria usar a ferramenta errada. Por isso as piores
 * rodadas saem do agrupamento e viram uma lista plana em cima.
 *
 * SEM APROVAÇÃO EM LOTE, e isso é decisão de produto, não falta de tempo: a
 * cobertura da conferência já é 100%. Lote otimizaria a única coisa que já
 * funciona e transformaria os 30% de "conferidos" do índice da liderança em
 * velocidade de clique.
 */
function ConferenceQueue({ completions, templates, units, accent, onOpen }) {
  const [verConferidas, setVerConferidas] = useState(false);
  const [verLimpas, setVerLimpas] = useState(false);

  const { destaques, grupos, conferidas, limpas } = useMemo(() => {
    const deadlines = deadlineIndex(templates || []);
    const itensDe = c => ((templates || []).find(t => t.id === c.templateId)?.items) || [];
    // `foraDoPrazo` é resolvido AQUI e entregue pronto: a régua de prazo é uma
    // só no app (`completionOnTime`, que usa o fuso da loja), e duplicá-la
    // dentro da lib criaria a segunda.
    const analisadas = (completions || []).map(c => ({
      c,
      f: classificarRodada(c, itensDe(c), completionOnTime(c, templates || [], deadlines, units) === false),
    }));

    const pendentes = analisadas.filter(x => !x.c.reviewedAt);
    const conferidas = analisadas.filter(x => x.c.reviewedAt);

    // Faixa 1 — as rodadas que não podem esperar a fila: crítico não executado.
    // Teto de 6 porque uma lista de exceções longa deixa de ser exceção.
    const destaques = pendentes
      .filter(x => x.f.criticoPendente)
      .sort((a, b) => (a.c.date || '').localeCompare(b.c.date || ''))
      .slice(0, 6);
    const idsDestaque = new Set(destaques.map(x => x.c.id));

    // Faixa 2 — o resto, agrupado por checklist × setor (ver lib/conferencia).
    const grupos = agruparPorChecklist(
      pendentes.filter(x => !idsDestaque.has(x.c.id)),
      c => (templates || []).find(t => t.id === c.templateId)?.deadline || null,
    );

    const comSinal = grupos.filter(g => g.gravidade > 0);
    const semSinal = grupos.filter(g => g.gravidade === 0);

    return { destaques, grupos: comSinal, conferidas, limpas: semSinal };
  }, [completions, templates, units]);

  const totalPendente = destaques.length
    + grupos.reduce((n, g) => n + g.rodadas.length, 0)
    + limpas.reduce((n, g) => n + g.rodadas.length, 0);

  if (!totalPendente && !conferidas.length) {
    return <EmptyState title="Nada para conferir" desc="Nenhuma execução no período com os filtros atuais." />;
  }

  const Linha = ({ x, mostrarChecklist }) => {
    const selo = seloDe(x.f);
    return (
      <button onClick={() => onOpen(x.c)}
        aria-label={`Conferir ${x.c.templateName} de ${x.c.date}`}
        style={{
          width: '100%', textAlign: 'left', background: 'white', border: `1px solid ${C.border}`,
          borderRadius: R.sm, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12.5, color: C.ink, fontWeight: W.semibold }}>
            {mostrarChecklist ? `${x.c.templateName} · ` : ''}
            {new Date(`${x.c.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            <span style={{ fontWeight: 400, color: C.muted }}> · {x.c.operatorName}</span>
          </p>
          {selo && (
            <span style={{
              display: 'inline-block', marginTop: 3, fontSize: 9.5, fontWeight: W.semibold,
              textTransform: 'uppercase', letterSpacing: '0.06em',
              color: selo[2], background: `${selo[2]}14`, border: `1px solid ${selo[2]}44`,
              borderRadius: R.pill, padding: '1px 6px',
            }}>{selo[1]}</span>
          )}
        </div>
        <ChevronRight size={16} color={C.mutedLight} style={{ flexShrink: 0 }} />
      </button>
    );
  };

  const Grupo = ({ g }) => {
    const [aberto, setAberto] = useState(false);
    const cor = g.rodadas.some(x => x.f.criticoPendente) ? C.critical
      : g.gravidade > 0 ? C.warning : accent;
    return (
      <div style={{ background: 'white', border: `1px solid ${C.border}`, borderLeft: `3px solid ${cor}`, borderRadius: R.sm, marginBottom: 8 }}>
        <button onClick={() => setAberto(v => !v)} aria-expanded={aberto}
          style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-display" style={{ fontSize: 'calc(15px * var(--zc-t-scale))', fontWeight: W.semibold, color: C.ink }}>
              {g.titulo}
            </p>
            <p style={{ fontSize: T.label, color: C.mutedLight, marginTop: 2 }}>
              {g.setor}{g.prazo ? ` · prazo ${g.prazo}` : ' · sem prazo'}
            </p>
            <p style={{ fontSize: T.caption, color: C.muted, marginTop: 4 }}>
              {g.rodadas.length} {g.rodadas.length === 1 ? 'rodada' : 'rodadas'}
              {g.limpas > 0 && ` · ${g.limpas} sem sinal de problema`}
              {g.rodadas.length - g.limpas > 0 && (
                <span style={{ color: cor, fontWeight: W.semibold }}>
                  {' · '}{g.rodadas.length - g.limpas} pedindo atenção
                </span>
              )}
            </p>
            {/* A faixa de dias devolve a leitura temporal que o agrupamento
                destrói: "falhou quatro sextas seguidas" é invisível numa
                contagem, e óbvio numa fileira. */}
            <div style={{ display: 'flex', gap: 3, marginTop: 6, flexWrap: 'wrap' }}>
              {g.rodadas.slice(0, 21).map(x => (
                <span key={x.c.id} title={`${x.c.date}${seloDe(x.f) ? ' · ' + seloDe(x.f)[1] : ''}`}
                  aria-hidden="true"
                  style={{
                    width: 8, height: 8, borderRadius: 2,
                    background: x.f.criticoPendente ? C.critical : x.f.limpa ? C.success : C.warning,
                  }} />
              ))}
            </div>
          </div>
          <ChevronRight size={18} color={C.mutedLight}
            style={{ flexShrink: 0, transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {aberto && (
          <div className="space-y-1.5" style={{ padding: '0 12px 12px' }}>
            {g.rodadas.map(x => <Linha key={x.c.id} x={x} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {destaques.length > 0 && (
        <>
          <Eyebrow>Precisa de você</Eyebrow>
          <p style={{ fontSize: T.label, color: C.mutedLight, margin: '2px 0 8px' }}>
            Rodadas com item crítico não executado — fora do agrupamento de propósito.
          </p>
          <div className="space-y-1.5" style={{ marginBottom: 16 }}>
            {destaques.map(x => <Linha key={x.c.id} x={x} mostrarChecklist />)}
          </div>
        </>
      )}

      {grupos.length > 0 && (
        <>
          <Eyebrow>Fila por checklist</Eyebrow>
          <p style={{ fontSize: T.label, color: C.mutedLight, margin: '2px 0 8px' }}>
            Ordenada por gravidade, não por quantidade.
          </p>
          <div style={{ marginBottom: 16 }}>
            {grupos.map(g => <Grupo key={g.key} g={g} />)}
          </div>
        </>
      )}

      {limpas.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setVerLimpas(v => !v)} aria-expanded={verLimpas}
            style={{ background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: T.caption, color: C.muted, fontWeight: W.semibold }}>
            {verLimpas ? '▾' : '▸'} Sem sinal de problema ({limpas.reduce((n, g) => n + g.rodadas.length, 0)})
          </button>
          {verLimpas && limpas.map(g => <Grupo key={g.key} g={g} />)}
        </div>
      )}

      {conferidas.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setVerConferidas(v => !v)} aria-expanded={verConferidas}
            style={{ background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', fontFamily: 'inherit', fontSize: T.caption, color: C.muted, fontWeight: W.semibold }}>
            {verConferidas ? '▾' : '▸'} Já conferidas ({conferidas.length})
          </button>
          {verConferidas && (
            <div className="space-y-1.5" style={{ marginTop: 6 }}>
              {conferidas
                .sort((a, b) => (b.c.reviewedAt || '').localeCompare(a.c.reviewedAt || ''))
                .slice(0, 40)
                .map(x => (
                  <button key={x.c.id} onClick={() => onOpen(x.c)}
                    style={{ width: '100%', textAlign: 'left', background: `${C.success}08`, border: `1px solid ${C.success}33`, borderRadius: R.sm, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    <p style={{ fontSize: 12, color: C.ink }}>
                      {x.c.templateName} · {new Date(`${x.c.date}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      <span style={{ color: C.muted }}> · {x.c.operatorName}</span>
                    </p>
                    <p style={{ fontSize: T.label, color: C.success, fontWeight: W.semibold, marginTop: 1 }}>
                      Conferido por {x.c.reviewedByName || '—'}
                    </p>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
const execPagerBtn = {
  width: 30, height: 30, borderRadius: R.sm, border: `1px solid ${C.borderStrong}`,
  background: 'white', color: C.ink, fontSize: T.bodyLg, lineHeight: 1,
  display: 'grid', placeItems: 'center', fontFamily: 'inherit',
};

/**
 * Conferência de uma execução pela liderança.
 *
 * O que ela mostra antes de pedir o clique: quanto foi concluído, quantos
 * críticos ficaram pendentes e se veio no prazo. Conferir sem esses três
 * números seria carimbo, não revisão — e a nota da liderança (30% do índice)
 * ficaria valendo pelo clique, não pela leitura.
 */
const VERDICTS = [
  { id: 'aprovado',  label: 'Aprovar',  curto: 'Aprovado',  cor: C.success,  Icon: CheckCircle2 },
  { id: 'ressalva',  label: 'Ressalva', curto: 'Ressalva',  cor: C.warning,  Icon: AlertTriangle },
  { id: 'reprovado', label: 'Reprovar', curto: 'Reprovado', cor: C.critical, Icon: X },
];

/**
 * Uma justificativa esperando resposta.
 *
 * As duas saídas são deliberadamente simétricas em custo: MANTER pede um
 * motivo (quem foi avaliado escreveu o dele; receber "mantido" e mais nada é a
 * mesma mudez que a conferência acabou de deixar de ter), e DAR RAZÃO exige
 * escolher o veredito novo na mesma ação — a RPC corrige tudo numa transação,
 * porque "revista, mas continua reprovado" é indefensável para quem justificou.
 */
function DisputeCard({ dispute: d, accent, completions, onResolve }) {
  const [modo, setModo] = useState(null);        // 'mantida' | 'revista'
  const [nota, setNota] = useState('');
  const [novoVeredito, setNovoVeredito] = useState('aprovado');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  // O texto da tarefa vive na execução, não na justificativa: guardá-lo lá
  // duplicaria um dado que já muda de lugar (o item pode ser reescrito no
  // template). Sem a execução em mãos, mostra o id — feio, nunca invisível.
  const exec = (completions || []).find(c => c.id === d.completionId);
  const item = (exec?.items || []).find(i => i.id === d.itemId);
  const texto = item?.text || `Tarefa ${d.itemId}`;
  const VERD = { reprovado: 'Reprovada', ressalva: 'Com ressalva' };

  const responder = async () => {
    if (!nota.trim()) { setErro('Escreva a resposta — quem justificou escreveu a dele.'); return; }
    setBusy(true); setErro('');
    const ok = await onResolve(d.completionId, d.itemId, modo, nota.trim(), modo === 'revista' ? novoVeredito : null);
    setBusy(false);
    if (!ok) setErro('Não foi possível salvar. Verifique a conexão e tente de novo.');
  };

  return (
    <div className="px-3 py-3" style={{ background: 'white', border: `1px solid ${C.warning}55`, borderLeft: `3px solid ${C.warning}`, borderRadius: R.sm }}>
      <div className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
        <span style={{ fontWeight: W.semibold, color: C.ink }}>{d.raisedByName || d.raisedBy}</span>
        <span className="font-mono-ibr" style={{ color: C.muted, flexShrink: 0 }}>
          {new Date(d.raisedAt).toLocaleDateString('pt-BR')}
        </span>
      </div>
      <p style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>{texto}</p>
      <p style={{ fontSize: 11, color: C.critical, fontWeight: W.semibold, marginTop: 1 }}>
        {VERD[d.disputedVerdict] || d.disputedVerdict}
        {exec?.templateName ? ` · ${exec.templateName}` : ''}
      </p>
      <p style={{ fontSize: 13, color: C.ink, fontStyle: 'italic', marginTop: 8, lineHeight: 1.5 }}>“{d.reason}”</p>

      {!modo ? (
        <div className="flex gap-2" style={{ marginTop: 10 }}>
          <button onClick={() => { setModo('revista'); setErro(''); }} className="flex-1 py-2"
            style={{ borderRadius: 8, background: `${C.success}12`, color: C.success, fontWeight: W.semibold, fontSize: 12.5, border: `1px solid ${C.success}55`, cursor: 'pointer' }}>
            Tem razão
          </button>
          <button onClick={() => { setModo('mantida'); setErro(''); }} className="flex-1 py-2"
            style={{ borderRadius: 8, background: 'none', color: C.muted, fontWeight: W.semibold, fontSize: 12.5, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
            Mantenho
          </button>
        </div>
      ) : (
        <div style={{ marginTop: 10 }}>
          {modo === 'revista' && (
            <div className="flex flex-wrap gap-1" style={{ marginBottom: 8 }}>
              {VERDICTS.map(v => (
                <button key={v.id} onClick={() => setNovoVeredito(v.id)} aria-pressed={novoVeredito === v.id}
                  style={{
                    fontSize: 11, fontWeight: W.semibold,
                    color: novoVeredito === v.id ? 'white' : v.cor,
                    background: novoVeredito === v.id ? v.cor : `${v.cor}10`,
                    border: `1px solid ${novoVeredito === v.id ? v.cor : `${v.cor}55`}`,
                    borderRadius: R.pill, padding: '3px 10px', cursor: 'pointer',
                  }}>
                  {v.curto}
                </button>
              ))}
            </div>
          )}
          <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} disabled={busy}
            aria-label="Resposta à justificativa"
            placeholder={modo === 'revista' ? 'O que você reviu, e por quê?' : 'Por que a avaliação se mantém?'}
            style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', color: C.ink, resize: 'vertical' }} />
          {erro && <p role="alert" style={{ fontSize: 12, color: C.critical, marginTop: 6 }}>{erro}</p>}
          <div className="flex gap-2" style={{ marginTop: 8 }}>
            <button onClick={responder} disabled={busy} className="flex-1 py-2"
              style={{ borderRadius: 8, background: accent, color: 'white', fontWeight: W.semibold, fontSize: 12.5, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
              {busy ? 'Salvando…' : 'Responder'}
            </button>
            <button onClick={() => { setModo(null); setErro(''); }} disabled={busy} className="py-2 px-3"
              style={{ borderRadius: 8, background: 'none', color: C.muted, fontWeight: W.semibold, fontSize: 12.5, border: `1px solid ${C.border}`, cursor: 'pointer' }}>
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewModal({ completion: c, templates, accent, onClose, onReview, onOpenPhoto }) {
  const units = useUnits(); // o prazo é o do relógio da loja que executou
  const [note, setNote] = useState(c.reviewNote || '');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');
  const [soPendencias, setSoPendencias] = useState(false);
  // Segundo passo da confirmação, quando há apontamento sem motivo. Ver `commit`.
  const [confirmandoMudo, setConfirmandoMudo] = useState(false);
  const jaConferido = !!c.reviewedAt;
  const noPrazo = completionOnTime(c, templates, null, units);

  /**
   * Veredito por tarefa: { [itemId]: { verdict, note } }.
   *
   * Começa do que já foi conferido antes (reconferência preserva) e, para o
   * resto, PRÉ-MARCA "aprovado" nas tarefas concluídas. Exigir 40 cliques para
   * confirmar o que já está certo transformaria a conferência num imposto — o
   * trabalho da liderança é apontar o que destoa, e é isso que fica sem
   * default. Tarefa não executada não recebe pré-marcação: julgar ausência é
   * decisão de quem confere, não do formulário.
   */
  const [vereditos, setVereditos] = useState(() => {
    const inicial = {};
    (c.items || []).forEach(i => {
      if (i.review?.verdict) inicial[i.id] = { verdict: i.review.verdict, note: i.review.note || '' };
      else if (i.done) inicial[i.id] = { verdict: 'aprovado', note: '' };
    });
    return inicial;
  });
  /**
   * Itens com a caixa de motivo aberta — um CONJUNTO, não um id só.
   *
   * Era um id único, e isso sabotava o pedido de motivo: abrir a caixa da
   * segunda ressalva fechava a da primeira, que ainda estava vazia. Quem
   * apontasse três coisas seguidas terminaria com uma caixa aberta e duas que
   * piscaram e sumiram.
   */
  const [notasAbertas, setNotasAbertas] = useState(() => new Set());
  const abrirNota = itemId => setNotasAbertas(prev => (prev.has(itemId) ? prev : new Set(prev).add(itemId)));
  const toggleNota = itemId => setNotasAbertas(prev => {
    const proximo = new Set(prev);
    if (proximo.has(itemId)) proximo.delete(itemId); else proximo.add(itemId);
    return proximo;
  });

  /**
   * Escolher RESSALVA ou REPROVADO abre a caixa do motivo junto.
   *
   * Medido em 08/08/2026: 41 apontamentos e 2 notas. 95% chegavam ao
   * colaborador como "Com ressalva" e mais nada — um veredito nu, que não diz o
   * que refazer e só produz ressentimento. O botão de comentário sempre esteve
   * visível; o que faltava era alguém PEDIR. Aprovado não abre nada: aprovação
   * sem texto não deixa ninguém sem saber o que fazer.
   *
   * Abre SEM roubar o foco de propósito. `autoFocus` num celular sobe o teclado
   * e come metade da tela a cada toque, e isso numa conferência de 40 itens
   * viraria motivo para parar de apontar — o oposto do que se quer. A caixa
   * aberta convida; quem fecha o laço é o aviso na confirmação.
   */
  const setVeredito = (itemId, verdict) => {
    setVereditos(prev => ({
      ...prev,
      [itemId]: { verdict, note: prev[itemId]?.note || '' },
    }));
    if (verdict !== 'aprovado') abrirNota(itemId);
  };
  const setVeredictoNota = (itemId, texto) => setVereditos(prev => ({
    ...prev,
    [itemId]: { verdict: prev[itemId]?.verdict || 'ressalva', note: texto },
  }));

  /**
   * O checklist inteiro, item a item, com o que exige atenção já classificado.
   *
   * A execução guarda o texto do item (`i.text`), então a lista não depende do
   * template — importante porque o template pode ter sido editado ou apagado
   * depois. Quando o texto falta (execuções antigas e as de teste, que gravavam
   * só o id), busca no template pelo id e, em último caso, mostra o id: melhor
   * uma linha feia que uma linha invisível numa conferência.
   *
   * `photoRequired` só existe no template — é a única coisa que precisa do
   * join, e é o que revela "marcou como feito e não anexou a prova".
   */
  const template = (templates || []).find(t => t.id === c.templateId);
  const tplItens = template?.items || [];
  const deadline = template?.deadline || null;

  const itens = (c.items || []).map(i => {
    const tpl = tplItens.find(x => x.id === i.id);
    // Atraso POR ITEM, não do checklist: na execução colaborativa cada tarefa
    // tem seu `doneAt`, e um item concluído às 22h num checklist entregue às
    // 22h30 estava atrasado por conta própria. Sem `doneAt` (registro antigo),
    // cai no horário de entrega do checklist inteiro.
    const quando = i.doneAt || c.completedAt;
    const atrasado = !!(i.done && deadline && c.date && quando
      && new Date(quando) > new Date(`${c.date}T${deadline}:00`));
    return {
      ...i,
      texto: i.text || tpl?.text || `Item ${i.id}`,
      semTexto: !i.text && !tpl?.text,
      faltouFoto: !!(tpl?.photoRequired && i.done && !i.hasPhoto),
      atrasado,
    };
  });

  const feitos = itens.filter(i => i.done).length;
  const criticosPendentes = itens.filter(i => i.critical && !i.done);
  const naoExecutados = itens.filter(i => !i.done);
  const atrasados = itens.filter(i => i.atrasado);
  const semFoto = itens.filter(i => i.faltouFoto);
  const pendencias = itens.filter(i => !i.done || i.atrasado || i.faltouFoto);
  const visiveis = soPendencias ? pendencias : itens;

  /**
   * APONTAMENTO = ressalva ou reprovação. É o que vira texto no briefing de uma
   * pessoa, e é o que precisa de motivo. Aprovação não entra: ela não pede nada
   * de ninguém.
   */
  const apontamentos = itens.filter(i => {
    const v = vereditos[i.id]?.verdict;
    return v === 'ressalva' || v === 'reprovado';
  });
  const semMotivo = apontamentos.filter(i => !(vereditos[i.id]?.note || '').trim());

  /**
   * Salvar. Com apontamento sem motivo, pede UMA vez antes.
   *
   * Não bloqueia de propósito: a liderança pode ter conversado pessoalmente, ou
   * o motivo pode estar na observação geral. Um obstáculo intransponível aqui
   * seria trocado por "aprovado" na primeira pressa, e aí o produto perde o
   * apontamento inteiro — pior que perder o texto dele.
   */
  const commit = async (reviewed, { mesmoSemMotivo = false } = {}) => {
    if (reviewed && !mesmoSemMotivo && semMotivo.length > 0) {
      setConfirmandoMudo(true);
      return;
    }
    setBusy(true); setErro('');
    const items = Object.entries(vereditos)
      .filter(([, v]) => v?.verdict)
      .map(([item_id, v]) => ({ item_id, verdict: v.verdict, note: v.note || null }));
    const ok = await onReview(c.id, { items, note: reviewed ? note : null, reviewed });
    setBusy(false);
    if (ok) onClose();
    else { setConfirmandoMudo(false); setErro('Não foi possível salvar a conferência. Verifique a conexão e tente de novo.'); }
  };

  const semVeredito = itens.filter(i => !vereditos[i.id]?.verdict).length;
  const reprovadas = itens.filter(i => vereditos[i.id]?.verdict === 'reprovado').length;
  const comRessalva = itens.filter(i => vereditos[i.id]?.verdict === 'ressalva').length;

  const Metrica = ({ label, valor, cor }) => (
    <div style={{ flex: 1, minWidth: 92 }}>
      <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.mutedLight }}>{label}</p>
      <p className="font-display" style={{ fontSize: T.bodySm, fontWeight: W.semibold, color: cor || C.ink, marginTop: 2 }}>{valor}</p>
    </div>
  );

  const Tag = ({ cor, children }) => (
    <span style={{
      fontSize: 9.5, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em',
      color: cor, background: `${cor}14`, border: `1px solid ${cor}44`,
      borderRadius: R.pill, padding: '1px 6px', whiteSpace: 'nowrap',
    }}>{children}</span>
  );

  return (
    <div className="fixed inset-0 flex items-end justify-center z-50"
      style={{ background: 'rgba(11,60,92,0.5)' }} onClick={busy ? undefined : onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full zc-sheet-panel"
        role="dialog" aria-modal="true" aria-label="Conferir execução"
        style={{
          maxWidth: 480, background: 'white', borderRadius: '20px 20px 0 0',
          // A folha vira coluna com altura limitada e só a LISTA rola: o
          // cabeçalho (o que está sendo conferido) e os botões (a decisão)
          // precisam ficar à vista num checklist de 40 itens.
          display: 'flex', flexDirection: 'column', maxHeight: '88vh',
        }}>
        <div style={{ padding: '24px 24px 0' }}>
          <p className="font-display" style={{ fontWeight: W.semibold, fontSize: 'calc(17px * var(--zc-t-scale))', color: C.ink }}>
            {jaConferido ? 'Execução conferida' : 'Conferir execução'}
          </p>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
            {c.sector} · {c.templateName} · {c.operatorName}
          </p>
          <p style={{ fontSize: 12, color: C.mutedLight, marginTop: 2 }}>
            Entregue em {new Date(c.completedAt).toLocaleDateString('pt-BR')} às {new Date(c.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            {deadline ? ` · prazo ${deadline}` : ' · sem prazo definido'}
          </p>

          <div style={{ display: 'flex', gap: 14, margin: '14px 0', flexWrap: 'wrap' }}>
            <Metrica label="Tarefas" valor={`${feitos}/${itens.length}`}
              cor={naoExecutados.length ? C.warning : C.success} />
            <Metrica label="Críticos pendentes" valor={criticosPendentes.length || '0'}
              cor={criticosPendentes.length ? C.critical : C.success} />
            <Metrica label="Prazo"
              valor={noPrazo === null ? 'sem prazo' : noPrazo ? 'no prazo' : 'atrasado'}
              cor={noPrazo === false ? C.critical : noPrazo ? C.success : C.muted} />
          </div>

          {/* O resumo do que exige atenção, antes da lista: quem confere 40
              itens precisa saber o que procurar antes de começar a rolar. */}
          {pendencias.length > 0 && (
            <div style={{ background: `${C.warning}10`, border: `1px solid ${C.warning}44`, borderRadius: R.sm, padding: '10px 12px', marginBottom: 12 }}>
              <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.ink, marginBottom: 4 }}>
                Precisa de atenção
              </p>
              <ul style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.7, listStyle: 'none' }}>
                {criticosPendentes.length > 0 && (
                  <li style={{ color: C.critical, fontWeight: W.semibold }}>
                    {criticosPendentes.length} {criticosPendentes.length === 1 ? 'item crítico não executado' : 'itens críticos não executados'}
                  </li>
                )}
                {naoExecutados.length > criticosPendentes.length && (
                  <li>{naoExecutados.length - criticosPendentes.length} {naoExecutados.length - criticosPendentes.length === 1 ? 'item não executado' : 'itens não executados'}</li>
                )}
                {atrasados.length > 0 && <li>{atrasados.length} {atrasados.length === 1 ? 'item concluído fora do prazo' : 'itens concluídos fora do prazo'}</li>}
                {semFoto.length > 0 && <li>{semFoto.length} {semFoto.length === 1 ? 'item exigia foto e não tem' : 'itens exigiam foto e não têm'}</li>}
              </ul>
            </div>
          )}

          <div className="flex gap-2" style={{ alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <PillButton active={!soPendencias} accent={accent} onClick={() => setSoPendencias(false)}>
              Checklist inteiro ({itens.length})
            </PillButton>
            {pendencias.length > 0 && (
              <PillButton active={soPendencias} accent={accent} onClick={() => setSoPendencias(true)}>
                Só pendências ({pendencias.length})
              </PillButton>
            )}
          </div>
        </div>

        {/* A lista, na ORDEM ORIGINAL do checklist. Reordenar por gravidade
            ajudaria a triagem e atrapalharia a conferência: quem revisa segue a
            mesma sequência em que a operação acontece na loja. */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px', minHeight: 80 }}>
          {visiveis.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted, padding: '8px 0' }}>Nada a listar.</p>
          ) : visiveis.map((i, idx) => {
            const cor = !i.done ? (i.critical ? C.critical : C.warning) : i.atrasado || i.faltouFoto ? C.warning : C.success;
            const Icone = !i.done ? (i.critical ? AlertTriangle : Circle) : CheckCircle2;
            return (
              <div key={i.id || idx} style={{
                display: 'flex', gap: 10, padding: '9px 0',
                borderBottom: idx < visiveis.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <Icone size={16} color={cor} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 13.5,
                    color: !i.done && i.critical ? C.critical : C.ink,
                    fontWeight: !i.done ? W.semibold : 400,
                    fontStyle: i.semTexto ? 'italic' : 'normal',
                  }}>{i.texto}</p>
                  <div className="flex flex-wrap gap-1" style={{ marginTop: 3, alignItems: 'center' }}>
                    {i.critical && <Tag cor={C.critical}>Crítico</Tag>}
                    {!i.done && <Tag cor={C.critical}>Não executado</Tag>}
                    {i.atrasado && <Tag cor={C.warning}>Fora do prazo</Tag>}
                    {i.faltouFoto && <Tag cor={C.warning}>Faltou foto</Tag>}
                    {i.hasPhoto && (
                      <button onClick={() => onOpenPhoto && onOpenPhoto(i)}
                        className="flex items-center gap-1"
                        style={{ fontSize: 9.5, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.06em', color: accent, background: 'none', border: `1px solid ${C.border}`, borderRadius: R.pill, padding: '1px 6px', cursor: 'pointer' }}>
                        <Camera size={10} aria-hidden /> Ver foto
                      </button>
                    )}
                  </div>
                  {/* Quem executou só aparece quando NÃO é quem entregou — na
                      execução individual repetir o mesmo nome em 40 linhas é
                      ruído que esconde as duas linhas em que ele muda. */}
                  {i.done && i.doneByName && i.doneByName !== c.operatorName && (
                    <p style={{ fontSize: 11, color: C.mutedLight, marginTop: 2 }}>por {i.doneByName}</p>
                  )}
                  {i.note && (
                    <p style={{ fontSize: 11.5, color: C.muted, marginTop: 2, fontStyle: 'italic' }}>“{i.note}”</p>
                  )}

                  {/* Julgamento da tarefa. Três botões e nada de menu: numa
                      conferência de 40 linhas, cada toque a mais é um toque
                      vezes 40. */}
                  <div className="flex flex-wrap gap-1" style={{ marginTop: 6, alignItems: 'center' }}>
                    {VERDICTS.map(v => {
                      const ativo = vereditos[i.id]?.verdict === v.id;
                      return (
                        <button key={v.id} onClick={() => setVeredito(i.id, v.id)}
                          aria-pressed={ativo}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            fontSize: 11, fontWeight: W.semibold,
                            color: ativo ? 'white' : v.cor,
                            background: ativo ? v.cor : `${v.cor}10`,
                            border: `1px solid ${ativo ? v.cor : `${v.cor}55`}`,
                            borderRadius: R.pill, padding: '3px 10px', cursor: 'pointer',
                          }}>
                          <v.Icon size={11} aria-hidden /> {v.label}
                        </button>
                      );
                    })}
                    {/* O rótulo muda com o que está faltando: num apontamento
                        ainda mudo ele PEDE o motivo, em vez de oferecer um
                        comentário opcional. É a mesma caixa; o que muda é de
                        quem é a iniciativa. */}
                    {(() => {
                      const vd = vereditos[i.id]?.verdict;
                      const eApontamento = vd === 'ressalva' || vd === 'reprovado';
                      const mudo = eApontamento && !(vereditos[i.id]?.note || '').trim();
                      const cor = mudo ? C.warning : C.muted;
                      return (
                        <button onClick={() => toggleNota(i.id)}
                          style={{ fontSize: 11, fontWeight: W.semibold, color: cor, background: 'none', border: `1px dashed ${mudo ? cor : C.border}`, borderRadius: R.pill, padding: '3px 10px', cursor: 'pointer' }}>
                          {vereditos[i.id]?.note ? 'Editar motivo' : mudo ? 'Dizer o motivo' : '+ Comentário'}
                        </button>
                      );
                    })()}
                  </div>

                  {(notasAbertas.has(i.id) || vereditos[i.id]?.note) && (() => {
                    const vd = vereditos[i.id]?.verdict;
                    const mudo = (vd === 'ressalva' || vd === 'reprovado') && !(vereditos[i.id]?.note || '').trim();
                    return (
                      <textarea
                        value={vereditos[i.id]?.note || ''}
                        onChange={e => setVeredictoNota(i.id, e.target.value)}
                        rows={2} disabled={busy}
                        aria-label={`Motivo do veredito sobre ${i.texto}`}
                        // A pergunta muda com o veredito: reprovar pede o que
                        // refazer, ressalvar pede o que ajustar. Um placeholder
                        // genérico devolve resposta genérica.
                        placeholder={vd === 'reprovado'
                          ? 'O que precisa ser refeito, e como?'
                          : vd === 'ressalva'
                            ? 'O que ficou abaixo do padrão?'
                            : 'O que o colaborador precisa saber sobre esta tarefa?'}
                        style={{ width: '100%', marginTop: 6, border: `1px solid ${mudo ? C.warning : C.border}`, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', color: C.ink, resize: 'vertical' }} />
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: '14px 24px 40px', paddingBottom: 'calc(40px + env(safe-area-inset-bottom, 0px))', borderTop: `1px solid ${C.border}` }}>
          {/* O que está prestes a ser gravado, em uma linha. Sem isto, a
              liderança confirma sem saber quantas tarefas deixou sem julgar —
              e o colaborador recebe um briefing com buracos. */}
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
            {itens.length - semVeredito} de {itens.length} tarefas julgadas
            {reprovadas > 0 && <span style={{ color: C.critical, fontWeight: W.semibold }}> · {reprovadas} reprovada{reprovadas === 1 ? '' : 's'}</span>}
            {comRessalva > 0 && <span style={{ color: C.warning, fontWeight: W.semibold }}> · {comRessalva} com ressalva</span>}
            {semVeredito > 0 && <span> · {semVeredito} sem veredito</span>}
            {/* O número que importa para o outro lado: apontamento sem motivo
                chega como veredito nu. Fica na MESMA linha que "sem veredito"
                porque são o mesmo tipo de buraco — um o formulário já
                mostrava, o outro ninguém via. */}
            {semMotivo.length > 0 && <span style={{ color: C.warning, fontWeight: W.semibold }}> · {semMotivo.length} sem motivo</span>}
          </p>

          {jaConferido && (
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
              Conferido por {c.reviewedByName || '—'} em {new Date(c.reviewedAt).toLocaleDateString('pt-BR')} às {new Date(c.reviewedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
            </p>
          )}

          <label htmlFor="zc-review-note" style={{ display: 'block', fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.mutedLight, marginBottom: 4 }}>
            Observação (opcional)
          </label>
          <textarea id="zc-review-note" value={note} onChange={e => setNote(e.target.value)} rows={2} disabled={busy}
            placeholder="O que precisa melhorar na próxima?"
            style={{ width: '100%', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: C.ink, marginBottom: 12, resize: 'vertical' }} />

          {erro && <p role="alert" style={{ fontSize: 13, color: C.critical, marginBottom: 10 }}>{erro}</p>}

          {/* O segundo passo, e só quando há o que avisar: nomeia as tarefas que
              vão chegar sem motivo. Genérico ("faltam motivos") seria ignorado
              na segunda vez; a lista obriga a olhar para o que se apontou. */}
          {confirmandoMudo ? (
            <div style={{ background: `${C.warning}10`, border: `1px solid ${C.warning}55`, borderRadius: R.sm, padding: '12px 14px', marginBottom: 10 }}>
              <p style={{ fontSize: 13, fontWeight: W.semibold, color: C.ink }}>
                {semMotivo.length === 1 ? 'Um apontamento vai sem motivo' : `${semMotivo.length} apontamentos vão sem motivo`}
              </p>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                Quem executou vai ver o veredito e mais nada — sem saber o que refazer.
              </p>
              <ul style={{ margin: '8px 0 0', listStyle: 'none' }}>
                {semMotivo.slice(0, 4).map(i => (
                  <li key={i.id} style={{ fontSize: 12, color: C.ink, lineHeight: 1.6 }}>· {i.texto}</li>
                ))}
                {semMotivo.length > 4 && (
                  <li style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>· e mais {semMotivo.length - 4}</li>
                )}
              </ul>
              <div className="flex gap-2" style={{ marginTop: 12 }}>
                <button
                  onClick={() => {
                    // Abre as caixas de todas elas e DESLIGA o filtro: com "Só
                    // pendências" ligado, uma ressalva numa tarefa entregue no
                    // prazo está fora da lista, e as caixas abririam invisíveis.
                    semMotivo.forEach(i => abrirNota(i.id));
                    setSoPendencias(false);
                    setConfirmandoMudo(false);
                  }}
                  disabled={busy} className="flex-1 py-2.5"
                  style={{ borderRadius: 10, background: accent, color: 'white', fontWeight: W.semibold, fontSize: 13.5, border: 'none', cursor: 'pointer' }}>
                  Escrever os motivos
                </button>
                <button onClick={() => commit(true, { mesmoSemMotivo: true })} disabled={busy} className="flex-1 py-2.5"
                  style={{ borderRadius: 10, background: 'white', color: C.muted, fontWeight: W.semibold, fontSize: 13.5, border: `1px solid ${C.border}`, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
                  {busy ? 'Salvando…' : 'Salvar assim mesmo'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => commit(true)} disabled={busy} className="w-full py-3 mb-2"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, background: accent, color: 'white', fontWeight: W.semibold, fontSize: 15, border: 'none', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
              <CheckCheck size={17} aria-hidden /> {busy ? 'Salvando…' : jaConferido ? 'Atualizar conferência' : 'Confirmar conferência'}
            </button>
          )}
          {jaConferido && (
            <button onClick={() => commit(false)} disabled={busy} className="w-full py-2"
              style={{ borderRadius: 10, background: 'none', color: C.critical, fontWeight: W.semibold, fontSize: 13, border: 'none', cursor: busy ? 'default' : 'pointer' }}>
              Desfazer conferência
            </button>
          )}
          <button onClick={onClose} disabled={busy} className="w-full py-2"
            style={{ borderRadius: 10, background: 'none', color: C.muted, fontWeight: W.semibold, fontSize: 13, border: 'none', cursor: 'pointer' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}


/**
 * `allUnitsSelected` é o "Todas as lojas" do cabeçalho, e ele PRECISA descer
 * até aqui. Sem ele, o Relatórios só recebia `unit`, que em `page.js` já vem
 * colapsado: `ACTIVE_UNITS.find(u => u.id === unitId) || ACTIVE_UNITS[0]`.
 * Gerência e diretoria (unitId null) caíam na PRIMEIRA loja da empresa e liam o
 * relatório dela achando que era o da rede — sem nada na tela dizendo o
 * contrário, e sem caminho de UI para chegar em "todas" (o export já sabia
 * imprimir 'Todas as lojas', mas o estado nunca chegava lá).
 */
export function ReportsView({ unit, templates, completions, closures, users, canSeeAllUnits, allUnitsSelected = false, currentUser, onReview, disputes = [], onResolveDispute, activeTypes = CHECKLIST_TYPE_ORDER }) {
  const units = useUnits(); // unidades da empresa logada (antes: constante do IBR)
  const [viewingPhoto, setViewingPhoto] = useState(null); // evidência com foto (pedido do piloto)
  const [reviewing, setReviewing] = useState(null);       // execução aberta para conferência
  const [soPendentes, setSoPendentes] = useState(false);
  // Conferir é ato de liderança — o colaborador nem vê o botão. O portão de
  // verdade está na RPC `review_completion`, que confere o papel pelo token;
  // isto aqui só evita oferecer o que seria recusado.
  const canReview = !!onReview && MANAGER_ROLES.includes(currentUser?.role);
  /**
   * A tela tem dois empregos que não se misturam: CONFERIR (a tarefa de todo
   * dia — justificativas + execuções) e ANÁLISE (números, produtividade,
   * exportação — consulta ocasional). Antes eram uma pilha só, e quem confere
   * atravessava 8 a 12 telas de rolagem de análise para chegar ao trabalho.
   *
   * Quem confere cai em Conferir; quem não confere nem vê o seletor. NÃO é a
   * fila agrupada por checklist do plano (docs/REVISAO_CONFERENCIA_v1.md §2) —
   * aquela segue esperando observação de uso real; isto é só parar de cobrar
   * pedágio de rolagem da tarefa diária.
   */
  const [vista, setVista] = useState(canReview ? 'conferir' : 'analise');
  const [execPage, setExecPage] = useState(1);
  const [period, setPeriod] = useState('7d');
  // Trocar de filtro estando na página 7 mostraria "nenhuma execução" num
  // recorte que tem dados — a página precisa voltar ao início.
  useEffect(() => { setExecPage(1); }, [period, unit?.id]);
  // Datas do relatório na régua da loja em foco — "hoje" no seletor tem que ser
  // o mesmo "hoje" das execuções que ele filtra.
  const reportTz = tzOf(unit);
  const [customFrom, setCustomFrom] = useState(() => todayStr(reportTz));
  const [customTo, setCustomTo] = useState(() => todayStr(reportTz));
  const [selectedMonth, setSelectedMonth] = useState(() => todayStr(reportTz).slice(0, 7));
  // `null` = todas as lojas. `filterCompletions`, `openDates` e o export já
  // tratavam esse caso; o que faltava era alguém conseguir chegar nele.
  const [filterUnitId, setFilterUnitId] = useState(allUnitsSelected ? null : unit.id);

  // Keep filterUnitId in sync when the user switches loja in the header
  useEffect(() => {
    setFilterUnitId(allUnitsSelected ? null : unit.id);
    setFilterUserId('');
    setFilterSector(null);
  }, [unit.id, allUnitsSelected]);
  const [filterSector, setFilterSector] = useState(null);
  const [filterShift, setFilterShift] = useState(null);
  const [filterUserId, setFilterUserId] = useState('');
  const [groupBy, setGroupBy] = useState('tipo');

  const dates = periodDates(period, customFrom, customTo, selectedMonth, reportTz);
  // IBR1 uses sector groups (Salão/Cozinha); IBR2/IBR3 use individual sectors
  const sectorGroupToSectors = (groupId, unitId) => {
    if (unitId !== 'ibr1' || !groupId) return null;
    if (groupId === 'salao') return ['Salão'];
    if (groupId === 'cozinha') return ['Cozinha'];
    return null;
  };

  const resolvedSectors = sectorGroupToSectors(filterSector, filterUnitId);
  const submissoes = filterCompletions(completions, {
    dates, unitId: filterUnitId,
    sector: resolvedSectors ? null : filterSector, // pass null if we handle it via sectorList
    sectorList: resolvedSectors,
    shift: filterShift, userId: filterUserId || null,
  });

  /**
   * Uma linha por RODADA (loja + checklist + dia), não por submissão.
   *
   * O Relatórios era o último lugar do app que ainda contava submissões:
   * `collaboratorStats` (861) e `computeProductivity` (989) já desduplicavam,
   * e o índice da liderança também (`team` em computeLeadershipProfile). Só a
   * tela ficou para trás — então os StatCards diziam um número, a tabela de
   * colaboradores dizia outro, e a lista de execuções repetia o mesmo checklist
   * do mesmo dia.
   *
   * O custo disso não era estético: medido em 08/08/2026 na IBR, 148 submissões
   * para 105 rodadas. A liderança conferiu a mesma rodada duas vezes 43 vezes —
   * 29% do trabalho dela. E como `reviewable` já contava por rodada, essas 43
   * conferências nunca contaram para o índice dela.
   *
   * Nada some em silêncio: `submissoesPorRodada` alimenta o selo "2 submissões"
   * na lista e a coluna nos dois exports. A submissão descartada continua no
   * banco — aqui se escolhe a MAIS RECENTE, que é a que reflete o estado final.
   */
  const filtered = latestPerRound(submissoes);
  // Sem useMemo de propósito: `submissoes` é um array novo a cada render (o
  // ReportsView inteiro recalcula assim, ver `summary` e `groups`), então um
  // useMemo aqui nunca acertaria a dependência — só daria a impressão de que
  // memoiza. Quando este componente ganhar memoização, ela entra na origem.
  const submissoesPorRodada = new Map();
  submissoes.forEach(c => {
    const k = roundKey(c);
    submissoesPorRodada.set(k, (submissoesPorRodada.get(k) || 0) + 1);
  });
  const reexecucoes = filtered.filter(c => (submissoesPorRodada.get(roundKey(c)) || 1) > 1).length;

  const summary = summarizeCompletions(filtered);
  const reportFilter = { unitId: filterUnitId, sector: filterSector, shift: filterShift };
  const effectiveDates = dates || [...new Set(filtered.map(c => c.date))];
  // Exclude days when the selected unit(s) were closed
  const openDates = effectiveDates.filter(d => {
    if (filterUnitId) return !isUnitClosed(closures, filterUnitId, d);
    return units.some(u => !isUnitClosed(closures, u.id, d));
  });
  const expectedChecklists = openDates.reduce((sum, d) => sum + countApplicableTemplatesOnDate(templates, reportFilter, d), 0);
  const numDays = effectiveDates.length;
  const checklistRate = expectedChecklists ? (summary.checklists / expectedChecklists) * 100 : null;

  // IBR1 uses sector groups (Salão/Cozinha); IBR2/IBR3 use individual sectors.
  // Sem loja selecionada (rede inteira), a lista é a UNIÃO dos setores — senão
  // o filtro de setor aparecia vazio justamente para quem vê mais coisa.
  const sectorOptions = filterUnitId === 'ibr1'
    ? [{ id: 'salao', label: 'Salão' }, { id: 'cozinha', label: 'Cozinha' }]
    : (filterUnitId
        ? (units.find(u => u.id === filterUnitId)?.sectors || [])
        : [...new Set(units.flatMap(u => u.sectors || []))]
      ).map(s => ({ id: s, label: s }));

  const collaborators = collaboratorStats(filtered);
  const groups = groupStats(filtered, groupBy, units, activeTypes);

  // ── Produtividade ──────────────────────────────────────────────────────────
  // O baseline é sempre a EMPRESA inteira no período (sem filtro de loja/setor),
  // para o score do colaborador/setor/loja ser comparável contra a mesma régua.
  const prod = computeProductivity(filterCompletions(completions, { dates }));
  // Sem loja selecionada, o recorte é a rede inteira: filtrar por `null` daria
  // três listas vazias para quem tem o escopo mais largo do app.
  const prodUnits = canSeeAllUnits ? prod.units : prod.units.filter(u => u.key === filterUnitId);
  const prodSectors = filterUnitId
    ? prod.sectors.filter(s => s.key.startsWith(`${filterUnitId}|`))
    : prod.sectors;
  const prodCollabs = prod.collaborators
    .filter(cb => (!filterUnitId || cb.unitIds.has(filterUnitId)) && (!filterUserId || cb.key === filterUserId))
    .slice(0, 15);

  // ── Export helpers ─────────────────────────────────────────────────────────
  const periodLabel = period === 'custom'
    ? `${customFrom} a ${customTo}`
    : period === 'month'
      ? new Date(`${selectedMonth}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : PERIODS.find(p => p.id === period)?.label || period;

  const exportCSV = () => {
    const rows = [
      ['Data', 'Loja', 'Setor', 'Checklist', 'Responsável', 'Concluído às', 'Tarefas feitas', 'Total tarefas', '% Conclusão', 'Críticos pendentes', 'Submissões'],
      // Uma linha por rodada, igual à tela. A coluna "Submissões" é o que
      // impede a desduplicação de virar perda: quem precisa auditar uma
      // reexecução vê que ela existiu e quantas foram.
      ...filtered.map(c => {
        const done = c.items.filter(i => i.done).length;
        const total = c.items.length;
        const rate = total ? ((done / total) * 100).toFixed(0) + '%' : '—';
        const crit = c.items.filter(i => i.critical && !i.done).length;
        return [
          c.date,
          units.find(u => u.id === c.unitId)?.name || c.unitId,
          c.sector,
          c.templateName,
          c.operatorName,
          new Date(c.completedAt).toLocaleString('pt-BR'),
          done,
          total,
          rate,
          crit,
          submissoesPorRodada.get(roundKey(c)) || 1,
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ibr-relatorio-${periodLabel.replace(/\s/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const unitLabel = filterUnitId ? units.find(u => u.id === filterUnitId)?.name : 'Todas as lojas';
    const unitColor = filterUnitId ? (units.find(u => u.id === filterUnitId)?.color || '#063C5C') : '#063C5C';

    // Build bar chart SVG for groups
    const maxRate = 100;
    const barH = 24;
    const barGap = 8;
    const chartW = 480;
    const labelW = 140;
    const barMaxW = chartW - labelW - 60;
    const chartH = groups.length * (barH + barGap) + 16;

    const barsSVG = groups.map((g, i) => {
      const y = i * (barH + barGap) + 8;
      const bw = Math.round((g.rate / 100) * barMaxW);
      const color = g.rate >= 80 ? '#31C85A' : g.rate >= 50 ? unitColor : '#D1462F';
      const label = g.key.length > 22 ? g.key.slice(0, 22) + '…' : g.key;
      return `
        <text x="0" y="${y + 16}" font-size="11" fill="#4A4035" font-family="system-ui">${label}</text>
        <rect x="${labelW}" y="${y}" width="${bw}" height="${barH}" rx="4" fill="${color}" opacity="0.85"/>
        <text x="${labelW + bw + 6}" y="${y + 16}" font-size="11" font-weight="800" fill="${color}" font-family="system-ui">${g.rate.toFixed(0)}%</text>
      `;
    }).join('');

    // Collaborator rows
    const colabRows = collaborators.map(c =>
      `<tr>
        <td>${c.name}</td>
        <td style="text-align:center">${c.checklists}</td>
        <td style="text-align:center">${c.tasksDone}${c.criticalDone > 0 ? ` (${c.criticalDone} crít.)` : ''}</td>
        <td style="text-align:center;font-weight:800;color:${c.rate==null?'#888':c.rate>=80?'#31C85A':c.rate>=50?unitColor:'#D1462F'}">${c.rate==null?'—':c.rate.toFixed(0)+'%'}</td>
        <td style="text-align:center;font-weight:${c.criticalPending>0?'700':'400'};color:${c.criticalPending>0?'#D1462F':'#888'}">${c.criticalPending > 0 ? c.criticalPending : '—'}</td>
      </tr>`
    ).join('');

    // Execuções do período — o relatório gerado carrega o mesmo detalhamento
    // da tela (pedido do piloto), do mais recente ao mais antigo.
    const execRows = [...filtered]
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .map(c => {
        const done = c.items.filter(i => i.done).length;
        const fotos = c.items.filter(i => i.hasPhoto).length;
        const subs = submissoesPorRodada.get(roundKey(c)) || 1;
        return `<tr>
          <td style="white-space:nowrap">${new Date(c.completedAt).toLocaleDateString('pt-BR')} ${new Date(c.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
          <td>${units.find(u => u.id === c.unitId)?.name || c.unitId}</td>
          <td>${c.sector} · ${c.templateName}</td>
          <td>${c.operatorName}</td>
          <td style="text-align:center">${done}/${c.items.length}</td>
          <td style="text-align:center">${fotos > 0 ? fotos : '—'}</td>
          <td style="text-align:center">${subs > 1 ? subs : '—'}</td>
        </tr>`;
      }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>IBR Relatório — ${unitLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #063C5C; background: white; }
  .page { padding: 32px 40px; max-width: 820px; margin: 0 auto; }

  /* Header */
  .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 20px; border-bottom: 2px solid #E2EAF0; margin-bottom: 24px; }
  .header-left h1 { font-size: 20px; font-weight: 800; color: #063C5C; }
  .header-left p { font-size: 12px; color: #6B8299; margin-top: 4px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: white; background: ${unitColor}; }

  /* Summary cards */
  .cards { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; margin-bottom: 28px; }
  .card { border: 1.5px solid #E2EAF0; border-radius: 10px; padding: 14px 12px; }
  .card-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: #6B8299; font-weight: 700; }
  .card-value { font-size: 28px; font-weight: 800; color: #063C5C; margin: 6px 0 2px; line-height: 1; }
  .card-sub { font-size: 10px; color: #6B8299; }
  .card.highlight { border-color: ${unitColor}; background: ${unitColor}10; }
  .card.highlight .card-value { color: ${unitColor}; }

  /* Section title */
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #6B8299; font-weight: 800; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 1px solid #E2EAF0; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 28px; }
  th { text-align: left; padding: 7px 10px; background: #F7F9FB; border-bottom: 2px solid #E2EAF0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B8299; font-weight: 700; }
  td { padding: 7px 10px; border-bottom: 1px solid #F0EBE0; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #F7F9FB; }

  /* Chart */
  .chart-wrap { margin-bottom: 28px; overflow: hidden; }

  /* Footer */
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2EAF0; display: flex; justify-content: space-between; font-size: 10px; color: #6B8299; }

  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page { padding: 20px 24px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>ZCheck — Relatório Operacional</h1>
      <p>${periodLabel} &nbsp;·&nbsp; gerado em ${new Date().toLocaleString('pt-BR')}</p>
    </div>
    <span class="badge">${unitLabel}</span>
  </div>

  <!-- Summary cards -->
  <div class="cards">
    <div class="card highlight">
      <div class="card-label">Realização geral</div>
      <div class="card-value">${summary.rate.toFixed(0)}%</div>
      <div class="card-sub">${summary.doneItems} de ${summary.totalItems} tarefas</div>
    </div>
    <div class="card">
      <div class="card-label">Checklists</div>
      <div class="card-value">${summary.checklists}${expectedChecklists > 0 ? `<span style="font-size:14px;color:#6B8299">/${expectedChecklists}</span>` : ''}</div>
      <div class="card-sub">${checklistRate != null ? checklistRate.toFixed(0) + '% do esperado' : 'concluídos'}</div>
    </div>
    <div class="card" style="${summary.criticalPending > 0 ? 'border-color:#D1462F' : ''}">
      <div class="card-label">Críticos pend.</div>
      <div class="card-value" style="color:${summary.criticalPending > 0 ? '#D1462F' : '#31C85A'}">${summary.criticalPending}</div>
      <div class="card-sub">itens críticos</div>
    </div>
    <div class="card">
      <div class="card-label">Fotos</div>
      <div class="card-value">${summary.photos}</div>
      <div class="card-sub">comprovações</div>
    </div>
  </div>

  <!-- Bar chart -->
  ${groups.length > 0 ? `
  <p class="section-title">Realização por ${groupBy === 'tipo' ? 'tipo de checklist' : 'setor'}</p>
  <div class="chart-wrap">
    <svg width="${chartW}" height="${chartH}" xmlns="http://www.w3.org/2000/svg">
      ${barsSVG}
    </svg>
  </div>` : ''}

  <!-- Collaborator table -->
  ${collaborators.length > 0 ? `
  <p class="section-title">Desempenho por colaborador</p>
  <table>
    <thead><tr>
      <th>Colaborador</th>
      <th style="text-align:center">Checklists</th>
      <th style="text-align:center">Tarefas exec.</th>
      <th style="text-align:center">% Realização</th>
      <th style="text-align:center">Críticos pend.</th>
    </tr></thead>
    <tbody>${colabRows}</tbody>
  </table>` : ''}

  <!-- Execuções do período -->
  ${filtered.length > 0 ? `
  <p class="section-title">Execuções do período (${filtered.length})</p>
  <table>
    <thead><tr>
      <th>Quando</th>
      <th>Loja</th>
      <th>Checklist</th>
      <th>Responsável</th>
      <th style="text-align:center">Tarefas</th>
      <th style="text-align:center">Fotos</th>
      <th style="text-align:center">Submissões</th>
    </tr></thead>
    <tbody>${execRows}</tbody>
  </table>` : ''}

  <!-- Footer -->
  <div class="footer">
    <span>ZCheck — Relatório Operacional</span>
    <span>gerado em ${new Date().toLocaleString('pt-BR')}</span>
  </div>

</div>

<script>
  // Auto-print after small delay for styles to render
  setTimeout(() => window.print(), 600);
</script>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="zc-view space-y-4 zc-rep">
      <div className="zc-rep-filters space-y-4">
      {/* O escopo, dito em letras. Quem responde pela rede lia o relatório da
          primeira loja achando que era o de todas — e nada na tela desmentia. */}
      <Eyebrow>Escopo</Eyebrow>
      <p style={{ fontSize: T.caption, color: C.muted }}>
        {filterUnitId
          ? <>Somente <strong style={{ color: C.ink, fontWeight: W.semibold }}>{units.find(u => u.id === filterUnitId)?.name || filterUnitId}</strong></>
          : <><strong style={{ color: C.ink, fontWeight: W.semibold }}>Todas as lojas</strong> ({units.length})</>}
        {canSeeAllUnits && ' · troque no seletor de loja do cabeçalho'}
      </p>

      <Eyebrow>Período</Eyebrow>
      <div className="flex flex-wrap gap-2">
        {PERIODS.map(p => (
          <PillButton key={p.id} active={period === p.id} accent={unit.color} onClick={() => setPeriod(p.id)}>{p.label}</PillButton>
        ))}
      </div>

      {period === 'month' && (
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={selectedMonth}
            max={todayStr(reportTz).slice(0, 7)}
            onChange={e => setSelectedMonth(e.target.value)}
            style={{ flex: 1, fontSize: 13, fontWeight: W.semibold, color: C.ink, background: 'white', padding: '8px 10px', border: `1.5px solid ${unit.color}`, borderRadius: 8, outline: 'none' }}
          />
          {selectedMonth && (
            <span style={{ fontSize: 12, color: C.muted, fontWeight: W.semibold }}>
              {new Date(`${selectedMonth}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
          )}
        </div>
      )}

      {period === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)}
            style={{ flex: 1, fontSize: 13, fontWeight: W.semibold, color: C.ink, background: 'white', padding: '8px 8px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none' }}
          />
          <span style={{ fontSize: 12, color: C.muted, fontWeight: W.semibold }}>até</span>
          <input
            type="date" value={customTo} min={customFrom} max={todayStr(reportTz)} onChange={e => setCustomTo(e.target.value)}
            style={{ flex: 1, fontSize: 13, fontWeight: W.semibold, color: C.ink, background: 'white', padding: '8px 8px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none' }}
          />
        </div>
      )}

      <Eyebrow>Agrupar por</Eyebrow>
      <div className="flex gap-2">
        <PillButton active={groupBy === 'tipo'} accent={unit.color} onClick={() => setGroupBy('tipo')}>Tipo</PillButton>
        <PillButton active={groupBy === 'setor'} accent={unit.color} onClick={() => setGroupBy('setor')}>Setor</PillButton>
      </div>

      <Eyebrow>Setor</Eyebrow>
      <div className="flex flex-wrap gap-2">
        <PillButton active={!filterSector} accent={unit.color} onClick={() => setFilterSector(null)}>Todos</PillButton>
        {sectorOptions.map(s => (
          <PillButton key={s.id} active={filterSector === s.id} accent={unit.color} onClick={() => setFilterSector(s.id)}>{s.label}</PillButton>
        ))}
      </div>

      <Eyebrow>Colaborador</Eyebrow>
      <select
        value={filterUserId} onChange={e => setFilterUserId(e.target.value)}
        className="w-full"
        style={{ fontSize: 13, fontWeight: W.semibold, color: C.ink, background: 'white', padding: '10px 10px', border: `1.5px solid ${C.border}`, borderRadius: 8, outline: 'none' }}
      >
        <option value="">Todos</option>
        {users
          .filter(u => !filterUnitId || !u.unitId || u.unitId === filterUnitId)
          .map(u => <option key={u.id} value={u.id}>{truncName(u.name, 30)}</option>)}
      </select>
      </div>

      <div className="zc-rep-results space-y-4">
      {canReview && (() => {
        const pendentes = filtered.filter(c => !c.reviewedAt).length;
        const abertas = (disputes || []).filter(d => d.status === 'aberta').length;
        return (
          <div className="flex gap-2">
            <PillButton active={vista === 'conferir'} accent={unit.color} onClick={() => setVista('conferir')}>
              Conferir{pendentes + abertas > 0 ? ` · ${pendentes + abertas}` : ''}
            </PillButton>
            <PillButton active={vista === 'analise'} accent={unit.color} onClick={() => setVista('analise')}>
              Análise
            </PillButton>
          </div>
        );
      })()}

      {vista === 'analise' && (<>
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Checklists concluídos" accent={unit.color}
          value={expectedChecklists > 0 ? `${summary.checklists}/${expectedChecklists}` : summary.checklists}
          sub={checklistRate != null ? `${checklistRate.toFixed(0)}% do esperado no período` : `${numDays || 0} dia(s) com registros`}
        />
        <StatCard
          label="Tarefas concluídas" accent={unit.color}
          value={`${summary.rate.toFixed(0)}%`}
          sub={`${summary.doneItems} de ${summary.totalItems} itens`}
        />
        <StatCard
          label="Críticos pendentes" accent={summary.criticalPending > 0 ? C.critical : unit.color}
          value={summary.criticalPending}
          sub="itens críticos não concluídos"
        />
        <StatCard
          label="Fotos registradas" accent={unit.color}
          value={summary.photos}
          sub="comprovações com foto"
        />
      </div>

      <Eyebrow>Nível de realização por colaborador</Eyebrow>
      {collaborators.length === 0 ? (
        <EmptyState title="Sem dados no período" desc="Nenhum checklist concluído com os filtros selecionados." />
      ) : (
        <div className="space-y-2">
          {collaborators.map(c => (
            <Ticket key={c.key} accent={unit.color}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>{c.name}</p>
                <p className="font-display" style={{ fontWeight: W.semibold, color: c.rate == null ? C.muted : c.rate >= 80 ? C.success : c.rate >= 50 ? unit.color : C.critical }}>{c.rate == null ? '—' : `${c.rate.toFixed(0)}%`}</p>
              </div>
              <RateBar rate={c.rate || 0} accent={unit.color} />
              <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                {c.checklists} checklist{c.checklists !== 1 ? 's' : ''} · {c.tasksDone} tarefa{c.tasksDone !== 1 ? 's' : ''} executada{c.tasksDone !== 1 ? 's' : ''}
                {c.criticalDone > 0 && ` (${c.criticalDone} crítica${c.criticalDone > 1 ? 's' : ''})`}
                {c.criticalPending > 0 && ` · ${c.criticalPending} crítico${c.criticalPending > 1 ? 's' : ''} pendente${c.criticalPending > 1 ? 's' : ''}`}
                {c.photos > 0 && ` · ${c.photos} foto${c.photos > 1 ? 's' : ''}`}
              </p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Última atividade: {formatDateTime(c.last)}</p>
            </Ticket>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState title="Sem dados no período" desc="Nenhum checklist concluído com os filtros selecionados." />
      ) : (
        <div className="space-y-2">
          {groups.map(g => (
            <Ticket key={g.key} accent={unit.color}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-display" style={{ fontWeight: W.semibold, color: C.ink }}>{g.key}</p>
                <p className="font-display" style={{ fontWeight: W.semibold, color: g.rate >= 80 ? C.success : g.rate >= 50 ? unit.color : C.critical }}>{g.rate.toFixed(0)}%</p>
              </div>
              <RateBar rate={g.rate} accent={unit.color} />
              <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                {g.checklists} checklist{g.checklists > 1 ? 's' : ''} · {g.doneItems} de {g.totalItems} tarefas
                {g.criticalPending > 0 && ` · ${g.criticalPending} crítico${g.criticalPending > 1 ? 's' : ''} pendente${g.criticalPending > 1 ? 's' : ''}`}
              </p>
            </Ticket>
          ))}
        </div>
      )}

      {/* ── Produtividade — colaborador vs setor vs loja vs empresa ── */}
      {prod.company.points > 0 && (
        <>
          <Eyebrow>Produtividade · score 100 = média da empresa</Eyebrow>
          <Ticket accent={unit.color}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>Empresa (período)</p>
                <p className="font-display" style={{ fontSize: 'calc(22px * var(--zc-t-scale))', fontWeight: W.bold, color: C.ink, marginTop: 2 }}>
                  {prod.company.rate != null ? `${prod.company.rate.toFixed(1)} pts/h` : '—'}
                </p>
              </div>
              <div style={{ textAlign: 'right', fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                <p>{Math.round(prod.company.points)} pontos · {prod.company.tasks} tarefas</p>
                <p>{prod.company.criticals} críticas · {Math.round(prod.company.fullChecklists)} checklists 100%</p>
              </div>
            </div>
          </Ticket>

          {canSeeAllUnits && prodUnits.length > 1 && (
            <div className="space-y-2">
              <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>Por loja</p>
              {prodUnits.map(u => (
                <ProdRow key={u.key} entry={{ ...u, name: units.find(x => x.id === u.key)?.name || u.name }} accent={unit.color} />
              ))}
            </div>
          )}

          {prodSectors.length > 1 && (
            <div className="space-y-2">
              <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>Por setor</p>
              {prodSectors.map(s => <ProdRow key={s.key} entry={s} accent={unit.color} />)}
            </div>
          )}

          {prodCollabs.length > 0 && (
            <div className="space-y-2">
              <p style={{ fontSize: T.label, fontWeight: W.semibold, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted }}>Por colaborador</p>
              {prodCollabs.map(cb => <ProdRow key={cb.key} entry={cb} accent={unit.color} />)}
            </div>
          )}

          <p style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.6 }}>
            Como o score é calculado: tarefa comum = 1 pt · tarefa crítica = 2 pts · checklist 100% completo = +3 pts
            divididos entre quem executou. O ritmo (pts/h) usa o tempo ativo dentro do checklist — da primeira à última
            tarefa marcada por cada pessoa. Score = ritmo ÷ ritmo médio da empresa × 100. Execuções antigas, sem horário
            por tarefa, contam pontos mas ficam fora do ritmo.
          </p>
        </>
      )}

      {/* ── Gráfico por dia da semana ── */}
      {(() => {
        const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        // Agrupa completions por dia da semana
        const byDow = Array.from({length: 7}, () => ({ done: 0, total: 0, count: 0 }));
        filtered.forEach(c => {
          if (!c.date) return;
          // `weekdayOf` (lib/dates.js) e não um `new Date` à mão: a fonte do
          // dia é uma só neste projeto. O parse local daqui devolvia o mesmo
          // resultado por acidente — âncora ao meio-dia — mas convidava a
          // próxima pessoa a mexer na hora e quebrar sem o build reclamar.
          const dow = weekdayOf(c.date);
          const items = c.items || [];
          byDow[dow].done += items.filter(i => i.done).length;
          byDow[dow].total += items.length;
          byDow[dow].count += 1;
        });
        const rates = byDow.map(d => d.total > 0 ? Math.round((d.done / d.total) * 100) : null);
        const hasData = rates.some(r => r !== null);
        if (!hasData) return null;
        const maxRate = 100;
        const barH = 80;
        return (
          <>
            <Eyebrow>Desempenho por dia da semana</Eyebrow>
            <Ticket accent={unit.color}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: barH + 36 }}>
                {DIAS.map((dia, i) => {
                  const r = rates[i];
                  const h = r !== null ? Math.max(4, Math.round((r / maxRate) * barH)) : 4;
                  const color = r === null ? C.border : r >= 80 ? C.success : r >= 50 ? unit.color : C.critical;
                  return (
                    <div key={dia} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      {r !== null && (
                        <p style={{ fontSize: 10, fontWeight: W.semibold, color }}>{r}%</p>
                      )}
                      {r === null && (
                        <p style={{ fontSize: 9, color: C.muted }}>—</p>
                      )}
                      <div style={{ width: '100%', height: h, background: color, borderRadius: 4, opacity: r === null ? 0.3 : 1, transition: 'height 0.4s ease' }} />
                      <p style={{ fontSize: 10, fontWeight: W.semibold, color: C.muted }}>{dia}</p>
                      {byDow[i].count > 0 && (
                        <p style={{ fontSize: 9, color: C.muted }}>{byDow[i].count}x</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
                Percentual de tarefas concluídas por dia · período selecionado · {filtered.length} registros
              </p>
            </Ticket>
          </>
        );
      })()}
      </>)}

      {vista === 'conferir' && (<>
      {/* Justificativas abertas — ANTES das execuções de propósito. É a única
          coisa nesta tela em que outra pessoa está esperando por uma resposta;
          o resto é a liderança olhando no próprio ritmo. */}
      {canReview && (disputes || []).some(d => d.status === 'aberta') && (
        <>
          <Eyebrow>Justificativas aguardando você</Eyebrow>
          <div className="space-y-1.5" style={{ marginBottom: 16 }}>
            {(disputes || []).filter(d => d.status === 'aberta').map(d => (
              <DisputeCard key={`${d.completionId}|${d.itemId}`} dispute={d} accent={unit.color}
                completions={completions} onResolve={onResolveDispute} />
            ))}
          </div>
        </>
      )}

      {/* A FILA — agrupada por checklist. Substituiu a lista cronológica, que
          repetia o mesmo checklist dezenas de vezes e obrigava a rolar para
          descobrir o que pedia atenção. */}
      <ConferenceQueue
        completions={filtered} templates={templates} units={units}
        accent={unit.color} onOpen={c => setReviewing(c)}
      />
      </>)}

      {vista === 'analise' && (<>
      {/* Execuções do período — evidências com foto (pedido do piloto: a foto
          precisa ser visível também no Relatórios, não só no Painel do dia).
          Vive na ANÁLISE: aqui não se trabalha a fila, se procura um registro
          específico e se olha a prova. */}
      <Eyebrow>Execuções do período</Eyebrow>
      {canReview && (
        <div className="flex gap-2" style={{ margin: '4px 0 8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <PillButton active={soPendentes} accent={unit.color} onClick={() => { setSoPendentes(v => !v); setExecPage(1); }}>
            Só pendentes de conferência
          </PillButton>
          <span style={{ fontSize: T.label, color: C.mutedLight }}>
            {filtered.filter(c => !c.reviewedAt).length} sem conferir no período
            {reexecucoes > 0 && ` · ${reexecucoes} ${reexecucoes === 1 ? 'rodada reexecutada' : 'rodadas reexecutadas'}`}
          </span>
        </div>
      )}
      <div className="space-y-1.5" style={{ marginBottom: 16 }}>
        {(() => {
          const base = soPendentes ? filtered.filter(c => !c.reviewedAt) : filtered;
          const ordenadas = [...base]
            .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
          const totalPag = Math.max(1, Math.ceil(ordenadas.length / EXEC_PAGE_SIZE));
          const pagAtual = Math.min(execPage, totalPag);
          const recentes = ordenadas.slice((pagAtual - 1) * EXEC_PAGE_SIZE, pagAtual * EXEC_PAGE_SIZE);
          if (recentes.length === 0) {
            return <p style={{ fontSize: T.caption, color: C.muted }}>Nenhuma execução no período com os filtros atuais.</p>;
          }
          return (
            <>
              {recentes.map(c => {
                const fotos = (c.items || []).filter(i => i.hasPhoto);
                return (
                  <div key={c.id} className="px-3 py-2" style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: R.sm }}>
                    <div className="flex items-center justify-between gap-2" style={{ fontSize: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: W.semibold, color: C.ink }}>{c.sector}</span>
                        <span style={{ color: C.muted }}> · {c.templateName}</span>
                      </div>
                      <span className="font-mono-ibr" style={{ color: C.muted, flexShrink: 0 }}>
                        {new Date(c.completedAt).toLocaleDateString('pt-BR')} {new Date(c.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                      {c.operatorName}
                      {/* O atraso é dado de gestão, não decoração: é o que
                          alimenta os 40% do índice da liderança, então precisa
                          estar visível na mesma linha em que se confere. */}
                      {completionOnTime(c, templates, null, units) === false && (
                        <span style={{ color: C.critical, fontWeight: W.semibold }}> · fora do prazo</span>
                      )}
                      {/* A rodada teve mais de uma submissão e a lista mostra só
                          a última. Dizer isso é o que separa desduplicar de
                          esconder — sem o selo, o registro some sem aviso. */}
                      {(submissoesPorRodada.get(roundKey(c)) || 1) > 1 && (
                        <span> · {submissoesPorRodada.get(roundKey(c))} submissões, exibindo a última</span>
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1" style={{ alignItems: 'center' }}>
                      {fotos.map(i => (
                        <button key={i.id} onClick={() => setViewingPhoto({ recordId: c.id, item: i })}
                          className="flex items-center gap-1"
                          style={{ fontSize: T.label, fontWeight: W.semibold, color: unit.color, background: 'none', border: `1px solid ${C.border}`, borderRadius: R.sm, padding: '3px 8px', cursor: 'pointer' }}>
                          <Camera size={11} /> Foto
                        </button>
                      ))}
                      {c.reviewedAt ? (
                        <button onClick={canReview ? () => setReviewing(c) : undefined}
                          disabled={!canReview}
                          className="flex items-center gap-1"
                          style={{ fontSize: T.label, fontWeight: W.semibold, color: C.success, background: `${C.success}12`, border: `1px solid ${C.success}55`, borderRadius: R.sm, padding: '3px 8px', cursor: canReview ? 'pointer' : 'default' }}>
                          <CheckCheck size={11} /> Conferido por {c.reviewedByName || '—'}
                        </button>
                      ) : canReview && (
                        <button onClick={() => setReviewing(c)}
                          className="flex items-center gap-1"
                          style={{ fontSize: T.label, fontWeight: W.semibold, color: unit.color, background: 'none', border: `1px dashed ${unit.color}88`, borderRadius: R.sm, padding: '3px 8px', cursor: 'pointer' }}>
                          <ClipboardCheck size={11} /> Conferir
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Antes: corte em 20 com "refine os filtros ou exporte o CSV para o
                  total" — uma limitação de tela pequena que virou limitação de
                  produto, mandando o gestor para o Excel. Agora pagina. */}
              {totalPag > 1 && (
                <div className="flex items-center gap-2" style={{ paddingTop: 8 }}>
                  <button type="button" onClick={() => setExecPage(p => Math.max(1, p - 1))}
                    disabled={pagAtual === 1} aria-label="Página anterior"
                    style={{ ...execPagerBtn, opacity: pagAtual === 1 ? 0.4 : 1, cursor: pagAtual === 1 ? 'default' : 'pointer' }}>‹</button>
                  <span style={{ fontSize: T.label, color: C.muted }}>
                    Página {pagAtual} de {totalPag}
                  </span>
                  <button type="button" onClick={() => setExecPage(p => Math.min(totalPag, p + 1))}
                    disabled={pagAtual === totalPag} aria-label="Próxima página"
                    style={{ ...execPagerBtn, opacity: pagAtual === totalPag ? 0.4 : 1, cursor: pagAtual === totalPag ? 'default' : 'pointer' }}>›</button>
                  <span style={{ fontSize: T.label, color: C.muted, marginLeft: 'auto' }}>
                    {ordenadas.length} execuções
                  </span>
                </div>
              )}
            </>
          );
        })()}
      </div>

      <Eyebrow>Exportar</Eyebrow>
      <div className="flex gap-2">
        <button
          onClick={exportCSV}
          className="flex-1 flex items-center justify-center gap-2 py-3"
          style={{ borderRadius: 10, border: `1.5px solid ${C.border}`, fontWeight: W.semibold, fontSize: 13, color: C.ink, background: 'white', cursor: 'pointer' }}
        >
          <Download size={15} aria-hidden /> Excel / CSV
        </button>
        <button
          onClick={exportPDF}
          className="flex-1 flex items-center justify-center gap-2 py-3"
          style={{ borderRadius: 10, border: 'none', fontWeight: W.semibold, fontSize: 13, color: 'white', background: unit.color, cursor: 'pointer', boxShadow: `0 2px 8px ${unit.color}44` }}
        >
          <Printer size={15} aria-hidden /> Exportar PDF
        </button>
      </div>
      </>)}

      {reviewing && (
        <ReviewModal
          completion={reviewing} templates={templates} accent={unit.color}
          onClose={() => setReviewing(null)} onReview={onReview}
          onOpenPhoto={item => setViewingPhoto({ recordId: reviewing.id, item })}
        />
      )}
      {/* PhotoModal DEPOIS do ReviewModal de propósito: os dois são z-50, então
          quem vem por último no DOM fica por cima. Invertido, a foto abria
          atrás da conferência e parecia não ter aberto. */}
      {viewingPhoto && (
        <PhotoModal recordId={viewingPhoto.recordId} item={viewingPhoto.item} onClose={() => setViewingPhoto(null)} />
      )}
      </div>
    </div>
  );
}
