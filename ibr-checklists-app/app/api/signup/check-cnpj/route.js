import { json, serviceClient, hashSecret } from '../../../../lib/signupServer';
import { normalizeCnpj, isValidCnpj, cnpjRoot } from '../../../../lib/cnpj';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Diz, ANTES do fim do cadastro, se aquele CNPJ pode abrir conta — evita a
 * pessoa preencher tudo e só então descobrir que a empresa já usou o trial.
 *
 * Exige signup_id + claim_token (emitidos pelo verify-otp): quem chega aqui já
 * provou o e-mail. Sem isso, o endereço viraria um consultor público de "esta
 * empresa usa ZCheck?" para qualquer CNPJ do Brasil.
 */
export async function POST(request) {
  const supabase = serviceClient();
  if (!supabase || hashSecret('probe') === null) {
    return json({ ok: false, reason: 'server_misconfigured' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }
  const { signup_id: signupId, claim_token: claimToken, cnpj: raw } = body || {};
  if (typeof signupId !== 'string' || typeof claimToken !== 'string' || !claimToken) {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const { data: row } = await supabase.from('signups')
    .select('claim_hash, verified_at').eq('id', signupId).maybeSingle();
  if (!row?.verified_at || !row.claim_hash || row.claim_hash !== hashSecret(claimToken)) {
    return json({ ok: false, reason: 'invalid_claim' }, 403);
  }

  const cnpj = normalizeCnpj(raw);
  if (!isValidCnpj(cnpj)) {
    return json({ ok: true, available: false, reason: 'cnpj_invalid',
      message: 'CNPJ inválido — confira os dígitos.' });
  }

  const [{ data: dup }, { data: used }] = await Promise.all([
    supabase.from('companies').select('id').eq('cnpj', cnpj).maybeSingle(),
    supabase.from('cnpj_trial_history').select('started_at').eq('cnpj_root', cnpjRoot(cnpj)).maybeSingle(),
  ]);

  if (dup) {
    return json({ ok: true, available: false, reason: 'cnpj_taken',
      message: 'Este CNPJ já tem conta no ZCheck. Use "Acessar" para entrar.' });
  }
  if (used) {
    return json({ ok: true, available: false, reason: 'trial_already_used',
      message: 'Este CNPJ já usou o teste gratuito. Fale com a gente para reativar.' });
  }
  return json({ ok: true, available: true });
}
