/**
 * Overlays de tela inteira travam a página atrás — e não descem com a margem.
 *
 *   cd ibr-checklists-app && node tests/overlays-trava.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * Vídeo de 21/09/2026 (IBR2, iPhone): arrastar o dedo sobre uma folha `fixed`
 * rolava a página por trás. Em 26/09/2026 a conferência ganhou a trava
 * (`lib/useTravaRolagem.js`, provada em `conferencia-tela-cheia.spec.mjs`), e
 * no mesmo dia ela foi estendida aos outros overlays de tela inteira do app:
 * folhas `zc-sheet`, diálogos de confirmação, J.I.T., Plano e vagas, briefing,
 * onboarding, assinatura. Toast, coachmark (GestorTour) e barra de ação fixa
 * NÃO travam — não cobrem a página.
 *
 * Duas armadilhas, as duas medidas no mesmo dia:
 *
 *   - overlay `fixed` filho de um `.space-y-*` do Tailwind recebe o
 *     `margin-top` dos irmãos e DESCE (a conferência descia 16px). Três
 *     overlays de page.js estavam nisso: a foto ampliada da tarefa
 *     (`.space-y-2` da execução), o "Remover usuário?" (`.space-y-3` da aba
 *     Usuários) e as folhas de vaga (`.space-y-3`/`.space-y-4`);
 *   - a trava punha `overflow: hidden` no body. Com `overflow-x: clip` no
 *     <html> (globals.css), o overflow do body não passa para a janela: o body
 *     vira contêiner de rolagem e o header sticky salta para `-scrollY` — nas
 *     folhas de véu translúcido o cabeçalho sumia ao abrir. Saiu da trava.
 *
 * O toque do iPhone não se reproduz em jsdom; o que se prova é o mecanismo,
 * montando telas REAIS de page.js:
 *
 *   1. execução: a foto de referência ampliada (irmã das tarefas no
 *      `.space-y-2`) tem `margin: 0`, trava a página no ponto em que ela
 *      estava e, fechada, devolve a posição;
 *   2. execução: o "Itens críticos pendentes" trava e destrava;
 *   3. aba Usuários: o "Remover …?" (filho do `.space-y-3`) — margem zerada,
 *      trava, e "Cancelar" devolve a página;
 *   4. inventário: todo `fixed inset-0` / `position: 'fixed', inset: 0` em
 *      app/ e components/ está num componente que chama `useTravaRolagem` (ao
 *      menos uma vez por overlay) e leva `margin: 0` na própria tag. Overlay
 *      novo sem trava derruba este teste.
 */

import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { writeFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement as h, useState, act } from 'react';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.on('unhandledRejection', () => {});

// A aba Usuários abre um canal de presença no realtime: nada sai da máquina.
class WebSocketDeMentira {
  constructor() { this.readyState = 0; }
  send() {}
  close() { this.readyState = 3; }
  addEventListener() {}
  removeEventListener() {}
}
Object.defineProperty(globalThis, 'WebSocket', { value: WebSocketDeMentira, configurable: true, writable: true });

// Sem rede: toda leitura volta vazia (rodada ao vivo, fila de pedidos, cota).
globalThis.fetch = async () => ({
  ok: true, status: 200, statusText: 'OK',
  headers: { get: () => null, has: () => false, forEach: () => {} },
  json: async () => [], text: async () => '[]',
});

const RUIDO = /indexedDB is not defined/;
const comoTexto = (a) => a.map(x => (x instanceof Error ? `${x.name}: ${x.message}` : String(x))).join(' ');
for (const canal of ['warn', 'error']) {
  const real = console[canal];
  console[canal] = (...a) => { if (!RUIDO.test(comoTexto(a))) real(...a); };
}

// ── Bundle ──────────────────────────────────────────────────────────────────
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-overlays-trava');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { ExecutionScreen, UsersView } from '${process.cwd()}/app/app/page.js';
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
globalThis.CustomEvent = dom.window.CustomEvent;
const doc = dom.window.document;

// jsdom não rola: a página "está" em 640px e o scrollTo só é anotado.
const Y = 640;
const rolagens = [];
Object.defineProperty(dom.window, 'scrollY', { value: Y, configurable: true });
dom.window.scrollTo = (a, b) => { rolagens.push(typeof a === 'object' ? a.top : b); };

