/**
 * Recarga das conclusões — o que o realtime perdeu com o app em segundo plano.
 *
 *   cd ibr-checklists-app && node tests/conclusoes-recarga.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * IBR2, 24/09/2026, Abertura Pca Bebidas. O Michel concluiu com 2 de 10 às
 * 07:35 e guardou o celular. O Nicolas marcou as outras 8 e o app DELE fechou
 * o checklist sozinho às 07:38 (10/10, `auto: true`) — a conclusão estava no
 * banco. Às 08:17 o celular do Michel mostrava "Parcial · 2 de 10" no cartão e,
 * dentro do checklist, 10 de 10 com "Concluir checklist" aceso. A equipe leu
 * como "o checklist continua sem concluir".
 *
 * Não era a conclusão automática: era a LISTA de conclusões em memória. O
 * realtime só entrega o INSERT que acontece com o socket vivo, e o socket morre
 * com o app em segundo plano. As marcações vinham frescas (a tela relê
 * `live_tasks` ao abrir); as conclusões eram as das 07:35.
 *
 * Este arquivo afirma:
 *
 *   1. as regras puras da recarga incremental (marca-d'água pelo relógio do
 *      servidor, folga, junção que só acrescenta e preserva a conferência);
 *   2. a cena do IBR2 pela régua do cartão (`templateStatus`): sem a recarga,
 *      "partial"; com ela, "done";
 *   3. a tela real (jsdom): a Rotina pede a recarga ao abrir e ao entrar no
 *      checklist, e o cartão deixa de dizer "2 de 10 feitos".
 *
 * O harness da parte 3 é o de tests/auto-concluir.spec.mjs.
 */

import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement as h, act, useState, useCallback } from 'react';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.on('unhandledRejection', () => {});

// fetch dublado: a rodada ao vivo (e as marcações da loja, mesma tabela)
// devolve as 10 tarefas marcadas; o resto responde vazio.
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

// ── Bundle ──────────────────────────────────────────────────────────────────
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-conclusoes-recarga');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { ExecutarView } from '${process.cwd()}/app/app/page.js';
  export { marcaDagua, marcaMaisNova, inicioDaRecarga, juntarConclusoes, COMPLETIONS_HORIZON } from '${process.cwd()}/lib/completions.js';
  export { templateStatus, templateProgress } from '${process.cwd()}/lib/checklists.js';
  export { todayStr } from '${process.cwd()}/lib/dates.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const {
  ExecutarView, marcaDagua, marcaMaisNova, inicioDaRecarga, juntarConclusoes, COMPLETIONS_HORIZON,
  templateStatus, templateProgress, todayStr,
} = await import(out);
const { createRoot } = await import('react-dom/client');

// ── Fixtures: a Abertura Pca Bebidas do IBR2 ────────────────────────────────
const TZ = 'America/Sao_Paulo';
const HOJE = todayStr(TZ);
const unit = { id: 'ibr2', name: 'IBR2', color: '#e000e0', sectors: ['Pca Bebidas'], timezone: TZ };
const TAREFAS = [
  'Conferir máquina de espresso ligada e com pressão', 'Regular Moinho/ café espresso',
  'Verificar o moinho de filtrados e coados', 'Verificar Blender (Liquidificador)',
  'Abastecer copos e xícaras em cima da máquina de espresso.', 'Conferir métodos e filtros de cafés',
  'Conferir os utensílios Praça Bebidas', 'Repor águas, Refris, Leites, caldas',
  'Checar qualidade do chantilly', 'Abastecer potes de insumos bar',
];
const template = {
  id: '2n44wydg', unitId: 'ibr2', sector: 'Pca Bebidas', name: 'Abertura Pca Bebidas',
  shift: 'Manhã', deadline: '08:00',
  items: TAREFAS.map((text, i) => ({ id: `t${i + 1}`, text })),
};
const DO_MICHEL = new Set(['t3', 't4']);
const michel = { id: 'f8jhqkwh', name: 'Michel-IBR', role: 'diretoria', unitId: null, sectorId: null };
const nicolas = { id: 'hh2fpqlz', name: 'Nicolas Galha Lemes' };
const quem = id => (DO_MICHEL.has(id) ? michel : nicolas);

