-- ============================================================================
-- Execução colaborativa — fecha as lacunas da rodada compartilhada (live_tasks)
--
-- O que a rodada compartilhava até aqui era só o `done`. Isso deixou três
-- buracos que aparecem quando duas pessoas dividem o MESMO checklist:
--
--   1. Evidência perdida. Nota e foto viviam no estado local do React de cada
--      aparelho. Quem submetia levava só as próprias — a observação do colega
--      sumia, e a foto que ele tirou não subia para lugar nenhum.
--   2. Corrida. O bloqueio de duplicidade era 100% no cliente, olhando o último
--      fetch. Dois toques simultâneos no mesmo item resolviam por "último upsert
--      vence", e o segundo apagava o crédito do primeiro.
--   3. Reabertura sem rastro. `reopened_count` dizia QUANTAS vezes, nunca quem
--      nem por quê — o motivo ia só para `events`, que ninguém cruza com a
--      rodada na hora de auditar.
--
-- Esta migration é ADITIVA: colunas nullable e funções novas. O app antigo
-- (upsert direto na tabela) continua funcionando enquanto o deploy não sai.
--
-- Rodar no SQL Editor do Supabase (projeto rjuulamozdhssgqrzfji).
-- Teste local: node supabase/migrations/20260729_live_tasks_colaborativo.test.mjs
-- ============================================================================

-- ── Colunas ──────────────────────────────────────────────────────────────────
alter table public.live_tasks add column if not exists note             text;
alter table public.live_tasks add column if not exists photo_path       text;
alter table public.live_tasks add column if not exists reopened_by      text;
alter table public.live_tasks add column if not exists reopened_by_name text;
alter table public.live_tasks add column if not exists reopen_reason    text;
alter table public.live_tasks add column if not exists reopened_at      timestamptz;

-- A purga varre por data; sem índice ela lê a tabela inteira todo dia.
create index if not exists live_tasks_date_idx on public.live_tasks (date);

-- ── Claim atômico ────────────────────────────────────────────────────────────
--
-- O `where lt.done = false` no ON CONFLICT é o ponto inteiro desta função: quem
-- chega depois não atualiza linha nenhuma e recebe `claimed = false` junto com o
-- dono real da tarefa. Sem isso, a checagem "já foi concluída por Fulano" era
-- uma corrida que o cliente não tinha como vencer — os dois viam pendente, os
-- dois marcavam, e o segundo upsert reescrevia o executor do primeiro.
--
-- Reivindicar de novo o que já é seu também devolve `claimed = false`: não é
-- erro, é no-op (o cliente já mostra o item concluído).
--
-- SECURITY INVOKER de propósito — o RLS por company_id continua valendo, e o
-- DEFAULT de company_id preenche o tenant a partir do próprio token.
create or replace function public.claim_live_task(
  p_template_id   text,
  p_unit_id       text,
  p_date          text,
  p_item_id       text,
  p_user_id       text,
  p_operator_name text,
  p_note          text default null,
  p_photo_path    text default null
)
returns table (
  done             boolean,
  operator_user_id text,
  operator_name    text,
  completed_at     timestamptz,
  reopened_count   int,
  note             text,
  photo_path       text,
  claimed          boolean
)
language plpgsql
as $$
declare
  v_claimed boolean;
begin
  insert into public.live_tasks as lt (
    template_id, unit_id, date, item_id, done,
    operator_user_id, operator_name, completed_at, note, photo_path, updated_at
  )
  values (
    p_template_id, p_unit_id, p_date, p_item_id, true,
    p_user_id, p_operator_name, now(), p_note, p_photo_path, now()
  )
  on conflict (template_id, unit_id, date, item_id) do update
    set done             = true,
        operator_user_id = excluded.operator_user_id,
        operator_name    = excluded.operator_name,
        completed_at     = now(),
        -- Nota e foto que já estavam na rodada não são apagadas por quem marca
        -- sem mandar as suas: o colega pode ter anexado a evidência antes.
        note             = coalesce(excluded.note, lt.note),
        photo_path       = coalesce(excluded.photo_path, lt.photo_path),
        updated_at       = now()
    where lt.done = false
  returning true into v_claimed;

  return query
    select lt.done, lt.operator_user_id, lt.operator_name, lt.completed_at,
           lt.reopened_count, lt.note, lt.photo_path, coalesce(v_claimed, false)
      from public.live_tasks lt
     where lt.template_id = p_template_id
       and lt.unit_id     = p_unit_id
       and lt.date        = p_date
       and lt.item_id     = p_item_id;
