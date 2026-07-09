-- ============================================================================
-- H5 — Gamificação muda comportamento (não é entretenimento)
-- Learning Dashboard (ver docs/REVISAO_MVP_v1.3.md §7, "Gamificação")
--
-- Mede EFEITO COMPORTAMENTAL, não engajamento com a mecânica: a aderência do
-- MESMO colaborador melhora depois de ganhar uma medalha?
-- Evento: badge_earned (emitido quando o colaborador vê uma conquista nova).
--
-- Critério de VALIDAÇÃO:   aderência_depois > aderência_antes (mesmo colaborador),
--                          de forma consistente, por 4 semanas.
-- Critério de INVALIDAÇÃO: sem diferença, OU efeito perverso (gaming: sobe medalha
--                          mas a qualidade/reabertura não melhora ou piora).
-- ============================================================================


-- ── A) Medalhas concedidas por tipo ───────────────────────────────────────────
select metadata->>'badge_id' as medalha,
       count(*)              as concedidas,
       count(distinct user_id) as colaboradores
from events
where event_type = 'badge_earned'
  and occurred_at >= now() - interval '90 days'
group by 1
order by concedidas desc;


-- ── B) EVENT-STUDY: aderência 14 dias ANTES vs 14 dias DEPOIS da medalha ───────
-- Usa a taxa de conclusão gravada em cada checklist_completed (metadata.rate).
-- Se "depois" > "antes", a medalha mudou o comportamento (sinal de validação).
with badges as (
  select user_id, occurred_at as badge_at, metadata->>'badge_id' as badge_id
  from events
  where event_type = 'badge_earned' and role = 'colaborador'
    and occurred_at >= now() - interval '90 days'
),
rates as (
  select user_id, occurred_at, (metadata->>'rate')::numeric as rate
  from events
  where event_type = 'checklist_completed' and metadata ? 'rate'
)
select b.badge_id,
       count(distinct b.user_id) as colaboradores,
       round(avg(r.rate) filter (where r.occurred_at <  b.badge_at
             and r.occurred_at >= b.badge_at - interval '14 days'), 1) as aderencia_antes,
       round(avg(r.rate) filter (where r.occurred_at >= b.badge_at
             and r.occurred_at <  b.badge_at + interval '14 days'), 1) as aderencia_depois
from badges b
join rates r on r.user_id = b.user_id
group by b.badge_id
order by colaboradores desc;


-- ── C) Event-study CONSOLIDADO (todas as medalhas juntas) ─────────────────────
with badges as (
  select user_id, occurred_at as badge_at
  from events
  where event_type = 'badge_earned' and role = 'colaborador'
    and occurred_at >= now() - interval '90 days'
),
rates as (
  select user_id, occurred_at, (metadata->>'rate')::numeric as rate
  from events
  where event_type = 'checklist_completed' and metadata ? 'rate'
)
select round(avg(r.rate) filter (where r.occurred_at <  b.badge_at
             and r.occurred_at >= b.badge_at - interval '14 days'), 1) as aderencia_antes,
       round(avg(r.rate) filter (where r.occurred_at >= b.badge_at
             and r.occurred_at <  b.badge_at + interval '14 days'), 1) as aderencia_depois
from badges b
join rates r on r.user_id = b.user_id;


-- ── D) ANTI-GAMING: reaberturas subiram depois das medalhas? ──────────────────
-- Se a aderência sobe mas a reabertura também sobe, é gaming (concluir sem
-- qualidade só pelo ponto) — invalida a hipótese.
with badges as (
  select user_id, occurred_at as badge_at
  from events where event_type = 'badge_earned' and role = 'colaborador'
    and occurred_at >= now() - interval '90 days'
),
reopens as (
  select user_id, occurred_at from events where event_type = 'task_reopened'
)
select count(*) filter (where x.occurred_at <  b.badge_at
             and x.occurred_at >= b.badge_at - interval '14 days') as reaberturas_antes,
       count(*) filter (where x.occurred_at >= b.badge_at
             and x.occurred_at <  b.badge_at + interval '14 days') as reaberturas_depois
from badges b
join reopens x on x.user_id = b.user_id;
