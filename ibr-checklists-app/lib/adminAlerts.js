import { spDaysAgo } from './adminApi';

// Motor de alertas do ZCheck Core — regras SEM IA, avaliadas sobre as views
// admin_* com a service_role. Chamado pelo cron (backstop diário) e pela rota
// de listagem quando a última execução tem mais de STALE_MINUTES.
//
// Cada alerta tem um dedupe_key com a janela de tempo embutida (dia ou
// semana): rodar o avaliador 10× no mesmo dia não duplica nada, e um alerta
// resolvido só pode renascer na janela seguinte.

export const STALE_MINUTES = 65;

const hoursAgo = ts => (Date.now() - new Date(ts).getTime()) / 36e5;
const dayKey = r => (typeof r === 'string' ? r.slice(0, 10) : String(r));

export async function runAlertRules(db) {
  const today = spDaysAgo(0);
  const yesterday = spDaysAgo(1);
  const weekKey = Math.floor(Date.parse(today) / (7 * 864e5)); // janela semanal p/ regra 4

  const [units, daily, userCompletions, abandons] = await Promise.all([
    db.from('admin_unit_health').select('*'),
    db.from('admin_completions_daily').select('*').gte('day', spDaysAgo(9)).limit(5000),
    db.from('admin_user_completions').select('*').limit(5000),
    db.from('events').select('company_id, unit_id')
      .eq('event_type', 'checklist_abandoned')
      .gte('occurred_at', new Date(Date.now() - 24 * 36e5).toISOString())
      .limit(2000),
  ]);
  const firstErr = [units, daily, userCompletions, abandons].find(r => r.error);
  if (firstErr) throw new Error(firstErr.error.message);

  const unitName = new Map(units.data.map(u => [u.unit_id, u.name || u.unit_id]));
  const alerts = [];

  // ── R1: unidade sem checklists há 24h (crítico a partir de 72h) ───────────
  // Unidade que nunca produziu não alerta — é onboarding, não parada.
  for (const u of units.data) {
    if (!u.last_completion || !u.completions_30d) continue;
    const h = hoursAgo(u.last_completion);
    if (h >= 24) {
      alerts.push({
        severity: h >= 72 ? 'critical' : 'warning',
        rule: 'unit_inactive',
        company_id: u.company_id, unit_id: u.unit_id,
        message: `${u.name || u.unit_id} está sem checklists há ${Math.floor(h)}h.`,
        dedupe_key: `unit_inactive|${u.unit_id}|${today}`,
      });
    }
  }

  // ── R2: queda >30% ontem vs média dos 7 dias anteriores (por empresa) ─────
  const byCompanyDay = new Map();
  for (const r of daily.data) {
    const key = r.company_id || '?';
    if (!byCompanyDay.has(key)) byCompanyDay.set(key, new Map());
    const m = byCompanyDay.get(key);
    const d = dayKey(r.day);
    m.set(d, (m.get(d) || 0) + r.completions);
  }
  for (const [companyId, days] of byCompanyDay) {
    const y = days.get(yesterday) || 0;
    let sum = 0;
    for (let i = 2; i <= 8; i++) sum += days.get(spDaysAgo(i)) || 0;
    const avg7 = sum / 7;
    if (avg7 >= 3 && y < avg7 * 0.7) {
      const drop = Math.round((1 - y / avg7) * 100);
      alerts.push({
        severity: y < avg7 * 0.5 ? 'critical' : 'warning',
        rule: 'volume_drop',
        company_id: companyId,
        message: `Queda de ${drop}% nos checklists de ontem (${y}) vs média de 7 dias (${avg7.toFixed(1)}).`,
        dedupe_key: `volume_drop|${companyId}|${yesterday}`,
      });
    }
  }

  // ── R3: taxa de conclusão <70% hoje, por unidade (mínimo 3 checklists) ────
  const rateByUnit = new Map();
  for (const r of daily.data) {
    if (dayKey(r.day) !== today || !r.unit_id || r.avg_rate == null) continue;
    if (!rateByUnit.has(r.unit_id)) rateByUnit.set(r.unit_id, { company: r.company_id, num: 0, den: 0 });
    const u = rateByUnit.get(r.unit_id);
    u.num += r.avg_rate * r.completions;
    u.den += r.completions;
  }
  for (const [unitId, { company, num, den }] of rateByUnit) {
    if (den < 3) continue;
    const rate = Math.round(num / den);
    if (rate < 70) {
      alerts.push({
        severity: rate < 50 ? 'critical' : 'warning',
        rule: 'low_completion_rate',
        company_id: company, unit_id: unitId,
        message: `Taxa de conclusão de ${rate}% hoje em ${unitName.get(unitId) || unitId} (${den} checklists).`,
        dedupe_key: `low_completion_rate|${unitId}|${today}`,
      });
    }
  }

  // ── R4: usuário ativado (5+) sumido há 7–30 dias — 1 alerta por semana ────
  for (const u of userCompletions.data) {
    if (u.completions < 5 || !u.last_completion) continue;
    const h = hoursAgo(u.last_completion);
    if (h >= 7 * 24 && h <= 30 * 24) {
      alerts.push({
        severity: 'info',
        rule: 'activated_user_gone',
        company_id: u.company_id, user_id: u.user_id,
        message: `Usuário ativado (${u.completions} checklists) sem atividade há ${Math.floor(h / 24)} dias.`,
        dedupe_key: `activated_user_gone|${u.company_id}|${u.user_id}|w${weekKey}`,
      });
    }
  }

  // ── R5: 3+ abandonos na mesma unidade em 24h ──────────────────────────────
  const abandonByUnit = new Map();
  for (const r of abandons.data) {
    if (!r.unit_id) continue;
    const cur = abandonByUnit.get(r.unit_id) || { company: r.company_id, n: 0 };
    cur.n += 1;
    abandonByUnit.set(r.unit_id, cur);
  }
  for (const [unitId, { company, n }] of abandonByUnit) {
    if (n >= 3) {
      alerts.push({
        severity: 'warning',
        rule: 'abandon_streak',
        company_id: company, unit_id: unitId,
        message: `${n} checklists abandonados em 24h em ${unitName.get(unitId) || unitId}.`,
        dedupe_key: `abandon_streak|${unitId}|${today}`,
      });
    }
  }

  // ── Grava (ignorando janelas já alertadas) + registra a execução ──────────
  let created = 0;
  if (alerts.length > 0) {
    const { data, error } = await db.from('admin_alerts')
      .upsert(alerts, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(error.message);
    created = data?.length || 0;
  }
  await db.from('admin_alert_runs').insert({ created });
  return { evaluated: alerts.length, created };
}

// Reavalia se a última execução for mais velha que STALE_MINUTES.
export async function runIfStale(db) {
  const { data } = await db.from('admin_alert_runs')
    .select('ran_at').order('ran_at', { ascending: false }).limit(1);
  const last = data?.[0]?.ran_at;
  if (last && (Date.now() - new Date(last).getTime()) / 6e4 < STALE_MINUTES) {
    return { skipped: true, lastRun: last };
  }
  const result = await runAlertRules(db);
  return { skipped: false, lastRun: new Date().toISOString(), ...result };
}
