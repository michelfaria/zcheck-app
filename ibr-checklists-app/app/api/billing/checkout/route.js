import {
  checkoutPlan, checkoutReason, hasActiveSubscription, previousSubscriptionDecision,
} from '../../../../lib/seats';
import { createPreapproval, cancelPreapproval, mpConfigured } from '../../../../lib/mercadopago';
import {
  authCompany, serviceClient, siteUrl, json, loadSeatState, requireGestao,
  preapprovalOwnership, setExtraSeatsAtomic, lastRejectionFor,
} from '../../../../lib/billingServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS = { quota_unavailable: 503, query_failed: 502, not_found: 404 };

// Inicia a assinatura: cria um preapproval no Mercado Pago e devolve o init_point
// (checkout hospedado). Só a gestão da empresa pode assinar.
//
// Preço por loja (21/07/2026) + vagas de usuário (23/09/2026). Anual (R$97/loja)
// e mensal (R$127/loja) são AMBOS cobrados mensalmente no cartão; a vaga
// adicional é R$ 17,00/mês nos dois. Do corpo só vale o ciclo (o pedido de
// lojas é validado, mas não muda nada) — o resto é contado NO SERVIDOR:
//   · lojas = as lojas ATIVAS, piso de 1 — a mesma contagem da franquia de
//     vagas e do cron billing-sync (regra 11); loja nova entra quando for
//     ativada, a partir da fatura seguinte;
//   · vagas adicionais = o maior entre as contratadas e as EM USO.
//
// Assinatura anterior (companies.mp_preapproval_id), conferida NO MP — dono e
// status — e decidida por previousSubscriptionDecision (lib/seats.js):
//   · pendente (checkout abandonado): cancelada antes de criar a nova; se o
//     cancelamento falha, o checkout recusa (o link velho seguiria pagável);
//   · autorizada e SEM atraso registrado: assinatura viva → 409. Se o MP
//     mostra o ciclo pago e o app ainda bloqueia (webhook da retentativa
//     aprovada perdido), o status é regravado 'active' aqui;
//   · autorizada EM ATRASO (recusa registrada, nenhuma cobrança aprovada
//     depois) ou pausada — trocar de cartão: NÃO é cancelada aqui e continua
//     sendo a atual. O webhook a cancela quando a nova for autorizada (paga).
//     Antes ela era cancelada neste ponto: um checkout abandonado matava a
//     assinatura (e as retentativas do MP), e um `past_due` velho — cache —
//     cancelava uma assinatura já paga e cobrava o mês de novo na nova.
// A intenção (lojas, vagas, ciclo, valor) é gravada em billing_checkouts ANTES
// de devolver o init_point: é por ela que o webhook descobre o plano — o valor
// sozinho não identifica (381 = anual 2 lojas + 11 vagas = mensal 3 lojas).
export async function POST(request) {
  if (!mpConfigured()) return json({ ok: false, reason: 'server_misconfigured' }, 500);

  const auth = authCompany(request);
  if (auth.error === 'server_misconfigured') return json({ ok: false, reason: 'server_misconfigured' }, 500);
  if (auth.error) return json({ ok: false, reason: 'unauthorized' }, 401);
  if (auth.userRole !== 'gestao') return json({ ok: false, reason: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }
  const cycle = body?.cycle === 'monthly' ? 'monthly' : 'annual';

  const supabase = serviceClient();
  if (!supabase) return json({ ok: false, reason: 'server_misconfigured' }, 500);

  const negado = await requireGestao(supabase, auth);
  if (negado) return json({ ok: false, reason: negado.reason }, negado.status);

  const state = await loadSeatState(supabase, auth.companyId);
  if (state.error) {
    console.error('checkout: estado de vagas indisponível:', auth.companyId, state.error, state.detail);
    return json({ ok: false, reason: state.error }, STATUS[state.error] || 502);
  }
  const { quota, account, company } = state;

  // Assinatura vigente: um segundo preapproval cobraria em dobro e o /cancel
  // passaria a mirar o novo. Mudança de vagas de quem já assina é pela rota
  // /api/billing/seats (ajusta o valor da mesma assinatura).
  if (hasActiveSubscription(company)) return json({ ok: false, reason: 'already_subscribed' }, 409);

  const plan = checkoutPlan({ requestedUnits: body?.units, cycle, quota, account });
  if (!plan.ok) return json({ ok: false, reason: plan.reason }, plan.status);

  // O e-mail do pagador vem do cadastro que criou a empresa.
  const { data: su } = await supabase
    .from('signups').select('email')
    .eq('provisioned_company_id', auth.companyId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const payerEmail = su?.email;
  if (!payerEmail) return json({ ok: false, reason: 'no_payer_email' }, 400);

  // A assinatura anterior. Só se mexe nela se o MP disser que é desta
  // empresa: `companies.mp_preapproval_id` é gravável pelo tenant, e sem
  // conferir o dono um id plantado cancelaria a assinatura de outra empresa.
  const anterior = company.mp_preapproval_id ? String(company.mp_preapproval_id) : null;
  // A nova só vira a "atual" (companies.mp_preapproval_id) já aqui quando não
  // há assinatura viva a preservar; na troca de cartão, quem troca é o webhook.
  let keepCurrent = false;
  if (anterior) {
    const own = await preapprovalOwnership(anterior, auth.companyId);
    let lastRejectionAt = null;
    if (own.ok && own.owned && own.status === 'authorized') {
      const rej = await lastRejectionFor(supabase, auth.companyId, anterior);
      if (rej.error) {
        console.error('checkout: recusas não lidas:', auth.companyId, rej.error.message);
        return json({ ok: false, reason: 'query_failed' }, 502);
      }
      lastRejectionAt = rej.at;
    }
    const prev = previousSubscriptionDecision({ own, lastRejectionAt, company });

    if (prev.action === 'error') {
      console.error('checkout: assinatura anterior não conferida:', auth.companyId, anterior, own.httpStatus);
      return json({ ok: false, reason: 'mp_error' }, 502);
    }
    if (prev.action === 'ignore' && prev.reason === 'foreign') {
      console.error('checkout: mp_preapproval_id aponta para assinatura de outra empresa — ignorada:', auth.companyId, anterior);
    }
    if (prev.action === 'live') {
      if (prev.resync) {
        // O MP diz: autorizada, ciclo cobrado, próxima fatura no futuro — e o
        // app bloqueia. O webhook da aprovação se perdeu; o status volta aqui,
        // e NÃO se abre uma segunda assinatura por cima de uma paga.
        const { data: rs, error: rsErr } = await supabase.from('companies').update(prev.resync)
          .eq('id', auth.companyId).eq('mp_preapproval_id', anterior).select('id');
        if (rsErr) console.error('checkout: status não regravado:', auth.companyId, rsErr.message);
        else if (rs?.length) {
          console.log('checkout: assinatura em dia no MP; status regravado:', auth.companyId, anterior);
          return json({ ok: false, reason: 'subscription_resynced' }, 409);
        }
      }
      return json({ ok: false, reason: 'already_subscribed' }, 409);
    }
    if (prev.action === 'cancel_first') {
      const c = await cancelPreapproval(anterior);
      if (!c.ok) {
        console.error('checkout: assinatura pendente anterior não cancelada; checkout recusado:', auth.companyId, anterior, c.status);
        return json({ ok: false, reason: 'previous_subscription' }, 409);
      }
    }
    keepCurrent = prev.action === 'replace_on_authorization';
  }

  const pre = await createPreapproval({
    amount: plan.amount,
    reason: checkoutReason(plan),
    payerEmail,
    companyId: auth.companyId,
    backUrl: `${siteUrl(request)}/app`,
    frequencyMonths: 1, // nos dois planos a cobrança é mensal
  });
  if (!pre.ok || !pre.initPoint) {
    console.error('createPreapproval falhou:', pre.status, JSON.stringify(pre.body)?.slice(0, 300));
    return json({ ok: false, reason: 'mp_error' }, 502);
  }

  // Intenção antes do init_point: sem ela o webhook não saberia o plano. Se
  // não grava, a assinatura pendente é descartada e o pagador nem a vê.
  const { error: intentErr } = await supabase.from('billing_checkouts').insert({
    mp_preapproval_id: String(pre.id),
    company_id: auth.companyId,
    cycle: plan.cycle,
    units: plan.units,
    extra_seats: plan.extraSeats,
    amount: plan.amount,
  });
  if (intentErr) {
    console.error('billing_checkouts não gravado; preapproval descartada:', auth.companyId, intentErr.message);
    const c = await cancelPreapproval(pre.id);
    if (!c.ok) console.error('cancelamento da preapproval órfã falhou:', pre.id);
    return json({ ok: false, reason: 'query_failed' }, 502);
  }

  // Vagas contratadas = as que vão na assinatura. Só sobem aqui quando havia
  // mais gente ativa do que o contratado (ex.: conta anterior à trava); aí a
  // RPC grava junto a linha em billing_seat_changes que registra que o valor
  // foi mostrado e aceito no checkout. Número igual não escreve nada — e não
  // pisa numa mudança feita em "Plano e vagas" no mesmo instante.
  if (plan.extraSeats !== plan.contractedBefore) {
    const w = await setExtraSeatsAtomic(supabase, {
      companyId: auth.companyId, to: plan.extraSeats, expected: plan.contractedBefore,
      changedBy: auth.userId, source: 'checkout',
    });
    if (!w.ok) console.error('checkout: vagas contratadas não gravadas:', auth.companyId, w.reason);
  }

  // Guarda o id pendente para correlacionar o webhook e permitir cancelamento
  // — exceto na troca de cartão: aí a anterior (viva, em atraso ou pausada)
  // segue sendo a atual até a nova ser autorizada, quando o webhook adota a
  // nova e cancela a anterior. Checkout abandonado não derruba nada.
  // Sem o id, o webhook da autorização adota a assinatura pelo
  // external_reference — por isso não se recusa o checkout aqui.
  if (!keepCurrent) {
    const { error: coErr } = await supabase.from('companies')
      .update({ mp_preapproval_id: String(pre.id) }).eq('id', auth.companyId);
    if (coErr) console.error('checkout: mp_preapproval_id não gravado:', auth.companyId, coErr.message);
  }

  return json({
    ok: true, init_point: pre.initPoint,
    units: plan.units, extraSeats: plan.extraSeats, cycle: plan.cycle, amount: plan.amount,
  }, 200);
}
