/**
 * Fila de pedidos de acesso — a baixa que o banco recusa não some da tela.
 *
 *   cd ibr-checklists-app && node tests/aprovacao-pedido.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * Aprovar um cadastro são duas escritas: a RPC `create_user_from_request` cria
 * a pessoa, e um `update` em `user_requests` dá baixa no pedido. O supabase-js
 * NÃO lança exceção quando o banco recusa (RLS, constraint) nem quando a rede
 * cai: devolve `{ error }`. O app não olhava o `error` da baixa — o pedido
 * sumia da fila da tela, seguia `pendente` no banco, voltava no próximo
 * carregamento, e aprovar de novo criava uma SEGUNDA pessoa (o id era `uid()`,
 * novo a cada aprovação). Recusar tinha o mesmo defeito: o pedido sumia e
 * voltava no reload (24/09/2026, mesma classe do alteracao-dados.spec.mjs).
 *
 * A decisão: a pessoa criada NÃO é desfeita (desfazer seria outra escrita que
 * pode falhar). O id do acesso passa a ser derivado do pedido, e a tela acha o
 * acesso na lista de usuários — no mesmo aparelho ou depois de recarregar — e
 * troca "Aprovar cadastro"/"Rejeitar" por "Acesso já criado" + "Tirar da fila",
 * que só dá a baixa.
 *
 * Este arquivo monta a aba Usuários REAL em jsdom, com o PostgREST dublado (o
 * dublê guarda a fila e os usuários como o banco guardaria), e afirma:
 *
 *   1. baixa recusada (RLS 42501) depois da RPC: a pessoa existe UMA vez, o
 *      pedido continua na fila, a tela diz "Acesso já criado" e o motivo, e
 *      não oferece "Aprovar cadastro" nem "Rejeitar";
 *   2. recarregar (tela montada de novo, fila e usuários lidos do "banco"): o
 *      pedido volta como "Acesso já criado"; "Tirar da fila" dá a baixa SEM
 *      chamar a RPC de novo — nenhuma segunda pessoa — com papel e setor da
 *      pessoa criada;
 *   3. rede cai na baixa: o mesmo; tentar de novo na mesma tela tira da fila;
 *   4. banco aceita: o controle positivo (sem ele, 1–3 passariam com a tela
 *      quebrada);
 *   5. recusar: RLS e rede deixam o pedido na fila e na tela, com o motivo;
 *      aceito, sai;
 *   6. alteração de dados: baixa recusada diz que os dados JÁ foram
 *      atualizados e mantém o pedido; confirmar de novo tira da fila;
 *   7. nenhum update em user_requests pede a linha de volta (`select=`).
 *
 * Harness (fetch dublado, jsdom, bundle com esbuild) igual ao do
 * tests/auto-concluir.spec.mjs, mais um WebSocket de mentira: a aba abre um
 * canal de presença no realtime, e nada pode sair da máquina.
 */

import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement as h, useState, act } from 'react';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.on('unhandledRejection', () => {});

// WebSocket que nunca conecta: o canal de presença da aba fica "conectando".
class WebSocketDeMentira {
  constructor() { this.readyState = 0; }
  send() {}
  close() { this.readyState = 3; }
  addEventListener() {}
  removeEventListener() {}
}
Object.defineProperty(globalThis, 'WebSocket', { value: WebSocketDeMentira, configurable: true, writable: true });

// ── O "banco" ───────────────────────────────────────────────────────────────
const idA = '11111111-aaaa-4aaa-8aaa-000000000001';
const idB = '22222222-bbbb-4bbb-8bbb-000000000002';
const idC = '33333333-cccc-4ccc-8ccc-000000000003';
const idAlt = '44444444-dddd-4ddd-8ddd-000000000004';
const idRej = '55555555-eeee-4eee-8eee-000000000005';
const pedido = (id, name, extra = {}) => ({
  id, name, cpf: '000.000.000-00', phone: '(12) 90000-0000', email: null,
  unit_id: 'ibr1', selfie_path: null, status: 'pendente', note: null,
  role: null, sector_id: null, created_at: '2026-09-24T12:00:00Z',
  reviewed_at: null, reviewed_by: null, ...extra,
});
const fila = [
  pedido(idA, 'Ana Nova'),
  pedido(idB, 'Bia Nova'),
  pedido(idC, 'Cris Nova'),
  pedido(idAlt, 'Caio Colaborador', { note: '[ALTERAÇÃO DE DADOS] Nome completo: Caio C. Reis' }),
  pedido(idRej, 'Rui Recusado'),
];
const gestor = { id: 'g1', name: 'Diana Diretoria', role: 'gestao', unitId: null };
const usuariosNoBanco = [
  gestor,
  { id: 'c1', name: 'Caio Colaborador', role: 'colaborador', unitId: 'ibr1', sectorId: null },
];
const units = [{ id: 'ibr1', name: 'IBR1', color: '#2f6f4e', sectors: [], timezone: 'America/Sao_Paulo' }];

