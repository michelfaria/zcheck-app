/**
 * O CICLO COMPLETO do carryover, com DOM e clique de verdade.
 *
 *   cd ibr-checklists-app && node tests/carryover-ciclo.spec.mjs
 *
 * ── Por que este arquivo existe, além do carryover-render ────────────────────
 *
 * `carryover-render` usa `renderToStaticMarkup`: prova a PRIMEIRA pintura e
 * nada mais — efeitos não rodam, nada é clicado, nenhum estado muda. Ele
 * responde "a tarefa arrastada aparece?" e não responde a pergunta que o
 * usuário de fato fez: "ela volta ATÉ SER EXECUTADA?".
 *
 * Aqui o ciclo roda inteiro, no componente real, em jsdom:
 *
 *   ontem  a tarefa era prevista e ninguém fez
 *   hoje   ela aparece na tela de execução, marcada como pendente desde ontem
 *          → clique no item  → clique em "Concluir checklist"
 *   amanhã ela NÃO volta — porque foi executada
 *
 * O último passo é o que fecha a asserção: alimenta `itensDoDia` com o registro
 * que a PRÓPRIA TELA produziu, em vez de um objeto que o teste inventou. Se a
 * submissão gravasse o item de um jeito que a varredura não reconhece, a tarefa
 * ficaria voltando para sempre — e nenhum teste de função pegaria isso, porque
 * os dois lados seriam testados com fixtures diferentes.
 *
 * O editor tem o mesmo tratamento: clicar na caixa e salvar de verdade é o que
 * prova que `carryoverSince` chega carimbado ao objeto que vai para o banco.
 */

import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement as h, act } from 'react';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// A tela conversa com Supabase e telemetria ao montar e ao marcar item. Aqui
// não há rede: o que importa é o que a tela FAZ com o estado, não o que ela
// manda para fora. Sem isto, uma promessa recusada derruba o processo e o
// teste falharia por um motivo que não é o dele.
process.on('unhandledRejection', () => {});
// Resposta COMPLETA o bastante para o cliente do Supabase: ele lê
// `headers.get(...)` ao processar o retorno, e um stub sem `headers` explodia
// com "Cannot read properties of undefined" — erro do teste, não do app.
globalThis.fetch = async () => ({
  ok: true, status: 200, statusText: 'OK',
  headers: { get: () => null, has: () => false, forEach: () => {} },
  json: async () => [], text: async () => '[]',
});

