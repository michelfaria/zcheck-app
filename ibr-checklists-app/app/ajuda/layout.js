import Link from 'next/link';
import { headers } from 'next/headers';
import { C } from '../../lib/tokens';
import { BRAND } from '../../lib/brand';

export const metadata = {
  title: {
    default: `Central de Ajuda · ${BRAND.name}`,
    template: `%s · Central de Ajuda ${BRAND.name}`,
  },
  description: `Central de Ajuda do ${BRAND.name}: aprenda a acessar, executar checklists, gerenciar sua operação e resolver problemas comuns.`,
};

export default async function AjudaLayout({ children }) {
  // No subdomínio de um cliente, "voltar ao app" vai para o app daquele tenant.
  // No domínio principal (zcheckapp.com) não existe tenant — /app cairia numa
  // empresa arbitrária —, então o caminho certo é a página de código (/entrar).
  const host = (await headers()).get('host') || '';
  const sub = host.endsWith('.zcheckapp.com') ? host.replace('.zcheckapp.com', '') : '';
  const isTenant = !!sub && sub !== 'www';
  const appHref = isTenant ? '/app' : '/entrar';
  const appLabel = isTenant ? 'Voltar ao app' : 'Acessar o app';
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: "'Inter', system-ui, sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: 'white', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 16px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Logo → página inicial do site; "Ajuda" → home da central. */}
            <a href="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }} aria-label="Página inicial do ZCheck">
              <img src="/zcheck-logo.png" alt="ZCheck" style={{ height: 28, width: 'auto', display: 'block' }} />
            </a>
            <Link href="/ajuda" style={{ fontSize: 13, fontWeight: 600, color: C.muted, borderLeft: `1px solid ${C.border}`, paddingLeft: 10, whiteSpace: 'nowrap', textDecoration: 'none' }}>
              Ajuda
            </Link>
          </div>
          <a href={appHref} style={{ fontSize: 13, fontWeight: 600, color: C.ink, textDecoration: 'none', padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${C.border}`, background: 'white', whiteSpace: 'nowrap' }}>
            {appLabel}
          </a>
        </div>
      </header>

      <main style={{ flex: 1 }}>{children}</main>

      {/* Rodapé — canal de suporte: assistente de IA */}
      <footer style={{ background: 'white', borderTop: `1px solid ${C.border}`, marginTop: 48 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>Não encontrou o que procurava?</p>
          <p style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>
            Pergunte ao Zeca, o assistente do {BRAND.name} — ele conhece todos os artigos desta central e vai direto ao ponto.
          </p>
          <Link href="/ajuda/assistente" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'white', background: C.ink, padding: '12px 24px', borderRadius: 10, textDecoration: 'none' }}>
            💬 Falar com o Zeca
          </Link>
          <p style={{ fontSize: 12, color: C.mutedLight, marginTop: 28 }}>
            © {BRAND.year} {BRAND.name} · {BRAND.tagline}
          </p>
        </div>
      </footer>
    </div>
  );
}
