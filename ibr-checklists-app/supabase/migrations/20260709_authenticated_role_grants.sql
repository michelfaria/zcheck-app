-- ============================================================================
-- Espelha para o role `authenticated` os privilégios que hoje o role `anon` tem.
--
-- Contexto: até agora todo acesso ao banco era anônimo. A rota /api/auth/session
-- passou a emitir um JWT assinado com o JWT secret do projeto, com claim
-- `role: authenticated`. Quando o cliente usa esse token, o PostgREST executa
-- `set role authenticated` — e sem estes grants a requisição falha com 42501.
--
-- Esta migration é ADITIVA: não remove nada de `anon`. Rodá-la não muda o
-- comportamento atual do app; apenas torna o token utilizável.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
--
-- NÃO é o RLS. Grants dizem "pode tocar nesta tabela/coluna"; RLS diz "quais
-- linhas". O isolamento por company_id vem na migration seguinte, e é ela que
-- torna seguro revogar os privilégios de `anon`.
-- ============================================================================

do $$
declare r record;
begin
  -- Grants em nível de tabela.
  for r in
    select table_schema, table_name, privilege_type
      from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public'
  loop
    execute format('grant %s on %I.%I to authenticated',
                   r.privilege_type, r.table_schema, r.table_name);
  end loop;

  -- Grants em nível de coluna (é assim que a coluna `pin` fica fora do alcance
  -- de `anon` em public.users — ver 20260709_secure_pin_validation.sql).
  for r in
    select table_schema, table_name, column_name, privilege_type
      from information_schema.column_privileges
     where grantee = 'anon' and table_schema = 'public'
  loop
    execute format('grant %s (%I) on %I.%I to authenticated',
                   r.privilege_type, r.column_name, r.table_schema, r.table_name);
  end loop;
end $$;

-- Leitura das selfies por URL assinada, agora também para sessões autenticadas.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'colaboradores_signed_read_authenticated'
  ) then
    create policy colaboradores_signed_read_authenticated
      on storage.objects for select
      to authenticated
      using (bucket_id = 'colaboradores');
  end if;
end $$;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) `authenticated` deve enxergar as mesmas tabelas que `anon`:
--
--   select grantee, table_name, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon','authenticated')
--    order by table_name, grantee;
--
-- (b) A coluna `pin` deve continuar FORA do alcance dos dois roles:
--
--   select grantee, column_name
--     from information_schema.column_privileges
--    where table_name = 'users' and column_name = 'pin';
--   -- esperado: nenhuma linha para anon nem para authenticated
--
-- (c) Fim a fim, com um token real emitido por /api/auth/session:
--
--   curl -s 'https://rjuulamozdhssgqrzfji.supabase.co/rest/v1/units?select=id&limit=1' \
--        -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <TOKEN>"
--   -- esperado: 200 (e não 42501 permission denied)
-- ============================================================================
