-- ============================================================================
-- H4 — IA reduz esforço de análise e acelera a decisão
-- Learning Dashboard (ver docs/REVISAO_MVP_v1.3.md §7, §9, §16)
--
-- Insight do dia aparece no topo do Daily Briefing (hoje rule-based; o
-- contrato de eventos é o mesmo se depois virar LLM).
--
-- Critério de VALIDAÇÃO:   ≥50% dos insights marcados úteis  E  ≥30% geram ação.
-- Critério de INVALIDAÇÃO: <20% úteis, ou ~0% de ação.
-- ============================================================================


-- ── A) MÉTRICAS-ÂNCORA: % útil e % que gera ação ──────────────────────────────
select
  count(*) filter (where event_type = 'ai_insight_viewed')                          as insights_vistos,
  count(*) filter (where event_type = 'ai_insight_feedback')                         as com_feedback,
  count(*) filter (where event_type = 'ai_insight_feedback' and metadata->>'answer'='yes') as uteis,
  round(100.0 * count(*) filter (where event_type='ai_insight_feedback' and metadata->>'answer'='yes')
        / nullif(count(*) filter (where event_type='ai_insight_feedback'),0), 1)     as pct_util,
  count(*) filter (where event_type = 'ai_insight_actioned')                         as geraram_acao,
  round(100.0 * count(*) filter (where event_type='ai_insight_actioned')
        / nullif(count(*) filter (where event_type='ai_insight_viewed'),0), 1)       as pct_acao
from events
where occurred_at >= now() - interval '28 days'
  and event_type in ('ai_insight_viewed','ai_insight_feedback','ai_insight_actioned');


-- ── B) Desempenho por TIPO de insight (qual padrão o gestor mais valoriza) ────
select metadata->>'type' as tipo,
       count(*) filter (where event_type='ai_insight_viewed')                        as vistos,
       count(*) filter (where event_type='ai_insight_feedback' and metadata->>'answer'='yes') as uteis,
       count(*) filter (where event_type='ai_insight_actioned')                      as acoes
from events
where occurred_at >= now() - interval '28 days'
  and event_type in ('ai_insight_viewed','ai_insight_feedback','ai_insight_actioned')
group by metadata->>'type'
order by vistos desc;


-- ── C) Feedback bruto (útil × não útil) ───────────────────────────────────────
select metadata->>'answer' as resposta, count(*) as n
from events
where event_type = 'ai_insight_feedback'
  and occurred_at >= now() - interval '28 days'
group by 1 order by n desc;
