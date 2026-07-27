-- ============================================================================
-- Fuso horário por loja
--
-- O dia de operação do ZCheck é o dia do RELÓGIO DA LOJA (ver lib/dates.js e a
-- migration 20260726_data_local_brasilia.sql). Até aqui esse relógio era uma
-- constante — America/Sao_Paulo —, o que serve para a maior parte do Brasil e
-- quebra numa rede com loja em Manaus, Cuiabá ou Rio Branco: o checklist de
-- Fechamento cairia no dia seguinte pelo mesmo mecanismo do bug de UTC, só que
-- deslocado de 1 ou 2 horas.
--
-- O default preserva o comportamento atual para todo o parque existente: quem
-- não configurar nada continua operando em Brasília.
--
-- Sem CHECK contra uma lista fixa de propósito. A lista de fusos oferecida na
-- tela vive em lib/dates.js (TIMEZONES) e vai crescer; um CHECK aqui exigiria
-- uma migration a cada zona nova, e o custo de um valor inválido é baixo —
-- `tzOf()` cai no default e o Intl ignora zona desconhecida.
--
-- TESTADA com PGlite: node supabase/migrations/20260727_units_timezone.test.mjs
-- ============================================================================

alter table public.units
  add column if not exists timezone text not null default 'America/Sao_Paulo';

comment on column public.units.timezone is
  'Zona IANA do relógio da loja (ex.: America/Manaus). Define o dia de operação '
  'das execuções e a régua dos prazos. Ver lib/dates.js.';

-- Linhas anteriores ao default já ficam com 'America/Sao_Paulo' por causa do
-- NOT NULL DEFAULT, mas uma coluna adicionada como NULL em algum ambiente e só
-- depois promovida ficaria com buracos. Sanitiza o que estiver vazio.
update public.units
   set timezone = 'America/Sao_Paulo'
 where timezone is null or btrim(timezone) = '';

-- ── Resultado ───────────────────────────────────────────────────────────────
-- O SQL Editor descarta `raise notice`; o diagnóstico volta como linha.
select coalesce(timezone, '(nulo)') as fuso, count(*)::text as lojas
  from public.units
 group by 1
 order by 2 desc, 1;
