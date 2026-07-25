/**
 * ZCheck — tokens de cor. Fonte única.
 *
 * Cada superfície tinha a sua cópia deste objeto (app, cadastro, onboarding,
 * importar, termos, privacidade) e a landing usa hex soltos. Mudar uma cor
 * exigia caçar seis arquivos. Agora não.
 *
 * Os mesmos valores existem como CSS custom properties em `app/globals.css`,
 * para o CSS alcançá-los sem importar JS.
 *
 * ── Contraste ──────────────────────────────────────────────────────────────
 * O pior fundo em uso é `bg` (#F7F9FB), não branco: cards brancos são mais
 * generosos. Ao mexer nestes valores, MEÇA contra `bg` — não confie no olho.
 * WCAG AA pede 4.5:1 para texto normal.
 *
 * `mutedLight` quase encosta em `muted` porque é usado em texto de 9–12px, e
 * nesse tamanho a régua é 4.5:1. A hierarquia de cor volta a respirar quando a
 * escala tipográfica subir (nada de conteúdo abaixo de 14px).
 */

export const C = {
  // Superfícies
  bg: '#F7F9FB',          // fundo da página
  border: '#E2EAF0',      // hairline (decorativo; 1.22:1 sobre branco)
  borderStrong: '#7E93A3',// contorno de CONTROLE — 3.19:1 sobre branco (WCAG 1.4.11)

  // Texto
  ink: '#063C5C',         // primário    — 11.00:1 sobre bg
  inkHover: '#0A4A70',    // hover de superfícies ink (botões) — mais claro que ink, branco em cima segue AA
  muted: '#5B6B78',       // secundário  —  5.21:1 sobre bg
  mutedLight: '#627382',  // terciário   —  4.63:1 sobre bg
  pending: '#5B6B78',     // neutro; historicamente igual a muted

  // Semânticos
  success: '#15803D',     // concluído   —  4.75:1 sobre bg · branco em cima 5.02:1
  warning: '#B45309',     // atenção     —  4.76:1 sobre bg
  critical: '#B91C1C',    // falha       —  6.13:1 sobre bg · branco em cima 6.47:1

  // ── Desktop (>= BP.desktop) ────────────────────────────────────────────────
  /**
   * Canvas do desktop. Existe porque o degrau entre `bg` e o card branco é de
   * 1.06:1 — some numa tela de 1440px com 20 cards. Sobre `shell` o card dá
   * 1.16:1, e a separação passa a existir SEM sombra.
   *
   * ⚠️ `shell` é CANVAS E CROMO, nunca fundo de texto de status. Medido:
   *      ink 10.01:1 ✓ · muted 4.74:1 ✓ · critical 5.58:1 ✓
   *      mutedLight 4.21:1 ✗ · success 4.32:1 ✗ · warning 4.33:1 ✗
   * As três últimas REPROVAM AA aqui. Badge de estado sobre shell precisa de
   * fundo branco próprio.
   *
   * ⚠️ Sobre `shell` não se usa `border` (1.05:1 — invisível). O degrau de
   * superfície já É a separação.
   */
  shell: '#E8EFF5',
  /**
   * Texto secundário sobre superfície `ink` (o rail de navegação do desktop).
   * 5.62:1 sobre ink ✓ — `muted` ali daria 2.11:1 e reprova.
   * Só vale sobre ink: sobre branco dá 2.07:1.
   */
  inkMuted: '#9FB8C8',
};

/**
 * Verde vivo, para preenchimento grande e ícone — NUNCA para texto pequeno nem
 * como fundo de texto branco (3.30:1). Anéis de progresso, barras, ícones.
 */
export const successBright = '#16A34A';

/**
 * Verde para TEXTO sobre fundos escuros (ink): 6.66:1 medido sobre #063C5C.
 * O successBright dá só 3.52:1 nesse fundo — reprova até para texto grande
 * apertado. Usar em eyebrows/labels de seções escuras.
 */
export const greenOnDark = '#4ADE80';

/**
 * Raio de borda. O app tinha 13 valores distintos (0, 2, 3, 4, 6, 8, 9, 10,
 * 12, 14, 16, 20, 999) — sensação de "montado", não desenhado. Quatro bastam.
 *
 * ⚠️ NUNCA migrar por busca-e-troca global: o raio é inline por elemento e uma
 * substituição cega já quebrou o layout dos cards uma vez (ver CLAUDE.md).
 * Migre por COMPONENTE, escolhendo o token pelo papel do elemento.
 */
export const R = {
  sm: 8,     // inputs, chips, botões
  md: 12,    // cards, modais
  lg: 16,    // superfícies grandes, sheets
  pill: 999, // badges, toggles
};

/**
 * Peso tipográfico. O app usava 800 em 197 lugares — quando tudo grita, nada
 * tem hierarquia. Regra: 400 corpo · 500 ênfase · 600 títulos, botões e labels
 * · 700 só display e números-herói. Nada de 800.
 */
