import { cancelPreapproval, mpConfigured } from '../../../../lib/mercadopago';
import { authCompany, serviceClient, json } from '../../../../lib/billingServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cancela a assinatura no Mercado Pago. "Cancele quando quiser, sem multa": o
// acesso segue até current_period_end (o webhook não é necessário para isto).
export async function POST(request) {
  if (!mpConfigured()) return json({ ok: false, reason: 'server_misconfigured' }, 500);

  const auth = authCompany(request);
  if (auth.error === 'server_misconfigured') return json({ ok: false, reason: 'server_misconfigured' }, 500);
  if (auth.error) return json({ ok: false, reason: 'unauthorized' }, 401);
  if (auth.userRole !== 'gestao') return json({ ok: false, reason: 'forbidden' }, 403);

  const supabase = serviceClient();
  if (!supabase) return json({ ok: false, reason: 'server_misconfigured' }, 500);

  const { data: co } = await supabase
    .from('companies').select('mp_preapproval_id').eq('id', auth.companyId).maybeSingle();
  if (!co?.mp_preapproval_id) return json({ ok: false, reason: 'no_subscription' }, 400);

  const res = await cancelPreapproval(co.mp_preapproval_id);
  if (!res.ok) {
    console.error('cancelPreapproval falhou:', res.status);
    return json({ ok: false, reason: 'mp_error' }, 502);
  }

  // Mantém current_period_end: acesso permanece até o fim do período pago.
  await supabase.from('companies').update({ subscription_status: 'canceled' }).eq('id', auth.companyId);

  return json({ ok: true }, 200);
}
