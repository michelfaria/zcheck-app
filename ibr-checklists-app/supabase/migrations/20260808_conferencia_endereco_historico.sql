-- ============================================================================
-- 20260808_conferencia_endereco_historico.sql
--
-- Duas correções na conferência da liderança, ambas ADITIVAS — nenhum revoke,
-- nenhuma ordem de deploy crítica. A privacidade da nota vem depois, separada,
-- porque é ela que tem o passo perigoso.
--
-- 1. ENDEREÇAMENTO. `task_reviews.operator_user_id` é copiado de
--    `completions.operator_user_id` — quem SUBMETEU o checklist. Mas a execução
--    é colaborativa: cada item carrega `doneBy`. Numa rodada dividida entre três
--    pessoas, o feedback da liderança caía inteiro na conta de uma, e o briefing
--    de quem executou de verdade chegava vazio.
--
--    Quem executou passa a ser resolvido NO SERVIDOR, lendo `completions.items`.
--    O cliente manda item_id e veredito; o destinatário não é coisa que ele
--    escolha — senão dá para endereçar uma reprovação para a conta errada.
--
-- 2. HISTÓRICO. `review_tasks` fazia `delete from task_reviews where
--    completion_id = p_completion_id` a cada chamada. Reconferir apagava o que a
--    liderança tinha dito antes, sem deixar rastro: não havia como saber que uma
--    reprovação existiu e foi retirada, nem por quem.
--
--    Entra uma ledger append-only ao lado. `task_reviews` continua sendo o
--    ESTADO ATUAL (nenhuma leitura existente muda de forma) e a RPC passa a
--    fazer diff + upsert, registrando cada mudança como um fato datado.
--
-- Medição que motivou (08/08/2026, IBR): 1331 vereditos, 1 liderança, 148
-- execuções conferidas, 2 notas. Ver docs/REVISAO_CONFERENCIA_v1.md.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. Testada em PGlite:
--   node supabase/migrations/20260808_conferencia_endereco_historico.test.mjs
-- Pré-requisitos: 20260726_conferencia_lideranca, 20260726_avaliacao_por_tarefa
-- (jwt_user_id, jwt_user_role, jwt_company_id, task_reviews).
-- ============================================================================


-- ── (1) Quem executou a tarefa ──────────────────────────────────────────────
-- Desnormalizado pelo mesmo motivo que `operator_user_id` já era: o briefing lê
-- "o que a liderança disse das MINHAS tarefas de ontem" a cada abertura do app,
-- e sem a coluna isso vira join com completions + varredura do jsonb de items.
alter table public.task_reviews
  add column if not exists executed_by_user_id text,
  add column if not exists executed_by_name    text;

create index if not exists task_reviews_executor_idx
  on public.task_reviews (company_id, executed_by_user_id, date);


-- ── (2) A ledger ────────────────────────────────────────────────────────────
-- `seq` como identity e não uuid: a ORDEM de gravação é a informação. Com uuid
-- daria para saber que houve duas versões, não qual veio antes.
--
-- `item_id` nulo = evento do checklist inteiro (nota geral, ou desfazer).
--
-- `done_snapshot` guarda o estado do item NO MOMENTO da conferência. Sem ele
-- não há como explicar um "aprovado" numa tarefa que hoje consta como não
-- executada — e isso acontece de verdade: a fila offline pode drenar DEPOIS da
-- conferência com a versão antiga do items (o item marcado às 8h, conferido às
-- 10h, reenviado às 11h como `done: false`).
--
-- `batch_id` amarra tudo que saiu de uma mesma conferência. É o que permite
-- desfazer ou auditar um ato inteiro em vez de linhas soltas.
create table if not exists public.task_review_events (
  seq                 bigint generated always as identity primary key,
  company_id          text        not null,
  completion_id       text        not null,
  item_id             text,
  kind                text        not null
                        check (kind in ('veredito','remocao','nota_geral','desfeito')),
  verdict             text
                        check (verdict is null or verdict in ('aprovado','ressalva','reprovado')),
  note                text,
  reviewed_by         text        not null,
  reviewed_by_name    text,
  reviewed_at         timestamptz not null default now(),
  operator_user_id    text,
  executed_by_user_id text,
  done_snapshot       boolean,
  date                date,
  batch_id            uuid        not null
);

