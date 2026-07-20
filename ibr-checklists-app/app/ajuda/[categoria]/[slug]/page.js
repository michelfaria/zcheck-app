import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileText, ChevronRight } from 'lucide-react';
import { C } from '../../../../lib/tokens';
import { getCategory, getArticle, getAllArticles, getRelatedArticles } from '../../../../lib/ajuda';
import { Breadcrumb, ArticleBody } from '../../article-ui';
import { FeedbackWidget } from '../../ui';

export function generateStaticParams() {
  return getAllArticles().map(a => ({ categoria: a.category, slug: a.slug }));
}

export async function generateMetadata({ params }) {
  const { categoria, slug } = await params;
  const article = getArticle(categoria, slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: `https://zcheckapp.com${article.url}` },
  };
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default async function ArtigoPage({ params }) {
  const { categoria, slug } = await params;
  const cat = getCategory(categoria);
  const article = getArticle(categoria, slug);
  if (!cat || !article) notFound();

  const related = getRelatedArticles(article);
  const updated = formatDate(article.updatedAt);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 0' }}>
      <Breadcrumb items={[
        { label: 'Ajuda', href: '/ajuda' },
        { label: cat.name, href: `/ajuda/${cat.slug}` },
        { label: article.title },
      ]} />

      <article style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, padding: '28px 20px', marginTop: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>{article.title}</h1>
        {updated && (
          <p style={{ fontSize: 13, color: C.mutedLight, marginTop: 8 }}>Atualizado em {updated}</p>
        )}
        <div style={{ marginTop: 8 }}>
          <ArticleBody markdown={article.content} />
        </div>
      </article>

      <FeedbackWidget category={article.category} slug={article.slug} />

      {related.length > 0 && (
        <section style={{ marginTop: 36 }} aria-label="Artigos relacionados">
          <h2 style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 12 }}>
            Artigos relacionados
          </h2>
          <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {related.map((a, i) => (
              <Link key={a.slug} href={a.url} style={{ textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
                  <FileText size={16} color={C.mutedLight} style={{ flexShrink: 0 }} />
                  <p style={{ fontSize: 14, fontWeight: 500, color: C.ink, flex: 1, minWidth: 0 }}>{a.title}</p>
                  <ChevronRight size={16} color={C.mutedLight} style={{ flexShrink: 0 }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
