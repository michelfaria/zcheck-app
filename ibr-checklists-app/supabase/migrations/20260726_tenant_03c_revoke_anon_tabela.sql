-- ============================================================================
-- TENANT 3c — tira do `anon` o que sobrou das varreduras 03 e 03b.
--
-- Diagnóstico de 26/07/2026, em produção:
--   `public.users` ainda tem, para o papel `anon`, os privilégios de tabela
--   DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE e UPDATE. Só o SELECT caiu.
--
-- ── Por que sobrou (hipótese revista em 26/07 — a primeira estava errada) ────
-- A explicação natural seria "REVOKE só desfaz o que o papel corrente
-- concedeu, então grants vindos do supabase_admin sobreviveram". O próprio
-- repositório REFUTA isso: `20260709_secure_pin_validation.sql` roda
-- `revoke select on public.users from anon` — e funcionou, já que hoje o
-- estado é exatamente ALL MENOS SELECT. Se o grantor fosse inalcançável, o
-- SELECT teria sobrevivido junto com o resto.
--
-- A explicação parcimoniosa é outra: o primeiro bloco `do` da
-- `20260709_tenant_03_revoke_anon.sql` (o que roda `revoke all on table`)
-- NUNCA CHEGOU A VALER. Isso encaixa em tudo o que se observa:
--   · `secure_pin_validation` tirou o SELECT de tabela → sobrou ALL − SELECT;
--   · a 03b (11/07) ainda encontrou grants de COLUNA em `users`, o que só faz
--     sentido se a 03 não tivesse rodado sobre a tabela — porque, ao contrário
--     do que o cabeçalho da 03b afirma, `revoke all on table` REMOVE sim os
--     privilégios de coluna correspondentes (doc do REVOKE: "the corresponding
--     column privileges (if any) are automatically revoked on each column").
--
-- ⚠️ CONSEQUÊNCIA DE ESCOPO — o motivo de esta migration ser maior que o
-- diagnóstico original. Se o primeiro bloco da 03 não valeu, não há razão para
-- supor que o SEGUNDO valeu. O segundo bloco derruba as políticas
-- `<t>_anon_legacy` criadas na `20260709_tenant_02_rls.sql` para `companies`,
-- `units`, `sectors` e `checklist_types` — políticas TEMPORÁRIAS e
-- `for all to anon using (true) with check (true)`. Se ainda existirem, hoje
-- qualquer visitante com a anon key do bundle ESCREVE em `companies`. Esta
-- migration reafirma esse corte, de forma idempotente.
--
-- ── Impacto do que está sendo revogado ──────────────────────────────────────
-- Nas 8 operacionais, nenhum: elas têm RLS ligado e nenhuma policy para `anon`
-- (conferido em pg_policies, 26/07/2026), então tudo já é negado. Mas a
-- proteção passou a depender de UMA camada só — basta alguém criar uma policy
-- permissiva para anon por engano (já aconteceu neste banco: foi o que motivou
-- a 03b) para o anon poder apagar ou truncar a tabela de usuários. Grant é
-- avaliado ANTES do RLS; sem grant a operação morre em 42501, sem chegar na
-- policy.
--
-- ── O que foi conferido antes de revogar (26/07/2026) ────────────────────────
-- Nenhum caminho anônimo depende do que sai daqui:
--   · tela de login → RPC `public_users(p_company_id)` — SECURITY DEFINER;
--   · PIN → RPC `validate_pin(p_user_id, p_pin)` — SECURITY DEFINER;
--   · /cadastro (app/cadastro/page.js) → só `companies` (select), o bucket
--     `colaboradores` (storage), `user_requests` (insert) e o RPC
--     `user_request_status(p_cpf)`. Não toca `public.users`;
--   · /entrar (app/entrar/page.js) → `company_codes` e `companies`, só select;
--   · aprovação do cadastro → RPC `create_user_from_request(...)` — SECURITY
--     DEFINER. É ela que escreve em `users`, com os privilégios do dono da
--     função, e por isso segue funcionando com o anon sem grant na tabela;
--   · `units`/`sectors`/`checklist_types` → escrita só via `authedSupabase()`
--     em lib/sync.js (papel `authenticated`, pós-login) e em /importar, que
--     exige PIN de gerência;
--   · `companies` → escrita só nas rotas server-side (service_role);
--   · as 8 operacionais → só via `authedSupabase()` em lib/sync.js,
--     lib/collab.js e app/app/page.js.
--
-- ── O que este script NÃO toca, de propósito ─────────────────────────────────
--   · `user_requests` — INSERT anônimo é o que sustenta o /cadastro;
--   · `events` — insert anônimo é intencional (instrumentação pré-login);
--   · `company_codes` — o /entrar lê como anon. Fora do escopo desta varredura;
--   · SELECT do anon em `companies`/`units`/`sectors`/`checklist_types` — a
--     tela de entrada é montada antes do login e precisa dos nomes;
--   · grants feitos a `PUBLIC` — são detectados e AVISADOS, nunca revogados
--     automaticamente: revogar de PUBLIC pode derrubar junto o papel
--     `authenticated`, que em algumas tabelas pode não ter grant próprio.
--     Ver `20260709_authenticated_role_grants.sql`, que derivou os grants de
--     `authenticated` a partir dos do `anon`.
--
-- ── Nota sobre a fonte de dados usada aqui ──────────────────────────────────
-- Este script NÃO consulta `information_schema`. As views daquele schema
-- filtram por "currently enabled role" e, pior, OMITEM explicitamente grants
-- feitos a PUBLIC (doc do role_table_grants). Uma verificação escrita sobre
-- elas devolveria zero com o privilégio de pé — foi o que a revisão pegou na
-- primeira versão desta migration. Aqui a fonte é sempre o catálogo:
-- `pg_class.relacl` / `pg_attribute.attacl` via `aclexplode()`, e
-- `has_table_privilege()`, que já resolvem PUBLIC e herança de papel.
--
-- ── Por que os diagnósticos voltam como LINHAS, e não como `raise notice` ───
-- Verificado na bancada em 26/07/2026: o SQL Editor do Supabase NÃO exibe
-- saída de `raise notice`/`raise warning`. Só tem as abas Results e Chart, e um
-- `do $$ begin raise notice 'x'; end $$;` responde apenas "Success. No rows
-- returned" — a mensagem é descartada. Como esta migration é feita para rodar
-- ali, todo diagnóstico é gravado numa tabela temporária e devolvido junto com
-- a verificação, no mesmo resultado. Os `raise warning` continuam nos blocos de
-- exceção, para quem rodar por psql, mas nunca são a única via.
--
-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ RESULTADO REAL EM PRODUÇÃO — rodada em 26/07/2026. Leia antes de          ║
-- ║ acreditar no diagnóstico acima: as duas hipóteses dele foram REFUTADAS.   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
--   · `public.users` NÃO tinha grant nenhum para o anon quando esta migration
--     rodou. O bloco de diagnóstico (que lê `pg_class.relacl`) não devolveu uma
--     linha sequer para ela, e a verificação 1 deu zero por caminho
--     independente — `has_table_privilege`, que também pegaria herança de
--     PUBLIC. Ou os grants saíram entre o diagnóstico e a execução, ou a
--     leitura original vinha de fonte que reportava outra coisa.
--
--   · As quatro `*_anon_legacy` NÃO existiam — todas voltaram como `ok`. O
--     segundo bloco da tenant_03 VALEU, e a "consequência de escopo" alertada
--     acima não se concretizou: não havia escrita anônima aberta em
--     `companies`.
--
--   · O único "antes" foi `SELECT para anon` nos quatro metadados, que já era
--     o estado desejado. Nas 12 tabelas da lista fixa, esta migration foi
--     no-op.
--
-- O valor dela veio da VERIFICAÇÃO, não do revoke — dois achados que nenhuma
-- varredura anterior pegava:
--
--   1. a verificação 11 devolveu 1: o anon tinha ALL em `public.events`,
--      incluindo SELECT, DELETE e TRUNCATE. Fechado pela tenant_03d.
--
--   2. a verificação 7 devolveu 4: FALSO POSITIVO desta verificação, que conta
--      qualquer policy de SELECT não chamada `*_anon_read`. São as
--      `*_public_read` — todas SELECT, nenhuma é escrita anônima. Elas têm um
--      problema próprio, de vazamento entre tenants, registrado na 03d.
--
-- Lição que vale para a próxima varredura: partir de lista fixa foi o erro
-- estrutural. Foi a auditoria ABERTA do rodapé — a que varre o schema inteiro
-- em vez de nomes conhecidos — que achou as oito tabelas da 03d.
--
-- ── O diálogo que o SQL Editor vai abrir, e qual botão apertar ──────────────
-- Ao rodar, o Supabase interrompe com "Potential issues detected", listando:
--   1. "This query includes destructive operations" — é verdade e é o objetivo:
--      são os `revoke` e os `drop policy`. Inevitável em qualquer versão deste
--      script.
--   2. "This query creates a table without enabling Row Level Security …
--      _t03c_diag" — FALSO ALARME. `_t03c_diag` é temporária, vive em `pg_temp`
--      e o PostgREST não expõe esse schema; o anon não a alcança de forma
--      nenhuma. O linter apenas não distingue tabela temporária de permanente.
--
-- A resposta correta é **"Run without RLS"**. NÃO clique em "Run and enable
-- RLS": além de desnecessário, faz o editor injetar DDL que você não revisou.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente — pode rodar mais de uma vez. Não precisa de janela: nenhuma
-- sessão logada usa o papel `anon`.
-- ============================================================================


-- ── 0. Onde os diagnósticos são acumulados ──────────────────────────────────
-- Temporária: morre com a sessão, não deixa rastro no schema. O `drop` antes do
-- `create` cobre o caso de uma execução anterior ter deixado a tabela viva numa
-- conexão reaproveitada do pool.
drop table if exists _t03c_diag;
create temp table _t03c_diag (ord int, bloco text, item text, detalhe text);
-- Uma tabela temporária vive em `pg_temp`, que o PostgREST não expõe — o anon
-- nunca a alcança, com ou sem RLS.
--
-- O linter do SQL Editor vai acusá-la mesmo assim ("creates a table without
-- enabling Row Level Security"). Testado na bancada em 26/07/2026: acrescentar
-- `alter table _t03c_diag enable row level security` NÃO cala o alerta — o
-- linter olha só o `create table` e ignora o `alter` seguinte. Por isso o
-- `alter` não está aqui: seria uma linha que não faz nada.
-- Ver o cabeçalho para qual botão apertar.


-- ── 1. Diagnóstico: o "antes", lido do catálogo ─────────────────────────────
do $$
declare r record; n int := 0;
begin
  for r in
    select c.relname                              as tabela,
           a.grantor::regrole::text               as concedido_por,
           case when a.grantee = 0 then 'PUBLIC'
                else a.grantee::regrole::text end as para,
           string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
      from pg_class c
      join pg_namespace n2 on n2.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
     where n2.nspname = 'public'
       and c.relname in ('templates','users','completions','photos','closures',
                         'live_tasks','recognitions','push_subscriptions',
                         'companies','units','sectors','checklist_types')
       and (a.grantee = 'anon'::regrole or a.grantee = 0)
     group by 1, 2, 3
     order by 1, 3
  loop
    n := n + 1;
    insert into _t03c_diag values (
      100 + n, 'ANTES', r.tabela,
      format('%s para %s (concedido por %s)', r.privs, r.para, r.concedido_por));
  end loop;
  if n = 0 then
    insert into _t03c_diag values (
      100, 'ANTES', '(nada)',
      'nenhum grant do anon/PUBLIC nas 12 tabelas — nada a revogar');
  end if;
end $$;


-- ── 2. Operacionais: o anon não precisa de NADA ─────────────────────────────
-- A guarda `to_regclass` existe porque o SQL Editor roda o script inteiro em
-- UMA transação: um erro em qualquer statement (tabela renomeada, ausente num
-- projeto novo — seis destas oito não têm `create table` no repositório) faria
-- rollback também dos revokes que já tinham dado certo.
do $$
declare t text;
begin
  foreach t in array array['templates','users','completions','photos','closures',
                           'live_tasks','recognitions','push_subscriptions']
  loop
    if to_regclass('public.' || t) is null then
      insert into _t03c_diag values (200, 'PULADA', t, 'tabela não existe neste banco');
      continue;
    end if;
    execute format('revoke all privileges on public.%I from anon', t);
  end loop;
end $$;


-- ── 3. Metadados de tenant: anon volta a ser SÓ LEITURA ─────────────────────
-- Reafirma o segundo bloco da tenant_03, que provavelmente não valeu (ver
-- cabeçalho). Ordem importa: a política de leitura é criada ANTES de a
-- permissiva ser derrubada, para que não exista instante — nem em caso de erro
-- no meio — em que a tela de entrada fique sem SELECT.
--
-- `revoke all` seguido de `grant select` em vez de revogar privilégio a
-- privilégio: cobre também tipos de privilégio futuros (o PG 17 acrescentou
-- MAINTAIN) sem precisar editar a lista.
do $$
declare t text;
begin
  foreach t in array array['companies','units','sectors','checklist_types']
  loop
    if to_regclass('public.' || t) is null then
      insert into _t03c_diag values (200, 'PULADA', t, 'tabela não existe neste banco');
      continue;
    end if;

    -- `alter table` e `create policy` exigem ser DONO da tabela. Se o papel da
    -- sessão não for, o erro derrubaria a transação inteira e desfaria também os
    -- revokes do passo 1. Cada tabela é tratada em subtransação própria: o que
    -- falhar vira aviso e as outras seguem.
    begin
      execute format('alter table public.%I enable row level security', t);

      -- (a) garante a política de leitura anônima
      execute format('drop policy if exists %I on public.%I', t || '_anon_read', t);
      execute format('create policy %I on public.%I for select to anon using (true)',
                     t || '_anon_read', t);

      -- (b) só então derruba a permissiva temporária da tenant_02
      if exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = t
                    and policyname = t || '_anon_legacy') then
        execute format('drop policy %I on public.%I', t || '_anon_legacy', t);
        insert into _t03c_diag values (
          300, 'ATENÇÃO', t || '_anon_legacy',
          'AINDA EXISTIA e foi derrubada agora — a tenant_03 não chegou a valer '
          'nesta tabela, ou seja, a escrita anônima esteve aberta até este momento');
      else
        insert into _t03c_diag values (
          301, 'ok', t || '_anon_legacy',
          'já não existia — a tenant_03 tinha valido aqui');
      end if;
    exception when others then
      raise warning 'RLS/policies de public.% não puderam ser ajustadas: %', t, sqlerrm;
      insert into _t03c_diag values (
        400, 'FALHA', t,
        format('RLS/policies não puderam ser ajustadas: %s — confira o dono da '
               'tabela (pg_class.relowner) e refaça esta parte com uma conexão '
               'que seja dono', sqlerrm));
    end;

    -- (c) escrita anônima fecha no grant, que é a camada de fora do RLS.
    --     Fora da subtransação acima de propósito: revoke/grant não exigem
    --     ownership, então devem valer mesmo se o ajuste de policy falhar.
    execute format('revoke all privileges on public.%I from anon', t);
    execute format('grant select on public.%I to anon', t);
  end loop;
end $$;


-- ── 4. Rede: grants por COLUNA ──────────────────────────────────────────────
-- Estritamente redundante — o `revoke all on table` dos passos 1 e 2 já
-- cascateia para as colunas. Fica como rede para o caso de algum revoke acima
-- ter sido parcial, e porque o custo é zero. Fonte é `pg_attribute.attacl`,
-- não `information_schema.column_privileges` (que expande grants de tabela em
-- linhas por coluna e produziria ruído).
do $$
declare c record;
begin
  for c in
    select cl.relname as tabela, att.attname as coluna
      from pg_class cl
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute att on att.attrelid = cl.oid
                           and att.attnum > 0 and not att.attisdropped
      cross join lateral aclexplode(att.attacl) a
     where n.nspname = 'public'
       and cl.relname in ('templates','users','completions','photos','closures',
                          'live_tasks','recognitions','push_subscriptions')
       and a.grantee = 'anon'::regrole
     group by 1, 2
  loop
    execute format('revoke all privileges (%I) on public.%I from anon',
                   c.coluna, c.tabela);
    insert into _t03c_diag values (
      310, 'COLUNA', c.tabela || '.' || c.coluna,
      'sobra de grant por coluna revogada — o revoke de tabela do passo 2 '
      'deveria ter cascateado; investigar por que não cascateou');
  end loop;
end $$;


-- ── 5. Cinto e suspensório: RLS ligado nas oito operacionais ────────────────
do $$
declare t text;
begin
  foreach t in array array['templates','users','completions','photos','closures',
                           'live_tasks','recognitions','push_subscriptions']
  loop
    continue when to_regclass('public.' || t) is null;
    begin
      execute format('alter table public.%I enable row level security', t);
    exception when others then
      raise warning 'não foi possível ligar RLS em public.%: %', t, sqlerrm;
      insert into _t03c_diag values (
        400, 'FALHA', t,
        format('não foi possível ligar RLS: %s — confira o dono da tabela. '
               'O revoke do passo 2 continua valendo', sqlerrm));
    end;
  end loop;
end $$;


-- ── 6. Conferência pós-revoke ───────────────────────────────────────────────
-- Substitui a tentativa de `set local role <grantor>` da primeira versão, que
-- era inútil por dois motivos: (i) no Supabase hospedado o papel `postgres` não
-- consegue assumir `supabase_admin` ("permission denied to set role"), e
-- (ii) `REVOKE ... GRANTED BY` não ajuda — o Postgres exige que o grantor
-- informado seja o próprio usuário corrente, a cláusula existe só por
-- compatibilidade SQL.
--
-- Também não se pode confiar em "não deu exceção, logo revogou": um REVOKE de
-- privilégio que o papel corrente não concedeu emite apenas um WARNING. Por
-- isso aqui a checagem é pelo EFEITO, com has_table_privilege.
do $$
declare
  r record;
  v_todas text[] := array['templates','users','completions','photos','closures',
                          'live_tasks','recognitions','push_subscriptions',
                          'companies','units','sectors','checklist_types'];
  v_metadados text[] := array['companies','units','sectors','checklist_types'];
begin
  for r in
    select c.relname                              as tabela,
           a.grantor::regrole::text               as concedido_por,
           case when a.grantee = 0 then 'PUBLIC'
                else a.grantee::regrole::text end as para,
           string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(c.relacl) a
     where n.nspname = 'public'
       and c.relname = any(v_todas)
       and (a.grantee = 'anon'::regrole or a.grantee = 0)
       -- o SELECT do anon nos metadados é o estado desejado, não sobra
       and not (c.relname = any(v_metadados)
                and a.grantee = 'anon'::regrole
                and a.privilege_type = 'SELECT')
     group by 1, 2, 3
  loop
    if r.para = 'PUBLIC' then
      insert into _t03c_diag values (
        320, 'PENDENTE', r.tabela,
        format('tem %s para PUBLIC (concedido por %s) — o anon herda. NÃO '
               'revogado aqui: revogar de PUBLIC pode derrubar junto o papel '
               'authenticated. Confira se authenticated tem grant próprio e '
               'revogue à mão: revoke %s on public.%s from public',
               r.privs, r.concedido_por, r.privs, r.tabela));
    else
      insert into _t03c_diag values (
        321, 'PENDENTE', r.tabela,
        format('ainda dá %s ao anon (concedido por %s) DEPOIS do revoke. Se o '
               'grantor não for o papel desta sessão, é preciso uma conexão '
               'com esse papel', r.privs, r.concedido_por));
    end if;
  end loop;
end $$;


-- ============================================================================
-- VERIFICAÇÃO EMBUTIDA
--
-- Nas linhas do bloco VERIFICAÇÃO, `valor` tem de ser igual a `esperado`.
-- Qualquer divergência é falha.
-- Fonte: catálogo e has_table_privilege — que consideram grant direto, grant a
-- PUBLIC e herança de papel. Nada de information_schema (ver cabeçalho).
-- ============================================================================
with alvo(t) as (
  values ('templates'),('users'),('completions'),('photos'),('closures'),
         ('live_tasks'),('recognitions'),('push_subscriptions')
), meta(t) as (
  values ('companies'),('units'),('sectors'),('checklist_types')
), priv(p) as (
  values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),
         ('TRUNCATE'),('REFERENCES'),('TRIGGER')
-- Lista separada, e não um filtro dentro do WHERE: `has_any_column_privilege`
-- só aceita privilégios que existem em coluna e levanta "unrecognized privilege
-- type" nos demais. Como a ordem de avaliação do AND não é garantida, um
-- `and p in (...)` no WHERE não protegeria a chamada.
), priv_col(p) as (
  values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')
), escrita(p) as (
  values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
), reg as (
  select t, to_regclass('public.' || t) as oid from alvo
), reg_meta as (
  select t, to_regclass('public.' || t) as oid from meta
), verif(n, item, valor, esperado) as (

select 0, '0. tabelas do alvo que não existem',
       (select count(*) from reg where oid is null)::text,
       '0'

union all
select 1, '1. privilégios de TABELA do anon nas 8 operacionais',
       (select count(*) from reg, priv
         where reg.oid is not null
           and has_table_privilege('anon'::name, reg.oid, priv.p))::text, '0'

union all
select 2, '2. privilégios de COLUNA do anon nas 8 (só o que não vem da tabela)',
       (select count(*) from reg, priv_col
         where reg.oid is not null
           and has_any_column_privilege('anon'::name, reg.oid, priv_col.p)
           and not has_table_privilege('anon'::name, reg.oid, priv_col.p))::text, '0'

union all
select 3, '3. policies de anon/public nas 8 operacionais',
       (select count(*) from pg_policies
         where schemaname = 'public'
           and tablename in (select t from alvo)
           and ('anon' = any(roles) or 'public' = any(roles)))::text, '0'

union all
select 4, '4. tabelas operacionais com RLS desligado',
       (select count(*) from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relrowsecurity = false
           and c.relname in (select t from alvo))::text, '0'

union all
-- ── metadados: leitura anônima PRECISA continuar, escrita não pode existir ──
-- Checa as DUAS camadas: sem o grant, ou sem a policy de leitura, o anon não lê
-- e a tela de entrada quebra. Se o passo 3 caiu no `exception` por falta de
-- ownership, é esta linha que denuncia.
select 5, '5. metadados sem SELECT para o anon (grant OU policy — tela de entrada)',
       (select count(*) from reg_meta
         where oid is null
            or not has_table_privilege('anon'::name, oid, 'SELECT')
            or not exists (select 1 from pg_policies
                            where schemaname = 'public'
                              and tablename = reg_meta.t
                              and cmd in ('SELECT','ALL')
                              and 'anon' = any(roles)))::text, '0'

union all
select 6, '6. privilégios de ESCRITA do anon nos metadados',
       (select count(*) from reg_meta, escrita
         where reg_meta.oid is not null
           and has_table_privilege('anon'::name, reg_meta.oid, escrita.p))::text, '0'

union all
select 7, '7. policies de anon/public nos metadados além do *_anon_read',
       (select count(*) from pg_policies
         where schemaname = 'public'
           and tablename in (select t from meta)
           and ('anon' = any(roles) or 'public' = any(roles))
           and (cmd <> 'SELECT' or policyname not like '%\_anon\_read'))::text, '0'

union all
-- ── o que NÃO pode ter sumido ───────────────────────────────────────────────
-- `to_regclass` em vez do nome direto: se a tabela não existir,
-- has_table_privilege('anon','public.x',...) LEVANTA ERRO e derruba a
-- verificação inteira. Com to_regclass o resultado vira NULL e aparece como
-- 'TABELA AUSENTE' nesta linha, sem esconder as demais.
select 8, '8. anon consegue INSERT em user_requests (o /cadastro depende)',
       coalesce(has_table_privilege('anon'::name,
                to_regclass('public.user_requests'), 'INSERT')::text,
                'TABELA AUSENTE'), 'true'

union all
select 9, '9. anon consegue INSERT em events (instrumentação pré-login)',
       coalesce(has_table_privilege('anon'::name,
                to_regclass('public.events'), 'INSERT')::text,
                'TABELA AUSENTE'), 'true'

union all
select 10, '10. anon consegue SELECT em company_codes (o /entrar depende)',
       coalesce(has_table_privilege('anon'::name,
                to_regclass('public.company_codes'), 'SELECT')::text,
                'TABELA AUSENTE'), 'true'

union all
-- ── o que nunca pode voltar ─────────────────────────────────────────────────
select 11, '11. anon com SELECT em events ou user_requests',
       (coalesce(has_table_privilege('anon'::name,
                 to_regclass('public.events'), 'SELECT')::int, 0)
      + coalesce(has_table_privilege('anon'::name,
                 to_regclass('public.user_requests'), 'SELECT')::int, 0))::text, '0'

)

