import { adminGuard, jsonNoStore } from '../../../../../lib/adminApi';
import { priceForUnits, monthlyValueFor, PRICE_PER_UNIT, billingState } from '../../../../../lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Dashboard financeiro do ZCheck Core: funil de vendas, trials, assinaturas,
// MRR e projeção com base em adoção. Fontes: companies (billing), a view
// admin_company_health (uso) e waitlist/signups (topo do funil).
//
// Projeção — regra simples e declarada (sem IA): probabilidade de conversão
// por engajamento no trial (checklists nos últimos 7 dias):
//   ≥10 → 60% · 1–9 → 30% · 0 → 5%
// aplicada ao preço do tier que comporta as unidades da empresa.
const CONVERSION = { high: 0.6, some: 0.3, none: 0.05 };

export async function GET(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const [companies, health, waitlist, signups] = await Promise.all([
    db.from('companies').select('id, name, slug, active, plan, plan_tier, unit_limit, subscription_status, trial_ends_at, current_period_end, onboarded_at'),
    db.from('admin_company_health').select('*'),
    db.from('waitlist').select('id', { count: 'exact', head: true }),
    // A tabela signups pode ainda não existir em produção (branch self-service) —
    // se a consulta falhar, o funil apenas omite essa etapa.
    db.from('signups').select('id', { count: 'exact', head: true }),
  ]);
  if (companies.error || health.error) {
    const msg = (companies.error || health.error).message;
    console.error('finance query falhou:', msg);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: msg }, 502);
  }

  const healthById = new Map(health.data.map(h => [h.company_id, h]));
  const now = Date.now();

  let mrr = 0;
  let projectedAdd = 0;
  const rows = companies.data.map(c => {
    const h = healthById.get(c.id) || {};
    const b = billingState(c, now);
    const monthly = b.state === 'active' ? monthlyValueFor(c) : 0; // cortesia/custom → 0
    mrr += monthly;

    // Projeção: só trials em andamento contam.
    let projection = null;
    if (b.state === 'trialing') {
      const use7 = h.completions_7d || 0;
      const p = use7 >= 10 ? CONVERSION.high : use7 >= 1 ? CONVERSION.some : CONVERSION.none;
      // Projeção conservadora: valor do plano anual (o herói) para as lojas atuais.
      const target = priceForUnits(Math.max(1, h.units || 1));
      projection = { probability: p, tier: 'anual', value: target.monthlyTotal };
      projectedAdd += p * target.monthlyTotal;
    }

    return {
      company_id: c.id,
      name: c.name || c.id,
      slug: c.slug,
      active: c.active,
      state: b.state,                                  // active | trialing | expired
      subscription_status: c.subscription_status,
      plan_tier: c.plan_tier,
      monthly,
      trial_ends_at: c.trial_ends_at,
      trial_days_left: b.state === 'trialing' ? b.daysLeft : null,
      current_period_end: c.current_period_end,
      onboarded: !!c.onboarded_at,
      units: h.units || 0,
      users: h.users || 0,
      completions_7d: h.completions_7d || 0,
      completions_30d: h.completions_30d || 0,
      last_activity: h.last_activity || null,
      projection,
    };
  });

  const paying = rows.filter(r => r.state === 'active' && r.monthly > 0);
  const courtesy = rows.filter(r => r.state === 'active' && r.monthly === 0 && r.subscription_status === 'active');
  const trialing = rows.filter(r => r.state === 'trialing');
  const expired = rows.filter(r => r.state === 'expired');
  const canceled = rows.filter(r => r.subscription_status === 'canceled');
  const pastDue = rows.filter(r => r.subscription_status === 'past_due');

  // Conversão histórica aproximada: quem pagou ÷ (quem pagou + trial que venceu sem pagar).
  const decided = paying.length + expired.length;

  const funnel = [
    ...(waitlist.error ? [] : [{ stage: 'Waitlist (leads)', value: waitlist.count || 0 }]),
    ...(signups.error ? [] : [{ stage: 'Cadastros iniciados', value: signups.count || 0 }]),
    { stage: 'Empresas criadas', value: rows.length },
    { stage: 'Onboarding concluído', value: rows.filter(r => r.onboarded).length },
    { stage: 'Em uso (checklists 7d)', value: rows.filter(r => r.completions_7d > 0).length },
    { stage: 'Trial em andamento', value: trialing.length },
    { stage: 'Assinantes pagantes', value: paying.length },
  ];

  return jsonNoStore({
    ok: true,
    generatedAt: new Date().toISOString(),
    kpis: {
      mrr,
      arr: mrr * 12,
      payingCount: paying.length,
      courtesyCount: courtesy.length,
      trialingCount: trialing.length,
      expiredCount: expired.length,
      canceledCount: canceled.length,
      pastDueCount: pastDue.length,
      conversionRate: decided > 0 ? Math.round((paying.length / decided) * 100) : null,
      projectedMrr30d: Math.round(mrr + projectedAdd),
      projectedAdd: Math.round(projectedAdd),
    },
    funnel,
    companies: rows.sort((a, b) =>
      (b.monthly - a.monthly) ||
      (b.state === 'trialing') - (a.state === 'trialing') ||
      (b.completions_30d - a.completions_30d)),
    tiers: [
      { id: 'anual', label: 'Anual (12 meses no cartão)', perUnit: PRICE_PER_UNIT.annual },
      { id: 'mensal', label: 'Mensal (sem fidelidade)', perUnit: PRICE_PER_UNIT.monthly },
    ],
  });
}