end
$$;

-- ── Desmarcar ────────────────────────────────────────────────────────────────
--
-- Só o dono desmarca. Desfazer o trabalho de outra pessoa é reabertura — tem
-- motivo e fica registrado. Sem essa separação, "desmarcar" seria uma reabertura
-- anônima e a auditoria não veria nada.
create or replace function public.release_live_task(
  p_template_id text,
  p_unit_id     text,
  p_date        text,
  p_item_id     text,
  p_user_id     text
)
returns table (
  done             boolean,
  operator_user_id text,
  operator_name    text,
  released         boolean
)
language plpgsql
as $$
declare
  v_released boolean;
begin
  update public.live_tasks lt
     set done = false, completed_at = null, updated_at = now()
   where lt.template_id = p_template_id
     and lt.unit_id     = p_unit_id
     and lt.date        = p_date
     and lt.item_id     = p_item_id
     and lt.done        = true
     and lt.operator_user_id is not distinct from p_user_id
  returning true into v_released;

  return query
    select lt.done, lt.operator_user_id, lt.operator_name, coalesce(v_released, false)
      from public.live_tasks lt
     where lt.template_id = p_template_id
       and lt.unit_id     = p_unit_id
       and lt.date        = p_date
       and lt.item_id     = p_item_id;
end
$$;

-- ── Reabrir ──────────────────────────────────────────────────────────────────
--
-- Incrementa no BANCO (era ler-somar-gravar no cliente: duas reaberturas quase
-- simultâneas contavam uma). Guarda quem reabriu e por quê ao lado da rodada —
-- a consulta de auditoria deixa de precisar cruzar com `events`.
--
-- `operator_user_id` do executor anterior é PRESERVADO: quem reabre não herda o
-- crédito de quem tinha feito.
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
  update public.live_tasks lt
     set done             = false,
         completed_at     = null,
         reopened_count   = lt.reopened_count + 1,
         reopened_by      = p_user_id,
         reopened_by_name = p_user_name,
         reopen_reason    = nullif(btrim(coalesce(p_reason, '')), ''),
         reopened_at      = now(),
         updated_at       = now()
   where lt.template_id = p_template_id
     and lt.unit_id     = p_unit_id
     and lt.date        = p_date
     and lt.item_id     = p_item_id
     and lt.done        = true
  returning true into v_reopened;

  return query
    select lt.done, lt.reopened_count, coalesce(v_reopened, false)
      from public.live_tasks lt
     where lt.template_id = p_template_id
       and lt.unit_id     = p_unit_id
       and lt.date        = p_date
       and lt.item_id     = p_item_id;
end
$$;

-- ── Evidência compartilhada ──────────────────────────────────────────────────
--
-- Nota e foto entram na rodada SEM tocar no `done`: anexar evidência não conclui
-- a tarefa, e escrever observação num item que o colega concluiu não pode
-- desmarcá-lo. Quem submeter o checklist leva a evidência de todo mundo.
create or replace function public.set_live_task_evidence(
  p_template_id text,
  p_unit_id     text,
  p_date        text,
  p_item_id     text,
  p_note        text default null,
  p_photo_path  text default null
)
returns void
language sql
as $$
  insert into public.live_tasks as lt (
    template_id, unit_id, date, item_id, done, note, photo_path, updated_at
  )
  values (
    p_template_id, p_unit_id, p_date, p_item_id, false, p_note, p_photo_path, now()
  )
  on conflict (template_id, unit_id, date, item_id) do update
    set note       = coalesce(p_note,       lt.note),
        photo_path = coalesce(p_photo_path, lt.photo_path),
        updated_at = now();
