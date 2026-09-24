/**
 * ZCheck — RECORRÊNCIA da tarefa: em que dias ela vale.
 *
 * Fonte ÚNICA da pergunta "esta tarefa é prevista neste dia pelo calendário?".
 * `isItemApplicable` (lib/checklists.js) é a única porta de entrada para o resto
 * do app — previstos, entregas, carryover, Executar, Painel, J.I.T. e ranking
 * chegam aqui por ela. Se dois lugares respondessem essa pergunta com regras
 * diferentes, o previsto e o entregue deixariam de andar juntos e a aderência
 * passaria de 100% (ver tests/ativacao-loja.spec.mjs e tests/recorrencia.spec.mjs).
 *
 * ── Os dois formatos ─────────────────────────────────────────────────────────
 *
 *  · `recurrence` — array de dias da semana (0=Dom … 6=Sáb). Vazio ou ausente =
 *    todos os dias. É o formato original e continua intocado.
 *
 *  · `period` — { every, unit: 'day' | 'week' | 'month', start: 'YYYY-MM-DD' }.
 *    A tarefa periódica (24/09/2026): "todo dia 10", "a cada 3 meses a partir
 *    de 10/10/2026", "a cada 2 semanas", "a cada 15 dias". Existe porque o
 *    produto passou a atender qualquer operação física, e extintor, dedetização,
 *    manutenção e caixa d'água são rotinas de escritório, clínica e farmácia
 *    que não cabem em dia da semana.
 *
 *    "Todo dia 10" não é um formato à parte: é { every: 1, unit: 'month' } com
 *    `start` no próximo dia 10. Uma forma só para a regra, quatro modos só na
 *    tela (components/RecurrenceEditor.js).
 *
 * ── Por que um campo NOVO, e não um objeto dentro de `recurrence` ────────────
 *
 * Código antigo faz `item.recurrence.includes(...)`. Um objeto ali derrubaria
 * com TypeError a aba que ficou aberta no tablet da loja desde antes do deploy
 * (o realtime entrega o template novo para o bundle velho), e também a edge
 * function `notify-overdue`, que é deployada à parte. Campo novo, o código
 * antigo simplesmente não o enxerga: degrada, não quebra.
 *
 * ── As regras ────────────────────────────────────────────────────────────────
 *
 *  · `period` válido manda, e `recurrence` é ignorado. O editor limpa um ao
 *    gravar o outro; a precedência existe para o dado que chegar misturado.
 *  · `period` inválido (unidade desconhecida, `every` fora de 1…366, `start`
 *    que não é uma data de verdade) conta como ausente e cai no dia da semana.
 *    Tarefa que aparece todo dia é um erro que alguém vê; tarefa que some é um
 *    erro que ninguém vê.
 *  · Antes de `start`, nada. Configurar uma periódica hoje não cria previsto
 *    nos dias que já passaram.
 *  · Mês: o dia é o de `start`. Em mês mais curto, o último dia do mês (dia 31
 *    → 30/04, 28/02). A conta sai SEMPRE de `start`, nunca da ocorrência
 *    anterior — senão 31/01 → 28/02 → 28/03 derivaria para o dia 28 para sempre.
 *  · Semana: o dia da semana de `start`, a cada 7 × N dias.
 *
 * Tudo aqui é aritmética de STRING. O `dateStr` já chega no relógio da loja
 * (`todayStr(tzOf(unit))`); passar por `Date` local reintroduziria o fuso de
 * quem abriu a tela — o defeito que lib/dates.js existe para fechar.
 *
 * ESPELHO: supabase/functions/notify-overdue/index.ts (`periodoVale`). A função
 * é deployada isolada e não importa daqui; o teste de lá compara as duas regras
 * dia a dia, então mexeu aqui, mexa lá.
 *
 * REGRA: este módulo não pode importar de `app/`. Só de outros `lib/`.
 */

import { weekdayOf, addDays } from './dates';

export const PERIOD_UNITS = ['day', 'week', 'month'];
export const PERIOD_MAX_EVERY = 366;
export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const AOS_DIAS = ['aos domingos', 'às segundas', 'às terças', 'às quartas', 'às quintas', 'às sextas', 'aos sábados'];

const pad = n => String(n).padStart(2, '0');
const partes = s => s.split('-').map(Number);

/** Quantos dias tem o mês (`mes` de 1 a 12). */
export const diasNoMes = (ano, mes) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

// `new Date('2026-02-30')` vira 02/03 sem reclamar — a validação é explícita.
const ehData = s => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = partes(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= diasNoMes(y, m);
};
export { ehData as ehDataValida };

const diffDias = (a, b) =>
  Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);

export function periodoValido(p) {
  if (!p || typeof p !== 'object') return false;
  const n = Number(p.every);
  return PERIOD_UNITS.includes(p.unit)
    && Number.isInteger(n) && n >= 1 && n <= PERIOD_MAX_EVERY
    && ehData(p.start);
}

/** O período (já validado) cai em `dateStr`? */
export function periodoVale(p, dateStr) {
  if (!ehData(dateStr) || dateStr < p.start) return false;
  const n = Number(p.every);
  if (p.unit === 'day') return diffDias(dateStr, p.start) % n === 0;
  if (p.unit === 'week') return diffDias(dateStr, p.start) % (7 * n) === 0;
  const [y0, m0, d0] = partes(p.start);
  const [y, m, d] = partes(dateStr);
  const meses = (y - y0) * 12 + (m - m0);
  return meses % n === 0 && d === Math.min(d0, diasNoMes(y, m));
}

