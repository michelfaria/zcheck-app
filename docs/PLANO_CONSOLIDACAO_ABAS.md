# Plano de consolidação — Painel + J.I.T. + Dados (Relatórios) → uma aba

**Status:** proposta, revisada pelo `project-critic`. Nada implementado.
**Data:** 08/08/2026.

**Escopo de arquivos** (dentro de `ibr-checklists-app/`):

| Arquivo | Papel |
|---|---|
| `app/app/page.js` | as três views, o motor `buildJit`, `ROLE_TABS`, o tour |
| `components/SideNav.js` | `NAV_ITEMS`, `BOTTOM_NAV_ORDER` |
| `app/globals.css` | só **acréscimo** de classes `.zc-painel-*` |
| `lib/appUrlState.js` | alias de deep link `?aba=jit` / `?aba=relatorios` |
| `content/ajuda/**` | 9 artigos citam a aba Relatórios como destino vivo (§F.4) |
| novos: `components/painel/*`, `lib/stats.js` | extração da Fase 1 |

Fora do escopo: `lib/tokens.js`, `borderRadius` global, qualquer migration.

<details>
<summary>O que a revisão crítica mudou nesta versão</summary>

1. **Faixa fixa de 7 dias** (§C.2) — a versão anterior punha o sparkline e o ranking da equipe dentro do segmento analítico, que é gateado. Como o colaborador não recebe o segmento, ele **perderia os dois blocos**. Agora eles vivem numa faixa própria, fora de qualquer controle.
2. **O PDF muda na Fase 2** (§E.3) — `exportPDF` consome `summarizeCompletions` e `groupStats`. O baseline de comparação foi movido para antes da Fase 2, com um segundo baseline entre a 2 e a 5.
3. **A correção de cálculo mora no chamador, não na função** (Fase 2) — `buildJit` chama as mesmas funções; corrigir dentro delas criaria um defeito novo em `trend7` (9134–9138).
4. **Central de Ajuda entrou no escopo** (§F.4) — 9 artigos citam a aba Relatórios, e o assistente de suporte é aterrado neles.
5. **Fase 1 virou 1a + 1b** — as views fecham sobre ~50 símbolos não exportados; mover primeiro criaria ciclo de import.
6. **O portão global de carregamento fica** (§C.6) — ele protege outras cinco abas que não tratam `null`.
7. **`lib/appUrlState.js`, o tour (8721) e `tab: 'relatorios'` do `buildJit` (9067)** entraram na Fase 5.
8. **A troca de motor do ranking não é neutra** (§D.1) — nomes novos entram, posições mudam, `rate === null` e `isMe` precisam de decisão.
9. Linhas do J.I.T. corrigidas (estavam 6 a 25 altas) e contagem da barra inferior de gerência corrigida (7, não 6).

</details>

---

## Sumário da decisão

Consolidar as três abas em **uma só, chamada `Painel`, reusando o id `painel` que já existe**.

Essa escolha não é cosmética — é a garantia mais barata da restrição dura nº 1:
**a linha do colaborador em `ROLE_TABS` não muda uma vírgula.**

```js
// page.js:152 — permanece IDÊNTICO após a consolidação
colaborador: ['executar', 'painel', 'id'],
```

O colaborador nunca teve `jit` nem `relatorios`. Se a aba consolidada se chamasse
`operacao` ou `dados`, seria preciso *conceder* essa nova aba a ele e depois
*retirar* conteúdo por dentro — abrindo a porta para vazamento por esquecimento.
Mantendo `painel`, o vetor de vazamento passa a ser só um: um bloco novo
renderizado sem gate dentro do componente. É um único ponto de auditoria.

A aba organiza o conteúdo em **três registros temporais** (AGORA / DIA / PERÍODO),
não em um seletor único de período. O motivo está em §C.2.

---

# A. Inventário lado a lado

Legenda de papel: **T** = todos (inclui colaborador) · **M** = `MANAGER_ROLES`
(`lideranca`, `gerencia`, `gestao`, page.js:159) · **G** = `canSeeAllUnits`
(`currentUser.unitId == null`, page.js:12446) · **IBR** = travado em `unit.id === 'ibr1'`.

## A.1 — Aba PAINEL (`PainelView`, page.js:2452–3017; render 12719)

Recorte base: `today = todayStr(tzOf(unit))` (2458) · `yesterday = addDays(today,-1)` (2529) · `last7 = lastDays(7, today)` (2531).

| # | Bloco | Linha | Serve a quem | Deriva de | Recorte | Interativo |
|---|---|---|---|---|---|---|
| P1 | Navegador de data (‹ › + `input date`, `max=today`) | 2571 | T | estado `selectedDate` (2459) | um dia, trava no futuro (2480) | sim — reescala P3–P8 |
| P2 | Seletor de setor (Geral/Salão/Cozinha) | 2586 | M + **IBR** (2477) | `unit.sectors`, nomes literais `'Salão'`/`'Cozinha'` (2472) | — | sim — troca escopo |
| P3 | Comparativo de setores | 2597 | M + IBR | `calcRate` (2490) sobre `templates`+`completions`+`closures` | `viewDate` + `last7` | sim — cada card troca o escopo da tela |
| P4 | Comparativo entre lojas | 2632 | **G** | `units`, `calcRate` | `viewDate`, `yesterday`, `last7` | não |
| P4a | └ RankBadge / ordenação | 2676, 2689 | G | `sortedUnits` | `viewDate` | não |
| P4b | └ Breakdown por turno | 2717 | G | `turnoRate` (2659) — **não filtra setor nem closures** | `viewDate` | não |
| P4c | └ Sparkline 7d por loja | 2729 | G | `last7u` | `last7` | não |
| P4d | └ vs média 7d | 2698 | G | `calcRate` × `last7` | `last7` | não |
| P5 | Ranking do dia (entre lojas) | 2746 | G, some se <2 lojas (2755) | `calcRate` por loja | `viewDate` | não |
| P6 | Estado "Loja fechada" | 2777 | T | `isUnitClosed` (733) | `viewDate` | não — suprime P7..P11 |
| P7 | Score principal (56px, cor da loja) | 2787 | **T** | `rateToday`, `getRating` (2556) | `viewDate` | não |
| P8 | Ontem / Média 7 dias (delta em pp) | 2813 | **T** | `rateYesterday`, `avg7` | `yesterday`, `last7` | não |
| P9 | Últimos 7 dias (sparkline) | 2844 | **T** | `rates7` (2535) | `last7` — **ignora `viewDate`** | não |
| P10 | Por tipo de checklist (StatusBadge, executor, hora, prazo) | 2864 | **T** | `activeTypes` × `templates`, `templateStatus` (1145), `latestPerRound` (2902) | `viewDate` | sim — botão **Foto** (2925) |
| P11 | Ranking da equipe · 7 dias | 2945 | **T** (colaborador se vê, `isMe` 2955) | `calcRanking` (2510) + `users` | `last7` — **ignora `viewDate`** | não |
| P12 | PhotoModal | 3002 / 2416 | T | `getPhotoUrl` | — | sim |
| P13 | Histórico de notificações (colapsável) | 3012 / 3037–3193 | **M** (gate explícito 3012) | tabela `notification_log` + legado `config.notified_*` | `last7`, `tz = tzOf(unit)` (3043) | sim — expandir, "Tentar de novo" |

**Telemetria do Painel: zero.** Não existe nenhuma chamada `track()` entre 2452 e 3193, e não existe `action_source = 'painel'` no repositório. O Painel só aparece como **destino** de eventos de outros módulos (9381, 9860, 8717).

## A.2 — Aba J.I.T. (`JitPanel` 9311; motor `buildJit` ~8984–9200; `buildInsight` 9227–9308)

Recorte base: `today = todayStr(tzOfUnit(units, scopeUnitId || baseUnitId))` (8984). Papel: **M** em todos os blocos (gate único no acesso, 11804/11866 + `ROLE_TABS`).

### Coluna principal (renderiza no pop-up **e** na página)

| # | Bloco | Linha | Deriva de | Recorte | Interativo |
|---|---|---|---|---|---|
| J1 | Cabeçalho "Sua operação agora" + escopo + "atualizado às HH:MM" | **9610** | `jit.date`, `jit.scopeLabel`, `tick` (9418) | dia do briefing (fuso da loja em escopo) | fechar (só pop-up) |
| J2 | **Você marcou para tratar** (cobrança) | **9622** | `action_plans` abertos com `jitDate !== jit.date` (9330) | dias anteriores; idade via `planAgeDays` (9343) | **Resolvido** → `completeActionPlan`; **Ainda não** (só local, 9354) |
| J3 | **Leitura da operação** (insight) | **~9652** | `buildInsight` — 100% rule-based, **sem chamada de API** | 14d tendência (9232), 7d hotspot, ontem outlier | "Agir sobre isso →" (9375) + 👍👎 (9370) |
| J4 | **Ontem** — Aderência / Completos / Parciais / Críticos pend. | **9695** | `jit.yesterday` (9192), `latestPerRound` | ontem | não |
| J5 | **Hoje** — Previstos / Completos / Parciais / Pendentes / Atrasados | **9709** | `jit.today` (9193), `templateStatus` com `tzOfUnit` (9020) | hoje | não |
| J6 | **Entrega no prazo** (pontualidade) | **9719** | `punctualityStats` (941) sobre `earliestPerRound` | segmento local Hoje / 7 dias (default 7d, 9337) | segmentos período e Loja/Setor (9488) |
| J7 | **Prioridades agora** (3 recomendações) | **9819** | `jit.recommendations` (9199): `critical_hotspot`, `overdue_today`, `low_adherence`, `all_good` | mistos (hotspot 7d terminando ontem) | card → navega; **Tratar** → cria `action_plan` (9388) |
| J8 | **Situação por loja** | **9843** | `jit.stores` (9089); score `overdue*10 + hotspots*5 + pendingToday` | hoje + 7d + ontem | cada loja é botão → `onNavigate` |
| J9 | Micro-survey "O J.I.T. te ajudou a priorizar?" | **9888** | estado local | — | 👍👎 (9401) |
| J10 | Botão "Ir para a operação →" | **9897** | — | — | `onClose` |

> **Aviso ao implementador.** As linhas acima foram corrigidas contra o código em 08/08/2026, mas `page.js` tem 13.309 linhas e qualquer commit as move. **Ancore por string, não por número** — a primeira regra do CLAUDE.md é ler o trecho exato antes de editar. Strings grepáveis: `Sua operação agora`, `pendingPlans.length > 0`, `Prioridades agora`, `Situação por loja`, `jit.recommendations.map`.

### Coluna lateral (**só** `asPage`, 9502–9575)

| # | Bloco | Linha | Deriva de | Recorte |
|---|---|---|---|---|
| J11 | **Base da operação · agora** (unidades, folgas, setores, checklists ativos, pessoas hoje, execuções hoje, evidências hoje, críticos abertos, atrasados) | 9507 | `jit.base` (9180) — lista crua, **sem `latestPerRound`** | hoje |
| J12 | **Aderência · 7 dias** (barras) | 9524 | `jit.trend7` (9143), `summarizeCompletions` | `lastDays(7, today)` |
| J13 | **Por setor · hoje** (top 8) | 9546 | `groupStats(..., 'setor')` (9138) **com `latestPerRound`** | hoje |
| J14 | **Críticos recorrentes** (≥2× em 7d) | 9556 | `jit.criticalTop` (9158) | 7d terminando **ontem** |
| J15 | **Quem executou hoje** (top 5) | 9565 | `collaboratorStats(tFiltered)` (9171) | hoje |

### Memória do J.I.T. (restrição dura nº 3)

| Peça | Local |
|---|---|
| Tabela | `supabase/migrations/20260710_action_plans.sql` |
| Carga (gate `MANAGER_ROLES`) | `page.js:11804` → `fetchActionPlans` (`lib/sync.js:1134`) |
| Criação | `actionRec` (9388) → `handleCreatePlan` (11809) → `createActionPlan` (`sync.js:1153`) |
| Merge otimista no mount | 9315–9322 (recomendação com plano aberto nasce "No plano") |
| Cobrança no dia seguinte | `pendingPlans` (9330), render 9651 |
| Baixa | `resolvePlan` (9345) → `completeActionPlan` (`sync.js:1176`) |
| Anti-duplicata | índice parcial `action_plans_open_unique (company_id, rec_id) where status='open'` (migration:39) |
| ⚠️ Divergência de coluna | a migration cria **`briefing_date`** (`20260710_action_plans.sql:22`); `lib/sync.js` grava e lê **`jit_date`** (1156, 1123). `grep -rn "jit_date" supabase/` → 0 resultados. **Ver Fase 0** |

### Telemetria do J.I.T. — `action_source` (coluna real, `lib/track.js:125`)

| Linha | Evento | `source` |
|---|---|---|
| 9350 | `action_plan_completed` | `'jit'` |
| 9362 | `ai_insight_viewed` | `'jit'` |
| 9373 | `ai_insight_feedback` | `'jit'` |
| 9379 | `ai_insight_actioned` | `'jit'` |
| 9385 | `recommendation_clicked` | `'jit'` |
| 9392 | `recommendation_actioned` | `'jit'` |
| 9396 | `action_plan_created` | `'jit'` |
| 9403 | `survey_answered` | `'jit'` |
| 9361 / 9365 / 9490 | `jit_opened` / `jit_dwell` / `jit_punctuality_filtered` | `openSource` = `'auto'` \| `'manual'` \| `'menu'` |
| 11893 | `jit_skipped` | `'auto'` |

## A.3 — Aba RELATÓRIOS / "Dados" (`ReportsView`, page.js:3286–3972; render 12756)

Papel: **M** (via `ROLE_TABS`). `reportTz = tzOf(unit)` (3302); `dates = periodDates(...)` (3319 → 766).

### Filtros (coluna esquerda, `.zc-rep-filters`, sticky no desktop)

| Filtro | Estado | UI | Observação |
|---|---|---|---|
| Período | `period` (3298), default `'7d'` | 3603 | `PERIODS` (756): today/7d/30d/month/all/custom |
| Mês | `selectedMonth` (3305) | 3610 | só se `period==='month'` |
| De / até | `customFrom`/`customTo` (3303) | 3627 | só se `period==='custom'` |
| Agrupar por | `groupBy` (3316) | 3641 | tipo \| setor |
| Setor | `filterSector` (3314) | 3647 | opções hardcoded p/ `'ibr1'` (3349) |
| Colaborador | `filterUserId` (3315) | 3656 | — |
| Loja | `filterUnitId` (3306) | **sem UI** | espelha o header (3309) |
| Turno | `filterShift` (3315) | **sem UI** | **filtro morto** — setter nunca chamado |
| Só pendentes | `soPendentes` (3291) | 3843 | só se `canReview` |

### Blocos

| # | Bloco | Linha | Deriva de | Recorte | Papel |
|---|---|---|---|---|---|
| R1 | 4 StatCards: Checklists concluídos / Tarefas concluídas / Críticos pendentes / Fotos registradas | 3668 | `summarizeCompletions` (837) — **sem `latestPerRound`**; denominador `expectedChecklists` (3345) | `period` | M |
| R2 | Nível de realização por colaborador | 3692 | `collaboratorStats` (860) — **com `latestPerRound`**, credita `doneBy` | `period` | M |
| R3 | Realização por grupo (tipo/setor) | 3716 | `groupStats` (898) — **sem `latestPerRound`** | `period` | M |
| R4 | Produtividade · score 100 = média da empresa | 3737 | `computeProductivity` (983) — pts/h, baseline sem filtro (3357) | `period` | M; sub-bloco "Por loja" exige **G** (3757) |
| R5 | Desempenho por dia da semana | 3792 | agrupa `filtered` por `getDay()` — **usa fuso do navegador** (3796) | `period` | M |
| R6 | Execuções do período (25/página) | 3841 | `filtered` ordenado por `completedAt` | `period` | M |
| R6a | └ etiqueta "· fora do prazo" | 3883 | `completionOnTime` (10175) — sobre a completion crua | por linha | M |
| R6b | └ botão **Conferir** / "Conferido por" | 3897 / 3891 | RPC `review_completion` | — | `canReview` (3294) = M |
| R7 | **Exportar CSV** | 3939 → `exportCSV` (3373) | `filtered` | `period` + filtros | M |
| R8 | **Exportar PDF** | 3946 → `exportPDF` (3405–3600) | ver §E | `period` + filtros | M |

### Telemetria de Relatórios

Uma só: `completion_reviewed` com `source: 'relatorios'` — **page.js:12284**, dentro de `reviewCompletionAndSync` (o `onReview` de 12757), com o valor **hardcoded**. Nenhum `track()` dentro de `ReportsView`: troca de período, filtro, `exportPDF` e `exportCSV` são invisíveis.

---

# B. Matriz de sobreposição

Categorias: **D** duplicata literal · **R** mesmo dado / recorte diferente · **U** único · **C** parece redundante mas é contexto necessário.

