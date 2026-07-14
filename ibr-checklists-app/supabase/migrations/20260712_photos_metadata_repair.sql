-- ============================================================================
-- Fotos de evidência — conserta o metadado que nunca gravou.
--
-- Diagnóstico de 12/07/2026: o arquivo SEMPRE subiu para o bucket
-- `checklist-photos` (a política anon_storage_all cobre o upload), mas a linha
-- em `public.photos` nunca nascia: o cliente faz upsert com
-- `onConflict: 'completion_id,item_id'` e essa CONSTRAINT ÚNICA não existe no
-- banco — o Postgres rejeita o upsert ("no unique or exclusion constraint") e
-- o código engolia o erro. Por isso a tabela estava vazia em 09/07 mesmo com
-- fotos em produção, e o modal responde "Não foi possível carregar a foto".
--
-- Este script: (1) cria a constraint que o upsert exige; (2) reconstrói o
-- metadado a partir dos arquivos que JÁ estão no bucket (o nome do objeto é
-- `{completion_id}/{item_id}.jpg`); (3) verificação embutida.
-- Idempotente. As fotos antigas voltam a abrir assim que rodar — sem deploy.
-- ============================================================================

-- 1. Deduplica por garantia (se algum insert avulso criou repetidas)
delete from public.photos a
 using public.photos b
 where a.completion_id = b.completion_id
   and a.item_id = b.item_id
   and a.ctid < b.ctid;

-- 2. A constraint única que o upsert do cliente referencia
create unique index if not exists photos_completion_item_unique
  on public.photos (completion_id, item_id);

-- 3. Reconstrói o metadado a partir do bucket. Só objetos de evidência
--    ({completion}/{item}.jpg) — ignora ref/ (caminho morto já removido).
insert into public.photos (completion_id, item_id, storage_path, company_id)
select split_part(o.name, '/', 1)                              as completion_id,
       regexp_replace(split_part(o.name, '/', 2), '\.jpg$', '') as item_id,
       o.name                                                   as storage_path,
       co.company_id
  from storage.objects o
  join public.completions co on co.id = split_part(o.name, '/', 1)
 where o.bucket_id = 'checklist-photos'
   and o.name not like 'ref/%'
   and o.name like '%/%'
on conflict (completion_id, item_id) do nothing;

-- ── VERIFICAÇÃO EMBUTIDA ─────────────────────────────────────────────────────
-- linhas_em_photos deve ser > 0 e igual (ou próximo) a objetos_de_evidencia.
select 'linhas_em_photos' as item, count(*)::text as valor from public.photos
union all
select 'objetos_de_evidencia', count(*)::text
  from storage.objects
 where bucket_id = 'checklist-photos'
   and name not like 'ref/%'
   and name like '%/%';
