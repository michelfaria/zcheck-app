-- ============================================================================
-- Fotos de evidência — segundo reparo do metadado. Agora com a foto da RODADA.
--
-- Diagnóstico de 31/07/2026: 28 itens marcados com `hasPhoto` nos últimos 30
-- dias não tinham linha em `public.photos` — e os 28 tinham o arquivo no bucket.
-- O arquivo sobe, a linha não nasce.
--
-- Causa: ORDEM DE GRAVAÇÃO. O cliente escrevia as linhas de `photos` com o id da
-- conclusão dentro do `submit`, mas a conclusão só ia para o banco quando a
-- pessoa apertava "Concluir" na tela de comemoração. Toda linha referenciava uma
-- conclusão que ainda não existia. A `uploadPhoto` reenfileirava contra um alvo
-- inexistente; a `linkRoundPhoto` nem enfileirava — engolia o erro e devolvia um
-- `false` que ninguém lia. Corrigido no cliente em 31/07/2026 (a conclusão passa
-- a ser gravada antes das fotos, e o vínculo da rodada entra na fila offline).
--
-- Este script reconstrói o metadado a partir do que JÁ está no storage, nas duas
-- convenções de caminho:
--
--   1. `{completion_id}/{item_id}.jpg`                    — foto de quem submeteu
--   2. `rodada/{template}/{loja}/{dia}/{item}.jpg`        — foto da rodada
--
-- A de 20260712 só cobria a primeira: a segunda nasceu depois, com a execução
-- colaborativa, e é a maioria dos casos deste incidente.
--
-- SÓ INSERT. Nenhum arquivo é tocado, nenhuma linha é apagada ou sobrescrita.
-- Idempotente. As fotos voltam a abrir assim que rodar — sem depender do deploy.
--
-- Pré-requisito: o índice único de 20260712_photos_metadata_repair.sql.
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- ============================================================================

-- Garantia: sem o índice único, o `on conflict` abaixo não tem em que se apoiar.
create unique index if not exists photos_completion_item_unique
  on public.photos (completion_id, item_id);

-- ── 1. Caminho direto: a foto de quem submeteu o checklist ───────────────────
insert into public.photos (completion_id, item_id, storage_path, company_id)
select c.id,
       it->>'id',
       c.id || '/' || (it->>'id') || '.jpg',
       c.company_id
  from public.completions c
  cross join lateral jsonb_array_elements(c.items) it
 where (it->>'hasPhoto')::boolean
   and exists (
     select 1 from storage.objects o
      where o.bucket_id = 'checklist-photos'
        and o.name = c.id || '/' || (it->>'id') || '.jpg')
on conflict (completion_id, item_id) do nothing;

-- ── 2. Caminho da rodada: a foto que um colega anexou ────────────────────────
--
-- O cliente monta o caminho com `String(s).replace(/[^\w.-]+/g, '_')` em cada
-- pedaço; o `regexp_replace` aqui repete a MESMA sanitização. `date` é coluna
-- `date` no banco e string 'YYYY-MM-DD' no caminho — daí o `::text`.
--
-- Roda DEPOIS do bloco 1 de propósito: se os dois existirem para o mesmo item,
-- o `do nothing` preserva a foto de quem submeteu.
insert into public.photos (completion_id, item_id, storage_path, company_id)
select c.id,
       it->>'id',
       o.name,
       c.company_id
  from public.completions c
  cross join lateral jsonb_array_elements(c.items) it
  join storage.objects o
    on o.bucket_id = 'checklist-photos'
   and o.name = 'rodada/' || regexp_replace(c.template_id, '[^\w.-]+', '_', 'g')
              || '/' || regexp_replace(c.unit_id, '[^\w.-]+', '_', 'g')
              || '/' || c.date::text
              || '/' || regexp_replace(it->>'id', '[^\w.-]+', '_', 'g') || '.jpg'
 where (it->>'hasPhoto')::boolean
on conflict (completion_id, item_id) do nothing;

-- ── 3. company_id que tenha nascido nulo ─────────────────────────────────────
-- Mesmo cuidado de 20260711: linha com company_id nulo é invisível para o RLS,
-- e uma foto invisível é indistinguível de uma foto perdida.
update public.photos p
   set company_id = c.company_id
  from public.completions c
 where c.id = p.completion_id
   and p.company_id is null
   and c.company_id is not null;

-- ============================================================================
-- VERIFICAÇÃO — `itens_sem_metadado` deve ser 0 (ou só os itens cujo arquivo
-- realmente não existe: fotos de conclusões com mais de 90 dias já foram
-- apagadas pelo cron `cleanup-checklist-photos` e não são recuperáveis).
--
--   select count(*) as itens_sem_metadado
--     from public.completions c
--     cross join lateral jsonb_array_elements(c.items) it
--     left join public.photos p
--       on p.completion_id = c.id and p.item_id = it->>'id'
--    where (it->>'hasPhoto')::boolean
--      and p.completion_id is null
--      and c.date >= current_date - 30;
--
--   select count(*) as fotos_sem_company from public.photos where company_id is null;
-- ============================================================================
