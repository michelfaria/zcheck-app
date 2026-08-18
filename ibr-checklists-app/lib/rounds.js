/**
 * ZCheck — RODADA de checklist.
 *
 * Uma rodada é o par (loja, checklist, dia de operação). O app permite submeter
 * o mesmo checklist duas vezes no mesmo dia — às vezes é o certo (o turno refez
 * o serviço), e na execução colaborativa acontece sem ninguém querer: dois
 * colegas dividem o checklist e os dois apertam "Concluir".
 *
 * O problema nunca foi o registro duplicado — ele é histórico legítimo e
 * continua inteiro no relatório. O problema era a CONTAGEM: cada `completion`
 * carrega os itens de TODO MUNDO (com `doneBy` por tarefa), então duas
 * submissões creditavam as mesmas tarefas duas vezes e dobravam a produtividade
 * dos dois executores.
 *
 * `latestPerRound` resolve isso escolhendo uma submissão por rodada — a mais
 * recente, que é a que reflete o estado final do checklist. Sem apagar nada.
 *
 * Fica em lib/ pelo mesmo motivo que `dates.js`: regra de negócio enterrada num
 * componente React de 12 mil linhas não tem teste. Aqui tem (tests/rounds.spec.js).
 */

import { deadlineEnd, APP_TZ } from './dates';

/** Chave da rodada. `templateName` é o fallback de registros antigos sem id. */
export function roundKey(c) {
  return `${c?.unitId}|${c?.templateId || c?.templateName}|${c?.date}`;
}

/**
 * Uma submissão por rodada — a de `completedAt` mais recente.
 *
 * Empate ou `completedAt` ausente: fica a primeira que apareceu na lista. É
 * arbitrário de propósito — sem horário não há como saber qual venceu, e
 * inventar um critério (a de mais itens, por exemplo) mudaria a contagem
 * conforme a ordem de leitura do banco.
 *
 * @param {Array} completions
 * @returns {Array} subconjunto de `completions`, sem cópias
 */
export function latestPerRound(completions) {
  return umaPorRodada(completions, (nova, atual) => (nova.completedAt || '') > (atual.completedAt || ''));
}

/**
 * Uma submissão por rodada — a PRIMEIRA.
 *
 * Existe por causa da pontualidade, e só dela: uma rodada entregue às 9h dentro
 * do prazo não vira atrasada porque alguém reabriu uma tarefa e submeteu de novo
 * às 18h. Quem responde "entregou no prazo?" é a primeira entrega.
 *
 * Para todo o resto (completude, crédito, aderência) quem vale é
 * `latestPerRound`, que carrega a união das tarefas feitas.
 */
export function earliestPerRound(completions) {
  return umaPorRodada(completions, (nova, atual) => (nova.completedAt || '') < (atual.completedAt || ''));
}

// Sem `completedAt` em nenhuma das duas, fica a primeira que apareceu na lista —
// arbitrário de propósito: sem horário não há como saber qual venceu, e inventar
// critério mudaria a contagem conforme a ordem de leitura do banco.
function umaPorRodada(completions, vence) {
  const porRodada = new Map();
  (completions || []).forEach(c => {
    if (!c) return;
    const k = roundKey(c);
    const atual = porRodada.get(k);
    if (!atual || vence(c, atual)) porRodada.set(k, c);
  });
  return [...porRodada.values()];
}

/**
 * Tarefas JÁ REGISTRADAS hoje neste checklist — o que não se executa de novo.
 *
 * Fonte independente da rodada ao vivo (`live_tasks`), e é isso que importa: a
 * rodada pode não ter a marcação (a pessoa marcou offline, quem executou foi
 * outro aparelho, a purga levou uma rodada antiga) e ainda assim o serviço está
 * feito e gravado. Quem responde por "foi feito?" é a conclusão submetida.
 *
 * "Concluído" no cartão do checklist significa SUBMETIDO, não "tudo feito" —
 * quem fechou com 5 de 8 deixou 3 pendentes. Por isso o bloqueio é por tarefa:
 * barrar o checklist inteiro trancaria junto o trabalho que ainda falta.
 *
 * A foto aponta para o arquivo da conclusão anterior (`{completionId}/{itemId}.jpg`,
 * a convenção de `pushPhoto` em sync.js), então quem submeter de novo carrega a
 * evidência em vez de gravar um item sem prova.
 *
 * @returns {Object} itemId → { done, operatorUserId, operatorName, completedAt,
 *                              note, photoPath, submitted: true }
 */
