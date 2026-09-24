import { cancelPreapproval, mpConfigured } from '../../../../lib/mercadopago';
import {
  authCompany, serviceClient, json, requireGestao, preapprovalOwnership,
} from '../../../../lib/billingServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cancela a assinatura no Mercado Pago. "Cancele quando quiser, sem multa": o
// acesso segue até current_period_end (o webhook não é necessário para isto).
//
// O id vem de `companies.mp_preapproval_id`, que o próprio tenant consegue
// gravar (policy FOR ALL) — e o anon lê o id das outras empresas. Por isso o
// dono é conferido NO MP (external_reference) antes de cancelar: sem isso, um
// token de A cancelava a assinatura de B. E o papel é relido no banco.

export async function POST(request) {
  if (!mpConfigured()) return json({ ok: false, reason: 'server_misconfigured' }, 500);

  const auth = authCompany(request);
  if (auth.error === 'server_misconfigured') return json({ ok: false, reason: 'server_misconfigured' }, 500);
  if (auth.error) return json({ ok: false, reason: 'unauthorized' }, 401);
  if (auth.userRole !== 'gestao') return json({ ok: false, reason: 'forbidden' }, 403);

  const supabase = serviceClient();
  if (!supabase) return json({ ok: false, reason: 'server_misconfigured' }, 500);

  const negado = await requireGestao(supabase, auth);
  if (negado) return json({ ok: false, reason: negado.reason }, negado.status);

  const { data: co } = await supabase
    .from('companies').select('mp_preapproval_id').eq('id', auth.companyId).maybeSingle();
  if (!co?.mp_preapproval_id) return json({ ok: false, reason: 'no_subscription' }, 400);

  const own = await preapprovalOwnership(co.mp_preapproval_id, auth.companyId);
  if (!own.ok && !own.notFound) {
    console.error('cancel: assinatura não conferida no MP:', auth.companyId, own.httpStatus);
    return json({ ok: false, reason: 'mp_error' }, 502);
  }
  if (!own.ok || !own.owned) {
    console.error('cancel: mp_preapproval_id não é desta empresa no MP — nada cancelado:', auth.companyId);
    return json({ ok: false, reason: 'no_subscription' }, 400);
  }

  const res = await cancelPreapproval(co.mp_preapproval_id);
  if (!res.ok) {
    console.error('cancelPreapproval falhou:', res.status);
    return json({ ok: false, reason: 'mp_error' }, 502);
  }

  // Mantém current_period_end: acesso permanece até o fim do período pago.
  await supabase.from('companies').update({ subscription_status: 'canceled' }).eq('id', auth.companyId);

  return json({ ok: true }, 200);
}
