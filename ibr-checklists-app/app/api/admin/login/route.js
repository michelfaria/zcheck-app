import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../../lib/supabase';
import { mintAdminToken, ADMIN_COOKIE, ADMIN_TTL_SECONDS } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body, status, headers = {}) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });

/**
 * Login do ZCheck Core (/admin). Duas verificações em série:
 *
 *   1. Senha no Supabase Auth (GoTrue valida e aplica o rate-limit dele);
 *   2. O usuário está em `platform_admins` (via service_role — a tabela não
 *      tem policy nenhuma de propósito).
 *
 * Só então o cookie httpOnly recebe o token de sessão assinado. Um usuário de
 * Auth que NÃO esteja em platform_admins recebe o mesmo erro de senha errada:
 * não vazamos quem é ou não é admin da plataforma.
 */
export async function POST(request) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !serviceKey) {
    console.error('SUPABASE_JWT_SECRET ou SUPABASE_SERVICE_ROLE_KEY ausente — /api/admin/login desabilitada.');
    return json({ ok: false, reason: 'server_misconfigured' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }
  const { email, password } = body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signInError } =
    await authClient.auth.signInWithPassword({ email, password });

  if (signInError || !signIn?.user) {
    const rateLimited = signInError?.status === 429;
    return json({ ok: false, reason: rateLimited ? 'rate_limited' : 'invalid_credentials' },
      rateLimited ? 429 : 401);
  }

  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: row, error: adminError } = await admin
    .from('platform_admins')
    .select('user_id, email')
    .eq('user_id', signIn.user.id)
    .maybeSingle();

  if (adminError) {
    console.error('platform_admins lookup falhou:', adminError.message);
    return json({ ok: false, reason: 'network_error' }, 502);
  }
  if (!row) {
    // Autenticou no Auth mas não é admin da plataforma: mesmo erro de credencial.
    return json({ ok: false, reason: 'invalid_credentials' }, 401);
  }

  const token = mintAdminToken({ id: signIn.user.id, email: row.email }, { secret });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return json({ ok: true }, 200, {
    'Set-Cookie':
      `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${ADMIN_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`,
  });
}
