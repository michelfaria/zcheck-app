/**
 * O lado do servidor das vagas: o que as rotas de billing e o cron decidem.
 *
 *   cd ibr-checklists-app && node tests/seats.spec.mjs
 *
 * ── Por que um arquivo de teste ──────────────────────────────────────────────
 *
 * `lib/seats.js` decide quanto o Mercado Pago cobra e o que o webhook grava.
 * As rotas só fazem I/O em volta dessas decisões, e nenhuma delas roda sem
 * sessão, banco e MP — por isso a regra é provada aqui, sem nenhum dos três.
 * Um erro nesta conta não derruba tela: sai na fatura do cliente, ou apaga o
 * plano de quem paga (o webhook antigo gravava plan_tier = null quando não
 * reconhecia o valor, e o pagante virava "cortesia" no MRR).
 *
 * O que fica provado:
 *   1. o pedido de vagas é validado contra o banco (mínimo = adicionais em
 *      uso), nunca contra a contagem do cliente;
 *   2. o checkout cobra as lojas ATIVAS (nem mais, nem menos — a mesma
 *      contagem da franquia e do cron) e no mínimo as vagas em uso;
 *   3. o webhook lê a intenção, não o valor — 381 = anual 2 lojas + 11 vagas =
 *      mensal 3 lojas — e nunca devolve null para plan_tier/unit_limit;
 *   4. o cron só ajusta quando o esperado difere do cobrado, em centavos, e
 *      nunca aplica o preço cortado em 50 lojas;
 *   5. o status da empresa só muda pela assinatura ATUAL dela — o 'cancelled'
 *      de uma preapproval velha não bloqueia quem está em teste;
 *   6. o número contratado que o aparelho viu (`expectedExtraSeats`) é lido
 *      com rigor: é ele que barra o "+1" calculado sobre um número velho;
 *   7. o checkout decide o que fazer com a assinatura anterior pelo MP (dono,
 *      status, última cobrança) e pelas recusas registradas — nunca pelo
 *      `past_due` em cache: assinatura paga não é cancelada nem cobrada de
 *      novo, e a troca de cartão não cancela nada antes de a nova ser paga;
 *   8. entre duas assinaturas autorizadas vence sempre a mais nova, qualquer
 *      que seja a ordem das notificações (a atual não vai e volta);
 *   9. estender o teste não relabela assinante como 'trialing'.
 */

import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

// Mesmo caminho dos outros specs: o módulo passa pelo esbuild (que resolve o
// `./plans` sem extensão, como o Next) e o teste prova o que as rotas importam.
const seatsPath = join(process.cwd(), 'lib', 'seats.js');
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-seats');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `export * from '${seatsPath}';\n`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', logLevel: 'silent',
});
const {
  normalizeQuota, quotaWithExtraSeats, validateSeatRequest, subscriptionAdjustable,
  hasActiveSubscription, billingCycleFor, sameAmount, checkoutPlan, checkoutReason,
  webhookDecision, syncDecision, expectedSeatsFrom, webhookStatusDecision, overSelfServiceLimit,
  preapprovalInfo, latestRejectionAt, inArrears, paidUpForCycle, previousSubscriptionDecision,
  duplicateWinner, trialExtensionBlocked, trialExtensionMessage,
} = await import(out);

// Cota como o banco devolve: 2 lojas ativas (20 da franquia) + 5 contratadas,
// 23 ativos → 3 adicionais em uso.
const quota = normalizeQuota({
  active_users: 23, active_units: 2, included_seats: 20, extra_seats: 5,
  capacity: 25, free_seats: 2, extra_seat_price: 17, exempt: false, extra_seats_in_use: 3,
});

console.log('\n1. Cota normalizada (o PostgREST pode mandar número como texto)');
check(quota.capacity === 25 && quota.free_seats === 2 && quota.extra_seats_in_use === 3, 'campos numéricos preservados');
const fromText = normalizeQuota({ active_users: '11', active_units: '1', extra_seats: '0' });
check(fromText.included_seats === 10 && fromText.capacity === 10 && fromText.extra_seats_in_use === 1,
  "texto vira número; franquia/capacidade/em uso recalculados quando ausentes (11 ativos, 1 loja → 1 em uso)");
