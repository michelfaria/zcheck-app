/**
 * Teste da FILA de telemetria — as duas corridas que apagavam evento.
 *
 *   cd ibr-checklists-app && node tests/track.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * `lib/track.js` perdia evento em silêncio, e ninguém percebeu por meses. O que
 * denunciou não foi um erro: foi uma consulta em produção mostrando
 * `jit_opened = 0` enquanto `ai_insight_viewed = 109` — os dois disparados em
 * linhas VIZINHAS do mesmo `useEffect`. Perda silenciosa de telemetria é o pior
 * tipo de defeito: o número que você olha para decidir está errado, e ele não
 * avisa.
 *
 * Eram duas corridas:
 *
 *   1. `track()` fazia `queueGet` → `push` → `queueSet` sem trava. Duas chamadas
 *      sem `await` entre elas leem a MESMA fila e a segunda grava por cima.
 *   2. `flushEvents()` era pior: lia a fila, enviava pela rede e só então
 *      gravava o `remaining` calculado ANTES do envio. Todo evento registrado
 *      durante o `insert` era apagado — e o envio é a janela mais longa do
 *      fluxo, justamente quando o app está mais ativo.
 *
 * As duas foram corrigidas por leitura, sem portão. Este arquivo é o portão.
 *
 * O módulo exige `window`, `navigator` e `sessionStorage` (jsdom), e fala com
 * IndexedDB e Supabase — os dois substituídos por dublês que registram o que
 * receberam e atrasam de propósito, para ALARGAR a janela da corrida. Corrida
 * que só falha às vezes não serve como teste.
 */

import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };
const espera = ms => new Promise(r => setTimeout(r, ms));

// ── DOM ─────────────────────────────────────────────────────────────────────
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://loja.test/app' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.sessionStorage = dom.window.sessionStorage;
// `navigator` é global nativo no Node 24 e não aceita atribuição direta.
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });

// ── Dublês ──────────────────────────────────────────────────────────────────
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-track');
await mkdir(dir, { recursive: true });

// A fila mora aqui. `atrasoStorage` alarga a janela entre ler e gravar: é
// exatamente nela que a corrida do `track()` acontece.
await writeFile(join(dir, 'storage.js'), `
  export const _db = new Map();
  export const _cfg = { atraso: 0 };
  const espera = ms => new Promise(r => setTimeout(r, ms));
  export async function storageGet(k) {
    await espera(_cfg.atraso);
    return { value: _db.get(k) ?? null };
  }
  export async function storageSet(k, v) {
    await espera(_cfg.atraso);
    _db.set(k, v);
  }
`);
// `insert` demora de propósito: é durante ele que o flush antigo perdia o que
// chegasse na fila.
await writeFile(join(dir, 'supabase.js'), `
  export const _enviados = [];
  export const _cfg = { atrasoInsert: 0, falhar: false };
  const espera = ms => new Promise(r => setTimeout(r, ms));
  export const supabase = {
    from: () => ({
      insert: async (batch) => {
        await espera(_cfg.atrasoInsert);
        if (_cfg.falhar) return { error: { message: 'rede caiu' } };
        _enviados.push(...batch);
        return { error: null };
      },
    }),
  };
`);

// O entry precisa ser escrito ANTES do build, e reexporta os dublês para o
// teste poder inspecionar a fila e o que foi "enviado".
await writeFile(join(dir, 'entry.js'), `
  export { track, flushEvents } from ${JSON.stringify(process.cwd() + '/lib/track.js')};
  export { _db, _cfg as _cfgStorage } from './storage.js';
  export { _enviados, _cfg as _cfgSupa } from './supabase.js';
`);

const out = join(dir, 'bundle.mjs');
await build({
  entryPoints: [join(dir, 'entry.js')], outfile: out, bundle: true, format: 'esm',
  platform: 'node', logLevel: 'silent',
  // `alias` do esbuild não aceita nome relativo; o desvio dos dublês é por
  // plugin. Casa só `./storage` e `./supabase` exatos — o entry importa os
  // dublês com `.js` no fim e passa direto.
  plugins: [{
    name: 'dubles',
    setup(b) {
      b.onResolve({ filter: /^\.\/(storage|supabase)$/ }, args => ({
        path: join(dir, `${args.path.slice(2)}.js`),
      }));
    },
  }],
});

const { track, flushEvents, _db, _cfgStorage, _enviados, _cfgSupa } = await import(out);

const fila = () => JSON.parse(_db.get('zc_event_queue') || '[]');
const limpar = () => { _db.clear(); _enviados.length = 0; };

// ── 1. A corrida do enfileiramento ──────────────────────────────────────────
console.log('═══ track() concorrente não perde evento ═══');
limpar();
_cfgStorage.atraso = 2; // janela larga entre ler e gravar
const N = 25;
// SEM await entre as chamadas — é assim que o app usa: duas linhas seguidas do
// mesmo useEffect, nenhuma esperando a outra.
await Promise.all(Array.from({ length: N }, (_, i) => track(`evento_${i}`, { source: 'teste' })));
check(fila().length === N, `${N} chamadas simultâneas ⇒ ${fila().length} eventos na fila (esperado ${N})`);
const tipos = new Set(fila().map(e => e.event_type));
check(tipos.size === N, 'nenhum evento sobrescreveu outro');

// ── 2. A corrida do envio ───────────────────────────────────────────────────
console.log('\n═══ evento registrado DURANTE o envio sobrevive ═══');
limpar();
_cfgStorage.atraso = 0;
await track('antigo_1', {});
await track('antigo_2', {});
_cfgSupa.atrasoInsert = 60;
const enviando = flushEvents();          // reivindica os 2 e trava no insert
await espera(10);                        // ...e no meio dele chega gente nova
await Promise.all([track('novo_1', {}), track('novo_2', {})]);
await enviando;
_cfgSupa.atrasoInsert = 0;

check(_enviados.length === 2, 'os 2 antigos foram enviados');
const restantes = fila().map(e => e.event_type);
check(restantes.includes('novo_1') && restantes.includes('novo_2'),
  `os 2 novos continuam na fila (fila: [${restantes.join(', ')}])`);

// ── 3. Envio que falha devolve o lote ───────────────────────────────────────
console.log('\n═══ envio que falha não descarta o lote ═══');
limpar();
await track('a', {});
await track('b', {});
_cfgSupa.falhar = true;
await flushEvents();
_cfgSupa.falhar = false;
const apos = fila().map(e => e.event_type);
check(apos.includes('a') && apos.includes('b'), `lote devolvido à fila (fila: [${apos.join(', ')}])`);
check(_enviados.length === 0, 'nada foi contabilizado como enviado');

console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
