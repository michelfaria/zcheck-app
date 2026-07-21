// Fonte única dos planos de assinatura e do estado de billing de uma empresa.
// Puro (sem segredos, sem node) — importável tanto no cliente quanto no servidor.
//
// Modelo (desde 21/07/2026): preço POR LOJA com desconto progressivo — todas as
// lojas pagam o preço da faixa atingida. Ciclo mensal ou anual (anual = paga 10
// meses, leva 12). NÃO existe "sob consulta": a última faixa (21+) é pública e
// vale para qualquer tamanho de rede — decisão de 21/07, transparência total.
// A tabela anterior (97/197/297 por tier fixo) vive em LEGACY_TIERS só para
// reconhecer assinaturas antigas no webhook.

export const TRIAL_DAYS = 14;

// Faixas de preço por unidade ativa. `perUnit` é o preço mensal por loja;
// `perUnitAnnual` é o equivalente mensal no ciclo anual (total anual ÷ 12,
// já com os 2 meses grátis — valores fixados na tabela pública).
export const PRICE_BANDS = [
  { id: 'faixa-1-2',    min: 1,  max: 2,        perUnit: 97, perUnitAnnual: 81 },
  { id: 'faixa-3-5',    min: 3,  max: 5,        perUnit: 79, perUnitAnnual: 66 },
  { id: 'faixa-6-10',   min: 6,  max: 10,       perUnit: 64, perUnitAnnual: 53 },
  { id: 'faixa-11-20',  min: 11, max: 20,       perUnit: 52, perUnitAnnual: 43 },
  { id: 'faixa-21-mais', min: 21, max: Infinity, perUnit: 45, perUnitAnnual: 38 },
];

// Teto do checkout self-service (limite operacional, não comercial — o preço
// 21+ é público). Também delimita a varredura de unitsForAmount; até 50 não há
// colisão de totais entre (units, ciclo) — verificado; acima disso haveria
// (ex.: 88 lojas mensal = 5 lojas anual = R$3.960).
export const MAX_SELF_SERVICE_UNITS = 50;

export function bandForUnits(unitCount) {
  const n = Math.max(1, Math.floor(Number(unitCount) || 1));
  return PRICE_BANDS.find(b => n >= b.min && n <= b.max) || null;
}

/**
 * Preço para `unitCount` lojas — qualquer quantidade (a faixa 21+ é aberta).
 * Retorna { band, units, perUnit, monthlyTotal, perUnitAnnual, annualTotal,
 *           annualMonthlyEq, annualSavings }.
 * annualTotal = perUnitAnnual × units × 12 (equivale a ~10 mensalidades);
 * annualSavings = quanto se economiza num ano em relação ao mensal.
 */
export function priceForUnits(unitCount, cycle = 'monthly') {
  const units = Math.max(1, Math.floor(Number(unitCount) || 1));
  const band = bandForUnits(units);
  if (!band) return null;
  const monthlyTotal = band.perUnit * units;
  const annualMonthlyEq = band.perUnitAnnual * units;
  const annualTotal = annualMonthlyEq * 12;
  return {
    band, units, cycle,
    perUnit: band.perUnit,
    monthlyTotal,
    perUnitAnnual: band.perUnitAnnual,
    annualTotal,
    annualMonthlyEq,
    annualSavings: monthlyTotal * 12 - annualTotal,
    // Valor efetivamente cobrado pelo ciclo escolhido:
    chargeAmount: cycle === 'annual' ? annualTotal : monthlyTotal,
  };
}

/**
 * Inverso: dado o valor cobrado numa assinatura (webhook do MP), descobre
 * quantas lojas e qual ciclo. Os totais são únicos por (units, cycle) dentro
 * do teto self-service. Null se não reconhecer.
 */
export function unitsForAmount(amount) {
  const n = Number(amount);
  if (!n) return null;
  for (let u = 1; u <= MAX_SELF_SERVICE_UNITS; u++) {
    const p = priceForUnits(u);
    if (p.monthlyTotal === n) return { units: u, cycle: 'monthly', band: p.band };
    if (p.annualTotal === n) return { units: u, cycle: 'annual', band: p.band };
  }
  return null;
}

// ── Tabela legada (assinaturas criadas antes de 21/07/2026) ──────────────────
// Clientes antigos mantêm o preço contratado (grandfathering); o webhook ainda
// precisa mapear esses valores para plan/unit_limit.
export const LEGACY_TIERS = [
  { id: 'starter', label: '1 unidade',      price: 97,  unitLimit: 1 },
  { id: 'growth',  label: 'Até 3 unidades', price: 197, unitLimit: 3 },
  { id: 'scale',   label: 'Até 5 unidades', price: 297, unitLimit: 5 },
  { id: 'scale',   label: 'Até 5 unidades', price: 397, unitLimit: 5 }, // preço praticado antes de 15/07
];

// Valor mensal de uma assinatura a partir da linha `companies` (métricas/MRR).
// Tiers legados pelo preço contratado; modelo novo por unit_limit. Assinaturas
// anuais valem ~17% menos ao mês — aproximação aceita nas métricas internas.
export function monthlyValueFor(company) {
  const legacy = LEGACY_TIERS.find(t => t.id === company?.plan_tier);
  if (legacy) return legacy.price;
  const units = Number(company?.unit_limit);
  if (units >= 1) return priceForUnits(Math.min(MAX_SELF_SERVICE_UNITS, units))?.monthlyTotal || 0;
  return 0;
}

// Tier (novo ou legado) pelo valor da assinatura no MP.
// Preferência ao novo modelo; 197/297/397 só existem no legado.
export function getTierByPrice(amount) {
  const modern = unitsForAmount(amount);
  if (modern) {
    return { id: modern.band.id, unitLimit: modern.units, cycle: modern.cycle };
  }
  const legacy = LEGACY_TIERS.find(t => t.price === Number(amount));
  return legacy ? { id: legacy.id, unitLimit: legacy.unitLimit, cycle: 'monthly' } : null;
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
