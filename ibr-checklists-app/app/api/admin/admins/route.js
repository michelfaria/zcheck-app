import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../../lib/supabase';
import { adminGuard, jsonNoStore } from '../../../../lib/adminApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================================
// Administradores do ZCheck Core (tabela platform_admins).
//
// Entrar no /admin exige DOIS portões independentes: senha válida no Supabase
// Auth e presença em platform_admins. Esta rota opera os dois de uma vez, para
// que adicionar alguém deixe de ser um passo manual no painel do Supabase
// seguido de um INSERT no SQL Editor (era assim desde 19/07/2026).
//
//   GET                                   → lista com último acesso
//   POST {action:'create', email}         → cria a conta + entra na lista
//   POST {action:'reset_password', user_id} → nova senha provisória
//   POST {action:'change_password', ...}  → o admin logado troca a PRÓPRIA senha
//   DELETE ?user_id=                      → tira o acesso (não apaga a conta)
//
// A senha provisória é gerada AQUI e mostrada UMA vez na tela de quem convidou,
// que a repassa pelo canal dele. Não vai por e-mail de propósito: o Brevo já
// falhou por bloqueio de IP, e senha em caixa de entrada fica lá para sempre.
// ============================================================================

const MIN_PASSWORD = 12;

// Senha provisória legível: sem caracteres ambíguos (0/O, 1/l/I) porque ela é
// lida em voz alta ou copiada à mão.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function tempPassword(length = 16) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}-${out.slice(12)}`;
}

const normalizeEmail = v => String(v || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// auth.admin.listUsers pagina; o Core tem poucos admins, mas a lista de contas
// do Auth não é só deles — varremos até achar todos os e-mails procurados.
async function authUsersByEmail(db, emails) {
  const wanted = new Set(emails);
  const found = new Map();
  for (let page = 1; page <= 10 && found.size < wanted.size; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      const email = normalizeEmail(u.email);
      if (wanted.has(email)) found.set(email, u);
    }
    if (data.users.length < 200) break;
  }
  return found;
}

export async function GET(request) {
  const { db, claims, error } = adminGuard(request);
  if (error) return error;

  const { data: rows, error: qErr } = await db.from('platform_admins')
    .select('user_id, email, created_at').order('created_at');
  if (qErr) {
    console.error('admins GET falhou:', qErr.message);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: qErr.message }, 502);
  }

  // Último acesso vem do Auth; se a consulta falhar, a lista ainda sai.
  let byEmail = new Map();
  try {
    byEmail = await authUsersByEmail(db, (rows || []).map(r => normalizeEmail(r.email)));
  } catch (e) { console.warn('listUsers falhou:', e?.message); }

  return jsonNoStore({
    ok: true,
    me: claims.email,
    admins: (rows || []).map(r => {
      const u = byEmail.get(normalizeEmail(r.email));
      return {
        user_id: r.user_id, email: r.email, created_at: r.created_at,
        last_sign_in_at: u?.last_sign_in_at || null,
        confirmed: !!(u?.email_confirmed_at || u?.confirmed_at),
        isMe: normalizeEmail(r.email) === normalizeEmail(claims.email),
      };
    }),
  });
}

export async function POST(request) {
  const { db, claims, error } = adminGuard(request);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonNoStore({ ok: false, reason: 'bad_request' }, 400); }

  if (body?.action === 'create') return create(db, body);
  if (body?.action === 'reset_password') return resetPassword(db, body);
  if (body?.action === 'change_password') return changePassword(db, claims, body);
  return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
}

// ── Criar admin ─────────────────────────────────────────────────────────────
// Dois casos: conta nova (cria no Auth já confirmada) e conta que já existe no
// Auth (entra só na lista, SEM tocar na senha de quem já usa aquele login).
async function create(db, body) {
  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email)) {
    return jsonNoStore({ ok: false, reason: 'bad_request', message: 'e-mail inválido' }, 400);
  }

  const existing = await authUsersByEmail(db, [email]);
  let user = existing.get(email) || null;
  let password = null;

  if (!user) {
    password = tempPassword();
    const { data, error: cErr } = await db.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (cErr || !data?.user) {
      console.error('createUser falhou:', cErr?.message);
      return jsonNoStore({ ok: false, reason: 'auth_failed', message: cErr?.message || 'não foi possível criar a conta' }, 502);
    }
    user = data.user;
  }

  const { error: iErr } = await db.from('platform_admins')
    .upsert({ user_id: user.id, email }, { onConflict: 'user_id' });
  if (iErr) {
    console.error('platform_admins insert falhou:', iErr.message);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: iErr.message }, 502);
  }

  return jsonNoStore({
    ok: true, email, password,
    reused: !password, // conta já existia: a senha dela continua a mesma
  });
}

