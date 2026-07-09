# Revisão Estratégica ZCheck — MVP de Inteligência Operacional (v1.3)

> Base: `PVD_ZCheck_v1.2_MVP.docx` + `Prompt_Claude_Code_Revisao_ZCheck_v1.3_Hypothesis_Backlog.md`
> Data: 2026-07-09 · Escopo: `ibr-checklists-app/`

**Diretriz que orienta tudo abaixo:** _não escalar hipóteses, escalar aprendizados._ Cada item só entra no MVP se validar uma hipótese. O ZCheck hoje é um **executor de checklists com relatórios**; a tese exige uma **camada de inteligência operacional**. O trabalho do MVP não é "virar plataforma" — é instrumentar o que já existe para provar (ou derrubar) as 6 hipóteses com o cliente-piloto (IBR).

---

## 1. Diagnóstico da arquitetura atual

**Stack:** Next.js 15 (App Router) + React 19 · Supabase (Postgres + Storage + Realtime + Edge Functions) · IndexedDB (`idb-keyval`) para cache offline · PWA (service worker + push VAPID) · deploy Vercel · multi-tenant por subdomínio (`lib/tenant.js`).

**Modelo de dados atual (tabelas em uso):**

| Tabela | Papel | Observação |
|---|---|---|
| `companies` | tenant | slug, primary_color, plan, active |
| `units` | lojas | por company |
| `sectors` | setores | por unit |
| `checklist_types` | tipos (abertura/interm./fech.) | por company |
| `templates` | modelos de checklist | `items` em **jsonb** |
| `completions` | **execuções concluídas** | `items` em jsonb, `operator_user_id`, `completed_at` |
| `photos` | evidências | `storage_path` |
| `closures` | folgas de loja | |
| `users` | usuários | **`pin`, `role`, `unit_id`, `sector_id`** |
| `login_attempts` | rate-limit de PIN | |
| `push_subscriptions` | push web | |
| `user_requests` | pedidos de acesso | |

**Papéis:** `colaborador` · `lideranca` · `gerencia` · `gestao` (diretoria) — com `ROLE_TABS` controlando navegação.

**Telas:** Executar · Painel · Relatórios · Gerenciar · Estrutura · Usuários · Folgas · Login (PIN).

**Camada de sync:** offline-first real — escrita otimista no IndexedDB + fila offline drenada ao reconectar (`lib/sync.js`). Realtime via `postgres_changes` já existe para `templates` e `completions`.

**Edge Functions:** `notify-overdue`, `notify-request`, `notify-status`, `cleanup-photos` (retenção de fotos 90 dias via pg_cron).

### O que isso significa para a tese

**Ponto forte:** a fundação técnica é boa e cara de refazer — offline-first, realtime, multi-tenant e PWA já resolvidos. **Não jogar fora.**

**Lacuna central:** o app captura **resultado** (`completions`) mas **não captura comportamento**. Não existe tabela de eventos. Sem instrumentação, **nenhuma** das 6 hipóteses é mensurável — não dá para saber se o gestor abriu o briefing, clicou numa recomendação, agiu sobre um insight, ou se uma medalha mudou algo. **Este é o gargalo nº 1 do MVP.** Instrumentação vem antes de qualquer feature nova.

**Débitos estruturais relevantes (não são hipóteses, são riscos de entrega):**
- `app/app/page.js` tem **5.860 linhas** num único arquivo. Cada feature nova aumenta o risco de regressão (o CLAUDE.md já registra "quebrou antes"). Extrair as views para arquivos separados **antes** de crescer.
- Mapeamento de empresa hardcoded (`entrar/page.js`, `tenant.js`) — ok para 1 piloto, débito conhecido.

> **⚠️ Achado de segurança (fora do escopo de hipótese, mas bloqueante):** `validatePin()` faz `select ... pin ...` na tabela `users` com a **anon key pública**. Se o RLS permite essa leitura (necessário para a query funcionar), **qualquer pessoa com a anon key — que está no bundle — consegue ler todos os PINs**. Antes de qualquer piloto com dados reais, mover a validação de PIN para uma Edge Function / RPC `SECURITY DEFINER` e travar o RLS da coluna `pin`. Ver §12.

---

## 2. Aderência do app atual à visão do MVP

