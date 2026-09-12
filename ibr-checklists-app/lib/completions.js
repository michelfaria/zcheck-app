/**
 * ZCheck — a LISTA de conclusões que o cliente carrega.
 *
 * O app não carrega o histórico inteiro: `fetchCompletions` (sync.js) traz os
 * últimos 90 dias, no máximo `COMPLETIONS_HORIZON` linhas, da MAIS RECENTE para
 * a mais antiga. Toda escrita local (submeter, realtime, cache offline) precisa
 * respeitar o mesmo teto — e o corte mora aqui, num lugar só.
 *
 * ── O defeito que este módulo corrige (11/09/2026) ───────────────────────────
 *
 * O teto era um `slice(-500)` posicional depois de um `push`: "fica com os 500
 * ÚLTIMOS do array". Só que o array vem do banco ordenado do mais novo para o
 * mais velho — os últimos são os mais ANTIGOS. Com mais de 500 linhas em memória
 * (três lojas × ~12 checklists por dia enchem isso em duas semanas), cada
 * "Concluir" apagava da tela as conclusões mais recentes: as de HOJE, inclusive.
 * Só a recém-submetida sobrevivia, porque entrava no fim do array.
 *
 * Na tela: a pessoa fecha Caixa com 100%, volta, e Praça de Alimentos, Bebidas e
 * Sala — feitos às 08:14 — aparecem ATRASADO. Ao recarregar, o banco devolve
 * tudo e os quatro voltam a CONCLUÍDO. Parecia falha de sincronização; era o
 * corte comendo o lado errado da lista. Vídeo do IBR3 em 11/09/2026.
 *
 * `capCompletions` corta pelo TEMPO (`completedAt`), não pela posição: sai a
 * mais antiga, sempre, seja qual for a ordem do array. E o teto passa a ser o
 * mesmo do fetch — cortar em 500 o que chegou com 1000 jogava fora metade do
 * horizonte do Painel a cada submissão, sem ninguém pedir.
 *
 * Função pura, sem React nem Supabase: tests/completions-cap.spec.mjs.
 */

/** Quantas conclusões o cliente mantém — no fetch e em toda escrita local. */
export const COMPLETIONS_HORIZON = 1000;

// Instante da conclusão, para ordenar. Sem `completedAt` (registro antigo,
// import) vale o meio-dia UTC do dia de operação; sem nada, conta como a mais
// antiga de todas — é o que se sabe dela.
const instanteDe = c => {
  const t = Date.parse(c?.completedAt || '');
  if (Number.isFinite(t)) return t;
  const d = Date.parse(c?.date ? `${c.date}T12:00:00Z` : '');
  return Number.isFinite(d) ? d : 0;
};

/**
 * Devolve no máximo `max` conclusões, descartando as MAIS ANTIGAS.
 *
 * Mantém a ordem relativa das que ficam (quem lê a lista já não depende da
 * ordem — ver `latestPerRound`/`roundProgress` — mas não há motivo para
 * embaralhar) e é idempotente por id: a última ocorrência no array vence, como
 * o upsert do lado do servidor. Devolve sempre um array novo.
 */
export function capCompletions(list, max = COMPLETIONS_HORIZON) {
  const arr = Array.isArray(list) ? list : [];
  const ultimaPorId = new Map();
  arr.forEach((c, i) => { if (c && c.id != null) ultimaPorId.set(c.id, i); });
  const unicas = arr.filter((c, i) => c && (c.id == null || ultimaPorId.get(c.id) === i));
  if (unicas.length <= max) return unicas;

  const excedente = unicas.length - max;
  const descartar = new Set(
    unicas
      .map((c, i) => ({ i, t: instanteDe(c) }))
      .sort((a, b) => a.t - b.t || a.i - b.i) // mais antiga primeiro
      .slice(0, excedente)
      .map(x => x.i),
  );
  return unicas.filter((_, i) => !descartar.has(i));
}
