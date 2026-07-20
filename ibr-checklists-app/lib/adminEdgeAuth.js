// Verificação do token do ZCheck Core no EDGE (middleware.js).
//
// O middleware do Next roda no runtime Edge, onde `node:crypto` não existe —
// por isso esta variante usa Web Crypto (crypto.subtle), assíncrona. As regras
// são as MESMAS de lib/adminAuth.js (HS256, aud 'zcheck-admin', exp): qualquer
// mudança lá deve ser espelhada aqui.
//
// Sem imports de Node de propósito: este arquivo precisa ser edge-safe.

export const ADMIN_COOKIE = 'zc_admin_session';

function b64urlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function verifyAdminTokenEdge(token, secret) {
  if (typeof token !== 'string' || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify'],
    );
    const ok = await crypto.subtle.verify(
      'HMAC', key,
      b64urlToBytes(signature),
      enc.encode(`${header}.${payload}`),
    );
    if (!ok) return null;

    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload)));
    if (!claims || claims.aud !== 'zcheck-admin' || claims.platform_role !== 'super_admin') return null;
    if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}
