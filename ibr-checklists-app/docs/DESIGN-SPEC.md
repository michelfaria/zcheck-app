# ZCheck — Especificação de Design (portátil)

> Documento para **reproduzir o padrão visual do ZCheck em outro projeto**.
> Autossuficiente: copie os blocos de código e siga as regras de uso.
> Fonte da verdade no projeto original: `lib/tokens.js` + `app/globals.css`.
> Todos os contrastes abaixo foram **medidos** contra o pior fundo em uso
> (`#F7F9FB`), não estimados. WCAG AA: 4.5:1 para texto normal, 3:1 para
> controles e texto grande.

---

## 1. Identidade em uma linha

Interface **clara, densa e calma**: fundo azulado quase branco, um único azul
profundo como cor de marca e de texto, semânticos sóbrios (nada neon), cantos
moderados, hairlines discretas e hierarquia por **peso e tamanho — não por
gritaria de cor**. Fonte: **Inter** em tudo.

---

## 2. Paleta

### 2.1 Superfícies

| Token | Hex | Papel | Nota de contraste |
|---|---|---|---|
| `bg` | `#F7F9FB` | fundo de página (mobile e telas simples) | pior fundo em uso — meça tudo contra ele |
| `shell` | `#E8EFF5` | canvas do desktop (atrás dos cards) | degrau card↔canvas 1.16:1 — separa SEM sombra |
| branco | `#FFFFFF` | cards, modais, inputs | |
| `border` | `#E2EAF0` | hairline decorativa (divisores, contorno de card) | 1.22:1 — **nunca** como contorno de controle |
| `borderStrong` | `#7E93A3` | contorno de CONTROLE (input, select, botão outline) | 3.19:1 ✓ WCAG 1.4.11 |

**Regras de superfície**
- Sobre `shell` **não** use `border` (1.05:1 — invisível): o degrau de cor já é a separação.
- `shell` é canvas e cromo, **nunca fundo de texto de status**: `mutedLight`,
  `success` e `warning` REPROVAM AA sobre ele — badge de estado sobre shell
  precisa de fundo branco próprio.

### 2.2 Texto

| Token | Hex | Papel | Contraste sobre `bg` |
|---|---|---|---|
| `ink` | `#063C5C` | primário; também é a cor da marca e de botões sólidos | 11.00:1 |
| `inkHover` | `#0A4A70` | hover de superfícies ink | branco em cima segue AA |
| `muted` | `#5B6B78` | secundário | 5.21:1 |
| `mutedLight` | `#627382` | terciário (só 12–13px) | 4.63:1 |
| `inkMuted` | `#9FB8C8` | texto secundário SOBRE `ink` (nav escura) — só vale sobre ink | 5.62:1 sobre ink |

### 2.3 Semânticos

| Token | Hex | Papel | Notas |
|---|---|---|---|
| `success` | `#15803D` | concluído | 4.75:1 sobre bg · branco em cima 5.02:1 |
| `warning` | `#B45309` | atenção | 4.76:1 sobre bg |
| `critical` | `#B91C1C` | falha/perigo | 6.13:1 · branco em cima 6.47:1 |
| `successBright` | `#16A34A` | SÓ preenchimento grande/ícone (anéis, barras) — **nunca** texto pequeno nem fundo de texto branco (3.30:1) |
| `greenOnDark` | `#4ADE80` | texto verde sobre fundos `ink` (eyebrows de seção escura) — 6.66:1 sobre ink |

### 2.4 Paleta categórica de gráficos (multi-série)

Ordem **fixa, nunca ciclada** — validada para daltonismo (CVD ΔE ≥ 21) e
contraste ≥3:1 sobre `#F7F9FB`:

```
#2563EB  #0D9488  #B45309  #7C3AED  #DB2777
```

Gráfico de série única: use `ink` (linha 2px + fill `ink` a 8% de opacidade).
Escalas sequenciais (heatmap, coorte): `rgba(6,60,92, 0.06→0.78)` — alpha da
tinta, um matiz só.

---

## 3. Tipografia

**Família:** Inter (Google Fonts), fallback `-apple-system, BlinkMacSystemFont,
system-ui, sans-serif`.

**Pesos** — regra anti-gritaria: *400 corpo · 500 ênfase · 600 títulos, botões
e labels · 700 só display e números-herói. Nada de 800.*

**Escala (px)** — piso de legibilidade: nenhum CONTEÚDO abaixo de 14; 13 é o
mínimo de texto secundário; 12 só em rótulo maiúsculo curto.

| Token | Mobile | Desktop (≥1024) |
|---|---|---|
| display | 26 | 34 |
| h1 | 24 | 28 |
| h2 | 20 | 22 |
| h3 | 17 | 18 |
| bodyLg | 16 | 16 |
| body | 15 | 15 |
| bodySm | 14 | 14 |
| caption | 13 | 13 |
| label | 12 | 12 |

