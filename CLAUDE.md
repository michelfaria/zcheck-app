# ZCheck — Contexto do projeto

App de checklists multi-tenant (SaaS). Landing page + app por subdomínio de empresa.

## Infraestrutura

- Domínio: `zcheckapp.com` (GoDaddy) — DNS A `76.76.21.21`, CNAME `*.zcheckapp.com → cname.vercel-dns.com`
- Vercel: org `ilhabelarepublic`, projeto `ibr-checklists-app`
- Supabase: `https://rjuulamozdhssgqrzfji.supabase.co`
- GitHub: `https://github.com/michelfaria/zcheck-app.git` (público)
- WhatsApp contato: `https://wa.me/5512988017472`

## URLs ativas

- `zcheckapp.com` → landing page
- `zcheckapp.com/lista` → waitlist (grava na tabela `waitlist`; leads lidos só no SQL Editor)
- `zcheckapp.com/entrar` → página de código da empresa
- `ilhabelarepublic.zcheckapp.com/app` → app IBR

## Arquivos principais (dentro de `ibr-checklists-app/`)

```
app/page.js                      → landing page (tokens; CTA = cadastro self-service /comecar)
app/lista/page.js                → formulário do waitlist
app/entrar/page.js               → página de código da empresa
app/app/page.js                  → app principal (~10.200 linhas)
components/painel/               → a aba Painel consolidada (Painel+J.I.T.+Dados)
  PainelConsolidado.js           → a aba: Agora, Dia, Rede, faixa 7d, Período
  ReportsView.js                 → o corpo analítico (ReportsBody) + conferência
  useRelatorio.js                → motor de filtro/derivados + exportCSV/exportPDF
  agora.js                       → blocos do registro AGORA (Painel E pop-up)
  JitPanel.js                    → buildJit + o pop-up de briefing
  shared.js, context.js, NotificationHistory.js
components/PlanoVagas.js         → vagas na tela: medidor da aba Usuários, folha "Plano e vagas",
                                   diálogos de "sem vaga livre" e o aviso da versão dos Termos
app/cadastro/page.js             → pedido de PIN de colaborador (não cria empresa)
app/onboarding/page.js           → cria empresa via /api/admin/provision (exige chave)
app/importar/page.js             → importa CSV (exige PIN de gerência/gestão)
app/api/auth/session/route.js    → PIN → JWT assinado com o segredo do Supabase
app/api/admin/provision/route.js → provisiona empresa (service_role, server-only)
app/api/billing/seats/route.js   → contrata/reduz vagas adicionais (só diretoria, role 'gestao')
app/api/admin/cron/billing-sync/ → cron diário (11:00 UTC, vercel.json): valor da assinatura no MP
                                   = lojas ativas + vagas contratadas; ≠ cobrado → reajusta ou pendente
app/layout.js                    → layout global
app/globals.css                  → estilos globais (@tailwind + CSS vars dos tokens)
lib/tokens.js                    → FONTE ÚNICA de cor/raio/peso/tamanho (C/R/W/T)
lib/dates.js                     → FONTE ÚNICA do "dia de operação" (fuso POR LOJA, units.timezone)
lib/recurrence.js                → FONTE ÚNICA de "a tarefa vale neste dia?": dia da semana (`recurrence`)
                                   ou periódica (`period` = todo dia N / a cada N dias·semanas·meses);
                                   espelho em supabase/functions/notify-overdue (teste de paridade)
components/RecurrenceEditor.js   → "Repetir" da tarefa (4 modos + próximas datas), nos dois editores
lib/plans.js                     → FONTE ÚNICA de preço e vagas: R$ 97 anual / R$ 127 mensal por loja,
                                   10 vagas por loja somadas, vaga adicional R$ 17,00/mês (formatBRL)
lib/seats.js                     → decisões puras do servidor sobre vagas e valor (checkout, webhook, cron)
lib/library.js                   → biblioteca de checklists prontos por setor
lib/serverAuth.js                → assina o token de sessão (NUNCA importar no cliente)
lib/tenant.js                    → detecção de tenant por hostname
middleware.js                    → redireciona subdomínios para /app
public/zcheck-logo.png           → logo horizontal 400x100px transparente
public/landing/*.png             → telas REAIS do app para a landing, com dados fictícios
scripts/landing-shots/           → gera essas telas: `node scripts/landing-shots/run.mjs`
                                   (componentes de produção + fixtures.js, fetch dublado)
public/manifest.json             → PWA, start_url: /app
```