// A fila offline (telemetria e rodada colaborativa) grava em IndexedDB, que
// jsdom não tem. O app já trata a falha sozinho e AVISA — o log é ele
// funcionando, não um defeito. Sai da saída para o resultado do teste ficar
// legível; o filtro é ESTREITO de propósito, e qualquer outra mensagem passa.
const RUIDO = /indexedDB is not defined/;
const comoTexto = (a) => a.map(x => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ');
for (const canal of ['warn', 'error']) {
  const real = console[canal];
  console[canal] = (...a) => { if (!RUIDO.test(comoTexto(a))) real(...a); };
}

// ── Dias ────────────────────────────────────────────────────────────────────
// Relativos ao dia de HOJE no relógio da loja: o que importa é a relação entre
// os dias, não o dia do calendário em que o teste roda.
const TZ = 'America/Sao_Paulo';
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const somaDias = (d, n) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const ontem = somaDias(hoje, -1);
const amanha = somaDias(hoje, 1);
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const diaDaSemana = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();

// ── Bundle ──────────────────────────────────────────────────────────────────
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-carryover-ciclo');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { ExecutionScreen, TemplateEditor } from '${process.cwd()}/app/app/page.js';
  export { itensDoDia } from '${process.cwd()}/lib/checklists.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { ExecutionScreen, TemplateEditor, itensDoDia } = await import(out);
const { createRoot } = await import('react-dom/client');

// ── Ambiente DOM ────────────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>', { url: 'https://loja.test/app' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.Event = dom.window.Event;
dom.window.scrollTo = () => {};

const doc = dom.window.document;
const texto = () => doc.body.textContent;
const clicar = async (el) => {
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
};
/** O container da linha de uma tarefa — o primeiro ancestral com botão. */
const linhaDe = (t) => {
  const p = [...doc.querySelectorAll('p')].find(e => e.textContent.trim() === t);
  let n = p?.parentElement;
  while (n && !n.querySelector('button')) n = n.parentElement;
  return n;
};
const botaoPorTexto = (t) =>
  [...doc.querySelectorAll('button')].find(b => b.textContent.trim() === t);

// ── Fixtures ────────────────────────────────────────────────────────────────
const unit = { id: 'u1', name: 'Loja Teste', color: '#8a2be2', sectors: ['Cozinha'], timezone: TZ };
const currentUser = { id: 'u9', name: 'Ana' };
const template = {
  id: 'limpeza', unitId: 'u1', sector: 'Cozinha', name: 'Limpeza — Cozinha',
  deadline: '18:00', shift: 'Noite',
  items: [
    { id: 'chao', text: 'Lavar o chão' },                       // diária, sem flag
    {
      id: 'coifa', text: 'Limpar a coifa',
      recurrence: [diaDaSemana(ontem)],                          // prevista ONTEM
      carryover: true, carryoverSince: somaDias(hoje, -30),      // flag antiga: sem corte no caminho
    },
  ],
};

console.log('\n═══ o ciclo: não feita ontem → cobrada hoje → executada → não volta ═══');

// ── HOJE: a tela de execução ────────────────────────────────────────────────
let registro = null;
const root = createRoot(doc.getElementById('r'));
await act(async () => {
  root.render(h(ExecutionScreen, {
    template, unit, currentUser,
    completions: [],            // ninguém executou nada: a dívida de ontem existe
    closures: [],
    onCancel: () => {}, onDone: () => {},
    onComplete: (r) => { registro = r; },
  }));
});

check(texto().includes('Limpar a coifa'), 'a tarefa de ontem está na tela de hoje');
check(texto().includes(`Pendente desde ${ddmm(ontem)}`), `com o carimbo "Pendente desde ${ddmm(ontem)}"`);
check(texto().includes('0 de 2 concluídos'), 'o rodapé conta 2: a do dia e a arrastada');

// ── O clique: marcar a arrastada ────────────────────────────────────────────
const linhaCoifa = linhaDe('Limpar a coifa');
check(!!linhaCoifa, 'a linha da tarefa arrastada tem controle para marcar');
await clicar(linhaCoifa.querySelector('button'));
check(texto().includes('1 de 2 concluídos'), 'marcar a arrastada move o contador — ela é executável, não enfeite');

// ── O clique: concluir o checklist ──────────────────────────────────────────
const btnConcluir = botaoPorTexto('Concluir checklist');
check(!!btnConcluir, 'o botão de concluir está lá');
await clicar(btnConcluir);

check(!!registro, 'a submissão produziu um registro');
const itemCoifa = registro?.items.find(i => i.id === 'coifa');
const itemChao = registro?.items.find(i => i.id === 'chao');
check(!!itemCoifa, 'o registro inclui a tarefa arrastada');
check(itemCoifa?.done === true, 'e ela vai marcada como feita');
check(itemCoifa?.carriedFrom === ontem, `com carriedFrom = ${ontem} (a origem da dívida)`);
check(itemChao?.carriedFrom === null, 'a tarefa do dia vai com carriedFrom nulo — o carimbo é só da exceção');
check(registro?.date === hoje, 'o registro é gravado com o dia de HOJE, não com o dia da dívida');

// ── AMANHÃ: fechando o ciclo ────────────────────────────────────────────────
// Alimenta a varredura com o registro que a PRÓPRIA TELA produziu.
const amanhaComExecucao = itensDoDia(template, [registro], [], amanha);
check(!amanhaComExecucao.some(i => i.id === 'coifa'),
  'executada hoje, a tarefa NÃO volta amanhã — o ciclo fecha');

// E o contrafactual: sem a execução, ela continuaria voltando.
const amanhaSemExecucao = itensDoDia(template, [], [], amanha);
const aindaDevendo = amanhaSemExecucao.find(i => i.id === 'coifa');
check(!!aindaDevendo, 'sem executar, ela continuaria voltando');
check(aindaDevendo?.carriedFrom === ontem, 'e ainda apontando para a origem, não para ontem-de-amanhã');
check(aindaDevendo?.diasArrastado === 2, 'com o contador de dias subindo (2 dias)');

// ── O editor: o carimbo chega ao objeto que vai para o banco ────────────────
console.log('\n═══ o editor: ligar a flag carimba a data de ativação ═══');

let salvo = null;
// A tela de execução sai do documento antes: com as duas montadas, uma busca
// por texto ou por botão acharia elemento da outra e a asserção mentiria.
await act(async () => { root.unmount(); });
// Container próprio: reusar o da execução faria o React reclamar de dois
// `createRoot` no mesmo nó, e o aviso esconderia um erro de verdade.
const alvo2 = doc.createElement('div');
doc.body.appendChild(alvo2);
const root2 = createRoot(alvo2);
await act(async () => {
  root2.render(h(TemplateEditor, {
    unit, sector: 'Cozinha', allTemplates: [],
    template: { id: 't1', unitId: 'u1', sector: 'Cozinha', name: 'Limpeza — Cozinha', deadline: '08:00',
      items: [{ id: 'coifa', text: 'Limpar a coifa', recurrence: [1, 3, 5] }] },   // sem flag
    onSave: (t) => { salvo = t; }, onCancel: () => {},
  }));
});

const caixa = [...doc.querySelectorAll('input[type="checkbox"]')].find(
  c => c.closest('label')?.textContent.includes('cobrar no dia seguinte'));
check(!!caixa, 'a caixa de carryover está na tela do editor');
check(caixa?.checked === false, 'e começa desmarcada');

// O clique é despachado SEM mexer em `.checked` antes: quem alterna a caixa é
// a ação padrão do evento, e é isso que faz o React disparar `onChange`.
// Forçar `.checked` na mão engana o rastreador de valor dele e o `onChange`
// nunca acontece — foi o que fez esta asserção falhar na primeira versão.
await clicar(caixa);
check(texto().includes(`Cobra a partir de ${ddmm(hoje)}`), 'ligar anuncia a data de ativação na hora');

const btnSalvar = [...doc.querySelectorAll('button')].find(b => /salvar/i.test(b.textContent));
check(!!btnSalvar, 'o botão de salvar está lá');
await clicar(btnSalvar);

const itemSalvo = salvo?.items?.find(i => i.id === 'coifa');
check(!!salvo, 'salvar entregou o checklist ao app');
check(itemSalvo?.carryover === true, 'a flag chega ligada ao objeto que vai para o banco');
check(itemSalvo?.carryoverSince === hoje, `e com carryoverSince = ${hoje} — o corte de retroatividade`);
check(itemSalvo?.recurrence?.join() === '1,3,5', 'sem estragar a recorrência que já existia');

console.log(ok ? '\n  ✅ PASSOU\n' : '\n  ❌ FALHOU\n');
process.exit(ok ? 0 : 1);
