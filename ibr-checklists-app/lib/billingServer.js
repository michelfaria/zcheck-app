// Peças compartilhadas pelas rotas /api/billing/* e pelo cron billing-sync.
// Server-only.

import { verifySessionToken } from './serverAuth';
import { serviceClient, json } from './signupServer';
import { priceForUnits } from './plans';
import {
  normalizeQuota, subscriptionAdjustable, billingCycleFor, sameAmount, overSelfServiceLimit,
  preapprovalInfo, latestRejectionAt,
} from './seats';
import { updatePreapprovalAmount, getPreapproval, mpConfigured } from './mercadopago';

export { serviceClient, json };

// Identifica a empresa do chamador pelo token de sessão (Authorization: Bearer).
// Retorna { companyId, userRole, userId } ou { error } ('server_misconfigured'|'unauthorized').
// `userId` é o users.id de quem chamou (claim `user_id`, igual ao `sub`) — vai
// para billing_seat_changes.changed_by como trilha de QUEM consentiu a cobrança.
export function authCompany(request) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return { error: 'server_misconfigured' };
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const claims = token ? verifySessionToken(token, { secret }) : null;
  if (!claims || !claims.company_id) return { error: 'unauthorized' };
  return {
    companyId: claims.company_id,
    userRole: claims.user_role,
    userId: claims.user_id ?? claims.sub ?? null,
  };
}

/**
 * O papel no token vale 7 dias (SESSION_TTL_SECONDS) e só o /api/auth/refresh
 * relê `users`. Para o que CUSTA dinheiro — contratar/reduzir vagas, assinar,
 * cancelar — o papel é conferido de novo no banco: diretoria rebaixada,
 * suspensa ou apagada não contrata nada com o token velho, e o `changed_by` da
 * trilha do consentimento é de quem ainda é diretoria.
 * Retorna null quando pode seguir, ou { status, reason } para responder.
 */
export async function requireGestao(supabase, auth) {
  if (auth?.userRole !== 'gestao' || !auth?.userId) return { status: 403, reason: 'forbidden' };
  const { data, error } = await supabase.from('users')
    .select('role, suspended')
    .eq('id', String(auth.userId)).eq('company_id', auth.companyId)
    .maybeSingle();
  if (error) {
    console.error('requireGestao: leitura de users falhou:', auth.companyId, error.message);
    return { status: 502, reason: 'query_failed' };
  }
  if (!data || data.role !== 'gestao' || data.suspended) return { status: 403, reason: 'forbidden' };
  return null;
}

/**
 * A preapproval é DESTA empresa? A fonte é o próprio MP (`external_reference`,
 * gravado por nós no checkout) — nunca `companies.mp_preapproval_id`, que o
 * tenant escreve: a policy `companies_tenant_rw` é FOR ALL e o anon lê o id
 * das outras empresas. Sem esta conferência, um token de A que gravasse em
 * `companies` o id da assinatura de B faria o servidor repreçar (PUT) ou
 * cancelar a assinatura de B.
 * Retorna { ok: true, owned, status, info } (info = preapprovalInfo: datas de
 * criação, última cobrança e próxima fatura) ou { ok: false, notFound, httpStatus }.
 */
export async function preapprovalOwnership(preId, companyId) {
  const r = await getPreapproval(String(preId));
  if (!r.ok) return { ok: false, notFound: r.status === 404, httpStatus: r.status };
  return {
    ok: true,
    owned: !!companyId && String(r.body?.external_reference ?? '') === String(companyId),
    status: r.body?.status ?? null,
    info: preapprovalInfo(r.body),
  };
}

/**
 * Quando o webhook registrou a última RECUSA de pagamento desta preapproval
 * (billing_events 'payment_rejected', gravado por /api/billing/webhook).
 * É a prova de atraso que o checkout usa — `subscription_status` é cache.
 * Retorna { at } (epoch ms ou null) ou { error }.
 */
export async function lastRejectionFor(supabase, companyId, preId) {
  const { data, error } = await supabase.from('billing_events')
    .select('mp_id, created_at')
    .eq('mp_type', 'payment_rejected').eq('company_id', companyId)
    .order('created_at', { ascending: false }).limit(100);
  if (error) return { error };
  return { at: latestRejectionAt(data || [], String(preId)) };
}