## Design tokens

Fonte única em `lib/tokens.js` (objeto `C` de cores + `R` raio + `W` peso +
`T` tamanho), espelhados como CSS vars em `globals.css`. A landing consome os
MESMOS tokens desde 10/07/2026 — não existe mais paleta própria da landing.
Toda cor de texto foi medida contra o fundo e passa WCAG AA; ao mudar um valor,
meça de novo (instruções e números no cabeçalho do próprio tokens.js).

## Mapeamento de empresas (app/entrar/page.js)

```js
const EMPRESAS = {
  'ilhabelarepublic': 'ilhabelarepublic',
  'ibr': 'ilhabelarepublic',
};
```

## Pendências prioritárias (estado 28/06/2026)

1. Logo unificado — landing page `height: 32px`, login `width: 200px` — alinhar tamanho
2. Ícones dos cards de benefícios na landing page — cada um com ícone diferente
3. Identidade visual interna — app ainda com estilo antigo; não aplicar sem cuidado (quebrou antes)
4. Login email+senha para contas de gestão
5. Empresas no Supabase — tirar o mapeamento hardcoded de `entrar/page.js`
6. Página `/entrar` — link no header da landing page apontando para ela (botão "Acessar" já aponta)

## Regras importantes

- Sempre ler antes de editar — ver o trecho exato antes de fazer replace
- Data: NUNCA `toISOString().slice(0,10)` para o dia de operação — devolve UTC e
  vira o dia seguinte depois das 21h em Brasília. Usar sempre `lib/dates.js`
- O dia é o do RELÓGIO DA LOJA: `todayStr(tzOf(unit))`, nunca `todayStr()` solto.
  Prazo de checklist é `instantAt(data, hora, tz)` — comparar com `new Date()`
  usa o fuso de quem abriu o painel, não o da loja que executou
- "A tarefa vale neste dia?" só por `applicableItems` (lib/checklists.js → lib/recurrence.js);
  "o checklist era previsto?" só por `templatePrevistoEm` — é a régua do previsto
  (`countApplicableTemplatesOnDate`) E do entregue (`completeRoundChecker`,
  `rodadaPrevistaChecker`). Conta nova de aderência que não passa pelas duas estoura
  100%. Mexeu na regra de recorrência, mexa no espelho da `notify-overdue` (o teste
  de paridade em `incompleto.test.mjs` compara os dois dia a dia) e publique a função
  ANTES do app: sem ela, tarefa mensal vira push de "incompleto" todo dia
- Imagens da landing são telas reais regeradas por `scripts/landing-shots/run.mjs`
  (Chromium sobre os componentes de produção, empresa fictícia "Grupo Exemplo",
  nada sai da máquina). Mudou uma tela que a landing mostra — Painel/Agora,
  execução de checklist, Meu ID, Unidades — rode de novo e confira as PNGs.
  NUNCA capturar o app logado em produção para a landing: é dado de gente real
  num repositório público. Todo nome que a landing usa tem de existir no app
  com o mesmo nome (o "J.I.T." sobreviveu na landing meses depois de virar
  o bloco "Agora" do Painel)
