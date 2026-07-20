-- ============================================================================
-- 20260719_agents_retro.sql — Fase 2.3 do ZCheck Core (auto-avaliação).
--
-- Feedback do fundador nos relatórios dos agentes: 👍 (1) / 👎 (-1). Entra na
-- retrospectiva semanal como sinal de qualidade — junto com a taxa de
-- aprovação/rejeição das ações — para os agentes refinarem os próprios
-- prompts (update_prompt vira ADENDO incremental ao prompt-base, nunca
-- substituição; sempre com aprovação do fundador).
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- ============================================================================

alter table public.agent_reports add column if not exists rating smallint
  check (rating in (-1, 1));

-- ============================================================================
-- VERIFICAÇÃO
--   select column_name from information_schema.columns
--    where table_name = 'agent_reports' and column_name = 'rating';
-- ============================================================================
