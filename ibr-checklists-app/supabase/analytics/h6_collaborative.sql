-- ============================================================================
-- H6 — Checklists colaborativos reduzem retrabalho e falhas de comunicação
-- Learning Dashboard (ver docs/REVISAO_MVP_v1.3.md §7, §11)
--
-- Execução multi-executor em tempo real (tabela live_tasks) + auditoria de
-- reabertura. Requer as migrações 0001_events e 0003_live_tasks aplicadas.
--
-- Critério de VALIDAÇÃO:   redução mensurável de reabertura/duplicidade vs.
--                          a linha de base solo, ao longo de 4 semanas.
-- ============================================================================


-- ── A) Colaboração: sessões com >1 executor e média de executores ─────────────
select date_trunc('week', (occurred_at at time zone 'America/Sao_Paulo'))::date as semana,
       count(*)                                        as sessoes_colaborativas,
       round(avg((metadata->>'operators')::numeric),1) as media_executores
from events
where event_type = 'collaborative_session'
  and occurred_at >= now() - interval '28 days'
group by 1 order by 1;


-- ── B) Taxa de reabertura por semana (retrabalho) ─────────────────────────────
select date_trunc('week', (occurred_at at time zone 'America/Sao_Paulo'))::date as semana,
       count(*) filter (where event_type = 'task_completed')  as tarefas_concluidas,
       count(*) filter (where event_type = 'task_reopened')   as tarefas_reabertas,
       round(100.0 * count(*) filter (where event_type='task_reopened')
             / nullif(count(*) filter (where event_type='task_completed'),0), 2) as taxa_reabertura_pct
from events
where event_type in ('task_completed','task_reopened')
  and occurred_at >= now() - interval '28 days'
group by 1 order by 1;


-- ── C) Execução duplicada evitada (colisões bloqueadas) ───────────────────────
select date_trunc('week', (occurred_at at time zone 'America/Sao_Paulo'))::date as semana,
       count(*) as duplicidades_bloqueadas
from events
where event_type = 'duplicate_execution_blocked'
  and occurred_at >= now() - interval '28 days'
group by 1 order by 1;


-- ── D) Motivos de reabertura (auditoria qualitativa) ──────────────────────────
select coalesce(nullif(metadata->>'reason',''), '(sem motivo informado)') as motivo,
       count(*) as n
from events
where event_type = 'task_reopened'
  and occurred_at >= now() - interval '28 days'
group by 1 order by n desc;


-- ── E) Auditoria de reabertura via live_tasks (requer 0003 aplicada) ──────────
-- Tarefas que foram reabertas ao menos 1× no dia — quem, quando, quantas vezes.
select unit_id, template_id, date, item_id,
       reopened_count, operator_name, updated_at
from live_tasks
where reopened_count > 0
order by reopened_count desc, updated_at desc
limit 100;
