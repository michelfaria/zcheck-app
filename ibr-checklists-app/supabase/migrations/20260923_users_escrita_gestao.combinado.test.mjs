/**
 * As DUAS migrations de 23/09 juntas, na ordem do nome do arquivo:
 *   20260923_limite_usuarios.sql       — trigger de vagas `users_seat_quota`
 *                                        (JÁ EM PRODUÇÃO)
 *   20260923_users_escrita_gestao.sql  — só a diretoria escreve em `users`;
 *                                        a própria foto passa pela RPC
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260923_users_escrita_gestao.combinado.test.mjs
 *
 * Cada uma tem o próprio teste. Este existe porque as duas mexem na MESMA
 * escrita em `users` por caminhos diferentes — uma por gatilho (BEFORE ROW),
 * a outra por RLS (USING/WITH CHECK) — e a ordem em que o Postgres aplica
 * cada um decide o que o cliente vê:
 *
 *   · UPDATE/DELETE: o USING do RLS filtra as linhas ANTES do gatilho. Quem
 *     não é diretoria não alcança linha nenhuma: zero linhas, sem erro, e o
 *     gatilho de vagas nem chega a rodar.
 *   · INSERT: o gatilho BEFORE roda ANTES do WITH CHECK. Numa empresa cheia, o
 *     colaborador leva ZC_QUOTA; com vaga, leva o erro do RLS. Nos dois casos
 *     nada é gravado.
 *   · set_my_avatar (SECURITY DEFINER) não passa pelo RLS e só toca
 *     `avatar_url`/`updated_at`, colunas fora do `UPDATE OF suspended,
 *     company_id` do gatilho: a foto troca mesmo numa empresa ACIMA da
 *     capacidade.
 *   · create_user_from_request (SECURITY DEFINER) também não passa pelo RLS,
 *     então a escrita_gestao a redefine com a mesma regra — só a diretoria,
 *     só cria, só pedido pendente — mas ela passa pelo gatilho: sem vaga,
 *     ZC_QUOTA, e o pedido volta para a fila junto com o rollback.
 *
 * O que este arquivo prova, na ordem em que aparece:
 *   (1) diretoria reativando suspenso em empresa cheia → ZC_QUOTA; com vaga, passa;
 *   (2) diretoria criando o 11º numa empresa de 1 loja → ZC_QUOTA; com
 *       set_extra_seats (service_role) = 1, passa; o 12º volta a ser barrado;
 *   (3) colaborador, liderança e gerência não inserem, alteram nem apagam —
 *       nem tirando suspensão, nem por upsert, nem pela RPC de aprovação (que
 *       nem chamam mais); e a diretoria não "reaprova" quem já existe: não há
 *       caminho em volta da cota;
 *   (4) set_my_avatar numa empresa acima da capacidade funciona, o gatilho de
 *       vagas NÃO dispara (contado em pg_stat_xact_user_functions) e nenhuma
 *       outra linha muda;
 *   (5) diretoria aprovando cadastro sem vaga → ZC_QUOTA e o pedido continua
 *       pendente; com vaga, passa e o pedido sai da fila;
 *   (6) diretoria renomeia e troca PIN numa empresa acima da capacidade;
 *   (7) as duas migrations rodam de novo, na ordem, sem erro — e sobram
 *       exatamente as quatro policies, um gatilho, e as travas continuam.
 *
 * A bancada reproduz produção (conferido em 24/09/2026): colunas e nulidade de
 * `public.users`, nenhum gatilho em `users` antes de limite_usuarios, os
 * grants de 20260709_authenticated_role_grants + secure_pin_validation +
 * user_avatars (INSERT/UPDATE/DELETE de tabela, SELECT por coluna sem `pin`),
 * e as policies de 20260709_tenant_02_rls — `users_tenant_rw` e a temporária
 * `users_anon_legacy`, porque as policies de `users` em produção AINDA NÃO
 * foram conferidas e a migration tem de derrubar as duas.
 *
 * As ações rodam como o PostgREST as roda (`set role authenticated` + claims);
 * as conferências leem como dona da tabela, que não passa pelo RLS — senão um
 * UPDATE recusado e uma leitura recusada seriam indistinguíveis.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ler = f => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const LIMITE    = ler('./20260923_limite_usuarios.sql');
const ESCRITA   = ler('./20260923_users_escrita_gestao.sql');
const APROVACAO = ler('./20260726_tenant_03e_fecha_create_user_from_request.sql');
const VIEW_ATUAL = ler('./20260719_admin_views.sql')
  .match(/create or replace view public\.admin_company_health as[\s\S]*?from public\.companies co;/)?.[0];
if (!VIEW_ATUAL) throw new Error('admin_company_health não encontrada em 20260719_admin_views.sql');

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };
const detalhe = e => { try { return JSON.parse(e?.detail || ''); } catch { return null; } };
const zcQuota = (e, acao) => e?.code === 'P0001' && /^ZC_QUOTA:/.test(e?.message || '')
  && (!acao || detalhe(e)?.action === acao);
const rls = e => e?.code === '42501' && /row-level security/i.test(e?.message || '');

// Sessões. O PostgREST faz `set role` e publica o token em request.jwt.claims;
// o SQL Editor roda como postgres, sem claim nenhum.
const como = (empresa, id, papel) => `
  reset role;
  select set_config('request.jwt.claims',
    '{"role":"authenticated","company_id":"${empresa}","user_id":"${id}","user_role":"${papel}"}', false);
  set role authenticated;`;
const comoServidor = `reset role;
  select set_config('request.jwt.claims', '{"role":"service_role"}', false);
  set role service_role;`;
const comoDono   = `reset role; select set_config('request.jwt.claims', '{}', false);`;
const comoEditor = `reset role; select set_config('request.jwt.claims', '', false);`;

// Roda UM comando na sessão dada e devolve linhas afetadas OU o erro.
const roda = async (sessao, sql) => {
  await db.exec(sessao);
  try { return { n: (await db.query(sql)).affectedRows ?? 0, e: null }; }
  catch (e) { return { n: null, e }; }
};
// Aplica um arquivo de migration inteiro, como quem cola no SQL Editor.
const aplica = async sql => {
  await db.exec(comoEditor);
  try { await db.exec(sql); return null; } catch (e) { return e; }
};

// Leituras como dona da tabela: o que está GRAVADO, independente do RLS.
const linha = async id => {
  await db.exec(comoDono);
  return (await db.query(`select * from public.users where id = $1`, [id])).rows[0];
};
const retrato = async (onde = 'true') => {
  await db.exec(comoDono);
  return JSON.stringify((await db.query(`select * from public.users where ${onde} order by id`)).rows);
};
const cota = async empresa => {
  await db.exec(comoServidor);
  return (await db.query(`select public.company_user_quota($1) as q`, [empresa])).rows[0].q;
};
const vagas = async (empresa, para, esperado) => {
  await db.exec(comoServidor);
  return (await db.query(`select public.set_extra_seats($1, $2, $3, $4, 'app') as r`,
    [empresa, para, esperado, `${empresa}-dir`])).rows[0].r;
};
// As policies de `users`: nome, comando, permissiva, papéis e as expressões
// USING / WITH CHECK como o Postgres as guarda — comparadas por inteiro, para
// que um `OR` no lugar do `AND` não passe por "menciona a diretoria".
const policies = async () => {
  await db.exec(comoDono);
  const expr = t => t == null ? '-' : t === SO_EMPRESA ? 'empresa' : t === EMPRESA_E_GESTAO ? 'empresa+gestao' : t;
  return (await db.query(`select policyname, cmd, permissive, roles::text as roles, qual, with_check
                            from pg_policies
                           where schemaname = 'public' and tablename = 'users'
                           order by policyname`)).rows
    .map(p => `${p.policyname}:${p.cmd}:${p.permissive}:${p.roles}:${expr(p.qual)}:${expr(p.with_check)}`)
    .join(' | ');
};
const SO_EMPRESA       = '(company_id = jwt_company_id())';
const EMPRESA_E_GESTAO = "((company_id = jwt_company_id()) AND (jwt_user_role() = 'gestao'::text))";
const POLICIES_ESPERADAS = [
  'users_gestao_delete:DELETE:PERMISSIVE:{authenticated}:empresa+gestao:-',
  'users_gestao_insert:INSERT:PERMISSIVE:{authenticated}:-:empresa+gestao',
  'users_gestao_update:UPDATE:PERMISSIVE:{authenticated}:empresa+gestao:empresa+gestao',
  'users_tenant_select:SELECT:PERMISSIVE:{authenticated}:empresa:-',
].join(' | ');
const gatilhos = async () => {
  await db.exec(comoDono);
  return (await db.query(`select pg_get_triggerdef(oid) as d from pg_trigger
                           where tgrelid = 'public.users'::regclass and not tgisinternal`)).rows.map(r => r.d);
};

// ── Produção, em miniatura ───────────────────────────────────────────────────
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;

  -- Os default privileges do Supabase: tabela e função novas nascem abertas
  -- para anon/authenticated. set_my_avatar tem de se fechar contra isso.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  -- 20260709_tenant_01_company_id e 20260726_user_avatars
  create or replace function public.jwt_company_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'company_id', '') $$;
  create or replace function public.jwt_user_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_id', '') $$;
  create or replace function public.jwt_user_role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_role', '') $$;

  create table public.companies (
    id text primary key, name text, slug text unique, primary_color text, plan text,
    active boolean default true, created_at timestamptz default now(), onboarded_at timestamptz,
    trial_ends_at timestamptz, subscription_status text, plan_tier text, unit_limit integer,
    current_period_end timestamptz, mp_preapproval_id text, contact_email text, contact_whatsapp text
  );
  create table public.units (
    id text primary key, company_id text not null, name text not null, color text,
    active boolean not null default true, sort_order int not null default 0,
    timezone text not null default 'America/Sao_Paulo', active_from date
  );
  -- As colunas de produção, na ordem e com a nulidade conferidas no SQL Editor
  -- em 24/09/2026. \`suspended\` aceita NULL (e NULL ocupa vaga); o DEFAULT de
  -- company_id é o de 20260709_tenant_01 — o INSERT do app não manda empresa.
  create table public.users (
    id         text primary key,
    name       text not null,
    pin        text not null,
    role       text not null,
    unit_id    text,
    created_at timestamptz default now(),
    updated_at timestamptz,
    sector_id  text,
    suspended  boolean,
    company_id text default public.jwt_company_id(),
    avatar_url text
  );
  create table public.user_requests (
    id text primary key, company_id text, name text, pin text, status text default 'pendente'
  );
  create table public.events (id serial primary key, company_id text, occurred_at timestamptz);
  create table public.completions (id text primary key, company_id text, date text, completed_at text);

  -- Os grants de users em produção: o default acima deu tudo; a
  -- secure_pin_validation trocou o SELECT de tabela por SELECT por coluna (sem
  -- pin), a user_avatars somou avatar_url, e o anon ficou sem nada (03b/03c).
  revoke all on public.users from anon, authenticated;
  grant insert, update, delete on public.users to authenticated;
  grant select (id, name, role, unit_id, sector_id, company_id, suspended, updated_at, avatar_url)
    on public.users to authenticated;
  grant all on public.users to service_role;

  -- 20260709_tenant_02_rls: a definitiva (só empresa, sem papel) e a temporária
  -- do anon, que a 03 deveria ter derrubado.
  alter table public.users enable row level security;
  create policy users_tenant_rw on public.users for all to authenticated
    using (company_id = public.jwt_company_id())
    with check (company_id = public.jwt_company_id());
  create policy users_anon_legacy on public.users for all to anon using (true) with check (true);

  ${VIEW_ATUAL}
  revoke all on public.admin_company_health from anon, authenticated;
`);
await db.exec(APROVACAO);

// Empresas (todas não isentas, 0 vagas adicionais no backfill):
//   cheia  — 1 loja, 10 ativos (um com suspended NULL) + 1 suspenso: sem vaga
//   folga  — 1 loja, 5 ativos + 1 suspenso: com vaga — o que barra aqui é o RLS
//   lotada — 1 loja ativa + 1 desativada, 13 ativos + 1 suspenso: ACIMA da
//            capacidade desde antes da trava (aparece como `excess` no
//            diagnóstico da limite_usuarios)
await db.exec(`
  insert into public.companies (id, name, slug, plan, subscription_status, plan_tier) values
    ('cheia',  'Cheia',  'cheia',  'trial', 'trialing', null),
    ('folga',  'Folga',  'folga',  'trial', 'trialing', null),
    ('lotada', 'Lotada', 'lotada', 'trial', 'trialing', null);
  insert into public.units (id, company_id, name, active) values
    ('ch-1', 'cheia', 'Cheia 1', true),
    ('fo-1', 'folga', 'Folga 1', true),
    ('lot-1', 'lotada', 'Lotada 1', true),
    ('lot-off', 'lotada', 'Lotada Off', false);

  insert into public.users (id, company_id, name, pin, role, unit_id, suspended) values
    ('ch-dir', 'cheia', 'Diretora da Cheia', '9999', 'gestao',    null,   false),
    ('ch-ger', 'cheia', 'Gerente da Cheia',  '8888', 'gerencia',  'ch-1', false),
    ('ch-lid', 'cheia', 'Líder da Cheia',    '7777', 'lideranca', 'ch-1', false),
    ('ch-c7',  'cheia', 'Colab 7 (legado)',  '1111', 'colaborador', 'ch-1', null),
    ('ch-s1',  'cheia', 'Suspensa da Cheia', '1111', 'colaborador', 'ch-1', true);
  insert into public.users (id, company_id, name, pin, role, unit_id, suspended)
  select 'ch-c' || g, 'cheia', 'Colab ' || g, '1111', 'colaborador', 'ch-1', false
    from generate_series(1, 6) g;

  insert into public.users (id, company_id, name, pin, role, unit_id, suspended) values
    ('fo-dir', 'folga', 'Diretora da Folga', '9999', 'gestao',      null,   false),
    ('fo-ger', 'folga', 'Gerente da Folga',  '8888', 'gerencia',    'fo-1', false),
    ('fo-lid', 'folga', 'Líder da Folga',    '7777', 'lideranca',   'fo-1', false),
    ('fo-c1',  'folga', 'Colab 1',           '1111', 'colaborador', 'fo-1', false),
    ('fo-c2',  'folga', 'Colab 2',           '2222', 'colaborador', 'fo-1', false),
    ('fo-s1',  'folga', 'Suspensa da Folga', '3333', 'colaborador', 'fo-1', true);

  insert into public.users (id, company_id, name, pin, role, unit_id, suspended) values
    ('lot-dir', 'lotada', 'Diretora da Lotada', '9999', 'gestao',   null,            false),
    ('lot-ger', 'lotada', 'Gerente da Lotada',  '8888', 'gerencia', 'lot-1,lot-off', false),
    ('lot-s1',  'lotada', 'Suspensa da Lotada', '1111', 'colaborador', 'lot-1',      true);
  insert into public.users (id, company_id, name, pin, role, unit_id, suspended)
  select 'lot-c' || g, 'lotada', 'Colab ' || g, '1111', 'colaborador', 'lot-1', false
    from generate_series(1, 11) g;

  insert into public.user_requests (id, company_id, name, pin) values
    ('req-ch-1',  'cheia', 'Pessoa Nova 1',     '4321'),
    ('req-ch-2',  'cheia', 'Pessoa Nova 2',     '4322'),
    ('req-ch-s1', 'cheia', 'Suspensa da Cheia', '5555');
`);

// Conta chamadas de função (pg_stat_xact_user_functions): é
// como (4) prova que o gatilho de vagas nem disparou. Parâmetro de superusuário,
// vale para a sessão inteira — `set role` não o desfaz.
await db.exec(`set track_functions = 'all';`);

console.log('═══ limite_usuarios + users_escrita_gestao, juntas ═══');

// ── As duas, na ordem do nome do arquivo ─────────────────────────────────────
const e1 = await aplica(LIMITE);
check(e1 === null, `20260923_limite_usuarios aplica sobre a bancada${e1 ? `: ${e1.message}` : ''}`);

// A bancada está aberta como produção HOJE: com só a cota de pé, o colaborador
// tira a suspensão de alguém onde há vaga — é o buraco que a segunda fecha.
const antesFolga = await roda(como('folga', 'fo-c1', 'colaborador'),
  `update public.users set suspended = false where id = 'fo-s1'`);
check(antesFolga.n === 1 && (await linha('fo-s1')).suspended === false,
  'ANTES da escrita_gestao: colaborador reativa suspenso onde há vaga — a cota não barra papel');
const antesCheia = await roda(como('cheia', 'ch-c1', 'colaborador'),
  `update public.users set suspended = false where id = 'ch-s1'`);
check(zcQuota(antesCheia.e, 'reactivate'),
  'ANTES: na empresa cheia só a cota segura o colaborador (ZC_QUOTA)');
await db.exec(comoDono + `update public.users set suspended = true where id = 'fo-s1';`);

const e2 = await aplica(ESCRITA);
check(e2 === null, `20260923_users_escrita_gestao aplica DEPOIS dela${e2 ? `: ${e2.message}` : ''}`);
check(await policies() === POLICIES_ESPERADAS,
  'saem users_tenant_rw e users_anon_legacy; ficam as quatro (SELECT da empresa, escrita só da diretoria)');
const g1 = await gatilhos();
check(g1.length === 1 && /users_seat_quota BEFORE INSERT OR UPDATE OF suspended, company_id ON public\.users/.test(g1[0]),
  'e o gatilho de vagas continua de pé, intacto');

const [qCheia, qFolga, qLotada] = [await cota('cheia'), await cota('folga'), await cota('lotada')];
check(qCheia?.active_users === 10 && qCheia?.capacity === 10
   && qFolga?.active_users === 5 && qFolga?.capacity === 10
   && qLotada?.active_users === 13 && qLotada?.capacity === 10,
  `bancada: cheia ${qCheia?.active_users}/${qCheia?.capacity}, folga ${qFolga?.active_users}/${qFolga?.capacity}, ` +
  `lotada ${qLotada?.active_users}/${qLotada?.capacity} (acima da capacidade)`);

const dirCheia = como('cheia', 'ch-dir', 'gestao');
const statusDo = async id => {
  await db.exec(comoDono);
  return (await db.query(`select status from public.user_requests where id = $1`, [id])).rows[0]?.status;
};

// ── (1) Diretoria reativando suspenso em empresa cheia ───────────────────────
// É o único papel que ainda escreve na tabela — e a cota vale para ele. O
// UPDATE é o do saveUsers: a linha inteira no SET, `suspended` incluso.
const reativa = await roda(dirCheia, `update public.users
   set id = 'ch-s1', name = 'Suspensa da Cheia', role = 'colaborador', unit_id = 'ch-1',
       sector_id = null, suspended = false, updated_at = now()
 where id = 'ch-s1'`);
check(zcQuota(reativa.e, 'reactivate') && detalhe(reativa.e)?.active === 10 && detalhe(reativa.e)?.capacity === 10,
  `(1) diretoria reativando suspenso na empresa cheia → ZC_QUOTA reactivate (${reativa.e?.detail})`);
check((await linha('ch-s1')).suspended === true, '(1) e a pessoa continua suspensa');

// ── (3) Abaixo da diretoria, nenhuma escrita — nem em volta da cota ──────────
// Em cada empresa e cada papel, todas as formas de escrever que o PostgREST
// permite. UPDATE/DELETE: o USING filtra antes do gatilho, zero linhas e sem
// erro. INSERT (e o upsert, que é INSERT): erro — do RLS onde há vaga, e onde
// não há o gatilho responde primeiro, com ZC_QUOTA. Nos dois, nada gravado.
const PAPEIS = [['c1', 'colaborador'], ['lid', 'lideranca'], ['ger', 'gerencia']];
for (const [empresa, p] of [['folga', 'fo'], ['cheia', 'ch']]) {
  for (const [sufixo, papel] of PAPEIS) {
    const s = como(empresa, `${p}-${sufixo}`, papel);
    const antes = await retrato();

    const inserts = [
      await roda(s, `insert into public.users (id, name, pin, role, unit_id, suspended)
                     values ('${p}-intruso-${sufixo}', 'Intruso', '0000', 'colaborador', '${p}-1', false)`),
      await roda(s, `insert into public.users (id, name, pin, role, unit_id, suspended)
                     values ('${p}-intruso-dir-${sufixo}', 'Intruso', '0000', 'gestao', null, false)`),
      // Reativar por upsert (PostgREST Prefer: resolution=merge-duplicates).
      await roda(s, `insert into public.users (id, name, pin, role, unit_id, suspended)
                     values ('${p}-s1', 'Suspensa', '1111', 'colaborador', '${p}-1', false)
                     on conflict (id) do update set suspended = excluded.suspended`),
    ];
    const erroEsperado = e => empresa === 'folga' ? rls(e) : (rls(e) || zcQuota(e));
    check(inserts.every(r => erroEsperado(r.e)),
      `(3) ${papel} da ${empresa}: INSERT, INSERT de diretoria e upsert reativando → recusados ` +
      `(${inserts.map(r => r.e?.code ?? 'SEM ERRO').join(', ')})`);

    const escritas = [
      await roda(s, `update public.users set suspended = false where id = '${p}-s1'`),
      await roda(s, `update public.users set suspended = false`),               // PATCH sem filtro
      await roda(s, `update public.users set role = 'gestao' where id = '${p}-${sufixo}'`),
      await roda(s, `update public.users set pin = '0000' where id = '${p}-dir'`),
      await roda(s, `update public.users set unit_id = null where id = '${p}-c2'`),
      await roda(s, `delete from public.users where id = '${p}-c2'`),
      await roda(s, `delete from public.users`),
    ];
    check(escritas.every(r => r.e === null && r.n === 0),
      `(3) ${papel} da ${empresa}: tirar suspensão, promover-se, trocar PIN/loja e apagar → 0 linhas, sem erro ` +
      `(${escritas.map(r => r.e ? r.e.code : r.n).join(',')})`);
    check(await retrato() === antes, `(3) ${papel} da ${empresa}: nenhuma linha de users mudou`);
  }
}

// A RPC de aprovação era o caminho de escrita que sobrava abaixo da diretoria
// (a 03e aceitava gerência). Agora nenhum desses papéis a chama.
for (const [id, papel] of [['ch-c1', 'colaborador'], ['ch-lid', 'lideranca'], ['ch-ger', 'gerencia']]) {
  const r = await roda(como('cheia', id, papel),
    `select public.create_user_from_request('req-ch-s1', 'ch-s1', 'Suspensa da Cheia', 'colaborador', 'ch-1', null)`);
  check(/apenas a diretoria aprova cadastro/.test(r.e?.message || ''), `(3) ${papel} nem chama a RPC de aprovação`);
}
// E a diretoria não "reaprova" quem já existe: a RPC só cria. Sem isso, o
// ON CONFLICT antigo reescrevia a pessoa (sem mexer em `suspended`).
const antesReaprova = await retrato(`id = 'ch-s1'`);
const reaprova = await roda(dirCheia,
  `select public.create_user_from_request('req-ch-s1', 'ch-s1', 'Suspensa da Cheia', 'colaborador', 'ch-1', null)`);
check(/já existe/.test(reaprova.e?.message || '') && await retrato(`id = 'ch-s1'`) === antesReaprova
   && await statusDo('req-ch-s1') === 'pendente',
  '(3) diretoria "reaprovando" quem já existe (e está suspenso) é recusada — nada muda, nem o pedido');

// ── (2) Diretoria criando o 11º numa empresa de 1 loja ───────────────────────
// Como o saveUsers: INSERT sem company_id — o DEFAULT lê o token.
const onze = await roda(dirCheia, `insert into public.users (id, name, pin, role, unit_id, sector_id, suspended, updated_at)
  values ('ch-novo1', 'Novo 1', '1234', 'colaborador', 'ch-1', null, false, now())`);
check(zcQuota(onze.e, 'insert') && /10 de 10 vagas em uso/.test(onze.e?.message || ''),
  `(2) diretoria criando o 11º numa empresa de 1 loja → ZC_QUOTA insert (${onze.e?.code})`);
const onzeNulo = await roda(dirCheia, `insert into public.users (id, name, pin, role, unit_id)
  values ('ch-novo1', 'Novo 1', '1234', 'colaborador', 'ch-1')`);
check(zcQuota(onzeNulo.e, 'insert'), '(2) sem mandar `suspended` (NULL, a coluna de produção aceita) → também ZC_QUOTA');
check(!(await linha('ch-novo1')), '(2) nada gravado');

const contrata1 = await vagas('cheia', 1, 0);
check(contrata1?.ok === true && contrata1?.to === 1, '(2) service_role contrata 1 vaga adicional (set_extra_seats)');
const onzeComVaga = await roda(dirCheia, `insert into public.users (id, name, pin, role, unit_id, sector_id, suspended, updated_at)
  values ('ch-novo1', 'Novo 1', '1234', 'colaborador', 'ch-1', null, false, now())`);
check(onzeComVaga.e === null && (await linha('ch-novo1'))?.company_id === 'cheia',
  `(2) com a vaga, a diretoria cria o 11º — e ele nasce na empresa do token${onzeComVaga.e ? `: ${onzeComVaga.e.message}` : ''}`);
const doze = await roda(dirCheia, `insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('ch-novo2', 'Novo 2', '1234', 'colaborador', 'ch-1', false)`);
check(zcQuota(doze.e, 'insert') && /11 de 11 vagas em uso/.test(doze.e?.message || ''),
  '(2) e o 12º volta a ser barrado — 11 de 11');

// ── (5) Diretoria aprovando cadastro pela RPC ────────────────────────────────
// SECURITY DEFINER: passa por cima do RLS — mas não por cima do gatilho. E a
// marcação do pedido como aprovado volta junto quando o gatilho recusa.
const aprovaCheia = await roda(dirCheia,
  `select public.create_user_from_request('req-ch-1', 'ch-aprov1', 'Pessoa Nova 1', 'colaborador', 'ch-1', null)`);
check(zcQuota(aprovaCheia.e, 'insert') && /11 de 11 vagas em uso/.test(aprovaCheia.e?.message || ''),
  `(5) diretoria aprovando cadastro na empresa cheia → ZC_QUOTA insert (${aprovaCheia.e?.code})`);
check(!(await linha('ch-aprov1')) && await statusDo('req-ch-1') === 'pendente',
  '(5) nada gravado — e o pedido continua pendente, para aprovar depois de contratar');

const contrata2 = await vagas('cheia', 2, 1);
check(contrata2?.ok === true && contrata2?.to === 2, '(5) service_role contrata a 2ª vaga adicional');
const aprovaComVaga = await roda(dirCheia,
  `select public.create_user_from_request('req-ch-1', 'ch-aprov1', 'Pessoa Nova 1', 'colaborador', 'ch-1', null)`);
const aprovado = await linha('ch-aprov1');
check(aprovaComVaga.e === null && aprovado?.company_id === 'cheia' && aprovado?.pin === '4321'
   && aprovado?.suspended === false && await statusDo('req-ch-1') === 'aprovado',
  `(5) com vaga livre, a diretoria aprova — na empresa dela, com o PIN do pedido, e o pedido sai da fila${aprovaComVaga.e ? `: ${aprovaComVaga.e.message}` : ''}`);
const aprovaDe12 = await roda(dirCheia,
  `select public.create_user_from_request('req-ch-2', 'ch-aprov2', 'Pessoa Nova 2', 'colaborador', 'ch-1', null)`);
check(zcQuota(aprovaDe12.e, 'insert') && /12 de 12 vagas em uso/.test(aprovaDe12.e?.message || ''),
  '(5) a próxima aprovação volta a ser barrada — a RPC e a tabela dividem as mesmas vagas');

// ── (1), o outro lado: com vaga, a diretoria reativa ─────────────────────────
const contrata3 = await vagas('cheia', 3, 2);
const reativaComVaga = await roda(dirCheia, `update public.users set suspended = false, updated_at = now() where id = 'ch-s1'`);
check(contrata3?.ok === true && reativaComVaga.e === null && reativaComVaga.n === 1
   && (await linha('ch-s1')).suspended === false,
  `(1) com vaga contratada, a mesma reativação passa${reativaComVaga.e ? `: ${reativaComVaga.e.message}` : ''}`);

// ── (4) A própria foto, numa empresa ACIMA da capacidade ─────────────────────
// A URL que uploadUserAvatar produz — a RPC só aceita a pasta de quem chama.
const fotoDe = (empresa, id) => `https://proj.supabase.co/storage/v1/object/public/user-avatars/${empresa}/${id}/1727190000000.jpg`;
const URL_FOTO = fotoDe('lotada', 'lot-c1');
const eu = await linha('lot-c1');
const outrosAntes = await retrato(`id <> 'lot-c1'`);

// Quantas vezes cada função rodou durante UM comando. O pg_stat_xact_* mostra o
// pendente ainda não descarregado — que pode incluir transações anteriores (o
// descarregamento é espaçado, e no PGlite nem acontece) —, então vale a
// DIFERENÇA entre duas leituras na mesma transação, onde nada é descarregado.
const FUNCOES = ['set_my_avatar', 'enforce_user_seat_quota'];
const contagem = async () => {
  await db.exec('reset role;');
  const r = (await db.query(`select funcname, calls::int as n from pg_stat_xact_user_functions
                              where funcname = any($1)`, [FUNCOES])).rows;
  return Object.fromEntries(FUNCOES.map(f => [f, r.find(x => x.funcname === f)?.n ?? 0]));
};
const contaChamadas = async (sessao, sql, params = []) => {
  await db.exec('begin;');
  const antes = await contagem();
  await db.exec(sessao);
  let erro = null;
  try { await db.query(sql, params); } catch (e) { erro = e; }
  if (erro) { await db.exec('rollback;'); return { erro, chamadas: null }; }
  const depois = await contagem();
  await db.exec('commit;');
  return { erro, chamadas: Object.fromEntries(FUNCOES.map(f => [f, depois[f] - antes[f]])) };
};
const fotoEmTransacao = (sessao, url) => contaChamadas(sessao, `select public.set_my_avatar($1)`, [url]);

// O contador tem de ENXERGAR o gatilho quando ele dispara — senão "0 chamadas"
// abaixo não provaria nada. `suspended = false` em quem já é ativo dispara o
// `UPDATE OF suspended` e passa sem contar vaga.
const controle = await contaChamadas(como('lotada', 'lot-dir', 'gestao'),
  `update public.users set suspended = false where id = 'lot-c6'`);
check(controle.erro === null && controle.chamadas?.enforce_user_seat_quota === 1,
  `(4) controle: o contador vê o gatilho quando ele dispara (${JSON.stringify(controle.chamadas)})`);

const foto = await fotoEmTransacao(como('lotada', 'lot-c1', 'colaborador'), URL_FOTO);
check(foto.erro === null,
  `(4) colaborador troca a própria foto numa empresa com 13 ativos em 10 vagas${foto.erro ? `: ${foto.erro.message}` : ''}`);
check(foto.chamadas?.set_my_avatar === 1 && foto.chamadas?.enforce_user_seat_quota === 0,
  `(4) e o gatilho de vagas NÃO disparou (chamadas no comando: ${JSON.stringify(foto.chamadas)})`);
const euDepois = await linha('lot-c1');
check(euDepois.avatar_url === URL_FOTO && euDepois.updated_at !== null
   && ['id', 'name', 'pin', 'role', 'unit_id', 'sector_id', 'suspended', 'company_id', 'created_at']
        .every(c => JSON.stringify(euDepois[c]) === JSON.stringify(eu[c])),
  '(4) só avatar_url e updated_at mudaram na própria linha');
check(await retrato(`id <> 'lot-c1'`) === outrosAntes, '(4) nenhuma outra linha de users mudou');

const fotoDoColega = await roda(como('lotada', 'lot-c1', 'colaborador'),
  `update public.users set avatar_url = '${URL_FOTO}' where id = 'lot-c2'`);
check(fotoDoColega.e === null && fotoDoColega.n === 0 && (await linha('lot-c2')).avatar_url === null,
  '(4) a foto de colega pela tabela: 0 linhas');

// O token vale 7 dias: quem foi suspenso ainda o tem. A RPC troca a foto dele
// e só — não é porta para sair da suspensão.
const fotoSuspenso = await fotoEmTransacao(como('lotada', 'lot-s1', 'colaborador'), fotoDe('lotada', 'lot-s1'));
check(fotoSuspenso.erro === null && fotoSuspenso.chamadas?.enforce_user_seat_quota === 0
   && (await linha('lot-s1')).suspended === true,
  '(4) suspenso com token ainda válido troca a foto e continua suspenso — sem passar pelo gatilho');

// ── (6) Diretoria edita numa empresa acima da capacidade ─────────────────────
const dirLotada = como('lotada', 'lot-dir', 'gestao');
// O UPDATE do saveUsers com PIN novo: linha inteira no SET, suspended = false.
const renomeia = await roda(dirLotada, `update public.users
   set id = 'lot-c2', name = 'Colab Dois Renomeado', role = 'lideranca', unit_id = 'lot-1',
       sector_id = 'cozinha', suspended = false, updated_at = now(), pin = '4242'
 where id = 'lot-c2'`);
const c2 = await linha('lot-c2');
check(renomeia.e === null && renomeia.n === 1 && c2.name === 'Colab Dois Renomeado' && c2.pin === '4242'
   && c2.role === 'lideranca' && c2.suspended === false,
  `(6) diretoria renomeia, troca PIN e papel numa empresa com 13 em 10${renomeia.e ? `: ${renomeia.e.message}` : ''}`);
const soPin = await roda(dirLotada, `update public.users set pin = '5151' where id = 'lot-c3'`);
check(soPin.e === null && soPin.n === 1 && (await linha('lot-c3')).pin === '5151', '(6) só o PIN também passa');
const suspende = await roda(dirLotada, `update public.users set suspended = true where id = 'lot-c4'`);
const volta = await roda(dirLotada, `update public.users set suspended = false where id = 'lot-c4'`);
check(suspende.n === 1 && zcQuota(volta.e, 'reactivate') && (await linha('lot-c4')).suspended === true,
  '(6) suspender passa; reativar logo depois não — 12 ativos em 10 vagas');
const apaga = await roda(dirLotada, `delete from public.users where id = 'lot-c5'`);
check(apaga.e === null && apaga.n === 1 && !(await linha('lot-c5')), '(6) apagar também passa');

// ── Diretoria de uma empresa mirando a outra: responde o RLS, sem ZC_QUOTA ───
// "cheia" está sem vaga agora (13 em 13). O gatilho não conta linha de outra
// empresa escrita por token do cliente, e a policy nova recusa.
const dirFolga = como('folga', 'fo-dir', 'gestao');
const invade = await roda(dirFolga, `insert into public.users (id, company_id, name, pin, role, suspended)
  values ('espiao', 'cheia', 'Espião', '1111', 'colaborador', false)`);
check(rls(invade.e) && !/ZC_QUOTA/.test(invade.e?.message || '') && !invade.e?.detail,
  `diretoria da folga criando na cheia (sem vaga) → erro do RLS, sem ZC_QUOTA nem detail (${invade.e?.code})`);
const alcanca = await roda(dirFolga, `update public.users set suspended = false where company_id = 'cheia'`);
check(alcanca.e === null && alcanca.n === 0, 'e não alcança linha da cheia: 0 linhas');

// ── (7) As duas de novo, na ordem ────────────────────────────────────────────
const extrasAntes = (await cota('cheia'))?.extra_seats;
const r1 = await aplica(LIMITE);
const r2 = await aplica(ESCRITA);
check(r1 === null && r2 === null,
  `(7) 2ª execução das duas, na ordem, sem erro${r1 ? ` — limite: ${r1.message}` : ''}${r2 ? ` — escrita: ${r2.message}` : ''}`);
const pol2 = await policies();
check(pol2 === POLICIES_ESPERADAS, `(7) exatamente as quatro policies${pol2 === POLICIES_ESPERADAS ? '' : ` — hoje: ${pol2}`}`);
const g2 = await gatilhos();
check(g2.length === 1 && g2[0] === g1[0], '(7) um gatilho só, o mesmo');
check((await cota('cheia'))?.extra_seats === extrasAntes && extrasAntes === 3, '(7) as vagas contratadas sobrevivem');
await db.exec(comoDono);
const exec = async (papel, fn) => (await db.query(`select has_function_privilege($1, $2, 'EXECUTE') as x`, [papel, fn])).rows[0].x;
check(await exec('anon', 'public.set_my_avatar(text)') === false
   && await exec('authenticated', 'public.set_my_avatar(text)') === true,
  '(7) set_my_avatar: authenticated executa, anon não (apesar dos default privileges)');
const APROVA_FN = 'public.create_user_from_request(text,text,text,text,text,text,text)';
check(await exec('anon', APROVA_FN) === false && await exec('authenticated', APROVA_FN) === true,
  '(7) create_user_from_request redefinida: authenticated executa, anon continua sem');

const cheiaDeNovo = await roda(dirCheia, `insert into public.users (id, name, pin, role, unit_id, suspended)
  values ('ch-novo2', 'Novo 2', '1234', 'colaborador', 'ch-1', false)`);
check(zcQuota(cheiaDeNovo.e, 'insert'), '(7) depois da 2ª execução, a cota continua valendo para a diretoria');
const colabDeNovo = await roda(como('folga', 'fo-c1', 'colaborador'),
  `update public.users set suspended = false where id = 'fo-s1'`);
check(colabDeNovo.e === null && colabDeNovo.n === 0 && (await linha('fo-s1')).suspended === true,
  '(7) e o colaborador continua sem escrever');
const fotoDeNovo = await fotoEmTransacao(como('lotada', 'lot-c1', 'colaborador'), null);
check(fotoDeNovo.erro === null && (await linha('lot-c1')).avatar_url === null,
  '(7) e a foto continua trocando pela RPC (null remove)');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
