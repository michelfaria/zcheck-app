// Fonte única dos planos de assinatura e do estado de billing de uma empresa.
// Puro (sem segredos, sem node) — importável tanto no cliente quanto no servidor.
//
// Modelo (21/07/2026, pré-lançamento — sem clientes nem legado a preservar):
// PREÇO ÚNICO POR LOJA, sem pacotes e sem "sob consulta".
//   · Anual:  R$ 97/loja/mês — cobrança MENSAL recorrente no cartão,
//     compromisso de 12 meses. É a oferta principal (herói).
//   · Mensal: R$ 127/loja/mês — sem fidelidade, cancele quando quiser.
// Nos dois planos a cobrança no MP é mensal (frequency 1); o que muda é o
// preço por loja e o compromisso. Selo do anual: −24% ((127−97)/127 ≈ 23,6%).

export const TRIAL_DAYS = 14;

export const PRICE_PER_UNIT = {
  annual: 97,   // por loja/mês, 12 meses no cartão
  monthly: 127, // por loja/mês, sem fidelidade
};

export const ANNUAL_DISCOUNT_LABEL = '−24%';

// Teto operacional do checkout self-service. Também delimita a varredura de
// unitsForAmount; 97 e 127 são coprimos — nenhuma colisão de totais até 50.
export const MAX_SELF_SERVICE_UNITS = 50;

const normCycle = (c) => (c === 'monthly' || c === 'mensal' ? 'monthly' : 'annual');

/**
 * Preço para `unitCount` lojas no ciclo dado (padrão: anual, o herói).
 * `monthlyCharge` é o valor cobrado por mês no cartão (nos DOIS planos a
 * cobrança é mensal). `savingsPerYear` é quanto o anual economiza em 12 meses
 * frente ao mensal. `monthlyTotal`/`chargeAmount` são aliases de compat.
 */
export function priceForUnits(unitCount, cycle = 'annual') {
  const units = Math.min(MAX_SELF_SERVICE_UNITS, Math.max(1, Math.floor(Number(unitCount) || 1)));
  const c = normCycle(cycle);
  const perUnit = PRICE_PER_UNIT[c];
  const monthlyCharge = perUnit * units;
  const savingsPerYear = (PRICE_PER_UNIT.monthly - PRICE_PER_UNIT.annual) * 12 * units;
  return {
    units, cycle: c, perUnit, monthlyCharge, savingsPerYear,
    monthlyTotal: monthlyCharge, chargeAmount: monthlyCharge,
  };
}

/**
 * Inverso: dado o valor mensal cobrado numa assinatura (webhook do MP),
 * descobre quantas lojas e qual plano. Null se não reconhecer.
 */
export function unitsForAmount(amount) {
  const n = Number(amount);
  if (!n) return null;
  for (let u = 1; u <= MAX_SELF_SERVICE_UNITS; u++) {
    if (PRICE_PER_UNIT.annual * u === n) return { units: u, cycle: 'annual' };
    if (PRICE_PER_UNIT.monthly * u === n) return { units: u, cycle: 'monthly' };
  }
  return null;
}

// Plano pelo valor da assinatura no MP → grava plan_tier ('anual'|'mensal')
// e unit_limit (nº de lojas contratadas) em companies.
export function getTierByPrice(amount) {
  const m = unitsForAmount(amount);
  return m ? { id: m.cycle === 'annual' ? 'anual' : 'mensal', unitLimit: m.units, cycle: m.cycle } : null;
}

// Valor mensal de uma assinatura a partir da linha `companies` (métricas/MRR).
// plan_tier desconhecido (cortesia/legado) → 0, como antes.
export function monthlyValueFor(company) {
  const units = Number(company?.unit_limit);
  if (!(units >= 1)) return 0;
  if (company?.plan_tier === 'anual') return PRICE_PER_UNIT.annual * units;
  if (company?.plan_tier === 'mensal') return PRICE_PER_UNIT.monthly * units;
  return 0;
}

const asDate = (v) => (v ? new Date(v) : null);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Estado de billing derivado da linha `companies`.
 * Retorna { state: 'active'|'trialing'|'expired', daysLeft, trialEndsAt, periodEnd }.
 *
 * Regra de segurança: na dúvida (empresa ausente / campos faltando), NÃO bloqueia
 * — evita travar acesso legítimo por dado incompleto. O bloqueio real é só quando
 * há sinal claro de trial vencido ou assinatura encerrada.
 */
export function billingState(company, now = Date.now()) {
  if (!company) return { state: 'active', daysLeft: null, trialEndsAt: null, periodEnd: null };

  const status = company.subscription_status || null;
  const trialEndsAt = asDate(company.trial_ends_at);
  const periodEnd = asDate(company.current_period_end);

  const trialDaysLeft = trialEndsAt
    ? Math.ceil((trialEndsAt.getTime() - now) / DAY_MS) : null;
  const periodValid = periodEnd ? periodEnd.getTime() > now : false;

  // Assinatura paga vigente (inclui cancelada mas ainda dentro do período pago).
  if ((status === 'active' || status === 'canceled') && periodValid) {
    return { state: 'active', daysLeft: null, trialEndsAt, periodEnd };
  }
  // Ativa sem período registrado ainda (recém-ativada): trata como ativa.
  if (status === 'active' && !periodEnd) {
    return { state: 'active', daysLeft: null, trialEndsAt, periodEnd };
  }
  // Trial em andamento.
  if (status === 'trialing' && trialEndsAt && trialEndsAt.getTime() > now) {
    return { state: 'trialing', daysLeft: Math.max(0, trialDaysLeft), trialEndsAt, periodEnd };
  }
  // Trial vencido, ou past_due/canceled com período já encerrado → bloqueio.
  if (status === 'trialing' || status === 'past_due' || status === 'canceled') {
    return { state: 'expired', daysLeft: 0, trialEndsAt, periodEnd };
  }
  // Status desconhecido/legado sem trial: não bloqueia.
  return { state: 'active', daysLeft: null, trialEndsAt, periodEnd };
}
