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
  const porRodada = new Map();
  (completions || []).forEach(c => {
    if (!c) return;
    const k = roundKey(c);
    const atual = porRodada.get(k);
    if (!atual || (c.completedAt || '') > (atual.completedAt || '')) porRodada.set(k, c);
  });
  return [...porRodada.values()];
}