| Bloco | Linha | Aba | Cat | Sobrevive | Por quê |
|---|---|---|---|---|---|
| P1 Navegador de data | 2571 | P | C | **Sim** — vira cabeçalho do registro DIA | Seleciona um **ponto**; `period` seleciona uma **janela**. Não são o mesmo controle |
| P2 Seletor de setor | 2586 | P | D | **Não** — absorvido pelo filtro Setor (3647) | O de Relatórios funciona em qualquer loja; o do Painel é `unit.id==='ibr1'` |
| P3 Comparativo de setores | 2597 | P | C | **Sim, como controle** | Único bloco de setor **clicável** que troca o escopo da tela; não é terceira leitura estatística |
| P4 Comparativo entre lojas | 2632 | P | U | **Sim** | Única cobertura por loja num dia navegável |
| P4b Turno | 2717 | P | U | **Sim, com ressalva** | Único corte por turno vivo (`filterShift` está morto). Mas ignora o filtro de setor do card que o contém |
| **P5 Ranking do dia** | **2746** | **P** | **D** | **NÃO** | **Duplicata interna**: mesmos dados, mesma ordenação e o mesmo `RankBadge` já renderizados em P4/P4a |
| P6 Loja fechada | 2777 | P | C | **Sim** | 0% em loja fechada lê como falha. Terceira implementação da mesma verdade (vs `openDates` 3340 e `closedToday` 9094) |
| P7 Score principal | 2787 | P | R+C | **Sim**, fundido com J5 | % de tarefas ≠ contagem de checklists. Ver §B.2 |
| P8 Ontem / Média 7d | 2813 | P | R | **Sim**, enriquecido com J4 | Comparação de referência fixa — reescalar destrói o que mede |
| P9 Sparkline 7 dias | 2844 | P | D (forma) | **Sim, esta versão** | Vence J12 pela restrição dura: é a única sem gate. Adota a **apresentação** de J12 |
| P10 Por tipo de checklist | 2864 | P | U | **Sim** | Nominal e operacional (nome, executor, hora, prazo, status, foto). R3 é agregado sem nome |
| P11 Ranking da equipe | 2945 | P | D | **Cartão sim, motor não** | Ver §B.1 |
| P12 PhotoModal | 3002 | P | C | **Sim** | Infra compartilhada com R6 |
| P13 Notificações | 3012 | P | U | **Sim, gate mantido** | Única superfície de `notification_log` |
| J1 Cabeçalho | 9622 | J | U | **Sim** | Vira cabeçalho da seção AGORA |
| J2 Você marcou para tratar | 9651 | J | U | **Sim** | Única memória entre sessões do app |
| J3 Leitura da operação | 9664 | J | U | **Sim** | Único bloco que costura 14d + hotspot + outlier numa frase |
| J4 Ontem | 9707 | J | R | **Sim**, funde em P8 | Aderência **checklist-level** — métrica diferente de P8 |
| J5 Hoje | 9717 | J | R+C | **Sim**, funde em P7 | É o **denominador que P7 esconde** |
| J6 Entrega no prazo | 9734 | J | U | **Sim** | Único agregado de pontualidade. R6a é o drill-down, não equivalente |
| J7 Prioridades agora | 9825 | J | U | **Sim** | Único bloco acionável (cria `action_plan`) |
| J8 Situação por loja | 9863 | J | U | **Sim** | Score de **urgência**, não de aderência. Ver §B.3 |
| J9 Micro-survey | 9906 | J | U | **Sim** | Instrumentação de produto |
| J10 "Ir para a operação" | 9922 | J | — | **Não** | Era a saída do pop-up; na aba única o destino já é a mesma tela |
| J11 Base da operação | 9507 | J | D **parcial** | **Sim, 5 das 8 células** | Ver §B.4 |
| **J12 Aderência · 7 dias** | **9524** | **J** | **D** | **NÃO** (cálculo) / **Sim** (apresentação, migra p/ P9) | Mesma série que P9, com denominador inflado e gate que o colaborador não tem |
| **J13 Por setor · hoje** | **9546** | **J** | **D** | **NÃO** — mas seu `latestPerRound` **migra para R3** | Literalmente a mesma `groupStats(...,'setor')`. Só muda o período |
| J14 Críticos recorrentes | 9556 | J | U | **Sim** | Único bloco que **nomeia** o item que reincide |
| **J15 Quem executou hoje** | **9565** | **J** | **R** | **Não como bloco** — vira o valor "hoje" do ranking único | É `collaboratorStats(...).slice(0,5)`: o mesmo motor de R2 |
| R1 StatCards | 3668 | R | R / D parcial | **Sim, corrigido** | Absorve 3 células de J11. Precisa herdar `latestPerRound` |
| R2 Nível por colaborador | 3692 | R | D de P11 | **Sim, o motor** | Ver §B.1 |
| R3 Realização por grupo | 3716 | R | D de J13 · R vs P10 | **Sim, corrigido** | Vence por afordância; **importa** o `latestPerRound` de J13 |
| R4 Produtividade | 3737 | R | U | **Sim** | Única métrica de **ritmo** (pts/h). Ortogonal a aderência |
| R5 Dia da semana | 3792 | R | U | **Sim, com ressalva** | Única leitura de sazonalidade; hoje usa o fuso do navegador |
| R6 Execuções do período | 3841 | R | U | **Sim** | Única lista nominal de execuções e única porta de conferência |
| R7/R8 Exportar | 3937 | R | U | **Sim** | Única saída fora do app. Ver §E |

## B.1 — Ranking de pessoas: P11 vs R2 vs J15 (**D confirmada**)

Três blocos, um motor. `calcRanking` (2510) perde em todos os critérios:

- **Correção**: não aplica `latestPerRound` (reexecução conta a pessoa duas vezes) e credita tudo a `operatorUserId` (2517), **ignorando `doneBy`** — quem divide um checklist não recebe crédito. `collaboratorStats` (860) resolve os dois; o comentário em 855–859 documenta que isso foi decisão consciente de produto.
- **Riqueza**: `collaboratorStats` devolve `tasksDone`, `criticalDone`, `criticalPending`, `photos`, `last`. `calcRanking` devolve três campos.
- **Afordância**: R2 tem período e filtro por pessoa; P11 é 7d travado.

**Decisão:** sobrevive o **motor `collaboratorStats`** com o **cartão visual de P11** (RankBadge, avatar, papel, destaque `isMe`). R2 renderiza lista chapada sem pódio e sem "você" — P11 é reconhecimento, não relatório, e é isso que justifica ele não ter gate.

**Duas condições inegociáveis** (restrição dura nº 1):
1. Os campos extras de `collaboratorStats` (`criticalPending`, `last`) só renderizam sob `MANAGER_ROLES`. Sem gate, o cartão mostra exatamente os mesmos campos de hoje: posição, nome, cargo, %, tarefas, checklists.
2. Para o colaborador o período é **fixo em 7 dias** — ele não recebe o seletor. Se o default mudasse, a leitura que ele tem hoje mudaria de significado.

**J15** é o mesmo motor com janela = hoje. Vira um valor do seletor, não um bloco.

## B.2 — Score do dia: P7/P8 vs J4/J5 (**refutada como D, confirmada como C**)

Unidades diferentes: P7 é **% de tarefas**; J5 é **contagem de checklists** (previstos/completos/parciais/pendentes/atrasados). "82%" e "9 de 13, 2 atrasados" não são a mesma frase — e **o percentual sozinho mente**: 82% pode ser 13 checklists a 82% ou 9 perfeitos e 4 nunca abertos.

**Decisão:** um cartão fundido — o score de 56px de P7 (é o que dá identidade ao Painel e o que o colaborador reconhece), com a linha `n/N + atrasados` de J5 abaixo, e o par Ontem/Média 7d de P8 ao lado, enriquecido com a aderência checklist-level de J4.

**Verificação da restrição nº 1:** o enriquecimento não expõe nada novo ao colaborador. "Atrasados" ele já vê hoje via `StatusBadge` com status `overdue` em P10; "previstos" ele deriva contando os cartões. É reagrupamento, não elevação de privilégio.

## B.3 — Lojas: P4 vs J8 vs R4 "Por loja" (**refutada**)

Três perguntas diferentes sobre a mesma entidade:

| Bloco | Pergunta | Ordenação |
|---|---|---|
| P4 (2632) | "quem está melhor no dia X?" | desempenho, dia navegável |
| J8 (9863) | "onde eu olho primeiro **agora**?" | urgência (`overdue*10 + hotspots*5 + pendingToday`, 9103) |
| R4 (3757) | "onde o **ritmo** é maior?" | pts/h vs média da empresa |

Uma loja com 95% de conclusão e um checklist atrasado sobe ao topo de J8 e ao topo de P4 — em direções opostas. Todos sobrevivem; o ganho da consolidação aqui não é eliminar, é **ordenar**: J8 (urgência) → P4 (desempenho) → R4 (ritmo).

## B.4 — Base da operação (J11) vs StatCards (R1) — **D parcial**

Três das oito células de J11 duplicam R1 no recorte "hoje", vindas da mesma `summarizeCompletions` sobre o mesmo dia:

| Célula J11 | Duplica |
|---|---|
| execuções hoje (9513) | "Checklists concluídos" (3670) |
| evidências hoje (9514) | "Fotos registradas" (3685) |
| críticos abertos hoje (9515) | "Críticos pendentes" (3680) |

**R1 sobrevive** (tem período e filtros; J11 é hoje-travado sem filtro). As outras cinco células (unidades, folgas, setores, checklists ativos, pessoas executando hoje) são **estrutura de cadastro, não execução** — não existem em nenhum outro lugar do app e não pertencem ao eixo de período. Viram bloco próprio, fora do seletor.

## B.5 — Suspeitas **refutadas** (não consolidar)

| Par | Veredito |
|---|---|
| P10 (2864) vs R3 (3716) | Granularidades incomparáveis: P10 é **nominal e operacional** (nome, executor, hora, prazo, status, foto); R3 é **agregado estatístico** (uma barra de % por tipo). P10 é a razão de o Painel existir para quem executa |
| J14 (9556) vs R1 "Críticos pendentes" (3680) | R1 é **contagem**; J14 é **lista nominal de reincidência** (qual item, qual loja, quantas vezes em 7d). Relação agregado → drill-down |
| J6 (9734) vs R6a (3883) | R6a é etiqueta por linha, sem taxa, sem agrupamento, sem tratar `noDeadline`. J6 é o único agregado. Relação agregado → drill-down |
| P4 vs J8 vs R4 | §B.3 |
| P7/P8 vs J4/J5 | §B.2 |

## B.6 — Bloqueador: quatro fórmulas concorrentes de "aderência"

Isto **precisa ser decidido antes de desenhar**. Hoje só não aparece porque os blocos moram em abas separadas; na aba única eles ficam a centímetros um do outro mostrando números diferentes para a mesma pergunta.

| Fonte | Fórmula | Checklist não submetido | Reexecução |
|---|---|---|---|
| `calcRate` (2490) — Painel | feitas ÷ **previstas** | conta 0/N (penaliza) | usa a **primeira** submissão (subconta) |
| `trend7` (9132) — J12 | feitas ÷ **submetidas** | não entra | **duplica** |
| StatCard "Tarefas" (3675) | feitas ÷ **submetidas** | não entra | **duplica** |
| `yAdherence` (9011) — J4 | completos ÷ previstos, com `latestPerRound` | conta como falta | **correto** |

**Decisão proposta (default, ver §H-Q1):** `latestPerRound` + denominador **previsto** viram o padrão da aba, e os nomes passam a distinguir o que medem:
- **"Cobertura do previsto"** — feitas ÷ previstas (o que P7 já faz)
- **"Entrega completa"** — checklists 100% ÷ previstos (o que J4 faz)
- **"Realização do entregue"** — feitas ÷ submetidas (o que R1 faz hoje, renomeado)

E R1 (3668) herda o `latestPerRound` que o `buildJit` já aplicou (comentário 8996–9001). Sem isso, `summary.checklists / expectedChecklists` **pode passar de 100%** — é o bug de "146% de aderência" que o J.I.T. corrigiu e que Relatórios nunca recebeu. **A consolidação promoveria o bloco defeituoso e apagaria o corrigido.**

## B.7 — Reconferência de §A/§B contra o código pós-merge (10/08, após a Fase 1b)

O merge da main (16 commits: ranking + fila de conferência) mudou o terreno que §A e §B fotografaram. Varredura feita bloco a bloco no código atual (`components/painel/*.js`):

**B.1 — SUPERADA. A main já resolveu a sobreposição, e escolheu o outro motor.**
`calcRanking` foi **removido** (não existe mais no repo; só citado em comentário histórico, `PainelView.js:123-135`). O ranking do Painel (P11) agora é literalmente o da aba Equipe: `computeOperationalProfile` com `rankingPeriod('month')`, mesma ordenação, mesma frase explicativa (`PainelView.js:140-153`). A decisão de B.1 ("sobrevive `collaboratorStats` com o cartão de P11") **não vale mais**: a main escolheu o **índice operacional mensal**, não o % de realização em 7 dias.

Consequências:
1. A "duplicata D confirmada" P11 vs R2 vira **refutada**: P11 mede índice composto mensal; R2 (`ReportsView.js:981`, `collaboratorStats`) mede % de realização com filtros de período. São perguntas diferentes — mesmo padrão de B.3. R2 sobrevive como está, no segmento analítico.
2. A condição inegociável nº 2 de B.1 ("colaborador com período fixo em 7 dias") ficou **sem objeto**: o colaborador já vê hoje, em produção via main, o ranking mensal por índice. A linha de base de §D.1 é o Painel ATUAL, que inclui essa mudança.
3. J15 (por colaborador hoje, no J.I.T.) continua `collaboratorStats` com janela = hoje — segue como valor de seletor de R2, como planejado.

**B.2 — VALE.** `calcRate` continua na `PainelView.js:78` com a mesma fórmula; J4/J5 continuam no `buildJit`. A decisão do cartão fundido segue de pé.

**B.3 — VALE.** Os três blocos de loja continuam com as três perguntas. O "Ranking do dia" (duplicata interna, hoje `PainelView.js:358`) continua existindo e continua marcado para eliminação na Fase 3.

**B.4 e B.5 — VALEM.** Conferido por amostragem: J11, R1 e os pares refutados continuam com as mesmas fontes.

**B.6 — VALE, e continua sendo o bloqueador.** As quatro fórmulas concorrentes de aderência continuam todas vivas: `calcRate` (`PainelView.js:78`), `trend7` (`JitPanel.js:208`), StatCard "Tarefas concluídas" (`ReportsView.js:1341`, `summary.rate`), `yAdherence` (no `buildJit`). Nada da main tocou nisso.

**A.3 — INVENTÁRIO INCOMPLETO: a aba Dados ganhou um segmento inteiro.**
A `ReportsView` agora abre em **dois modos** (`vista`, `ReportsView.js:884`): **Conferir** (default para quem revisa) e **Análise** (todo o conteúdo antigo). O modo Conferir contém a `ConferenceQueue` (`ReportsView.js:109`) — fila agrupada por checklist, ordenada por gravidade (`lib/conferencia.js`), com contagem de pendências no rótulo do seletor. Colaborador não vê o seletor (`canReview`, linha 869-884) — irrelevante para a restrição nº 1, já que colaborador nem tem a aba.
Consequência para a Fase 3: a fila de Conferir é **fila de trabalho, não análise** — pertence ao registro AGORA da aba consolidada (ao lado das prioridades do J.I.T.), não ao segmento de PERÍODO. Isso é uma decisão nova de arquitetura que §C não previu; default proposto: Conferir vira seção do registro AGORA, visível só para `canReview`, mantendo a contagem no cabeçalho.

---

# C. Arquitetura da aba consolidada

## C.1 — Nome

| Candidato | `short` | Prós | Contras |
|---|---|---|---|
| **Painel** ✅ | dispensa (6ch cabem nos ~57px) | Único dos três destinos que **todos os papéis já têm**. `tab='painel'` já é fallback (11606) e já é alvo do `onClose` do J.I.T. (12735). Zero palavra nova. **`ROLE_TABS.colaborador` não muda** | Subdimensiona: o gestor pode não procurar exportação ali |
| Operação | — | Cobre os três horizontes | Não tem `short` honesto ("OPERAÇÃO" ≈ 70px, não cabe); **colide com `group: 'Operação'`** do rail — leitor de tela anunciaria "Operação, Operação" |
| Desempenho | Desemp. | Nomeia o resultado | Abreviação com ponto, padrão inexistente no app; soa avaliativo para o colaborador, que usa o Painel como espelho |
| J.I.T. | J.I.T. | Único dos três com identidade conceitual própria; gestor já reconhece (85 sessões medidas) | Ver abaixo — **avaliado e recusado em 11/08** |

**Escolha: `Painel`, mantendo `id: 'painel'`.**

```js
{ id: 'painel', label: 'Painel', icon: LayoutGrid, group: 'Operação' }
```

Mitigação do contra: a ação **Exportar** sobe para o cabeçalho da seção *Registros*. Hoje ela está em 3937, **depois** da lista paginada de 25 execuções — genuinamente inalcançável no celular.

### Por que `J.I.T.` foi recusado como nome da ABA (decisão de 11/08)

Proposta do dono do produto: estender o conceito Just In Time — "veja como sua operação está agora" — para cobrir também o histórico. Recusada por quatro motivos, do mais grave ao menos:

1. **O colaborador nunca viu esse nome.** `ROLE_TABS.colaborador` é `['executar','painel','id']`; o J.I.T. é gated para gestão. Nomear a aba consolidada de J.I.T. faria a tela mais usada do maior grupo de usuários passar a se chamar com uma sigla inglesa do sistema Toyota de produção — e o "Painel" que ele conhece sumiria. Junto vem o custo técnico: reusar `id: 'painel'` é o que mantém a linha do colaborador em `ROLE_TABS` **intocada**, que é a prova mais barata da restrição dura nº 1. Renomear obriga a mexer exatamente na linha que a restrição pede para não mexer.
2. **O nome contradiz o conteúdo.** Just In Time é um conceito anti-estoque: só o necessário, exatamente quando necessário. A aba consolidada passa a ter 30 dias de histórico, exportação e tendência. Um nome que precisa de nota de rodapé para explicar por que significa o oposto do que diz não é nome, é enigma.
3. **O público.** Gerente de turno de restaurante. "Entrega completa" já corria o risco de ser lido como delivery; "J.I.T." não vira nem palpite errado.
4. **A marca J.I.T. não é ativo consolidado.** Em 85 sessões medidas, o botão "Tratar" foi clicado **zero** vezes espontaneamente (§Fase 0). É tela olhada, não tela agida — não é uma marca forte que valha carregar para o resto do produto.

**O que foi preservado da proposta.** O conceito vale onde é verdade: o primeiro registro temporal da aba passa a se chamar **`Agora`** na tela — é lá que vivem as prioridades, os atrasados, o insight e a fila de Conferir (§B.7). Se o termo J.I.T. for desejado como assinatura, ele cabe no subtítulo dessa seção, não no rótulo da aba.

⚠️ Precisão que a restrição dura nº 1 exige: `Agora` é a primeira seção **para quem tem `MANAGER_ROLES`**. Para o colaborador a seção não existe — a primeira dobra dele continua sendo o registro DIA (§C.5, linha "O colaborador **nunca** vê AGORA"). O nome novo não altera em nada o que ele enxerga.

**Objetivo primário da aba (1 frase):** dizer, numa tela, se a operação está em dia e o que fazer a respeito — e só depois provar com o histórico.

