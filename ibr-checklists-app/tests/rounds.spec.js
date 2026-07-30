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

/**
 * Bloqueio por TAREFA, não por checklist.
 *
 * O pedido era explícito: checklist já submetido hoje deve abrir (as tarefas que
 * ficaram pendentes precisam ser executáveis), mas TAREFA já feita hoje não se
 * refaz. Estes testes travam as duas metades — e a terceira, que é o escape:
 * reabrir com motivo devolve a tarefa para a rodada.
 */
test.describe('tarefa já registrada hoje', () => {
  const ctx = { templateId: 'abertura-salao', unitId: 'ibr1', date: '2026-07-29' };
  const conclusao = (over = {}) => ({
    id: 'compl-1', templateId: 'abertura-salao', unitId: 'ibr1', date: '2026-07-29',
    completedAt: '2026-07-29T19:57:00Z', operatorName: 'Juliany', operatorUserId: 'ju',
    items: [
      { id: 'i1', done: true,  doneBy: 'ju',  doneByName: 'Juliany', doneAt: '2026-07-29T19:50:00Z', note: 'balcão ok', hasPhoto: true },
      { id: 'i2', done: false, note: '' },
    ],
    ...over,
  });

  test('item concluído numa submissão de hoje vem travado; o pendente não', () => {
    const sub = rounds.submittedTasksFrom([conclusao()], ctx);
    expect(sub.i1.submitted).toBe(true);
    expect(sub.i1.operatorName).toBe('Juliany');
    expect(sub.i2).toBeUndefined(); // pendente segue executável
  });

  test('a evidência da submissão anterior é carregada, não perdida', () => {
    const sub = rounds.submittedTasksFrom([conclusao()], ctx);
    expect(sub.i1.note).toBe('balcão ok');
    expect(sub.i1.photoPath).toBe('compl-1/i1.jpg'); // convenção de pushPhoto
  });

  test('crédito por tarefa: doneBy vence o operador do checklist', () => {
    const sub = rounds.submittedTasksFrom([conclusao({
      operatorUserId: 'ju', operatorName: 'Juliany',
      items: [{ id: 'i1', done: true, doneBy: 'mi', doneByName: 'Michel' }],
    })], ctx);
    expect(sub.i1.operatorUserId).toBe('mi');
    expect(sub.i1.operatorName).toBe('Michel');
  });

  test('só conta o MESMO checklist, loja e dia', () => {
    const outros = [
      conclusao({ id: 'x', templateId: 'outro' }),
      conclusao({ id: 'y', unitId: 'ibr2' }),
      conclusao({ id: 'z', date: '2026-07-28' }),
    ];
    expect(rounds.submittedTasksFrom(outros, ctx)).toEqual({});
  });

  test('duas submissões no mesmo dia: a última descreve a tarefa', () => {
    const sub = rounds.submittedTasksFrom([
      conclusao({ id: 'c1', completedAt: '2026-07-29T19:00:00Z',
        items: [{ id: 'i1', done: true, doneByName: 'Juliany' }] }),
      conclusao({ id: 'c2', completedAt: '2026-07-29T20:00:00Z',
        items: [{ id: 'i1', done: true, doneByName: 'Michel' }] }),
    ], ctx);
    expect(sub.i1.operatorName).toBe('Michel');
  });

  test('merge: sem rodada nenhuma, o registro trava a tarefa', () => {
    const v = rounds.mergeRoundState({}, rounds.submittedTasksFrom([conclusao()], ctx));
    expect(v.i1.done).toBe(true);
    expect(v.i1.submitted).toBe(true);
  });

  test('merge: rodada concluída dá o executor, mas a trava do registro sobrevive', () => {
    const live = { i1: { done: true, operatorName: 'Bruno', operatorUserId: 'bru' } };
    const v = rounds.mergeRoundState(live, rounds.submittedTasksFrom([conclusao()], ctx));
    expect(v.i1.operatorName).toBe('Bruno');   // rodada é mais fresca
    expect(v.i1.submitted).toBe(true);         // mas já foi registrada: não se refaz
  });

  /**
   * O caso que o teste real de 30/07 pegou e a 1ª versão desta função errava.
   *
   * É o cenário MAIS COMUM que existe: a pessoa marca a tarefa, conclui o
   * checklist e volta. A linha da rodada continua `done = true` no nome dela.
   * A versão antiga deixava a rodada ganhar inteira, `submitted` se perdia, e o
   * toque abria o modal de reabertura em vez de barrar — a tela dizia "Concluída
   * por você" onde devia dizer "Registrada por você".
   */
  test('merge: marquei, submeti e voltei — a tarefa está TRAVADA', () => {
    const live = { i1: { done: true, operatorUserId: 'ju', operatorName: 'Juliany', reopenedCount: 0 } };
    const v = rounds.mergeRoundState(live, rounds.submittedTasksFrom([conclusao()], ctx));
    expect(v.i1.submitted).toBe(true);
    expect(v.i1.operatorUserId).toBe('ju');
  });

  test('merge: tarefa concluída na rodada e AINDA NÃO submetida segue destravada', () => {
    // Caminho de desfazer no meio da execução: não pode virar bloqueio.
    const live = { i2: { done: true, operatorUserId: 'ju', operatorName: 'Juliany' } };
    const v = rounds.mergeRoundState(live, rounds.submittedTasksFrom([conclusao()], ctx));
    expect(v.i2.submitted).toBeUndefined();
  });

  test('merge: linha de rascunho de evidência NÃO desfaz serviço registrado', () => {
    // set_live_task_evidence insere done:false só para carregar nota/foto.
    const live = { i1: { done: false, reopenedCount: 0, note: 'anotação nova' } };
    const v = rounds.mergeRoundState(live, rounds.submittedTasksFrom([conclusao()], ctx));
    expect(v.i1.done).toBe(true);
    expect(v.i1.submitted).toBe(true);
    expect(v.i1.note).toBe('anotação nova'); // a nota mais recente prevalece
  });

  test('merge: REABERTA libera a tarefa mesmo já registrada', () => {
    const live = { i1: { done: false, reopenedCount: 1, reopenedByName: 'Ana' } };
    const v = rounds.mergeRoundState(live, rounds.submittedTasksFrom([conclusao()], ctx));
    expect(v.i1.done).toBe(false);
    expect(v.i1.submitted).toBeUndefined(); // destravada: dá para refazer
  });

  test('merge: a foto do registro anterior sobrevive quando a rodada não tem', () => {
    const live = { i1: { done: true, operatorName: 'Bruno', photoPath: null } };
    const v = rounds.mergeRoundState(live, rounds.submittedTasksFrom([conclusao()], ctx));
    // Rodada concluída manda inteira — a foto dela é a válida (pode ser null).
    expect(v.i1.operatorName).toBe('Bruno');
    const v2 = rounds.mergeRoundState({ i1: { done: false, reopenedCount: 0 } },
      rounds.submittedTasksFrom([conclusao()], ctx));
    expect(v2.i1.photoPath).toBe('compl-1/i1.jpg');
  });

  test('entradas vazias não derrubam a tela de execução', () => {
    expect(rounds.submittedTasksFrom(null, ctx)).toEqual({});
    expect(rounds.submittedTasksFrom([{ templateId: 'abertura-salao', unitId: 'ibr1', date: '2026-07-29' }], ctx)).toEqual({});
    expect(rounds.mergeRoundState(null, null)).toEqual({});
    expect(rounds.mergeRoundState(undefined, { i1: { done: true, submitted: true } }).i1.done).toBe(true);
  });
});

