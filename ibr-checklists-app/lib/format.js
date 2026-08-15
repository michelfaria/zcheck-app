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
 * Dia de operação ('YYYY-MM-DD') como '20/08/2026', para mostrar na tela.
 *
 * A âncora `T12:00:00` (hora LOCAL, sem sufixo de zona) é o ponto todo desta
 * função. `new Date('2026-08-20')` é lido como meia-noite UTC e, em Brasília,
 * volta como 19/08 — a mesma classe de erro que lib/dates.js existe para
 * fechar, só que na saída em vez da entrada. Ao meio-dia nenhum offset do país
 * chega perto da borda do dia.
 */
export const fmtDataCurta = dateStr =>
  dateStr ? new Date(`${String(dateStr).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '';
