import { createHmac, timingSafeEqual } from 'node:crypto';

// Emite tokens de sessão assinados com o JWT secret do próprio Supabase.
// O mesmo token serve a dois propósitos: identifica o chamador nas rotas de API
// e alimenta as políticas de RLS via auth.jwt(). NUNCA importar deste módulo no
// cliente — ele lê o segredo do servidor.

const b64url = input =>
  Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function signHS256(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${b64url(signature)}`;
}

// 7 dias: cobre a loja que abre com a internet fora do ar — a sessão do último
// login continua válida no aparelho (offline-first, revisão 21/07). O contrapeso
// do TTL longo é o /api/auth/refresh: sempre que o app abre online ele revalida
// suspensão/empresa ativa e troca por um token novo. Suspensão demora no máximo
// até a próxima abertura online do aparelho para fazer efeito.
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const b64urlDecode = (str) =>
  Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// Verifica um token emitido por mintSessionToken: assinatura HS256 e expiração.
// Retorna o payload (com user_id, user_role, company_id) ou null se inválido.
// Usado pelas rotas de API que precisam identificar a empresa do chamador.
export function verifySessionToken(token, { secret }) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const got = b64urlDecode(signature);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;

  let claims;
  try { claims = JSON.parse(b64urlDecode(payload).toString('utf8')); } catch { return null; }
  if (!claims || (claims.exp && claims.exp < Math.floor(Date.now() / 1000))) return null;
  return claims;
}

export function mintSessionToken(user, { secret, issuer }) {
  const now = Math.floor(Date.now() / 1000);
  return signHS256({
    iss: `${issuer}/auth/v1`,
    sub: user.id,
    aud: 'authenticated',
    // `role` é o papel do Postgres — o PostgREST faz `set role` com ele.
    // O papel do app (gestao/lider/colaborador) vai em `user_role`.
    role: 'authenticated',
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    // users.id é string curta ('u1'), não UUID: auth.uid() faria cast e quebraria.
    // As políticas de RLS devem ler auth.jwt() ->> 'user_id'.
    user_id: user.id,
    user_role: user.role,
    company_id: user.companyId,
    unit_id: user.unitId ?? null,
    sector_id: user.sectorId ?? null,
  }, secret);
}
