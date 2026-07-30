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

/**
 * Progresso da rodada — a base do status "parcial".
 *
 * Antes, "concluído" no cartão significava só "existe conclusão gravada": um
 * checklist fechado com 5 de 8 itens ficava verde, igual a um 8/8.
 */
test.describe('progresso da rodada', () => {
  const ctx = { templateId: 'abertura', unitId: 'ibr1', date: '2026-07-30' };
  const sub = (items, over = {}) => ({
    id: 'c1', templateId: 'abertura', unitId: 'ibr1', date: '2026-07-30',
    completedAt: '2026-07-30T11:00:00Z', items, ...over,
  });

  test('5 de 8 é parcial, não concluído', () => {
    const items = Array.from({ length: 8 }, (_, n) => ({ id: `i${n}`, done: n < 5 }));
    const p = rounds.roundProgress([sub(items)], ctx, items.map(i => i.id));
    expect(p).toEqual({ submissions: 1, done: 5, total: 8 });
  });

  test('8 de 8 é completo', () => {
    const items = Array.from({ length: 8 }, (_, n) => ({ id: `i${n}`, done: true }));
    const p = rounds.roundProgress([sub(items)], ctx, items.map(i => i.id));
    expect(p.done).toBe(p.total);
  });

  test('duas submissões SOMAM as tarefas feitas (união, não a última)', () => {
    const ids = ['i1', 'i2', 'i3'];
    const p = rounds.roundProgress([
      sub([{ id: 'i1', done: true }, { id: 'i2', done: false }, { id: 'i3', done: false }], { id: 'c1', completedAt: '2026-07-30T11:00:00Z' }),
      sub([{ id: 'i1', done: true }, { id: 'i2', done: true }, { id: 'i3', done: false }], { id: 'c2', completedAt: '2026-07-30T18:00:00Z' }),
    ], ctx, ids);
    expect(p).toEqual({ submissions: 2, done: 2, total: 3 });
  });

  test('submetido com ZERO feito conta como entrega, não como pendência', () => {
    const items = [{ id: 'i1', done: false }, { id: 'i2', done: false }];
    const p = rounds.roundProgress([sub(items)], ctx, items.map(i => i.id));
    expect(p.submissions).toBe(1);
    expect(p.done).toBe(0);
  });

  test('item que saiu do checklist NÃO infla o numerador', () => {
    // `i9` foi feito e depois removido do template: não é mais previsto hoje.
    const p = rounds.roundProgress(
      [sub([{ id: 'i1', done: true }, { id: 'i9', done: true }])],
      ctx, ['i1', 'i2'],
    );
    expect(p.done).toBe(1);   // sem a interseção viria 2 e o parcial pareceria completo
    expect(p.total).toBe(2);
  });

  test('nunca submetido: nenhuma submissão, nenhuma tarefa', () => {
    const p = rounds.roundProgress([], ctx, ['i1', 'i2']);
    expect(p).toEqual({ submissions: 0, done: 0, total: 2 });
  });

  test('não confunde outro checklist, outra loja nem outro dia', () => {
    const items = [{ id: 'i1', done: true }];
    const outros = [
      sub(items, { templateId: 'fechamento' }),
      sub(items, { unitId: 'ibr2' }),
      sub(items, { date: '2026-07-29' }),
    ];
    expect(rounds.roundProgress(outros, ctx, ['i1'])).toEqual({ submissions: 0, done: 0, total: 1 });
  });

  test('entradas vazias não derrubam a lista de checklists', () => {
    expect(rounds.roundProgress(null, ctx, ['i1']).total).toBe(1);
    expect(rounds.roundProgress([null], ctx, null)).toEqual({ submissions: 0, done: 0, total: 0 });
    expect(rounds.roundProgress([sub([null, { id: 'i1', done: true }])], ctx, ['i1']).done).toBe(1);
  });
});

/**
 * Janela de existência do checklist — o que impede o passado de mudar sozinho.
 *
 * "Previstos" saía da lista ATUAL de checklists para qualquer data passada.
 * Criar um checklist inflava o previsto de dias anteriores; apagar encolhia o
 * denominador e a aderência de uma semana já fechada subia acima de 100%.
 */
