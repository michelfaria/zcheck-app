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

// Token de sessão emitido por /api/auth/session. Além da memória, a sessão
// (token + usuário) é persistida em localStorage: sem isto, qualquer reload —
// e o sistema do celular descarta a aba do PWA o tempo todo — voltava para a
// tela de login, que precisa do servidor. Loja sem internet ficava trancada
// para fora com todos os dados já no aparelho (revisão offline, 21/07).
// O risco de credencial armazenada é limitado pelo escopo do RLS, pela
// expiração do token e pela revalidação online via /api/auth/refresh.
let sessionToken = null;
let authedClient = null;

const SESSION_STORAGE_KEY = 'zc_session_v1';

export function persistSession(token, user) {
  try { localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token, user })); }
  catch (e) { console.warn('persistSession falhou', e); }
}

export function clearPersistedSession() {
  try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch (_) {}
}

// Lê a sessão guardada e valida a expiração do token localmente (só o `exp` do
// payload — a assinatura quem confere é o servidor/RLS; um token adulterado
// simplesmente não passa em nenhuma leitura). Expirado ou ilegível: descarta.
export function loadPersistedSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const { token, user } = JSON.parse(raw);
    if (!token || !user?.id) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (!payload?.exp || payload.exp * 1000 <= Date.now() + 60 * 1000) {
      clearPersistedSession();
      return null;
    }
    return { token, user };
  } catch (_) {
    clearPersistedSession();
    return null;
  }
}

export function setSessionToken(token) {
  sessionToken = token || null;
  authedClient = null;
  // Logout (token nulo) também revoga a cópia persistida — senão o próximo
  // reload restauraria a sessão que o usuário acabou de encerrar.
  if (!sessionToken) clearPersistedSession();
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
