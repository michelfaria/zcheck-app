-- ============================================================================
-- 20260811_templates_created_at_backfill.sql
--
-- Preenche `templates.created_at` nas linhas que ficaram NULL, para o relatório
-- parar de cobrar checklist de dias em que a empresa não existia.
--
-- ── O SINTOMA ───────────────────────────────────────────────────────────────
-- Medido no IBR em 10/08/2026, exportando o mesmo relatório em dois recortes:
--
--   "30 dias"  →  124 execuções / 385 previstos  =  32% do esperado
--   "Tudo"     →  124 execuções / 143 previstos  =  87% do esperado
--
-- Os DOIS recortes têm exatamente os mesmos dados (124 execuções, 11 dias,
-- 29/07 a 10/08 — conferido nas listas de execução dos próprios PDFs). Só o
-- denominador muda. O gestor lê "32%" como operação péssima; é artefato.
--
-- ── A CAUSA, E POR QUE ELA FOI DELIBERADA ───────────────────────────────────
-- `countApplicableTemplatesOnDate` (lib/stats.js) filtra por `templateExistedOn`
-- (lib/rounds.js:128), que devolve **true quando `createdAt` é nulo** — "sempre
-- existiu". Com os 13 checklists do IBR em NULL, todo dia da janela conta como
-- previsto, inclusive os 17 dias anteriores à primeira execução da empresa.
--
-- O NULL não foi descuido. `20260730_templates_desativar.sql:51-56` adiciona a
-- coluna SEM default e só então declara `default now()`, exatamente para as
-- linhas existentes ficarem em NULL — senão o Postgres materializaria "agora"
-- nelas e todo checklist do parque passaria a "ter nascido hoje", movendo a
-- aderência de meses fechados.
--
-- Aquele raciocínio está certo para um parque com histórico. Ele se INVERTE num
-- tenant novo: o IBR executou pela primeira vez em 29/07, a migration rodou em
-- 30/07, e "sempre existiu" faz o previsto alcançar 30 dias para trás numa
-- empresa com 13 dias de vida.
--
-- ── A ÂNCORA ESCOLHIDA, E O ERRO QUE ELA PREFERE COMETER ────────────────────
-- Cada checklist recebe a data da PRIMEIRA EXECUÇÃO DA EMPRESA dele — não a
-- primeira execução do próprio checklist.
--
-- A escolha é conservadora de propósito. Errar para TRÁS (data anterior à real)
-- infla o previsto e derruba o percentual: o número fica pessimista, que é o
-- defeito atual, mais brando. Errar para FRENTE (data posterior à real) tira
-- dias do previsto e SOBE o percentual — o relatório passaria a lisonjear a
-- operação, que é o erro que ninguém percebe e ninguém reclama.
--
-- Por isso não se usa a primeira execução de cada checklist: um checklist criado
-- no dia 1 e executado só no dia 8 ganharia 29/07..05/08 de desconto que ele não
-- merece.
--
-- Alternativa considerada e recusada: `companies.created_at`. Seria mais exato
-- para "quando o tenant começou", mas cobra os dias entre o provisionamento e o
-- primeiro uso — decisão de produto que ninguém tomou. Se um dia essa for a
-- regra desejada, é um UPDATE de uma linha.
--
-- ── EFEITO ESPERADO (IBR, recorte de 30 dias) ───────────────────────────────
--   previsto:          385  →  ~165   (13 dias × ~12,8/dia)
--   % do esperado:      32% →  ~75%
--   contagens absolutas: NÃO SE MOVEM (124 execuções, 178 fotos, 1146 tarefas)
--
-- Qualquer mudança em contagem absoluta depois desta migration é regressão.
-- Baseline completo em docs/BASELINE_PRE_FASE2.md.
--
-- ⚠️ MOVE NÚMERO EM PRODUÇÃO. Não é aditiva. Ver o bloco de reversão no fim.
--
-- ✅ APLICADA EM PRODUÇÃO em 11/08/2026 (projeto rjuulamozdhssgqrzfji).
--    Verificação pós-aplicação: total 13, ainda_nulos 0, mais_antigo 2026-07-29.
--
-- Aplicar em: https://supabase.com/dashboard/project/rjuulamozdhssgqrzfji/sql
-- Idempotente (`where created_at is null`).
-- Pré-requisito: 20260730_templates_desativar.sql
-- ============================================================================


-- ── (1) ENSAIO — não escreve nada. Rode ISTO primeiro e confira. ────────────
--
-- Mostra, por empresa, quantos checklists serão tocados e com que data. Se
-- `data_a_gravar` vier NULL para alguma empresa, ela não tem execução nenhuma:
-- o UPDATE abaixo deixa essas linhas em NULL (o `coalesce` não inventa data).
--
--   select t.company_id,
--          count(*)                                   as checklists_sem_data,
--          (select min(c.date) from public.completions c
--            where c.company_id = t.company_id)        as data_a_gravar
--     from public.templates t
--    where t.created_at is null
--    group by t.company_id;


-- ── (2) O BACKFILL ──────────────────────────────────────────────────────────
update public.templates t
   set created_at = (
         select min(c.date)::timestamptz
           from public.completions c
          where c.company_id = t.company_id
       )
 where t.created_at is null
   and exists (select 1 from public.completions c where c.company_id = t.company_id);


-- ── (3) VERIFICAÇÃO ─────────────────────────────────────────────────────────
--
--   select count(*)                                    as total,
--          count(*) filter (where created_at is null)  as ainda_nulos,
--          min(created_at)::date                       as mais_antigo
--     from public.templates;
--
-- Esperado no IBR: total 13, ainda_nulos 0, mais_antigo 2026-07-29.
--
-- Depois disso, reexportar o relatório de 30 dias e comparar com
-- docs/BASELINE_PRE_FASE2.md: o "% do esperado" sobe, as contagens não mudam.


-- ── (4) REVERSÃO ────────────────────────────────────────────────────────────
--
-- Volta ao estado anterior SEM tocar em checklists criados depois desta
-- migration (esses têm `created_at` real, vindo do `default now()`):
--
--   update public.templates t
--      set created_at = null
--    where t.created_at::date = (
--            select min(c.date)::date from public.completions c
--             where c.company_id = t.company_id);
--
-- ⚠️ Isso também zeraria um checklist que tenha sido criado exatamente no dia da
--    primeira execução da empresa. No IBR, em 11/08, não existe esse caso.
-- ============================================================================
