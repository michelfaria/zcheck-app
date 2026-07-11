-- ============================================================================
-- TENANT 1/3 — `company_id` em todas as tabelas, backfill e preenchimento
--              automático na escrita.
--
-- Verificado em 09/07/2026 contra a produção:
--   · closures, live_tasks, photos e user_requests NÃO tinham company_id;
--   · todas as linhas das demais tabelas já têm company_id preenchido (0 nulos),
--     então o RLS não vai esconder dado existente;
--   · o cliente escreve completions/templates/users/closures/photos/live_tasks
--     SEM company_id — por isso os DEFAULTs abaixo. Sem eles, o `with check` do
--     RLS recusaria toda escrita depois da migration 02.
--
-- ADITIVA: não muda comportamento nenhum enquanto o RLS não entra.
--
-- ORDEM DA SÉRIE:
--   1. 20260709_tenant_01_company_id.sql   ← esta
--   2. 20260709_authenticated_role_grants.sql   (depois desta: espelha as colunas novas)
--   3. 20260709_tenant_02_rls.sql
--   4. deploy do app + verificar login de verdade
--   5. 20260709_tenant_03_revoke_anon.sql
-- ============================================================================

-- Lê o claim company_id do JWT emitido por /api/auth/session.
-- Sem token retorna NULL — as políticas do passo 02 negam, e os DEFAULTs abaixo
-- gravam NULL, que o `with check` recusa. Falha fechada nos dois sentidos.
--
-- NÃO usar auth.uid(): users.id é texto curto ('u1'), não UUID, e auth.uid()
-- faz cast para uuid. Para identificar o usuário, ler auth.jwt() ->> 'user_id'.
create or replace function public.jwt_company_id()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'company_id', '')
$$;

-- ── Colunas que faltavam ─────────────────────────────────────────────────────
alter table public.closures      add column if not exists company_id text;
alter table public.live_tasks    add column if not exists company_id text;
alter table public.photos        add column if not exists company_id text;
alter table public.user_requests add column if not exists company_id text;

-- ── Backfill. `units` é a âncora do tenant. ──────────────────────────────────
update public.closures c
   set company_id = u.company_id
  from public.units u
 where u.id = c.unit_id and c.company_id is null;

update public.live_tasks lt
   set company_id = u.company_id
  from public.units u
 where u.id = lt.unit_id and lt.company_id is null;

update public.user_requests r
   set company_id = u.company_id
  from public.units u
 where u.id = r.unit_id and r.company_id is null;

-- photos não tem unit_id: o tenant vem da completion à qual a foto pertence.
update public.photos p
   set company_id = co.company_id
  from public.completions co
 where co.id = p.completion_id and p.company_id is null;

-- ── Preenchimento automático na escrita ──────────────────────────────────────
-- O cliente omite company_id nos inserts. O DEFAULT o extrai do próprio token,
-- então nenhuma linha nova nasce sem tenant e nenhum call site precisa mudar.
-- Em UPDATE (upsert com on conflict) o valor existente é preservado.
do $$
declare t text;
begin
  foreach t in array array[
    'templates', 'users', 'completions', 'photos', 'closures',
    'live_tasks', 'recognitions', 'push_subscriptions'
  ]
  loop
    execute format('alter table public.%I alter column company_id set default public.jwt_company_id()', t);
  end loop;
end $$;

-- user_requests é a exceção: o /cadastro insere ANÔNIMO (o colaborador ainda não
-- tem conta), logo não há token de onde tirar o tenant. Deriva da unidade.
create or replace function public.user_requests_set_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    select u.company_id into new.company_id
      from public.units u where u.id = new.unit_id;
  end if;
  return new;
end
$$;

drop trigger if exists user_requests_company on public.user_requests;
create trigger user_requests_company
  before insert on public.user_requests
  for each row execute function public.user_requests_set_company();

create index if not exists closures_company_idx      on public.closures      (company_id);
create index if not exists live_tasks_company_idx    on public.live_tasks    (company_id);
create index if not exists photos_company_idx        on public.photos        (company_id);
create index if not exists user_requests_company_idx on public.user_requests (company_id);

-- ============================================================================
-- VERIFICAÇÃO — antes de seguir.
--
-- (a) Nenhuma linha órfã. Se der > 0, o backfill não cobriu tudo: essas linhas
--     ficariam invisíveis para todos depois do RLS.
--
--   select 'closures' t, count(*) from public.closures where company_id is null
--   union all select 'live_tasks', count(*) from public.live_tasks where company_id is null
--   union all select 'photos', count(*) from public.photos where company_id is null
--   union all select 'user_requests', count(*) from public.user_requests where company_id is null;
--
-- (b) Um tenant só, por enquanto:
--
--   select company_id, count(*) from public.completions group by 1;
--
-- (c) O DEFAULT foi aplicado:
--
--   select table_name, column_default from information_schema.columns
--    where column_name = 'company_id' and table_schema = 'public'
--    order by table_name;
-- ============================================================================
