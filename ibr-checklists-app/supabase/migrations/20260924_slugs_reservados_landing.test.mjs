/**
 * Teste da migration 20260924_slugs_reservados_landing.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260924_slugs_reservados_landing.test.mjs
 *
 * Ver o cabeçalho de 20260726_data_local_brasilia.test.mjs para o porquê do
 * PGlite (o preview branch do Supabase não serve: 11 tabelas sem `create table`).
 *
 * Dois riscos, e o teste cobre os dois:
 *
 *   1. Não reservar o que a landing mostra. `suaempresa.zcheckapp.com` está
 *      impresso no site; o /comecar transforma "Sua Empresa" em `sua-empresa`
 *      e "SuaEmpresa" em `suaempresa`. O nome passa pela `slug()` DE VERDADE,
 *      lida de app/comecar/page.js e app/onboarding/page.js.
 *   2. Mexer em mais do que a lista. A função redefinida é a do cadastro
 *      público inteiro (CNPJ, trava de trial, PIN). O corpo depois da migration
 *      tem de ser o da v3 com e sem o array — comparado no pg_proc, que é o que
 *      roda — e as 34 entradas antigas continuam recusadas uma a uma.
 *
 * E a armadilha do nome: 20260720_cnpj_cadastro (v3, viva) entrou no
 * repositório DEPOIS de 20260721_trial_14_dias (v2). A migration se recusa a
 * rodar sobre a v2 — aqui isso é provado num banco à parte.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const ler = f => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const MIGRATION = ler('./20260924_slugs_reservados_landing.sql');
const V3        = ler('./20260720_cnpj_cadastro.sql');
const V2        = ler('./20260721_trial_14_dias.sql');
const GRUPO     = ler('./20260820_grupo_cliente.sql');

const NOVOS = ['suaempresa', 'sua-empresa', 'exemplo', 'demo'];

// Quem define provision_company. Se aparecer outra migration, a lista não
// bate e o teste falha — é a hora de conferir qual é a viva.
const DEFINEM_PROVISION = [
  '20260709_tenant_04_provision.sql', '20260715_signups.sql', '20260716_billing.sql',
  '20260717_onboarding.sql', '20260720_cnpj_cadastro.sql', '20260721_trial_14_dias.sql',
  '20260924_slugs_reservados_landing.sql',
];
const definemProvisionHoje = readdirSync(DIR)
  .filter(f => f.endsWith('.sql'))
  .filter(f => /create\s+or\s+replace\s+function\s+public\.provision_company\s*\(/i.test(ler(`./${f}`)))
  .sort();

// A `slug()` do cliente, lida do arquivo: é ela que decide o endereço.
const slugDe = arquivo => {
  const fonte = readFileSync(fileURLToPath(new URL(`../../${arquivo}`, import.meta.url)), 'utf8');
  const m = fonte.match(/^const slug = (\(name\) => .+);$/m);
  if (!m) throw new Error(`const slug não encontrada em ${arquivo}`);
  return new Function(`return ${m[1]}`)();
};
const slugComecar    = slugDe('app/comecar/page.js');
const slugOnboarding = slugDe('app/onboarding/page.js');

// O array `v_reserved` de um código-fonte (arquivo ou prosrc), sem comentários.
const RE_ARRAY = /v_reserved\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/;
const reservados = src => {
  const m = src.match(RE_ARRAY);
  return m ? [...m[1].replace(/--[^\n]*/g, '').matchAll(/'([^']*)'/g)].map(x => x[1]) : null;
};
const semArray = src => src.replace(RE_ARRAY, 'v_reserved text[] := array[…];');

let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

