-- ============================================================================
-- 20260726_conferencia_lideranca.sql — Conferência de execução pela liderança.
--
-- Contexto: o app media colaborador (computeOperationalProfile) e loja
-- (computeUnitProfile), mas não a LIDERANÇA. A régua nova mede o líder pelo
-- resultado da equipe: checklists entregues no prazo, aderência da equipe e
-- execuções conferidas por ele. Os dois primeiros já dão para calcular com o
-- que existe (`templates.deadline` × `completions.completed_at`). O terceiro
-- não existia: não havia como marcar uma execução como revisada.
--
-- Esta migration cria esse registro:
--   1. Colunas de conferência em `completions`.
--   2. GRANT das colunas novas (mesmo motivo do avatar: os privilégios foram
--      espelhados coluna a coluna em 20260709_authenticated_role_grants.sql).
--   3. RPC `review_completion` — o único caminho de escrita.
--
-- Por que RPC e não update direto: a policy `completions_tenant_rw` libera a
-- linha inteira para QUALQUER autenticado da empresa. Um update direto deixaria
-- o colaborador conferir a própria execução e escrever o nome de quem quisesse
-- no campo do revisor — a nota da liderança seria autodeclarada. A RPC lê o
-- revisor do TOKEN e recusa quem não for liderança/gerência/diretoria.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente.
-- Pré-requisitos: 20260709_tenant_01/02/03, 20260726_user_avatars (jwt_user_id,
-- jwt_user_role).
-- ============================================================================


-- ── (1) Colunas ─────────────────────────────────────────────────────────────
-- `reviewed_by_name` é desnormalizado de propósito, como `operator_name` já era:
-- o relatório precisa dizer quem conferiu mesmo depois de o usuário sair da
-- empresa, e a lista de execuções não carrega a tabela de usuários junto.
alter table public.completions
  add column if not exists reviewed_by      text,
  add column if not exists reviewed_by_name text,
  add column if not exists reviewed_at      timestamptz,
  add column if not exists review_note      text;

-- A tela de "pendentes de conferência" filtra por isto dentro de uma janela de
-- 90 dias; sem índice é seq scan na tabela que mais cresce no produto.
create index if not exists completions_review_idx
  on public.completions (company_id, reviewed_at);


-- ── (2) Grants: leitura livre, escrita só pela RPC ──────────────────────────
grant select (reviewed_by, reviewed_by_name, reviewed_at, review_note)
  on public.completions to authenticated;

-- O SELECT acima não bastava, e a primeira versão desta migration errou nisso.
-- `authenticated` tem UPDATE em NÍVEL DE TABELA em completions (espelhado do
-- anon em 20260709_authenticated_role_grants.sql), e grant de tabela vale para
-- toda coluna — inclusive as criadas depois. Resultado: um colaborador podia
-- fazer PATCH direto no PostgREST e se autoconferir, que é exatamente o que a
-- RPC existe para impedir. A policy `completions_tenant_rw` não segura: ela
-- escopa por empresa, não por coluna nem por papel.
--
-- Correção: troca o UPDATE de tabela por UPDATE coluna a coluna em tudo MENOS
-- as quatro de conferência. O upsert de `pushCompletion` continua funcionando
-- (ele nunca escreve nessas colunas), e a conferência passa a ter um caminho
-- só. Gerado dinamicamente para não quebrar quando a tabela ganhar colunas.
do $$
declare v_cols text;
begin
  select string_agg(format('%I', column_name), ', ' order by column_name)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'completions'
     and column_name not in ('reviewed_by', 'reviewed_by_name', 'reviewed_at', 'review_note');

  execute 'revoke update on public.completions from authenticated';
  execute format('grant update (%s) on public.completions to authenticated', v_cols);

  -- Mesmo raciocínio para o INSERT. Fecha a última fresta: com INSERT nas
  -- colunas de conferência dava para gravar uma execução JÁ marcada como
  -- conferida e inflar a nota de um líder que nunca a viu. `pushCompletion`
  -- não envia essas colunas, então nada do app quebra.
  --
  -- APLICADO SEPARADAMENTE — este bloco ainda NÃO rodou em produção (26/07):
  -- a automação do SQL Editor foi barrada no meio. Rode este arquivo inteiro
  -- de novo (é idempotente) para aplicá-lo.
  execute 'revoke insert on public.completions from authenticated';
  execute format('grant insert (%s) on public.completions to authenticated', v_cols);
end $$;


-- ── (3) A RPC ───────────────────────────────────────────────────────────────
-- `p_reviewed = false` desfaz. Desfazer é permitido de propósito: conferência
-- errada infla a nota de quem conferiu, então o incentivo já empurra para a
-- correção — e sem desfazer, um clique acidental fica no histórico para sempre.
create or replace function public.review_completion(
  p_completion_id text,
  p_note          text default null,
  p_reviewed      boolean default true
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
begin
  if v_uid is null or v_company is null then
    raise exception 'sem sessão válida';
  end if;

  if v_role not in ('lideranca', 'gerencia', 'gestao') then
    raise exception 'apenas liderança, gerência ou diretoria podem conferir';
  end if;

  select u.name into v_name from public.users u where u.id = v_uid;

  -- O `company_id` no where é o que impede conferir execução de outra empresa:
  -- a RPC é security definer, então o RLS NÃO se aplica dentro dela.
  update public.completions c
     set reviewed_by      = case when p_reviewed then v_uid else null end,
         reviewed_by_name = case when p_reviewed then coalesce(v_name, v_uid) else null end,
         reviewed_at      = case when p_reviewed then now() else null end,
         review_note      = case when p_reviewed then nullif(btrim(coalesce(p_note, '')), '') else null end
   where c.id = p_completion_id
     and c.company_id = v_company;

  if not found then
    raise exception 'execução não encontrada no escopo da sua empresa';
  end if;
end;
$$;

revoke all on function public.review_completion(text, text, boolean) from public;
revoke all on function public.review_completion(text, text, boolean) from anon;
grant execute on function public.review_completion(text, text, boolean) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Colunas e índice:
--   select column_name from information_schema.columns
--    where table_name = 'completions' and column_name like 'review%';
--   -- esperado: review_note, reviewed_at, reviewed_by, reviewed_by_name
--
-- (b) authenticated lê, mas NÃO escreve as colunas de conferência:
--   select grantee, privilege_type from information_schema.column_privileges
--    where table_name = 'completions' and column_name = 'reviewed_by';
--   -- esperado: authenticated só com SELECT
--
-- (c) A RPC recusa quem não é liderança. Com um token de colaborador:
--   select public.review_completion('<id de uma execução>');
--   -- esperado: 'apenas liderança, gerência ou diretoria podem conferir'
--
-- (d) Fim a fim: no app, Relatórios → Execuções do período → "Conferir".
--     A execução passa a mostrar "Conferido por <nome>", e o índice da
--     liderança sobe na aba Liderança do ranking da Equipe.
-- ============================================================================