check(normalizeQuota({ active_users: 3, active_units: 0 }).included_seats === 10, '0 lojas ativas → piso de 10 vagas');
check(normalizeQuota(null) === null, 'sem retorno → null (a rota responde quota_unavailable)');
const q6 = quotaWithExtraSeats(quota, 6);
check(q6.extra_seats === 6 && q6.capacity === 26 && q6.free_seats === 3 && q6.included_seats === 20,
  'quotaWithExtraSeats: +1 vaga → capacidade 26, 3 livres, franquia intacta');

console.log('\n2. Pedido de vagas adicionais (POST /api/billing/seats)');
check(validateSeatRequest(6, quota).ok && validateSeatRequest(6, quota).seats === 6, 'contratar +1 (5 → 6) passa');
check(validateSeatRequest(3, quota).ok, 'reduzir até as adicionais em uso (3) passa');
const below = validateSeatRequest(2, quota);
check(!below.ok && below.status === 409 && below.reason === 'below_in_use' && below.min === 3,
  'abaixo das em uso → 409 below_in_use com min = 3 (suspender antes)');
check(validateSeatRequest('4', quota).ok, "número como texto ('4') vale");
for (const bad of [-1, 1.5, 'abc', '', null, undefined, NaN, 201, {}]) {
  const r = validateSeatRequest(bad, quota);
  check(!r.ok && r.status === 400 && r.reason === 'invalid_seats', `${Number.isNaN(bad) ? 'NaN' : JSON.stringify(bad) ?? String(bad)} → 400 invalid_seats`);
}
check(validateSeatRequest(200, normalizeQuota({ active_users: 0, active_units: 1 })).ok, '200 (o teto self-service) passa');
// A franquia não é reduzível porque o pedido nem a contém: com 2 lojas e 10
// ativos, pedir 0 adicionais deixa 20 vagas — não existe "19".
const folgada = normalizeQuota({ active_users: 10, active_units: 2, extra_seats: 4 });
check(validateSeatRequest(0, folgada).ok && quotaWithExtraSeats(folgada, 0).capacity === 20,
  'reduzir a 0 adicionais com 2 lojas deixa 20 vagas: a franquia fica');
check(expectedSeatsFrom(5) === 5 && expectedSeatsFrom('0') === 0 && expectedSeatsFrom(0) === 0,
  'expectedExtraSeats: 5, "0" e 0 são números vistos (0 não é "ausente")');
check([undefined, null, '', -1, 1.5, 'x', {}].every(x => expectedSeatsFrom(x) === null),
  'ausente ou inválido → null (sem conferência, cliente antigo segue funcionando)');

console.log('\n3. Assinatura ajustável e trava de checkout duplicado');
const now = Date.parse('2026-09-24T12:00:00Z');
const ativa = { subscription_status: 'active', mp_preapproval_id: 'pre1', current_period_end: '2026-10-20T00:00:00Z' };
check(subscriptionAdjustable(ativa), "status 'active' + preapproval → ajusta");
check(!subscriptionAdjustable({ ...ativa, mp_preapproval_id: null }), 'sem preapproval (cortesia IBR) → não ajusta');
check(!subscriptionAdjustable({ ...ativa, subscription_status: 'trialing' }), 'trial → não ajusta (nada é cobrado)');
check(!subscriptionAdjustable({ ...ativa, subscription_status: 'canceled' }), 'cancelada → não ajusta');
check(hasActiveSubscription(ativa, now), 'período válido → already_subscribed');
check(hasActiveSubscription({ ...ativa, current_period_end: null }, now), 'ativa sem período (recém-ativada) → already_subscribed');
check(!hasActiveSubscription({ ...ativa, current_period_end: '2026-09-01T00:00:00Z' }, now), 'período vencido → pode assinar de novo');
check(!hasActiveSubscription({ ...ativa, subscription_status: 'canceled' }, now), 'cancelada → pode assinar de novo');

