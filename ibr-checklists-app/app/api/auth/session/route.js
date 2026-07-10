import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../../lib/supabase';
import { mintSessionToken } from '../../../../lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body, status) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Troca (userId, pin) por um token de sessão. A validação do PIN continua sendo
// feita pelo RPC `validate_pin` (SECURITY DEFINER), que já aplica rate-limit e
// registra as tentativas — esta rota só assina o resultado.
export async function POST(request) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    console.error('SUPABASE_JWT_SECRET ausente — /api/auth/session desabilitada.');
    return json({ ok: false, reason: 'server_misconfigured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const { userId, pin } = body || {};
  if (typeof userId !== 'string' || typeof pin !== 'string') {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('validate_pin', {
    p_user_id: userId,
    p_pin: pin,
  });

  if (error) {
    console.error('validate_pin RPC failed:', error.message);
    return json({ ok: false, reason: 'network_error' }, 502);
  }
  if (!data?.ok) {
    // Preserva o motivo ('rate_limited' | 'wrong_pin' | 'not_found') para a UI.
    return json(data ?? { ok: false, reason: 'not_found' }, 401);
  }

  return json({ ...data, token: mintSessionToken(data.user, { secret, issuer: SUPABASE_URL }) }, 200);
}