## C.2 — Decisão temporal: três registros, não um seletor

**Rejeitado (a) seletor único que reescala tudo.** Obriga um horizonte a mentir. "Prioridades **agora**", "Atrasados **agora**", "críticos abertos **hoje**" não têm leitura a 30 dias. E o delta Ontem/Média 7d (P8) é uma **comparação de referência fixa** — reescalar destrói o que ele mede. O próprio app já provou: J6 carrega um segmento local Hoje/7 dias (9339) porque nenhum controle global bastava.

**Rejeitado (b) horizontes imutáveis puros.** Eliminam "o que aconteceu no dia 12?" e "me dá o mês para a reunião" — a razão de existir de Relatórios. Perderíamos `custom`, `month` e `all`.

**Adotado (c) híbrido, formalizado em três registros.** Cada bloco pertence a exatamente um:

| Registro | Controle | Escopo | Blocos |
|---|---|---|---|
| **AGORA** | nenhum — relógio real, fuso da loja | imutável | J1, J2, J3, J7, J11 (5 células de estrutura) |
| **DIA** | navegador ‹ › + `input date`, `max = todayStr(tzOf(unit))` | uma data | P7+J5, P8+J4, P10, P3, P4 (com P5 absorvido), P6 |
| **7 DIAS FIXO** | nenhum — janela imutável | 7 dias a partir de `today` | **P9** (aderência por dia), **P11+R2** (ranking de pessoas) — os dois blocos sem gate |
| **PERÍODO** | `Dia selecionado · 7 dias · 30 dias · Mês · Tudo · Personalizado` (default **7 dias**) | intervalo | R1, J6, R5, R3, R4, R6, J14, P13, Exportar |

**Por que existe um quarto registro de 7 dias fixo.** É a resolução de uma colisão real entre a
revelação progressiva (§C.4) e a restrição dura nº 1: P9 (2844) e P11 (2945) são blocos **sem gate**
que o colaborador vê hoje, e o colaborador **não recebe o seletor de período** (§D). Se esses dois
blocos morassem dentro do registro PERÍODO, eles viveriam atrás de um controle que o colaborador não
tem — e ele os perderia. Ficam numa faixa fixa de 7 dias, **fora do segmento**, idêntica para todos os
papéis. O gestor que quiser a mesma leitura em 30 dias usa os equivalentes com filtro dentro do
segmento (R1 e R3), que são blocos diferentes com títulos diferentes.

Consequência assumida: um gestor com o seletor em "30 dias" vê "Ranking da equipe · 7 dias" logo
acima de StatCards de 30 dias. O rótulo de cada bloco carrega sua própria janela — é por isso que
todos os títulos dessa faixa terminam em `· 7 dias`.

Os 14 dias de tendência e o outlier de ontem do `buildInsight` (9227–9308) continuam **internos** ao registro AGORA — são entradas da regra, não horizontes visíveis. Não viram controle.

### O navegador de data (‹ ›) — sobrevive, mudando de status

Deixa de ser controle global no topo e vira **cabeçalho da seção DIA**, rotulado: `Dia · qui, 08 ago`.

Motivo: hoje ele está no topo e **finge governar a página inteira, o que já é falso** — `ranking7` (2945) e `rates7` (2535) usam `last7` derivado de `today`, não de `viewDate`. Mexer nas setas não muda o ranking da equipe nem o sparkline. Consolidar sem corrigir isso multiplicaria a mentira por três abas.

Duas regras fecham as brechas:

1. **`period: 'today'` vira `Dia selecionado`.** A primeira opção do seletor de período **segue** o navegador de dia — acoplamento explícito e unidirecional. Hoje `period='today'` duplica silenciosamente o default do Painel.
2. **Sair de hoje colapsa o registro AGORA.** Quando `viewDate !== today`, a seção AGORA some e é substituída por uma linha: `Você está vendo 12/07 · [Voltar para hoje]`. Sem isso, números ao vivo ficam ao lado de uma data passada e são lidos como se pertencessem a ela.

**Fuso (restrição dura nº 4):** os três registros derivam do **mesmo** `tz = tzOf(unit)`. `today` = `todayStr(tz)`, `dates` = `periodDates(period, ..., tz)`, prazo = `instantAt(data, hora, tz)`. Nenhum recorte novo usa `todayStr()` solto nem `new Date().getDay()`. Isso **corrige** R5 (3796), que hoje agrupa por `getDay()` no fuso do navegador.

## C.3 — Hierarquia e ordem das seções

Primeira dobra por papel:

| Papel | Primeira dobra | Próxima ação óbvia |
|---|---|---|
| colaborador | Score do dia (loja + setor dele) → "O que falta hoje" | `Ir para Rotina →` |
| liderança | AGORA: Leitura + Prioridades → Score do dia | `Tratar` (cria `action_plan`) |
| gerência/gestão | AGORA (escopo = rede ou loja do header) → Comparativo entre lojas | `Tratar` / `Ver loja X` |

O colaborador **nunca** vê AGORA — a primeira dobra dele começa direto no registro DIA.

```
0  CONTEXTO      Header global (loja / Todas as lojas)         já existe, 8087
1  AGORA         [MANAGER_ROLES]
   1.1  Você marcou para tratar                                J 9651
   1.2  Leitura da operação (+ 👍👎)                            J 9664
   1.3  Prioridades agora (até 3, botão Tratar)                J 9825
   1.4  Base da operação · agora (5 células de estrutura)      J 9507  → aside no desktop
2  DIA           ‹ ›  input date  max=hoje                     P 2571
   2.1  Score da loja (56px)  + n/N + atrasados     FUNDE      P 2787 + J 9717
   2.2  Ontem / Média 7 dias (delta pp)             FUNDE      P 2813 + J 9707
   2.3  Por tipo de checklist (StatusBadge, Foto)              P 2864
   2.4  Por setor · hoje                            FUNDE      J 9546 ⊃ P 2597
3  REDE          [canSeeAllUnits && lojas ≥ 2]
   3.1  Comparativo entre lojas                     FUNDE      P 2632 ⊃ J 9863
        (RankBadge, turno, sparkline, vs média 7d)             P 2746 ABSORVIDO
4  FAIXA FIXA · 7 DIAS       SEM seletor, SEM segmento — visível a TODOS os papéis
   4.1  Aderência por dia · 7 dias (cálculo P9 + apresentação J12)  P 2844 ⊃ J 9523
   4.2  Ranking da equipe · 7 dias (cartão P11 + motor R2)          P 2945 + R 3692 ⊃ J 9566
        └ colunas extras (críticos pend., última atividade)  [isManager]
──────────  daqui para baixo, tudo exige isManager  ──────────
5  SEGMENTO      faixa PERÍODO [seletor] + [Exportar ▾] + (Tendência)(Pessoas)(Registros)
   5.A  Tendência
        4 StatCards                                            R 3668
        Entrega no prazo (segmento local Loja/Setor)           J 9719
        Desempenho por dia da semana                           R 3792
   5.B  Pessoas
        Realização por grupo (tipo/setor)                      R 3716
        Produtividade (empresa/loja/setor)                     R 3737
   5.C  Registros
        Execuções do período (25/pág, Foto, Conferir)          R 3841
        Críticos recorrentes                                   J 9557  → aside no desktop
        Histórico de notificações                              P 3012  → aside no desktop
```

**Blocos eliminados: 8** — P2, P5, J10, J12(cálculo), J13, J15, e 3 células de J11.

**A fronteira de acesso é uma linha só.** Tudo acima da faixa fixa é ou sem gate, ou
`isManager` bloco a bloco (seções 1 e 2.4). Tudo a partir da seção 5 está **inteiro** dentro de
um único `{isManager && ( … )}` — a faixa PERÍODO, o botão Exportar e os três segmentos ficam
dentro do mesmo condicional. Um bloco novo acrescentado ali herda o gate por construção, e é
isso que torna a auditoria de §D.1 barata: só os blocos **acima** dessa linha precisam ser
verificados um a um.

## C.4 — Revelação progressiva: três camadas

| Mecanismo | Veredito |
|---|---|
| Sub-abas internas como página inteira | **Rejeitado** — recria as três abas que estamos removendo e mata o "de relance" |
| Acordeões | **Só para apoio.** Conteúdo colapsado é invisível; nascer fechado tira o Comparativo entre lojas do radar. 12 acordeões viram lista de rótulos |
| Seções condicionais puras | **Base obrigatória, insuficiente** — é o que já existe e é o que produz a página de 6 metros |
| Colunas laterais no desktop | **Sim, sem CSS novo** — `.zc-jit-page` já é `1.55fr / minmax(300px,1fr)` (globals.css:269–281). Mas resolve só ≥1024 |

**Camada 1 — Fusão.** As 8 eliminações de §C.3, antes de qualquer cromo. Acordeão sobre conteúdo redundante esconde o problema, não o resolve.

**Camada 2 — Duas colunas no desktop.** Reusa `.zc-jit-page`. Vai para a aside o que é **consulta e não decisão**: Base da operação (J11), Críticos recorrentes (J14), Quem executou hoje, Notificações (P13). A coluna principal mantém medida de leitura (`max-width: 720px`, já definido).

**Camada 3 — Um segmento, escopado ao terço analítico.** `( Tendência ) ( Pessoas ) ( Registros )` troca **só** o conteúdo da seção 5. AGORA, DIA, REDE e a **faixa fixa de 7 dias** são sempre renderizadas, nunca atrás de controle — e é justamente por isso que os dois blocos sem gate (aderência 7d e ranking da equipe) ficam na faixa fixa, e não no segmento: um controle que o colaborador não tem não pode governar conteúdo que ele precisa ver.

Por que isso não é voltar às três abas: as abas antigas eram três *ferramentas* com três estados independentes e três pontos de entrada concorrentes. O segmento é uma *lente* sobre um terço da página, com o contexto (loja, dia, período) preservado acima e visível o tempo todo. Estado persistido em `localStorage` (`zc_painel_seg_<userId>`).

**A conta da rolagem:**

| | blocos |
|---|---|
| gestão, hoje, somando as 3 abas | ~29 |
| depois das fusões | ~21 |
| coluna principal ≥1024 (aside leva 4) | ~15 |
| visível de uma vez no mobile (9 fixos + 1 segmento) | **~13** |

## C.5 — Wireframes textuais

Legenda de origem: **P**=Painel · **J**=J.I.T. · **R**=Relatórios · **N**=novo.

### Colaborador — mobile 390px

Sem seletor de período, sem segmento, sem AGORA. Todos os horizontes fixos.

```
┌────────────────────────────────────┐
│ ☰  IBR Centro           👤 Ana     │  header (sem seletor de loja)
├────────────────────────────────────┤
│  ‹    DIA · HOJE, qui 08 ago     › │  P 2571
│ ┌────────────────────────────────┐ │
│ │ IBR CENTRO · SALÃO             │ │  P 2787
│ │ 87%                     ★★★★☆  │ │
│ │ Bom                            │ │
│ └────────────────────────────────┘ │
│  Ontem 82% ▲5    7 dias 84% ▲3     │  P 2813
├────────────────────────────────────┤
│ O QUE FALTA HOJE                   │  P 2864 (renomeado)
│  ▸ Abertura Salão      6/8   [📷]  │
│  ▸ Fechamento Salão    0/9    ⏱    │
│  [ Ir para Rotina →              ] │  N
├────────────────────────────────────┤
│ SEUS 7 DIAS                        │  P 2844 c/ apresentação de J 9524
│  84%  ▁▃▅▇▆▇█                      │
│  seg ter qua qui sex sáb dom       │
├────────────────────────────────────┤
│ RANKING DA EQUIPE · 7 DIAS         │  P 2945 c/ motor collaboratorStats
│  1  Ana Souza            94%       │
│  2  VOCÊ                 88%  ◀    │
│  3  Bruno Lima           81%       │
└────────────────────────────────────┘
[ Rotina ][ PAINEL ][ Meu ID ]
```

### Colaborador — desktop ≥1024px

```
┌────────┬──────────────────────────────────┬──────────────────────┐
│ RAIL   │  ‹  DIA · HOJE, qui 08 ago    ›  │ SEUS 7 DIAS       P  │
│ 240px  │ ┌──────────────────────────────┐ │  84% ▁▃▅▇▆▇█         │
│        │ │ IBR CENTRO · SALÃO           │ │                      │
│Executar│ │ 87%                  ★★★★☆   │ ├──────────────────────┤
│▸PAINEL │ │ Bom                          │ │ RANKING · 7 DIAS  P  │
│ Meu ID │ └──────────────────────────────┘ │  1 Ana        94%    │
│        │  Ontem 82% ▲5   7 dias 84% ▲3   │  2 VOCÊ ◀     88%    │
│ ────── │ ─────────────────────────────── │  3 Bruno      81%    │
│ HOJE   │ O QUE FALTA HOJE             P  │                      │
│ IBR    │  ▸ Abertura Salão   6/8  [📷]   │                      │
│ Centro │  ▸ Fechamento Salão 0/9   ⏱    │                      │
│ qui 08 │  [ Ir para Rotina → ]           │                      │
└────────┴──────────────────────────────────┴──────────────────────┘
```

### Liderança (loja fixa, `unitId` preenchido) — mobile 390px

Ganha AGORA, seletor de período e segmento. **Não** ganha REDE nem seletor de loja.

```
┌────────────────────────────────────┐
│ ☰  IBR Centro         👤 Carla     │
├────────────────────────────────────┤
│ ▎SUA OPERAÇÃO AGORA             J  │  9622
│  IBR Centro · atualizado às 09:14  │
│                                    │
│  VOCÊ MARCOU PARA TRATAR        J  │  9651
│   ▸ Câmara fria sem registro       │
│     [ Resolvido ] [ Ainda não ]    │
│                                    │
│  LEITURA DA OPERAÇÃO            J  │  9664
│   "Fechamento do Salão caiu 3 dias │
│    seguidos — 62% contra 88% na    │
│    média de 14 dias."              │
│   [ Agir sobre isso → ]    👍 👎    │
│                                    │
│  PRIORIDADES AGORA              J  │  9825
│   1 Fechamento Salão   [ Tratar ]  │
│   2 Crítico: dedetiz.  [ Tratar ]  │
│   3 Abertura atrasada  [ Tratar ]  │
├────────────────────────────────────┤
│  ‹    DIA · HOJE, qui 08 ago     › │  P 2571
│ ┌────────────────────────────────┐ │
│ │ IBR CENTRO                     │ │  P 2787 + J 9717
│ │ 74%                     ★★★☆☆  │ │
│ │ 9 de 13 · 2 atrasados          │ │
│ └────────────────────────────────┘ │
│  Ontem ▼8    7 dias ▼10            │  P 2813 + J 9707
│                                    │
│  POR SETOR · HOJE               J  │  9546 (⊃ P 2597)
│   Salão     62% ▓▓▓▓▓▓░░░  1 crít. │
│   Cozinha   89% ▓▓▓▓▓▓▓▓▓░         │
│                                    │
│  POR TIPO DE CHECKLIST          P  │  2864
│   ▸ Abertura Salão   8/8  ✓  [📷]  │
│   ▸ Fechamento Salão 0/9  ⏱        │
├────────────────────────────────────┤
│ ADERÊNCIA POR DIA · 7 DIAS      P  │  FAIXA FIXA — sem gate,
│  84%  ▁▃▅▇▆▇█                      │  sem seletor, sem segmento
│  seg ter qua qui sex sáb dom       │  (idêntica à do colaborador)
│                                    │
│ RANKING DA EQUIPE · 7 DIAS      P  │
│  1 Ana 94%   2 Bruno 88%  …        │
│   └ críticos pend. · últ. ativid.  │  [isManager] — colunas extras
├════════════════════════════════════┤
│  PERÍODO [7 dias ▾]     [Exportar ▾]│ R 3937 sobe p/ cá
│  ( Tendência )( Pessoas )( Registros)│ N — segmento
├────────────────────────────────────┤
│  «conteúdo do segmento ativo»      │
│  Tendência → 4 StatCards R ·       │
│              Entrega no prazo J ·  │
│              Dia da semana R       │
└────────────────────────────────────┘
[ Rotina ][ PAINEL ][ Meu ID ][ Equipe ]
```

### Liderança — desktop ≥1024px

```
┌───────┬───────────────────────────────────┬───────────────────────┐
│ RAIL  │ ▎SUA OPERAÇÃO AGORA            J  │ BASE DA OPERAÇÃO   J  │
│       │  IBR Centro · 09:14               │  1 unid.   4 setores  │
│Operação│  Você marcou para tratar          │  12 checkl. 6 pessoas │
│Executar│  Leitura da operação   👍👎        │                       │
│▸PAINEL│  Prioridades agora 1 2 3 [Tratar] ├───────────────────────┤
│Unidades│──────────────────────────────────│ CRÍTICOS RECORR.   J  │
│       │  ‹ DIA · HOJE, qui 08 ago  ›      │  Câmara fria    4×    │
│Pessoas│ ┌─────────────────────────────┐   │  Dedetização    2×    │
│Equipe │ │ IBR CENTRO   74%   ★★★☆☆    │   ├───────────────────────┤
│Meu ID │ │ 9 de 13 · 2 atrasados       │   │ NOTIFICAÇÕES · 7D  P  │
│       │ └─────────────────────────────┘   │  08/08 09:00 enviada  │
│       │  Ontem ▼8   7 dias ▼10            │  07/08 21:00 enviada  │
│       │  Por setor · hoje  |  Por tipo    │                       │
│       │══════════════════════════════════ │                       │
│       │ PERÍODO [7 dias ▾]     [Exportar ▾]│                      │
│       │ (Tendência)(Pessoas)(Registros)   │                       │
│       │  «conteúdo do segmento ativo»     │                       │
└───────┴───────────────────────────────────┴───────────────────────┘
```

### Gerência / gestão (`unitId == null`) — mobile 390px

