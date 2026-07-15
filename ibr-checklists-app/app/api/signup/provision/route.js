import {
  json, serviceClient, hashSecret, PROVISION_WINDOW_MS,
} from '../../../../lib/signupServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Passo 3: com o cadastro verificado, provisiona a empresa. NÃO usa o
// PROVISION_SECRET — a autorização é o claim_token de uso único emitido pelo
// verify-otp. Toda a criação continua no RPC provision_company (transação
// atômica, service_role), que revalida slug (formato/reservado/único).
export async function POST(request) {
  const supabase = serviceClient();
  if (!supabase || hashSecret('probe') === null) {
    console.error('service_role ou SUPABASE_JWT_SECRET ausente — signup/provision desabilitada.');
    return json({ ok: false, reason: 'server_misconfigured' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const { signup_id: signupId, claim_token: claimToken } = body || {};
  if (typeof signupId !== 'string' || typeof claimToken !== 'string' || !claimToken) {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const { data: row, error } = await supabase
    .from('signups')
    .select('id, email, claim_hash, verified_at, provisioned_company_id')
    .eq('id', signupId)
    .maybeSingle();

  if (error) { console.error('select signup falhou:', error.message); return json({ ok: false, reason: 'network_error' }, 502); }
  if (!row) return json({ ok: false, reason: 'not_found' }, 404);

  // Portão: verificado, dentro da janela, claim bate, ainda não provisionado.
  if (!row.verified_at) return json({ ok: false, reason: 'not_verified' }, 403);
  if (row.provisioned_company_id) return json({ ok: false, reason: 'already_provisioned' }, 409);
  if (!row.claim_hash || row.claim_hash !== hashSecret(claimToken)) {
    return json({ ok: false, reason: 'invalid_claim' }, 403);
  }
  if (Date.now() - new Date(row.verified_at).getTime() > PROVISION_WINDOW_MS) {
    return json({ ok: false, reason: 'expired' }, 410);
  }

  // Cap: uma empresa por e-mail verificado.
  const { count, error: cErr } = await supabase
    .from('signups').select('id', { count: 'exact', head: true })
    .eq('email', row.email).not('provisioned_company_id', 'is', null);
  if (cErr) { console.error('cap por e-mail falhou:', cErr.message); return json({ ok: false, reason: 'network_error' }, 502); }
  if ((count ?? 0) >= 1) return json({ ok: false, reason: 'already_provisioned' }, 409);

  // Provisiona. O payload (company/units/sectors/checklist_types/admin) é montado
  // pelo cliente; provision_company revalida tudo do lado do banco. O `plan` é
  // forçado a 'trial' aqui: um cadastro público nunca pode se auto-atribuir um
  // plano pago (diferente do /onboarding da equipe, que pode definir o plano).
  const { data, error: pErr } = await supabase.rpc('provision_company', {
    p: {
      company: { ...(body.company || {}), plan: 'trial' },
      units: body.units,
      sectors: body.sectors,
      checklist_types: body.checklist_types,
      admin: body.admin,
    },
  });

  if (pErr) {
    const isValidation = pErr.code === 'P0001';
    console.error('provision_company falhou:', pErr.message);
    return json(
      { ok: false, reason: isValidation ? 'invalid_payload' : 'provision_failed',
        message: isValidation ? pErr.message : undefined },
      isValidation ? 400 : 502,
    );
  }

  // Marca o cadastro como consumido — invalida o claim_token e trava o cap.
  const { error: mErr } = await supabase
    .from('signups').update({ provisioned_company_id: data.company_id }).eq('id', row.id);
  if (mErr) console.error('marcar signup provisionado falhou (empresa já criada):', mErr.message);

  return json({ ok: true, slug: data.slug, admin_id: data.admin_id }, 201);
}