// ── Produção, em miniatura ───────────────────────────────────────────────────
// As colunas que provision_company v2/v3 e 20260820_grupo_cliente tocam.
const SCHEMA = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create or replace function public.jwt_company_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'company_id', '') $$;

  create table public.companies (
    id text primary key, name text, slug text unique, primary_color text, plan text,
    active boolean default true, created_at timestamptz default now(), onboarded_at timestamptz,
    trial_ends_at timestamptz, subscription_status text, plan_tier text, unit_limit integer,
    current_period_end timestamptz, mp_preapproval_id text,
    contact_email text, contact_whatsapp text
  );
  create table public.units (
    id text primary key, company_id text not null, name text not null, color text,
    active boolean not null default true, sort_order int not null default 0,
    timezone text not null default 'America/Sao_Paulo', active_from date
  );
  create table public.users (
    id text primary key, company_id text default public.jwt_company_id(),
    name text not null, pin text not null, role text, unit_id text, sector_id text,
    suspended boolean default false, updated_at timestamptz default now(), avatar_url text
  );
  create table public.sectors (id text primary key, company_id text, unit_id text, name text, sort_order int);
  create table public.checklist_types (id text primary key, company_id text, name text, sort_order int);
`;

const comoServidor = `
  reset role;
  select set_config('request.jwt.claims', '{"role":"service_role"}', false);
  set role service_role;
