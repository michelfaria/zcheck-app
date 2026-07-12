-- ============================================================================
-- Cura fotos de evidência presas com company_id NULL.
--
-- Contexto (11/07/2026): a tenant_01 fez o backfill de photos.company_id a
-- partir das completions. Mas fotos enviadas DEPOIS dela e ANTES do deploy do
-- cliente que carrega o token (janela de algumas horas) gravaram company_id
-- pelo DEFAULT jwt_company_id() — que, sem token (bundle antigo, cliente anon),
-- resolve NULL. Resultado: o RLS (`company_id = jwt_company_id()`) esconde essas
-- fotos, e o gestor vê "Não foi possível carregar a foto" ao clicar no item.
--
-- Este backfill repete a derivação a partir da completion. Idempotente.
-- ============================================================================

update public.photos p
   set company_id = co.company_id
  from public.completions co
 where co.id = p.completion_id
   and p.company_id is null
   and co.company_id is not null;

-- VERIFICAÇÃO — o resultado exibido deve ser 0.
select count(*) as fotos_ainda_sem_company_id
  from public.photos
 where company_id is null;