console.log('\n4. Ciclo e comparação de valor');
check(billingCycleFor({ account: { billed_cycle: 'monthly' }, company: { plan_tier: 'anual' } }) === 'monthly',
  'billed_cycle manda sobre plan_tier');
check(billingCycleFor({ intent: { cycle: 'annual' } }) === 'annual', 'sem billed_cycle, a intenção do checkout');
check(billingCycleFor({ company: { plan_tier: 'mensal' } }) === 'monthly', "plan_tier 'mensal' → monthly");
check(billingCycleFor({ company: { plan_tier: 'cortesia' } }) === null, 'cortesia/desconhecido → null (não chuta)');
check(sameAmount(381, '381.00') && sameAmount(0.1 + 0.2, 0.3), 'compara em centavos (texto e ruído de float)');
check(!sameAmount(381, 381.01) && !sameAmount(381, null) && !sameAmount(null, null), 'centavo de diferença, ou nulo, não bate');

console.log('\n5. Checkout: lojas e vagas contadas no servidor');
const trial = normalizeQuota({ active_users: 23, active_units: 2, extra_seats: 0 });
const p1 = checkoutPlan({ requestedUnits: 1, cycle: 'annual', quota: trial, account: { extra_seats: 0 } });
check(p1.ok && p1.units === 2, 'pediu 1 loja com 2 ativas → cobra 2');
check(p1.extraSeats === 3, '23 ativos com 20 de franquia → 3 vagas adicionais mesmo sem contratar');
check(p1.amount === 2 * 97 + 3 * 17 && p1.amount === 245, 'anual: 2 × 97 + 3 × 17 = 245');
check(p1.contractedBefore === 0, 'contratadas antes = 0 (o checkout registra a subida)');
const p2 = checkoutPlan({ requestedUnits: 3, cycle: 'monthly', quota: trial, account: { extra_seats: 5 } });
check(p2.ok && p2.units === 2 && p2.extraSeats === 5 && p2.amount === 2 * 127 + 5 * 17,
  'pediu 3 lojas com 2 ativas → cobra as 2 ativas (2 × 127 + 5 × 17 = 339): loja que não está ativa não dá franquia nem é cobrada');
// O caso da revisão: 1 loja ativa, 15 ativos, 5 contratadas. Pedir 2 lojas
// cobrava 279 com "20 vagas inclusas" que a capacidade real (10 + 5) nunca deu,
// e o cron repreçava para 182 no dia seguinte.
const umaLoja = normalizeQuota({ active_users: 15, active_units: 1, extra_seats: 5 });
const p3 = checkoutPlan({ requestedUnits: 2, cycle: 'annual', quota: umaLoja, account: { extra_seats: 5 } });
const s3a = syncDecision({ company: { subscription_status: 'active', mp_preapproval_id: 'pre9', plan_tier: 'anual' },
  account: { extra_seats: 5, billed_amount: p3.amount, billed_cycle: 'annual' }, quota: umaLoja });
check(p3.units === 1 && p3.amount === 97 + 5 * 17 && s3a.action === 'in_sync',
  'o checkout cobra exatamente o que o cron espera no dia seguinte (182 = 182, sem ajuste)');
check(checkoutPlan({ requestedUnits: 1, cycle: 'annual', quota: normalizeQuota({ active_users: 1, active_units: 0 }), account: {} }).units === 1,
  '0 lojas ativas → piso de 1 loja, como a franquia');
check(checkoutPlan({ requestedUnits: 2, cycle: 'annual', quota: normalizeQuota({ active_users: 40, active_units: 2, exempt: true }), account: {} }).extraSeats === 0,
  'isenta não paga vaga adicional');
