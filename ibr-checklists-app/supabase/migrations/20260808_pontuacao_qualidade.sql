-- ============================================================================
-- 20260808_pontuacao_qualidade.sql — o dado que falta para a qualidade pontuar.
--
-- A pontuação de qualidade (componente novo do índice do colaborador) tem uma
-- regra de incentivo: APONTAMENTO SEM MOTIVO NÃO PONTUA. Se a liderança não
-- explicou, não tira ponto de ninguém — é o que alinha o interesse do líder
-- com a métrica de sucesso da conferência (95% dos apontamentos eram mudos na
-- medição de 08/08).
--
-- O problema: o índice de TERCEIROS é calculado no cliente (ranking da
-- Equipe), lendo `task_verdicts` — e a view, por privacidade, não expõe a
-- nota. O cliente de um colega não tem como saber se um apontamento tem
-- motivo.
--
-- A solução é expor o BOOLEANO, nunca o texto: `com_motivo` diz que a
-- liderança escreveu algo, não o quê. O fato de existir explicação já é
-- público por consequência (muda a nota de quem foi apontado, que muda o
-- ranking, que todos veem); o conteúdo continua atrás de `my_task_notes`.
--
-- `create or replace view` mantém as colunas existentes na mesma posição e
-- acrescenta no fim — nenhum consumidor atual quebra.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. Pré-requisito: 20260808_conferencia_privacidade (task_verdicts).
-- ============================================================================

create or replace view public.task_verdicts as
  select company_id, completion_id, item_id, verdict, reviewed_at,
         operator_user_id, executed_by_user_id, date,
         -- O booleano da explicação. NUNCA trocar por `note`: o texto é
         -- privado e sai só por my_task_notes.
         (note is not null) as com_motivo
    from public.task_reviews
   where company_id = public.jwt_company_id();   -- a view bypassa RLS: o filtro
                                                 -- de tenant TEM que estar aqui

grant select on public.task_verdicts to authenticated;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) A coluna nova existe e a nota continua fora:
--   select column_name from information_schema.columns
--    where table_name = 'task_verdicts' order by ordinal_position;
--   -- esperado: ..., date, com_motivo — e NENHUMA coluna 'note'
--
-- (b) O booleano bate com a realidade:
--   select com_motivo, count(*) from public.task_verdicts group by 1;
--   -- esperado (medição 08/08): ~2 com true, o resto false
-- ============================================================================
