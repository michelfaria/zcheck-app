/**
 * Conferência em tela cheia — a página atrás não rola, e volta ao lugar.
 *
 *   cd ibr-checklists-app && node tests/conferencia-tela-cheia.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * Vídeo de 21/09/2026 (IBR2, iPhone): com a folha "Conferir execução" aberta,
 * arrastar o dedo sobre ela rolava o Painel ATRÁS — as linhas da fila passavam
 * por baixo do véu e a folha ficava parada. Em 26/09/2026 a conferência virou
 * tela cheia e passou a travar a página (`lib/useTravaRolagem.js`).
 *
 * O toque do iPhone não se reproduz em jsdom; o que se prova aqui é o
 * mecanismo que o segura, montando a tela REAL:
 *
 *   1. aberta, a conferência tira o body do fluxo no ponto em que a página
 *      estava (`position: fixed; top: -Ypx`) — é isso que o toque não consegue
 *      rolar;
 *   2. ela é tela cheia de verdade: `fixed inset-0` com `margin: 0` (quem a
 *      renderiza é um `.space-y-4`, cuja margem descia o overlay 16px e deixava
 *      uma faixa do Painel no topo), sem o `maxHeight` da folha antiga, com
 *      "Voltar" no topo e a decisão no pé;
 *   3. a foto aberta por cima e fechada NÃO destrava a página — a conferência
 *      continua aberta embaixo dela;
 *   4. fechada a conferência, o body volta ao estilo de antes e a página volta
 *      à mesma posição (quem confere cai na linha da fila de onde saiu);
 *   5. a observação geral começa RECOLHIDA num botão (iPhone, 26/09/2026: a
 *      caixa aberta disputava a altura com a lista) e abre no toque — já aberta
 *      quando a execução tem observação gravada — e o pé diz "tarefas
 *      conferidas".
 */

import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement as h, act } from 'react';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.on('unhandledRejection', () => {});

// A foto pede URL assinada ao storage: sem rede, qualquer chamada volta vazia.
globalThis.fetch = async () => ({
  ok: true, status: 200, statusText: 'OK',
  headers: { get: () => null, has: () => false, forEach: () => {} },
  json: async () => ({}), text: async () => '{}',
});

// ── Bundle ──────────────────────────────────────────────────────────────────
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-conferencia-tela-cheia');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { ReviewModal } from '${process.cwd()}/components/painel/ReportsView.js';
  export { PhotoModal } from '${process.cwd()}/components/painel/shared.js';
  export { UnitsContext } from '${process.cwd()}/components/painel/context.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

// ── DOM ─────────────────────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="r"></div></body></html>', { url: 'https://ilhabelarepublic.zcheckapp.com/app' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const doc = dom.window.document;

// jsdom não rola: a página "está" em 830px e o scrollTo só é anotado.
const rolagens = [];
Object.defineProperty(dom.window, 'scrollY', { value: 830, configurable: true });
dom.window.scrollTo = (a, b) => { rolagens.push(typeof a === 'object' ? a.top : b); };
doc.body.style.background = 'rgb(1, 2, 3)'; // estilo prévio que tem de sobreviver

const { ReviewModal, PhotoModal, UnitsContext } = await import(out);
const { createRoot } = await import('react-dom/client');

const unit = { id: 'u1', name: 'IBR2', timezone: 'America/Sao_Paulo' };
const templates = [{
  id: 't1', unitId: 'u1', sector: 'Caixa', name: 'Rotina Caixa', deadline: '16:50', active: true,
  items: [{ id: 'i1', text: 'Enviar pedido de mercado', critical: true, photoRequired: true }],
}];
const execucao = {
  id: 'c1', templateId: 't1', unitId: 'u1', sector: 'Caixa', date: '2026-09-21',
  templateName: 'Rotina Caixa', operatorName: 'Maria', operatorUserId: 'p1',
  completedAt: '2026-09-21T15:49:00.000Z',
  items: [{ id: 'i1', text: 'Enviar pedido de mercado', critical: true, done: true, hasPhoto: true, doneAt: '2026-09-21T15:49:00.000Z' }],
};