create index if not exists task_review_events_completion_idx
  on public.task_review_events (completion_id, seq);
create index if not exists task_review_events_pessoa_idx
  on public.task_review_events (company_id, executed_by_user_id, date);

-- RLS ligada SEM policy nenhuma nega tudo — que é exatamente o default
-- desejado: a ledger não é leitura de cliente. Quem precisar dela lê por RPC.
alter table public.task_review_events enable row level security;
revoke all on public.task_review_events from anon, authenticated;


-- ── (3) Backfill ────────────────────────────────────────────────────────────
-- (3a) O que já existe em task_reviews vira o primeiro evento de cada item, com
--      um batch sintético que significa "antes da ledger existir". Sem isso a
--      ledger nasceria contando a história a partir do meio.
--      `where not exists` é o que torna o bloco re-executável.
insert into public.task_review_events (
  company_id, completion_id, item_id, kind, verdict, note,
  reviewed_by, reviewed_by_name, reviewed_at,
  operator_user_id, executed_by_user_id, date, batch_id)
select tr.company_id, tr.completion_id, tr.item_id, 'veredito', tr.verdict, tr.note,
       tr.reviewed_by, tr.reviewed_by_name, tr.reviewed_at,
       tr.operator_user_id, tr.executed_by_user_id, tr.date,
       '00000000-0000-0000-0000-000000000001'::uuid
  from public.task_reviews tr
 where not exists (
   select 1 from public.task_review_events e
    where e.completion_id = tr.completion_id and e.item_id = tr.item_id);

-- (3b) Quem executou, lido do `items` das execuções que já estão no banco.
--
--      Subquery correlacionada no SET, e não `update ... from ... lateral`: num
--      UPDATE, a tabela alvo NÃO está no FROM, então um LATERAL ali não
--      consegue referenciar `tr` ("invalid reference to FROM-clause entry").
--      A forma correlacionada enxerga o alvo e ainda resolve o fallback na
--      mesma passada.
--
--      O cast para jsonb é de propósito: `completions` nasceu antes das
--      migrations versionadas e não há DDL dela neste diretório, então o tipo
--      da coluna (json, jsonb ou text) não é verificável aqui. O cast funciona
--      nos três casos; `jsonb_array_elements` direto, não.
--
--      O coalesce com `operator_user_id` cobre dois casos reais: item sem
--      `doneBy` (registro anterior à execução colaborativa) e item que sumiu do
--      `items` porque a execução foi reenviada com outro conjunto. Nos dois, o
--      submissor é a régua antiga — pior que doneBy, melhor que ninguém.
update public.task_reviews tr
   set executed_by_user_id = coalesce(
         (select i->>'doneBy'
            from public.completions c,
                 lateral jsonb_array_elements(coalesce(c.items::jsonb, '[]'::jsonb)) i
           where c.id = tr.completion_id and i->>'id' = tr.item_id
           limit 1),
         tr.operator_user_id),
       executed_by_name = (
         select i->>'doneByName'
           from public.completions c,
                lateral jsonb_array_elements(coalesce(c.items::jsonb, '[]'::jsonb)) i
          where c.id = tr.completion_id and i->>'id' = tr.item_id
          limit 1)
 where tr.executed_by_user_id is null;


