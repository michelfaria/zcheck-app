# Revisão de Layout Desktop — ZCheck (v1)

> **Estado: fases 1–2 implementadas + metade da fase 3.** Ver §11 no fim deste
> documento para o que entrou, o que não entrou e o que ficou pendente de decisão.


> Data: 2026-07-24 · Escopo: `ibr-checklists-app/app/app/page.js` (9.500 linhas)
> Método: 4 agentes especialistas (UX, arquitetura de informação, direção visual, sistema de design) + verificação independente de cada número no código.

**Diretriz que orienta tudo abaixo:** _o mobile é o default imutável; o desktop é aditivo._ Toda regra nova nasce dentro de um `@media (min-width: …)`. Se uma regra desktop está fora de media query, o commit está errado — e isso é auditável com um `grep`.

O objetivo não é "esticar melhor". É que o gestor que assina o contrato abra o app no computador do escritório e reconheça a categoria do produto.

---

## 1. Diagnóstico: o que o desktop é hoje

O app comete **os dois erros opostos ao mesmo tempo**.

| | Estado | Evidência |
|---|---|---|
| Conteúdo | Estica sem limite | `<main style={{ flex: 1 }}>` — sem `maxWidth` ([page.js:8996](../ibr-checklists-app/app/app/page.js)) |
| Diálogos | Espremidos em 480px, colados no rodapé | 7 overlays com `maxWidth: 480` + `alignItems: 'flex-end'` |
| Navegação | Barra inferior esticada | `BottomNav` `sticky bottom-0 flex` com `flex-1` por item ([page.js:6408](../ibr-checklists-app/app/app/page.js)) |
| Breakpoints desktop | **Zero** | `grep "@media (min-width"` → nenhum resultado em `app/` e `lib/` |

Num monitor de 1440px: linhas de texto de 15px com 1.400px de largura, ao lado de uma caixa de decisão de 480px na borda inferior — onde o olho do usuário de desktop não está.

### O contraste que sustenta o argumento comercial

**Todo o resto do produto já é desktop.** Só o app não é.

| Superfície | Tratamento desktop |
|---|---|
| Landing (`app/page.js`) | container 1120px, grids de 3/4/5 colunas, tipografia em `clamp()` |
| `/admin` | sidebar `md:w-56` + `main maxWidth: 1200` ([admin/(core)/layout.js:56,90](../ibr-checklists-app/app/admin/(core)/layout.js)) |
| `/ajuda` | `maxWidth: 960` |
| `/importar` | `maxWidth: 640` |
| **`/app`** | **nenhum** |

O gestor vê a landing e a Central de Ajuda em desktop *antes* de entrar, e encontra um layout de celular *depois*. A objeção de credibilidade nasce na primeira sessão de quem paga.

### A prova mais dura: o layout já virou limitação de produto

Relatórios corta a lista de execuções em `.slice(0, 20)` e avisa:

> *"Mostrando as 20 mais recentes de {N} — refine os filtros ou exporte o CSV para o total."* ([page.js:3255](../ibr-checklists-app/app/app/page.js))

**O produto manda o gestor para o Excel por falta de espaço em tela.** E o `exportPDF` ([page.js:2844](../ibr-checklists-app/app/app/page.js)) monta um documento de 820px com `grid-template-columns: repeat(4,1fr)` e tabelas de 6 colunas — a densidade desktop de que o gestor precisa **já foi projetada, só que fora do produto**.

### Três defeitos tipográficos que afetam mobile e desktop

Verificados por leitura direta do código. São os achados mais acionáveis do estudo inteiro.

**1. A fonte nunca é carregada.**
Não existe `next/font`, `@font-face` nem link para Google Fonts em lugar nenhum do projeto. O stack é `-apple-system, BlinkMacSystemFont, 'Inter', system-ui` ([globals.css:54](../ibr-checklists-app/app/globals.css)) — Inter está em terceiro e **nunca chega, porque não foi carregada**. No Mac renderiza SF Pro; **no Windows, Segoe UI**. O comprador enterprise usa Windows.

**2. `font-display` não é uma classe morta — é uma classe nociva.**
`tailwind.config.mjs` estende `colors` e `borderRadius`, **não estende `fontFamily`**, e `display` não é chave padrão do Tailwind. Mas o `<style>` inline dentro de `app/app/page.js` declarava `.font-display { font-family: ui-sans-serif, system-ui; font-weight: 800 }` — ou seja, os **59 call-sites** estavam ativamente **anulando a Inter e reimpondo o peso 800** que o `tokens.js` proíbe.
*(Correção apurada na implementação: a leitura inicial de "classe morta" estava errada.)*