const conclusao = ({ id, por, hora, criada, feitas }) => ({
  id, templateId: template.id, templateName: template.name, unitId: 'ibr2', sector: 'Pca Bebidas',
  shift: 'Manhã', date: HOJE, completedAt: `${HOJE}T${hora}.000Z`, createdAt: `${HOJE}T${criada}.000+00:00`,
  operatorName: por.name, operatorUserId: por.id,
  items: template.items.map(i => {
    const done = feitas(i.id);
    return { id: i.id, text: i.text, done, doneBy: done ? quem(i.id).id : null, doneByName: done ? quem(i.id).name : null };
  }),
});
// 07:35:47 (10:35:47Z): o Michel conclui com as duas dele.
const DO_MICHEL_0735 = conclusao({ id: 'zxlygwgg', por: michel, hora: '10:35:47', criada: '10:35:48', feitas: id => DO_MICHEL.has(id) });
// 07:38:47: o app do Nicolas fecha sozinho com 10/10 — o que o realtime perdeu.
const DO_NICOLAS_0738 = conclusao({ id: '1p7205xd', por: nicolas, hora: '10:38:47', criada: '10:38:48', feitas: () => true });

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 1. Regras puras da recarga ═══');

check(marcaDagua([DO_MICHEL_0735, DO_NICOLAS_0738]) === DO_NICOLAS_0738.createdAt, 'marca-d\'água = o created_at mais novo');
check(marcaDagua([{ id: 'x' }, null]) === null && marcaDagua(null) === null, 'sem created_at (cache antigo) não há marca');
check(marcaMaisNova(DO_MICHEL_0735.createdAt, null) === DO_MICHEL_0735.createdAt, 'recarga vazia não apaga a marca');
check(marcaMaisNova(DO_NICOLAS_0738.createdAt, DO_MICHEL_0735.createdAt) === DO_NICOLAS_0738.createdAt, 'marca nunca anda para trás');
check(marcaMaisNova(null, DO_MICHEL_0735.createdAt) === DO_MICHEL_0735.createdAt, 'primeira marca entra');

const agora = Date.parse(`${HOJE}T11:17:00Z`);
const inicio = Date.parse(inicioDaRecarga(DO_MICHEL_0735.createdAt, agora));
check(inicio === Date.parse(DO_MICHEL_0735.createdAt) - 5 * 60 * 1000, 'recarga começa 5 min antes da marca (folga de commit)');
check(inicio <= Date.parse(DO_NICOLAS_0738.createdAt), 'a conclusão perdida das 07:38 cai dentro da janela');
check(Date.parse(inicioDaRecarga(null, agora)) === agora - 48 * 3600 * 1000, 'sem marca: últimas 48 h');

const conferida = { ...DO_MICHEL_0735, items: DO_MICHEL_0735.items.map(i => ({ ...i, review: { status: 'aprovada' } })) };
const prev = [conferida];
check(juntarConclusoes(prev, []) === prev, 'nada novo: a MESMA lista (sem re-render do app)');
check(juntarConclusoes(prev, [DO_MICHEL_0735]) === prev, 'só repetida: a MESMA lista');
const junta = juntarConclusoes(prev, [DO_MICHEL_0735, DO_NICOLAS_0738]);
check(junta.length === 2 && junta[1].id === DO_NICOLAS_0738.id, 'a que faltava é acrescentada');
check(junta[0] === conferida && junta[0].items[0].review?.status === 'aprovada',
  'a que já estava fica como estava — o veredito da conferência não some');
