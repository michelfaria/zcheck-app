-- ============================================================================
-- Reabrir tarefa que foi REGISTRADA mas não está na rodada ao vivo
--
-- O bloqueio de reexecução passou a ser por TAREFA e a olhar a conclusão
-- gravada, não só a rodada (`live_tasks`). Isso abriu um impasse:
--
--   A tarefa foi submetida hoje (está em `completions`), mas não tem linha em
--   `live_tasks` — a pessoa marcou offline, quem executou foi outro aparelho, ou
--   a rodada é antiga. O app mostra a tarefa como feita e barra refazer, e o
--   único caminho para refazer era "Reabrir"... que fazia UPDATE de uma linha
--   que não existe. Reabria nada, em silêncio, e a tarefa ficava trancada.
--
-- `reopen_live_task` passa a CRIAR a marca de reabertura quando a rodada não tem
-- a tarefa. A linha nasce pendente, com quem reabriu e o motivo — é o registro
-- de "esta tarefa da rodada de hoje voltou a ser pendente".
--
-- Só a função muda (create or replace). Aditiva, nada de dado é tocado.
-- Pré-requisito: 20260729_live_tasks_colaborativo.sql
-- Teste local: node supabase/migrations/20260730_reopen_sem_rodada.test.mjs
-- ============================================================================

create or replace function public.reopen_live_task(
  p_template_id text,
  p_unit_id     text,
  p_date        text,
  p_item_id     text,
  p_user_id     text,
  p_user_name   text,
  p_reason      text default null
)
returns table (
  done           boolean,
  reopened_count int,
  reopened       boolean
)
language plpgsql
as $$
declare
  v_reopened boolean;
begin
  insert into public.live_tasks as lt (
    template_id, unit_id, date, item_id, done,
    reopened_count, reopened_by, reopened_by_name, reopen_reason, reopened_at, updated_at
  )
  values (
    p_template_id, p_unit_id, p_date, p_item_id, false,
    1, p_user_id, p_user_name, nullif(btrim(coalesce(p_reason, '')), ''), now(), now()
  )
  on conflict (template_id, unit_id, date, item_id) do update
    set done             = false,
        completed_at     = null,
        reopened_count   = lt.reopened_count + 1,
        reopened_by      = p_user_id,
        reopened_by_name = p_user_name,
        reopen_reason    = nullif(btrim(coalesce(p_reason, '')), ''),
        reopened_at      = now(),
        updated_at       = now()
    -- Reabrir o que já está pendente não é reabertura: sem isto, tocar duas
    -- vezes no botão contaria dois retrabalhos onde houve um.
    where lt.done = true
  returning true into v_reopened;

  -- `operator_user_id` do executor anterior segue intocado nos dois caminhos:
  -- quem reabre não herda o crédito de quem tinha feito. Na criação ele nasce
  -- nulo — a rodada não sabe quem executou, e é a conclusão gravada que sabe.
  return query
    select lt.done, lt.reopened_count, coalesce(v_reopened, false)
      from public.live_tasks lt
     where lt.template_id = p_template_id
       and lt.unit_id     = p_unit_id
       and lt.date        = p_date
       and lt.item_id     = p_item_id;
end
$$;

do $$
begin
  execute 'revoke all on function public.reopen_live_task(text,text,text,text,text,text,text) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.reopen_live_task(text,text,text,text,text,text,text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.reopen_live_task(text,text,text,text,text,text,text) to authenticated';
  end if;
end $$;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Tarefa que NÃO está na rodada pode ser reaberta (o caso do impasse):
--
--   select * from public.reopen_live_task('t9','u9','2026-07-30','i9','ana','Ana','refazer');
--     -- reopened = true, reopened_count = 1, done = false
--
-- (b) Reabrir o que já está pendente não conta de novo:
--
--   select * from public.reopen_live_task('t9','u9','2026-07-30','i9','ana','Ana','x');
--     -- reopened = false, reopened_count = 1
-- ============================================================================
