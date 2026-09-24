// Decisões do servidor sobre vagas contratadas e o valor da assinatura. Puro
// (sem banco, sem Mercado Pago, sem env): as rotas /api/billing/* e o cron
// billing-sync fazem o I/O e perguntam AQUI o que fazer — e a regra fica
// testável em tests/seats.spec.mjs sem sessão, sem banco e sem MP.
//
// A regra (decisão do Michel, 23/09/2026) mora no cabeçalho de lib/plans.js.
// O que este módulo acrescenta é o lado do servidor:
//   · o número de vagas vem do pedido, mas o MÍNIMO vem do banco
//     (`company_user_quota().extra_seats_in_use`) — nunca de contagem do cliente;
//   · o checkout cobra as lojas ATIVAS (regra 11: a mesma contagem da
//     franquia e do cron) e no mínimo as vagas adicionais já em uso;
//   · o webhook não adivinha o plano pelo valor (381 = anual 2 lojas + 11 vagas
//     = mensal 3 lojas): lê a intenção gravada em `billing_checkouts`;
//   · valor de dinheiro se compara em centavos inteiros, nunca com `===` em float.

import {
  priceForUnits, extraSeatsInUse, includedSeatsFor,
  MAX_SELF_SERVICE_EXTRA_SEATS, MAX_SELF_SERVICE_UNITS, EXTRA_USER_PRICE,
} from './plans';

const wholeNonNeg = (v) => Math.max(0, Math.floor(Number(v) || 0));
const cents = (v) => Math.round(Number(v) * 100);
const DAY_MS = 24 * 60 * 60 * 1000;
// Data (ISO do MP, ou do banco) → epoch ms; ausente/ inválida → null.
const toMs = (v) => {
  if (v == null || v === '') return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * Normaliza o jsonb de `company_user_quota()` (o PostgREST pode devolver
 * número como texto). `extra_seats_in_use` é recalculado se vier ausente —
 * é o mínimo da redução, então nunca pode faltar.
 */
export function normalizeQuota(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const activeUsers = wholeNonNeg(raw.active_users);
  const activeUnits = wholeNonNeg(raw.active_units);
  const includedSeats = raw.included_seats != null ? wholeNonNeg(raw.included_seats) : includedSeatsFor(activeUnits);
  const extraSeats = wholeNonNeg(raw.extra_seats);
  const capacity = raw.capacity != null ? wholeNonNeg(raw.capacity) : includedSeats + extraSeats;
  return {
    active_users: activeUsers,
    active_units: activeUnits,
    included_seats: includedSeats,
    extra_seats: extraSeats,
    capacity,
    free_seats: raw.free_seats != null ? Number(raw.free_seats) || 0 : capacity - activeUsers,
    extra_seat_price: raw.extra_seat_price != null ? Number(raw.extra_seat_price) : EXTRA_USER_PRICE,
    exempt: raw.exempt === true,
    extra_seats_in_use: raw.extra_seats_in_use != null
      ? wholeNonNeg(raw.extra_seats_in_use)
      : extraSeatsInUse(activeUsers, activeUnits),
  };
}

/** A mesma cota com outro número de vagas adicionais (resposta sem 2ª ida ao banco). */
export function quotaWithExtraSeats(quota, extraSeats) {
  const extra = wholeNonNeg(extraSeats);
  const capacity = quota.included_seats + extra;
  return { ...quota, extra_seats: extra, capacity, free_seats: capacity - quota.active_users };
}

/**
 * Valida o pedido de vagas adicionais de POST /api/billing/seats.
 * Inteiro entre 0 e MAX_SELF_SERVICE_EXTRA_SEATS (acima disso é conversa
 * comercial) → senão 400 'invalid_seats'. Abaixo das adicionais EM USO → 409
 * 'below_in_use' com o `min`: reduzir mais deixaria gente ativa sem vaga — a
 * diretoria suspende usuários antes. A franquia nem entra na conta: o pedido
 * é só das ADICIONAIS, então "reduzir para 19 com 2 lojas" não é expressável.
 */
export function validateSeatRequest(value, quota) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_SELF_SERVICE_EXTRA_SEATS) {
    return { ok: false, status: 400, reason: 'invalid_seats', max: MAX_SELF_SERVICE_EXTRA_SEATS };
  }
  const min = quota ? quota.extra_seats_in_use : 0;
  if (n < min) return { ok: false, status: 409, reason: 'below_in_use', min };
  return { ok: true, seats: n };
}

