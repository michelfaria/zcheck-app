-- ============================================================================
-- Os agendamentos do pg_cron, versionados
--
-- Três dos quatro crons do projeto existiam SÓ no banco, criados à mão:
--
--   notify-overdue-checklists   */5 * * * *   alerta de atraso e de entrega
--                                             incompleta (edge function)
--   cleanup-checklist-photos    0 6 * * *     retenção de fotos, 90 dias
--   cleanup-login-attempts      0 * * * *     limpa tentativas de login
--
-- Só `purge-live-tasks` estava em migration (20260729). Se o projeto Supabase
-- for recriado — ou se alguém rodar as migrations num projeto novo — os três
-- desaparecem SEM AVISO NENHUM: o app continua de pé, e a operação
-- simplesmente para de receber alerta de atraso. Foi assim que a notify-overdue
-- passou meses morta respondendo "No overdue" (ver o cabeçalho da função).
--
-- ── Só CRIA o que falta ─────────────────────────────────────────────────────
-- `cron.schedule` com um jobname existente SUBSTITUI o agendamento. Como os três
-- já estão no ar e funcionando, substituir seria trocar o que funciona por uma
-- transcrição — e um erro de digitação aqui derrubaria o alerta da operação sem
-- fazer barulho. Então cada bloco só age se o job NÃO existir.
--
-- No banco de hoje esta migration é um no-op. O valor dela é o dia em que não for.
--
-- ── Sobre a chave no comando ────────────────────────────────────────────────
-- As funções são deployadas com `verify_jwt: true`, então a chamada precisa de um
-- JWT. Os jobs existentes usam a ANON KEY, que é pública por construção: ela já
-- vai no bundle do app (`lib/supabase.js`, versionado neste mesmo repositório
-- público). Não há segredo novo exposto aqui. O que protege as funções é o RLS e
-- o `SERVICE_ROLE` que elas usam por dentro — nunca a chave de entrada.
--
-- ADITIVA. Rodar no SQL Editor do Supabase (projeto rjuulamozdhssgqrzfji).
-- Teste local: node supabase/migrations/20260730_crons_versionados.test.mjs
-- ============================================================================

do $$
declare
  v_base   text := 'https://rjuulamozdhssgqrzfji.supabase.co/functions/v1/';
  v_anon   text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdXVsYW1vemRoc3NncXJ6ZmppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNjc5MjksImV4cCI6MjA5Nzg0MzkyOX0.xxpJLp5SCpQRxMcuDMo-XD8offX2hrVUC_bU9I8me2M';
  v_cmd    text;
  v_criados text[] := '{}';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron ausente — nenhum agendamento criado (esperado em banco de teste)';
    return;
  end if;

  -- notify-overdue: a cada 5 minutos. O alerta precisa sair perto do prazo, e a
  -- deduplicação por dia (`notified_`/`incomplete_` em `config`) é o que impede
  -- a repetição a cada execução.
  if not exists (select 1 from cron.job where jobname = 'notify-overdue-checklists') then
    v_cmd := format($f$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := '{}'::jsonb
      );
    $f$, v_base || 'notify-overdue',
         format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', v_anon));
    perform cron.schedule('notify-overdue-checklists', '*/5 * * * *', v_cmd);
    v_criados := v_criados || 'notify-overdue-checklists';
  end if;

  -- cleanup-photos: 06:00 UTC (03:00 BRT), fora do horário de operação.
  if not exists (select 1 from cron.job where jobname = 'cleanup-checklist-photos') then
    v_cmd := format($f$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := '{}'::jsonb
      );
    $f$, v_base || 'cleanup-photos',
         format('{"Content-Type": "application/json", "Authorization": "Bearer %s"}', v_anon));
    perform cron.schedule('cleanup-checklist-photos', '0 6 * * *', v_cmd);
    v_criados := v_criados || 'cleanup-checklist-photos';
  end if;

  -- Rate-limit do login: a função é local ao banco, sem HTTP.
  if not exists (select 1 from cron.job where jobname = 'cleanup-login-attempts') then
    perform cron.schedule('cleanup-login-attempts', '0 * * * *', 'SELECT cleanup_login_attempts()');
    v_criados := v_criados || 'cleanup-login-attempts';
  end if;

  -- Purga da rodada ao vivo: já vinha da 20260729, repetida aqui para este
  -- arquivo ser a lista COMPLETA. Idempotente pelo mesmo `if not exists`.
  if not exists (select 1 from cron.job where jobname = 'purge-live-tasks') then
    perform cron.schedule('purge-live-tasks', '30 6 * * *', 'select public.purge_live_tasks()');
    v_criados := v_criados || 'purge-live-tasks';
  end if;

  if array_length(v_criados, 1) is null then
    raise notice 'nenhum agendamento criado — os quatro já existiam (esperado no banco atual)';
  else
    raise notice 'agendamentos criados: %', array_to_string(v_criados, ', ');
  end if;
end $$;

-- ============================================================================
-- VERIFICAÇÃO
--
--   select jobname, schedule, active from cron.job order by jobname;
--
-- Esperado (4 linhas, todas active):
--   cleanup-checklist-photos    0 6 * * *
--   cleanup-login-attempts      0 * * * *
--   notify-overdue-checklists   */5 * * * *
--   purge-live-tasks            30 6 * * *
--
-- Se algum sumir no futuro, é isto que o traz de volta — rodar esta migration de
-- novo é seguro.
-- ============================================================================
