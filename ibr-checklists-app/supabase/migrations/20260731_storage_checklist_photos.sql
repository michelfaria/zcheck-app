-- ============================================================================
-- Storage — fecha o `anon_storage_all` e dá política própria a `checklist-photos`.
--
-- ── O problema ──────────────────────────────────────────────────────────────
-- A política `anon_storage_all` (criada à mão no dashboard, nunca versionada) é:
--
--     for all to anon using (true) with check (true)
--
-- SEM filtro de `bucket_id`. Ou seja: a anon key — que é pública por construção
-- e vai no bundle do app, em `lib/supabase.js` deste repositório público — lê,
-- escreve e APAGA qualquer objeto de QUALQUER bucket. Inclusive `colaboradores`,
-- que guarda selfie e documento de CPF dos cadastros. As políticas específicas
-- de cada bucket (colaboradores_signed_read etc.) viraram decoração: uma
-- política permissiva a mais só soma permissão, nunca subtrai.
--
-- Foi encontrada em 31/07/2026, ao investigar as fotos que não abriam.
--
-- ── Por que isto não pode ser um `drop policy` e pronto ─────────────────────
-- O cliente lê e escreve `checklist-photos` pelo cliente ANÔNIMO (`supabase`),
-- não pelo autenticado (`db()`) — ver `getPhotoUrl`/`pushPhoto` em lib/sync.js.
-- Derrubar a política sem mais nada faria TODAS as fotos pararem de abrir de uma
-- vez, e sem erro visível: `getPhotoUrl` cai no cache local e devolve null, que
-- a tela mostra como "Não foi possível carregar a foto".
--
-- Então esta migration é ADITIVA e faz só a parte segura:
--
--   (1) cria as políticas de `checklist-photos` para `authenticated`;
--   (2) restringe `anon_storage_all` a `checklist-photos` — o que tira o anon de
--       `colaboradores` sem tocar no caminho que o app usa hoje.
--
--   (3) a revogação final do anon em `checklist-photos` fica COMENTADA no fim,
--       para rodar depois do deploy do cliente que lê storage autenticado.
--
-- ── O que continua funcionando depois de (2) ────────────────────────────────
--   · selfie do /cadastro (anon):  colaboradores_anon_insert   — política própria
--   · leitura de selfie:           colaboradores_signed_read   — política própria
--   · logo da empresa e avatar:    já sobem por `db()` (authenticated)
--
-- ADITIVA. Rodar no SQL Editor do Supabase (projeto rjuulamozdhssgqrzfji).
-- ============================================================================

-- ── 1. checklist-photos para sessões autenticadas ────────────────────────────
-- Escopo por bucket, não por empresa: o nome do objeto é o id da conclusão, e
-- não há como derivar o tenant do caminho sem um join que o storage não faz. O
-- isolamento real está em `public.photos` (RLS por company_id), que é por onde
-- o caminho do arquivo é descoberto — sem a linha, não se sabe o que assinar.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'checklist_photos_authenticated_read'
  ) then
    create policy checklist_photos_authenticated_read
      on storage.objects for select
      to authenticated
      using (bucket_id = 'checklist-photos');
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'checklist_photos_authenticated_insert'
  ) then
    create policy checklist_photos_authenticated_insert
      on storage.objects for insert
      to authenticated
      with check (bucket_id = 'checklist-photos');
  end if;

  -- O upload usa `upsert: true` (retentar a fila precisa ser barato), e um
  -- upsert em objeto existente é UPDATE.
  if not exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'checklist_photos_authenticated_update'
  ) then
    create policy checklist_photos_authenticated_update
      on storage.objects for update
      to authenticated
      using      (bucket_id = 'checklist-photos')
      with check (bucket_id = 'checklist-photos');
  end if;
end $$;

-- ── 2. Tira o anon de todos os outros buckets ────────────────────────────────
-- Recria `anon_storage_all` com o mesmo nome e o mesmo poder, só que confinada
-- ao bucket que o cliente anônimo de fato usa hoje.
drop policy if exists anon_storage_all on storage.objects;
create policy anon_storage_all
  on storage.objects for all
  to anon
  using      (bucket_id = 'checklist-photos')
  with check (bucket_id = 'checklist-photos');

-- ============================================================================
-- ── 3. PASSO SEGUINTE, NÃO RODAR AINDA ──────────────────────────────────────
--
-- Depois que o cliente passar a ler/escrever `checklist-photos` por `db()` (o
-- cliente autenticado) e esse deploy estiver em produção, o anon sai do storage
-- por completo:
--
--   drop policy if exists anon_storage_all on storage.objects;
--
-- Rodar isto ANTES do deploy quebra a exibição de todas as fotos.
--
-- ── VERIFICAÇÃO ─────────────────────────────────────────────────────────────
--
--   select policyname, roles, cmd, qual
--     from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--    order by policyname;
--
-- Esperado: `anon_storage_all` com qual contendo bucket_id = 'checklist-photos',
-- e as três `checklist_photos_authenticated_*` presentes.
--
-- Fim a fim, com um token real emitido por /api/auth/session: abrir um relatório
-- com foto e conferir que a imagem carrega; e no /cadastro, enviar uma selfie.
--
-- ── PENDÊNCIA CONHECIDA, FORA DESTE ESCOPO ──────────────────────────────────
-- `colaboradores_signed_read` dá SELECT a `anon` no bucket das selfies. É o
-- desenho atual da leitura por URL assinada, mas significa que a anon key lê
-- qualquer selfie/CPF de qualquer empresa. Merece correção própria: assinar a
-- URL no servidor, com service_role, e nunca no cliente.
-- ============================================================================
