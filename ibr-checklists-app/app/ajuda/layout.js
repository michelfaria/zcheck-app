import Link from 'next/link';
import { C } from '../../lib/tokens';
import { BRAND } from '../../lib/brand';

export const metadata = {
  title: {
    default: `Central de Ajuda · ${BRAND.name}`,
    template: `%s · Central de Ajuda ${BRAND.name}`,
  },
  description: `Central de Ajuda do ${BRAND.name}: aprenda a acessar, executar checklists, gerenciar sua operação e resolver problemas comuns.`,
};

export default function AjudaLayout({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: 'white', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Link href="/ajuda" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <img src="/zcheck-logo.png" alt="ZCheck" style={{ height: 28, width: 'auto', display: 'block' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.muted, borderLeft: `1px solid ${C.border}`, paddingLeft: 10, whiteSpace: 'nowrap' }}>
              Ajuda
            </span>
          </Link>
          <a href="/app" style={{ fontSize: 13, fontWeight: 600, color: C.ink, textDecoration: 'none', padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${C.border}`, background: 'white', whiteSpace: 'nowrap' }}>
            Voltar ao app
          </a>
        </div>
      </header>

      <main style={{ flex: 1 }}>{children}</main>

      {/* Rodapé — canal de suporte: assistente de IA */}
      <footer style={{ background: 'white', borderTop: `1px solid ${C.border}`, marginTop: 48 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>Não encontrou o que procurava?</p>
          <p style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>
            Converse com o assistente do {BRAND.name} — ele conhece todos os artigos desta central.
          </p>
          <Link href="/ajuda/assistente" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'white', background: C.ink, padding: '12px 24px', borderRadius: 10, textDecoration: 'none' }}>
            💬 Falar com o assistente
          </Link>
          <p style={{ fontSize: 12, color: C.mutedLight, marginTop: 28 }}>
            © {BRAND.year} {BRAND.name} · {BRAND.tagline}
          </p>
        </div>
      </footer>
    </div>
  );
}
