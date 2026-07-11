# Checklist de Validação — MVP ZCheck (H1–H6)

Referência de uma página para acompanhar o aprendizado. **Não escalar hipóteses — escalar aprendizados.**

## Como usar
- Rode as queries no **SQL Editor do Supabase** (projeto `rjuulamozdhssgqrzfji`) — lá você é `postgres` e o RLS não bloqueia a leitura de `events`.
- Os arquivos ficam em `ibr-checklists-app/supabase/analytics/`. As janelas são dos **últimos 28 dias**, fuso **America/Sao_Paulo**.
- **Pré-requisito:** os dados só acumulam com uso real. Hoje os colaboradores de teste estão `suspended` — ative-os para o piloto começar a gerar sinal.
- **Ritual sugerido:** rodar toda segunda. Ao completar 4 semanas, marcar cada hipótese como **✅ validada / ❌ invalidada / 🔄 pivotar**.

## Saúde da instrumentação (rode primeiro, sempre)
`h1_briefing_habit.sql` → **Query G**. Deve listar os `event_type` com contagem crescente. Se estiver vazio ou parado, a coleta quebrou — resolver antes de olhar o resto.

---

## H1 — Daily Briefing vira hábito  ⭐ (hipótese-âncora)
Arquivo: `h1_briefing_habit.sql`

| O que olhar | Query | Coluna | ✅ Validação | ❌ Invalidação |
|---|---|---|---|---|
| Hábito 4/5 dias úteis (dias quietos não contam contra) | **A** | `pct_habito` | ≥ **60%** por 4 semanas | `pct_uso_semanal` < **30%** após 4 semanas |
| Sinal-ouro: aberturas manuais | **A2** | `aberturas_manuais` | tendência crescente | só abre quando o modal força |
| Loop fechado: plano → resolvido | **C** | `pct_loop_fechado` | ≥ **50%** dos planos resolvidos | planos criados e abandonados |
| Leu ou fechou no reflexo? | D | `pct_dwell_20s` | alto e estável | cai semana a semana = fadiga |
| Rotina de início do dia | B | `pct_antes_9h` | quanto maior, melhor (apoio) | — |

> É a primeira a validar. Se o briefing não vira rotina, o resto perde âncora.
> **Regime desde 10/07/2026 (anti-fadiga):** o briefing só abre sozinho com sinal
> real; dia quieto emite `briefing_skipped` e é neutro no hábito. `source=auto`
> não prova hábito — quem prova é a abertura manual e o loop fechado. Não
> compare `pct_habito` com dados anteriores a essa data sem esta ressalva.

## H2 — ID Operacional engaja o colaborador
Arquivo: `h2_operational_id.sql`

| O que olhar | Query | Coluna | ✅ Validação | ❌ Invalidação |
|---|---|---|---|---|
| Abrem o ID por semana | **A** | `pct_abriu` | ≥ **50%** por 4 semanas | < **20%** |
| Efeito comportamental | **C** | `aderencia_media_pct` | grupo "viu o ID" **> maior** que "não viu" | sem diferença entre os grupos |
| Recorrência | B | `semanas_com_abertura` | hábito = abrir em várias semanas | abrem 1× e somem |

> Validação exige as **duas** coisas: adesão (A) **e** efeito na aderência (C). Adesão sem efeito = vaidade.

## H3 — Líderes usam métricas para reconhecer
Arquivo: `h3_recognition.sql`

| O que olhar | Query | Coluna | ✅ Validação | ❌ Invalidação |
|---|---|---|---|---|
| Líderes reconhecendo c/ métrica | **A** | `pct` | ≥ **60%** dos líderes ativos, em **3 de 4** semanas | < **20%** |
| Âncora em dado objetivo | **B** | `pct_com_metrica` | maioria ancorada numa métrica | reconhecimentos quase todos "livres" |
| Funil perfil → reconhecimento | C | `perfis_vistos` → `reconhecimentos` | — | líderes veem perfil mas não agem |

## H4 — IA reduz esforço de análise
Arquivo: `h4_ai_insight.sql`

| O que olhar | Query | Coluna | ✅ Validação | ❌ Invalidação |
|---|---|---|---|---|
| Insight é útil | **A** | `pct_util` | ≥ **50%** | < **20%** |
| Insight gera ação | **A** | `pct_acao` | ≥ **30%** | ~ **0%** |
| Qual padrão vale mais | B | por `tipo` | reforçar os que geram ação | — |

> Medir **ação**, não volume de insight. Um insight que gera ação vale mais que dez ignorados. Hoje o motor é rule-based; se validar, aí sim faz sentido investir em IA generativa (Claude).

## H5 — Gamificação muda comportamento
Arquivo: `h5_gamificacao.sql`

| O que olhar | Query | Coluna | ✅ Validação | ❌ Invalidação |
|---|---|---|---|---|
| Efeito da medalha (mesmo colaborador) | **C** | `aderencia_antes` → `aderencia_depois` | **depois > antes**, consistente por 4 sem | sem diferença |
| Por tipo de medalha | B | antes vs depois | quais medalhas movem comportamento | — |
| Anti-gaming | **D** | `reaberturas_depois` | **não** sobe vs antes | sobe → gaming (premiou quantidade) |
| Volume | A | `concedidas` | contexto | — |

> **Regra de ouro:** nunca premiar quantidade. Se "medalhas ganhas" sobe mas a aderência não mexe — ou a reabertura piora (Query D) — a hipótese está invalidada, por mais "divertido" que pareça. Evento `badge_earned` emitido quando o colaborador vê uma conquista nova.

## H6 — Checklists colaborativos reduzem retrabalho
Arquivo: `h6_collaborative.sql`

| O que olhar | Query | Coluna | ✅ Validação | ❌ Invalidação |
|---|---|---|---|---|
| Retrabalho | **B** | `taxa_reabertura_pct` | **cai** ao longo das 4 semanas | sobe ou não muda |
| Duplicidade evitada | **C** | `duplicidades_bloqueadas` | colisões sendo bloqueadas | ~0 (ninguém executa junto) |
| Uso colaborativo | A | `sessoes_colaborativas` | há checklists com >1 executor | sempre solo |
| Auditoria (qualitativo) | D | `motivo` | entender os porquês das reaberturas | — |

---

## Regra de decisão (ao fim de cada 4 semanas)
Para cada hipótese: **✅ validada** (bateu o corte) · **❌ invalidada** (bateu o piso) · **🔄 pivotar** (no meio → ajustar a funcionalidade ou o público e rodar mais um ciclo).
Priorize aprender e cortar o que não valida — não acumular features.
