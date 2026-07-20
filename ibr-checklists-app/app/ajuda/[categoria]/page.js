import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText, ChevronRight } from 'lucide-react';
import { C } from '../../../lib/tokens';
import { CATEGORIES, getCategory, getArticles } from '../../../lib/ajuda';
import { Breadcrumb } from '../article-ui';

export function generateStaticParams() {
  return CATEGORIES.map(c => ({ categoria: c.slug }));
}

export async function generateMetadata({ params }) {
  const { categoria } = await params;
  const cat = getCategory(categoria);
  if (!cat) return {};
  return {
    title: cat.name,
    description: cat.description,
    alternates: { canonical: `https://zcheckapp.com/ajuda/${cat.slug}` },
  };
}

export default async function CategoriaPage({ params }) {
  const { categoria } = await params;
  const cat = getCategory(categoria);
  if (!cat) notFound();
  const articles = getArticles(cat.slug);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 0' }}>
      <Breadcrumb items={[{ label: 'Ajuda', href: '/ajuda' }, { label: cat.name }]} />

      <h1 style={{ fontSize: 24, fontWeight: 700, color: C.ink, marginTop: 16 }}>{cat.name}</h1>
      <p style={{ fontSize: 15, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>{cat.description}</p>

      <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginTop: 24 }}>
        {articles.map((a, i) => (
          <Link key={a.slug} href={a.url} style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
              <FileText size={16} color={C.mutedLight} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>{a.title}</p>
                <p style={{ fontSize: 13, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{a.description}</p>
              </div>
              <ChevronRight size={16} color={C.mutedLight} style={{ flexShrink: 0 }} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
