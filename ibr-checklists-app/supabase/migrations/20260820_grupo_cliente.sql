-- ============================================================================
-- 20260820_grupo_cliente.sql — O GRUPO é o cliente; cada CNPJ pertence a um
-- grupo; faturamento por grupo ou por loja (escolha do cliente).
--
-- CONTEXTO REAL (IBR): as três lojas têm raízes de CNPJ DIFERENTES — são PJs
-- independentes, não filiais. Sem esta migration, cada uma poderia abrir a
-- própria conta e ganhar um teste gratuito novo, embora sejam o mesmo cliente.
--
-- O QUE MUDA:
--
-- 1. `cnpj_trial_history` deixa de registrar só o CNPJ do titular: passa a
--    guardar UMA LINHA POR RAIZ do grupo (a da empresa e a de cada loja),
--    todas apontando para a mesma empresa. A coluna `source` diz de onde veio.
--    Efeito: usar o CNPJ de uma loja para abrir conta nova é bloqueado — o
--    grupo já consumiu o teste.
--
-- 2. Dois GATILHOS mantêm isso verdadeiro em QUALQUER caminho de escrita
--    (app, Core, RPC, SQL manual): ao gravar CNPJ em `companies` ou `units`,
--    a raiz é vinculada ao grupo. Se a raiz já pertence a OUTRO grupo, a
--    escrita é recusada — um CNPJ não vive em dois clientes ao mesmo tempo.
--
-- 3. `companies.billing_mode` prepara o faturamento: 'group' (uma cobrança
--    para o grupo, somando as lojas — padrão) ou 'per_unit' (uma cobrança por
--    loja/CNPJ). Só o dado por enquanto; a cobrança em si entra depois.
--
-- Rode no SQL Editor (projeto rjuulamozdhssgqrzfji). Idempotente.
-- ============================================================================

-- ── (1) Modo de faturamento do cliente ─────────────────────────────────────
alter table public.companies add column if not exists billing_mode text
  not null default 'group';

alter table public.companies drop constraint if exists companies_billing_mode_valid;
alter table public.companies add constraint companies_billing_mode_valid
  check (billing_mode in ('group', 'per_unit'));

comment on column public.companies.billing_mode is
  'group = uma cobrança para o grupo (soma das lojas) · per_unit = uma cobrança por loja/CNPJ';

-- ── (2) Histórico passa a registrar a origem de cada raiz ──────────────────
alter table public.cnpj_trial_history add column if not exists source text
  not null default 'company';

alter table public.cnpj_trial_history drop constraint if exists cnpj_trial_history_source_valid;
alter table public.cnpj_trial_history add constraint cnpj_trial_history_source_valid
  check (source in ('company', 'unit'));

-- ── (3) Vínculo raiz → grupo (a regra, num lugar só) ───────────────────────
-- Recusa quando a raiz já pertence a outro grupo. Idempotente para o mesmo
-- grupo (regravar o mesmo CNPJ não faz nada). SECURITY DEFINER porque quem
-- escreve em `units` é o app com a chave anon — o histórico é fechado a ele.
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
        -- CNPJ com a empresa, e quem manda na origem é o vínculo mais forte.
        source            = case when cnpj_trial_history.source = 'company'
                                 then 'company' else excluded.source end;
end
$fn$;

revoke all on function public.link_cnpj_to_company(text, text, text) from public, anon, authenticated;

-- ── (4) Gatilhos: qualquer escrita de CNPJ vincula a raiz ao grupo ─────────
create or replace function public.companies_link_cnpj()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.cnpj is not null and (tg_op = 'INSERT' or new.cnpj is distinct from old.cnpj) then
    perform public.link_cnpj_to_company(new.id, new.cnpj, 'company');
  end if;
  return new;
end
$fn$;

drop trigger if exists companies_cnpj_link on public.companies;
create trigger companies_cnpj_link
  after insert or update of cnpj on public.companies
  for each row execute function public.companies_link_cnpj();

create or replace function public.units_link_cnpj()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.cnpj is not null and (tg_op = 'INSERT' or new.cnpj is distinct from old.cnpj) then
    perform public.link_cnpj_to_company(new.company_id, new.cnpj, 'unit');
  end if;
  return new;
end
$fn$;

drop trigger if exists units_cnpj_link on public.units;
create trigger units_cnpj_link
  after insert or update of cnpj on public.units
  for each row execute function public.units_link_cnpj();

-- ── (5) Backfill: vincula o que já existe ──────────────────────────────────
-- A empresa primeiro (source 'company'), depois as lojas — assim a linha da
-- matriz, que divide o CNPJ com a empresa, fica marcada como 'company'.
do $blk$
declare r record;
begin
  for r in select id, cnpj from public.companies where cnpj is not null loop
    perform public.link_cnpj_to_company(r.id, r.cnpj, 'company');
  end loop;
  for r in select company_id, cnpj from public.units where cnpj is not null loop
    begin
      perform public.link_cnpj_to_company(r.company_id, r.cnpj, 'unit');
    exception when others then
      raise notice 'loja com CNPJ % não vinculada: %', r.cnpj, sqlerrm;
    end;
  end loop;
end $blk$;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) O grupo IBR deve aparecer com 3 raízes (empresa + IBR2 + IBR3;
--     a IBR1 divide o CNPJ da empresa, então são 3 linhas, não 4):
--   select cnpj_root, cnpj, source, company_name
--     from public.cnpj_trial_history order by source, cnpj;
--
-- (b) Modo de faturamento (esperado: group):
--   select id, name, billing_mode from public.companies;
--
-- (c) TESTE — usar o CNPJ de uma loja do IBR em outra empresa deve FALHAR:
--   insert into public.companies (id, name, slug, cnpj, active)
--   values ('zz-conflito', 'ZZ', 'zz-conflito', '40180419000197', false);
--   -- esperado: "o CNPJ 40180419000197 já pertence a outro cliente (ibr-...)"
--   -- (se por acaso criar, limpe: delete from public.companies where id='zz-conflito';)
-- ============================================================================