// Só depois do DOM: o react-dom decide no load o que o navegador tem.
const { ExecutionScreen, UsersView, UnitsContext } = await import(out);
const { createRoot } = await import('react-dom/client');

const esperar = async (ms = 40) => { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); };
const clicar = async (el) => {
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await esperar();
};
const botao = (t) => [...doc.querySelectorAll('button')].find(b => b.textContent.trim() === t);
const body = () => doc.body.style;
const travada = () => body().position === 'fixed' && body().top === `-${Y}px`;
const livre = () => body().position === '' && body().top === '' && body().overflow === '';

let root = null;
const montar = async (arvore) => {
  if (root) await act(async () => { root.unmount(); });
  root = createRoot(doc.getElementById('r'));
  await act(async () => { root.render(arvore); });
  await esperar();
};

// ── Fixtures ────────────────────────────────────────────────────────────────
const TZ = 'America/Sao_Paulo';
const unit = { id: 'u1', name: 'IBR2', color: '#8a2be2', sectors: ['Caixa'], timezone: TZ };
const ana = { id: 'u9', name: 'Ana' };
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const template = {
  id: 'rotina-caixa', unitId: 'u1', sector: 'Caixa', name: 'Rotina Caixa', deadline: '18:00', shift: 'Manhã e Tarde',
  items: [
    { id: 'a', text: 'Conferir o fundo de caixa', critical: true, description: 'Contar cédulas e moedas.', refPhotos: [PIXEL] },
    { id: 'b', text: 'Enviar pedido de mercado' },
    { id: 'c', text: 'Limpar o balcão' },
  ],
};
const execucao = () => h(ExecutionScreen, {
  template, unit, currentUser: ana, completions: [], closures: [],
  onCancel: () => {}, onDone: () => {}, onComplete: () => {},
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 1. Execução: a foto de referência ampliada ═══');
await montar(execucao());
check(livre(), 'com a execução aberta e nada por cima, a página rola');
await clicar(botao('Ver mais'));
const miniatura = doc.querySelector('img[alt="ref 1"]');
check(!!miniatura, 'a referência da tarefa crítica está na tela');
await clicar(miniatura);
const foto = doc.querySelector('img[alt="Referência"]')?.parentElement;
check(!!foto, 'a foto abre ampliada');
check(foto?.parentElement?.classList.contains('space-y-2'), 'ela é irmã das tarefas no `.space-y-2` — onde a margem a desceria');
check(foto?.style.margin === '0px', 'margin: 0 — cobre a tela a partir do topo');
check(travada(), `a página fica travada no ponto em que estava (top: -${Y}px)`);
check(body().overflow === '', 'sem overflow no body (o header sticky fica no lugar)');
let antes = rolagens.length;
await clicar(botao('×'));
check(!doc.querySelector('img[alt="Referência"]'), '× fecha a foto');
check(livre(), 'a página volta a rolar');
check(rolagens.length === antes + 1 && rolagens.at(-1) === Y, `e volta a ${Y}px`);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 2. Execução: "Itens críticos pendentes" ═══');
const linhaDe = (t) => {
  const p = [...doc.querySelectorAll('p')].find(e => e.textContent.trim() === t);
  let n = p?.parentElement;
  while (n && !n.querySelector('button')) n = n.parentElement;
  return n;
};
await clicar(linhaDe('Enviar pedido de mercado').querySelector('button'));
await clicar(linhaDe('Limpar o balcão').querySelector('button'));
await clicar(botao('Concluir checklist'));
const confirma = [...doc.querySelectorAll('h3')].find(e => e.textContent.includes('Itens críticos pendentes'))?.closest('.fixed');
check(!!confirma, 'concluir com a crítica pendente pede confirmação');
check(confirma?.style.margin === '0px', 'margin: 0');
check(travada(), 'a página fica travada');
antes = rolagens.length;
await clicar(botao('Voltar'));
check(![...doc.querySelectorAll('h3')].some(e => e.textContent.includes('Itens críticos pendentes')), '"Voltar" fecha a confirmação');
check(livre() && rolagens.length === antes + 1 && rolagens.at(-1) === Y, `a página destrava e volta a ${Y}px`);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 3. Aba Usuários: "Remover …?" ═══');
const gestor = { id: 'g1', name: 'Diana Diretoria', role: 'gestao', unitId: null };
const caio = { id: 'c1', name: 'Caio Colaborador', role: 'colaborador', unitId: 'u1', sectorId: null, pin: '1234' };
function Casca() {
  const [users, setUsers] = useState([gestor, caio]);
  return h(UnitsContext.Provider, { value: [unit] },
    h(UsersView, { users, currentUser: gestor, unitId: null, onSaveUsers: async (next) => { setUsers(next); } }));
}
await montar(h(Casca));
check(livre(), 'a lista de usuários não trava nada');
const lixeira = [...doc.querySelectorAll('button')].filter(b => !b.disabled && b.querySelector('svg[class*="trash"]'));
check(lixeira.length === 1, 'só o colaborador pode ser removido (a última diretoria não)');
await clicar(lixeira[0]);
const remover = [...doc.querySelectorAll('p')].find(e => e.textContent === 'Remover Caio Colaborador?')?.closest('.fixed');
check(!!remover, 'a confirmação abre');
check(remover?.parentElement?.classList.contains('space-y-3'), 'ela é filha do `.space-y-3` da lista — onde a margem a desceria 12px');
check(remover?.style.margin === '0px', 'margin: 0');
check(travada(), 'a página fica travada');
antes = rolagens.length;
await clicar(botao('Cancelar'));
check(![...doc.querySelectorAll('p')].some(e => e.textContent === 'Remover Caio Colaborador?'), '"Cancelar" fecha');
check(livre() && rolagens.length === antes + 1 && rolagens.at(-1) === Y, `a página destrava e volta a ${Y}px`);
await act(async () => { root.unmount(); });
check(livre(), 'desmontado tudo, nenhuma trava sobra');

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ 4. Inventário: todo overlay de tela inteira trava e zera a margem ═══');
const arquivos = [];
for (const base of ['app', 'components']) {
  for (const f of await readdir(base, { recursive: true })) {
    if (f.endsWith('.js')) arquivos.push(join(base, f));
  }
}
const OVERLAY = /fixed inset-0|position: 'fixed', inset: 0/g;
const COMPONENTE = /^(?:export )?(?:default )?function ([A-Z]\w*)\s*\(/gm;
let total = 0;
for (const arq of arquivos.sort()) {
  const src = await readFile(arq, 'utf8');
  const overlays = [...src.matchAll(OVERLAY)];
  if (!overlays.length) continue;
  const comps = [...src.matchAll(COMPONENTE)].map(m => ({ nome: m[1], ini: m.index }));
  const porComp = new Map();
  for (const m of overlays) {
    total++;
    const i = comps.findLastIndex(c => c.ini < m.index);
    const c = comps[i];
    const chave = c ? c.nome : '(fora de componente)';
    if (!porComp.has(chave)) {
      const corpo = c ? src.slice(c.ini, comps[i + 1]?.ini ?? src.length) : '';
      porComp.set(chave, { travas: (corpo.match(/useTravaRolagem\(/g) || []).length, overlays: 0, semMargem: 0 });
    }
    const g = porComp.get(chave);
    g.overlays++;
    // A tag do overlay: do casamento até o fim do objeto de estilo (`}}` no
    // JSX, `};` no objeto solto da SubscribePanel), sem entrar noutra tag.
    const resto = src.slice(m.index);
    const fim = Math.min(...['}}', '};'].map(t => resto.indexOf(t)).filter(n => n >= 0));
    const tag = resto.slice(0, fim);
    if (tag.includes('<') || !/margin: 0\b/.test(tag)) g.semMargem++;
  }
  for (const [nome, g] of porComp) {
    const travado = g.travas >= g.overlays;
    check(travado && !g.semMargem,
      `${arq} › ${nome}: ${g.overlays} overlay(s), useTravaRolagem ×${g.travas}${g.semMargem ? `, ${g.semMargem} SEM margin: 0` : ', margin: 0'}`);
  }
}
check(total >= 19, `${total} overlays de tela inteira conferidos (eram 19 em 26/09/2026)`);

console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
