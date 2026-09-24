/**
 * A conta do plano: lojas, vagas de usuário e o valor cobrado.
 *
 *   cd ibr-checklists-app && node tests/plans.spec.mjs
 *
 * ── O que esta regra promete (decisão do Michel, 23/09/2026) ─────────────────
 *
 * Cada loja ativa inclui 10 vagas de usuário, SOMADAS na empresa (2 lojas = 20),
 * com piso de 1 loja. Vaga adicional é vaga CONTRATADA: R$ 17,00/mês, igual no
 * anual e no mensal. A redução só alcança as adicionais, nunca a franquia, e
 * nunca abaixo das adicionais em uso.
 *
 * ── Por que um arquivo de teste ──────────────────────────────────────────────
 *
 * `lib/plans.js` é a fonte única dessa conta, e ela é lida por quatro lados que
 * não se enxergam: o checkout (valor enviado ao Mercado Pago), o cron que
 * reajusta a assinatura, a tela "Plano e vagas" e a landing. Um erro aqui não
 * derruba tela nenhuma — sai na fatura do cliente. Por isso cada número da
 * regra é afirmado com o valor em reais, não com a fórmula.
 *
 * O bloco 6 guarda o porquê de `unitsForAmount`/`getTierByPrice` terem saído:
 * com a vaga no total, o mesmo valor sai de planos diferentes (381 = anual com
 * 2 lojas + 11 vagas = mensal com 3 lojas). Adivinhar o plano pelo valor
 * gravaria o plano errado; se alguém trouxer o inverso de volta, o teste cai.
 */

import { build } from 'esbuild';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

// Mesmo caminho dos outros specs: o módulo passa pelo esbuild e o teste prova
// o que o app importa. `export *` para o bloco 6 enxergar o que o módulo
// exporta DE FATO — inclusive o que não deveria mais exportar.
const plansPath = join(process.cwd(), 'lib', 'plans.js');
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-plans');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `export * from '${plansPath}';\n`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', logLevel: 'silent',
});
const plans = await import(out);
const {
  INCLUDED_USERS_PER_UNIT, EXTRA_USER_PRICE, MAX_SELF_SERVICE_EXTRA_SEATS,
  PRICE_PER_UNIT, TRIAL_DAYS, ANNUAL_DISCOUNT_LABEL, MAX_SELF_SERVICE_UNITS,
  formatBRL, includedSeatsFor, seatCapacity, extraSeatsInUse, priceForUnits,
  monthlyValueFor, billingState,
} = plans;

console.log('\n1. Constantes do contrato');
check(INCLUDED_USERS_PER_UNIT === 10, '10 vagas inclusas por loja');
check(EXTRA_USER_PRICE === 17, 'vaga adicional a R$ 17/mês');
check(MAX_SELF_SERVICE_EXTRA_SEATS === 200, 'teto self-service de 200 vagas adicionais');
check(PRICE_PER_UNIT.annual === 97 && PRICE_PER_UNIT.monthly === 127, 'loja: 97 no anual, 127 no mensal (inalterado)');
check(TRIAL_DAYS === 14 && ANNUAL_DISCOUNT_LABEL === '−24%' && MAX_SELF_SERVICE_UNITS === 50,
  'TRIAL_DAYS, ANNUAL_DISCOUNT_LABEL e MAX_SELF_SERVICE_UNITS permanecem');
check(typeof billingState === 'function', 'billingState permanece');

console.log('\n2. Franquia somada por loja, com piso de 1 loja');
check(includedSeatsFor(1) === 10, '1 loja = 10 vagas');
check(includedSeatsFor(2) === 20, '2 lojas = 20 vagas');
check(includedSeatsFor(3) === 30, '3 lojas = 30 vagas');
check(includedSeatsFor(0) === 10, '0 lojas ativas = 10 vagas (a gestão do cadastro sempre cabe)');
check(includedSeatsFor(null) === 10 && includedSeatsFor(undefined) === 10 && includedSeatsFor(-2) === 10,
  'null, undefined e negativo caem no piso de 1 loja');
check(includedSeatsFor('2') === 20, "contagem vinda como texto ('2') conta 2 lojas");
check(includedSeatsFor(2.9) === 20, 'loja não existe pela metade: 2.9 → 2 lojas');
check(includedSeatsFor(60) === 600, 'sem teto de lojas na franquia (acima do self-service continua 10 por loja)');

