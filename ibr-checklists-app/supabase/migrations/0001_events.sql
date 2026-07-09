-- ZCheck — Camada de instrumentação de eventos (MVP Inteligência Operacional)
-- Ver docs/REVISAO_MVP_v1.3.md §8 e §14.
--
-- Tabela append-only: uma linha por evento de comportamento no app.
-- Rodar no SQL editor do Supabase (projeto rjuulamozdhssgqrzfji) ou via CLI.

create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  event_type    text not null,               -- ex.: login, checklist_completed, task_completed
  occurred_at   timestamptz not null default now(),
  user_id       text,
  company_id    text,
  unit_id       text,
  sector_id     text,
  checklist_id  text,
  task_id       text,
  role          text,
  device        text,                         -- pwa | mobile-web | desktop
  action_source text,                         -- briefing | checklist | id | ranking | ...
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Índices para as consultas do Learning Dashboard (por tenant e por usuário no tempo).
create index if not exists events_company_type_time_idx
  on public.events (company_id, event_type, occurred_at);
create index if not exists events_user_time_idx
  on public.events (user_id, occurred_at);

-- ── Segurança (RLS) ──────────────────────────────────────────────────────────
-- Os clientes usam a anon key (pública, no bundle). Eles PODEM inserir eventos,
-- mas NÃO podem ler eventos de volta — leitura só via service_role / SQL console.
-- Isso evita vazamento de comportamento entre tenants quando entrar o 2º cliente.
alter table public.events enable row level security;

drop policy if exists events_insert_client on public.events;
create policy events_insert_client on public.events
  for insert to anon, authenticated
  with check (true);

-- Propositalmente SEM policy de SELECT/UPDATE/DELETE para anon:
-- o RLS bloqueia essas operações por padrão. Analytics leem com service_role.
