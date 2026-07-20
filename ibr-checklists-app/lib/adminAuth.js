import { createHmac, timingSafeEqual } from 'node:crypto';

// Sessão do ZCheck Core (/admin) — SEPARADA da auth de tenant (serverAuth.js).
// A credencial é email+senha no Supabase Auth; este módulo só assina/verifica o
// token de sessão que vai no cookie httpOnly depois que a senha foi validada e
// o e-mail confirmado em `platform_admins`. NUNCA importar no cliente.
//
// O token NÃO serve para o PostgREST de propósito: não tem claim `role`, então
// nenhuma chamada direta ao Supabase o aceita. Todo dado do /admin passa pelas
// rotas /api/admin/* (service_role, server-only) — o RLS dos tenants fica em paz.

export const ADMIN_COOKIE = 'zc_admin_session';
export const ADMIN_TTL_SECONDS = 12 * 60 * 60; // meio dia de trabalho; expirou, loga de novo

const b64url = input =>
  Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const b64urlDecode = str =>
  Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function mintAdminToken(user, { secret }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'zcheck-core',
    sub: user.id,
    // Audiência própria: um token de tenant (aud 'authenticated') jamais passa
    // no portão do /admin, e vice-versa.
    aud: 'zcheck-admin',
    platform_role: 'super_admin',
    email: user.email,
    iat: now,
    exp: now + ADMIN_TTL_SECONDS,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${b64url(signature)}`;
}

// Verificação para rotas /api/admin/* (runtime nodejs). O middleware usa a
// variante Web Crypto em adminEdgeAuth.js — mesmas regras, runtime diferente.
export function verifyAdminToken(token, { secret }) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const got = b64urlDecode(signature);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;

  let claims;
  try { claims = JSON.parse(b64urlDecode(payload).toString('utf8')); } catch { return null; }
  if (!claims || claims.aud !== 'zcheck-admin' || claims.platform_role !== 'super_admin') return null;
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

// Lê e verifica o cookie de sessão de um Request de rota /api/admin/*.
export function adminFromRequest(request, { secret }) {
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
  if (!match) return null;
  return verifyAdminToken(decodeURIComponent(match[1]), { secret });
}
