# HANDOFF — Status do checklist: "CONCLUÍDO" quando não está tudo feito

> Documento autossuficiente para retomar a tarefa sem contexto prévio.
> Criado em **29/07/2026**. Repo em `main`, HEAD **`77e0107`**.
> Escrito no fim da sessão que reformou a execução colaborativa — esta tarefa foi
> deliberadamente deixada de fora dela porque mexe em métrica, não em UI.

---

## 1. O problema, em uma frase

Um checklist submetido com **5 de 8 itens feitos** aparece como **CONCLUÍDO**, em
verde, com a mesma cara de um que foi 8 de 8. `templateStatus` só pergunta "existe
conclusão gravada para este checklist hoje?" — nunca "tudo que era para fazer foi
feito?".

Isso ficou visível agora porque o bloqueio de reexecução passou a ser por tarefa
(commit `77e0107`): abrir um checklist "CONCLUÍDO" e encontrar 3 itens pendentes
executáveis é o comportamento correto e novo, e deixa o rótulo contradizendo a
tela.

**Não é bug de exibição.** `'done'` alimenta contadores que a gestão lê e
notificação por push. Trocar o rótulo é uma linha; decidir o que "concluído"
significa muda número em quatro lugares. É por isso que virou tarefa separada.

---

## 2. Onde está a regra hoje

**`ibr-checklists-app/app/app/page.js:1107`** — a fonte única do status:

```js
function templateStatus(t, completions, today) {
  const done = completions.some(c => c.templateId === t.id && c.date === today);
  if (done) return 'done';
  if (t.deadline) {
    const [h, m] = t.deadline.split(':').map(Number);
    const now = new Date();
    if (now.getHours() * 60 + now.getMinutes() > h * 60 + m) return 'overdue';
  }
  return 'pending';
}
```

Dois detalhes que importam para a mudança:

1. **Não filtra por loja.** Casa só `templateId` + `date`. Funciona porque
   template pertence a uma loja (`t.unitId`), mas ao reescrever, passe `t.unitId`
   explicitamente — as funções de `lib/rounds.js` exigem.
2. **`new Date().getHours()` usa o fuso de QUEM OLHA, não o da loja.** Já é
   dívida existente (viola a regra do `CLAUDE.md` sobre `lib/dates.js`) e não faz
   parte desta tarefa — mas se for tocar aqui, o certo é `instantAt(date,
   t.deadline, tzOf(unit))`. Ver `completionOnTime`, que já faz certo.

**`page.js:1118`** — `STATUS_CFG`, o dicionário de rótulo e cor:

```js
const STATUS_CFG = {
  done:    { label: 'Concluído', color: C.success },
  overdue: { label: 'Atrasado',  color: C.critical },
  pending: { label: 'Pendente',  color: C.pending },
};
```

**`page.js:1265`** — `StatusBadge` faz `STATUS_CFG[status]` e lê `cfg.color`
**sem guarda**. Status novo sem entrada no dicionário = tela branca. Adicione a
entrada ANTES de fazer `templateStatus` devolver o valor novo.

---

## 3. Inventário completo de quem consome o status

Levantado por `grep` em 29/07/2026. **São 4 consumidores de `templateStatus` e 3
lugares que repetem a mesma regra por conta própria** — estes últimos são a
armadilha da tarefa.

### 3.1 Chamam `templateStatus` (mudam junto, automaticamente)

| Onde | Linha | O que faz com o status |
|---|---|---|
| `ExecutarView` | 2229 | Badge + cor da borda do cartão de cada checklist |
| `ExecutarView` | 2266, 2268 | Nível 1: conta `done` e `overdue` por tipo ("X de Y") |
| `PainelView` | 2754–2756 | `allDone` / `anyOverdue` / `doneCount` por tipo — decide a cor do bloco |
| `PainelView` | 2773, 2794 | Badge por checklist |
| `buildJit` | 8782 | Lista de atrasados que virou recomendação no J.I.T. |

### 3.2 Repetem a regra "existe conclusão = feito" (NÃO mudam junto)

Estes são independentes. Esquecer qualquer um deixa o app se contradizendo.

1. **`supabase/functions/notify-overdue/index.ts` (v9)** — a mais importante.
   Roda no Deno, monta `feitos = new Set(completions.map(c => \`${c.template_id}|${c.date}\`))`
   e manda push para o que passou do prazo e não está no Set. Se "parcial" deixar
   de contar como feito, quem entregou 5 de 8 **passa a receber push de atraso**.
   Decisão de produto, não de código.
2. **Aderência da liderança** — `computeLeadershipProfile`, em `page.js` (busque
   `doneByUnitDate`). Conta uma entrega por `(loja, dia)` usando
   `latestPerRound(team)`. É contagem por existência: parcial conta como entrega
   inteira hoje.
