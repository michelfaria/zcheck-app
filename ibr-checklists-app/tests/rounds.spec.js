/**
 * Trava a regressão da contagem em dobro na execução colaborativa.
 *
 * O cenário real: Ana e Bruno dividem o checklist de abertura. Cada tarefa fica
 * com o `doneBy` de quem a fez — mas os DOIS apertam "Concluir", e cada
 * submissão carrega a lista inteira de itens. Contando `completions` cru, as
 * tarefas da Ana eram creditadas duas vezes (uma no registro dela, outra no do
 * Bruno) e a produtividade dos dois dobrava.
 *
 * Roda no runner do Playwright, sem browser — é lógica pura:
 *
 *   npx playwright test tests/rounds.spec.js
 */

const { test, expect } = require('@playwright/test');

let rounds;
test.beforeAll(async () => { rounds = await import('../lib/rounds.js'); });

const c = (over = {}) => ({
  unitId: 'ibr1', templateId: 'abertura-salao', date: '2026-07-29',
  completedAt: '2026-07-29T11:00:00Z', operatorName: 'Ana', ...over,
});

test.describe('rodada de checklist', () => {
  test('duas submissões do mesmo checklist no mesmo dia contam uma', () => {
    const r = rounds.latestPerRound([
      c({ id: 'a', operatorName: 'Ana',   completedAt: '2026-07-29T11:00:00Z' }),
      c({ id: 'b', operatorName: 'Bruno', completedAt: '2026-07-29T11:04:00Z' }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('b'); // a mais recente reflete o estado final
  });

  test('o mesmo checklist em dias diferentes são rodadas diferentes', () => {
    expect(rounds.latestPerRound([
      c({ id: 'a', date: '2026-07-28' }),
      c({ id: 'b', date: '2026-07-29' }),
    ])).toHaveLength(2);
  });

  test('checklists diferentes no mesmo dia não se anulam', () => {
    expect(rounds.latestPerRound([
      c({ id: 'a', templateId: 'abertura-salao' }),
      c({ id: 'b', templateId: 'abertura-cozinha' }),
    ])).toHaveLength(2);
  });

  test('lojas diferentes não se anulam — mesmo checklist, mesma data', () => {
    expect(rounds.latestPerRound([
      c({ id: 'a', unitId: 'ibr1' }),
      c({ id: 'b', unitId: 'ibr2' }),
    ])).toHaveLength(2);
  });

  test('registro antigo sem templateId cai no nome do checklist', () => {
    const r = rounds.latestPerRound([
      c({ id: 'a', templateId: undefined, templateName: 'Abertura — Salão', completedAt: '2026-07-29T10:00:00Z' }),
      c({ id: 'b', templateId: undefined, templateName: 'Abertura — Salão', completedAt: '2026-07-29T10:30:00Z' }),
      c({ id: 'x', templateId: undefined, templateName: 'Abertura — Cozinha' }),
    ]);
    expect(r).toHaveLength(2);
    expect(r.find(x => x.templateName === 'Abertura — Salão').id).toBe('b');
  });

  test('sem completedAt fica a primeira, sem quebrar', () => {
    const r = rounds.latestPerRound([
      c({ id: 'a', completedAt: undefined }),
      c({ id: 'b', completedAt: undefined }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('a');
  });

  test('lista vazia, nula e com buracos não derrubam a métrica', () => {
    expect(rounds.latestPerRound([])).toEqual([]);
    expect(rounds.latestPerRound(null)).toEqual([]);
    expect(rounds.latestPerRound(undefined)).toEqual([]);
    expect(rounds.latestPerRound([null, c({ id: 'a' })])).toHaveLength(1);
  });

  test('devolve os registros originais, não cópias — o chamador lê c.items', () => {
    const original = c({ id: 'a', items: [{ id: 'i1', done: true, doneBy: 'ana' }] });
    const [saida] = rounds.latestPerRound([original]);
    expect(saida).toBe(original);
  });

  test('nada é perdido quando não há duplicidade', () => {
    const lista = [c({ id: 'a' }), c({ id: 'b', date: '2026-07-28' }), c({ id: 'c', unitId: 'ibr2' })];
    expect(rounds.latestPerRound(lista)).toHaveLength(3);
  });
});