No desktop **só a metade de cima cresce** — corpo maior não é "mais premium",
é menos densidade; o que quebra em tela larga é a hierarquia dos títulos.

Rótulos de seção (o "eyebrow" recorrente): 11–13px · peso 600–700 ·
`text-transform: uppercase` · `letter-spacing: 0.04–0.08em` · cor `muted`.

---

## 4. Geometria

**Raio (`R`)** — quatro valores, escolhidos pelo papel do elemento (nunca
migrar por busca-e-troca global):

| Token | px | Uso |
|---|---|---|
| sm | 8 | inputs, chips, botões |
| md | 12 | cards, modais |
| lg | 16 | superfícies grandes, sheets |
| pill | 999 | badges, toggles |

**Espaçamento (`S`)** — base 4 (igual ao Tailwind: `p-4` = `S[4]` = 16px):

```
0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

**Elevação (`E`)** — sombra COLORIDA com o azul da tinta (`rgba(8,20,30,…)`),
nunca preto puro (preto sobre fundo azulado lê como sujeira). Sempre duas
camadas: contato curto + ambiente longo:

| Nível | Valor | Uso |
|---|---|---|
| 0 | `none` | mobile: card é só `1px solid border` |
| 1 | `0 1px 2px rgba(8,20,30,0.06)` | card em repouso — **desktop-only** |
| 2 | `0 1px 2px rgba(8,20,30,0.06), 0 8px 24px -8px rgba(8,20,30,0.18)` | dropdown, popover, hover |
| 3 | `0 1px 2px rgba(8,20,30,0.06), 0 16px 40px -16px rgba(8,20,30,0.22)` | modal, drawer |

**Breakpoints e contêineres**

| | px | |
|---|---|---|
| tablet | 768 | contêiner ganha teto |
| desktop | 1024 | nav lateral entra; canvas vira `shell` |
| wide | 1280 | mestre-detalhe completo |

Larguras máximas: sheet/overlay `480` · formulário `560` · execução `640` ·
prosa `720` · conteúdo do app `1120` · moldura `1440`.
Padding de view: 16px mobile → 32px desktop.

Regra de camada: **primitivo é fixo, semântico é que troca** — `S[4]` é 16px em
qualquer tela; quem varia com o breakpoint é a variável semântica
(`--pad-view`, `--canvas`), nunca o primitivo.

---

## 5. Receitas de componentes

**Botão primário** — fundo `ink`, texto branco, peso 600–700, raio 8,
padding `~9px 16px`; hover `inkHover`; desabilitado: fundo `mutedLight`.

**Botão secundário/outline** — fundo transparente ou branco, `1px solid
borderStrong`, texto `ink` 600, raio 8.

**Botão destrutivo** — outline `critical` com texto `critical`; sólido
`critical` + branco apenas na confirmação final.

**Card** — branco, `1px solid border`, raio 12, padding 16; desktop pode
adicionar `E[1]`. Título de card = eyebrow (seção 3).

**Input/Select/Textarea** — branco, `1.5px solid borderStrong`, raio 8, texto
`ink` 13–15px, padding `~10px 12px`, `outline: none` com foco trocando a borda
para `ink`. Label acima no padrão eyebrow.

**Chip/Badge de estado** — raio 4–6 (retangular) ou pill; 10–11px, peso
700–800*, maiúsculas; fundo na cor semântica com texto branco (`success`,
`warning`, `critical`, `ink`) — ou outline + texto colorido para intensidade
menor. Sobre `shell`, sempre com fundo branco por trás.
(*exceção consciente à regra "nada de 800": só em micro-rótulos de chip.)

**Ponto de saúde** — círculo 8px: `success` <24h · `warning` 24–72h ·
`critical` >72h · `mutedLight` sem uso. Sempre acompanhado de texto quando o
significado importa (nunca cor sozinha).

**Tabela densa** — cabeçalho eyebrow (11px, `muted`, maiúsculo), células 13px
`ink`, divisor `1px solid border` por linha, números alinhados à direita,
primeira coluna à esquerda; contêiner com `overflow-x: auto` próprio.

**KPI/stat** — rótulo eyebrow em cima, número 26px peso 700 `ink`, sublinha
12px `mutedLight`.

**Barra de progresso** — trilho `bg` raio pill 6px de altura; preenchimento
`ink` (ou `success` quando ≥100%).

**Feed/lista de eventos** — linhas com `border-bottom: 1px solid border`,
tempo relativo 12px `mutedLight` à esquerda ou direita, ator em 600.

---

## 6. Gráficos (resumo das regras)

- Série única = `ink`; multi-série = paleta categórica da seção 2.4, em ordem
  fixa; a cor segue a ENTIDADE, não o rank.
- Linhas 2px, sem pontos (activeDot 4px no hover), grid horizontal `border`,
  eixos sem linha de tick, ticks 11px `mutedLight`.
- Um eixo Y só. Nunca dual-axis.
- Tooltip: card branco, borda `border`, raio 8, sombra nível 2; texto em
  tokens de texto (a cor da série aparece só no quadradinho 8px).
- Funil horizontal: barras `ink` raio `[0,4,4,0]`, valor no fim da barra.
- Heatmap/coorte: alpha de `ink` proporcional ao valor; texto vira branco
  quando alpha > ~0.55.

---

## 7. Blocos prontos para copiar

### CSS custom properties

```css
:root {
  /* superfícies */
  --bg: #F7F9FB;
  --shell: #E8EFF5;
  --border: #E2EAF0;
  --border-strong: #7E93A3;
  /* texto */
  --ink: #063C5C;
  --ink-hover: #0A4A70;
  --ink-muted: #9FB8C8;   /* só sobre ink */
  --muted: #5B6B78;
  --muted-light: #627382;
  /* semânticos */
  --success: #15803D;
  --success-bright: #16A34A; /* só fill grande/ícone */
  --green-on-dark: #4ADE80;  /* só sobre ink */
  --warning: #B45309;
  --critical: #B91C1C;
  /* sombra (azul da tinta, 2 camadas) */
  --e1: 0 1px 2px rgba(8,20,30,0.06);
  --e2: 0 1px 2px rgba(8,20,30,0.06), 0 8px 24px -8px rgba(8,20,30,0.18);
  --e3: 0 1px 2px rgba(8,20,30,0.06), 0 16px 40px -16px rgba(8,20,30,0.22);
}
body { background: var(--bg); color: var(--ink);
       font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
```

### Tokens JS (drop-in)

```js
export const C = {
  bg:'#F7F9FB', shell:'#E8EFF5', border:'#E2EAF0', borderStrong:'#7E93A3',
  ink:'#063C5C', inkHover:'#0A4A70', inkMuted:'#9FB8C8',
  muted:'#5B6B78', mutedLight:'#627382', pending:'#5B6B78',
  success:'#15803D', warning:'#B45309', critical:'#B91C1C',
};
export const successBright = '#16A34A';
export const greenOnDark = '#4ADE80';
export const R = { sm:8, md:12, lg:16, pill:999 };
export const W = { body:400, medium:500, semibold:600, bold:700 };
export const T  = { display:26, h1:24, h2:20, h3:17, bodyLg:16, body:15, bodySm:14, caption:13, label:12 };
export const TD = { display:34, h1:28, h2:22, h3:18, bodyLg:16, body:15, bodySm:14, caption:13, label:12 };
export const S = { 0:0, 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40, 12:48, 16:64 };
export const BP = { tablet:768, desktop:1024, wide:1280 };
export const CT = { exec:640, sheet:480, form:560, prose:720, app:1120, shell:1440 };
export const SERIES = ['#2563EB', '#0D9488', '#B45309', '#7C3AED', '#DB2777'];
```

### Tailwind (extend)

```js
// tailwind.config — theme.extend
colors: {
  bg:'#F7F9FB', shell:'#E8EFF5', ink:{ DEFAULT:'#063C5C', hover:'#0A4A70', muted:'#9FB8C8' },
  muted:{ DEFAULT:'#5B6B78', light:'#627382' },
  line:{ DEFAULT:'#E2EAF0', strong:'#7E93A3' },
  success:'#15803D', warning:'#B45309', critical:'#B91C1C',
},
borderRadius: { sm:'8px', md:'12px', lg:'16px' },
boxShadow: {
  e1:'0 1px 2px rgba(8,20,30,0.06)',
  e2:'0 1px 2px rgba(8,20,30,0.06), 0 8px 24px -8px rgba(8,20,30,0.18)',
  e3:'0 1px 2px rgba(8,20,30,0.06), 0 16px 40px -16px rgba(8,20,30,0.22)',
},
fontFamily: { sans:['Inter','-apple-system','BlinkMacSystemFont','system-ui','sans-serif'] },
```

---

## 8. O que NÃO fazer (aprendizados pagos)

1. **Nunca** trocar `borderRadius` por busca-e-troca global — o raio é por
   papel do elemento; uma substituição cega já quebrou um layout inteiro.
2. **Nunca** usar `border` (#E2EAF0) como contorno de controle — reprova
   WCAG 1.4.11; controle é `borderStrong`.
3. **Nunca** texto de status (`success`/`warning`/`mutedLight`) direto sobre
   `shell` — reprova AA; dê fundo branco ao badge.
4. **Nunca** sombra preta pura — sempre o azul `rgba(8,20,30,…)` em 2 camadas.
5. **Nunca** peso 800 em texto corrente; 700 é o teto (display e números).
6. **Nunca** conteúdo abaixo de 14px (13 = caption, 12 = só rótulo maiúsculo).
7. Ao mudar qualquer cor: **medir o contraste de novo** contra `#F7F9FB`
   (e contra `shell`/`ink` quando aplicável) — não confiar no olho.
8. Cor nunca é o único portador de significado — chip/ponto sempre com texto.
```
