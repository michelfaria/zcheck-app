# Baseline de produção — antes da Fase 2

Capturado em **10/08/2026 ~21:25**, com o código da `main` em produção (nenhuma
Fase 1a/1b deployada). Serve para responder, depois da Fase 2, à única pergunta
que importa: **este número mudou porque eu quis, ou porque eu quebrei?**

> **Os PDFs de origem NÃO estão neste repositório.** Eles contêm nome completo e
> desempenho individual de colaboradores reais, e o repo é público. Ficam em
> `_baseline/` na raiz do projeto, que está no `.gitignore`. Aqui só entram
> agregados e colaboradores anonimizados.

## Recortes capturados

| Recorte | Arquivo em `_baseline/` |
|---|---|
| Todas as lojas · 7 dias | `IBR Relatório — Todas as lojas.pdf` |
| Todas as lojas · 30 dias | `IBR Relatório — Todas as lojas - 30 dias.pdf` |
| Todas as lojas · Tudo | `IBR Relatório — Todas as lojas - tudo dias.pdf` |
| IBR2 · 7 dias | `IBR Relatório — IBR2. - 7 dias.pdf` |
| IBR2 · 30 dias | `IBR Relatório — IBR2. - 30 dias.pdf` |

**IBR1 não existe como recorte** — a loja não tem execução nenhuma (confirmado
pelo usuário em 11/08). Praticamente todo o dado da empresa é IBR2.

⚠️ Os PDFs de IBR2 foram exportados em **11/08 07:54**, os de "Todas as lojas"
em **10/08 21:25**. Por isso IBR2/30d (125 execuções) tem uma execução A MAIS que
Todas/30d (124): entrou uma durante a noite. Ao comparar depois da Fase 2, use o
recorte contra ele mesmo, nunca IBR2 contra Todas.

## Números do cabeçalho (os quatro cartões do PDF)

| Recorte | Realização geral | Checklists | % do esperado | Críticos pend. | Fotos |
|---|---|---|---|---|---|
| 7 dias | **100%** (652 de 652 tarefas) | 71/90 | **79%** | 0 | 100 |
| 30 dias | **100%** (1146 de 1149) | 124/385 | **32%** | 1 | 178 |
| Tudo | **100%** (1146 de 1149) | 124/143 | **87%** | 1 | 178 |
| IBR2 · 7 dias | **100%** (553 de 553) | 60/78 | **77%** | 0 | 88 |
| IBR2 · 30 dias | **100%** (1154 de 1157) | 125/362 | **35%** | 1 | 181 |

Realização por tipo de checklist: Abertura 100%, Rotina 100%, Fechamento 100%
nos três recortes.

## Desempenho por colaborador (anonimizado — mapa nos PDFs locais)

7 dias — checklists / tarefas (críticas) / % realização / críticos pend.

| | | | |
|---|---|---|---|
| A | 41 / 266 (65) | 100% | — |
| B | 17 / 159 (10) | 100% | — |
| C | 13 / 143 (1) | 100% | — |
| D | 0 / 84 (16) | — | — |

30 dias e Tudo (idênticos entre si):

| | | | |
|---|---|---|---|
| C | 36 / 321 (10) | 100% | — |
| B | 21 / 276 (17) | 100% | — |
| D | 4 / 148 (29) | 100% | — |
| A | 63 / 401 (104) | 99% | 1 |

## ⚠️ Achado do baseline: o denominador de "% do esperado" é incoerente entre períodos

**As mesmas 124 execuções produzem 32% ou 87% dependendo só de qual botão se
aperta.** Não é arredondamento — é o denominador.

Prova, extraída das próprias listas de execução dos PDFs:

| Recorte | Execuções listadas | Dias distintos | Intervalo real | Denominador |
|---|---|---|---|---|
| 7 dias | 71 | 6 | 04/08 → 10/08 | 90 |
| 30 dias | **124** | **11** | **29/07 → 10/08** | **385** |
| Tudo | **124** | **11** | **29/07 → 10/08** | **143** |
| IBR2 · 30 dias | 125 | 12 | 29/07 → 11/08 | 362 |
| IBR2 · 7 dias | 60 | 6 | 05/08 → 11/08 | 78 |