for (const bad of [0, -1, 'x', null, 51]) {
  const r = checkoutPlan({ requestedUnits: bad, cycle: 'annual', quota: trial, account: {} });
  check(!r.ok && r.status === 400 && r.reason === 'invalid_units', `lojas ${JSON.stringify(bad)} → 400 invalid_units`);
}
check(!checkoutPlan({ requestedUnits: 1, quota: normalizeQuota({ active_users: 1, active_units: 60 }), account: {} }).ok,
  'mais lojas ativas que o teto self-service → invalid_units (conversa comercial)');

console.log('\n6. Descrição da assinatura no MP');
check(checkoutReason({ units: 2, extraSeats: 3, cycle: 'annual' }) === 'ZCheck — 2 lojas + 3 vagas adicionais · plano anual (12 meses)',
  'lojas + vagas + plano');
check(checkoutReason({ units: 1, extraSeats: 1, cycle: 'monthly' }) === 'ZCheck — 1 loja + 1 vaga adicional · plano mensal',
  'singular de loja e de vaga');
check(checkoutReason({ units: 2, extraSeats: 0, cycle: 'annual' }) === 'ZCheck — 2 lojas · plano anual (12 meses)',
  'sem "+ 0 vagas"');

console.log('\n7. Webhook: plano pela intenção, nunca pelo valor');
// 381 é ambíguo: anual com 2 lojas + 11 vagas = mensal com 3 lojas.
const intent381 = { mp_preapproval_id: 'pre1', company_id: 'acme', cycle: 'annual', units: 2, extra_seats: 11, amount: 381 };
const w1 = webhookDecision({ intent: intent381, companyId: 'acme', amount: 381 });
check(w1.hasIntent && !w1.mismatch, 'intenção encontrada e valor bate');
check(w1.companyPatch.plan_tier === 'anual' && w1.companyPatch.unit_limit === 2,
  "381 da intenção anual 2 + 11 grava 'anual' com 2 lojas (o inverso antigo diria 'mensal' com 3)");
check(w1.accountPatch.billed_amount === 381 && w1.accountPatch.billed_units === 2
  && w1.accountPatch.billed_extra_seats === 11 && w1.accountPatch.billed_cycle === 'annual', 'billed_* da intenção + valor real');
const w2 = webhookDecision({ intent: intent381, companyId: 'acme', amount: 398 });
check(w2.mismatch && w2.accountPatch.billed_amount === 398 && w2.companyPatch.plan_tier === 'anual',
  'valor ≠ intenção → mismatch, e billed_amount é o valor REAL (398), não o da intenção');
const w3 = webhookDecision({ intent: null, companyId: 'acme', amount: 381 });
check(!w3.hasIntent && Object.keys(w3.companyPatch).length === 0,
  'sem intenção → plan_tier/unit_limit ficam como estão (patch vazio)');
check(w3.accountPatch.billed_amount === 381 && Object.keys(w3.accountPatch).length === 1,
  'sem intenção → só o valor real é registrado (fato do MP, não palpite)');
const w4 = webhookDecision({ intent: { ...intent381, company_id: 'outra' }, companyId: 'acme', amount: 381 });
check(!w4.hasIntent && w4.foreign && Object.keys(w4.companyPatch).length === 0, 'intenção de OUTRA empresa é ignorada');
const w5 = webhookDecision({ intent: null, companyId: 'acme', amount: undefined });
check(Object.keys(w5.accountPatch).length === 0 && Object.keys(w5.companyPatch).length === 0,
  'sem intenção e sem valor → nada a gravar');
const w6 = webhookDecision({ intent: intent381, companyId: 'acme', amount: null });
check(!w6.mismatch && w6.accountPatch.billed_amount === 381, 'valor ausente no MP → usa o da intenção, sem falso alarme');
const semNull = [w1, w2, w3, w4, w5, w6].every(d =>
  [...Object.values(d.companyPatch), ...Object.values(d.accountPatch)].every(v => v !== null && v !== undefined));
check(semNull, 'nenhuma decisão grava null ou undefined (o bug que zerava plan_tier/unit_limit)');

