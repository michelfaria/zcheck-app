import { createClient } from '@supabase/supabase-js';

// Feedback 👍👎 de uma resposta do Zeca: marca `helpful` na linha de
// support_chats criada pela rota do assistente. Sem dados pessoais.
export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { body = null; }
  const chatId = typeof body?.chatId === 'string' ? body.chatId : '';
  const helpful = body?.helpful;
  if (!UUID_RE.test(chatId) || typeof helpful !== 'boolean') {
    return Response.json({ ok: false, reason: 'bad_request' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ ok: false, reason: 'unavailable' }, { status: 503 });

  try {
    const db = createClient(url, key, { auth: { persistSession: false } });
    await db.from('support_chats').update({ helpful }).eq('id', chatId);
    return Response.json({ ok: true });
  } catch (e) {
    console.error('feedback error:', e?.message);
    return Response.json({ ok: false, reason: 'error' }, { status: 500 });
  }
}
