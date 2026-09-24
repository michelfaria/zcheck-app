/**
 * O que o onboarding cria a partir da biblioteca (lib/library.js).
 *
 *   cd ibr-checklists-app && node tests/library-plan.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * Até 24/09/2026 escolher "Food Service" no onboarding criava os modelos de
 * TODOS os sub-segmentos (Restaurante, Café, Padaria) em cada loja — 16
 * checklists por loja, e dois deles com o mesmo nome ("Bar — Abertura" de
 * Restaurante e de Café caíam no mesmo setor). A entrada dos modelos de
 * Hamburgueria teria levado a conta a 20. Agora o onboarding pergunta qual é
 * a operação, e este teste prova:
 *
 *   1. escolher só Hamburgueria cria só os modelos de hamburgueria;
 *   2. setor sem sub-segmento (Hotel) ignora o filtro e cria tudo;
 *   3. dois sub-segmentos com o mesmo "Área — Momento" no mesmo setor ganham
 *      o sub-segmento no nome, em vez de dois checklists de nome idêntico;
 *   4. a biblioteca tem ids únicos e todo modelo tem item com texto.
 */

import { LIBRARY_TEMPLATES, segmentosDoSetor, planoDaBiblioteca } from '../lib/library.js';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

const loja = (id, sectors) => ({ id, name: id, sectors });

console.log('═══ sub-segmentos ═══');
const segs = segmentosDoSetor('food-service');
check(segs.includes('Hamburgueria'), `Food Service oferece Hamburgueria (${segs.join(', ')})`);
check(segmentosDoSetor('hotel').length === 0, 'Hotel não tem sub-segmento');

console.log('\n═══ 1. só Hamburgueria ═══');
const hamb = LIBRARY_TEMPLATES.filter(t => t.segmento === 'Hamburgueria');
check(hamb.length >= 3, `há modelos de hamburgueria (${hamb.length})`);
const duas = [loja('a', ['Cozinha', 'Expedição', 'Salão']), loja('b', ['Cozinha'])];
const planoH = planoDaBiblioteca('food-service', duas, ['Hamburgueria']);
check(planoH.length === hamb.length * 2, `um de cada por loja: ${planoH.length} = ${hamb.length} × 2`);
check(planoH.every(p => p.model.segmento === 'Hamburgueria'), 'nenhum modelo de restaurante, café ou padaria entrou');
check(planoH.some(p => p.unit.id === 'a' && p.sector === 'Expedição'), 'a expedição cai no setor Expedição quando a loja tem');
check(planoH.filter(p => p.unit.id === 'b').every(p => p.sector === 'Cozinha'), 'sem setor equivalente, cai no primeiro setor da loja');

console.log('\n═══ 2. sem filtro ═══');
const foodTodos = LIBRARY_TEMPLATES.filter(t => t.vertical === 'food-service').length;
check(planoDaBiblioteca('food-service', [loja('a', ['Cozinha'])], null).length === foodTodos, 'filtro nulo cria o setor inteiro (comportamento antigo)');
check(planoDaBiblioteca('food-service', [loja('a', ['Cozinha'])], []).length === foodTodos, 'filtro vazio também');
const hotel = LIBRARY_TEMPLATES.filter(t => t.vertical === 'hotel').length;
check(planoDaBiblioteca('hotel', [loja('h', ['Recepção'])], ['Hamburgueria']).length === hotel,
  'setor sem sub-segmento ignora o filtro (Hotel cria todos os seus)');

console.log('\n═══ 3. nomes sem duplicata ═══');
const bar = planoDaBiblioteca('food-service', [loja('a', ['Bar'])], ['Restaurante', 'Café'])
  .filter(p => p.model.area === 'Bar' && p.model.momento === 'Abertura');
check(bar.length === 2, 'Restaurante e Café têm "Bar — Abertura" no mesmo setor');
check(new Set(bar.map(p => p.name)).size === 2, `nomes distintos: ${bar.map(p => `"${p.name}"`).join(' e ')}`);
const soH = planoDaBiblioteca('food-service', [loja('a', ['Cozinha'])], ['Hamburgueria']);
check(soH.every(p => !p.name.includes('(')), 'sem colisão, o nome fica limpo ("Cozinha — Abertura")');
const porLoja = planoDaBiblioteca('food-service', [loja('a', ['Bar']), loja('b', ['Bar'])], ['Restaurante', 'Café']);
const nomesA = porLoja.filter(p => p.unit.id === 'a').map(p => p.name);
check(nomesA.length === new Set(nomesA).size, 'nenhuma loja fica com dois checklists de mesmo nome');

console.log('\n═══ 4. biblioteca ═══');
check(new Set(LIBRARY_TEMPLATES.map(t => t.id)).size === LIBRARY_TEMPLATES.length, 'ids únicos');
check(LIBRARY_TEMPLATES.every(t => t.items.length > 0 && t.items.every(i => i.text?.trim())), 'todo modelo tem itens com texto');
check(LIBRARY_TEMPLATES.every(t => ['Abertura', 'Intermediário', 'Fechamento'].includes(t.momento)),
  'todo momento é Abertura, Intermediário ou Fechamento (o tipo do checklist sai do nome)');

console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
