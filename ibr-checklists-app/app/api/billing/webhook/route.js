import { formatBRL } from '../../../../lib/plans';
import {
  webhookDecision, webhookStatusDecision, preapprovalInfo, duplicateWinner, paidUpForCycle,
} from '../../../../lib/seats';
import {
  verifyWebhookSignature, getPreapproval, getAuthorizedPayment, cancelPreapproval, mpConfigured, mpTransient,
} from '../../../../lib/mercadopago';
import {
  serviceClient, json, writeAccount, raiseBillingAlert, lastRejectionFor,
} from '../../../../lib/billingServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MONTH_MS = 31 * 24 * 60 * 60 * 1000;

// Falha passageira (MP fora do ar, 429, rede, banco): o webhook responde 503
// e o MP reenvia a notificação. Antes toda exceção virava 200 — e um
// pagamento aprovado cuja leitura falhou uma vez ficava perdido para sempre:
// a empresa seguia 'past_due' com o cartão já cobrado.
const transient = (msg) => Object.assign(new Error(msg), { transient: true });

// Webhook do Mercado Pago. Fonte de verdade: nunca confiamos no corpo — validamos
// a x-signature e RECONSULTAMOS o recurso na API do MP antes de mudar o billing.
//
// Plano e lojas NÃO saem do valor cobrado (23/09/2026): com a vaga adicional
// no total, 381 é tanto anual com 2 lojas + 11 vagas quanto mensal com 3
// lojas. Saem da intenção gravada pelo checkout em billing_checkouts (e
// atualizada a cada ajuste de valor). Valor diferente da intenção vira
// registro em billing_events + alerta no Core; sem intenção, plano e lojas
// ficam como estão. Nada aqui grava null em plan_tier/unit_limit — antes, um
// valor não reconhecido zerava os dois e o pagante aparecia como cortesia.
//
// A EMPRESA sai sempre do MP (`external_reference` da preapproval), nunca de
// `companies.mp_preapproval_id`: essa coluna é gravável pelo tenant (policy
// FOR ALL) e o id das outras empresas é legível — um token de A que gravasse
// o id de B na própria linha fazia os pagamentos de B não acharem empresa
// nenhuma (dois resultados → nenhum). Status só muda pela assinatura ATUAL da
// empresa; todo update confere `mp_preapproval_id` no WHERE, para uma
// notificação concorrente que trocou a atual no meio não ser pisada.
//
// Duas assinaturas autorizadas (troca de cartão, dois checkouts ao mesmo
// tempo): fica a MAIS NOVA no MP e a outra é cancelada aqui, depois de
// conferido o dono — sempre a mesma resposta, qualquer que seja a ordem das
// notificações (lib/seats.js duplicateWinner). Se a cancelada já tinha pago o
// ciclo, alerta de cobrança em dobro.
export async function POST(request) {
  if (!mpConfigured() || !process.env.MP_WEBHOOK_SECRET) {
    console.error('MP não configurado — webhook desabilitado.');
    return json({ ok: false, reason: 'server_misconfigured' }, 500);
  }

  const url = new URL(request.url);
  let body = null;
  try { body = await request.json(); } catch { /* MP às vezes manda só query params */ }

  const type = url.searchParams.get('type') || url.searchParams.get('topic') || body?.type || body?.action;
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id') || body?.data?.id;

  const valid = verifyWebhookSignature({
    xSignature: request.headers.get('x-signature'),
    xRequestId: request.headers.get('x-request-id'),
    dataId,
  });
  if (valid === null) return json({ ok: false, reason: 'server_misconfigured' }, 500);
  if (!valid) return json({ ok: false, reason: 'bad_signature' }, 401);
  if (!type || !dataId) return json({ ok: true, ignored: true }, 200);

  const supabase = serviceClient();
  if (!supabase) return json({ ok: false, reason: 'server_misconfigured' }, 500);

  const mpType = String(type).includes('authorized_payment') ? 'authorized_payment'
    : String(type).includes('preapproval') ? 'preapproval'
    : String(type);

  // Idempotência de authorized_payment: cada pagamento tem um id único, e a
  // linha de billing_events nasce ANTES do processamento. Linha que já existe
  // COM status = pagamento já processado → duplicata. Linha sem status = o
  // processamento anterior não terminou (falha passageira → 503 → o MP
  // reenviou): processa de novo — reprocessar só regrava status e período a
  // partir do MP. Preapproval REUSA o mesmo id a cada mudança de status
  // (pending → authorized → cancelled) e nunca é bloqueada aqui.
  if (mpType === 'authorized_payment') {
    const { error: dupErr } = await supabase
      .from('billing_events').insert({ mp_type: mpType, mp_id: String(dataId) });
    if (dupErr?.code === '23505') {
      const { data: prev } = await supabase.from('billing_events')
        .select('status').eq('mp_type', mpType).eq('mp_id', String(dataId)).maybeSingle();
      if (prev?.status != null) return json({ ok: true, duplicate: true }, 200);
    }
  }

  let companyId = null, status = null;

  try {
    if (mpType === 'preapproval') {
      const r = await getPreapproval(dataId);
      if (!r.ok) {
        if (mpTransient(r)) throw transient(`getPreapproval ${r.status}`);
        throw new Error(`getPreapproval ${r.status}`);
      }
      const info = preapprovalInfo(r.body) || {};
      status = info.status ?? null; // authorized | paused | cancelled | pending
      const atual = await loadCompany(supabase, info.owner);
      companyId = atual?.id ?? null; // external_reference sem empresa: só auditoria

      if (atual && status === 'authorized') {
        await settleAuthorized(supabase, { company: atual, preId: String(dataId), info });
      } else if (atual) {
        const sd = webhookStatusDecision({ mpStatus: status, preId: dataId, company: atual, charged: info.charged });
        if (sd.apply && sd.patch) {
          // 'cancelled' → 'canceled' e 'paused' → 'past_due', só da atual.
          const { error } = await supabase.from('companies').update(sd.patch)
            .eq('id', atual.id).eq('mp_preapproval_id', String(dataId));
          if (error) throw transient(`companies: ${error.message}`);
        } else if (!sd.apply && sd.reason) {
          console.log('webhook: status de preapproval não aplicado:', atual.id, String(dataId), status, sd.reason);
        }
      }
    } else if (mpType === 'authorized_payment') {
      const r = await getAuthorizedPayment(dataId);
      if (!r.ok) {
        if (mpTransient(r)) throw transient(`getAuthorizedPayment ${r.status}`);
        throw new Error(`getAuthorizedPayment ${r.status}`);
      }
      const pay = r.body;
      status = pay.status; // approved | rejected | ...
      const preId = pay.preapproval_id != null && pay.preapproval_id !== '' ? String(pay.preapproval_id) : null;

      if (preId) {
        // A empresa é a dona da preapproval NO MP.
        const rp = await getPreapproval(preId);
        if (!rp.ok && rp.status !== 404) throw transient(`getPreapproval ${rp.status}`);
        const info = rp.ok ? preapprovalInfo(rp.body) : null;
        const co = await loadCompany(supabase, info?.owner);
        companyId = co?.id ?? null;
        if (co) await settlePayment(supabase, { company: co, preId, info, pay, paymentId: String(dataId) });
      }
    }

    // Auditoria: insere (preapproval) ou completa (authorized_payment já inserido).
    await supabase.from('billing_events')
      .upsert({ mp_type: mpType, mp_id: String(dataId), company_id: companyId, status, raw: body ?? null },
              { onConflict: 'mp_type,mp_id' });
  } catch (e) {
    console.error('processamento do webhook falhou:', e.message);
    // Passageira: 503 e o MP reenvia (a linha de authorized_payment ficou sem
    // status, então o reenvio é processado). O resto responde 200 — repetir
    // não mudaria nada e o MP ficaria reenviando em loop.
    if (e.transient) return json({ ok: false, reason: 'retry' }, 503);
  }

  return json({ ok: true }, 200);
}