```
┌────────────────────────────────────┐
│ ☰  Todas as lojas ▾     👤 Michel  │  seletor de loja, já existe 8087
├────────────────────────────────────┤
│ ▎SUA OPERAÇÃO AGORA             J  │
│  Todas as lojas · 09:14            │
│  Você marcou para tratar (2)       │  9651
│  Leitura da operação        👍 👎   │  9664
│  Prioridades agora  1 2 3 [Tratar] │  9825
│  [ Base da operação  ⌄ ]           │  9507 — acordeão SÓ no mobile
├────────────────────────────────────┤
│  ‹    DIA · HOJE, qui 08 ago     › │
│ ┌────────────────────────────────┐ │
│ │ IBR CENTRO (loja base)   74%   │ │  P 2787 + J 9717
│ └────────────────────────────────┘ │
│  Ontem ▼8    7 dias ▼10            │
├────────────────────────────────────┤
│ COMPARATIVO ENTRE LOJAS · HOJE  P  │  2632 ⊃ J 9863, P 2746 absorvido
│  🥇 Norte   92%  ▲4  ▁▃▅▇▆▇█       │
│      manhã 95% · noite 88%         │  turnoRate 2659
│  🥈 Centro  74%  ▼10 ▇▆▅▃▁▃▅       │
│  🥉 Sul     61%  ▼2  ▃▅▃▁▂▃▂       │
│  [ Ver todas as lojas → ]          │  N → aba Unidades
├────────────────────────────────────┤
│  POR SETOR · HOJE               J  │
│  POR TIPO DE CHECKLIST          P  │
├────────────────────────────────────┤
│ ADERÊNCIA POR DIA · 7 DIAS      P  │  FAIXA FIXA
│ RANKING DA EQUIPE · 7 DIAS      P  │  (sem seletor, sem segmento)
├════════════════════════════════════┤
│  PERÍODO [7 dias ▾]     [Exportar ▾]│
│  ( Tendência )( Pessoas )( Registros)│
├────────────────────────────────────┤
│  «conteúdo do segmento ativo»      │
│  Pessoas   → Por grupo R ·          │
│              Produtividade R        │
│  Registros → Execuções R (25/pág) ·│
│              Críticos recorr. J ·   │
│              Notificações P         │
└────────────────────────────────────┘
[ Rotina ][ PAINEL ][ Config ][ Meu ID ][ Equipe ]
```

### Gerência / gestão — desktop ≥1024px

```
┌───────┬────────────────────────────────────┬──────────────────────┐
│ RAIL  │ ▎SUA OPERAÇÃO AGORA             J  │ BASE DA OPERAÇÃO  J  │
│ 240   │  Todas as lojas · 09:14            │  3 unid (1 folga)    │
│       │  Você marcou para tratar (2)       │  9 setores  34 chk   │
│Operação│  Leitura da operação      👍 👎     │  14 pessoas hoje     │
│Executar│  Prioridades agora 1 2 3 [Tratar]  ├──────────────────────┤
│▸PAINEL│───────────────────────────────────│ CRÍTICOS RECORR.  J  │
│Unidades│ ‹  DIA · HOJE, qui 08 ago     ›   │  Câmara fria    4×   │
│       │ ┌────────────────────────────────┐ │  Dedetização    2×   │
│Pessoas│ │ IBR CENTRO   74%    ★★★☆☆      │ ├──────────────────────┤
│Equipe │ │ 9 de 13 · 2 atrasados          │ │ QUEM EXECUTOU HOJE   │
│Meu ID │ └────────────────────────────────┘ │  Ana      18 tarefas │
│       │  Ontem ▼8   ·   7 dias ▼10         │  Bruno    12 tarefas │
│Config │ COMPARATIVO ENTRE LOJAS · HOJE  P  ├──────────────────────┤
│Gerenc.│  🥇 Norte  92% ▲4 ▁▃▅▇▆▇█          │ NOTIFICAÇÕES · 7D P  │
│Usuários│      manhã 95% · noite 88%         │  08/08 09:00 ✓       │
│       │  🥈 Centro 74% ▼10 ▇▆▅▃▁▃▅         │  07/08 21:00 ✓       │
│       │  🥉 Sul    61% ▼2  ▃▅▃▁▂▃▂         │                      │
│       │  Por setor · hoje  |  Por tipo  P  │                      │
│       │════════════════════════════════════│                      │
│       │ PERÍODO [7 dias ▾]     [Exportar ▾]│                      │
│       │ (Tendência)(Pessoas)(Registros)    │                      │
└───────┴────────────────────────────────────┴──────────────────────┘
```

## C.6 — Estados vazio / carregando / erro

### Carregando — o portão global **fica**

Tentação a resistir: derrubar `if (templates === null || completions === null) return <LoadingScreen />` (12433) para a aba consolidada renderizar por partes.

**Não fazer.** Essa linha guarda **todos** os `activeTab`, não só o Painel. `ExecutarView`, `UnidadesView` (11196), `EquipeView`, `GerenciarView` e `ReportsView` recebem `templates`/`completions` e **nenhuma trata `null`** — `ReportsView` cai direto em `filterCompletions(completions, …)` (3329) e `PainelView` em `templates.filter(…)` (2492). Derrubar o portão para servir uma aba quebraria as outras cinco, a menos que cada consumidor ganhasse guarda de nulo — uma mudança transversal que não cabe dentro de "Fase 3, casca da aba consolidada".

A queixa real de §C.6 é outra e é menor: `plansLoaded` / `actionPlans` (11804) chegam **depois** de `templates`/`completions`. Isso se resolve **dentro** do Painel, com esqueleto por seção, sem tocar em 12433:

| Seção | Carregando |
|---|---|
| AGORA | 3 linhas de esqueleto; "Você marcou para tratar" só entra quando `plansLoaded` |
| DIA | já chega pronto (o portão global garante `templates`/`completions`) |
| REDE | já chega pronto |
| Faixa fixa / segmento | já chegam prontos |

Se um dia a remoção do portão for mesmo desejada, ela é **fase própria**, com auditoria de nulo em todos os ramos de `activeTab`. Fora deste plano.

<details>
<summary>Esqueleto por seção (aplicável só se o portão global for removido numa fase futura)</summary>

| Seção | Carregando |
|---|---|
| AGORA | 3 linhas de esqueleto; "Você marcou para tratar" só entra quando `plansLoaded` |
| DIA | esqueleto só do número de 56px; o resto entra sem piscar |
| REDE | 1 linha por loja conhecida, valores em `—` |
| Faixa fixa / segmento | esqueleto **só do segmento aberto** |

</details>

### Vazio — separar "sem dado" de "nada a fazer"

| Situação | Hoje | Proposto |
|---|---|---|
| AGORA sem sinal | bloco renderiza vazio na página (o auto-open já suprime por `!jitHasSignal`, 11885) | **vazio positivo**: "Nada exigindo ação agora · última execução às 09:14" |
| Loja fechada | P6 (2777) suprime **tudo** abaixo | suprime **só a seção DIA** — atrasados e tendência seguem válidos com a loja fechada |
| DIA sem template aplicável | `calcRate` → `null` → `'—'` sem explicação | "Nenhum checklist previsto para hoje neste setor." |
| REDE com <2 lojas | `null` (2755) | a **seção inteira** some, título incluso |
| PESSOAS/REGISTROS sem dado | `EmptyState` (3694) — beco sem saída | acrescenta **[ Limpar filtros ]** (no desktop os filtros ficam sticky; no mobile, muito acima) |
| Dia sem checklist no gráfico | `opacity: 0.25` + `—` (J12) — **correto** | manter e **propagar** o padrão para os demais gráficos |
| Duplo EmptyState (3694 + 3717) | dois iguais na mesma tela | um só, no nível da seção |

### Erro — não existe hoje em nenhuma das três abas

| Falha | Hoje | Proposto |
|---|---|---|
| Rede na carga de `completions`/`templates` | `LoadingScreen` para sempre; só `console.error` (12144) | estado de erro na seção + **[ Tentar de novo ]**. O banner offline (12409) passa a marcar as seções afetadas com a hora do dado ("dados de 08:12") |
| `createActionPlan` falha | `actionRec` marca "No plano" **antes** do await (9391) e nunca reverte — o gestor acha que registrou e a cobrança do dia seguinte não acontece | botão volta ao estado anterior + "Não foi possível salvar — tente de novo" |
| `window.open` bloqueado no PDF | `win` (3597) atribuído e nunca verificado — exportação morre em silêncio | "O navegador bloqueou a janela de impressão — libere pop-ups para este site." |

---

# D. Matriz de acesso por papel

Mecanismo de gating — **três camadas, e as três precisam existir**:

1. **Navegação** — `ROLE_TABS` (page.js:151–156). Único efeito: decide se a aba aparece. **Não é suficiente**, porque o colaborador *tem* a aba `painel`.
2. **Componente** — cada seção é envolvida por uma constante de permissão avaliada **uma vez** no topo do componente consolidado, não espalhada em `&&` ad-hoc:

```js
// no topo do componente consolidado
const isManager  = MANAGER_ROLES.includes(currentUser?.role);   // page.js:159
const canSeeNet  = canSeeAllUnits;                              // = unitId == null, 12446
const canReview  = !!onReview && isManager;                     // já existe, 3294
```

3. **Servidor** — o que já existe continua sendo a fronteira real: RPC `review_completion` valida papel; RLS de `action_plans` valida `company_id` (migration:39). O gate de UI é ergonomia, não segurança.

**Regra de auditoria:** todo bloco cuja linha abaixo diga "não" para colaborador precisa estar **dentro** de `{isManager && ...}` ou `{canSeeNet && ...}` — não basta o bloco depender de um dado que o colaborador não tem, porque um dia esse dado passa a existir.

| # | Bloco | colaborador | liderança | gerência | gestão | Gate no código |
|---|---|:---:|:---:|:---:|:---:|---|
| **Registro DIA — a linha do colaborador é a de hoje, verificada bloco a bloco** |
| 2.0 | Navegador de data ‹ › | **sim** | sim | sim | sim | nenhum (igual a 2571) |
| 2.0b | Estado "Loja fechada" | **sim** | sim | sim | sim | nenhum (igual a 2777) |
| 2.1 | Score da loja (56px + estrelas) | **sim** | sim | sim | sim | nenhum (igual a 2787) |
| 2.1b | └ linha `n/N · atrasados` (de J5) | **sim** | sim | sim | sim | nenhum — §B.2 verifica que não é dado novo |
| 2.2 | Ontem / Média 7 dias | **sim** | sim | sim | sim | nenhum (igual a 2813) |
| 2.3 | Por tipo de checklist + botão Foto | **sim** | sim | sim | sim | nenhum (igual a 2864/2925) |
| 2.4 | Por setor · hoje | não | sim | sim | sim | `isManager` — **hoje o equivalente P3 já é `canSwitchSectors` (2477)**, que exclui colaborador |
| — | PhotoModal | **sim** | sim | sim | sim | nenhum (igual a 3002) |
| **Faixa fixa · 7 dias — fora do segmento, fora do seletor** |
| 4.1 | Aderência por dia · 7 dias | **sim** | sim | sim | sim | nenhum (igual a 2844) |
| 4.2 | Ranking da equipe · 7 dias — campos base | **sim** | sim | sim | sim | nenhum (igual a 2945) |
| 4.2b | └ colunas `criticalPending` e "última atividade" | **não** | sim | sim | sim | `isManager` — campos que `calcRanking` não devolve hoje |
| **Controles analíticos** |
| — | Seletor de período | **não** | sim | sim | sim | `isManager` — colaborador tem horizontes fixos |
| — | Segmento (Tendência/Pessoas/Registros) | **não** | sim | sim | sim | `isManager` |
| **Registro AGORA — inteiro fora do alcance do colaborador** |
| 1.1 | Você marcou para tratar | não | sim | sim | sim | `isManager` + `fetchActionPlans` já gateado em 11804 |
| 1.2 | Leitura da operação | não | sim | sim | sim | `isManager` |
| 1.3 | Prioridades agora | não | sim | sim | sim | `isManager` |
| 1.4 | Base da operação | não | sim | sim | sim | `isManager` |
| — | Pop-up de briefing (auto-open) | não | sim | sim | sim | `isManager` já em 11866 |
| **REDE** |
| 3.1 | Comparativo entre lojas (+ turno, sparkline, rank) | não | **não** | sim | sim | `canSeeNet` (= `unitId == null`) — igual a 2632 hoje |
| **Seções analíticas** |
| 4.2 | 4 StatCards | não | sim | sim | sim | `isManager` |
| 4.3 | Entrega no prazo | não | sim | sim | sim | `isManager` |
| 4.4 | Dia da semana | não | sim | sim | sim | `isManager` |
| 5.2 | Realização por grupo | não | sim | sim | sim | `isManager` |
| 5.3 | Produtividade — empresa/setor | não | sim | sim | sim | `isManager` |
| 5.3b | └ Produtividade "Por loja" | não | **não** | sim | sim | `canSeeNet && prodUnits.length > 1` — igual a 3757 |
| 6.1 | Execuções do período | não | sim | sim | sim | `isManager` |
| 6.1b | └ botão Conferir / "Só pendentes" | não | sim | sim | sim | `canReview` (3294) + RPC server-side |
| 6.2 | Críticos recorrentes | não | sim | sim | sim | `isManager` |
| 6.3 | Histórico de notificações | **não** | sim | sim | sim | `isManager` — igual ao gate 3012 de hoje |
| 6.4 | **Exportar CSV / PDF** | **não** | sim | sim | sim | `isManager` |

## D.1 — Prova de que a linha do colaborador é idêntica ao Painel de hoje

Este é **o checklist de verificação manual** com PIN de colaborador. São **8 blocos** (o botão Foto, 2925, vive dentro de 2864 e abre o PhotoModal, 3002):

| # | Bloco de hoje | Na aba nova | Muda de gate? | Muda de conteúdo? |
|:-:|---|---|:---:|---|
| 1 | 2571 navegador de data | 2.0 | não | não — só muda de posição (topo → cabeçalho da seção DIA) |
| 2 | 2777 loja fechada | 2.0b | não | escopo de supressão passa a ser só a seção DIA. **Efeito nulo para ele**: hoje 2777 suprime 2787–2945, e na aba nova a faixa fixa de 7 dias fica visível. Ver ⚠️ abaixo |
| 3 | 2787 score | 2.1 | não | ganha a linha `n/N · atrasados`, derivada de dados que ele já vê no bloco 5 |
| 4 | 2813 ontem / média 7d | 2.2 | não | não |
| 5 | 2864 por tipo + botão Foto (2925) | 2.3 | não | não (renomeado "O que falta hoje") |
| 6 | 2844 sparkline 7 dias | 4.1 (faixa fixa) | não | mesma série, mesmo cálculo; ganha rótulo de dia da semana e tratamento de dia vazio |
| 7 | 2945 ranking da equipe | 4.2 (faixa fixa) | não | **muda — ver ⚠️ abaixo** |
| 8 | 3002 PhotoModal | — | não | não |

**Blocos de J.I.T. e Relatórios que chegam ao colaborador: zero.**
**Blocos do Painel de hoje que ele perde: zero.**

Nenhum bloco eliminado era visível a ele: P5 (Ranking do dia) é `canSeeAllUnits`; P2/P3 são `canSwitchSectors`; J12/J13/J15 são `MANAGER_ROLES`.

### ⚠️ Bloco 7 — a troca de motor **não** é neutra

§B.1 troca `calcRanking` (2510) por `collaboratorStats` (860). Nenhum **campo novo** aparece — mas o que o colaborador lê muda, e isso precisa estar declarado antes de alguém implementar:

1. **Nomes novos entram na lista.** `calcRanking` chaveia só por `operatorUserId || operatorName` (2517). Quem executou tarefas creditadas via `doneBy` — execução colaborativa — **não aparece hoje**. `collaboratorStats` credita `doneBy` explicitamente (860–889), então essas pessoas passam a aparecer.
2. **As posições mudam para todo mundo.** A ordenação passa a ser `(b.rate ?? -1)` + desempate por `tasksDone` (889).
3. **Caso `rate === null`.** `collaboratorStats` devolve `rate: null` (887) para quem tem `totalItems === 0`. Sem tratamento, o cartão mostraria `—%` e `0/0 tarefas · 0 checklists` para alguém que executou tarefas de verdade. **Decisão:** quem tem `rate === null` mas `tasksDone > 0` aparece na lista **abaixo** dos ranqueados, com `tasksDone` no lugar do `%` e sem `RankBadge`. Quem tem `tasksDone === 0` não aparece.
4. **`isMe` pode falhar.** O destaque compara `collab.name === currentUser?.name` (2955); `collaboratorStats` preenche `name` a partir de `i.doneByName` para os creditados por `doneBy`. Se a grafia divergir, o "· você" some para a própria pessoa. **Decisão:** `isMe` passa a comparar por `userId`, com o nome só como fallback.

Aceite acrescentado à Fase 3: comparar o ranking antigo e o novo **lado a lado, num dia com execução colaborativa real**, e confirmar que ninguém sumiu e que o "· você" continua aparecendo.

### ⚠️ Bloco 2 — loja fechada

Hoje 2777 suprime tudo de 2787 a 2945, incluindo o sparkline e o ranking. Na aba nova a supressão vale só para a seção DIA, então **a faixa fixa de 7 dias continua visível num dia de loja fechada** — o que é o comportamento certo (a série de 7 dias não deixa de existir porque a loja fechou hoje), mas **é uma mudança visível para o colaborador**. Está declarada aqui de propósito: é o único caso em que ele vê *mais* do que hoje, e o que ele vê a mais são dois blocos que já são dele.

## D.2 — Impacto em `ROLE_TABS` e navegação

`ROLE_TABS` (page.js:151–156) passa a:

```js
const ROLE_TABS = {
  colaborador: ['executar', 'painel', 'id'],                                        // INALTERADO
  lideranca:   ['executar', 'painel', 'unidades', 'id', 'equipe'],                  // -jit -relatorios
  gerencia:    ['executar', 'painel', 'unidades', 'gerenciar', 'id', 'equipe'],     // -jit -relatorios
  gestao:      ['executar', 'painel', 'unidades', 'gerenciar', 'usuarios', 'id', 'equipe'], // -jit -relatorios
};
```

`NAV_ITEMS` (SideNav.js:30–45): 9 → 7. Saem `jit` e `relatorios`; o grupo **`'Análise'` desaparece** (só tinha `relatorios`); os ícones `BarChart3` e `Activity` saem do import.

Checagem contra a regra `g.items.length >= 2` do rail (SideNav.js:90):

