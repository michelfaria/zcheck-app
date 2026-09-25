/**
 * Teste da migration 20260925_cnpj_sucessao_grupo.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260925_cnpj_sucessao_grupo.test.mjs
 *
 * Ver o cabeçalho de 20260726_data_local_brasilia.test.mjs para o porquê do
 * PGlite (o preview branch do Supabase não serve: 11 tabelas sem `create table`).
 *
 * O banco é o de produção em miniatura, na ordem em que foi aplicado:
 * provision_company v3 (20260720_cnpj_cadastro), gatilhos de grupo
 * (20260820_grupo_cliente + 20260820_fix_source_company) e provision_company
 * v4 (20260924_slugs_reservados_landing). Primeiro prova os dois defeitos
 * nesse banco; depois aplica a migration e prova a correção:
 *
 *   1. O "Liberar novo teste para este CNPJ" do Core (allow_trial_reuse)
 *      recusava a volta de um grupo apagado. Agora o grupo volta e herda
 *      TODAS as raízes dele (empresa + lojas), com o `started_at` original.
 *   2. A recusa citava o id da outra empresa. Agora não cita.
 *
 * E o que NÃO pode abrir: /comecar com raiz já usada (apagada ou não), raiz de
 * cliente vivo por qualquer caminho, e raiz de grupo apagado pelo CNPJ de uma
 * LOJA (loja não herda grupo).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isValidCnpj } from '../../lib/cnpj.js';

const ler = f => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const MIGRATION = ler('./20260925_cnpj_sucessao_grupo.sql');
const V3        = ler('./20260720_cnpj_cadastro.sql');
const GRUPO     = ler('./20260820_grupo_cliente.sql');
const FIX       = ler('./20260820_fix_source_company.sql');
const V4        = ler('./20260924_slugs_reservados_landing.sql');

let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

// ── CNPJs fictícios (DV calculado, nenhum de empresa real) ───────────────────
const dv = base => {
  let s = 0, w = 2;
  for (let i = base.length - 1; i >= 0; i--) { s += (base.charCodeAt(i) - 48) * w; w = w === 9 ? 2 : w + 1; }
  const r = s % 11;
  return r < 2 ? 0 : 11 - r;
};
const cnpj = (raiz, ordem = '0001') => {
  const base = raiz + ordem;
  const d1 = dv(base);
  return base + d1 + dv(base + d1);
};
const A_EMP   = cnpj('81111111');          // grupo A: CNPJ da empresa (= matriz)
const A_EMP2  = cnpj('81111111', '0002');  // filial da mesma raiz
const A_LOJA  = cnpj('82222222');          // grupo A: loja com raiz própria
const C_EMP   = cnpj('83333333');          // cliente C, vivo o tempo todo
const D_EMP   = cnpj('84444444');          // grupo D, apagado e que não volta
const D_LOJA  = cnpj('85555555');
check([A_EMP, A_EMP2, A_LOJA, C_EMP, D_EMP, D_LOJA].every(isValidCnpj),
  'os CNPJs fictícios passam no validador de lib/cnpj.js');

// ── Produção, em miniatura (mesmas colunas de 20260924_slugs_reservados_landing.test) ──
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
const comoEditor = `reset role; select set_config('request.jwt.claims', '', false);`;

const db = new PGlite();
const um = async (sql, params) => (await db.query(sql, params)).rows[0];
const linhas = async (sql, params) => (await db.query(sql, params)).rows;
const erroDe = async (sql, params) => {
  try { params ? await db.query(sql, params) : await db.exec(sql); return null; } catch (e) { return e; }
};

// Payload de provision_company. `reuso` = o checkbox do Core; sem ele = /comecar.
const payload = (id, cnpjEmpresa, { reuso = false, lojas = [] } = {}) => ({
  company: {
    id, name: `Empresa ${id}`, slug: id, plan: 'trial',
    cnpj: cnpjEmpresa, legal_name: `${id} LTDA`,
    contact_name: 'Responsável', contact_email: `${id}@teste.test`,
  },
  units: lojas.map(([uid, c]) => ({ id: uid, name: `Loja ${uid}`, cnpj: c })),
  admin: { id: `${id}-adm`, name: 'Responsável', pin: '1234' },
  options: { require_cnpj: true, allow_trial_reuse: reuso },
});

// Grava de verdade (commit) ou só tenta (rollback). Sempre como service_role,
// que é quem chama provision_company nas rotas.
const provisiona = async (p, { desfaz = false } = {}) => {
  await db.exec(comoServidor);
  await db.exec('begin');
  let r;
  try { r = { r: (await um(`select public.provision_company($1::jsonb) as r`, [JSON.stringify(p)])).r }; }
  catch (e) { r = { e }; }
  await db.exec(r.e || desfaz ? 'rollback' : 'commit');
  await db.exec(comoEditor);
  return r;
};
// Escrita direta numa transação desfeita (o que o app e o Core fazem por REST).
const tentaSql = async (sql, params) => {
  await db.exec('begin');
  const e = await erroDe(sql, params);
  await db.exec('rollback');
  return e;
};
const historico = raiz => um(
  `select origin_company_id, source, outcome, ended_at, started_at
     from public.cnpj_trial_history where cnpj_root = $1`, [raiz]);

await db.exec(SCHEMA);
await db.exec(V3);
await db.exec(GRUPO);
await db.exec(FIX);
await db.exec(V4);
await db.exec(comoEditor);

console.log('═══ Sucessão de grupo no CNPJ ═══');

// ── Guarda ───────────────────────────────────────────────────────────────────
{
  const vazio = new PGlite();
  await vazio.exec(SCHEMA);
  await vazio.exec(V3);
  let e = null;
  try { await vazio.exec(MIGRATION); } catch (x) { e = x; }
  check(/aplique 20260820_grupo_cliente/.test(e?.message || ''),
    'sem os gatilhos de 20260820_grupo_cliente, a migration se recusa a rodar');
  await vazio.close();
}

// ── O cenário: grupos A e D nascem, D e A são apagados ───────────────────────
const a = await provisiona(payload('grupo-a', A_EMP, { lojas: [['a-u1', A_EMP], ['a-u2', A_LOJA]] }));
const c = await provisiona(payload('cliente-c', C_EMP, { lojas: [['c-u1', C_EMP]] }));
const d = await provisiona(payload('grupo-d', D_EMP, { lojas: [['d-u1', D_LOJA]] }));
check(!a.e && !c.e && !d.e, `A, C e D nascem pelo cadastro${[a, c, d].filter(x => x.e).map(x => `: ${x.e.message}`).join('')}`);

// O primeiro teste de A fica num instante conhecido — a volta tem de preservá-lo.
await db.exec(`update public.cnpj_trial_history set started_at = '2026-08-01T12:00:00Z'
  where origin_company_id = 'grupo-a'`);

const antes = await linhas(`select cnpj_root, origin_company_id, source from public.cnpj_trial_history order by cnpj_root`);
check(JSON.stringify(antes) === JSON.stringify([
  { cnpj_root: '81111111', origin_company_id: 'grupo-a',   source: 'company' },
  { cnpj_root: '82222222', origin_company_id: 'grupo-a',   source: 'unit' },
  { cnpj_root: '83333333', origin_company_id: 'cliente-c', source: 'company' },
  { cnpj_root: '84444444', origin_company_id: 'grupo-d',   source: 'company' },
  { cnpj_root: '85555555', origin_company_id: 'grupo-d',   source: 'unit' },
]), `cada raiz (empresa e loja) fica ligada ao seu grupo: ${JSON.stringify(antes)}`);

await db.exec(`select public.admin_delete_company('grupo-a')`);
await db.exec(`select public.admin_delete_company('grupo-d')`);
const apagados = await linhas(`select cnpj_root, outcome from public.cnpj_trial_history
  where origin_company_id in ('grupo-a', 'grupo-d') order by cnpj_root`);
check(apagados.length === 4 && apagados.every(r => r.outcome === 'deleted'),
  'admin_delete_company apaga A e D e o histórico das 4 raízes sobrevive, marcado "deleted"');

// ── ANTES da migration: os dois defeitos existem ─────────────────────────────
const voltaAntes = await provisiona(payload('grupo-a2', A_EMP, { reuso: true }), { desfaz: true });
check(/já pertence a outro cliente/.test(voltaAntes.e?.message || ''),
  `ANTES: o Core com "Liberar novo teste" é recusado pelo gatilho${voltaAntes.e ? '' : ' — PASSOU'}`);
const lojaAntes = await tentaSql(`insert into public.units (id, company_id, name, cnpj)
  values ('c-u9', 'cliente-c', 'Loja nova', $1)`, [A_LOJA]);
check(/grupo-a/.test(lojaAntes?.message || ''),
  `ANTES: a recusa da loja cita o id da outra empresa ("${lojaAntes?.message}")`);

// ── Aplica ───────────────────────────────────────────────────────────────────
const aplica = await erroDe(MIGRATION);
check(aplica === null, `a migration roda${aplica ? `: ${aplica.message}` : ''}`);

// ── (1) O grupo apagado volta pelo Core ──────────────────────────────────────
// A volta completa: empresa + as duas lojas antigas, no mesmo provision.
const volta = await provisiona(payload('grupo-a2', A_EMP,
  { reuso: true, lojas: [['a2-u1', A_EMP], ['a2-u2', A_LOJA]] }));
check(!volta.e && volta.r?.company_id === 'grupo-a2' && volta.r?.units === 2,
  `DEPOIS: o Core com "Liberar novo teste" recria A com as duas lojas${volta.e ? `: ${volta.e.message}` : ''}`);

const hA  = await historico('81111111');
const hAL = await historico('82222222');
check(hA?.origin_company_id === 'grupo-a2' && hAL?.origin_company_id === 'grupo-a2',
  'as duas raízes do grupo apagado passam para a empresa nova (empresa e loja)');
check(hA?.source === 'company' && hAL?.source === 'unit', 'a origem de cada raiz (company/unit) é mantida');
check([hA, hAL].every(h => h?.outcome === null && h?.ended_at === null),
  'o "deleted" sai: o grupo está ativo de novo');
check([hA, hAL].every(h => new Date(h?.started_at).toISOString() === '2026-08-01T12:00:00.000Z'),
  'started_at do primeiro teste é preservado nas duas raízes (o override não zera o histórico)');

const lojaDeNovo = await tentaSql(`update public.units set cnpj = $1 where id = 'a2-u1'`, [A_EMP2]);
check(lojaDeNovo === null, `a empresa que voltou troca o CNPJ da própria loja por outro da mesma raiz${lojaDeNovo ? `: ${lojaDeNovo.message}` : ''}`);

// ── O que continua fechado ───────────────────────────────────────────────────
const comecarMesmo = await provisiona(payload('outra-a', A_EMP), { desfaz: true });
check(/já está cadastrado/.test(comecarMesmo.e?.message || ''),
  `/comecar com o CNPJ de A (vivo de novo): "já está cadastrado"${comecarMesmo.e ? '' : ' — ABRIU'}`);
const comecarFilial = await provisiona(payload('outra-a', A_EMP2), { desfaz: true });
check(/já utilizou o período de teste/.test(comecarFilial.e?.message || ''),
  `/comecar com uma filial de A: "já utilizou o período de teste"${comecarFilial.e ? '' : ' — ABRIU'}`);
const comecarD = await provisiona(payload('outra-d', D_EMP), { desfaz: true });
check(/já utilizou o período de teste/.test(comecarD.e?.message || ''),
  `/comecar com o CNPJ de D (apagado): trava de teste intacta${comecarD.e ? '' : ' — ABRIU'}`);
const comecarLojaD = await provisiona(payload('outra-d', D_LOJA), { desfaz: true });
check(/já utilizou o período de teste/.test(comecarLojaD.e?.message || ''),
  `/comecar com o CNPJ da loja de D (apagado): trava de teste intacta${comecarLojaD.e ? '' : ' — ABRIU'}`);

const coreVivo = await provisiona(payload('grupo-a3', A_EMP2, { reuso: true }), { desfaz: true });
check(/vinculado a outra conta/.test(coreVivo.e?.message || ''),
  `Core com "Liberar novo teste" sobre raiz de cliente VIVO: recusado${coreVivo.e ? '' : ' — ABRIU'}`);

const lojaDeC = await tentaSql(`insert into public.units (id, company_id, name, cnpj)
  values ('c-u9', 'cliente-c', 'Loja nova', $1)`, [A_LOJA]);
check(/vinculado a outra conta/.test(lojaDeC?.message || ''),
  `C cadastra loja com raiz de A (vivo): recusado${lojaDeC ? '' : ' — ENTROU'}`);

const lojaHerda = await tentaSql(`insert into public.units (id, company_id, name, cnpj)
  values ('c-u9', 'cliente-c', 'Loja nova', $1)`, [D_LOJA]);
check(/vinculado a outra conta/.test(lojaHerda?.message || ''),
  `C cadastra loja com raiz do grupo D apagado: recusado — loja não herda grupo${lojaHerda ? '' : ' — ENTROU'}`);
const hD = await historico('85555555');
check(hD?.origin_company_id === 'grupo-d' && hD?.outcome === 'deleted', 'e a raiz de D segue de D, "deleted"');

// Sucessão pelo UPDATE do CNPJ da empresa (o PATCH do Core): herda o grupo D
// inteiro. Desfeito — só documenta que o caminho é o mesmo do INSERT.
await db.exec('begin');
const trocaC = await erroDe(`update public.companies set cnpj = $1 where id = 'cliente-c'`, [D_EMP]);
const herdou = await linhas(`select cnpj_root from public.cnpj_trial_history
  where origin_company_id = 'cliente-c' order by cnpj_root`);
await db.exec('rollback');
check(trocaC === null && JSON.stringify(herdou.map(r => r.cnpj_root)) === '["83333333","84444444","85555555"]',
  `trocar o CNPJ da empresa para o de um grupo apagado herda as raízes dele${trocaC ? `: ${trocaC.message}` : ''}`);

// ── (2) A mensagem não entrega o outro cliente ───────────────────────────────
const recusas = [coreVivo.e?.message, lojaDeC?.message, lojaHerda?.message];
check(recusas.every(m => m && !/grupo-a2|grupo-d|cliente-c|grupo-a\b/.test(m)),
  `nenhuma recusa cita o id de empresa: ${JSON.stringify(recusas[1])}`);

// ── Permissões e idempotência ────────────────────────────────────────────────
const exec = async papel => (await um(
  `select has_function_privilege('${papel}', 'public.link_cnpj_to_company(text, text, text)', 'execute') as p`)).p;
check(await exec('anon') === false && await exec('authenticated') === false,
  'anon e authenticated não executam link_cnpj_to_company direto');
const fn = async () => (await um(`select prosrc, prosecdef from pg_proc where proname = 'link_cnpj_to_company'`));
const f1 = await fn();
const segunda = await erroDe(MIGRATION);
const f2 = await fn();
check(segunda === null && f1.prosrc === f2.prosrc && f2.prosecdef === true,
  `roda 2× sem erro, função idêntica e security definer${segunda ? `: ${segunda.message}` : ''}`);

await db.close();
console.log(ok ? '\nOK' : '\nFALHOU');
process.exit(ok ? 0 : 1);
