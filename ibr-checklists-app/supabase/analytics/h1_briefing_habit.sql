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
--                          4 de 5 dias úteis (descontando dias quietos),
--                          por 4 semanas.
-- Critério de INVALIDAÇÃO: <30% abrem semanalmente após 4 semanas.
--
-- ⚠️ Mudança de regime em 10/07/2026 (anti-fadiga): o briefing só abre sozinho
-- quando há SINAL real. Dia quieto emite `briefing_skipped` (1×/gestor/dia) em
-- vez de takeover. Consequências para a leitura:
--   · briefing_opened com action_source='auto' passou a implicar "havia sinal";
--   · dia com briefing_skipped é NEUTRO — não conta contra o hábito do gestor;
--   · action_source='manual' é o sinal-ouro: o gestor abriu porque quis.
-- Não compare pct_habito de antes e depois dessa data sem esta ressalva.
-- ============================================================================


-- ── A) MÉTRICA-ÂNCORA: % de gestores com hábito (4 de 5 dias úteis) por semana ──
-- pct_habito >= 60  → sinal de validação   |   pct_habito < 30 → sinal de invalidação
-- Dias quietos (briefing_skipped sem abertura no dia) saem do denominador do
-- gestor: ninguém perde hábito por não abrir um briefing que não tinha nada.
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
),
quiet as (   -- dias úteis quietos (skip e nenhuma abertura no mesmo dia)
  select date_trunc('week', s.ts_local)::date as semana, s.user_id,
         count(distinct s.ts_local::date)
           filter (where extract(isodow from s.ts_local) between 1 and 5) as dias_quietos
  from mgr_events s
  where s.event_type = 'briefing_skipped'
    and not exists (
      select 1 from mgr_events o
      where o.event_type = 'briefing_opened'
        and o.user_id = s.user_id
        and o.ts_local::date = s.ts_local::date
    )
  group by 1,2
)
select a.semana,
       count(distinct a.user_id)                                              as gestores_ativos,
       -- hábito = abriu em >= (5 - dias quietos - 1) dias úteis, mínimo 1
       count(distinct a.user_id) filter (
         where coalesce(o.dias_uteis,0) >= greatest(1, 5 - coalesce(q.dias_quietos,0) - 1)
       )                                                                       as habito_4de5,
       round(100.0 * count(distinct a.user_id) filter (
         where coalesce(o.dias_uteis,0) >= greatest(1, 5 - coalesce(q.dias_quietos,0) - 1)
       ) / nullif(count(distinct a.user_id),0), 1)                            as pct_habito,
       count(distinct o.user_id) filter (where o.dias_uteis >= 1)             as abriram_1x_ou_mais,
       round(100.0 * count(distinct o.user_id) filter (where o.dias_uteis >= 1)
             / nullif(count(distinct a.user_id),0), 1)                        as pct_uso_semanal
from active a
left join opens o on o.semana = a.semana and o.user_id = a.user_id
left join quiet q on q.semana = a.semana and q.user_id = a.user_id
group by a.semana
order by a.semana;


-- ── A2) SINAL-OURO: aberturas MANUAIS por semana (hábito sem contaminação) ─────
-- O takeover automático não prova hábito (o modal se abre sozinho). Abrir por
-- vontade própria prova. Acompanhe a tendência: crescer = o briefing pegou.
select date_trunc('week', occurred_at at time zone 'America/Sao_Paulo')::date as semana,
       count(*) filter (where action_source = 'manual')                        as aberturas_manuais,
       count(distinct user_id) filter (where action_source = 'manual')         as gestores_manuais,
       count(*) filter (where action_source = 'auto')                          as aberturas_auto,
       (select count(*) from events e2
         where e2.event_type = 'briefing_skipped'
           and date_trunc('week', e2.occurred_at at time zone 'America/Sao_Paulo')::date
             = date_trunc('week', events.occurred_at at time zone 'America/Sao_Paulo')::date) as dias_quietos_registrados
from events
where event_type = 'briefing_opened'
  and occurred_at >= now() - interval '28 days'
group by 1
order by 1;


-- ── B) % de aberturas antes das 9h (rotina de início do dia) ──────────────────
select count(*)                                                              as aberturas,
       count(*) filter (where extract(hour from (occurred_at at time zone 'America/Sao_Paulo')) < 9) as antes_9h,
       round(100.0 * count(*) filter (where extract(hour from (occurred_at at time zone 'America/Sao_Paulo')) < 9)
             / nullif(count(*),0), 1)                                        as pct_antes_9h
from events
where event_type = 'briefing_opened'
  and occurred_at >= now() - interval '28 days';


-- ── C) O LOOP FECHADO: recomendação → plano → resolução ──────────────────────
-- "Tratar" agora persiste um plano e o briefing seguinte cobra. O que decide a
-- tese não é clicar — é o pct_loop_fechado: dos compromissos assumidos, quantos
-- o gestor voltou e marcou como resolvidos.
select count(*) filter (where event_type='briefing_opened')           as briefings_abertos,
       count(*) filter (where event_type='recommendation_clicked')    as rec_clicadas,
       count(*) filter (where event_type='recommendation_actioned')   as rec_tratadas,
       count(*) filter (where event_type='action_plan_created')       as planos_criados,
       count(*) filter (where event_type='action_plan_completed')     as planos_resolvidos,
       round(100.0 * count(*) filter (where event_type='action_plan_completed')
             / nullif(count(*) filter (where event_type='action_plan_created'),0), 1) as pct_loop_fechado,
       round(avg((metadata->>'age_days')::numeric)
             filter (where event_type='action_plan_completed'), 1)    as dias_ate_resolver
from events
where occurred_at >= now() - interval '28 days'
  and event_type in ('briefing_opened','recommendation_clicked','recommendation_actioned',
                     'action_plan_created','action_plan_completed');


-- ── D) Tempo em tela (dwell) — engajamento real com o briefing ────────────────
-- dwell >= 20s distingue "leu" de "fechou no reflexo" (o dano que a anti-fadiga
-- evita). pct_dwell_20s baixo com aberturas altas = fadiga instalada.
select round(avg((metadata->>'seconds')::numeric), 1)                                     as dwell_medio_s,
       percentile_cont(0.5) within group (order by (metadata->>'seconds')::numeric)       as dwell_mediano_s,
       round(100.0 * count(*) filter (where (metadata->>'seconds')::numeric >= 20)
             / nullif(count(*),0), 1)                                                     as pct_dwell_20s,
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
