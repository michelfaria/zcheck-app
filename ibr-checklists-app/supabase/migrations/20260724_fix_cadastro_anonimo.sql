-- ============================================================================
-- 20260724_fix_cadastro_anonimo.sql
--
-- Conserta o /cadastro, que estava 100% quebrado: qualquer tentativa terminava
-- em "Erro ao enviar. Verifique sua conexão e tente novamente." (mensagem
-- genérica — não era conexão).
--
-- Diagnosticado em 24/07/2026 sondando produção com a anon key. Dois bloqueios
-- independentes, em sequência:
--
--   (1) UPLOAD DA SELFIE — storage.objects recusa o insert:
--         {"statusCode":"403","message":"new row violates row-level security policy"}
--       A migration 20260709_private_selfie_bucket.sql fechou o bucket
--       `colaboradores` e criou política de SELECT para anon, mas nenhuma de
--       INSERT. Enquanto o bucket era público havia política permissiva; ao
--       privatizar, a escrita anônima morreu junto. O colaborador que se
--       cadastra ainda não tem conta, então o upload é necessariamente anônimo.
--
--   (2) INSERT EM user_requests — mesmo com a selfie resolvida, quebraria em:
--         23502: null value in column "unit_id" violates not-null constraint
--       O /cadastro manda `unit_id: null` de propósito: quem escolhe a loja é a
--       gestão, na aprovação. A coluna ficou NOT NULL de quando o formulário
--       ainda pedia a loja.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente — pode rodar mais de uma vez.
-- ============================================================================


-- ── (1) Escrita anônima da selfie, restrita ao bucket ───────────────────────
-- Só INSERT, só neste bucket. Sem UPDATE e sem DELETE: quem sobe não pode
-- trocar nem apagar a foto de ninguém (inclusive a própria — a aprovação
-- precisa ver o que foi enviado no ato do cadastro).
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'colaboradores_anon_insert'
  ) then
    create policy colaboradores_anon_insert
      on storage.objects for insert
      to anon
      with check (bucket_id = 'colaboradores');
  end if;
end $$;

-- Contenção de abuso: com INSERT anônimo liberado, qualquer um com a anon key
-- do bundle pode subir arquivo. Limitar tamanho e tipo transforma "storage
-- grátis para qualquer binário" em "algumas fotos" — o teto de 5 MB cobre
-- selfie de celular com folga.
update storage.buckets
   set file_size_limit   = 5242880,  -- 5 MB
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic']
 where id = 'colaboradores';


-- ── (2) unit_id passa a aceitar nulo ───────────────────────────────────────
-- A loja é atribuída na aprovação (RPC create_user_from_request recebe
-- p_unit_id da tela de gestão), não no cadastro.
alter table public.user_requests alter column unit_id drop not null;


-- ── (3) Limpeza da sondagem de diagnóstico ─────────────────────────────────
-- Para confirmar que não havia um TERCEIRO bloqueio depois destes dois, o
-- insert foi testado direto contra produção em 24/07/2026. O teste passou
-- (HTTP 201), o que provou o diagnóstico e, de quebra, deixou uma solicitação
-- falsa na fila da gestão. O anon não tem DELETE (correto), então ela sai aqui.
delete from public.user_requests
 where name = '__PROBE__' and cpf = '00000000000' and email = 'probe@example.invalid';


-- ============================================================================
-- VERIFICAÇÃO — rodar depois de aplicar.
--
-- (a) A política de insert existe e o bucket ficou limitado:
--
--   select policyname, cmd, roles from pg_policies
--    where schemaname='storage' and tablename='objects'
--      and policyname like 'colaboradores%';
--   -- esperado: colaboradores_signed_read (SELECT) e
--   --           colaboradores_anon_insert (INSERT), ambas para {anon}
--
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id='colaboradores';
--   -- esperado: public=false, 5242880, {image/jpeg,image/png,image/webp,image/heic}
--
-- (b) unit_id aceita nulo:
--
--   select is_nullable from information_schema.columns
--    where table_schema='public' and table_name='user_requests'
--      and column_name='unit_id';
--   -- esperado: YES
--
-- (c) Fim a fim: abrir <empresa>.zcheckapp.com/cadastro, preencher e enviar.
--     Deve chegar na tela de sucesso, e a solicitação aparecer em Usuários
--     para a gestão aprovar, com a selfie visível.
-- ============================================================================
