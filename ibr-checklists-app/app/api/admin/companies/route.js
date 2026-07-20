import { adminGuard, jsonNoStore, spDaysAgo } from '../../../../lib/adminApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Empresas (gestão de tenants).
//   GET                → lista com saúde · GET ?company_id= → drill-down
//   POST               → cria empresa (RPC provision_company)
//   PATCH              → ações: activate | deactivate | extend_trial | delete
export async function GET(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const companyId = new URL(request.url).searchParams.get('company_id');
  const now = Date.now();
  const health = t => {
    if (!t) return 'never';
    const h = (now - new Date(t).getTime()) / 36e5;
    return h < 24 ? 'green' : h <= 72 ? 'yellow' : 'red';
  };

  if (!companyId) {
    const { data, error: qErr } = await db.from('admin_company_health').select('*');
    if (qErr) {
      console.error('companies query falhou:', qErr.message);
      return jsonNoStore({ ok: false, reason: 'query_failed', message: qErr.message }, 502);
    }
    return jsonNoStore({
      ok: true,
      generatedAt: new Date().toISOString(),
      companies: data
        .map(c => ({ ...c, health: health(c.last_activity) }))
        .sort((a, b) => (b.completions_7d || 0) - (a.completions_7d || 0)),
    });
  }

  const since30 = spDaysAgo(30);
  const [company, contact, units, sectors, users, daily, dau] = await Promise.all([
    db.from('admin_company_health').select('*').eq('company_id', companyId).maybeSingle(),
    db.from('companies').select('contact_email, contact_whatsapp').eq('id', companyId).maybeSingle(),
    db.from('admin_unit_health').select('*').eq('company_id', companyId),
    db.from('sectors').select('id, unit_id, name').eq('company_id', companyId).limit(500),
    db.from('admin_user_ranking').select('*').eq('company_id', companyId)
      .order('completions_30d', { ascending: false }).limit(50),
    db.from('admin_completions_daily').select('*').eq('company_id', companyId)
      .gte('day', since30).limit(3000),
    db.from('admin_active_users_daily').select('*').eq('company_id', companyId)
      .gte('day', since30).limit(200),
  ]);

  const firstErr = [company, units, sectors, users, daily, dau].find(r => r.error);
  if (firstErr) {
    console.error('company drill-down falhou:', firstErr.error.message);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: firstErr.error.message }, 502);
  }
  if (!company.data) return jsonNoStore({ ok: false, reason: 'not_found' }, 404);

  const byDay = new Map();
  for (let i = 30; i >= 0; i--) byDay.set(spDaysAgo(i), { day: spDaysAgo(i), completions: 0, dau: 0 });
  for (const r of daily.data) {
    const key = typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day);
    if (byDay.has(key)) byDay.get(key).completions += r.completions;
  }
  for (const r of dau.data) {
    const key = typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day);
    if (byDay.has(key)) byDay.get(key).dau += r.dau;
  }

  return jsonNoStore({
    ok: true,
    generatedAt: new Date().toISOString(),
    company: { ...company.data, ...(contact.data || {}), health: health(company.data.last_activity) },
    units: units.data
      .map(u => ({ ...u, health: health(u.last_completion),
        sectors: sectors.data.filter(s => s.unit_id === u.unit_id).map(s => s.name) }))
      .sort((a, b) => (b.completions_30d || 0) - (a.completions_30d || 0)),
    users: users.data,
    series: [...byDay.values()],
  });
}