| Hipótese | Cobertura hoje | Gap |
|---|---|---|
| H1 — Daily Briefing vira hábito | ❌ inexistente | tela nova + instrumentação |
| H2 — ID Operacional engaja colaborador | ❌ inexistente | perfil + agregações |
| H3 — Líderes usam métricas p/ feedback | 🟡 parcial (Relatórios) | métricas por colaborador + evidência de uso |
| H4 — IA acelera decisão | ❌ inexistente | camada de insight + feedback |
| H5 — Gamificação muda cultura | ❌ inexistente | motor de medalhas por qualidade |
| H6 — Checklists colaborativos reduzem retrabalho | 🟡 base técnica (realtime) | multi-executor + auditoria de reabertura |

**Leitura:** ~1,5 de 6 hipóteses têm suporte. O que existe é matéria-prima (execuções + evidências + realtime), não a camada de inteligência. A boa notícia: a matéria-prima certa já está sendo coletada.

---

## 3. Funcionalidades que devem PERMANECER

Tudo que é fonte de dado ou reduz atrito na operação de chão:

- **Executor de checklists** (`ExecutarView` / `ExecutionScreen`) — é a fonte primária de todos os dados. Mantém.
- **Completions + fotos (evidência)** — alimentam H3, H5, H6.
- **Multi-tenant (companies/units/sectors/types)** — necessário, já pronto.
- **Sync offline-first + fila offline** — valor real em food service (wifi ruim na cozinha). Diferencial.
- **Realtime** — fundação do H6 (execução colaborativa).
- **Login por PIN para colaborador** — atrito baixo é correto para o chão de operação. Mantém para colaborador.
- **Modelo de papéis** e **push notifications**.

---

## 4. Funcionalidades que devem ser REMOVIDAS ou ADIADAS

Nada que não valide hipótese entra agora.

- **Dashboards genéricos / BI amplo** → adiar. A tese diz explicitamente "não precisam de mais dashboards". Substituídos pelo **Daily Briefing** (foco) e por **um relatório por hipótese**.
- **Login email+senha para gestão** (pendência nº 4 do CLAUDE.md) → **adiar**. PIN funciona no piloto; e-mail/senha não valida nenhuma hipótese do MVP.
- **Tirar mapeamento hardcoded de empresas** (pendência nº 5) → adiar. Débito conhecido, 1 piloto só.
- **Expansão de telas administrativas** (Estrutura/Gerenciar além do necessário para IBR) → congelar. Não crescer.
- **Refinos de identidade visual interna** (pendência nº 3, "quebrou antes") → adiar; risco alto, retorno de aprendizado baixo.

---

## 5. Funcionalidades que devem ser SIMPLIFICADAS

- **`ReportsView`** (≈460 linhas) → reduzir de "central de relatórios" para **um relatório objetivo por hipótese** (ex.: aderência por colaborador para H3). Menos superfície, mais foco.
- **Editor de templates** → manter, **não expandir**. Já cobre o piloto.
- **Refactor estrutural (não é feature):** quebrar `page.js` em `app/app/views/*` e `components/*`. Pré-requisito para adicionar módulos sem regressão.

---

## 6. Novos módulos necessários para validação

Ordem = prioridade de aprendizado.

0. **Camada de instrumentação de eventos** (§8) — habilita **todas** as hipóteses. Sem ela nada é mensurável. **Sprint 1, inegociável.**
1. **Daily Operational Briefing** — tela-abertura do dia do gestor (H1).
2. **ID Operacional** — perfil de reputação/evolução de colaborador, unidade, setor (H2, H3).
3. **Motor de gamificação** — medalhas/streaks ponderados por **qualidade e consistência**, nunca por quantidade (H5).
4. **Camada de insight de IA** — resume rotina em recomendações acionáveis + feedback "isso foi útil?" (H4).
5. **Execução colaborativa** — múltiplos executores em tempo real + auditoria de reabertura (H6).
6. **Microcoletas qualitativas in-app** (§10) — 1 pergunta contextual, leve, não invasiva.

---

## 7. Hypothesis Backlog completo

Formato por hipótese: Funcionalidade/experimento · Dados · Eventos · Métricas · Validação · Invalidação · Visualização · Risco · Prioridade · Sprint.

