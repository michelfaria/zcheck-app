// Peças compartilhadas pelas rotas /api/billing/*. Server-only.

import { verifySessionToken } from './serverAuth';
import { serviceClient, json } from './signupServer';

export { serviceClient, json };

// Identifica a empresa do chamador pelo token de sessão (Authorization: Bearer).
// Retorna { companyId, userRole } ou { error } ('server_misconfigured'|'unauthorized').
export function authCompany(request) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return { error: 'server_misconfigured' };
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const claims = token ? verifySessionToken(token, { secret }) : null;
  if (!claims || !claims.company_id) return { error: 'unauthorized' };
  return { companyId: claims.company_id, userRole: claims.user_role };
}

// Base absoluta para back_url/redirect. Prefere env; senão deriva do host.
export function siteUrl(request) {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, '');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host');
  return `${proto}://${host}`;
}
