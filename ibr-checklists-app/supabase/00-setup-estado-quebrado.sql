-- ============================================================================
-- BANCADA DE TESTE — reproduz o estado quebrado do ZCheck num projeto Supabase
-- descartável, para exercitar a migration 20260726_tenant_03c antes de aplicar
-- em produção.
--
-- ⚠️  NUNCA rode isto no projeto rjuulamozdhssgqrzfji (produção). Este script
--     CONCEDE privilégios ao anon de propósito — ele cria o buraco para depois
--     provar que a migration o fecha.
--
-- Onde rodar: um projeto Supabase novo e vazio (plano free serve), no SQL
-- Editor. Um projeto novo já vem com os papéis `anon` e `authenticated`, que é
-- justamente o que um Postgres cru não teria.
--
-- Ordem: este arquivo → a migration 03c → ler a saída da verificação dela.
-- ============================================================================

-- ── 1. Tabelas-esqueleto ────────────────────────────────────────────────────
-- Só o que a migration precisa enxergar: nome e uma coluna. A 03c não olha
-- coluna nenhuma, exceto na varredura genérica de grants por coluna.
create table if not exists public.templates          (id uuid primary key default gen_random_uuid(), company_id text, nome text);
create table if not exists public.users              (id text primary key, company_id text, name text, pin text);
create table if not exists public.completions        (id uuid primary key default gen_random_uuid(), company_id text);
create table if not exists public.photos             (id uuid primary key default gen_random_uuid(), company_id text);
create table if not exists public.closures           (id uuid primary key default gen_random_uuid(), company_id text);
create table if not exists public.live_tasks         (id uuid primary key default gen_random_uuid(), company_id text);
create table if not exists public.recognitions       (id uuid primary key default gen_random_uuid(), company_id text);
create table if not exists public.push_subscriptions (id uuid primary key default gen_random_uuid(), company_id text);

create table if not exists public.companies       (id text primary key, name text, active boolean default true);
create table if not exists public.units           (id uuid primary key default gen_random_uuid(), company_id text, name text);
create table if not exists public.sectors         (id uuid primary key default gen_random_uuid(), company_id text, name text);
create table if not exists public.checklist_types (id uuid primary key default gen_random_uuid(), company_id text, name text);

create table if not exists public.user_requests (id uuid primary key default gen_random_uuid(), company_id text, name text, cpf text, unit_id uuid);
create table if not exists public.events        (id uuid primary key default gen_random_uuid(), company_id text, kind text);
create table if not exists public.company_codes (code text primary key, company_id text);


-- ── 2. Estado desejado nas tabelas que a 03c NÃO deve tocar ─────────────────
-- Se a migration mexer aqui, a verificação dela acusa (linhas 8, 9, 10 e 11).
revoke all on public.user_requests from anon;
grant insert on public.user_requests to anon;   -- o /cadastro depende

revoke all on public.events from anon;
grant insert on public.events to anon;          -- instrumentação pré-login

revoke all on public.company_codes from anon;
grant select on public.company_codes to anon;   -- o /entrar depende


-- ── 3. O BURACO — reproduz exatamente o que produção tem hoje ───────────────

-- (a) `users`: ALL menos SELECT. É o estado observado em 26/07/2026 —
--     `secure_pin_validation.sql` tirou o SELECT e o resto ficou.
grant all on public.users to anon;
revoke select on public.users from anon;

-- (b) as outras sete operacionais com ALL, que é como nasceram pelo
--     `alter default privileges` padrão do Supabase.
grant all on public.templates, public.completions, public.photos,
             public.closures, public.live_tasks, public.recognitions,
             public.push_subscriptions
  to anon;

-- (c) RLS ligado e SEM policy para anon — a situação de hoje: o grant está lá,
--     mas a policy é quem está segurando. É a "camada única" do diagnóstico.
alter table public.templates          enable row level security;
alter table public.users              enable row level security;
alter table public.completions        enable row level security;
alter table public.photos             enable row level security;
alter table public.closures           enable row level security;
alter table public.live_tasks         enable row level security;
alter table public.recognitions       enable row level security;
alter table public.push_subscriptions enable row level security;

-- (d) ARMADILHA 1 — grant de COLUNA, que sobrevive a um revoke mal feito.
--     Deve ser pego pelo passo 3 da migration / linha 2 da verificação.
grant select (name), select (pin) on public.users to anon;

-- (e) ARMADILHA 2 — grant a PUBLIC. É o caso que `information_schema` OMITE
--     e que a primeira versão da verificação não via. A migration não deve
--     revogar (pode derrubar o authenticated junto), mas DEVE avisar no
--     passo 5 e contar na linha 1 da verificação.
grant select on public.completions to public;

-- (f) ARMADILHA 3 — as policies `*_anon_legacy` da tenant_02 ainda de pé nos
--     metadados. É a suspeita levantada pela revisão: se a tenant_03 não valeu,
--     isto está aberto em produção AGORA e qualquer um escreve em `companies`.
--     A migration deve derrubar e gritar no Messages.
do $$
declare t text;
begin
  foreach t in array array['companies','units','sectors','checklist_types'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_anon_legacy', t);
    execute format('create policy %I on public.%I for all to anon using (true) with check (true)',
                   t || '_anon_legacy', t);
    execute format('grant all on public.%I to anon', t);
  end loop;
end $$;


-- ── 4. Fotografia do "antes" ───────────────────────────────────────────────
-- Guarde esta saída. Depois de rodar a migration, a mesma consulta deve voltar
-- só com o SELECT do anon nos quatro metadados e nas três preservadas.
select c.relname                                as tabela,
       case when a.grantee = 0 then 'PUBLIC'
            else a.grantee::regrole::text end   as para,
       string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
 where n.nspname = 'public'
   and c.relkind = 'r'
   and (a.grantee = 'anon'::regrole or a.grantee = 0)
 group by 1, 2
 order by 1, 2;

-- E as policies de anon que existem agora (esperado: as quatro *_anon_legacy):
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public' and 'anon' = any(roles)
 order by tablename, policyname;
