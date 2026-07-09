-- ============================================================================
-- 20260709_secure_user_requests.sql
--
-- Mesma classe de vulnerabilidade já corrigida em `users`
-- (ver 20260709_secure_pin_validation.sql), agora na tabela `user_requests`.
--
-- O `/cadastro` insere o PIN escolhido em texto plano em `user_requests.pin`.
-- A tela de gestão fazia `select('*')` com a anon key (embutida no bundle JS),
-- então qualquer um com a anon key conseguia ler os PINs de todos os cadastros
-- pendentes.
--
-- Correção:
--   1. Remove o privilégio de SELECT da coluna `pin` para anon / authenticated
--      (revoga o SELECT da tabela e re-concede coluna a coluna, exceto `pin` —
--      um GRANT no nível da tabela cobre todas as colunas e sobrepõe um REVOKE
--      de coluna isolado). INSERT continua intacto, então o cadastro segue
--      gravando o PIN normalmente.
--   2. RPC `create_user_from_request(...)` SECURITY DEFINER — na aprovação, cria
--      o usuário em `users` copiando o PIN da solicitação server-side (a gestão
--      não lê mais o PIN em lugar nenhum; ele nunca volta ao bundle).
--
-- Rode este arquivo inteiro no Supabase SQL Editor (projeto rjuulamozdhssgqrzfji).
-- É idempotente — pode rodar mais de uma vez sem problema.
-- ============================================================================


-- ── (1) Diagnóstico ANTES de aplicar (opcional — rode e leia o resultado) ────
-- Descomente para inspecionar os privilégios atuais:
--
--   -- Privilégios de coluna de anon/authenticated (procure por 'pin'):
--   select grantee, column_name, privilege_type
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'user_requests'
--     and grantee in ('anon', 'authenticated')
--   order by grantee, column_name;
--
--   -- Privilégios de tabela (SELECT no nível da tabela cobre a coluna pin):
--   select grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'user_requests'
--     and grantee in ('anon', 'authenticated');
--
-- Se aparecer `anon | SELECT` no nível da tabela (ou `anon | pin | SELECT` no
-- nível da coluna), então SIM: qualquer um com a anon key lê os PINs.


-- ── (2) Bloqueia a leitura da coluna `pin` pelo anon ────────────────────────
-- Um GRANT SELECT no nível da tabela cobre TODAS as colunas e não pode ser
-- "furado" por um REVOKE de coluna. Então: revoga a tabela e re-concede apenas
-- as colunas seguras (tudo menos `pin`). INSERT/UPDATE ficam intactos — dá pra
-- DEFINIR o PIN (cadastro), mas não LER.
revoke select on public.user_requests from anon, authenticated;

grant select
  (id, name, cpf, phone, email, unit_id, selfie_path, status, note,
   role, sector_id, created_at, reviewed_at, reviewed_by)
  on public.user_requests to anon, authenticated;

-- Nota: se a tabela `user_requests` tiver outras colunas não-sensíveis que o
-- app leia, acrescente-as na lista acima. `pin` deve ficar de fora.


-- ── (3) RPC que copia o PIN da solicitação para o novo usuário ──────────────
-- Roda na aprovação. Como o anon não lê mais `user_requests.pin`, esta função
-- (SECURITY DEFINER) é quem lê o PIN server-side e cria/atualiza a linha em
-- `users`. Se `p_pin` vier preenchido (gestão digitou um PIN novo no modal de
-- aprovação), ele substitui o PIN da solicitação; senão usa o PIN gravado.
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
  select coalesce(nullif(p_pin, ''), pin) into v_pin
  from public.user_requests
  where id = p_request_id;

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

-- Só anon/authenticated podem executar (funções nascem com EXECUTE p/ public).
revoke all on function
  public.create_user_from_request(text, text, text, text, text, text, text)
  from public;
grant execute on function
  public.create_user_from_request(text, text, text, text, text, text, text)
  to anon, authenticated;


-- ── (4) Verificação DEPOIS de aplicar ───────────────────────────────────────
--   set role anon;
--   select pin from public.user_requests limit 1;     -- deve dar: permission denied
--   select id, name, status from public.user_requests limit 1; -- deve funcionar
--   reset role;
--
-- Do lado do cliente, com a anon key:
--   supabase.from('user_requests').select('pin')  -> erro 42501 (permission denied)
--
-- Resíduo conhecido (idêntico ao aceito em `users`): o anon ainda tem
-- INSERT/UPDATE na coluna `pin` (necessário para o cadastro gravar o PIN). Um
-- atacante com a anon key poderia SOBRESCREVER um PIN, mas não LÊ-LO — o modelo
-- de ameaça aqui é confidencialidade do PIN. Endurecer a escrita (via RPC de
-- cadastro) fica como melhoria futura.
