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
  // A regra de `completionOnTime` (app/app/page.js): a execução está no prazo
  // se `completedAt` <= `${date}T${deadline}` em hora local. Com o dia UTC, o
  // Fechamento das 21h recebia `date` de amanhã e era comparado contra o prazo
  // de amanhã — ou seja, nunca atrasava.
  const noPrazo = (date, completedAt, deadline) =>
    new Date(completedAt) <= new Date(`${date}T${deadline}:00`);

  test('Fechamento entregue depois do prazo conta como atrasado', () => {
    const entrega = '2026-07-27T00:16:00Z'; // 26/07 21:16 BRT
    const dia = dates.dateStrOf(new Date(entrega));

    expect(dia).toBe('2026-07-26');
    expect(noPrazo(dia, entrega, '21:00')).toBe(false);

    // O que acontecia antes: dia = 27/07, prazo comparado = 27/07 21:00.
    expect(noPrazo('2026-07-27', entrega, '21:00')).toBe(true);
  });

  test('Fechamento entregue dentro do prazo continua no prazo', () => {
    const entrega = '2026-07-26T23:30:00Z'; // 26/07 20:30 BRT
    const dia = dates.dateStrOf(new Date(entrega));
    expect(dia).toBe('2026-07-26');
    expect(noPrazo(dia, entrega, '21:00')).toBe(true);
  });
});
