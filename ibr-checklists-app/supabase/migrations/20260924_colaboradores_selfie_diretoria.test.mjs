/**
 * Teste da migration 20260924_colaboradores_selfie_diretoria.sql (bucket `colaboradores`).
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260924_colaboradores_selfie_diretoria.test.mjs
 *
 * O que está em jogo: a selfie (e, nos objetos antigos, o CPF no nome) de quem
 * se cadastra pelo /cadastro, legível por qualquer um com a anon key — que é
 * pública — e por qualquer token de sessão de qualquer empresa.
 *
 * O PGlite não tem o serviço de Storage. Como em
 * 20260924_storage_checklist_photos.test.mjs, a bancada reproduz o que importa:
 * `storage.objects` com RLS e cada operação da API como o SQL que ela executa
 * COM O PAPEL de quem chama:
 *
 *   upload sem upsert (/cadastro)  → INSERT, sem RETURNING (storage-api:
 *                                    canUpload → testPermission(createObject))
 *   URL assinada / listar          → SELECT
 *
 * As regras que este arquivo existe para provar:
 *   1. O buraco existe na bancada ANTES: anon e um colaborador de outra empresa
 *      listam as selfies de todo mundo.
 *   2. Depois: só a diretoria da empresa DONA vê a selfie. Colaborador, gerência,
 *      token sem papel e anon não veem nada.
 *   3. O /cadastro continua: o anon sobe a selfie (INSERT puro) e grava o pedido;
 *      a diretoria da empresa vê a selfie nova. A premissa fica provada: o
 *      mesmo INSERT com RETURNING seria recusado — é só o INSERT puro que passa.
 *   4. Ponteiro não dá posse. Pedido apontando para a selfie alheia — pelo anon,
 *      pela diretoria de uma empresa em teste, com created_at forjado, por
 *      UPDATE — não abre nada; e pedido forjado depois da dona não esconde a
 *      selfie dela.
 *   5. As funções não ficam expostas a quem não precisa.
 *   6. O resto do storage não muda: company-logos e checklist-photos seguem como
 *      estavam (quem fecha checklist-photos é a 20260924_storage_01).
 *   7. Se sobrar leitura de selfie por uma policy feita à mão, a migration não
 *      se aplica pela metade: desfaz tudo e diz qual é.
 *   8. Roda duas vezes sem erro, com ou sem `anon_storage_all`, e o relatório
 *      final bate.
 *
 * O que NÃO dá para provar aqui (lista completa no relatório da entrega e no
 * rodapé da migration): que o storage-api de produção emite exatamente esses
 * comandos, que o `postgres` do SQL Editor assume anon/authenticated e enxerga
 * `user_requests` inteira, e o tipo real de `user_requests.created_at`.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const caminho = f => fileURLToPath(new URL(f, import.meta.url));
const ler = f => readFileSync(caminho(f), 'utf8');
const MIGRATION = ler('./20260924_colaboradores_selfie_diretoria.sql');
// A 01 de checklist-photos vive em outra branch até ser mesclada. Quando
// estiver ao lado, prova-se também que as duas rodam em qualquer ordem.
const M01_ARQ = './20260924_storage_01_checklist_photos_tenant.sql';
const M01 = existsSync(caminho(M01_ARQ)) ? ler(M01_ARQ) : null;

let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

// O estado de PRODUÇÃO antes da migration.
const BANCADA = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;

  create or replace function public.jwt_company_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'company_id', '') $$;
  create or replace function public.jwt_user_id() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'user_id', '') $$;
  create or replace function public.jwt_user_role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'user_role', '') $$;

  -- ── storage, como o Supabase ──────────────────────────────────────────────
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false);
  create table storage.objects (
    id         bigserial primary key,
    bucket_id  text references storage.buckets(id),
    name       text not null,
    owner_id   text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (bucket_id, name)
  );
  create function storage.foldername(name text) returns text[] language plpgsql as $f$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end $f$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;
  grant usage, select on sequence storage.objects_id_seq to anon, authenticated, service_role;

  insert into storage.buckets (id, public) values
    ('colaboradores', false), ('checklist-photos', false), ('company-logos', true);

  -- As policies de produção: a permissiva feita à mão (sem filtro de bucket),
  -- as duas leituras de selfie de 20260709 e o INSERT anônimo de 20260724.
  create policy anon_storage_all on storage.objects for all to anon using (true) with check (true);
  create policy colaboradores_signed_read on storage.objects for select to anon
    using (bucket_id = 'colaboradores');
  create policy colaboradores_signed_read_authenticated on storage.objects for select to authenticated
    using (bucket_id = 'colaboradores');
  create policy colaboradores_anon_insert on storage.objects for insert to anon
    with check (bucket_id = 'colaboradores');
  create policy company_logos_public_read on storage.objects for select to anon, authenticated
    using (bucket_id = 'company-logos');

  -- ── public ────────────────────────────────────────────────────────────────
  create table public.companies (id text primary key, name text);
  create table public.units (id text primary key, company_id text, name text);
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
  -- 20260711_tenant_03b_sweep: o anon insere QUALQUER coisa.
  create policy user_requests_anon_insert on public.user_requests for insert to anon with check (true);
  -- 20260709_tenant_02_rls: FOR ALL na própria empresa, sem papel.
  create policy user_requests_tenant_rw on public.user_requests for all to authenticated
    using (company_id = public.jwt_company_id()) with check (company_id = public.jwt_company_id());
  grant insert on public.user_requests to anon;
  grant select (id, name, cpf, phone, email, unit_id, selfie_path, status, note, role,
                sector_id, created_at, reviewed_at, reviewed_by, company_id)
    on public.user_requests to authenticated;
  grant insert, update, delete on public.user_requests to authenticated;

  -- 20260709_tenant_01: o tenant do pedido anônimo sai da loja quando não vem.
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

  -- Empresa A e B (clientes), M (empresa em teste de quem ataca).
  insert into public.companies values ('empresa-a', 'A'), ('empresa-b', 'B'), ('empresa-m', 'M');
  insert into public.units values ('a1', 'empresa-a', 'Loja A1');

  -- Selfies já no bucket, com a hora do upload. O pedido legítimo nasceu
  -- segundos depois de cada uma (a ordem do /cadastro).
  insert into storage.objects (bucket_id, name, created_at) values
    ('colaboradores', 'sa.jpg',                        '2026-09-20 10:00:00+00'),
    ('colaboradores', 'sb.jpg',                        '2026-09-20 11:00:00+00'),
    ('colaboradores', '1751900000000-12345678900.jpg', '2026-07-07 12:00:00+00'),  -- antiga, CPF no nome
    ('colaboradores', 'orfa.jpg',                      '2026-09-01 09:00:00+00'),  -- upload sem pedido
    ('checklist-photos', 'ca1/i1.jpg',                 '2026-09-20 10:00:00+00'),
    ('company-logos', 'empresa-a/logo.png',            '2026-09-01 00:00:00+00');
  insert into public.user_requests (name, company_id, selfie_path, created_at) values
    ('Ana',   'empresa-a', 'sa.jpg',                        '2026-09-20 10:00:03+00'),
    ('Bruno', 'empresa-b', 'sb.jpg',                        '2026-09-20 11:00:02+00'),
    ('Caio',  'empresa-a', '1751900000000-12345678900.jpg', '2026-07-07 12:00:01+00');
`;

// ── Papéis ──────────────────────────────────────────────────────────────────
const token = (empresa, papel) => JSON.stringify({ role: 'authenticated', user_id: `u-${empresa}-${papel}`, user_role: papel, company_id: empresa });
const como     = (empresa, papel) => `reset role; select set_config('request.jwt.claims', '${token(empresa, papel)}', false); set role authenticated;`;
const comoAnon = `reset role; select set_config('request.jwt.claims', '{"role":"anon"}', false); set role anon;`;
const comoDono = `reset role; select set_config('request.jwt.claims', '', false);`;
const diretoriaA = como('empresa-a', 'gestao');
const diretoriaB = como('empresa-b', 'gestao');
const diretoriaM = como('empresa-m', 'gestao');
const colaboradorA = como('empresa-a', 'colaborador');
const gerenciaA    = como('empresa-a', 'gerencia');
const colaboradorB = como('empresa-b', 'colaborador');
const semPapelA = `reset role; select set_config('request.jwt.claims', '{"role":"authenticated","company_id":"empresa-a"}', false); set role authenticated;`;

async function bancada({ semAnonStorageAll = false, extra = '' } = {}) {
  const db = new PGlite();
  await db.exec(BANCADA);
  if (semAnonStorageAll) await db.exec('drop policy anon_storage_all on storage.objects;');
  if (extra) await db.exec(extra);
  const erroDe = async (papel, sql) => { try { await db.exec(papel + sql); return null; } catch (e) { return e.message; } finally { await db.exec(comoDono); } };
  // O que o papel ENXERGA no bucket (URL assinada e listagem são SELECT).
  const ve = async (papel, bucket = 'colaboradores') => {
    await db.exec(papel);
    const r = await db.query(`select name from storage.objects where bucket_id = $1 order by name`, [bucket]);
    await db.exec(comoDono);
    return r.rows.map(x => x.name);
  };
  // Upload do /cadastro: INSERT sem RETURNING (é o que o storage-api roda com
  // o papel de quem chama quando upsert = false).
  const upload = (papel, name, bucket = 'colaboradores') => erroDe(papel,
    `insert into storage.objects (bucket_id, name) values ('${bucket}', '${name}');`);
  const pedido = (papel, campos) => {
    const cols = Object.keys(campos).join(', ');
    const vals = Object.values(campos).map(v => `'${v}'`).join(', ');
    return erroDe(papel, `insert into public.user_requests (${cols}) values (${vals});`);
  };
  const policies = async () => (await db.query(
    `select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1`)).rows.map(r => r.policyname);
  return { db, erroDe, ve, upload, pedido, policies };
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ antes ═══');
const { db, erroDe, ve, upload, pedido, policies } = await bancada();
check((await ve(comoAnon)).includes('sb.jpg') && (await ve(comoAnon)).includes('1751900000000-12345678900.jpg'),
  'ANTES: a anon key lista as selfies de todas as empresas — e o CPF no nome das antigas');
check((await ve(colaboradorB)).includes('sa.jpg'),
  'ANTES: um colaborador da empresa B lista a selfie de um cadastro da A');
check((await ve(diretoriaM)).length === 4,
  'ANTES: a diretoria de uma empresa em teste lista o bucket inteiro');

// ── Regra 7: policy de leitura feita à mão → desfaz tudo ────────────────────
console.log('═══ trava: leitura de selfie que sobra ═══');
{
  const b = await bancada({ extra: `create policy selfies_a_mao on storage.objects for select to public
                                     using (bucket_id = 'colaboradores');` });
  const erro = await b.erroDe(comoDono, MIGRATION);
  check(/ainda legível/.test(erro || '') && /selfies_a_mao/.test(erro || ''),
    'policy de leitura feita à mão (to public) → a migration aborta e NOMEIA a policy');
  const pols = await b.policies();
  check(pols.includes('colaboradores_signed_read') && !pols.includes('colaboradores_leitura_diretoria'),
    '…e aborta INTEIRA: as policies antigas estão lá e a nova não');
  const gatilho = (await b.db.query(`select count(*)::int as n from pg_trigger where tgname = 'user_requests_selfie_trava'`)).rows[0].n;
  check(gatilho === 0, '…nem o gatilho ficou');
}
{
  const b = await bancada({ extra: `create policy lista_tudo on storage.objects for select to authenticated using (true);` });
  const erro = await b.erroDe(comoDono, MIGRATION);
  check(/ainda legível/.test(erro || '') && /lista_tudo/.test(erro || ''),
    'policy de leitura aberta a qualquer sessão (sem filtro de bucket) → aborta e nomeia');
}

// ── Aplica ──────────────────────────────────────────────────────────────────
console.log('═══ aplica ═══');
const erro1 = await erroDe(comoDono, MIGRATION);
check(erro1 === null, `a migration roda sem erro${erro1 ? ` — ${erro1}` : ''}`);

// ── Regra 2: quem vê ────────────────────────────────────────────────────────
check((await ve(comoAnon)).length === 0, 'anon NÃO lista nem assina nenhuma selfie');
const veA = await ve(diretoriaA);
check(veA.includes('sa.jpg') && veA.includes('1751900000000-12345678900.jpg'),
  'diretoria A vê as selfies dos pedidos da A (a nova e a antiga)');
check(!veA.includes('sb.jpg') && !veA.includes('orfa.jpg'), 'diretoria A NÃO vê a da B nem o upload sem pedido');
const veB = await ve(diretoriaB);
check(veB.length === 1 && veB[0] === 'sb.jpg', 'diretoria B vê só a da B');
check((await ve(colaboradorA)).length === 0, 'colaborador da A NÃO vê a selfie de pedido da A');
check((await ve(gerenciaA)).length === 0, 'gerência da A NÃO vê (a aprovação é só da diretoria)');
check((await ve(semPapelA)).length === 0, 'token sem user_role NÃO vê');
check((await ve(colaboradorB)).length === 0, 'o colaborador da B que listava tudo ANTES não vê mais nada');
check((await ve(diretoriaM)).length === 0, 'diretoria de empresa em teste não vê nada');

// ── Regra 3: o /cadastro ────────────────────────────────────────────────────
console.log('═══ /cadastro ═══');
check(await upload(comoAnon, 'nova-a.jpg') === null, 'anon sobe a selfie (INSERT puro, upsert: false)');
check(await pedido(comoAnon, { name: 'Dora', company_id: 'empresa-a', selfie_path: 'nova-a.jpg', pin: '1234' }) === null,
  'anon grava o pedido com a selfie');
check((await ve(diretoriaA)).includes('nova-a.jpg'), 'a diretoria A vê a selfie do cadastro novo');
check(!(await ve(diretoriaB)).includes('nova-a.jpg') && (await ve(comoAnon)).length === 0,
  '…e mais ninguém (diretoria B, anon)');
check(await upload(comoAnon, 'por-loja.jpg') === null
      && await pedido(comoAnon, { name: 'Edu', unit_id: 'a1', selfie_path: 'por-loja.jpg' }) === null
      && (await ve(diretoriaA)).includes('por-loja.jpg'),
  'pedido sem company_id (empresa pela loja, gatilho de 20260709) também vale');
check(/row-level security/.test(await erroDe(comoAnon,
  `insert into storage.objects (bucket_id, name) values ('colaboradores', 'com-returning.jpg') returning *;`) || ''),
  'PREMISSA: o mesmo INSERT com RETURNING o anon NÃO faz — o /cadastro depende do storage-api não usar RETURNING sem upsert');
check(/row-level security/.test(await erroDe(comoAnon,
  `insert into storage.objects (bucket_id, name) values ('colaboradores', 'sa.jpg')
     on conflict (bucket_id, name) do update set updated_at = now();`) || ''),
  'anon NÃO sobrescreve a selfie de ninguém (upsert com conflito → UPDATE)');

// ── Regra 4: ponteiro não dá posse ──────────────────────────────────────────
console.log('═══ pedido forjado ═══');
check(await pedido(diretoriaM, { name: 'x', company_id: 'empresa-m', selfie_path: 'sa.jpg',
                                 created_at: '2026-09-20 10:00:01+00' }) === null,
  'a diretoria M consegue gravar um pedido apontando para a selfie da A, com created_at forjado (RLS de user_requests deixa)');
check(!(await ve(diretoriaM)).includes('sa.jpg'), '…e mesmo assim NÃO vê: o created_at virou now(), fora da janela do upload');
const criado = (await db.query(`select created_at from public.user_requests where company_id = 'empresa-m' and selfie_path = 'sa.jpg'`)).rows[0]?.created_at;
check(criado && Math.abs(Date.now() - new Date(criado).getTime()) < 60_000,
  '…o created_at gravado é o relógio do banco, não o que veio na requisição');
check((await ve(diretoriaA)).includes('sa.jpg'), '…e a A continua vendo a dela (o forjado não esconde)');
check(await pedido(comoAnon, { name: 'y', company_id: 'empresa-m', selfie_path: 'sb.jpg' }) === null
      && !(await ve(diretoriaM)).includes('sb.jpg'),
  'pedido anônimo para a empresa M apontando para a selfie da B: gravado, e M não vê');
check(await pedido(diretoriaM, { name: 'z', company_id: 'empresa-m', selfie_path: 'orfa.jpg' }) === null
      && (await ve(diretoriaM)).length === 0,
  'upload antigo sem pedido (orfa.jpg) não vira de quem reivindicar agora');

await pedido(diretoriaM, { name: 'sem selfie', company_id: 'empresa-m' });
check(/não pode ser trocado/.test(await erroDe(diretoriaM,
  `update public.user_requests set selfie_path = 'sb.jpg' where name = 'sem selfie';`) || ''),
  'UPDATE de um pedido da M para a selfie da B é recusado');
check(/não pode ser trocado/.test(await erroDe(diretoriaA,
  `update public.user_requests set selfie_path = 'sb.jpg' where name = 'Ana';`) || ''),
  'nem a diretoria da A troca a selfie de um pedido da própria empresa por outra');
await erroDe(diretoriaM, `update public.user_requests set created_at = '2026-09-20 11:00:01+00' where name = 'y';`);
const criadoY = (await db.query(`select created_at from public.user_requests where name = 'y'`)).rows[0]?.created_at;
check(criadoY && Math.abs(Date.now() - new Date(criadoY).getTime()) < 60_000,
  'UPDATE do created_at para dentro da janela não pega: o valor fica o de antes');
check(await erroDe(diretoriaA, `update public.user_requests set status = 'aprovado', reviewed_at = now(),
                                reviewed_by = 'u-a' where name = 'Ana';`) === null
      && (await ve(diretoriaA)).includes('sa.jpg'),
  'aprovar (status/revisão, o que o app faz) segue funcionando, e a selfie segue visível');
check(await erroDe(diretoriaA, `update public.user_requests set selfie_path = null where name = 'Dora';`) === null,
  'selfie_path pode virar NULL (apagar a selfie de um pedido)');

// Janela: a legítima chega primeiro; a forjada, depois, dentro da hora.
await upload(comoAnon, 'corrida.jpg');
await pedido(comoAnon, { name: 'Fabi', company_id: 'empresa-b', selfie_path: 'corrida.jpg' });
await pedido(diretoriaM, { name: 'w', company_id: 'empresa-m', selfie_path: 'corrida.jpg' });
check((await ve(diretoriaB)).includes('corrida.jpg') && !(await ve(diretoriaM)).includes('corrida.jpg'),
  'dentro da janela, o pedido mais antigo é o dono: o forjado depois não vê nem esconde');

// ── Regra 5: funções ────────────────────────────────────────────────────────
console.log('═══ funções ═══');
check(/permission denied/.test(await erroDe(comoAnon,
  `select public.colaboradores_selfie_visivel('sa.jpg', now());`) || ''), 'anon NÃO executa colaboradores_selfie_visivel');
check(/permission denied/.test(await erroDe(diretoriaM,
  `select public.colaboradores_selfie_dono('sa.jpg', '2026-09-20 10:00:00+00');`) || ''),
  'sessão do app NÃO executa colaboradores_selfie_dono (diria de quem é cada selfie)');
await db.exec(diretoriaM);
const rpcM = (await db.query(`select public.colaboradores_selfie_visivel('sa.jpg', '2026-09-20 10:00:00+00') as v`)).rows[0].v;
await db.exec(comoDono);
check(rpcM === false, 'por /rpc, a diretoria M pergunta pela selfie da A e ouve false');

// ── Regra 6: o resto do storage ─────────────────────────────────────────────
console.log('═══ os outros buckets ═══');
check((await ve(comoAnon, 'company-logos')).includes('empresa-a/logo.png'), 'company-logos segue público');
check((await ve(comoAnon, 'checklist-photos')).includes('ca1/i1.jpg'),
  'checklist-photos segue como estava para o anon (quem fecha é a 20260924_storage_01)');
check(await upload(comoAnon, 'cz/i1.jpg', 'checklist-photos') === null,
  'o bundle de hoje segue subindo foto de checklist como anon');
const qual = (await db.query(`select qual from pg_policies where policyname = 'anon_storage_all'`)).rows[0]?.qual || '';
check(/colaboradores/.test(qual), 'anon_storage_all ganhou o `bucket_id <> colaboradores` e nada mais');

// ── Regra 8: de novo, e o relatório ─────────────────────────────────────────
console.log('═══ idempotência e relatório ═══');
let relatorio;
try {
  await db.exec(comoDono);
  const r = await db.exec(MIGRATION);
  relatorio = r.at(-1).rows;
  check(true, 'a migration roda de novo sem erro');
} catch (e) { check(false, `a migration roda de novo sem erro — ${e.message}`); }
const qual2 = (await db.query(`select qual from pg_policies where policyname = 'anon_storage_all'`)).rows[0]?.qual || '';
check(qual2 === qual, '…sem empilhar o recorte em anon_storage_all');
check((await ve(diretoriaA)).includes('sa.jpg') && (await ve(comoAnon)).length === 0, '…e o resultado é o mesmo');
if (relatorio) {
  const linha = item => relatorio.find(r => r.item.startsWith(item));
  // 10 e 11 contam os pedidos forjados acima — conferidos um a um logo abaixo.
  const fora = relatorio.filter(r => ['VERIFICAÇÃO', 'SIMULAÇÃO'].includes(r.bloco)
    && r.esperado && !r.esperado.startsWith('≥') && !r.esperado.startsWith('—') && r.valor !== r.esperado
    && !/^pedidos (cuja selfie ficou sem dono|que citam)/.test(r.item));
  check(fora.length === 0, `VERIFICAÇÃO/SIMULAÇÃO batem com o esperado${fora.length ? ' — ' + fora.map(r => `${r.item}: ${r.valor}≠${r.esperado}`).join('; ') : ''}`);
  const propria = linha('diretoria dessa empresa enxerga as PRÓPRIAS');
  // A é dona de 3 (sa, a antiga com CPF, por-loja; a nova-a perdeu o ponteiro
  // quando o selfie_path da Dora virou NULL). M tem 4 pedidos citando selfies.
  check(propria?.valor === '3' && propria?.esperado === '3',
    'a simulação prova o lado positivo com a DONA de mais selfies (A, 3 de 3) — não com M, que tem mais pedidos forjados citando selfies');
  check(linha('pedidos que citam a selfie de outra empresa')?.valor === '3',
    'o relatório aponta os 3 pedidos forjados sobre selfie com dono (sa, sb, corrida) — em produção, rastro a investigar');
  check(linha('pedidos cuja selfie ficou sem dono')?.valor === '1',
    '…e o forjado sobre o upload sem pedido (orfa.jpg), que ficou sem dono');
  const legitSemDono = (await db.query(`select count(*)::int as n from public.user_requests r
      join storage.objects o on o.bucket_id = 'colaboradores' and o.name = r.selfie_path
     where r.company_id in ('empresa-a', 'empresa-b')
       and public.colaboradores_selfie_dono(o.name, o.created_at) is distinct from r.company_id`)).rows[0].n;
  check(legitSemDono === 0, 'nenhum pedido legítimo (A, B) perdeu a própria selfie');
  check(!relatorio.some(r => r.bloco === 'LEITURA RESTANTE' && /colaboradores_signed_read/.test(r.item)),
    'LEITURA RESTANTE não lista as duas policies antigas');
}

console.log('═══ sem anon_storage_all (a 01 de checklist-photos já aplicada) ═══');
{
  const b = await bancada({ semAnonStorageAll: true });
  const erro = await b.erroDe(comoDono, MIGRATION);
  check(erro === null, `roda sem erro${erro ? ` — ${erro}` : ''}`);
  check((await b.ve(comoAnon)).length === 0 && (await b.ve(diretoriaA)).includes('sa.jpg'),
    'anon não vê, diretoria A vê');
}

if (M01) {
  console.log('═══ junto da 20260924_storage_01, nas duas ordens ═══');
  // O que a 01 lê para inventariar checklist-photos (mesmas colunas do teste dela).
  const TABELAS_DA_01 = `
    create table public.templates (id text primary key, company_id text, name text, items jsonb);
    create table public.completions (id text primary key, company_id text, template_id text,
                                     unit_id text, date date, items jsonb);
    create table public.photos (id bigserial primary key, completion_id text, item_id text,
                                storage_path text, company_id text, unique (completion_id, item_id));
    create table public.live_tasks (template_id text, unit_id text, date text, item_id text,
                                    photo_path text, company_id text,
                                    primary key (template_id, unit_id, date, item_id));`;
  for (const [nome, ordem] of [['01 → esta', [M01, MIGRATION]], ['esta → 01', [MIGRATION, M01]]]) {
    const b = await bancada({ extra: TABELAS_DA_01 });
    let erro = null;
    for (const m of ordem) { erro = erro || await b.erroDe(comoDono, m); }
    check(erro === null, `${nome}: rodam sem erro${erro ? ` — ${erro}` : ''}`);
    check((await b.ve(comoAnon)).length === 0 && (await b.ve(colaboradorB)).length === 0,
      `${nome}: anon e colaborador de outra empresa não veem selfie`);
    check((await b.ve(diretoriaA)).includes('sa.jpg') && !(await b.ve(diretoriaA)).includes('sb.jpg'),
      `${nome}: diretoria A vê a dela e só a dela`);
    check(await b.upload(comoAnon, 'nova.jpg') === null, `${nome}: o /cadastro segue subindo selfie`);
    check((await b.ve(comoAnon, 'checklist-photos')).includes('ca1/i1.jpg')
          && /row-level security/.test(await b.upload(comoAnon, 'x.png', 'company-logos') || ''),
      `${nome}: checklist-photos fica como a 01 deixa (anon lê o legado, não escreve em outros buckets)`);
  }
} else {
  console.log('  · 20260924_storage_01 não está nesta branch — combinação das duas não testada aqui');
}

console.log(ok ? '\nOK' : '\nFALHOU');
process.exit(ok ? 0 : 1);
