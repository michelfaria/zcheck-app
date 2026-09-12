import {
  json, serviceClient, hashSecret, PROVISION_WINDOW_MS, isEmail,
} from '../../../../lib/signupServer';
import { normalizeCnpj, isValidCnpj, cnpjRoot } from '../../../../lib/cnpj';

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

  // ── Cadastro completo: CNPJ é a identidade, e a raiz trava o trial ────────
  // O RPC revalida tudo (é a fronteira real); aqui a checagem existe para dar
  // uma mensagem específica em vez do texto cru da exceção do Postgres.
  const co = body.company || {};
  const cnpj = normalizeCnpj(co.cnpj);
  if (!cnpj) return json({ ok: false, reason: 'cnpj_required', message: 'Informe o CNPJ da empresa.' }, 400);
  if (!isValidCnpj(cnpj)) return json({ ok: false, reason: 'cnpj_invalid', message: 'CNPJ inválido — confira os dígitos.' }, 400);
  if (!String(co.legal_name || '').trim()) {
    return json({ ok: false, reason: 'legal_name_required', message: 'Informe a razão social.' }, 400);
  }
  if (!String(co.contact_name || '').trim()) {
    return json({ ok: false, reason: 'contact_required', message: 'Informe o nome do responsável.' }, 400);
  }
  const contactEmail = String(co.contact_email || row.email).trim();
  if (!isEmail(contactEmail)) {
    return json({ ok: false, reason: 'contact_email_invalid', message: 'E-mail de contato inválido.' }, 400);
  }

  const { data: dup } = await supabase.from('companies')
    .select('id').eq('cnpj', cnpj).maybeSingle();
  if (dup) {
    return json({ ok: false, reason: 'cnpj_taken',
      message: 'Este CNPJ já está cadastrado no ZCheck. Se for a sua empresa, use "Acessar" para entrar.' }, 409);
  }

  // Cada loja tem identidade fiscal própria — CNPJ por unidade é obrigatório.
  for (const u of body.units || []) {
    if (!String(u?.name || '').trim()) continue;
    const uc = normalizeCnpj(u.cnpj);
    if (!uc || !isValidCnpj(uc)) {
      return json({ ok: false, reason: 'unit_cnpj_invalid',
        message: `Informe um CNPJ válido para a loja "${String(u.name).trim()}".` }, 400);
    }
  }

  const { data: used } = await supabase.from('cnpj_trial_history')
    .select('started_at').eq('cnpj_root', cnpjRoot(cnpj)).maybeSingle();
  if (used) {
    return json({ ok: false, reason: 'trial_already_used',
      message: 'Este CNPJ já utilizou o período de teste gratuito. Fale com a gente para reativar a conta.' }, 409);
  }

  // Provisiona. O payload (company/units/sectors/checklist_types/admin) é montado
  // pelo cliente; provision_company revalida tudo do lado do banco. O `plan` é
  // forçado a 'trial' aqui: um cadastro público nunca pode se auto-atribuir um
  // plano pago (diferente do /onboarding da equipe, que pode definir o plano).
  const { data, error: pErr } = await supabase.rpc('provision_company', {
    p: {
      company: { ...co, cnpj, contact_email: contactEmail, plan: 'trial' },
      units: body.units,
      sectors: body.sectors,
      checklist_types: body.checklist_types,
      admin: body.admin,
      // Cadastro público NUNCA reusa trial: o override é exclusivo do Core.
      options: { require_cnpj: true, allow_trial_reuse: false },
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
