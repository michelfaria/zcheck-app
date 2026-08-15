-- ============================================================================
-- Data de ativação da loja
--
-- O ZCheck sempre tratou "checklist cadastrado" como "checklist cobrado". Isso
-- vale para a loja em regime, e é errado para a loja que está sendo MONTADA:
-- entre criar as lojas, digitar os checklists e treinar a equipe passam dias ou
-- semanas, e todo esse intervalo entrava na conta como operação real — cada dia
-- de montagem virava um dia de 0% de aderência no Painel, e os checklists já
-- apareciam no Executar de quem ainda não tinha sido treinado.
--
-- `active_from` é o dia em que a loja passa a valer: antes dele nada aparece
-- para a equipe e nada conta como execução, atraso ou não-execução.
--
-- NULA de propósito, e sem default. Nulo significa "sempre esteve ativa", que é
-- exatamente o que as linhas já gravadas significam — o parque existente segue
-- idêntico ao que era, sem backfill e sem nada mudar de sentido no histórico.
-- Um default (created_at, hoje) faria o contrário: reescreveria a leitura do
-- passado de toda loja em produção numa migration que ninguém pediu.
--
-- Tipo `date`, não `timestamptz`: o dia de operação do ZCheck é uma STRING
-- YYYY-MM-DD no relógio da loja (ver lib/dates.js). Guardar instante aqui
-- obrigaria a converter na leitura e reabriria o bug de UTC.
--
-- É o irmão de loja do `templates.created_at` (20260730_templates_desativar):
-- nenhum dos dois deixa um cadastro feito hoje reescrever o passado.
--
-- TESTADA com PGlite: node supabase/migrations/20260815_units_active_from.test.mjs
-- ============================================================================

alter table public.units
  add column if not exists active_from date;

comment on column public.units.active_from is
  'Dia em que a loja passa a operar no ZCheck (fuso da própria loja). Antes '
  'dele os checklists não aparecem para a equipe e não contam como execução, '
  'atraso ou não-execução. NULO = sempre ativa. Ver lib/checklists.js '
  '(unitActiveOn) e lib/dates.js.';

-- ── Resultado ───────────────────────────────────────────────────────────────
-- O SQL Editor descarta `raise notice`; o diagnóstico volta como linha.
select coalesce(active_from::text, '(sempre ativa)') as ativa_desde,
       count(*)::text as lojas
  from public.units
 group by 1
 order by 2 desc, 1;