let fechou = 0;
let foto = false;
let completion = execucao;
const Tela = () => h(UnitsContext.Provider, { value: [unit] },
  h(ReviewModal, {
    completion, templates, accent: '#8a2be2',
    onClose: () => { fechou++; }, onReview: async () => true,
    onOpenPhoto: () => {},
  }),
  foto ? h(PhotoModal, { recordId: 'c1', item: execucao.items[0], onClose: () => {} }) : null,
);

const root = createRoot(doc.getElementById('r'));
const render = async () => { await act(async () => { root.render(h(Tela)); }); };
const body = () => doc.body.style;
const dialogo = () => doc.querySelector('[role="dialog"][aria-labelledby="zc-conf-titulo"]');
const botao = t => [...doc.querySelectorAll('button')].find(b => b.textContent.trim() === t);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 1. Aberta, a conferência trava a página no ponto em que estava ═══');
await render();
check(body().position === 'fixed', 'body sai do fluxo (position: fixed)');
check(body().top === '-830px', 'no ponto em que a página estava (top: -830px)');
check(body().overflow === '', 'sem overflow no body — com `overflow-x: clip` no <html>, ele faria do body contêiner de rolagem e o header sticky sumiria');

console.log('\n═══ 2. É tela cheia, não folha ═══');
const d = dialogo();
check(!!d, 'o diálogo está na tela, rotulado pelo título');
check(d?.className.includes('fixed') && d?.className.includes('inset-0'), 'ocupa a janela inteira (fixed inset-0)');
check(d?.style.margin === '0px', 'margin: 0 — o `.space-y-4` do pai não desce o overlay');
check(!doc.querySelector('[style*="max-height"]'), 'sem o maxHeight da folha antiga');
check(!!botao('Voltar'), '"Voltar" no topo');
check(!!botao('Confirmar conferência'), 'a decisão continua à vista');
await act(async () => { botao('Voltar').click(); });
check(fechou === 1, '"Voltar" fecha');

console.log('\n═══ 3. A foto por cima abre e fecha sem destravar a página ═══');
foto = true;
await render();
check(body().position === 'fixed' && body().top === '-830px', 'com a foto aberta, a página segue travada');
foto = false;
await render();
check(body().position === 'fixed' && body().top === '-830px', 'fechada a foto, a conferência embaixo segue travando');
check(rolagens.length === 0, 'e a página não foi rolada no meio do caminho');

console.log('\n═══ 4. Fechada a conferência, tudo volta ao lugar ═══');
await act(async () => { root.unmount(); });
check(body().position === '' && body().top === '' && body().overflow === '', 'body volta ao estilo de antes');
check(body().background === 'rgb(1, 2, 3)', 'o estilo que já estava no body não se perde');
check(rolagens.length === 1 && rolagens[0] === 830, 'a página volta a 830px, a linha da fila de onde se saiu');

console.log('\n═══ 5. Observação geral recolhida; "tarefas conferidas" ═══');
const root2 = createRoot(doc.getElementById('r'));
await act(async () => { root2.render(h(Tela)); });
const caixa = () => doc.getElementById('zc-review-note');
check(!caixa(), 'a caixa da observação não ocupa a tela de início');
check(!!botao('Adicionar observação geral'), 'no lugar dela, um botão para abrir');
check(doc.body.textContent.includes('1 de 1 tarefas conferidas'), 'o pé diz "tarefas conferidas"');
check(!doc.body.textContent.includes('julgadas'), '"julgadas" saiu da tela');
await act(async () => { botao('Adicionar observação geral').click(); });
check(!!caixa(), 'o toque abre a caixa');
check(doc.activeElement === caixa(), 'com o cursor dentro — quem tocou quer escrever');
check(!botao('Adicionar observação geral'), 'e o botão sai');
await act(async () => { root2.unmount(); });

completion = { ...execucao, reviewNote: 'Conferir o grupo antes das 16h', reviewedAt: '2026-09-21T17:00:00.000Z' };
const root3 = createRoot(doc.getElementById('r'));
await act(async () => { root3.render(h(Tela)); });
check(caixa()?.value === 'Conferir o grupo antes das 16h', 'observação já gravada aparece aberta, com o texto');
check(doc.activeElement !== caixa(), 'sem roubar o foco (não sobe o teclado ao abrir)');
await act(async () => { root3.unmount(); });

console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
