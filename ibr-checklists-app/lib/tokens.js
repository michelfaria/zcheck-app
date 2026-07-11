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
  border: '#E2EAF0',      // hairline

  // Texto
  ink: '#063C5C',         // primário    — 11.00:1 sobre bg
  muted: '#5B6B78',       // secundário  —  5.21:1 sobre bg
  mutedLight: '#627382',  // terciário   —  4.63:1 sobre bg
  pending: '#5B6B78',     // neutro; historicamente igual a muted

  // Semânticos
  success: '#15803D',     // concluído   —  4.75:1 sobre bg · branco em cima 5.02:1
  warning: '#B45309',     // atenção     —  4.76:1 sobre bg
  critical: '#B91C1C',    // falha       —  6.13:1 sobre bg · branco em cima 6.47:1
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
