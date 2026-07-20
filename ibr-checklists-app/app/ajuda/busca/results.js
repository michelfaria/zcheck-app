'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Fuse from 'fuse.js';
import { FileText, ChevronRight } from 'lucide-react';
import { C } from '../../../lib/tokens';
import { SearchBox } from '../ui';

// Busca client-side: baixa o índice estático uma vez e pesquisa com Fuse.js.
export function BuscaResults() {
  const params = useSearchParams();
  const query = (params.get('q') || '').trim();
  const [index, setIndex] = useState(null);

  useEffect(() => {
    let cancel = false;
    fetch('/ajuda/search-index.json')
      .then(r => r.json())
      .then(data => { if (!cancel) setIndex(data); })
      .catch(() => { if (!cancel) setIndex([]); });
    return () => { cancel = true; };
  }, []);

  const fuse = useMemo(() => index && new Fuse(index, {
    keys: [
      { name: 'title', weight: 3 },
      { name: 'description', weight: 2 },
      { name: 'body', weight: 1 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
  }), [index]);

  const results = useMemo(() => {
    if (!fuse || !query) return [];
    return fuse.search(query, { limit: 20 }).map(r => r.item);
  }, [fuse, query]);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 0' }}>
      <SearchBox initialQuery={query} autoFocus={!query} />

      {query && (
        <p style={{ fontSize: 14, color: C.muted, marginTop: 20 }}>
          {index === null
            ? 'Buscando…'
            : results.length === 0
              ? <>Nenhum resultado para <strong style={{ color: C.ink }}>&ldquo;{query}&rdquo;</strong>.</>
              : <>{results.length} resultado{results.length === 1 ? '' : 's'} para <strong style={{ color: C.ink }}>&ldquo;{query}&rdquo;</strong>:</>}
        </p>
      )}

      {results.length > 0 && (
        <div style={{ background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', marginTop: 12 }}>
          {results.map((a, i) => (
            <Link key={a.url} href={a.url} style={{ textDecoration: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.border}` }}>
                <FileText size={16} color={C.mutedLight} style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 500, color: C.ink }}>{a.title}</p>
                  <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
                    {a.categoryName} · {a.description}
                  </p>
                </div>
                <ChevronRight size={16} color={C.mutedLight} style={{ flexShrink: 0 }} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {query && index !== null && results.length === 0 && (
        <div style={{ marginTop: 20, padding: '20px 16px', background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: C.muted }}>
            Tente outras palavras — ou{' '}
            <Link href="/ajuda/assistente" style={{ color: C.ink, fontWeight: 600 }}>pergunte ao assistente</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
