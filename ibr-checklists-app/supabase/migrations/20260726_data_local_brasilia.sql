-- ============================================================================
-- Corrige o dia de operação das execuções gravadas em UTC
--
-- CONTEXTO
-- Até 26/07/2026 o cliente calculava o dia com
-- `new Date().toISOString().slice(0,10)`, que devolve a data em UTC. Em
-- Brasília (UTC-3) isso vira o dia SEGUINTE a partir das 21:00 locais — a
-- janela em que bar e restaurante rodam o checklist de Fechamento.
--
-- Duas consequências nos dados:
--   1. A execução ficou com `date` de amanhã.
--   2. `completionOnTime` compara `completed_at` contra `${date}T${prazo}` —
--      com a data adiantada, o prazo comparado é o de amanhã e TODO fechamento
--      tardio dessa janela consta como "no prazo".
--
-- O código passou a usar lib/dates.js (fuso fixo America/Sao_Paulo). Esta
-- migration realinha o histórico com essa mesma régua.
--
-- COMO IDENTIFICAMOS
-- O app SEMPRE grava `date` = dia de hoje e `completed_at` = instante do save,
-- na mesma linha (app/app/page.js, saveCompletion) — nunca a data escolhida na
-- tela. Logo, `date` diferente do dia de `completed_at` em São Paulo é sempre
-- o bug, nunca um lançamento retroativo legítimo.
--
-- FORA DE ESCOPO, de propósito:
--   · `closures` (folgas) — a data vem do calendário clicado, string montada à
--     mão, sem fuso. Já estava certa.
--   · `live_tasks` — estado efêmero da rodada do dia; corrigir o passado não
--     muda nada e o UPDATE colidiria com a PK (template, unit, date, item).
--     ATENÇÃO: se o deploy sair entre 21h e 00h, uma execução colaborativa em
--     andamento perde as marcas na tela (foram gravadas com o dia de amanhã).
--     Deployar fora dessa janela.
--   · `action_plans.briefing_date` — rótulo do dia em que o plano nasceu; não
--     entra em nenhum cálculo de aderência ou prazo.
--
-- ANTES DE RODAR — quantas execuções serão tocadas, por loja e por mês:
--
--   select c.unit_id,
--          to_char((c.completed_at::timestamptz at time zone 'America/Sao_Paulo'), 'YYYY-MM') as mes,
--          count(*) as execucoes,
--          min(c.date::text) as primeira,
--          max(c.date::text) as ultima
--     from public.completions c
--    where c.completed_at is not null
--      and c.date::date <> (c.completed_at::timestamptz at time zone 'America/Sao_Paulo')::date
--    group by 1, 2
--    order by 2, 1;
--
-- Reversível: `fix_data_local_20260726` guarda o valor antigo de cada linha
-- (rollback no rodapé deste arquivo).
--
-- TESTADA contra Postgres real (PGlite), nos dois tipos possíveis de
-- `completions.date`, incluindo idempotência e rollback:
--   npm i --no-save @electric-sql/pglite
--   node supabase/migrations/20260726_data_local_brasilia.test.mjs
-- ============================================================================

-- ── Auditoria / rollback ────────────────────────────────────────────────────
create table if not exists public.fix_data_local_20260726 (
  completion_id text primary key,
  date_antiga   text        not null,
  date_nova     text        not null,
  completed_at  timestamptz,
  migrado_em    timestamptz not null default now()
);

-- Ninguém no app precisa ler isto: é registro de manutenção, lido pelo
-- SQL Editor (que roda como `postgres` e ignora RLS).
alter table public.fix_data_local_20260726 enable row level security;
revoke all on public.fix_data_local_20260726 from anon, authenticated;

-- ── Correção ────────────────────────────────────────────────────────────────
-- `completions` foi criada fora das migrations (direto no dashboard), então o
-- tipo de `date` não está versionado em lugar nenhum: pode ser `date` ou
-- `text`. O bloco descobre o tipo e monta o SET compatível — atribuir `date` a
-- uma coluna `text` não faz cast implícito e abortaria a migration.
do $$
declare
  v_type text;
  v_set  text;
begin
  select data_type into v_type
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'completions'
     and column_name  = 'date';

  if v_type is null then
    raise exception 'public.completions.date não encontrada — nada a migrar';
  end if;

  insert into public.fix_data_local_20260726 (completion_id, date_antiga, date_nova, completed_at)
  select c.id::text,
         c.date::text,
         to_char((c.completed_at::timestamptz at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'),
         c.completed_at::timestamptz
    from public.completions c
   where c.completed_at is not null
     and c.date::date <> (c.completed_at::timestamptz at time zone 'America/Sao_Paulo')::date
  on conflict (completion_id) do nothing;

  v_set := case
    when v_type = 'text'
      then $x$to_char((completed_at::timestamptz at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD')$x$
      else $x$(completed_at::timestamptz at time zone 'America/Sao_Paulo')::date$x$
  end;

  execute format($q$
    update public.completions
       set date = %s
     where completed_at is not null
       and date::date <> (completed_at::timestamptz at time zone 'America/Sao_Paulo')::date
  $q$, v_set);
end $$;

-- `task_reviews.date` é cópia desnormalizada de `completions.date` (a função
-- review_tasks copia no momento da conferência). Herda a correção em vez de
-- recalcular: o veredito pertence ao dia da execução, não ao dia da conferência.
update public.task_reviews tr
   set date = c.date::date
  from public.completions c
 where tr.completion_id = c.id::text
   and tr.date is distinct from c.date::date;

-- ── Resultado ───────────────────────────────────────────────────────────────
-- O SQL Editor do Supabase DESCARTA `raise notice` (só tem as abas Results e
-- Chart), então o diagnóstico volta como linha. Confira estes números contra a
-- query de contagem do topo antes de dar a migration por boa.
select 'execucoes corrigidas'                    as item, count(*)::text as valor from public.fix_data_local_20260726
union all
select 'lojas afetadas',    count(distinct c.unit_id)::text
  from public.fix_data_local_20260726 f join public.completions c on c.id::text = f.completion_id
union all
select 'periodo',           coalesce(min(date_nova) || ' a ' || max(date_nova), '—')
  from public.fix_data_local_20260726
union all
-- Tem que ser zero: nenhuma execução pode sobrar com a data fora do dia de SP.
select 'divergencias restantes (tem que ser 0)', count(*)::text
  from public.completions
 where completed_at is not null
   and date::date <> (completed_at::timestamptz at time zone 'America/Sao_Paulo')::date;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Desfaz a correção a partir da auditoria (task_reviews volta por herança):
--
--   update public.completions c
--      set date = f.date_antiga::date        -- sem o ::date se a coluna for text
--     from public.fix_data_local_20260726 f
--    where c.id::text = f.completion_id;
--
--   update public.task_reviews tr
--      set date = c.date::date
--     from public.completions c
--    where tr.completion_id = c.id::text
--      and tr.date is distinct from c.date::date;