export function submittedTasksFrom(completions, { templateId, unitId, date }) {
  const map = {};
  (completions || [])
    .filter(c => c && c.templateId === templateId && c.unitId === unitId && c.date === date)
    // Da mais antiga para a mais recente: em caso de repetição, a última vence.
    .sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''))
    .forEach(c => {
      (c.items || []).forEach(i => {
        if (!i?.done) return;
        map[i.id] = {
          done: true,
          operatorUserId: i.doneBy || c.operatorUserId || null,
          operatorName: i.doneByName || c.operatorName || null,
          completedAt: i.doneAt || c.completedAt || null,
          note: i.note || '',
          photoPath: i.hasPhoto ? `${c.id}/${i.id}.jpg` : null,
          submitted: true,
        };
      });
    });
  return map;
}

/**
 * Este checklist era previsto NAQUELE dia?
 *
 * Sem esta janela, "previstos" saía da lista ATUAL de checklists para qualquer
 * data passada — e o passado mudava sozinho: criar um checklist inflava o
 * previsto de todos os dias anteriores (derrubando a aderência histórica) e
 * apagar um encolhia o denominador (jogando a aderência de dias já fechados
 * acima de 100%). Ver 20260730_templates_desativar.sql.
 *
 * Datas ausentes = comportamento antigo, de propósito: checklist sem `createdAt`
 * conta como "sempre existiu", que é o que as linhas já gravadas significam. A
 * comparação é por STRING de data (YYYY-MM-DD): o dia de operação já vem
 * resolvido no fuso da loja, e converter para Date aqui reintroduziria UTC.
 */
export function templateExistedOn(t, dateStr) {
  if (!t || !dateStr) return true;
  if (t.createdAt && String(t.createdAt).slice(0, 10) > dateStr) return false;
  if (t.deactivatedAt && String(t.deactivatedAt).slice(0, 10) <= dateStr) return false;
  return true;
}

/**
 * Progresso REAL da rodada: quantas das tarefas previstas para o dia foram
 * feitas, somando todas as submissões.
 *
 * Existe porque "concluído" no cartão sempre significou apenas "existe conclusão
 * gravada" — um checklist fechado com 5 de 8 itens aparecia igualzinho a um 8/8,
 * em verde. `submissions` é separado de `done` de propósito: dá para submeter com
 * zero item feito, e isso é uma entrega (incompleta), não uma pendência.
 *
 * A união entre submissões é a semântica certa: tarefa feita em QUALQUER
 * submissão do dia está feita. E a interseção com `applicableItemIds` é o que
 * impede um item que saiu do checklist (removido, ou fora da recorrência do dia)
 * de inflar o numerador e fazer um parcial parecer completo.
 *
 * Uma passada só, sem alocar mapa de evidência: isto roda por checklist a cada
 * render das listas.
 */
export function roundProgress(completions, { templateId, unitId, date }, applicableItemIds) {
  const previstas = new Set(applicableItemIds || []);
  const feitas = new Set();
  let submissions = 0;
  (completions || []).forEach(c => {
    if (!c || c.templateId !== templateId || c.unitId !== unitId || c.date !== date) return;
    submissions++;
    (c.items || []).forEach(i => { if (i?.done && previstas.has(i.id)) feitas.add(i.id); });
  });
  return { submissions, done: feitas.size, total: previstas.size };
}

/**
 * A rodada foi entregue COMPLETA?
 *
 * É a régua da aderência desde 30/07/2026: entrega incompleta não conta como
 * entrega. Antes, submeter com 1 de 8 itens contava igual a 8 de 8 — a aderência
 * media se ALGUÉM APERTOU "Concluir", não se o trabalho foi feito.
 *
 * `applicableItemIds` é o que era previsto para AQUELE dia; sem ele (checklist
 * apagado antes da migration de desativação, registro órfão) cai nos itens do
 * próprio registro, que é o que o operador tinha na tela. Rodada sem item
 * nenhum não é completa: não há trabalho comprovado.
 *
 * Usa a MESMA fonte do badge da tela (`roundProgress`/`applicableItems`) de
 * propósito: aderência e rótulo discordando seria pior que os dois errados.
 */
