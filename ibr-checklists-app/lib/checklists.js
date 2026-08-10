/**
 * ZCheck — domínio do CHECKLIST.
 *
 * O que um checklist é, quais itens valem num dia, e se uma execução chegou no
 * prazo. Tudo aqui é função pura sobre template/execução: nada de React, nada
 * de estado, nada de consulta.
 *
 * Extraído de `app/app/page.js` (Fase 1a da consolidação de abas — ver
 * `docs/PLANO_CONSOLIDACAO_ABAS.md`). O motivo da extração é de direção de
 * dependência: as views de Painel, J.I.T. e Relatórios precisam destas funções,
 * e enquanto elas viviam no escopo de módulo de `page.js` nenhuma view podia
 * sair de lá sem criar o ciclo `components/painel/* → app/app/page.js`.
 *
 * REGRA: este módulo não pode importar de `app/`. Só de outros `lib/`.
 */

import { weekdayOf, instantAt, tzOfUnit, APP_TZ } from './dates';
import { roundIsComplete, roundProgress, statusFromProgress } from './rounds';

/**
 * Os três tipos de checklist da operação, na ordem em que o dia acontece.
 *
 * `match` é por NOME porque o tipo nunca foi um campo: veio do texto que o
 * gestor escreveu ao criar o checklist. Empresas com tipos personalizados
 * passam a própria lista (`activeTypes`) — este é o default do IBR.
 */
export const CHECKLIST_TYPE_ORDER = [
  { key: 'abertura',     label: 'Abertura',      match: t => t.name.toLowerCase().includes('abertura') },
  { key: 'intermediario',label: 'Intermediário', match: t => t.name.toLowerCase().includes('intermedi') },
  { key: 'fechamento',   label: 'Fechamento',    match: t => t.name.toLowerCase().includes('fechamento') },
];

// A template's shift can be a single shift or an array (e.g. Intermediário runs in both).
export const matchesShift = (t, shift) => Array.isArray(t.shift) ? t.shift.includes(shift) : t.shift === shift;

// Recurrence: undefined/null/empty = every day. Otherwise an array of weekday numbers (0=Dom ... 6=Sáb).
export const isItemApplicable = (item, dateStr, templateType) => {
  // If item has explicit appearsIn, check it matches the template type
  if (item.appearsIn && item.appearsIn.length > 0) {
    if (templateType && !item.appearsIn.includes(templateType)) return false;
  }
  // Check recurrence
  if (!item.recurrence || item.recurrence.length === 0) return true;
  return item.recurrence.includes(weekdayOf(dateStr));
};

export const applicableItems = (template, dateStr) => {
  // Detect template type from name
  const n = (template.name || '').toLowerCase();
  const templateType = n.includes('abertura') ? 'abertura' : n.includes('fechamento') ? 'fechamento' : n.includes('intermedi') ? 'intermediario' : null;
  return template.items.filter(i => isItemApplicable(i, dateStr, templateType));
};

// Checklist que a OPERAÇÃO vê. Desativado continua carregado (o histórico
// depende dele), mas não aparece para executar nem para gerenciar.
export const templateAtiva = t => t.active !== false;

/**
 * Fábrica do teste "esta rodada foi entregue completa?" para a aderência.
 *
 * Resolve o checklist e os itens previstos para o dia — com cache por
 * (checklist, data), porque a aderência varre 30 dias × todas as execuções e sem
 * o cache seria um `find` + `applicableItems` por linha, a cada render.
 */
export function completeRoundChecker(templates) {
  const byId = new Map((templates || []).map(t => [t.id, t]));
  const cache = new Map();
  return c => {
    const k = `${c.templateId}|${c.date}`;
    if (!cache.has(k)) {
      const t = byId.get(c.templateId);
      cache.set(k, t ? applicableItems(t, c.date).map(i => i.id) : null);
    }
    return roundIsComplete(c, cache.get(k));
  };
}

/**
 * Uma execução chegou no prazo?
 *
 * `true` / `false` / `null` — e o `null` importa: checklist cujo tipo não tem
 * `deadline` (o "Intermediário", por exemplo) não tem prazo para cumprir, e
 * contá-lo como atrasado puniria a liderança por uma regra que não existe. Fora
 * do numerador E do denominador.
 *
 * "Fechamento até as 18:00" são 18:00 NO RELÓGIO DA LOJA — por isso o prazo é
 * resolvido com o fuso dela, e não com o de quem abriu o painel. Sem `units`
 * (chamadas antigas) cai no default de lib/dates.js, que é o que o parque
 * inteiro usava antes de existir fuso por loja.
 *
 * Antes daqui usar `instantAt`, a comparação era `new Date('...T18:00')`, hora
 * local do navegador: um fechamento pontual em Manaus aparecia atrasado para o
 * gestor em São Paulo, e a diferença crescia com o tamanho da rede.
 */
export function completionOnTime(c, templates, index, units) {
  const deadline = index
    ? index.get(c.templateId)
    : (templates || []).find(t => t.id === c.templateId)?.deadline;
  if (!deadline || !c.date || !c.completedAt) return null;
  const limite = instantAt(c.date, deadline, tzOfUnit(units, c.unitId));
  return limite ? new Date(c.completedAt) <= limite : null;
}

/**
 * Índice templateId → prazo, para quem classifica MUITAS execuções de uma vez.
 * Sem ele, `completionOnTime` faz um `find` linear por execução, e o J.I.T.
 * refaz a conta a cada evento de realtime: numa rede com 50 lojas isso vira
 * milhões de comparações por checklist salvo por qualquer pessoa.
 */
export function deadlineIndex(templates) {
  return new Map((templates || []).map(t => [t.id, t.deadline]));
}

/* --- movidos na Fase 1b: estado do checklist no dia --- */

// Returns true if the given unit is marked as closed on the given date.
export const isUnitClosed = (closures, unitId, dateStr) =>
  closures.some(c => c.unitId === unitId && c.date === dateStr);

/**
 * Status do checklist no dia. Devolve 'done' | 'partial' | 'overdue' | 'pending'.
 *
 * `partial` existe porque "concluído" aqui sempre quis dizer só "foi submetido".
 * Um checklist fechado com 5 de 8 itens ficava verde, com a mesma cara de um 8/8
 * — e desde que o bloqueio passou a ser por tarefa, abrir esse "concluído" e
 * encontrar 3 itens executáveis deixava o rótulo contradizendo a própria tela.
 *
 * Submetido sem nenhum item feito também é `partial`: foi entregue (vazio), não
 * está pendente. Quem nunca foi submetido segue em `pending`/`overdue`, com a
 * regra de prazo intacta.
 */
export function templateStatus(t, completions, today, tz = APP_TZ) {
  const previstas = applicableItems(t, today).map(i => i.id);
  const p = roundProgress(completions, { templateId: t.id, unitId: t.unitId, date: today }, previstas);
  // A regra (e o porquê do prazo ser um INSTANTE no relógio da loja, não uma
  // comparação com o relógio de quem olha) está em lib/rounds.js, com teste.
  return statusFromProgress(p, { deadline: t.deadline, date: today, tz });
}

// Quantas das tarefas do dia foram feitas — para a tela dizer "5 de 8" em vez de
// só "parcial", que informa o estado mas não o tamanho do que falta.
export function templateProgress(t, completions, today) {
  return roundProgress(
    completions,
    { templateId: t.id, unitId: t.unitId, date: today },
    applicableItems(t, today).map(i => i.id),
  );
}
