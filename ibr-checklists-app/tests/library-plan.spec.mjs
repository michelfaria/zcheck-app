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
 *
 * Também de 24/09/2026, quando Farmácia, Consultório / Clínica e Escritório
 * entraram como setores e Pet Shop ganhou modelos:
 *
 *   5. cada setor novo tem Abertura e Fechamento, todo modelo aponta para um
 *      setor da taxonomia e todo setor tem ícone no onboarding; a casa de
 *      ração escolhe "Loja e ração" e não recebe checklist de banho e tosa;
 *   6. nenhum modelo cita norma (Anvisa, RDC, NR, SNGPC…): adotar um modelo
 *      não pode parecer que deixa a operação em dia com a fiscalização. Item
 *      de norma, cada cliente acrescenta o seu.
 */

import { readFileSync } from 'node:fs';
import { LIBRARY_TEMPLATES, LIBRARY_VERTICALS, segmentosDoSetor, planoDaBiblioteca } from '../lib/library.js';

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

console.log('\n═══ 5. setores de 24/09/2026 ═══');
const ids = new Set(LIBRARY_VERTICALS.map(v => v.id));
check(LIBRARY_TEMPLATES.every(t => ids.has(t.vertical)), 'todo modelo aponta para um setor de LIBRARY_VERTICALS');
for (const v of ['farmacia', 'petshop', 'consultorio', 'escritorio']) {
  const ms = LIBRARY_TEMPLATES.filter(t => t.vertical === v);
  const momentos = new Set(ms.map(t => t.momento));
  check(ids.has(v) && momentos.has('Abertura') && momentos.has('Fechamento'), `${v}: ${ms.length} modelos, com Abertura e Fechamento`);
}
check(['farmacia', 'consultorio', 'escritorio'].every(v => segmentosDoSetor(v).length === 0),
  'Farmácia, Consultório e Escritório não perguntam a operação');
const petSegs = segmentosDoSetor('petshop');
check(petSegs.length === 2 && petSegs.includes('Loja e ração') && petSegs.includes('Banho e tosa'),
  `Pet Shop pergunta a operação (${petSegs.join(', ')})`);
const racao = planoDaBiblioteca('petshop', [loja('r', ['Loja', 'Estoque', 'Caixa'])], ['Loja e ração']);
check(racao.length > 0 && racao.every(p => p.model.segmento === 'Loja e ração' && p.model.area !== 'Banho e Tosa'),
  `casa de ração: ${racao.length} checklists, nenhum de banho e tosa`);
check(racao.some(p => p.model.area === 'Estoque' && p.sector === 'Estoque'), 'o recebimento cai no setor Estoque da loja');
const petTudo = planoDaBiblioteca('petshop', [loja('p', ['Loja', 'Banho e Tosa'])], petSegs);
check(petTudo.length === LIBRARY_TEMPLATES.filter(t => t.vertical === 'petshop').length, `pet shop com banho e tosa recebe os dois (${petTudo.length})`);
check(petTudo.filter(p => p.model.segmento === 'Banho e tosa').every(p => p.sector === 'Banho e Tosa'), 'banho e tosa cai no setor Banho e Tosa');
check(new Set(petTudo.map(p => p.name)).size === petTudo.length, 'nenhum nome repetido na loja');
const sala = planoDaBiblioteca('consultorio', [loja('c', ['Recepção', 'Consultório 1'])], null);
check(sala.filter(p => p.model.area === 'Consultório').every(p => p.sector === 'Consultório 1'), 'a sala cai em "Consultório 1" (nome parecido)');
// VERTICAL_ICON mora na tela (app/app/page.js); sem entrada, o setor aparece
// no onboarding com o ícone genérico de prancheta.
const src = readFileSync(new URL('../app/app/page.js', import.meta.url), 'utf8');
const icones = src.match(/const VERTICAL_ICON = \{([\s\S]*?)\};/)?.[1] || '';
const semIcone = [...ids].filter(id => !new RegExp(`['"]?${id}['"]?\\s*:`).test(icones));
check(semIcone.length === 0, semIcone.length ? `setor sem ícone no onboarding: ${semIcone.join(', ')}` : 'todo setor tem ícone no onboarding (VERTICAL_ICON)');

console.log('\n═══ 6. modelo não promete norma ═══');
const NORMA = /\b(anvisa|rdc|nr-?\s?\d+|portaria|sngpc|pgrss|avcb|crf|crmv|biosseguran[çc]a|vigil[âa]ncia sanit[áa]ria|lgpd)\b/i;
const citam = LIBRARY_TEMPLATES.flatMap(t => [t.descricao, ...t.items.map(i => i.text)]
  .filter(s => NORMA.test(s)).map(s => `${t.id}: "${s}"`));
check(citam.length === 0, citam.length ? `cita norma — ${citam.join(' · ')}` : 'nenhum modelo cita norma (Anvisa, RDC, NR, SNGPC…)');
check(NORMA.test('Conforme RDC 44/2009') && NORMA.test('Extintores da NR-23') && !NORMA.test('Conferir o mapa do buffet'),
  'o filtro pega sigla de norma e não pega palavra comum');

console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
