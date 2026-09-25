import { adminGuard, jsonNoStore, spDaysAgo } from '../../../../lib/adminApi';
import { normalizeCnpj, isValidCnpj, cnpjRoot } from '../../../../lib/cnpj';
import { trialExtensionBlocked, trialExtensionMessage } from '../../../../lib/seats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A recusa de CNPJ do banco não cita o dono da raiz — ela também chega à tela
// do cliente (20260925_cnpj_sucessao_grupo). O Core precisa saber com quem o
// CNPJ está, então completa a mensagem pelo histórico.
async function comDonoDoCnpj(db, cnpj, companyId, message) {
  const root = cnpjRoot(cnpj);
  if (!root || !message) return message;
  const { data } = await db.from('cnpj_trial_history')
    .select('origin_company_id, company_name').eq('cnpj_root', root).maybeSingle();
  if (!data?.origin_company_id || data.origin_company_id === companyId) return message;
  return `${message} [Core: a raiz ${root} está com ${data.company_name || 'empresa apagada'} (${data.origin_company_id}).]`;
}

// Empresas (gestão de tenants).
//   GET                → lista com saúde · GET ?company_id= → drill-down
//     Vagas (23/09/2026): a view admin_company_health traz active_users,
//     included_seats, extra_seats e seat_capacity; billing_accounts completa
//     com isenção, pendência de ajuste e o valor cobrado, e o drill-down
//     mostra a trilha de consentimento (billing_seat_changes). Antes da
//     migration as consultas novas falham e a tela só não mostra as vagas.
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
    const [{ data, error: qErr }, profiles, trials, accounts, templates] = await Promise.all([
      db.from('admin_company_health').select('*'),
      db.from('companies').select('id, cnpj, legal_name, contact_name, contact_email, contact_whatsapp'),
      db.from('cnpj_trial_history').select('*').order('started_at', { ascending: false }).limit(50),
      db.from('billing_accounts').select('company_id, exempt, extra_seats, adjust_pending, billed_amount, billed_cycle'),
      // Checklists CADASTRADOS (templates), que é coisa diferente de checklist
      // executado (completions): mede o quanto a empresa montou a operação
      // dela. Contado aqui em vez de numa view nova para não pedir migration;
      // são dezenas de linhas por empresa.
      db.from('templates').select('company_id, active').limit(20000),
    ]);
    if (qErr) {
      console.error('companies query falhou:', qErr.message);
      return jsonNoStore({ ok: false, reason: 'query_failed', message: qErr.message }, 502);
    }
    const profileById = new Map((profiles.data || []).map(p => [p.id, p]));
    const accountById = new Map((accounts.error ? [] : accounts.data || []).map(a => [a.company_id, a]));
    // `active` só existe depois da 20260730_templates_desativar; sem a coluna a
    // consulta falha inteira e a contagem some (null), sem derrubar a lista.
    const templatesById = new Map();
    for (const t of templates.error ? [] : templates.data || []) {
      const row = templatesById.get(t.company_id) || { total: 0, active: 0 };
      row.total += 1;
      if (t.active !== false) row.active += 1;
      templatesById.set(t.company_id, row);
    }
    return jsonNoStore({
      ok: true,
      generatedAt: new Date().toISOString(),
      companies: data
        .map(c => ({
          ...c, ...(profileById.get(c.company_id) || {}),
          billing: billingOf(accountById.get(c.company_id)),
          templates: templates.error ? null : (templatesById.get(c.company_id) || { total: 0, active: 0 }),
          health: health(c.last_activity),
        }))
        .sort((a, b) => (b.completions_7d || 0) - (a.completions_7d || 0)),
      // Histórico de CNPJs que já consumiram o teste — a trava anti-reuso.
      // `trials.error` acontece antes da migration rodar; a lista some, o resto vive.
      trialHistory: trials.error ? [] : trials.data,
    });
  }

  const since30 = spDaysAgo(30);
  const [company, contact, units, unitCnpjs, sectors, users, daily, dau, account, seatChanges, templates] = await Promise.all([
    db.from('admin_company_health').select('*').eq('company_id', companyId).maybeSingle(),
    db.from('companies')
      .select('contact_email, contact_whatsapp, cnpj, legal_name, contact_name, contact_role, address_city, address_state, billing_mode, plan_tier, unit_limit')
      .eq('id', companyId).maybeSingle(),
    db.from('admin_unit_health').select('*').eq('company_id', companyId),
    db.from('units').select('id, cnpj').eq('company_id', companyId),
    db.from('sectors').select('id, unit_id, name').eq('company_id', companyId).limit(500),
    db.from('admin_user_ranking').select('*').eq('company_id', companyId)
      .order('completions_30d', { ascending: false }).limit(50),
    db.from('admin_completions_daily').select('*').eq('company_id', companyId)
      .gte('day', since30).limit(3000),
    db.from('admin_active_users_daily').select('*').eq('company_id', companyId)
      .gte('day', since30).limit(200),
    db.from('billing_accounts').select('*').eq('company_id', companyId).maybeSingle(),
    db.from('billing_seat_changes').select('*').eq('company_id', companyId)
      .order('created_at', { ascending: false }).limit(20),
    // Checklists cadastrados da empresa (templates). O `items` fica de fora de
    // propósito: é o JSON inteiro de cada checklist, e aqui só se conta.
    db.from('templates').select('id, unit_id, sector, shift, name, active, deadline, created_at')
      .eq('company_id', companyId).limit(2000),
  ]);

  const firstErr = [company, units, sectors, users, daily, dau].find(r => r.error);
  if (firstErr) {
    console.error('company drill-down falhou:', firstErr.error.message);
    return jsonNoStore({ ok: false, reason: 'query_failed', message: firstErr.error.message }, 502);
  }
  if (!company.data) return jsonNoStore({ ok: false, reason: 'not_found' }, 404);

  // Nome de quem contratou/reduziu vagas (changed_by é o users.id do token).
  const changes = seatChanges.error ? [] : seatChanges.data || [];
  const changerIds = [...new Set(changes.map(c => c.changed_by).filter(Boolean))];
  const changers = changerIds.length
    ? await db.from('users').select('id, name').eq('company_id', companyId).in('id', changerIds)
    : { data: [] };
  const changerName = new Map((changers.data || []).map(u => [u.id, u.name]));

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

  // Checklists cadastrados: total, quantos estão no ar e a conta por loja.
  // Template sem unit_id vale para todas as lojas (checklist da rede), por isso
  // ele soma no total mas não em nenhuma loja específica.
  const tpls = templates.error ? [] : templates.data || [];
  const tplByUnit = new Map();
  for (const t of tpls) {
    if (!t.unit_id) continue;
    const row = tplByUnit.get(t.unit_id) || { total: 0, active: 0 };
    row.total += 1;
    if (t.active !== false) row.active += 1;
    tplByUnit.set(t.unit_id, row);
  }
  const templatesSummary = templates.error ? null : {
    total: tpls.length,
    active: tpls.filter(t => t.active !== false).length,
    shared: tpls.filter(t => !t.unit_id).length,
    sectors: [...new Set(tpls.map(t => t.sector).filter(Boolean))].length,
    // Amostra do que existe, do mais novo para o mais velho — quem olha a
    // empresa quer ver se ela montou a operação ou só ficou com os semeados.
    list: [...tpls]
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .slice(0, 50)
      .map(t => ({
        id: t.id, name: t.name, sector: t.sector, shift: t.shift,
        unit_id: t.unit_id, active: t.active !== false,
        deadline: t.deadline, created_at: t.created_at,
      })),
  };

  return jsonNoStore({
    ok: true,
    generatedAt: new Date().toISOString(),
    company: {
      ...company.data, ...(contact.data || {}),
      billing: billingOf(account.error ? null : account.data),
      templates: templatesSummary,
      health: health(company.data.last_activity),
    },
    // Trilha de consentimento das vagas adicionais (quem, de→para, quando).
    seatChanges: changes.map(c => ({ ...c, changed_by_name: changerName.get(c.changed_by) || null })),
    units: units.data
      .map(u => ({ ...u, health: health(u.last_completion),
        cnpj: (unitCnpjs.data || []).find(x => x.id === u.unit_id)?.cnpj || null,
        templates: templates.error ? null : (tplByUnit.get(u.unit_id) || { total: 0, active: 0 }),
        sectors: sectors.data.filter(s => s.unit_id === u.unit_id).map(s => s.name) }))
      .sort((a, b) => (b.completions_30d || 0) - (a.completions_30d || 0)),
    users: users.data,
    series: [...byDay.values()],
  });
}