| Papel | itens no rail | grupos | ok? |
|---|---|---|---|
| colaborador | 3 | `grouped=false` → bloco "Hoje" continua preenchendo o rodapé (163) | ✔ |
| liderança | 5 | Operação(3) + Pessoas(2) | ✔ |
| gerência | 6 | + Configuração(1) → cabeçalho suprimido pela regra existente | ✔ |
| gestão | 7 | + Configuração(2) | ✔ |

`BOTTOM_NAV_ORDER` (SideNav.js:56):

```js
export const BOTTOM_NAV_ORDER = ['executar', 'painel', 'gerenciar', 'id', 'equipe'];
```

A ordem renderizada é a do array, filtrado por `allowedTabs` (`BottomNav`, page.js:8172–8173):

| Papel | barra inferior (na ordem real) | nº | antes |
|---|---|:---:|:---:|
| colaborador | Rotina · **Painel** · Meu ID | 3 | 3 |
| liderança | Rotina · **Painel** · Meu ID · Equipe | 4 | 6 |
| gerência | Rotina · **Painel** · Config · Meu ID · Equipe | 5 | **7** |
| gestão | Rotina · **Painel** · Config · Meu ID · Equipe | 5 | **7** |

Gerência e gestão saem as duas de **7 para 5** — abaixo do teto medido de 6 em 390px, com folga de um slot. (Gerência tem 7 hoje, não 6: `BOTTOM_NAV_ORDER` atual ∩ `ROLE_TABS.gerencia` = `executar, painel, jit, relatorios, gerenciar, id, equipe`. O comentário em page.js:148–150 já registra "7 ícones".)

**`unidades` continua fora da barra inferior.** Não usar o slot liberado: Unidades é consulta periódica, não uso diário — o mesmo critério que já a tirou de lá. Consolidar foi para **reduzir destinos**, não para reabastecer a barra. Entrada contextual: `[ Ver todas as lojas → ]` no rodapé da seção REDE.

Note-se o que **não** é argumento aqui: "o Painel já contém o que Unidades entrega". `UnidadesView` (page.js:11196) abre com **"Ranking das unidades · últimos 30 dias"** — janela que não existe em nenhum registro deste plano (REDE é um dia; o segmento é 7d/30d/mês sob seletor). A sobreposição entre Painel e Unidades **não foi inventariada** e não deve ser assumida. Ver §H-Q5.

**`usuarios` fica onde está** (sub-aba dentro de Gerenciar no celular, item do rail no desktop). Mas o comentário de `BOTTOM_NAV_ORDER` (SideNav.js:48–55) precisa mudar: ele justifica a decisão dizendo que "isso abriu o lugar que o J.I.T. ocupa agora". Com o J.I.T. removido a razão evapora, e um comentário que cita motivo morto é pior que nenhum.

**Deep links / migração de estado.** `useAppUrlState` (11737) + `allowedTabs.includes(tab)` (12448): sem alias, `?aba=jit` cai calado em `allowedTabs[0]` = **Executar**. Necessário:
- `?aba=jit` → `?aba=painel` · `?aba=relatorios` → `?aba=painel` (o alias mora em `lib/appUrlState.js` — §F.5)
- **`tab: 'relatorios'` em `buildJit`, page.js:9067** — é aqui que o valor nasce, não no handler. A recomendação `low_adherence` aponta para a aba removida; `onNavigate` (12736) só encaminha e já se protege com `allowedTabs.includes(targetTab)`, então sem essa correção o card vira **clique morto silencioso**: responde ao toque e não acontece nada. As outras três recomendações (9044, 9056, 9079) já apontam para `'painel'` e ficam como estão
- o ponto de sinal `jitSignal` do rail (SideNav.js:117) e da BottomNav (8188) migra de `jit` para `painel`

---

# E. Exportação

**Restrição dura nº 2: o PDF continua funcionando com os mesmos filtros e escopos.** Nada em `exportPDF` (3405–3600) nem em `exportCSV` (3373–3403) muda de lógica nas Fases 1–5. O que muda é **onde vive o botão** e **quais estados o alimentam**.

## E.1 — Onde o botão vive

Hoje: linha 3946, **no fim** da coluna de resultados, depois da lista paginada de 25 execuções. No celular, ~4 telas de rolagem abaixo do topo.

Proposto: **cabeçalho da faixa PERÍODO**, ao lado do seletor, como `[ Exportar ▾ ]` com dois itens (Excel/CSV, PDF). Fica visível em qualquer um dos três segmentos, sticky no desktop junto com a faixa de período.

Gate: `isManager`. Colaborador não tem a faixa de período, portanto não tem o botão — é o comportamento de hoje (a aba inteira é `MANAGER_ROLES`).

## E.2 — Filtros que alimentam a exportação

O contrato de entrada não muda. `filtered` (3330–3335) continua sendo a fonte, alimentado por:

| Entrada | Hoje | Na aba nova |
|---|---|---|
| `period` | filtro da coluna esquerda (3298) | **mesma variável**, agora na faixa PERÍODO |
| `customFrom`/`customTo`/`selectedMonth` | 3303/3305 | idem |
| `filterUnitId` | espelha o header (3306/3309) | **idem, sem mudança** |
| `filterSector` | 3314 | idem — passa a absorver também o seletor P2, eliminado |
| `filterUserId` | 3315 | idem |
| `filterShift` | morto (setter nunca chamado) | continua morto — **não** é reativado nesta consolidação |
| `groupBy` | 3316 | idem — decide o título do gráfico do PDF (3540) |
| `soPendentes` | 3291 | idem — e continua **não** afetando o PDF (comportamento de hoje) |
| `reportTz` | `tzOf(unit)` (3302) | idem — e `periodDates` continua recebendo o tz da loja |

**Fonte de verdade dos números do PDF.** `exportPDF` não recalcula nada — ele consome as mesmas derivações da tela: `summary = summarizeCompletions(filtered)` (3336) alimenta os 4 cartões (3521, 3526, 3531, 3536) e `checklistRate` (3346); `groups = groupStats(...)` (3354) alimenta `barsSVG` (3418) e o gráfico (3546); `collaborators` (3353) alimenta `colabRows` (3431). **É por isso que a Fase 2 muda o PDF** — ver §E.3.

**Ponto de atenção:** `period: 'today'` vira `Dia selecionado` (§C.2) e passa a seguir `viewDate` em vez de ser sempre hoje. Consequência intencional: exportar com o navegador de dia em 12/07 gera o PDF de 12/07 — hoje é impossível exportar um dia passado sem usar `custom` com as duas datas iguais. **Isto amplia o que o PDF cobre, não reduz.** `periodDates` já sabe montar um array de um dia (`custom` com `from === to`, 766–787), então a mudança é de origem do valor, não de motor.

## E.3 — O que muda no PDF

**Estrutura (Fases 1, 3, 4 e 5): nada muda.** O template HTML (3458–3592), as seções, o SVG de barras (3418), as duas tabelas (3431, 3443), o CSS de impressão (3499–3503) e a estratégia `Blob → window.open → window.print()` (3594–3597) ficam byte a byte iguais. O CSV (3373) idem, inclusive o BOM e o nome `ibr-relatorio-{periodo}.csv`.

**Números (Fase 2): mudam, deliberadamente.** Porque `exportPDF` consome `summarizeCompletions` e `groupStats` (§E.2), a correção de `latestPerRound` atinge os 4 cartões de resumo e o gráfico de barras do PDF, e o renomear das aderências (§B.6) atinge o rótulo `"Realização geral"` (3521). Isso **não é regressão** — é a mesma correção que a tela recebe, chegando ao PDF pelo mesmo caminho. Mas tem uma consequência de método:

> **O baseline de comparação do PDF precisa ser capturado ANTES da Fase 2, não antes da Fase 5.**
> Guardar um PDF gerado hoje, por período e loja conhecidos. Depois da Fase 2, gerar de novo e
> conferir que a diferença é **só** a esperada (cartões desduplicados, rótulos renomeados) — e
> guardar esse segundo PDF como baseline das Fases 3–5, onde a diferença tem que ser **zero**.

Sem esse segundo baseline, o aceite da Fase 4 ("PDF em `?v=2` idêntico ao da aba Relatórios") não prova não-regressão — prova apenas que os dois caminhos chamam o mesmo código.

**Fase 6 (opcional, separável)** — três correções que a consolidação torna visíveis mas não exige:

| # | Hoje | Correção |
|---|---|---|
| E-a | O cabeçalho do PDF (**3510–3516**, badge de escopo em 3515) mostra só período + loja. Dois PDFs com setores diferentes ficam **visualmente indistinguíveis** | acrescentar setor / colaborador / agrupamento na linha de escopo |
| E-b | `win = window.open(...)` (**3596**) nunca é verificado — pop-up bloqueado mata a exportação em silêncio | `if (!win) { …aviso… }` |
| E-c | Com `period='all'`, a tabela de execuções (3443) despeja **toda a história** da loja | teto de linhas + nota "mostrando as N mais recentes de M" |

Nenhuma delas altera o que já funciona; todas são aditivas.

---

# F. Plano de execução faseado

Regras de todas as fases: cada uma é um commit atômico, testável em preview, revertível por `git revert`. Nenhuma fase depende de migration nova. `lib/tokens.js` não é tocado, `borderRadius` global não é tocado, `globals.css` só ganha classes novas — nunca altera as existentes.

## Fase 0 — ✅ EXECUTADA em 10/08/2026 (não bloqueia mais a Fase 3)

Consultas rodadas direto no SQL Editor de produção (projeto `rjuulamozdhssgqrzfji`). Resultado: **o caminho de escrita de `action_plans` está íntegro. A tabela está vazia por desuso, não por falha.**

Evidências, em ordem:

| Verificação | Resultado |
|---|---|
| Coluna real | **`jit_date`** (`NOT NULL`, sem default). O código está certo; quem divergiu foi o arquivo de migration |
| `company_id` | `NOT NULL`, default `jwt_company_id()` |
| `jwt_company_id()` | **funciona** — devolveu o claim injetado no teste |
| Grants | `authenticated` tem `INSERT`, `SELECT`, `UPDATE`, `DELETE` |
| Policy real | `((company_id = jwt_company_id()) AND company_is_active(company_id))` |
| `company_is_active('ibr-li53392s')` | **`true`** — e a mesma trava vale para `completions`, que tem milhares de linhas |
| `recommendation_actioned` na tabela `events` | **0** — e este evento **não** é afetado pela perda descrita abaixo (é a única chamada `track()` antes do `await` em `actionRec`) |
| **Teste ao vivo** (10/08, 19:51) | um clique real em "Tratar" gravou **1 linha**: `company_id=ibr-li53392s` preenchido pelo DEFAULT, `jit_date=2026-08-10`, `rec_id=overdue_today`, `status=open`. Os eventos `recommendation_actioned` e `action_plan_created` também gravaram (1 cada) |

**Conclusão:** **a escrita funciona de ponta a ponta.** A tabela estava vazia porque ninguém nunca clicou no botão "Tratar", em 79 sessões de J.I.T. medidas — não por defeito. A restrição dura nº 3 ("preservar `action_plans`") deixa de valer: **não há memória histórica a preservar**. A decisão sobre o loop de compromisso passa a ser de produto — cortar, ou reconstruir com outra afordância que as pessoas de fato usem — e não de compatibilidade. O sinal é de **desuso da afordância**, não de bug.

**O `company_id` real do IBR é `ibr-li53392s`**, não `ilhabelarepublic` (este é o slug de subdomínio). Qualquer consulta futura precisa usar o primeiro.

### Dois achados colaterais, ambos fora do escopo desta consolidação

1. **Perda de eventos por corrida de escrita em `lib/track.js`.** `track()` faz read-modify-write sem trava: `queueGet()` (81) → `push` → `queueSet()` (91). Duas chamadas seguidas sem `await` leem a mesma fila e a segunda sobrescreve a primeira. Medido em produção: `jit_opened` = **0** enquanto `ai_insight_viewed` = 109 e `jit_dwell` = 79 — as duas linhas vizinhas do **mesmo** `useEffect` (`page.js:9361-9365`). `recommendation_clicked` = 0 pelo mesmo motivo (corre com o `jit_dwell` disparado pela navegação). **Toda métrica de "primeiro de dois eventos simultâneos" está subcontada.**
2. **A policy de produção tem `company_is_active(company_id)`, que não existe no arquivo de migration.** Somada à coluna renomeada, confirma que `supabase/migrations/` não reconstrói produção.

- **Reverter:** n/a — só leitura.

## Fase 1a — ✅ EXECUTADA em 10/08/2026

Resultado: `page.js` foi de 14.092 para 13.577 linhas (−532/+23). Três arquivos novos, todos com `npm run build` limpo antes e depois:

| Arquivo | Linhas | Conteúdo |
|---|---|---|
| `lib/checklists.js` | 112 | `CHECKLIST_TYPE_ORDER`, `matchesShift`, `isItemApplicable`, `applicableItems`, `templateAtiva`, `completeRoundChecker`, `completionOnTime`, `deadlineIndex` |
| `lib/stats.js` | 280 | `PERIODS`, `PUNCTUALITY_*`, `periodDates`, `filterCompletions`, `countApplicableTemplatesOnDate`, `summarizeCompletions`, `collaboratorStats`, `groupStats`, `punctualityStats`, `computeProductivity` |
| `components/painel/shared.js` | 228 | `ROLE_LABELS`, `MANAGER_ROLES`, `STATUS_CFG`, `Eyebrow`, `Ticket`, `StarRating`, `Avatar`, `RatingLabel`, `StatusBadge`, `EmptyState`, `PillButton`, `StatCard`, `RateBar`, `RankBadge`, `PhotoModal` |

**Regra de direção verificada:** nenhum dos três importa de `app/`. `lib/*` importa só de outros `lib/`; `components/painel/shared.js` importa de `lib/tokens` e `lib/sync`.

**Duas mudanças que não são movimentação pura, ambas deliberadas:**

1. `groupStats` tinha `units = UNITS` como default — a constante do IBR. Os cinco call sites sempre passam `units`, então o default nunca era exercido; mantê-lo obrigaria `lib/stats.js` a importar de `page.js` e criaria o ciclo. Trocado por `units = []`, que degrada para o id cru da loja (visível) em vez de resolver nomes pela tabela do IBR (invisível e errado para qualquer outra empresa).
2. Quatro imports órfãos removidos de `page.js`: `instantAt`, `roundIsComplete` e `templateExistedOn` ficaram órfãos por esta extração; `yesterdayStr` já era órfão antes.

**Pré-requisito que apareceu na execução:** a branch estava 20 commits atrás da `main`, que havia mexido +1021/−137 linhas no próprio `page.js` — dois desses commits (`567750c`, `25f54a8`) tocam o ranking do Painel e da Equipe, que é a sobreposição nº 4 de §B. Foi feito `git merge main` antes de qualquer extração. **A §A e a §B do plano foram escritas contra a base antiga e precisam ser reconferidas antes da Fase 2.**

---

### Escopo original (mantido como registro)

**Escopo:** extrair primitivos e estatística (**nenhuma view sai do lugar**)

**Escopo:** mover para `components/painel/shared.js` (UI) e `lib/stats.js` (cálculo) os símbolos hoje privados do escopo de módulo de `page.js` que as três views consomem: `PillButton`, `Ticket`, `Eyebrow`, `StatusBadge`, `RankBadge`, `RatingLabel`, `StarRating`, `Avatar`, `StatCard`, `RateBar`, `EmptyState`, `PhotoModal`, `ROLE_LABELS`, `MANAGER_ROLES`; e `summarizeCompletions` (837), `collaboratorStats` (860), `groupStats` (898), `computeProductivity` (983), `punctualityStats` (941), `filterCompletions` (789), `periodDates` (766), `PERIODS` (756), `countApplicableTemplatesOnDate` (827), `completionOnTime` (10175). As views continuam onde estão, apenas importando.

- **Por que separado da 1b:** as três views fecham sobre **~50 identificadores não exportados**. Mover as views primeiro obrigaria a exportar tudo isso de `page.js` e criaria o ciclo `components/painel/* → app/app/page.js → components/painel/*` — que o webpack resolve, mas com risco real de TDZ em `const` de escopo de módulo, que aparece como `undefined is not a function` **em runtime, não no build**.
- **Aceite:** `npm run build` limpo. Nada de UI mudou de lugar, então build limpo é portão suficiente.
- **Reverter:** `git revert`.

## Fase 1b — ✅ EXECUTADA em 10/08/2026 (commits e282629, e2cc132, 3a2ea23, fffdc7f)

Saldo: `page.js` 14.092 → 10.172 linhas (−28%). `components/painel/` com 5 arquivos (3.776 linhas): `PainelView.js` (838, inclui `NotificationHistory` privada), `ReportsView.js` (1.673, inclui `ReviewModal`, `ConferenceQueue`, `DisputeCard` e demais peças privadas da aba), `JitPanel.js` (979, inclui `buildJit`/`buildInsight`), `shared.js` (260) e `context.js` (26). `lib/` ganhou 6 módulos de cálculo puro (934 linhas): `checklists`, `stats`, `ranking`, `sectors`, `units`, `format`.

Portões executados por commit: `npm run verify` (eslint com `no-undef` como erro + build), 71 testes de dates/rounds, teste de conferência, e regra de direção (`lib/` e `components/painel/` não importam de `app/`).

**Inspeção visual: ✅ feita em 11/08/2026**, no preview descrito em §F.7. As três abas (Painel, J.I.T. e Dados) renderizam idênticas ao conhecido. Isto fecha o risco §G.2-11 — "o ponto mais arriscado do plano", que ficou aberto desde 10/08 por não existir portão automatizado para tela logada.

### Escopo original (registro)

**Escopo:** `PainelView` (2452–3017), `ReportsView` (3286–3972) e `JitPanel` + `buildJit` + `buildInsight` saem para `components/painel/`. Só `import`/`export`; nenhuma linha de lógica muda.

- **Aceite:**
  - **regra de direção:** `grep -rn "app/app/page" components/painel/ lib/stats.js` volta **vazio**. Nenhum arquivo extraído importa de `page.js`;
  - `npm run build` limpo;
  - as três abas renderizam idênticas nos 4 papéis — **por inspeção humana em produção**. `tests/visual-baseline.spec.js:15` registra que telas logadas não são capturáveis (segredos `Sensitive`, auth só em produção), então **não existe portão automatizado aqui**. É o ponto mais arriscado do plano e está declarado como tal (§G.2-11).