### H1 — Gestores usam o Daily Briefing como primeira tela do dia
- **Experimento:** Daily Operational Briefing (resumo do dia anterior + prioridades de hoje + 3 recomendações).
- **Dados:** aberturas do briefing, horário, user, unidade, tempo em tela, cliques em recomendação, ação tomada.
- **Eventos:** `briefing_opened`, `briefing_dwell`, `recommendation_clicked`, `recommendation_actioned`.
- **Métricas:** % gestores que abrem/dia · % abertura antes das 9h · recomendação→ação · frequência semanal.
- **Validação:** ≥60% dos gestores ativos abrem em 4 de 5 dias úteis por 4 semanas.
- **Invalidação:** <30% abrem semanalmente após 4 semanas.
- **Visualização:** cohort de aberturas diárias + heatmap de horário.
- **Risco:** ALTO (é a hipótese-âncora de hábito). **Prioridade P0. Sprint 2.**

### H2 — ID Operacional aumenta engajamento e senso de evolução do colaborador
- **Experimento:** tela de ID Operacional do colaborador (indicadores, medalhas, evolução, histórico).
- **Dados:** visualizações do próprio ID, frequência, evolução de indicadores no tempo.
- **Eventos:** `operational_id_viewed`, `badge_earned`, `recognition_received`.
- **Métricas:** % colaboradores que abrem o ID/semana · retorno recorrente · correlação ID↔aderência (colaboradores que veem o ID concluem mais/melhor?).
- **Validação:** ≥50% dos colaboradores ativos abrem o ID ≥1×/semana por 4 semanas **e** grupo que vê o ID tem aderência maior que quem não vê.
- **Invalidação:** <20% abrem, ou nenhuma diferença de comportamento.
- **Visualização:** curva de evolução individual + comparação "viu × não viu".
- **Risco:** ALTO (engajamento é difícil de mover). **Prioridade P1. Sprint 3.**

### H3 — Líderes usam métricas objetivas para feedback/reconhecimento/promoção
- **Experimento:** painel de colaborador para líder + botão "dar reconhecimento" ancorado numa métrica.
- **Dados:** acessos de líder ao perfil de colaborador, reconhecimentos enviados, métrica que originou o reconhecimento.
- **Eventos:** `collaborator_profile_viewed` (by leader), `recognition_sent`, `metric_referenced_in_feedback`.
- **Métricas:** nº de líderes que dão ≥1 reconhecimento/semana · % de reconhecimentos ancorados numa métrica · perfis vistos/líder.
- **Validação:** ≥60% dos líderes ativos enviam ≥1 reconhecimento ancorado em métrica em 3 das 4 semanas.
- **Invalidação:** <20% dos líderes usam a métrica; reconhecimento não engata.
- **Visualização:** funil líder→perfil→reconhecimento.
- **Risco:** MÉDIO. **Prioridade P1. Sprint 4.**

### H4 — IA reduz esforço de análise e acelera decisão
- **Experimento:** insight diário gerado por IA no briefing ("Loja 2: banheiro reprovado 3× esta semana — priorize"). Com feedback in-app.
- **Dados:** insights vistos, feedback de utilidade, ação tomada, tempo até ação.
- **Eventos:** `ai_insight_viewed`, `ai_insight_feedback` (útil/não), `ai_insight_actioned`, `action_plan_created/completed`.
- **Métricas:** % insights marcados úteis · % insights que geram ação · tempo médio insight→ação.
- **Validação:** ≥50% dos insights marcados úteis **e** ≥30% geram ação registrada, por 4 semanas.
- **Invalidação:** <20% úteis ou ~0% de ação.
- **Visualização:** funil insight→útil→ação + distribuição de utilidade.
- **Risco:** ALTO (qualidade do insight + custo). Começar **rule-based/estatístico**; IA generativa só depois de haver volume. **Prioridade P2. Sprint 5.**

### H5 — Gamificação fortalece cultura e aumenta aderência
- **Experimento:** motor de medalhas que premia **qualidade, consistência, colaboração, melhoria contínua** — nunca quantidade pura.
- **Dados:** medalhas concedidas por critério, streaks, aderência antes/depois da medalha.
- **Eventos:** `badge_earned`, `streak_reached`, `mission_started/completed`, `ranking_opened`.
- **Métricas:** aderência pré×pós-medalha (mesmo colaborador) · manutenção de streak · adesão a missões.
- **Validação:** colaboradores que ganham medalhas de consistência mantêm/aumentam aderência nas 2 semanas seguintes vs. baseline.
- **Invalidação:** sem efeito, ou efeito perverso (gaming: concluir sem qualidade só pelo ponto).
- **Visualização:** série temporal de aderência com marcadores de medalha (event-study simples).
- **Risco:** ALTO (fácil desenhar incentivo errado). **Prioridade P2. Sprint 6.**

