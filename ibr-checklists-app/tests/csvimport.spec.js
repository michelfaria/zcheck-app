/**
 * ZCheck — importação de checklists via CSV.
 *
 * O foco aqui é a coluna `arrastar` (carryover) e, junto com ela, o
 * ALINHAMENTO das colunas do CSV modelo: o parser mapeia por nome de cabeçalho,
 * mas o modelo é escrito posicionalmente, à mão. Uma vírgula a mais ou a menos
 * numa linha do modelo desloca todo o resto — `deadline` viraria `arrastar`, e
 * o arquivo que o próprio app entrega ao cliente importaria errado sem erro
 * nenhum. Por isso o modelo é lido de volta e conferido campo a campo.
 *
 * Roda no runner do Playwright, sem browser — é lógica pura:
 *
 *   npx playwright test tests/csvimport.spec.js
 */

const { test, expect } = require('@playwright/test');

let csv;
test.beforeAll(async () => { csv = await import('../lib/csvImport.js'); });

const linhas = (...rows) => [csv.CSV_COLUMNS.join(','), ...rows].join('\n');

test.describe('coluna arrastar', () => {
  // tipo,checklist,loja,setor,tarefa,critico,foto,dias,orientacao,video,link,deadline,arrastar
  const comArrastar = (v) => linhas(
    'checklist,Limpeza,Loja 1,Cozinha,,,,,,,,08:00,',
    `tarefa,Limpeza,Loja 1,Cozinha,Limpar a coifa,,,seg qua sex,,,,,${v}`,
  );

  test('"sim" liga o carryover na tarefa', () => {
    const r = csv.parseImportCSV(comArrastar('sim'));
    expect(r.error).toBeUndefined();
    expect(r.checklists[0].items[0].carryover).toBe(true);
  });

  test('a coluna vazia não arrasta — o default é desligado', () => {
    const r = csv.parseImportCSV(comArrastar(''));
    expect(r.checklists[0].items[0].carryover).toBeUndefined();
  });

  test('aceita os mesmos sinônimos das outras colunas de sim/não', () => {
    ['s', 'x', '1', 'true', 'SIM', 'Sim'].forEach(v => {
      expect(csv.parseImportCSV(comArrastar(v)).checklists[0].items[0].carryover).toBe(true);
    });
    ['nao', 'não', 'n', '0', 'false', 'talvez'].forEach(v => {
      expect(csv.parseImportCSV(comArrastar(v)).checklists[0].items[0].carryover).toBeUndefined();
    });
  });

  /**
   * O import não carimba `carryoverSince`, e isso é decisão, não esquecimento:
   * ele só CRIA checklist (duplicata vira "ja-existe" e é pulada), e template
   * novo nasce com `created_at` de hoje — `templateExistedOn` já barra qualquer
   * cobrança anterior à importação. O carimbo existe para o editor, onde a flag
   * pode ser ligada num checklist que já roda há meses.
   */
  test('não carimba carryoverSince — quem faz o corte aqui é o created_at', () => {
    const item = csv.parseImportCSV(comArrastar('sim')).checklists[0].items[0];
    expect(item.carryoverSince).toBeUndefined();
  });

  test('arrastar convive com as outras colunas sem deslocá-las', () => {
    const r = csv.parseImportCSV(linhas(
      'checklist,Limpeza,Loja 1,Cozinha,,,,,,,,08:00,',
      'tarefa,Limpeza,Loja 1,Cozinha,Limpar a coifa,sim,sim,seg qua sex,Use o desengordurante,https://v.co/1,https://l.co/1,,sim',
    ));
    const i = r.checklists[0].items[0];
    expect(i.text).toBe('Limpar a coifa');
    expect(i.critical).toBe(true);
    expect(i.photoRequired).toBe(true);
    expect(i.recurrence).toEqual([1, 3, 5]);
    expect(i.description).toBe('Use o desengordurante');
    expect(i.refVideo).toBe('https://v.co/1');
    expect(i.refLink).toBe('https://l.co/1');
    expect(i.carryover).toBe(true);
  });
});

/**
 * O modelo que o app entrega ao cliente tem que voltar inteiro.
 *
 * Baixar o modelo e importar sem editar precisa funcionar — já quebrou antes,
 * quando o modelo vinha com "Loja 1"/"Salão" que não existiam em empresa
 * nenhuma. Aqui a conferência é de ESTRUTURA: o número de campos por linha e o
 * valor que cai em cada coluna.
 */
test.describe('CSV modelo', () => {
  test('toda linha tem exatamente uma célula por coluna declarada', () => {
    const linhasModelo = csv.buildModelCsv().split('\r\n');
    const esperado = csv.CSV_COLUMNS.length;
    linhasModelo.forEach((l, n) => {
      expect(csv.splitCsvLine(l, ',').length, `linha ${n + 1}: ${l}`).toBe(esperado);
    });
  });

  test('o modelo importa sem erro e sem aviso', () => {
    const r = csv.parseImportCSV(csv.buildModelCsv({ loja: 'IBR2', setor: 'Cozinha' }));
    expect(r.error).toBeUndefined();
    expect(r.warnings).toEqual([]);
    expect(r.checklists).toHaveLength(2);
  });

  test('deadline continua caindo no checklist, não em arrastar', () => {
    // A prova de que a coluna nova não empurrou as anteriores.
    const r = csv.parseImportCSV(csv.buildModelCsv());
    expect(r.checklists.map(c => c.deadline)).toEqual(['08:00', '18:00']);
  });

  test('o exemplo periódico do modelo demonstra o arrastar', () => {
    const r = csv.parseImportCSV(csv.buildModelCsv());
    const caixas = r.checklists[0].items.find(i => i.text === 'Verificar caixas');
    expect(caixas.recurrence).toEqual([1, 3, 5]);
    expect(caixas.carryover).toBe(true);
    // E a tarefa diária ao lado dele NÃO arrasta — o modelo mostra os dois casos.
    const mesas = r.checklists[0].items.find(i => i.text === 'Limpar mesas e cadeiras');
    expect(mesas.carryover).toBeUndefined();
    expect(mesas.photoRequired).toBe(true);
  });
});