/**
 * `expectedExtraSeats` do corpo de POST /api/billing/seats: o número de vagas
 * adicionais que o aparelho VIU antes de pedir a mudança. A rota o compara com
 * o gravado e recusa com 409 'stale' se outra sessão mudou no meio — o pedido
 * é um alvo ABSOLUTO, e "+1" calculado sobre 8 quando o gravado já é 5
 * contrataria 4 vagas por um clique que consentiu com uma.
 * Ausente/inválido → null (sem conferência; compat com cliente antigo).
 */
export function expectedSeatsFrom(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Assinatura cujo valor se ajusta no MP: status 'active' E preapproval
 * conhecida. Trial, cancelada e past_due não têm o que ajustar — o valor novo
 * entra no próximo checkout, ou o cron acerta quando voltar a 'active'.
 */
export function subscriptionAdjustable(company) {
  return company?.subscription_status === 'active' && !!company?.mp_preapproval_id;
}

/**
 * Já existe assinatura vigente → o checkout recusa com 409 'already_subscribed'.
 * Sem esta trava, um segundo checkout trocava `mp_preapproval_id` e a
 * assinatura antiga seguia cobrando (cobrança dupla, e o /cancel mirava a nova).
 * Período nulo com status 'active' conta como vigente (recém-ativada), igual ao
 * billingState de lib/plans.js.
 */
export function hasActiveSubscription(company, now = Date.now()) {
  if (!subscriptionAdjustable(company)) return false;
  const end = company.current_period_end ? new Date(company.current_period_end).getTime() : null;
  return end == null || Number.isNaN(end) || end > now;
}

/** Ciclo da assinatura: o registrado na cobrança, senão a intenção do checkout, senão o plan_tier. */
export function billingCycleFor({ account, intent, company } = {}) {
  const norm = (c) => (c === 'annual' || c === 'anual' ? 'annual'
    : c === 'monthly' || c === 'mensal' ? 'monthly' : null);
  return norm(account?.billed_cycle) || norm(intent?.cycle) || norm(company?.plan_tier);
}

/** Mesmo valor em reais? Em centavos inteiros; ausente/inválido nunca "bate". */
export function sameAmount(a, b) {
  if (a == null || b == null || a === '' || b === '') return false;
  const x = Number(a), y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return cents(x) === cents(y);
}

/**
 * Plano do checkout, calculado NO SERVIDOR. Lojas = as lojas ATIVAS (piso de
 * 1), a mesma contagem que dá a franquia de vagas e que o cron billing-sync
 * usa no dia seguinte (regra 11). O pedido do cliente só é validado — não
 * sobe nem desce o número: assinar 3 lojas com 1 ativa cobraria 2 lojas que a
 * franquia não concede (as vagas delas não existem até a loja ser ativada), e
 * o cron baixaria o valor no dia seguinte. Loja nova entra quando for ativada,
 * a partir da fatura seguinte.
 * Vagas adicionais = o maior entre as contratadas e as EM USO — o cliente não
 * informa vaga nenhuma. Empresa isenta não paga vaga.
 */
export function checkoutPlan({ requestedUnits, cycle, quota, account } = {}) {
  const requested = Math.floor(Number(requestedUnits));
  if (!Number.isFinite(requested) || requested < 1 || requested > MAX_SELF_SERVICE_UNITS) {
    return { ok: false, status: 400, reason: 'invalid_units' };
  }
  const units = Math.max(1, wholeNonNeg(quota?.active_units));
  // Mais lojas ativas que o teto self-service: conversa comercial, não formulário.
  if (units > MAX_SELF_SERVICE_UNITS) return { ok: false, status: 400, reason: 'invalid_units' };
  const exempt = quota?.exempt === true || account?.exempt === true;
  const contracted = wholeNonNeg(account?.extra_seats);
  const extraSeats = exempt ? 0 : Math.max(contracted, quota?.extra_seats_in_use || 0);
  const price = priceForUnits(units, cycle === 'monthly' ? 'monthly' : 'annual', extraSeats);
  return {
    ok: true, units: price.units, extraSeats, cycle: price.cycle,
    amount: price.monthlyCharge, price, contractedBefore: contracted,
  };
}

/** Descrição da assinatura no MP. Sem "+ 0 vagas": a vaga só aparece quando existe. */
export function checkoutReason({ units, extraSeats, cycle }) {
  const u = wholeNonNeg(units);
  const e = wholeNonNeg(extraSeats);
  const lojas = `${u} ${u === 1 ? 'loja' : 'lojas'}`;
  const vagas = e > 0 ? ` + ${e} ${e === 1 ? 'vaga adicional' : 'vagas adicionais'}` : '';
  const plano = cycle === 'monthly' ? 'mensal' : 'anual (12 meses)';
  return `ZCheck — ${lojas}${vagas} · plano ${plano}`;
}

/**
 * O que o webhook grava quando a preapproval é autorizada.
 *   · COM intenção (billing_checkouts da mesma empresa): plan_tier/unit_limit
 *     saem dela, e billed_* registram o que o MP cobra de fato — billed_amount
 *     é o transaction_amount REAL, mesmo quando difere da intenção
 *     (`mismatch` → o chamador registra em billing_events e alerta).
 *   · SEM intenção (ou intenção de outra empresa): plano e lojas ficam como
 *     estão — adivinhar pelo valor gravaria plano errado. Só o valor real é
 *     registrado, porque é fato do MP, não palpite, e é ele que o MRR usa.
 *   · NUNCA devolve null em nenhum campo: um valor desconhecido simplesmente
 *     não entra no patch.
 */
export function webhookDecision({ intent, companyId, amount }) {
  const real = Number(amount);
  const hasReal = amount != null && amount !== '' && Number.isFinite(real) && real > 0;
  const foreign = !!intent && !!companyId && intent.company_id !== companyId;
  if (!intent || foreign) {
    return {
      hasIntent: false, foreign, mismatch: false,
      companyPatch: {},
      accountPatch: hasReal ? { billed_amount: real } : {},
    };
  }
  const cycle = intent.cycle === 'monthly' ? 'monthly' : 'annual';
  const units = wholeNonNeg(intent.units);
  const extra = wholeNonNeg(intent.extra_seats);
  const companyPatch = { plan_tier: cycle === 'monthly' ? 'mensal' : 'anual' };
  if (units >= 1) companyPatch.unit_limit = units;
  const accountPatch = { billed_cycle: cycle, billed_extra_seats: extra };
  if (units >= 1) accountPatch.billed_units = units;
  const intentAmount = Number(intent.amount);
  if (hasReal) accountPatch.billed_amount = real;
  else if (Number.isFinite(intentAmount) && intentAmount > 0) accountPatch.billed_amount = intentAmount;
  return {
    hasIntent: true, foreign: false,
    mismatch: hasReal && !sameAmount(real, intent.amount),
    companyPatch, accountPatch,
  };
}

/**
 * Mais lojas ativas do que o teto self-service: `priceForUnits` corta em
 * MAX_SELF_SERVICE_UNITS (é a tabela da landing), então o preço calculado
 * seria o de 50 lojas enquanto a franquia segue crescendo 10 por loja. Não se
 * ajusta nada sozinho — vira pendência para conversa comercial.
 */
export const overSelfServiceLimit = (activeUnits) => wholeNonNeg(activeUnits) > MAX_SELF_SERVICE_UNITS;

/**
 * Decisão do cron billing-sync para uma empresa: o valor esperado é
 * priceForUnits(lojas ativas, ciclo, vagas contratadas) e ele é comparado com
 * o que o MP cobra hoje (billed_amount).
 *   'exempt'          → cortesia: não se cobra nada, não se ajusta nada;
 *   'no_subscription' → nada a ajustar;
 *   'unknown_cycle'   → sem ciclo registrado não há como calcular — pendente;
 *   'over_limit'      → acima de 50 lojas ativas o preço da tabela não vale —
 *                       pendente (conversa comercial), nunca o preço cortado;
 *   'in_sync'         → valores batem (`clearPending` se havia pendência velha);
 *   'adjust'          → o chamador aplica o valor esperado.
 */
export function syncDecision({ company, account, quota, intent } = {}) {
  if (account?.exempt === true || quota?.exempt === true) return { action: 'exempt' };
  if (!subscriptionAdjustable(company)) return { action: 'no_subscription' };
  const cycle = billingCycleFor({ account, intent, company });
  if (!cycle) return { action: 'unknown_cycle' };
  if (overSelfServiceLimit(quota?.active_units)) return { action: 'over_limit', cycle };
  const price = priceForUnits(quota?.active_units || 0, cycle, account?.extra_seats || 0);
  const expected = price.monthlyCharge;
  const billed = account?.billed_amount != null ? Number(account.billed_amount) : null;
  if (sameAmount(expected, billed)) {
    return { action: 'in_sync', expected, billed, cycle, clearPending: account?.adjust_pending === true };
  }
  return { action: 'adjust', expected, billed, cycle, units: price.units, extraSeats: price.extraSeats };
}

/**
 * O que importa de uma preapproval lida NO MP (GET /preapproval/{id}), em
 * números: dono (`external_reference`), status, quando nasceu, quando foi a
 * última cobrança e quando é a próxima. `summarized` é o resumo de cobranças
 * que o MP devolve junto; se não vier, `lastChargedAt` fica null e `charged`
 * false — e toda decisão abaixo trata "não sei" pelo lado que NÃO cancela
 * assinatura viva nem cria cobrança nova por cima dela.
 */
export function preapprovalInfo(pre) {
  if (!pre || typeof pre !== 'object') return null;
  const sum = pre.summarized && typeof pre.summarized === 'object' ? pre.summarized : {};
  const lastChargedAt = toMs(sum.last_charged_date);
  return {
    id: pre.id != null && pre.id !== '' ? String(pre.id) : null,
    owner: pre.external_reference != null && pre.external_reference !== '' ? String(pre.external_reference) : null,
    status: pre.status ?? null,
    amount: pre.auto_recurring?.transaction_amount ?? null,
    freqMonths: Number(pre.auto_recurring?.frequency) || 1,
    createdAt: toMs(pre.date_created),
    nextPaymentAt: toMs(pre.next_payment_date),
    lastChargedAt,
    charged: lastChargedAt != null || (Number(sum.charged_quantity) || 0) > 0,
  };
}

/**
 * A recusa mais recente registrada pelo webhook PARA ESTA preapproval
 * (billing_events mp_type 'payment_rejected', mp_id `${preId}:${pagamento}`).
 * `rows` = [{ mp_id, created_at }]. Sem recusa → null.
 */
export function latestRejectionAt(rows, preId) {
  if (!preId || !Array.isArray(rows)) return null;
  const prefix = `${preId}:`;
  let latest = null;
  for (const r of rows) {
    if (typeof r?.mp_id !== 'string' || !r.mp_id.startsWith(prefix)) continue;
    const t = toMs(r.created_at);
    if (t != null && (latest == null || t > latest)) latest = t;
  }
  return latest;
}

/**
 * Em atraso = há recusa registrada e NENHUMA cobrança aprovada depois dela.
 * Sem recusa conhecida não é atraso: `past_due` sozinho não prova nada — é o
 * status em cache, e fica velho quando o webhook da retentativa aprovada se
 * perde (a assinatura foi paga, o app ainda bloqueia).
 */
export function inArrears({ lastChargedAt = null, lastRejectionAt = null } = {}) {
  if (lastRejectionAt == null) return false;
  return lastChargedAt == null || lastChargedAt < lastRejectionAt;
}

/**
 * A preapproval pagou o ciclo CORRENTE? Há cobrança, sem recusa registrada
 * depois dela, e ela é do ciclo que termina na próxima fatura (com 3 dias de
 * folga para retentativa aprovada). Olhar só "cobrou há menos de um mês"
 * enganaria no dia da renovação recusada: a cobrança do mês passado ainda
 * parece recente. Sem próxima fatura no MP, vale a última cobrança dentro de
 * um ciclo. É o que decide 409 no checkout e o alerta de cobrança em dobro
 * quando ela é substituída por outra.
 */
export function paidUpForCycle(info, lastRejectionAt = null, now = Date.now()) {
  if (!info?.lastChargedAt) return false;
  if (lastRejectionAt != null && info.lastChargedAt <= lastRejectionAt) return false;
  const cycleMs = (info.freqMonths || 1) * 31 * DAY_MS;
  if (info.nextPaymentAt != null) {
    return info.nextPaymentAt > now && info.lastChargedAt >= info.nextPaymentAt - cycleMs - 3 * DAY_MS;
  }
  return now - info.lastChargedAt < cycleMs;
}

/**
 * O checkout encontrou uma assinatura anterior (`companies.mp_preapproval_id`)
 * e a conferiu no MP (preapprovalOwnership). O que fazer com ela ANTES de
 * criar a nova:
 *   'error'   → o MP não respondeu: não dá para saber se ela cobra — recusa.
 *   'ignore'  → não existe no MP, é de outra empresa (id plantado) ou já foi
 *               cancelada: não se mexe nela, e a nova vira a atual.
 *   'cancel_first' → pendente (nunca foi paga): cancelada antes de nascer a
 *               nova — não há assinatura viva a perder, e o link velho deixa
 *               de poder ser pago em paralelo.
 *   'replace_on_authorization' → autorizada EM ATRASO (recusa registrada sem
 *               cobrança aprovada depois) ou pausada: é o caso de trocar de
 *               cartão. Ela NÃO é cancelada aqui e continua sendo a atual; o
 *               webhook a cancela quando a nova for autorizada (paga). Checkout
 *               abandonado não derruba nada — as retentativas do MP seguem.
 *   'live'    → autorizada e VIVA: pagou o ciclo corrente (paidUpForCycle),
 *               ou nunca cobrou ainda (a primeira cobrança está a caminho —
 *               o webhook atrasou), ou o app já a vê ativa. O checkout recusa
 *               (409): uma segunda cobraria o mês duas vezes. `resync` vem
 *               quando o MP mostra o ciclo pago mas o app não está 'active'
 *               — o webhook da aprovação se perdeu; o chamador regrava.
 * Autorizada que já cobrou, está com a fatura vencida, sem recusa registrada
 * e com o app bloqueado cai em 'replace_on_authorization' ('unclear'): nada é
 * cancelado, e se a nova for paga com a anterior tendo cobrado o ciclo, o
 * webhook alerta cobrança em dobro.
 * A decisão NÃO olha `subscription_status` para decidir cancelar: é cache
 * (past_due velho) e o Core relabelava para 'trialing' (extend_trial).
 */
export function previousSubscriptionDecision({ own, lastRejectionAt = null, company, now = Date.now() } = {}) {
  if (!own?.ok) return own?.notFound ? { action: 'ignore', reason: 'not_found' } : { action: 'error' };
  if (!own.owned) return { action: 'ignore', reason: 'foreign' };
  const info = own.info || {};
  const st = own.status;
  if (st === 'cancelled') return { action: 'ignore', reason: 'cancelled' };
  if (st === 'pending') return { action: 'cancel_first' };
  if (st !== 'authorized') {
    // Pausada ou status que não conhecemos: nada é cancelado agora — só
    // quando a substituta for paga.
    return { action: 'replace_on_authorization', reason: st || 'unknown' };
  }
  if (inArrears({ lastChargedAt: info.lastChargedAt, lastRejectionAt })) {
    return { action: 'replace_on_authorization', reason: 'arrears' };
  }
  const end = toMs(company?.current_period_end);
  const localOk = company?.subscription_status === 'active' && (end == null || end > now);
  if (paidUpForCycle(info, lastRejectionAt, now)) {
    return {
      action: 'live',
      resync: localOk || info.nextPaymentAt == null ? null
        : { subscription_status: 'active', current_period_end: new Date(info.nextPaymentAt).toISOString() },
    };
  }
  if (!info.charged || localOk) return { action: 'live', resync: null };
  return { action: 'replace_on_authorization', reason: 'unclear' };
}

/**
 * Duas preapprovals AUTORIZADAS da mesma empresa (dois checkouts ao mesmo
 * tempo, troca de cartão): vence a MAIS NOVA no MP (`date_created`), sempre —
 * a mesma resposta qualquer que seja a ordem das notificações, então a atual
 * nunca vai e volta. A outra é cancelada pelo webhook.
 * Sem data em uma das duas → null: o chamador não adota nem cancela nada.
 */
export function duplicateWinner(notified, current) {
  const a = notified?.createdAt, b = current?.createdAt;
  if (a == null || b == null || a === b) return null;
  return a > b ? 'notified' : 'current';
}

/**
 * Estender o teste (Core "+7 dias de teste" e a ação extend_trial dos agentes)
 * grava subscription_status = 'trialing'. Em quem ASSINA isso apaga o estado
 * da cobrança: o cron deixa de ajustar o valor, o webhook passa a tratar a
 * assinatura como de teste e, antes desta trava, o checkout respondia "já tem
 * assinatura" a quem precisava trocar de cartão. Cortesia (IBR, 'active' sem
 * preapproval) viraria trial e travaria em 7 dias.
 * Retorna o motivo da recusa, ou null quando pode estender.
 */
export function trialExtensionBlocked(company, now = Date.now()) {
  const st = company?.subscription_status;
  if (st === 'active') return 'active_subscription';
  if (st === 'past_due') return 'past_due';
  const end = toMs(company?.current_period_end);
  if (st === 'canceled' && end != null && end > now) return 'paid_period';
  return null;
}

/** O texto da recusa de extend_trial, para o Core e para o registro do agente. */
export function trialExtensionMessage(reason) {
  const motivo = {
    active_subscription: 'tem assinatura ativa (ou é cortesia)',
    past_due: 'tem assinatura em atraso no Mercado Pago',
    paid_period: 'cancelou, mas ainda tem período pago em vigor',
  }[reason] || 'tem assinatura';
  return `Não dá para estender o teste: a empresa ${motivo}. Estender gravaria o status 'trialing' por cima da cobrança — resolva pela assinatura.`;
}

/**
 * O que um webhook de PREAPPROVAL pode fazer com o status da empresa.
 *
 * `external_reference` diz de que empresa a assinatura é, mas não se é a
 * assinatura ATUAL dela. Uma empresa pode ter preapprovals velhas: a pendente
 * de um checkout abandonado, a que o próprio checkout cancela antes de criar
 * outra (ver /api/billing/checkout), a órfã que o checkout descarta quando não
 * consegue gravar a intenção, a substituída na troca de cartão. O MP notifica
 * o 'cancelled' de todas elas — e aplicar isso à empresa marcava 'canceled'
 * um cliente em teste (bloqueio na hora) ou um assinante ativo cuja
 * assinatura vigente é outra.
 *
 *   · 'authorized' → sempre aplica (a assinatura está viva no MP, reconsultada
 *     agora). Se não é a atual, `adopt`, e `replaced` é a atual — o webhook
 *     decide quem fica (duplicateWinner) e cancela a outra.
 *   · 'cancelled'/'paused' → só da assinatura ATUAL. Em quem está em teste,
 *     só se ela já COBROU alguma vez (`charged`, do resumo do MP): pendente
 *     que nunca foi paga não encerra o trial — mas a assinatura de verdade de
 *     alguém relabelado para 'trialing' não fica com o cancelamento ignorado.
 *   · o resto (pending…) → nada muda.
 *
 * Retorna { apply, patch?, adopt?, replaced?, reason? }.
 */
export function webhookStatusDecision({ mpStatus, preId, company, charged = false } = {}) {
  const current = company?.mp_preapproval_id != null && company.mp_preapproval_id !== ''
    ? String(company.mp_preapproval_id) : null;
  const id = preId != null ? String(preId) : null;
  const isCurrent = !!id && current === id;
  if (mpStatus === 'authorized') {
    return { apply: true, adopt: !isCurrent, replaced: current && !isCurrent ? current : null };
  }
  if (mpStatus !== 'cancelled' && mpStatus !== 'paused') return { apply: false, reason: 'ignored_status' };
  if (!isCurrent) return { apply: false, reason: 'not_current' };
  if (company?.subscription_status === 'trialing' && !charged) return { apply: false, reason: 'trialing' };
  return {
    apply: true,
    patch: { subscription_status: mpStatus === 'cancelled' ? 'canceled' : 'past_due' },
  };
}
