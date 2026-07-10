import { createHmac } from 'node:crypto';

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

// Um turno de trabalho. Não há refresh: expirou, o usuário digita o PIN de novo.
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

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