-- ── Resultado único: diagnóstico primeiro, verificação depois ───────────────
-- Ler de cima para baixo:
--   ANTES     — o que o anon alcançava quando o script começou
--   PULADA    — tabela do alvo que não existe neste banco
--   ATENÇÃO   — policy `*_anon_legacy` que ainda estava de pé e caiu agora.
--               Cada linha destas é um buraco que esteve aberto até este instante.
--   ok        — a mesma checagem, quando não havia buraco
--   COLUNA    — sobra de grant por coluna que precisou de revoke próprio
--   PENDENTE  — o que este script deliberadamente NÃO revogou, e o que fazer
--   FALHA     — passo que não pôde ser executado (quase sempre falta de ownership)
--   VERIFICAÇÃO — `valor` tem de ser igual a `esperado` em TODAS as linhas
select ord, bloco, item, valor, esperado
  from (
    select ord, bloco, item, detalhe as valor, '' as esperado from _t03c_diag
    union all
    select 500 + n, 'VERIFICAÇÃO', item, valor, esperado from verif
  ) tudo
 order by ord, item;


-- ============================================================================
-- AUDITORIA GERAL — tudo que o anon (ou PUBLIC) alcança em `public`.
-- Roda à parte da verificação acima porque é aberta: varre o schema inteiro em
-- vez de uma lista fixa. É ela que pega tabela criada fora das migrations, ou
-- criada pelo dashboard, que nasceu com ALL para o anon por causa do
-- `alter default privileges` (ver PENDÊNCIA no rodapé).
--
-- A allowlist abaixo é o estado desejado inteiro. NENHUMA linha deve aparecer.
-- ============================================================================
--   select c.relname                                as tabela,
--          a.grantor::regrole::text                 as concedido_por,
--          case when a.grantee = 0 then 'PUBLIC'
--               else a.grantee::regrole::text end   as para,
--          string_agg(a.privilege_type, ', ' order by a.privilege_type) as privs
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--     cross join lateral aclexplode(c.relacl) a
--    where n.nspname = 'public'
--      and c.relkind in ('r','p','v','m')
--      and (a.grantee = 'anon'::regrole or a.grantee = 0)
--      and not (c.relname = 'user_requests' and a.privilege_type = 'INSERT')
--      and not (c.relname = 'events'        and a.privilege_type = 'INSERT')
--      and not (c.relname = 'waitlist'      and a.privilege_type = 'INSERT')
--      and not (c.relname in ('companies','units','sectors','checklist_types',
--                             'company_codes')
--               and a.privilege_type = 'SELECT')
--    group by 1, 2, 3
--    order by 1, 3;
--
-- Suspeita conhecida: `20260710_action_plans.sql` afirma que "o role anon nunca
-- recebe grant — não há nada para a tenant_03 revogar". Isso é falso se o
-- default privilege existir: `action_plans` teria nascido com ALL para o anon e
-- nunca recebeu revoke. A auditoria acima resolve a dúvida.