// A empresa pelo id vindo do MP. Sem id ou sem empresa → null. Erro de banco
// é passageiro (o MP reenvia).
async function loadCompany(supabase, id) {
  if (!id) return null;
  const { data, error } = await supabase.from('companies')
    .select('id, subscription_status, mp_preapproval_id').eq('id', String(id)).maybeSingle();
  if (error) throw transient(`companies: ${error.message}`);
  return data || null;
}

/**
 * Preapproval AUTORIZADA no MP (reconsultada agora). Se já é a atual, confirma
 * status, período, plano e billed_*. Se não é:
 *   · a atual é outra autorizada da mesma empresa → fica a mais nova
 *     (duplicateWinner); a perdedora é cancelada. Se o MP não diz a idade das
 *     duas, nada é trocado nem cancelado — alerta para gente;
 *   · a atual é pendente/pausada da empresa → a notificada assume e a atual
 *     é cancelada (troca de cartão; link velho que ninguém pagou);
 *   · a atual não existe no MP, é de outra empresa (id plantado) ou já foi
 *     cancelada → a notificada assume, e não se toca na outra.
 * Retorna { current } — se a notificada é (agora) a assinatura atual.
 */
async function settleAuthorized(supabase, { company, preId, info }) {
  const current = company.mp_preapproval_id != null && company.mp_preapproval_id !== ''
    ? String(company.mp_preapproval_id) : null;
  let retire = null;

  if (current && current !== preId) {
    const rc = await getPreapproval(current);
    if (!rc.ok && rc.status !== 404) throw transient(`getPreapproval(atual) ${rc.status}`);
    const cInfo = rc.ok ? preapprovalInfo(rc.body) : null;
    const cOwned = !!cInfo && cInfo.owner === company.id;
    if (cOwned && cInfo.status === 'authorized') {
      const w = duplicateWinner(info, cInfo);
      if (w === 'current') {
        // A notificada é a duplicada MAIS VELHA: sai ela, a atual fica.
        await retirePreapproval(supabase, { companyId: company.id, loserId: preId, loserInfo: info, keptId: current });
        return { current: false };
      }
      if (w == null) {
        await recordAnomaly(supabase, {
          kind: 'duplicate_subscription', preId, companyId: company.id, cents: 0,
          raw: { current, notified: preId, reason: 'sem date_created' },
        });
        await raiseBillingAlert(supabase, {
          rule: 'billing_duplicate_subscription', companyId: company.id, severity: 'critical',
          dedupeKey: `billing_duplicate_subscription|${[preId, current].sort().join('|')}`,
          message: `A empresa ${company.id} tem duas assinaturas autorizadas no Mercado Pago — ${current} (a atual no app) e ${preId} — e o MP não informou quando cada uma nasceu, então nada foi cancelado. Cancele no MP a ${preId}, a que o app não usa (cancelar a ${current} marcaria a empresa como cancelada).`,
        });
        return { current: false };
      }
      retire = { id: current, info: cInfo };
    } else if (cOwned && cInfo.status !== 'cancelled') {
      retire = { id: current, info: cInfo };
    }
  }

  // Tabela ausente (migration não aplicada) = sem intenção: plano intacto.
  const { data: intent } = await supabase.from('billing_checkouts')
    .select('*').eq('mp_preapproval_id', preId).maybeSingle();
  const d = webhookDecision({ intent, companyId: company.id, amount: info.amount });
  const periodEnd = info.nextPaymentAt != null
    ? new Date(info.nextPaymentAt).toISOString()
    : new Date(Date.now() + info.freqMonths * MONTH_MS).toISOString();

  // Só grava se a atual ainda é a que foi lida: outra notificação pode ter
  // trocado no meio — aí o MP reenvia e a decisão é refeita com o estado novo.
  let q = supabase.from('companies').update({
    subscription_status: 'active',
    current_period_end: periodEnd,
    mp_preapproval_id: preId,
    ...d.companyPatch,
  }).eq('id', company.id);
  q = company.mp_preapproval_id == null
    ? q.is('mp_preapproval_id', null)
    : q.eq('mp_preapproval_id', String(company.mp_preapproval_id));
  const { data: rows, error: upErr } = await q.select('id');
  if (upErr) throw transient(`companies: ${upErr.message}`);
  if (!rows?.length) throw transient('companies: a assinatura atual mudou durante o processamento');

  if (Object.keys(d.accountPatch).length) {
    const { error: accErr } = await writeAccount(supabase, company.id, d.accountPatch);
    if (accErr) console.error('webhook: billed_* não gravado:', company.id, accErr.message);
  }

  const cents = Math.round(Number(info.amount) * 100) || 0;
  if (d.mismatch) {
    await recordAnomaly(supabase, {
      kind: 'amount_mismatch', preId, companyId: company.id, cents,
      raw: { intent, transaction_amount: info.amount },
    });
    await raiseBillingAlert(supabase, {
      rule: 'billing_amount_mismatch', companyId: company.id,
      dedupeKey: `billing_amount_mismatch|${preId}|${cents}`,
      message: `Assinatura ${preId} cobra ${formatBRL(info.amount, { cents: true })}, mas o checkout registrou ${formatBRL(intent.amount, { cents: true })} (${intent.units} loja(s) + ${intent.extra_seats || 0} vaga(s) adicional(is), ${intent.cycle === 'monthly' ? 'mensal' : 'anual'}). O valor real foi gravado; confira no Mercado Pago.`,
    });
  } else if (!d.hasIntent) {
    await recordAnomaly(supabase, {
      kind: d.foreign ? 'intent_foreign' : 'intent_missing', preId, companyId: company.id, cents,
      raw: { intent: intent || null, transaction_amount: info.amount },
    });
    await raiseBillingAlert(supabase, {
      rule: 'billing_intent_missing', companyId: company.id,
      dedupeKey: `billing_intent_missing|${preId}`,
      message: d.foreign
        ? `Assinatura ${preId} autorizada para ${company.id}, mas a intenção de checkout é de ${intent.company_id}. Plano e lojas não foram alterados.`
        : `Assinatura ${preId} autorizada sem intenção de checkout registrada (cobra ${formatBRL(info.amount, { cents: true })}). Plano e lojas não foram alterados — confira no Mercado Pago.`,
    });
  }

  // A substituída sai DEPOIS de a nova ser a atual: o 'cancelled' dela chega
  // como "não é a atual" e não derruba a empresa.
  if (retire) {
    await retirePreapproval(supabase, { companyId: company.id, loserId: retire.id, loserInfo: retire.info, keptId: preId });
  }
  return { current: true };
}

