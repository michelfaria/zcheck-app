import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../../../../lib/supabase';
import { verifySessionToken, mintSessionToken } from '../../../../lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body, status) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Troca um token de sessão ainda válido por um novo, revalidando o usuário.
// É o contrapeso do TTL de 7 dias (ver serverAuth.js): o cliente chama esta
// rota toda vez que abre online, então suspensão e desativação de empresa
// fazem efeito na próxima abertura conectada — sem forçar PIN a cada turno.
//
// Usa a service_role para ler users/companies porque o RLS escopa por
// company_id, não por suspended — e a chave nunca sai do servidor.
export async function POST(request) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !serviceKey) {
    console.error('SUPABASE_JWT_SECRET ou SUPABASE_SERVICE_ROLE_KEY ausente — /api/auth/refresh desabilitada.');
    return json({ ok: false, reason: 'server_misconfigured' }, 500);
  }

  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const claims = token && verifySessionToken(token, { secret });
  if (!claims?.user_id) {
    return json({ ok: false, reason: 'invalid_token' }, 401);
  }

  const admin = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error } = await admin
    .from('users')
    .select('id, name, role, unit_id, sector_id, company_id, suspended')
    .eq('id', claims.user_id)
    .maybeSingle();
  if (error) {
    console.error('refresh: leitura de users falhou:', error.message);
    // Erro transitório: o cliente segue com o token atual e tenta de novo depois.
    return json({ ok: false, reason: 'network_error' }, 502);
  }
  if (!row) return json({ ok: false, reason: 'not_found' }, 401);
  if (row.suspended) return json({ ok: false, reason: 'suspended' }, 403);

  if (row.company_id) {
    const { data: co, error: coError } = await admin
      .from('companies').select('active').eq('id', row.company_id).maybeSingle();
    if (coError) {
      console.error('refresh: leitura de companies falhou:', coError.message);
      return json({ ok: false, reason: 'network_error' }, 502);
    }
    if (co && co.active === false) {
      return json({ ok: false, reason: 'company_inactive' }, 403);
    }
  }

  const user = {
    id: row.id,
    name: row.name,
    role: row.role,
    unitId: row.unit_id ?? null,
    sectorId: row.sector_id ?? null,
    companyId: row.company_id ?? null,
    suspended: false,
  };
  return json({ ok: true, user, token: mintSessionToken(user, { secret, issuer: SUPABASE_URL }) }, 200);
}
