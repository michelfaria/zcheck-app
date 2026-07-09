-- ============================================================================
-- H3 — Líderes usam métricas objetivas para reconhecer/dar feedback
-- Learning Dashboard (ver docs/REVISAO_MVP_v1.3.md §7, §9, §11)
--
-- Rodar no SQL Editor do Supabase (projeto rjuulamozdhssgqrzfji).
--
-- Critério de VALIDAÇÃO:   ≥60% dos líderes ativos enviam ≥1 reconhecimento
--                          ancorado em métrica, em 3 das 4 semanas.
-- Critério de INVALIDAÇÃO: <20% dos líderes usam a métrica.
-- ============================================================================


-- ── A) MÉTRICA-ÂNCORA: % de líderes que reconheceram (com métrica) por semana ─
with lead as (
  select user_id, event_type, metadata,
         date_trunc('week', (occurred_at at time zone 'America/Sao_Paulo'))::date as semana
  from events
  where role in ('lideranca','gerencia','gestao')
    and occurred_at >= now() - interval '28 days'
),
ativos as (  -- líderes ativos na semana (tiveram login)
  select semana, user_id from lead where event_type = 'login' group by 1,2
),
recon as (   -- líderes que enviaram reconhecimento ancorado em métrica
  select semana, user_id
  from lead
  where event_type = 'recognition_sent'
    and coalesce((metadata->>'has_metric')::boolean, false) is true
  group by 1,2
)
select a.semana,
       count(distinct a.user_id)                                          as lideres_ativos,
       count(distinct r.user_id)                                          as reconheceram_c_metrica,
       round(100.0 * count(distinct r.user_id)
             / nullif(count(distinct a.user_id),0), 1)                    as pct
from ativos a
left join recon r on r.semana = a.semana and r.user_id = a.user_id
group by a.semana
order by a.semana;


-- ── B) % de reconhecimentos ancorados numa métrica (vs. livres) ───────────────
select count(*)                                                                 as reconhecimentos,
       count(*) filter (where coalesce((metadata->>'has_metric')::boolean,false)) as com_metrica,
       round(100.0 * count(*) filter (where coalesce((metadata->>'has_metric')::boolean,false))
             / nullif(count(*),0), 1)                                            as pct_com_metrica
from events
where event_type = 'recognition_sent'
  and occurred_at >= now() - interval '28 days';


-- ── C) FUNIL por líder: perfis vistos → reconhecimentos → com métrica ─────────
select user_id                                                                     as lider,
       count(*) filter (where event_type = 'collaborator_profile_viewed')          as perfis_vistos,
       count(*) filter (where event_type = 'recognition_sent')                     as reconhecimentos,
       count(*) filter (where event_type = 'recognition_sent'
                          and coalesce((metadata->>'has_metric')::boolean,false))  as com_metrica
from events
where role in ('lideranca','gerencia','gestao')
  and event_type in ('collaborator_profile_viewed','recognition_sent')
  and occurred_at >= now() - interval '28 days'
group by user_id
order by reconhecimentos desc;


-- ── D) Quais métricas os líderes mais usam como âncora ────────────────────────
select coalesce(nullif(metadata->>'metric_ref',''), '(sem métrica / livre)') as metric_ref,
       count(*) as n
from events
where event_type = 'recognition_sent'
  and occurred_at >= now() - interval '28 days'
group by 1
order by n desc;


-- ── E) Reconhecimentos reais (requer a migração 0002_recognitions aplicada) ───
-- Mostra o conteúdo dos reconhecimentos enviados (líder → colaborador + âncora).
select r.created_at, r.from_user_name as lider, r.to_user_name as colaborador,
       r.metric_label, r.message
from recognitions r
order by r.created_at desc
limit 50;
