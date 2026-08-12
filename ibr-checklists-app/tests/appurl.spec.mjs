/**
 * Teste de `lib/appUrlState.js` — a aba na URL sobrevive ao login?
 *
 *   cd ibr-checklists-app && node tests/appurl.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * O hook mantém aba e loja em sincronia com a URL nos DOIS sentidos, e os dois
 * efeitos disparam no mesmo commit quando `ready` vira `true` — o instante em
 * que o login termina. O de cima lê a URL e chama `setTab('painel')`, mas
 * `setTab` só vale no próximo render: o de baixo, logo em seguida, ainda enxerga
 * o `tab` ANTIGO e o grava por cima.
 *
 * Resultado: abrir `/app?aba=painel` e fazer login levava para Executar, com a
 * URL reescrita para `aba=executar`. Link de aba é exatamente o que se manda
 * para outra pessoa — foi assim que o defeito apareceu, mandando um preview.
 *
 * Efeito não roda em `renderToStaticMarkup`, e a corrida É entre efeitos. Por
 * isso aqui tem jsdom e `createRoot`: é preciso montar de verdade, deixar os
 * efeitos rodarem e só então olhar a URL.
 */

import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement as h, useState, act } from 'react';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Teto de renders — o cão de guarda que funciona aqui.
 *
 * Quebrar os dois sentidos da sincronia não produz "aba errada": produz um
 * PING-PONG entre eles — um escreve na URL, o outro lê e reescreve o estado, e
 * de novo. Medido: sem o guarda de primeira sincronização este arquivo não
 * termina.
 *
 * `setTimeout` NÃO resolve. O laço é de renders dentro do `act()`, e o `act()`
 * drena as atualizações de forma síncrona: o timer nunca chega a ser executado.
 * Foi preciso descobrir isso à força — a primeira tentativa de guarda foi um
 * timer, e ele pendurou por cinco minutos sem imprimir nada.
 *
 * Quem conta é o próprio componente. Estourar o teto lança DENTRO do render, e
 * o erro escapa do `act()` como falha nomeada. Num teste que roda dentro do
 * `npm run verify`, pendurar é pior que falhar: trava o portão sem dizer por quê.
 */
const TETO_RENDERS = 200;

const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-appurl');
await mkdir(dir, { recursive: true });
await writeFile(join(dir, 'entry.js'),
  `export { useAppUrlState, resolveTab } from ${JSON.stringify(process.cwd() + '/lib/appUrlState.js')};`);
const out = join(dir, 'bundle.mjs');
await build({
  entryPoints: [join(dir, 'entry.js')], outfile: out, bundle: true, format: 'esm',
  platform: 'node', logLevel: 'silent', external: ['react'],
});
const { useAppUrlState, resolveTab } = await import(out);
const { createRoot } = await import('react-dom/client');

const ABAS = ['executar', 'painel', 'unidades', 'id', 'equipe'];

/**
 * Monta o hook com a URL dada, começando DESLOGADO e virando `ready` depois —
 * que é a sequência real do app e a única em que a corrida aparece.
 */
async function cenario(urlInicial) {
  const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>', { url: urlInicial });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

  const visto = { tab: null };
  let renders = 0;
  function Harness({ ready }) {
    if (++renders > TETO_RENDERS) {
      throw new Error(`laço de sincronia: passou de ${TETO_RENDERS} renders em ${urlInicial}`);
    }
    const [tab, setTab] = useState('executar');   // default do app antes da URL
    const [unitId, setUnitId] = useState(null);
    useAppUrlState({
      ready, tab, setTab, allowedTabs: ABAS,
      unitId, setUnitId, canSwitchUnit: true, unitIds: ['ibr1', 'ibr2'],
    });
    visto.tab = tab;
    return null;
  }

  const root = createRoot(dom.window.document.getElementById('r'));
  await act(async () => { root.render(h(Harness, { ready: false })); });  // deslogado
  await act(async () => { root.render(h(Harness, { ready: true })); });   // login concluiu
  return { visto, url: () => dom.window.location.search };
}

/** Roda um cenário; laço de render vira falha com nome em vez de travar. */
async function cenarioSeguro(url) {
  try { return await cenario(url); }
  catch (e) {
    check(false, `${url} — ${e.message}`);
    return { visto: { tab: '<laço>' }, url: () => '<laço>' };
  }
}

// ── 1. A regressão ──────────────────────────────────────────────────────────
console.log('═══ deep link de aba sobrevive ao login ═══');
const painel = await cenarioSeguro('https://loja.test/app?aba=painel');
check(painel.visto.tab === 'painel', `a aba aplicada é 'painel' (foi '${painel.visto.tab}')`);
check(painel.url().includes('aba=painel'), `a URL continua em painel (é '${painel.url()}')`);

const comLoja = await cenarioSeguro('https://loja.test/app?aba=equipe&loja=ibr2');
check(comLoja.visto.tab === 'equipe', `aba e loja juntas: aba '${comLoja.visto.tab}'`);
check(comLoja.url().includes('loja=ibr2'), `a loja do link é preservada (é '${comLoja.url()}')`);

// ── 2. Os aliases das abas aposentadas ──────────────────────────────────────
console.log('\n═══ aliases: links antigos não caem em Executar ═══');
check(resolveTab('jit') === 'painel', "?aba=jit resolve para painel");
check(resolveTab('relatorios') === 'painel', "?aba=relatorios resolve para painel");
check(resolveTab('equipe') === 'equipe', 'aba viva passa intacta');
check(resolveTab(null) === null, 'sem aba na URL, nada a resolver');

const jit = await cenarioSeguro('https://loja.test/app?aba=jit');
check(jit.visto.tab === 'painel', `um link salvo de ?aba=jit abre o Painel (foi '${jit.visto.tab}')`);
check(jit.url().includes('aba=painel') && !jit.url().includes('aba=jit'),
  `e a URL é reescrita para o destino real (é '${jit.url()}')`);

// ── 3. Sem aba na URL, o link continua compartilhável ───────────────────────
console.log('\n═══ URL nua ganha o estado, para poder ser compartilhada ═══');
const nua = await cenarioSeguro('https://loja.test/app');
check(nua.visto.tab === 'executar', 'sem aba na URL, fica no default');
check(nua.url().includes('aba=executar'), `e a URL passa a declará-lo (é '${nua.url()}')`);

// ── 4. Aba que o papel não tem é ignorada ───────────────────────────────────
console.log('\n═══ aba fora do papel não é aplicada ═══');
const proibida = await cenarioSeguro('https://loja.test/app?aba=usuarios');
check(proibida.visto.tab === 'executar',
  `?aba=usuarios não vira estado para quem não tem a aba (foi '${proibida.visto.tab}')`);

console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
