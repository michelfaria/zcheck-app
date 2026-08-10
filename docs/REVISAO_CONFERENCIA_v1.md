# Revisão da conferência de checklists pela liderança — plano v2

Data: 08/08/2026 · Status: **plano, nada implementado**
Substitui a v1 (08/08), escrita antes da medição em produção.

Pedido de origem: a conferência é uma lista por execução, repete o mesmo
checklist e é trabalhosa. Quer-se (1) conferência por checklist, (2) feedback
imediato ao colaborador que executou, endereçado ao id dele e visível só para
ele, (3) as notas da liderança contando na pontuação do colaborador,
preservando histórico.

---

## 1. A medição que reescreveu o plano

```
completions (90 dias) ........ 148        → .limit(1000) não trunca
rodadas distintas ............ 105        → 43 duplicadas = 29% da lista
execuções conferidas ......... 148 (100%)
lideranças que conferem ...... 1
vereditos .................... 1331       → aprovado 1290 (96,9%)
                                            ressalva   34 ( 2,6%)
                                            reprovado   7 ( 0,5%)
notas escritas ............... 2          → 0,15% dos vereditos
grants em completions.reviewed_by ....... authenticated: só SELECT/REFERENCES
```

### O que a medição derruba

- **O furo de segurança não existe.** O bloco `do $$` de
  `20260726_conferencia_lideranca.sql` rodou inteiro, `revoke insert` incluído.
  O comentário nas linhas 79-81 daquele arquivo, dizendo que não rodou, é falso.
- **`.limit(1000)` é problema de escala futura, não de hoje.** Sai do caminho
  crítico.
- **A cobertura não é o gargalo.** 100% conferido, por uma pessoa. Nenhuma
  quantidade de agrupamento melhora um número que já está no teto.
- **Aprovação em lote está morta.** Ela otimizaria a única coisa que já
  funciona, e transformaria os 30% de "conferidos" do índice da liderança em
  velocidade de clique.

### O que a medição revela

**Não é carimbo. É julgamento mudo.**

41 discordâncias (34 ressalvas + 7 reprovações) não saem de quem confirma o
default: cada uma exigiu sair da pré-marcação, item a item. E as 2 notas que
existem caíram exatamente numa ressalva e numa reprovação — quando ele escreveu,
escreveu na hora certa.

O líder paga o preço do julgamento e desiste no preço da explicação. Resultado:
o colaborador abre o briefing e lê *"Conferir limpeza dos banheiros — Com
ressalva"*, sem uma palavra de motivo. **39 apontamentos sem conteúdo,
circulando com nome e data.** Isso não corrige comportamento; produz
ressentimento.

Precisão sobre a causa: o `+ Comentário` é um pill **visível**, ao lado dos três
vereditos ([page.js:4232](ibr-checklists-app/app/app/page.js:4232)) — não está
escondido. A fricção é que **nada pede o motivo**, o veredito se completa sem
ele, e o botão é o elemento mais apagado da linha (tracejado, cinza, por
último). É um problema de default, não de descoberta. Isso torna o conserto
barato.

---

## 2. A decisão de produto que estava faltando

O conselho apontou que o plano v1 servia a dois propósitos incompatíveis sem
escolher: conferência como **controle de processo** (eixo = checklist) e como
**feedback à pessoa** (eixo = colaborador). A medição decide:

> **O controle de processo já está resolvido — 100% de cobertura, por uma
> pessoa, sem ajuda nenhuma do software. O que não existe é o feedback.**

Portanto: **a conferência existe para produzir feedback endereçado.** Tudo que
barateia o julgamento sem baratear a explicação otimiza a metade que já
funciona. O eixo checklist continua sendo o certo para *navegar*; a pessoa é o
certo para *entregar*.

### A métrica de sucesso, dita explicitamente

**Não é a fila esvaziar.** Fila zerada com 100% de aprovação é fracasso
disfarçado. As duas que valem:

1. `apontamentos_sem_motivo / apontamentos` — hoje **95%** (39 de 41). Meta: < 20%.
2. `taxa_de_discordância` — hoje **3,1%**. Se cair perto de zero depois de
   qualquer mudança, a mudança piorou o produto.