**3. O peso 800 voltou.**
`tokens.js:72` diz textualmente *"Nada de 800"*. Há **231 ocorrências** de `fontWeight: 800`. Mais **112 usos** de fonte 9/10/11px, contra um piso documentado de 14px para conteúdo.

> Consertar os três custa ~5 linhas de configuração e uma migração controlada de peso. Muda 100% dos pixels de texto do produto, no celular e no computador. **É o movimento de maior impacto do estudo, e não é layout.**

---

## 2. Quem usa desktop, e para quê

| Papel | Abas | Onde trabalha | JTBD de desktop |
|---|---|---|---|
| `colaborador` | executar, painel, id | Chão de operação, celular, uma mão | **Nenhum.** A evidência fotográfica só existe onde há câmera na mão |
| `lideranca` | + relatorios, equipe | Híbrido: celular no turno, PC no fechamento | "Ver o que ficou pendente e quem fez, antes de todo mundo ir embora" |
| `gerencia` | + gerenciar | Multi-loja, escritório | "Comparar minhas lojas no mesmo período e achar qual está caindo" |
| `gestao` | + usuarios | Escritório | Configurar estrutura, templates, importar CSV, aprovar cadastros |

**Quem paga passa mais tempo nas telas menos adequadas ao celular.** Configuração, importação e relatórios são tarefas nativamente de desktop.

### O dado para confirmar isso já existe

`lib/track.js` grava `device` (`'desktop' | 'mobile-web' | 'pwa'`) junto de `role` em todo evento. Uma consulta responde a pergunta sem entrevistar ninguém:

```sql
select device, role, event_type, count(*), count(distinct session_id)
from events where occurred_at > now() - interval '30 days'
group by 1,2,3 order by 4 desc;
```

Duas ressalvas: PWA instalado no desktop conta como `pwa`, e a detecção é por user agent (tablet em paisagem cai em `mobile-web`). **O número de `desktop` é um piso.**

### As 6 dores, por impacto

| Sev. | View | Problema | Linha |
|---|---|---|---|
| **P0** | `ReportsView` | ~10 blocos verticais; filtro e resultado **nunca visíveis juntos**. Cada ajuste custa duas rolagens | 2677–3288 |
| **P0** | `TemplateEditor` | Reordenar itens: drag manual sem autoscroll; fallback é `moveItem(±1)` — mover 30 posições = 30 cliques | 3425–3760 |
| **P1** | `ImportCsvModal` | A tarefa mais inequivocamente de desktop (o CSV vem do Excel) numa gaveta de 560px colada no rodapé | 3762–4040 |
| **P1** | `GerenciarView` | 4 níveis de drill-down; `key={unitId}` remonta tudo ao trocar de loja | 4041–4920 |
| **P1** | `UsersView` | Revisar cadastro esconde a lista — decide-se "esta pessoa vira gerência?" sem ver quem já é | 5358–5920 |
| **P2** | `Header` | Empilha ~200px de cromo (trial, offline, sync, logo, data, ações, lojas) antes do conteúdo | 6270–6404 |

### A fricção mais subestimada: não há roteamento

`tab` é `useState` em `AppInner` ([page.js:8192](../ibr-checklists-app/app/app/page.js)), sem URL. Não há deep link, não há voltar do navegador, e **não dá para abrir duas abas** — que é literalmente como se compara qualquer coisa no desktop. Nenhum ajuste de largura resolve isso; é estrutural, e é barato.

---

## 3. Direção visual

**A linguagem: instrumento de operação, não painel de marketing.**

1. **Estrutura em vez de decoração.** Sofisticação vem de alinhamento, degrau de superfície e hairline — não de gradiente ou sombra. Se um elemento precisa de sombra para ser lido, o layout está errado.
2. **Cor é informação.** Em tela grande, cor só aparece quando significa estado ou identidade de loja. Uma tela de gestão bem-feita é ~90% acromática.
3. **Densidade é respeito.** O gerente quer ver 5 lojas de uma vez. Ar generoso em tela grande não lê como "premium" — lê como "não tem conteúdo".

### Referências, e o que puxar de cada uma

