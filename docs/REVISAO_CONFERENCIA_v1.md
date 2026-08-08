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

## 5. Pontuação — o redesenho

A fórmula da v1 (média ponderada, aprovado 1.0 / ressalva 0.6 / reprovado 0.0,
peso 0,25) não sobrevive à medição: com 96,9% de aprovação, ela entrega 97-100
para todo mundo. **Não se pesa em 25% um sinal com 3% de variância** — moveria o
índice em menos de 1 ponto e deixaria a colocação pendurada em 41 eventos de 90
dias, onde uma noite ruim vira mudança de posição.

Troca do modelo: **penalidade contável, não média.**

```
qualidade = 100 − (ressalvas × 2 + reprovações × 8)   [piso 0]
```

Três vantagens sobre a média:

1. **Discrimina.** Quem tem 5 ressalvas e 2 reprovações no período fica em 74;
   quem não tem nada fica em 100. A média entregaria 97 e 100.
2. **É explicável.** "Cada reprovação custa 8 pontos, cada ressalva 2" cabe numa
   linha do Meu ID. "Ressalva vale 0,6 na média ponderada" não.
3. **Não satura.** Não depende do denominador — logo não pune quem executa mais.

Condições de entrada, todas obrigatórias:

- **Vale de uma data em diante.** Nada de recálculo retroativo.
- **`taskCounts` não muda.** A dupla penalidade da reprovação (derruba conclusão
  *e* qualidade) fica para depois, se ficar — mexer nela recalcula a nota de
  todo mundo de uma vez.
- **Peso inicial baixo (0,10)**, subindo só quando `apontamentos_sem_motivo` cair
  abaixo de 20%. Um apontamento sem motivo **não pontua**: se a liderança não
  explicou, não tira ponto de ninguém. Isso alinha o incentivo do líder com a
  métrica de sucesso do §2.
- **A régua aparece na tela de quem é medido**, ao lado do número.

Do lado da liderança: `modo: 'lote' | 'individual'` no track (que já manda
metadata em [page.js:12284](ibr-checklists-app/app/app/page.js:12284)) e a taxa
de reprovação do líder vs. mediana da empresa, visível e não punitiva. Risco C
da v1 (dois líderes dividindo a loja) está mudo — há um líder só.

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

Veredito público, nota privada. **Ordem obrigatória:** aplicar o SQL abaixo →
deployar o JS que lê da view + RPC → **só então** rodar o `revoke` do final.

O split é limpo porque `taskCounts`
([page.js:1107](ibr-checklists-app/app/app/page.js:1107)) só olha
`i.review?.verdict`; a nota nunca entra em cálculo nenhum. O veredito continua
legível pela empresa porque `computeOperationalProfile` calcula o índice de
**terceiros** no ranking da Equipe
([page.js:11316](ibr-checklists-app/app/app/page.js:11316)) — e porque ele já é
público *de fato*: move a posição de todos no ranking, que todos veem.

```sql
-- 20260808_conferencia_privacidade.sql

-- A nota do checklist sai de completions.review_note: aquela coluna é legível
-- pela empresa inteira por um grant de TABELA herdado de 20260709, e grant de
-- tabela cobre toda coluna — não dá para fechá-la sem revogar o SELECT da
-- tabela, que o app inteiro usa.
create table if not exists public.completion_review_notes (
  completion_id    text primary key,
  company_id       text        not null,
  note             text        not null,
  reviewed_by      text        not null,
  reviewed_by_name text,
  reviewed_at      timestamptz not null default now(),
  operator_user_id text,
  date             date
);
alter table public.completion_review_notes enable row level security;
revoke all on public.completion_review_notes from anon, authenticated;

insert into public.completion_review_notes (
  completion_id, company_id, note, reviewed_by, reviewed_by_name,
  reviewed_at, operator_user_id, date)
select c.id, c.company_id, c.review_note, coalesce(c.reviewed_by,'?'),
       c.reviewed_by_name, coalesce(c.reviewed_at, now()), c.operator_user_id, c.date
  from public.completions c
 where nullif(btrim(coalesce(c.review_note,'')),'') is not null
on conflict (completion_id) do nothing;

update public.completions set review_note = null
 where nullif(btrim(coalesce(review_note,'')),'') is not null;

-- A view bypassa RLS da tabela base: o filtro de tenant TEM que estar aqui.
drop view if exists public.task_verdicts;
create view public.task_verdicts as
  select company_id, completion_id, item_id, verdict, reviewed_at,
         operator_user_id, executed_by_user_id, date
    from public.task_reviews
   where company_id = public.jwt_company_id();
grant select on public.task_verdicts to authenticated;

create or replace function public.my_task_notes(p_since date default null)
returns table (
  completion_id text, item_id text, verdict text, note text,
  reviewed_by_name text, reviewed_at timestamptz, date date
)
language sql security definer set search_path = public as $$
  select tr.completion_id, tr.item_id, tr.verdict, tr.note,
         tr.reviewed_by_name, tr.reviewed_at, tr.date
    from public.task_reviews tr
   where tr.company_id = public.jwt_company_id()
     and tr.note is not null
     and (p_since is null or tr.date >= p_since)
     and (public.jwt_user_role() in ('lideranca','gerencia','gestao')
          or tr.executed_by_user_id = public.jwt_user_id()
          or tr.operator_user_id    = public.jwt_user_id());
$$;
revoke all     on function public.my_task_notes(date) from public, anon;
grant  execute on function public.my_task_notes(date) to authenticated;

-- review_completion não tem chamador em JS e escreve review_note direto,
-- contornando tudo acima. Porta lateral, fechada.
revoke execute on function public.review_completion(text, text, boolean)
  from authenticated, anon, public;

-- ⚠ SÓ DEPOIS DO DEPLOY DO JS NOVO:
-- revoke select on public.task_reviews from authenticated;
```

## Apêndice C — Migration C (contestação)

```sql
-- 20260808_conferencia_contestacao.sql
create table if not exists public.review_disputes (
  id             uuid primary key default gen_random_uuid(),
  company_id     text        not null,
  completion_id  text        not null,
  item_id        text        not null,
  raised_by      text        not null,
  raised_by_name text,
  raised_at      timestamptz not null default now(),
  reason         text        not null,
  status         text        not null default 'aberta'
                   check (status in ('aberta','mantida','revista')),
  resolved_by      text,
  resolved_by_name text,
  resolved_at      timestamptz,
  resolution_note  text,
  unique (completion_id, item_id)
);
alter table public.review_disputes enable row level security;
revoke all on public.review_disputes from anon, authenticated;
-- Leitura e escrita só por RPC: raise_dispute (o dono da tarefa) e
-- resolve_dispute (liderança). Ambas security definer, papel lido do token.
-- Toda resolução grava um evento em task_review_events.
```

---

## Fora de escopo, registrado

- `notify-status` aceitando `subs` do cliente — falha de segurança real, assunto
  próprio.
- Snapshot mensal do índice; ranking por RPC agregada (esconder também os
  vereditos) — só se a privacidade do veredito virar requisito.
- Paginação por período em `fetchCompletions` — quando a base crescer.