- **Reverter:** `git revert`.

## Fase 2 — ✅ EXECUTADA em 11/08/2026 (commits 1f44adf, 8d67a9a, 57e16bf)

Saldo — e o principal é que **metade da dívida já estava paga pela `main`**:

| Item do escopo original | Desfecho |
|---|---|
| `latestPerRound` nos StatCards e no R3 | **Já estava feito.** A main resolveu em `681270a`; `ReportsView.js:947` já desduplica. Nada a fazer |
| R5 agrupa dia da semana no fuso certo | **Não era bug.** O parse usava âncora ao meio-dia, que neutraliza fuso por acidente. Trocado por `weekdayOf` mesmo assim: parse de data à mão num projeto de fonte única é armadilha para a próxima pessoa |
| Nomear as três aderências | **Adiado de propósito** — ver abaixo |
| — (não estava no escopo) | **`calcRate` subcontava reexecução.** Achado e corrigido |
| — (não estava no escopo) | **Denominador contava dias sem operação.** Achado, diagnosticado e corrigido no banco |

### O que `calcRate` escondia (`1f44adf`)

A conta do Painel varria `completions` à mão com `.find()`. Três defeitos numa linha, todos fechados ao trocar por `roundProgress`:

1. `.find()` devolve a **primeira** submissão. Reexecutar um checklist para completá-lo não mexia no score do Painel — ele seguia lendo a submissão incompleta. **Quem refez trabalho via o número parado.**
2. `comp.items.filter(i => i.done)` contava item concluído **fora da recorrência do dia**. O denominador só conta previstos, então o numerador podia ultrapassá-lo e a taxa estourar 100%. `roundProgress` intersecta com as previstas: `done <= total` por construção. O critério de aceite "nenhum percentual acima de 100%" deixa de depender de sorte.
3. O `find` casava sem `unitId` — garantia apoiada na coincidência de o id ser único por loja.

### O denominador: era dado, não código (`8d67a9a`, `57e16bf`)

Os mesmos 124 checklists davam **32%** em "30 dias" e **87%** em "Tudo". `templateExistedOn` devolve `true` para `createdAt` nulo, e os 13 checklists do IBR estavam todos em NULL — então todo dia da janela contava como previsto, inclusive os 17 anteriores à primeira execução da empresa.

O NULL foi **deliberado** (`20260730_templates_desativar.sql:51-56`): evitar que `default now()` materializasse "agora" nas linhas antigas e movesse a aderência de meses fechados. Raciocínio certo para um parque com histórico — que **se inverte** num tenant de 13 dias de vida.

Corrigido por backfill em produção (11/08), com a primeira execução da empresa como âncora conservadora. Verificação: `13 templates, 0 nulos, min = max = 2026-07-29, 1 data distinta`.

### Pendências que atravessam para depois

- **Reexportar o relatório de 30 dias** e comparar com `docs/BASELINE_PRE_FASE2.md`. Esperado: `% do esperado` de 32% para ~75%, contagens absolutas idênticas. É o segundo baseline que a Fase 4 exige (§E.3). ✅ **FEITO em 11/08 09:12** — está no fim de `docs/BASELINE_PRE_FASE2.md`, seção "SEGUNDO BASELINE", com os PDFs em `_baseline/`. IBR2 · 30 dias saiu `128/156 · 82% do esperado` (era `125/362 · 35%`).

> Correção de registro: uma revisão anterior desta linha marcou o segundo baseline como pendente. Estava errado — ele já existia, e a Fase 4 tem contra o que comparar.

**Reconfirmado no preview em 11/08 10:37**, agora com o código das Fases 1a/1b/2/3 rodando (`_baseline/PREVIEW-FASE3 IBR2 - 30 dias.pdf`, exportado da URL de preview de §F.7). Todos os campos idênticos ao baseline de 09:12: `128/156 · 82%`, realização `1189 de 1192`, 182 fotos, 1 crítico pendente, 128 execuções.

Isso fecha uma pergunta que estava em aberto desde a Fase 1a: **a extração de ~4.000 linhas para `components/painel/` não mudou um dígito do PDF.** É a prova de não-regressão que o `npm run build` não podia dar, e a referência contra a qual o PDF da aba consolidada terá de bater na Fase 4.
- **Nomear as três aderências.** Os nomes propostos em §B.6 não vão para a tela como estão: "Entrega completa" é lido como delivery num restaurante, e os três são jargão de análise. Candidatos a validar com quem opera o turno: "Feito do previsto", "Checklists 100%", "Feito do entregue". Entra na Fase 4, junto com o segmento analítico.

### Escopo original (registro)

**Escopo:** aplicar as correções de §B.6 nos blocos que sobrevivem, **antes** de fundi-los

**Escopo:** aplicar as correções de §B.6 nos blocos que sobrevivem, **antes** de fundi-los:
- `latestPerRound` para os StatCards (3668) e para R3 (3716)
- R5 (3792) agrupa por dia da semana no `reportTz`, não no fuso do navegador (3796)
- nomear as três aderências (§B.6) nos rótulos existentes

**Onde a correção mora — decisão explícita.** `summarizeCompletions` e `groupStats` **não são privadas de Relatórios**: o `buildJit` também as chama.

| Função | Chamadores |
|---|---|
| `summarizeCompletions` (837) | 3336 (Relatórios) · 9003 · **9135** · 9187 (buildJit) |
| `groupStats` (898) | 3354 (Relatórios) · 9062 · 9091 · 9126 · 9277 (buildJit / buildInsight) |

Na maioria dos casos o `buildJit` já passa dados pré-`latestPerRound`, então a aplicação dobrada seria idempotente. **Menos em `trend7` (9134–9138)**, que passa `f` cru e usa `checklists: f.length`. Corrigir dentro da função faria a taxa da barra ficar desduplicada enquanto a contagem da mesma barra continua inflada — um defeito **novo**, criado por uma fase cujo texto diz que só paga dívida.

**Decisão: corrigir no chamador, não na função.** `latestPerRound` é aplicado em 3336 e 3354, deixando `summarizeCompletions` e `groupStats` intocadas. Blast radius zero no `buildJit`, e J12 (que é o consumidor problemático) morre na Fase 4 de qualquer jeito.

- **Arquivos:** `components/painel/ReportsView.js` (chamadores 3336, 3354, 3796).
- **Aceite:**
  - nenhum percentual acima de 100% em nenhum StatCard;
  - conferir 3 dias reais no SQL Editor contra a tela, incluindo **um dia com reexecução conhecida**;
  - **os 5 blocos do J.I.T. que dependem dessas funções não mudam nenhum número**: J12 (9135), J8 (9091), J13 (9126), o insight (9277) e `ySummary` (9003). Comparar antes/depois;
  - **capturar o segundo baseline de PDF** (§E.3).
- **Reverter:** `git revert`. Os dados no banco não mudam — só a leitura.

## Fase 3 — ✅ EXECUTADA em 11/08/2026

Saldo: um arquivo novo, `components/painel/PainelConsolidado.js` (870 linhas), e
**+24/−1 linhas em `page.js`** — o import, o `usePainelV2()` e o ramo do render.
Nenhuma das três abas vivas foi tocada. `PAINEL_V2 = false`; só `?v=2` liga.

Portões executados: `npm run verify` (eslint com `no-undef` como erro + build),
71 testes de `dates`/`rounds`, teste de conferência, regra de direção
(`grep -nE "^\s*(import|export).*from ['\"].*app/" components/painel/ lib/` volta
vazio) e `grep -n "todayStr()" components/painel/` vazio.

### Sete decisões que a execução obrigou a tomar

1. **O `n/N · atrasados` do score NÃO vem de `jit.today`.** Aquele objeto é de
   HOJE e da loja inteira; o registro DIA é navegável por data e escopado ao
   setor de quem olha. Um colaborador do Salão leria "87%" (só Salão) sobre "9
   de 13" (loja toda) — dois números que não conversam. A contagem sai dos
   **mesmos `templateStatus`** que o bloco "Por tipo de checklist" logo abaixo
   já renderiza um a um, então agregado e detalhe não podem divergir. Continua
   sendo reagrupamento do que ele já vê, como §B.2 exigia.
2. **"Por setor · hoje" só renderiza quando `viewDate === today`.** `jit.sectors`
   é de hoje e o título diz "hoje"; mostrá-lo sobre uma data passada seria
   exatamente a mentira que o colapso do AGORA (§C.2, regra 2) existe para
   evitar. Alternativa recusada: recalcular o bloco por `viewDate`, que exigiria
   segunda implementação de `groupStats` fora do `buildJit` (§F.3-5).
3. **A faixa de 7 dias passou a ser cronológica.** A versão atual inverte a série
   (`[...rates7].reverse()`), o que só não confunde porque não há rótulo nenhum
   embaixo das barras. Assim que o dia da semana entra — que é a apresentação de
   J12 que §D.1 bloco 6 manda adotar — a direção vira algo que se lê, e ela
   precisa ser a natural. **É uma mudança visível para o colaborador**, dentro do
   que §D.1 bloco 6 já autorizava ("ganha rótulo de dia da semana").
4. **Dia sem previsto é cinza, não vermelho.** `null >= 50` é falso, então a
   lacuna cairia em `C.critical` — pintar de falha um dia em que não havia nada
   a fazer é o oposto do que o tratamento de dia vazio existe para resolver.
5. **O ranking ficou idêntico ao do Painel de hoje.** §B.7 já havia registrado
   que a `main` resolveu esta sobreposição escolhendo `computeOperationalProfile`
   com período mensal. Como a linha de base de §D.1 é o Painel ATUAL, trocar o
   motor aqui mudaria o que o colaborador lê. **Consequência: o item de aceite
   "ranking novo comparado ao antigo" (⚠️ §D.1 bloco 7) fica sem objeto** —
   `calcRanking` não existe mais no repositório, e não há troca de motor a
   validar. O aceite morre com a fase, não passa adiante.
6. **Os quatro blocos do AGORA foram reimplementados, não extraídos.** Extrair de
   `JitPanel` significaria mexer numa aba viva e quebrar o contrato de reversão
   desta fase ("apagar um arquivo"). A duplicação é declarada no cabeçalho do
   arquivo, tem prazo (§F.1, Fase 5, quando o `JitPanel` se dissolve) e os
   componentes (`AgoraFollowUp`, `AgoraLeitura`, `AgoraPrioridades`, `AgoraBase`)
   **já saem exportados**, para que a Fase 5 seja troca de import e não reescrita.
   Mesmo raciocínio para `calcRate`, copiado de `PainelView` já com a correção da
   Fase 2.
7. **P2 (o seletor de setor) saiu, e o substituto só chega na Fase 4.** O filtro
   Setor mora na faixa PERÍODO. Até lá, o gestor em `?v=2` perde a capacidade de
   escopar a tela a Salão/Cozinha. Não afeta o colaborador (P2 sempre foi
   `canSwitchSectors`) e é temporário, atrás do interruptor — mas é uma
   regressão real para quem testar a fase com PIN de gerência.

### O que ficou implementado além dos blocos

- **Telemetria (§F.2):** `painel_agora_viewed` com `source: 'painel'`, uma vez
  por usuário por dia (`zc_painel_agora_<userId>_<data>`). `jit_opened` **não** é
  emitido pela seção inline. Todo evento do AGORA leva `metadata.ui: 2`.
- **Colapso do AGORA fora de hoje (§C.2, regra 2):** vira a linha
  `Você está vendo dd/mm · [Voltar para hoje]`.
- **Vazio positivo (§C.6):** sem plano pendente, sem insight e com todas as
  recomendações em `all_good`, o bloco de prioridades dá lugar a "Nada exigindo
  ação agora · última execução às HH:MM".
- **Loja fechada suprime só a seção DIA**, com a faixa fixa seguindo visível —
  a mudança declarada em §D.1 bloco 2.
- **Esqueleto do follow-up** enquanto `plansLoaded` é falso: sem ele, o gestor
  com pendência vê a seção sem ela por um instante e lê como "resolvido".

### Auditoria de §D.1 — feita no código, não com PIN

Varredura dos gates do arquivo, bloco a bloco, com `isManager = false`:

| # | Bloco de §D.1 | Onde | Gate |
|:-:|---|---|---|
| 1 | navegador de data | 2.0 | nenhum ✔ |
| 2 | loja fechada | 2.0b | nenhum ✔ |
| 3 | score + `n/N · atrasados` | 2.1 | nenhum ✔ |
| 4 | ontem / média 7 dias | 2.2 | nenhum ✔ |
| 5 | por tipo + botão Foto | 2.3 | nenhum ✔ |
| 6 | aderência por dia · 7 dias | 4.1 | nenhum ✔ |
| 7 | ranking da equipe | 4.2 | nenhum ✔ |
| 8 | PhotoModal | — | nenhum ✔ |

Tudo o mais está atrás de `{isManager && …}`: a seção AGORA inteira (incluindo a
linha de colapso), e "Por setor · hoje". REDE, segmento, Exportar e histórico de
notificações **não existem neste arquivo** — entram na Fase 4, já dentro do gate.
Um nono elemento aparece para o colaborador, e é estado vazio, não bloco: a frase
"Nenhum checklist previsto para este dia neste setor.", que §C.6 pede no lugar do
`—` mudo de hoje.

