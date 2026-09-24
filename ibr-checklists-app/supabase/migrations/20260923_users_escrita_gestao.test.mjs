/**
 * Teste da migration 20260923_users_escrita_gestao.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260923_users_escrita_gestao.test.mjs
 *
 * O que está em jogo: qualquer token de sessão — de qualquer papel — escrevia
 * em `public.users` da própria empresa. Um colaborador se promovia a diretoria,
 * tirava suspensão, mudava loja, trocava o PIN da diretoria, criava e apagava
 * gente.
 *
 * As regras que este arquivo existe para provar:
 *   1. O buraco existia — a bancada reproduz produção, e o colaborador
 *      consegue se promover ANTES da migration. Sem isso, o resto do arquivo
 *      poderia estar passando contra uma bancada que nunca esteve aberta.
 *   2. Depois dela, só `gestao` insere, altera e apaga — e só na própria empresa.
 *   3. Cada um continua trocando a PRÓPRIA foto, e nada além dela.
 *   4. Os caminhos SECURITY DEFINER e service_role seguem funcionando.
 *   5. Se houver outra policy de escrita em `users`, a migration não se aplica
 *      pela metade: desfaz tudo e diz qual é.
 *
 * Todas as ações rodam com `set role authenticated`, como o PostgREST faz com o
 * token do app. As leituras de conferência rodam como dona da tabela, que não
 * passa pelo RLS — senão um UPDATE recusado e uma leitura recusada seriam
 * indistinguíveis.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ler = f => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const APROVACAO = ler('./20260726_tenant_03e_fecha_create_user_from_request.sql');
const MIGRATION = ler('./20260923_users_escrita_gestao.sql');

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
const erroDe = async sql => { try { await db.exec(sql); return null; } catch (e) { return e.message; } };

// O estado de PRODUÇÃO antes da migration: a policy de 20260709_tenant_02_rls,
// o INSERT/UPDATE/DELETE de tabela que 20260709_authenticated_role_grants
// copiou do anon, e o SELECT por coluna de 20260709_secure_pin_validation +
// 20260726_user_avatars (o `pin` fica de fora).
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;

  create or replace function public.jwt_user_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'user_id', '') $$;
  create or replace function public.jwt_user_role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'user_role', '') $$;
  create or replace function public.jwt_company_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'company_id', '') $$;

  create table public.users (
    id text primary key,
    company_id text default public.jwt_company_id(),
    name text, pin text not null, role text, unit_id text, sector_id text,
    suspended boolean default false, updated_at timestamptz, avatar_url text
  );
  create table public.user_requests (id text primary key, company_id text, pin text);

  alter table public.users enable row level security;
  create policy users_tenant_rw on public.users
    for all to authenticated
    using      (company_id = public.jwt_company_id())
    with check (company_id = public.jwt_company_id());

  grant insert, update, delete on public.users to authenticated;
  grant select (id, name, role, unit_id, sector_id, company_id, suspended, updated_at, avatar_url)
    on public.users to authenticated;
  grant all on public.users to service_role;

  insert into public.users (id, company_id, name, pin, role, unit_id, suspended) values
    ('dir',   'empresa-a', 'Diretora',  '9999', 'gestao',      null,   false),
    ('ger',   'empresa-a', 'Gerente',   '8888', 'gerencia',    null,   false),
    ('lid',   'empresa-a', 'Líder',     '7777', 'lideranca',   'ibr1', false),
    ('joao',  'empresa-a', 'João',      '1111', 'colaborador', 'ibr1', false),
    ('maria', 'empresa-a', 'Maria',     '2222', 'colaborador', 'ibr1', false),
    ('susp',  'empresa-a', 'Suspenso',  '3333', 'colaborador', 'ibr1', true),
    ('bea',   'empresa-b', 'Bea da B',  '5555', 'gestao',      null,   false),
    ('beto',  'empresa-b', 'Beto da B', '6666', 'colaborador', 'b1',   false);
`);
await db.exec(APROVACAO);

const token = (id, papel, empresa) => JSON.stringify({ user_id: id, user_role: papel, company_id: empresa });
const como = (id, papel, empresa) =>
  `reset role; select set_config('request.jwt.claims', '${token(id, papel, empresa)}', false); set role authenticated;`;
const comoJoao    = como('joao', 'colaborador', 'empresa-a');
const comoLider   = como('lid',  'lideranca',   'empresa-a');
const comoGerente = como('ger',  'gerencia',    'empresa-a');
const comoDir     = como('dir',  'gestao',      'empresa-a');
const comoBea     = como('bea',  'gestao',      'empresa-b');
const comoDono    = `reset role; select set_config('request.jwt.claims', '{}', false);`;

// Lê como dona da tabela: o que está GRAVADO, independente do RLS.
const linha = async id => {
  await db.exec(comoDono);
  return (await db.query(`select * from public.users where id = $1`, [id])).rows[0];
};
const policies = async () => {
  await db.exec(comoDono);
  return (await db.query(`select policyname from pg_policies
                           where schemaname = 'public' and tablename = 'users'
                           order by policyname`)).rows.map(r => r.policyname).join(',');
};

console.log('═══ users: quem escreve ═══');

// ── Regra 1: a bancada está aberta como produção ─────────────────────────────
await db.exec(comoJoao + `update public.users set role = 'gestao' where id = 'joao';`);
check((await linha('joao')).role === 'gestao',
  'ANTES: o colaborador se promove a diretoria com um UPDATE na própria linha (o bug)');
await db.exec(comoJoao + `update public.users set pin = '0000' where id = 'dir';`);
check((await linha('dir')).pin === '0000',
  'ANTES: e troca o PIN da diretoria — tomada de conta, não só escalada');
await db.exec(comoDono + `update public.users set role = 'colaborador' where id = 'joao';
                          update public.users set pin = '9999' where id = 'dir';`);

await db.exec(MIGRATION);
check(await policies() === 'users_gestao_delete,users_gestao_insert,users_gestao_update,users_tenant_select',
  'a policy "tudo para qualquer papel" sai e entram as quatro novas');

// ── Regra 2: colaborador não escreve ─────────────────────────────────────────
// Tentativa recusada pode dar erro (INSERT, WITH CHECK) ou passar em silêncio
// com zero linhas (USING do UPDATE/DELETE) — as duas respostas servem. Por isso
// `erroDe` e a conferência pelo que ficou GRAVADO, não pela resposta.
await erroDe(comoJoao + `update public.users set role = 'gestao' where id = 'joao';`);
check((await linha('joao')).role === 'colaborador', 'colaborador não muda o próprio papel');

await erroDe(comoJoao + `update public.users set suspended = false where id = 'susp';`);
check((await linha('susp')).suspended === true, 'colaborador não tira suspensão de ninguém');

await erroDe(comoJoao + `update public.users set unit_id = 'ibr3' where id in ('joao', 'maria');`);
check((await linha('joao')).unit_id === 'ibr1' && (await linha('maria')).unit_id === 'ibr1',
  'colaborador não muda loja — nem a própria, nem a de colega');

await erroDe(comoJoao + `update public.users set pin = '0000' where id = 'dir';`);
check((await linha('dir')).pin === '9999', 'colaborador não troca o PIN da diretoria');

const insercao = await erroDe(comoJoao + `insert into public.users (id, name, pin, role) values ('intruso', 'Intruso', '0000', 'gestao');`);
check(/row-level security/.test(insercao || '') && !(await linha('intruso')),
  'colaborador não cria usuário');

await erroDe(comoJoao + `delete from public.users where id = 'maria';`);
check(!!(await linha('maria')), 'colaborador não apaga colega');

await erroDe(comoJoao + `update public.users set avatar_url = 'https://x/y.jpg' where id = 'joao';`);
check((await linha('joao')).avatar_url === null,
  'nem a própria foto pela tabela — foto passa a ser só pela RPC');

await db.exec(comoJoao);
const visiveis = await db.query(`select id from public.users order by id`);
check(visiveis.rows.map(r => r.id).join(',') === 'dir,ger,joao,lid,maria,susp',
  'mas continua LENDO a empresa inteira (ranking, equipe) — e só ela');

// ── Os outros papéis abaixo da diretoria ─────────────────────────────────────
await erroDe(comoLider + `update public.users set role = 'gestao' where id = 'lid';`);
check((await linha('lid')).role === 'lideranca', 'liderança não se promove');

await erroDe(comoGerente + `update public.users set role = 'gestao' where id = 'ger';`);
check((await linha('ger')).role === 'gerencia', 'gerência não se promove a diretoria');

await erroDe(comoGerente + `update public.users set suspended = true where id = 'joao';`);
check((await linha('joao')).suspended === false,
  'gerência não suspende pela tabela — não tem a aba Usuários, e o banco agora concorda');

// ── Regra 3: a própria foto ──────────────────────────────────────────────────
const URL_FOTO = 'https://proj.supabase.co/storage/v1/object/public/user-avatars/empresa-a/joao/1.jpg';
await db.exec(comoJoao + `select public.set_my_avatar('${URL_FOTO}');`);
const joaoComFoto = await linha('joao');
check(joaoComFoto.avatar_url === URL_FOTO && joaoComFoto.updated_at !== null,
  'colaborador troca a própria foto pela RPC');
check(joaoComFoto.role === 'colaborador' && joaoComFoto.unit_id === 'ibr1' && joaoComFoto.pin === '1111',
  'e a RPC não toca papel, loja nem PIN');
check((await linha('maria')).avatar_url === null, 'nem a linha de mais ninguém');

await db.exec(comoJoao + `select public.set_my_avatar(null);`);
check((await linha('joao')).avatar_url === null, 'null remove a foto e volta a inicial do nome');

// Token com user_id de outra empresa: não acontece com token assinado pelo
// servidor, mas é a conferência que a função faz por ser SECURITY DEFINER.
const cruzado = await erroDe(como('beto', 'colaborador', 'empresa-a') + `select public.set_my_avatar('${URL_FOTO}');`);
check(/não encontrado na sua empresa/.test(cruzado || '') && (await linha('beto')).avatar_url === null,
  'a RPC não alcança linha de outra empresa — e ERRA, em vez de responder ok sem gravar');

const semToken = await erroDe(`reset role; select set_config('request.jwt.claims', '{}', false); set role authenticated;
                               select public.set_my_avatar('${URL_FOTO}');`);
check(/sem sessão válida/.test(semToken || ''), 'sem token, a RPC recusa');

const anonimo = await erroDe(`reset role; set role anon; select public.set_my_avatar('${URL_FOTO}');`);
check(/permission denied/.test(anonimo || ''), 'o anon nem executa a RPC');

// ── Regra 2, o outro lado: a diretoria administra ────────────────────────────
await db.exec(comoDir + `update public.users set role = 'lideranca' where id = 'maria';`);
check((await linha('maria')).role === 'lideranca', 'diretoria muda papel');

await db.exec(comoDir + `update public.users set suspended = true where id = 'maria';`);
check((await linha('maria')).suspended === true, 'diretoria suspende');
await db.exec(comoDir + `update public.users set suspended = false where id = 'susp';`);
check((await linha('susp')).suspended === false, 'diretoria tira suspensão');

await db.exec(comoDir + `update public.users set unit_id = 'ibr2', pin = '4242' where id = 'maria';`);
const mariaEditada = await linha('maria');
check(mariaEditada.unit_id === 'ibr2' && mariaEditada.pin === '4242', 'diretoria muda loja e redefine PIN');

// Como saveUsers faz: INSERT puro, sem company_id — o DEFAULT lê o token.
await db.exec(comoDir + `insert into public.users (id, name, pin, role, unit_id) values ('novo', 'Novo', '1234', 'colaborador', 'ibr1');`);
check((await linha('novo'))?.company_id === 'empresa-a', 'diretoria cria usuário, e ele nasce na empresa do token');

await db.exec(comoDir + `delete from public.users where id = 'novo';`);
check(!(await linha('novo')), 'diretoria apaga usuário');

// ── E só na própria empresa ──────────────────────────────────────────────────
await erroDe(comoDir + `update public.users set role = 'gestao' where id = 'beto';
                         delete from public.users where id = 'beto';`);
const beto = await linha('beto');
check(beto?.role === 'colaborador', 'diretoria da A não altera nem apaga usuário da B');

const mudaEmpresa = await erroDe(comoDir + `update public.users set company_id = 'empresa-b' where id = 'maria';`);
check(/row-level security/.test(mudaEmpresa || '') && (await linha('maria')).company_id === 'empresa-a',
  'diretoria não manda usuário para outra empresa');

// Com WHERE, a policy de SELECT também confere a linha nova e já barraria a
// troca sozinha. Sem WHERE (PATCH sem filtro), só o WITH CHECK do UPDATE sobra —
// é ele que este caso prende. Dentro de transação: se passasse, desfaz.
const semFiltro = await erroDe(comoDir + `begin; update public.users set company_id = 'empresa-b';`);
await db.exec('rollback;');
check(/row-level security/.test(semFiltro || ''),
  'nem com UPDATE sem filtro — o WITH CHECK do UPDATE segura a empresa');

const criaNaOutra = await erroDe(comoDir + `insert into public.users (id, company_id, name, pin, role) values ('x', 'empresa-b', 'X', '1234', 'gestao');`);
check(/row-level security/.test(criaNaOutra || ''), 'diretoria não cria usuário em outra empresa');

await erroDe(comoBea + `update public.users set role = 'gestao' where id = 'joao';`);
check((await linha('joao')).role === 'colaborador', 'diretoria da B não alcança a A');

// ── Regra 4: os caminhos que não passam pelo RLS ─────────────────────────────
// create_user_from_request é SECURITY DEFINER e aceita GERÊNCIA — que agora
// não escreve na tabela. Se a função passasse pelo RLS, a aprovação quebraria.
await db.exec(comoDono + `insert into public.user_requests values ('req1', 'empresa-a', '4321');`);
await db.exec(comoGerente + `select public.create_user_from_request('req1', 'aprovado', 'Aprovado', 'colaborador', 'ibr1', null);`);
const aprovado = await linha('aprovado');
check(aprovado?.company_id === 'empresa-a' && aprovado?.pin === '4321',
  'gerência aprova cadastro pela RPC (insert)');
await db.exec(comoGerente + `select public.create_user_from_request('req1', 'aprovado', 'Aprovado Renomeado', 'lideranca', 'ibr2', null);`);
check((await linha('aprovado')).name === 'Aprovado Renomeado',
  'e o ON CONFLICT da mesma RPC continua atualizando');

// provision_company e /api/auth/refresh usam service_role (BYPASSRLS).
await db.exec(`reset role; select set_config('request.jwt.claims', '{}', false); set role service_role;
               insert into public.users (id, company_id, name, pin, role) values ('adm-c', 'empresa-c', 'Admin C', '1234', 'gestao');`);
check((await linha('adm-c'))?.company_id === 'empresa-c', 'service_role (provisionamento) continua escrevendo');

// ── Regra 5: idempotência e a trava ──────────────────────────────────────────
const antes = await policies();
check(await erroDe(MIGRATION) === null && await policies() === antes, 'idempotente — 2ª execução, mesmas policies');

// Uma policy de escrita criada à mão reabriria tudo (PERMISSIVE soma com OR).
// Recoloca também a policy antiga: se a migration não for atômica, ela some
// antes de a trava disparar, e o teste pega.
await db.exec(comoDono + `
  create policy users_tenant_rw on public.users
    for all to authenticated
    using (company_id = public.jwt_company_id()) with check (company_id = public.jwt_company_id());
  create policy users_edicao_manual on public.users
    for update to authenticated using (true);`);
const travou = await erroDe(MIGRATION);
check(/users_edicao_manual/.test(travou || ''),
  'com outra policy de escrita em users, a migration aborta e diz qual é');
check((await policies()).includes('users_tenant_rw'),
  'e não aplica nada pela metade: a policy antiga continua lá (transação única)');

await db.exec(comoDono + `drop policy users_edicao_manual on public.users;`);
await db.exec(MIGRATION);
check(await policies() === antes, 'removida a intrusa, a migration aplica normalmente');

await db.exec(comoDono + `alter table public.users disable row level security;`);
check(/RLS está DESLIGADO/.test(await erroDe(MIGRATION) || ''),
  'com RLS desligado em users, a migration recusa — policy sem RLS não vale nada');
await db.exec(comoDono + `alter table public.users enable row level security;`);

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