// ── Nova senha provisória ───────────────────────────────────────────────────
// Só para quem JÁ está na lista: a rota não vira um trocador de senha de
// qualquer conta do Supabase Auth.
async function resetPassword(db, body) {
  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  if (!userId) return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);

  const { data: row, error: qErr } = await db.from('platform_admins')
    .select('user_id, email').eq('user_id', userId).maybeSingle();
  if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed', message: qErr.message }, 502);
  if (!row) return jsonNoStore({ ok: false, reason: 'not_found' }, 404);

  const password = tempPassword();
  const { error: uErr } = await db.auth.admin.updateUserById(userId, { password });
  if (uErr) {
    console.error('updateUserById falhou:', uErr.message);
    return jsonNoStore({ ok: false, reason: 'auth_failed', message: uErr.message }, 502);
  }
  return jsonNoStore({ ok: true, email: row.email, password });
}

// ── Trocar a própria senha ──────────────────────────────────────────────────
// A senha atual é conferida contra o GoTrue antes da troca: o cookie de sessão
// prova que a pessoa entrou algum dia, não que é ela quem está no teclado agora.
async function changePassword(db, claims, body) {
  const current = typeof body.current_password === 'string' ? body.current_password : '';
  const next = typeof body.new_password === 'string' ? body.new_password : '';
  if (!current || next.length < MIN_PASSWORD) {
    return jsonNoStore({ ok: false, reason: 'bad_request', message: `a senha nova precisa de pelo menos ${MIN_PASSWORD} caracteres` }, 400);
  }
  if (current === next) {
    return jsonNoStore({ ok: false, reason: 'bad_request', message: 'a senha nova é igual à atual' }, 400);
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: sErr } =
    await authClient.auth.signInWithPassword({ email: claims.email, password: current });
  if (sErr || !signIn?.user) {
    const rateLimited = sErr?.status === 429;
    return jsonNoStore({ ok: false, reason: rateLimited ? 'rate_limited' : 'invalid_credentials' },
      rateLimited ? 429 : 401);
  }

  const { error: uErr } = await db.auth.admin.updateUserById(signIn.user.id, { password: next });
  if (uErr) {
    console.error('troca de senha falhou:', uErr.message);
    return jsonNoStore({ ok: false, reason: 'auth_failed', message: uErr.message }, 502);
  }
  return jsonNoStore({ ok: true });
}

// ── Tirar o acesso ──────────────────────────────────────────────────────────
// Sai da lista, a conta do Auth fica de pé: o portão do Core é a lista, e
// apagar a conta é irreversível por um clique. Duas travas: ninguém se remove
// (evita trancar a si mesmo para fora) e a lista nunca fica vazia (sem admin,
// o Core só volta pelo SQL Editor).
export async function DELETE(request) {
  const { db, claims, error } = adminGuard(request);
  if (error) return error;

  const userId = new URL(request.url).searchParams.get('user_id') || '';
  if (!userId) return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);

  const { data: rows, error: qErr } = await db.from('platform_admins').select('user_id, email');
  if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed', message: qErr.message }, 502);

  const target = (rows || []).find(r => r.user_id === userId);
  if (!target) return jsonNoStore({ ok: false, reason: 'not_found' }, 404);
  if (normalizeEmail(target.email) === normalizeEmail(claims.email)) {
    return jsonNoStore({ ok: false, reason: 'self_removal', message: 'você não pode remover o seu próprio acesso' }, 400);
  }
  if ((rows || []).length <= 1) {
    return jsonNoStore({ ok: false, reason: 'last_admin', message: 'este é o último administrador — o Core ficaria sem ninguém' }, 400);
  }

  const { error: dErr } = await db.from('platform_admins').delete().eq('user_id', userId);
  if (dErr) return jsonNoStore({ ok: false, reason: 'query_failed', message: dErr.message }, 502);
  return jsonNoStore({ ok: true });
}
