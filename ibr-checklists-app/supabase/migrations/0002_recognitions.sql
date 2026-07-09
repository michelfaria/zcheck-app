-- ZCheck — Reconhecimentos (H3 — líderes usam métricas para reconhecer)
-- Ver docs/REVISAO_MVP_v1.3.md §7, §14.
--
-- Um líder reconhece um colaborador, ancorado (idealmente) numa métrica do ID.
-- Rodar no SQL Editor do Supabase (projeto rjuulamozdhssgqrzfji).

create table if not exists public.recognitions (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  company_id     text,
  from_user_id   text not null,          -- líder que reconheceu
  from_user_name text,
  to_user_id     text not null,          -- colaborador reconhecido
  to_user_name   text,
  unit_id        text,
  metric_ref     text,                   -- âncora de métrica (null = reconhecimento livre)
  metric_label   text,                   -- texto legível da métrica
  message        text
);

create index if not exists recognitions_to_idx   on public.recognitions (to_user_id, created_at desc);
create index if not exists recognitions_from_idx on public.recognitions (from_user_id, created_at desc);

-- RLS: clientes (anon) podem inserir e ler (o colaborador precisa ver o que recebeu).
-- Mesma postura das tabelas atuais (completions/users já são anon-readable).
-- TODO multi-tenant: escopar por company_id quando entrar o 2º cliente (§14).
alter table public.recognitions enable row level security;

drop policy if exists recognitions_insert on public.recognitions;
create policy recognitions_insert on public.recognitions
  for insert to anon, authenticated with check (true);

drop policy if exists recognitions_select on public.recognitions;
create policy recognitions_select on public.recognitions
  for select to anon, authenticated using (true);