test.describe('checklist era previsto naquele dia', () => {
  const t = (over = {}) => ({ id: 't1', unitId: 'ibr1', ...over });

  test('checklist criado HOJE não é cobrado de ontem', () => {
    const novo = t({ createdAt: '2026-07-30T09:00:00Z' });
    expect(rounds.templateExistedOn(novo, '2026-07-29')).toBe(false);
    expect(rounds.templateExistedOn(novo, '2026-07-30')).toBe(true);
    expect(rounds.templateExistedOn(novo, '2026-07-31')).toBe(true);
  });

  test('checklist desativado hoje deixa de ser previsto A PARTIR de hoje', () => {
    const off = t({ deactivatedAt: '2026-07-30T09:00:00Z' });
    expect(rounds.templateExistedOn(off, '2026-07-29')).toBe(true);  // ontem era previsto
    expect(rounds.templateExistedOn(off, '2026-07-30')).toBe(false);
    expect(rounds.templateExistedOn(off, '2026-07-31')).toBe(false);
  });

  test('a janela fecha nos dois lados', () => {
    const janela = t({ createdAt: '2026-07-10T00:00:00Z', deactivatedAt: '2026-07-20T00:00:00Z' });
    expect(rounds.templateExistedOn(janela, '2026-07-09')).toBe(false);
    expect(rounds.templateExistedOn(janela, '2026-07-15')).toBe(true);
    expect(rounds.templateExistedOn(janela, '2026-07-20')).toBe(false);
  });

  test('sem datas, comportamento antigo: sempre existiu', () => {
    expect(rounds.templateExistedOn(t(), '2020-01-01')).toBe(true);
    expect(rounds.templateExistedOn(t(), '2030-01-01')).toBe(true);
  });

  test('não quebra com entrada faltando', () => {
    expect(rounds.templateExistedOn(null, '2026-07-30')).toBe(true);
    expect(rounds.templateExistedOn(t({ createdAt: '2026-07-30T09:00:00Z' }), null)).toBe(true);
  });
});

/**
 * Entrega COMPLETA — a régua da aderência desde 30/07/2026.
 *
 * Antes, submeter com 1 de 8 itens contava igual a 8 de 8: a aderência media se
 * alguém apertou "Concluir", não se o trabalho foi feito.
 */
test.describe('rodada completa', () => {
  const comp = (items) => ({ id: 'c1', templateId: 'abertura', unitId: 'ibr1', date: '2026-07-30', items });

  test('todos os itens previstos feitos = completa', () => {
    expect(rounds.roundIsComplete(comp([{ id: 'i1', done: true }, { id: 'i2', done: true }]), ['i1', 'i2'])).toBe(true);
  });

  test('um item previsto pendente = NÃO completa', () => {
    expect(rounds.roundIsComplete(comp([{ id: 'i1', done: true }, { id: 'i2', done: false }]), ['i1', 'i2'])).toBe(false);
  });

  test('item previsto que nem aparece no registro = NÃO completa', () => {
    // O checklist ganhou um item depois da submissão: não dá para chamar de completa.
    expect(rounds.roundIsComplete(comp([{ id: 'i1', done: true }]), ['i1', 'i2'])).toBe(false);
  });

  test('item feito que saiu do checklist não atrapalha', () => {
    expect(rounds.roundIsComplete(comp([{ id: 'i1', done: true }, { id: 'i9', done: true }]), ['i1'])).toBe(true);
  });

  test('sem lista de previstos, cai nos itens do próprio registro', () => {
    // Registro órfão (checklist apagado antes da migration de desativação).
    expect(rounds.roundIsComplete(comp([{ id: 'i1', done: true }]), null)).toBe(true);
    expect(rounds.roundIsComplete(comp([{ id: 'i1', done: true }, { id: 'i2', done: false }]), null)).toBe(false);
    expect(rounds.roundIsComplete(comp([{ id: 'i1', done: true }]), [])).toBe(true);
  });

  test('rodada sem item nenhum não é completa — não há trabalho comprovado', () => {
    expect(rounds.roundIsComplete(comp([]), [])).toBe(false);
    expect(rounds.roundIsComplete(comp([]), null)).toBe(false);
    expect(rounds.roundIsComplete(null, null)).toBe(false);
  });

  test('a régua bate com a do badge: parcial na tela é parcial na aderência', () => {
    const items = Array.from({ length: 8 }, (_, n) => ({ id: `i${n}`, done: n < 5 }));
    const ids = items.map(i => i.id);
    const prog = rounds.roundProgress([comp(items)], { templateId: 'abertura', unitId: 'ibr1', date: '2026-07-30' }, ids);
    const completa = rounds.roundIsComplete(comp(items), ids);
    expect(prog.done < prog.total).toBe(true);   // badge diz "Parcial"
    expect(completa).toBe(false);                // aderência não conta
  });
});

