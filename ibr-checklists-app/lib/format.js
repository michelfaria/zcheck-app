/**
 * ZCheck — formatação de texto.
 *
 * Movido de `app/app/page.js` na Fase 1b: `truncName` é usado tanto pelo que
 * ficou em page.js quanto pela aba Relatórios, então precisa de casa neutra.
 *
 * REGRA: não pode importar de `app/`.
 */

export const truncName = (name, max = 22) => name && name.length > max ? name.slice(0, max).trim() + '…' : name;

/**
 * Dia de operação ('YYYY-MM-DD') como o brasileiro lê: '03/08'.
 *
 * Fatia a string em vez de construir um `Date`: o dia de operação já vem
 * resolvido no fuso da loja, e passar por `Date` aqui reintroduziria UTC —
 * é o defeito que `lib/dates.js` existe para não deixar acontecer de novo.
 */
export const ddmm = (dateStr) =>
  (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr))
    ? `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`
    : '';