3. **`buildJit`, linha ~8779** — `tDone = filterCompletions(...).length`, o
   numerador de aderência de hoje no painel. Mesma coisa.

### 3.3 Não confundir (não têm nada a ver com esta tarefa)

- `completionOnTime` / `punctualityStats` — pontualidade (entregou antes do
  prazo?). Ortogonal a completude.
- `collaboratorStats`, `computeProductivity` — já trabalham item por item, com
  `doneBy`. Estes já enxergam completude corretamente.

---

## 4. O caminho mais curto (e por que ele já está pronto)

A sessão anterior criou **`ibr-checklists-app/lib/rounds.js`**, com testes em
`tests/rounds.spec.js` (20 testes passando). Uma das funções resolve o
numerador de graça:

```js
submittedTasksFrom(completions, { templateId, unitId, date })
// → { itemId: { done: true, operatorUserId, operatorName, completedAt, note, photoPath, submitted } }
```

Ela devolve a **união das tarefas concluídas em TODAS as submissões do dia** — já
lida com o caso de duas pessoas submeterem o mesmo checklist, que é justamente
onde uma conta ingênua erraria. Então:

```js
const feitas   = Object.keys(submittedTasksFrom(completions, { templateId: t.id, unitId: t.unitId, date }));
const aplicaveis = applicableItems(t, date).map(i => i.id);
const nFeitas  = feitas.filter(id => aplicaveis.includes(id)).length;  // interseção: ver 4.1
const nTotal   = aplicaveis.length;
```

`nFeitas === nTotal` → completo · `0 < nFeitas < nTotal` → parcial · `0` →
pendente/atrasado (regra atual de prazo).

### 4.1 Por que a interseção não é preciosismo

O template pode ter mudado depois da submissão (item removido, recorrência
alterada por dia da semana). Sem interseção, um item que não é mais aplicável
inflaria `nFeitas` e um checklist parcial apareceria como completo — exatamente o
bug que a tarefa quer matar, de outro jeito. `applicableItems(t, date)` é a
verdade sobre o que era para fazer naquele dia.

### 4.2 Cuidado com `date` × fuso

`ExecutarView` e `PainelView` chamam com `today = todayStr(tzOf(unit))` e
`viewDate` respectivamente. Mantenha o parâmetro `date` como está — não troque
por `todayStr()` solto. Regra do `CLAUDE.md`: o dia é o do relógio da loja.

---

## 5. As decisões de produto que travam a implementação

**Nada disso é tecnicamente difícil. Estas quatro perguntas é que definem o
resultado — decida antes de escrever código.**

1. **Parcial conta como entregue na aderência?**
   Se **não**, a aderência de toda loja que fecha checklist parcial cai no dia
   seguinte à mudança, sem que ninguém tenha trabalhado menos. Alternativa mais
   justa: contar fração (`nFeitas / nTotal`) em vez de 0 ou 1 — mas isso muda a
   definição da métrica, e o histórico anterior não é comparável.
2. **Parcial dispara push de atraso?** (`notify-overdue`)
   Se **sim**, quem entregou 7 de 8 recebe "checklist atrasado". Se **não**,
   fechar com 1 de 8 silencia a cobrança do dia — que é a brecha que existe hoje.
3. **Qual o rótulo?**
   "PARCIAL" é honesto mas não diz o tamanho. `5/8` no badge informa mais e cabe
   no espaço (o badge é uma pílula curta, ver `StatusBadge`). Considere
   "PARCIAL · 5/8".
4. **Que cor?**
   Verde mente. Vermelho (`C.critical`) confunde com atrasado. `C.warning` é o
   candidato natural — confira o contraste contra o fundo antes (instruções no
   cabeçalho de `lib/tokens.js`; a paleta é medida para WCAG AA e a landing usa os
   mesmos tokens).

---

## 6. Riscos concretos

| Risco | Como evitar |
|---|---|
| `StatusBadge` quebra com status desconhecido (`cfg.color` sem guarda) | Adicione a chave em `STATUS_CFG` **antes** de devolver o valor novo |
| `allDone` em `PainelView:2754` usa `=== 'done'`; parcial passa a ser falsy e a cor do bloco muda sem intenção | Reveja as três linhas 2754–2756 juntas — decida se parcial entra em `doneCount` |
| Contadores "X de Y concluídos" (`ExecutarView:2266`) passam a excluir parcial e o número cai sem explicação na tela | Considere mostrar parcial separado, não só omitir |
| `notify-overdue` fica com regra diferente do app | Trate como parte da MESMA tarefa, não como follow-up |
| Custo por render: `submittedTasksFrom` roda por checklist × por render | É `filter` + `sort` sobre as conclusões do dia. Se pesar, memoize por `(templateId, date)` no componente. Medir antes de otimizar |