console.log('\n3. Capacidade: 10 ativos cabem, o 11º precisa de vaga adicional');
check(seatCapacity(1, 0) === 10, '1 loja sem adicionais: capacidade 10');
check(10 <= seatCapacity(1, 0), '10 ativos cabem em 1 loja');
check(!(11 <= seatCapacity(1, 0)), '11 ativos NÃO cabem em 1 loja sem adicional');
check(11 <= seatCapacity(1, 1), 'com 1 vaga adicional, o 11º cabe');
check(extraSeatsInUse(10, 1) === 0, '10 ativos em 1 loja: 0 adicionais em uso');
check(extraSeatsInUse(11, 1) === 1, '11 ativos em 1 loja: 1 adicional em uso');
check(seatCapacity(2, 5) === 25, '2 lojas + 5 adicionais = 25');
check(seatCapacity(0, 3) === 13, '0 lojas + 3 adicionais = 13 (piso da franquia vale)');
check(seatCapacity(1, -4) === 10 && seatCapacity(1, null) === 10, 'adicional negativo/nulo conta 0');
check(seatCapacity(3, '5') === 35, "adicionais como texto ('5') contam");

console.log('\n4. Redução: só das adicionais, nunca abaixo das em uso');
// Cena da tela: 2 lojas, 23 ativos, 5 adicionais contratadas.
const min = extraSeatsInUse(23, 2);
check(min === 3, '23 ativos em 2 lojas: mínimo de 3 adicionais');
check(seatCapacity(2, min) >= 23, 'reduzir até o mínimo mantém todo mundo com vaga');
check(seatCapacity(2, min - 1) < 23, 'um abaixo do mínimo deixaria alguém sem vaga');
check(extraSeatsInUse(15, 2) === 0 && seatCapacity(2, 0) === 20,
  '15 ativos em 2 lojas: reduz até 0 adicionais e a capacidade PARA em 20 (a franquia não é reduzível)');
check(extraSeatsInUse(12, 0) === 2, '0 lojas e 12 ativos: 2 adicionais em uso (piso de 10)');
check(extraSeatsInUse(0, 3) === 0 && extraSeatsInUse(null, 1) === 0, 'nenhum ativo: mínimo 0, nunca negativo');

console.log('\n5. Preço nos dois ciclos: a vaga custa o mesmo, o desconto é só da loja');
const a = priceForUnits(2, 'annual', 5);
const m = priceForUnits(2, 'monthly', 5);
check(a.unitsCharge === 194 && a.extraSeatsCharge === 85 && a.monthlyCharge === 279,
  'anual, 2 lojas + 5 vagas: 194 + 85 = R$ 279/mês');
check(m.unitsCharge === 254 && m.extraSeatsCharge === 85 && m.monthlyCharge === 339,
  'mensal, 2 lojas + 5 vagas: 254 + 85 = R$ 339/mês');
check(a.extraSeatPrice === 17 && m.extraSeatPrice === 17, 'extraSeatPrice = 17 nos dois ciclos');
check(a.savingsPerYear === 720 && m.savingsPerYear === 720 && priceForUnits(2, 'annual').savingsPerYear === 720,
  'economia do anual só sobre as lojas: (127−97) × 12 × 2 = 720, com ou sem vagas');
check(m.monthlyCharge - a.monthlyCharge === 60, 'diferença entre ciclos = só as lojas (2 × 30)');
check(a.includedSeats === 20 && a.extraSeats === 5, 'includedSeats 20 e extraSeats 5 no retorno');
check(a.units === 2 && a.cycle === 'annual' && a.perUnit === 97 && m.cycle === 'monthly' && m.perUnit === 127,
  'units, cycle e perUnit continuam no retorno');
check(a.monthlyTotal === 279 && a.chargeAmount === 279, 'aliases monthlyTotal/chargeAmount = monthlyCharge');
check(priceForUnits(3, 'mensal', 2).cycle === 'monthly', "'mensal' normaliza para 'monthly'");
const legado = priceForUnits(3);
check(legado.cycle === 'annual' && legado.extraSeats === 0 && legado.monthlyCharge === 291 && legado.savingsPerYear === 1080,
  'chamada antiga priceForUnits(3): anual, sem vagas, R$ 291 — igual a antes');
check(priceForUnits(1, 'annual', -3).extraSeats === 0 && priceForUnits(1, 'annual', null).monthlyCharge === 97,
  'vagas negativas/nulas contam 0');
check(priceForUnits(1, 'annual', 250).extraSeatsCharge === 4250,
  'priceForUnits NÃO corta no teto self-service: 250 vagas contratadas são cobradas inteiras');