### H6 — Checklists colaborativos reduzem retrabalho e falhas de comunicação
- **Experimento:** execução multi-executor em tempo real; tarefa concluída fica visível, semitransparente, bloqueada, "Concluída por Fulano às HH:MM"; auditoria completa de reabertura.
- **Dados:** execuções simultâneas, tarefas reabertas, motivo de reabertura, colisões evitadas.
- **Eventos:** `task_completed`, `task_reopened` (+ motivo), `collaborative_session` (nº de executores), `duplicate_execution_blocked`.
- **Métricas:** % checklists com >1 executor · taxa de reabertura · queda de execução duplicada · tempo de conclusão colaborativa vs. solo.
- **Validação:** redução mensurável de reabertura/duplicidade vs. baseline solo, sobre 4 semanas.
- **Invalidação:** sem diferença, ou aumento de confusão/reabertura.
- **Visualização:** taxa de reabertura por unidade no tempo + motivos.
- **Risco:** MÉDIO (base realtime já existe). **Prioridade P1. Sprint 3–4.**

---

## 8. Plano de instrumentação de eventos

**Nova tabela `events`** (append-only, uma linha por evento):

```sql
create table events (
  id           uuid primary key default gen_random_uuid(),
  event_type   text not null,        -- ver catálogo abaixo
  occurred_at  timestamptz not null default now(),
  user_id      text,
  company_id   text,
  unit_id      text,
  sector_id    text,
  checklist_id text,
  task_id      text,
  role         text,
  device       text,                 -- 'pwa' | 'mobile-web' | 'desktop'
  action_source text,                -- 'briefing' | 'checklist' | 'id' | 'ranking' | ...
  metadata     jsonb default '{}'    -- payload específico do evento
);
create index on events (company_id, event_type, occurred_at);
create index on events (user_id, occurred_at);
```

**Catálogo mínimo de eventos (MVP):**
`login` · `briefing_opened` · `briefing_dwell` · `recommendation_clicked` · `recommendation_actioned` · `checklist_completed` · `task_completed` · `task_reopened` · `operational_id_viewed` · `badge_earned` · `recognition_received` · `recognition_sent` · `ranking_opened` · `evidence_submitted` · `occurrence_logged` · `ai_insight_viewed` · `ai_insight_feedback` · `ai_insight_actioned` · `action_plan_created` · `action_plan_completed` · `survey_answered`.

**Client wrapper** (`lib/track.js`), seguindo o padrão offline-first já existente:

```js
// track() escreve na fila local e faz flush em batch (mesma estratégia de sync.js)
export async function track(eventType, props = {}) {
  const ev = {
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    user_id: session.userId, company_id: session.companyId,
    unit_id: session.unitId, sector_id: session.sectorId,
    role: session.role, device: detectDevice(),
    action_source: props.source ?? null,
    checklist_id: props.checklistId ?? null,
    task_id: props.taskId ?? null,
    metadata: props.metadata ?? {},
  };
  await enqueueEvent(ev);       // IndexedDB
  scheduleFlush();             // batch insert em events quando online
}
```

**Princípios:** (1) offline-first — eventos nunca se perdem em wifi ruim; (2) batch insert para não sobrecarregar; (3) `metadata` jsonb absorve o que for específico sem migração; (4) uma única função `track()` — instrumentar é uma linha por ponto de interesse.

**Cuidado de custo/volume:** `briefing_dwell` e scroll podem gerar muito evento — amostrar ou consolidar em 1 evento de "sessão de briefing" com duração no metadata.

---

## 9. Métricas principais por hipótese (resumo executivo)

| Hipótese | Métrica-âncora | Meta de validação |
|---|---|---|
| H1 Briefing | % gestores abrindo 4/5 dias | ≥60% por 4 semanas |
| H2 ID Operacional | % colaboradores abrindo ID/semana + Δaderência | ≥50% e efeito positivo |
| H3 Feedback | reconhecimentos ancorados em métrica/líder | ≥60% líderes, 3/4 semanas |
| H4 IA | % insights úteis + % que geram ação | ≥50% úteis, ≥30% ação |
| H5 Gamificação | Δaderência pós-medalha (mesmo colaborador) | positivo, sem gaming |
| H6 Colaborativo | Δtaxa de reabertura/duplicidade | redução mensurável |

