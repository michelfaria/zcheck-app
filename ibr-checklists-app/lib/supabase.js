import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  || 'https://rjuulamozdhssgqrzfji.supabase.co';

export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdXVsYW1vemRoc3NncXJ6ZmppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjc5MjksImV4cCI6MjA5Nzg0MzkyOX0.xxpJLp5SCpQRxMcuDMo-XD8offX2hrVUC_bU9I8me2M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: typeof window !== 'undefined' ? fetch.bind(window) : fetch,
  },
});

// Token de sessão emitido por /api/auth/session. Fica só em memória: um reload
// exige novo PIN. Não vai para localStorage — é credencial, não preferência.
let sessionToken = null;
let authedClient = null;

export function setSessionToken(token) {
  sessionToken = token || null;
  authedClient = null;
  // Os canais de realtime vivem no cliente anônimo e são criados no mount.
  // setAuth reenvia o access_token nos canais já conectados — sem isto, o RLS
  // nega os postgres_changes de templates/completions e o app para de receber
  // mudanças de outros dispositivos, silenciosamente.
  //
  // setAuth é assíncrona: um try/catch síncrono não pegaria a rejeição.
  return Promise.resolve(supabase.realtime.setAuth(sessionToken))
    .catch(e => console.warn('realtime.setAuth falhou', e));
}

export function getSessionToken() {
  return sessionToken;
}

// Cliente que carrega o token nas requisições, para que as políticas de RLS
// enxerguem auth.jwt(). Sem token, cai no cliente anônimo.
export function authedSupabase() {
  if (!sessionToken) return supabase;
  if (!authedClient) {
    authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: { Authorization: `Bearer ${sessionToken}` },
        fetch: typeof window !== 'undefined' ? fetch.bind(window) : fetch,
      },
    });
  }
  return authedClient;
}