---

## 3. O que o conselho acrescentou ao plano

**Contestação (o buraco que ninguém tinha visto).** A v1 tinha `done_snapshot`,
ledger, `batch_id`, teste de multi-tenant — proteção completa da empresa contra
o dado, e **zero proteção da pessoa contra o julgamento**. Não existe caminho
para o colaborador discordar de uma reprovação. Num produto que agora vende para
outras empresas, isso é risco de adoção, não só de justiça: gerente nenhum
implanta ferramenta que gera atrito com a equipe dele.

**Nada de mudança retroativa de régua.** A v1 propunha trocar `taskCounts` e
recalcular o índice de todo mundo com régua nova sobre julgamentos feitos com
régua antiga. Não. Se entrar, entra **valendo a partir de uma data**, com o
passado preservado — e é a ledger que torna isso possível.

**A régua tem que ser explicável a quem recebe.** "Ressalva vale 0,6" não se
explica para quem trabalha no salão. O modelo de pontuação muda de média
ponderada para **penalidade contável** (§5): "cada reprovação custa 8 pontos" é
uma frase que uma pessoa entende e contesta.

**A nota do operador é ativo, não exceção.** *"Geladeira 2 fazendo barulho"* é
manutenção preditiva escrita por quem está com a mão no equipamento. Qualquer
fluxo que passe por cima dela sem obrigar leitura destrói o único canal de baixo
para cima do produto.

**Privacidade é mais barata agora.** 2 notas expostas: backfill trivial,
rollback trivial, ninguém percebe. Depois da onda 4 (baratear a explicação) o
volume multiplica e o mesmo conserto fica caro. **Consertar enquanto o vazamento
é pequeno é uma janela, não uma folga.**

---

## 4. As ondas

Cada onda é entregável sozinha e não espera pela seguinte.

| # | Onda | Banco | Por quê agora |
|---|---|---|---|
| **1** | Três correções | não | 29% do trabalho do líder é duplicata |
| **2** | Endereçamento + histórico (aditiva) | migration A | o feedback vai para a pessoa errada |
| **3** | Privacidade | migration B | janela: o vazamento tem 2 linhas |
| **4** | **Baratear a explicação** | não | a mudança de maior valor do plano |
| **5** | Contestação | migration C | sem ela, o feedback é um tribunal sem defesa |
| **6** | Pontuação | não | só depois de a onda 4 engrossar o sinal |
| **7** | Fila agrupada | não | reavaliar depois de ver uma conferência real |

**A alavanca que é sua:** a onda 4 é a de maior valor e não depende de banco.
Dá para puxá-la para a frente das ondas 2-3 e ter o ganho em dias. O preço é
começar a acumular notas privadas legíveis por toda a empresa antes de a onda 3
existir. Com um cliente e um líder, o risco prático é baixo — mas é uma escolha
consciente, não um detalhe.

---

## 5. Pontuação — o que está EM PRODUÇÃO

Os pesos do índice do colaborador, desde 08/08/2026:

| componente | peso | o que mede |
|---|---|---|
| Conclusão de tarefas | 0,40 | do que pegou, quanto fez |
| **Entregas no prazo** | **0,20** | dos checklists que entregou e tinham prazo, quantos saíram dentro dele |
| Críticos em dia | 0,20 | risco |
| Constância | 0,10 | dias com atividade ÷ 30 |
| Qualidade avaliada | 0,10 | o julgamento da liderança |

**Período: MÊS CORRENTE por padrão.** Não é uma janela deslizante de 30 dias, e
a diferença é de incentivo: na janela deslizante o passado some sozinho todo
dia, e um mês ruim se dilui sem ninguém fazer nada. No mês fechado existe um
placar que começa limpo no dia 1º — dá para recuperar um começo ruim, e o
esforço do dia 28 ainda conta.

- **Painel** — sempre o mês corrente, sem seletor. É a tela da operação do dia,
  e o colaborador também a vê; dois seletores independentes trariam de volta o
  "qual dos dois vale".
