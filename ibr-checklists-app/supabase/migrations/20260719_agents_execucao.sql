-- ============================================================================
-- 20260719_agents_execucao.sql — Fase 2.2 do ZCheck Core (execução real + metas).
--
-- (1) Contato por empresa: `contact_email` / `contact_whatsapp` em companies —
--     o canal que o time de agentes usa para follow-up real. Backfill do
--     e-mail a partir do cadastro self-service (signups), quando existir.
-- (2) `agent_goals` — as METAS que o time persegue: entram no snapshot de
--     todos os agentes e são revisadas pelo CEO-agente às segundas-feiras.
-- (3) Políticas novas: send_followup (e-mail real via Brevo — SEMPRE com
--     aprovação do fundador) e set_goal (definir/ajustar meta — aprovação).
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- ============================================================================

-- ── (1) Contatos ────────────────────────────────────────────────────────────
alter table public.companies add column if not exists contact_email text;
alter table public.companies add column if not exists contact_whatsapp text;

-- Backfill: e-mail do cadastro self-service mais recente de cada empresa.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'signups') then
    update public.companies c
       set contact_email = s.email
      from (
        select distinct on (provisioned_company_id) provisioned_company_id, email
          from public.signups
         where provisioned_company_id is not null and verified_at is not null
         order by provisioned_company_id, created_at desc
      ) s
     where s.provisioned_company_id = c.id
       and c.contact_email is null;
  end if;
end $$;

-- As colunas novas herdam o SELECT que o anon tem em companies (login pré-
-- sessão usa select('*')) — contato não é segredo (é o dono da conta), mas se
-- preferir escondê-las do anon, é só pedir que criamos uma view.
grant select on public.companies to anon, authenticated;

-- ── (2) Metas ───────────────────────────────────────────────────────────────
create table if not exists public.agent_goals (
  id         uuid primary key default gen_random_uuid(),
  metric     text not null,      -- mrr | paying_companies | active_companies_7d |
                                 -- checklists_7d | trials_active | custom
  label      text not null,      -- descrição humana da meta
  target     numeric not null,
  unit       text,               -- 'R$' | 'empresas' | 'checklists' | ...
  deadline   date,
  status     text not null default 'active'
             check (status in ('active', 'achieved', 'missed', 'archived')),
  created_by text not null default 'founder',  -- founder | ceo
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_goals_status_idx on public.agent_goals (status, created_at desc);

alter table public.agent_goals enable row level security;
revoke all on public.agent_goals from anon, authenticated;

-- ── (3) Políticas novas ─────────────────────────────────────────────────────
insert into public.agent_policies (action_type, auto_execute, enabled, description) values
  ('send_followup', false, true, 'Enviar follow-up REAL por e-mail (Brevo) ao contato da empresa'),
  ('set_goal',      false, true, 'Definir ou ajustar uma meta do time')
on conflict (action_type) do nothing;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Contatos backfillados (kalit deve vir com e-mail se veio do /comecar):
--   select id, contact_email, contact_whatsapp from public.companies;
--
-- (b) Políticas (9 linhas agora):
--   select action_type, auto_execute from public.agent_policies order by 1;
--
-- (c) Metas vazia e bloqueada para anon:
--   set role anon; select * from public.agent_goals; reset role;  -- permission denied
-- ============================================================================
