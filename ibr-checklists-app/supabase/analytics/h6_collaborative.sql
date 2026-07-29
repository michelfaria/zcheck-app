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
--
-- O denominador é `task_checked` (marcação DURANTE a execução), não
-- `task_completed`: este último só é emitido no submit, um por item concluído do
-- checklist inteiro. Cruzar reabertura — que acontece no meio da execução — com
-- o evento do fim inflava a taxa de retrabalho de forma silenciosa.
select date_trunc('week', (occurred_at at time zone 'America/Sao_Paulo'))::date as semana,
       count(*) filter (where event_type = 'task_checked')  as tarefas_marcadas,
       count(*) filter (where event_type = 'task_reopened') as tarefas_reabertas,
       round(100.0 * count(*) filter (where event_type='task_reopened')
             / nullif(count(*) filter (where event_type='task_checked'),0), 2) as taxa_reabertura_pct
from events
where event_type in ('task_checked','task_reopened')
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
-- Tarefas reabertas ao menos 1× no dia. Depois de
-- 20260729_live_tasks_colaborativo, a própria rodada guarda QUEM reabriu e POR
-- QUÊ — antes o motivo só existia em `events` e a auditoria precisava cruzar as
-- duas tabelas por item_id e horário.
select unit_id, template_id, date, item_id,
       reopened_count,
       operator_name    as executor,      -- quem tinha feito (não muda ao reabrir)
       reopened_by_name as reabriu,
       reopen_reason    as motivo,
       reopened_at, updated_at
from live_tasks
where reopened_count > 0
order by reopened_count desc, updated_at desc
limit 100;


-- ── F) Evidência compartilhada (execução a quatro mãos) ───────────────────────
-- Itens da rodada com nota ou foto anexada por alguém. A conta que importa é a
-- da direita: rodadas em que a evidência veio de quem NÃO submeteu o checklist
-- eram exatamente as que perdiam a prova antes desta versão.
select date,
       count(*)                                  as itens_com_evidencia,
       count(*) filter (where photo_path is not null) as com_foto,
       count(*) filter (where note is not null and note <> '') as com_nota
from live_tasks
where (photo_path is not null or nullif(note,'') is not null)
  and date >= to_char(current_date - 28, 'YYYY-MM-DD')
group by 1 order by 1 desc;
