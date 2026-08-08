-- ============================================================================
-- 20260808_conferencia_privacidade.sql
--
-- A nota que a liderança escreve sobre uma pessoa passa a ser legível só por
-- ela e pela liderança. O VEREDITO continua público dentro da empresa.
--
-- O PROBLEMA. `20260726_avaliacao_por_tarefa.sql` deu `grant select on
-- task_reviews to authenticated` com policy de empresa inteira, e
-- `fetchTaskReviews` (lib/sync.js) baixa 90 dias sem filtro de usuário e sem
-- limite. Como a anon key é pública (vai no bundle), qualquer colaborador
-- logado lê, pelo PostgREST, tudo que já foi escrito sobre qualquer colega.
--
-- POR QUE AGORA. Em 08/08/2026 existem 2 notas gravadas em 1331 vereditos:
-- backfill trivial, rollback trivial, ninguém percebe. A mudança que passa a
-- PEDIR o motivo (f197d69) existe justamente para multiplicar esse número — o
-- conserto só fica mais caro daqui para frente. É janela, não folga.
--
-- O CORTE: veredito é público, nota é privada.
--   `verdict` a empresa inteira precisa ler — `computeOperationalProfile`
--   calcula o índice de TERCEIROS no ranking da Equipe, no cliente. E ele já é
--   público de fato: move a posição de todos no ranking, que todos veem.
--   Esconder o veredito e exibir o ranking derivado dele seria privacidade de
--   fachada.
--   `note` é texto endereçado a UMA pessoa e não entra em cálculo nenhum —
--   `taskCounts` (page.js) só olha `review.verdict`. O corte é limpo.
--
-- ⚠ ORDEM DE DEPLOY OBRIGATÓRIA — o último bloco NÃO está neste arquivo:
--   1. rode este arquivo;
--   2. deploye o código que lê de `task_verdicts` + `my_task_notes`;
--   3. só então rode o REVOKE do rodapé (está comentado lá embaixo).
-- Invertido, derruba o app de todos os colaboradores.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. Testada em PGlite:
--   node supabase/migrations/20260808_conferencia_privacidade.test.mjs
-- Pré-requisitos: 20260808_conferencia_endereco_historico (executed_by_user_id).
-- ============================================================================


-- ── (1) A nota do checklist inteiro sai de `completions` ────────────────────
-- `completions.review_note` não dá para fechar por grant de coluna:
-- 20260709_authenticated_role_grants.sql espelhou de `anon` os grants em NÍVEL
-- DE TABELA, e grant de tabela cobre toda coluna — inclusive as futuras.
-- Revogar só essa coluna não faz nada; revogar o SELECT da tabela quebraria o
-- app inteiro, que lê `completions` em toda tela. A saída é a nota mudar de
-- casa e a coluna virar null para sempre.
create table if not exists public.completion_review_notes (
  completion_id    text primary key,
  company_id       text        not null,
  note             text        not null,
  reviewed_by      text        not null,
  reviewed_by_name text,
  reviewed_at      timestamptz not null default now(),
  operator_user_id text,
  date             date
);

alter table public.completion_review_notes enable row level security;
-- Sem policy: RLS ligada e sem policy nega tudo. Leitura só pela RPC abaixo.
revoke all on public.completion_review_notes from anon, authenticated;

insert into public.completion_review_notes (
  completion_id, company_id, note, reviewed_by, reviewed_by_name,
  reviewed_at, operator_user_id, date)
select c.id, c.company_id, c.review_note, coalesce(c.reviewed_by, '?'),
       c.reviewed_by_name, coalesce(c.reviewed_at, now()), c.operator_user_id, c.date
  from public.completions c
 where nullif(btrim(coalesce(c.review_note, '')), '') is not null
on conflict (completion_id) do nothing;

update public.completions
   set review_note = null
 where nullif(btrim(coalesce(review_note, '')), '') is not null;