| Produto | O que puxar |
|---|---|
| **Vercel** | Fundo um passo mais escuro que o card; card branco com hairline de 1px e **nenhuma sombra** em elemento estático |
| **Stripe** | Numerais tabulares em toda coluna de número; cabeçalho de tabela 12px maiúsculo; a tabela como componente-herói |
| **Linear** | Linha de lista de ~40px; rail estreito permanente; hierarquia por peso e opacidade, quase nunca por cor |
| **Ramp** | O número-herói: tracking negativo forte + rótulo 12px maiúsculo acima |

**Antirreferências:** o dashboard de demo do shadcn (risco concreto — `globals.css` já mapeia o tema e `tailwind.config.mjs` já registra `chart-1..5`); qualquer painel com violeta/gradiente/glass; templates Material admin.

### Extensão de tokens: duas cores, ambas medidas

Verifiquei o contraste de cada uma independentemente. **Minha medição encontrou duas reprovações a mais do que o agente reportou** — estão marcadas abaixo.

```js
shell: '#E8EFF5'    // fundo de chrome do desktop
inkMuted: '#9FB8C8' // texto secundário sobre superfície ink
```

**Sobre `shell` #E8EFF5:**

| Token | Contraste | Veredito |
|---|---|---|
| `ink` #063C5C | 10,01:1 | ✅ |
| `muted` #5B6B78 | 4,74:1 | ✅ |
| `critical` #B91C1C | 5,58:1 | ✅ |
| `mutedLight` #627382 | 4,21:1 | ❌ **reprova** |
| `success` #15803D | 4,32:1 | ❌ **reprova** ⚠️ *não reportado pelo agente* |
| `warning` #B45309 | 4,33:1 | ❌ **reprova** ⚠️ *não reportado pelo agente* |
| branco sobre `shell` | 1,16:1 | degrau (hoje é 1,06:1 sobre `bg`) |

> **Regra dura que cai dessas medições:** `shell` é **canvas e cromo apenas** — nunca fundo de texto de status. Sobre `shell` só passam `ink`, `muted` e `critical`. Como `success` e `warning` reprovam, badge de estado sobre `shell` precisa de fundo branco próprio.
>
> **Segunda regra:** sobre `shell`, não se usa o hairline `border` (1,05:1 — invisível). O degrau de superfície já é a separação.

**Sobre `ink` #063C5C:** `inkMuted` dá 5,62:1 ✅ (`muted` daria 2,11:1 ❌). `greenOnDark` 6,66:1 ✅, branco 11,61:1 ✅. `inkMuted` sobre branco dá 2,07:1 — **só vale sobre ink**, e o comentário do token precisa dizer isso.

### Escada de superfície E0–E3

| Nível | Superfície | Borda | Sombra | Uso |
|---|---|---|---|---|
| **E0** | `shell` | — | nenhuma | canvas, rail, toolbar, zebra de tabela |
| **E1** | branco | 1px `border` | **nenhuma** | card, painel, linha — ~95% da UI |
| **E2** | branco | 1px `border` | `0 1px 2px rgba(8,20,30,.06), 0 8px 24px -8px rgba(8,20,30,.18)` | dropdown, popover, tooltip |
| **E3** | branco | — | `0 1px 2px rgba(8,20,30,.06), 0 16px 40px -16px rgba(8,20,30,.22)` | modal, drawer |

E3 é **literalmente a sombra que a landing já usa** em `.lp-hero-card`. Não é invenção: é promoção a token do que já existe e está certo. Isso substitui as ~11 sombras pretas ad hoc do app (`rgba(0,0,0,0.2…0.4)`), que sobre fundo azulado leem como cinza-sujo.

### Domar o acento por loja

**261 referências** a `accent`/`unit.color`. Em mobile você vê uma loja por vez; em desktop, três ao mesmo tempo — e o `PainelView` já pinta com acento o número de 32px, a barra, a borda do card e o botão primário no mesmo cartão.

- **Uma marca de acento por objeto.** Rail de 4px **ou** dot de 8px. Nunca os dois.
- **Botão primário é sempre `ink`.** Três lojas na tela = três botões primários de cores diferentes = o olho lê bug de estado. A landing já faz assim.
- **Acento nunca vira cor de texto.** `unit.color` é escolhido pelo gestor: é cor **não medida**. Só preenchimento com ≥3px de área.

### Tipografia

**Uma família: Inter**, carregada de verdade via `next/font`, com `font-feature-settings: 'tnum'`. `font-display` não é outra família — é um papel óptico:

```css
.font-display { font-family: var(--font-inter); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
```