/**
 * Pontualidade usa a PRIMEIRA submissão; todo o resto usa a última.
 *
 * O J.I.T. mostrava "10 no prazo, 9 fora do prazo" num dia de 13 checklists
 * previstos: a mesma rodada entrava duas vezes, uma por submissão, e a segunda
 * (feita horas depois, para completar o que faltava) contava como atraso.
 */
test.describe('primeira vs última submissão da rodada', () => {
  const r = (id, hora) => ({
    id, unitId: 'ibr1', templateId: 'abertura', date: '2026-07-30',
    completedAt: `2026-07-30T${hora}:00Z`,
  });

  test('a pontualidade olha a primeira entrega, não a correção posterior', () => {
    const lista = [r('manha', '11'), r('tarde', '21')];
    expect(rounds.earliestPerRound(lista).map(c => c.id)).toEqual(['manha']);
    expect(rounds.latestPerRound(lista).map(c => c.id)).toEqual(['tarde']);
  });

  test('a ordem de leitura do banco não muda o resultado', () => {
    const ordem1 = [r('manha', '11'), r('tarde', '21')];
    const ordem2 = [r('tarde', '21'), r('manha', '11')];
    expect(rounds.earliestPerRound(ordem1)[0].id).toBe(rounds.earliestPerRound(ordem2)[0].id);
    expect(rounds.latestPerRound(ordem1)[0].id).toBe(rounds.latestPerRound(ordem2)[0].id);
  });

  test('rodadas distintas continuam separadas nas duas funções', () => {
    const lista = [r('a', '11'), { ...r('b', '12'), templateId: 'fechamento' }, { ...r('c', '13'), unitId: 'ibr2' }];
    expect(rounds.earliestPerRound(lista)).toHaveLength(3);
    expect(rounds.latestPerRound(lista)).toHaveLength(3);
  });

  test('entradas vazias e sem horário não derrubam a conta', () => {
    expect(rounds.earliestPerRound(null)).toEqual([]);
    expect(rounds.earliestPerRound([])).toEqual([]);
    const semHora = [{ id: 'x', unitId: 'u', templateId: 't', date: 'd' }, { id: 'y', unitId: 'u', templateId: 't', date: 'd' }];
    expect(rounds.earliestPerRound(semHora).map(c => c.id)).toEqual(['x']);
  });
});
