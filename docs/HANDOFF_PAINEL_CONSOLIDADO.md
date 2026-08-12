# HANDOFF — Painel consolidado (Painel + J.I.T. + Dados)

> Ponto de partida para uma sessão nova sobre a aba Painel. Autossuficiente.
> Última atualização: **12/08/2026**. `main` = `f6dfac1`, empurrado e **em produção**,
> com o layout de 5 cartões aprovado pelo dono do produto.

---

## 1. Como ler este documento

- **§2** — o que está em produção. É o que não se refaz.
- **§3** — pendências. É o que você provavelmente veio buscar.
- **§4** — mapa do código.
- **§5** — como testar, e o que os testes **não** cobrem.
- **§6** — armadilhas que custaram tempo nesta sessão.

O **desenho** e o porquê de cada decisão estão em
[`PLANO_CONSOLIDACAO_ABAS.md`](PLANO_CONSOLIDACAO_ABAS.md) (1.900 linhas, seis
fases, cada uma com o saldo real e o que mudou de decisão no caminho). Este
documento é o **estado**, não o desenho — não repete o plano.

Regra que vale para tudo: **o app está em uso por cliente real** (Ilhabela
Republic, IBR2 é a loja ativa). Número que a gestão lê não muda sem decisão
explícita.

---

## 2. O que está em produção

As abas **J.I.T.** e **Relatórios** não existem mais. O conteúdo das três virou
uma aba `painel` com cinco registros, de cima para baixo:

| Registro | Conteúdo | Quem vê |
|---|---|---|
| **AGORA** | follow-up de planos, leitura da operação, prioridades, base da operação, **fila de conferência** | `MANAGER_ROLES` |
| **DIA** | score (`Feito do previsto`) + `n/N · atrasados`, ontem/média 7d, por tipo, por setor | todos (por setor: gestão) |
| **REDE** | comparativo entre lojas, com os sinais de urgência do J.I.T. fundidos | `canSeeAllUnits` |
| **7 DIAS** | aderência por dia + ranking da equipe — faixa FIXA, sem gate e sem seletor | todos |
| **PERÍODO** | seletor + Exportar + três lentes (Tendência/Pessoas/Registros) | `MANAGER_ROLES` |

**A restrição que sustentou o desenho inteiro:** a linha do colaborador em
`ROLE_TABS` não mudou uma vírgula. Foi por isso que a aba consolidada reusou o id
`painel` em vez de ganhar nome novo — conceder uma aba nova a ele e depois
retirar conteúdo por dentro abriria vazamento por esquecimento.

Saldo: `page.js` de **14.092 → 10.166 linhas**. Verificado com PIN real de
colaborador, gestão e liderança; PDF de IBR2 · 30 dias deu `128/156 · 82%` em
**quatro leituras** (baseline, pós-extração, pós-segmento, pós-virada).

Também em produção, da mesma sessão: as três correções de PDF (§E.3), a trava da
fila de telemetria, o guarda do deep link, e o motor analítico deixando de rodar
para quem não vê análise.

---

## 3. Pendências

### 3.1 ✅ Resolvido em 12/08/2026 — o Conjunto A está completo

Os três nomes de §B.6 estão na tela E no PDF:

| Rótulo | Onde | Conta |
|---|---|---|
| **Feito do previsto** | score de 56px do registro DIA | tarefas feitas ÷ previstas |
| **Feito do entregue** | StatCard (era "Tarefas concluídas") | tarefas feitas ÷ submetidas |
| **Checklists 100%** | StatCard **novo**, em Tendência | rodadas TERMINADAS ÷ previstas |

O que destravou: `summary.checklists` é `filtered.length` — rodadas **entregues**,
completas ou parciais. O cartão `128/156` sempre mediu *entregues ÷ previstos*, e
o rótulo "Checklists concluídos" chamava de concluído o checklist entregue pela
metade. Ele virou **"Checklists entregues"** — mesmo número, sem a mentira — e o
estrito ganhou cartão próprio.

O cartão novo usa `completeRoundChecker`, o **mesmo predicado** que o `buildJit`
usa para separar `yDone` de `yPartial`. É o irmão de período do `yAdherence` que
o registro AGORA já mostra para ontem; contas diferentes fariam as duas metades
da mesma tela se contradizerem.

> **O PDF mudou de propósito: 4 → 5 cartões, dois rótulos renomeados.** Baseline
> novo capturado em 12/08/2026 11:03: `_baseline/POS-CHECKLISTS100 IBR2 - 30
> dias.pdf`. Os anteriores são da era de 4 cartões — servem para conferir número,
> não para comparação visual.

**O primeiro número que o cartão novo deu (IBR2, 30 dias, 12/08):**

| | |
|---|---|
| Checklists entregues | 138/169 · 82% |
| Checklists 100% | **136**/169 · 80% |

Diferença de **2**. A operação praticamente não deixa checklist pela metade — o
que falta para os 100% é checklist que **ninguém abriu** (31 de 169), não
trabalho malfeito. São problemas diferentes, com ações diferentes, e antes os
dois moravam dentro do mesmo `82%` sem jeito de separar. `Feito do entregue`
marcando 100% ao lado de `Checklists 100%` em 80% não é contradição: é a
distinção que os nomes carregam.

A distância entre "entregues" e "100%" é o tamanho do trabalho entregue pela
metade — número que antes não existia em lugar nenhum.