Tracking negativo a partir de 20px; zero abaixo de 18px. É o que dá "cara de produto caro" em título grande, e é grátis.

**Escala desktop — só a metade de cima cresce.** Corpo maior = menos densidade = menos premium.

```js
export const TD = {
  display: 34,  // era 26
  h1: 28,       // era 24
  h2: 22,       // era 20
  h3: 18,       // era 17
  bodyLg: 16, body: 15, bodySm: 14,  // INALTERADOS — densidade
  caption: 13, label: 12,            // INALTERADOS — piso medido
};
```

### Densidade: mais denso **e** mais legível ao mesmo tempo

O ganho não vem de encolher fonte:

- **Padding vertical é a gordura.** Card vai a 16px horizontal / 12px vertical. O ganho vem de caber 4 por linha.
- **Alvo de mouse pode ser 32px.** WCAG 2.2 (2.5.8) exige 24×24px — não 44. Os 44–56px de hoje existem para o dedo. É conformidade, não atalho.
- **Tabela substitui pilha de cards.** Linha de 40px a 14px mostra ~18 linhas em 800px de viewport; a pilha atual mostra ~5. **Ganho de 3,5× sem tocar em nenhum tamanho de fonte.**
- **E o piso sobe:** os 112 usos de 9/10/11px viram `label` 12px. O rótulo de nav era 9px porque o item tinha 54px de largura; no rail vertical ele tem 240px e cabe em 12px folgado.

---

## 4. Arquitetura de informação

### Modelo: sidebar persistente + topbar fina de contexto

- **Sidebar esquerda, 240px**, sempre visível ≥1024px, em `ink` sólido.
- **Topbar 56px** à direita da sidebar: loja, data, briefing, conta.
- **Faixa de sistema 32px** acima de tudo: trial, offline, sync.

**Por que sidebar e não top nav:** largura é o recurso escasso, mas com 6 destinos + seletor de loja + trial + 5 ações de conta, a top nav estoura antes de 1280px. E escopo (loja) e navegação são eixos diferentes — o `Header` hoje mistura os dois e empilha ~200px. Separar é o maior ganho do desktop. É também o padrão de Linear, Stripe, Vercel e Retool, **e o `/admin` do próprio ZCheck já resolveu assim**.

**Agrupamento — regra: só a partir de 5 destinos.** Com 3 (`colaborador`), lista plana e a área inferior vira bloco de contexto não navegável (loja, data, % do dia).

```
OPERAÇÃO      → Executar · Painel
ANÁLISE       → Relatórios
PESSOAS       → Equipe · Meu ID
CONFIGURAÇÃO  → Gerenciar · Usuários   ← badge numérico = solicitações pendentes
```

O badge na sidebar **substitui o popup flutuante de solicitações** ([page.js:8932](../ibr-checklists-app/app/app/page.js)) — interrupção vira status permanente.

### Breakpoint: 1024px

Três argumentos convergentes:

1. **Geometria.** O layout mais exigente é o mestre-detalhe de Gerenciar: `sidebar 240 + gap 24 + lista 360 + gap 24 + editor 480 = 1128`. Com sidebar em rail (64px): 952. Abaixo de ~950 o mestre-detalhe não cabe e o drill-down mobile é a resposta certa. 1024 é o piso seguro.
2. **Dispositivo.** 1024 é iPad paisagem. Abaixo: tudo toque, onde alvo de 56px vence sidebar de mouse.
3. **Por que não 1280:** MacBook Air em janela não-maximizada e laptops de 1366×768 (comuns no varejo brasileiro) cairiam no layout mobile com 1366px de largura — o pior resultado possível.

**Faixas:** `<768` mobile intacto · `768–1023` cap sobe para 720px, `BottomNav` fica · `≥1024` sidebar entra, `BottomNav` sai · `≥1440` mais colunas (não fontes maiores).

### Layout por view

| View | Layout desktop | Por quê |
|---|---|---|
| **Executar** | Coluna única centrada, **máx. 640** | Tarefa sequencial com trava de ordem. Multi-coluna quebra a leitura em Z |
| **Painel** | Grid 12 col, máx. 1280 | `sectorComparison` já calcula para comparar — e entrega empilhado |
| **Relatórios** | **Filtro fixo 280 + resultado fluido** | Resolve o loop ver→ajustar→ver. Maior ganho isolado do estudo |
| **Gerenciar** | Mestre-detalhe 3 painéis | Editar 5 checklists deixa de custar 15 navegações |
| **Usuários** | Tabela densa + drawer | `Ticket` gasta ~90px por linha para 5 campos |
| **Equipe** | Grid 3–4 col + drawer de perfil | Hoje abrir uma pessoa **substitui a lista** |
| **Meu ID** | Coluna centrada, máx. 560 | É uma carteirinha. Funciona *porque* é estreito |

