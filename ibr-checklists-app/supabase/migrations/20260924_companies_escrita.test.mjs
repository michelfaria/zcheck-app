/**
 * Teste da migration 20260924_companies_escrita.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260924_companies_escrita.test.mjs
 *
 * O que está em jogo: qualquer token de sessão — colaborador inclusive —
 * gravava QUALQUER coluna da própria linha de `public.companies` (status da
 * assinatura, teste, plano, limite de lojas, id do Mercado Pago, CNPJ, slug,
 * `active`) e podia apagar a linha.
 *
 * As regras que este arquivo existe para provar:
 *   1. O buraco existe na bancada ANTES (estado medido em produção em
 *      24/09/2026): o colaborador marca a assinatura como ativa, estende o
 *      teste, sobe o limite de lojas e apaga a empresa.
 *   2. Depois: coluna de cobrança não é gravável por papel nenhum de cliente —
 *      erro 42501 explícito, nada muda. INSERT e DELETE também não.
 *   3. O app continua: a diretoria conclui o assistente (cor, logo,
 *      onboarded_at) e a gerência troca o logo, como saveCompany grava
 *      (UPDATE … RETURNING 1). Colaborador e liderança, que não têm a tela,
 *      não trocam nem o logo. Ninguém alcança outra empresa.
 *   4. Leitura intacta: cada sessão lê a própria empresa inteira (fetchCompany
 *      faz select *), não a de outra; o anon segue lendo (o /entrar e o
 *      /cadastro dependem).
 *   5. service_role e as funções SECURITY DEFINER (provisionamento, exclusão)
 *      seguem gravando; o gatilho companies_cnpj_link fica.
 *   6. Se sobrar outra policy de escrita, ou grant de escrita vindo de outro
 *      lugar, a migration não se aplica pela metade: desfaz tudo e diz o quê.
 *   7. Roda duas vezes sem erro, e as linhas de VERIFICAÇÃO batem.
 *
 * Ações com `set role` + claims, como o PostgREST; conferências como dona da
 * tabela, que não passa pelo RLS.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION = readFileSync(fileURLToPath(new URL('./20260924_companies_escrita.sql', import.meta.url)), 'utf8');

let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

// Produção em 24/09/2026 (pré-voo no SQL Editor): RLS ligado,
// companies_anon_read + companies_tenant_rw, anon só SELECT, authenticated
// SELECT/INSERT/UPDATE/DELETE de tabela, nenhum grant só de coluna, gatilho
// companies_cnpj_link. As colunas são as de produção.
const BANCADA = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;

  create or replace function public.jwt_user_role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'user_role', '') $$;
  create or replace function public.jwt_company_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'company_id', '') $$;

  create table public.companies (
    id text primary key, name text not null, slug text not null, logo_url text, primary_color text,
    plan text, active boolean default true, created_at timestamptz default now(),
    trial_ends_at timestamptz, subscription_status text, plan_tier text, unit_limit integer,
    current_period_end timestamptz, mp_preapproval_id text, onboarded_at timestamptz,
    subdomain text, contact_email text, contact_whatsapp text, cnpj text, legal_name text,
    contact_name text, contact_role text, address_zip text, address_city text, address_state text,
    billing_mode text
  );
  alter table public.companies enable row level security;
  create policy companies_anon_read on public.companies for select to anon using (true);
  create policy companies_tenant_rw on public.companies for all to authenticated
    using (id = public.jwt_company_id()) with check (id = public.jwt_company_id());
  grant select on public.companies to anon;
  grant select, insert, update, delete on public.companies to authenticated;
  grant all on public.companies to service_role;

  -- O gatilho de produção (20260720_cnpj_cadastro) liga o CNPJ; aqui só conta.
  create table public.gatilho_cnpj (n int);
  insert into public.gatilho_cnpj values (0);
  create or replace function public.companies_cnpj_link() returns trigger
  language plpgsql security definer set search_path = public as $f$
  begin update public.gatilho_cnpj set n = n + 1; return null; end $f$;
  create trigger companies_cnpj_link after insert or update on public.companies
    for each row execute function public.companies_cnpj_link();

  -- Como provision_company / admin_delete_company: SECURITY DEFINER.
  create or replace function public.provision_teste(p_id text) returns void
  language plpgsql security definer set search_path = public as $f$
  begin
    insert into public.companies (id, name, slug, subscription_status, trial_ends_at)
    values (p_id, p_id, p_id, 'trialing', now() + interval '14 days');
  end $f$;
  create or replace function public.delete_teste(p_id text) returns void
  language plpgsql security definer set search_path = public as $f$
  begin delete from public.companies where id = p_id; end $f$;
  grant execute on function public.provision_teste(text), public.delete_teste(text) to authenticated;

  insert into public.companies (id, name, slug, logo_url, primary_color, subscription_status,
                                trial_ends_at, plan_tier, unit_limit, mp_preapproval_id, onboarded_at) values
    ('empresa-a', 'A', 'a', 'https://x.supabase.co/storage/v1/object/public/company-logos/empresa-a/logo-1.png',
     '#123456', 'trialing', '2026-10-01', null, 1, null, '2026-09-01'),
    ('empresa-b', 'B', 'b', null, '#654321', 'active', null, 'mensal', 3, 'mp-b', null);
`;

const token = (papel, empresa) => JSON.stringify({ role: 'authenticated', user_id: `u-${papel}`, user_role: papel, company_id: empresa });
const como = (papel, empresa = 'empresa-a') =>
  `reset role; select set_config('request.jwt.claims', '${token(papel, empresa)}', false); set role authenticated;`;
const comoAnon    = `reset role; select set_config('request.jwt.claims', '{"role":"anon"}', false); set role anon;`;
const comoServico = `reset role; select set_config('request.jwt.claims', '{"role":"service_role"}', false); set role service_role;`;
const comoDono    = `reset role; select set_config('request.jwt.claims', '{}', false);`;
const PAPEIS = ['colaborador', 'lideranca', 'gerencia', 'gestao'];

async function bancada(extra = '') {
  const db = new PGlite();
  await db.exec(BANCADA);
  if (extra) await db.exec(extra);
  await db.exec(comoDono);
  const erroDe = async (sessao, sql) => {
    try { await db.exec(sessao + sql); return null; }
    catch (e) { return e.message; }
    finally { await db.exec(comoDono); }
  };
  const empresa = async id => {
    await db.exec(comoDono);
    return (await db.query(`select * from public.companies where id = $1`, [id])).rows[0];
  };
  const ve = async sessao => {
    await db.exec(sessao);
    try { return (await db.query(`select * from public.companies order by id`)).rows; }
    finally { await db.exec(comoDono); }
  };
  const policies = async () => (await db.query(`select string_agg(policyname, ',' order by policyname) s
                                                  from pg_policies where tablename = 'companies'`)).rows[0].s;
  const aplica = async () => {
    await db.exec(comoDono);
    return (await db.exec(MIGRATION)).filter(r => r.fields?.some(f => f.name === 'esperado')).at(-1)?.rows ?? [];
  };
  return { db, erroDe, empresa, ve, policies, aplica };
}

const COBRANCA = {
  subscription_status: `'active'`, trial_ends_at: `'2099-01-01'`, current_period_end: `'2099-01-01'`,
  plan_tier: `'anual'`, unit_limit: `99`, mp_preapproval_id: `'mp-forjado'`, billing_mode: `'grupo'`,
  active: `true`, plan: `'pro'`, cnpj: `'00000000000000'`, slug: `'outro-slug'`, name: `'Outro nome'`,
  subdomain: `'outro'`, contact_email: `'x@x.com'`,
};
const semPermissao = e => /permission denied/.test(e || '');

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ antes: o buraco ═══');
{
  const b = await bancada();
  await b.erroDe(como('colaborador'), `update public.companies set subscription_status = 'active',
    trial_ends_at = '2099-01-01', unit_limit = 99, plan_tier = 'anual', mp_preapproval_id = 'mp-forjado'
    where id = 'empresa-a';`);
  const a = await b.empresa('empresa-a');
  check(a.subscription_status === 'active' && a.unit_limit === 99 && a.mp_preapproval_id === 'mp-forjado'
     && new Date(a.trial_ends_at).getUTCFullYear() === 2099,
    'ANTES: o colaborador marca a assinatura como ativa, estende o teste, sobe o limite de lojas e troca o id do Mercado Pago (o bug)');
  await b.erroDe(como('colaborador'), `delete from public.companies where id = 'empresa-a';`);
  check(!(await b.empresa('empresa-a')), 'ANTES: e apaga a linha da própria empresa');
  await b.db.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ trava ═══');
{
  const b = await bancada(`create policy companies_edicao_manual on public.companies for update to authenticated using (true);`);
  const erro = await b.erroDe(comoDono, MIGRATION);
  check(/outra policy/.test(erro || '') && /companies_edicao_manual/.test(erro || ''),
    'policy de escrita feita à mão → a migration aborta e NOMEIA a policy');
  check((await b.policies()).includes('companies_tenant_rw')
     && (await b.db.query(`select has_table_privilege('authenticated', 'public.companies', 'DELETE') x`)).rows[0].x === true,
    '…e aborta INTEIRA: a policy antiga e o grant de DELETE continuam lá');
  await b.db.close();
}
{
  const b = await bancada(`create policy "Enable read access for all users" on public.companies for select to public using (true);`);
  const erro = await b.erroDe(comoDono, MIGRATION);
  check(/outra policy/.test(erro || '') && /Enable read access for all users/.test(erro || ''),
    'leitura aberta a qualquer sessão (to public) → aborta e nomeia');
  await b.db.close();
}
{
  // Grant de escrita que o REVOKE desta migration não alcança: vem por um
  // papel do qual authenticated é membro.
  const b = await bancada(`create role editor_legado; grant update on public.companies to editor_legado;
                           grant editor_legado to authenticated;`);
  const erro = await b.erroDe(comoDono, MIGRATION);
  check(/authenticated ainda escreve a coluna companies\./.test(erro || ''),
    'grant de escrita herdado de outro papel → a trava de grant aborta e nomeia a coluna');
  check((await b.policies()).includes('companies_tenant_rw'), '…sem aplicar nada');
  await b.db.close();
}
{
  // PUBLIC entra no REVOKE: um grant a PUBLIC não sobra.
  const b = await bancada(`grant update on public.companies to public;`);
  const erro = await b.erroDe(comoDono, MIGRATION);
  check(erro === null, `grant de UPDATE a PUBLIC é revogado junto e a migration aplica${erro ? ' — ' + erro : ''}`);
  await b.db.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ depois ═══');
const b = await bancada();
let linhas = [];
try { linhas = await b.aplica(); }
catch (e) { check(false, `a migration aplica sobre a bancada de produção — ${e.message}`); }
const divergentes = linhas.filter(r => r.esperado !== '' && r.valor !== r.esperado);
check(linhas.length === 8 && divergentes.length === 0,
  `VERIFICAÇÃO bate com o esperado${divergentes.length ? ' — ' + divergentes.map(r => `${r.item}: ${r.valor} ≠ ${r.esperado}`).join('; ') : ''}`);
check(await b.policies() === 'companies_anon_read,companies_config_update,companies_tenant_select',
  'sai companies_tenant_rw; entram a leitura da própria empresa e o UPDATE da marca');

// ── Regra 2: cobrança não se grava do cliente ───────────────────────────────
const aAntes = JSON.stringify(await b.empresa('empresa-a'));
for (const papel of PAPEIS) {
  const recusadas = [];
  for (const [col, val] of Object.entries(COBRANCA)) {
    const erro = await b.erroDe(como(papel), `update public.companies set ${col} = ${val} where id = 'empresa-a';`);
    if (!semPermissao(erro)) recusadas.push(col);
  }
  check(recusadas.length === 0 && JSON.stringify(await b.empresa('empresa-a')) === aAntes,
    `${papel}: nenhuma coluna de cobrança/cadastro gravável (42501), nada mudou${recusadas.length ? ' — passou: ' + recusadas.join(', ') : ''}`);
  const del = await b.erroDe(como(papel), `delete from public.companies where id = 'empresa-a';`);
  const ins = await b.erroDe(como(papel), `insert into public.companies (id, name, slug) values ('empresa-a2', 'X', 'x');`);
  check(semPermissao(del) && semPermissao(ins) && !!(await b.empresa('empresa-a')) && !(await b.empresa('empresa-a2')),
    `${papel}: nem apaga a empresa, nem cria outra`);
}
const mudaId = await b.erroDe(como('gestao'), `update public.companies set id = 'empresa-b2' where id = 'empresa-a';`);
check(semPermissao(mudaId), 'nem a diretoria troca o id da empresa');

// ── Regra 3: o que o app grava ──────────────────────────────────────────────
// OnboardingWizard → saveCompany({ primaryColor, logoUrl, onboardedAt }).
const LOGO = 'https://x.supabase.co/storage/v1/object/public/company-logos/empresa-a/logo-2.png';
const conclui = await b.erroDe(como('gestao'), `update public.companies
  set primary_color = '#0a0a0a', logo_url = '${LOGO}', onboarded_at = '2026-09-24T22:00:00Z'
  where id = 'empresa-a' returning 1;`);
const aConcluida = await b.empresa('empresa-a');
check(conclui === null && aConcluida.primary_color === '#0a0a0a' && aConcluida.logo_url === LOGO
   && aConcluida.onboarded_at !== null,
  'diretoria conclui o assistente: cor, logo e onboarded_at gravados (UPDATE … RETURNING 1)');

// Gerenciar → trocar e remover o logo.
await b.erroDe(como('gerencia'), `update public.companies set logo_url = null where id = 'empresa-a' returning 1;`);
check((await b.empresa('empresa-a')).logo_url === null, 'gerência remove o logo (a aba Gerenciar é dela também)');
await b.erroDe(como('gerencia'), `update public.companies set logo_url = '${LOGO}' where id = 'empresa-a' returning 1;`);
check((await b.empresa('empresa-a')).logo_url === LOGO, 'gerência sobe o logo');

for (const papel of ['colaborador', 'lideranca']) {
  await b.erroDe(como(papel), `update public.companies set logo_url = null, primary_color = '#ffffff' where id = 'empresa-a';`);
  const a = await b.empresa('empresa-a');
  check(a.logo_url === LOGO && a.primary_color === '#0a0a0a', `${papel} não troca logo nem cor (não tem a tela)`);
}

await b.erroDe(como('gestao'), `update public.companies set logo_url = null, primary_color = '#ffffff' where id = 'empresa-b';`);
const bEmp = await b.empresa('empresa-b');
check(bEmp.primary_color === '#654321', 'diretoria da A não mexe na marca da B');

// ── Regra 4: leitura ────────────────────────────────────────────────────────
const vistas = await b.ve(como('colaborador'));
check(vistas.length === 1 && vistas[0].id === 'empresa-a' && vistas[0].subscription_status === 'trialing',
  'colaborador lê a própria empresa inteira (select *), e só ela');
const anonVe = await b.ve(comoAnon);
check(anonVe.length === 2, 'anon segue lendo companies (o /entrar e o /cadastro acham a empresa)');
const anonGrava = await b.erroDe(comoAnon, `update public.companies set logo_url = null;`);
check(semPermissao(anonGrava), 'anon não grava nada');

// ── Regra 5: servidor ───────────────────────────────────────────────────────
const webhook = await b.erroDe(comoServico, `update public.companies set subscription_status = 'active',
  current_period_end = '2026-10-24', mp_preapproval_id = 'mp-a' where id = 'empresa-a';`);
check(webhook === null && (await b.empresa('empresa-a')).subscription_status === 'active',
  'service_role (webhook, cron, checkout) grava cobrança');
const prov = await b.erroDe(como('gestao'), `select public.provision_teste('empresa-c'); select public.delete_teste('empresa-c');`);
check(prov === null && !(await b.empresa('empresa-c')), 'função SECURITY DEFINER (provisionar, excluir) segue gravando');
await b.db.exec(comoDono);
const g = (await b.db.query(`select (select count(*)::int from pg_trigger where tgname = 'companies_cnpj_link') t,
                                    (select n from public.gatilho_cnpj) n`)).rows[0];
check(g.t === 1 && g.n > 0, 'o gatilho companies_cnpj_link fica e continua disparando');

// ── Regra 7: idempotência ───────────────────────────────────────────────────
const linhas2 = await b.aplica();
check(linhas2.filter(r => r.esperado !== '' && r.valor !== r.esperado).length === 0
   && await b.policies() === 'companies_anon_read,companies_config_update,companies_tenant_select',
  'roda de novo sem erro — mesmas policies, verificação batendo');
await b.db.close();

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
if (!ok) process.exitCode = 1;
