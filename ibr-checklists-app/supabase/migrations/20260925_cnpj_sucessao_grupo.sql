-- ============================================================================
-- 20260925_cnpj_sucessao_grupo.sql — o "Liberar novo teste" do Core volta a
-- funcionar, e a recusa de CNPJ deixa de dizer quem é o outro cliente.
--
-- (1) O OVERRIDE DO CORE MORREU EM 20/08/2026. `provision_company` pula a
--     trava de trial quando o Core manda `allow_trial_reuse`, mas o gatilho
--     `companies_cnpj_link` (20260820_grupo_cliente) roda logo depois do
--     INSERT da empresa, acha a raiz ligada à empresa antiga em
--     `cnpj_trial_history` e recusa com "já pertence a outro cliente". O caso
--     de uso do override é justamente esse — a empresa foi apagada e volta —
--     porque, com a antiga ainda viva, o mesmo CNPJ já é barrado antes por
--     "já está cadastrado".
--
--     Regra nova, estreita de propósito: SUCESSÃO DE GRUPO. Quando o CNPJ da
--     EMPRESA (source 'company') cai numa raiz cujo dono não existe mais em
--     `companies`, a empresa nova herda TODAS as raízes do grupo apagado — a
--     da empresa e a de cada loja —, com `started_at` preservado (o histórico
--     do primeiro teste fica). Assim o grupo que volta recadastra as próprias
--     lojas sem esbarrar em si mesmo.
--
--     O que continua recusado:
--       · raiz de outro cliente VIVO, por qualquer caminho;
--       · raiz de grupo apagado pelo CNPJ de uma LOJA — uma loja não herda o
--         grupo; quem herda é quem assume o CNPJ da empresa;
--       · o /comecar: `provision_company` recusa a raiz já usada ANTES do
--         INSERT (sem `allow_trial_reuse`), então a sucessão pelo cadastro
--         público não acontece. O override segue exclusivo do Core.
--
-- (2) A MENSAGEM ENTREGAVA O OUTRO CLIENTE. "o CNPJ X já pertence a outro
--     cliente (ibr-li53392s)" chegava crua à tela da diretoria que cadastra
--     uma loja — o id da outra empresa e a confirmação de que aquele CNPJ usa
--     o ZCheck. O texto novo não cita o dono; o Core, que precisa saber,
--     consulta `cnpj_trial_history` pela rota de admin (service_role).
--
-- Só `link_cnpj_to_company` muda. `provision_company` (v4, 20260924) e os
-- gatilhos ficam como estão.
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- Prova: node supabase/migrations/20260925_cnpj_sucessao_grupo.test.mjs
-- ============================================================================

-- Guarda: esta migration assume os gatilhos de 20260820_grupo_cliente.
do $guard$
begin
  if to_regprocedure('public.link_cnpj_to_company(text, text, text)') is null then
    raise exception 'link_cnpj_to_company não existe: aplique 20260820_grupo_cliente antes';
  end if;
  if (select count(*) from pg_trigger
       where tgname in ('companies_cnpj_link', 'units_cnpj_link') and not tgisinternal) <> 2 then
    raise exception 'gatilhos companies_cnpj_link/units_cnpj_link ausentes: aplique 20260820_grupo_cliente antes';
  end if;
end
$guard$;

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

  select name into v_name from public.companies where id = p_company_id;

  select origin_company_id into v_owner
    from public.cnpj_trial_history where cnpj_root = v_root;

  if v_owner is not null and v_owner <> p_company_id then
    if p_source = 'company'
       and not exists (select 1 from public.companies where id = v_owner) then
      -- Sucessão: o grupo apagado volta pelo CNPJ da empresa. Leva todas as
      -- raízes dele; `started_at` não muda.
      update public.cnpj_trial_history
         set origin_company_id = p_company_id,
             company_name      = v_name,
             ended_at          = null,
             outcome           = null
       where origin_company_id = v_owner;
    else
      -- Sem o id do dono: esta mensagem chega à tela de quem cadastra a loja.
      raise exception 'o CNPJ % já está vinculado a outra conta do ZCheck. Um CNPJ não pode estar em dois grupos — se ele é da sua empresa, fale com a gente.',
        p_cnpj;
    end if;
  end if;

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

-- ============================================================================
-- VERIFICAÇÃO
--   select position('vinculado a outra conta' in prosrc) > 0 as mensagem_nova,
--          position('Sucessão' in prosrc) > 0            as sucessao
--     from pg_proc where proname = 'link_cnpj_to_company';
--   -- esperado: true | true
-- ============================================================================