console.log('\n8. Cron billing-sync: ajusta só quando o esperado difere do cobrado');
const co = { subscription_status: 'active', mp_preapproval_id: 'pre1', plan_tier: 'anual' };
const q2 = normalizeQuota({ active_users: 23, active_units: 2 });
const s1 = syncDecision({ company: co, account: { extra_seats: 5, billed_amount: 279, billed_cycle: 'annual' }, quota: q2 });
check(s1.action === 'in_sync' && s1.expected === 279, 'anual 2 lojas + 5 vagas = 279 = cobrado → em dia');
const s2 = syncDecision({ company: co, account: { extra_seats: 5, billed_amount: 279, billed_cycle: 'annual' },
  quota: normalizeQuota({ active_users: 23, active_units: 3 }) });
check(s2.action === 'adjust' && s2.expected === 3 * 97 + 5 * 17 && s2.billed === 279,
  'loja nova ativa → esperado 376 ≠ 279 → ajustar');
const s3 = syncDecision({ company: co, account: { extra_seats: 6, billed_amount: '279.00', billed_cycle: 'annual' }, quota: q2 });
check(s3.action === 'adjust' && s3.expected === 296, 'vaga contratada a mais → 296 ≠ 279 → ajustar');
check(syncDecision({ company: co, account: { exempt: true, extra_seats: 0 }, quota: q2 }).action === 'exempt', 'isenta → nada');
check(syncDecision({ company: { ...co, subscription_status: 'trialing' }, account: {}, quota: q2 }).action === 'no_subscription',
  'trial → nada a ajustar');
check(syncDecision({ company: { ...co, plan_tier: null }, account: { extra_seats: 0 }, quota: q2 }).action === 'unknown_cycle',
  'sem ciclo conhecido → unknown_cycle (marca pendente, não chuta)');
check(syncDecision({ company: co, account: { extra_seats: 0, billed_amount: null }, quota: q2 }).action === 'adjust',
  'sem valor registrado → ajustar (o cobrado é desconhecido)');
const s4 = syncDecision({ company: co, account: { extra_seats: 5, billed_amount: 279, adjust_pending: true }, quota: q2 });
check(s4.action === 'in_sync' && s4.clearPending === true, 'em dia com pendência velha → limpa a pendência');
const s5 = syncDecision({ company: co, account: { extra_seats: 0, billed_amount: 97, billed_cycle: 'annual' },
  quota: normalizeQuota({ active_users: 4, active_units: 0 }) });
check(s5.action === 'in_sync' && s5.expected === 97, '0 lojas ativas cobra o piso de 1 loja (97), como a franquia');
const s6 = syncDecision({ company: co, account: { extra_seats: 0, billed_amount: 4850, billed_cycle: 'annual' },
  quota: normalizeQuota({ active_users: 100, active_units: 55 }) });
check(s6.action === 'over_limit',
  '55 lojas ativas → over_limit (pendente), nunca o preço cortado de 50 lojas (4.850 "em dia")');
check(overSelfServiceLimit(51) && !overSelfServiceLimit(50), 'o teto é 50: 51 passa dele, 50 não');

console.log('\n9. Webhook: status só pela assinatura ATUAL');
const coAtual = { id: 'acme', subscription_status: 'active', mp_preapproval_id: 'preB' };
const cancelAtual = webhookStatusDecision({ mpStatus: 'cancelled', preId: 'preB', company: coAtual });
check(cancelAtual.apply && cancelAtual.patch.subscription_status === 'canceled', "cancelar a atual → 'canceled'");
const pausaAtual = webhookStatusDecision({ mpStatus: 'paused', preId: 'preB', company: coAtual });
check(pausaAtual.apply && pausaAtual.patch.subscription_status === 'past_due', "pausar a atual → 'past_due'");
const cancelVelha = webhookStatusDecision({ mpStatus: 'cancelled', preId: 'preA', company: coAtual });
check(!cancelVelha.apply && cancelVelha.reason === 'not_current',
  "o 'cancelled' da preapproval ANTERIOR (que o checkout cancelou) não derruba o assinante da atual");
