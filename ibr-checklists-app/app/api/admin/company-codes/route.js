import { adminGuard, jsonNoStore } from '../../../../lib/adminApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Códigos de acesso do /entrar (tabela company_codes).
//   GET → lista (com nome da empresa) · POST {code, company_id} · DELETE ?code=
export async function GET(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const [codes, companies] = await Promise.all([
    db.from('company_codes').select('*').order('code'),
    db.from('companies').select('id, name, slug, subdomain, active').order('id'),
  ]);
  const firstErr = [codes, companies].find(r => r.error);
  if (firstErr) {
    console.error('company-codes query falhou:', firstErr.error.message);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: firstErr.error.message }, 502);
  }

  const nameById = new Map(companies.data.map(c => [c.id, c.name || c.id]));
  return jsonNoStore({
    ok: true,
    codes: codes.data.map(c => ({ ...c, company_name: nameById.get(c.company_id) || c.company_id })),
    companies: companies.data,
  });
}

export async function POST(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonNoStore({ ok: false, reason: 'bad_request' }, 400); }
  const code = typeof body?.code === 'string'
    ? body.code.trim().toLowerCase().replace(/\s+/g, '') : '';
  const companyId = typeof body?.company_id === 'string' ? body.company_id.trim() : '';
  if (!code || !companyId || !/^[a-z0-9][a-z0-9-]*$/.test(code)) {
    return jsonNoStore({ ok: false, reason: 'bad_request', message: 'código inválido: minúsculas, dígitos e hífen' }, 400);
  }

  // Um código não pode sombrear a slug de OUTRA empresa — o /entrar resolve
  // company_codes antes da slug, e isso sequestraria o acesso dela.
  const { data: clash } = await db.from('companies')
    .select('id').eq('slug', code).neq('id', companyId).maybeSingle();
  if (clash) {
    return jsonNoStore({ ok: false, reason: 'code_taken', message: `"${code}" é a slug da empresa ${clash.id}` }, 409);
  }

  const { error: qErr } = await db.from('company_codes').insert({ code, company_id: companyId });
  if (qErr) {
    const dup = qErr.code === '23505';
    return jsonNoStore(
      { ok: false, reason: dup ? 'code_taken' : 'query_failed', message: dup ? 'código já existe' : undefined },
      dup ? 409 : 502,
    );
  }
  return jsonNoStore({ ok: true }, 201);
}

export async function DELETE(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const code = new URL(request.url).searchParams.get('code');
  if (!code) return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);

  const { error: qErr } = await db.from('company_codes').delete().eq('code', code);
  if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed' }, 502);
  return jsonNoStore({ ok: true });
}
