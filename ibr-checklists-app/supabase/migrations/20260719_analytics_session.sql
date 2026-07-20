-- ============================================================================
-- 20260719_analytics_session.sql — Etapa 1.1 do ZCheck Core (instrumentação).
--
-- A fundação já existia (0001_events.sql): tabela `events` append-only, RLS
-- insert-only para anon/authenticated, leitura só via service_role. Esta
-- migration só ADICIONA o que faltava para o /admin:
--
--   1. `events.session_id` — id de sessão de navegação gerado no cliente
--      (sessionStorage). Liga o app_opened anônimo ao login que vem depois:
--      é a espinha do funil de ativação e da métrica de abandono.
--   2. Índice por (event_type, occurred_at) — as views do /admin agregam por
--      tipo de evento no tempo, cross-tenant; o índice existente começa por
--      company_id e não serve para essas varreduras.
--   3. Índice por session_id — reconstrução de jornada no drill-down.
--
-- ORDEM: rode ESTE script ANTES do deploy do app. O track.js novo passa a
-- enviar session_id em todo insert; sem a coluna, o insert falha e a fila
-- offline dos clientes ficaria reagendando para sempre.
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- ============================================================================

alter table public.events add column if not exists session_id text;

create index if not exists events_type_time_idx
  on public.events (event_type, occurred_at);

create index if not exists events_session_idx
  on public.events (session_id, occurred_at)
  where session_id is not null;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Coluna criada:
--   select column_name from information_schema.columns
--    where table_name = 'events' and column_name = 'session_id';
--
-- (b) Depois do deploy + uma visita ao app, eventos novos chegam com sessão:
--   select event_type, session_id, occurred_at
--     from public.events
--    order by occurred_at desc limit 10;
--   -- esperado: app_opened (e login, se logar) com o MESMO session_id
-- ============================================================================