-- ── (2) A RPC volta a gravar a nota, agora na tabela privada ────────────────
-- Só o bloco (d) muda em relação a 20260808_conferencia_endereco_historico:
-- `completions.review_note` deixa de ser escrito.
create or replace function public.review_tasks(
  p_completion_id text,
  p_items         jsonb   default '[]'::jsonb,
  p_note          text    default null,
  p_reviewed      boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := public.jwt_user_role();
  v_uid      text := public.jwt_user_id();
  v_company  text := public.jwt_company_id();
  v_name     text;
  v_operator text;
  v_date     date;
  v_items    jsonb;
  v_norm     jsonb;
  v_batch    uuid := gen_random_uuid();
begin
  if v_uid is null or v_company is null then
    raise exception 'sem sessão válida';
  end if;

  if v_role not in ('lideranca', 'gerencia', 'gestao') then
    raise exception 'apenas liderança, gerência ou diretoria podem conferir';
  end if;

  select c.operator_user_id, c.date, coalesce(c.items::jsonb, '[]'::jsonb)
    into v_operator, v_date, v_items
    from public.completions c
   where c.id = p_completion_id
     and c.company_id = v_company;

  if not found then
    raise exception 'execução não encontrada no escopo da sua empresa';
  end if;

  select u.name into v_name from public.users u where u.id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id',   x->>'item_id',
           'verdict',   x->>'verdict',
           'note',      nullif(btrim(coalesce(x->>'note', '')), ''),
           'exec_id',   coalesce(
                          (select i->>'doneBy' from jsonb_array_elements(v_items) i
                            where i->>'id' = x->>'item_id' limit 1), v_operator),
           'exec_name', (select i->>'doneByName' from jsonb_array_elements(v_items) i
                          where i->>'id' = x->>'item_id' limit 1),
           'done',      coalesce(
                          (select (i->>'done')::boolean from jsonb_array_elements(v_items) i
                            where i->>'id' = x->>'item_id' limit 1), false)
         )), '[]'::jsonb)
    into v_norm
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
   where x->>'item_id' is not null
     and x->>'verdict' in ('aprovado', 'ressalva', 'reprovado');

  insert into public.task_review_events (
    company_id, completion_id, item_id, kind, verdict, note,
    reviewed_by, reviewed_by_name,
    operator_user_id, executed_by_user_id, date, batch_id)
  select tr.company_id, tr.completion_id, tr.item_id,
         case when p_reviewed then 'remocao' else 'desfeito' end,
         tr.verdict, tr.note,
         v_uid, coalesce(v_name, v_uid),
         tr.operator_user_id, tr.executed_by_user_id, tr.date, v_batch
    from public.task_reviews tr
   where tr.completion_id = p_completion_id
     and (not p_reviewed
          or not exists (select 1 from jsonb_array_elements(v_norm) n
                          where n->>'item_id' = tr.item_id));

  if p_reviewed then
    insert into public.task_review_events (
      company_id, completion_id, item_id, kind, verdict, note,
      reviewed_by, reviewed_by_name, operator_user_id, executed_by_user_id,
      done_snapshot, date, batch_id)
    select v_company, p_completion_id, n->>'item_id', 'veredito',
           n->>'verdict', n->>'note',
           v_uid, coalesce(v_name, v_uid), v_operator, n->>'exec_id',
           (n->>'done')::boolean, v_date, v_batch
      from jsonb_array_elements(v_norm) n
      left join public.task_reviews tr
             on tr.completion_id = p_completion_id
            and tr.item_id = n->>'item_id'
     where tr.item_id is null
        or tr.verdict is distinct from n->>'verdict'
        or tr.note    is distinct from n->>'note';

    insert into public.task_reviews (
      company_id, completion_id, item_id, verdict, note,
      reviewed_by, reviewed_by_name, reviewed_at,
      operator_user_id, executed_by_user_id, executed_by_name, date)
    select v_company, p_completion_id, n->>'item_id', n->>'verdict', n->>'note',
           v_uid, coalesce(v_name, v_uid), now(),
           v_operator, n->>'exec_id', n->>'exec_name', v_date
      from jsonb_array_elements(v_norm) n
    on conflict (completion_id, item_id) do update
       set verdict             = excluded.verdict,
           note                = excluded.note,
           reviewed_by         = excluded.reviewed_by,
           reviewed_by_name    = excluded.reviewed_by_name,
           reviewed_at         = excluded.reviewed_at,
           executed_by_user_id = excluded.executed_by_user_id,
           executed_by_name    = excluded.executed_by_name;

    delete from public.task_reviews tr
     where tr.completion_id = p_completion_id
       and not exists (select 1 from jsonb_array_elements(v_norm) n
                        where n->>'item_id' = tr.item_id);
  else
    delete from public.task_reviews where completion_id = p_completion_id;
  end if;

  -- (d) AQUI está a mudança: a nota geral vai para a tabela privada, e
  --     `completions.review_note` nunca mais é escrito.
  if p_reviewed and nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.completion_review_notes (
      completion_id, company_id, note, reviewed_by, reviewed_by_name,
      reviewed_at, operator_user_id, date)
    values (p_completion_id, v_company, btrim(p_note), v_uid,
            coalesce(v_name, v_uid), now(), v_operator, v_date)
    on conflict (completion_id) do update
       set note             = excluded.note,
           reviewed_by      = excluded.reviewed_by,
           reviewed_by_name = excluded.reviewed_by_name,
           reviewed_at      = now();

    insert into public.task_review_events (
      company_id, completion_id, item_id, kind, note, reviewed_by,
      reviewed_by_name, operator_user_id, date, batch_id)
    values (v_company, p_completion_id, null, 'nota_geral', btrim(p_note),
            v_uid, coalesce(v_name, v_uid), v_operator, v_date, v_batch);
  else
    delete from public.completion_review_notes where completion_id = p_completion_id;
  end if;

  update public.completions c
     set reviewed_by      = case when p_reviewed then v_uid else null end,
         reviewed_by_name = case when p_reviewed then coalesce(v_name, v_uid) else null end,
         reviewed_at      = case when p_reviewed then now() else null end,
         review_note      = null
   where c.id = p_completion_id
     and c.company_id = v_company;
