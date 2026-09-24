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

  const [units, daily, userCompletions, abandons, semCnpj, seats, accounts, probe] = await Promise.all([
    db.from('admin_unit_health').select('*'),
    db.from('admin_completions_daily').select('*').gte('day', spDaysAgo(9)).limit(5000),
    db.from('admin_user_completions').select('*').limit(5000),
    db.from('events').select('company_id, unit_id')
      .eq('event_type', 'checklist_abandoned')
      .gte('occurred_at', new Date(Date.now() - 24 * 36e5).toISOString())
      .limit(2000),
    // Empresas ativas sem CNPJ: cadastro incompleto — sem identidade fiscal
    // não há cobrança nem trava de trial. `is('cnpj', null)` só funciona depois
    // da migration; o erro é tolerado abaixo para o motor não parar.
    db.from('companies').select('id, name').is('cnpj', null).eq('active', true),
    // Vagas (migration 20260923_limite_usuarios): colunas novas da view e a
    // conta de cobrança. Antes da migration as duas consultas falham e R7/R8
    // simplesmente não rodam — como o R6 acima.
    db.from('admin_company_health')
      .select('company_id, name, active, subscription_status, active_users, included_seats, extra_seats, seat_capacity'),
    db.from('billing_accounts').select('company_id, exempt, adjust_pending'),
    // Última verificação ao vivo do assistente de suporte (R9). Fica em
    // agent_reports para não precisar de tabela própria.
    db.from('agent_reports').select('data_snapshot, created_at').eq('kind', 'support_probe')
      .order('created_at', { ascending: false }).limit(1),
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

  // ── R6: empresa ativa sem CNPJ (cadastro incompleto) ─────────────────────
  // Uma vez por semana por empresa: é pendência de cadastro, não incêndio.
  for (const c of semCnpj.data || []) {
    alerts.push({
      severity: 'info',
      rule: 'company_without_cnpj',
      company_id: c.id,
      message: `${c.name || c.id} está sem CNPJ cadastrado — sem identidade fiscal não há cobrança nem trava de teste.`,
      dedupe_key: `company_without_cnpj|${c.id}|w${weekKey}`,
    });
  }

  // ── R7: usuários ativos acima da capacidade de vagas ──────────────────────
  // A trava do banco impede ENTRAR acima da capacidade, mas não tira ninguém:
  // loja removida/desativada (ou que ainda não estreou) baixa a franquia com
  // todo mundo ativo. A empresa fica sem poder cadastrar nem reativar, e a
  // fatura está abaixo do uso. Semanal, como o R6. Isenta (cortesia) não conta.
  const accountById = new Map((accounts.error ? [] : accounts.data || []).map(a => [a.company_id, a]));
  const seatRows = seats.error ? [] : seats.data || [];
  const companyName = new Map(seatRows.map(s => [s.company_id, s.name || s.company_id]));
  const companyStatus = new Map(seatRows.map(s => [s.company_id, s.subscription_status ?? null]));
  for (const s of seatRows) {
    if (s.active === false || accountById.get(s.company_id)?.exempt) continue;
    // Nulo não é zero: capacidade ausente viraria "0 vagas" e alarme falso.
    if (s.active_users == null || s.seat_capacity == null) continue;
    const active = Number(s.active_users);
    const capacity = Number(s.seat_capacity);
    if (!Number.isFinite(active) || !Number.isFinite(capacity) || active <= capacity) continue;
    alerts.push({
      severity: 'warning',
      rule: 'seat_quota_exceeded',
      company_id: s.company_id,
      message: `${s.name || s.company_id} tem ${active} usuários ativos para ${capacity} vagas `
        + `(${s.included_seats} da franquia + ${s.extra_seats} adicionais) — provável loja removida ou desativada. `
        + 'Ninguém novo entra até suspender usuários ou contratar vagas.',
      dedupe_key: `seat_quota_exceeded|${s.company_id}|w${weekKey}`,
    });
  }

  // ── R8: ajuste de valor da assinatura pendente no Mercado Pago ────────────
  // Vagas contratadas ou lojas ativas mudaram numa assinatura ativa e o valor
  // no MP não acompanhou: flag MP_ADJUST_ENABLED desligada, PUT que falhou ou
  // ciclo desconhecido. O cliente paga diferente do contratado até alguém agir.
  // Só assinatura ATIVA: o billing-sync só visita as ativas, então a pendência
  // de quem cancelou (ou entrou em atraso) nunca seria limpa, e o alerta
  // voltaria toda semana por uma assinatura que não cobra mais. Status
  // desconhecido (view sem a linha) não alerta — mesma regra do R7.
  for (const a of accounts.error ? [] : accounts.data || []) {
    if (!a.adjust_pending || a.exempt) continue;
    if (companyStatus.get(a.company_id) !== 'active') continue;
    alerts.push({
      severity: 'warning',
      rule: 'billing_adjust_pending',
      company_id: a.company_id,
      message: `${companyName.get(a.company_id) || a.company_id}: o valor da assinatura no Mercado Pago precisa `
        + 'ser ajustado (vagas ou lojas ativas mudaram) — MP_ADJUST_ENABLED desligada ou o ajuste falhou. '
        + 'Veja o billing-sync.',
      dedupe_key: `billing_adjust_pending|${a.company_id}|w${weekKey}`,
    });
  }

  // ── R9: assistente de suporte (Zeca) fora do ar ──────────────────────────
  // Sem chave, a rota pública /api/ajuda/assistente devolve 503 para TODO
  // usuário que perguntar — o cliente vê "assistente indisponível" e ninguém
  // fica sabendo. A verificação ao vivo (probe) é o que distingue "chave
  // existe" de "chave funciona": crédito zerado só aparece numa chamada real.
  // Probe com mais de 48h é ignorado (dado velho não vira alerta de hoje).
  if (!process.env.ANTHROPIC_API_KEY) {
    alerts.push({
      severity: 'critical',
      rule: 'support_agent_down',
      message: 'O assistente da Central de Ajuda (Zeca) está inativo: ANTHROPIC_API_KEY ausente. '
        + 'Toda pergunta de usuário recebe "assistente indisponível".',
      dedupe_key: `support_agent_down|no_key|${today}`,
    });
  } else if (!probe.error && probe.data?.[0]) {
    const last = probe.data[0];
    const snap = last.data_snapshot || {};
    if (snap.ok === false && hoursAgo(last.created_at) <= 48) {
      alerts.push({
        severity: 'critical',
        rule: 'support_agent_down',
        message: `O assistente da Central de Ajuda (Zeca) falhou na última verificação: ${String(snap.error || 'erro desconhecido').slice(0, 200)}`,
        dedupe_key: `support_agent_down|probe|${today}`,
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