export function roundIsComplete(completion, applicableItemIds) {
  const feitas = new Set((completion?.items || []).filter(i => i?.done).map(i => i.id));
  const previstas = applicableItemIds && applicableItemIds.length
    ? applicableItemIds
    : (completion?.items || []).map(i => i?.id).filter(Boolean);
  if (!previstas.length) return false;
  return previstas.every(id => feitas.has(id));
}

/**
 * Status do checklist no dia: `done` | `partial` | `overdue` | `pending`.
 *
 * Duas regras, nesta ordem:
 *
 *  1. Foi submetido? Então é `done` (todas as previstas feitas) ou `partial`.
 *     Submetido sem nenhum item feito é `partial`: entregue vazio não é pendência.
 *  2. Não foi submetido? Então depende do PRAZO — que é um instante no relógio da
 *     LOJA, não um par de números comparado com o relógio de quem olha.
 *
 * A regra 2 corrige três defeitos da versão que comparava `new Date().getHours()`
 * com a hora do prazo:
 *
 *   · fuso de quem olha: gerência em outro fuso via "Atrasado" na hora errada;
 *   · a DATA era ignorada — um dia passado só aparecia como atrasado se o relógio
 *     de agora por acaso estivesse depois do horário do prazo;
 *   · virada de meia-noite: prazo 23:30 contra 00:10 dava "no prazo".
 *
 * O prazo vence no FIM do seu minuto (`deadlineEnd`): com prazo 18:20, o
 * checklist só vira `overdue` às 18:21 — enquanto o relógio da loja ainda marca
 * 18:20, o minuto combinado está sendo cumprido. Ver lib/dates.js.
 *
 * `agora` é injetável para o teste poder fixar o instante.
 */
export function statusFromProgress(progress, { deadline, date, tz = APP_TZ } = {}, agora = new Date()) {
  const p = progress || { submissions: 0, done: 0, total: 0 };
  if (p.submissions > 0) return p.total > 0 && p.done >= p.total ? 'done' : 'partial';
  if (deadline && date) {
    const limite = deadlineEnd(date, deadline, tz);
    if (limite && agora >= limite) return 'overdue';
  }
  return 'pending';
}

/**
 * Rodada ao vivo + tarefas já registradas, numa visão só — o que a tela usa.
 *
 * Precedência:
 *  1. REABERTURA deliberada manda (`reopenedCount > 0` com a tarefa pendente):
 *     a tarefa volta a ser executável mesmo tendo sido registrada antes. É o
 *     sentido de reabrir, e sem esta regra o registro que se quer refazer
 *     trancaria a própria correção.
 *  2. Rodada com a tarefa CONCLUÍDA manda: traz o executor mais fresco.
 *  3. Fora disso, o registro gravado vence. Uma linha `done: false` na rodada
 *     pode ser só um rascunho de evidência (nota entra na rodada sem concluir
 *     nada) e não desfaz um serviço já entregue.
 *
 * Nota e foto se somam nos dois sentidos: o que a rodada tem de mais recente
 * prevalece, o que falta vem do registro anterior.
 *
 * `submitted: true` é o que BLOQUEIA refazer, e ele acompanha o registro
 * gravado — não a rodada. Isso vale inclusive quando a rodada já tem a tarefa
 * como concluída: aí o executor vem da rodada (mais fresco) mas a marca de
 * "já registrada" tem que sobreviver. Foi exatamente aqui que a primeira versão
 * errou: no caso mais comum de todos — a pessoa marca, conclui o checklist e
 * volta, com a linha da rodada ainda `done = true` no nome dela — a rodada
 * ganhava inteira, `submitted` se perdia e o toque caía no antigo caminho de
 * reabertura em vez de barrar. Teste real de 30/07 mostrou "Concluída por você"
 * onde devia estar "Registrada por você".
 */
export function mergeRoundState(live, submitted) {
  const out = { ...(live || {}) };
  Object.entries(submitted || {}).forEach(([id, sub]) => {
    const l = (live || {})[id];
    // Reabertura deliberada: a tarefa volta a ser pendente e executável.
    if (l && !l.done && (l.reopenedCount || 0) > 0) return;
    out[id] = l?.done
      // Rodada concluída + já registrada: executor da rodada, trava do registro.
      ? { ...l, submitted: true, note: l.note || sub.note, photoPath: l.photoPath || sub.photoPath }
      : { ...sub, note: l?.note || sub.note, photoPath: l?.photoPath || sub.photoPath };
  });
  return out;
}
