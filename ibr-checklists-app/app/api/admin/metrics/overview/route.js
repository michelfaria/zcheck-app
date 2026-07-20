import { adminGuard, jsonNoStore, spDaysAgo } from '../../../../../lib/adminApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Visão Geral do ZCheck Core: north star (conclusões/dia), KPIs do dia, saúde
// por empresa/unidade e feed de eventos recentes. Uma chamada por poll (30s).
export async function GET(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const since30 = spDaysAgo(30);
  const since7 = spDaysAgo(7);
  const today = spDaysAgo(0);

  const [daily, windowRows, companies, units, feed, funnel] = await Promise.all([
    db.from('admin_completions_daily').select('*').gte('day', since30).limit(5000),
    db.from('admin_active_users_window').select('*'),
    db.from('admin_company_health').select('*'),
    db.from('admin_unit_health').select('*'),
    db.from('admin_recent_events').select('*').limit(30),
    db.from('admin_exec_funnel_daily').select('*').gte('day', since7).limit(2000),
  ]);

  const firstErr = [daily, windowRows, companies, units, feed, funnel].find(r => r.error);
  if (firstErr) {
    console.error('overview query falhou:', firstErr.error.message);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: firstErr.error.message }, 502);
  }

  // Série do north star: soma cross-tenant por dia (30 dias, dias vazios = 0).
  const byDay = new Map();
  for (let i = 30; i >= 0; i--) byDay.set(spDaysAgo(i), 0);
  let completionsToday = 0;
  let rateNum = 0, rateDen = 0, rate7Num = 0, rate7Den = 0;
  for (const r of daily.data) {
    const key = typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day);
    if (byDay.has(key)) byDay.set(key, byDay.get(key) + r.completions);
    if (key === today) {
      completionsToday += r.completions;
      if (r.avg_rate != null) { rateNum += r.avg_rate * r.completions; rateDen += r.completions; }
    }
    if (key >= since7 && r.avg_rate != null) { rate7Num += r.avg_rate * r.completions; rate7Den += r.completions; }
  }
  const series = [...byDay.entries()].map(([day, completions]) => ({ day, completions }));

  const dauToday = windowRows.data.reduce((s, r) => s + (r.dau_today || 0), 0);
  const wau = windowRows.data.reduce((s, r) => s + (r.wau || 0), 0);

  // Tempo médio de execução (7d) — dos pares started→completed dos events.
  let secNum = 0, secDen = 0, started7 = 0, completed7 = 0;
  for (const r of funnel.data) {
    started7 += r.started || 0;
    completed7 += r.completed || 0;
    if (r.avg_seconds != null && r.completed) { secNum += r.avg_seconds * r.completed; secDen += r.completed; }
  }

  const now = Date.now();
  const health = t => {
    if (!t) return 'never';
    const h = (now - new Date(t).getTime()) / 36e5;
    return h < 24 ? 'green' : h <= 72 ? 'yellow' : 'red';
  };

  return jsonNoStore({
    ok: true,
    generatedAt: new Date().toISOString(),
    northStar: { today: completionsToday, series },
    kpis: {
      dauToday,
      wau,
      activeCompanies: companies.data.filter(c => c.completions_7d > 0).length,
      totalCompanies: companies.data.length,
      activeUnits: units.data.filter(u => u.completions_7d > 0).length,
      totalUnits: units.data.length,
      completionRateToday: rateDen ? Math.round(rateNum / rateDen) : null,
      completionRate7d: rate7Den ? Math.round(rate7Num / rate7Den) : null,
      avgExecSeconds: secDen ? Math.round(secNum / secDen) : null,
      started7d: started7,
      completed7d: completed7,
    },
    companies: companies.data
      .map(c => ({ ...c, health: health(c.last_activity) }))
      .sort((a, b) => (b.completions_7d || 0) - (a.completions_7d || 0)),
    units: units.data
      .map(u => ({ ...u, health: health(u.last_completion) }))
      .sort((a, b) => (b.completions_7d || 0) - (a.completions_7d || 0)),
    feed: feed.data,
  });
}
