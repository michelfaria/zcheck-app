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

import { weekdayOf, instantAt, addDays, tzOfUnit, APP_TZ } from './dates';
import { roundIsComplete, roundProgress, statusFromProgress, templateExistedOn } from './rounds';

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

/** Dias inteiros entre dois dias de operação (a − b), sem passar por fuso. */
const diffDias = (a, b) =>
  Math.round((new Date(`${a}T12:00:00Z`) - new Date(`${b}T12:00:00Z`)) / 86400000);

/**
 * CARRYOVER — tarefas periódicas que vazaram de dias anteriores.
 *
 * Uma tarefa de seg/qua/sex não feita na segunda deixava de existir na terça:
 * virava push de atraso, número na aderência do dia, e sumia. Esta função é a
 * memória que faltava — ela responde "o que este checklist deve a `dateStr`?"
 * varrendo os dias anteriores por ocorrências previstas e nunca quitadas.
 *
 * Mora aqui, e não em `rounds.js`, porque a pergunta é do domínio do CHECKLIST
 * ("quais itens valem hoje"), não da rodada. É também o que evita o ciclo de
 * import: quem precisa de `applicableItems` tem que estar deste lado.
 *
 * As regras, decididas em conselho (10/08/2026):
 *
 *  · SÓ tarefa com `carryover: true` arrasta. Arrastar é propriedade semântica
 *    da tarefa — "limpar a coifa" (estado do mundo) arrasta; "conferir câmaras
 *    na abertura" (momento do dia) não faz sentido cobrar depois. Quem sabe a
 *    diferença é quem cria o checklist, então a flag é opt-in por tarefa.
 *
 *  · CORTE DE RETROATIVIDADE em `carryoverSince` (YYYY-MM-DD), carimbado por
 *    quem liga a flag. A flag nascer desligada NÃO basta: no instante em que
 *    alguém a liga numa terça, a varredura alcançaria a sexta anterior e a
 *    tarefa estrearia cobrando dívida de dias em que a regra não existia. Com o
 *    corte, a janela começa no dia da ativação. Sem o campo (registro antigo,
 *    import sem a coluna) vale a janela cheia — comportamento explícito, não
 *    acidente: quem gravou a flag sem data pediu a regra sem corte.
 *
 *  · QUITAÇÃO: a tarefa feita (união das submissões do dia, como em
 *    `roundProgress`) em QUALQUER dia quita tudo até ali — fazer na quarta paga
 *    a dívida de segunda. Submeter o checklist sem fazer a tarefa NÃO quita: a
 *    régua é a de `roundIsComplete`, tarefa não feita é pendência.
 *
 *  · `dataOriginal` é a ocorrência não quitada MAIS ANTIGA dentro da janela —
 *    uma instância só por tarefa, nunca uma pilha de cópias na tela.
 *
 *  · Dia de FOLGA (`closures`) não gera dívida, e a janela de existência do
 *    checklist (`templateExistedOn`) vale para trás também — o que só passou a
 *    valer de verdade com o backfill de `templates.created_at` (11/08/2026).
 *
 *  · TETO de 7 dias por padrão. Não é tuning, é condição de correção: pendência
 *    é derivada da AUSÊNCIA de conclusão, e o cliente só carrega 90 dias / 1000
 *    linhas de `completions` (sync.js) — varrer além do horizonte de dados
 *    transformaria "dado não carregado" em cobrança indevida.
 *
 * `dateStr` já chega resolvido no relógio da loja (`todayStr(tzOf(unit))`);
 * daqui para trás é aritmética de string (`addDays`), sem fuso.
 *
 * A aderência NÃO usa esta função: o arrastado aparece na lista do operador mas
 * não entra no denominador do dia novo — senão o mesmo esquecimento derrubaria
 * a métrica de segunda, terça e quarta.
 *
 * @returns {Array<{itemId, dataOriginal, diasArrastado}>}
 */
export function pendenciasArrastadas(template, completions, closures, dateStr, teto = 7) {
  if (!template || !dateStr || !Array.isArray(template.items) || teto <= 0) return [];
  const arrastaveis = template.items.filter(i => i && i.carryover === true);
  if (!arrastaveis.length) return [];

  const inicio = addDays(dateStr, -teto);

  // date → Set(itemIds feitos), união das submissões de cada dia da janela.
  const feitasPorDia = new Map();
  (completions || []).forEach(c => {
    if (!c || c.templateId !== template.id || c.unitId !== template.unitId) return;
    if (!c.date || c.date < inicio || c.date > dateStr) return;
    let set = feitasPorDia.get(c.date);
    if (!set) feitasPorDia.set(c.date, set = new Set());
    (c.items || []).forEach(i => { if (i?.done) set.add(i.id); });
  });

  // Previstas de cada dia pela MESMA régua da tela (`applicableItems`), em cache
  // porque a janela revisita os mesmos dias uma vez por tarefa arrastável.
  const previstasEm = new Map();
  const aplicaEm = d => {
    let s = previstasEm.get(d);
    if (!s) previstasEm.set(d, s = new Set(applicableItems(template, d).map(i => i.id)));
    return s;
  };

  const out = [];
  arrastaveis.forEach(item => {
    // A última vez que foi feita quita tudo até ali (inclusive hoje).
    let ultimaFeita = null;
    for (let d = dateStr; d >= inicio; d = addDays(d, -1)) {
      if (feitasPorDia.get(d)?.has(item.id)) { ultimaFeita = d; break; }
    }
    // A ocorrência prevista mais antiga depois da quitação — e antes de hoje.
    // O corte de ativação nunca deixa a varredura passar do dia em que a flag
    // foi ligada, mesmo com a janela do teto aberta antes dele.
    const desde = ultimaFeita ? addDays(ultimaFeita, 1) : inicio;
    const piso = item.carryoverSince && item.carryoverSince > desde ? item.carryoverSince : desde;
    for (let d = piso; d < dateStr; d = addDays(d, 1)) {
      if (!templateExistedOn(template, d)) continue;
      if (isUnitClosed(closures || [], template.unitId, d)) continue;
      if (!aplicaEm(d).has(item.id)) continue;
      out.push({ itemId: item.id, dataOriginal: d, diasArrastado: diffDias(dateStr, d) });
      break;
    }
  });
  return out;
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
