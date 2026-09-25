-- ============================================================================
-- 20260924_companies_escrita.sql — a linha da empresa não é gravável pelo app,
-- exceto a marca (logo, cor) e o fim do assistente inicial.
--
-- ── O que estava aberto (medido em produção, 24/09/2026) ────────────────────
--   · companies_tenant_rw (20260709_tenant_02_rls)
--       for all to authenticated
--         using      (id = public.jwt_company_id())
--         with check (id = public.jwt_company_id())
--   · e o `authenticated` com INSERT, UPDATE e DELETE de TABELA em
--     `public.companies` (20260716_billing, 20260717_onboarding e
--     20260719_admin_config fizeram `grant select … to anon, authenticated`,
--     mas a escrita veio dos grants espelhados de 20260709).
--
-- Escopo de EMPRESA, nenhum de PAPEL e nenhum de COLUNA. O token de sessão sai
-- para qualquer papel, então um colaborador, direto no PostgREST:
--   PATCH  /rest/v1/companies?id=eq.<a dele>
--          {"subscription_status":"active","trial_ends_at":"2099-01-01",
--           "unit_limit":99,"plan_tier":"…","current_period_end":"2099-01-01"}
--          — estende o teste ou marca a assinatura como paga, sem pagar;
--          troca `mp_preapproval_id`, `billing_mode`, `cnpj`, `slug`, `active`;
--   DELETE /rest/v1/companies?id=eq.<a dele>
--          — apaga a linha da própria empresa.
-- A tela não oferece nada disso, mas tela não é fronteira de acesso.
--
-- ── O que o app grava de verdade (conferido no código em 24/09/2026) ────────
-- Um caminho só: `saveCompany` (lib/sync.js), UPDATE parcial por id, chamado
--   · pelo assistente inicial (OnboardingWizard, só para `gestao`):
--     primary_color, logo_url, onboarded_at;
--   · pelo logo da empresa em Gerenciar (cabeçalho e Estrutura > Lojas; a aba
--     Gerenciar é de `gerencia` e `gestao`): logo_url.
-- INSERT e DELETE: nenhum. Empresa nasce em provision_company e morre em
-- admin_delete_company (SECURITY DEFINER, rodam como dona da tabela) ou nas
-- rotas de servidor. Cobrança (checkout, webhook, cron billing-sync, cancel) e
-- admin gravam com `service_role`.
--
-- ── A correção ──────────────────────────────────────────────────────────────
--   · SELECT: a própria empresa, como antes (fetchCompany faz `select *`).
--   · UPDATE: só `gestao` e `gerencia`, na própria empresa — e só nas colunas
--     `logo_url`, `primary_color` e `onboarded_at`, por GRANT DE COLUNA.
--   · INSERT e DELETE: nenhum papel de cliente.
--
-- Por que grant de coluna aqui (e não em 20260923_users_escrita_gestao): lá
-- era "só a própria linha, só a foto" — o grant é por papel do Postgres, não
-- por linha, e todo mundo é `authenticated`. Aqui a regra é por COLUNA para
-- TODOS: nenhuma sessão de cliente, de papel nenhum, grava coluna de cobrança.
-- É exatamente o que o grant diz. Coluna fora da lista responde 42501
-- "permission denied" — erro explícito, não UPDATE de zero linhas calado.
-- E o cliente nunca faz upsert em `companies` (saveCompany é UPDATE de
-- propósito, ver o comentário dela), então tirar o INSERT não quebra nada.
--
-- `gerencia` entra no UPDATE porque a tela de logo está na aba Gerenciar, que
-- ela tem. Sem ela, trocar o logo como gerência viraria UPDATE de zero linhas:
-- a tela diria "salvo" e o logo voltaria no reload. `onboarded_at` fica
-- gravável também pela gerência (o grant não distingue papel) — o pior caso é
-- ela marcar como concluído o assistente que a diretoria ainda não terminou.
--
-- ── O que NÃO muda ──────────────────────────────────────────────────────────
--   · Leitura: `companies_anon_read` (o /entrar e o /cadastro acham a empresa
--     antes do login) e os grants de SELECT não são tocados.
--   · service_role (BYPASSRLS e grants próprios), provision_company,
--     admin_delete_company e as outras SECURITY DEFINER.
--   · O gatilho `companies_cnpj_link`.
--   · `saveCompany` ainda aceita name/slug/plan/active. Ninguém chama com essas
--     chaves; se alguém passar a chamar, leva 42501 — o certo é uma rota de
--     servidor.
--
-- ── Risco que continua, e não é desta migration ─────────────────────────────
--   · `logo_url` não tem o valor conferido (ao contrário de set_my_avatar): a
--     gerência ou a diretoria podem apontar para um endereço externo, que
--     aparece no <img> da tela de login (pública) e de toda a equipe.
--   · Qualquer membro LÊ a linha inteira: `mp_preapproval_id`, `cnpj`,
--     contatos. Fechar isso é leitura por coluna ou uma view.
--   · O papel vem do claim do token, que vale 7 dias (lib/serverAuth.js).
--
-- ── Nenhum deploy antes ─────────────────────────────────────────────────────
-- O app já grava só as três colunas, por UPDATE, com o papel certo.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. Mandar o arquivo INTEIRO numa execução só: vários comandos numa
-- consulta rodam numa transação implícita, e a trava (3) DESFAZ TUDO se sobrar
-- outra policy de escrita em `companies` ou se `anon`/`authenticated` ainda
-- puderem escrever coluna fora da lista. A mensagem diz o que foi.
-- Teste: node supabase/migrations/20260924_companies_escrita.test.mjs
-- ============================================================================


