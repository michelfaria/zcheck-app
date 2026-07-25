-- ============================================================================
-- 20260724_fix_aprovacao_uuid.sql
--
-- Aprovar colaborador novo NUNCA funcionou. Sintoma relatado em 24/07/2026: a
-- solicitação da Carla (ibr-sivi26) foi aprovada pela gestão, mas o nome não
-- apareceu na lista de login.
--
-- Causa: `create_user_from_request` (criada em 20260709_secure_user_requests.sql)
-- declara `p_request_id text`, mas `user_requests.id` é **uuid**. O
-- `where id = p_request_id` nem chega a executar:
--
--   42883: operator does not exist: uuid = text
--
-- A função aborta, nenhum usuário é criado — e como o cliente não checava o
-- erro da RPC, o fluxo seguia e marcava a solicitação como 'aprovado'. Ficava
-- aprovado sem existir em `users`, logo fora de public_users() e da tela de
-- login. (O cliente passou a checar o erro no mesmo commit desta migration.)
--
-- Correção: comparar como texto (`id::text = p_request_id`), que funciona com a
-- coluna sendo uuid ou text. A assinatura não muda, então o GRANT existente e a
-- chamada do cliente continuam válidos.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente.
-- ============================================================================

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
  v_pin text;
begin
  -- id::text: `user_requests.id` é uuid e o parâmetro é text. Comparar como
  -- texto vale para os dois tipos e não depende de p_request_id ser um uuid
  -- sintaticamente válido (um cast p_request_id::uuid lançaria 22P02).
  select coalesce(nullif(p_pin, ''), pin) into v_pin
  from public.user_requests
  where id::text = p_request_id;

  if v_pin is null then
    raise exception 'user_request % nao encontrada ou sem PIN', p_request_id;
  end if;

  insert into public.users (id, name, pin, role, unit_id, sector_id, suspended, updated_at)
  values (p_user_id, p_name, v_pin, p_role, p_unit_id, p_sector_id, false, now())
  on conflict (id) do update
    set name       = excluded.name,
        pin        = excluded.pin,
        role       = excluded.role,
        unit_id    = excluded.unit_id,
        sector_id  = excluded.sector_id,
        updated_at = now();
end;
$$;

revoke all on function
  public.create_user_from_request(text, text, text, text, text, text, text)
  from public;
grant execute on function
  public.create_user_from_request(text, text, text, text, text, text, text)
  to anon, authenticated;


-- ── Reparo: devolve à fila quem foi "aprovado" sem virar usuário ───────────
-- Toda aprovação de colaborador desde 09/07/2026 caiu neste bug. As pessoas
-- ficaram com a solicitação em 'aprovado' e sem linha em `users`, então não
-- aparecem para reaprovar nem para logar. Voltam para 'pendente' e a gestão
-- aprova de novo — o PIN que a pessoa escolheu continua guardado na própria
-- solicitação, então ela não precisa se cadastrar outra vez.
update public.user_requests r
   set status = 'pendente', reviewed_at = null, reviewed_by = null
 where r.status = 'aprovado'
   and not exists (
     select 1 from public.users u
      where u.name = r.name
        and u.company_id is not distinct from r.company_id
   );


-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) A função não estoura mais no uuid = text. Com um id inexistente ela deve
--     responder a EXCEÇÃO DE NEGÓCIO (não 42883):
--
--   select public.create_user_from_request('__nao_existe__','x','x','colaborador',null,null,null);
--   -- esperado: ERROR: user_request __nao_existe__ nao encontrada ou sem PIN
--   -- (antes: ERROR 42883 operator does not exist: uuid = text)
--
-- (b) Quem voltou para a fila:
--
--   select name, status, created_at from public.user_requests
--    where status = 'pendente' order by created_at;
--
-- (c) Fim a fim: aprovar a Carla de novo na aba Usuários e conferir que o nome
--     passa a aparecer na lista suspensa de login.
-- ============================================================================