// `baixa` decide o que o PATCH em user_requests recebe. `rpc` e `patches`
// guardam o que foi enviado.
let baixa = 'aceita';
const rpc = [];
const patches = [];
const todasAsBaixas = [];   // nunca zerada: é a da seção 7
const resposta = (body, status = 200) => ({
  ok: status < 400, status, statusText: status < 400 ? 'OK' : 'Forbidden',
  headers: { get: () => null, has: () => false, forEach: () => {} },
  json: async () => body, text: async () => (body == null ? '' : JSON.stringify(body)),
});
globalThis.fetch = async (url, init = {}) => {
  const u = typeof url === 'string' ? url : (url?.url || String(url));
  const metodo = (init.method || url?.method || 'GET').toUpperCase();
  if (u.includes('/rest/v1/rpc/create_user_from_request')) {
    const b = JSON.parse(init.body);
    rpc.push(b);
    // A RPC de produção hoje (20260726_tenant_03e): INSERT … ON CONFLICT (id).
    const i = usuariosNoBanco.findIndex(x => x.id === b.p_user_id);
    const linha = { id: b.p_user_id, name: b.p_name, role: b.p_role, unitId: b.p_unit_id, sectorId: b.p_sector_id };
    if (i >= 0) usuariosNoBanco[i] = linha; else usuariosNoBanco.push(linha);
    return resposta(null, 204);
  }
  if (u.includes('/rest/v1/user_requests') && metodo === 'PATCH') {
    const body = JSON.parse(init.body);
    patches.push({ u, body });
    todasAsBaixas.push(u);
    if (baixa === 'rls') {
      return resposta({
        code: '42501', details: null, hint: null,
        message: 'new row violates row-level security policy for table "user_requests"',
      }, 403);
    }
    if (baixa === 'rede') throw new TypeError('Failed to fetch');
    const id = decodeURIComponent(u.match(/[?&]id=eq\.([^&]+)/)?.[1] || '');
    const i = fila.findIndex(x => x.id === id);
    if (i >= 0 && body.status !== 'pendente') fila.splice(i, 1);
    return resposta(null, 204);
  }
  if (u.includes('/rest/v1/user_requests') && metodo === 'GET') {
    return resposta(fila.map(x => ({ ...x })));
  }
  return resposta([]);
};