-- ── (0) Travas de entrada ───────────────────────────────────────────────────
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'companies'
         and column_name in ('logo_url', 'primary_color', 'onboarded_at')) <> 3 then
    raise exception 'public.companies sem logo_url/primary_color/onboarded_at. Nada foi aplicado.';
  end if;
end $$;

alter table public.companies enable row level security;


-- ── (1) Policies: lê a própria empresa; altera só diretoria e gerência ──────
drop policy if exists companies_tenant_rw on public.companies;

drop policy if exists companies_tenant_select on public.companies;
create policy companies_tenant_select on public.companies
  for select to authenticated
  using (id = public.jwt_company_id());

-- O WITH CHECK repete o USING. O `id` já não é gravável pelo grant (2), mas a
-- regra não depende disso.
drop policy if exists companies_config_update on public.companies;
create policy companies_config_update on public.companies
  for update to authenticated
  using      (id = public.jwt_company_id()
              and public.jwt_user_role() in ('gestao', 'gerencia'))
  with check (id = public.jwt_company_id()
              and public.jwt_user_role() in ('gestao', 'gerencia'));


-- ── (2) Grants: escrita só nas três colunas da marca ────────────────────────
-- REVOKE de tabela leva junto os grants de coluna que existirem. PUBLIC entra
-- porque todo papel herda dele. SELECT não é tocado.
revoke insert, update, delete, truncate, references, trigger
  on public.companies from public, anon, authenticated;

grant update (logo_url, primary_color, onboarded_at) on public.companies to authenticated;