- Preço e limite de usuários NUNCA escritos à mão em texto de tela (landing,
  calculadora, app): sempre das constantes de `lib/plans.js` (`PRICE_PER_UNIT`,
  `INCLUDED_USERS_PER_UNIT`, `EXTRA_USER_PRICE`) via `formatBRL` — a vaga
  adicional é `formatBRL(EXTRA_USER_PRICE, { cents: true })` → "R$ 17,00".
  Exceção de propósito: Termos (`app/termos/page.js`) e Central de Ajuda
  (`content/ajuda/`) são texto estático — mudou a tabela, sai versão nova dos
  Termos (e `TERMOS_VERSAO` em `components/PlanoVagas.js`) e revisão dos artigos.
  O limite de vagas é imposto NO BANCO pelo trigger `users_seat_quota`
  (migration `20260923_limite_usuarios`), que recusa com mensagem começando por
  `ZC_QUOTA` — o cliente detecta pelo prefixo; a tela só pergunta antes. A
  decisão (regras, casos e porquês) mora em
  `~/Brains/ingo/memoria/2026-09-23-zcheck-limite-10-usuarios-por-loja.md`.
  O reajuste automático do valor da assinatura no Mercado Pago fica atrás de
  `MP_ADJUST_ENABLED` (`'1'` liga; desligada, marca `adjust_pending` e sai o
  alerta R8 — até testar no sandbox). O teste do sandbox é
  `node scripts/mp-sandbox/ajuste.mjs` (credenciais das contas de TESTE em
  `ibr-checklists-app/.env.sandbox.local`, ignorado pelo git; recusa token que
  não seja de teste). Só ligue a flag com ele saindo 0
- `globals.css` deve ter `@tailwind` — se quebrar, restaurar com `git show HEAD:ibr-checklists-app/app/globals.css`
- git root está em `/Users/michelfaria/Projects/zcheck-app` — não em `ibr-checklists-app/`.
  O repositório saiu do iCloud em 12/09/2026: em `~/Documents` o iCloud evictava
  os arquivos (grep/git/build travavam) e chegou a apagar `.git/index` no meio
  de um `git switch`. Não voltar para pasta sincronizada.
- **Nunca `git add -A` nem `git add .`** — estagiar sempre por caminho. A raiz
  guarda material que não é código (`video-colaboradores/` com 43MB de MP4,
  `_baseline/` com PDFs de desempenho de gente real) e o repositório é PÚBLICO.
  Em 11/08/2026 um `git add -A` varreu 43MB de vídeo untracked para dois commits;
  só foi pego lendo o resumo do merge, antes do push. Binário em git é
  permanente: `git rm` depois não tira do histórico nem encolhe o clone.
  Antes de publicar, conferir o que sai:
  `git diff --name-only origin/dev..HEAD` (antes do push para `dev`)
- Não mexer em `borderRadius` globalmente — quebra o layout dos cards
- Deploy: só pelos scripts da seção **Ambientes** (`npm run deploy:homolog`,
  `npm run deploy:prod`) — nunca `npx vercel --prod` à mão
- `ibr-checklists-app-codex-update/` é uma cópia paralela — o projeto ativo é `ibr-checklists-app/`

## Ambientes: dev → homolog → main

Todo código anda por três branches, sempre nesta ordem e só para a frente:

| Ambiente | Branch | Onde roda | Como entra |
|---|---|---|---|
| Dev | `dev` | local: `npm run dev`, testes jsdom | merge da branch de trabalho com `verify` verde |
| Homolog | `homolog` | https://zcheck-homolog.vercel.app | fast-forward de `dev` + `npm run deploy:homolog` |
| Produção | `main` | `zcheckapp.com` e `*.zcheckapp.com` | fast-forward de `homolog`, **com aprovação do Michel**, + `npm run deploy:prod` |

Invariante: **main ⊆ homolog ⊆ dev** — cada uma é ancestral da seguinte. Por
isso produção roda o MESMO commit que foi testado em homolog, e nada chega à
`main` sem ter passado pelas outras duas. Nunca commit direto nem push `--force`
em `dev`, `homolog` ou `main`.

A verdade é a `origin`: sempre `git fetch` e trabalhar a partir de
`origin/<branch>`, com checkout destacado (`--detach`). A `main` costuma estar
em checkout no repositório principal, então `git switch main` num worktree
falha — e nenhum worktree precisa de branch local `dev`/`homolog`/`main`.

**Publicar na `main` pede autorização do Michel, sempre.** Qualquer coisa —
código, doc, merge, hotfix, `deploy:prod` — e a cada vez: pedir antes, dizendo
o que vai (`git log --oneline origin/main..origin/homolog`), e esperar o OK dele
no chat. OK de uma publicação não vale para a seguinte.

