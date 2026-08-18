/**
 * Trava a regressão do "dia UTC".
 *
 * O bug original (`new Date().toISOString().slice(0,10)`) sobreviveu desde o
 * commit inicial porque nada aqui era testável: o cálculo do dia estava
 * espalhado em vinte lugares dentro de um componente React de 6900 linhas.
 * Com lib/dates.js ele virou função pura — estes testes custam meio segundo.
 *
 * Roda no runner do Playwright (já é dependência do baseline visual), mas não
 * abre browser: é lógica pura.
 *
 *   npx playwright test tests/dates.spec.js
 */

const { test, expect } = require('@playwright/test');

let dates;
test.beforeAll(async () => { dates = await import('../lib/dates.js'); });

test.describe('dia de operação', () => {
  test('21h em Brasília ainda é o dia de hoje, não o de amanhã', () => {
    // 26/07/2026 21:16 BRT — o horário exato em que o bug foi observado.
    // Era aqui que `toISOString()` devolvia 2026-07-27.
    expect(dates.dateStrOf(new Date('2026-07-27T00:16:00Z'))).toBe('2026-07-26');
  });

  test('vira o dia à meia-noite de Brasília, não à de Londres', () => {
    expect(dates.dateStrOf(new Date('2026-07-27T02:59:00Z'))).toBe('2026-07-26');
    expect(dates.dateStrOf(new Date('2026-07-27T03:00:00Z'))).toBe('2026-07-27');
  });

  test('não depende do fuso de quem está olhando', () => {
    // O gestor abre o painel de outra cidade e precisa ver o MESMO dia que o
    // operador na loja. Aqui isso se traduz em: o resultado não muda com o TZ
    // do processo — e o teste roda com TZ=America/Sao_Paulo no config, então a
    // garantia real vem do `timeZone` explícito dentro de lib/dates.js.
    const instante = new Date('2026-07-27T00:16:00Z');
    expect(dates.dateStrOf(instante, 'America/Sao_Paulo')).toBe('2026-07-26');
    expect(dates.dateStrOf(instante, 'Asia/Tokyo')).toBe('2026-07-27');
    expect(dates.dateStrOf(instante, 'UTC')).toBe('2026-07-27');
  });

  test('addDays atravessa mês, ano e ano bissexto', () => {
    expect(dates.addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(dates.addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(dates.addDays('2028-02-28', 1)).toBe('2028-02-29'); // 2028 é bissexto
    expect(dates.addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(dates.addDays('2026-07-26', 0)).toBe('2026-07-26');
  });

  test('lastDays devolve a janela do mais antigo ao mais recente, incluindo o fim', () => {
    expect(dates.lastDays(7, '2026-07-26')).toEqual([
      '2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23',
      '2026-07-24', '2026-07-25', '2026-07-26',
    ]);
  });

  test('a semana começa na segunda', () => {
    expect(dates.weekStartStr('2026-07-26')).toBe('2026-07-20'); // domingo → segunda anterior
    expect(dates.weekStartStr('2026-07-20')).toBe('2026-07-20'); // a própria segunda
    expect(dates.weekStartStr('2026-07-25')).toBe('2026-07-20'); // sábado
  });

  test('weekdayOf lê o dia da semana da string, sem passar por fuso', () => {
    expect(dates.weekdayOf('2026-07-26')).toBe(0); // domingo
    expect(dates.weekdayOf('2026-07-20')).toBe(1); // segunda
  });
});

test.describe('prazo do Fechamento', () => {
  // A regra de `completionOnTime` (lib/checklists.js): no prazo se `completedAt`
  // cai ANTES do fim do minuto do deadline, no relógio DA LOJA.
  const noPrazo = (date, completedAt, deadline, tz) =>
    new Date(completedAt) < dates.deadlineEnd(date, deadline, tz);

  test('Fechamento entregue depois do prazo conta como atrasado', () => {
    const entrega = '2026-07-27T00:16:00Z'; // 26/07 21:16 BRT
    const dia = dates.dateStrOf(new Date(entrega));

    expect(dia).toBe('2026-07-26');
    expect(noPrazo(dia, entrega, '21:00', 'America/Sao_Paulo')).toBe(false);

    // O que acontecia antes: dia = 27/07, prazo comparado = 27/07 21:00.
    expect(noPrazo('2026-07-27', entrega, '21:00', 'America/Sao_Paulo')).toBe(true);
  });

  test('Fechamento entregue dentro do prazo continua no prazo', () => {
    const entrega = '2026-07-26T23:30:00Z'; // 26/07 20:30 BRT
    const dia = dates.dateStrOf(new Date(entrega));
    expect(dia).toBe('2026-07-26');
    expect(noPrazo(dia, entrega, '21:00', 'America/Sao_Paulo')).toBe(true);
  });

  /**
   * O prazo é cobrado no MINUTO, não no segundo.
   *
   * Caso real de 15/08/2026: "Fechamento Sala", prazo 18:20, entregue 18:20 —
   * e o painel dizia "atrasado", com as 8 tarefas marcadas "fora do prazo".
   * O relógio da tela mostra minutos; cobrar o segundo 00 pune quem cumpriu
   * exatamente o combinado, por uma diferença que ninguém consegue ver.
   */
  test('entrega dentro do minuto do prazo é pontual; o atraso começa no minuto seguinte', () => {
    const tz = 'America/Sao_Paulo';
    const dia = '2026-08-14';
    // 18:20 BRT = 21:20Z.
    expect(noPrazo(dia, '2026-08-14T21:20:00Z', '18:20', tz)).toBe(true);      // 18:20:00
    expect(noPrazo(dia, '2026-08-14T21:20:37Z', '18:20', tz)).toBe(true);      // 18:20:37 — o caso da tela
    expect(noPrazo(dia, '2026-08-14T21:20:59.999Z', '18:20', tz)).toBe(true);  // último instante do minuto
    expect(noPrazo(dia, '2026-08-14T21:21:00Z', '18:20', tz)).toBe(false);     // 18:21:00 — aí sim
  });

  test('deadlineEnd é o instantAt do prazo mais um minuto, em qualquer fuso', () => {
    for (const tz of ['America/Sao_Paulo', 'America/Manaus', 'America/Noronha']) {
      expect(dates.deadlineEnd('2026-07-26', '22:00', tz).getTime()
        - dates.instantAt('2026-07-26', '22:00', tz).getTime()).toBe(60_000);
    }
    // Hora ilegível não vira prazo nenhum — quem chama trata o null e conta o
    // checklist como "sem prazo", nem pontual nem atrasado.
    expect(dates.deadlineEnd('2026-07-26', 'às seis', 'America/Sao_Paulo')).toBe(null);
    expect(dates.deadlineEnd('', '18:20', 'America/Sao_Paulo')).toBe(null);
  });

  test('a virada da meia-noite continua valendo com a folga do minuto', () => {
    const tz = 'America/Sao_Paulo';
    // Prazo 23:59: 23:59:40 ainda cumpre, 00:00 do dia seguinte não.
    expect(noPrazo('2026-07-26', '2026-07-27T02:59:40Z', '23:59', tz)).toBe(true);
    expect(noPrazo('2026-07-26', '2026-07-27T03:00:00Z', '23:59', tz)).toBe(false);
  });
});

test.describe('fuso por loja', () => {
  test('loja sem fuso configurado opera em Brasília', () => {
    expect(dates.tzOf(undefined)).toBe('America/Sao_Paulo');
    expect(dates.tzOf({ id: 'ibr1' })).toBe('America/Sao_Paulo');
    expect(dates.tzOf({ id: 'ibr1', timezone: null })).toBe('America/Sao_Paulo');
    expect(dates.tzOf({ id: 'ibr1', timezone: 'America/Manaus' })).toBe('America/Manaus');
  });

  test('tzOfUnit resolve pela lista, e loja desconhecida cai no default', () => {
    const units = [
      { id: 'sp', timezone: 'America/Sao_Paulo' },
      { id: 'mao', timezone: 'America/Manaus' },
    ];
    expect(dates.tzOfUnit(units, 'mao')).toBe('America/Manaus');
    expect(dates.tzOfUnit(units, 'nao-existe')).toBe('America/Sao_Paulo');
    expect(dates.tzOfUnit(null, 'mao')).toBe('America/Sao_Paulo');
  });

  test('o mesmo instante pode ser dias diferentes em duas lojas', () => {
    // 27/07 00:30 em Brasília ainda é 26/07 em Manaus (UTC−4) e no Acre (UTC−5).
    const instante = new Date('2026-07-27T03:30:00Z');
    expect(dates.dateStrOf(instante, 'America/Sao_Paulo')).toBe('2026-07-27');
    expect(dates.dateStrOf(instante, 'America/Manaus')).toBe('2026-07-26');
    expect(dates.dateStrOf(instante, 'America/Rio_Branco')).toBe('2026-07-26');
    // E em Noronha (UTC−2) já passou da meia-noite antes de todo mundo.
    expect(dates.dateStrOf(new Date('2026-07-27T02:30:00Z'), 'America/Noronha')).toBe('2026-07-27');
  });

  test('instantAt resolve o prazo no relógio da loja', () => {
    // "até as 22:00" é um instante diferente em cada fuso.
    expect(dates.instantAt('2026-07-26', '22:00', 'America/Sao_Paulo').toISOString())
      .toBe('2026-07-27T01:00:00.000Z');
    expect(dates.instantAt('2026-07-26', '22:00', 'America/Manaus').toISOString())
      .toBe('2026-07-27T02:00:00.000Z');
    expect(dates.instantAt('2026-07-26', '22:00', 'America/Rio_Branco').toISOString())
      .toBe('2026-07-27T03:00:00.000Z');
  });

  test('o mesmo fechamento é pontual em Manaus e atrasado em São Paulo', () => {
    // O caso que motivou o fuso por loja: entrega às 22:30 no relógio de Manaus,
    // prazo 23:00. Comparar contra o relógio de quem abriu o painel (SP) diria
    // que atrasou meia hora.
    const entrega = '2026-07-27T02:30:00Z'; // 26/07 22:30 em Manaus, 23:30 em SP
    const dia = dates.dateStrOf(new Date(entrega), 'America/Manaus');
    expect(dia).toBe('2026-07-26');

    const noPrazo = tz => new Date(entrega) < dates.deadlineEnd(dia, '23:00', tz);
    expect(noPrazo('America/Manaus')).toBe(true);       // certo
    expect(noPrazo('America/Sao_Paulo')).toBe(false);   // o erro que se evitou
  });

  test('a lista oferecida cobre o Brasil e não tem id repetido', () => {
    const ids = dates.TIMEZONES.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('America/Sao_Paulo');
    // Toda zona da lista tem que ser válida para o Intl — uma string errada aqui
    // só apareceria em produção, no dia em que alguém selecionasse a opção.
    for (const t of dates.TIMEZONES) {
      expect(() => new Date().toLocaleString('pt-BR', { timeZone: t.id })).not.toThrow();
      expect(t.label).toBeTruthy();
    }
  });
});
