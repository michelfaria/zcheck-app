import { EXTRA_USER_PRICE, priceForUnits } from '../../../../lib/plans';
import {
  validateSeatRequest, quotaWithExtraSeats, subscriptionAdjustable, billingCycleFor, expectedSeatsFrom,
} from '../../../../lib/seats';
import {
  authCompany, serviceClient, json, loadSeatState, loadQuota, applySubscriptionAmount,
  requireGestao, setExtraSeatsAtomic, writeAccount,
} from '../../../../lib/billingServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS = { quota_unavailable: 503, query_failed: 502, not_found: 404 };

// Vagas adicionais contratadas — a tela "Plano e vagas" e a confirmação
// "Contratar 1 vaga adicional por R$ 17,00/mês?" (regra de 23/09/2026).
//
// POST { extraSeats, expectedExtraSeats? } → { ok, quota, amount, adjusted, pending }
//   · Só a diretoria (role 'gestao') contrata ou reduz: é ela quem consente a
//     cobrança. Gerência recebe 403 e o app diz "peça à diretoria". O papel é
//     relido no banco (requireGestao): o do token vale 7 dias.
//   · O cliente manda o NÚMERO pedido e o número que ele VIU contratado
//     (`expectedExtraSeats`). Se outra sessão mudou no meio, 409 'stale' com o
//     `current` — o pedido é um alvo absoluto, e aplicá-lo sobre um número que
//     mudou cobraria (ou cortaria) vagas que ninguém consentiu.
//   · Ativos, lojas ativas, franquia e o mínimo (adicionais em uso) são
//     contados no banco — nunca confiamos na contagem do aparelho — e a
//     gravação é a RPC set_extra_seats, sob a mesma trava do trigger de vagas.
//   · Cada mudança deixa uma linha em billing_seat_changes (quem, de→para,
//     preço unitário, ativos e franquia no momento), na MESMA transação: é a
//     trilha do consentimento.
//   · Assinatura ativa: o valor no MP acompanha (lib/billingServer.js). No
//     trial nada é cobrado — as vagas entram no checkout.
//   · `amount` é o total mensal da assinatura com as vagas novas (lojas ativas
//     + adicionais). No trial, sem ciclo escolhido, sai no anual (o herói) só
//     como referência; `extraSeatsCharge` é a parte das vagas nos dois ciclos.
export async function POST(request) {
  const auth = authCompany(request);
  if (auth.error === 'server_misconfigured') return json({ ok: false, reason: 'server_misconfigured' }, 500);
  if (auth.error) return json({ ok: false, reason: 'unauthorized' }, 401);
  if (auth.userRole !== 'gestao') return json({ ok: false, reason: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const supabase = serviceClient();
  if (!supabase) return json({ ok: false, reason: 'server_misconfigured' }, 500);

  const negado = await requireGestao(supabase, auth);
  if (negado) return json({ ok: false, reason: negado.reason }, negado.status);

  const state = await loadSeatState(supabase, auth.companyId);
  if (state.error) {
    console.error('seats: estado de vagas indisponível:', auth.companyId, state.error, state.detail);
    return json({ ok: false, reason: state.error }, STATUS[state.error] || 502);
  }
  const { quota, account, company } = state;

  // Cortesia (IBR): sem trava e sem cobrança — nada a contratar.
  if (quota.exempt || account.exempt) return json({ ok: true, exempt: true, quota }, 200);

  const expected = expectedSeatsFrom(body?.expectedExtraSeats);
  const v = validateSeatRequest(body?.extraSeats, quota);
  if (!v.ok && v.status === 400) return json({ ok: false, reason: v.reason, max: v.max }, 400);
  // Número velho primeiro: "abaixo do mínimo" calculado sobre uma tela velha
  // confunde mais do que ajuda — a pessoa precisa ver o número de agora.
  if (expected != null && expected !== account.extra_seats) {
    return json({ ok: false, reason: 'stale', current: account.extra_seats, quota }, 409);
  }
  if (!v.ok) return json({ ok: false, reason: v.reason, min: v.min }, v.status);
  const from = account.extra_seats;
  const to = v.seats;

  const cycle = billingCycleFor({ account, company }) || 'annual';

  // Sem mudança: nada a gravar nem a consentir.
  if (to === from) {
    return json({
      ok: true, quota, amount: priceForUnits(quota.active_units, cycle, to).monthlyCharge,
      extraSeatsCharge: EXTRA_USER_PRICE * to,
      adjusted: false, pending: account.adjust_pending === true,
    }, 200);
  }

  // Conta, valida e grava sob a trava do trigger, com a trilha junto. O
  // `expected` é o número que ESTA rota acabou de ler (ou o do aparelho): se
  // alguém mudou entre a leitura e aqui, a RPC recusa em vez de sobrescrever.
  const w = await setExtraSeatsAtomic(supabase, {
    companyId: auth.companyId, to, expected: from, changedBy: auth.userId, source: 'app',
  });
  if (!w.ok) {
    if (w.reason === 'stale') return json({ ok: false, reason: 'stale', current: w.current }, 409);
    if (w.reason === 'below_in_use') return json({ ok: false, reason: 'below_in_use', min: w.min }, 409);
    if (w.reason === 'invalid_seats') return json({ ok: false, reason: 'invalid_seats' }, 400);
    if (w.reason === 'not_found') return json({ ok: false, reason: 'not_found' }, 404);
    return json({ ok: false, reason: w.reason || 'query_failed' }, STATUS[w.reason] || 502);
  }
  if (w.exempt) return json({ ok: true, exempt: true, quota }, 200);

  // Cota recontada no banco (outra pessoa pode ter entrado no meio); se a
  // releitura falhar, a conta local com as vagas novas basta para a resposta.
  const fresh = await loadQuota(supabase, auth.companyId);
  const newQuota = fresh.quota || quotaWithExtraSeats(quota, to);

  let adjusted = false;
  let pending = false;
  let amount = priceForUnits(newQuota.active_units, cycle, to).monthlyCharge;
  if (subscriptionAdjustable(company)) {
    // As vagas JÁ estão gravadas (a RPC commitou): daqui nada pode virar 500.
    // Um 500 aqui fazia o app dizer "não foi possível salvar" e o "tentar de
    // novo" bater em 409 'stale' — com a vaga contratada. Exceção no ajuste
    // vira pendência (o cron reprecifica no dia seguinte; o R8 avisa).
    try {
      const r = await applySubscriptionAmount(supabase, {
        companyId: auth.companyId, company,
        account: { ...account, extra_seats: to },
        activeUnits: newQuota.active_units, extraSeats: to,
      });
      adjusted = r.adjusted;
      pending = r.pending;
      if (r.amount != null) amount = r.amount;
    } catch (e) {
      console.error('seats: ajuste da assinatura falhou com exceção:', auth.companyId, e?.message || e);
      pending = true;
      const { error: pErr } = await writeAccount(supabase, auth.companyId, { adjust_pending: true });
      if (pErr) console.error('seats: adjust_pending não gravado:', auth.companyId, pErr.message);
    }
  }

  return json({
    ok: true, quota: newQuota, amount, extraSeatsCharge: EXTRA_USER_PRICE * to, adjusted, pending,
  }, 200);
}
