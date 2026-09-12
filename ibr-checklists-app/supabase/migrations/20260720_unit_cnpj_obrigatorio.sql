-- ============================================================================
-- 20260720_unit_cnpj_obrigatorio.sql — CNPJ de loja passa a ser OBRIGATÓRIO.
--
-- Decisão do fundador (20/08/2026): cada loja/unidade é uma identidade fiscal
-- própria — no IBR as três lojas têm CNPJs de raízes diferentes (são PJs
-- distintas). Sem CNPJ por unidade não há contrato nem cobrança por filial.
--
-- ⚠️ PRÉ-REQUISITO: nenhuma unidade pode estar sem CNPJ. O bloco (1) aborta
-- com a lista das unidades pendentes em vez de aplicar um NOT NULL que
-- quebraria. Preencha pelo Core (/admin/empresas → detalhar) e rode de novo.
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- ============================================================================

-- ── (1) Portão: aborta se houver unidade sem CNPJ ──────────────────────────
do $blk$
declare pendentes text;
begin
  select string_agg(format('%s (%s)', name, id), ', ')
    into pendentes
    from public.units
   where cnpj is null;

  if pendentes is not null then
    raise exception 'Estas unidades ainda estão sem CNPJ: %. Preencha no /admin/empresas antes de rodar esta migration.', pendentes;
  end if;
end $blk$;

-- ── (2) NOT NULL + validação de dígito verificador ─────────────────────────
alter table public.units alter column cnpj set not null;

alter table public.units drop constraint if exists units_cnpj_valid;
alter table public.units add constraint units_cnpj_valid
  check (public.is_valid_cnpj(cnpj));

-- ── (3) Onde mora cada camada de validação ─────────────────────────────────
-- Banco (aqui): NOT NULL + dígito verificador — a rede de segurança, com
--   mensagem técnica. Vale para QUALQUER caminho de escrita, inclusive o
--   `provision_company` (uma loja sem CNPJ no payload aborta a transação).
-- Aplicação: a mensagem boa, que nomeia a loja errada — no wizard de
--   onboarding, no Gerenciar → Lojas e nas rotas /api/signup e /api/admin.
--
-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Nenhuma unidade sem CNPJ e a coluna é NOT NULL:
--   select count(*) filter (where cnpj is null) as sem_cnpj from public.units;
--   select is_nullable from information_schema.columns
--    where table_name = 'units' and column_name = 'cnpj';   -- esperado: NO
--
-- (b) Insert sem CNPJ é recusado (esperado: erro de NOT NULL):
--   insert into public.units (id, company_id, name) values ('zz-u', 'x', 'ZZ');
-- ============================================================================
