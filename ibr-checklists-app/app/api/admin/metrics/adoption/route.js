import { adminGuard, jsonNoStore, spDaysAgo } from '../../../../../lib/adminApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Adoção: funil de ativação, retenção por coorte semanal, DAU/WAU/MAU e
// stickiness, instalações PWA e comparativo por empresa/unidade.
export async function GET(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const since30 = spDaysAgo(30);

  const [eventsDaily, activation, userCompletions, retention, dauSeries, windowRows, pwa, companies, units] =
    await Promise.all([
      db.from('admin_events_daily').select('*').gte('day', since30).limit(5000),
      db.from('admin_user_activation').select('*').limit(5000),
      db.from('admin_user_completions').select('*').limit(5000),
      db.from('admin_retention_weekly').select('*').limit(5000),
      db.from('admin_active_users_daily').select('*').gte('day', since30).limit(3000),
      db.from('admin_active_users_window').select('*'),
      db.from('admin_pwa').select('*'),
      db.from('admin_company_health').select('*'),
      db.from('admin_unit_health').select('*'),
    ]);

  const firstErr = [eventsDaily, activation, userCompletions, retention, dauSeries, windowRows, pwa, companies, units]
    .find(r => r.error);
  if (firstErr) {
    console.error('adoption query falhou:', firstErr.error.message);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: firstErr.error.message }, 502);
  }

  // ── Funil de ativação ─────────────────────────────────────────────────────
  // Código de empresa: contagem de eventos (o /entrar é pré-login, sem user).
  // Demais etapas: por usuário — comportamento dos events + histórico das
  // completions (que existe desde antes da instrumentação).
  const codeEntered = eventsDaily.data
    .filter(r => r.event_type === 'company_code_entered')
    .reduce((s, r) => s + r.events, 0);

  const completionsByUser = new Map(); // `${company}|${user}` → completions
  for (const r of userCompletions.data) {
    completionsByUser.set(`${r.company_id}|${r.user_id}`, r.completions);
  }
  const loggedIn = activation.data.filter(a => a.first_login).length;
  const startedUsers = activation.data.filter(a => a.first_started).length;
  const completed1 = userCompletions.data.filter(r => r.completions >= 1).length;
  const activated = userCompletions.data.filter(r => r.completions >= 5).length;

  // ── Retenção por coorte (agregada cross-tenant; drill por empresa no front) ─
  const cohorts = {};
  for (const r of retention.data) {
    const week = typeof r.cohort_week === 'string' ? r.cohort_week.slice(0, 10) : String(r.cohort_week);
    if (!cohorts[week]) cohorts[week] = {};
    cohorts[week][r.week_n] = (cohorts[week][r.week_n] || 0) + r.users;
  }

  // ── Série de DAU (30d, soma cross-tenant) ─────────────────────────────────
  const byDay = new Map();
  for (let i = 30; i >= 0; i--) byDay.set(spDaysAgo(i), 0);
  for (const r of dauSeries.data) {
    const key = typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day);
    if (byDay.has(key)) byDay.set(key, byDay.get(key) + r.dau);
  }

  const dauToday = windowRows.data.reduce((s, r) => s + (r.dau_today || 0), 0);
  const wau = windowRows.data.reduce((s, r) => s + (r.wau || 0), 0);
  const mau = windowRows.data.reduce((s, r) => s + (r.mau || 0), 0);

  return jsonNoStore({
    ok: true,
    generatedAt: new Date().toISOString(),
    funnel: [
      { stage: 'Código da empresa', value: codeEntered, note: 'entradas no /entrar (30d)' },
      { stage: 'Login', value: loggedIn, note: 'usuários que já logaram' },
      { stage: '1º checklist iniciado', value: startedUsers, note: 'usuários' },
      { stage: '1º checklist concluído', value: completed1, note: 'usuários' },
      { stage: 'Ativado (5+ concluídos)', value: activated, note: 'usuários' },
    ],
    cohorts,
    dauSeries: [...byDay.entries()].map(([day, dau]) => ({ day, dau })),
    kpis: {
      dauToday, wau, mau,
      stickiness: wau ? Math.round((dauToday / wau) * 100) : null,
      pwaInstalls: pwa.data.reduce((s, r) => s + (r.installs || 0), 0),
      pwaUsers7d: pwa.data.reduce((s, r) => s + (r.pwa_users_7d || 0), 0),
    },
    companies: companies.data.sort((a, b) => (b.completions_30d || 0) - (a.completions_30d || 0)),
    units: units.data.sort((a, b) => (b.completions_30d || 0) - (a.completions_30d || 0)),
  });
}
