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
 * Fuso da LOJA, não do navegador: numa rede, o gestor abre o painel de outra
 * cidade e precisa ver o MESMO dia que o operador na loja. Cada unidade tem sua
 * zona em `units.timezone` (default America/Sao_Paulo, que cobre a maior parte
 * do Brasil); `tzOf(unit)` resolve, e todas as funções daqui aceitam a zona.
 */

export const APP_TZ = 'America/Sao_Paulo';

/**
 * Fusos oferecidos na configuração da loja.
 *
 * O Brasil inteiro cabe em quatro: as demais zonas IANA brasileiras
 * (America/Bahia, America/Fortaleza, America/Cuiaba…) são hoje equivalentes a
 * uma destas — mesmo offset, mesmas regras, sem horário de verão desde 2019.
 * Os rótulos citam os estados porque quem configura é o dono do bar, não um
 * sysadmin: "America/Rio_Branco" não diz nada, "Acre" diz.
 */
export const TIMEZONES = [
  { id: 'America/Sao_Paulo',   label: 'Brasília (UTC−3)',            hint: 'SP, RJ, MG, Sul, Nordeste, DF, GO, PA' },
  { id: 'America/Manaus',      label: 'Manaus (UTC−4)',              hint: 'AM, RO, RR, MT, MS' },
  { id: 'America/Rio_Branco',  label: 'Rio Branco (UTC−5)',          hint: 'AC e oeste do AM' },
  { id: 'America/Noronha',     label: 'Fernando de Noronha (UTC−2)', hint: 'Arquipélago' },
];

/** Fuso de uma loja. Loja sem zona definida opera em Brasília. */
export const tzOf = unit => unit?.timezone || APP_TZ;

/** Fuso da loja `unitId` dentro de uma lista de lojas. */
export const tzOfUnit = (units, unitId) =>
  tzOf((units || []).find(u => u.id === unitId));

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

/**
 * Quanto o fuso `tz` estava adiantado/atrasado em relação a UTC, em ms, no
 * instante `date`. Formata a hora local naquela zona e compara com o mesmo
 * instante lido como UTC — a diferença É o offset.
 */
function tzOffsetMs(date, tz) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
  // hourCycle 'h23' pode devolver 24 na virada; Date.UTC normaliza.
  const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return comoUTC - date.getTime();
}

/**
 * O instante absoluto em que o relógio da loja marca `dateStr` às `timeStr`.
 *
 * É disto que o prazo depende: "fechamento até as 22:00" são 22:00 NA LOJA. Com
 * uma rede em fusos diferentes, comparar contra o relógio de quem abriu o
 * painel erra por horas — um fechamento pontual em Manaus apareceria atrasado
 * para o gestor em São Paulo.
 *
 * O offset é aplicado duas vezes de propósito: a primeira passada chuta o
 * instante, a segunda corrige o caso em que esse chute cai do outro lado de uma
 * transição de horário de verão. O Brasil não tem DST desde 2019, mas a função
 * não é só do Brasil e o custo é uma multiplicação.
 */
export function instantAt(dateStr, timeStr, tz = APP_TZ) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm = 0] = String(timeStr).split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh)) return null;
  const ingenuo = Date.UTC(y, m - 1, d, hh, mm, 0);
  let ts = ingenuo - tzOffsetMs(new Date(ingenuo), tz);
  ts = ingenuo - tzOffsetMs(new Date(ts), tz);
  return new Date(ts);
}

/** Um minuto, em ms — a granularidade em que o prazo é escrito e cobrado. */
const UM_MINUTO = 60_000;

/**
 * O instante em que o prazo REALMENTE vence: o fim do minuto do prazo.
 *
 * O prazo é escrito em minutos ("18:20"), então tem que ser cobrado em minutos.
 * `instantAt` devolve 18:20:00, e comparar a entrega contra ele fazia de
 * 18:20:37 um atraso — um checklist entregue às 18:20 no relógio da loja, com o
 * painel exibindo "prazo 18:20" logo ao lado, aparecia como "atrasado" e todas
 * as suas tarefas ganhavam a tarja "fora do prazo". A pessoa cumpriu o minuto
 * combinado e foi punida pelos segundos, que ela não vê em lugar nenhum.
 *
 * A regra passa a ser: só é atraso a partir do MINUTO SEGUINTE ao do prazo. O
 * limite é aberto — `entrega < deadlineEnd` é pontual, `>=` é atraso — de modo
 * que 18:20:59.999 ainda cumpre e 18:21:00.000 não.
 *
 * É a mesma régua que `supabase/functions/notify-overdue` sempre usou para
 * disparar o alerta de atraso (compara minutos inteiros, `minutes > h*60+m`).
 * Até aqui o cliente era mais severo que o servidor: existia a faixa de 60
 * segundos em que o painel dizia "atrasado" sem que nenhum alerta tivesse saído.
 */
export function deadlineEnd(dateStr, timeStr, tz = APP_TZ) {
  const inicio = instantAt(dateStr, timeStr, tz);
  return inicio ? new Date(inicio.getTime() + UM_MINUTO) : null;
}

/** Dia da semana (0=Dom … 6=Sáb) de um dia de operação. */
export const weekdayOf = dateStr => new Date(`${dateStr}T12:00:00Z`).getUTCDay();

/** Segunda-feira da semana de `dateStr`, como dia de operação. */
export const weekStartStr = dateStr => addDays(dateStr, -((weekdayOf(dateStr) + 6) % 7));
