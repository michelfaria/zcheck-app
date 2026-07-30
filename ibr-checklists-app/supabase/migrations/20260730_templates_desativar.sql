-- ============================================================================
-- Checklist se DESATIVA, não se apaga
--
-- `handleDelete` fazia `delete from templates` e isso reescrevia o passado:
--
--   · As execuções sobrevivem em `completions` (que guarda `template_name`
--     desnormalizado), mas o checklist não. As execuções ficam órfãs.
--   · "Previstos" é contado da lista ATUAL de checklists para QUALQUER data
--     passada — não existe registro de quando um checklist passou a existir.
--     Apagar encolhia o denominador retroativamente e a aderência de dias já
--     fechados subia sozinha. Criar tinha o efeito inverso.
--   · E a linha ia embora para sempre: sem backup, não havia como reconstruir a
--     configuração de um dia anterior.
--
-- Duas colunas resolvem: `active` esconde o checklist da operação, e
-- `deactivated_at` diz A PARTIR DE QUANDO ele deixou de ser previsto — é o que
-- permite contar o passado com a configuração que existia naquele dia.
--
-- `created_at` entra pelo mesmo motivo, no outro extremo: checklist criado hoje
-- não pode ser cobrado de semana passada.
--
-- ATENÇÃO ao aplicar (verificado no IBR em 30/07/2026): **a tabela pode JÁ TER
-- `created_at`**, vindo do schema original — o `add column if not exists` viraria
-- no-op e as linhas existentes trariam a data REAL de criação, não NULL. É melhor
-- (a janela histórica fica exata), mas não é neutro: para dias anteriores à
-- criação de um checklist ele deixa de contar como previsto, e a aderência
-- daqueles dias sobe. Confira ANTES de aplicar em outro projeto:
--
--   select count(created_at) as com_data, count(*) as total,
--          count(*) filter (where created_at > now() - interval '90 days') as recentes
--     from public.templates;
--
-- `recentes = 0` significa que a mudança não alcança a janela que o app lê (90
-- dias) e nenhum número se move.
--
-- ADITIVA. Rodar no SQL Editor do Supabase (projeto rjuulamozdhssgqrzfji).
-- Teste local: node supabase/migrations/20260730_templates_desativar.test.mjs
-- ============================================================================

alter table public.templates add column if not exists active         boolean not null default true;
alter table public.templates add column if not exists deactivated_at timestamptz;
alter table public.templates add column if not exists created_at     timestamptz;

-- O DEFAULT entra em DUAS ETAPAS, e a ordem é o ponto.
--
-- `add column ... default now()` num só passo preencheria as linhas EXISTENTES
-- com "agora" (o Postgres materializa o default no ADD COLUMN), e todo checklist
-- do parque passaria a "ter nascido hoje" — deixando de ser previsto em qualquer
-- data anterior. A aderência de meses fechados mudaria de uma vez.
--
-- Adicionando sem default e só então declarando o default, as linhas antigas
-- ficam em NULL ("sempre existiu", que é o comportamento atual e não move
-- número nenhum) e apenas os checklists criados daqui para frente registram a
-- data — que é justamente o que impede um checklist novo de ser cobrado da
-- semana passada.
alter table public.templates alter column created_at set default now();

-- Índice para a listagem da operação, que é a leitura quente.
create index if not exists templates_active_idx on public.templates (active);

-- Coerência: quem está ativo não tem data de desativação, e vice-versa. Sem
-- isto, um `active = false` sem `deactivated_at` voltaria a encolher o passado
-- em silêncio — exatamente o bug que esta migration fecha.
create or replace function public.templates_sync_active()
returns trigger
language plpgsql
as $$
begin
  if new.active = false and new.deactivated_at is null then
    new.deactivated_at := now();
  end if;
  if new.active = true then
    new.deactivated_at := null;
  end if;
  return new;
end
$$;

drop trigger if exists templates_active_sync on public.templates;
create trigger templates_active_sync
  before insert or update on public.templates
  for each row execute function public.templates_sync_active();

-- ============================================================================
-- VERIFICAÇÃO
--
-- (a) Nada mudou para quem já existia:
--
--   select count(*) from public.templates where active;            -- = total
--   select count(*) from public.templates where deactivated_at is not null;  -- 0
--
-- (b) Desativar preenche a data sozinho, e reativar a limpa:
--
--   update public.templates set active = false where id = '<id>';
--   select active, deactivated_at from public.templates where id = '<id>';
--   update public.templates set active = true  where id = '<id>';
--   select active, deactivated_at from public.templates where id = '<id>';
--
-- (c) Depois do deploy do cliente, o botão de lixeira em Gerenciar deve
--     DESATIVAR (a linha continua no banco) em vez de apagar:
--
--   select id, name, active, deactivated_at from public.templates
--    where active = false order by deactivated_at desc;
-- ============================================================================