---

## 7. Estado atual do que a sessão anterior entregou (não refazer)

Dois commits em `main`, **ambos já em produção**:

- **`0deb6c2`** — execução colaborativa: claim atômico no banco, evidência
  compartilhada (nota + foto na rodada), fila offline, purga de `live_tasks`,
  crédito por tarefa nos eventos, desduplicação de rodada em três métricas.
- **`77e0107`** — bloqueio por TAREFA, não por checklist. Sumiu o diálogo
  "executar de novo cria um segundo registro"; tarefa já registrada hoje está
  travada (com "Reabrir" + motivo como escape); tarefas pendentes de um checklist
  já submetido são executáveis.

Migrations aplicadas no Supabase (`rjuulamozdhssgqrzfji`):

- `20260729_live_tasks_colaborativo.sql` — **aplicada e verificada** (RPCs
  respondem `42501` para anon, o que prova que existem e que o anon está barrado;
  cron `purge-live-tasks` agendado às `30 6 * * *`).
- `20260730_reopen_sem_rodada.sql` — **estado desconhecido em 29/07/2026,
  confirmar antes de começar.** Sem ela, tarefa registrada fora da rodada ao vivo
  não pode ser reaberta (o `UPDATE` não acha linha e a tarefa fica travada).

  **Não dá para verificar pelo REST:** as duas migrations criam
  `reopen_live_task` com a MESMA assinatura, então um `curl` só diz que a função
  existe — não qual versão. A diferença é o `insert ... on conflict` no corpo. No
  SQL Editor:

```sql
select prosrc like '%insert into public.live_tasks%' as tem_upsert
  from pg_proc where proname = 'reopen_live_task';
```

  `true` = 20260730 aplicada · `false` = só a 20260729, **aplicar a 20260730**.

---

## 8. Como testar (o que já existe e serve)

O projeto tem dois runners, os dois sem browser:

```bash
cd ibr-checklists-app && npx playwright test tests/rounds.spec.js tests/dates.spec.js
```

```bash
cd ibr-checklists-app && npm i --no-save @electric-sql/pglite && node supabase/migrations/20260730_reopen_sem_rodada.test.mjs
```

**Recomendação forte:** extraia a nova regra de status para `lib/rounds.js` (ou
um `lib/status.js`) e teste lá, como foi feito com `latestPerRound` e
`mergeRoundState`. `templateStatus` está enterrada num componente de 12 mil
linhas e por isso nunca teve teste — foi exatamente o argumento que criou
`lib/dates.js` (ver o cabeçalho de `tests/dates.spec.js`). Casos que merecem
teste:

- 0 de 8 antes do prazo → pendente · depois do prazo → atrasado
- 5 de 8 → parcial (independente do prazo? decidir — ver §5)
- 8 de 8 → completo
- duas submissões somando 8 de 8 → completo (é o caso que `submittedTasksFrom` cobre)
- item removido do template depois da submissão → não infla o numerador (§4.1)
- checklist sem prazo (`t.deadline` nulo — o "Intermediário") nunca é atrasado

## 9. Verificação no app real (limite conhecido)

A tela de execução está atrás do login por PIN. Nas duas sessões anteriores **não
foi possível verificar o comportamento no app** por isso — só build, testes puros
e sondas de banco. Se você tiver acesso a um PIN de teste, o cenário mínimo é:
fechar um checklist com 5 de 8, voltar na lista e conferir badge, cor, contador
do nível 1, bloco do Painel e se chegou push de atraso.

Servidor local (nunca use `npm run dev` via Bash — o projeto tem
`.claude/launch.json` e o preview do harness): `preview_start` com o nome
`zcheck-dev`, porta 3000. Ele aponta para o Supabase de PRODUÇÃO (anon key
hardcoded em `lib/supabase.js`) — cuidado com escrita.

---

## 10. Contexto de infra (resumo do `CLAUDE.md`)

- git root: `/Users/michelfaria/Documents/Site ZCheck` — **não** em `ibr-checklists-app/`
- projeto ativo: `ibr-checklists-app/`. `ibr-checklists-app-codex-update/` é cópia
  paralela morta, ignorar
- deploy: `cd ibr-checklists-app && npx vercel --prod`
- Supabase: `https://rjuulamozdhssgqrzfji.supabase.co` · GitHub:
  `github.com/michelfaria/zcheck-app` (público)
- Migrations não têm runner: rodam **à mão no SQL Editor** do Supabase
- **O app está em uso por cliente real (Ilhabela Republic).** Migration aditiva,
  nada de reescrever dado, e o cliente tem que continuar de pé no intervalo entre
  o deploy do código e a migration
