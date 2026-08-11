/**
 * ZCheck — formatação de texto.
 *
 * Movido de `app/app/page.js` na Fase 1b: `truncName` é usado tanto pelo que
 * ficou em page.js quanto pela aba Relatórios, então precisa de casa neutra.
 *
 * REGRA: não pode importar de `app/`.
 */

export const truncName = (name, max = 22) => name && name.length > max ? name.slice(0, max).trim() + '…' : name;
