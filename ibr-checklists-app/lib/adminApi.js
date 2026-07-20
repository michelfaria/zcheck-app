import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './supabase';
import { adminFromRequest } from './adminAuth';

// Guard + cliente de dados das rotas /api/admin/* do ZCheck Core.
// O middleware já barra sem cookie válido; a re-verificação aqui é defesa em
// profundidade. O cliente devolvido usa a service_role (ignora RLS — por isso
// este módulo é server-only e o token de admin nunca vai ao PostgREST).
export function adminGuard(request) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !serviceKey) {
    console.error('SUPABASE_JWT_SECRET ou SUPABASE_SERVICE_ROLE_KEY ausente — rotas /api/admin de dados desabilitadas.');
    return { error: Response.json({ ok: false, reason: 'server_misconfigured' }, { status: 500 }) };
  }
  const claims = adminFromRequest(request, { secret });
  if (!claims) {
    return { error: Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 }) };
  }
  const db = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { db, claims };
}

export const jsonNoStore = (body, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Data local (America/Sao_Paulo) N dias atrás, como 'YYYY-MM-DD' — para filtrar
// as views por `day` sem depender do fuso do servidor.
export function spDaysAgo(n) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  now.setDate(now.getDate() - n);
  return now.toISOString().slice(0, 10);
}
