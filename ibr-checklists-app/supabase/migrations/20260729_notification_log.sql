-- ============================================================================
-- `notification_log` — o histórico de notificações passa a ser um registro,
-- não um efeito colateral.
--
-- O painel "Histórico de notificações" (aba Painel) montava a lista a partir de
-- `config`, lendo as chaves `notified_YYYY-MM-DD`. Aquilo NÃO é um histórico:
-- é a chave de deduplicação da edge function `notify-overdue` — um array de
-- ids de template, uma linha por dia, para a função não repetir o aviso no
-- ciclo seguinte. Usar aquilo como histórico trazia quatro defeitos:
--
--   1. Uma linha por DIA, com um único `updated_at`. Todo aviso do dia aparecia
--      com a hora do último upsert — a hora exibida era falsa para todos menos
--      o último.
--   2. GLOBAL, sem empresa. A chave é `notified_<data>` para a instância
--      inteira; os ids das outras empresas caíam no painel como "Checklist
--      removido". Ruído no melhor caso, e o vizinho enxergando o VOLUME e o
--      HORÁRIO dos atrasos alheios no pior.
--   3. Só o aviso de atraso. Aprovação de cadastro (`notify-status`) e demais
--      pushes nunca entraram — o painel dizia "histórico de notificações" e
--      mostrava um tipo só.
--   4. Sem contagem de entrega. `notified_` registra a intenção; quantos
--      aparelhos de fato receberam ficava só no log do Deno.
--
-- Esta migration cria a tabela e é ADITIVA: `config` continua onde está, e a
-- deduplicação da notify-overdue segue usando `notified_`. O app lê as DUAS
-- fontes durante a transição (ver NotificationHistory em app/app/page.js), de
-- modo que rodar isto antes do deploy da função não deixa o painel vazio.
--
-- Rodar no SQL Editor do Supabase (projeto rjuulamozdhssgqrzfji). Idempotente.
-- Teste local: node supabase/migrations/20260729_notification_log.test.mjs
-- ============================================================================

create table if not exists public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  -- Mesmo padrão das demais tabelas operacionais: o DEFAULT tira a empresa do
  -- próprio token, então o cliente nunca precisa (nem consegue) escolher.
  company_id  text not null default public.jwt_company_id(),
  unit_id     text,
  -- 'atraso' (notify-overdue) | 'cadastro' (notify-status). Texto livre de
  -- propósito: um tipo novo não deve exigir migration.
  kind        text not null,
  title       text not null,
  body        text,
  template_id text,
  sector      text,
  deadline    text,
  -- alvos = inscrições que a função tentou; entregues = as que o serviço de
  -- push aceitou. `entregues < alvos` é a assinatura de inscrição expirada.
  targets     int not null default 0,
  delivered   int not null default 0,
  created_at  timestamptz not null default now()
);

-- O painel varre os últimos 7 dias de UMA empresa. Sem este índice, é seq scan
-- na tabela inteira a cada abertura da aba.
create index if not exists notification_log_company_created_idx
  on public.notification_log (company_id, created_at desc);


-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Escopo por empresa, ao contrário de `config` (cuja policy é `using (true)`,
-- possível só porque lá não há nada além de ids de template).
alter table public.notification_log enable row level security;

drop policy if exists notification_log_tenant_read on public.notification_log;
create policy notification_log_tenant_read on public.notification_log
  for select to authenticated
  using (company_id = public.jwt_company_id());

-- INSERT para `authenticated` porque parte dos pushes nasce no app (aprovação
-- de cadastro), não na edge function. O `with check` prende a linha à empresa
-- do token — ninguém escreve no histórico do vizinho. A notify-overdue escreve
-- com service_role e não passa por aqui.
drop policy if exists notification_log_tenant_insert on public.notification_log;
create policy notification_log_tenant_insert on public.notification_log
  for insert to authenticated
  with check (company_id = public.jwt_company_id());

grant select, insert on public.notification_log to authenticated;

-- Explícito porque o `anon` é o papel da chave que vai no bundle. A tabela
-- nasce fechada para ele (ver a correção da RAIZ em 27/07), mas repetir aqui
-- custa nada e sobrevive a um `grant` distraído no futuro.
revoke all privileges on public.notification_log from anon;


-- ── Retenção ────────────────────────────────────────────────────────────────
-- O painel lê 7 dias; a auditoria eventualmente quer mais. Sem purga a tabela
-- cresce devagar (uma linha por checklist atrasado avisado), então não há cron
-- aqui. Se um dia incomodar:
--   delete from public.notification_log where created_at < now() - interval '180 days';


-- ============================================================================
-- VERIFICAÇÃO — devolve linhas (o SQL Editor não mostra `raise notice`).
-- ============================================================================
select 1 as ord,
       'tabela existe' as item,
       (select count(*)::text from information_schema.tables
         where table_schema = 'public' and table_name = 'notification_log') as valor,
       '1' as esperado
union all
select 2, 'RLS ligado',
       (select c.relrowsecurity::text from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = 'notification_log'), 'true'
union all
select 3, 'policies de authenticated (select + insert)',
       (select count(*)::text from pg_policies
         where schemaname = 'public' and tablename = 'notification_log'
           and 'authenticated' = any(roles)), '2'
union all
select 4, 'anon alcança a tabela?',
       (select count(*)::text from information_schema.table_privileges
         where table_schema = 'public' and table_name = 'notification_log'
           and grantee = 'anon'), '0'
union all
select 5, 'policies de anon/public',
       (select count(*)::text from pg_policies
         where schemaname = 'public' and tablename = 'notification_log'
           and ('anon' = any(roles) or 'public' = any(roles))), '0'
 order by ord;

-- ── DEPOIS DE RODAR ─────────────────────────────────────────────────────────
-- (a) Deploy da notify-overdue v9, que passa a gravar aqui:
--     npx supabase functions deploy notify-overdue --project-ref rjuulamozdhssgqrzfji
-- (b) No app, aba Painel → "Histórico de notificações": a lista sai desta
--     tabela e, enquanto a v9 não sobe, das chaves `notified_` antigas.
-- ============================================================================