### Overlays

| Padrão | Componentes |
|---|---|
| **Modal centrado** (decisão curta) | `ConfirmModal` 1423 · reabrir tarefa 1747 · `PushPermissionModal` 5922 · `WelcomeScreen` 7009 |
| **Drawer direito** (a lista atrás não pode morrer) | `DailyBriefing` 7385 · perfil de colaborador 8133 · revisão de cadastro 5566 · `UserEditor` 5130 · `FolgasView` 5973 |
| **Página própria** (conteúdo denso) | `ImportCsvModal` 3762 — o preview é tabela, o pior conteúdo possível para uma gaveta |
| **Lightbox** | `PhotoModal` 1933 — é evidência, precisa ser lida |

---

## 5. Estratégia técnica

### O problema real, e por que a solução óbvia é a errada

`style={{}}` inline não aceita media query — verdade. Mas a conclusão usual ("então preciso de JS") é falsa: **inline aceita `var()`, e `var()` aceita media query.**

| Opção | Risco de regressão mobile | Veredito |
|---|---|---|
| `useMediaQuery` + estilos condicionais | **ALTO** — cada `isDesktop ? A : B` reescreve a linha que o mobile usa; e no App Router o primeiro render é sempre `false` (flash ou hydration mismatch) | Só onde o DOM muda de verdade |
| Migrar para classes Tailwind | **ALTO por componente** — metade das cores é dinâmica (`accent`, `${cfg.color}1A`) e não vira classe | Legítimo para componentes **novos**; proibido como técnica de migração |
| **CSS vars trocadas por media query** | **BAIXO** — em 390px a regra desktop **não existe** | ✅ **Recomendado** |
| Container queries | `container-type` cria contenção com efeito colateral em `position: sticky`, e o app tem sticky em 3 lugares | Fase tardia, não base |

### Recomendação: CSS-first em três camadas

**Camada 1 — Shell (CSS puro).** Container, grid da moldura, sidebar. ~70% do ganho visual, ~0% do risco. Toca `globals.css` e ~20 linhas do shell. Nenhum componente de conteúdo é aberto.

**Camada 2 — Densidade (CSS vars semânticas).** As ~12 raízes de view passam a consumir `var(--pad-view)`. O valor mobile de cada var **é exatamente o número que já está lá**.

```css
:root { --pad-view: 16px; --t-h1: 24px; /* … os números de hoje */ }
@media (min-width: 1024px) { :root { --pad-view: 32px; --t-h1: 28px; } }
```

**Camada 3 — Estrutura (JS cirúrgico).** Dois truques eliminam quase todo o JS:

- **Nav:** renderizar `SideNav` **e** `BottomNav` sempre; o CSS esconde uma. São 7 botões — custo de DOM nulo, zero JS.
- **Sheets:** bottom sheet vira modal mudando só `align-items` do overlay e `border-radius`/`max-width` do painel. Tudo CSS.

Sobra `useMediaQuery` para três casos onde a árvore React é genuinamente outra: `DataTable`, `SplitView` e as barras de ação fixas. Com implementação obrigatória:

```js
export function useMediaQuery(query) {
  return useSyncExternalStore(
    cb => { const m = matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => matchMedia(query).matches,
    () => false,  // servidor SEMPRE renderiza mobile
  );
}
```

O `getServerSnapshot = false` não é detalhe: sem JS, com JS quebrado, ou no primeiro paint, **o app é o app de hoje**.

### Dívida a extrair antes de qualquer tela

**9 barras e toasts ancorados na altura do `BottomNav`** via `calc(56px|64px|72px + env(safe-area-inset-bottom))` — linhas 1074, 1715, 3732, 5299, 5761, 6971, 8150, 8934, 8981. Quando a barra inferior sumir, todas deixam uma faixa morta. São constantes, não decisões: extrair para `LAYOUT.navHeight` é **pré-requisito**, não refino.

### Tokens novos

`S` (espaçamento base 4) · `BP` (768/1024/1280/1536) · `TD` (escala desktop) · `E` (elevação E0–E3) · `CT` (larguras: sheet 480, form 560, prose 720, app 1120, shell 1440) · `G` (grid; a receita `auto-fit/minmax(260px, 1fr)` é auto-responsiva e não precisa de media query) · `SV`/`TV` (strings `var()` para consumo no inline).

