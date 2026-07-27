-- ============================================================================
-- TENANT 3e — fecha `create_user_from_request`, que era escalada de privilégio
-- alcançável com a anon key.
--
-- ── O que estava aberto (confirmado em produção, 26/07/2026) ────────────────
-- `has_function_privilege('anon', 'create_user_from_request', 'EXECUTE')` = true.
--
-- A função é `security definer` — roda como dona, ignora RLS — e não validava
-- NADA sobre quem chamava. Ela termina em:
--
--     insert into public.users (id, name, pin, role, unit_id, sector_id, ...)
--     values (p_user_id, p_name, v_pin, p_role, ...)
--     on conflict (id) do update set ..., pin = excluded.pin, role = excluded.role
--
-- Quem chama escolhe `id`, `pin` e `role`, e o ON CONFLICT SOBRESCREVE o PIN e o
-- papel de um usuário que já existe.
--
-- O caminho completo, só com a chave que vai no bundle:
--   1. POST /rest/v1/user_requests com um `id` escolhido por quem ataca e um
--      `pin` qualquer — o `anon` tem INSERT nessa tabela por design (/cadastro);
--   2. POST /rest/v1/rpc/create_user_from_request com esse `id`, o `id` de um
--      usuário existente, `p_role = 'gestao'` e o PIN desejado;
--   3. entrar pelo /entrar com esse PIN.
--
-- Resultado: tomada de qualquer conta, ou uma diretoria nova em qualquer
-- empresa. É a falha mais grave encontrada nesta varredura.
--
-- ── A raiz ─────────────────────────────────────────────────────────────────
-- O mesmo `alter default privileges` das tabelas vale para FUNÇÕES:
-- `anon=X/postgres` em `defaclobjtype = 'f'`. Toda função nova em `public`
-- nasce executável pelo `anon`, e só não fica exposta quem recebe revoke
-- explícito. `review_completion`, `review_tasks`, `provision_company` e
-- `admin_delete_company` receberam; esta não.
--
-- ── Dois problemas, não um ─────────────────────────────────────────────────
-- Tirar o `anon` fecha o ataque anônimo, mas não o outro: sem checagem de
-- papel, QUALQUER usuário autenticado — um colaborador comum — também podia
-- chamar a função e se promover a diretoria. Por isso a migration faz as duas
-- coisas: endurece a função E corrige o grant.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente.
-- Pré-requisitos: 20260709_tenant_01_company_id (jwt_company_id, jwt_user_role),
--                 20260724_fix_aprovacao_uuid (versão atual da função).
-- ============================================================================


-- ── (1) A função, com autorização e escopo de empresa ───────────────────────
-- Mesma assinatura e mesmo contrato de retorno: o cliente
-- (app/app/page.js, aprovação de solicitação) não muda.
create or replace function public.create_user_from_request(
  p_request_id text,
  p_user_id    text,
  p_name       text,
  p_role       text,
  p_unit_id    text,
  p_sector_id  text,
  p_pin        text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pin     text;
  v_role    text := public.jwt_user_role();
  v_company text := public.jwt_company_id();
begin
  if v_company is null then
    raise exception 'sem sessão válida';
  end if;

  -- Aprovar cadastro é ato de gestão. A tela já só aparece para diretoria;
  -- aqui a regra passa a valer no banco, que é onde ela não depende da UI.
  if v_role not in ('gerencia', 'gestao') then
    raise exception 'apenas gerência ou diretoria podem aprovar cadastro';
  end if;

  -- Ninguém cria alguém acima de si. Sem isto, uma gerência se promoveria a
  -- diretoria aprovando uma solicitação qualquer.
  if p_role = 'gestao' and v_role <> 'gestao' then
    raise exception 'apenas a diretoria pode criar outra diretoria';
  end if;

  -- A solicitação tem de ser da MESMA empresa de quem aprova. É o que impede
  -- aprovar cadastro de outro tenant — a função é security definer, então o
  -- RLS não se aplica aqui dentro.
  select coalesce(nullif(p_pin, ''), pin) into v_pin
    from public.user_requests
   where id::text = p_request_id
     and company_id = v_company;

  if v_pin is null then
    raise exception 'solicitação % não encontrada no escopo da sua empresa', p_request_id;
  end if;

  -- E não deixa TOCAR num usuário de outra empresa. Era por aqui que o
  -- `on conflict` virava sobrescrita de PIN alheio. Erro explícito em vez de
  -- um `where` no ON CONFLICT, que falharia calado.
  if exists (
    select 1 from public.users u
     where u.id = p_user_id
       and u.company_id is distinct from v_company
  ) then
    raise exception 'usuário % pertence a outra empresa', p_user_id;
  end if;

  -- `company_id` entra no insert — a versão anterior não gravava, e usuário
  -- aprovado nascia sem empresa.
  insert into public.users (id, company_id, name, pin, role, unit_id, sector_id, suspended, updated_at)
  values (p_user_id, v_company, p_name, v_pin, p_role, p_unit_id, p_sector_id, false, now())
  on conflict (id) do update
    set name       = excluded.name,
        pin        = excluded.pin,
        role       = excluded.role,
        unit_id    = excluded.unit_id,
        sector_id  = excluded.sector_id,
        updated_at = now();
end;
$$;


-- ── (2) Fora do alcance anônimo ─────────────────────────────────────────────
-- O app chama esta RPC com `authedSupabase()` (role `authenticated`), no fluxo
-- de aprovação da diretoria. Nenhum caminho anônimo a usa — tirar o `anon` não
-- quebra nada.
revoke all on function public.create_user_from_request(text, text, text, text, text, text, text) from anon;
revoke all on function public.create_user_from_request(text, text, text, text, text, text, text) from public;
grant execute on function public.create_user_from_request(text, text, text, text, text, text, text) to authenticated;


-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) O anon perdeu o EXECUTE, o authenticated manteve:
--   select has_function_privilege('anon', p.oid, 'EXECUTE')          as anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as autenticado
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'create_user_from_request';
--   -- esperado: false | true
--
-- (b) A varredura de TODAS as security definer, que é como este problema
--     apareceu. As `true` que restarem têm de ser conscientes:
--   select p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_executa
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.prosecdef
--    order by 2 desc, 1;
--   -- em 26/07 continuam `true`, e são os caminhos anônimos legítimos:
--   --   company_is_active · public_users · user_request_status ·
--   --   validate_pin · validate_user_pin · delete_push_subscription ·
--   --   user_requests_set_company (função de trigger; não é chamável direto)
--
-- (c) Fim a fim, no app: diretoria → Usuários → aprovar uma solicitação
--     pendente. Tem de continuar funcionando igual, com o PIN copiado.
--     E, com um token de COLABORADOR, a mesma RPC tem de responder
--     'apenas gerência ou diretoria podem aprovar cadastro'.
--
-- ── FICA PENDENTE, e não é desta migration ─────────────────────────────────
-- `delete_push_subscription` e `validate_pin`/`validate_user_pin` seguem
-- executáveis pelo anon — as duas últimas por necessidade, já que é assim que o
-- login acontece. Vale revisar se `validate_pin` tem alguma contenção contra
-- tentativa em massa: um PIN de 4 dígitos sem limite de tentativa é 10.000
-- chamadas. É trabalho à parte, com decisão de produto junto.
-- ============================================================================