"30 dias" e "Tudo" têm **exatamente os mesmos dados**. A diferença é que:

- **"Tudo"** limita o previsto aos dias que existem (`periodDates` devolve `null`
  para `all`, e o cálculo cai sobre o intervalo com dados) → 143 ≈ 11–13 dias
  × ~12,8 checklists/dia.
- **"30 dias"** conta os 30 dias corridos → 385 ≈ 30 × 12,8. Só que a operação
  começou em **29/07**: dos 30 dias, **17 são anteriores à primeira execução da
  empresa**. O relatório está cobrando checklists de dias em que o ZCheck nem
  estava em uso.

Consequência: o "32% do esperado" de 30 dias é **enganoso**, e é o número que um
gestor lê como "a operação está péssima". O de "Tudo" (87%) é o honesto.

Isto é um caso concreto da §B.6 — e amplia o escopo dela. B.6 tratava do
*numerador* (`latestPerRound`) e da escolha entre "previsto" e "submetido". Este
achado mostra que o **previsto também precisa ser recortado pela existência da
operação**, senão a régua nova herda o defeito. Candidatos de correção, a decidir
na Fase 2:

1. limitar o previsto à data da primeira execução da empresa (o que "Tudo" já
   faz sem querer);
2. ou limitar pela data de criação de cada checklist (`templateExistedOn` já
   existe e é usado em `countApplicableTemplatesOnDate`) — mais correto, porque
   cobre checklist criado no meio do período.

### ⚠️ Antes de escolher: pode não ser bug de código, e sim dado faltando

Investigado em 11/08. O caminho do previsto **já tem** a trava certa:

- `ReportsView.js:967` soma `countApplicableTemplatesOnDate` sobre `openDates`,
  que já exclui folgas (`isUnitClosed`);
- `countApplicableTemplatesOnDate` (`lib/stats.js`) já filtra por
  `templateExistedOn(t, dateStr)`;
- `templateExistedOn` (`lib/rounds.js:128`) devolve **`true` quando
  `t.createdAt` é nulo**;
- `lib/sync.js:83` mapeia `createdAt: row.created_at ?? null`.

Ou seja: se `templates.created_at` estiver **nulo** (ou for anterior a 29/07) no
banco, todo dia do período conta, e é exatamente isso que produz 385. O código
estaria certo e o **dado** é que falta.

**RESPONDIDO em 11/08:** `templates = 13`, `sem_created_at = 13`,
`mais_antigo = null`, `primeira_execucao = 2026-07-29`. **Todos os 13 checklists
têm `created_at` nulo.** O código está correto; o dado é que falta.

E o NULL foi **deliberado**. A migration `20260730_templates_desativar.sql:56`
adiciona a coluna sem default e só então declara `default now()`, justamente
para as linhas existentes ficarem em NULL — o comentário 51-55 diz por quê:
`add column ... default now()` num passo só materializaria "agora" nas linhas
antigas e todo checklist do parque passaria a "ter nascido hoje", movendo a
aderência de meses fechados.

O raciocínio era certo para um parque com histórico. **Para um tenant que
acabou de começar ele se inverte:** o IBR executou pela primeira vez em 29/07 e
a migration rodou em 30/07, então "sempre existiu" faz o previsto alcançar 30
dias para trás numa empresa com 13 dias de vida. É daí que sai o 385, e o "32%".

**Correção proposta — backfill, não patch no app** (roda no SQL Editor; a
decisão de aplicar é do dono do banco):

```sql
-- Checklist não pode ser cobrado de antes de a empresa existir.
-- Usa a primeira execução da empresa como piso; ajuste se houver data melhor.
update public.templates t
   set created_at = coalesce(
         (select min(c.date)::timestamptz from public.completions c
           where c.company_id = t.company_id),
         now())
 where t.created_at is null;
```

