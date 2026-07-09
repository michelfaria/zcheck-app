-- ============================================================================
-- H1 — Daily Briefing vira hábito nos gestores
-- Learning Dashboard (ver docs/REVISAO_MVP_v1.3.md §7, §9, §11)
--
-- Rodar no SQL Editor do Supabase (projeto rjuulamozdhssgqrzfji) — como
-- postgres, ignora o RLS que bloqueia leitura de `events` pela anon key.
--
-- Fuso: occurred_at é UTC; convertido para America/Sao_Paulo (BRT) para
-- "por dia" e "antes das 9h".
--
-- Critério de VALIDAÇÃO:   ≥60% dos gestores ativos abrem o briefing em
--                          4 de 5 dias úteis, por 4 semanas.
-- Critério de INVALIDAÇÃO: <30% abrem semanalmente após 4 semanas.
-- ============================================================================


-- ── A) MÉTRICA-ÂNCORA: % de gestores com hábito (4 de 5 dias úteis) por semana ──
-- pct_habito >= 60  → sinal de validação   |   pct_habito < 30 → sinal de invalidação
with mgr_events as (
  select user_id, event_type,
         (occurred_at at time zone 'America/Sao_Paulo') as ts_local
  from events
  where role in ('lideranca','gerencia','gestao')
    and occurred_at >= now() - interval '28 days'
),
active as (  -- gestores "ativos" na semana = tiveram ao menos 1 login
  select date_trunc('week', ts_local)::date as semana, user_id
  from mgr_events
  where event_type = 'login'
  group by 1,2
),
opens as (   -- dias úteis distintos com briefing aberto, por gestor/semana
  select date_trunc('week', ts_local)::date as semana, user_id,
         count(distinct ts_local::date)
           filter (where extract(isodow from ts_local) between 1 and 5) as dias_uteis
  from mgr_events
  where event_type = 'briefing_opened'
  group by 1,2
)
select a.semana,
       count(distinct a.user_id)                                              as gestores_ativos,
       count(distinct o.user_id) filter (where o.dias_uteis >= 4)             as habito_4de5,
       round(100.0 * count(distinct o.user_id) filter (where o.dias_uteis >= 4)
             / nullif(count(distinct a.user_id),0), 1)                        as pct_habito,
       count(distinct o.user_id) filter (where o.dias_uteis >= 1)             as abriram_1x_ou_mais,
       round(100.0 * count(distinct o.user_id) filter (where o.dias_uteis >= 1)
             / nullif(count(distinct a.user_id),0), 1)                        as pct_uso_semanal
from active a
left join opens o on o.semana = a.semana and o.user_id = a.user_id
group by a.semana
order by a.semana;


-- ── B) % de aberturas antes das 9h (rotina de início do dia) ──────────────────
select count(*)                                                              as aberturas,
       count(*) filter (where extract(hour from (occurred_at at time zone 'America/Sao_Paulo')) < 9) as antes_9h,
       round(100.0 * count(*) filter (where extract(hour from (occurred_at at time zone 'America/Sao_Paulo')) < 9)
             / nullif(count(*),0), 1)                                        as pct_antes_9h
from events
where event_type = 'briefing_opened'
  and occurred_at >= now() - interval '28 days';


-- ── C) Funil recomendação → ação (briefing gera ação, não só leitura?) ────────
select count(*) filter (where event_type='briefing_opened')          as briefings_abertos,
       count(*) filter (where event_type='recommendation_clicked')   as rec_clicadas,
       count(*) filter (where event_type='recommendation_actioned')  as rec_tratadas,
       round(100.0 * count(*) filter (where event_type='recommendation_actioned')
             / nullif(count(*) filter (where event_type='briefing_opened'),0), 1) as acoes_por_briefing_pct
from events
where occurred_at >= now() - interval '28 days'
  and event_type in ('briefing_opened','recommendation_clicked','recommendation_actioned');


-- ── D) Tempo em tela (dwell) — engajamento real com o briefing ────────────────
select round(avg((metadata->>'seconds')::numeric), 1)                                     as dwell_medio_s,
       percentile_cont(0.5) within group (order by (metadata->>'seconds')::numeric)       as dwell_mediano_s,
       count(*)                                                                            as amostras
from events
where event_type = 'briefing_dwell'
  and metadata ? 'seconds'
  and occurred_at >= now() - interval '28 days';


-- ── E) Micro-pergunta: "esse briefing te ajudou a priorizar o dia?" ───────────
select metadata->>'answer' as resposta, count(*) as n
from events
where event_type = 'survey_answered'
  and metadata->>'question' = 'briefing_helped_prioritize'
  and occurred_at >= now() - interval '28 days'
group by 1
order by n desc;


-- ── F) Série diária de aberturas (para o gráfico do cohort) ───────────────────
select (occurred_at at time zone 'America/Sao_Paulo')::date as dia,
       count(*)                as aberturas,
       count(distinct user_id) as gestores_distintos
from events
where event_type = 'briefing_opened'
  and occurred_at >= now() - interval '28 days'
group by 1
order by 1;


-- ── G) Saúde da instrumentação: volume por tipo de evento ─────────────────────
-- Use para confirmar que a coleta está viva e nada está faltando.
select event_type, count(*) as n, min(occurred_at) as primeiro, max(occurred_at) as ultimo
from events
group by event_type
order by n desc;
