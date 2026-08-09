-- ============================================================================
-- 20260808_conferencia_contestacao.sql — a justificativa do colaborador.
--
-- VOCABULÁRIO (decisão de 08/08): o produto chama isto de JUSTIFICATIVA, não
-- contestação — o colaborador já teve a chance de executar e anotar na hora;
-- isto é a segunda voz dele depois do veredito, explicação e não litígio. Os
-- nomes internos (review_disputes, raise_dispute, kinds 'contestacao') ficam:
-- são encanamento, e renomeá-los depois do teste só adicionaria risco.
--
-- O que existia até aqui protegia a EMPRESA contra o dado: ledger append-only,
-- done_snapshot, batch_id, isolamento por tenant, teste de multi-tenant. E não
-- existia nada protegendo A PESSOA contra o julgamento. Um colaborador recebia
-- "Reprovada" no briefing e não tinha caminho nenhum — nem para perguntar por
-- quê, nem para dizer que discorda.
--
-- Isso não é só uma questão de justiça. Num produto que passou a ser vendido
-- para outras empresas, é risco de adoção: nenhum gerente implanta uma
-- ferramenta que gera atrito com a equipe dele e não oferece saída.
--
-- DESENHO, seguindo o que as duas migrations anteriores já estabeleceram:
-- `review_disputes` é o ESTADO ATUAL (uma contestação viva por tarefa) e
-- `task_review_events` continua sendo a memória — a contestação e a resposta
-- dela entram na mesma ledger do veredito, na mesma ordem. Quem for auditar um
-- caso lê uma linha do tempo só, não duas.
--
-- DUAS REGRAS QUE ESTÃO NO CÓDIGO E NÃO EM CONFIGURAÇÃO:
--
-- 1. Só contesta quem EXECUTOU a tarefa. Não é o submissor do checklist, não é
--    o colega, não é a liderança "em nome de". O critério é
--    `task_reviews.executed_by_user_id`, o mesmo que decide quem recebe o
--    feedback — quem leva a nota é quem pode responder.
--
-- 2. Só se contesta apontamento. Ressalva e reprovação, nunca aprovação.
--    Contestar elogio não é um caso de uso; abrir essa porta só criaria ruído
--    na fila de quem responde.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. Testada em PGlite:
--   node supabase/migrations/20260808_conferencia_contestacao.test.mjs
-- Pré-requisitos: 20260808_conferencia_endereco_historico (task_review_events,
-- executed_by_user_id), 20260808_conferencia_privacidade.
-- ============================================================================


-- ── (1) A ledger aprende dois fatos novos ───────────────────────────────────
-- A contestação entra na MESMA linha do tempo do veredito. Uma tabela de
-- auditoria paralela obrigaria a intercalar duas fontes por timestamp para
-- reconstruir um caso — e timestamps empatam.
alter table public.task_review_events
  drop constraint if exists task_review_events_kind_check;
alter table public.task_review_events
  add constraint task_review_events_kind_check
  check (kind in ('veredito', 'remocao', 'nota_geral', 'desfeito',
                  'contestacao', 'contestacao_resolvida'));

-- `reviewed_by` guarda QUEM PRATICOU o ato. Numa contestação, quem pratica é o
-- colaborador — a coluna passa a significar "autor do evento", não "a
-- liderança". O nome dela envelheceu; trocá-lo exigiria reescrever o backfill
-- de 1331 linhas e todo consumidor, por um ganho de vocabulário.


-- ── (2) Estado atual ────────────────────────────────────────────────────────
-- `unique (completion_id, item_id)`: uma contestação viva por tarefa. Contestar
-- de novo depois de resolvida REABRE a mesma linha — e a ledger guarda as duas
-- rodadas, então nada da conversa anterior se perde.
create table if not exists public.review_disputes (
  id               uuid primary key default gen_random_uuid(),
  company_id       text        not null,
  completion_id    text        not null,
  item_id          text        not null,
  -- O que estava sendo contestado NO MOMENTO em que se contestou. Sem isto,
  -- uma contestação de reprovação vira ininteligível depois que a liderança
  -- muda o veredito: sobraria "Maria discordou" sem dizer de quê.
  disputed_verdict text        not null,
  raised_by        text        not null,
  raised_by_name   text,
  raised_at        timestamptz not null default now(),
  reason           text        not null,
  status           text        not null default 'aberta'
                     check (status in ('aberta', 'mantida', 'revista')),
  resolved_by      text,
  resolved_by_name text,
  resolved_at      timestamptz,
  resolution_note  text,
  date             date,
  unique (completion_id, item_id)
);

-- A fila de quem responde: contestação aberta, da empresa, mais antiga
-- primeiro. É a consulta que a liderança faz toda vez que abre o app.
create index if not exists review_disputes_fila_idx
  on public.review_disputes (company_id, status, raised_at);
