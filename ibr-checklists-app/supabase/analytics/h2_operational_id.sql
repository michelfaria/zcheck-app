-- ============================================================================
-- H2 — ID Operacional aumenta engajamento e senso de evolução do colaborador
-- Learning Dashboard (ver docs/REVISAO_MVP_v1.3.md §7, §9, §11)
--
-- Rodar no SQL Editor do Supabase (projeto rjuulamozdhssgqrzfji) — como
-- postgres, ignora o RLS que bloqueia leitura de `events` pela anon key.
--
-- Critério de VALIDAÇÃO:   ≥50% dos colaboradores ativos abrem o ID ≥1×/semana
--                          por 4 semanas  E  quem vê o ID tem aderência maior
--                          do que quem não vê.
-- Critério de INVALIDAÇÃO: <20% abrem, ou nenhuma diferença de comportamento.
-- ============================================================================


-- ── A) MÉTRICA-ÂNCORA: % de colaboradores que abriram o ID na semana ──────────
-- pct_abriu >= 50 por 4 semanas → sinal de validação | < 20 → sinal de invalidação
with colab as (  -- eventos de colaboradores nos últimos 28 dias
  select user_id, event_type,
         date_trunc('week', (occurred_at at time zone 'America/Sao_Paulo'))::date as semana
  from events
  where role = 'colaborador'
    and occurred_at >= now() - interval '28 days'
),
ativos as (  -- colaboradores ativos na semana = tiveram login
  select semana, user_id from colab where event_type = 'login' group by 1,2
),
viram as (   -- colaboradores que abriram o ID na semana
  select semana, user_id from colab where event_type = 'operational_id_viewed' group by 1,2
)
select a.semana,
       count(distinct a.user_id)                                            as colaboradores_ativos,
       count(distinct v.user_id)                                            as abriram_id,
       round(100.0 * count(distinct v.user_id)
             / nullif(count(distinct a.user_id),0), 1)                      as pct_abriu
from ativos a
left join viram v on v.semana = a.semana and v.user_id = a.user_id
group by a.semana
order by a.semana;


-- ── B) Recorrência: em quantas semanas distintas cada colaborador abriu o ID ──
-- Hábito real = abrir em várias semanas, não só uma vez.
select user_id,
       count(distinct date_trunc('week', (occurred_at at time zone 'America/Sao_Paulo'))) as semanas_com_abertura,
       count(*)          as aberturas_totais,
       max(occurred_at)  as ultima_abertura
from events
where event_type = 'operational_id_viewed'
  and role = 'colaborador'
  and occurred_at >= now() - interval '28 days'
group by user_id
order by semanas_com_abertura desc, aberturas_totais desc;


-- ── C) CORRELAÇÃO "viu × não viu": aderência de quem abre o ID vs quem não ─────
-- Usa a taxa de conclusão gravada em cada checklist_completed (metadata.rate).
-- Se "viu o ID" tem aderência maior → sinal forte de validação comportamental.
with win as (select (now() - interval '28 days') as since),
viewers as (
  select distinct user_id
  from events, win
  where event_type = 'operational_id_viewed' and role = 'colaborador'
    and occurred_at >= win.since
),
adh as (
  select user_id,
         avg((metadata->>'rate')::numeric) as aderencia_media,
         count(*)                          as checklists
  from events, win
  where event_type = 'checklist_completed' and role = 'colaborador'
    and occurred_at >= win.since and metadata ? 'rate'
  group by user_id
)
select case when v.user_id is not null then 'viu o ID' else 'não viu' end as grupo,
       count(*)                          as colaboradores,
       round(avg(a.aderencia_media), 1)  as aderencia_media_pct,
       round(avg(a.checklists), 1)       as checklists_media
from adh a
left join viewers v on v.user_id = a.user_id
group by 1
order by 1;


-- ── D) Micro-pergunta: "ver sua evolução aqui te motiva?" ─────────────────────
select metadata->>'answer' as resposta, count(*) as n
from events
where event_type = 'survey_answered'
  and metadata->>'question' = 'operational_id_motivates'
  and occurred_at >= now() - interval '28 days'
group by 1
order by n desc;


-- ── E) Saúde: volume de aberturas do ID por dia ──────────────────────────────
select (occurred_at at time zone 'America/Sao_Paulo')::date as dia,
       count(*)                as aberturas,
       count(distinct user_id) as colaboradores_distintos
from events
where event_type = 'operational_id_viewed'
  and occurred_at >= now() - interval '28 days'
group by 1
order by 1;