const RUIDO = /indexedDB is not defined|row-level security|Failed to fetch|não foi recusado|não saiu da fila/;
const comoTexto = (a) => a.map(x => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ');
for (const canal of ['warn', 'error']) {
  const real = console[canal];
  console[canal] = (...a) => { if (!RUIDO.test(comoTexto(a))) real(...a); };
}

// ── Bundle ──────────────────────────────────────────────────────────────────
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-aprovacao-pedido');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { UsersView } from '${process.cwd()}/app/app/page.js';
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
const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>', { url: 'https://loja.test/app' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.WebSocket = WebSocketDeMentira;
// O showToast faz `window.dispatchEvent(new CustomEvent(...))`: o CustomEvent
// tem de ser o do jsdom, não o do Node.
globalThis.CustomEvent = dom.window.CustomEvent;
const doc = dom.window.document;
// Só depois do DOM: o react-dom decide no load o que o navegador tem.
const { UsersView, UnitsContext } = await import(out);
const { createRoot } = await import('react-dom/client');

const texto = () => doc.body.textContent;
const esperar = async (ms = 40) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const clicar = async (el) => {
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await esperar();
};
const botoes = () => [...doc.querySelectorAll('button')];
const botao = (t) => botoes().find(b => b.textContent.trim() === t);
const cartao = (nome) => botoes().find(b => b.textContent.includes(nome) && b.textContent.includes('IBR1'));
const voltarParaFila = async () => clicar(botoes().find(b => b.textContent.includes('Solicitações')));

// A aba recebe `users` do App; `onSaveUsers` troca a lista, como o saveUsers.
let usuariosNaTela = null;
function Casca({ inicial }) {
  const [users, setUsers] = useState(inicial);
  usuariosNaTela = users;
  return h(UnitsContext.Provider, { value: units },
    h(UsersView, {
      users, currentUser: gestor, unitId: null,
      onSaveUsers: async (next) => { setUsers(next); },
    }));
}
let root = null;
// "Recarregar": monta de novo, com a lista de usuários e a fila lidas do banco.
const montar = async () => {
  if (root) await act(async () => { root.unmount(); });
  root = createRoot(doc.getElementById('r'));
  await act(async () => { root.render(h(Casca, { inicial: usuariosNoBanco.map(x => ({ ...x })) })); });
  await esperar();
};
const quantos = (lista, nome) => lista.filter(x => x.name === nome).length;
const idDoAcesso = id => `p${id.replace(/[^a-zA-Z0-9]/g, '')}`;

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 1. Cadastro: a RPC cria, a baixa é recusada (RLS) ═══');
baixa = 'rls';
await montar();
await clicar(cartao('Ana Nova'));
await clicar(botao('Aprovar cadastro'));
check(rpc.length === 1, 'a RPC foi chamada uma vez');
check(rpc[0]?.p_user_id === idDoAcesso(idA), `o id do acesso vem do pedido (${rpc[0]?.p_user_id})`);
check(patches.length === 1, 'a baixa foi tentada');
check(quantos(usuariosNoBanco, 'Ana Nova') === 1 && quantos(usuariosNaTela, 'Ana Nova') === 1,
  'a pessoa existe UMA vez, no banco e na lista da tela (nada é desfeito)');
check(fila.some(x => x.id === idA), 'no banco, o pedido segue pendente');
check(texto().includes('Acesso já criado'), 'a tela diz "Acesso já criado"');
check(texto().includes('O acesso de Ana Nova já foi criado, mas o pedido não saiu da fila')
  && texto().includes('row-level security'), 'e diz que o pedido não saiu da fila, com o motivo');
check(!botao('Aprovar cadastro'), 'NÃO oferece "Aprovar cadastro" de novo');
check(!botao('Rejeitar'), 'nem "Rejeitar" (a pessoa já entra)');
check(!!botao('Tirar da fila') && !botao('Tirar da fila').disabled, 'oferece "Tirar da fila", liberado');
await voltarParaFila();
check(!!cartao('Ana Nova'), 'de volta à fila, o pedido continua lá');
check(texto().includes('Acesso já criado — falta tirar da fila'), 'marcado como acesso já criado');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 2. Recarregar: o pedido volta, e não vira segunda pessoa ═══');
await montar();
check(!!cartao('Ana Nova') && texto().includes('Acesso já criado — falta tirar da fila'),
  'depois de recarregar, a fila reconhece o acesso pela lista de usuários');
await clicar(cartao('Ana Nova'));
check(texto().includes('Acesso já criado') && !botao('Aprovar cadastro') && !botao('Rejeitar'),
  'a revisão mostra "Acesso já criado", sem "Aprovar cadastro" nem "Rejeitar"');
check(!texto().includes('Nível de acesso'), 'e sem os seletores de papel/loja (não valem mais)');
baixa = 'aceita';
patches.length = 0;
await clicar(botao('Tirar da fila'));
check(rpc.length === 1, '"Tirar da fila" NÃO chama a RPC de novo');
check(quantos(usuariosNoBanco, 'Ana Nova') === 1 && quantos(usuariosNaTela, 'Ana Nova') === 1,
  'continua UMA pessoa só');
const b2 = patches[0]?.body || {};
check(b2.status === 'aprovado' && b2.reviewed_by === 'g1', 'a baixa grava aprovado, com quem revisou');
check(b2.role === 'colaborador' && b2.name === 'Ana Nova' && !('pin' in b2),
  'com papel e nome da pessoa criada, sem PIN');
check(!fila.some(x => x.id === idA) && !cartao('Ana Nova'), 'o pedido saiu da fila, no banco e na tela');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 3. Cadastro: a rede cai na baixa ═══');
baixa = 'rede';
await clicar(cartao('Bia Nova'));
await clicar(botao('Aprovar cadastro'));
check(rpc.length === 2 && rpc[1].p_user_id === idDoAcesso(idB), 'a RPC criou a Bia');
check(texto().includes('Acesso já criado') && texto().includes('não saiu da fila'),
  'a tela diz que o acesso existe e o pedido não saiu da fila');
check(!botao('Aprovar cadastro') && !!botao('Tirar da fila'), '"Tirar da fila" no lugar de "Aprovar cadastro"');
baixa = 'aceita';
await clicar(botao('Tirar da fila'));
check(rpc.length === 2, 'tentar de novo na mesma tela não chama a RPC');
check(quantos(usuariosNoBanco, 'Bia Nova') === 1 && !cartao('Bia Nova'), 'uma Bia só, e fora da fila');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 4. Banco aceita — controle positivo ═══');
patches.length = 0;
await clicar(cartao('Cris Nova'));
check(!texto().includes('Acesso já criado'), 'pedido novo não aparece como acesso já criado');
check(!!botao('Aprovar cadastro') && !!botao('Rejeitar'), 'e oferece "Aprovar cadastro" e "Rejeitar"');
await clicar(botao('Aprovar cadastro'));
check(rpc.length === 3 && patches.length === 1, 'RPC e baixa, uma vez cada');
check(quantos(usuariosNaTela, 'Cris Nova') === 1 && !cartao('Cris Nova'), 'a Cris está na lista e fora da fila');
check(!texto().includes('não saiu da fila'), 'sem mensagem de erro');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 5. Recusar ═══');
baixa = 'rls';
patches.length = 0;
await clicar(cartao('Rui Recusado'));
await clicar(botao('Rejeitar'));
check(patches[0]?.body.status === 'rejeitado', 'a recusa foi tentada');
check(!!botao('Rejeitar') && texto().includes('O pedido não foi recusado e continua na fila')
  && texto().includes('row-level security'), 'RLS: a tela fica, com o motivo');
await voltarParaFila();
check(!!cartao('Rui Recusado'), 'e o pedido continua na fila');
baixa = 'rede';
await clicar(cartao('Rui Recusado'));
await clicar(botao('Rejeitar'));
check(!!botao('Rejeitar') && texto().includes('O pedido não foi recusado'), 'rede: o mesmo');
baixa = 'aceita';
await clicar(botao('Rejeitar'));
check(!cartao('Rui Recusado') && !fila.some(x => x.id === idRej), 'aceito: sai da fila, no banco e na tela');
check(rpc.length === 3, 'recusar nunca chama a RPC');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 6. Alteração de dados: baixa recusada ═══');
baixa = 'rls';
await clicar(cartao('Caio Colaborador'));
await clicar(botao('Confirmar alteração'));
check(quantos(usuariosNaTela, 'Caio C. Reis') === 1, 'a alteração foi aplicada (Caio C. Reis)');
check(texto().includes('Os dados já foram atualizados, mas o pedido não saiu da fila'),
  'a tela diz que os dados já mudaram e o pedido não saiu da fila');
check(!!botao('Confirmar alteração'), 'e continua na revisão, para tentar de novo');
baixa = 'aceita';
await clicar(botao('Confirmar alteração'));
check(!cartao('Caio') && !fila.some(x => x.id === idAlt), 'confirmar de novo tira da fila');
check(usuariosNaTela.length === 5, `ninguém duplicado (${usuariosNaTela.map(x => x.name).join(', ')})`);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 7. Os updates não pedem a linha de volta ═══');
check(todasAsBaixas.length >= 10 && todasAsBaixas.every(u => !/[?&]select=/.test(u)),
  `sem select= em nenhuma das ${todasAsBaixas.length} (${todasAsBaixas[0]?.replace(/^https?:\/\/[^/]+/, '')})`);

console.log(ok ? '\nOK — aprovacao-pedido' : '\nFALHOU — aprovacao-pedido');
await act(async () => { root.unmount(); });
process.exit(ok ? 0 : 1);
