-- ============================================================================
-- Torna o bucket `colaboradores` privado.
--
-- Contexto: o bucket guarda a selfie enviada no /cadastro, e até esta migration
-- era PÚBLICO. O nome do objeto era `Date.now()-<cpf>.jpg`, então quem soubesse
-- o CPF precisava adivinhar apenas o timestamp em milissegundos para baixar a
-- foto do rosto da pessoa. Biometria facial vinculada a CPF, exposta na internet.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
--
-- ORDEM IMPORTA. Faça o deploy do código antes de rodar isto:
--   1. Deploy do commit que remove o fallback `getPublicUrl` do SelfieViewer
--      (app/app/page.js) — sem ele, a tela de aprovação usa URL assinada.
--   2. Rodar esta migration.
-- Invertida, a tela de aprovação fica sem selfie até o deploy sair.
-- ============================================================================

-- 1. Fecha o bucket. URLs /object/public/colaboradores/* param de responder.
update storage.buckets
   set public = false
 where id = 'colaboradores';

-- 2. Garante que a leitura por URL assinada continua funcionando.
--    (verificado em 09/07/2026: o role anon já passa na checagem de permissão,
--    então esta policy provavelmente já existe sob outro nome — o `if not exists`
--    do bloco abaixo evita erro em caso de duplicidade.)
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage'
       and tablename  = 'objects'
       and policyname = 'colaboradores_signed_read'
  ) then
    create policy colaboradores_signed_read
      on storage.objects for select
      to anon
      using (bucket_id = 'colaboradores');
  end if;
end $$;

-- ============================================================================
-- VERIFICAÇÃO — rodar depois de aplicar.
--
-- (a) O bucket deve estar privado:
--
--   select id, public from storage.buckets where id = 'colaboradores';
--   -- esperado: public = false
--
-- (b) Do terminal, a URL pública deve deixar de resolver.
--     Antes desta migration respondia "Object not found" (bucket público);
--     depois deve responder "Bucket not found":
--
--   curl -s https://rjuulamozdhssgqrzfji.supabase.co/storage/v1/object/public/colaboradores/x.jpg
--   -- esperado: {"error":"Bucket not found"}
--
-- (c) A URL assinada deve continuar funcionando — abrir a tela de aprovação de
--     um cadastro pendente e confirmar que a selfie carrega.
-- ============================================================================

-- ============================================================================
-- PENDÊNCIA NÃO RESOLVIDA POR ESTA MIGRATION
--
-- Os objetos JÁ existentes continuam com o CPF no nome do arquivo. Fechar o
-- bucket tira eles da internet pública, mas o CPF segue no path, legível por
-- qualquer um que consiga listar o bucket. Renomear os objetos antigos para
-- UUID (e atualizar `user_requests.selfie_path`) é trabalho separado.
--
-- Além disso, hoje o role `anon` pode assinar URL de QUALQUER objeto do bucket
-- se souber o path. Isso deixa de ser um problema quando a assinatura passar a
-- ser feita no servidor, atrás de autenticação de gestão — ver a frente de
-- auth de servidor (JWT com claim company_id).
-- ============================================================================