-- ── (4) A RPC, sem delete cego ──────────────────────────────────────────────
-- Assinatura idêntica à de 26/07: `lib/sync.js` não muda.
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

  -- O `company_id` no where é o que impede conferir execução de outra empresa:
  -- a função é security definer, então o RLS NÃO se aplica aqui dentro.
  select c.operator_user_id, c.date, coalesce(c.items::jsonb, '[]'::jsonb)
    into v_operator, v_date, v_items
    from public.completions c
   where c.id = p_completion_id
     and c.company_id = v_company;

  if not found then
    raise exception 'execução não encontrada no escopo da sua empresa';
  end if;

  select u.name into v_name from public.users u where u.id = v_uid;

  -- Normaliza a entrada resolvendo QUEM EXECUTOU e o estado da tarefa a partir
  -- do que está GRAVADO, não do que o cliente mandou.
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

  -- (a) LEDGER — o que a liderança tinha dito e NÃO repetiu agora. É esta parte
  --     que substitui o delete cego: retirar um veredito passa a ser um fato
  --     datado, com autor, em vez de um buraco.
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
    -- (b) LEDGER — vereditos, e SÓ o que mudou. Reconferir sem alterar nada não
    --     pode encher a ledger de linhas idênticas: o histórico ficaria
    --     ilegível justamente para quem for auditar.
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

    -- (c) ESTADO ATUAL — upsert, não delete+insert.
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

    -- Some do estado atual só o que a liderança retirou — e que já virou evento
    -- 'remocao' no bloco (a). Sem esta linha, tirar uma reprovação seria
    -- impossível: ela ficaria órfã na tabela.
    delete from public.task_reviews tr
     where tr.completion_id = p_completion_id
       and not exists (select 1 from jsonb_array_elements(v_norm) n
                        where n->>'item_id' = tr.item_id);
  else
    -- Desfazer: o estado atual zera, a ledger guarda o que existia (bloco (a),
    -- kind = 'desfeito').
    delete from public.task_reviews where completion_id = p_completion_id;
  end if;

  -- (d) A nota do checklist inteiro também vira evento. Ela continua sendo
  --     gravada em `completions.review_note` por enquanto — a mudança para uma
  --     tabela privada é da próxima migration, junto com a privacidade da nota
  --     por tarefa, porque é lá que está o revoke com ordem de deploy.
  if p_reviewed and nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.task_review_events (
      company_id, completion_id, item_id, kind, note, reviewed_by,
      reviewed_by_name, operator_user_id, date, batch_id)
    values (v_company, p_completion_id, null, 'nota_geral', btrim(p_note),
            v_uid, coalesce(v_name, v_uid), v_operator, v_date, v_batch);
  end if;

  -- (e) A marca no checklist inteiro: dela dependem os 30% de "conferidos" do
  --     índice da liderança e o selo da lista de execuções.
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
-- (a) Reconferir PRESERVA — o ponto da migration:
--   select public.review_tasks('<id>', '[{"item_id":"x","verdict":"reprovado"}]');
--   select public.review_tasks('<id>', '[{"item_id":"x","verdict":"aprovado"}]');
--   select seq, kind, verdict from public.task_review_events
--    where completion_id = '<id>' order by seq;
--   -- esperado: DUAS linhas ('reprovado' e depois 'aprovado'), não uma
--
-- (b) O destinatário é quem EXECUTOU, não quem submeteu:
--   select item_id, executed_by_user_id from public.task_reviews
--    where completion_id = '<execução colaborativa>';
--   -- esperado: ids DIFERENTES onde o items tem doneBy diferentes
--
-- (c) Backfill cobriu todo mundo:
--   select count(*) from public.task_reviews where executed_by_user_id is null;
--   -- esperado: 0
--
-- (d) A ledger não é legível pelo cliente:
--   -- com token de qualquer papel: select * from public.task_review_events;
--   -- esperado: erro de permissão
--
-- (e) Nada regrediu no caminho antigo: no app, Relatórios → Conferir → marcar
--     vereditos → Confirmar, e o briefing do colaborador no dia seguinte.
-- ============================================================================
