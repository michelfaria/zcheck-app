/**
 * Conclusão automática — a última tarefa marcada fecha o checklist.
 *
 *   cd ibr-checklists-app && node tests/auto-concluir.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * IBR3, 16/09/2026: o "Rotina Sala" foi dividido entre Leonardo e Pamella.
 * Cada um marcou a sua parte na rodada ao vivo; a rodada ficou 7/7 e ninguém
 * apertou "Concluir checklist" — nenhum dos dois tinha feito o checklist
 * "inteiro". Sem registro, a aderência cobrou um checklist entregue e as
 * tarefas voltaram no dia seguinte.
 *
 * Decisão (Michel, 17/09/2026): quando a marcação de alguém deixa a rodada
 * sem pendência, o checklist é submetido na hora, pelo mesmo caminho do
 * botão. Este arquivo monta a tela REAL em jsdom e afirma:
 *
 *   1. com o colega já tendo marcado 2 de 3, marcar a terceira submete sem
 *      clicar em "Concluir" — e o registro credita cada tarefa a quem a fez;
 *   2. marcar uma tarefa que NÃO é a última não submete nada;
 *   3. sozinha, a pessoa que marca a última também fecha o checklist.
 *
 * O harness (fetch dublado, jsdom, bundle com esbuild) é o mesmo do
 * tests/carryover-ciclo.spec.mjs — ver o cabeçalho de lá para o porquê de
 * cada escolha.
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

// fetch dublado. A rodada ao vivo (GET live_tasks) devolve o que o "colega" já
// marcou; todo o resto (rpc de claim, telemetria, upserts) responde vazio.
let rodada = [];
const resposta = (body) => ({
  ok: true, status: 200, statusText: 'OK',
  headers: { get: () => null, has: () => false, forEach: () => {} },
  json: async () => body, text: async () => JSON.stringify(body),
});
globalThis.fetch = async (url, init = {}) => {
  const u = typeof url === 'string' ? url : (url?.url || String(url));
  const metodo = (init.method || url?.method || 'GET').toUpperCase();
  if (u.includes('/rest/v1/live_tasks') && metodo === 'GET') return resposta(rodada);
  return resposta([]);
};

const RUIDO = /indexedDB is not defined/;
const comoTexto = (a) => a.map(x => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ');
for (const canal of ['warn', 'error']) {
  const real = console[canal];
  console[canal] = (...a) => { if (!RUIDO.test(comoTexto(a))) real(...a); };
}

const TZ = 'America/Sao_Paulo';
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: TZ });

// ── Bundle ──────────────────────────────────────────────────────────────────
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-auto-concluir');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `export { ExecutionScreen } from '${process.cwd()}/app/app/page.js';`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { ExecutionScreen } = await import(out);
const { createRoot } = await import('react-dom/client');

// ── DOM ─────────────────────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>', { url: 'https://loja.test/app' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.scrollTo = () => {};
const doc = dom.window.document;
const texto = () => doc.body.textContent;
const esperar = async (ms = 40) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const clicar = async (el) => {
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await esperar();
};
const linhaDe = (t) => {
  const p = [...doc.querySelectorAll('p')].find(e => e.textContent.trim() === t);
  let n = p?.parentElement;
  while (n && !n.querySelector('button')) n = n.parentElement;
  return n;
};
const marcar = async (t) => { const l = linhaDe(t); check(!!l, `linha "${t}" na tela`); await clicar(l.querySelector('button')); };
const botaoPorTexto = (t) => [...doc.querySelectorAll('button')].find(b => b.textContent.trim() === t);

// ── Fixtures ────────────────────────────────────────────────────────────────
const unit = { id: 'u1', name: 'Loja Teste', color: '#8a2be2', sectors: ['Sala'], timezone: TZ };
const ana = { id: 'u9', name: 'Ana' };
const template = {
  id: 'rotina-sala', unitId: 'u1', sector: 'Sala', name: 'Rotina Sala', deadline: '18:00', shift: 'Manhã e Tarde',
  items: [
    { id: 'a', text: 'Aguar as plantas', critical: true },
    { id: 'b', text: 'Lavar lixeiras' },
    { id: 'c', text: 'Limpeza de vidros' },
  ],
};
const marcaDoBruno = (itemId) => ({
  template_id: 'rotina-sala', unit_id: 'u1', date: hoje, item_id: itemId, done: true,
  operator_user_id: 'u2', operator_name: 'Bruno', completed_at: `${hoje}T13:00:00.000Z`, reopened_count: 0,
});

let registro = null;
let root = null;
const montar = async () => {
  registro = null;
  if (root) await act(async () => { root.unmount(); });
  root = createRoot(doc.getElementById('r'));
  await act(async () => {
    root.render(h(ExecutionScreen, {
      template, unit, currentUser: ana, completions: [], closures: [],
      onCancel: () => {}, onDone: () => {},
      onComplete: (r) => { registro = r; },
    }));
  });
  await esperar();
};

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 1. Bruno marcou 2 de 3; Ana marca a última → fecha sozinho ═══');
rodada = [marcaDoBruno('a'), marcaDoBruno('b')];
await montar();
check(texto().includes('2 de 3 concluídos'), 'a tela já mostra 2 de 3 (as marcações do Bruno chegaram da rodada)');
check(!registro, 'nada submetido ainda');
await marcar('Limpeza de vidros');
check(!!registro, 'marcar a terceira SUBMETEU — sem clicar em "Concluir checklist"');
check(registro?.auto === true, 'o registro vem carimbado como automático');
check(registro?.date === hoje, 'gravado no dia de hoje');
const porId = Object.fromEntries((registro?.items || []).map(i => [i.id, i]));
check(porId.a?.done && porId.b?.done && porId.c?.done, 'as três tarefas vão como feitas');
check(porId.a?.doneBy === 'u2' && porId.b?.doneBy === 'u2', 'as do Bruno creditadas ao Bruno');
check(porId.c?.doneBy === 'u9', 'a da Ana creditada à Ana');
check(registro?.operatorUserId === 'u9', 'quem submeteu foi quem marcou a última (Ana)');
check(texto().includes('Perfeito!'), 'a tela mostra "Perfeito!"');
check(texto().includes('Concluído automaticamente'), 'e explica que fechou sozinho');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 2. Marcar uma que NÃO é a última não submete ═══');
rodada = [marcaDoBruno('a')];
await montar();
check(texto().includes('1 de 3 concluídos'), '1 de 3 na tela');
await marcar('Lavar lixeiras');
check(!registro, 'com 2 de 3, nada é submetido');
check(texto().includes('2 de 3 concluídos'), 'o contador foi para 2 de 3');
check(!!botaoPorTexto('Concluir checklist'), 'e o botão continua lá para quem quiser fechar com pendência');
await marcar('Limpeza de vidros');
check(!!registro && registro.auto === true, 'a terceira fecha sozinho');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 3. Sozinha: marcar as três, uma a uma, fecha na terceira ═══');
rodada = [];
await montar();
await marcar('Aguar as plantas');
check(!registro, 'após a 1ª: nada');
await marcar('Lavar lixeiras');
check(!registro, 'após a 2ª: nada');
await marcar('Limpeza de vidros');
check(!!registro && registro.auto === true, 'após a 3ª: submetido automaticamente');
check((registro?.items || []).every(i => i.doneBy === 'u9'), 'tudo creditado à Ana');
check(!botaoPorTexto('Concluir checklist'), 'a tela de execução deu lugar à comemoração');

console.log(ok ? '\nOK — auto-concluir' : '\nFALHOU — auto-concluir');
await act(async () => { root.unmount(); });
process.exit(ok ? 0 : 1);
