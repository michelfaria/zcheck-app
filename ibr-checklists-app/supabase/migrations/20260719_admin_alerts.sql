-- ============================================================================
-- 20260719_admin_alerts.sql — Etapa 1.4 do ZCheck Core (motor de alertas).
--
-- `admin_alerts` guarda os alertas gerados pelas regras (sem IA) avaliadas
-- pelo servidor: unidade parada, queda de volume, taxa baixa, usuário ativado
-- sumido, abandonos em sequência.
--
-- Deduplicação: `dedupe_key` único (regra + alvo + janela de tempo). O
-- avaliador roda várias vezes ao dia e insere com "ignore duplicates" — a
-- mesma condição na mesma janela não vira dois alertas, e um alerta resolvido
-- não renasce até a janela seguinte (dia ou semana, conforme a regra).
--
-- `admin_alert_runs` registra cada execução do avaliador — é como a rota
-- decide se está "fresca" (o painel reavalia sozinho se a última execução
-- tiver mais de 65 min; o Vercel Cron diário é só o backstop).
--
-- Sem policies de propósito: só a service_role (rotas /api/admin/*) acessa.
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- ============================================================================

create table if not exists public.admin_alerts (
  id          uuid primary key default gen_random_uuid(),
  severity    text not null check (severity in ('info', 'warning', 'critical')),
  rule        text not null,
  company_id  text,
  unit_id     text,
  user_id     text,
  message     text not null,
  dedupe_key  text not null,
  resolved    boolean not null default false,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists admin_alerts_open_idx
  on public.admin_alerts (resolved, created_at desc);
create unique index if not exists admin_alerts_dedupe_idx
  on public.admin_alerts (dedupe_key);

create table if not exists public.admin_alert_runs (
  id      bigint generated always as identity primary key,
  ran_at  timestamptz not null default now(),
  created int not null default 0
);

alter table public.admin_alerts     enable row level security;
alter table public.admin_alert_runs enable row level security;
revoke all on public.admin_alerts     from anon, authenticated;
revoke all on public.admin_alert_runs from anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Tabelas criadas:
--   select count(*) from public.admin_alerts;
--   select count(*) from public.admin_alert_runs;
--
-- (b) anon bloqueado (esperado: permission denied):
--   set role anon;
--   select * from public.admin_alerts;
--   reset role;
-- ============================================================================