/**
 * Cancela no MP a preapproval que perdeu a vaga de "atual" — a dona já foi
 * conferida (external_reference = esta empresa). Se ela estava autorizada e
 * já tinha pago o ciclo corrente, o cliente pode ter pago o mês nas duas:
 * alerta crítico para estornar. Cancelamento que falha vira alerta crítico
 * com o id certo a cancelar.
 */
async function retirePreapproval(supabase, { companyId, loserId, loserInfo, keptId }) {
  let paidUp = false;
  if (loserInfo?.status === 'authorized') {
    const rej = await lastRejectionFor(supabase, companyId, loserId);
    paidUp = paidUpForCycle(loserInfo, rej.error ? null : rej.at, Date.now());
  }
  const c = await cancelPreapproval(loserId);
  if (!c.ok) {
    console.error('webhook: assinatura substituída não cancelada:', companyId, loserId, c.status);
    if (loserInfo?.status !== 'authorized') return; // pendente/pausada não cobra
    await recordAnomaly(supabase, {
      kind: 'duplicate_subscription', preId: loserId, companyId, cents: 0,
      raw: { kept: keptId, retired: loserId, cancel_status: c.status ?? null },
    });
    await raiseBillingAlert(supabase, {
      rule: 'billing_duplicate_subscription', companyId, severity: 'critical',
      dedupeKey: `billing_duplicate_subscription|${[loserId, keptId].sort().join('|')}`,
      message: `A empresa ${companyId} tem duas assinaturas autorizadas no Mercado Pago. A que vale é ${keptId}; a ${loserId} não pôde ser cancelada automaticamente — cancele a ${loserId} no MP (cobrança em dobro).`,
    });
    return;
  }
  if (paidUp) {
    const cents = Math.round(Number(loserInfo.amount) * 100) || 0;
    const quando = new Date(loserInfo.lastChargedAt).toISOString().slice(0, 10);
    await recordAnomaly(supabase, {
      kind: 'possible_double_charge', preId: loserId, companyId, cents,
      raw: { kept: keptId, retired: loserId, last_charged_at: quando },
    });
    await raiseBillingAlert(supabase, {
      rule: 'billing_possible_double_charge', companyId, severity: 'critical',
      dedupeKey: `billing_possible_double_charge|${loserId}`,
      message: `A assinatura ${loserId} da empresa ${companyId} foi substituída pela ${keptId} e cancelada, mas já tinha cobrado o ciclo corrente (${quando}, ${formatBRL(loserInfo.amount, { cents: true })}) sem recusa depois. Se a nova também cobrou, o mês saiu duas vezes — confira no Mercado Pago e estorne uma.`,
    });
  }
}

