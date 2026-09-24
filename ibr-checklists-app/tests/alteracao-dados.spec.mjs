/**
 * "Solicitar alteração de dados" — recusa do banco não vira "enviado".
 *
 *   cd ibr-checklists-app && node tests/alteracao-dados.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * O modal do cabeçalho grava o pedido com `supabase.from('user_requests')
 * .insert({...})` e marcava "Solicitação enviada!" logo em seguida. O
 * supabase-js NÃO lança exceção quando o banco recusa (RLS, constraint): ele
 * devolve `{ error }`. Diretoria (unit_id nulo) e gerência de várias lojas
 * (unit_id "u1,u2") caem nisso: o gatilho user_requests_company não acha a
 * empresa pela loja, o WITH CHECK de user_requests_tenant_rw recusa (42501) —
 * e a pessoa via "enviado" com nada gravado (24/09/2026).
 *
 * Este arquivo monta o modal REAL em jsdom, com o PostgREST dublado, e afirma:
 *
 *   1. recusa de RLS (403/42501): nada de "Solicitação enviada!", a mensagem de
 *      erro aparece e o formulário continua lá, com o que foi digitado;
 *   2. falha de rede (fetch lança): o mesmo;
 *   3. banco aceita (201): "Solicitação enviada!" — o controle positivo, sem ele
 *      os dois primeiros passariam com a tela quebrada;
 *   4. o insert sai SEM `select=` na URL: depois da 20260924_user_requests_gestao
 *      só a diretoria lê a tabela, e um `.select()` viraria erro de RLS para
 *      todo o resto.
 *
 * O harness (fetch dublado, jsdom, bundle com esbuild) é o mesmo do
 * tests/auto-concluir.spec.mjs.
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

// fetch dublado. `modo` decide o que o POST em user_requests recebe; guarda as
// chamadas para conferir o que foi enviado.
let modo = 'aceita';
const chamadas = [];
const resposta = (body, status = 200) => ({
  ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Forbidden',
  headers: { get: () => null, has: () => false, forEach: () => {} },
  json: async () => body, text: async () => (body == null ? '' : JSON.stringify(body)),
});
globalThis.fetch = async (url, init = {}) => {
  const u = typeof url === 'string' ? url : (url?.url || String(url));
  const metodo = (init.method || url?.method || 'GET').toUpperCase();
  if (u.includes('/rest/v1/user_requests') && metodo === 'POST') {
    chamadas.push({ u, body: init.body });
    if (modo === 'rls') {
      // O que o PostgREST devolve quando o WITH CHECK recusa a linha.
      return resposta({
        code: '42501', details: null, hint: null,
        message: 'new row violates row-level security policy for table "user_requests"',
      }, 403);
    }
    if (modo === 'rede') throw new TypeError('Failed to fetch');
    return resposta(null, 201);
  }
  return resposta([]);
};

const RUIDO = /indexedDB is not defined|Solicitação de alteração não gravada/;
const comoTexto = (a) => a.map(x => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ');
for (const canal of ['warn', 'error']) {
  const real = console[canal];
  console[canal] = (...a) => { if (!RUIDO.test(comoTexto(a))) real(...a); };
}

// ── Bundle ──────────────────────────────────────────────────────────────────
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-alteracao-dados');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `export { UserDataChangeModal } from '${process.cwd()}/app/app/page.js';`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

// ── DOM ─────────────────────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>', { url: 'https://loja.test/app' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const doc = dom.window.document;
// Só depois do DOM: o react-dom decide no load se o navegador tem o evento
// `input` — carregado sem `document`, digitar não chega ao onChange.
const { UserDataChangeModal } = await import(out);
const { createRoot } = await import('react-dom/client');

const texto = () => doc.body.textContent;
const esperar = async (ms = 40) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const clicar = async (el) => {
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await esperar();
};
const setterValor = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
const digitar = async (el, v) => {
  await act(async () => {
    setterValor.call(el, v);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
};
const botaoQueComeca = (t) => [...doc.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(t));
const campoNome = () => doc.querySelector('input[placeholder="Novo nome completo"]');

// ── Fixtures ────────────────────────────────────────────────────────────────
// A diretoria não tem loja (unit_id nulo); a gerência de duas lojas tem "u1,u2".
// É com eles que o gatilho não acha a empresa.
const diretoria = { id: 'g1', name: 'Diana Diretoria', role: 'gestao', unitId: null };
const gerente = { id: 'm1', name: 'Gil Gerente', role: 'gerencia', unitId: 'u1,u2' };
const colaborador = { id: 'c1', name: 'Caio Colaborador', role: 'colaborador', unitId: 'u1' };

let root = null;
const pedir = async (usuario, novoNome) => {
  if (root) await act(async () => { root.unmount(); });
  root = createRoot(doc.getElementById('r'));
  await act(async () => { root.render(h(UserDataChangeModal, { currentUser: usuario, onClose: () => {} })); });
  await esperar();
  await clicar(botaoQueComeca('Nome completo'));
  await digitar(campoNome(), novoNome);
  await clicar(botaoQueComeca('Enviar solicitação'));
  await esperar();
};

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 1. Banco recusa (RLS) — diretoria sem loja ═══');
modo = 'rls';
await pedir(diretoria, 'Diana D. Souza');
check(chamadas.length === 1, 'o insert foi tentado');
check(!texto().includes('Solicitação enviada'), 'NÃO diz "Solicitação enviada!"');
check(texto().includes('A solicitação não foi enviada'), 'diz que não foi enviada');
check(texto().includes('fale com o suporte'), 'para a diretoria, o caminho é o suporte (não "avise a diretoria")');
check(campoNome()?.value === 'Diana D. Souza', 'o formulário continua aberto, com o que foi digitado');
check(!!botaoQueComeca('Enviar solicitação') && !botaoQueComeca('Enviar solicitação').disabled, 'e o botão volta a aceitar nova tentativa');

console.log('\n═══ 1b. Banco recusa (RLS) — gerência de duas lojas ═══');
await pedir(gerente, 'Gil G. Lima');
check(!texto().includes('Solicitação enviada'), 'NÃO diz "Solicitação enviada!"');
check(texto().includes('avise a diretoria'), 'abaixo da diretoria, o caminho é a diretoria');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 2. Rede cai no meio (fetch lança) ═══');
modo = 'rede';
await pedir(colaborador, 'Caio C. Reis');
check(!texto().includes('Solicitação enviada'), 'NÃO diz "Solicitação enviada!"');
check(texto().includes('A solicitação não foi enviada'), 'diz que não foi enviada');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 3. Banco aceita — controle positivo ═══');
modo = 'aceita';
chamadas.length = 0;
await pedir(colaborador, 'Caio C. Reis');
check(texto().includes('Solicitação enviada'), 'diz "Solicitação enviada!"');
check(!texto().includes('não foi enviada'), 'sem mensagem de erro');
const enviado = JSON.parse(chamadas[0]?.body || '{}');
check(enviado.status === 'pendente' && enviado.note?.startsWith('[ALTERAÇÃO DE DADOS] Nome completo: Caio C. Reis'),
  'o pedido sai pendente, com o prefixo que a aprovação usa para reconhecer alteração');
check(enviado.unit_id === 'u1' && enviado.name === 'Caio Colaborador', 'com o nome e a loja de quem pediu');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 4. O insert não pede a linha de volta ═══');
check(!!chamadas[0] && !/[?&]select=/.test(chamadas[0].u),
  `sem select= na URL (${chamadas[0]?.u.replace(/^https?:\/\/[^/]+/, '')})`);

console.log(ok ? '\nOK — alteracao-dados' : '\nFALHOU — alteracao-dados');
await act(async () => { root.unmount(); });
process.exit(ok ? 0 : 1);
