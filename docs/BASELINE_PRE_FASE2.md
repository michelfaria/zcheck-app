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

**Faltam:** IBR1 e IBR2, em 7d e 30d. Sem eles não dá para verificar se a Fase 2
quebrou o escopo por loja — que é justamente onde `groupStats` perdeu o default
`UNITS` na Fase 1a.

## Números do cabeçalho (os quatro cartões do PDF)

| Recorte | Realização geral | Checklists | % do esperado | Críticos pend. | Fotos |
|---|---|---|---|---|---|
| 7 dias | **100%** (652 de 652 tarefas) | 71/90 | **79%** | 0 | 100 |
| 30 dias | **100%** (1146 de 1149) | 124/385 | **32%** | 1 | 178 |
| Tudo | **100%** (1146 de 1149) | 124/143 | **87%** | 1 | 178 |

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
   cobre checklist criado no meio do período;
3. e, nos dois casos, descontar as folgas (`closures`), que hoje entram como
   previsto em alguns caminhos.

## Como usar isto depois da Fase 2

Reexportar os mesmos recortes e comparar linha a linha com a tabela acima.
Mudança esperada e desejada: os percentuais de "% do esperado" sobem (o previsto
deixa de contar dias inexistentes) e "Realização geral" pode cair (o denominador
passa de submetidas para previstas). Qualquer mudança em **contagens absolutas**
— 124 execuções, 178 fotos, 652 tarefas — é regressão, não melhoria.
