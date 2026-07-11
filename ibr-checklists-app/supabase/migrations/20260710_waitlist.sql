-- ============================================================================
-- Waitlist — a lista de acesso da landing (/lista).
--
-- Decisão de 09/07/2026: não há trial self-service enquanto o isolamento
-- multi-tenant não estiver ativo em produção; a landing captura demanda e cada
-- empresa é provisionada manualmente (via /api/admin/provision). O campo
-- `sector` é o dado estratégico: mede demanda por vertical e orienta a
-- curadoria da biblioteca de modelos.
--
-- Segurança: leads são dados de PLATAFORMA, não de tenant. O formulário público
-- insere como anon; NINGUÉM lê pela API (nem authenticated — não há policy de
-- select). Leitura só no SQL Editor / service_role. Nada para a tenant_03
-- revogar.
-- ============================================================================

create table if not exists public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null,
  email      text not null,
  company    text not null,
  sector     text,
  stores     text,          -- faixa: '1' | '2–5' | '6+'
  whatsapp   text,
  source     text           -- de onde veio (landing, indicação, ...)
);

-- Um e-mail entra uma vez. O cliente trata 23505 como "você já está na lista"
-- (estado positivo, não erro).
create unique index if not exists waitlist_email_unique
  on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

drop policy if exists waitlist_insert on public.waitlist;
create policy waitlist_insert on public.waitlist
  for insert to anon, authenticated
  with check (true);

-- Só INSERT. Sem grant de select/update/delete: o formulário grava e pronto.
grant insert on public.waitlist to anon, authenticated;

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) anon insere mas não lê:
--
--   set role anon;
--   insert into public.waitlist (name, email, company, sector)
--   values ('Teste', 'teste@exemplo.com', 'Empresa Teste', 'Restaurante');  -- ok
--   select * from public.waitlist;   -- esperado: permission denied
--   reset role;
--
-- (b) e-mail duplicado é bloqueado (case-insensitive):
--
--   set role anon;
--   insert into public.waitlist (name, email, company)
--   values ('Outro', 'TESTE@exemplo.com', 'Outra');  -- esperado: 23505
--   reset role;
--   delete from public.waitlist where email = 'teste@exemplo.com';
--
-- (c) Leitura dos leads (rode como postgres, no SQL Editor):
--
--   select created_at::date, name, company, sector, stores, coalesce(whatsapp, email) as contato
--     from public.waitlist order by created_at desc;
--
-- (d) Demanda por setor — o que orienta a curadoria da biblioteca:
--
--   select sector, count(*) from public.waitlist group by 1 order by 2 desc;
-- ============================================================================
