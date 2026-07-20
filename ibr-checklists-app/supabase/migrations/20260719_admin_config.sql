-- ============================================================================
-- 20260719_admin_config.sql — Etapa 1.5 do ZCheck Core (centro de ajustes).
--
-- (1) `companies.subdomain` — subdomínio quando difere da slug (caso IBR:
--     slug 'ibr', subdomínio 'ilhabelarepublic'). NULL = usa a própria slug.
--     Substitui o SUBDOMAIN_ALIAS fixo do /entrar.
-- (2) `company_codes` — códigos alternativos que o usuário pode digitar no
--     /entrar ('ibr' E 'ilhabelarepublic' levam ao IBR). Substitui o
--     CODE_ALIAS fixo. Leitura pública (o código é digitado por qualquer
--     visitante); escrita só pelo Core (service_role).
-- (3) `admin_delete_company` — apaga a empresa e TUDO que tem company_id,
--     descobrindo as tabelas pelo catálogo (à prova de tabelas futuras).
--     Só a service_role executa; a rota do Core exige confirmação da slug.
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- ============================================================================

-- ── (1) Subdomínio ──────────────────────────────────────────────────────────
alter table public.companies add column if not exists subdomain text;

update public.companies
   set subdomain = 'ilhabelarepublic'
 where id = 'ibr' and subdomain is null;

-- A coluna nova herda o SELECT que o anon já tem em companies (login pré-sessão).
grant select on public.companies to anon, authenticated;

-- ── (2) Códigos de acesso ───────────────────────────────────────────────────
create table if not exists public.company_codes (
  code       text primary key,
  company_id text not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.company_codes enable row level security;

drop policy if exists company_codes_public_read on public.company_codes;
create policy company_codes_public_read on public.company_codes
  for select to anon, authenticated using (true);
-- Sem policy de escrita: INSERT/UPDATE/DELETE só via service_role (Core).

grant select on public.company_codes to anon, authenticated;

-- Códigos legados do IBR (antes fixos no /entrar).
insert into public.company_codes (code, company_id) values
  ('ibr', 'ibr'),
  ('ilhabelarepublic', 'ibr')
on conflict (code) do nothing;

-- ── (3) Deleção completa de empresa ─────────────────────────────────────────
-- v2 (19/07, após teste em produção):
--   · O catálogo devolve as tabelas em ordem arbitrária — apagar `units` antes
--     de `sectors` violava a FK sectors_unit_id_fkey. Agora a varredura roda em
--     PASSADAS SUCESSIVAS: quem falha por FK numa passada é tentado de novo na
--     seguinte, então as filhas caem primeiro, sem ordem fixa hardcoded.
--   · `storage.objects` é protegido pelo Supabase ("Use the Storage API") — o
--     delete do logo saiu. O arquivo órfão em company-logos/{id}/ é inofensivo;
--     remova pelo painel Storage se fizer questão.
create or replace function public.admin_delete_company(p_company_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n bigint;
  v_deleted jsonb := '{}'::jsonb;
  v_blocked boolean;
  v_pass int := 0;
begin
  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'empresa % não existe', p_company_id;
  end if;

  loop
    v_pass := v_pass + 1;
    v_blocked := false;
    for r in
      select c.table_name
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = 'public' and t.table_name = c.table_name
         and t.table_type = 'BASE TABLE'
       where c.table_schema = 'public'
         and c.column_name = 'company_id'
         and c.table_name <> 'companies'
    loop
      begin
        execute format('delete from public.%I where company_id = $1', r.table_name)
          using p_company_id;
        get diagnostics n = row_count;
        if n > 0 then
          v_deleted := jsonb_set(v_deleted, array[r.table_name],
            to_jsonb(coalesce((v_deleted ->> r.table_name)::bigint, 0) + n));
        end if;
      exception when foreign_key_violation then
        v_blocked := true; -- filha ainda presente; resolve na próxima passada
      end;
    end loop;
    exit when not v_blocked or v_pass >= 6;
  end loop;

  if v_blocked then
    raise exception 'dependências de % não resolvidas em % passadas', p_company_id, v_pass;
  end if;

  delete from public.companies where id = p_company_id;
  return jsonb_build_object('passes', v_pass, 'deleted', v_deleted);
end
$$;

revoke all on function public.admin_delete_company(text) from public;
revoke all on function public.admin_delete_company(text) from anon, authenticated;
grant execute on function public.admin_delete_company(text) to service_role;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Códigos do IBR no lugar:
--   select * from public.company_codes;
--   -- esperado: 'ibr' e 'ilhabelarepublic' → company_id 'ibr'
--
-- (b) Subdomínio do IBR preservado:
--   select id, slug, subdomain from public.companies where id = 'ibr';
--   -- esperado: subdomain = 'ilhabelarepublic'
--
-- (c) anon lê códigos mas não escreve:
--   set role anon;
--   select count(*) from public.company_codes;                  -- ok
--   insert into public.company_codes values ('x', 'ibr');       -- permission denied
--   reset role;
--
-- (d) A função existe e está restrita (NÃO execute com empresa real!):
--   select proname from pg_proc where proname = 'admin_delete_company';
-- ============================================================================