check(priceForUnits(0, 'annual').units === 1 && priceForUnits(99, 'annual').units === MAX_SELF_SERVICE_UNITS,
  'lojas continuam entre 1 e o teto self-service');

console.log('\n6. O valor cobrado NÃO identifica o plano');
check(priceForUnits(2, 'annual', 11).monthlyCharge === 381, 'anual, 2 lojas + 11 vagas = R$ 381');
check(priceForUnits(3, 'monthly', 0).monthlyCharge === 381, 'mensal, 3 lojas = R$ 381 — mesmo valor, outro plano');
check(!('unitsForAmount' in plans) && !('getTierByPrice' in plans),
  'unitsForAmount e getTierByPrice não são mais exportados');
const src = await readFile(plansPath, 'utf8');
check(!/\b(unitsForAmount|getTierByPrice)\s*\(/.test(src), 'nem existem mais no código de lib/plans.js');
check(!/^\s*import\s/m.test(src), 'lib/plans.js continua puro: nenhum import');

console.log('\n7. formatBRL');
check(formatBRL(EXTRA_USER_PRICE, { cents: true }) === 'R$ 17,00', "vaga adicional: 'R$ 17,00'");
check(formatBRL(97) === 'R$ 97', "preço inteiro sem centavos: 'R$ 97'");
check(formatBRL(1164) === 'R$ 1.164', "milhar com ponto: 'R$ 1.164'");
check(formatBRL(1234567.5) === 'R$ 1.234.567,50', "valor quebrado sempre com centavos: 'R$ 1.234.567,50'");
check(formatBRL(85, { cents: true }) === 'R$ 85,00', "cents força os centavos: 'R$ 85,00'");
check(formatBRL('381.00') === 'R$ 381', "numeric do Postgres como texto: 'R$ 381'");
check(formatBRL(380.99999999999994) === 'R$ 381' && formatBRL(0.1 + 0.2) === 'R$ 0,30',
  'ruído de ponto flutuante não aparece na tela');
check(formatBRL(null) === 'R$ 0' && formatBRL(undefined, { cents: true }) === 'R$ 0,00', 'vazio vira R$ 0');
check(formatBRL(-5) === '-R$ 5' && formatBRL(-0) === 'R$ 0', 'negativo com sinal; -0 sem sinal');
// Paridade com o Intl pt-BR: a formatação é à mão (sem depender do ICU), mas
// tem de dizer o MESMO que o pt-BR diria. Só confere se o Node tiver o pt-BR.
const intlBR = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
if (intlBR(1234.5) === '1.234,50') {
  const amostra = [0, 17, 85, 97, 127, 279, 381, 1164, 4250, 12345.6, 1234567.89];
  check(amostra.every(n => formatBRL(n, { cents: true }) === `R$ ${intlBR(n)}`),
    'mesma saída do Intl pt-BR para os valores da tabela de preços');
}

console.log('\n8. monthlyValueFor: vale o que o Mercado Pago cobra');
const anual2 = { plan_tier: 'anual', unit_limit: 2 };
check(monthlyValueFor(anual2, { billed_amount: 381 }) === 381,
  'billed_amount 381 manda, mesmo com a companies dizendo anual × 2 (= 194)');
check(monthlyValueFor(anual2, { billed_amount: '279.00' }) === 279, "billed_amount como texto ('279.00') vira 279");
check(monthlyValueFor(anual2, { billed_amount: 0 }) === 194 && monthlyValueFor(anual2, { billed_amount: null }) === 194,
  'billed_amount 0/nulo cai no cálculo legado (anual × 2 = 194)');
check(monthlyValueFor(anual2) === 194 && monthlyValueFor(anual2, null) === 194,
  'sem conta de billing (chamada antiga, 1 argumento) = cálculo legado');
check(monthlyValueFor({ plan_tier: 'mensal', unit_limit: 3 }, undefined) === 381, 'legado mensal × 3 = 381');
check(monthlyValueFor({ plan_tier: 'cortesia', unit_limit: 3 }, null) === 0, 'cortesia sem cobrança = 0');
check(monthlyValueFor({ plan_tier: 'anual', unit_limit: null }, {}) === 0 && monthlyValueFor(null, null) === 0,
  'sem lojas e sem billed_amount = 0');

console.log(ok ? '\nOK — plans' : '\nFALHOU — plans');
process.exit(ok ? 0 : 1);