-- ── (3) Trava: nenhuma policy nem grant reabre a escrita ────────────────────
do $$
declare
  v_sobra text;
  v_papel text;
  v_col   record;
  v_priv  text;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.companies'::regclass) then
    raise exception 'RLS está DESLIGADO em public.companies — nenhuma policy vale. Nada foi aplicado.';
  end if;

  -- Policies PERMISSIVE se somam com OR: uma de escrita a mais anula tudo. E
  -- de leitura, para quem está logado, só a da própria empresa.
  select string_agg(format('%s (%s para %s)', p.policyname, p.cmd,
                           array_to_string(p.roles, ',')), '; ' order by p.policyname)
    into v_sobra
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename  = 'companies'
     and p.permissive = 'PERMISSIVE'
     and (
           (p.cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
            and p.roles && array['anon', 'authenticated', 'public']::name[]
            and p.policyname <> 'companies_config_update')
        or (p.cmd = 'SELECT'
            and p.roles && array['authenticated', 'public']::name[]
            and p.policyname <> 'companies_tenant_select')
         );

  if v_sobra is not null then
    raise exception 'public.companies tem outra policy, que reabriria a escrita ou a leitura de outra empresa: %. Nada foi aplicado — revise, remova e rode de novo.', v_sobra;
  end if;

  -- Grant: o próprio Postgres responde o que anon e authenticated escrevem.
  foreach v_papel in array array['anon', 'authenticated'] loop
    foreach v_priv in array array['INSERT', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege(v_papel, 'public.companies', v_priv) then
        raise exception '% ainda tem % em public.companies (grant vindo de outro papel?). Nada foi aplicado.', v_papel, v_priv;
      end if;
    end loop;
    for v_col in
      select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'companies'
    loop
      if has_column_privilege(v_papel, 'public.companies', v_col.column_name, 'INSERT')
         or (has_column_privilege(v_papel, 'public.companies', v_col.column_name, 'UPDATE')
             and not (v_papel = 'authenticated'
                      and v_col.column_name in ('logo_url', 'primary_color', 'onboarded_at'))) then
        raise exception '% ainda escreve a coluna companies.%. Nada foi aplicado.', v_papel, v_col.column_name;
      end if;
    end loop;
  end loop;
end $$;


-- ============================================================================
-- VERIFICAÇÃO — devolve LINHAS (o SQL Editor não mostra notice). Em cada
-- linha com `esperado`, `valor` tem de bater.
-- ============================================================================
with verif(n, item, valor, esperado) as (
  select 1, 'RLS ligado em companies',
         (select relrowsecurity from pg_class where oid = 'public.companies'::regclass)::text, 'true'
  union all
  select 2, 'policies de companies (nome:comando:papel)',
         (select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ' | ' order by policyname)
            from pg_policies where schemaname = 'public' and tablename = 'companies'),
         'companies_anon_read:SELECT:anon | companies_config_update:UPDATE:authenticated | '
         || 'companies_tenant_select:SELECT:authenticated'
  union all
  select 3, 'o UPDATE exige gestao ou gerencia (using e check)',
         (select qual like '%jwt_user_role()%gestao%gerencia%' and with_check like '%jwt_user_role()%gestao%gerencia%'
            from pg_policies where schemaname = 'public' and tablename = 'companies'
             and policyname = 'companies_config_update')::text, 'true'
  union all
  select 4, 'colunas que authenticated grava',
         (select string_agg(column_name, ', ' order by column_name) from information_schema.columns
           where table_schema = 'public' and table_name = 'companies'
             and has_column_privilege('authenticated', 'public.companies', column_name, 'UPDATE')),
         'logo_url, onboarded_at, primary_color'
  union all
  select 5, 'authenticated com INSERT/DELETE/TRUNCATE em companies',
         (has_table_privilege('authenticated', 'public.companies', 'INSERT')
          or has_table_privilege('authenticated', 'public.companies', 'DELETE')
          or has_table_privilege('authenticated', 'public.companies', 'TRUNCATE'))::text, 'false'
  union all
  select 6, 'anon escreve algo em companies',
         (has_any_column_privilege('anon', 'public.companies', 'INSERT')
          or has_any_column_privilege('anon', 'public.companies', 'UPDATE')
          or has_table_privilege('anon', 'public.companies', 'DELETE'))::text, 'false'
  union all
  select 7, 'anon e authenticated continuam LENDO companies (o /entrar e o app dependem)',
         (has_table_privilege('anon', 'public.companies', 'SELECT')
          and has_table_privilege('authenticated', 'public.companies', 'SELECT'))::text, 'true'
  union all
  select 8, 'gatilho companies_cnpj_link',
         (select count(*) from pg_trigger where tgrelid = 'public.companies'::regclass
             and tgname = 'companies_cnpj_link' and not tgisinternal)::text, '1'
)
select n as ord, item, valor, esperado from verif order by n;


-- ============================================================================
-- PRÉ-VOO (antes de aplicar; só leitura):
--
--   select
--     (select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ' | ' order by policyname)
--        from pg_policies where schemaname = 'public' and tablename = 'companies') as policies,
--     has_table_privilege('authenticated', 'public.companies', 'UPDATE') as auth_update,
--     has_table_privilege('authenticated', 'public.companies', 'DELETE') as auth_delete,
--     has_any_column_privilege('anon', 'public.companies', 'UPDATE') as anon_update;
--   -- esperado hoje (medido 24/09/2026):
--   --   companies_anon_read:SELECT:anon | companies_tenant_rw:ALL:authenticated | true | true | false
--
-- ── COMO CONFIRMAR NO APP ───────────────────────────────────────────────────
--   1. Diretoria (ou gerência) → Gerenciar → trocar o logo: aparece e continua
--      depois do reload.
--   2. Empresa nova pelo /comecar → assistente inicial até o fim: o app abre
--      normal (onboarded_at gravado) e com a cor e o logo escolhidos.
--   3. Com o token de um COLABORADOR (localStorage zc_session_v1), direto no
--      PostgREST — tem de voltar 401/403 "permission denied for table companies":
--        curl -s -X PATCH '<URL>/rest/v1/companies?id=eq.<empresa>' \
--          -H 'apikey: <ANON>' -H 'Authorization: Bearer <TOKEN>' \
--          -H 'Content-Type: application/json' -d '{"subscription_status":"active"}'
--
-- ── ROLLBACK de emergência ──────────────────────────────────────────────────
-- Se a troca de logo ou o fim do assistente quebrarem (devolve os buracos
-- junto — é saída de incêndio, não correção):
--   begin;
--   drop policy if exists companies_tenant_select on public.companies;
--   drop policy if exists companies_config_update on public.companies;
--   create policy companies_tenant_rw on public.companies
--     for all to authenticated
--     using (id = public.jwt_company_id()) with check (id = public.jwt_company_id());
--   grant insert, update, delete on public.companies to authenticated;
--   commit;
-- ============================================================================