const orfa = webhookStatusDecision({ mpStatus: 'cancelled', preId: 'orfa',
  company: { subscription_status: 'trialing', mp_preapproval_id: null } });
check(!orfa.apply, 'a órfã descartada pelo checkout (nunca virou a atual) não mexe no status');
const trialPendente = webhookStatusDecision({ mpStatus: 'cancelled', preId: 'preA',
  company: { subscription_status: 'trialing', mp_preapproval_id: 'preA' } });
check(!trialPendente.apply && trialPendente.reason === 'trialing',
  'cancelar a pendente (nunca autorizada) de quem está em teste não encerra o teste');
const autoriza = webhookStatusDecision({ mpStatus: 'authorized', preId: 'preC', company: coAtual });
check(autoriza.apply && autoriza.adopt && autoriza.replaced === 'preB',
  'autorizada uma nova → vira a atual, e a anterior é devolvida para conferir cobrança em dobro');
const autorizaMesma = webhookStatusDecision({ mpStatus: 'authorized', preId: 'preB', company: coAtual });
check(autorizaMesma.apply && !autorizaMesma.adopt && autorizaMesma.replaced === null, 'reautorizar a atual não troca nada');
check(!webhookStatusDecision({ mpStatus: 'pending', preId: 'preB', company: coAtual }).apply, "'pending' não muda status");
// extend_trial relabelava assinante para 'trialing': com a guarda por status,
// o cancelamento da assinatura DE VERDADE dele era ignorado. A guarda vale
// só para preapproval que nunca cobrou.
const relabelada = webhookStatusDecision({ mpStatus: 'paused', preId: 'preA',
  company: { subscription_status: 'trialing', mp_preapproval_id: 'preA' }, charged: true });
check(relabelada.apply && relabelada.patch.subscription_status === 'past_due',
  "pausar a atual que JÁ cobrou aplica mesmo com status 'trialing' (assinante relabelado)");

console.log('\n10. O que o MP diz de uma preapproval (preapprovalInfo)');
const DIA = 24 * 60 * 60 * 1000;
const agora = Date.parse('2026-10-24T15:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const mpPre = (o = {}) => ({
  id: 'pre1', external_reference: 'acme', status: 'authorized',
  date_created: '2026-08-24T12:00:00Z', next_payment_date: iso(agora + 30 * DIA),
  auto_recurring: { frequency: 1, transaction_amount: 279 },
  summarized: { last_charged_date: iso(agora - 2 * DIA), charged_quantity: 3 },
  ...o,
});
const inf = preapprovalInfo(mpPre());
check(inf.owner === 'acme' && inf.status === 'authorized' && inf.amount === 279 && inf.freqMonths === 1,
  'dono, status, valor e frequência');
check(inf.createdAt === Date.parse('2026-08-24T12:00:00Z') && inf.lastChargedAt === agora - 2 * DIA
  && inf.nextPaymentAt === agora + 30 * DIA && inf.charged === true, 'datas em ms e "já cobrou"');
const semResumo = preapprovalInfo(mpPre({ summarized: null, external_reference: 12345 }));
check(semResumo.lastChargedAt === null && semResumo.charged === false && semResumo.owner === '12345',
  'sem resumo de cobranças → lastChargedAt null e charged false; external_reference numérico vira texto');
check(preapprovalInfo(null) === null, 'corpo vazio → null');

console.log('\n11. Recusas registradas e atraso');
const rejeicoes = [
  { mp_id: 'pre1:pay9', created_at: iso(agora - 5 * DIA) },
  { mp_id: 'pre1:pay7', created_at: iso(agora - 40 * DIA) },
  { mp_id: 'pre10:pay3', created_at: iso(agora - 1 * DIA) },   // outra preapproval com prefixo parecido
  { mp_id: 'pre2:pay1', created_at: iso(agora) },
];
check(latestRejectionAt(rejeicoes, 'pre1') === agora - 5 * DIA,
  'a recusa mais recente DESTA preapproval (pre10 e pre2 não contam)');