// Conta de cobrança resumida para o Core. Empresa sem linha em
// billing_accounts (criada depois do backfill) vale como não isenta e sem vaga
// adicional — a mesma leitura que as rotas de billing fazem.
function billingOf(a) {
  return {
    exempt: a?.exempt === true,
    extra_seats: Number(a?.extra_seats) || 0,
    adjust_pending: a?.adjust_pending === true,
    billed_amount: a?.billed_amount != null ? Number(a.billed_amount) : null,
    billed_cycle: a?.billed_cycle || null,
  };
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

  // CNPJ: obrigatório por padrão também aqui — a exceção é explícita
  // (skipCnpj), para os casos de cortesia/parceria sem CNPJ à mão.
  const cnpj = normalizeCnpj(body?.cnpj);
  const skipCnpj = body?.skipCnpj === true;
  if (!skipCnpj) {
    if (!cnpj) return jsonNoStore({ ok: false, reason: 'cnpj_required', message: 'Informe o CNPJ (ou marque "sem CNPJ").' }, 400);
    if (!isValidCnpj(cnpj)) return jsonNoStore({ ok: false, reason: 'cnpj_invalid', message: 'CNPJ inválido — confira os dígitos.' }, 400);
  }

  const { data, error: rpcErr } = await db.rpc('provision_company', {
    p: {
      company: {
        id: slug, name, slug,
        cnpj: skipCnpj ? null : cnpj,
        legal_name: typeof body?.legalName === 'string' ? body.legalName.trim() : null,
        contact_name: typeof body?.contactName === 'string' ? body.contactName.trim() : null,
        contact_email: typeof body?.contactEmail === 'string' ? body.contactEmail.trim() : null,
        contact_whatsapp: typeof body?.contactWhatsapp === 'string' ? body.contactWhatsapp.replace(/\D/g, '') : null,
      },
      admin: { id: `${slug}-adm`, name: adminName, pin: adminPin },
      // Só o fundador pode liberar um segundo trial para a mesma raiz de CNPJ.
      options: { require_cnpj: !skipCnpj, allow_trial_reuse: body?.allowTrialReuse === true },
    },
  });
  if (rpcErr) {
    const isValidation = rpcErr.code === 'P0001';
    console.error('provision via Core falhou:', rpcErr.message);
    return jsonNoStore(
      { ok: false, reason: isValidation ? 'invalid_payload' : 'provision_failed',
        message: isValidation ? await comDonoDoCnpj(db, skipCnpj ? '' : cnpj, slug, rpcErr.message) : undefined },
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
    .select('id, slug, name, active, trial_ends_at, subscription_status, current_period_end')
    .eq('id', companyId).maybeSingle();
  if (findErr) return jsonNoStore({ ok: false, reason: 'query_failed' }, 502);
  if (!company) return jsonNoStore({ ok: false, reason: 'not_found' }, 404);

  if (action === 'set_contact') {
    // Dados cadastrais + canal do time de agentes: e-mail (follow-up real via
    // Brevo) e WhatsApp (link 1-clique com o texto pronto).
    const email = typeof body.contact_email === 'string' ? body.contact_email.trim() || null : undefined;
    const whatsapp = typeof body.contact_whatsapp === 'string'
      ? body.contact_whatsapp.replace(/\D/g, '') || null : undefined;
    const patch = {};
    if (email !== undefined) patch.contact_email = email;
    if (whatsapp !== undefined) patch.contact_whatsapp = whatsapp;
    if (typeof body.contact_name === 'string') patch.contact_name = body.contact_name.trim() || null;
    if (typeof body.legal_name === 'string') patch.legal_name = body.legal_name.trim() || null;
    if (typeof body.cnpj === 'string') {
      const c = normalizeCnpj(body.cnpj);
      if (c && !isValidCnpj(c)) {
        return jsonNoStore({ ok: false, reason: 'cnpj_invalid', message: 'CNPJ inválido — confira os dígitos.' }, 400);
      }
      // Backfill de empresa legada: o CNPJ passa a valer como identidade e
      // registra o consumo do trial (a trava vale dali em diante).
      if (c) {
        const { data: dup } = await db.from('companies')
          .select('id').eq('cnpj', c).neq('id', companyId).maybeSingle();
        if (dup) {
          return jsonNoStore({ ok: false, reason: 'cnpj_taken', message: `Este CNPJ já pertence à empresa ${dup.id}.` }, 409);
        }
      }
      patch.cnpj = c || null;
    }
    if (!Object.keys(patch).length) return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
    const { error: qErr } = await db.from('companies').update(patch).eq('id', companyId);
    if (qErr) {
      // P0001 = recusa do gatilho de CNPJ (raiz de outro cliente): a mensagem
      // explica; o resto segue genérico.
      const message = qErr.code === 'P0001' && patch.cnpj
        ? await comDonoDoCnpj(db, patch.cnpj, companyId, qErr.message) : undefined;
      return jsonNoStore({ ok: false, reason: 'query_failed', message }, 502);
    }
    return jsonNoStore({ ok: true, ...patch });
  }

  if (action === 'set_billing_mode') {
    // Como o cliente quer ser faturado: uma cobrança para o grupo (soma das
    // lojas) ou uma por loja/CNPJ. Escolha comercial, não técnica.
    const mode = body.billing_mode;
    if (!['group', 'per_unit'].includes(mode)) {
      return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
    }
    const { error: qErr } = await db.from('companies')
      .update({ billing_mode: mode }).eq('id', companyId);
    if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed', message: qErr.message }, 502);
    return jsonNoStore({ ok: true, billing_mode: mode });
  }

  if (action === 'set_unit_cnpj') {
    // CNPJ por loja (matriz/filial). Vazio limpa — a loja passa a usar o CNPJ
    // da empresa. O banco também valida (constraint units_cnpj_valid).
    const unitId = typeof body.unit_id === 'string' ? body.unit_id : '';
    if (!unitId) return jsonNoStore({ ok: false, reason: 'bad_request' }, 400);
    // Obrigatório: cada loja tem identidade fiscal própria. Não há "limpar".
    const c = normalizeCnpj(body.cnpj);
    if (!c) return jsonNoStore({ ok: false, reason: 'cnpj_required', message: 'A loja precisa de um CNPJ.' }, 400);
    if (!isValidCnpj(c)) {
      return jsonNoStore({ ok: false, reason: 'cnpj_invalid', message: 'CNPJ inválido — confira os dígitos.' }, 400);
    }
    const { error: qErr } = await db.from('units')
      .update({ cnpj: c }).eq('id', unitId).eq('company_id', companyId);
    if (qErr) {
      return jsonNoStore({ ok: false, reason: 'query_failed',
        message: await comDonoDoCnpj(db, c, companyId, qErr.message) }, 502);
    }
    return jsonNoStore({ ok: true, unit_id: unitId, cnpj: c || null });
  }

  if (action === 'activate' || action === 'deactivate') {
    const { error: qErr } = await db.from('companies')
      .update({ active: action === 'activate' }).eq('id', companyId);
    if (qErr) return jsonNoStore({ ok: false, reason: 'query_failed' }, 502);
    return jsonNoStore({ ok: true, active: action === 'activate' });
  }

  if (action === 'extend_trial') {
    // Quem assina (ou está em atraso, ou pagou um período ainda vigente) não
    // tem teste para estender: gravar 'trialing' apagaria o estado da cobrança
    // (lib/seats.js trialExtensionBlocked).
    const bloqueio = trialExtensionBlocked(company);
    if (bloqueio) {
      return jsonNoStore({ ok: false, reason: 'has_subscription', message: trialExtensionMessage(bloqueio) }, 409);
    }
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