**0. Código novo começa na `dev`** (regra do Michel, 25/09/2026). Toda branch de
trabalho nasce de `origin/dev` — nunca da `main` nem de outra branch:

```bash
git fetch origin && git switch -c claude/<assunto> origin/dev
```

O worktree que o app cria nasce da `main`. Antes de escrever a primeira linha:

```bash
git fetch origin && git merge --ff-only origin/dev   # main ⊆ dev: avança sem conflito
```

Recusou = a branch já tem commit próprio: `git merge origin/dev` e seguir. A
única branch que nasce da `main` é o **hotfix** (abaixo), para produção quebrada.

**1. Branch de trabalho → dev** (sem pedir autorização)

```bash
git fetch origin && git merge origin/dev             # na branch de trabalho: conflito se resolve aqui
(cd ibr-checklists-app && npm run verify)
git diff --name-only origin/dev..HEAD                # conferir o que sai (repo público)
git checkout --detach origin/dev && git merge --no-ff <branch> -m "merge: <o que é>"
git push origin HEAD:dev                             # recusado = dev andou: repetir desde o fetch
git checkout <branch>                                # devolve o worktree à branch
```

O `merge origin/dev` antes do `verify` faz a árvore mesclada ser a mesma que
passou nos testes. `dev` fica sempre publicável: trabalho pela metade fica na
branch dele, não em `dev`.

**2. dev → homolog** (sem pedir autorização)

```bash
git fetch origin
git merge-base --is-ancestor origin/main origin/dev || echo "main tem commit fora de dev"
git push origin origin/dev:refs/heads/homolog        # só avança; recusado = homolog tem commit fora de dev
git checkout --detach origin/homolog
cd ibr-checklists-app && npm run deploy:homolog      # verify + preview + alias zcheck-homolog.vercel.app
```

Se a `main` tiver commit fora de `dev` (alguém publicou pelo caminho antigo),
mesclar `origin/main` em `dev` pelo passo 1 antes de promover.

Depois do deploy, testar em https://zcheck-homolog.vercel.app — `/app` cai no
tenant IBR (fallback de `lib/tenant.js`), e a Vercel pede login da org
`ilhabelarepublic` (Deployment Protection). Então entregar ao Michel: o link, o
commit, a lista `git log --oneline origin/main..origin/homolog` e o que ele
precisa olhar.

**3. homolog → main** (só com aprovação explícita do Michel — "aprovado",
"pode subir" — para o que está em homolog naquele commit; se `homolog` andou
depois do OK, os commits novos precisam de outro OK)

```bash
git fetch origin
git push origin origin/homolog:refs/heads/main       # só avança
git checkout --detach origin/main
cd ibr-checklists-app && npm run deploy:prod         # recusa HEAD ≠ origin/main ou main fora de homolog
```

Conferir `npx vercel ls ibr-checklists-app --prod` e o bundle servido. Nunca
canalizar deploy para `tail` (o JSON final parece falha e já gerou deploy duplo).

**Hotfix** (produção quebrada e `homolog` com coisa ainda não aprovada):

```bash
git fetch origin && git checkout -b hotfix/<nome> origin/main
# corrige, commita — e NÃO mescla origin/dev nesta branch (levaria a fila não aprovada para a main)
(cd ibr-checklists-app && npm run deploy:homolog -- --hotfix)  # homolog passa a mostrar main + correção
# com o OK do Michel:
git fetch origin && git checkout --detach origin/dev && git merge --no-ff hotfix/<nome> -m "merge: hotfix <nome>"
(cd ibr-checklists-app && npm run verify) && git push origin HEAD:dev HEAD:homolog
git push origin hotfix/<nome>:refs/heads/main                  # avança: o hotfix nasceu da main
git checkout --detach origin/main && (cd ibr-checklists-app && npm run deploy:prod)
git checkout --detach origin/homolog && (cd ibr-checklists-app && npm run deploy:homolog)  # homolog volta a mostrar a fila
```