check(latestRejectionAt([], 'pre1') === null && latestRejectionAt(rejeicoes, null) === null, 'sem recusa → null');
check(!inArrears({ lastChargedAt: null, lastRejectionAt: null }), 'sem recusa registrada não é atraso (past_due sozinho não prova)');
check(inArrears({ lastChargedAt: agora - 31 * DIA, lastRejectionAt: agora - 1 * DIA }), 'recusa depois da última cobrança → atraso');
check(!inArrears({ lastChargedAt: agora - 1 * DIA, lastRejectionAt: agora - 3 * DIA }),
  'retentativa aprovada DEPOIS da recusa → não é atraso');
// Dia da renovação recusada: a cobrança do mês passado ainda parece recente
// (menos de 31 dias), mas é de um ciclo que já acabou.
const renovacao = preapprovalInfo(mpPre({
  next_payment_date: iso(agora + 31 * DIA), summarized: { last_charged_date: iso(agora - 30 * DIA) } }));
check(!paidUpForCycle(renovacao, null, agora),
  'cobrança do ciclo anterior com a próxima fatura já avançada → NÃO pagou o ciclo corrente');
check(paidUpForCycle(inf, null, agora), 'cobrança deste ciclo, próxima fatura no futuro → pagou');
check(!paidUpForCycle(inf, agora - 1 * DIA, agora), 'recusa depois da cobrança → não pagou');
check(!paidUpForCycle(semResumo, null, agora), 'sem cobrança conhecida → não pagou');

console.log('\n12. Checkout: o que fazer com a assinatura anterior');
const own = (o = {}, body = {}) => ({ ok: true, owned: true, status: 'authorized', info: preapprovalInfo(mpPre(body)), ...o });
const pastDue = { subscription_status: 'past_due', mp_preapproval_id: 'pre1', current_period_end: iso(agora - 3 * DIA) };
// (a) Retentativa aprovada cujo webhook se perdeu: o MP mostra o ciclo pago,
// o app ainda diz past_due. Antes: cancelava a paga e cobrava o mês na nova.
const a = previousSubscriptionDecision({ own: own(), lastRejectionAt: agora - 3 * DIA, company: pastDue, now: agora });
check(a.action === 'live' && a.resync?.subscription_status === 'active'
  && a.resync.current_period_end === iso(agora + 30 * DIA),
  "past_due em cache + MP com cobrança DEPOIS da recusa → 'live' (409) e status regravado 'active' até a próxima fatura");
// (b) Recusa sem cobrança depois: troca de cartão — mas nada é cancelado
// agora; a anterior segue sendo a atual até a nova ser paga.
const b = previousSubscriptionDecision({
  own: own({}, { summarized: { last_charged_date: iso(agora - 31 * DIA) } }),
  lastRejectionAt: agora - 1 * DIA, company: pastDue, now: agora });
check(b.action === 'replace_on_authorization' && b.reason === 'arrears',
  'em atraso (recusa depois da última cobrança) → substitui só quando a nova for autorizada; checkout não cancela');
// extend_trial relabelou o assinante em atraso para 'trialing': a decisão não
// olha o status, então ele consegue trocar de cartão (antes: 409 "já tem assinatura").
const relabel = previousSubscriptionDecision({
  own: own({}, { summarized: { last_charged_date: iso(agora - 31 * DIA) } }),
  lastRejectionAt: agora - 1 * DIA, company: { ...pastDue, subscription_status: 'trialing' }, now: agora });
check(relabel.action === 'replace_on_authorization', "em atraso e relabelado 'trialing' → troca de cartão liberada (sem 409)");
const recem = previousSubscriptionDecision({
  own: own({}, { summarized: {} }), company: { subscription_status: 'trialing', mp_preapproval_id: 'pre1' }, now: agora });
check(recem.action === 'live' && recem.resync === null,
  'autorizada que ainda não cobrou (webhook atrasado, primeira cobrança a caminho) → 409, sem regravar nada');