export const W = {
  body: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

/**
 * Escala de tamanho. Piso de legibilidade para chão de operação: nenhum
 * CONTEÚDO abaixo de 14px; 12px só em rótulo maiúsculo curto (label), 13px o
 * mínimo para texto secundário (caption).
 */
export const T = {
  display: 26,
  h1: 24,
  h2: 20,
  h3: 17,
  bodyLg: 16,
  body: 15,
  bodySm: 14,
  caption: 13,
  label: 12,
};

/**
 * ── Camada desktop ──────────────────────────────────────────────────────────
 *
 * REGRA QUE GOVERNA TUDO ABAIXO: o mobile é o default imutável, o desktop é
 * ADITIVO. Toda regra desktop vive dentro de `@media (min-width: 1024px)` em
 * globals.css. A 390px esse bloco não é avaliado — a preservação do celular é
 * propriedade da linguagem, não promessa de quem escreveu.
 *
 * REGRA DE CAMADA: primitivo é FIXO, semântico é que troca. `S[4]` são 16px em
 * qualquer tela, sempre; quem vale 16 no celular e 32 no desktop é a var
 * `--pad-view`. Sem isso, `S[4]` viraria um número que muda de valor conforme a
 * tela e ninguém mais conseguiria raciocinar sobre espaçamento.
 */

/**
 * Breakpoints. Nomes SEMÂNTICOS de propósito: `sm`/`md`/`lg` já significam
 * 640/768/1024 nas classes do Tailwind, e um `BP.sm` diferente do `sm:` seria
 * armadilha permanente num arquivo que usa as duas sintaxes.
 *
 * 768 não foi escolhido agora — globals.css já usa `@media (max-width: 767px)`
 * no fix de zoom do iOS. É a fronteira de facto do projeto.
 *
 * A troca de shell fica em 1024, não em 768, por geometria: o mestre-detalhe
 * de Gerenciar pede `240 nav + 24 + 360 lista + 24 + 480 editor = 1128`, e com
 * o nav em rail (64px) ainda são 952. Abaixo disso nenhum layout de duas
 * colunas fecha a conta. E 1024 é iPad em paisagem: abaixo é tudo toque, onde
 * a barra inferior vence a lateral. 1280 seria tarde demais — deixaria laptop
 * de 1366px no layout de celular.
 */
export const BP = {
  tablet: 768,    // container ganha teto
  desktop: 1024,  // nav lateral entra, barra inferior sai
  wide: 1280,     // mestre-detalhe, tabela com todas as colunas
};

/**
 * Escala tipográfica do desktop. Só a METADE DE CIMA cresce.
 *
 * Corpo maior não é "mais premium" — é menos densidade. Quem lê o corpo lê o
 * mesmo dado no celular e no computador, e a 60cm de distância 15px resolve. O
 * que quebra no desktop é a HIERARQUIA: um h1 de 24px ao lado de uma coluna de
 * 1120px não lê como título de página.
 *
 * `caption` e `label` ficam INALTERADOS — 13 e 12 são o piso decidido no bloco
 * do `T`, e o contraste do `mutedLight` foi medido nessa faixa. Mexer aqui
 * obrigaria a remedir tudo sem ganho.
 */
export const TD = {
  display: 34,
  h1: 28,
  h2: 22,
  h3: 18,
  bodyLg: 16,
  body: 15,
  bodySm: 14,
  caption: 13,
  label: 12,
};

/**
 * Espaçamento. O app usa hoje 14 valores de padding de container
 * (2,4,6,7,8,10,12,13,14,16,18,20,24,28) com três escalas concorrentes: o `p-4`
 * do Tailwind, o `14` inline e os 12/18/20 avulsos.
 *
 * Base 4 porque é onde o app já gravita (8/12/16 são os mais frequentes) e
 * porque a escala do Tailwind também é base 4 — assim `p-4` e `S[4]` são a
 * MESMA medida, e conviver com as duas sintaxes deixa de ser risco.
 *
 * Passos numéricos, não camisetas: estes valores entram em `calc()` junto de
 * `env(safe-area-inset-bottom)`, e ali nome de camiseta não ajuda a somar.
 */
export const S = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 };

/**
 * Elevação. O app tem ~12 `boxShadow` inline com 11 valores distintos para o
 * que são quatro alturas. Duas decisões:
 *
 * 1. Sombra COLORIDA com o azul da tinta (8,20,30), não preto. Preto puro sobre
 *    fundo azulado lê como sujeira cinza — é por isso que os modais pareciam
 *    "sujos" contra o `bg`.
 * 2. DUAS camadas: contato curto + ambiente longo. Blur único e grande (o
 *    padrão de hoje, `0 8px 40px`) lê como halo, não como altura.
 *
 * E[3] é literalmente a sombra que a landing já usa em `.lp-hero-card` — não é
 * invenção, é promoção a token do que já existe e está certo.
 *
 * ⚠️ E[1] é DESKTOP-ONLY. No celular o card é `border: 1px solid C.border` e
 * mais nada (ver Ticket). Aplicar E[1] sem media query MUDA o mobile.
 */
export const E = {
  0: 'none',
  1: '0 1px 2px rgba(8,20,30,0.06)',                                        // card em repouso — só >= BP.desktop
  2: '0 1px 2px rgba(8,20,30,0.06), 0 8px 24px -8px rgba(8,20,30,0.18)',    // dropdown, popover, hover
  3: '0 1px 2px rgba(8,20,30,0.06), 0 16px 40px -16px rgba(8,20,30,0.22)',  // modal, drawer
};

/**
 * Larguras máximas.
 *
 * `sheet: 480` não é escolha nova — é o valor que 5 dos 7 overlays do app já
 * usam. O token só nomeia o consenso.
 *
 * `app: 1120` sai da conta do shell: 1440 de moldura − 240 de nav − 80 de
 * goteiras. E 1120 divide limpo em 2/3/4 colunas com gap de 24.
 *
 * `exec: 640` é o Executar no desktop: 480 é magro para mouse, e 100% deixaria
 * o checkbox a 1000px do texto.
 */
export const CT = { exec: 640, sheet: 480, form: 560, prose: 720, app: 1120, shell: 1440 };