**Regra de camada:** primitivo é fixo (`S[4]` = 16px em qualquer tela); quem troca por media query é a var semântica (`--pad-view`).

---

## 6. Plano de migração

Cada fase é um PR. Ordenadas por risco crescente e valor decrescente.

| Fase | O que | Risco | Verificação |
|---|---|---|---|
| **0** | Baseline visual: Playwright em 14 estados × 3 viewports (390, 768, 1440) | zero | Rodar 2× no mesmo commit e obter diff 0. Se o baseline não é determinístico, o resto é cego |
| **1** | Tokens sem consumidor + vars em `globals.css` | **zero** | `git diff --stat app/app/page.js` deve ser **vazio** |
| **2** | **Shell desktop**: `AppShell` + `SideNav` + teto de container | **muito baixo** | Diff de screenshot **0px** em 390 e 768 — esperado, porque tudo está dentro de `@media (min-width: 1024px)` |
| **3** | Densidade por var nas ~12 raízes de view | baixo | Diff 0 em 390 |
| **4** | `Sheet` unificado — um por commit | médio | CSS mobile do `Sheet` reproduz literalmente os valores de hoje |
| **5** | Grids auto-fit nas listas hoje empilhadas | médio-baixo | Provar por aritmética antes de codar: 358px < 536px → 1 coluna no iPhone |
| **6** | `DataTable` + `SplitView` (Relatórios, Usuários) | **alto** | Desligar o JS no DevTools e confirmar que o caminho mobile renderiza inteiro |
| **7** | `Header` → topbar | **alto** | Matriz 4 papéis × {online/offline/sync} × {trial/pago} × {1/N lojas} |

**As fases 0–3 entregam a maior parte do "desktop premium" com risco de regressão mobile estruturalmente nulo** — porque toda a mudança vive dentro de media queries que a 390px não são avaliadas. Se o orçamento acabar na fase 3, o desktop já está resolvido.

### Portões válidos em todas as fases

1. **Diff visual** em 390 e 768. Fases 1–3: tolerância 0px.
2. **Lint de media query:** toda regra desktop nova em `globals.css` dentro de `@media (min-width: …)`. Um `grep` pega qualquer escorregão.
3. **Regra de revisão:** todo `isDesktop ?` no diff exige que o ramo `false` seja **cópia literal** do código anterior. Se o ramo mobile foi reescrito, mesmo que "equivalente", o commit está errado.
4. **Proibições permanentes:** não alterar `R`/`C`/`W`/`T` existentes; não mexer em `borderRadius` global; **nenhum `sed`/replace-all** — migração por componente (é o aviso de `tokens.js:57`, que já quebrou os cards uma vez).

### Fase 0.5 — barata e destrava tudo

**Roteamento por URL para as abas.** `tab` vira query param ou rota. Destrava duas janelas lado a lado — resolve o problema de comparação **sem redesenhar nada** — e conserta o botão voltar do navegador. É o melhor retorno por linha de código do estudo inteiro.

---

## 7. O que NÃO muda

O fluxo de execução é o ativo mais bem resolvido do produto. A tentação de "aproveitar a tela" é o maior risco deste projeto.

**Congelar:** `ExecutionScreen` inteiro (1452–1800) — `ItemRow`, bloqueio sequencial `isLocked`, foto obrigatória, barra de progresso, tela de celebração, `ConfirmModal` de críticos · `ExecutarView` (1801–1930), calibrado para uso de pé · `BottomNav` para colaborador (3 abas) · execução colaborativa em tempo real e trava de duplicidade · tokens `C`/`R`/`W`/`T` e os contrastes já medidos · login por PIN.

**O mínimo que muda no Executar:** cap de 640 centrado (não 480, magro para mouse; não 100%, o checkbox ficaria a 1000px do texto) · sidebar em rail por padrão nesta view · barra de ação em `bottom: 0` alinhada à coluna (**obrigatório**, senão sobra faixa morta) · atalhos de teclado como adição pura · hover e `focus-visible` (hoje inexistentes, porque não havia mouse).

**Explicitamente não fazer:** tabela de itens · duas colunas de itens · checklists lado a lado · densificar linha · reduzir alvos de toque.

---

## 8. Riscos de percepção