const pagaAtiva = previousSubscriptionDecision({ own: own(), company: { subscription_status: 'active', mp_preapproval_id: 'pre1', current_period_end: iso(agora + 30 * DIA) }, now: agora });
check(pagaAtiva.action === 'live' && pagaAtiva.resync === null, 'paga e o app já ativo → 409 sem regravar');
const confusa = previousSubscriptionDecision({
  own: own({}, { next_payment_date: iso(agora - 2 * DIA), summarized: { last_charged_date: iso(agora - 33 * DIA) } }),
  company: pastDue, now: agora });
check(confusa.action === 'replace_on_authorization' && confusa.reason === 'unclear',
  'já cobrou, fatura vencida, sem recusa registrada, app bloqueado → substitui na autorização (nada cancelado agora)');
check(previousSubscriptionDecision({ own: own({ status: 'paused' }), company: pastDue, now: agora }).action === 'replace_on_authorization',
  'pausada → substitui na autorização (não cancela antes)');
check(previousSubscriptionDecision({ own: own({ status: 'pending' }), company: pastDue, now: agora }).action === 'cancel_first',
  'pendente (nunca paga) → cancela antes de criar a nova');
check(previousSubscriptionDecision({ own: own({ status: 'cancelled' }), company: pastDue }).action === 'ignore',
  'já cancelada → ignora');
check(previousSubscriptionDecision({ own: own({ owned: false }), company: pastDue }).reason === 'foreign',
  'de outra empresa (id plantado) → ignora, sem tocar nela');
check(previousSubscriptionDecision({ own: { ok: false, notFound: true }, company: pastDue }).action === 'ignore',
  'não existe no MP → ignora');
check(previousSubscriptionDecision({ own: { ok: false, notFound: false, httpStatus: 0 }, company: pastDue }).action === 'error',
  'MP fora do ar → erro (não se decide no escuro)');

console.log('\n13. Duas assinaturas autorizadas: vence a mais nova, sempre');
const velha = preapprovalInfo(mpPre({ id: 'preA', date_created: '2026-09-01T00:00:00Z' }));
const nova = preapprovalInfo(mpPre({ id: 'preB', date_created: '2026-09-20T00:00:00Z' }));
check(duplicateWinner(nova, velha) === 'notified' && duplicateWinner(velha, nova) === 'current',
  'a notificação da nova adota a nova; a da velha mantém a nova — nas duas ordens, fica preB');
check(duplicateWinner(nova, preapprovalInfo(mpPre({ date_created: null }))) === null && duplicateWinner(nova, nova) === null,
  'sem data (ou datas iguais) → null: nada é adotado nem cancelado, vai para gente');

console.log('\n14. Estender teste não relabela assinante');
check(trialExtensionBlocked({ subscription_status: 'trialing' }) === null, 'em teste → estende');
check(trialExtensionBlocked({ subscription_status: 'canceled', current_period_end: iso(agora - DIA) }, agora) === null,
  'cancelada com período vencido → estende');
check(trialExtensionBlocked({ subscription_status: 'active', mp_preapproval_id: 'pre1' }) === 'active_subscription',
  'assinante ativo → recusa');
check(trialExtensionBlocked({ subscription_status: 'active', plan_tier: 'cortesia' }) === 'active_subscription',
  "cortesia ('active' sem preapproval) → recusa (viraria trial e travaria em 7 dias)");
check(trialExtensionBlocked({ subscription_status: 'past_due', mp_preapproval_id: 'pre1' }) === 'past_due',
  'em atraso → recusa (o checkout é quem resolve: troca de cartão)');
check(trialExtensionBlocked({ subscription_status: 'canceled', current_period_end: iso(agora + 10 * DIA) }, agora) === 'paid_period',
  'cancelada com período pago em vigor → recusa (o teste encurtaria o acesso pago)');
check(/estender o teste/i.test(trialExtensionMessage('past_due')), 'a recusa vem com texto para o Core e o agente');

console.log(ok ? '\nOK — seats.spec' : '\nFALHOU — seats.spec');
process.exit(ok ? 0 : 1);
