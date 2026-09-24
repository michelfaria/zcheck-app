-- ============================================================================
-- STORAGE 2/3 — o anon sai de `checklist-photos`.
--
-- ⚠️  NÃO RODAR antes de TODAS as condições abaixo. Rodar cedo não quebra o
--     app novo — quebra o bundle ANTIGO que ainda estiver aberto em algum
--     celular: foto não sobe (fica na fila do aparelho) e relatório mostra
--     "Não foi possível carregar a foto". Nenhum dado se perde, mas a loja vê
--     erro sem entender por quê.
--
--   1. 20260924_storage_01_checklist_photos_tenant.sql aplicada;
--   2. deploy do cliente que usa o storage autenticado (lib/sync.js com
--      `signFirst`/`photoFolder`) EM PRODUÇÃO — conferir pelo bundle servido,
--      não pelo git (ver memória deploy-sai-da-main). `caminho vazio` é texto
--      ASCII que só existe em lib/photoPaths.js; tem de aparecer em um chunk:
--        H=https://ilhabelarepublic.zcheckapp.com
--        for c in $(curl -s $H/app | grep -o '_next/static/chunks/[^"]*\.js' | sort -u); do
--          curl -s "$H/$c" | grep -q -F 'caminho vazio' && echo "$c"; done;
--   3. NENHUM upload do bundle antigo recente. O antigo grava em caminho SEM
--      pasta de empresa; o novo, sempre dentro dela. Rodar e esperar ZERO nas
--      últimas 72 h de operação:
--
--        select count(*) as uploads_bundle_antigo, max(created_at) as ultimo
--          from storage.objects
--         where bucket_id = 'checklist-photos'
--           and created_at > now() - interval '72 hours'
--           and not public.checklist_photos_pasta_de_empresa(name);
--
--      Upload é só metade do tráfego antigo (leitura não deixa rastro no
--      banco), mas é a metade que PERDE dado: se ninguém subiu foto pelo
--      caminho antigo em 72 h de operação, não há bundle antigo em uso;
--   4. inventário e cópia rodados DEPOIS do item 3 (rota /api/admin/storage-
--      migrate, ações `inventariar` e `copiar`) — pega o que os bundles antigos
--      subiram até o fim.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. ROLLBACK no rodapé.
-- ============================================================================

drop policy if exists checklist_photos_anon_transicao_leitura on storage.objects;
drop policy if exists checklist_photos_anon_transicao_envio   on storage.objects;
-- Rede: se alguém recriou a permissiva à mão no dashboard, ela reabriria tudo.
drop policy if exists anon_storage_all on storage.objects;

-- A função só existia para as duas policies acima.
revoke execute on function public.checklist_photos_pasta_de_empresa(text) from anon;


-- ============================================================================
-- VERIFICAÇÃO — `valor` tem de bater com `esperado`.
-- ============================================================================
select 1 as n, 'policies de anon/public que alcançam checklist-photos' as item,
       (select count(*) from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and ('anon' = any(roles) or 'public' = any(roles))
           -- policy sem filtro de bucket também alcança checklist-photos
           and (coalesce(qual, '') || coalesce(with_check, '')) not similar to
               '%bucket_id = ''(colaboradores|company-logos|user-avatars)''::text%')::text as valor,
       '0' as esperado
union all
select 2, 'anon executa pasta_de_empresa',
       has_function_privilege('anon', 'public.checklist_photos_pasta_de_empresa(text)', 'EXECUTE')::text,
       'false'
union all
select 3, 'policies de checklist-photos para authenticated',
       (select count(*) from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname like 'checklist_photos_%' and 'authenticated' = any(roles))::text,
       '4 (3 se a 03 já rodou)'
order by n;

-- Fim a fim, com a anon key (troque <ANON_KEY>): tem de voltar LISTA VAZIA.
--   curl -s -X POST 'https://rjuulamozdhssgqrzfji.supabase.co/storage/v1/object/list/checklist-photos' \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
--     -H 'Content-Type: application/json' -d '{"prefix":"","limit":5}'
-- E no app, logado: relatório com foto abre; checklist com foto sobe.


-- ============================================================================
-- ROLLBACK — se um bundle antigo relevante aparecer depois (loja offline há
-- dias, por exemplo). Volta ao estado da 01, que já não deixa o anon apagar,
-- mover nem entrar em pasta de empresa:
--
--   grant execute on function public.checklist_photos_pasta_de_empresa(text) to anon;
--   create policy checklist_photos_anon_transicao_leitura on storage.objects
--     for select to anon
--     using (bucket_id = 'checklist-photos'
--            and not public.checklist_photos_pasta_de_empresa(name));
--   create policy checklist_photos_anon_transicao_envio on storage.objects
--     for insert to anon
--     with check (bucket_id = 'checklist-photos'
--                 and not public.checklist_photos_pasta_de_empresa(name));
-- ============================================================================
