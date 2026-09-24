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

/* ── Recarga incremental: o que o realtime perdeu ─────────────────────────────
 *
 * O realtime (`subscribeToCompletions`) só entrega o INSERT que acontece com o
 * socket vivo. Celular com o app em segundo plano derruba o socket, e o que
 * outro aparelho gravou nesse intervalo não chega nunca: a lista em memória
 * fica parada no momento em que a pessoa guardou o celular.
 *
 * Caso do IBR2, 24/09/2026 (Abertura Pca Bebidas): o Michel concluiu com 2 de
 * 10 às 07:35 e guardou o celular. O Nicolas marcou as outras 8 e o app dele
 * concluiu sozinho às 07:38 (10/10, `auto: true`) — a conclusão estava no
 * banco. Às 08:17 o aparelho do Michel ainda mostrava "Parcial · 2 de 10" e,
 * dentro do checklist, 10 de 10 com o botão "Concluir" aceso: as marcações
 * vinham frescas de `live_tasks`, a lista de conclusões era a das 07:35. A
 * equipe leu como "o checklist não conclui".
 *
 * A recarga pede ao banco só o que foi GRAVADO depois da marca-d'água —
 * `created_at`, relógio do servidor, que nem um aparelho com hora errada nem
 * uma fila offline drenada horas depois conseguem enganar — e junta à lista.
 */

// Folga da marca-d'água: `created_at` é o início da transação, então uma linha
// pode ficar visível DEPOIS de outra com carimbo mais novo. Cinco minutos de
// sobreposição custam só as linhas repetidas, que `juntarConclusoes` descarta.
const FOLGA_MARCA_MS = 5 * 60 * 1000;
// Sem marca (lista vinda de um cache anterior a `createdAt`, ou vazia): dois
// dias cobrem hoje e ontem, que é o que a Rotina e o Painel do dia leem.
const JANELA_SEM_MARCA_MS = 48 * 60 * 60 * 1000;

/**
 * O `createdAt` mais recente da lista, ou `null`.
 *
 * Só serve para linhas que vieram de uma LEITURA do banco. Linha do realtime
 * não pode empurrar a marca: se o socket voltou e entregou uma conclusão das
 * 08:17, a das 07:38 que ele perdeu ficaria para trás da marca e nunca seria
 * pedida. Por isso quem chama passa a carga inicial e as recargas, e nada mais.
 */
export function marcaDagua(list) {
  let max = null;
  let maxT = -Infinity;
  (Array.isArray(list) ? list : []).forEach(c => {
    const t = Date.parse(c?.createdAt || '');
    if (Number.isFinite(t) && t > maxT) { maxT = t; max = c.createdAt; }
  });
  return max;
}

/** A marca mais nova entre duas (qualquer uma pode ser `null`). */
export function marcaMaisNova(a, b) {
  const ta = Date.parse(a || '');
  const tb = Date.parse(b || '');
  if (!Number.isFinite(tb)) return Number.isFinite(ta) ? a : null;
  if (!Number.isFinite(ta)) return b;
  return tb > ta ? b : a;
}

/** Instante (ISO) a partir do qual pedir as conclusões ao banco. */
export function inicioDaRecarga(marca, agoraMs = Date.now()) {
  const t = Date.parse(marca || '');
  return new Date(Number.isFinite(t) ? t - FOLGA_MARCA_MS : agoraMs - JANELA_SEM_MARCA_MS).toISOString();
}

/**
 * Junta o que a recarga trouxe à lista em memória. Só ACRESCENTA.
 *
 * Linha que já está na lista fica como está, pelo mesmo motivo do handler do
 * realtime: a da memória carrega os vereditos da conferência grudados nos
 * itens (`annotateReviews`), e a do banco não — trocar uma pela outra apagaria
 * da tela o que a liderança julgou. Devolve a MESMA referência quando não há
 * nada novo, para não re-renderizar o app inteiro a cada volta do segundo plano.
 */
export function juntarConclusoes(prev, novas, max = COMPLETIONS_HORIZON) {
  const atual = Array.isArray(prev) ? prev : [];
  const ids = new Set(atual.map(c => c?.id));
  const faltam = (Array.isArray(novas) ? novas : []).filter(c => c && !ids.has(c.id));
  if (!faltam.length) return prev;
  return capCompletions([...atual, ...faltam], max);
}
