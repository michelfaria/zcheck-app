-- ============================================================================
-- TENANT 3d — tira do `anon` as tabelas criadas DEPOIS das varreduras.
--
-- A 03c fechou as 12 tabelas da lista fixa e, no rodapé, mandou rodar a
-- auditoria aberta. Ela rodou em 26/07/2026 e devolveu oito tabelas com grants
-- do `anon` fora da allowlist. Todas nasceram depois da 03 (09/07) e nenhuma
-- recebeu revoke, porque as varreduras trabalhavam sobre lista fixa:
--
--   action_plans   DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   company_codes  DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE
--   config         DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   events         DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   support_chats  DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   task_reviews   DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--   user_requests  DELETE, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE
--   waitlist       DELETE, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- É a impressão digital do `alter default privileges ... grant all on tables to
-- anon` que o Supabase mantém: toda tabela nova em `public` nasce assim.
--
-- ── Quanto disso estava REALMENTE aberto ────────────────────────────────────
-- O RLS está ligado nas oito, e em sete delas não existe policy permissiva
-- para o `anon` além do INSERT que os fluxos anônimos usam. Nessas sete o grant
-- é redundante: o RLS já nega. Revogar não muda comportamento nenhum — muda a
-- distância até o próximo erro, que é o ponto de defesa em profundidade.
--
-- Com UMA exceção que o RLS não cobre: TRUNCATE. Policies valem para
-- SELECT/INSERT/UPDATE/DELETE; TRUNCATE é operação de tabela e passa por cima
-- delas. Nas sete tabelas o grant de TRUNCATE era a defesa inteira. Não é
-- alcançável pelo PostgREST (não há verbo TRUNCATE na API REST), então era
-- risco latente, não exploit — mas é o único item onde "o RLS protege" seria
-- uma frase falsa, e por isso a varredura não podia esperar.
--
-- ⚠️ `config` NÃO ENTRA NESTA MIGRATION. Ver o bloco no fim do arquivo: lá o
--    buraco é real e fechar aqui QUEBRARIA a notificação de atraso.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente.
-- Pré-requisito: 20260726_tenant_03c_revoke_anon_tabela.sql
-- ============================================================================


-- ── (1) Zera o anon nas sete ────────────────────────────────────────────────
revoke all privileges on public.action_plans  from anon;
revoke all privileges on public.company_codes from anon;
revoke all privileges on public.events        from anon;
revoke all privileges on public.support_chats from anon;
revoke all privileges on public.task_reviews  from anon;
revoke all privileges on public.user_requests from anon;
revoke all privileges on public.waitlist      from anon;


-- ── (2) Devolve só o que os caminhos anônimos precisam ──────────────────────
-- Existem exatamente quatro coisas que uma pessoa deslogada faz neste produto.
-- Cada grant abaixo é uma delas, e nenhuma precisa de leitura:
grant select on public.company_codes to anon;  -- /entrar resolve o código da empresa
grant insert on public.user_requests to anon;  -- /cadastro pede acesso
grant insert on public.events        to anon;  -- telemetria antes do login
grant insert on public.waitlist      to anon;  -- /lista grava o lead

-- Nada de SELECT em user_requests, events ou waitlist: o status da solicitação
-- sai pela RPC `user_request_status` (security definer), e lead e telemetria
-- ninguém deslogado tem por que ler. `authenticated` não é tocado aqui — os
-- grants dele são outros e o app depende deles.


-- ============================================================================
-- PENDÊNCIA: `config` — o único buraco que estava REALMENTE aberto
--
-- Estado em 26/07/2026:
--   policy `anon_all_config` → roles {anon}, cmd ALL, qual true, with_check true
--   grants  anon → SELECT, INSERT, UPDATE, DELETE, TRUNCATE, ...
--
-- Permissiva sem restrição nenhuma, com o grant por trás. Qualquer pessoa com a
-- anon key — que vai no bundle de um site público — lê, escreve e apaga a
-- tabela inteira pela API REST. Não é latente; é alcançável agora.
--
-- O que há dentro limita o estrago: só chaves `notified_YYYY-MM-DD`, o log de
-- deduplicação do aviso de atraso. Não há segredo nem dado pessoal. Mas dá para
-- gravar `notified_<hoje>` de fora e DESLIGAR o aviso de atraso de todas as
-- empresas, ou apagar o log e provocar renotificação.
--
-- POR QUE NÃO FECHO AQUI: a edge function `notify-overdue` lê e faz upsert em
-- `config` usando a ANON KEY (supabase/functions/notify-overdue/index.ts:6).
-- A policy permissiva existe para ela. Derrubar a policy sem mexer na função
-- quebra a deduplicação — o aviso de atraso passa a falhar ou a repetir.
--
-- A ordem correta é:
--   1. trocar a chave da edge function para SUPABASE_SERVICE_ROLE_KEY
--      (é código de servidor; o segredo nunca chega a um navegador);
--   2. redeployar a função e confirmar que ela ainda deduplica;
--   3. só então:
--        drop policy if exists anon_all_config on public.config;
--        revoke all privileges on public.config from anon;
--
-- Enquanto isso não acontece, o mitigante possível sem tocar na função é
-- estreitar a policy para as chaves de notificação, o que reduz o alcance sem
-- eliminá-lo:
--   alter policy anon_all_config on public.config
--     using (key like 'notified\_%') with check (key like 'notified\_%');
--
-- ── A RAIZ, que continua de pé ──────────────────────────────────────────────
-- Enquanto o `alter default privileges` do Supabase não mudar, a PRÓXIMA tabela
-- nasce com ALL para o anon e esta varredura precisa rodar de novo. `task_reviews`,
-- criada em 26/07, é a prova: nasceu furada no mesmo dia. Mudar o default é
-- decisão à parte — afeta toda tabela futura, inclusive as que talvez queiram
-- leitura anônima — e por isso não é feita aqui.
-- ============================================================================