### 3.2 Dívida técnica registrada

- **Sem teste de LAYOUT.** `painel-render.spec.mjs` afirma presença e ausência de
  bloco, não largura nem espaçamento. O bug do grid de 280px ele pega porque
  virou asserção sobre a classe do root; um problema visual novo passaria.
- **`filterShift` continua morto** (§F.3-1), de propósito.

### 3.3 Higiene, fora do código

- ✅ **Resolvido:** as duplicatas de sincronia do iCloud foram apagadas e o padrão
  `* [2-9]` entrou no `.gitignore`. Eram 11 arquivos, incluindo 43MB de MP4 que um
  `git add -A` teria publicado. O `.env 2.local` também saiu — comparado por nome
  de chave antes, sem chave exclusiva e com um `VERCEL_OIDC_TOKEN` já expirado.
- **Duplicatas ` 2` dentro de `.next/`, `node_modules/` e dos worktrees de outras
  sessões** seguem lá, de propósito: são artefato de build ou não são nossas.
- ⚠️ **O contador do iCloud incrementa.** O `.gitignore` cobre ` 2` a ` 9`, e o
  comentário lá avisa que isso também engoliria um `Parte 2.md` legítimo.

---

## 4. Mapa do código

```
components/painel/
  PainelConsolidado.js   a aba: os cinco registros. `PainelComRelatorio` só monta
                         para MANAGER_ROLES — é ele que decide quem paga o motor
  ReportsView.js         o corpo analítico (`ReportsBody`) + fila de conferência
                         + DisputeCard + ReviewModal. NÃO exporta `ReportsView`
  useRelatorio.js        o MOTOR: estado de filtro, derivados, exportCSV/PDF
  agora.js               os blocos do registro AGORA — dois consumidores: a aba
                         e o pop-up de briefing. Não existe segunda cópia
  JitPanel.js            `buildJit`/`buildInsight` + o pop-up (só o AGORA)
  NotificationHistory.js única superfície de `notification_log`
  shared.js, context.js
```

Quem chama `useRelatorio` é quem **compõe** a tela — por isso o seletor de
período pode viver numa faixa no topo do Painel enquanto os números continuam
vindo de uma origem só. `ReportsBody` recebe `segment` e `embedded`; sem eles
monta a tela inteira, que é como o teste verifica que a fatia não escondeu nada.

**Regra de direção:** nada em `lib/` ou `components/` importa de `app/`.

---

## 5. Como testar

```bash
cd ibr-checklists-app && npm run verify   # eslint --quiet && npm run test && next build
npx playwright test tests/dates.spec.js tests/rounds.spec.js --reporter=line
```

| Teste | O que prova |
|---|---|
| `conferencia.spec.mjs` | ordem da fila de conferência |
| `painel-render.spec.mjs` | **o que aparece e o que NÃO aparece por papel** — a fronteira de acesso, e que o motor não roda para colaborador |
| `track.spec.mjs` | a fila de telemetria não perde evento em concorrência |
| `appurl.spec.mjs` | aba na URL sobrevive ao login; aliases de abas aposentadas |
| dates + rounds (Playwright) | 71 casos de fuso e de rodada |

Os três de renderização/DOM montam componentes de verdade (jsdom + esbuild) e
**não precisam de sessão logada** — que é o que impede o Playwright de cobrir
tela logada (`tests/visual-baseline.spec.js:15`).

**Mexeu em gate de acesso, rode `painel-render`.** É lá que mora a prova de que o
colaborador não vê bloco de gestão.

### O que os testes NÃO cobrem

Layout, e o PDF. Para os dois, o caminho é deploy de preview — ver a memória
`preview-tela-logada`: `npx vercel --yes` (sem `--prod`) cai no tenant IBR
sozinho, o SSO passa com login normal, e **grava no Supabase de produção**.

---

## 6. Armadilhas que custaram tempo

1. **Build limpo não prova que a tela renderiza.** Três defeitos desta
   consolidação passaram por lint, build, 71 testes e pela comparação do PDF. Os
   três eram de RENDERIZAÇÃO. O PDF, o portão mais forte que havia, lê
   `filtered`/`summary`/`groups` direto do motor e **nunca toca no JSX** — bloco
   que não renderiza não muda um dígito do arquivo exportado.
2. **Bloco que mora num lugar só some quando o lugar morre.** J6, J14 e P13
   existiam apenas dentro do J.I.T./PainelView. Ao encolher o pop-up e apagar a
   `PainelView`, os três sumiram do produto. J6 e J14 foram pegos antes; **P13
   (histórico de notificações) só foi pego escrevendo o teste**.
3. **`git add -A` neste repositório é perigoso.** A raiz tem 43MB de MP4 e PDFs
   com nome de gente real, e o repositório é PÚBLICO. Ver a regra em `CLAUDE.md`.
4. **`timeout` não existe neste Mac** e o `||` de diagnóstico mente por causa
   disso — leva a concluir que um teste travou quando ele nem rodou. `brew` e
   `poppler` também não existem; PDF se lê com `pypdf`.
5. **`setTimeout` não serve de cão de guarda contra laço de render.** O laço
   acontece dentro do `act()`, que drena síncrono, e o timer nunca roda. Quem
   conta é o componente.
6. **Correção de dado em produção só aparece para quem reinicia a sessão** —
   templates ficam em IndexedDB e há service worker. Já invalidou uma verificação.
