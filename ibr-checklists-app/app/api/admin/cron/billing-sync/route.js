import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../../../../../lib/supabase';
import { syncDecision } from '../../../../../lib/seats';
import { loadQuota, writeAccount, applySubscriptionAmount } from '../../../../../lib/billingServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Reconciliação diária do valor das assinaturas (Vercel Cron às 8h de
// Brasília — 11:00 UTC, ver vercel.json; uma hora antes do cron de alertas,
// para o alerta de ajuste pendente já sair com o estado do dia).
//
// Por que existe: a cobrança acompanha as lojas ATIVAS (Termos) e as vagas
// CONTRATADAS, mas loja nova, loja desativada e loja que estreia
// (`active_from`) mudam a conta sem passar por nenhuma rota de billing. Para
// cada empresa com assinatura ativa:
//   esperado = priceForUnits(lojas ativas, ciclo, vagas adicionais).monthlyCharge
// e, se ≠ billed_amount, applySubscriptionAmount: PUT no MP com a flag
// MP_ADJUST_ENABLED ligada, ou adjust_pending (→ alerta R8) com ela desligada.
// Vale da próxima fatura, sem pró-rata.
//
// Idempotente: com tudo em dia não escreve nada; com a flag desligada, marcar
// pendente de novo não muda nada. `?dry=1` só calcula e devolve o que faria —
// sem escrita no banco e sem chamada ao MP (mesmo padrão do notify-overdue).
//
// Auth: igual ao cron de alertas — o Vercel manda `Authorization: Bearer
// ${CRON_SECRET}`; o portão de cookie do middleware não cobre esta rota
// (ADMIN_PUBLIC), por isso o segredo próprio.
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cronSecret || !serviceKey) {
    console.error('CRON_SECRET ou SUPABASE_SERVICE_ROLE_KEY ausente — cron de billing-sync desabilitado.');
    return Response.json({ ok: false, reason: 'server_misconfigured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
  }

  const dry = new URL(request.url).searchParams.get('dry') === '1';
  const db = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await syncAll(db, { dry });
    return Response.json({ ok: true, dry, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('cron de billing-sync falhou:', e.message);
    return Response.json({ ok: false, reason: 'run_failed', message: e.message }, { status: 502 });
  }
}

async function syncAll(db, { dry }) {
  // Só assinatura ativa com preapproval tem valor a ajustar no MP.
  const { data: companies, error: coErr } = await db.from('companies')
    .select('id, name, subscription_status, plan_tier, unit_limit, current_period_end, mp_preapproval_id')
    .eq('subscription_status', 'active')
    .not('mp_preapproval_id', 'is', null);
  if (coErr) throw new Error(coErr.message);

  const ids = (companies || []).map(c => c.id);
  const summary = {
    checked: ids.length, in_sync: 0, adjusted: 0, pending: 0, exempt: 0,
    unknown_cycle: 0, over_limit: 0, errors: 0, companies: [],
  };
  if (!ids.length) return summary;

  const [accounts, intents] = await Promise.all([
    db.from('billing_accounts').select('*').in('company_id', ids),
    db.from('billing_checkouts').select('*').in('mp_preapproval_id', (companies || []).map(c => String(c.mp_preapproval_id))),
  ]);
  // Sem billing_accounts não há vaga contratada nem valor registrado para
  // comparar — melhor parar com erro claro do que "ajustar" todo mundo.
  if (accounts.error) throw new Error(`billing_accounts: ${accounts.error.message}`);
  const accountById = new Map((accounts.data || []).map(a => [a.company_id, a]));
  const intentByPre = new Map((intents.data || []).map(i => [String(i.mp_preapproval_id), i]));

  // Uma empresa que falha (exceção no MP ou no banco) conta em `errors` e o
  // laço segue: antes, uma exceção derrubava a rodada inteira (502) e todas
  // as empresas depois dela ficavam sem reconciliação — todo dia, enquanto o
  // MP falhasse para aquela uma.
  for (const company of companies) {
    const row = { company_id: company.id, name: company.name || company.id };
    try {
      await syncOne(db, { company, accountById, intentByPre, summary, row, dry });
    } catch (e) {
      console.error('billing-sync: empresa falhou:', company.id, e?.message || e);
      summary.errors += 1;
      summary.companies.push({ ...row, action: 'error', reason: 'exception', message: e?.message || String(e) });
    }
  }
  return summary;
}

async function syncOne(db, { company, accountById, intentByPre, summary, row, dry }) {
  const account = accountById.get(company.id)
    || { company_id: company.id, exempt: false, extra_seats: 0, billed_amount: null, adjust_pending: false };

  const q = await loadQuota(db, company.id);
  if (q.error) {
    summary.errors += 1;
    summary.companies.push({ ...row, action: 'error', reason: q.error });
    return;
  }

  const d = syncDecision({
    company, account, quota: q.quota, intent: intentByPre.get(String(company.mp_preapproval_id)),
  });
  Object.assign(row, {
    active_units: q.quota.active_units, extra_seats: account.extra_seats || 0,
    expected: d.expected ?? null, billed: d.billed ?? null, cycle: d.cycle ?? null,
  });

  if (d.action === 'exempt') { summary.exempt += 1; return; }
  if (d.action === 'no_subscription') return;

  if (d.action === 'in_sync') {
    summary.in_sync += 1;
    if (d.clearPending && !dry) await writeAccount(db, company.id, { adjust_pending: false });
    if (d.clearPending) summary.companies.push({ ...row, action: dry ? 'would_clear_pending' : 'cleared_pending' });
    return;
  }

  // Sem ciclo, ou acima de 50 lojas ativas (a tabela corta o preço em 50):
  // não há valor certo a aplicar — pendente, e o R8 leva a uma pessoa.
  if (d.action === 'unknown_cycle' || d.action === 'over_limit') {
    summary[d.action] += 1;
    if (!dry) await writeAccount(db, company.id, { adjust_pending: true });
    summary.companies.push({ ...row, action: dry ? 'would_mark_pending' : 'pending', reason: d.action });
    return;
  }

  // d.action === 'adjust'
  if (dry) {
    summary.companies.push({ ...row, action: 'would_adjust' });
    return;
  }
  const r = await applySubscriptionAmount(db, {
    companyId: company.id, company, account,
    activeUnits: q.quota.active_units, extraSeats: account.extra_seats || 0,
  });
  if (r.adjusted) summary.adjusted += 1;
  else if (r.pending) summary.pending += 1;
  else summary.in_sync += 1;
  summary.companies.push({
    ...row, action: r.adjusted ? 'adjusted' : r.pending ? 'pending' : 'unchanged',
    amount: r.amount, reason: r.reason || null,
  });
}