Efeito estimado no recorte de 30 dias: previsto cai de 385 para ~165
(13 dias × ~12,8/dia), e o "% do esperado" sobe de **32% para ~75%**. Nenhuma
contagem absoluta se move — só o denominador.

**Consulta original que decidiu isto:**

```sql
select count(*)                       as templates,
       count(*) filter (where created_at is null) as sem_created_at,
       min(created_at)::date          as mais_antigo,
       max(created_at)::date          as mais_novo,
       (select min(date) from public.completions) as primeira_execucao
  from public.templates;
```

- `sem_created_at > 0` → **backfill no banco**, não patch no app.
- `mais_antigo` bem antes de 29/07 → decisão de produto: o previsto deve ser
  limitado ao início do uso do app, e aí sim entra código.

Enquanto isso não for respondido, **não** inventar heurística de "primeira
execução" no app: mascararia um problema de dado.

---

# SEGUNDO BASELINE — depois do backfill (11/08/2026 09:12)

É o baseline que a **Fase 4** exige (§E.3): o PDF gerado pela aba consolidada
tem de bater com este, não com o de antes.

Arquivos em `_baseline/`: `POS-BACKFILL Todas as lojas - 30 dias.pdf` e
`POS-BACKFILL IBR2 - 30 dias.pdf`.

| Recorte · 30 dias | Antes | Depois | |
|---|---|---|---|
| **Todas** — checklists | 124/**385** | 128/**180** | denominador −53% |
| **Todas** — % do esperado | **32%** | **71%** | |
| **IBR2** — checklists | 125/**362** | 128/**156** | denominador −57% |
| **IBR2** — % do esperado | **35%** | **82%** | |

O backfill fez exatamente o previsto: o previsto deixou de contar os ~17 dias
anteriores à existência da empresa.

## ⚠️ O primeiro reexport não mostrou nada — e isso é um achado

Às 09:03, já com o banco corrigido e verificado, o relatório saiu **idêntico ao
de antes** (IBR2 em `125/362`, o mesmo dígito). Às 09:12, depois de fechar e
reabrir o app, saiu `128/156`.

Causa: **cache do cliente**. `lib/sync.js:85` grava os templates em IndexedDB
(`ibr_templates`), e existe `public/sw.js`. A sessão aberta seguia usando os
templates carregados antes do backfill.

Consequência prática, que vale para qualquer correção de dado daqui para frente:
**mudar o banco não muda o que a equipe vê até a sessão dela ser reiniciada.**
Quem for aplicar uma correção de dado em produção precisa avisar a operação para
fechar e reabrir o app — ou aceitar que o efeito aparece aos poucos, conforme
cada aparelho recarrega.

## Nota sobre as contagens absolutas

Elas **mudaram** entre os dois baselines: 125 → 128 execuções, 1154 → 1189
tarefas, 181 → 182 fotos. Não é regressão — são nove minutos de turno da manhã
executando checklist de verdade. Os indícios: o intervalo de datas não mudou
(29/07 → 11/08, 12 dias), o incremento é coerente (+3 execuções, +35 tarefas ≈
11,7 por execução, na média do parque) e os críticos pendentes seguem em 1.

A regra "contagem absoluta que muda é regressão" continua valendo, mas só quando
a comparação for **entre duas leituras do mesmo instante** — o que a Fase 4 vai
fazer (mesma janela, aba antiga vs aba nova, lado a lado).

---

## Como usar isto depois da Fase 2

Reexportar os mesmos recortes e comparar linha a linha com a tabela acima.
Mudança esperada e desejada: os percentuais de "% do esperado" sobem (o previsto
deixa de contar dias inexistentes) e "Realização geral" pode cair (o denominador
passa de submetidas para previstas). Qualquer mudança em **contagens absolutas**
— 124 execuções, 178 fotos, 652 tarefas — é regressão, não melhoria.
