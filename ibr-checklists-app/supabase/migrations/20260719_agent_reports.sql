-- ============================================================================
-- 20260719_agent_reports.sql — Fase 2.1 do ZCheck Core (time de gestão de IA).
--
-- O time de agentes é o TIME DE GESTÃO da ZCheck: CEO-agente (Chefe de
-- Gabinete) orquestra 5 diretores (Produto, Growth, CS, Ops, Financeiro),
-- com governança e retroalimentação:
--
--   agent_reports  — tudo que os agentes produzem (briefings, análises, chat),
--                    sempre com o data_snapshot exato usado (auditoria).
--   agent_memory   — o flywheel: lições que os agentes registram e que são
--                    re-injetadas nos prompts seguintes (especialização
--                    progressiva com dados reais).
--   agent_actions  — ledger de AÇÕES executáveis propostas pelos agentes:
--                    proposed → approved/rejected → executed/failed.
--   agent_policies — governança: que tipo de ação auto-executa e qual exige
--                    aprovação do fundador (1 clique no /admin/agentes).
--   agent_prompts  — prompts de sistema versionáveis no banco: os agentes
--                    evoluem sem deploy (override do prompt padrão do código).
--
-- Sem policies de RLS de propósito: só a service_role acessa.
-- ANTHROPIC_API_KEY vive em env var na Vercel — nunca no cliente.
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- ============================================================================

-- ── Produção dos agentes ────────────────────────────────────────────────────
create table if not exists public.agent_reports (
  id            uuid primary key default gen_random_uuid(),
  agent         text not null,          -- ceo | produto | growth | cs | ops | financeiro
  kind          text not null default 'chat',  -- briefing | analysis | chat
  question      text,                   -- pergunta do chat (NULL em briefings)
  report_md     text not null,
  data_snapshot jsonb not null default '{}'::jsonb,
  model         text,
  input_tokens  integer,
  output_tokens integer,
  calls         integer not null default 1,   -- p/ limite diário de chamadas
  created_at    timestamptz not null default now()
);
create index if not exists agent_reports_agent_time_idx
  on public.agent_reports (agent, created_at desc);
create index if not exists agent_reports_time_idx
  on public.agent_reports (created_at desc);

-- ── Memória (flywheel de especialização) ────────────────────────────────────
create table if not exists public.agent_memory (
  id               uuid primary key default gen_random_uuid(),
  agent            text not null,
  content          text not null,       -- a lição, curta e acionável
  source_report_id uuid references public.agent_reports(id) on delete set null,
  archived         boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists agent_memory_agent_idx
  on public.agent_memory (agent, archived, created_at desc);

-- ── Ledger de ações (governança de execução) ────────────────────────────────
create table if not exists public.agent_actions (
  id                uuid primary key default gen_random_uuid(),
  agent             text not null,
  action_type       text not null,      -- ver agent_policies
  payload           jsonb not null default '{}'::jsonb,
  reason            text not null,      -- justificativa do agente, com dados
  status            text not null default 'proposed'
                    check (status in ('proposed','approved','rejected','executed','failed')),
  requires_approval boolean not null default true,
  result            jsonb,
  report_id         uuid references public.agent_reports(id) on delete set null,
  created_at        timestamptz not null default now(),
  decided_at        timestamptz,
  executed_at       timestamptz
);
create index if not exists agent_actions_status_idx
  on public.agent_actions (status, created_at desc);

-- ── Políticas de governança ─────────────────────────────────────────────────
create table if not exists public.agent_policies (
  action_type  text primary key,
  auto_execute boolean not null default false,  -- true = executa sem o fundador
  enabled      boolean not null default true,   -- false = tipo desligado (kill-switch)
  description  text
);

insert into public.agent_policies (action_type, auto_execute, enabled, description) values
  ('save_memory',        true,  true, 'Registrar lição na memória do agente'),
  ('draft_message',      true,  true, 'Rascunhar mensagem de follow-up (não envia — fica pronta para copiar)'),
  ('extend_trial',       false, true, 'Conceder +7 dias de trial a uma empresa'),
  ('deactivate_company', false, true, 'Desativar o acesso de uma empresa'),
  ('activate_company',   false, true, 'Reativar o acesso de uma empresa'),
  ('resolve_alert',      false, true, 'Marcar um alerta do Core como resolvido'),
  ('update_prompt',      false, true, 'Propor melhoria no prompt de sistema de um agente')
on conflict (action_type) do nothing;

-- ── Prompts versionáveis ────────────────────────────────────────────────────
-- Vazio por padrão: o código traz os prompts base. Uma linha aqui SOBRESCREVE
-- o prompt do agente correspondente (a versão mais recente vence).
create table if not exists public.agent_prompts (
  id         uuid primary key default gen_random_uuid(),
  agent      text not null,
  system_md  text not null,
  note       text,                       -- por que esta versão existe
  created_at timestamptz not null default now()
);
create index if not exists agent_prompts_agent_idx
  on public.agent_prompts (agent, created_at desc);

-- ── Segurança ───────────────────────────────────────────────────────────────
alter table public.agent_reports  enable row level security;
alter table public.agent_memory   enable row level security;
alter table public.agent_actions  enable row level security;
alter table public.agent_policies enable row level security;
alter table public.agent_prompts  enable row level security;
revoke all on public.agent_reports  from anon, authenticated;
revoke all on public.agent_memory   from anon, authenticated;
revoke all on public.agent_actions  from anon, authenticated;
revoke all on public.agent_policies from anon, authenticated;
revoke all on public.agent_prompts  from anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Tabelas criadas e políticas semeadas (7 linhas):
--   select action_type, auto_execute, enabled from public.agent_policies;
--
-- (b) anon bloqueado (esperado: permission denied):
--   set role anon;
--   select * from public.agent_reports;
--   reset role;
-- ============================================================================