end;
$$;

revoke all on function public.review_tasks(text, jsonb, text, boolean) from public, anon;
grant execute on function public.review_tasks(text, jsonb, text, boolean) to authenticated;


-- ── (3) Leitura: o veredito por view, a nota por RPC ────────────────────────
-- ⚠ A view roda com o privilégio do DONO e NÃO aplica o RLS da tabela base.
--    O filtro de tenant TEM que estar aqui dentro. Tirá-lo num refactor futuro
--    vaza empresa inteira para empresa inteira — é o ponto mais perigoso deste
--    arquivo, e o que mais merece o teste automatizado.
drop view if exists public.task_verdicts;
create view public.task_verdicts as
  select company_id, completion_id, item_id, verdict, reviewed_at,
         operator_user_id, executed_by_user_id, date
    from public.task_reviews
   where company_id = public.jwt_company_id();

grant select on public.task_verdicts to authenticated;
revoke all on public.task_verdicts from anon;

-- As notas de QUEM ESTÁ PEDINDO. Liderança lê todas (ela precisa reabrir a
-- conferência e ver o que escreveu); o colaborador lê só as endereçadas a ele.
--
-- O critério é `executed_by_user_id` e MAIS NADA. Uma versão anterior aceitava
-- também `operator_user_id = jwt_user_id()`, e o teste pegou: numa execução
-- colaborativa isso deixava quem apertou "Concluir" ler a nota escrita sobre a
-- tarefa de um colega — que é precisamente o vazamento que este arquivo
-- fecha. E era redundante: item sem `doneBy` já tem o submissor gravado em
-- `executed_by_user_id` pela RPC, então ele continua lendo o que é dele.
create or replace function public.my_task_notes(p_since date default null)
returns table (
  completion_id    text,
  item_id          text,
  verdict          text,
  note             text,
  reviewed_by_name text,
  reviewed_at      timestamptz,
  date             date
)
language sql
security definer
set search_path = public
as $$
  select tr.completion_id, tr.item_id, tr.verdict, tr.note,
         tr.reviewed_by_name, tr.reviewed_at, tr.date
    from public.task_reviews tr
   where tr.company_id = public.jwt_company_id()
     and tr.note is not null
     and (p_since is null or tr.date >= p_since)
     and (public.jwt_user_role() in ('lideranca', 'gerencia', 'gestao')
          or tr.executed_by_user_id = public.jwt_user_id());
$$;

revoke all     on function public.my_task_notes(date) from public, anon;
grant  execute on function public.my_task_notes(date) to authenticated;

-- A nota do checklist inteiro, mesma régua.
create or replace function public.my_completion_notes(p_since date default null)
returns table (
  completion_id    text,
  note             text,
  reviewed_by_name text,
  reviewed_at      timestamptz,
  date             date
)
language sql
security definer
set search_path = public
as $$
  select n.completion_id, n.note, n.reviewed_by_name, n.reviewed_at, n.date
    from public.completion_review_notes n
   where n.company_id = public.jwt_company_id()
     and (p_since is null or n.date >= p_since)
     and (public.jwt_user_role() in ('lideranca', 'gerencia', 'gestao')
          or n.operator_user_id = public.jwt_user_id()
          or exists (select 1 from public.task_reviews tr
                      where tr.completion_id = n.completion_id
                        and tr.executed_by_user_id = public.jwt_user_id()));
$$;

revoke all     on function public.my_completion_notes(date) from public, anon;
grant  execute on function public.my_completion_notes(date) to authenticated;


-- ── (4) Porta lateral ───────────────────────────────────────────────────────
-- `review_completion` (de 26/07) não tem chamador em JS nenhum, mas continua
-- executável e escreve `review_note` direto em completions — contornando tudo
-- acima. Fechada.
revoke execute on function public.review_completion(text, text, boolean)
  from authenticated, anon, public;


-- ============================================================================
-- ⚠ O ÚLTIMO PASSO, DEPOIS DO DEPLOY DO CÓDIGO NOVO
--
-- Enquanto o app em produção ainda ler `task_reviews` direto, este revoke
-- derruba a conferência e o briefing de TODO MUNDO. Rode-o só depois de o
-- deploy que lê de `task_verdicts` + `my_task_notes` estar no ar:
--
--   revoke select on public.task_reviews from authenticated;
--
-- VERIFICAÇÃO (depois do revoke, com um token de colaborador):
--   select * from public.task_reviews;       -- esperado: 42501
--   select * from public.task_verdicts;      -- vereditos, SEM a coluna note
--   select * from public.my_task_notes();    -- só as notas dele
--
-- E o isolamento entre empresas, com um token da empresa Y:
--   select count(*) from public.task_verdicts where company_id = '<empresa X>';
--   -- esperado: 0
-- ============================================================================
