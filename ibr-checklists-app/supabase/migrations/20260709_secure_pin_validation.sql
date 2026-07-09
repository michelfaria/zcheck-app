-- ============================================================================
-- 20260709_secure_pin_validation.sql
--
-- Corrige vulnerabilidade: a anon key (embutida no bundle JS) conseguia ler a
-- coluna `pin` de TODOS os usuários via `select ... pin ...` na tabela `users`.
--
-- Correção:
--   1. RPC `validate_pin(user_id, pin)` SECURITY DEFINER — compara o PIN
--      server-side, aplica o rate-limit e devolve o usuário SEM o PIN.
--   2. Remove o privilégio de SELECT da coluna `pin` para os papéis anon /
--      authenticated (revoga o SELECT da tabela e re-concede coluna a coluna,
--      exceto `pin` — porque um GRANT no nível da tabela cobre todas as colunas
--      e sobrepõe um REVOKE de coluna isolado).
--   3. Torna a tabela `login_attempts` à prova de adulteração: só a RPC escreve.
--
-- Rode este arquivo inteiro no Supabase SQL Editor (projeto rjuulamozdhssgqrzfji).
-- É idempotente — pode rodar mais de uma vez sem problema.
-- ============================================================================


-- ── (1) Diagnóstico ANTES de aplicar (opcional — rode e leia o resultado) ────
-- Descomente para inspecionar o estado atual das políticas e privilégios:
--
--   -- Políticas RLS da tabela users:
--   select policyname, cmd, roles, qual, with_check
--   from pg_policies where schemaname = 'public' and tablename = 'users';
--
--   -- Privilégios de coluna de anon/authenticated em users (procure por 'pin'):
--   select grantee, column_name, privilege_type
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'users'
--     and grantee in ('anon', 'authenticated')
--   order by grantee, column_name;
--
--   -- Privilégios de tabela (SELECT no nível da tabela cobre a coluna pin):
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'users'
--     and grantee in ('anon', 'authenticated');
--
-- Se aparecer `anon | SELECT` no nível da tabela (ou `anon | pin | SELECT` no
-- nível da coluna), então SIM: qualquer um com a anon key lê os PINs. É o bug.


-- ── (2) RPC de validação de PIN (server-side) ───────────────────────────────
create or replace function public.validate_pin(p_user_id text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user       public.users%rowtype;
  v_fail_count integer;
begin
  -- Rate-limit: 5+ tentativas falhas nos últimos 10 minutos => bloqueia.
  select count(*) into v_fail_count
  from public.login_attempts
  where user_id = p_user_id
    and success = false
    and attempted_at >= now() - interval '10 minutes';

  if v_fail_count >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select * into v_user from public.users where id = p_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Comparação do PIN acontece aqui dentro; o PIN nunca sai do servidor.
  if v_user.pin is distinct from p_pin then
    insert into public.login_attempts (user_id, success) values (p_user_id, false);
    return jsonb_build_object('ok', false, 'reason', 'wrong_pin');
  end if;

  insert into public.login_attempts (user_id, success) values (p_user_id, true);

  -- Devolve o objeto de usuário SEM o PIN, já no formato camelCase que o app usa.
  return jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id',        v_user.id,
      'name',      v_user.name,
      'role',      v_user.role,
      'unitId',    v_user.unit_id,
      'sectorId',  v_user.sector_id,
      'companyId', coalesce(v_user.company_id, 'ibr'),
      'suspended', coalesce(v_user.suspended, false)
    )
  );
end;
$$;

-- Só anon/authenticated podem executar (funções nascem com EXECUTE p/ public).
revoke all on function public.validate_pin(text, text) from public;
grant execute on function public.validate_pin(text, text) to anon, authenticated;


-- ── (3) Bloqueia a leitura da coluna `pin` pelo anon ────────────────────────
-- Um GRANT SELECT no nível da tabela cobre TODAS as colunas e não pode ser
-- "furado" por um REVOKE de coluna. Então: revoga a tabela e re-concede apenas
-- as colunas seguras (tudo menos `pin`). INSERT/UPDATE ficam intactos — dá pra
-- DEFINIR um PIN (cadastro/onboarding/edição), mas não LER.
revoke select on public.users from anon, authenticated;

-- Colunas conferidas contra o schema real (information_schema.column_privileges):
-- id, name, role, unit_id, sector_id, company_id, suspended, created_at,
-- updated_at, pin. Reconcedemos todas menos `pin`.
grant select
  (id, name, role, unit_id, sector_id, company_id, suspended, created_at, updated_at)
  on public.users to anon, authenticated;


-- ── (4) Rate-limit à prova de adulteração ───────────────────────────────────
-- Agora só a RPC (SECURITY DEFINER) escreve/lê login_attempts. Sem isto, um
-- atacante com a anon key poderia inserir linhas `success=true` falsas ou
-- inflar o contador de outro usuário.
revoke all on public.login_attempts from anon, authenticated;


-- ── (5) Verificação DEPOIS de aplicar ───────────────────────────────────────
-- Rode como anon para confirmar que o PIN não vaza mais. No SQL Editor:
--
--   set role anon;
--   select pin from public.users limit 1;   -- deve dar: permission denied for table users / column pin
--   select id, name from public.users limit 1; -- deve funcionar
--   select public.validate_pin('u1', '1234'); -- deve devolver jsonb {ok:...}
--   reset role;
--
-- Ou, do lado do cliente, com a anon key:
--   supabase.from('users').select('pin')      -> erro 42501 (permission denied)
--   supabase.rpc('validate_pin', { p_user_id, p_pin }) -> { ok, ... }
