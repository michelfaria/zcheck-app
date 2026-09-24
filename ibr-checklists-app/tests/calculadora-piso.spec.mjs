/**
 * Calculadora de preço da landing — o total de usuários acompanha o piso.
 *
 *   cd ibr-checklists-app && node tests/calculadora-piso.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * 24/09/2026: com usuários somados no "+" (ou digitados), trocar o número de
 * lojas não mexia no total. Subindo lojas, o campo ficava ABAIXO da franquia
 * (6 lojas e 14 usuários, com "60 usuários inclusos" logo embaixo); descendo,
 * a diferença virava vaga adicional sem o visitante pedir. A regra agora:
 *
 *   1. o total nunca fica abaixo do piso (10 × lojas, lib/plans.js);
 *   2. trocar lojas mantém as vagas adicionais que o visitante somou, em cima
 *      do piso novo (2 lojas e 24 → 3 lojas e 34 → 2 lojas e 24);
 *   3. sem vaga adicional, o campo segue a franquia;
 *   4. digitar abaixo do piso volta ao piso ao sair do campo, e o "−" para no piso.
 *
 * Monta o componente de verdade em jsdom (harness de tests/auto-concluir.spec.mjs)
 * e confere o preço pela conta de lib/plans.js, não por número escrito à mão.
 */

import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement as h, act } from 'react';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── DOM ─────────────────────────────────────────────────────────────────────
// ANTES de importar react-dom: ele decide no carregamento se há DOM e se o
// navegador tem evento `input`. Criado depois, o React não ouvia a digitação
// no campo de usuários (só os cliques).
const dom = new JSDOM('<!doctype html><html><body><div id="r"></div></body></html>', { url: 'https://zcheckapp.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
const doc = dom.window.document;

// ── Bundle ──────────────────────────────────────────────────────────────────
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-calculadora-piso');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { default as PriceCalculator } from '${process.cwd()}/components/PriceCalculator.js';
  export { priceForUnits, includedSeatsFor, formatBRL, INCLUDED_USERS_PER_UNIT } from '${process.cwd()}/lib/plans.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { PriceCalculator, priceForUnits, includedSeatsFor, formatBRL, INCLUDED_USERS_PER_UNIT } = await import(out);
const { createRoot } = await import('react-dom/client');

const botao = (label) => doc.querySelector(`button[aria-label="${label}"]`);
const clicar = async (label, vezes = 1) => {
  for (let i = 0; i < vezes; i++) {
    await act(async () => { botao(label).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  }
};
const campo = () => doc.querySelector('input[aria-label="Número de usuários"]');
const lojas = () => Number([...doc.querySelectorAll('span')].find(s => /^\d+$/.test(s.textContent.trim()))?.textContent);
const usuarios = () => Number(campo().value);
const texto = () => doc.body.textContent.replace(/\u00A0/g, ' ');
const digitar = async (valor) => {
  const el = campo();
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(el, valor);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
};
const sair = async () => { await act(async () => { campo().dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })); }); };
// O valor anual por mês que a calculadora deveria mostrar, pela conta de lib/plans.js.
const anual = (u, extras) => formatBRL(priceForUnits(u, 'annual', extras).monthlyCharge);

const root = createRoot(doc.getElementById('r'));
await act(async () => { root.render(h(PriceCalculator)); });

const F = INCLUDED_USERS_PER_UNIT;
console.log('═══ 3. sem vaga adicional, segue a franquia ═══');
check(lojas() === 1 && usuarios() === F, `começa em 1 loja e ${F} usuários (${lojas()} / ${usuarios()})`);
await clicar('Mais uma loja');
check(lojas() === 2 && usuarios() === includedSeatsFor(2), `2 lojas → ${includedSeatsFor(2)} usuários (${usuarios()})`);

console.log('\n═══ 2. vagas somadas acompanham o piso ═══');
await clicar('Mais um usuário', 4);
check(usuarios() === includedSeatsFor(2) + 4, `+4 usuários → ${includedSeatsFor(2) + 4}`);
check(texto().includes('4 vagas adicionais'), 'mostra "4 vagas adicionais"');
await clicar('Mais uma loja');
check(usuarios() === includedSeatsFor(3) + 4, `3 lojas → ${includedSeatsFor(3) + 4} usuários, as 4 vagas mantidas (${usuarios()})`);
check(texto().includes(`Anual: ${anual(3, 4)}/mês`), `preço anual = 3 lojas + 4 vagas (${anual(3, 4)})`);
await clicar('Menos uma loja');
check(usuarios() === includedSeatsFor(2) + 4, `volta a 2 lojas → ${includedSeatsFor(2) + 4} (${usuarios()})`);
check(texto().includes('4 vagas adicionais'), 'descer loja não cria vaga adicional nova');
await clicar('Mais uma loja', 4);
check(lojas() === 6 && usuarios() === includedSeatsFor(6) + 4, `6 lojas → ${includedSeatsFor(6) + 4} (o caso do print de 24/09) (${usuarios()})`);

console.log('\n═══ 1 e 4. nunca abaixo do piso ═══');
await clicar('Menos um usuário', 10);
check(usuarios() === includedSeatsFor(6), `o "−" para no piso (${usuarios()})`);
check(botao('Menos um usuário').disabled, 'no piso, o "−" fica desabilitado');
check(!texto().includes('vaga adicional'), 'sem vaga adicional no piso');
await digitar('5');
await sair();
check(usuarios() === includedSeatsFor(6), `digitar 5 com 6 lojas volta a ${includedSeatsFor(6)} ao sair do campo (${usuarios()})`);
await clicar('Mais uma loja');
check(usuarios() === includedSeatsFor(7), `no piso, subir loja segue a franquia: ${includedSeatsFor(7)} (${usuarios()})`);
await digitar('75');
await sair();
check(usuarios() === 75 && texto().includes('5 vagas adicionais'), `digitar 75 com 7 lojas = 5 vagas adicionais (${usuarios()})`);
await clicar('Menos uma loja');
check(usuarios() === includedSeatsFor(6) + 5, `descer para 6 lojas mantém as 5 vagas: ${includedSeatsFor(6) + 5} (${usuarios()})`);

await act(async () => { root.unmount(); });
await rm(dir, { recursive: true, force: true });
console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
