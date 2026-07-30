# HANDOFF — Checklists: execução, status e métricas

> Ponto de partida para uma sessão nova sobre checklists. Autossuficiente.
> Última atualização: **30/07/2026**. `main` = `7fa0313`+, empurrado e em produção.
> (O nome do arquivo é histórico — nasceu para a tarefa do status, que já foi
> feita. Hoje ele cobre o domínio de checklists inteiro.)

---

## 1. Como ler este documento

- **§2** — pendências. É o que você provavelmente veio buscar.
- **§3** — o que está em produção, para não refazer.
- **§4** — mapa do código: onde cada regra mora.
- **§5** — como testar. **§6** — armadilhas que já custaram tempo. **§7** — infra.

Uma regra que vale para tudo aqui: **o app está em uso por cliente real**
(Ilhabela Republic). Migration é aditiva, o cliente tem que continuar de pé no
intervalo entre migration e deploy, e número que a gestão lê não muda sem decisão
explícita.

---

## 2. PENDÊNCIAS

### 2.1 Sem teste no app real — o maior bloco

Tudo abaixo está **em produção e sem uma única passagem por mão humana**. A
camada de banco tem teste (PGlite), a lógica pura tem teste (Playwright), mas o
comportamento na tela nunca foi exercitado. A sessão de 30/07 provou que isso
importa: o bloqueio por tarefa passou 3 commits parecendo pronto e **não
funcionava** no caso mais comum — quem pegou foi um teste no aparelho, não os 61
testes automatizados.

Precisa de **dois aparelhos, dois logins simultâneos**:

- **Perder a disputa por um item.** Dois marcam a mesma tarefa ao mesmo tempo; o
  segundo deve ver *"acabou de ser concluída por Fulano"* e o check deve voltar.
- **Foto obrigatória fechada por quem NÃO tirou a foto.** A anexa no aparelho A,
  o B conclui o checklist. Era o bug que travava o colega.
- **Observação do colega** entrando no registro de quem submete (debounce de
  900ms, `setLiveEvidence`).

Precisa de **um aparelho** só:

- **Status parcial na tela**: badge "Parcial" em âmbar, cartão dizendo "5 de 8
  feitos", contador de parciais no nível 1 do Executar, e o tipo do Painel
  deixando de ficar verde.
- **Aderência sem parcial**: conferir que caiu onde havia entrega incompleta, e
  que o J.I.T. mostra "Completos" + "Parciais" ao lado.
- **Desativar um checklist** pelo botão de remover em Gerenciar: confirmar que ele
  sai da operação, que as execuções continuam no relatório, e que nada de
  aderência histórica se move.
- **Fila offline de marcação**: marcar item em modo avião, voltar a rede, ver a
  marcação chegar (entra em `ibr_offline_queue`, tipo `live_task`, validade 12h).
- **Foto da rodada**: `uploadRoundPhoto` sobe para `rodada/{tpl}/{loja}/{dia}/{item}.jpg`
  no momento em que é anexada, e `linkRoundPhoto` liga ao registro de quem
  submete. Nunca exercitado — nem o `hasPhoto` vindo da rodada.

### 2.2 Push: o alcance é de UMA pessoa

`push_subscriptions` tem **1 linha** em toda a empresa (com `user_id`, sem
órfãs). Todo alerta — atraso e entrega incompleta — chega a uma pessoa só.

**Não há como ativar pelo servidor**: inscrição de Web Push nasce no navegador do
próprio aparelho. No iPhone exige o PWA instalado na Tela de Início. Cada pessoa
toca em "NOTIF. OFF" no cabeçalho, no aparelho dela.

Pendências concretas:

- Descobrir de quem é a única inscrição:
  ```sql
  select u.name, u.role, count(p.endpoint) as inscricoes, max(p.updated_at) as ultima from public.users u left join public.push_subscriptions p on p.user_id = u.id where u.suspended is not true group by 1,2 order by inscricoes desc, u.name;
  ```
- A equipe ativar nos aparelhos. A aba Usuários (só `gestao`) já mostra quem está
  de fora, com marcador por linha e resumo no topo.
- **Confirmar entrega de verdade.** O `?dry=1` prova o alvo, não a chegada. Duas
  formas: esperar um prazo vencer (16:50 / 18:20, o cron roda a cada 5 min), ou
  criar um `ZZ Teste Push` com prazo 00:01, executar marcando 1 de 2 e concluir —
  em 5 minutos sai *"📋 Entregue incompleto"*. Depois desativar o checklist.
  Cuidado: o push vai para TODOS os inscritos.

### 2.3 Decisões tomadas que ainda podem doer

- **`created_at` dos 19 checklists foi zerado** em 30/07 (`update templates set
  created_at = null`). Consequência: para 25–29/07 o app segue cobrando 19
  previstos em dias que tinham 1, 6 ou 18 — a distorção fica registrada e não sai
  mais. A janela histórica passa a valer só para checklist criado a partir de
  agora. Recomendei não reconstruir por aproximação (erraria para o outro lado).
  As datas reais não são recuperáveis: criar checklist pelo formulário não emite
  evento (só `template_adopted`, da biblioteca e do onboarding).