/**
 * Muda as vagas adicionais contratadas pela RPC `set_extra_seats` (migration
 * 20260923, seção 8): conta, valida e grava sob o MESMO advisory lock do
 * trigger, com a trilha em billing_seat_changes na mesma transação. Ler a cota
 * aqui e gravar depois deixava uma janela em que um usuário novo entrava contra
 * a capacidade antiga e a redução o deixava sem vaga.
 * Retorna o jsonb da RPC ({ ok, reason?, min?, current?, exempt?, changed,
 * from, to }) ou { ok: false, reason: 'quota_unavailable'|'query_failed' }.
 */
export async function setExtraSeatsAtomic(supabase, { companyId, to, expected = null, changedBy = null, source = 'app' }) {
  const { data, error } = await supabase.rpc('set_extra_seats', {
    p_company_id: companyId,
    p_to: to,
    p_expected: expected,
    p_changed_by: changedBy != null ? String(changedBy) : null,
    p_source: source,
  });
  if (error) {
    console.error('set_extra_seats falhou:', companyId, error.code, error.message);
    return { ok: false, reason: isMissing(error) ? 'quota_unavailable' : 'query_failed' };
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'query_failed' };
  return data;
}

// Base absoluta para back_url/redirect. Prefere env; senão deriva do host.
export function siteUrl(request) {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, '');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host');
  return `${proto}://${host}`;
}

// O ajuste de valor no MP fica atrás de flag até o PUT ser testado no sandbox.
// Desligada, a mudança é registrada como pendente (billing_accounts.adjust_pending)
// e vira alerta no Core (R8) — ninguém é cobrado errado em silêncio.
export const adjustEnabled = () => process.env.MP_ADJUST_ENABLED === '1';

// Função/tabela da migration 20260923_limite_usuarios ainda não aplicada. A
// migration é colada à mão no SQL Editor, então o código pode chegar antes.
const MISSING_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01']);
const isMissing = (err) => !!err && MISSING_CODES.has(err.code);

// Conta ainda sem linha em billing_accounts (empresa criada depois do
// backfill): vale como não isenta e sem vaga adicional. Quem escreve faz upsert.
const emptyAccount = (companyId) => ({
  company_id: companyId, exempt: false, extra_seats: 0,
  billed_units: null, billed_extra_seats: null, billed_amount: null, billed_cycle: null,
  adjust_pending: false,
});

const COMPANY_COLS = 'id, name, subscription_status, plan_tier, unit_limit, current_period_end, mp_preapproval_id, trial_ends_at';

/** Só a cota (jsonb de company_user_quota), normalizada. { quota } | { error, detail } */
export async function loadQuota(supabase, companyId) {
  const { data, error } = await supabase.rpc('company_user_quota', { p_company_id: companyId });
  if (error) {
    return { error: isMissing(error) ? 'quota_unavailable' : 'query_failed', detail: error.message };
  }
  const quota = normalizeQuota(data);
  if (!quota) return { error: 'quota_unavailable', detail: 'company_user_quota sem retorno' };
  return { quota };
}

/**
 * Estado de vagas da empresa, SEMPRE contado no banco: a cota (ativos, lojas
 * ativas, franquia, capacidade, em uso), a linha de billing_accounts e a
 * assinatura em companies. Nenhuma contagem vem do cliente.
 * Retorna { quota, account, accountExists, company } ou { error, detail }.
 */
export async function loadSeatState(supabase, companyId) {
  const [q, acc, co] = await Promise.all([
    loadQuota(supabase, companyId),
    supabase.from('billing_accounts').select('*').eq('company_id', companyId).maybeSingle(),
    supabase.from('companies').select(COMPANY_COLS).eq('id', companyId).maybeSingle(),
  ]);
  if (q.error) return q;
  if (acc.error) {
    return { error: isMissing(acc.error) ? 'quota_unavailable' : 'query_failed', detail: acc.error.message };
  }
  if (co.error) return { error: 'query_failed', detail: co.error.message };
  if (!co.data) return { error: 'not_found' };
  return {
    quota: q.quota,
    account: acc.data ? { ...emptyAccount(companyId), ...acc.data } : emptyAccount(companyId),
    accountExists: !!acc.data,
    company: co.data,
  };
}