- **Equipe** (só liderança, por `ROLE_TABS`) — o SELETOR INTEIRO da aba Dados:
  Hoje · 7 dias · 30 dias · Mês (com escolha do mês) · Tudo · Personalizado
  (intervalo de datas). Padrão em Mês. `PERIODS` e `periodDates` são reusados,
  não reimplementados — duas telas oferecendo "Personalizado" com regras de
  borda diferentes é divergência que ninguém percebe até dar número diferente
  para a mesma pergunta.

TODOS os componentes olham o mesmo período. Antes cada um media coisa diferente
(conclusão, prazo e críticos varriam os 90 dias carregados; constância dividia
por 30, então quem tivesse mais de 30 dias ativos saturava em 100% para
sempre) — um índice que soma pedaços de janelas distintas não significa nada.

O denominador da constância são os dias **decorridos** do período, não o tamanho
dele: no dia 3 do mês ninguém pode aparecer com 10% porque o mês tem 30 dias.

Ficam FORA do período, de propósito: nível, conquistas, evidências, total de
tarefas, sequência de dias e a evolução semanal. Esses são história da pessoa,
não desempenho recente — zerar a conquista de alguém porque tirou férias seria
punir o calendário.

Fonte única dos pesos em `COLLAB_INDEX_PARTS`; períodos em `rankingPeriod` /
`RANKING_PERIOD_OPTIONS` (page.js). A frase que explica o ranking
na aba Equipe e no Painel é GERADA dali — mexer num peso corrige as duas
descrições junto. Pesos definidos pelo Michel em 10/08/2026.

### Qualidade — penalidade contável, não média

```
qualidade = 100 − (ressalvas × 2 + reprovações × 8)   [piso 0]
```

A fórmula da v1 (média ponderada, ressalva 0,6, peso 0,25) não sobreviveu à
medição: com 96,9% de aprovação ela entregaria 97-100 para todo mundo. **Não se
pesa em 25% um sinal com 3% de variância.** A penalidade contável discrimina
(5 ressalvas + 2 reprovações = 74, contra 100 de quem não tem nada), é
explicável em uma linha para quem é medido, e não satura com o denominador.

As três travas, todas no código (`QUALITY_CUTOFF`, `QUALITY_MIN_JULGADAS`, o
array `parts`):

- **Corte em 09/08/2026**, sobre `reviewed_at`. Julgamento dado sob a régua
  antiga — quando ressalva não custava nada — não passa a custar depois do fato.
- **Piso de 5 julgadas.** Menos que isso, componente null e o índice se
  renormaliza. Ninguém é punido por ter líder ausente.
- **Peso 0,10**, subindo para os 0,25 originalmente planejados só quando
  `apontamentos_sem_motivo` cair de 95% para menos de 20%.

E a regra de incentivo: **apontamento sem motivo não pontua.** Para o ranking de
terceiros funcionar com ela, a view `task_verdicts` expõe `com_motivo` — o
booleano da explicação, nunca o texto.

`taskCounts` NÃO mudou: a dupla penalidade da reprovação (derruba conclusão *e*
qualidade) fica para depois, se ficar.

### Pontualidade — e por que ela NÃO tem corte de data

Pedido de 08/08: quem entrega no prazo tem que ficar acima de quem entrega
atrasado. Peso 0,20: entre 100% e 60% de pontualidade são 8 pontos de índice, o
bastante para reordenar o ranking entre pessoas de desempenho parecido no
resto.

Três decisões de cálculo, herdadas de regras que o app já aplicava:

1. **Pela primeira entrega da rodada** (`earliestPerRound`). Reenviar às 18h não
   transforma em atraso uma entrega feita às 9h no prazo. Mesma régua do índice
   da liderança e do J.I.T.
2. **Checklist sem prazo fica fora do numerador E do denominador.** Contá-lo
   como pontual inflaria a nota de quem só executa checklist sem horário.
3. **É de quem ENTREGOU, não de quem executou dentro.** Numa rodada
   colaborativa, quem submeteu fora do prazo responde — não o colega que fez
   duas tarefas nela. É o inverso da qualidade, que segue `executed_by`, e as
   duas estão certas: entregar e executar são atos diferentes.