// Cria uma empresa pelo Core, reaproveitando o RPC transacional do onboarding
// (guardas de slug reservado, trial de 7 dias, papel do admin forçado). A
// autorização aqui é a sessão de super-admin — não o PROVISION_SECRET.
export async function POST(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonNoStore({ ok: false, reason: 'bad_request' }, 400); }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';
  const adminName = typeof body?.adminName === 'string' ? body.adminName.trim() : '';
  const adminPin = typeof body?.adminPin === 'string' ? body.adminPin.trim() : '';
  if (!name || !slug || !adminName || !/^\d{4}$/.test(adminPin)) {
    return jsonNoStore({ ok: false, reason: 'bad_request', message: 'nome, código, gestor e PIN de 4 dígitos são obrigatórios' }, 400);
  }

  const { data, error: rpcErr } = await db.rpc('provision_company', {
    p: {
      company: { id: slug, name, slug },
      admin: { id: `${slug}-adm`, name: adminName, pin: adminPin },
    },
  });
  if (rpcErr) {
    const isValidation = rpcErr.code === 'P0001';
    console.error('provision via Core falhou:', rpcErr.message);
    return jsonNoStore(
      { ok: false, reason: isValidation ? 'invalid_payload' : 'provision_failed',
        message: isValidation ? rpcErr.message : undefined },
      isValidation ? 400 : 502,
    );
  }
  return jsonNoStore({ ok: true, ...data, accessUrl: `https://${slug}.zcheckapp.com/app` }, 201);
}

// Ações de gestão sobre uma empresa existente.
export async function PATCH(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonNoStore({ ok: false, reason: 'bad_request' }, 400); }
  const { company_id: companyId, action, confirm } = body || {};
  if (typeof companyId !== 'string' || !companyId) {
    return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
  }

  const { data: company, error: findErr } = await db.from('companies')
    .select('id, slug, name, active, trial_ends_at').eq('id', companyId).maybeSingle();
  if (findErr) return jsonNoStore({ ok: false, reason: 'query_failed' }, 502);
  if (!company) return jsonNoStore({ ok: false, reason: 'not_found' }, 404);

  if (action === 'set_contact') {
    // Canal do time de agentes: e-mail (follow-up real via Brevo) e WhatsApp
    // (link 1-clique com o texto pronto).
    const email = typeof body.contact_email === 'string' ? body.contact_email.trim() || null : undefined;
    const whatsapp = typeof body.contact_whatsapp === 'string'
      ? body.contact_whatsapp.replace(/\D/g, '') || null : undefined;
    const patch = {};
    if (email !== undefined) patch.contact_email = email;
    if (whatsapp !== undefined) patch.contact_whatsapp = whatsapp;
    if (!Object.keys(patch).length) return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
    const { error: qErr } = await db.from('companies').update(patch).eq('id', companyId);
    if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed' }, 502);
    return jsonNoStore({ ok: true, ...patch });
  }

  if (action === 'activate' || action === 'deactivate') {
    const { error: qErr } = await db.from('companies')
      .update({ active: action === 'activate' }).eq('id', companyId);
    if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed' }, 502);
    return jsonNoStore({ ok: true, active: action === 'activate' });
  }

  if (action === 'extend_trial') {
    // +7 dias a partir do fim atual do trial (ou de agora, se já venceu).
    const base = Math.max(Date.now(), company.trial_ends_at ? new Date(company.trial_ends_at).getTime() : 0);
    const newEnd = new Date(base + 7 * 864e5).toISOString();
    const { error: qErr } = await db.from('companies')
      .update({ trial_ends_at: newEnd, subscription_status: 'trialing' }).eq('id', companyId);
    if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed' }, 502);
    return jsonNoStore({ ok: true, trial_ends_at: newEnd });
  }

  if (action === 'delete') {
    // Irreversível: a UI exige digitar a slug, e a rota confere de novo aqui.
    if (confirm !== company.slug) {
      return jsonNoStore({ ok: false, reason: 'confirm_mismatch', message: 'digite a slug exata para confirmar' }, 400);
    }
    const { data, error: rpcErr } = await db.rpc('admin_delete_company', { p_company_id: companyId });
    if (rpcErr) {
      console.error('admin_delete_company falhou:', rpcErr.message);
      return jsonNoStore({ ok: false, reason: 'delete_failed', message: rpcErr.message }, 502);
    }
    return jsonNoStore({ ok: true, deleted: data });
  }

  return jsonNoStore({ ok: false, reason: 'bad_request', message: `ação desconhecida: ${action}` }, 400);
}
