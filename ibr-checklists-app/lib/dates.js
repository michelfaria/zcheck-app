/**
 * O "dia" do ZCheck — fonte única.
 *
 * Todo o app raciocina em dias de operação ('YYYY-MM-DD'): a execução de um
 * checklist, a folga da loja, a janela do J.I.T., o prazo do Fechamento. Esse
 * dia é o dia do RELÓGIO DA LOJA, nunca o dia UTC.
 *
 * Até 26/07/2026 o cliente calculava com `new Date().toISOString().slice(0,10)`,
 * que devolve a data em UTC. Em Brasília (UTC-3) isso vira o dia seguinte a
 * partir das 21:00 locais — exatamente a janela em que bar e restaurante rodam
 * o checklist de Fechamento. Efeito: a execução era gravada com a data de
 * amanhã e `completionOnTime` comparava o horário contra o prazo de amanhã, de
 * modo que todo Fechamento tardio aparecia como "no prazo".
 *
 * O servidor já assumia Brasília em três pontos independentes
 * (supabase/functions/notify-overdue, lib/adminApi.spDaysAgo e
 * lib/agentTeam.js) — o cliente era o único fora de sincronia.
 *
 * Fuso fixo, não fuso do navegador: numa rede, o gestor abre o painel de outra
 * cidade e precisa ver o MESMO dia que o operador na loja. Quando cada loja
 * puder ter fuso próprio, basta `todayStr(unit.timezone)` — as funções já
 * aceitam a zona como argumento e o default cobre todo o parque atual.
 */

export const APP_TZ = 'America/Sao_Paulo';

/** Dia de operação (YYYY-MM-DD) de um Date, no fuso da loja. */
export function dateStrOf(date, tz = APP_TZ) {
  // 'en-CA' formata como YYYY-MM-DD; com timeZone, o Intl faz a conversão.
  return date.toLocaleDateString('en-CA', { timeZone: tz });
}

/** Hoje, no fuso da loja. */
export const todayStr = (tz = APP_TZ) => dateStrOf(new Date(), tz);

/**
 * Aritmética de dias sobre a string, sem passar por fuso nenhum.
 *
 * Ancorar ao meio-dia UTC é de propósito: a data nunca chega perto de uma
 * borda de dia, então nem horário de verão nem offset quebram o resultado.
 */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Ontem, no fuso da loja. */
export const yesterdayStr = (tz = APP_TZ) => addDays(todayStr(tz), -1);

/** Dia de operação de N dias atrás (0 = hoje). */
export const daysAgoStr = (n, tz = APP_TZ) => addDays(todayStr(tz), -n);

/**
 * Lista de dias de operação, do mais antigo ao mais recente, terminando em
 * `end` (default: hoje). `lastDays(7)` = hoje + os 6 anteriores.
 */
export function lastDays(n, end = null, tz = APP_TZ) {
  const last = end || todayStr(tz);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(last, -i));
  return out;
}

/** Dia da semana (0=Dom … 6=Sáb) de um dia de operação. */
export const weekdayOf = dateStr => new Date(`${dateStr}T12:00:00Z`).getUTCDay();

/** Segunda-feira da semana de `dateStr`, como dia de operação. */
export const weekStartStr = dateStr => addDays(dateStr, -((weekdayOf(dateStr) + 6) % 7));
