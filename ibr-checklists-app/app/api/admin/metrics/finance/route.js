import { adminGuard, jsonNoStore } from '../../../../../lib/adminApi';
import {
  priceForUnits, monthlyValueFor, PRICE_PER_UNIT, billingState, extraSeatsInUse,
  INCLUDED_USERS_PER_UNIT, EXTRA_USER_PRICE,
} from '../../../../../lib/plans';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Dashboard financeiro do ZCheck Core: funil de vendas, trials, assinaturas,
// MRR e projeção com base em adoção. Fontes: companies (billing), a view
// admin_company_health (uso) e waitlist/signups (topo do funil).
//
// Projeção — regra simples e declarada (sem IA): probabilidade de conversão
// por engajamento no trial (checklists nos últimos 7 dias):
//   ≥10 → 60% · 1–9 → 30% · 0 → 5%
// aplicada ao valor do plano anual para as lojas ativas + as vagas adicionais
// que a empresa já contratou ou já usa (o checkout cobra o maior dos dois).
//
// MRR (23/09/2026): monthlyValueFor(company, account) — o valor que o Mercado
// Pago cobra de fato (billing_accounts.billed_amount, já com as vagas
// adicionais). O cálculo por plan_tier × unit_limit só entra para conta sem
// valor registrado, e não enxerga vaga.
const CONVERSION = { high: 0.6, some: 0.3, none: 0.05 };

export async function GET(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const [companies, health, waitlist, signups, accounts] = await Promise.all([
    db.from('companies').select('id, name, slug, active, plan, plan_tier, unit_limit, subscription_status, trial_ends_at, current_period_end, onboarded_at'),
    db.from('admin_company_health').select('*'),
    db.from('waitlist').select('id', { count: 'exact', head: true }),
    // A tabela signups pode ainda não existir em produção (branch self-service) —
    // se a consulta falhar, o funil apenas omite essa etapa.
    db.from('signups').select('id', { count: 'exact', head: true }),
    // Conta de cobrança (vagas contratadas + valor real no MP). Antes da
    // migration 20260923 a tabela não existe: o MRR cai no cálculo legado.
    db.from('billing_accounts').select('*'),
  ]);
  if (companies.error || health.error) {
    const msg = (companies.error || health.error).message;
    console.error('finance query falhou:', msg);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: msg }, 502);
  }

  const healthById = new Map(health.data.map(h => [h.company_id, h]));
  const accountById = new Map((accounts.error ? [] : accounts.data || []).map(a => [a.company_id, a]));
  const now = Date.now();

  let mrr = 0;
  let projectedAdd = 0;
  const rows = companies.data.map(c => {
    const h = healthById.get(c.id) || {};
    const acc = accountById.get(c.id) || null;
    const b = billingState(c, now);
    const exempt = acc?.exempt === true;
    // Cortesia/isenta → 0 mesmo que haja valor antigo registrado.
    const monthly = b.state === 'active' && !exempt ? monthlyValueFor(c, acc) : 0;
    mrr += monthly;

    // Vagas: contadas pela view (não suspensos; lojas ativas que já estrearam).
    // Sem as colunas novas (migration pendente) o bloco fica nulo e a tela some.
    const hasSeats = h.active_users != null && h.seat_capacity != null;
    const activeUnits = h.active_units_billable ?? h.units ?? 0;
    const inUseExtra = hasSeats ? extraSeatsInUse(h.active_users, activeUnits) : 0;
    const seats = hasSeats ? {
      active: Number(h.active_users),
      capacity: Number(h.seat_capacity),
      included: Number(h.included_seats),
      extra: Number(acc?.extra_seats ?? h.extra_seats ?? 0), // contratadas
      in_use_extra: inUseExtra,
      exempt,
    } : null;

    // Projeção: só trials em andamento contam.
    let projection = null;
    if (b.state === 'trialing') {
      const use7 = h.completions_7d || 0;
      const p = use7 >= 10 ? CONVERSION.high : use7 >= 1 ? CONVERSION.some : CONVERSION.none;
      // Projeção conservadora: plano anual (o herói) para as lojas ativas + as
      // vagas adicionais que o checkout vai cobrar (contratadas ou em uso).
      const extra = exempt ? 0 : Math.max(Number(acc?.extra_seats) || 0, inUseExtra);
      const target = priceForUnits(Math.max(1, activeUnits || 1), 'annual', extra);
      projection = { probability: p, tier: 'anual', value: target.monthlyTotal, extra_seats: extra };
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
      billed_cycle: acc?.billed_cycle || null,
      adjust_pending: acc?.adjust_pending === true,
      exempt,
      monthly,
      trial_ends_at: c.trial_ends_at,
      trial_days_left: b.state === 'trialing' ? b.daysLeft : null,
      current_period_end: c.current_period_end,
      onboarded: !!c.onboarded_at,
      units: h.units || 0,
      users: h.users || 0,
      seats,
      completions_7d: h.completions_7d || 0,
      completions_30d: h.completions_30d || 0,
      last_activity: h.last_activity || null,
      projection,
    };
  });

  const paying = rows.filter(r => r.state === 'active' && r.monthly > 0);
  const courtesy = rows.filter(r => r.state === 'active' && r.monthly === 0
    && (r.subscription_status === 'active' || r.exempt));
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
      // Vagas adicionais contratadas por quem paga — a parte "por usuário" do MRR.
      extraSeatsContracted: paying.reduce((s, r) => s + (r.seats?.extra || 0), 0),
      adjustPendingCount: rows.filter(r => r.adjust_pending).length,
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
    seatRule: { includedUsersPerUnit: INCLUDED_USERS_PER_UNIT, extraUserPrice: EXTRA_USER_PRICE },
  });
}