/** A tarefa é prevista em `dateStr` pelo calendário (sem `appearsIn`, que é do checklist)? */
export function recorrenciaVale(item, dateStr) {
  if (periodoValido(item?.period)) return periodoVale(item.period, dateStr);
  const rec = item?.recurrence;
  if (!Array.isArray(rec) || rec.length === 0) return true;
  return rec.includes(weekdayOf(dateStr));
}

/**
 * Modo do editor: 'diaria' | 'semana' | 'mes' | 'intervalo'.
 * "A cada 1 mês" volta como 'mes' — é a mesma regra, e o modo mais simples.
 */
export function modoRecorrencia(item) {
  if (periodoValido(item?.period)) {
    return item.period.unit === 'month' && Number(item.period.every) === 1 ? 'mes' : 'intervalo';
  }
  return Array.isArray(item?.recurrence) && item.recurrence.length ? 'semana' : 'diaria';
}

/**
 * Primeiro dia a partir de `hoje` (inclusive) que é EXATAMENTE o dia `dia` do
 * mês — o `start` de "todo dia N". Exato, e não o último dia do mês corrente:
 * `start` é a âncora do dia, e ancorar "dia 31" em 30/09 faria a tarefa cair
 * no dia 30 dali em diante.
 */
export function inicioNoDiaDoMes(dia, hoje) {
  const n = Number(dia);
  if (!Number.isInteger(n) || n < 1 || n > 31 || !ehData(hoje)) return null;
  let [y, m] = partes(hoje);
  for (let i = 0; i < 13; i++) {
    if (n <= diasNoMes(y, m)) {
      const s = `${y}-${pad(m)}-${pad(n)}`;
      if (s >= hoje) return s;
    }
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return null;
}

/** As próximas `n` datas em que a tarefa vale, a partir de `desde` (inclusive). */
export function proximasOcorrencias(item, desde, n = 3) {
  if (!ehData(desde) || n <= 0) return [];
  const out = [];
  if (periodoValido(item?.period)) {
    const p = item.period;
    const every = Number(p.every);
    if (p.unit === 'month') {
      const [y0, m0, d0] = partes(p.start);
      const [y1, m1] = partes(desde > p.start ? desde : p.start);
      let k = Math.floor(((y1 - y0) * 12 + (m1 - m0)) / every);
      while (out.length < n) {
        const total = (m0 - 1) + k * every;
        const y = y0 + Math.floor(total / 12);
        const m = (total % 12) + 1;
        const s = `${y}-${pad(m)}-${pad(Math.min(d0, diasNoMes(y, m)))}`;
        if (s >= desde) out.push(s);
        k += 1;
      }
      return out;
    }
    const passo = p.unit === 'week' ? 7 * every : every;
    let d = desde > p.start ? addDays(p.start, Math.ceil(diffDias(desde, p.start) / passo) * passo) : p.start;
    while (out.length < n) { out.push(d); d = addDays(d, passo); }
    return out;
  }
  for (let d = desde, i = 0; out.length < n && i < 7 * n + 7; d = addDays(d, 1), i++) {
    if (recorrenciaVale(item, d)) out.push(d);
  }
  return out;
}

const ddmm = s => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const ddmmaaaa = s => `${ddmm(s)}/${s.slice(0, 4)}`;

/**
 * A recorrência em português.
 *
 * `curta` é o selo da tarefa na execução ("Seg/Qua", "Todo dia 10") e devolve
 * `null` para todos os dias — tarefa diária não leva selo. A longa é o título
 * do editor e diz tudo, inclusive desde quando.
 */
export function descreverRecorrencia(item, { curta = false } = {}) {
  if (periodoValido(item?.period)) {
    const { unit, start } = item.period;
    const n = Number(item.period.every);
    const dia = Number(start.slice(8, 10));
    if (unit === 'month') {
      if (n === 1) {
        return curta ? `Todo dia ${dia}` : `Todo dia ${dia} do mês`;
      }
      if (n === 12) return curta ? `Todo ano em ${ddmm(start)}` : `Todo ano em ${ddmm(start)}, desde ${ddmmaaaa(start)}`;
      return curta ? `A cada ${n} meses` : `A cada ${n} meses, no dia ${dia}, desde ${ddmmaaaa(start)}`;
    }
    if (unit === 'week') {
      const quando = n === 1 ? 'Toda semana' : `A cada ${n} semanas`;
      return curta ? quando : `${quando}, ${AOS_DIAS[weekdayOf(start)]}, desde ${ddmmaaaa(start)}`;
    }
    const quando = n === 1 ? 'Todo dia' : `A cada ${n} dias`;
    return curta ? quando : `${quando}, desde ${ddmmaaaa(start)}`;
  }
  const rec = item?.recurrence;
  if (!Array.isArray(rec) || rec.length === 0) return curta ? null : 'Todos os dias';
  return curta ? rec.map(d => WEEKDAY_LABELS[d]).join('/') : `Apenas: ${rec.map(d => WEEKDAY_LABELS[d]).join(', ')}`;
}