-- ── VERIFICAÇÃO (b) — as RPCs anônimas continuam SECURITY DEFINER ───────────
-- São elas que sustentam login e cadastro sem grant nenhum. Se alguma aparecer
-- como `invoker`, quebrou junto com este revoke e precisa voltar a definer.
--   select p.proname,
--          case when p.prosecdef then 'definer' else 'INVOKER (!)' end as seguranca
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('public_users','validate_pin','user_request_status',
--                        'create_user_from_request');
--   -- esperado: as quatro como `definer`.

-- ── VERIFICAÇÃO (c) — fim a fim, com a anon key ─────────────────────────────
--   for T in templates users completions photos closures live_tasks \
--            recognitions push_subscriptions; do
--     curl -s "https://rjuulamozdhssgqrzfji.supabase.co/rest/v1/$T?select=id&limit=1" \
--          -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
--   done
--   -- esperado em todas: 42501 "permission denied for table ..."
--      (antes desta migration `users` respondia 42501 pela POLICY; agora
--       responde pelo GRANT, que é a camada de fora)
--
--   curl -s '.../rest/v1/companies?select=id,name&limit=1' -H "apikey: <ANON_KEY>" ...
--   -- esperado: 200 (a tela de entrada continua montando)
--
--   curl -s -X POST '.../rest/v1/rpc/public_users' -H "apikey: <ANON_KEY>" \
--        -H "Authorization: Bearer <ANON_KEY>" \
--        -H 'Content-Type: application/json' -d '{"p_company_id":"ibr"}'
--   -- esperado: 200 com a lista de nomes
--
--   curl -s -X PATCH '.../rest/v1/companies?id=eq.ilhabelarepublic' \
--        -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
--        -H 'Content-Type: application/json' -d '{"name":"x"}'
--   -- esperado: 42501. Se responder 2xx, o passo 2 não valeu.
--
--   E, no navegador: abrir /entrar e logar com PIN; abrir <empresa>/cadastro e
--   enviar uma solicitação. São os dois caminhos anônimos que existem.

-- ============================================================================
-- PENDÊNCIA CONHECIDA — a raiz do problema continua de pé.
--
-- O Supabase mantém, por padrão, um `alter default privileges in schema public
-- grant all on tables to anon`. Toda TABELA NOVA criada em `public` já nasce
-- com ALL para o anon. Enquanto isso não mudar, cada tabela operacional nova
-- precisa de revoke explícito e esta varredura vai precisar rodar de novo.
--
-- Para ver o estado atual:
--   select d.defaclrole::regrole as definido_por, d.defaclobjtype, d.defaclacl
--     from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
--    where n.nspname = 'public';
--
-- Mudar o default é decisão à parte (mexe em convenção do Supabase e afeta toda
-- tabela futura, inclusive as que talvez queiram leitura anônima), por isso NÃO
-- é feito aqui. Fica registrado para virar decisão consciente.
--
-- Cuidado de ordenação para tenant novo: `20260709_authenticated_role_grants.sql`
-- DERIVA os grants de `authenticated` copiando o que o `anon` tem. Rodar esta
-- migration antes daquela, num projeto do zero, deixaria `authenticated` sem
-- nada. Nesta base ela já está aplicada e só concede, nunca revoga — então a
-- ordem aqui é indiferente.
-- ============================================================================