`;
// O SQL Editor aplica como postgres, sem claim.
const comoEditor = `reset role; select set_config('request.jwt.claims', '', false);`;

const helpers = db => {
  const erroDe = async sql => { try { await db.exec(sql); return null; } catch (e) { return e; } };
  const um = async (sql, params) => (await db.query(sql, params)).rows[0];
  const funcao = () => um(`select p.prosrc, p.prosecdef, p.proconfig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'provision_company'`);
  // Cada tentativa numa transação desfeita: o CNPJ de teste serve para todas
  // e nenhuma deixa empresa, usuário ou histórico de trial para trás.
  const tenta = async p => {
    await db.exec(comoServidor);
    await db.exec('begin');
    let r;
    try { r = { r: (await um(`select public.provision_company($1::jsonb) as r`, [JSON.stringify(p)])).r }; }
    catch (e) { r = { e }; }
    await db.exec('rollback');
    await db.exec(comoEditor);
    return r;
  };
  return { erroDe, um, funcao, tenta };
};

// O payload do /comecar (api/signup/provision): CNPJ obrigatório, trial novo.
// 11.222.333/0001-81 é o CNPJ de exemplo da própria 20260720_cnpj_cadastro.
const comecar = (slug, company = {}) => ({
  company: {
    id: `${slug}-t1`, name: 'Teste', slug, plan: 'trial',
    cnpj: '11222333000181', legal_name: 'Teste LTDA',
    contact_name: 'Dona do Teste', contact_email: 'dona@teste.test', ...company,
  },
  admin: { id: `${slug}-adm`, name: 'Dona do Teste', pin: '1234' },
  options: { require_cnpj: true, allow_trial_reuse: false },
});
const reservado = r => /slug reservado/.test(r.e?.message || '');

console.log('═══ Slugs de exemplo da landing reservados ═══');

// ── Quem define a função ─────────────────────────────────────────────────────
check(JSON.stringify(definemProvisionHoje) === JSON.stringify(DEFINEM_PROVISION),
  'as migrations que definem provision_company são as conhecidas' +
  (JSON.stringify(definemProvisionHoje) === JSON.stringify(DEFINEM_PROVISION) ? '' : ` (hoje: ${definemProvisionHoje.join(', ')})`));

// ── A normalização do cliente ────────────────────────────────────────────────
const NOMES = {
  'Sua Empresa': 'sua-empresa', 'SuaEmpresa': 'suaempresa', 'Suaempresa': 'suaempresa',
  'sua  empresa!': 'sua-empresa', 'Súa Émpresa': 'sua-empresa',
  'Exemplo': 'exemplo', 'Demo': 'demo', ' DEMO ': 'demo',
};
const normalizados = Object.entries(NOMES).map(([nome, esperado]) =>
  ({ nome, esperado, comecar: slugComecar(nome), onboarding: slugOnboarding(nome) }));
check(normalizados.every(n => n.comecar === n.esperado && n.onboarding === n.esperado),
  '"Sua Empresa" vira sua-empresa e "SuaEmpresa" vira suaempresa — nas duas slug() (/comecar e /onboarding)' +
  normalizados.filter(n => n.comecar !== n.esperado || n.onboarding !== n.esperado)
    .map(n => ` [${n.nome} → ${n.comecar} / ${n.onboarding}, esperado ${n.esperado}]`).join(''));

// ── Guarda: não roda sobre a função errada ───────────────────────────────────
{
  const db = new PGlite();
  const { erroDe, funcao, tenta } = helpers(db);
  await db.exec(SCHEMA);

  await db.exec(comoEditor);
  const semFuncao = await erroDe(MIGRATION);
  check(/não é a v3/.test(semFuncao?.message || '') && (await funcao()) === undefined,
    'sem provision_company nenhuma: a guarda recusa e nada é criado');

  await db.exec(V2);
  const v2Antes = await funcao();
  const sobreV2 = await erroDe(MIGRATION);
  const v2Depois = await funcao();
  check(/não é a v3/.test(sobreV2?.message || ''),
    `sobre a v2 (20260721_trial_14_dias): a guarda recusa${sobreV2 ? '' : ' — RODOU'}`);
  check(v2Depois?.prosrc === v2Antes?.prosrc,
    'e a v2 fica como estava — a trava de CNPJ não é instalada nem a lista trocada por baixo');
  // A v2 não pede CNPJ: o payload do Core "sem CNPJ" basta.
  const demoNaV2 = await tenta({
    company: { id: 'demo-t1', name: 'Demo', slug: 'demo' },
    admin: { id: 'demo-adm', name: 'Dona', pin: '1234' },
  });
  check(demoNaV2.e === undefined, `prova do avesso: na v2 intocada, "demo" ainda entra${demoNaV2.e ? `: ${demoNaV2.e.message}` : ''}`);
  await db.close();
}

// ── Banco com a v3 viva (+ gatilhos de CNPJ de 20260820_grupo_cliente) ───────
const db = new PGlite();
const { erroDe, um, funcao, tenta } = helpers(db);
await db.exec(SCHEMA);
await db.exec(V3);
await db.exec(GRUPO);
await db.exec(comoEditor);

const ANTIGOS = reservados(V3);
check(ANTIGOS?.length === 34 && NOVOS.every(s => !ANTIGOS.includes(s)),
  `a v3 reserva 34 slugs e nenhum dos novos (${ANTIGOS?.length})`);

// O buraco existe: antes da migration, os quatro entram.
const antes = [];
for (const s of NOVOS) antes.push({ s, ...(await tenta(comecar(s))) });
check(antes.every(a => a.e === undefined && a.r?.slug === a.s),
  'ANTES: suaempresa, sua-empresa, exemplo e demo são aceitos pela v3' +
  antes.filter(a => a.e).map(a => ` [${a.s}: ${a.e.message}]`).join(''));

// Uma empresa que já tem um dos slugs (o cabeçalho da v3 cita uma "demo").
await db.exec(`insert into public.companies (id, name, slug, plan, subscription_status)
  values ('demo-antiga', 'Demo antiga', 'demo', 'trial', 'trialing')`);

const fnAntes = await funcao();
const saida = await db.exec(MIGRATION);
const fnDepois = await funcao();

// ── Resultado da migration ───────────────────────────────────────────────────
const diag = saida.at(-1).rows;
check(JSON.stringify(diag) === JSON.stringify([
  { slug: 'demo', empresa_que_ja_usa: 'demo-antiga' },
  { slug: 'exemplo', empresa_que_ja_usa: null },
  { slug: 'sua-empresa', empresa_que_ja_usa: null },
  { slug: 'suaempresa', empresa_que_ja_usa: null },
]), `o resultado lista os 4 slugs e quem já usa um deles: ${JSON.stringify(diag)}`);

// ── Só a lista mudou ─────────────────────────────────────────────────────────
check(JSON.stringify(reservados(fnDepois.prosrc)) === JSON.stringify([...ANTIGOS, ...NOVOS]),
  'a lista viva = as 34 da v3, na mesma ordem, + suaempresa, sua-empresa, exemplo, demo');
check(semArray(fnDepois.prosrc) === semArray(fnAntes.prosrc),
  'fora do array, o corpo no pg_proc é o da v3 byte a byte');
check(fnDepois.prosecdef === true && fnDepois.prosecdef === fnAntes.prosecdef
   && JSON.stringify(fnDepois.proconfig) === JSON.stringify(fnAntes.proconfig),
  `continua security definer com ${JSON.stringify(fnDepois.proconfig)}`);

// ── Os novos são recusados; os antigos continuam ─────────────────────────────
const novos = [];
for (const s of NOVOS) novos.push({ s, ...(await tenta(comecar(s))) });
check(novos.every(reservado),
  'DEPOIS: os quatro são recusados com "slug reservado"' +
  novos.filter(n => !reservado(n)).map(n => ` [${n.s}: ${n.e?.message || 'ENTROU'}]`).join(''));

const pelosNomes = [];
for (const n of normalizados) pelosNomes.push({ ...n, ...(await tenta(comecar(n.comecar, { name: n.nome }))) });
check(pelosNomes.every(reservado),
  `pelo nome digitado no /comecar (${Object.keys(NOMES).map(n => `"${n}"`).join(', ')}): todos recusados`);

const antigos = [];
for (const s of ANTIGOS) antigos.push({ s, ...(await tenta(comecar(s))) });
check(antigos.every(reservado),
  'as 34 entradas antigas continuam recusadas, uma a uma' +
  antigos.filter(a => !reservado(a)).map(a => ` [${a.s}: ${a.e?.message || 'ENTROU'}]`).join(''));

// Reserva é por igualdade, não por prefixo: nomes parecidos seguem livres.
const vizinhos = [];
for (const s of ['demo-bar', 'exemplos', 'suaempresa2']) vizinhos.push({ s, ...(await tenta(comecar(s))) });
check(vizinhos.every(v => v.e === undefined),
  'vizinhos (demo-bar, exemplos, suaempresa2) seguem livres' +
  vizinhos.filter(v => v.e).map(v => ` [${v.s}: ${v.e.message}]`).join(''));

// ── O resto do cadastro continua igual ───────────────────────────────────────
const normal = await tenta(comecar('padaria-central', { name: 'Padaria Central' }));
check(normal.e === undefined && normal.r?.slug === 'padaria-central' && normal.r?.cnpj === '11222333000181',
  `cadastro normal pelo /comecar passa e grava o CNPJ${normal.e ? `: ${normal.e.message}` : ''}`);
const semCnpj = await tenta(comecar('padaria-central', { cnpj: null }));
check(/CNPJ é obrigatório/.test(semCnpj.e?.message || ''), 'sem CNPJ continua recusado (a v3 segue viva)');

await db.exec(comoServidor);
await db.exec('begin');
await um(`select public.provision_company($1::jsonb) as r`, [JSON.stringify(comecar('padaria-central'))]);
const trial = await um(`select extract(day from trial_ends_at - now())::int as dias
  from public.companies where slug = 'padaria-central'`);
const reuso = await (async () => {
  try { await um(`select public.provision_company($1::jsonb) as r`, [JSON.stringify(comecar('outra-padaria'))]); return null; }
  catch (e) { return e; }
})();
await db.exec('rollback');
await db.exec(comoEditor);
check(trial?.dias === 13 || trial?.dias === 14, `trial de 14 dias (${trial?.dias})`);
check(/(já está cadastrado|já utilizou o período de teste)/.test(reuso?.message || ''),
  `o mesmo CNPJ não abre segunda conta${reuso ? '' : ' — ABRIU'}`);

check((await um(`select name from public.companies where id = 'demo-antiga'`))?.name === 'Demo antiga',
  'a empresa que já tinha "demo" segue lá — reservar não despeja ninguém');

// ── Permissões ───────────────────────────────────────────────────────────────
const exec = async papel => (await um(
  `select has_function_privilege('${papel}', 'public.provision_company(jsonb)', 'execute') as p`)).p;
check(await exec('anon') === false && await exec('authenticated') === false && await exec('service_role') === true,
  'só service_role executa (anon e authenticated não)');

// ── Idempotência ─────────────────────────────────────────────────────────────
const segunda = await erroDe(MIGRATION);
const fnTerceira = await funcao();
check(segunda === null, `roda 2× sem erro${segunda ? `: ${segunda.message}` : ''}`);
check(fnTerceira.prosrc === fnDepois.prosrc, '2ª execução deixa a função idêntica (sem duplicar a lista)');
const aindaRecusa = await tenta(comecar('suaempresa'));
check(reservado(aindaRecusa), 'e continua recusando depois da 2ª execução');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
