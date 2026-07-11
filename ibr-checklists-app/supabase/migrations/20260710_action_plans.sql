-- ============================================================================
-- Action Plans — fecha o loop do Daily Briefing (H1).
--
-- Contexto: o botão "Tratar" do briefing só mudava um booleano em memória e
-- emitia um evento. Nada persistia, o briefing não tinha memória entre dias, e
-- nada do que foi "tratado" voltava para cobrar resolução. O gestor lia e
-- fechava — por construção (revisão de produto de 09/07/2026).
--
-- Agora "Tratar" cria uma linha aqui, e o briefing do dia seguinte pergunta
-- "você marcou X para tratar — resolveu?". Os eventos `action_plan_created` e
-- `action_plan_completed` (catálogo §8 da REVISAO_MVP_v1.3) medem o funil.
--
-- Pré-requisitos: tenant_01 (jwt_company_id) e tenant_02. Esta tabela NASCE
-- escopada: só `authenticated` a enxerga, e apenas dentro do próprio tenant.
-- O role `anon` nunca recebe grant — não há nada para a tenant_03 revogar.
-- ============================================================================

create table if not exists public.action_plans (
  id              uuid primary key default gen_random_uuid(),
  company_id      text not null default public.jwt_company_id(),
  created_at      timestamptz not null default now(),
  briefing_date   text not null,            -- yyyy-mm-dd do briefing que gerou o plano
  rec_id          text not null,            -- id da recomendação (hotspot_..., overdue_today, low_adherence)
  rec_type        text,
  rec_text        text,                     -- snapshot do texto mostrado ao gestor
  unit_id         text,
  created_by      text not null,            -- users.id do gestor (texto, não uuid)
  created_by_name text,
  status          text not null default 'open',  -- open | done
  completed_at    timestamptz,
  completed_by    text
);

create index if not exists action_plans_company_status_idx
  on public.action_plans (company_id, status, briefing_date);

-- Um plano ABERTO por recomendação por empresa. Impede duplicar o mesmo
-- compromisso; concluído, a mesma recomendação pode gerar um plano novo.
create unique index if not exists action_plans_open_unique
  on public.action_plans (company_id, rec_id)
  where status = 'open';

alter table public.action_plans enable row level security;

drop policy if exists action_plans_tenant_rw on public.action_plans;
create policy action_plans_tenant_rw on public.action_plans
  for all to authenticated
  using      (company_id = public.jwt_company_id())
  with check (company_id = public.jwt_company_id());

-- Sem delete: plano é registro. Concluir é update de status.
grant select, insert, update on public.action_plans to authenticated;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) anon não enxerga nada:
--
--   set role anon;
--   select count(*) from public.action_plans;   -- esperado: permission denied
--   reset role;
--
-- (b) O índice parcial bloqueia plano aberto duplicado (rode como postgres):
--
--   insert into public.action_plans (company_id, briefing_date, rec_id, created_by)
--   values ('ibr', '2026-07-10', 'teste_dup', 'u1');
--   insert into public.action_plans (company_id, briefing_date, rec_id, created_by)
--   values ('ibr', '2026-07-11', 'teste_dup', 'u1');
--   -- esperado: duplicate key value violates "action_plans_open_unique"
--   delete from public.action_plans where rec_id = 'teste_dup';
--
-- (c) Funil de medição (Learning Dashboard):
--
--   select count(*) filter (where event_type = 'action_plan_created')   as criados,
--          count(*) filter (where event_type = 'action_plan_completed') as concluidos
--     from public.events
--    where company_id = 'ibr' and occurred_at > now() - interval '28 days';
-- ============================================================================