/** Upsert parcial em billing_accounts — cria a linha se ainda não existir. */
export async function writeAccount(supabase, companyId, patch) {
  return supabase.from('billing_accounts')
    .upsert({ company_id: companyId, ...patch, updated_at: new Date().toISOString() },
            { onConflict: 'company_id' });
}

async function markAdjustPending(supabase, companyId) {
  const { error } = await writeAccount(supabase, companyId, { adjust_pending: true });
  if (error) console.error('adjust_pending não gravado:', companyId, error.message);
}

/**
 * Alerta do Core gravado direto pelo billing (webhook): mesma tabela e mesma
 * deduplicação do motor de regras (dedupe_key único, "ignore duplicates").
 * Falha aqui nunca derruba o fluxo de cobrança — só é logada.
 */
export async function raiseBillingAlert(supabase, { rule, companyId, message, dedupeKey, severity = 'warning' }) {
  const { error } = await supabase.from('admin_alerts')
    .upsert([{ severity, rule, company_id: companyId || null, message, dedupe_key: dedupeKey }],
            { onConflict: 'dedupe_key', ignoreDuplicates: true });
  if (error) console.error('alerta de billing não gravado:', rule, error.message);
}

/**
 * Leva o valor da assinatura no MP ao que a regra manda: priceForUnits(lojas
 * ativas, ciclo, vagas adicionais contratadas). Vale da PRÓXIMA fatura, sem
 * pró-rata. Chamado pela rota de vagas (mudança na hora) e pelo cron diário
 * (lojas ativas mudaram, flag ligada depois, PUT que falhou).
 *
 *   · flag MP_ADJUST_ENABLED ligada → PUT no preapproval e billed_* gravados;
 *   · desligada (ou PUT falhou)     → adjust_pending = true, e o Core alerta.
 *
 * `company.mp_preapproval_id` e `subscription_status` são graváveis pelo
 * tenant, então antes de qualquer escrita que alcance o MP a assinatura é
 * conferida NO MP (external_reference = esta empresa, status 'authorized'), e
 * uma intenção de OUTRA empresa nunca é sobrescrita. Qualquer dúvida vira
 * pendência + alerta, nunca PUT.
 *
 * A intenção em billing_checkouts é atualizada ANTES do PUT: o MP re-dispara
 * o webhook da preapproval logo em seguida, e o webhook compara o valor com a
 * intenção — sem isso cada ajuste viraria alerta falso de divergência. Se o
 * PUT falha — ou a chamada ao MP LANÇA (rede) —, a intenção anterior volta e
 * a mudança fica pendente: nenhuma exceção sai daqui depois das vagas salvas.
 *
 * Retorna { adjusted, pending, amount, cycle, reason? }.
 */
