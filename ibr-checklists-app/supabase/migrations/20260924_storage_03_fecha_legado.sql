-- ============================================================================
-- STORAGE 3/3 — fecha a leitura dos objetos antigos (sem pasta de empresa).
--
-- Depois disto, `checklist-photos` só responde por pasta de empresa, e o
-- objeto antigo só é alcançável pela service_role. A rota
-- /api/admin/storage-migrate (ação `apagar`) remove os antigos JÁ COPIADOS.
--
-- NÃO RODAR antes de:
--   1. 20260924_storage_01 aplicada e o cliente novo em produção;
--   2. rota /api/admin/storage-migrate: `inventariar` e depois `copiar` até
--      `pendentes: 0` — a ação `copiar` já reescreve `photos`/`live_tasks`;
--   3. as linhas `revisar`/`conflito` do inventário decididas (elas NÃO são
--      copiadas; depois desta migration ficam inacessíveis ao app):
--        select * from public.checklist_photos_legado
--         where status in ('revisar', 'conflito');
--
-- A trava do passo 1 aborta se ainda houver objeto `dono` sem cópia — derrubar
-- a leitura antes faria a foto sumir da tela da empresa dona.
--
-- Pode rodar antes ou depois da 02 (revogação do anon): uma não depende da outra.
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente. ROLLBACK no rodapé.
-- ============================================================================

-- ── 1. Trava ────────────────────────────────────────────────────────────────
do $$
declare n bigint; p bigint;
begin
  select count(*) into n from public.checklist_photos_legado
   where status = 'dono' and copiado_em is null and apagado_em is null;
  if n > 0 then
    raise exception '% objeto(s) antigo(s) com dono ainda sem cópia. Rode a ação '
                    '`copiar` em /api/admin/storage-migrate até zerar. Nada foi aplicado.', n;
  end if;

  -- Linha de `photos` da empresa dona ainda com o nome antigo: o `cleanup-photos`
  -- apagaria o objeto errado. A ação `copiar` reescreve; se sobrou, rode
  -- `select * from public.checklist_photos_reescrever_referencias();`.
  select count(*) into p
    from public.photos ph
    join public.checklist_photos_legado l
      on l.name = ph.storage_path and l.company_id = ph.company_id
   where l.status = 'dono';
  if p > 0 then
    raise exception '% linha(s) de photos ainda apontam para o nome antigo. Rode '
                    'public.checklist_photos_reescrever_referencias(). Nada foi aplicado.', p;
  end if;
end $$;


-- ── 2. Derruba a leitura do legado ──────────────────────────────────────────
drop policy if exists checklist_photos_legado_leitura on storage.objects;
revoke execute on function public.checklist_photos_legado_visivel(text) from authenticated;


-- ============================================================================
-- VERIFICAÇÃO — `valor` tem de bater com `esperado`.
-- ============================================================================
select 1 as n, 'policy de leitura do legado' as item,
       (select count(*) from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and policyname = 'checklist_photos_legado_leitura')::text as valor,
       '0' as esperado
union all
select 2, 'objetos antigos com dono ainda sem cópia',
       (select count(*) from public.checklist_photos_legado
         where status = 'dono' and copiado_em is null and apagado_em is null)::text, '0'
union all
select 3, 'objetos antigos que NÃO serão copiados (revisar/conflito/sem_dono)',
       (select count(*) from public.checklist_photos_legado
         where status <> 'dono' and apagado_em is null)::text,
       'decidido à mão'
union all
select 4, 'objetos antigos copiados, prontos para `apagar`',
       (select count(*) from public.checklist_photos_legado
         where status = 'dono' and copiado_em is not null and apagado_em is null)::text,
       'qualquer'
order by n;


-- ============================================================================
-- ROLLBACK — só enquanto os antigos NÃO tiverem sido apagados:
--   grant execute on function public.checklist_photos_legado_visivel(text) to authenticated;
--   create policy checklist_photos_legado_leitura on storage.objects
--     for select to authenticated
--     using (bucket_id = 'checklist-photos'
--            and public.checklist_photos_legado_visivel(name));
-- ============================================================================
