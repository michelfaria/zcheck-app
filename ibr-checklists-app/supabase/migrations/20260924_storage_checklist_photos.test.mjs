/**
 * Teste das migrations 20260924_storage_01/02/03 (bucket `checklist-photos`).
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260924_storage_checklist_photos.test.mjs
 *
 * O que está em jogo: fotos de prova e POPs de todas as empresas num bucket só,
 * sem empresa no caminho, abertos à anon key (que é pública).
 *
 * O PGlite não tem o serviço de Storage. A bancada reproduz o que importa dele:
 * `storage.objects` com RLS, `storage.foldername` (definição copiada do
 * Supabase) e cada operação da API como o SQL que ela executa COM O PAPEL de
 * quem chama — é assim que o storage-api aplica as policies:
 *
 *   upload novo            → INSERT
 *   upload com upsert      → INSERT … ON CONFLICT DO UPDATE
 *   URL assinada / listar  → SELECT
 *   mover                  → UPDATE do `name`
 *   apagar                 → DELETE
 *
 * O que NÃO dá para provar aqui (só em produção): que o storage-api emite
 * exatamente esses comandos, que ele repassa o token do app em
 * `request.jwt.claims`, e o tráfego real dos bundles antigos. Ver a lista no
 * cabeçalho da 01.
 *
 * As regras que este arquivo existe para provar:
 *   1. O buraco existe na bancada ANTES: o anon lista e apaga de qualquer bucket.
 *   2. Depois da 01, a sessão do app só alcança a pasta da própria empresa, e
 *      o objeto antigo só da empresa dona no inventário.
 *   3. O anon, na transição, faz só o que o bundle antigo usa: lê e cria em
 *      caminho antigo. Não apaga, não move, não sobrescreve, não entra em pasta
 *      de empresa — e não toca os outros buckets.
 *   4. O inventário acha o dono pela estrutura; ponteiro sozinho não dá posse; e
 *      o dono não muda depois (envenenar um template não rouba o POP alheio).
 *   5. A reescrita das referências só mexe em linha da empresa dona.
 *   6. A 03 recusa enquanto houver dono sem cópia; a 02 tira o anon por inteiro.
 *   7. Tudo roda duas vezes sem erro, e a 01 aborta com empresa de id `rodada`.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ler = f => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8');
const M01 = ler('./20260924_storage_01_checklist_photos_tenant.sql');
const M02 = ler('./20260924_storage_02_revoga_anon.sql');
const M03 = ler('./20260924_storage_03_fecha_legado.sql');

let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

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
    ('checklist-photos', false), ('colaboradores', false),
    ('company-logos', true), ('user-avatars', true);

  -- O estado de PRODUÇÃO: a permissiva feita à mão (sem filtro de bucket) e as
  -- policies versionadas dos outros buckets.
  create policy anon_storage_all on storage.objects for all to anon using (true) with check (true);
  create policy colaboradores_signed_read on storage.objects for select to anon
    using (bucket_id = 'colaboradores');
  create policy colaboradores_anon_insert on storage.objects for insert to anon
    with check (bucket_id = 'colaboradores');
  create policy company_logos_public_read on storage.objects for select to anon, authenticated
    using (bucket_id = 'company-logos');
  create policy company_logos_tenant_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'company-logos' and (storage.foldername(name))[1] = public.jwt_company_id());

  -- ── public: só as colunas que as migrations tocam ─────────────────────────
  create table public.companies (id text primary key, name text, active boolean default true);
  create table public.units (id text primary key, company_id text, name text);
  create table public.templates (id text primary key, company_id text, name text, items jsonb);
  create table public.completions (id text primary key, company_id text, template_id text,
                                   unit_id text, date date, items jsonb);
  create table public.photos (id bigserial primary key, completion_id text, item_id text,
                              storage_path text, company_id text default public.jwt_company_id(),
                              unique (completion_id, item_id));
  create table public.live_tasks (template_id text, unit_id text, date text, item_id text,
                                  photo_path text, company_id text,
                                  primary key (template_id, unit_id, date, item_id));
  alter table public.companies enable row level security;
  create policy companies_anon_read on public.companies for select to anon using (true);
  grant select on public.companies to anon;

  insert into public.companies (id, name) values ('empresa-a', 'A'), ('empresa-b', 'B');
  insert into public.units values ('a1', 'empresa-a', 'Loja A1'), ('b1', 'empresa-b', 'Loja B1');
  insert into public.templates values
    ('ta', 'empresa-a', 'Abertura A', '[{"id":"i1","refDocs":[{"name":"POP","path":"refdocs/1-aaa/pop.pdf"},
                                                             {"name":"Comum","path":"refdocs/3-ccc/comum.pdf"}]}]'),
    ('tb', 'empresa-b', 'Abertura B', '[{"id":"i1","refDocs":[{"name":"POP","path":"refdocs/2-bbb/pop.pdf"},
                                                             {"name":"Comum","path":"refdocs/3-ccc/comum.pdf"}]}]'),
    ('tsem', 'empresa-a', 'Sem itens', null);
  insert into public.completions values
    ('ca1', 'empresa-a', 'ta', 'a1', '2026-09-20', '[{"id":"i1","hasPhoto":true}]'),
    ('cb1', 'empresa-b', 'tb', 'b1', '2026-09-20', '[{"id":"i1","hasPhoto":true}]');
  insert into public.photos (completion_id, item_id, storage_path, company_id) values
    ('ca1', 'i1', 'ca1/i1.jpg', 'empresa-a'),
    ('cb1', 'i1', 'cb1/i1.jpg', 'empresa-b'),
    ('cb9', 'i2', 'orfao/i2.jpg', 'empresa-b');     -- ponteiro sem estrutura
  insert into public.live_tasks values
    ('ta', 'a1', '2026-09-20', 'i1', 'rodada/ta/a1/2026-09-20/i1.jpg', 'empresa-a');

  insert into storage.objects (bucket_id, name) values
    ('checklist-photos', 'ca1/i1.jpg'),
    ('checklist-photos', 'cb1/i1.jpg'),
    ('checklist-photos', 'rodada/ta/a1/2026-09-20/i1.jpg'),
    ('checklist-photos', 'rodada/tb/b1/2026-09-20/i1.jpg'),
    ('checklist-photos', 'refdocs/1-aaa/pop.pdf'),
    ('checklist-photos', 'refdocs/2-bbb/pop.pdf'),
    ('checklist-photos', 'refdocs/3-ccc/comum.pdf'),
    ('checklist-photos', 'zz999/i1.jpg'),
    ('checklist-photos', 'orfao/i2.jpg'),
    ('checklist-photos', 'descartavel.jpg'),
    ('colaboradores',    'selfie-1.jpg'),
    ('company-logos',    'empresa-a/logo.png');
`;

// ── Papéis ──────────────────────────────────────────────────────────────────
const claims = (empresa) => JSON.stringify({ user_id: `u-${empresa}`, user_role: 'colaborador', company_id: empresa });
const comoA    = `reset role; select set_config('request.jwt.claims', '${claims('empresa-a')}', false); set role authenticated;`;
const comoB    = `reset role; select set_config('request.jwt.claims', '${claims('empresa-b')}', false); set role authenticated;`;
const comoAnon = `reset role; select set_config('request.jwt.claims', '{"role":"anon"}', false); set role anon;`;
const comoDono = `reset role; select set_config('request.jwt.claims', '{}', false);`;

function bancada() {
  const db = new PGlite();
  const erroDe = async (papel, sql) => { try { await db.exec(papel + sql); return null; } catch (e) { return e.message; } };
  // O que o papel ENXERGA no bucket (URL assinada e listagem são SELECT).
  const ve = async (papel, bucket = 'checklist-photos') => {
    await db.exec(papel);
    const r = await db.query(`select name from storage.objects where bucket_id = $1 order by name`, [bucket]);
    await db.exec(comoDono);
    return r.rows.map(x => x.name);
  };
  const existe = async (name, bucket = 'checklist-photos') => {
    await db.exec(comoDono);
    return (await db.query(`select 1 from storage.objects where bucket_id = $1 and name = $2`, [bucket, name])).rows.length === 1;
  };
  const upload = (papel, name, { upsert = true, bucket = 'checklist-photos' } = {}) => erroDe(papel,
    `insert into storage.objects (bucket_id, name) values ('${bucket}', '${name}')` +
    (upsert ? ` on conflict (bucket_id, name) do update set updated_at = now();` : ';'));
  // DELETE/UPDATE barrados pelo RLS não dão erro: afetam zero linhas. Por isso
  // a prova é o estado gravado, lido como dono da tabela.
  const apagar = async (papel, name) => { await erroDe(papel, `delete from storage.objects where bucket_id = 'checklist-photos' and name = '${name}';`); return !(await existe(name)); };
  const mover  = async (papel, de, para) => { await erroDe(papel, `update storage.objects set name = '${para}' where bucket_id = 'checklist-photos' and name = '${de}';`); return !(await existe(de)); };
  const inventario = async () => {
    await db.exec(comoDono);
    const r = await db.query(`select name, status, company_id from public.checklist_photos_legado order by name`);
    return Object.fromEntries(r.rows.map(x => [x.name, x.company_id ? `${x.status}:${x.company_id}` : x.status]));
  };
  return { db, erroDe, ve, existe, upload, apagar, mover, inventario };
}

const { db, erroDe, ve, existe, upload, apagar, mover, inventario } = bancada();
await db.exec(BANCADA);

console.log('═══ checklist-photos: antes ═══');
check((await ve(comoAnon, 'colaboradores')).includes('selfie-1.jpg'),
  'ANTES: a anon key lista as selfies do /cadastro (o bug, que vale para todo bucket)');
check((await ve(comoAnon)).includes('cb1/i1.jpg') && (await ve(comoAnon)).includes('ca1/i1.jpg'),
  'ANTES: a anon key lista as fotos de prova de todas as empresas');
check(await apagar(comoAnon, 'descartavel.jpg'),
  'ANTES: a anon key APAGA foto de qualquer empresa');

console.log('═══ 01: trava de id de empresa ═══');
{
  const b = bancada();
  await b.db.exec(BANCADA);
  await b.db.exec(`insert into public.companies (id, name) values ('rodada', 'Empresa azarada');`);
  const erro = await b.erroDe(comoDono, M01);
  check(/incompatível/.test(erro || ''), 'empresa com id `rodada` aborta a 01 (a pasta dela seria a das fotos de rodada de todos)');
  check((await b.ve(comoAnon, 'colaboradores')).includes('selfie-1.jpg'),
    '…e aborta INTEIRA: nada foi aplicado');
}

console.log('═══ 01: aplica ═══');
const erro01 = await erroDe(comoDono, M01);
check(erro01 === null, `a 01 roda sem erro${erro01 ? ` — ${erro01}` : ''}`);

// ── Regra 4: inventário ─────────────────────────────────────────────────────
const inv = await inventario();
check(inv['ca1/i1.jpg'] === 'dono:empresa-a', 'prova antiga → dono pela conclusão (empresa-a)');
check(inv['cb1/i1.jpg'] === 'dono:empresa-b', 'prova antiga → dono pela conclusão (empresa-b)');
check(inv['rodada/ta/a1/2026-09-20/i1.jpg'] === 'dono:empresa-a', 'foto de rodada → dono pela loja e pelo checklist');
check(inv['refdocs/1-aaa/pop.pdf'] === 'dono:empresa-a', 'POP → dono pelo template que o cita');
check(inv['refdocs/3-ccc/comum.pdf'] === 'revisar', 'POP citado por duas empresas → revisar (decisão manual, ninguém ganha)');
check(inv['orfao/i2.jpg'] === 'revisar', 'objeto só com PONTEIRO (linha de photos) → revisar, não dono');
check(inv['zz999/i1.jpg'] === 'sem_dono', 'objeto que nada cita → sem_dono');
check(!('empresa-a/logo.png' in inv) && Object.keys(inv).every(n => !n.startsWith('empresa-')),
  'só o bucket checklist-photos entra, e nada de dentro de pasta de empresa');

// ── Regra 2: a sessão do app ────────────────────────────────────────────────
check(await upload(comoA, 'empresa-a/c9/i1.jpg') === null, 'A sobe foto na própria pasta');
check(await upload(comoA, 'empresa-a/c9/i1.jpg') === null, 'A regrava a própria foto (upsert com conflito → UPDATE)');
check(/row-level security/.test(await upload(comoA, 'empresa-b/c9/i1.jpg') || ''), 'A NÃO sobe na pasta de B');
check(/row-level security/.test(await upload(comoA, 'c9/i1.jpg') || ''), 'A NÃO sobe em caminho antigo (sem pasta)');
check(/row-level security/.test(await upload(comoA, 'rodada/ta/a1/x/i9.jpg') || ''), 'A NÃO sobe em `rodada/` solto');
await upload(comoB, 'empresa-b/c8/i1.jpg');
const veA = await ve(comoA);
check(veA.includes('empresa-a/c9/i1.jpg') && !veA.includes('empresa-b/c8/i1.jpg'), 'A vê a própria pasta e não a de B');
check(['ca1/i1.jpg', 'rodada/ta/a1/2026-09-20/i1.jpg', 'refdocs/1-aaa/pop.pdf'].every(n => veA.includes(n)),
  'A vê os objetos ANTIGOS que são dela (prova, rodada, POP)');
check(!['cb1/i1.jpg', 'rodada/tb/b1/2026-09-20/i1.jpg', 'refdocs/2-bbb/pop.pdf'].some(n => veA.includes(n)),
  'A NÃO vê os antigos de B');
check(!['refdocs/3-ccc/comum.pdf', 'orfao/i2.jpg', 'zz999/i1.jpg'].some(n => veA.includes(n)),
  'A NÃO vê revisar/sem_dono');
const veB = await ve(comoB);
check(veB.includes('orfao/i2.jpg') === false, 'B cita `orfao/i2.jpg` em photos e mesmo assim NÃO vê (ponteiro não dá posse)');
check(!(await apagar(comoA, 'empresa-a/c9/i1.jpg')), 'A NÃO apaga nem a própria foto (quem apaga é o cleanup, com service_role)');
check(!(await mover(comoA, 'ca1/i1.jpg', 'empresa-a/roubada.jpg')), 'A NÃO move objeto antigo (legado é só leitura)');
check(!(await mover(comoB, 'empresa-a/c9/i1.jpg', 'empresa-b/c9/i1.jpg')), 'B NÃO move a foto de A para a pasta dele');
check((await ve(comoA, 'company-logos')).includes('empresa-a/logo.png'), 'company-logos segue legível (policy dela não mudou)');

// ── Regra 3: o anon na transição ────────────────────────────────────────────
const veAnon = await ve(comoAnon);
check(veAnon.includes('ca1/i1.jpg') && veAnon.includes('refdocs/2-bbb/pop.pdf'),
  'anon ainda lê objeto antigo (o bundle que está nos celulares precisa)');
check(!veAnon.some(n => n.startsWith('empresa-')), 'anon NÃO vê nada dentro de pasta de empresa — o que o app novo sobe nasce fechado');
check(await upload(comoAnon, 'cz1/i1.jpg') === null, 'anon sobe foto NOVA em caminho antigo (upsert sem conflito é só INSERT)');
check(/row-level security/.test(await upload(comoAnon, 'ca1/i1.jpg') || ''), 'anon NÃO sobrescreve foto existente (conflito → UPDATE, sem policy)');
check(/row-level security/.test(await upload(comoAnon, 'empresa-a/plantada.jpg') || ''), 'anon NÃO planta arquivo na pasta de uma empresa');
check(!(await apagar(comoAnon, 'cb1/i1.jpg')), 'anon NÃO apaga mais');
check(!(await mover(comoAnon, 'cb1/i1.jpg', 'x/y.jpg')), 'anon NÃO move mais (mover = UPDATE do nome)');
const veAnonSelfie = await ve(comoAnon, 'colaboradores');
check(veAnonSelfie.includes('selfie-1.jpg'),
  'colaboradores_signed_read NÃO foi tocada: o anon ainda lê selfie — pendência própria, fora destas migrations');
check(await upload(comoAnon, 'selfie-2.jpg', { upsert: false, bucket: 'colaboradores' }) === null,
  '/cadastro segue subindo selfie como anon');
check(/row-level security/.test(await upload(comoAnon, 'x.png', { upsert: false, bucket: 'company-logos' }) || ''),
  'o anon perdeu a escrita nos outros buckets (anon_storage_all valia para todos)');

// ── Regra 7: idempotência, e o dono congelado (regra 4) ─────────────────────
await db.exec(comoDono + `update public.templates
  set items = '[{"id":"i1","refDocs":[{"name":"x","path":"refdocs/1-aaa/pop.pdf"}]}]' where id = 'tb';`);
const erro01b = await erroDe(comoDono, M01);
check(erro01b === null, `a 01 roda de novo sem erro${erro01b ? ` — ${erro01b}` : ''}`);
check((await inventario())['refdocs/1-aaa/pop.pdf'] === 'dono:empresa-a',
  'B aponta o template dele para o POP de A e reinventaria: o dono segue A');
check(!(await ve(comoB)).includes('refdocs/1-aaa/pop.pdf'), '…e B continua sem ver o POP de A');
check((await inventario())['cz1/i1.jpg'] === 'sem_dono',
  'o reinventário pega o que o bundle antigo subiu depois (sem conclusão ainda → sem_dono)');
await db.exec(comoDono + `insert into public.completions values ('cz1', 'empresa-a', 'ta', 'a1', '2026-09-24', '[]');`);
await db.exec(comoDono + `select * from public.checklist_photos_inventariar_legado();`);
check((await inventario())['cz1/i1.jpg'] === 'dono:empresa-a', '…e reavalia sem_dono quando a conclusão chega');

// ── Funções: quem executa ───────────────────────────────────────────────────
check(/permission denied/.test(await erroDe(comoA, `select public.checklist_photos_inventariar_legado();`) || ''),
  'sessão do app NÃO roda o inventário');
check(/permission denied/.test(await erroDe(comoA, `select * from public.checklist_photos_legado;`) || ''),
  'sessão do app NÃO lê a tabela do inventário');
check(/permission denied/.test(await erroDe(comoAnon, `select public.checklist_photos_legado_visivel('ca1/i1.jpg');`) || ''),
  'anon NÃO consulta posse do legado');

// ── Fase C simulada: a rota de migração copia (service_role) ────────────────
console.log('═══ cópia do legado (o que a rota faz) ═══');
await db.exec(`reset role; set role service_role;
  insert into storage.objects (bucket_id, name)
    select 'checklist-photos', company_id || '/' || name from public.checklist_photos_legado
     where status = 'dono' and name <> 'cz1/i1.jpg'
  on conflict do nothing;
  update public.checklist_photos_legado set copiado_em = now() where status = 'dono' and name <> 'cz1/i1.jpg';
  reset role;`);
// ponteiro de B para objeto de A: não pode ser reescrito para a pasta de A
await db.exec(comoDono + `insert into public.photos (completion_id, item_id, storage_path, company_id)
  values ('cbx', 'i1', 'ca1/i1.jpg', 'empresa-b');`);
await db.exec('reset role; set role service_role;');
const reesc = (await db.query(`select * from public.checklist_photos_reescrever_referencias()`)).rows;
await db.exec('reset role;');
check(reesc.find(r => r.tabela === 'photos')?.linhas === 2, 'reescreve as 2 linhas de photos das empresas donas');
check(reesc.find(r => r.tabela === 'live_tasks')?.linhas === 1, 'reescreve a foto da rodada em live_tasks');
const caminho = async (c, i) => (await db.query(`select storage_path from public.photos where completion_id = $1 and item_id = $2`, [c, i])).rows[0]?.storage_path;
check(await caminho('ca1', 'i1') === 'empresa-a/ca1/i1.jpg', 'photos de A aponta para empresa-a/ca1/i1.jpg');
check(await caminho('cbx', 'i1') === 'ca1/i1.jpg', 'o ponteiro de B para o objeto de A NÃO é reescrito');
check(await caminho('cb9', 'i2') === 'orfao/i2.jpg', 'revisar não é reescrito');

// ── Regra 6: 03 ─────────────────────────────────────────────────────────────
console.log('═══ 03: fecha o legado ═══');
const erro03 = await erroDe(comoDono, M03);
check(/sem cópia/.test(erro03 || ''), 'a 03 RECUSA com objeto dono ainda sem cópia (cz1/i1.jpg)');
check((await ve(comoA)).includes('ca1/i1.jpg'), '…e não aplicou nada: A ainda lê o antigo');
await db.exec(`reset role; set role service_role;
  insert into storage.objects (bucket_id, name) values ('checklist-photos', 'empresa-a/cz1/i1.jpg');
  update public.checklist_photos_legado set copiado_em = now() where name = 'cz1/i1.jpg';
  reset role;`);
check((await erroDe(comoDono, M03)) === null, 'com tudo copiado, a 03 roda');
check((await erroDe(comoDono, M03)) === null, 'e roda de novo sem erro');
const veA3 = await ve(comoA);
check(!veA3.includes('ca1/i1.jpg') && veA3.includes('empresa-a/ca1/i1.jpg'),
  'A deixa de ver o antigo e vê a cópia na pasta dela');

// ── Regra 6: 02 ─────────────────────────────────────────────────────────────
console.log('═══ 02: tira o anon ═══');
check((await erroDe(comoDono, M02)) === null, 'a 02 roda');
check((await erroDe(comoDono, M02)) === null, 'e roda de novo sem erro');
check((await ve(comoAnon)).length === 0, 'anon não vê mais NENHUM objeto de checklist-photos');
check(/row-level security/.test(await upload(comoAnon, 'cz2/i1.jpg') || ''), 'anon não sobe mais nada em checklist-photos');
check((await ve(comoAnon, 'company-logos')).includes('empresa-a/logo.png'), 'company-logos segue pública');
check(await upload(comoAnon, 'selfie-3.jpg', { upsert: false, bucket: 'colaboradores' }) === null,
  '/cadastro segue subindo selfie');
check(await upload(comoA, 'empresa-a/c10/i1.jpg') === null && (await ve(comoA)).includes('empresa-a/c10/i1.jpg'),
  'o app logado segue subindo e lendo');
check(await existe('ca1/i1.jpg'), 'o objeto antigo continua no bucket (quem apaga é a rota, ação `apagar`)');

console.log(ok ? '\nOK' : '\nFALHOU');
process.exit(ok ? 0 : 1);