export async function applySubscriptionAmount(supabase, { companyId, company, account, activeUnits, extraSeats }) {
  if (!subscriptionAdjustable(company)) {
    return { adjusted: false, pending: false, amount: null, cycle: null, reason: 'no_subscription' };
  }
  const preId = String(company.mp_preapproval_id);
  const { data: intentRow } = await supabase.from('billing_checkouts')
    .select('*').eq('mp_preapproval_id', preId).maybeSingle();
  // Intenção de outra empresa: o id em `companies` não é desta empresa (ou foi
  // plantado). Não se lê ciclo dela e, sobretudo, não se escreve por cima.
  const foreignIntent = !!intentRow && intentRow.company_id !== companyId;
  const intent = foreignIntent ? null : intentRow;

  const cycle = billingCycleFor({ account, intent, company });
  if (!cycle) {
    await markAdjustPending(supabase, companyId);
    return { adjusted: false, pending: true, amount: null, cycle: null, reason: 'unknown_cycle' };
  }
  // Acima do teto self-service a tabela corta em 50 lojas: o valor sairia
  // menor que o devido. Conversa comercial, não PUT.
  if (overSelfServiceLimit(activeUnits)) {
    await markAdjustPending(supabase, companyId);
    return { adjusted: false, pending: true, amount: null, cycle, reason: 'over_limit' };
  }
  const price = priceForUnits(activeUnits, cycle, extraSeats);
  const amount = price.monthlyCharge;

  if (sameAmount(amount, account?.billed_amount)) {
    if (account?.adjust_pending) await writeAccount(supabase, companyId, { adjust_pending: false });
    return { adjusted: false, pending: false, amount, cycle, reason: 'unchanged' };
  }

  if (!adjustEnabled() || !mpConfigured()) {
    await markAdjustPending(supabase, companyId);
    return { adjusted: false, pending: true, amount, cycle, reason: 'adjust_disabled' };
  }

  // A partir daqui há escrita que alcança o MP. Tudo dentro do try: uma
  // exceção no meio (rede, SDK) não pode deixar a intenção nova gravada sem
  // PUT, nem subir para a rota depois das vagas já salvas.
  let intentWritten = false;
  try {
    // Confere o dono NO MP.
    const own = foreignIntent ? { ok: true, owned: false } : await preapprovalOwnership(preId, companyId);
    if (!own.ok || !own.owned || own.status !== 'authorized') {
      const reason = !own.ok ? 'mp_error' : !own.owned ? 'foreign_preapproval' : 'not_authorized';
      console.error('ajuste recusado:', companyId, preId, reason);
      await markAdjustPending(supabase, companyId);
      if (reason === 'foreign_preapproval') {
        await raiseBillingAlert(supabase, {
          rule: 'billing_owner_mismatch', companyId, severity: 'critical',
          dedupeKey: `billing_owner_mismatch|${companyId}|${preId}`,
          message: `A empresa ${companyId} aponta para a assinatura ${preId}, que no Mercado Pago não é dela. `
            + 'Nenhum valor foi alterado. Confira companies.mp_preapproval_id — pode ser adulteração pelo cliente.',
        });
      }
      return { adjusted: false, pending: true, amount, cycle, reason };
    }

    const nextIntent = {
      mp_preapproval_id: preId, company_id: companyId, cycle,
      units: price.units, extra_seats: price.extraSeats, amount,
    };
    const { error: intentErr } = await supabase.from('billing_checkouts')
      .upsert(nextIntent, { onConflict: 'mp_preapproval_id' });
    if (intentErr) {
      // Sem a intenção nova o webhook do PUT viraria divergência — não arrisca.
      console.error('billing_checkouts não atualizado; ajuste adiado:', companyId, intentErr.message);
      await markAdjustPending(supabase, companyId);
      return { adjusted: false, pending: true, amount, cycle, reason: 'intent_failed' };
    }
    intentWritten = true;

    const res = await updatePreapprovalAmount(preId, amount);
    if (res.ok) {
      await writeAccount(supabase, companyId, {
        billed_units: price.units, billed_extra_seats: price.extraSeats,
        billed_amount: amount, billed_cycle: cycle, adjust_pending: false,
      });
      return { adjusted: true, pending: false, amount, cycle };
    }
    console.error('updatePreapprovalAmount falhou:', companyId, res.status, JSON.stringify(res.body)?.slice(0, 300));
  } catch (e) {
    console.error('ajuste no MP falhou com exceção:', companyId, preId, e?.message || e);
  }

  // PUT recusado ou exceção: a intenção volta ao que era e fica pendente — o
  // cron tenta de novo no dia seguinte e o R8 avisa enquanto isso.
  try {
    if (intentWritten) await restoreIntent(supabase, preId, intent);
    await markAdjustPending(supabase, companyId);
  } catch (e) {
    console.error('restauração do ajuste falhou:', companyId, preId, e?.message || e);
  }
  return { adjusted: false, pending: true, amount, cycle, reason: 'mp_error' };
}

// Devolve billing_checkouts ao que era antes do ajuste (ou apaga a linha, se
// não havia intenção). Só é chamada depois de a nova ter sido gravada.
async function restoreIntent(supabase, preId, intent) {
  if (intent) {
    await supabase.from('billing_checkouts').upsert({
      mp_preapproval_id: preId, company_id: intent.company_id, cycle: intent.cycle,
      units: intent.units, extra_seats: intent.extra_seats, amount: intent.amount,
    }, { onConflict: 'mp_preapproval_id' });
  } else {
    await supabase.from('billing_checkouts').delete().eq('mp_preapproval_id', preId);
  }
}