-- ============================================================================
-- VERIFICAÇÃO EMBUTIDA — roda junto e devolve LINHAS.
--
-- Precisa ser linha, e não `raise notice`: verificado na bancada em 26/07/2026,
-- o SQL Editor do Supabase NÃO exibe notice nem warning. Só tem as abas Results
-- e Chart, e a mensagem é descartada — um diagnóstico por notice seria escrito
-- para ninguém.
--
-- Como ler:
--   SOBRA        — a auditoria aberta da 03c, agora executável: todo grant do
--                  anon/PUBLIC em `public` fora da allowlist. Depois desta
--                  migration só `config` deve aparecer, e ela some quando a
--                  PENDÊNCIA acima for resolvida.
--   VERIFICAÇÃO  — `valor` tem de bater com `esperado` em TODAS as linhas.
--                  As quatro primeiras são os quatro caminhos anônimos que
--                  existem no produto; se alguma virar `false`, esta migration
--                  quebrou o app e precisa do rollback do rodapé.
-- ============================================================================
with allowlist(tabela, priv) as (
  values ('user_requests','INSERT'),   -- /cadastro
         ('events','INSERT'),          -- telemetria pré-login
         ('waitlist','INSERT'),        -- /lista
         ('company_codes','SELECT'),   -- /entrar
         ('companies','SELECT'),       -- tela de entrada
         ('units','SELECT'),
         ('sectors','SELECT'),
         ('checklist_types','SELECT')
), sobra as (
  select c.relname::text as tabela,
         case when a.grantee = 0 then 'PUBLIC'
              else a.grantee::regrole::text end as para,
         string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
   where n.nspname = 'public'
     and c.relkind in ('r','p','v','m')
     and (a.grantee = 'anon'::regrole or a.grantee = 0)
     -- grant a PUBLIC nunca é allowlisted: o anon herda por ali sem aparecer
     -- como grantee, que é justamente o que `information_schema` esconde.
     and not (a.grantee = 'anon'::regrole
              and exists (select 1 from allowlist w
                           where w.tabela = c.relname
                             and w.priv = a.privilege_type))
   group by 1, 2
)

select 1 as ord, 'SOBRA' as bloco, tabela || ' → ' || para as item,
       privs as valor,
       case when tabela = 'config' then 'conhecido: ver PENDÊNCIA'
            else 'NÃO ESPERADO' end as esperado
  from sobra

union all
select 2, 'VERIFICAÇÃO', '/entrar — anon lê company_codes',
       has_table_privilege('anon'::name,'public.company_codes','SELECT')::text, 'true'
union all
select 3, 'VERIFICAÇÃO', '/cadastro — anon insere em user_requests',
       has_table_privilege('anon'::name,'public.user_requests','INSERT')::text, 'true'
union all
select 4, 'VERIFICAÇÃO', '/lista — anon insere em waitlist',
       has_table_privilege('anon'::name,'public.waitlist','INSERT')::text, 'true'
union all
select 5, 'VERIFICAÇÃO', 'telemetria — anon insere em events',
       has_table_privilege('anon'::name,'public.events','INSERT')::text, 'true'

union all
select 6, 'VERIFICAÇÃO', 'anon NÃO lê user_requests (CPF, selfie, e-mail, telefone)',
       has_table_privilege('anon'::name,'public.user_requests','SELECT')::text, 'false'
union all
select 7, 'VERIFICAÇÃO', 'anon NÃO lê events nem waitlist',
       (has_table_privilege('anon'::name,'public.events','SELECT')::int
      + has_table_privilege('anon'::name,'public.waitlist','SELECT')::int)::text, '0'

union all
select 8, 'VERIFICAÇÃO', 'tabelas com sobra, fora o config já conhecido',
       (select count(*) from sobra where tabela <> 'config')::text, '0'
union all
-- TRUNCATE é o único privilégio que o RLS não cobre: aqui o grant é a defesa
-- inteira. `config` fica de fora da contagem porque sai com a PENDÊNCIA.
select 9, 'VERIFICAÇÃO', 'anon com TRUNCATE em public (fora config)',
       (select count(*) from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r','p')
           and c.relname <> 'config'
           and has_table_privilege('anon'::name, c.oid, 'TRUNCATE'))::text, '0'

 order by 1, 3;


-- ============================================================================
-- ROLLBACK — só se algum dos quatro caminhos anônimos quebrar.
-- Devolve o grant mínimo; NÃO devolve o excesso revogado.
--
--   grant select on public.company_codes to anon;
--   grant insert on public.user_requests to anon;
--   grant insert on public.events        to anon;
--   grant insert on public.waitlist      to anon;
--
-- Se mesmo assim o caminho não voltar, o problema é policy e não grant:
--   select tablename, policyname, cmd, roles from pg_policies
--    where schemaname='public' and 'anon' = any(roles);
-- ============================================================================
