/**
 * Componentes de apresentação da Central de Ajuda (Server Components).
 * Breadcrumb e renderização do markdown do artigo com os tokens do produto.
 */

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { C } from '../../lib/tokens';

export function Breadcrumb({ items }) {
  return (
    <nav aria-label="Você está em" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ color: C.mutedLight }}>/</span>}
          {it.href
            ? <Link href={it.href} style={{ color: C.muted, textDecoration: 'none', fontWeight: 500 }}>{it.label}</Link>
            : <span style={{ color: C.ink, fontWeight: 500 }}>{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

// Callouts por convenção no markdown: blockquote iniciando com 💡 (dica),
// ⚠️ (atenção) ou ℹ️ (nota). Qualquer outro blockquote fica neutro.
function calloutKind(children) {
  const text = extractText(children);
  if (text.startsWith('💡')) return { border: '#15803D', bg: '#F0F7F2' };
  if (text.startsWith('⚠️') || text.startsWith('⚠')) return { border: '#B45309', bg: '#FBF3EA' };
  if (text.startsWith('ℹ️') || text.startsWith('ℹ')) return { border: C.ink, bg: '#EDF3F7' };
  return { border: C.border, bg: 'white' };
}

function extractText(node) {
  if (typeof node === 'string') return node.trim();
  if (Array.isArray(node)) return node.map(extractText).join('').trim();
  if (node?.props?.children) return extractText(node.props.children);
  return '';
}

const mdComponents = {
  h1: ({ children }) => <h2 style={{ fontSize: 20, fontWeight: 600, color: C.ink, margin: '28px 0 10px' }}>{children}</h2>,
  h2: ({ children }) => <h2 style={{ fontSize: 20, fontWeight: 600, color: C.ink, margin: '28px 0 10px' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: 17, fontWeight: 600, color: C.ink, margin: '22px 0 8px' }}>{children}</h3>,
  p: ({ children }) => <p style={{ fontSize: 15, color: C.ink, lineHeight: 1.7, margin: '12px 0' }}>{children}</p>,
  // listStyle explícito: o preflight do Tailwind (globals.css) zera o padrão.
  ol: ({ children }) => <ol style={{ listStyle: 'decimal', paddingLeft: 24, margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</ol>,
  ul: ({ children }) => <ul style={{ listStyle: 'disc', paddingLeft: 24, margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</ul>,
  li: ({ children }) => <li style={{ fontSize: 15, color: C.ink, lineHeight: 1.6 }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 600, color: C.ink }}>{children}</strong>,
  a: ({ href, children }) => <a href={href} style={{ color: C.ink, fontWeight: 600, textDecorationColor: C.mutedLight }}>{children}</a>,
  img: ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt || ''} loading="lazy"
      style={{ maxWidth: '100%', borderRadius: 12, border: `1px solid ${C.border}`, margin: '8px 0', display: 'block' }} />
  ),
  code: ({ children }) => (
    <code style={{ fontSize: 13.5, background: '#EDF3F7', color: C.ink, padding: '2px 6px', borderRadius: 6 }}>{children}</code>
  ),
  blockquote: ({ children }) => {
    const kind = calloutKind(children);
    return (
      <blockquote style={{ margin: '16px 0', padding: '4px 16px', background: kind.bg, borderLeft: `3px solid ${kind.border}`, borderRadius: '0 10px 10px 0' }}>
        {children}
      </blockquote>
    );
  },
  hr: () => <hr style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '24px 0' }} />,
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '12px 0' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 14, minWidth: 320 }}>{children}</table>
    </div>
  ),
  th: ({ children }) => <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: `2px solid ${C.border}`, color: C.ink, fontWeight: 600 }}>{children}</th>,
  td: ({ children }) => <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, color: C.ink }}>{children}</td>,
};

export function ArticleBody({ markdown }) {
  // Comentários HTML (ex.: <!-- TODO: screenshot -->) são marcações internas de
  // produção — react-markdown os mostraria como texto, então saem antes.
  const clean = markdown.replace(/<!--[\s\S]*?-->/g, '');
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{clean}</ReactMarkdown>;
}