---

## 10. Coleta qualitativa in-app

Micro-perguntas contextuais, 1 toque, nunca bloqueantes. Guardar em `survey_responses` e emitir `survey_answered`.

- Após insight: **"Esse insight foi útil?"** (👍/👎) → alimenta H4.
- Após ação: **"Você agiu com base nisso?"** → H4.
- Após medalha: **"Essa medalha fez sentido?"** → H5.
- Após briefing: **"Esse briefing te ajudou a priorizar o dia?"** → H1.
- Ocasional: **"O que faltou aqui?"** (texto curto, opcional).
- Para líder: **"Essa métrica ajuda no feedback com a equipe?"** → H3.

Regra: no máx. 1 micro-pergunta por sessão; nunca interromper execução de checklist.

---

## 11. Telas para acompanhamento dos dados (para o fundador, não para o cliente)

Um **Learning Dashboard interno** (rota protegida, ex. `/insights`), separado do produto — o objetivo é o founder ler aprendizado, não o gestor ver BI.

1. **Cohort de hábito (H1):** aberturas de briefing por dia/gestor, linha de meta 60%.
2. **Funil de insight (H4):** visto → útil → ação, com % em cada passo.
3. **Adoção do ID (H2):** % colaboradores que abrem + curva "viu × não viu" aderência.
4. **Uso de métrica por líderes (H3):** funil perfil→reconhecimento.
5. **Efeito de gamificação (H5):** aderência com marcadores de medalha.
6. **Qualidade colaborativa (H6):** taxa de reabertura por unidade no tempo.
7. **Painel de eventos bruto:** volume por `event_type`/dia (saúde da instrumentação).

Ferramenta: pode ser SQL + Metabase/Grafana sobre o Postgres do Supabase no início — **não construir BI dentro do app**.

---

## 12. Roadmap incremental por sprint

Sprints curtas, cada uma fecha um ciclo de aprendizado.

- **Sprint 1 — Fundação de dados + segurança.** Tabela `events` + `lib/track.js`; instrumentar `login`, `checklist_completed`, `task_completed`. **Corrigir a exposição de PIN** (RPC/Edge Function). Extrair 2–3 views maiores de `page.js`. → _sem feature nova; habilita todo o resto._
- **Sprint 2 — Daily Briefing (H1).** Tela + eventos `briefing_*`. Micro-pergunta "ajudou a priorizar?". Cohort de hábito no Learning Dashboard.
- **Sprint 3 — ID Operacional v1 (H2) + base colaborativa (H6).** Perfil do colaborador (indicadores + histórico) + estado semitransparente/bloqueado de tarefa concluída.
- **Sprint 4 — Métricas para líderes (H3) + auditoria de reabertura (H6).** Reconhecimento ancorado em métrica; `task_reopened` com motivo.
- **Sprint 5 — Insight de IA v1 (H4).** Começar **rule-based** (regras estatísticas sobre completions), feedback de utilidade. IA generativa só depois de volume.
- **Sprint 6 — Gamificação por qualidade (H5).** Medalhas de consistência/colaboração; event-study de aderência.
- **Revisão de aprendizado (contínua):** ao fim de cada 4 semanas, decidir validado/invalidado/pivot por hipótese. _Escalar aprendizado, não feature._

---

## 13. Riscos técnicos e de produto

**Técnicos**
- **`page.js` monolítico (5.860 linhas):** cada módulo novo aumenta risco de regressão. Mitigar com refactor incremental na Sprint 1.
- **Exposição de PIN via anon key** (§1): corrigir antes de dados reais.
- **RLS/permissões:** conferir que a anon key não lê `events`/`pin`/dados de outro tenant. Multi-tenant sem RLS forte = vazamento entre empresas quando entrar o 2º cliente.
- **Volume de eventos:** dwell/scroll podem explodir linhas — amostrar/consolidar.
- **Custo de IA:** insight generativo por unidade/dia escala custo; começar rule-based.

