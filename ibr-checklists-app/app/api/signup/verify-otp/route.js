import {
  json, serviceClient, hashSecret, randomToken, MAX_VERIFY_ATTEMPTS,
} from '../../../../lib/signupServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Passo 2: confere o OTP. Em acerto, marca verified_at e devolve um claim_token
// de uso único (guardamos só o hash) que autoriza o /provision. Sem JWT — o
// estado vive no banco, então é auditável e revogável.
export async function POST(request) {
  const supabase = serviceClient();
  if (!supabase || hashSecret('probe') === null) {
    console.error('service_role ou SUPABASE_JWT_SECRET ausente — verify-otp desabilitada.');
    return json({ ok: false, reason: 'server_misconfigured' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const signupId = body?.signup_id;
  const code = String(body?.code || '').trim();
  if (typeof signupId !== 'string' || !/^\d{6}$/.test(code)) {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const { data: row, error } = await supabase
    .from('signups')
    .select('id, code_hash, attempts, verified_at, provisioned_company_id, expires_at')
    .eq('id', signupId)
    .maybeSingle();

  if (error) { console.error('select signup falhou:', error.message); return json({ ok: false, reason: 'network_error' }, 502); }
  if (!row) return json({ ok: false, reason: 'not_found' }, 404);
  if (row.provisioned_company_id) return json({ ok: false, reason: 'already_used' }, 409);
  if (new Date(row.expires_at).getTime() < Date.now()) return json({ ok: false, reason: 'expired' }, 410);
  if ((row.attempts ?? 0) >= MAX_VERIFY_ATTEMPTS) return json({ ok: false, reason: 'rate_limited' }, 429);

  if (row.code_hash !== hashSecret(code)) {
    await supabase.from('signups').update({ attempts: (row.attempts ?? 0) + 1 }).eq('id', row.id);
    return json({ ok: false, reason: 'wrong_code' }, 401);
  }

  const claimToken = randomToken();
  const { error: upErr } = await supabase
    .from('signups')
    .update({ verified_at: new Date().toISOString(), claim_hash: hashSecret(claimToken) })
    .eq('id', row.id);
  if (upErr) { console.error('update verify falhou:', upErr.message); return json({ ok: false, reason: 'network_error' }, 502); }

  return json({ ok: true, claim_token: claimToken }, 200);
}
