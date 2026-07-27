-- ============================================================================
-- TENANT 3g — derruba as policies `*_public_read`, que vazam entre tenants.
--
-- ── O que está aberto (medido em produção, 26/07/2026) ──────────────────────
--   checklist_types_public_read  SELECT {public}  using (true)
--   sectors_public_read          SELECT {public}  using (true)
--   companies_public_read        SELECT {public}  using (active = true)
--   units_public_read            SELECT {public}  using (active = true)
--
-- O papel `public` inclui `authenticated`. E policies permissivas se SOMAM —
-- não se intersectam. Então cada uma destas ANULA, para leitura, o escopo que a
-- `*_tenant_rw` correspondente impõe.
--
-- Efeito prático em `companies`, que é o pior: qualquer pessoa logada, de
-- qualquer empresa, lê a linha de TODAS as empresas ativas. A tabela carrega
-- `plan`, `plan_tier`, `subscription_status`, `trial_ends_at`,
-- `current_period_end`, `unit_limit`, `contact_email`, `contact_whatsapp` e
-- `mp_preapproval_id`. É a carteira de clientes do produto, legível por
-- qualquer colaborador de qualquer loja de qualquer cliente.
--
-- Em units/sectors/checklist_types o dado é menos sensível — nomes de loja,
-- setor e tipo de checklist — mas o vazamento é o mesmo e é justamente o que a
-- série tenant_* existe para fechar.
--
-- Não é escrita: as quatro são SELECT. Também não é alcançável por quem só tem
-- a anon key: para o `anon` as `*_anon_read` já davam a mesma leitura, de
-- propósito, porque a tela de entrada é montada antes do login. O que muda aqui
-- é o `authenticated`.
--
-- ── Por que é seguro derrubar `companies_public_read` ───────────────────────
-- Conferido em 27/07/2026: os três chamadores de `fetchCompany` (lib/sync.js)
-- pedem UMA empresa, nunca uma lista —
--   · app/app/page.js:10998  fetchCompany(null, cid)   → por id, pós-login
--   · app/app/page.js:11435  fetchCompany(tenantSlug)  → por slug, no mount
--   · app/importar/page.js:35 fetchCompany(slug)       → por slug, antes do PIN
-- e a query termina em `.single()`.
--
-- Pós-login, `companies_tenant_rw` (`id = public.jwt_company_id()`) já entrega
-- a própria empresa. Antes do login, `companies_anon_read` entrega. A lista
-- múltipla do /entrar (`select id, slug, subdomain where active`) é anônima.
-- Nenhum caminho precisa que um usuário logado leia empresa alheia.
--
-- Efeito colateral desejável: hoje, se alguém da empresa A abre o subdomínio da
-- empresa B com a sessão de A restaurada, `companies_public_read` devolve a
-- linha inteira de B. Depois desta migration, devolve nada.
--
-- ── Por que units/sectors/checklist_types levam uma trava antes ─────────────
-- Ali a leitura autenticada passa a depender só de `<t>_tenant_rw`, que casa
-- `company_id = jwt_company_id()`. Se existir linha com `company_id` NULO, ela
-- some da tela em vez de vazar — troca um vazamento por dado sumido, o que é
-- pior para quem está operando. Por isso o passo 1 conta essas linhas e, se
-- houver, NÃO derruba a policy dessa tabela e devolve a contagem para você
-- decidir. `companies` não precisa da trava: o escopo dela é por `id`, que é
-- chave primária e nunca é nulo.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. No diálogo do editor: "Run without RLS".
-- Pré-requisito: 20260726_tenant_03c_revoke_anon_tabela.sql (cria as *_anon_read)
-- ============================================================================


drop table if exists _t03g_diag;
create temp table _t03g_diag (ord int, bloco text, item text, detalhe text);


-- ── 1. Trava: linha órfã faria a policy de tenant esconder dado ─────────────
do $$
declare t text; n bigint;
begin
  foreach t in array array['units','sectors','checklist_types'] loop
    execute format('select count(*) from public.%I where company_id is null', t) into n;
    if n > 0 then
      insert into _t03g_diag values (
        100, 'TRAVADA', t,
        format('%s linha(s) com company_id NULO — policy NÃO derrubada. '
               'Derrubar agora faria essas linhas sumirem da tela de quem está '
               'logado. Preencha o company_id e rode esta migration de novo.', n));
    else
      insert into _t03g_diag values (
        101, 'ok', t, 'nenhuma linha órfã — seguro derrubar');
    end if;
  end loop;
