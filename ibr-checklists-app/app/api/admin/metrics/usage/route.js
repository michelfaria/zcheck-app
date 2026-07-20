import { adminGuard, jsonNoStore, spDaysAgo } from '../../../../../lib/adminApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Uso Operacional: séries por dia/unidade, conclusão × abandono, heatmap
// dia×hora, itens mais falhados, ranking de unidades e usuários, uso por
// setor e por tipo de checklist.
export async function GET(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const since30 = spDaysAgo(30);

  const [daily, funnel, sectors, templates, types, heatmap, failed, units, ranking] =
    await Promise.all([
      db.from('admin_completions_daily').select('*').gte('day', since30).limit(5000),
      db.from('admin_exec_funnel_daily').select('*').gte('day', since30).limit(3000),
      db.from('admin_sector_usage').select('*').limit(3000),
      db.from('admin_template_usage').select('*').limit(3000),
      db.from('checklist_types').select('id, company_id, name').limit(1000),
      db.from('admin_completion_heatmap').select('*').limit(3000),
      db.from('admin_failed_items').select('*').order('missed', { ascending: false }).limit(20),
      db.from('admin_unit_health').select('*'),
      db.from('admin_user_ranking').select('*').order('completions_30d', { ascending: false }).limit(20),
    ]);

  const firstErr = [daily, funnel, sectors, templates, types, heatmap, failed, units, ranking]
    .find(r => r.error);
  if (firstErr) {
    console.error('usage query falhou:', firstErr.error.message);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: firstErr.error.message }, 502);
  }

  // ── Série diária: total e por unidade ─────────────────────────────────────
  const byDay = new Map();
  for (let i = 30; i >= 0; i--) byDay.set(spDaysAgo(i), { day: spDaysAgo(i), total: 0 });
  for (const r of daily.data) {
    const key = typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day);
    const row = byDay.get(key);
    if (!row) continue;
    row.total += r.completions;
    if (r.unit_id) row[r.unit_id] = (row[r.unit_id] || 0) + r.completions;
  }

  // ── Conclusão × abandono (dos events; só cobre pós-instrumentação) ────────
  const funnelByDay = new Map();
  for (let i = 30; i >= 0; i--) funnelByDay.set(spDaysAgo(i), { day: spDaysAgo(i), started: 0, completed: 0 });
  let secNum = 0, secDen = 0;
  for (const r of funnel.data) {
    const key = typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day);
    const row = funnelByDay.get(key);
    if (!row) continue;
    row.started += r.started || 0;
    row.completed += r.completed || 0;
    if (r.avg_seconds != null && r.completed) { secNum += r.avg_seconds * r.completed; secDen += r.completed; }
  }

  // ── Tipo de checklist: mesma regra do app (nome contém o nome do tipo) ────
  const byType = {};
  for (const t of templates.data) {
    const companyTypes = types.data.filter(x => x.company_id === t.company_id);
    const match = companyTypes.find(x =>
      (t.template_name || '').toLowerCase().includes((x.name || '').toLowerCase()));
    const label = match ? match.name : 'Outros';
    byType[label] = (byType[label] || 0) + t.completions;
  }

  // ── Heatmap: matriz 7×24 agregada cross-tenant ────────────────────────────
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of heatmap.data) {
    if (r.dow >= 0 && r.dow < 7 && r.hour >= 0 && r.hour < 24) grid[r.dow][r.hour] += r.completions;
  }

  return jsonNoStore({
    ok: true,
    generatedAt: new Date().toISOString(),
    dailySeries: [...byDay.values()],
    execFunnel: {
      series: [...funnelByDay.values()],
      avgSeconds: secDen ? Math.round(secNum / secDen) : null,
    },
    sectors: sectors.data.sort((a, b) => b.completions - a.completions),
    templates: templates.data.sort((a, b) => b.completions - a.completions).slice(0, 20),
    byType: Object.entries(byType).map(([name, completions]) => ({ name, completions }))
      .sort((a, b) => b.completions - a.completions),
    heatmap: grid,
    failedItems: failed.data,
    unitRanking: units.data
      .map(u => ({ ...u }))
      .sort((a, b) => (b.completions_30d || 0) - (a.completions_30d || 0)),
    userRanking: ranking.data,
  });
}
