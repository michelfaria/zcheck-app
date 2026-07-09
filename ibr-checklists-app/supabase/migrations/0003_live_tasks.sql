-- ZCheck — Execução colaborativa em tempo real (H6)
-- Ver docs/REVISAO_MVP_v1.3.md §7 e "Checklists colaborativos" do prompt.
--
-- Estado compartilhado de cada tarefa de um checklist rodando HOJE numa loja:
-- quem concluiu, quando, e quantas vezes foi reaberta (auditoria).
-- Rodar no SQL Editor do Supabase (projeto rjuulamozdhssgqrzfji).

create table if not exists public.live_tasks (
  template_id     text not null,
  unit_id         text not null,
  date            text not null,          -- YYYY-MM-DD (a "rodada" do dia)
  item_id         text not null,
  done            boolean not null default false,
  operator_user_id text,
  operator_name   text,
  completed_at    timestamptz,
  reopened_count  int not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (template_id, unit_id, date, item_id)
);

-- RLS: clientes (anon) leem e escrevem o estado ao vivo (mesma postura das
-- demais tabelas operacionais). TODO: escopar por company quando entrar o 2º tenant.
alter table public.live_tasks enable row level security;

drop policy if exists live_tasks_all on public.live_tasks;
create policy live_tasks_all on public.live_tasks
  for all to anon, authenticated using (true) with check (true);

-- Realtime: o app assina postgres_changes desta tabela para sincronizar
-- executores em tempo real. Adiciona à publicação (ignore erro se já existir).
do $$
begin
  alter publication supabase_realtime add table public.live_tasks;
exception when duplicate_object then null;
end $$;