$$;

-- ── Purga ────────────────────────────────────────────────────────────────────
--
-- `live_tasks` é estado EFÊMERO da rodada do dia: passada a data, quem responde
-- pelo que foi feito é `completions` (que guarda doneBy/doneAt por item). A
-- tabela crescia uma linha por item × loja × dia, para sempre.
--
-- 90 dias, não menos: é exatamente a janela que `fetchCompletions` lê e que a
-- retenção de fotos usa. Assim a purga nunca alcança uma rodada que alguma tela
-- do app ainda possa mostrar — o que ela apaga já não é exibível em lugar nenhum.
-- O app está em produção; retenção curta aqui seria apagar histórico vivo.
--
-- SECURITY DEFINER porque quem chama é o cron, sem token.
create or replace function public.purge_live_tasks(p_days int default 90)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff text := to_char(current_date - make_interval(days => greatest(p_days, 1)), 'YYYY-MM-DD');
  v_n int;
begin
  delete from public.live_tasks where date < v_cutoff;
  get diagnostics v_n = row_count;
  return v_n;
end
$$;

revoke all on function public.purge_live_tasks(int) from public;

-- Agenda quando o pg_cron existir (produção). No PGlite do teste e em bancos sem
-- a extensão, só avisa — a migration não pode falhar por causa do agendamento.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('purge-live-tasks');
  end if;
exception when others then null;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-live-tasks', '30 6 * * *', 'select public.purge_live_tasks()');
    raise notice 'purge_live_tasks agendada para 06:30 UTC (03:30 BRT)';
  else
    raise notice 'pg_cron ausente — agende public.purge_live_tasks() manualmente';
  end if;
exception when others then
  raise notice 'agendamento do purge falhou (%): agende manualmente', sqlerrm;
end $$;

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Mesma postura das migrations 03c–03g: o anon não executa nada operacional.
-- Os papéis são conferidos antes: `grant` a papel inexistente aborta a migration
-- inteira, e em banco sem os papéis do Supabase (o PGlite do teste) o resto
-- desta migration é justamente o que precisa ser exercitado.
do $$
declare
  f text;
  tem_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  tem_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  foreach f in array array[
    'claim_live_task(text,text,text,text,text,text,text,text)',
    'release_live_task(text,text,text,text,text)',
    'reopen_live_task(text,text,text,text,text,text,text)',
    'set_live_task_evidence(text,text,text,text,text,text)'
  ]
  loop
    execute format('revoke all on function public.%s from public', f);
    if tem_anon then execute format('revoke all on function public.%s from anon', f); end if;
    if tem_auth then execute format('grant execute on function public.%s to authenticated', f); end if;
  end loop;
end $$;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Duas reivindicações do mesmo item: a 1ª leva, a 2ª devolve o dono real.
--
--   select * from public.claim_live_task('t1','u1','2026-07-29','i1','ana','Ana');
--     -- claimed = true
--   select * from public.claim_live_task('t1','u1','2026-07-29','i1','bru','Bruno');
--     -- claimed = false, operator_name = 'Ana'
--
-- (b) Bruno não desmarca o que é da Ana; a Ana desmarca:
--
--   select released from public.release_live_task('t1','u1','2026-07-29','i1','bru'); -- false
--   select released from public.release_live_task('t1','u1','2026-07-29','i1','ana'); -- true
--
-- (c) A purga não toca no dia de hoje:
--
--   select public.purge_live_tasks(45);
--   select count(*) from public.live_tasks where date >= to_char(current_date, 'YYYY-MM-DD');
--
-- (d) O agendamento existe (só em banco com pg_cron):
--
--   select jobname, schedule, command from cron.job where jobname = 'purge-live-tasks';
-- ============================================================================