> ✅ **Confirmada na tela em 11/08/2026.** A auditoria acima é estática — prova o
> gate, não o render. O aceite escrito ("verificar com um PIN de colaborador
> real, item por item") foi cumprido no preview: os 8 blocos apareceram na ordem
> prevista, com a linha `n/N · atrasados` no score e a faixa de 7 dias rotulada
> por dia da semana, **e nada além deles**. Com PIN de gerência, a seção AGORA no
> topo e o seletor de setor ausente, como previsto.

### Duas pendências que a fase abre

1. **J9 (micro-survey) não tem endereço.** §C.3 não o coloca em nenhuma das cinco
   seções, e §F.1 o dá ao pop-up. Ficou de fora da Fase 3 de propósito; a Fase 5
   precisa confirmar que o pop-up é mesmo o destino, ou o bloco some sem decisão.
2. **`canSeeAllUnits` chega como prop e não é usado.** É o gate de REDE, que entra
   na Fase 4. Deixado no contrato para a assinatura não mudar duas vezes.

---

### Escopo original (registro)

**Escopo:** criar `components/painel/PainelConsolidado.js` com os registros AGORA (seção 1) e DIA (seção 2) **mais a faixa fixa de 7 dias (seção 4)** — ou seja, o wireframe do colaborador completo. As abas `jit` e `relatorios` **continuam existindo** e funcionando. A nova aba fica atrás de um interruptor local (`?v=2` na URL ou constante `PAINEL_V2 = false`).

> A faixa fixa entra **nesta fase**, não na 4: sem ela o colaborador em `?v=2` está incompleto, e é exatamente ele que esta fase existe para validar.

- **Arquivos:** novo `PainelConsolidado.js`; `page.js` (roteamento da aba, ~12719).
- **Aceite:**
  - colaborador em `?v=2` vê **exatamente os 8 blocos da tabela de §D.1**, nada mais — verificar com um PIN de colaborador real, item por item;
  - ranking novo comparado ao antigo **num dia com execução colaborativa** (⚠️ §D.1 bloco 7): ninguém sumiu, "· você" continua aparecendo, `rate === null` tratado;
  - `action_plans` continua criando e cobrando (depende da Fase 0);
  - `todayStr(tzOf(unit))` é a única origem de "hoje" — `grep -n "todayStr()" components/painel/` volta vazio.
- **Reverter:** apagar o arquivo novo e a linha de roteamento. Zero impacto nas abas vivas.

## Fase 4 — 🔨 EM ANDAMENTO (iniciada 11/08/2026)

**A fase precisou ser partida em duas**, e o motivo importa mais que a divisão.

### Por que o escopo de arquivos do plano não sobreviveu

O texto original diz "**Arquivos:** `PainelConsolidado.js`; `globals.css`" — ou
seja, a fase comporia o que já existe sem tocar em mais nada. Isso foi escrito
antes de duas coisas que hoje são fato:

1. **§B.7** descobriu que a aba Dados ganhou dois modos (`vista`: Conferir /
   Análise) e que a fila de Conferir pertence ao registro AGORA, não ao PERÍODO.
2. A Fase 1b transformou a `ReportsView` num módulo de **1.673 linhas**, mas não
   a decompôs: os blocos R1–R8 são JSX inline dentro de um único `return`,
   fechando sobre ~20 estados e derivados (`period`, `filtered`, `summary`,
   `groups`, `collaborators`, `prod`, `dates`, os seis filtros…).

O segmento analítico precisa **fatiar** esse conteúdo em três lentes, mover o
seletor de período para uma faixa no topo, mover Exportar para o cabeçalho e
tirar Conferir dali. Nenhuma dessas quatro coisas é possível tratando a
`ReportsView` como caixa-preta, e nenhuma cabe em "só compor". As opções reais
são três, e todas contrariam o escopo de arquivos escrito:

| Opção | Custo |
|---|---|
| Reimplementar os blocos no `PainelConsolidado` | ~1.600 linhas duplicadas. Inaceitável |
| Dar props de controle à `ReportsView` (`segment`, `externalPeriod`, `hideVista`) | Mexe na aba viva; `period` é estado interno de ~15 derivados |
| **Extrair o motor** (`useRelatorio`) e os blocos para módulos que as DUAS telas consomem | Mexe na aba viva, mas é o mesmo padrão que §F.1 já prevê para o `JitPanel` — e não deixa segunda implementação |

**Decisão: a terceira.** É a única que não cria divergência entre a aba antiga e
a nova durante o período em que as duas coexistem. Mas ela **toca código que
está em produção**, então vira commit próprio, com o PDF do §E.3 como portão —
e é por isso que a fase se parte:

- **Fase 4a — REDE.** Autocontida no `PainelConsolidado`. ✅ feita, abaixo.
- **Fase 4b — o segmento analítico.** Extração do motor da `ReportsView`, faixa
  PERÍODO, Exportar no cabeçalho, Conferir movido para o AGORA (§B.7).

### Fase 4b, passo 1 — ✅ extração do motor (`10cc502`)

`components/painel/useRelatorio.js` (421 linhas) recebe todo o estado de filtro,
os derivados, `exportCSV` e `exportPDF`. A `ReportsView` vira casca de três
linhas (chama o hook, renderiza `ReportsBody`); o `ReportsBody` desestrutura os
**45 identificadores** que atravessam a fronteira e mantém o JSX intacto, com
dois parâmetros novos ainda sem uso — `segment` e `embedded`.

**O corte foi feito por script, não à mão**, e conferido depois contra `HEAD`:
motor de 374 linhas e JSX de 438, os dois **byte a byte idênticos**. Isso é o que
permite afirmar "nenhuma linha de lógica mudou" como fato, não como intenção.

`exportCSV`/`exportPDF` foram junto porque fecham sobre `filtered`, `summary`,
`groups` e `collaborators`. Deixá-los para trás recriaria o acoplamento por outro
caminho, com o risco de o export cobrir recorte diferente do da tela — e a
restrição dura nº 2 é justamente que o PDF continue igual.

**Portão da tela — passou.** Este é o primeiro commit da consolidação que mexe em
código de produção, então `npm run build` não bastava (foi esse o buraco que
derrubou o app em 10/08). PDF de IBR2 · 30 dias reexportado do preview às 12:59:

| | Baseline 09:12 | Preview Fase 3 · 10:37 | Pós-extração · 12:59 |
|---|---|---|---|
| Checklists | 128/156 · 82% | 128/156 · 82% | **128/156 · 82%** |
| Realização geral | 1189 de 1192 | 1189 de 1192 | **1189 de 1192** |
| Fotos | 182 | 182 | **182** |
| Críticos pendentes | 1 | 1 | **1** |
| Execuções | 128 | 128 | **128** |

Idênticos em tudo, inclusive nas contagens absolutas.

> Nota de ferramenta: não há `brew` nesta máquina, então o texto dos PDFs de
> baseline se lê com `python3 -m pip install pypdf` e
> `PdfReader(...).pages[0].extract_text()`. A extração ingênua por `zlib` +
> regex **não** funciona nestes PDFs (fontes embutidas com CMap próprio) — e
> falha em silêncio, devolvendo string vazia em vez de erro.

### Fase 4b, passo 2 — ✅ faixa PERÍODO, segmentos e Conferir no AGORA

`ReportsBody` ganhou `seg(s)` — sem `segment`/`embedded`, devolve sempre `true` e
a aba viva não muda de comportamento. Distribuição dos blocos:

| Segmento | Blocos |
|---|---|
| Tendência | 4 StatCards (R1) · Desempenho por dia da semana (R5) |
| Pessoas | Nível por colaborador (R2) · Realização por grupo (R3) · Produtividade (R4) |
| Registros | Execuções do período (R6), com Foto e Conferir |

`embedded` some com a coluna de filtros, com o seletor Conferir/Análise e com o
bloco Exportar do rodapé — os três reaparecem no lugar novo.

**A faixa PERÍODO** leva o seletor e `[ Exportar ▾ ]` (CSV / PDF) para o topo da
seção. Hoje o botão está **depois** da lista paginada de 25 execuções, a ~4 telas
de rolagem no celular. Segmento aberto persiste em `zc_painel_seg_<userId>`.

**A fila de Conferir mudou de registro (§B.7).** Conferir é fila de TRABALHO, não
análise: alguém está esperando resposta. Sobe para o AGORA, junto das
prioridades — a outra coisa da tela em que o gestor AGE em vez de olhar. As
justificativas vêm antes da fila, porque nelas há uma pessoa bloqueada. Gate:
`rel.canReview`; o portão real segue sendo a RPC `review_completion`.

`ConferenceQueue` e `DisputeCard` passaram a ser exportados. O `ReviewModal`
continua vivendo no `ReportsBody`, fora dos gates de segmento, e é acionado pelo
`rel.setReviewing` compartilhado — abrir da fila do AGORA abre o mesmo modal.

### ⚠️ O Conjunto A não cabia em três cartões — e o motivo é um achado

Ao aplicar os rótulos, `summarizeCompletions` (lib/stats.js:92) revelou que
`summary.checklists` é **`filtered.length`**: rodadas ENTREGUES, completas ou
parciais. O StatCard "Checklists concluídos" (`128/156 · 82%`) mede portanto
**checklists entregues ÷ previstos** — que **não é** nenhuma das três fórmulas de
§B.6, e em particular **não é** "Checklists 100%".

Rotulá-lo assim teria colado um nome errado num número — exatamente o defeito que
§B.6 existe para eliminar. Aplicado só onde é verdade:

| Rótulo | Onde entrou | Fórmula |
|---|---|---|
| **Feito do previsto** | score de 56px do registro DIA | tarefas feitas ÷ previstas ✅ |
| **Feito do entregue** | StatCard antes "Tarefas concluídas" | tarefas feitas ÷ submetidas ✅ |
| **Checklists 100%** | **em lugar nenhum** | não existe como cartão hoje |

"Checklists 100%" é a métrica `yAdherence` do `buildJit` (J4), que vive nos
registros AGORA/DIA e não no segmento. Ou ela ganha cartão próprio — o que exige
decidir se entra no PDF, e aí o baseline muda de propósito — ou o nome fica sem
uso. **Decisão pendente, para depois do aceite da Fase 4.**

E o StatCard "Checklists concluídos" segue com o nome antigo, que descreve o que
ele faz. Renomeá-lo para algo honesto ("Checklists entregues") é mudança de
rótulo no PDF também, e por isso não entrou junto do portão.

### Aceite da Fase 4 — 3 de 4 confirmados no preview (11/08)

| # | Aceite | Resultado |
|:-:|---|---|
| 1 | A consolidação se lê como UMA tela | ✅ ok |
| 2 | Colaborador em `?v=2` segue com os mesmos 8 blocos | ⏳ **pendente** |
| 3 | PDF pelo Exportar novo idêntico ao segundo baseline | ✅ ok |
| 4 | Fila de Conferir no AGORA abre e grava | ✅ ok |

**Item 3, medido** (`_baseline/POS-FASE4B IBR2 - 30 dias.pdf`, 13:43): `128/156 ·
82%`, `1189 de 1192`, 182 fotos, 1 crítico, 128 execuções — idêntico ao baseline
de 09:12 e à leitura pós-extração de 12:59. **A faixa PERÍODO nova produz o mesmo
PDF do caminho antigo**, que é a restrição dura nº 2.

**Item 2 é o que falta, e é o mais caro de errar.** A Fase 4 acrescentou quatro
superfícies novas atrás de `isManager` — faixa de período, três segmentos,
Exportar e fila de Conferir. A auditoria de código confere (6 gates `isManager &&`;
o `useRelatorio` roda para todo papel porque hook não pode ser condicional, mas
nada do que ele devolve renderiza fora do gate, e a fila tem `canReview` próprio).
Mas isso prova o gate, não a tela — a mesma distinção registrada na Fase 3.

**O rótulo do PDF não foi tocado.** §E.3 previa que o renomear atingisse
"Realização geral" (3521), mas mudar o PDF no mesmo commit em que ele é o portão
de não-regressão destruiria o portão. Fica para depois do aceite.

### Nomes das três aderências — ✅ decidido em 11/08 (Conjunto A)

A pendência que atravessou desde a Fase 2. Vetados os nomes originais de §B.6
("Entrega completa" lido como delivery). O dono do produto escolheu:

| A conta | Rótulo na tela |
|---|---|
| tarefas feitas ÷ tarefas **previstas** | **Feito do previsto** |
| checklists **100%** ÷ checklists previstos | **Checklists 100%** |
| tarefas feitas ÷ tarefas **submetidas** | **Feito do entregue** |

"do previsto" vs "do entregue" carrega a diferença de denominador na própria
frase, que é onde a confusão mora, e cabe numa linha do cartão no celular.
"Checklists 100%" quebra o paralelismo de propósito: é o único dos três cuja
unidade é checklist e não tarefa, e a quebra sinaliza isso.

### Fase 4a — ✅ seção REDE

Um componente `SecaoRede` no `PainelConsolidado.js`. Gate: `canSeeAllUnits`, e a
seção inteira some com menos de duas lojas (§C.6).

**Fusão P4 ⊃ J8, com P5 eliminado.** A ordenação é a de P4 (desempenho, com
`RankBadge`); os sinais de urgência de J8 (atrasados · críticos recorrentes ·
pendentes hoje) viram uma linha no cartão, e só aparecem com
`viewDate === today` — "urgência" não tem leitura em 12/07, e é a mesma regra já
aplicada a "Por setor · hoje". P5 (Ranking do dia) morre por ser duplicata
**interna**: mesmos dados, mesma ordenação e o mesmo `RankBadge` dos cartões
logo acima. A frase dos sinais é montada igual à da aba J.I.T., para as duas
telas não descreverem o mesmo estado com palavras diferentes.

**Posição na página:** logo após o score do dia, **antes** de "Por tipo" e "Por
setor". §C.3 numera REDE como seção 3 (depois de 2.3/2.4), mas o wireframe de
gerência (§C.5) e a tabela "primeira dobra por papel" colocam o comparativo
imediatamente após o score. Seguimos estes dois: eles raciocinam sobre ordem de
**leitura**, e a lista numerada é inventário. Para quem está com "Todas as lojas"
no cabeçalho, o detalhe por tipo de UMA loja antes da comparação da rede é a
ordem errada.

**Duas correções que o bloco original carregava** — ambas do mesmo tipo que a
Fase 2 já havia fechado no `calcRate`, e que teriam sido promovidas para a tela
nova sem alarde:

1. **`turnoRate` reescrito sobre `roundProgress`.** Usava `.find()` (primeira
   submissão da rodada — reexecução não contava), somava item concluído fora da
   recorrência do dia (numerador podendo passar o denominador) e casava sem
   `unitId`. É literalmente o defeito de três pontas que §Fase 2 descreve.
2. **A terceira célula de turno era cópia da segunda.** A lista era
   `[Abertura→Manhã, Intermediário→Tarde, Fechamento→Tarde]`: dois rótulos
   diferentes lendo o **mesmo** turno, sempre com o mesmo número. Ficaram duas
   células, Abertura e Fechamento.

Também some uma reordenação acidentalmente quadrática: a versão de hoje
reordena a lista inteira de lojas **dentro** do `map`, uma vez por loja, com
`calcRate` rodando de novo em cada comparação. Agora é uma ordenação só.

- **Portões 4a:** `npm run verify` limpo. O colaborador não é afetado — REDE
  está sob `canSeeAllUnits`, que ele nunca teve.

### Escopo original (registro)

**Escopo:** seção 3 (REDE) e seção 5 (o segmento Tendência/Pessoas/Registros), com a faixa PERÍODO e o botão Exportar no cabeçalho. Tudo dentro do **único** `{isManager && ( … )}` de §C.3. Exportação PDF/CSV ligada aos mesmos estados (§E.2). Ainda atrás do interruptor.

- **Arquivos:** `PainelConsolidado.js`; `globals.css` (classes novas `.zc-painel-*`, reusando o grid de `.zc-jit-page`).
- **Aceite:**
  - **o colaborador em `?v=2` continua vendo os mesmos 8 blocos** — nada do que entrou nesta fase alcança ele. Reverificar com PIN real;
  - PDF gerado em `?v=2` é **idêntico ao segundo baseline** (o capturado depois da Fase 2 — §E.3), com os mesmos filtros, período e loja;
  - CSV idem, byte a byte;
  - conferência (`review_completion`) funciona e emite `completion_reviewed` com `source: 'relatorios'`.
- **Reverter:** desligar o interruptor.

## Fase 5 — Virar a chave (**commit único, tudo junto**)

**Escopo:** `PAINEL_V2 = true`; remover `jit` e `relatorios` de `ROLE_TABS` e `NAV_ITEMS`; `BOTTOM_NAV_ORDER` novo; alias de deep link; pop-up de briefing reduzido ao registro AGORA (§F.1); migrar `jitSignal` para `painel`; **tour**; **Central de Ajuda**.

Tudo no mesmo commit porque cada peça isolada deixa o produto mentindo: uma ajuda que descreve uma aba inexistente é pior que uma ajuda desatualizada.

- **Arquivos:**
  - `page.js` — `ROLE_TABS` (151–156), auto-open (11864–11897), fallback de aba (12448), render do pop-up (12586–12601), render das abas (12719–12758), **tour (8721–8725)**, **`tab: 'relatorios'` do `buildJit` (9067)**
  - `components/SideNav.js` — `NAV_ITEMS` e `BOTTOM_NAV_ORDER` (30–56) e os comentários 20–29 / 47–55
  - **`lib/appUrlState.js`** — alias de leitura (§F.5)
  - **`content/ajuda/**`** — 9 artigos (§F.4)
- **Aceite:**
  - `ROLE_TABS.colaborador` é literalmente `['executar','painel','id']` — **diff vazio nessa linha**;
  - barra inferior de gerência e gestão com 5 destinos em 390px, nenhum rótulo quebrando em duas linhas;
  - `?aba=jit` e `?aba=relatorios` abrem o Painel na âncora certa, **não em Executar**;
  - o tour de gestão tem **5 passos** e nenhum cita "Relatórios" — e o passo `painel` ensina a exportação;
  - `grep -rn "aba Relatórios\|aba \*\*Relatórios\|aba J\.I\.T\." content/ajuda` volta **vazio**;
  - nenhum slug de `content/ajuda/` foi renomeado (senão quebra `sitemap.js` e dois links internos);
  - a recomendação `low_adherence` do J.I.T. navega para algum lugar ao ser clicada.
- **Reverter:** `git revert` do commit. Como as views antigas foram só desreferenciadas (não apagadas), a volta é imediata — inclusive a da ajuda, que está no mesmo commit.

### F.4 — Central de Ajuda (`content/ajuda/`)

**Nove artigos** citam a aba Relatórios como destino vivo. O assistente de suporte (`app/api/ajuda/assistente/route.js`) é aterrado neles via `app/ajuda/search-index.json/route.js` (`force-static`, gerado no build) — ou seja, **depois da virada o chat de suporte do próprio produto passa a instruir o gestor a abrir uma aba que não existe**, com a autoridade de quem lê a documentação oficial.

| Arquivo | O que fazer |
|---|---|
| `para-gestores/relatorios-desempenho-e-evidencias.md` | reescrever o corpo para "Painel → faixa PERÍODO". **Manter o slug** — dois artigos linkam para ele e o `sitemap.js` o indexa |
| `primeiros-passos/o-que-e-o-zcheck.md` (linhas ~28–30) | tabela papel × abas: as três linhas de gestão viram mentira. Corrigir |
| `usando-checklists/checklist-atrasado.md` (~27) | deep link para o artigo acima — confere que continua resolvendo |
| `usando-checklists/acompanhando-o-dia-no-painel.md` (~22) | idem; este é o artigo do Painel, precisa absorver o que a aba ganhou |
| `usando-checklists/como-concluir-um-checklist.md`, `fotos-e-observacoes.md`, `itens-critico-obrigatorio-foto.md` | menções de passagem |
| `para-gestores/folgas-e-dias-fechados.md`, `conta-e-acesso/como-trocar-de-loja.md` | menções de passagem |

### F.5 — Deep links (`lib/appUrlState.js`)

`readUrlState` (`lib/appUrlState.js:26`) lê só `?aba` e `?loja`; `useAppUrlState` (page.js:11739) aplica `if (t && allowedTabs.includes(t) && t !== tab) setTab(t)`. **Sem alias, `?aba=jit` cai calado em `allowedTabs[0]` = Executar.**

O alias mora na leitura, em `readUrlState`: `jit → painel`, `relatorios → painel`. E precisa **normalizar o estado, não só a leitura** — o efeito estado→URL escreve `tab`, então uma sessão que caia no fallback fica com a URL mentindo `?aba=jit` indefinidamente. Depois de mapear, reescrever a URL.

A âncora (`#agora`, `#registros`) está fora do contrato do módulo, que faz round-trip só por `URLSearchParams` e nunca restaura hash. **Default: não implementar âncora na Fase 5** — o alias que leva à aba certa já resolve o problema real (link morto). Âncora é refinamento, fica na Fase 6.

### F.6 — Tour guiado

`GESTOR_TOUR_STEPS[2]` (page.js:8721–8725) é o passo de Relatórios, filtrado por `allowedTabs.includes(s.tab)` (8742). Removida a aba, ele **não quebra: desaparece em silêncio** — e leva junto o único texto do produto que ensina o score de produtividade e *"Use o PDF nas reuniões semanais"*. A exportação, que §C.1 já reconhece como pouco descobrível, ficaria sem nenhuma superfície de descoberta.

Um aceite do tipo "o tour não referencia aba inexistente" seria satisfeito **fazendo nada**, o que é o resultado errado. Por isso o aceite acima exige explicitamente **5 passos** e que o passo `painel` (8717–8720) absorva o `desc`/`dica` do passo removido, apontando para a faixa PERÍODO e o botão Exportar.

## Fase 6 — Limpeza e correções aditivas (**separável, pode não acontecer**)

- Apagar `calcRanking` (2510), `PainelView` antigo, `ReportsView` antigo, o segundo `getRating` (2647) que sombreia o de 2556, e o `filterShift` morto.
- Correções de exportação E-a, E-b, E-c (§E.3).
- Telemetria nova (§F.2).
- `useMemo` nas derivações do Painel (hoje `sortedUnits` é recalculado dentro do `units.map`, 2676 — O(n²) chamadas de `calcRate`).

## F.1 — O que acontece com o pop-up do J.I.T.

**Sobrevive, e para de ser "a página do J.I.T. dentro de uma gaveta".**

*Por que manter:* é o único **push** para dentro do app. `jit_opened` com `source: auto|manual` (9361) é a métrica de hábito do H1, e `jit_skipped` (11893) é o que distingue "dia quieto" de "gestor abandonou". Sem ele, o briefing vira algo que o gestor precisa lembrar de rolar até — e a rolagem é justamente o que estamos cortando. A parte difícil já está resolvida: o auto-open só dispara com `jitHasSignal` (11885), então já não faz takeover em dia tranquilo.

*Por que não pode continuar como está:* hoje pop-up e página são **o mesmo componente** com um flag (`asPage`, Shell 9576) — a página é o superset e o pop-up é "a página menos CSS". Depois da consolidação a página cresce e o pop-up herdaria 12+ blocos num sheet de `maxHeight: 92vh`.

*O que o pop-up passa a renderizar:* **exatamente o registro AGORA** — J2 (Você marcou para tratar), J3 (Leitura da operação), J7 (Prioridades agora), J9 (micro-survey), e o botão final vira `[ Abrir o painel → ]`. Saem J4, J5, J6, J8 e toda a coluna lateral (que já não renderizava no sheet). Todos continuam existindo — no Painel, nos registros onde fazem sentido.

*Implementação:* `JitPanel` **perde o flag `asPage`** e se dissolve em dois consumidores do mesmo `buildJit`: `<BriefingSheet>` (contrato fixo, 4 blocos) e a seção AGORA do Painel. Os sub-componentes (`FollowUp`, `Leitura`, `Prioridades`) são compartilhados — continua não existindo segunda implementação para divergir. O que muda é que a **composição** passa a ser declarada em cada lugar, em vez de um ser o outro menos CSS.

*Marcador "visto":* `zc_jit_seen_<userId>_<data>` muda de gatilho. Hoje é marcado ao abrir a **página** do J.I.T. (11871). Com a seção AGORA sempre na primeira dobra do Painel, "visto" passa a ser marcado quando essa seção entra no viewport. Sem isso, o gestor que lê o briefing rolando o Painel recebe o pop-up de novo no login seguinte — e é assim que se treina alguém a fechar no reflexo.

## F.2 — Telemetria: o que acontece com os `source` (restrição dura nº 5)

`source` grava na coluna **`action_source`** da tabela `events` (`lib/track.js:125`). Renomear valores **quebra série histórica**: consultas antigas por `action_source = 'jit'` param de casar.

**Regra: nenhum valor existente é renomeado. Nunca.**

| Evento | `source` hoje | `source` depois | Justificativa |
|---|---|---|---|
| `action_plan_created` / `_completed` (9396/9350) | `'jit'` | **`'jit'`** | O motor continua sendo o J.I.T.; o que mudou foi onde ele é desenhado. Renomear para `'painel'` cortaria a série de adoção de planos ao meio |
| `ai_insight_viewed` / `_feedback` / `_actioned` (9362/9373/9379) | `'jit'` | **`'jit'`** | idem |
| `recommendation_clicked` / `_actioned` (9385/9392) | `'jit'` | **`'jit'`** | idem |
| `survey_answered` (9403) | `'jit'` | **`'jit'`** | idem |
| `completion_reviewed` (12284) | `'relatorios'` | **`'relatorios'`** | hardcoded dentro de `reviewCompletionAndSync`; o fluxo de conferência não mudou |
| `jit_opened` / `jit_dwell` / `jit_skipped` (9361/9365/11893) | `'auto'` \| `'manual'` \| `'menu'` | `'auto'` \| `'manual'` **preservados**; `'menu'` **aposentado** (não renomeado) e **não substituído** dentro de `jit_opened` — ver abaixo | `'menu'` fica na série histórica como valor de uma era encerrada. `jit_opened` volta a significar só uma coisa: o briefing chegou por push |
| `jit_punctuality_filtered` (9490) | `openSource` | idem | — |

**Por que a seção AGORA inline não pode emitir `jit_opened`.** `jit_opened` dispara uma vez por **mount** do `JitPanel` (9361, efeito de montagem). Com a seção AGORA sempre na primeira dobra do Painel, um `source: 'inline'` dentro de `jit_opened` dispararia em **toda visita ao Painel** — e `jit_dwell` em toda saída. O `metadata.ui: 2` separa eras, mas não conserta o denominador **dentro** da era nova: `'manual'`, que o comentário em 11857–11860 descreve como o sinal-ouro de hábito, ficaria submerso em ruído.

**Decisão:** a seção AGORA inline emite um evento **novo** — `painel_agora_viewed`, com `source: 'painel'` (valor confirmado inexistente hoje: `grep -rn "source: 'painel'" app lib` volta vazio) — disparado **uma vez por usuário por dia**, no mesmo padrão de `zc_jit_seen_<userId>_<data>` (11871). `jit_opened` fica reservado ao pop-up.

**Marcador de era.** Todo evento emitido pela aba consolidada ganha `metadata.ui: 2`. É aditivo (a coluna `metadata` é JSON), não quebra nada, e permite separar "antes/depois da consolidação" sem tocar em `action_source`. Sem esse marcador, uma queda em `recommendation_actioned` depois da virada é indistinguível de uma queda causada pela virada.

**Ganho de instrumentação (Fase 6):** o Painel tem **zero** `track()` hoje. A aba consolidada herda a instrumentação do J.I.T. e ganha, com `source: 'painel'` (valor novo, sem colisão — nunca existiu em `action_source`): abertura da aba, troca de segmento, troca de período, navegação de dia, `report_exported` (formato PDF/CSV + período + escopo).

## F.3 — O que **NÃO** entra nesta consolidação

Registrado para não virar escopo por osmose:

1. **Reativar o filtro de turno** (`filterShift`, 3315). Continua morto.
2. **Tirar o hardcode de `'ibr1'`** (2464, 2472, 3349, 3321). A fusão de P3 em J13 resolve *por acaso* o comparativo de setores (J13 é dinâmico), mas `sectorGroupToSectors` (3321) e `sectorOptions` (3349) seguem com Salão/Cozinha literais. Item multi-tenant, projeto próprio.
3. **Insight por LLM.** `buildInsight` é rule-based (9227) e continua. Os comentários já registram a intenção ("IA generativa fica para depois — §16", 9022); o contrato de eventos já está pronto.
4. **Unificar `isUnitClosed` / `openDates` / `closedToday`** — três implementações da mesma verdade (733, 3340, 9094). Refatoração separada.
5. **Alterar o `buildJit`** além da linha 9067 (`tab: 'relatorios'`). A Fase 2 corrige nos chamadores de Relatórios justamente para não tocar no motor. `trend7`, `yByStore` e o insight ficam como estão até morrerem na Fase 4.
6. **Âncoras de deep link** (`#agora`, `#registros`). `lib/appUrlState.js` faz round-trip só por `URLSearchParams` e nunca restaura hash. O alias de aba resolve o link morto; a âncora é refinamento de Fase 6.
7. **Reconciliar `earliestPerRound` (J6, 9167) com a etiqueta crua de R6a (3883)** — a mesma rodada reexecutada aparece duas vezes na lista, uma marcada "fora do prazo", e o gestor conta um número diferente do agregado logo acima. **Fica registrado como risco conhecido** (§G-4), não corrigido aqui.
8. **Mexer em `lib/tokens.js`, `borderRadius` global, ou na identidade visual interna.** O CLAUDE.md registra que isso já quebrou antes.
9. **Migrations.** Nenhuma fase precisa de mudança de schema. A Fase 0 só **lê**.
10. **Alterar a aba Unidades**, que continua existindo como está — e cuja sobreposição com o Painel **não foi inventariada** (§H-Q5).
11. **Remover o portão global de carregamento** (12433). Ver §C.6.

## F.7 — Como verificar uma fase numa tela logada

O plano inteiro depende de inspeção humana em pontos que nenhum teste cobre:
`tests/visual-baseline.spec.js:15` registra que tela logada não é capturável, e
os segredos são `Sensitive`, então local não autentica. O caminho que funcionou
em 11/08/2026, registrado para as Fases 4 e 5 não terem que redescobri-lo:

```bash
cd ibr-checklists-app && npx vercel --yes    # SEM --prod: sai target: null
```

Quatro coisas que não são óbvias e custaram tempo:

1. **A URL de preview carrega o tenant IBR.** `getTenantSlug()` (`lib/tenant.js`)
   não conhece o hostname com hash da Vercel e cai no fallback `'ibr'`; o
   `middleware.js` não intercepta esse hostname. Então `/app` simplesmente abre.
   Não é preciso alias nem entrada nova no `DOMAIN_MAP`.
2. **Deployment Protection (Vercel Authentication) está ligada.** O preview
   responde `302` para `vercel.com/sso-api`. Quem estiver logado na org
   `ilhabelarepublic` abre normalmente — inclusive no celular, bastando entrar
   em `vercel.com` naquele aparelho primeiro. **Não** é preciso criar Protection
   Bypass: aquele token é do projeto inteiro, permanente, e vale também para
   produção. No terminal, `npx vercel curl <url>` atravessa a proteção sozinho —
   foi assim que se conferiu que o bundle publicado continha o código da fase.
3. **O preview fala com o Supabase de PRODUÇÃO.** Não é sandbox. "Tratar" grava
   em `action_plans` de verdade, e a seção AGORA grava `painel_agora_viewed` em
   `events`. Testar execução só em checklist descartável.
4. **Origem diferente = sessão, IndexedDB e service worker próprios.** Isso
   resolve de graça a armadilha do CLAUDE.md ("correção só aparece para quem
   reinicia a sessão"): no preview o cache nasce limpo. Em compensação, é preciso
   logar de novo com PIN.

Conferir strings acentuadas no bundle publicado com `grep -F` engana — o
minificador escapa não-ASCII. Buscar por trecho ASCII (`"Base da opera"`).

---

# G. Riscos e pontos de quebra

## G.1 — O que o histórico deste projeto registra

| Risco | Evidência | Mitigação neste plano |
|---|---|---|
| **Identidade visual interna já quebrou antes** | CLAUDE.md, pendência 3: "app ainda com estilo antigo; não aplicar sem cuidado (quebrou antes)" | A consolidação **reorganiza, não redesenha**. Nenhum token novo, nenhuma cor nova, nenhum componente visual novo. Os blocos migram com o mesmo JSX |
| **`globals.css` sem `@tailwind` quebra tudo** | CLAUDE.md: restaurar com `git show HEAD:...globals.css` | Fase 4 só **acrescenta** classes `.zc-painel-*`; nenhuma regra existente é editada |
| **`borderRadius` global quebra os cards** | CLAUDE.md | Não tocado em nenhuma fase |
| **Fuso: `toISOString().slice(0,10)` vira o dia seguinte após 21h** | CLAUDE.md; regra de `lib/dates.js` | Aceite da Fase 3 inclui `grep` por `todayStr()` sem argumento. R5 (3792) é corrigido na Fase 2 justamente por violar isso hoje |
| **Arquivo de 13.300 linhas** | o próprio `page.js` | Fase 1 extrai antes de qualquer mudança de comportamento |

## G.2 — Regressões prováveis

| # | Regressão | Onde | Como pegar |
|---|---|---|---|
| 1 | **Vazamento para o colaborador** — um bloco novo renderizado sem `isManager` | `PainelConsolidado.js` | Teste manual com PIN de colaborador **em toda fase**, não só na 5. Checklist §D.1 item por item |
| 2 | **Deep link morto** — `?aba=jit` cai em Executar | 12448 | Fase 5. Testar as 4 URLs antigas |
| 3 | **Números mudam** por causa de `latestPerRound` | Fase 2 | Isolada em fase própria, justamente para o cliente-piloto saber que o número mudou e por quê |
| 4 | **Números divergentes lado a lado** — J6 usa `earliestPerRound`, R6a não (§F.3-5) | seção 6 do Painel | Risco **aceito e registrado**. Na aba única o gestor pode contar etiquetas vermelhas e achar número diferente do agregado logo acima |
| 5 | **Pop-up herda a página inteira** se `asPage` não for desmontado | Fase 5 | Aceite: sheet com no máximo 4 blocos e altura ≤ 1,5 tela em 390px |
| 6 | **Pop-up volta todo dia** se o marcador "visto" não migrar | 11871 | Fase 5. Testar: rolar o Painel, sair, relogar — não pode reabrir |
| 7 | **Barra inferior quebrando rótulo em duas linhas** | SideNav.js:56 | 5 destinos < teto de 6; ainda assim, screenshot em 390px real |
| 8 | **Performance** — `sortedUnits` dentro do `units.map` (2676) é O(n²) de `calcRate`. Com todos os blocos numa página só, o custo soma | Fase 4 | `useMemo` fica na Fase 6, mas medir com 3 lojas × 90 dias de `completions` (o `fetch` traz 90d/1000 linhas, `lib/sync.js:329`) |
| 9 | **Loja fechada** deixa de suprimir tudo (§C.6) e passa a suprimir só DIA | Fase 3 | Testar num dia com `closures` real. Para o colaborador o efeito é nulo (ele não tem seções abaixo) |
| 10 | **`action_plans` grava em silêncio o erro** (9391 marca "No plano" antes do await) | Fase 3 | Depende da Fase 0. Se a coluna estiver errada, o recurso nunca funcionou e o plano precisa dizer isso ao usuário antes de "preservá-lo" |
| 11 | **A Fase 1b é o maior risco do plano** — mover ~4.500 linhas de view sem portão automatizado. `tests/visual-baseline.spec.js:15` registra que telas logadas não são capturáveis (segredos `Sensitive`) | Fase 1b | Mitigado pela Fase 1a (que elimina o ciclo de import) e pela regra de direção no aceite. O portão restante é olho humano em produção, nos 4 papéis. **Não fingir que "só import/export" é seguro num arquivo de 13.309 linhas** |
| 12 | **Sessão aberta durante o deploy** — quem estiver com `activeTab === 'jit'` no momento do deploy recebe o bundle novo no próximo carregamento e cai em `allowedTabs[0]` = Executar (12448) | Fase 5 | Aceito. O app é PWA e a troca só ocorre no reload; o usuário reabre e vê o Painel. O alias de `?aba` (§F.5) cobre quem tiver a URL salva. **Deployar fora do horário de pico das lojas** |
| 13 | **Chat de suporte instruindo aba inexistente** — o `search-index.json` é `force-static`, gerado no build | Fase 5 | A correção de `content/ajuda/` vai no **mesmo commit** da virada (§F.4), então o índice é regerado junto |

## G.3 — O que exige teste manual em produção

Os segredos são `Sensitive` na Vercel e auth só testa em produção (memória do projeto). Portanto, depois da Fase 5, em ambiente real:

1. **Login com PIN de colaborador** → conferir **um a um os 8 blocos da tabela de §D.1**, e que **não** existe faixa de período, botão Exportar, segmento, seção AGORA nem histórico de notificações. Conferir também o ranking num dia com execução colaborativa (⚠️ bloco 7).
2. **Login com PIN de liderança** (loja fixa) → conferir que **não** aparece o comparativo entre lojas nem "Produtividade por loja".
3. **Login de gestão** → criar um plano em "Prioridades agora", relogar no dia seguinte, confirmar que a cobrança aparece em "Você marcou para tratar".
4. **Exportar PDF** e comparar com o **segundo baseline** (capturado depois da Fase 2 — §E.3). A diferença tem que ser **zero**. O primeiro baseline, capturado antes da Fase 2, serve só para auditar a correção de cálculo.
5. **Exportar CSV** e abrir no Excel — o BOM (3396) precisa continuar lá.
6. **Barra inferior em iPhone real** a 390px, os 4 papéis.
7. **Um dia com loja fechada** (`closures`) e um dia sem template aplicável.
8. **Modo offline** — o banner (12409) e o comportamento das seções com dado velho.
9. **Central de Ajuda** — abrir `/ajuda`, buscar "relatórios", e perguntar ao chat de suporte "como exporto o relatório em PDF?". A resposta não pode citar uma aba que não existe mais.
10. **Recomendação `low_adherence` do J.I.T.** — clicar e confirmar que navega (era `tab: 'relatorios'`, 9067).

---

# H. Perguntas abertas

Nenhuma bloqueia o plano. Cada uma tem um default assumido, marcado como suposição.

**Q1 — Qual é a aderência canônica?** (§B.6)
Quatro fórmulas concorrentes hoje. Na aba única elas ficam a centímetros uma da outra.
**Default assumido:** `latestPerRound` + denominador **previsto** viram o padrão, e os três números ganham nomes distintos ("Cobertura do previsto", "Entrega completa", "Realização do entregue"). **Suposição:** que o cliente-piloto aceita ver os números mudarem em produção na Fase 2 — inclusive para baixo, onde hoje há inflação por reexecução.

**Q2 — `action_plans` está gravando em produção?** (Fase 0)
A migration cria `briefing_date`; o `sync.js` usa `jit_date`. Se ninguém alterou o banco fora do versionamento, o recurso nunca funcionou.
**Default assumido:** que **funciona** (o banco foi alterado manualmente), e a Fase 0 apenas confirma. **Suposição:** se não funcionar, a restrição dura nº 3 muda de "preservar" para "consertar", e vira pré-requisito da Fase 3.

**Q3 — O colaborador deve ganhar o seletor de período?**
Hoje ele tem horizontes fixos (dia + 7 dias). Dar-lhe "30 dias" não expõe dado novo — é o mesmo dado dele, em janela maior.
**Default assumido: não.** O painel dele é página de leitura fixa com uma ação. Menos controle, menos chance de vazamento por engano, e é literalmente o que ele tem hoje. **Suposição:** que ninguém pediu isso.

**Q4 — O pop-up de briefing continua abrindo automaticamente?**
Ele é o único push do app, mas a seção AGORA agora vive na primeira dobra do Painel — o gestor a vê ao entrar.
**Default assumido: sim, continua**, com o conteúdo reduzido (§F.1) e o marcador "visto" migrado para o viewport da seção. **Suposição:** que a métrica de hábito (`jit_opened` com `source: 'auto'`) ainda é considerada valiosa. Se não for, desligar o auto-open é a mudança mais barata do plano inteiro.

**Q5 — A aba Unidades continua existindo?**
O Painel consolidado passa a conter comparativo entre lojas + ranking do dia + situação por loja. `UnidadesView` (11196) abre com "Ranking das unidades · últimos 30 dias" e tem o ID Operacional da loja — **conteúdo que este plano não inventariou**.
**Default assumido: sim, continua** exatamente como está, fora da barra inferior, alcançada por `[ Ver todas as lojas → ]` no rodapé da seção REDE. **Suposição:** que o que ela tem de próprio justifica a aba. Se não justificar, é candidata a uma quarta consolidação — **em projeto separado, com inventário próprio**. Não esticar este plano para cobri-la.