end $$;


-- ── 2. Derruba o que está liberado ──────────────────────────────────────────
-- `companies` sai sem trava (escopo por id, chave primária).
do $$
declare t text; n bigint; existia boolean;
begin
  -- companies
  existia := exists (select 1 from pg_policies
                      where schemaname = 'public' and tablename = 'companies'
                        and policyname = 'companies_public_read');
  drop policy if exists companies_public_read on public.companies;
  insert into _t03g_diag values (
    200, case when existia then 'DERRUBADA' else 'ok' end, 'companies_public_read',
    case when existia then 'leitura de empresa alheia por usuário logado fechada'
         else 'já não existia' end);

  -- as outras três, só se o passo 1 liberou
  foreach t in array array['units','sectors','checklist_types'] loop
    execute format('select count(*) from public.%I where company_id is null', t) into n;
    continue when n > 0;

    existia := exists (select 1 from pg_policies
                        where schemaname = 'public' and tablename = t
                          and policyname = t || '_public_read');
    execute format('drop policy if exists %I on public.%I', t || '_public_read', t);
    insert into _t03g_diag values (
      201, case when existia then 'DERRUBADA' else 'ok' end, t || '_public_read',
      case when existia then 'leitura entre tenants fechada'
           else 'já não existia' end);
  end loop;
end $$;


-- ============================================================================
-- VERIFICAÇÃO — devolve LINHAS (o SQL Editor do Supabase não exibe notice).
-- Nas linhas VERIFICAÇÃO, `valor` tem de bater com `esperado`.
-- ============================================================================
with meta(t) as (
  values ('companies'),('units'),('sectors'),('checklist_types')
), verif(n, item, valor, esperado) as (

-- Se vier diferente de 0, a causa está nas linhas TRAVADA acima: a policy
-- daquela tabela não foi derrubada de propósito, por haver linha órfã.
select 0, '0. policies para o papel `public` nos 4 metadados',
       (select count(*) from pg_policies
         where schemaname = 'public'
           and tablename in (select t from meta)
           and 'public' = any(roles))::text, '0'
union all
-- o que NÃO pode ter sumido: a tela de entrada é anônima e continua precisando
select 1, '1. metadados com policy de leitura para o anon',
       (select count(*) from pg_policies
         where schemaname = 'public'
           and tablename in (select t from meta)
           and cmd in ('SELECT','ALL') and 'anon' = any(roles))::text, '4'
union all
select 2, '2. metadados com policy de tenant para o authenticated',
       (select count(*) from pg_policies
         where schemaname = 'public'
           and tablename in (select t from meta)
           and cmd = 'ALL' and 'authenticated' = any(roles))::text, '4'
union all
select 3, '3. linhas órfãs (company_id nulo) nos 3 escopados por empresa',
       ((select count(*) from public.units           where company_id is null)
      + (select count(*) from public.sectors         where company_id is null)
      + (select count(*) from public.checklist_types where company_id is null))::text, '0'
)

select ord, bloco, item, valor, esperado
  from (
    select ord, bloco, item, detalhe as valor, '' as esperado from _t03g_diag
    union all
    select 500 + n, 'VERIFICAÇÃO', item, valor, esperado from verif
  ) tudo
 order by ord, item;


-- ============================================================================
-- COMO CONFIRMAR NO APP — vale mais que a verificação acima
--
--   1. Entrar como colaborador de uma empresa e usar o app normalmente:
--      lojas, setores e tipos de checklist têm de continuar aparecendo.
--      Se sumirem, é linha órfã — rode a verificação 3 e preencha o company_id.
--   2. Com essa sessão aberta, abrir o subdomínio de OUTRA empresa. Antes desta
--      migration, o app montava com o nome da outra empresa. Agora não deve
--      montar.
--   3. /entrar e /cadastro continuam funcionando deslogado.
--
-- ROLLBACK, se algo sumir da tela:
--   create policy companies_public_read on public.companies
--     for select to public using (active = true);
--   create policy units_public_read on public.units
--     for select to public using (active = true);
--   create policy sectors_public_read on public.sectors
--     for select to public using (true);
--   create policy checklist_types_public_read on public.checklist_types
--     for select to public using (true);
-- ============================================================================