create index if not exists review_disputes_pessoa_idx
  on public.review_disputes (company_id, raised_by, raised_at);

-- Mesmo regime das outras duas: RLS ligada SEM policy nega tudo, e o acesso
-- passa só pelas RPCs abaixo. Contestação é conversa entre duas partes — não
-- pode ser leitura aberta da empresa como `task_reviews` era.
alter table public.review_disputes enable row level security;
revoke all on public.review_disputes from anon, authenticated;


-- ── (3) Contestar ───────────────────────────────────────────────────────────
create or replace function public.raise_dispute(
  p_completion_id text,
  p_item_id       text,
  p_reason        text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      text := public.jwt_user_id();
  v_company  text := public.jwt_company_id();
  v_name     text;
  v_verdict  text;
  v_date     date;
  v_dono     text;
begin
  if v_uid is null or v_company is null then
    raise exception 'sem sessão válida';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a justificativa precisa de um texto';
  end if;

  -- O veredito contestado, já no escopo da empresa. Este select é o portão:
  -- security definer não aplica RLS aqui dentro.
  select tr.verdict, tr.date, tr.executed_by_user_id
    into v_verdict, v_date, v_dono
    from public.task_reviews tr
   where tr.completion_id = p_completion_id
     and tr.item_id = p_item_id
     and tr.company_id = v_company;

  if not found then
    raise exception 'não existe avaliação desta tarefa no escopo da sua empresa';
  end if;

  -- Regra 1: quem leva a nota é quem responde.
  if v_dono is distinct from v_uid then
    raise exception 'só quem executou a tarefa pode justificar a avaliação dela';
  end if;

  -- Regra 2: contesta-se apontamento, não elogio.
  if v_verdict not in ('ressalva', 'reprovado') then
    raise exception 'só ressalva e reprovação podem ser justificadas';
  end if;

  select u.name into v_name from public.users u where u.id = v_uid;

  insert into public.review_disputes (
    company_id, completion_id, item_id, disputed_verdict,
    raised_by, raised_by_name, reason, status, date)
  values (v_company, p_completion_id, p_item_id, v_verdict,
          v_uid, coalesce(v_name, v_uid), btrim(p_reason), 'aberta', v_date)
  -- Reabrir: a contestação anterior já virou evento, então sobrescrever o
  -- estado atual não perde nada. Os campos de resolução voltam a nulo — senão
  -- a linha ficaria "aberta" carregando a resposta de uma rodada antiga.
  on conflict (completion_id, item_id) do update
     set disputed_verdict = excluded.disputed_verdict,
         raised_by        = excluded.raised_by,
         raised_by_name   = excluded.raised_by_name,
         raised_at        = now(),
         reason           = excluded.reason,
         status           = 'aberta',
         resolved_by      = null,
         resolved_by_name = null,
         resolved_at      = null,
         resolution_note  = null;

  insert into public.task_review_events (
    company_id, completion_id, item_id, kind, verdict, note,
    reviewed_by, reviewed_by_name, executed_by_user_id, date, batch_id)
  values (v_company, p_completion_id, p_item_id, 'contestacao', v_verdict,
          btrim(p_reason), v_uid, coalesce(v_name, v_uid), v_uid, v_date,
          gen_random_uuid());
end;
$$;


-- ── (4) Responder ───────────────────────────────────────────────────────────
-- `p_new_verdict` opcional: quando a liderança dá razão, a correção do veredito
-- sai NA MESMA TRANSAÇÃO da resposta. Separar em dois passos deixaria o caso
-- "revista, mas o veredito continua reprovado" possível — e ele é indefensável
-- para quem contestou.
create or replace function public.resolve_dispute(
  p_completion_id text,
  p_item_id       text,
  p_status        text,
  p_note          text default null,
  p_new_verdict   text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    text := public.jwt_user_role();
  v_uid     text := public.jwt_user_id();
  v_company text := public.jwt_company_id();
  v_name    text;
  v_date    date;
  v_dono    text;
begin
  if v_uid is null or v_company is null then
    raise exception 'sem sessão válida';
  end if;

  if v_role not in ('lideranca', 'gerencia', 'gestao') then
    raise exception 'apenas liderança, gerência ou diretoria podem responder';
  end if;

  if p_status not in ('mantida', 'revista') then
    raise exception 'resposta precisa ser "mantida" ou "revista"';
  end if;

  if p_new_verdict is not null
     and p_new_verdict not in ('aprovado', 'ressalva', 'reprovado') then
    raise exception 'veredito inválido';
  end if;

  select d.date into v_date
    from public.review_disputes d
   where d.completion_id = p_completion_id
     and d.item_id = p_item_id
     and d.company_id = v_company;

  if not found then
    raise exception 'justificativa não encontrada no escopo da sua empresa';
  end if;

  select u.name into v_name from public.users u where u.id = v_uid;

  update public.review_disputes
     set status = p_status,
         resolved_by = v_uid,
         resolved_by_name = coalesce(v_name, v_uid),
         resolved_at = now(),
         resolution_note = nullif(btrim(coalesce(p_note, '')), '')
   where completion_id = p_completion_id
     and item_id = p_item_id
     and company_id = v_company;

  -- Corrigir o veredito, quando é o caso. Passa pela ledger como 'veredito',
  -- exatamente como uma reconferência — é isso que ele é.
  if p_new_verdict is not null then
    select tr.executed_by_user_id into v_dono
      from public.task_reviews tr
     where tr.completion_id = p_completion_id and tr.item_id = p_item_id;

    update public.task_reviews
       set verdict = p_new_verdict,
           reviewed_by = v_uid,
           reviewed_by_name = coalesce(v_name, v_uid),
           reviewed_at = now()
     where completion_id = p_completion_id
       and item_id = p_item_id
       and company_id = v_company;

    insert into public.task_review_events (
      company_id, completion_id, item_id, kind, verdict, note,
      reviewed_by, reviewed_by_name, executed_by_user_id, date, batch_id)
    values (v_company, p_completion_id, p_item_id, 'veredito', p_new_verdict,
            'corrigido após contestação', v_uid, coalesce(v_name, v_uid),
            v_dono, v_date, gen_random_uuid());
  end if;

  insert into public.task_review_events (
    company_id, completion_id, item_id, kind, note,
    reviewed_by, reviewed_by_name, date, batch_id)
  values (v_company, p_completion_id, p_item_id, 'contestacao_resolvida',
          p_status || coalesce(' — ' || nullif(btrim(coalesce(p_note, '')), ''), ''),
          v_uid, coalesce(v_name, v_uid), v_date, gen_random_uuid());
end;
$$;


-- ── (5) Ler ─────────────────────────────────────────────────────────────────
-- Liderança vê a fila da empresa; o colaborador vê só as dele. Mesma RPC porque
-- é a mesma pergunta ("o que está em aberto que me diz respeito?") — duas
-- funções divergiriam na primeira mudança de campo.
create or replace function public.list_disputes(p_since date default null)
returns table (
  completion_id text, item_id text, disputed_verdict text,
  raised_by text, raised_by_name text, raised_at timestamptz, reason text,
  status text, resolved_by_name text, resolved_at timestamptz,
  resolution_note text, date date
)
language sql
security definer
set search_path = public
as $$
  select d.completion_id, d.item_id, d.disputed_verdict,
         d.raised_by, d.raised_by_name, d.raised_at, d.reason,
         d.status, d.resolved_by_name, d.resolved_at, d.resolution_note, d.date
    from public.review_disputes d
   where d.company_id = public.jwt_company_id()
     and (p_since is null or d.date >= p_since)
     and (public.jwt_user_role() in ('lideranca', 'gerencia', 'gestao')
          or d.raised_by = public.jwt_user_id())
   order by d.raised_at desc;
$$;

revoke all     on function public.raise_dispute(text, text, text)               from public, anon;
revoke all     on function public.resolve_dispute(text, text, text, text, text) from public, anon;
revoke all     on function public.list_disputes(date)                           from public, anon;
grant  execute on function public.raise_dispute(text, text, text)               to authenticated;
grant  execute on function public.resolve_dispute(text, text, text, text, text) to authenticated;
grant  execute on function public.list_disputes(date)                           to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Só quem executou contesta. Com token de um colega:
--   select public.raise_dispute('<completion>', '<item>', 'não concordo');
--   -- esperado: 'só quem executou a tarefa pode contestar a avaliação dela'
--
-- (b) Não se contesta aprovação:
--   -- numa tarefa com verdict 'aprovado' → 'só ressalva e reprovação podem...'
--
-- (c) Motivo é obrigatório:
--   select public.raise_dispute('<completion>', '<item>', '   ');
--   -- esperado: 'a contestação precisa de um motivo'
--
-- (d) Dar razão corrige o veredito na mesma transação:
--   select public.resolve_dispute('<c>', '<i>', 'revista', 'você tem razão', 'aprovado');
--   select verdict from public.task_reviews where completion_id='<c>' and item_id='<i>';
--   -- esperado: 'aprovado'
--
-- (e) A linha do tempo do caso, numa consulta só:
--   select seq, kind, verdict, note, reviewed_by_name
--     from public.task_review_events
--    where completion_id = '<c>' and item_id = '<i>' order by seq;
--   -- esperado: veredito → contestacao → veredito → contestacao_resolvida
--
-- (f) Colaborador não lê contestação de colega:
--   select count(*) from public.list_disputes();  -- só as dele
-- ============================================================================
