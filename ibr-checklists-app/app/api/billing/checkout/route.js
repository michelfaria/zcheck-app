import { priceForUnits, MAX_SELF_SERVICE_UNITS } from '../../../../lib/plans';
import { createPreapproval, mpConfigured } from '../../../../lib/mercadopago';
import { authCompany, serviceClient, siteUrl, json } from '../../../../lib/billingServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Inicia a assinatura: cria um preapproval no Mercado Pago e devolve o init_point
// (checkout hospedado). Só a gestão da empresa pode assinar.
export async function POST(request) {
  if (!mpConfigured()) return json({ ok: false, reason: 'server_misconfigured' }, 500);

  const auth = authCompany(request);
  if (auth.error === 'server_misconfigured') return json({ ok: false, reason: 'server_misconfigured' }, 500);
  if (auth.error) return json({ ok: false, reason: 'unauthorized' }, 401);
  if (auth.userRole !== 'gestao') return json({ ok: false, reason: 'forbidden' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  // Preço único por loja (21/07/2026): a gestão informa QUANTAS lojas e o
  // plano. Anual (R$97/loja) e mensal (R$127/loja) são AMBOS cobrados
  // mensalmente no cartão — o anual é compromisso de 12 meses com desconto.
  const units = Math.floor(Number(body?.units));
  const cycle = body?.cycle === 'monthly' ? 'monthly' : 'annual';
  if (!Number.isFinite(units) || units < 1 || units > MAX_SELF_SERVICE_UNITS) {
    return json({ ok: false, reason: 'invalid_units' }, 400);
  }
  const price = priceForUnits(units, cycle);
  if (!price) return json({ ok: false, reason: 'invalid_units' }, 400);

  const supabase = serviceClient();
  if (!supabase) return json({ ok: false, reason: 'server_misconfigured' }, 500);

  // O e-mail do pagador vem do cadastro que criou a empresa.
  const { data: su } = await supabase
    .from('signups').select('email')
    .eq('provisioned_company_id', auth.companyId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const payerEmail = su?.email;
  if (!payerEmail) return json({ ok: false, reason: 'no_payer_email' }, 400);

  const pre = await createPreapproval({
    amount: price.monthlyCharge,
    reason: `ZCheck — ${units} ${units === 1 ? 'loja' : 'lojas'} · plano ${cycle === 'annual' ? 'anual (12 meses)' : 'mensal'}`,
    payerEmail,
    companyId: auth.companyId,
    backUrl: `${siteUrl(request)}/app`,
    frequencyMonths: 1, // nos dois planos a cobrança é mensal
  });
  if (!pre.ok || !pre.initPoint) {
    console.error('createPreapproval falhou:', pre.status, JSON.stringify(pre.body)?.slice(0, 300));
    return json({ ok: false, reason: 'mp_error' }, 502);
  }

  // Guarda o id pendente para correlacionar o webhook e permitir cancelamento.
  await supabase.from('companies').update({ mp_preapproval_id: pre.id }).eq('id', auth.companyId);

  return json({ ok: true, init_point: pre.initPoint }, 200);
}