- **Checklist SEM prazo não gera alerta nenhum** — nem atraso, nem entrega
  incompleta. O prazo é o gatilho dos dois. Afeta o "Intermediário". Se quiser
  cobrir, precisa de outro gatilho de tempo (ex.: X horas após a submissão).
- **Aderência caiu** onde havia entrega incompleta. É o efeito pretendido, mas
  ninguém da operação foi avisado. Vale comunicar antes que alguém leia como
  queda de desempenho.

### 2.4 Dívida técnica — corrigida em 30/07

- ~~**`templateStatus` usava o fuso de quem olha.**~~ **CORRIGIDO.** O prazo virou
  um INSTANTE no relógio da loja (`instantAt(date, deadline, tz)`), e todos os 5
  call sites passam o fuso: `ExecutarView` e `PainelView` via `tzOf(unit)`,
  `buildJit` via `tzOfUnit(units, t.unitId)` — numa rede multi-fuso não existe um
  fuso único para a lista de atrasados. A regra saiu para
  `statusFromProgress` (`lib/rounds.js`) com 10 testes, incluindo os dois defeitos
  que ninguém tinha visto: **dia passado sem entrega ficava "pendente" para
  sempre** (só a hora era comparada, a data era ignorada) e **prazo 23:30 contra
  00:10 dava "no prazo"**.
- ~~**Agendamentos de cron fora do repositório.**~~ **VERSIONADOS** em
  `20260730_crons_versionados.sql`: os quatro (`notify-overdue-checklists`,
  `cleanup-checklist-photos`, `cleanup-login-attempts`, `purge-live-tasks`). Cada
  um só é criado se NÃO existir — no banco de hoje a migration é no-op, de
  propósito: substituir o que está no ar por uma transcrição arriscaria derrubar o
  alerta por um erro de digitação. O valor dela é o dia em que o projeto for
  recriado.
- ~~**`supabase/` na raiz**~~ entrou no `.gitignore` (artefato do CLI).

Segue em aberto, porque é decisão sua e envolve apagar coisa:

- **`ibr-checklists-app-codex-update/`** — cópia morta (já ignorada pelo git).
- **`video-colaboradores/`** — 44 MB não rastreados; num repo público é sua
  chamada se entram, ficam de fora ou vão para outro lugar.

---

## 3. O que está em produção (não refazer)

Nove commits em 29–30/07, todos empurrados e deployados. Verificados **pelo hash
do chunk servido**, não pelo "READY" do deploy.

| Commit | O que entregou |
|---|---|
| `0deb6c2` | Execução colaborativa: claim atômico no banco, evidência compartilhada (nota + foto na rodada), fila offline, purga de `live_tasks`, crédito por tarefa nos eventos |
| `77e0107` | Bloqueio por TAREFA (não por checklist); tarefas pendentes de checklist já submetido seguem executáveis |
| `66ff373` | A trava da tarefa registrada sobrevive à rodada (o bloqueio não engatava no caso mais comum); âncora da tela de conclusão |
| `a740dc8` | Desduplicação de rodada no J.I.T.; pontualidade pela PRIMEIRA entrega |
| `ef9723e` | Status `partial`; desativar em vez de apagar checklist; desduplicação nos 3 agregadores que faltavam (Equipe, Liderança, Unidades) |
| `573db4f` | Entrega incompleta deixa de contar como entrega na aderência |
| `448d9e7` | Alerta "entregue incompleto" (notify-overdue v11) |
| `50213fd` | `?dry=1` na notify-overdue (v12) |
| `20680fe` + `498c1ba` | Reinscrição de push a cada abertura; aba Usuários mostra quem está sem notificação |

**Migrations aplicadas** no Supabase (`rjuulamozdhssgqrzfji`):
`20260729_live_tasks_colaborativo` (RPCs de claim/release/reopen/evidência +
purga agendada 06:30) · `20260730_reopen_sem_rodada` · `20260730_templates_desativar`.

**Edge function** `notify-overdue` na v12 (Supabase version 22).

---

## 4. Mapa do código

### 4.1 `lib/rounds.js` — as regras de negócio, todas testadas

| Função | Responde |
|---|---|
| `latestPerRound` | uma submissão por rodada — a última (completude, crédito, aderência) |
| `earliestPerRound` | uma por rodada — a primeira (**só** pontualidade) |
| `roundProgress` | quantas das tarefas previstas foram feitas (união das submissões ∩ previstas do dia) |
| `roundIsComplete` | a rodada foi entregue completa? (régua da aderência) |
| `submittedTasksFrom` | tarefas já registradas hoje — o que não se refaz |
| `mergeRoundState` | rodada ao vivo + registradas; a precedência decide se dá para refazer |
| `templateExistedOn` | o checklist era previsto naquele dia? |
| `statusFromProgress` | done / partial / overdue / pending — prazo no relógio da LOJA |