**Sem corte de data, e a assimetria com a qualidade é deliberada** (confirmada
pelo Michel em 08/08): o prazo é uma regra PUBLICADA no próprio checklist,
sempre foi visível como "fora do prazo" nos Relatórios e no J.I.T., e o dado
histórico é completo. Passar a contá-la não muda a régua — começa a dar
consequência a uma régua que já existia. A qualidade precisou de corte porque
os vereditos antigos foram dados quando ressalva não custava nada; aqui não há
esse viés.

Consequência assumida: as posições no ranking mudaram retroativamente sobre os
90 dias de histórico.

### Do lado da liderança

`modo: 'lote' | 'individual'` no track (page.js) e a taxa de reprovação do líder
vs. mediana da empresa, visível e não punitiva. Risco C da v1 (dois líderes
dividindo a loja) está mudo — há um líder só.

---

## 6. Riscos que sobrevivem

1. **Fila offline vs. conferência.** `pushCompletion` já remove `review`
   ([sync.js:415](ibr-checklists-app/lib/sync.js:415)), então vereditos não se
   perdem. O caso real: item marcado offline às 8h, conferido às 10h, fila drena
   às 11h com a versão de 8h onde o item estava `done: false` → veredito
   "aprovado" sobre tarefa que consta como não executada. Daí `done_snapshot` na
   ledger. Agravante: `queueOfflineCompletion`
   ([sync.js:712](ibr-checklists-app/lib/sync.js:712)) **não deduplica por id**,
   ao contrário de `queueOfflinePhoto`.
2. **Grants coluna a coluna que se desfazem sozinhos.**
   `20260709_authenticated_role_grants.sql` é um loop que **espelha de `anon`**.
   `grant update on completions to anon` + reexecução daquela migration evapora
   a proteção de 26/07 sem aviso. Mitigação: teste `*.test.mjs` sobre
   `information_schema.column_privileges`.
3. **Multi-tenant na view.** `task_verdicts` roda com privilégio do dono e
   bypassa RLS da tabela base. Se o `where company_id = jwt_company_id()` sair
   num refactor, vaza empresa inteira para empresa inteira.
4. **Ordem de deploy da onda 3.** Migration → deploy do JS → **só então** o
   `revoke`. Invertido, derruba o app de todos os colaboradores.
5. **`notify-status` aceita `subs` do cliente**
   ([page.js:6990](ibr-checklists-app/app/app/page.js:6990)): qualquer
   autenticado manda push para o celular de um colega. Não reaproveitar esse
   caminho para feedback privado — construir privacidade sobre um vazamento.
6. **Performance do `ReportsView`.** Recalcula `filtered`, `summary`,
   `collaboratorStats`, `groupStats` e `computeProductivity` a cada render, sem
   um `useMemo` sequer. Só vira problema com a onda 7.
7. **`.limit(1000)`** em `fetchCompletions`: folgado hoje (148), vira mentira
   silenciosa quando a base de clientes crescer.
8. **Reprovação sem direito de resposta** é o risco de produto, não técnico —
   endereçado pela onda 5.

---

## Apêndice A — Migration A (aditiva, sem revokes)

**Escrita e testada.** O SQL vive em
`ibr-checklists-app/supabase/migrations/20260808_conferencia_endereco_historico.sql`
— não é duplicado aqui de propósito, para não existirem duas versões do mesmo
arquivo divergindo em silêncio.

Cobre endereçamento por executor (`executed_by_user_id` resolvido a partir do
`doneBy` **no servidor**), a ledger append-only `task_review_events` com
`done_snapshot` e `batch_id`, e a reescrita de `review_tasks` para fazer
diff + upsert no lugar do `delete from task_reviews where completion_id`.
Assinatura da RPC inalterada — `lib/sync.js` não muda.

Totalmente aditiva: nenhum `revoke`, nenhuma ordem de deploy crítica. Pode ser
aplicada antes do código novo sem quebrar nada do que já roda.

Verificação em PGlite (21 asserções, passando):

```bash
cd ibr-checklists-app && npm i --no-save @electric-sql/pglite && node supabase/migrations/20260808_conferencia_endereco_historico.test.mjs
```

