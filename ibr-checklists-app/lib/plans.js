// Fonte única dos planos de assinatura e do estado de billing de uma empresa.
// Puro (sem segredos, sem node) — importável tanto no cliente quanto no servidor.

export const TRIAL_DAYS = 7;

// Tiers self-service. `unitLimit` é o teto de lojas do plano; acima de 5 é
// "consulte" (sem checkout automático). Preços em BRL.
//
// Curva proporcional que favorece a adoção: R$97 pela 1ª unidade + R$50 por
// unidade adicional no teto do tier (97, 197, 297). O custo por unidade CAI
// conforme cresce: R$97 → R$65,7 → R$59,4.
export const TIERS = {
  starter: { id: 'starter', label: '1 unidade',     price: 97,  unitLimit: 1 },
  growth:  { id: 'growth',  label: 'Até 3 unidades', price: 197, unitLimit: 3 },
  scale:   { id: 'scale',   label: 'Até 5 unidades', price: 297, unitLimit: 5 },
};

export const CUSTOM_TIER = {
  id: 'custom', label: 'Acima de 5 unidades', minUnits: 6,
  whatsapp: 'https://wa.me/5512988017472?text=' +
    encodeURIComponent('Olá, tenho mais de 5 unidades e quero condições especiais no ZCheck.'),
};

export const TIER_LIST = [TIERS.starter, TIERS.growth, TIERS.scale];

export function getTier(id) {
  return TIERS[id] || null;
}

// Menor tier que comporta `unitCount` lojas. Null se exige plano custom (>5).
export function tierForUnits(unitCount) {
  return TIER_LIST.find(t => unitCount <= t.unitLimit) || null;
}

// Tier pelo valor mensal (o webhook do MP traz o transaction_amount).
export function getTierByPrice(amount) {
  const n = Number(amount);
  return TIER_LIST.find(t => t.price === n) || null;
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
