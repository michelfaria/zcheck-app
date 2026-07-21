import { getTierByPrice } from '../../../../lib/plans';
import {
  verifyWebhookSignature, getPreapproval, getAuthorizedPayment, mpConfigured,
} from '../../../../lib/mercadopago';
import { serviceClient, json } from '../../../../lib/billingServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MONTH_MS = 31 * 24 * 60 * 60 * 1000;

// Webhook do Mercado Pago. Fonte de verdade: nunca confiamos no corpo — validamos
// a x-signature e RECONSULTAMOS o recurso na API do MP antes de mudar o billing.
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

  // Idempotência: SÓ para authorized_payment, cujo efeito (estender o período) é
  // aditivo e não pode rodar duas vezes. Cada pagamento tem um id único, então
  // deduplicar por id está correto. Já uma preapproval REUSA o mesmo id a cada
  // mudança de status (pending → authorized → cancelled); deduplicá-la por id
  // descartaria a ativação. Reprocessar preapproval é idempotente (só regrava o
  // status), então ela nunca é bloqueada aqui.
  if (mpType === 'authorized_payment') {
    const { error: dupErr } = await supabase
      .from('billing_events').insert({ mp_type: mpType, mp_id: String(dataId) });
    if (dupErr?.code === '23505') return json({ ok: true, duplicate: true }, 200);
  }

  let companyId = null, status = null;

  try {
    if (mpType === 'preapproval') {
      const r = await getPreapproval(dataId);
      if (!r.ok) throw new Error(`getPreapproval ${r.status}`);
      const pre = r.body;
      companyId = pre.external_reference;
      status = pre.status; // authorized | paused | cancelled | pending
      const amount = pre?.auto_recurring?.transaction_amount;
      const tier = getTierByPrice(amount);
      // Fallback do período: respeita o ciclo da assinatura (1 mês ou 12).
      const freqMonths = Number(pre?.auto_recurring?.frequency) || 1;
      const periodEnd = pre.next_payment_date
        ? new Date(pre.next_payment_date).toISOString()
        : new Date(Date.now() + freqMonths * MONTH_MS).toISOString();

      if (companyId) {
        if (status === 'authorized') {
          await supabase.from('companies').update({
            subscription_status: 'active',
            plan_tier: tier?.id ?? null,
            unit_limit: tier?.unitLimit ?? null,
            current_period_end: periodEnd,
            mp_preapproval_id: String(dataId),
          }).eq('id', companyId);
        } else if (status === 'cancelled') {
          await supabase.from('companies').update({ subscription_status: 'canceled' }).eq('id', companyId);
        } else if (status === 'paused') {
          await supabase.from('companies').update({ subscription_status: 'past_due' }).eq('id', companyId);
        }
      }
    } else if (mpType === 'authorized_payment') {
      const r = await getAuthorizedPayment(dataId);
      if (!r.ok) throw new Error(`getAuthorizedPayment ${r.status}`);
      const pay = r.body;
      status = pay.status; // approved | rejected | ...
      const preapprovalId = pay.preapproval_id;

      // Localiza a empresa pela assinatura.
      const { data: co } = await supabase
        .from('companies').select('id')
        .eq('mp_preapproval_id', preapprovalId).maybeSingle();
      companyId = co?.id ?? null;

      if (companyId) {
        if (status === 'approved') {
          // O período estendido depende do ciclo (mensal ou anual). A fonte de
          // verdade é a preapproval no MP: next_payment_date > frequency.
          let periodEnd = null;
          if (preapprovalId) {
            const rp = await getPreapproval(preapprovalId);
            if (rp.ok) {
              const months = Number(rp.body?.auto_recurring?.frequency) || 1;
              periodEnd = rp.body?.next_payment_date
                ? new Date(rp.body.next_payment_date).toISOString()
                : new Date(Date.now() + months * MONTH_MS).toISOString();
            }
          }
          await supabase.from('companies').update({
            subscription_status: 'active',
            current_period_end: periodEnd || new Date(Date.now() + MONTH_MS).toISOString(),
          }).eq('id', companyId);
        } else if (status === 'rejected') {
          await supabase.from('companies').update({ subscription_status: 'past_due' }).eq('id', companyId);
        }
      }
    }

    // Auditoria: insere (preapproval) ou completa (authorized_payment já inserido).
    await supabase.from('billing_events')
      .upsert({ mp_type: mpType, mp_id: String(dataId), company_id: companyId, status, raw: body ?? null },
              { onConflict: 'mp_type,mp_id' });
  } catch (e) {
    console.error('processamento do webhook falhou:', e.message);
    // 200 mesmo assim evita retries em loop; o billing_events registrou o id.
  }

  return json({ ok: true }, 200);
}