/**
 * Pagamento (authorized_payment) de uma preapproval cuja dona é `company`.
 *   · recusa → registrada por preapproval (billing_events 'payment_rejected')
 *     — é a prova de atraso que o checkout usa para permitir trocar de cartão;
 *   · aprovado numa autorizada que não é a atual (a nova da troca de cartão,
 *     cujo pagamento chegou antes da notificação da preapproval) → mesma
 *     resolução da autorização;
 *   · da atual → 'active' + período (aprovado) ou 'past_due' (recusado);
 *   · aprovado fora da atual → alguém cobrou: alerta.
 */
async function settlePayment(supabase, { company, preId, info, pay, paymentId }) {
  const status = pay.status;
  if (status === 'rejected') {
    const { error } = await supabase.from('billing_events').upsert({
      mp_type: 'payment_rejected', mp_id: `${preId}:${paymentId}`, company_id: company.id, status: 'rejected',
      raw: { payment: paymentId, preapproval_id: preId, transaction_amount: pay.transaction_amount ?? null },
    }, { onConflict: 'mp_type,mp_id', ignoreDuplicates: true });
    if (error) throw transient(`payment_rejected: ${error.message}`);
  }

  let isCurrent = String(company.mp_preapproval_id ?? '') === preId;
  if (!isCurrent && status === 'approved' && info?.status === 'authorized') {
    isCurrent = (await settleAuthorized(supabase, { company, preId, info })).current;
  }

  if (isCurrent) {
    let patch = null;
    if (status === 'approved') {
      // O período vem da preapproval no MP: next_payment_date > frequência.
      patch = {
        subscription_status: 'active',
        current_period_end: info?.nextPaymentAt != null
          ? new Date(info.nextPaymentAt).toISOString()
          : new Date(Date.now() + (info?.freqMonths || 1) * MONTH_MS).toISOString(),
      };
    } else if (status === 'rejected') {
      patch = { subscription_status: 'past_due' };
    }
    if (patch) {
      const { error } = await supabase.from('companies').update(patch)
        .eq('id', company.id).eq('mp_preapproval_id', preId);
      if (error) throw transient(`companies: ${error.message}`);
    }
    return;
  }

  // Pagamento aprovado numa assinatura que não é a atual (a anterior que
  // devia ter sido cancelada, a duplicada mais velha): não mexe em status,
  // mas um cartão foi cobrado — alguém precisa ver.
  if (status === 'approved') {
    const cents = Math.round(Number(pay.transaction_amount) * 100) || 0;
    await recordAnomaly(supabase, {
      kind: 'payment_untracked', preId, companyId: company.id, cents,
      raw: { payment: paymentId, transaction_amount: pay.transaction_amount ?? null },
    });
    await raiseBillingAlert(supabase, {
      rule: 'billing_payment_untracked', companyId: company.id, severity: 'critical',
      dedupeKey: `billing_payment_untracked|${paymentId}`,
      message: `Pagamento ${paymentId} aprovado na assinatura ${preId} da empresa ${company.id}, que não é a assinatura atual dela. Confira no Mercado Pago se há cobrança em dobro.`,
    });
  }
}

// Divergência entre o que o MP cobra e o que o checkout registrou (ou
// assinatura sem intenção). Vai para billing_events com um mp_type próprio —
// o índice (mp_type, mp_id) deduplica: o MP reenvia a mesma notificação várias
// vezes, e a mesma divergência (id + valor em centavos) fica registrada uma vez.
async function recordAnomaly(supabase, { kind, preId, companyId, cents, raw }) {
  const { error } = await supabase.from('billing_events').upsert(
    { mp_type: kind, mp_id: `${preId}:${cents}`, company_id: companyId, status: kind, raw },
    { onConflict: 'mp_type,mp_id', ignoreDuplicates: true },
  );
  if (error) console.error('webhook: anomalia não registrada:', kind, error.message);
}
