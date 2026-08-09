-- ============================================================================
-- 20260808_revoke_truncate_publico.sql — fechar o TRUNCATE de anon/authenticated.
--
-- ACHADO (08/08/2026). Levantamento de `information_schema.table_privileges`
-- mostrou que TODAS as 21 tabelas do schema `public` concediam TRUNCATE,
-- TRIGGER e REFERENCES a `anon` e `authenticated` — incluindo `completions`,
-- `templates`, `users`, `companies` e `waitlist`.
--
-- Ninguém concedeu isso. Vem dos DEFAULT PRIVILEGES do Supabase, que dão
-- privilégio total a anon/authenticated/service_role em toda tabela nova de
-- `public`. Toda migration deste repositório que criou tabela herdou o pacote
-- em silêncio, mesmo as que concederam explicitamente só um `select`.
--
-- POR QUE É GRAVE, e por que o RLS não salva: **TRUNCATE não passa por
-- row-level security** — é assim por definição no Postgres. As policies de
-- tenant que protegem todo o resto são irrelevantes contra ele. Um comando
-- apaga o histórico operacional de TODAS as empresas de uma vez, ou todas as
-- contas, ou todos os checklists. E `anon` é o papel da chave que vai no
-- bundle do cliente.
--
-- O QUE ESTA MIGRATION NÃO FAZ, de propósito:
--
--   DELETE fica. O app apaga de verdade — templates (sync.js:123), users
--   (302), closures (841), units (1441), checklist_types (1446) e sectors
--   (1451). E DELETE É subordinado ao RLS, então as policies de empresa
--   continuam valendo. Revogá-lo aqui quebraria o produto para fechar um
--   buraco que já está fechado.
--
--   INSERT/UPDATE/SELECT ficam. São o funcionamento normal, todos sob RLS.
--
-- Sobram TRUNCATE (catastrófico e fora do RLS), TRIGGER (permite pendurar
-- gatilho em tabela alheia) e REFERENCES (permite criar FK apontando para
-- ela). Nenhum dos três é usado por cliente nenhum — nem pelo app, nem pelas
-- edge functions, que rodam com `service_role` e não são tocadas aqui.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. Testada em PGlite:
--   node supabase/migrations/20260808_revoke_truncate_publico.test.mjs
-- ============================================================================


-- ── (1) O que já existe ─────────────────────────────────────────────────────
-- Dinâmico em vez de 21 linhas escritas à mão: a lista muda a cada migration, e
-- uma lista fixa nasceria desatualizada.
--
-- VIEWS ENTRAM. A primeira versão filtrava `relkind = 'r'` (só tabela comum)
-- com o raciocínio de que "view não se trunca" — e sobraram 3 concessões. Os
-- default privileges do Supabase são `on tables`, que no Postgres cobre view e
-- materialized view: `task_verdicts` nasceu com o pacote inteiro no ACL.
--
-- O TRUNCATE ali é inofensivo (não executa em view), mas o TRIGGER não: em
-- view ele permite criar trigger INSTEAD OF, ou seja, interceptar o que se lê
-- e escreve através dela. `task_verdicts` é justamente o caminho pelo qual todo
-- colaborador passa a ler veredito desde 20260808_conferencia_privacidade.
--
--   r = tabela · v = view · m = materialized view · p = tabela particionada
do $$
declare r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'v', 'm', 'p')
  loop
    execute format(
      'revoke truncate, trigger, references on public.%I from anon, authenticated',
      r.relname);
  end loop;
end $$;


-- ── (2) O que ainda vai existir ─────────────────────────────────────────────
-- Sem isto, a PRÓXIMA tabela nasce com o mesmo pacote e o conserto do bloco
-- acima vira manutenção eterna. Os default privileges são por papel que CRIA o
-- objeto: as migrations rodam como `postgres` no SQL Editor, e é dele que os
-- grants automáticos saem.
--
-- `supabase_admin` entra na tentativa porque parte do provisionamento da
-- plataforma cria objeto por ele. Mas `alter default privileges for role X` só
-- é permitido a quem É aquele papel ou membro dele, e o `postgres` do Supabase
-- não é membro de `supabase_admin` — a tentativa devolve 42501.
--
-- Por isso cada papel vai no seu próprio bloco com exceção tratada: um papel
-- fora de alcance vira AVISO, não parada. A primeira versão deste arquivo não
-- fazia isso e o 42501 derrubava a migration inteira, levando junto o revoke
-- do bloco (1), que é a parte que realmente fecha o buraco.
--
-- Perder o `supabase_admin` é aceitável: as tabelas do app nascem das
-- migrations, que rodam como `postgres`. O que ele cria é objeto de plataforma,
-- fora do alcance da anon key de qualquer forma.
do $$
declare r text;
begin
  foreach r in array array['postgres', 'supabase_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      continue;                                  -- PGlite e Postgres puro
    end if;
    begin
      execute format(
        'alter default privileges for role %I in schema public revoke truncate, trigger, references on tables from anon, authenticated',
        r);
    exception
      when insufficient_privilege then
        raise notice 'sem permissão sobre os default privileges de %, seguindo sem ele', r;
    end;
  end loop;
end $$;


-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Nenhuma tabela de public entrega mais TRUNCATE a quem vem do cliente:
--   select table_name, privilege_type
--     from information_schema.table_privileges
--    where table_schema = 'public'
--      and grantee in ('anon','authenticated')
--      and privilege_type in ('TRUNCATE','TRIGGER','REFERENCES')
--    order by 1, 2;
--   -- esperado: NENHUMA linha
--
-- (b) O que o app usa continua de pé:
--   select table_name, string_agg(distinct privilege_type, ', ' order by privilege_type)
--     from information_schema.table_privileges
--    where table_schema = 'public' and grantee = 'authenticated'
--    group by table_name order by table_name;
--   -- esperado: SELECT/INSERT/UPDATE/DELETE conforme cada tabela já tinha,
--   -- e `completions` seguindo sem INSERT/UPDATE de tabela (eles são por
--   -- coluna desde 20260726_conferencia_lideranca).
--
-- (c) Tabela nova não nasce mais aberta:
--   create table public.zz_teste (id int);
--   select count(*) from information_schema.table_privileges
--    where table_name = 'zz_teste' and grantee in ('anon','authenticated')
--      and privilege_type = 'TRUNCATE';   -- esperado: 0
--   drop table public.zz_teste;
--
-- (d) Fim a fim: o app inteiro continua funcionando. Nada nele trunca, cria
--     gatilho ou cria FK — as três coisas revogadas aqui.
-- ============================================================================
