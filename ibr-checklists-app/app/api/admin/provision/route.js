import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '../../../../lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body, status) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Comparação de tempo constante. `timingSafeEqual` exige buffers do mesmo
// tamanho, então comparamos o comprimento antes — o que vaza só o tamanho.
function secretMatches(provided, expected) {
  if (typeof provided !== 'string' || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * Provisiona uma empresa nova. Operação de plataforma, não de tenant: roda antes
 * de existir qualquer usuário daquela empresa, então não há token de sessão de
 * onde tirar identidade. A autorização é um segredo compartilhado, e a escrita
 * usa a service_role — que ignora RLS por completo e por isso nunca sai daqui.
 *
 * Toda a criação acontece no RPC `provision_company`, numa única transação.
 */
export async function POST(request) {
  const provisionSecret = process.env.PROVISION_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!provisionSecret || !serviceKey) {
    console.error('PROVISION_SECRET ou SUPABASE_SERVICE_ROLE_KEY ausente — /api/admin/provision desabilitada.');
    return json({ ok: false, reason: 'server_misconfigured' }, 500);
  }

  if (!secretMatches(request.headers.get('x-provision-secret'), provisionSecret)) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc('provision_company', { p: payload });

  if (error) {
    // O RPC valida o payload e sinaliza com `raise exception`. Essas mensagens
    // são escritas para o operador e podem voltar; qualquer outra coisa, não.
    const isValidation = error.code === 'P0001';
    console.error('provision_company falhou:', error.message);
    return json(
      { ok: false, reason: isValidation ? 'invalid_payload' : 'provision_failed',
        message: isValidation ? error.message : undefined },
      isValidation ? 400 : 502,
    );
  }

  return json({ ok: true, ...data }, 201);
}