**"Empresa grande" não é mais largura.** Esticar os mesmos cards para 1400px produz linhas de 200 caracteres e mares de branco — lê como protótipo inacabado. **Se a revisão só mexer no `maxWidth`, ela piora a percepção que pretendia consertar.**

**Percepção de vigilância — o risco que ninguém antecipa.** O mesmo dado (nome, hora, %, `pts/h` individual) numa grade densa em tela cheia muda o registro emocional: de *acompanhamento* para *monitoramento*. Hoje a gamificação amortece isso; numa tabela fria, não. Risco concreto de rejeição do time de loja.

**Emoji carregando dado.** `'🏆 Perfeito'`, `'⭐ Excelente'`, `'📈 Regular'`, `'🔔'`. Num painel aberto numa reunião de diretoria, emoji como *status oficial* custa mais credibilidade que qualquer erro de layout. Trocar por rótulo textual + forma + cor semântica.

**shadcn no default.** `globals.css` já mapeia o tema e `tailwind.config.mjs` já registra `chart-1..5`. Montar uma grade de `<Card>` + `<Badge>` entrega o dashboard que todo mundo já viu. Nenhum componente shadcn entra sem passar por densidade, tipografia e escada de superfície daqui.

**Custo escondido:** a Central de Ajuda tem 27 artigos com prints do layout atual.

---

## 9. Decisões que precisam de aprovação

Nada de UI desktop avança antes destas seis:

1. **Duas cores novas** — `shell` #E8EFF5 e `inkMuted` #9FB8C8, com as regras de proibição do §3 (incluindo `success`/`warning` reprovando sobre `shell`).
2. **Carregar Inter de verdade** + registrar `fontFamily.display` no Tailwind + migrar os 231 `fontWeight: 800`. *Afeta o mobile* — é o único item do estudo que muda o celular de propósito, e muda para melhor.
3. **Breakpoint em 1024px**, com segundo passo de layout (não de fonte) em 1440.
4. **Largura do shell** — a única divergência entre os agentes: teto de 1440 com coluna de 1120, ou fluido com teto de 1600? Recomendo **1440/1120**, porque a conta fecha com 4 colunas exatas de 260px e evita que o olho percorra do filtro à esquerda até o número à direita.
5. **Corpo não cresce no desktop** (`body` fica em 15px). Densidade acima de conforto.
6. **Três inconsistências de sheet** que a unificação vai expor e cuja correção *muda o mobile*: dois raios diferentes (`20px` vs `16px`), dois sheets sem `env(safe-area-inset-bottom)` (5932, 6181 — no iPhone o botão fica sob a barra de gestos), e duas escalas de z-index brigando. **São bugs de mobile, não itens de desktop** — precisam de PR próprio, não podem entrar escondidos numa fase de layout.

---

## 10. Ordem recomendada

| # | Ação | Por quê |
|---|---|---|
| 0 | Rodar a query `device × role` | Barato, tira a suposição da mesa |
| 1 | **Carregar a fonte + `font-display` + matar o 800** | Maior impacto visual por linha de código, mobile e desktop |
| 2 | Roteamento por URL | Destrava duas janelas — resolve comparação sem redesenhar nada |
| 3 | Extrair `LAYOUT.navHeight` das 9 barras fixas | Pré-requisito de qualquer coisa que remova o `BottomNav` |
| 4 | Fases 0–2: baseline, tokens, shell + sidebar | ~70% do ganho percebido, risco estruturalmente nulo |
| 5 | Relatórios: filtro fixo + tabela densa | Maior dor, evidência mais dura (o `slice(0,20)`) |
| 6 | Gerenciar em mestre-detalhe | Segunda maior dor |
| 7 | CSV como página, não gaveta | Tarefa nativamente de desktop no lugar errado |

---

## 11. Estado da implementação (24/07/2026)

Implementado, revisado por agente de acessibilidade e por crítica adversarial,
e corrigido em cima dos achados das duas revisões.

### O que entrou

**Tipografia (afeta mobile de propósito — decisão §9.2 aprovada)**
- Inter carregada de verdade via `next/font` em `app/layout.js`, como **fonte
  variável** (um arquivo, faixa 100–900) — antes nenhuma fonte era carregada e o
  Windows renderizava Segoe UI.
- O `<style>` inline em `app/app/page.js` que forçava `system-ui` **e reimpunha
  `font-weight: 800`** foi removido. A classe não era morta — era nociva.