**O banco é um só.** Não existe Supabase de homolog: local, homolog e produção
leem e gravam o Supabase de PRODUÇÃO, e as variáveis de Preview da Vercel são as
de produção (`MP_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`).
Em homolog, "Assinar" cria assinatura de verdade, e-mail sai, telemetria grava;
testar só em checklist descartável. Os crons do `vercel.json` só rodam em
produção. Consequências:

- **Migration** vale para produção na hora em que é aplicada, com o código que
  está na `main`. Tem de funcionar com o código da `main` E com o de `homolog`:
  primeiro a parte que só acrescenta (coluna, função, permissão); o que remove
  só depois de a `main` parar de usar.
- **Edge function** (`notify-overdue`) publicada é produção — mesma regra.

## Antes de publicar

```bash
cd ibr-checklists-app && npm run verify   # eslint --quiet && npm run test && next build
```

`verify` inclui os testes desde 11/08/2026. `npm run test` roda os testes de node (lista completa no script `test` do `package.json`):

| Teste | O que prova |
|---|---|
| `conferencia.spec.mjs` | ordem da fila de conferência |
| `painel-render.spec.mjs` | **o que aparece e o que NÃO aparece por papel** — é a prova da fronteira de acesso, e conta que o motor analítico não roda para colaborador |
| `prazo-render.spec.mjs` | a régua de prazo **como texto na conferência** — entrega dentro do minuto do prazo não pode virar "atrasado" nem tarja "Fora do prazo", e o prazo é o do relógio da loja |
| `conferencia-tela-cheia.spec.mjs` | a conferência (tela real em jsdom) é tela cheia de verdade — `fixed inset-0` com `margin: 0` (o `.space-y-4` do pai descia o overlay 16px) — e **trava a página atrás** (`lib/useTravaRolagem.js`): body `position: fixed` no ponto em que estava, a foto aberta por cima e fechada não destrava, e ao fechar a página volta à mesma posição. Caso do IBR2, 21/09/2026: arrastar sobre a folha rolava o Painel por trás. E a observação geral começa recolhida num botão (abre no toque; já aberta se houver nota) e o pé diz "tarefas conferidas" — iPhone, 26/09/2026: a caixa aberta espremia a lista |
| `overlays-trava.spec.mjs` | **todo overlay de tela inteira trava a página atrás** — foto ampliada da tarefa, "Itens críticos pendentes" (execução real em jsdom) e "Remover …?" (aba Usuários real): `margin: 0` onde o pai é `.space-y-*` (a margem descia o `fixed`), body `position: fixed` no ponto em que estava e de volta ao fechar, **sem** `overflow: hidden` no body (com `overflow-x: clip` no `<html>` ele vira contêiner de rolagem e o header sticky some atrás do véu). Inventário: todo `fixed inset-0`/`position: 'fixed', inset: 0` em app/ e components/ está num componente que chama `useTravaRolagem` e leva `margin: 0` — overlay novo sem trava derruba o teste. Toast, coachmark e barra fixa não travam |
| `usuarios-render.spec.mjs` | a aba Usuários obedece à loja do cabeçalho — e quem alcança a loja (diretoria, gerência multi-loja) não some do filtro |
| `aprovacao-pedido.spec.mjs` | a baixa do pedido de acesso que o banco recusa (RLS, rede) não some da fila (aba Usuários real em jsdom): a RPC já criou a pessoa, nada é desfeito, o pedido fica com "Acesso já criado" + "Tirar da fila" — **sem** "Aprovar" nem "Rejeitar" — também depois de recarregar, porque o id do acesso é derivado do pedido (`p<id do pedido>`), não `uid()`; "Tirar da fila" não chama a RPC de novo. Recusar e alteração de dados: erro na tela, pedido na fila. Caso de 24/09/2026: aprovar de novo criava uma segunda pessoa |
| `track.spec.mjs` | a fila de telemetria não perde evento em concorrência |
| `appurl.spec.mjs` | aba na URL sobrevive ao login; aliases de abas aposentadas |
| `templates-sync.spec.mjs` | os dois caminhos de leitura de `templates` devolvem objetos IDÊNTICOS — campo que só um lado mapeia derruba o teste |
| `ativacao-loja.spec.mjs` | `units.active_from`: antes da estreia nada aparece no Executar e nada entra no previsto — **e os dois lados da fração andam juntos** (zerar só o denominador faz a aderência da estreia estourar 100%) |
| `completions-cap.spec.mjs` | o teto da lista de conclusões em memória corta pelo TEMPO, nunca pela posição — um `slice(-500)` numa lista que chega do mais novo para o mais velho apagava as conclusões de HOJE a cada "Concluir" (vídeo do IBR3, 11/09/2026) |
| `recorrencia.spec.mjs` | a tarefa periódica (`item.period`, 24/09/2026): mês curto cai no último dia sem derivar, nada antes do início, `period` inválido cai no dia da semana, dado antigo intocado — e **os dois lados da fração**: a rodada que só quita tarefa arrastada (dia em que o checklist não era previsto) não conta como entrega nem parcial, senão a aderência passa de 100% (J.I.T. e relatório renderizados). Roda em UTC+14 para provar que o dia é o da loja; cobre o CSV (`dias`) e a tela (editor e selo) |
| `carryover-marcacao.spec.mjs` | marcação ao vivo em D quita o carryover até D, como uma submissão — e a aderência NÃO muda (o checklist marcado sem "Concluir" continua não entregue). Caso do IBR3, 16/09/2026: 7/7 marcadas, ninguém concluiu, tudo voltou no dia seguinte |
| `auto-concluir.spec.mjs` | a última tarefa marcada fecha o checklist sozinha (tela real em jsdom): com o colega em 2 de 3, marcar a terceira submete sem "Concluir", com o `doneBy` de cada um; marcar uma que não é a última não submete. Decisão de 17/09/2026: checklist dividido entre pessoas ficava sem registro |
| `conclusoes-recarga.spec.mjs` | a lista de conclusões em memória se corrige com o banco ao voltar para o app e ao abrir a Rotina/um checklist — o realtime perde o que outro aparelho gravou com o app em segundo plano. Caso do IBR2, 24/09/2026: o app do Nicolas fechou 10/10 sozinho, o celular do Michel seguiu em "Parcial · 2 de 10" com "Concluir" aceso |
| `produtividade-conferencia.spec.mjs` | o veredito da liderança pesa no score de produtividade: ressalva vale metade, reprovada vale negativo e tira o bônus do 100% — com ou sem motivo, só para conferência a partir de 24/09/2026 (instante de Brasília). Bloco final renderiza o Painel e afirma a linha "Conferência: …" |
| `conclusao-reprovada.spec.mjs` | tarefa reprovada (a partir de 24/09/2026) tira o checklist do 100% em toda MEDIÇÃO — aderência, "Checklists 100%", status/taxa do Painel, "feito do entregue", J.I.T. — e NÃO na execução (`roundProgress` sem `descontaReprovadas` segue 3/3; Executar e carryover olham `i.done`). Renderiza o Painel: "Parcial", 2/3 e "1 reprovada na conferência". EXCEÇÃO provada: o índice da liderança NÃO desconta — reprovar não pode baixar a nota de quem reprovou |
| `cadastro-rascunho.spec.mjs` | o /cadastro não perde o que foi digitado quando o celular mata a aba ao abrir câmera/galeria (24/09/2026): rascunho em `sessionStorage` a cada tecla, relido ao montar — o primeiro ciclo (campos vazios) não pode apagá-lo; prévia da selfie por object URL (revogado no "Refazer"); envio com sucesso apaga o rascunho |
| `alteracao-dados.spec.mjs` | o "Solicitar alteração de dados" (modal real em jsdom) só diz "enviado" se o banco gravou: o supabase-js **devolve** `{ error }` em recusa de RLS e em falha de rede, não lança. Recusa (diretoria sem loja, gerência "u1,u2" — 24/09/2026) mostra erro e mantém o formulário; o insert sai sem `select=` (depois da `20260924_user_requests_gestao` só a diretoria lê a tabela) |
| `plans.spec.mjs` | a conta do plano em `lib/plans.js`, **afirmada em reais, não pela fórmula**: franquia de 10 vagas por loja SOMADA (1/2/3 lojas = 10/20/30, piso de 1 loja), o 11º ativo pede vaga adicional, redução nunca abaixo das adicionais em uso, vaga a "R$ 17,00" igual nos dois ciclos (o −24% é só da loja) e `monthlyValueFor` vale o `billed_amount` real. E `unitsForAmount`/`getTierByPrice` não podem voltar: 381 = anual 2 lojas + 11 vagas = mensal 3 lojas — o valor não identifica o plano |
| `library-plan.spec.mjs` | o que o onboarding cria a partir de `lib/library.js`: o sub-segmento escolhido filtra os modelos (hamburgueria não recebe checklist de padaria; casa de ração não recebe banho e tosa), nome "Área — Momento" repetido ganha o segmento entre parênteses, todo setor tem ícone no onboarding — e **nenhum modelo cita norma** (Anvisa, RDC, NR, SNGPC…): item de exigência legal fica fora da biblioteca de propósito (24/09/2026) |
| `calculadora-piso.spec.mjs` | a calculadora da landing (tela real em jsdom): o total de usuários nunca fica abaixo da franquia (10 × lojas), trocar o número de lojas mantém as vagas adicionais somadas em cima do piso novo, e o "−" para no piso. Caso de 24/09/2026: 6 lojas com 14 usuários no campo e "60 inclusos" embaixo |
| `seats.spec.mjs` | o lado do servidor (`lib/seats.js`), sem sessão, banco nem MP: o mínimo da redução vem do banco, nunca do cliente; o checkout cobra as lojas ATIVAS e no mínimo as vagas em uso; o webhook grava o plano pela intenção do checkout e **nunca grava null** (o webhook antigo zerava `plan_tier` e o pagante virava "cortesia" no MRR); o cron só reajusta quando esperado ≠ cobrado em centavos; o `cancelled` de uma assinatura velha não bloqueia quem está em teste |
| `mp-sandbox.spec.mjs` | a sonda do sandbox do MP (`scripts/mp-sandbox/ajuste.mjs`, a que libera `MP_ADJUST_ENABLED`) contra um MP falso: sem credencial de TESTE para antes de qualquer escrita e nunca cai no `MP_ACCESS_TOKEN` da produção (nem se ele estiver no `.env.sandbox.local`); com o PUT se comportando como o billing supõe, passa com os valores de `lib/plans.js` (1 loja anual → + 1 vaga → volta); PUT que devolve a assinatura a `pending`, muda a próxima fatura, cobra na hora ou é recusado **reprova** — e a assinatura de teste é cancelada mesmo assim |
| `email.spec.mjs` | falha do Brevo não é muda: o 401 "unrecognised IP address" vira `ip_not_authorized` (distinto de chave inválida), e toda falha vira alerta crítico `email_send_failed` no /admin/alertas, um por causa e por dia. Caso de 24/09/2026: "Authorised IPs" ligado no Brevo barrava os IPs da Vercel, o OTP do /comecar sumia depois do `after()` e a tela dizia "Enviamos um código" |
| `jit-hotspot.spec.mjs` | o crítico recorrente do J.I.T. é do checklist CERTO: o id do item só é único dentro do template (os semeados usam `i1`, `i2`… em todos). Dois checklists da mesma loja com um `i1` crítico de textos diferentes, só um falhando 3× → a recomendação, a Leitura da operação e a lista do Painel nomeiam o que falhou e N é 3 — o `i1` do outro não empresta o nome nem soma no contador. Caso das fixtures do Painel, 24/09/2026: a câmara fria da Cozinha saía com o nome de uma tarefa de Salão |
| `library-plan.spec.mjs` | o que o onboarding cria a partir da biblioteca (`planoDaBiblioteca` em `lib/library.js`): escolher só um sub-segmento (ex.: Hamburgueria) cria só os modelos dele, setor sem sub-segmento (Hotel) ignora o filtro, e dois sub-segmentos com o mesmo "Área — Momento" no mesmo setor ganham o sub-segmento no nome. Caso de 24/09/2026: Food Service criava restaurante, café e padaria em cada loja, com "Bar — Abertura" duplicado |
| `photo-storage.spec.mjs` | fotos de prova, da rodada e POPs (`checklist-photos`) sobem e são lidas **só pelo cliente autenticado** e **só na pasta da empresa do token** (`{company_id}/…`, `lib/photoPaths.js`) — o cliente anônimo não é nem tocado; caminho da convenção antiga entra em `photos` já qualificado; a leitura tenta o nome novo e depois o antigo (objeto ainda não copiado). Até 24/09/2026 o bucket abria para a anon key |

