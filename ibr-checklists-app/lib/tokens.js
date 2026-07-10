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
 * ⚠️ ESTES VALORES REPROVAM. Cinco cores de texto estão abaixo de 4.5:1 hoje.
 * Este arquivo é a Fase 0: pura indireção, nenhum pixel muda. A Fase 1 troca
 * os valores num lugar só, e está anotada aqui embaixo.
 */

export const C = {
  // Superfícies
  bg: '#F7F9FB',          // fundo da página
  border: '#E2EAF0',      // hairline

  // Texto
  ink: '#063C5C',         // primário    — 11.00:1 sobre bg · ok
  muted: '#6B8299',       // secundário  —  3.77:1 sobre bg · REPROVA → #5B6B78
  mutedLight: '#A8BCC8',  // terciário   —  1.86:1 sobre bg · REPROVA → #627382
  pending: '#6B8299',     // neutro; historicamente igual a muted

  // Semânticos
  success: '#31C85A',     // concluído   —  2.09:1 sobre bg · REPROVA → #15803D
  critical: '#D1462F',    // falha       —  4.30:1 sobre bg · REPROVA → #B91C1C
};

/**
 * Âmbar de atenção. Hoje vive como hex solto (#F5A623) em 8 lugares de
 * app/app/page.js. Como texto dá 1.92:1 sobre `bg` — reprova. Fase 1: #B45309.
 */
export const warning = '#F5A623';