/**
 * Status do checklist — e o prazo no relógio da LOJA.
 *
 * A versão antiga comparava `new Date().getHours()` com a hora do prazo. Três
 * defeitos: usava o fuso de QUEM OLHA, ignorava a data (dia passado ficava
 * "pendente" para sempre) e errava na virada da meia-noite.
 */
test.describe('status do checklist', () => {
  const prog = (submissions, done, total) => ({ submissions, done, total });
  // 2026-07-30, 16:00 em Brasília (UTC-3) = 19:00Z.
  const instante = (iso) => new Date(iso);
  const ctx = (over = {}) => ({ deadline: '16:50', date: '2026-07-30', tz: 'America/Sao_Paulo', ...over });

  test('submetido e completo = done', () => {
    expect(rounds.statusFromProgress(prog(1, 8, 8), ctx(), instante('2026-07-30T19:00:00Z'))).toBe('done');
  });

  test('submetido pela metade = partial, mesmo depois do prazo', () => {
    expect(rounds.statusFromProgress(prog(1, 5, 8), ctx(), instante('2026-07-30T23:00:00Z'))).toBe('partial');
  });

  test('submetido com zero feito = partial (entregue vazio não é pendência)', () => {
    expect(rounds.statusFromProgress(prog(1, 0, 8), ctx(), instante('2026-07-30T19:00:00Z'))).toBe('partial');
  });

  test('não submetido, antes do prazo = pending', () => {
    // 19:00Z = 16:00 em Brasília, antes das 16:50.
    expect(rounds.statusFromProgress(prog(0, 0, 8), ctx(), instante('2026-07-30T19:00:00Z'))).toBe('pending');
  });

  test('não submetido, depois do prazo = overdue', () => {
    // 20:00Z = 17:00 em Brasília, depois das 16:50.
    expect(rounds.statusFromProgress(prog(0, 0, 8), ctx(), instante('2026-07-30T20:00:00Z'))).toBe('overdue');
  });

  /**
   * O CORAÇÃO da correção: o mesmo instante, duas lojas em fusos diferentes.
   * 19:20Z = 16:20 em São Paulo (ainda no prazo) e 15:20 em Manaus (idem), mas
   * 20:20Z = 17:20 em SP (vencido) e 16:20 em Manaus (ainda no prazo).
   */
  test('o mesmo instante pode estar vencido numa loja e no prazo na outra', () => {
    const agora = instante('2026-07-30T20:20:00Z');
    expect(rounds.statusFromProgress(prog(0, 0, 8), ctx({ tz: 'America/Sao_Paulo' }), agora)).toBe('overdue');
    expect(rounds.statusFromProgress(prog(0, 0, 8), ctx({ tz: 'America/Manaus' }), agora)).toBe('pending');
  });

  test('dia PASSADO sem entrega é overdue, não pendente para sempre', () => {
    // Era o bug: às 10h de hoje, um checklist de ontem com prazo 16:50 aparecia
    // "pendente", porque só a HORA era comparada.
    expect(rounds.statusFromProgress(prog(0, 0, 8), ctx({ date: '2026-07-29' }), instante('2026-07-30T13:00:00Z'))).toBe('overdue');
  });

  test('virada da meia-noite: prazo 23:30 contra 00:10 do dia seguinte', () => {
    expect(rounds.statusFromProgress(prog(0, 0, 8), ctx({ deadline: '23:30' }), instante('2026-07-31T03:10:00Z'))).toBe('overdue');
  });

  test('checklist SEM prazo nunca é atrasado', () => {
    expect(rounds.statusFromProgress(prog(0, 0, 8), ctx({ deadline: null }), instante('2027-01-01T00:00:00Z'))).toBe('pending');
  });

  test('entradas faltando não quebram a lista de checklists', () => {
    expect(rounds.statusFromProgress(null, ctx(), instante('2026-07-30T19:00:00Z'))).toBe('pending');
    expect(rounds.statusFromProgress(prog(0, 0, 0), {}, instante('2026-07-30T19:00:00Z'))).toBe('pending');
    expect(rounds.statusFromProgress(prog(1, 0, 0), {})).toBe('partial');
  });
});