Os que terminam em `-render`, `templates-sync` e `ativacao-loja` montam
componentes de verdade (jsdom + esbuild) e **não precisam de sessão logada** —
que é o que impede o Playwright de cobrir tela logada.

Fora do `npm run test`: `supabase/migrations/20260923_limite_usuarios.test.mjs`
prova o trigger `users_seat_quota` em PGlite (11º sem vaga barrado com `ZC_QUOTA`;
renomear/trocar PIN acima da capacidade passa; reativar sem vaga é barrado; roda
2× sem erro) — `npm i --no-save @electric-sql/pglite` antes, como os outros
`.test.mjs` de migration.

Selfie do /cadastro (bucket `colaboradores`): só a diretoria da empresa DONA lê,
pelo token da sessão (`SelfieViewer` com `authedSupabase()`). Dono = o pedido
mais antigo em `user_requests` que cita o objeto até 1 h depois do upload — um
ponteiro sozinho não dá posse, porque qualquer um grava `user_requests` e os
caminhos já vazaram. O gatilho `user_requests_selfie_trava` força `created_at`
e trava `selfie_path`. Prova em PGlite:
`supabase/migrations/20260924_colaboradores_selfie_diretoria.test.mjs`.

Também fora: `supabase/migrations/20260924_storage_checklist_photos.test.mjs`
prova as policies do bucket `checklist-photos` (fases 01/02/03) numa bancada de
`storage.objects` em PGlite: sessão só alcança a pasta da própria empresa; objeto
antigo só para a empresa dona no inventário (ponteiro em `photos`/template não dá
posse); anon na transição lê e cria em caminho antigo, mas não apaga, não move,
não sobrescreve nem entra em pasta de empresa; a 03 recusa com dono sem cópia.