- `.font-display` passa a ser papel óptico real (`tabular-nums`). Sem tracking
  negativo: a classe é usada de 13 a 56px e em rótulos maiúsculos, onde apertar
  é errado. O tracking entra junto com a escala tipográfica, por elemento.
- **Peso normalizado em 348 pontos**: 231 `800`, 86 `700` literais e 11 `600`
  literais viraram `W.semibold` (600) ou `W.bold` (700), pela regra do próprio
  `tokens.js`. A segunda passada (nos `700` literais) foi necessária porque
  migrar só os 800 **inverteu hierarquias** — um banner de trial em 700 passava
  a pesar mais que "Sem conexão" em 600.

**Tokens** — `shell` #E8EFF5 e `inkMuted` #9FB8C8 (ambos com contraste medido e
regra de proibição), mais `BP`, `TD`, `S`, `E`, `CT`.

**Shell desktop (≥1024px, aditivo)**
- `components/SideNav.js` novo: rail de 240px em `ink`, agrupado (só onde o
  grupo tem 2+ itens), badge de pendências, bloco de contexto para papéis com
  poucos destinos. `NAV_ITEMS` virou fonte única das duas navegações.
- `.zc-root` / `.zc-main` / `.zc-content` / `.zc-view` em `globals.css`.
  `.zc-main` usa `display: contents` — some do layout no celular, por construção.
- Canvas `shell`, coluna com teto (1120px, 1440px acima de 1440), padding de
  view 16→32→40px, faixa do logo ZCheck oculta (o rail já o exibe).
- **As 9 barras fixas** deixaram de depender do número 56 e passam a ler
  `var(--zc-nav-h)`; overlays reancorados para não cobrir o rail; o popup de
  solicitações some no desktop, porque o badge do rail o substitui.

**Acessibilidade**
- `:focus-visible` com `!important` — necessário: **58 `outline: 'none'` inline**
  venciam a folha de estilo e nenhum campo de texto mostrava foco (WCAG 2.4.7).
  Escopado em `(min-width:1024px), (pointer:fine)` para não pintar contorno ao
  toque no iPhone.
- Cor do anel por variável (`--zc-focus`), verde sobre superfícies `ink`.
- Link "Pular para o conteúdo"; `role="group"` + `aria-labelledby` no rail;
  `aria-label`/`aria-current` na `BottomNav`, que não tinha nenhum dos dois.
- Contrastes reprovados corrigidos: "Sincronizando…" (2,11:1 → 5,02:1),
  `#6B8299` (3,98:1) → `C.muted`, `#C6842A` (2,95:1) → `C.warning`.

### O que NÃO entrou

- **Escala tipográfica desktop.** `TD` e as vars `--zc-t-*` existem e estão
  ligadas ao `:root`, mas **nenhum elemento do app as consome ainda** — o `h1`
  segue em 24px no desktop. Consumi-las exige tocar `fontSize` inline view a
  view, e isso não é verificável localmente (ver limitação abaixo).
- **Fases 4–7**: `Sheet` unificado, `DataTable`, `SplitView`, topbar. Consequência
  visível hoje: `.zc-content` capa só o `<main>` — o header e os banners seguem
  full-bleed, e em 1920px o cromo vai até a borda enquanto o conteúdo para antes.
  É esperado e some na fase 7.
- **Peso 800 em `/importar`, `/admin/*` e `/entrar`** — fora do escopo do app.
  Não quebra: a fonte variável cobre 800 nativamente.

### Limitação de verificação — importante

O login depende de PIN validado no servidor e os segredos são Sensitive (só
produção), então **não foi possível chegar às telas logadas em ambiente local**.
O que foi verificado: build limpo, todas as rotas públicas em 200, console sem
erros, e o shell em 1440px e 402px por rota temporária de verificação (já
removida), conferindo valor computado de cada variável nos dois viewports.

**O que falta verificar em produção:** Painel, Relatórios, Gerenciar, Usuários e
Equipe logados — em especial se a mudança de peso (800→600) enfraqueceu alguma
âncora visual em lista densa no celular. A fase 0 do plano (baseline Playwright
de 14 estados × 3 viewports) **não foi executada**; a garantia de "mobile não
mudou" aqui é estrutural (media query) mais inspeção de valor computado, não
diff de pixel.

Um bug real foi pego exatamente por essa lacuna e corrigido: duas barras
flutuantes que eram `64px` viraram `72px` no celular numa substituição em bloco.
As nove barras hoje batem com o original: 3 em +16px, 2 em +8px, 4 em +0.
