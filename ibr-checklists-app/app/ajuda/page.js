import Link from 'next/link';
import { Rocket, ClipboardCheck, Settings2, KeyRound, LifeBuoy, FileText, ChevronRight } from 'lucide-react';
import { C } from '../../lib/tokens';
import { CATEGORIES, getArticles, getFeaturedArticles } from '../../lib/ajuda';
import { SearchBox } from './ui';

const ICONS = { Rocket, ClipboardCheck, Settings2, KeyRound, LifeBuoy };

export const metadata = {
  title: 'Como podemos ajudar?',
  alternates: { canonical: 'https://zcheckapp.com/ajuda' },
};

export default function AjudaHome() {
  const featured = getFeaturedArticles();
  const cats = CATEGORIES.map(c => ({ ...c, count: getArticles(c.slug).length }));

  return (
    <div>
      {/* Hero com busca */}
      <section style={{ background: 'white', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 16px 40px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.ink, marginBottom: 8 }}>Como podemos ajudar?</h1>
          <p style={{ fontSize: 15, color: C.muted, marginBottom: 24 }}>
            Guias rápidos para usar o ZCheck no dia a dia da sua loja.
          </p>
          <SearchBox />
        </div>
      </section>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 16px 0' }}>
        {/* Grade de categorias */}
        <section aria-label="Categorias">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {cats.map(cat => {
              const Icon = ICONS[cat.icon] || FileText;
              return (
                <Link key={cat.slug} href={`/ajuda/${cat.slug}`} style={{ textDecoration: 'none' }}>
                  <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#EDF3F7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={20} color={C.ink} />
                    </div>
                    <div>
                      <p style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>{cat.name}</p>
                      <p style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>{cat.description}</p>
                    </div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: C.mutedLight, marginTop: 'auto' }}>
                      {cat.count} artigo{cat.count === 1 ? '' : 's'}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Artigos mais acessados */}
        {featured.length > 0 && (
          <section style={{ marginTop: 40 }} aria-label="Artigos mais acessados">
            <h2 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 12 }}>
              Artigos mais acessados
            </h2>
            <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {featured.map((a, i) => (
                <Link key={a.url} href={a.url} style={{ textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
                    <FileText size={16} color={C.mutedLight} style={{ flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>{a.title}</p>
                      <p style={{ fontSize: 13, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</p>
                    </div>
                    <ChevronRight size={16} color={C.mutedLight} style={{ flexShrink: 0 }} />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