E `supabase/migrations/20260925_cnpj_sucessao_grupo.test.mjs` prova o vínculo
CNPJ → grupo (`link_cnpj_to_company`): o "Liberar novo teste" do Core recria um
grupo APAGADO e ele herda todas as raízes (empresa + lojas) com o `started_at`
original; raiz de cliente vivo e raiz de grupo apagado pelo CNPJ de uma LOJA
seguem recusadas; o /comecar nunca reusa. A recusa não cita o id do dono (chega
à tela do cliente) — o Core completa pela `cnpj_trial_history`.

`npm run build` NÃO checa variável não declarada — é JS puro, sem tipos, e o
Next não roda lint no build. Em 10/08/2026 um `useMemo` foi publicado com uma
variável inexistente no array de dependências: build limpo, app inteiro fora do
ar por ReferenceError. `verify` roda o lint antes do build; `no-undef` é erro e
bloqueia. Aviso (`no-unused-vars`, `exhaustive-deps`) não bloqueia — veja
`ibr-checklists-app/eslint.config.mjs` para o porquê de cada escolha.

**Build limpo também não prova que a tela renderiza.** Na consolidação de abas
(11/08/2026) três defeitos passaram por lint, build, 71 testes e pela comparação
do PDF exportado — os três eram de RENDERIZAÇÃO, e o PDF lê o motor direto sem
tocar no JSX. Por isso existe `tests/painel-render.spec.mjs`: ele monta os
componentes com `renderToStaticMarkup` e afirma o que aparece **e o que não
aparece** por papel. É lá que mora a prova de que o colaborador não vê bloco de
gestão — mexeu em gate de acesso, rode ele.