check(juntarConclusoes(null, [DO_NICOLAS_0738]).length === 1, 'lista ainda não carregada não derruba');
const cheia = Array.from({ length: COMPLETIONS_HORIZON }, (_, i) => ({ id: `v${i}`, date: '2026-06-01', completedAt: '2026-06-01T12:00:00Z' }));
check(juntarConclusoes(cheia, [DO_NICOLAS_0738]).length === COMPLETIONS_HORIZON
  && juntarConclusoes(cheia, [DO_NICOLAS_0738]).some(c => c.id === DO_NICOLAS_0738.id),
  'respeita o teto e corta a mais ANTIGA, não a recém-chegada');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 2. A cena do IBR2 pela régua do cartão ═══');

const naMemoria = [DO_MICHEL_0735];
const p0 = templateProgress(template, naMemoria, HOJE);
check(templateStatus(template, naMemoria, HOJE, TZ) === 'partial' && p0.done === 2 && p0.total === 10,
  'sem a recarga: "Parcial · 2 de 10" — o que o celular do Michel mostrava às 08:17');
const recarregada = juntarConclusoes(naMemoria, [DO_MICHEL_0735, DO_NICOLAS_0738]);
check(templateStatus(template, recarregada, HOJE, TZ) === 'done', 'com a recarga: "Concluído"');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 3. Tela real: a Rotina pede a recarga e o cartão se corrige ═══');

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
const botaoCom = (t) => [...doc.querySelectorAll('button')].find(b => b.textContent.includes(t));

// As 10 marcadas na rodada ao vivo — é o que a tela do Michel via por dentro.
rodada = template.items.map(i => ({
  template_id: template.id, unit_id: 'ibr2', date: HOJE, item_id: i.id, done: true,
  operator_user_id: quem(i.id).id, operator_name: quem(i.id).name,
  completed_at: `${HOJE}T10:3${DO_MICHEL.has(i.id) ? '5:40' : '8:30'}.000Z`, reopened_count: 0,
}));

let chamadas = 0;
let bancoResponde = true;
function App() {
  const [completions, setCompletions] = useState([DO_MICHEL_0735]);
  // O dublê do `recarregarConclusoes` do AppInner: o "banco" devolve as duas.
  const recarregar = useCallback(async () => {
    chamadas++;
    if (bancoResponde) setCompletions(prev => juntarConclusoes(prev, [DO_MICHEL_0735, DO_NICOLAS_0738]));
  }, []);
  return h(ExecutarView, {
    unit, templates: [template], completions, closures: [], currentUser: michel,
    onSaveCompletion: () => {}, onRefreshCompletions: recarregar,
  });
}

const montar = async () => {
  const root = createRoot(doc.getElementById('r'));
  await act(async () => { root.render(h(App)); });
  await esperar();
  return root;
};

// 3a. Sem resposta do banco (o comportamento de antes): a lista velha engana.
bancoResponde = false;
chamadas = 0;
let root = await montar();
check(chamadas >= 1, 'abrir a Rotina pede a recarga');
await clicar(botaoCom('Abertura'));
check(texto().includes('2 de 10 feitos'), 'lista velha: o cartão diz "2 de 10 feitos" (a cena das 08:17)');
await act(async () => { root.unmount(); });

// 3b. Com a recarga: o cartão diz a verdade.
bancoResponde = true;
chamadas = 0;
root = await montar();
await clicar(botaoCom('Abertura'));
check(!texto().includes('2 de 10 feitos'), 'com a recarga, o cartão NÃO diz mais "2 de 10 feitos"');
check(texto().includes('Concluído'), 'e diz "Concluído"');
const antes = chamadas;
await clicar(botaoCom('Pca Bebidas'));
check(chamadas > antes, 'entrar no checklist pede a recarga de novo');
check(texto().includes('Registrada por Nicolas Galha Lemes'),
  'dentro do checklist, as tarefas do Nicolas aparecem como REGISTRADAS (a conclusão dele chegou)');
await act(async () => { root.unmount(); });

console.log(ok ? '\nOK — conclusoes-recarga' : '\nFALHOU — conclusoes-recarga');
process.exit(ok ? 0 : 1);
