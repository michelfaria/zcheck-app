-- ============================================================================
-- 20260719_admin_views.sql — Etapa 1.3 do ZCheck Core (views do dashboard).
--
-- Todas as views são CROSS-TENANT e alimentam exclusivamente as rotas
-- /api/admin/* (service_role). Por isso, cada uma recebe REVOKE de
-- anon/authenticated no fim — nada disto fica visível para clientes.
--
-- Decisões de schema (verificadas no código em 19/07/2026):
--   · `completions` é a fonte da verdade de conclusão (histórico completo);
--     `events` é a fonte de comportamento (login, started, abandoned...).
--   · Casts defensivos (::date, ::timestamptz, ::jsonb): são no-op se a coluna
--     já tem o tipo, e convertem se for texto — o app grava ISO strings.
--   · Fuso: America/Sao_Paulo para "dia" e "hora" (o negócio é em Ilhabela).
--   · `completions.items` é um array jsonb com {done, critical, text, ...}.
--   · users.id repete entre empresas — joins de usuário SEMPRE com company_id.
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- ============================================================================

-- ── 1. Eventos por dia/tipo (funil, PWA, código de empresa) ─────────────────
create or replace view public.admin_events_daily as
select (e.occurred_at at time zone 'America/Sao_Paulo')::date as day,
       e.company_id,
       e.event_type,
       count(*)                                               as events,
       count(distinct e.user_id)                              as users,
       count(distinct e.session_id)                           as sessions
  from public.events e
 where e.occurred_at > now() - interval '120 days'
 group by 1, 2, 3;

-- ── 2. Usuários ativos por dia (DAU série) ──────────────────────────────────
create or replace view public.admin_active_users_daily as
select (e.occurred_at at time zone 'America/Sao_Paulo')::date as day,
       e.company_id,
       count(distinct e.user_id) as dau
  from public.events e
 where e.user_id is not null
   and e.occurred_at > now() - interval '120 days'
 group by 1, 2;

-- ── 3. Janelas de atividade (DAU hoje / WAU / MAU por empresa) ──────────────
-- Distinct por empresa; somar entre empresas é correto (usuário é por tenant).
create or replace view public.admin_active_users_window as
select e.company_id,
       count(distinct e.user_id) filter (
         where (e.occurred_at at time zone 'America/Sao_Paulo')::date
             = (now() at time zone 'America/Sao_Paulo')::date) as dau_today,
       count(distinct e.user_id) filter (where e.occurred_at > now() - interval '7 days')  as wau,
       count(distinct e.user_id) filter (where e.occurred_at > now() - interval '30 days') as mau
  from public.events e
 where e.user_id is not null
   and e.occurred_at > now() - interval '30 days'
 group by e.company_id;

-- ── 4. Conclusões por dia × empresa × unidade (north star) ──────────────────
create or replace view public.admin_completions_daily as
select c.date::date  as day,
       c.company_id,
       c.unit_id,
       count(*)      as completions,
       round(avg((
         select count(*) filter (where coalesce((i->>'done')::boolean, false)) * 100.0
                / greatest(jsonb_array_length(coalesce(c.items::jsonb, '[]'::jsonb)), 1)
           from jsonb_array_elements(coalesce(c.items::jsonb, '[]'::jsonb)) i
       ))) as avg_rate,
       count(distinct c.operator_user_id) as operators
  from public.completions c
 where c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 120
 group by 1, 2, 3;

-- ── 5. Início × conclusão × tempo médio (dos events; nasce com o launch) ────
-- Pareia checklist_started → primeiro checklist_completed da MESMA sessão e
-- checklist até 4h depois. Sem par = abandono (fechou a aba ou desistiu).
create or replace view public.admin_exec_funnel_daily as
with pairs as (
  select s.company_id, s.unit_id, s.occurred_at as started_at,
         (select min(c.occurred_at)
            from public.events c
           where c.event_type = 'checklist_completed'
             and c.session_id = s.session_id
             and c.checklist_id = s.checklist_id
             and c.occurred_at >= s.occurred_at
             and c.occurred_at <  s.occurred_at + interval '4 hours') as completed_at
    from public.events s
   where s.event_type = 'checklist_started'
     and s.session_id is not null
     and s.occurred_at > now() - interval '35 days'
)
select (started_at at time zone 'America/Sao_Paulo')::date as day,
       company_id, unit_id,
       count(*)                                            as started,
       count(completed_at)                                 as completed,
       round(avg(extract(epoch from completed_at - started_at)))::int as avg_seconds
  from pairs
 group by 1, 2, 3;

-- ── 6. Itens mais falhados (30 dias) ────────────────────────────────────────
create or replace view public.admin_failed_items as
select c.company_id, c.unit_id, c.template_name,
       i->>'text'                                    as item_text,
       coalesce((i->>'critical')::boolean, false)    as critical,
       count(*)                                      as missed
  from public.completions c,
       jsonb_array_elements(coalesce(c.items::jsonb, '[]'::jsonb)) i
 where not coalesce((i->>'done')::boolean, false)
   and c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 30
 group by 1, 2, 3, 4, 5;

-- ── 7. Heatmap dia-da-semana × hora (30 dias) ───────────────────────────────
create or replace view public.admin_completion_heatmap as
select c.company_id,
       extract(dow  from (c.completed_at::timestamptz at time zone 'America/Sao_Paulo'))::int as dow,
       extract(hour from (c.completed_at::timestamptz at time zone 'America/Sao_Paulo'))::int as hour,
       count(*) as completions
  from public.completions c
 where c.completed_at::timestamptz > now() - interval '30 days'
 group by 1, 2, 3;

-- ── 8. Ativação por usuário — lado comportamento (events) ───────────────────
create or replace view public.admin_user_activation as
select e.company_id, e.user_id,
       min(e.occurred_at)                                                  as first_seen,
       min(e.occurred_at) filter (where e.event_type = 'login')            as first_login,
       min(e.occurred_at) filter (where e.event_type = 'checklist_started') as first_started
  from public.events e
 where e.user_id is not null
 group by 1, 2;

-- ── 9. Ativação por usuário — lado resultado (completions, histórico todo) ──
create or replace view public.admin_user_completions as
select c.company_id,
       c.operator_user_id             as user_id,
       count(*)                       as completions,
       min(c.completed_at::timestamptz) as first_completion,
       max(c.completed_at::timestamptz) as last_completion
  from public.completions c
 where c.operator_user_id is not null
 group by 1, 2;

-- ── 10. Retenção por coorte semanal (semana do 1º evento × semanas ativas) ──
create or replace view public.admin_retention_weekly as
with firsts as (
  select company_id, user_id, min(occurred_at) as first_at
    from public.events
   where user_id is not null
   group by 1, 2
), activity as (
  select e.company_id, e.user_id,
         date_trunc('week', e.occurred_at at time zone 'America/Sao_Paulo')::date as active_week
    from public.events e
   where e.user_id is not null
   group by 1, 2, 3
)
select f.company_id,
       date_trunc('week', f.first_at at time zone 'America/Sao_Paulo')::date as cohort_week,
       ((a.active_week
         - date_trunc('week', f.first_at at time zone 'America/Sao_Paulo')::date) / 7)::int as week_n,
       count(distinct f.user_id) as users
  from firsts f
  join activity a using (company_id, user_id)
 group by 1, 2, 3;

-- ── 11. Saúde por empresa ───────────────────────────────────────────────────
create or replace view public.admin_company_health as
select co.id   as company_id,
       co.name, co.slug, co.active, co.plan, co.subscription_status,
       co.trial_ends_at, co.onboarded_at,
       (select count(*) from public.units u  where u.company_id = co.id)  as units,
       (select count(*) from public.users us where us.company_id = co.id) as users,
       greatest(
         (select max(e.occurred_at) from public.events e where e.company_id = co.id),
         (select max(c.completed_at::timestamptz) from public.completions c where c.company_id = co.id)
       ) as last_activity,
       (select count(*) from public.completions c
         where c.company_id = co.id
           and c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 7)  as completions_7d,
       (select count(*) from public.completions c
         where c.company_id = co.id
           and c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 30) as completions_30d
  from public.companies co;

-- ── 12. Saúde por unidade ───────────────────────────────────────────────────
create or replace view public.admin_unit_health as
select un.company_id, un.id as unit_id, un.name, un.color,
       (select max(c.completed_at::timestamptz) from public.completions c
         where c.unit_id = un.id and c.company_id = un.company_id) as last_completion,
       (select count(*) from public.completions c
         where c.unit_id = un.id and c.company_id = un.company_id
           and c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 7)  as completions_7d,
       (select count(*) from public.completions c
         where c.unit_id = un.id and c.company_id = un.company_id
           and c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 30) as completions_30d,
       (select count(distinct c.operator_user_id) from public.completions c
         where c.unit_id = un.id and c.company_id = un.company_id
           and c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 7)  as operators_7d
  from public.units un;

-- ── 13. Feed de eventos recentes (com nomes resolvidos) ─────────────────────
create or replace view public.admin_recent_events as
select e.id, e.occurred_at, e.event_type, e.device, e.action_source, e.metadata,
       e.company_id, co.name as company_name,
       e.unit_id,    un.name as unit_name,
       e.user_id,    u.name  as user_name
  from public.events e
  left join public.companies co on co.id = e.company_id
  left join public.units     un on un.id = e.unit_id and un.company_id = e.company_id
  left join public.users     u  on u.id  = e.user_id and u.company_id  = e.company_id
 order by e.occurred_at desc
 limit 200;

-- ── 14. Ranking de usuários (por conclusões) ────────────────────────────────
create or replace view public.admin_user_ranking as
select c.company_id,
       c.operator_user_id as user_id,
       max(c.operator_name) as name,
       max(u.unit_id)       as unit_id,
       max(u.role)          as role,
       count(*) filter (where c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 7)  as completions_7d,
       count(*) filter (where c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 30) as completions_30d,
       max(c.completed_at::timestamptz) as last_completion
  from public.completions c
  left join public.users u on u.id = c.operator_user_id and u.company_id = c.company_id
 where c.operator_user_id is not null
 group by 1, 2;

-- ── 15. Uso por setor (30 dias) ─────────────────────────────────────────────
create or replace view public.admin_sector_usage as
select c.company_id, c.unit_id, c.sector,
       count(*) as completions,
       round(avg((
         select count(*) filter (where coalesce((i->>'done')::boolean, false)) * 100.0
                / greatest(jsonb_array_length(coalesce(c.items::jsonb, '[]'::jsonb)), 1)
           from jsonb_array_elements(coalesce(c.items::jsonb, '[]'::jsonb)) i
       ))) as avg_rate
  from public.completions c
 where c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 30
 group by 1, 2, 3;

-- ── 16. Uso por checklist/template (30 dias) ────────────────────────────────
-- O "tipo" de checklist (abertura/fechamento/...) é derivado do nome no app;
-- a classificação por tipo acontece na rota da API, cruzando com checklist_types.
create or replace view public.admin_template_usage as
select c.company_id, c.unit_id, c.template_name,
       count(*) as completions,
       round(avg((
         select count(*) filter (where coalesce((i->>'done')::boolean, false)) * 100.0
                / greatest(jsonb_array_length(coalesce(c.items::jsonb, '[]'::jsonb)), 1)
           from jsonb_array_elements(coalesce(c.items::jsonb, '[]'::jsonb)) i
       ))) as avg_rate
  from public.completions c
 where c.date::date > (now() at time zone 'America/Sao_Paulo')::date - 30
 group by 1, 2, 3;

-- ── 17. PWA por empresa ─────────────────────────────────────────────────────
create or replace view public.admin_pwa as
select e.company_id,
       count(*)               filter (where e.event_type = 'pwa_installed') as installs,
       count(distinct e.user_id) filter (where e.device = 'pwa'
         and e.occurred_at > now() - interval '7 days')                     as pwa_users_7d
  from public.events e
 group by e.company_id;

-- ── Segurança: nada disto é visível fora das rotas /api/admin/* ─────────────
revoke all on public.admin_events_daily        from anon, authenticated;
revoke all on public.admin_active_users_daily  from anon, authenticated;
revoke all on public.admin_active_users_window from anon, authenticated;
revoke all on public.admin_completions_daily   from anon, authenticated;
revoke all on public.admin_exec_funnel_daily   from anon, authenticated;
revoke all on public.admin_failed_items        from anon, authenticated;
revoke all on public.admin_completion_heatmap  from anon, authenticated;
revoke all on public.admin_user_activation     from anon, authenticated;
revoke all on public.admin_user_completions    from anon, authenticated;
revoke all on public.admin_retention_weekly    from anon, authenticated;
revoke all on public.admin_company_health      from anon, authenticated;
revoke all on public.admin_unit_health         from anon, authenticated;
revoke all on public.admin_recent_events       from anon, authenticated;
revoke all on public.admin_user_ranking        from anon, authenticated;
revoke all on public.admin_sector_usage        from anon, authenticated;
revoke all on public.admin_template_usage      from anon, authenticated;
revoke all on public.admin_pwa                 from anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Todas as views existem e respondem (cada uma deve devolver linhas ou 0
--     linhas SEM erro — erro aqui indica cast de coluna que não bateu):
--   select * from public.admin_completions_daily   order by day desc limit 5;
--   select * from public.admin_company_health;
--   select * from public.admin_recent_events       limit 5;
--   select * from public.admin_user_ranking        order by completions_30d desc limit 5;
--   select * from public.admin_completion_heatmap  limit 5;
--
-- (b) anon não enxerga nada:
--   set role anon;
--   select * from public.admin_company_health;  -- esperado: permission denied
--   reset role;
-- ============================================================================