Uma armadilha que o teste pegou e que vale registrar: num `UPDATE`, a tabela
alvo não está no `FROM`, então um `LATERAL` ali não consegue referenciá-la
(*invalid reference to FROM-clause entry*). O backfill de `executed_by_user_id`
usa subquery correlacionada no `SET`, que enxerga o alvo.

## Apêndice B — Migration B (privacidade, com ordem de deploy)

**Escrita e testada.** SQL em
`ibr-checklists-app/supabase/migrations/20260808_conferencia_privacidade.sql`.

O corte: **veredito público, nota privada.** `verdict` continua legível pela
empresa porque `computeOperationalProfile` calcula o índice de terceiros no
cliente, e ele já é público de fato — move a posição de todos no ranking, que
todos veem. `note` sai para `my_task_notes` / `my_completion_notes` e para a
tabela `completion_review_notes`. `taskCounts` só olha `review.verdict`, então
nenhum número muda.

**Ordem obrigatória:** (1) aplicar o SQL; (2) deployar o código que lê de
`task_verdicts` + as RPCs; (3) **só então** rodar o `revoke select on
task_reviews from authenticated`, que o arquivo deixa comentado no rodapé de
propósito. Invertido, derruba o app de todos os colaboradores.

Verificação em PGlite (19 asserções, passando):

```bash
cd ibr-checklists-app && node supabase/migrations/20260808_conferencia_privacidade.test.mjs
```

Duas coisas que o teste pegou e que valem registro:

- **`my_task_notes` aceitava `operator_user_id = jwt_user_id()`.** Numa execução
  colaborativa, isso deixava quem apertou "Concluir" ler a nota escrita sobre a
  tarefa de um colega — o vazamento que a migration existe para fechar. A
  cláusula também era redundante: item sem `doneBy` já grava o submissor em
  `executed_by_user_id`. Removida.
- **A view bypassa o RLS da tabela base.** O filtro de tenant tem que morar
  dentro de `task_verdicts`; tirá-lo num refactor vaza empresa inteira para
  empresa inteira, sem erro nenhum. É o teste mais importante do arquivo.

## Apêndice C — Migration C (contestação)

**Escrita e testada.** SQL em
`ibr-checklists-app/supabase/migrations/20260808_conferencia_contestacao.sql`.

Fecha o buraco que o conselho apontou: até aqui o produto protegia a EMPRESA
contra o dado (ledger, `done_snapshot`, isolamento por tenant) e não protegia
A PESSOA contra o julgamento.

`review_disputes` é o estado atual — uma contestação viva por tarefa — e a
conversa inteira entra na MESMA ledger do veredito (`task_review_events` ganhou
os tipos `contestacao` e `contestacao_resolvida`). Auditar um caso é ler uma
linha do tempo só:

```
veredito → contestacao → veredito → contestacao_resolvida
```

Três regras que ficaram no código, não em configuração:

1. **Só contesta quem executou a tarefa** — critério `executed_by_user_id`, o
   mesmo que decide quem recebe o feedback. Nem o submissor do checklist, nem a
   liderança "em nome de".
2. **Só apontamento se contesta.** Ressalva e reprovação; aprovação não.
3. **Dar razão corrige o veredito na mesma transação.** `resolve_dispute`
   aceita `p_new_verdict` porque "revista, mas continua reprovado" é um estado
   indefensável para quem contestou.

E uma assimetria deliberada de custo na UI: *manter* exige escrever o motivo
tanto quanto *rever*. Receber "mantido" e mais nada seria a mesma mudez que a
onda 4 acabou de tirar da conferência.

Verificação em PGlite (18 asserções, passando):

```bash
cd ibr-checklists-app && node supabase/migrations/20260808_conferencia_contestacao.test.mjs
```

---

## Fora de escopo, registrado

- `notify-status` aceitando `subs` do cliente — falha de segurança real, assunto
  próprio.
- Snapshot mensal do índice; ranking por RPC agregada (esconder também os
  vereditos) — só se a privacidade do veredito virar requisito.
- Paginação por período em `fetchCompletions` — quando a base crescer.
