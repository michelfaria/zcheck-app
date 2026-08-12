/**
 * ZCheck — domínio do CHECKLIST: o que vale num dia.
 *
 * Roda no runner do Playwright, sem browser — é lógica pura:
 *
 *   npx playwright test tests/checklists.spec.js
 */

const { test, expect } = require('@playwright/test');

let checklists;
test.beforeAll(async () => { checklists = await import('../lib/checklists.js'); });

/**
 * CARRYOVER — tarefa periódica não feita volta no dia seguinte até ser feita.
 *
 * Calendário dos testes: 2026-08-03 é SEGUNDA (04 ter, 05 qua, 06 qui, 07 sex).
 * A tarefa símbolo é "limpar a coifa", seg/qua/sex (`recurrence: [1,3,5]`),
 * com `carryover: true` — só ela arrasta; o resto do checklist segue como era.
 * A flag foi ligada na segunda 03/08 (`carryoverSince`), como o editor carimba.
 */
test.describe('pendências arrastadas', () => {
  const tpl = (over = {}) => ({
    id: 'limpeza', unitId: 'ibr1', name: 'Limpeza — Cozinha',
    items: [
      { id: 'coifa', text: 'Limpar a coifa', recurrence: [1, 3, 5], carryover: true, carryoverSince: '2026-08-03' },
      { id: 'chao',  text: 'Lavar o chão',   recurrence: [1, 3, 5] }, // sem flag
    ],
    ...over,
  });
  const feita = (date, itemIds, over = {}) => ({
    id: `c-${date}-${(over.id || '')}`, templateId: 'limpeza', unitId: 'ibr1', date,
    completedAt: `${date}T20:00:00Z`,
    items: [
      { id: 'coifa', done: itemIds.includes('coifa') },
      { id: 'chao',  done: itemIds.includes('chao') },
    ],
    ...over,
  });

  test('segunda não feita reaparece na terça, com a origem', () => {
    const p = checklists.pendenciasArrastadas(tpl(), [], [], '2026-08-04');
    expect(p).toEqual([{ itemId: 'coifa', dataOriginal: '2026-08-03', diasArrastado: 1 }]);
  });

  test('tarefa SEM a flag não arrasta — arrastar é opt-in por tarefa', () => {
    const p = checklists.pendenciasArrastadas(tpl(), [], [], '2026-08-04');
    expect(p.find(x => x.itemId === 'chao')).toBeUndefined();
  });

  test('feita no próprio dia previsto: nada a cobrar', () => {
    const p = checklists.pendenciasArrastadas(tpl(), [feita('2026-08-03', ['coifa'])], [], '2026-08-04');
    expect(p).toEqual([]);
  });

  test('fazer na quarta quita a dívida de segunda', () => {
    // Não feita seg; feita qua (dia previsto ou não, tanto faz). Na quinta, limpo.
    const p = checklists.pendenciasArrastadas(tpl(), [feita('2026-08-05', ['coifa'])], [], '2026-08-06');
    expect(p).toEqual([]);
  });

  test('feita HOJE quita na hora — a pendência não sobrevive à execução', () => {
    const p = checklists.pendenciasArrastadas(tpl(), [feita('2026-08-04', ['coifa'])], [], '2026-08-04');
    expect(p).toEqual([]);
  });

  test('submeter o checklist SEM fazer a tarefa não quita', () => {
    // Régua de roundIsComplete: entrega incompleta deixa a tarefa pendente.
    const p = checklists.pendenciasArrastadas(tpl(), [feita('2026-08-03', ['chao'])], [], '2026-08-04');
    expect(p).toHaveLength(1);
    expect(p[0].dataOriginal).toBe('2026-08-03');
  });

  test('união das submissões: feita em QUALQUER rodada do dia conta', () => {
    const duas = [
      feita('2026-08-03', [], { id: 'a', completedAt: '2026-08-03T19:00:00Z' }),
      feita('2026-08-03', ['coifa'], { id: 'b', completedAt: '2026-08-03T21:00:00Z' }),
    ];
    expect(checklists.pendenciasArrastadas(tpl(), duas, [], '2026-08-04')).toEqual([]);
  });

  test('dia de folga da loja não gera dívida', () => {
    const folga = [{ unitId: 'ibr1', date: '2026-08-03' }];
    expect(checklists.pendenciasArrastadas(tpl(), [], folga, '2026-08-04')).toEqual([]);
    // Folga de OUTRA loja não perdoa nada.
    const outraLoja = [{ unitId: 'ibr2', date: '2026-08-03' }];
    expect(checklists.pendenciasArrastadas(tpl(), [], outraLoja, '2026-08-04')).toHaveLength(1);
  });

  test('uma instância só: seg E qua perdidas viram UMA pendência, da mais antiga', () => {
    const p = checklists.pendenciasArrastadas(tpl(), [], [], '2026-08-06');
    expect(p).toEqual([{ itemId: 'coifa', dataOriginal: '2026-08-03', diasArrastado: 3 }]);
  });

  test('quitação parcial: seg feita, qua não — a dívida é de quarta', () => {
    const p = checklists.pendenciasArrastadas(tpl(), [feita('2026-08-03', ['coifa'])], [], '2026-08-06');
    expect(p).toEqual([{ itemId: 'coifa', dataOriginal: '2026-08-05', diasArrastado: 1 }]);
  });

  test('dia em que a tarefa também é prevista: a dívida antiga continua visível', () => {
    // Quarta é dia normal da coifa — mas a de segunda segue devida, com origem.
    const p = checklists.pendenciasArrastadas(tpl(), [], [], '2026-08-05');
    expect(p).toEqual([{ itemId: 'coifa', dataOriginal: '2026-08-03', diasArrastado: 2 }]);
  });

  test('teto: dívida mais velha que a janela sai do radar', () => {
    // Segunda 03/08 perdida; com teto de 2 dias, na sexta 07/08 a janela começa
    // na quarta — e a pendência visível é a de quarta, não a de segunda.
    const p = checklists.pendenciasArrastadas(tpl(), [], [], '2026-08-07', 2);
    expect(p).toEqual([{ itemId: 'coifa', dataOriginal: '2026-08-05', diasArrastado: 2 }]);
    expect(checklists.pendenciasArrastadas(tpl(), [], [], '2026-08-04', 0)).toEqual([]);
  });

  test('checklist criado na terça não é cobrado da segunda', () => {
    const novo = tpl({ createdAt: '2026-08-04T09:00:00Z' });
    expect(checklists.pendenciasArrastadas(novo, [], [], '2026-08-04')).toEqual([]);
    // Na quinta, a quarta (já dentro da existência) cobra normalmente.
    expect(checklists.pendenciasArrastadas(novo, [], [], '2026-08-06')[0].dataOriginal).toBe('2026-08-05');
  });

  test('checklist desativado não gera dívida a partir da desativação', () => {
    const off = tpl({ deactivatedAt: '2026-08-04T09:00:00Z' });
    // Segunda ainda era prevista; quarta (pós-desativação) não.
    const p = checklists.pendenciasArrastadas(off, [], [], '2026-08-06');
    expect(p).toEqual([{ itemId: 'coifa', dataOriginal: '2026-08-03', diasArrastado: 3 }]);
  });

  /**
   * O corte de retroatividade — o ponto cego que o conselho pegou na revisão.
   *
   * A flag nascer desligada não basta: quem liga numa terça alcançaria a sexta
   * anterior pela janela do teto, e a feature estrearia cobrando dívida de dias
   * em que a regra não existia. `carryoverSince` é o piso da varredura.
   */
  test('ativação de hoje não ressuscita a semana passada', () => {
    const ligadaHoje = tpl({
      items: [{ id: 'coifa', recurrence: [1, 3, 5], carryover: true, carryoverSince: '2026-08-04' }],
    });
    // Terça 04/08: seg 03, sex 31/07 e qua 29/07 estão na janela — e nenhuma cobra.
    expect(checklists.pendenciasArrastadas(ligadaHoje, [], [], '2026-08-04')).toEqual([]);
    // A partir da quarta 05/08 (primeira ocorrência já sob a regra) volta a cobrar.
    expect(checklists.pendenciasArrastadas(ligadaHoje, [], [], '2026-08-06'))
      .toEqual([{ itemId: 'coifa', dataOriginal: '2026-08-05', diasArrastado: 1 }]);
  });

  test('sem carryoverSince vale a janela cheia do teto', () => {
    // Registro antigo ou import sem a coluna: comportamento explícito, não
    // acidente — da terça 04/08 a janela de 7 dias abre em 28/07 e a ocorrência
    // mais antiga que ela alcança é a quarta 29/07, bem antes da segunda.
    const semCorte = tpl({ items: [{ id: 'coifa', recurrence: [1, 3, 5], carryover: true }] });
    expect(checklists.pendenciasArrastadas(semCorte, [], [], '2026-08-04'))
      .toEqual([{ itemId: 'coifa', dataOriginal: '2026-07-29', diasArrastado: 6 }]);
  });

  test('o corte não perdoa dívida nascida depois dele', () => {
    // Ligada na segunda: a própria segunda já conta.
    expect(checklists.pendenciasArrastadas(tpl(), [], [], '2026-08-04')[0].dataOriginal).toBe('2026-08-03');
  });

  test('tarefa diária com a flag: pendente desde a última não feita', () => {
    const diaria = tpl({ items: [{ id: 'coifa', text: 'Limpar a coifa', carryover: true, carryoverSince: '2026-08-03' }] });
    const p = checklists.pendenciasArrastadas(diaria, [feita('2026-08-03', ['coifa'])], [], '2026-08-05');
    expect(p).toEqual([{ itemId: 'coifa', dataOriginal: '2026-08-04', diasArrastado: 1 }]);
  });

  test('appearsIn fora do tipo do checklist não arrasta', () => {
    const abertura = tpl({
      name: 'Abertura — Cozinha',
      items: [{ id: 'coifa', recurrence: [1], carryover: true, carryoverSince: '2026-08-03', appearsIn: ['fechamento'] }],
    });
    expect(checklists.pendenciasArrastadas(abertura, [], [], '2026-08-04')).toEqual([]);
  });

  test('outro checklist e outra loja não quitam a dívida desta rodada', () => {
    const alheias = [
      feita('2026-08-03', ['coifa'], { templateId: 'outro' }),
      feita('2026-08-03', ['coifa'], { unitId: 'ibr2' }),
    ];
    expect(checklists.pendenciasArrastadas(tpl(), alheias, [], '2026-08-04')).toHaveLength(1);
  });

  test('entradas vazias não derrubam a lista do operador', () => {
    expect(checklists.pendenciasArrastadas(null, [], [], '2026-08-04')).toEqual([]);
    expect(checklists.pendenciasArrastadas(tpl(), null, null, '2026-08-04')).toHaveLength(1);
    expect(checklists.pendenciasArrastadas(tpl({ items: null }), [], [], '2026-08-04')).toEqual([]);
    expect(checklists.pendenciasArrastadas(tpl(), [null, feita('2026-08-03', ['coifa']), { items: null, templateId: 'limpeza', unitId: 'ibr1', date: '2026-08-03' }], [], '2026-08-04')).toEqual([]);
  });
});

