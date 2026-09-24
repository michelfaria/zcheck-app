/**
 * Teste da migration 20260924_user_requests_gestao.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260924_user_requests_gestao.test.mjs
 *
 * O que está em jogo: `public.user_requests` (pedidos do /cadastro com nome,
 * CPF, telefone, e-mail, PIN e selfie; e os pedidos de alteração de dados do
 * Meu ID). Qualquer token de sessão — colaborador inclusive — lia, alterava e
 * apagava os pedidos da própria empresa; o anon gravava pedido para qualquer
 * company_id, ou nenhum.
 *
 * As regras que este arquivo existe para provar:
 *   1. O buraco existe na bancada ANTES: o colaborador lê CPF e e-mail, troca
 *      os dados de um pedido pendente, marca como recusado e apaga; o anon
 *      grava para empresa inexistente, desativada, nenhuma, e já "aprovado".
 *      Sem isso, o resto poderia passar contra uma bancada que nunca esteve
 *      aberta.
 *   2. Depois: só a diretoria lê, altera e apaga — e só na própria empresa.
 *   3. O app continua: o /cadastro (anon) e o pedido de alteração (qualquer
 *      papel) gravam do jeito que o app grava — INSERT com `RETURNING 1`, que é
 *      o que o PostgREST roda para `.insert()` sem `.select()`. A premissa fica
 *      provada: o mesmo INSERT com `RETURNING id` é recusado para quem não é
 *      diretoria. E a diretoria carrega a fila, aprova pela RPC e recusa.
 *      Diretoria e gerência sem loja única passam a conseguir pedir alteração
 *      (antes o pedido morria no WITH CHECK, calado).
 *   4. O INSERT anônimo só entra em empresa que existe e está ativa, nasce
 *      pendente e sem revisão — e a checagem NÃO depende de o anon ler
 *      `companies` (a bancada não dá leitura nenhuma de companies ao anon).
 *   5. Os gatilhos da tabela ficam: `user_requests_company` e o
 *      `user_requests_selfie_trava` da 20260924_colaboradores_selfie_diretoria.
 *      Com o arquivo da selfie ao lado, as duas rodam nas duas ordens.
 *   6. A 20260923_users_escrita_gestao roda depois desta sem atrito, e é ELA
 *      que fecha o resíduo da aprovação por gerência (reproduzido aqui).
 *   7. Se sobrar outra policy em `user_requests`, ou se a simulação mostrar
 *      alguém abaixo da diretoria lendo pedido, a migration não se aplica pela
 *      metade: desfaz tudo e diz o que foi.
 *   8. Roda duas vezes sem erro, e as linhas de VERIFICAÇÃO/SIMULAÇÃO que ela
 *      devolve batem com o esperado.
 *
 * Todas as ações rodam com `set role` + claims, como o PostgREST faz. As
 * conferências leem como dona da tabela, que não passa pelo RLS — senão um
 * UPDATE recusado e uma leitura recusada seriam indistinguíveis.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const caminho = f => fileURLToPath(new URL(f, import.meta.url));
const ler = f => readFileSync(caminho(f), 'utf8');
const MIGRATION    = ler('./20260924_user_requests_gestao.sql');
const APROVACAO    = ler('./20260726_tenant_03e_fecha_create_user_from_request.sql');
const USERS_GESTAO = ler('./20260923_users_escrita_gestao.sql');
// A migration da selfie vive em outra branch até ser mesclada. Quando estiver
// ao lado, prova-se que as duas rodam em qualquer ordem; até lá, um substituto
// do gatilho dela prova que esta migration não o derruba.
const SELFIE_ARQ = './20260924_colaboradores_selfie_diretoria.sql';
const SELFIE = existsSync(caminho(SELFIE_ARQ)) ? ler(SELFIE_ARQ) : null;

let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

// O estado de PRODUÇÃO antes da migration.
const BANCADA = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;

  create or replace function public.jwt_user_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'user_id', '') $$;
  create or replace function public.jwt_user_role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'user_role', '') $$;
  create or replace function public.jwt_company_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'company_id', '') $$;

  -- ── storage, só o que a migration da selfie precisa ───────────────────────
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (
    id bigserial primary key, bucket_id text references storage.buckets(id),
    name text not null, owner_id text,
    created_at timestamptz default now(), updated_at timestamptz default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;
  grant usage, select on sequence storage.objects_id_seq to anon, authenticated, service_role;
  insert into storage.buckets (id, public) values ('colaboradores', false);
  create policy colaboradores_signed_read on storage.objects for select to anon
    using (bucket_id = 'colaboradores');
  create policy colaboradores_signed_read_authenticated on storage.objects for select to authenticated
    using (bucket_id = 'colaboradores');
  create policy colaboradores_anon_insert on storage.objects for insert to anon
    with check (bucket_id = 'colaboradores');

  -- ── companies: RLS ligado e NENHUMA leitura para o anon ───────────────────
  -- Em produção o anon lê companies (companies_anon_read). Aqui não, de
  -- propósito: a checagem de empresa ativa não pode depender disso.
  create table public.companies (id text primary key, name text, active boolean default true);
  alter table public.companies enable row level security;
  create policy companies_tenant_rw on public.companies for all to authenticated
    using (id = public.jwt_company_id()) with check (id = public.jwt_company_id());
  grant select on public.companies to authenticated;
  create table public.units (id text primary key, company_id text, name text);

  -- ── users, como 20260923_users_escrita_gestao.test.mjs ───────────────────
  create table public.users (
    id text primary key,
    company_id text default public.jwt_company_id(),
    name text, pin text not null, role text, unit_id text, sector_id text,
    suspended boolean default false, updated_at timestamptz, avatar_url text
  );
  alter table public.users enable row level security;
  create policy users_tenant_rw on public.users for all to authenticated
    using (company_id = public.jwt_company_id()) with check (company_id = public.jwt_company_id());
  grant insert, update, delete on public.users to authenticated;
  grant select (id, name, role, unit_id, sector_id, company_id, suspended, updated_at, avatar_url)
    on public.users to authenticated;
  grant all on public.users to service_role;

  -- ── user_requests ─────────────────────────────────────────────────────────
  create table public.user_requests (
    id          uuid primary key default gen_random_uuid(),
    name text, pin text, cpf text, phone text, email text,
    unit_id     text,
    company_id  text,
    selfie_path text,
    status      text default 'pendente',
    note text, role text, sector_id text,
    created_at  timestamptz default now(),
    reviewed_at timestamptz, reviewed_by text
  );
  alter table public.user_requests enable row level security;
  -- 20260711_tenant_03b_sweep
  create policy user_requests_anon_insert on public.user_requests for insert to anon with check (true);
  -- 20260709_tenant_02_rls
  create policy user_requests_tenant_rw on public.user_requests for all to authenticated
    using (company_id = public.jwt_company_id()) with check (company_id = public.jwt_company_id());
  -- 20260726_tenant_03d: o anon só insere. 20260709_secure_user_requests: o
  -- authenticated lê por coluna, sem pin (e sem company_id, que veio depois da
  -- lista — a policy não precisa de privilégio na coluna que cita).
  grant insert on public.user_requests to anon;
  grant select (id, name, cpf, phone, email, unit_id, selfie_path, status, note,
                role, sector_id, created_at, reviewed_at, reviewed_by)
    on public.user_requests to authenticated;
  grant insert, update, delete on public.user_requests to authenticated;
  grant all on public.user_requests to service_role;

  -- 20260709_tenant_01: sem company_id, o pedido herda a empresa da loja.
  create or replace function public.user_requests_set_company() returns trigger
  language plpgsql security definer set search_path = public as $f$
  begin
    if new.company_id is null then
      select u.company_id into new.company_id from public.units u where u.id = new.unit_id;
    end if;
    return new;
  end $f$;
  create trigger user_requests_company before insert on public.user_requests
    for each row execute function public.user_requests_set_company();

  -- ── dados ─────────────────────────────────────────────────────────────────
  insert into public.companies values
    ('empresa-a', 'A', true), ('empresa-b', 'B', true), ('empresa-off', 'Desativada', false);
  insert into public.units values
    ('a1', 'empresa-a', 'A1'), ('a2', 'empresa-a', 'A2'), ('b1', 'empresa-b', 'B1'),
    ('off1', 'empresa-off', 'Off1');
  insert into public.users (id, company_id, name, pin, role, unit_id) values
    ('dir',  'empresa-a', 'Diretora',  '9999', 'gestao',      null),
    ('ger',  'empresa-a', 'Gerente',   '8888', 'gerencia',    'a1,a2'),
    ('lid',  'empresa-a', 'Líder',     '7777', 'lideranca',   'a1'),
    ('joao', 'empresa-a', 'João',      '1111', 'colaborador', 'a1'),
    ('bea',  'empresa-b', 'Bea da B',  '5555', 'gestao',      null);
  insert into public.user_requests (name, pin, cpf, phone, email, company_id, status) values
    ('Ana',     '4321', '11111111111', '12999990001', 'ana@x.com',     'empresa-a', 'pendente'),
    ('Alberto', '4322', '22222222222', '12999990002', 'alberto@x.com', 'empresa-a', 'pendente'),
    ('Antiga',  '4323', '33333333333', '12999990003', 'antiga@x.com',  'empresa-a', 'aprovado'),
    ('Bruno',   '4324', '44444444444', '12999990004', 'bruno@x.com',   'empresa-b', 'pendente');
`;

// Substituto da seção 1 de 20260924_colaboradores_selfie_diretoria.sql, usado só
// quando o arquivo de verdade não está ao lado. Mesmo nome, mesma regra.
const GATILHO_SELFIE = `
  create or replace function public.user_requests_selfie_trava() returns trigger
  language plpgsql set search_path = '' as $f$
  begin
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
      if new.selfie_path is distinct from old.selfie_path and new.selfie_path is not null then
        raise exception 'selfie_path de um pedido de cadastro não pode ser trocado' using errcode = '42501';
      end if;
    end if;
    return new;
  end $f$;
  drop trigger if exists user_requests_selfie_trava on public.user_requests;
  create trigger user_requests_selfie_trava before insert or update on public.user_requests
    for each row execute function public.user_requests_selfie_trava();
`;

// ── Sessões ─────────────────────────────────────────────────────────────────
const token = (id, papel, empresa) =>
  JSON.stringify({ role: 'authenticated', user_id: id, user_role: papel, company_id: empresa });
const como = (id, papel, empresa) =>
  `reset role; select set_config('request.jwt.claims', '${token(id, papel, empresa)}', false); set role authenticated;`;
const comoJoao    = como('joao', 'colaborador', 'empresa-a');
const comoLider   = como('lid',  'lideranca',   'empresa-a');
const comoGerente = como('ger',  'gerencia',    'empresa-a');
const comoDir     = como('dir',  'gestao',      'empresa-a');
const comoBea     = como('bea',  'gestao',      'empresa-b');
const comoAnon    = `reset role; select set_config('request.jwt.claims', '{"role":"anon"}', false); set role anon;`;
const comoServico = `reset role; select set_config('request.jwt.claims', '{"role":"service_role"}', false); set role service_role;`;
const comoDono    = `reset role; select set_config('request.jwt.claims', '{}', false);`;
const ABAIXO = [['colaborador', comoJoao], ['liderança', comoLider], ['gerência', comoGerente]];

const q = v => v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

async function bancada({ extra = '', selfie = 'substituto' } = {}) {
  const db = new PGlite();
  await db.exec(BANCADA);
  await db.exec(APROVACAO);
  if (selfie === 'substituto') await db.exec(GATILHO_SELFIE);
  if (extra) await db.exec(extra);
  await db.exec(comoDono);

  const erroDe = async (sessao, sql) => {
    try { await db.exec(sessao + sql); return null; }
    catch (e) { return e.message; }
    finally { await db.exec(comoDono); }
  };
  // O que está GRAVADO, lido como dona.
  const pedido = async nome => {
    await db.exec(comoDono);
    return (await db.query(`select * from public.user_requests where name = $1`, [nome])).rows[0];
  };
  const total = async () => {
    await db.exec(comoDono);
    return (await db.query(`select count(*)::int as n from public.user_requests`)).rows[0].n;
  };
  // O que a sessão ENXERGA.
  const ve = async (sessao, sql = `select name, cpf, email from public.user_requests order by name`) => {
    await db.exec(sessao);
    try { return (await db.query(sql)).rows; }
    finally { await db.exec(comoDono); }
  };
  const policies = async () => {
    await db.exec(comoDono);
    return (await db.query(`select policyname from pg_policies
                             where schemaname = 'public' and tablename = 'user_requests'
                             order by policyname`)).rows.map(r => r.policyname).join(',');
  };
  const gatilhos = async () => {
    await db.exec(comoDono);
    return (await db.query(`select tgname from pg_trigger
                             where tgrelid = 'public.user_requests'::regclass and not tgisinternal
                             order by tgname`)).rows.map(r => r.tgname).join(',');
  };
  // Aplica a migration e devolve as linhas que ela mostra no SQL Editor.
  const aplica = async (sql = MIGRATION) => {
    await db.exec(comoDono);
    const res = await db.exec(sql);
    return res.filter(r => r.fields?.some(f => f.name === 'bloco')).at(-1)?.rows ?? [];
  };

  // ── O que o app manda ─────────────────────────────────────────────────────
  // /cadastro (app/cadastro/page.js, submit): anon, `.insert({...})` sem
  // `.select()` → o PostgREST roda INSERT … RETURNING 1.
  const cadastro = (campos, retorno = '1') => {
    const base = { name: 'Novo', pin: '1234', company_id: 'empresa-a', unit_id: null, cpf: '55555555555',
                   phone: '12999990005', email: 'novo@x.com', selfie_path: null, status: 'pendente', ...campos };
    const cols = Object.keys(base).join(', ');
    const vals = Object.values(base).map(q).join(', ');
    return erroDe(comoAnon, `insert into public.user_requests (${cols}) values (${vals}) returning ${retorno};`);
  };
  // Meu ID → "Solicitar alteração de dados" (app/app/page.js, handleSubmit):
  // token, sem company_id, com a loja da pessoa.
  const alteracao = (sessao, nome, unitId, extraCampos = {}, retorno = '1') => {
    const base = { name: nome, unit_id: unitId, status: 'pendente',
                   note: '[ALTERAÇÃO DE DADOS] Telefone: 12988887777', pin: '0000', ...extraCampos };
    const cols = Object.keys(base).join(', ');
    const vals = Object.values(base).map(q).join(', ');
    return erroDe(sessao, `insert into public.user_requests (${cols}) values (${vals}) returning ${retorno};`);
  };
  // A fila da diretoria (efeito "Load pending requests"), sem `pin`.
  const fila = sessao => ve(sessao, `select id, name, cpf, phone, email, unit_id, selfie_path, status, note, role,
                                            sector_id, created_at, reviewed_at, reviewed_by
                                       from public.user_requests where status = 'pendente'
                                      order by created_at asc`);

  return { db, erroDe, pedido, total, ve, policies, gatilhos, aplica, cadastro, alteracao, fila };
}

const POLICIES_NOVAS = 'user_requests_anon_insert,user_requests_gestao_delete,user_requests_gestao_select,'
                     + 'user_requests_gestao_update,user_requests_membro_insert';
const rls = e => /row-level security/.test(e || '');

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ antes: o buraco ═══');
{
  const b = await bancada();

  const lidos = await b.ve(comoJoao);
  check(lidos.length === 3 && lidos.some(r => r.cpf === '11111111111' && r.email === 'ana@x.com'),
    'ANTES: o colaborador lê nome, CPF e e-mail de todos os pedidos da empresa (o bug)');

  await b.erroDe(comoJoao, `update public.user_requests set cpf = '99999999999', email = 'golpe@x.com' where name = 'Ana';`);
  const ana = await b.pedido('Ana');
  check(ana.cpf === '99999999999' && ana.email === 'golpe@x.com',
    'ANTES: e troca CPF e e-mail de um pedido pendente antes da aprovação');

  await b.erroDe(comoJoao, `update public.user_requests set status = 'rejeitado' where name = 'Alberto';`);
  check((await b.pedido('Alberto')).status === 'rejeitado',
    'ANTES: e tira um pedido da fila marcando "rejeitado" sem a diretoria ter recusado');

  await b.erroDe(comoJoao, `delete from public.user_requests where status = 'aprovado';`);
  check(!(await b.pedido('Antiga')), 'ANTES: e apaga pedido da empresa');

  check(await b.cadastro({ name: 'Fantasma', company_id: 'empresa-que-nao-existe' }) === null
     && await b.cadastro({ name: 'Desativada', company_id: 'empresa-off' }) === null
     && await b.cadastro({ name: 'Orfao', company_id: null, unit_id: null }) === null,
    'ANTES: o anon grava pedido para empresa inexistente, desativada, e sem empresa nenhuma');
  check(await b.cadastro({ name: 'Forjado', status: 'aprovado', reviewed_by: 'dir',
                           reviewed_at: '2026-09-24T12:00:00Z' }) === null
     && (await b.pedido('Forjado'))?.reviewed_by === 'dir',
    'ANTES: e grava pedido já "aprovado pela diretoria"');

  // Um defeito, não um buraco: sem UMA loja, o gatilho não acha a empresa e o
  // WITH CHECK recusa — e o app não confere o erro, então a tela diz "enviado".
  const dirSemLoja = await b.alteracao(comoDir, 'Diretora', null);
  const gerDuasLojas = await b.alteracao(comoGerente, 'Gerente', 'a1,a2');
  check(rls(dirSemLoja) && rls(gerDuasLojas),
    'ANTES: diretoria sem loja e gerência de duas lojas NÃO conseguem pedir alteração de dados');
  await b.db.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ trava: policy que sobra ═══');
{
  const b = await bancada({ extra: `create policy "Enable read access for all users" on public.user_requests
                                      for select to public using (true);` });
  const erro = await b.erroDe(comoDono, MIGRATION);
  check(/outra policy/.test(erro || '') && /Enable read access for all users/.test(erro || ''),
    'policy de leitura feita à mão (to public) → a migration aborta e NOMEIA a policy');
  check((await b.policies()).includes('user_requests_tenant_rw') && !(await b.policies()).includes('user_requests_gestao_select'),
    '…e aborta INTEIRA: a policy antiga está lá e as novas não');
  check(await b.cadastro({ name: 'Ainda aberto', company_id: 'empresa-que-nao-existe' }) === null,
    '…o INSERT anônimo segue o de antes (with check true)');
  const def = (await b.db.query(`select column_default from information_schema.columns
                                  where table_name = 'user_requests' and column_name = 'company_id'`)).rows[0].column_default;
  check(def === null, '…e o DEFAULT de company_id não ficou');
  await b.db.close();
}
{
  const b = await bancada({ extra: `create policy edicao_manual on public.user_requests
                                      for update to authenticated using (true);` });
  const erro = await b.erroDe(comoDono, MIGRATION);
  check(/outra policy/.test(erro || '') && /edicao_manual/.test(erro || ''),
    'policy de escrita feita à mão → aborta e nomeia');
  await b.db.close();
}
{
  // Leitura que não vem de policy nenhuma: a trava por nome passa, a simulação pega.
  const b = await bancada({ extra: `alter role authenticated bypassrls;` });
  const erro = await b.erroDe(comoDono, MIGRATION);
  check(/ainda legível fora da diretoria/.test(erro || ''),
    'papel authenticated com BYPASSRLS → a SIMULAÇÃO vê o colaborador lendo e aborta');
  check((await b.policies()).includes('user_requests_tenant_rw'), '…sem aplicar nada');
  await b.db.close();
}
{
  const b = await bancada({ extra: `alter table public.user_requests disable row level security;` });
  const erro = await b.erroDe(comoDono, MIGRATION.replace(/^alter table public\.user_requests enable row level security;$/m, ''));
  check(/RLS está DESLIGADO/.test(erro || ''),
    'com RLS desligado (e sem o `enable` do começo), a trava recusa — policy sem RLS não vale nada');
  const liga = await b.erroDe(comoDono, MIGRATION);
  check(liga === null, 'a migration de verdade liga o RLS antes de tudo e aplica');
  await b.db.close();
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ depois ═══');
const b = await bancada();
const gatilhosAntes = await b.gatilhos();
let linhas = [];
try { linhas = await b.aplica(); }
catch (e) { check(false, `a migration aplica sobre a bancada de produção — ${e.message}`); }
check(await b.policies() === POLICIES_NOVAS, 'sai user_requests_tenant_rw; entram as quatro de papel e a do anon');

// ── A saída da própria migration (o que o SQL Editor mostra) ────────────────
const divergentes = linhas.filter(r => r.esperado !== '' && r.valor !== r.esperado);
check(linhas.length >= 18 && divergentes.length === 0,
  `VERIFICAÇÃO e SIMULAÇÃO batem com o esperado${divergentes.length ? ' — ' + divergentes.map(r => `${r.item}: ${r.valor} ≠ ${r.esperado}`).join('; ') : ''}`);
const dirSim = linhas.find(r => /DIRETORIA dessa empresa/.test(r.item));
check(dirSim?.valor === '3', 'a simulação conta os 3 pedidos da empresa-a para a diretoria dela');

// ── Regra 2: abaixo da diretoria, nada ──────────────────────────────────────
for (const [papel, s] of ABAIXO) {
  check((await b.ve(s)).length === 0, `${papel} não lê nenhum pedido — nem nome, nem CPF`);

  await b.erroDe(s, `update public.user_requests set cpf = '99999999999', email = 'golpe@x.com', status = 'rejeitado' where name = 'Ana';`);
  const ana = await b.pedido('Ana');
  check(ana.cpf === '11111111111' && ana.email === 'ana@x.com' && ana.status === 'pendente',
    `${papel} não troca dados nem status de pedido pendente`);

  await b.erroDe(s, `delete from public.user_requests;`);
  check(await b.total() === 4, `${papel} não apaga pedido`);
}

// ── Regra 3: o pedido de alteração, como o app manda ────────────────────────
check(await b.alteracao(comoJoao, 'João', 'a1') === null, 'colaborador pede alteração de dados (INSERT … RETURNING 1)');
const alt = await b.pedido('João');
check(alt?.company_id === 'empresa-a' && alt?.status === 'pendente' && alt?.note.startsWith('[ALTERAÇÃO DE DADOS]'),
  '…e o pedido nasce na empresa do token, pendente');
check(await b.alteracao(comoLider, 'Líder', 'a1') === null, 'liderança também');
check(await b.alteracao(comoDir, 'Diretora', null) === null && (await b.pedido('Diretora'))?.company_id === 'empresa-a',
  'diretoria SEM loja agora consegue (DEFAULT de company_id) — antes morria no WITH CHECK');
check(await b.alteracao(comoGerente, 'Gerente', 'a1,a2') === null && (await b.pedido('Gerente'))?.company_id === 'empresa-a',
  'gerência de duas lojas também');

const comSelect = await b.alteracao(comoJoao, 'João de novo', 'a1', {}, 'id');
check(rls(comSelect) && !(await b.pedido('João de novo')),
  'PREMISSA: o mesmo INSERT com RETURNING id (um `.select()` no cliente) é recusado — por isso o app não pode pedir retorno');

// O que o colaborador NÃO consegue pôr num pedido.
const RECUSADOS = [
  [{ company_id: 'empresa-b' },                                        'na empresa B'],
  [{ status: 'aprovado' },                                             'já aprovado'],
  [{ reviewed_by: 'dir', reviewed_at: '2026-09-24T12:00:00Z' },        'com revisão preenchida'],
  [{ selfie_path: 'selfie-de-alguem.jpg' },                            'citando uma selfie'],
];
for (const [campos, caso] of RECUSADOS) {
  const erro = await b.alteracao(comoJoao, `Intruso ${caso}`, 'a1', campos);
  check(rls(erro) && !(await b.pedido(`Intruso ${caso}`)), `colaborador não grava pedido ${caso}`);
}

// ── Regra 2, o outro lado: a diretoria administra a fila ────────────────────
const filaA = await b.fila(comoDir);
check(filaA.map(r => r.name).sort().join(',') === 'Alberto,Ana,Diretora,Gerente,João,Líder',
  'diretoria A carrega a fila como o app: os pendentes da A (cadastros e alterações), nenhum da B');
check(filaA.find(r => r.name === 'Ana')?.cpf === '11111111111', '…com CPF, para conferir');
check((await b.ve(comoDir, `select name from public.user_requests where status = 'aprovado'`)).length === 1,
  '…e o histórico (aprovados) da A');
const semPin = await b.erroDe(comoDir, `select pin from public.user_requests;`);
check(/permission denied/.test(semPin || ''), '…mas nem a diretoria lê o PIN');
check((await b.fila(comoBea)).map(r => r.name).join(',') === 'Bruno', 'diretoria B vê só a fila da B');

// Aprovação como o app faz: RPC (versão de produção, 20260726_tenant_03e) e
// depois o UPDATE do pedido.
const anaId = (await b.pedido('Ana')).id;
const aprova = await b.erroDe(comoDir, `
  select public.create_user_from_request('${anaId}', 'u-ana', 'Ana Souza', 'colaborador', 'a1', null, null);
  update public.user_requests set status = 'aprovado', name = 'Ana Souza', note = null, role = 'colaborador',
         sector_id = null, reviewed_at = now(), reviewed_by = 'dir'
   where id = '${anaId}' returning 1;`);
const anaAprovada = await b.pedido('Ana Souza');
await b.db.exec(comoDono);
const usuarioAna = (await b.db.query(`select * from public.users where id = 'u-ana'`)).rows[0];
check(aprova === null && anaAprovada?.status === 'aprovado' && anaAprovada?.reviewed_by === 'dir'
   && usuarioAna?.pin === '4321' && usuarioAna?.company_id === 'empresa-a',
  'diretoria aprova pela RPC e marca o pedido — acesso criado com o PIN do pedido');

await b.erroDe(comoDir, `update public.user_requests set status = 'rejeitado', reviewed_at = now(), reviewed_by = 'dir'
                          where name = 'Alberto' returning 1;`);
check((await b.pedido('Alberto')).status === 'rejeitado', 'diretoria recusa');

await b.erroDe(comoDir, `delete from public.user_requests where name = 'Líder';`);
check(!(await b.pedido('Líder')), 'diretoria apaga pedido da empresa');

await b.erroDe(comoDir, `update public.user_requests set status = 'rejeitado' where name = 'Bruno';
                         delete from public.user_requests where name = 'Bruno';`);
check((await b.pedido('Bruno'))?.status === 'pendente', 'diretoria A não altera nem apaga pedido da B');
const mudaEmpresa = await b.erroDe(comoDir, `update public.user_requests set company_id = 'empresa-b' where name = 'Gerente';`);
check(rls(mudaEmpresa) && (await b.pedido('Gerente')).company_id === 'empresa-a',
  'diretoria não manda pedido para outra empresa (WITH CHECK do UPDATE)');
// Dentro de transação: se passasse, desfaz. (Sem `erroDe`: depois do erro a
// transação explícita fica abortada até o rollback.)
let semFiltro = null;
try { await b.db.exec(comoDir + `begin; update public.user_requests set company_id = 'empresa-b';`); }
catch (e) { semFiltro = e.message; }
await b.db.exec('rollback;');
await b.db.exec(comoDono);
check(rls(semFiltro) && (await b.pedido('Gerente')).company_id === 'empresa-a', 'nem com UPDATE sem filtro');

// ── Regra 4: /cadastro ──────────────────────────────────────────────────────
check(await b.cadastro({ name: 'Carla', selfie_path: 'uuid-carla.jpg' }) === null,
  '/cadastro como o app manda: anon, empresa ativa, sem loja, com selfie (INSERT … RETURNING 1)');
const carla = await b.pedido('Carla');
check(carla?.company_id === 'empresa-a' && carla?.status === 'pendente', '…pendente na empresa certa');
check((await b.fila(comoDir)).some(r => r.name === 'Carla'), '…e aparece na fila da diretoria A');
check(await b.cadastro({ name: 'Daniel', company_id: null, unit_id: 'a2' }) === null
   && (await b.pedido('Daniel'))?.company_id === 'empresa-a',
  'bundle velho (só a loja, sem company_id): o gatilho deriva a empresa e passa');

const antesAnon = await b.total();
const ANON_RECUSADOS = [
  [{ company_id: 'empresa-que-nao-existe' },                              'para empresa inexistente'],
  [{ company_id: 'empresa-off' },                                         'para empresa desativada'],
  [{ company_id: null, unit_id: 'off1' },                                 'pela loja de empresa desativada'],
  [{ company_id: null, unit_id: null },                                   'sem empresa nenhuma'],
  [{ status: 'aprovado' },                                                'já aprovado'],
  [{ status: null },                                                      'sem status'],
  [{ reviewed_by: 'dir', reviewed_at: '2026-09-24T12:00:00Z' },           'com revisão forjada'],
];
for (const [campos, caso] of ANON_RECUSADOS) {
  check(rls(await b.cadastro({ name: `Anon ${caso}`, ...campos })), `anon não grava pedido ${caso}`);
}
check(await b.total() === antesAnon, '…e nenhuma dessas tentativas deixou linha');

const anonLe = await b.erroDe(comoAnon, `select name from public.user_requests;`);
check(/permission denied/.test(anonLe || ''), 'anon continua sem ler a tabela');
const anonCompanies = await b.erroDe(comoAnon, `select id from public.companies;`);
check(/permission denied/.test(anonCompanies || ''),
  'a bancada não dá leitura de companies ao anon — a checagem de empresa ativa não depende dela');

await b.db.exec(comoAnon);
const oraculo = (await b.db.query(`select public.user_requests_empresa_ativa('empresa-a') as a,
                                          public.user_requests_empresa_ativa('empresa-off') as off,
                                          public.user_requests_empresa_ativa(null) as nulo`)).rows[0];
await b.db.exec(comoDono);
check(oraculo.a === true && oraculo.off === false && oraculo.nulo === false,
  'o anon executa a função (a policy precisa) — responde só se o id existe e está ativo');
const authExecuta = await b.erroDe(comoJoao, `select public.user_requests_empresa_ativa('empresa-a');`);
check(/permission denied/.test(authExecuta || ''), 'o authenticated não executa (nenhuma policy dele a chama)');

// service_role (provisionamento, rotas de servidor): BYPASSRLS.
const servico = await b.erroDe(comoServico, `insert into public.user_requests (name, company_id, status)
                                              values ('Pelo servidor', 'empresa-off', 'aprovado');`);
check(servico === null && (await b.ve(comoServico, `select count(*)::int as n from public.user_requests`))[0].n === await b.total(),
  'service_role segue lendo e gravando tudo');

// ── Regra 5: os gatilhos ficam ──────────────────────────────────────────────
check(await b.gatilhos() === gatilhosAntes && gatilhosAntes === 'user_requests_company,user_requests_selfie_trava',
  'os gatilhos da tabela são os mesmos de antes (user_requests_company e user_requests_selfie_trava)');
const trocaSelfie = await b.erroDe(comoDir, `update public.user_requests set selfie_path = 'outra.jpg' where name = 'Carla';`);
check(/não pode ser trocado/.test(trocaSelfie || '') && (await b.pedido('Carla')).selfie_path === 'uuid-carla.jpg',
  '…e o da selfie continua valendo por cima da policy: nem a diretoria aponta o pedido para outra selfie');

// ── Regra 8: idempotência ───────────────────────────────────────────────────
const linhas2 = await b.aplica();
check(await b.policies() === POLICIES_NOVAS && linhas2.filter(r => r.esperado !== '' && r.valor !== r.esperado).length === 0,
  'roda de novo sem erro — mesmas policies, verificação batendo');

// ── Regra 6: o resíduo da aprovação, e quem o fecha ─────────────────────────
// Com a RPC de produção (03e), a gerência ainda aprova e o ON CONFLICT
// reescreve quem já existe. Ela não lê mais id de pedido nenhum, mas escolhe o
// id do pedido que ela mesma insere (INSERT de pedido é de qualquer papel).
const ID_ESCOLHIDO = '00000000-0000-0000-0000-00000000beef';
await b.erroDe(comoGerente, `insert into public.user_requests (id, name, pin, status) values ('${ID_ESCOLHIDO}', 'x', '0000', 'pendente') returning 1;`);
await b.erroDe(comoGerente, `select public.create_user_from_request('${ID_ESCOLHIDO}', 'joao', 'João', 'gerencia', 'a1', null, '0000');`);
await b.db.exec(comoDono);
const joao = (await b.db.query(`select role, pin from public.users where id = 'joao'`)).rows[0];
check(joao.role === 'gerencia' && joao.pin === '0000',
  'RESÍDUO (não é desta migration): com a RPC de produção, a gerência ainda reescreve um usuário por um pedido que ela mesma inseriu');
await b.db.exec(`update public.users set role = 'colaborador', pin = '1111' where id = 'joao';
                 delete from public.user_requests where id = '${ID_ESCOLHIDO}';`);

// A 20260923_users_escrita_gestao depois desta: roda, e fecha o resíduo.
const escrita = await b.erroDe(comoDono, USERS_GESTAO);
check(escrita === null, `20260923_users_escrita_gestao roda depois desta sem erro${escrita ? ' — ' + escrita : ''}`);
await b.erroDe(comoGerente, `insert into public.user_requests (id, name, pin, status) values ('${ID_ESCOLHIDO}', 'x', '0000', 'pendente') returning 1;`);
const gerAtaca = await b.erroDe(comoGerente, `select public.create_user_from_request('${ID_ESCOLHIDO}', 'joao', 'João', 'gerencia', 'a1', null, '0000');`);
await b.db.exec(comoDono);
const joao2 = (await b.db.query(`select role, pin from public.users where id = 'joao'`)).rows[0];
check(/apenas a diretoria/.test(gerAtaca || '') && joao2.role === 'colaborador' && joao2.pin === '1111',
  '…e com ela o resíduo fecha: a gerência não aprova mais nada');
const carlaId = (await b.pedido('Carla')).id;
const aprova2 = await b.erroDe(comoDir, `select public.create_user_from_request('${carlaId}', 'u-carla', 'Carla', 'colaborador', 'a1', null, null);`);
check(aprova2 === null && (await b.pedido('Carla')).status === 'aprovado',
  'a diretoria aprova pela RPC nova, com as policies desta migration no lugar');
check(await b.policies() === POLICIES_NOVAS && (await b.aplica()).filter(r => r.esperado !== '' && r.valor !== r.esperado).length === 0,
  'e esta migration roda de novo depois da escrita_gestao, igual');
await b.db.close();

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ com a migration da selfie ═══');
if (!SELFIE) {
  console.log(`  – ${SELFIE_ARQ} não está nesta branch: provado com o substituto do gatilho (acima).`);
} else {
  for (const ordem of ['selfie → esta', 'esta → selfie']) {
    const s = await bancada({ selfie: 'real' });
    const primeiro = ordem.startsWith('selfie') ? SELFIE : MIGRATION;
    const segundo  = ordem.startsWith('selfie') ? MIGRATION : SELFIE;
    const e1 = await s.erroDe(comoDono, primeiro);
    const e2 = await s.erroDe(comoDono, segundo);
    check(e1 === null && e2 === null, `${ordem}: as duas rodam sem erro${e1 || e2 ? ' — ' + (e1 || e2) : ''}`);
    check(await s.policies() === POLICIES_NOVAS
       && (await s.gatilhos()) === 'user_requests_company,user_requests_selfie_trava',
      `${ordem}: policies desta migration e os dois gatilhos no lugar`);

    // O /cadastro inteiro: sobe a selfie (INSERT puro no storage) e grava o pedido.
    const up = await s.erroDe(comoAnon, `insert into storage.objects (bucket_id, name) values ('colaboradores', 'uuid-eva.jpg');`);
    const ped = await s.cadastro({ name: 'Eva', selfie_path: 'uuid-eva.jpg' });
    check(up === null && ped === null, `${ordem}: /cadastro sobe a selfie e grava o pedido`);
    const veSelfie = async sessao => {
      await s.db.exec(sessao);
      try { return (await s.db.query(`select name from storage.objects where bucket_id = 'colaboradores'`)).rows.map(r => r.name); }
      finally { await s.db.exec(comoDono); }
    };
    check((await veSelfie(comoDir)).includes('uuid-eva.jpg') && (await s.fila(comoDir)).some(r => r.name === 'Eva'),
      `${ordem}: a diretoria A vê o pedido e a selfie`);
    check((await veSelfie(comoJoao)).length === 0 && (await s.ve(comoJoao)).length === 0,
      `${ordem}: o colaborador não vê nem o pedido nem a selfie`);
    const aponta = await s.alteracao(comoJoao, 'Aponta', 'a1', { selfie_path: 'uuid-eva.jpg' });
    check(rls(aponta), `${ordem}: pedido autenticado não cita selfie (não entra na disputa de dono)`);
    await s.db.close();
  }
}

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
if (!ok) process.exitCode = 1;