**Precedência do merge** (a mais delicada): reabertura deliberada > rodada com a
tarefa concluída > registro gravado. A terceira regra existe porque uma linha
`done: false` na rodada pode ser rascunho de evidência e não desfaz serviço
entregue.

### 4.2 Onde cada coisa é consumida

- **Execução**: `ExecutionScreen` (`app/app/page.js`). `submittedByItem` +
  `mergeRoundState` decidem o bloqueio por tarefa; `liveRaw` é a rodada crua e
  `liveByItem` a visão derivada (derivar importa: `completions` chega assíncrono).
- **Status**: `templateStatus` + `templateProgress` + `STATUS_CFG`. Consumidores:
  `ExecutarView` (badge e contadores), `PainelView` (badge e cor do tipo),
  `buildJit` (lista de atrasados).
- **Aderência** (3 lugares, todos com `completeRoundChecker`): `computeUnitProfile`
  (Unidades), `computeLeadershipProfile` (Equipe · Liderança), `buildJit` (J.I.T.).
- **Ranking de pessoas**: `computeOperationalProfile` (Equipe e Meu ID).
- **Produtividade / relatórios**: `collaboratorStats`, `computeProductivity`.

**Sete agregadores contam execuções.** Ao mexer em qualquer regra de contagem,
confira os sete — em 30/07 a aba Equipe ficou metade corrigida por eu ter parado
nos quatro primeiros.

### 4.3 Fora do app

- `supabase/functions/notify-overdue/index.ts` (v12) — dois alertas, `?dry=1`,
  `previstasDoDia` espelhando `applicableItems`. **Deploy separado**:
  `npx supabase functions deploy notify-overdue --project-ref rjuulamozdhssgqrzfji`.
  O teste `incompleto.test.mjs` extrai a função do próprio arquivo, sem copiar.
- Convenção de versão: o número no comentário da linha 1 e no `console.log` de
  início. Incrementar os dois é parte do procedimento — é como se confirma nos
  logs qual versão está rodando.

---

## 5. Como testar

```bash
cd ibr-checklists-app && npx playwright test tests/rounds.spec.js tests/dates.spec.js
```

```bash
cd ibr-checklists-app && npm i --no-save @electric-sql/pglite && for f in 20260729_live_tasks_colaborativo 20260730_reopen_sem_rodada 20260730_templates_desativar 20260730_crons_versionados; do node supabase/migrations/$f.test.mjs; done
```

```bash
cd ibr-checklists-app && node supabase/functions/notify-overdue/incompleto.test.mjs
```

Inspecionar o push sem notificar ninguém:

```bash
curl -s -X POST "https://rjuulamozdhssgqrzfji.supabase.co/functions/v1/notify-overdue?dry=1" -H "Authorization: Bearer $(grep -o 'eyJ[A-Za-z0-9_.-]*' ibr-checklists-app/lib/supabase.js | head -1)" -d '{}'
```

71 testes puros + 4 suítes de migration + 14 asserções da edge function passavam
em 30/07.

---

## 6. Armadilhas que já custaram tempo

- **Conferir deploy pelo HASH do chunk**, nunca pelo "READY". Um reteste inteiro
  foi feito em cima do bundle antigo porque o commit estava só local.
- **O minificador escapa acento** (`conclu\xeddo`): buscar string acentuada no
  bundle dá falso negativo.
- **`completions.date` é `date`; `live_tasks.date` é `text`.** Reusar o padrão de
  uma na outra dá `42883`. O repo **não tem DDL de `completions`** — a fonte da
  verdade sobre tipos é o banco.
- **Sondar função sem executar**: chamar o RPC pelo REST com a anon key e ler o
  código — `42501` = existe e o anon está barrado; `PGRST202` = não existe. Mas
  **não distingue versões** da mesma função (assinatura igual); para isso,
  `select prosrc like '%trecho%' from pg_proc where proname = '...'`.
- **`add column ... default now()` materializa o default nas linhas existentes.**
  Foi por isso que `created_at` entrou em duas etapas.
- **Teste que afirma a suposição errada passa.** O bloqueio por tarefa tinha
  teste, e o teste estava errado junto com o código. Quando um teste e a tela
  discordam, a tela tem razão.

---

## 7. Infra

- git root: `/Users/michelfaria/Documents/Site ZCheck` — **não** em `ibr-checklists-app/`
- deploy do app: `cd ibr-checklists-app && npx vercel --prod`
- Supabase `rjuulamozdhssgqrzfji` · GitHub `github.com/michelfaria/zcheck-app` (público)
- Migrations rodam **à mão no SQL Editor**; não há runner
- O login do app é por PIN. **Eu não digito PIN nem senha** — teste no app é
  sempre você executando e eu conferindo o rastro em SQL (`live_tasks`, `events`,
  `completions`). Foi o loop que achou os dois bugs desta sessão.