**De produto**
- **Hábito (H1) é a hipótese mais arriscada** — se o briefing não vira rotina, o resto perde âncora. Validar primeiro.
- **Gamificação mal calibrada (H5):** premiar quantidade gera gaming (concluir sem qualidade). Métrica de sucesso deve olhar qualidade e reabertura, não contagem.
- **Amostra pequena (1 piloto):** validação estatística fraca. Tratar como aprendizado qualitativo forte, não prova quantitativa definitiva.
- **Sobrecarga de coleta qualitativa:** perguntas demais = fadiga. Limitar a 1/sessão.

---

## 14. Recomendações de banco de dados

**Novas tabelas (por hipótese, todas por `company_id`):**
- `events` (§8) — fundação.
- `survey_responses` (H1/H4/H5) — respostas das micro-perguntas.
- `badges` + `badge_awards` (H5) — catálogo e concessões, com `criterion` (qualidade/consistência/colaboração).
- `recognitions` (H3) — quem reconheceu quem, ancorado em `metric_ref`.
- `ai_insights` + `insight_feedback` (H4) — insight gerado, tipo, feedback de utilidade/ação.
- `action_plans` (H4) — plano criado a partir de insight, status.
- `task_audit` (H6) — reaberturas com motivo, responsável, horário (auditoria completa exigida pelo PVD).

**ID Operacional:** não precisa de nova tabela pesada no início — pode ser **view/materialized view** agregando `completions` + `badge_awards` + `events`. Materializar só se performance exigir.

**Transversal:** habilitar **RLS por `company_id`** em todas as tabelas antes do 2º tenant; índices por `(company_id, occurred_at)`; manter `items` em jsonb (flexível e suficiente na escala do piloto).

---

## 15. Recomendações de UX

- **Briefing = primeira tela do gestor** ao logar (não uma aba escondida). Curto, escaneável em <30s: "ontem", "hoje prioriza", "3 recomendações".
- **ID Operacional com narrativa de evolução**, não planilha: progresso, conquistas, "você melhorou X". Orgulho, não vigilância.
- **Gamificação sóbria** — reforça cultura, não vira joguinho. Medalha comunica _por que_ foi concedida.
- **Coleta qualitativa leve:** 1 toque, dispensável, contextual, nunca no meio da execução.
- **Execução colaborativa clara:** estado semitransparente + "Concluída por Fulano às HH:MM" evita retrabalho e comunica em tempo real.
- **Manter atrito baixo no chão** (PIN, offline, PWA) — já é um acerto, preservar.

---

## 16. Recomendações de IA

- **Faseado:** comece **rule-based/estatístico** (ex.: "item crítico reprovado N× na semana", "queda de aderência vs. média da loja"). Barato, explicável, e já testa H4 (líder acha útil? age?).
- **Generativo depois:** quando houver volume, usar LLM para **resumir e priorizar** a rotina em linguagem natural. Dado o ambiente, **Claude (Opus/Sonnet mais recentes)** com prompt que recebe agregados (nunca dados brutos massivos) e devolve 3 recomendações acionáveis.
- **Human-in-the-loop sempre:** todo insight tem "isso foi útil?" e "você agiu?". O feedback é o dado que valida H4 e treina a régua de relevância.
- **Medir insight→ação, não volume de insight.** Um insight que gera ação vale mais que dez ignorados.
- **Controle de custo:** batch diário por unidade, cache de agregados, evitar chamada por evento.

---

## Recomendações finais de validação — Gamificação & ID Operacional

- **Gamificação:** medir **efeito comportamental** (Δaderência/reabertura pós-medalha no mesmo colaborador), não engajamento com a mecânica. Se o número que sobe é "medalhas ganhas" mas aderência/qualidade não mexe — ou piora — a hipótese está invalidada, por mais "divertido" que pareça.
- **ID Operacional:** validar que ele é **usado para decisão real** — líder abre o perfil antes de um feedback/reconhecimento/promoção (evento `collaborator_profile_viewed` → `recognition_sent`). Se colaboradores olham mas líderes não usam para decidir, é vaidade, não inteligência operacional.

---

### Próximos passos sugeridos (o menor caminho até o 1º aprendizado)
1. Criar tabela `events` + `lib/track.js` e corrigir a exposição de PIN. _(Sprint 1)_
2. Instrumentar os 3 eventos de base e montar o painel de saúde de eventos.
3. Construir o Daily Briefing e medir hábito por 4 semanas — **a primeira hipótese a validar ou derrubar.**
