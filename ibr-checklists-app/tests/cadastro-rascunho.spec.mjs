/**
 * Cadastro — os dados digitados sobrevivem à ida à câmera/galeria.
 *
 *   cd ibr-checklists-app && node tests/cadastro-rascunho.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * Em /cadastro a pessoa preenche nome, CPF, telefone, e-mail e PIN e SÓ DEPOIS
 * tira a selfie. No celular, abrir a câmera ou a galeria manda o navegador para
 * segundo plano; com pouca memória o sistema mata a aba e, na volta, a página
 * recarrega do zero — tudo o que ela tinha digitado sumia (24/09/2026).
 *
 * O conserto grava um rascunho no `sessionStorage` a cada tecla e o relê ao
 * montar. Este arquivo monta a tela REAL em jsdom e simula o recarregamento
 * como ele acontece no aparelho: o React perde todo o estado (desmonta e monta
 * de novo), o `sessionStorage` da aba continua lá. Afirma:
 *
 *   1. depois do "recarregamento", os seis campos voltam preenchidos;
 *   2. o primeiro ciclo da montagem (campos ainda vazios) NÃO apaga o
 *      rascunho — foi o que quase passou despercebido no conserto;
 *   3. escolher a foto não mexe nos dados, e a prévia usa object URL (a foto
 *      não é copiada para uma string base64 na volta da câmera);
 *   4. envio com sucesso apaga o rascunho — nada de CPF e PIN esquecidos
 *      na sessão de um celular da loja.
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

// fetch dublado: a empresa do subdomínio existe; upload, insert e notificação
// respondem OK. Guarda as chamadas para conferir o que foi enviado.
const chamadas = [];
const resposta = (body, status = 200) => ({
  ok: true, status, statusText: 'OK',
  headers: { get: () => null, has: () => false, forEach: () => {} },
  json: async () => body, text: async () => JSON.stringify(body),
});
globalThis.fetch = async (url, init = {}) => {
  const u = typeof url === 'string' ? url : (url?.url || String(url));
  const metodo = (init.method || url?.method || 'GET').toUpperCase();
  chamadas.push({ u, metodo, body: init.body });
  if (u.includes('/rest/v1/companies')) return resposta([{ id: 'c1' }]);
  if (u.includes('/storage/v1/object/')) return resposta({ Key: 'colaboradores/x.jpg' });
  return resposta([], metodo === 'POST' ? 201 : 200);
};

// ── Bundle ──────────────────────────────────────────────────────────────────
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-cadastro-rascunho');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `export { default as CadastroPage } from '${process.cwd()}/app/cadastro/page.js';`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

// ── DOM ─────────────────────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="r"></div></body></html>', { url: 'https://ilhabelarepublic.zcheckapp.com/cadastro' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const doc = dom.window.document;
const storage = dom.window.sessionStorage;

// jsdom não tem object URL. Conta criações e revogações para provar que a
// prévia não vaza memória ao refazer a foto.
const urls = { criadas: 0, revogadas: 0 };
URL.createObjectURL = () => `blob:teste/${++urls.criadas}`;
URL.revokeObjectURL = () => { urls.revogadas++; };

const { CadastroPage } = await import(out);
const { createRoot } = await import('react-dom/client');

const esperar = async (ms = 40) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const setterValor = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
const digitar = async (el, v) => {
  await act(async () => {
    setterValor.call(el, v);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
};
const campo = (placeholder, i = 0) => doc.querySelectorAll(`input[placeholder="${placeholder}"]`)[i];
const campos = () => ({
  nome: campo('Seu nome completo'),
  cpf: campo('000.000.000-00'),
  telefone: campo('(00) 00000-0000'),
  email: campo('seu@email.com'),
  pin: campo('••••', 0),
  pinConfirm: campo('••••', 1),
});
const botaoPorTexto = (t) => [...doc.querySelectorAll('button')].find(b => b.textContent.trim() === t);
const texto = () => doc.body.textContent;

let root = null;
const montar = async () => {
  if (root) await act(async () => { root.unmount(); });
  root = createRoot(doc.getElementById('r'));
  await act(async () => { root.render(h(CadastroPage)); });
  await esperar();
};

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 1. Preenche os dados, a aba "recarrega" ao abrir a câmera ═══');
await montar();
let f = campos();
check(!!f.nome && !!f.pinConfirm, 'o formulário está na tela');
await digitar(f.nome, 'Maria da Silva');
await digitar(f.cpf, '12345678909');
await digitar(f.telefone, '12988887777');
await digitar(f.email, 'maria@exemplo.com');
await digitar(f.pin, '1234');
await digitar(f.pinConfirm, '1234');
check(f.cpf.value === '123.456.789-09', 'CPF formatado ao digitar');

const salvo = JSON.parse(storage.getItem('zc-cadastro-rascunho') || 'null');
check(salvo?.name === 'Maria da Silva' && salvo?.pin === '1234', 'rascunho gravado na sessão a cada tecla');

// O sistema mata a aba: todo o estado do React some; a sessão da aba fica.
await montar();
f = campos();
check(f.nome.value === 'Maria da Silva', 'nome volta preenchido');
check(f.cpf.value === '123.456.789-09', 'CPF volta preenchido');
check(f.telefone.value === '(12) 98888-7777', 'telefone volta preenchido');
check(f.email.value === 'maria@exemplo.com', 'e-mail volta preenchido');
check(f.pin.value === '1234' && f.pinConfirm.value === '1234', 'PIN e confirmação voltam preenchidos');
check(JSON.parse(storage.getItem('zc-cadastro-rascunho') || 'null')?.name === 'Maria da Silva',
  'o primeiro ciclo da montagem (campos vazios) não apagou o rascunho');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 2. Volta da câmera com a foto ═══');
const input = doc.querySelector('input[type="file"][capture="user"]');
check(!!input, 'input da câmera frontal existe');
const foto = new File([new Uint8Array(2048)], 'selfie.jpg', { type: 'image/jpeg' });
Object.defineProperty(input, 'files', { value: [foto], configurable: true });
await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
await esperar();
const previa = doc.querySelector('img[alt="Selfie"]');
check(previa?.getAttribute('src')?.startsWith('blob:'), 'prévia por object URL, não por data URL');
f = campos();
check(f.nome.value === 'Maria da Silva' && f.pin.value === '1234', 'escolher a foto não mexe nos dados');

await act(async () => { botaoPorTexto('Refazer').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
await esperar();
check(!doc.querySelector('img[alt="Selfie"]'), '"Refazer" tira a prévia');
check(urls.revogadas === urls.criadas, 'e revoga o object URL (sem vazamento)');

Object.defineProperty(input, 'files', { value: [foto], configurable: true });
await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
await esperar();

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 3. Envio com sucesso apaga o rascunho ═══');
await act(async () => { botaoPorTexto('Solicitar acesso').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
await esperar(80);
check(texto().includes('Solicitação enviada!'), 'tela de sucesso');
const insert = chamadas.find(c => c.u.includes('/rest/v1/user_requests') && c.metodo === 'POST');
const enviado = insert ? JSON.parse(insert.body) : null;
check(enviado?.name === 'Maria da Silva' && enviado?.cpf === '12345678909' && enviado?.pin === '1234',
  'a solicitação levou os dados restaurados');
check(storage.getItem('zc-cadastro-rascunho') === null, 'rascunho apagado da sessão');

console.log(ok ? '\nOK — cadastro-rascunho' : '\nFALHOU — cadastro-rascunho');
await act(async () => { root.unmount(); });
process.exit(ok ? 0 : 1);
