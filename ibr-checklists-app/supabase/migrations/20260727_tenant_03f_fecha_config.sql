-- ============================================================================
-- TENANT 3f — fecha `config`, a pendência que a 03d deixou registrada.
--
-- Estado até aqui (26/07/2026):
--   policy `anon_all_config` → roles {anon}, cmd ALL, qual true, with_check true
--   grants  anon → SELECT, INSERT, UPDATE, DELETE, TRUNCATE, ...
--
-- Permissiva sem restrição, com o grant por trás: qualquer pessoa com a anon
-- key lia, escrevia e apagava a tabela pela API REST. O conteúdo limita o
-- estrago — só chaves `notified_YYYY-MM-DD`, o log de deduplicação do aviso de
-- atraso, sem segredo nem dado pessoal — mas dava para gravar
-- `notified_<hoje>` de fora e DESLIGAR o aviso de atraso de todas as empresas.
--
-- ⚠️ ORDEM OBRIGATÓRIA. Esta migration só pode rodar DEPOIS que a edge function
--    `notify-overdue` v7 estiver deployada. A v6 lia e escrevia `config` com a
--    ANON KEY, e era para ela que a policy permissiva existia. Rodar isto antes
--    do deploy quebra a deduplicação: o aviso de atraso passa a repetir todo
--    ciclo do cron.
--
--    Como saber se a v7 está no ar: ela retorna `{"ok":true,...}`; a v6 retorna
--    `{"sent":...}` sem o campo `ok`.
--
-- Nota sobre o estado atual do aviso de atraso: a v6 já estava MORTA desde a
-- 03c, que tirou do anon o acesso a `templates`, `completions` e
-- `push_subscriptions`. Ela não quebrou visivelmente porque descartava o erro e
-- respondia "No overdue" todo dia. Ou seja — o deploy da v7 não é só
-- endurecimento, é o conserto de um alerta que estava calado.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente.
-- Pré-requisitos: 20260726_tenant_03d + deploy da notify-overdue v7.
-- ============================================================================


-- ── (1) A policy permissiva ─────────────────────────────────────────────────
drop policy if exists anon_all_config on public.config;


-- ── (2) Os grants ───────────────────────────────────────────────────────────
-- Sem grant e sem policy, `config` deixa de existir para o anon. Quem escreve é
-- a edge function com service_role, que não passa nem por grant nem por RLS.
revoke all privileges on public.config from anon;

-- `authenticated` continua lendo: o painel de notificações do app
-- (NotificationHistory) monta o log a partir daqui.
grant select on public.config to authenticated;

-- RLS ligado com policy de leitura para authenticated. Sem a policy, o RLS
-- devolve zero linha mesmo com o grant — que é, aliás, o motivo de aquele
-- painel estar vazio hoje: `anon_all_config` era a ÚNICA policy da tabela, e
-- ela não valia para authenticated.
alter table public.config enable row level security;

drop policy if exists config_authenticated_read on public.config;
create policy config_authenticated_read on public.config
  for select to authenticated
  using (true);


-- ============================================================================
-- VERIFICAÇÃO — devolve linhas, porque o SQL Editor do Supabase não mostra
-- `raise notice`.
-- ============================================================================
select 1 as ord,
       'anon ainda alcança config?' as item,
       (select count(*)::text from information_schema.table_privileges
         where table_schema = 'public' and table_name = 'config' and grantee = 'anon') as valor,
       '0' as esperado
union all
select 2, 'policies de anon/public em config',
       (select count(*)::text from pg_policies
         where schemaname = 'public' and tablename = 'config'
           and ('anon' = any(roles) or 'public' = any(roles))), '0'
union all
select 3, 'authenticated lê config (grant)',
       has_table_privilege('authenticated', 'public.config', 'SELECT')::text, 'true'
union all
select 4, 'authenticated lê config (policy)',
       (select count(*)::text from pg_policies
         where schemaname = 'public' and tablename = 'config'
           and cmd in ('SELECT','ALL') and 'authenticated' = any(roles)), '1'
union all
select 5, 'RLS ligado em config',
       (select c.relrowsecurity::text from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'config'), 'true'
 order by ord;

-- ── DEPOIS DE RODAR, confirme fim a fim ────────────────────────────────────
-- (a) Invoque a função e veja se ela ainda deduplica:
--     supabase functions invoke notify-overdue
--     -- esperado: {"ok":true,...}. Duas invocações seguidas: a segunda tem de
--        vir com sent:0, porque a primeira gravou notified_<hoje>.
-- (b) No app, aba de notificações: o histórico tem de aparecer — hoje está
--     vazio pelo motivo explicado acima.
--
-- Com esta migration, a auditoria aberta da 03c/03d passa a não devolver
-- NENHUMA linha. É o fim da varredura do anon.
-- ============================================================================
