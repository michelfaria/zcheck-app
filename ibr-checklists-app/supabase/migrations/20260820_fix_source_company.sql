-- ============================================================================
-- 20260820_fix_source_company.sql — corrige a origem do CNPJ da empresa.
--
-- Bug do backfill anterior: a matriz (IBR1) divide o CNPJ com a empresa, e o
-- `on conflict do update` do segundo loop sobrescreveu `source` de 'company'
-- para 'unit'. Só a rotulagem estava errada — o vínculo raiz→cliente e a
-- trava de trial sempre estiveram corretos.
--
-- Aqui: (1) a função deixa de rebaixar 'company' para 'unit'; (2) as linhas
-- existentes voltam a refletir a verdade.
--
-- Rode no SQL Editor. Idempotente.
-- ============================================================================

create or replace function public.link_cnpj_to_company(
  p_company_id text, p_cnpj text, p_source text
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_root  text := public.cnpj_root(p_cnpj);
  v_owner text;
  v_name  text;
begin
  if v_root is null or p_company_id is null then return; end if;

  select origin_company_id into v_owner
    from public.cnpj_trial_history where cnpj_root = v_root;

  if v_owner is not null and v_owner <> p_company_id then
    raise exception 'o CNPJ % já pertence a outro cliente (%). Um CNPJ não pode estar em dois grupos.',
      p_cnpj, v_owner;
  end if;

  select name into v_name from public.companies where id = p_company_id;

  insert into public.cnpj_trial_history
    (cnpj_root, cnpj, origin_company_id, company_name, source)
  values (v_root, upper(regexp_replace(p_cnpj, '[^0-9A-Za-z]', '', 'g')),
          p_company_id, v_name, p_source)
  on conflict (cnpj_root) do update
    set origin_company_id = excluded.origin_company_id,
        company_name      = excluded.company_name,
        -- 'company' não é rebaixado para 'unit': a matriz costuma dividir o
        -- CNPJ com a empresa, e o vínculo com o titular é o mais forte.
        source            = case when cnpj_trial_history.source = 'company'
                                 then 'company' else excluded.source end;
end
$fn$;

revoke all on function public.link_cnpj_to_company(text, text, text) from public, anon, authenticated;

-- Corrige o que já está gravado: toda raiz que é o CNPJ de uma empresa é
-- 'company', mesmo que uma loja use o mesmo número.
update public.cnpj_trial_history h
   set source = 'company'
  from public.companies c
 where public.cnpj_root(c.cnpj) = h.cnpj_root
   and h.source <> 'company';

-- ============================================================================
-- VERIFICAÇÃO (esperado: 36606528000156 = company · os outros dois = unit)
--   select cnpj, source, company_name from public.cnpj_trial_history order by source, cnpj;
-- ============================================================================
