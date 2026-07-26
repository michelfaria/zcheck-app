-- ============================================================================
-- 20260726_avaliacao_por_tarefa.sql — Veredito por tarefa + base do briefing.
--
-- Contexto: a conferência criada em 20260726_conferencia_lideranca.sql era um
-- carimbo no checklist inteiro. Agora a liderança julga TAREFA A TAREFA —
-- aprovado, ressalva ou reprovado — e é esse detalhe que alimenta o briefing
-- diário do colaborador.
--
-- POR QUE TABELA E NÃO UM CAMPO DENTRO DE `completions.items`:
-- `pushCompletion` faz upsert da coluna `items` inteira. Uma execução que ficou
-- na fila offline volta e é reenviada — e levaria junto a versão ANTIGA do
-- items, apagando em silêncio toda avaliação que a liderança tivesse feito no
-- intervalo. Tabela separada não tem esse acoplamento.
--
-- `operator_user_id` e `date` são desnormalizados de propósito: o briefing lê
-- "o que a liderança disse das MINHAS tarefas de ONTEM", e sem essas duas
-- colunas isso vira join com completions a cada abertura do app.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente.
-- Pré-requisitos: 20260726_conferencia_lideranca (jwt_user_id, jwt_user_role,
-- colunas de conferência em completions).
-- ============================================================================


-- ── (1) A tabela ────────────────────────────────────────────────────────────
create table if not exists public.task_reviews (
  id               uuid primary key default gen_random_uuid(),
  company_id       text        not null,
  completion_id    text        not null,
  item_id          text        not null,
  verdict          text        not null check (verdict in ('aprovado', 'ressalva', 'reprovado')),
  note             text,
  reviewed_by      text        not null,
  reviewed_by_name text,
  reviewed_at      timestamptz not null default now(),
  -- Denormalizado para o briefing (ver cabeçalho).
  operator_user_id text,
  date             date,
  unique (completion_id, item_id)
);

-- O briefing busca por (empresa, pessoa, dia) toda vez que alguém abre o app.
create index if not exists task_reviews_briefing_idx
  on public.task_reviews (company_id, operator_user_id, date);


-- ── (2) RLS e grants ────────────────────────────────────────────────────────
-- Leitura para a empresa inteira: o colaborador precisa ler o veredito das
-- próprias tarefas, e a liderança o de todas. Escrita NÃO tem policy — o único
-- caminho é a RPC abaixo, security definer, que confere o papel no token.
alter table public.task_reviews enable row level security;

drop policy if exists task_reviews_tenant_read on public.task_reviews;
create policy task_reviews_tenant_read
  on public.task_reviews for select
  to authenticated
  using (company_id = public.jwt_company_id());

grant select on public.task_reviews to authenticated;
-- Sem grant para anon: nada aqui é pré-login.


-- ── (3) A RPC ───────────────────────────────────────────────────────────────
-- Recebe os vereditos de uma conferência inteira de uma vez. Uma chamada por
-- tarefa deixaria a conferência pela metade se a rede caísse no meio — e uma
-- conferência pela metade conta como conferida no índice da liderança.
--
-- `p_items`: [{"item_id": "...", "verdict": "aprovado|ressalva|reprovado",
--              "note": "..."}]
-- `p_reviewed = false`: desfaz tudo (vereditos + marca no completion).
create or replace function public.review_tasks(
  p_completion_id text,
  p_items         jsonb default '[]'::jsonb,
  p_note          text  default null,
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
begin
  if v_uid is null or v_company is null then
    raise exception 'sem sessão válida';
  end if;

  if v_role not in ('lideranca', 'gerencia', 'gestao') then
    raise exception 'apenas liderança, gerência ou diretoria podem conferir';
  end if;

  -- Carrega o dono e o dia DA EXECUÇÃO, já checando que ela é desta empresa.
  -- É esta linha que impede conferir execução de outro tenant: a RPC é security
  -- definer, então o RLS não se aplica dentro dela.
  select c.operator_user_id, c.date
    into v_operator, v_date
    from public.completions c
   where c.id = p_completion_id and c.company_id = v_company;

  if not found then
    raise exception 'execução não encontrada no escopo da sua empresa';
  end if;

  select u.name into v_name from public.users u where u.id = v_uid;

  -- Reconferir substitui: o estado final é o que a liderança acabou de mandar,
  -- não a união com o que ela tinha dito antes. Sem isto, tirar uma reprovação
  -- seria impossível — ela ficaria órfã na tabela.
  delete from public.task_reviews where completion_id = p_completion_id;

  if p_reviewed then
    insert into public.task_reviews (
      company_id, completion_id, item_id, verdict, note,
      reviewed_by, reviewed_by_name, operator_user_id, date
    )
    select v_company, p_completion_id,
           x->>'item_id',
           x->>'verdict',
           nullif(btrim(coalesce(x->>'note', '')), ''),
           v_uid, coalesce(v_name, v_uid), v_operator, v_date
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
     where x->>'item_id' is not null
       and x->>'verdict' in ('aprovado', 'ressalva', 'reprovado');
  end if;

  -- A marca no checklist inteiro continua existindo: é dela que o índice da
  -- liderança (30% "conferidos") e o selo da lista de execuções dependem.
  update public.completions c
     set reviewed_by      = case when p_reviewed then v_uid else null end,
         reviewed_by_name = case when p_reviewed then coalesce(v_name, v_uid) else null end,
         reviewed_at      = case when p_reviewed then now() else null end,
         review_note      = case when p_reviewed then nullif(btrim(coalesce(p_note, '')), '') else null end
   where c.id = p_completion_id
     and c.company_id = v_company;
end;
$$;

revoke all on function public.review_tasks(text, jsonb, text, boolean) from public;
revoke all on function public.review_tasks(text, jsonb, text, boolean) from anon;
grant execute on function public.review_tasks(text, jsonb, text, boolean) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Tabela, índice e policy:
--   select count(*) from public.task_reviews;                      -- 0
--   select indexname from pg_indexes where tablename='task_reviews';
--   select policyname, cmd from pg_policies where tablename='task_reviews';
--   -- esperado: só task_reviews_tenant_read, cmd = SELECT
--
-- (b) Ninguém escreve direto (o RLS não tem policy de insert):
--   -- com um token qualquer: insert into task_reviews ... -> violação de policy
--
-- (c) A RPC recusa colaborador:
--   select public.review_tasks('<id>', '[]'::jsonb);
--   -- com token de colaborador: 'apenas liderança, gerência ou diretoria...'
--
-- (d) Fim a fim: Relatórios → Execuções → Conferir → marcar vereditos →
--     Confirmar. Depois, no primeiro acesso do colaborador no dia seguinte,
--     o briefing deve abrir sozinho.
-- ============================================================================
