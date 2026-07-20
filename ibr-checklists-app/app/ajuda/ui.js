'use client';

/**
 * Componentes CLIENT da Central de Ajuda: campo de busca e feedback do artigo.
 * A parte estática (páginas) é toda Server Component — só o interativo vive aqui.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { C } from '../../lib/tokens';
import { track } from '../../lib/track';

// Campo de busca do hero, com resultados instantâneos: no primeiro caractere
// carrega o índice estático + Fuse.js (import dinâmico — artigos não pagam
// esse peso) e mostra os melhores resultados num dropdown. Enter abre o
// primeiro resultado (ou a página de busca); ↑/↓ navegam; Esc fecha.
export function SearchBox({ autoFocus = false, initialQuery = '' }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const fuseRef = useRef(null);   // Promise<Fuse> — carrega uma vez
  const boxRef = useRef(null);
  const router = useRouter();

  const loadFuse = () => {
    if (!fuseRef.current) {
      fuseRef.current = Promise.all([
        import('fuse.js').then(m => m.default),
        fetch('/ajuda/search-index.json').then(r => r.json()),
      ]).then(([Fuse, index]) => new Fuse(index, {
        keys: [
          { name: 'title', weight: 3 },
          { name: 'description', weight: 2 },
          { name: 'body', weight: 1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 2,
      })).catch(() => null);
    }
    return fuseRef.current;
  };

  const onChange = async value => {
    setQ(value);
    setActive(-1);
    const query = value.trim();
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    const fuse = await loadFuse();
    if (!fuse) return;
    const found = fuse.search(query, { limit: 6 }).map(r => r.item);
    setResults(found);
    setOpen(true);
  };

  // Fecha ao clicar fora
  useEffect(() => {
    const onDown = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const go = url => {
    setOpen(false);
    try { track('help_search', { source: 'ajuda', metadata: { query: q.trim(), picked: url } }); } catch {}
    router.push(url);
  };

  const submit = e => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    if (active >= 0 && results[active]) { go(results[active].url); return; }
    go(`/ajuda/busca?q=${encodeURIComponent(query)}`);
  };

  const onKeyDown = e => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a <= 0 ? results.length - 1 : a - 1)); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
      <form onSubmit={submit} role="search">
        <input
          type="search"
          value={q}
          onChange={e => onChange(e.target.value)}
          onFocus={() => { loadFuse(); if (results.length) setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder="Busque por assunto: instalar, PIN, foto, offline…"
          autoFocus={autoFocus}
          aria-label="Buscar na Central de Ajuda"
          aria-expanded={open}
          autoComplete="off"
          style={{
            width: '100%', fontSize: 15, color: C.ink, background: 'white',
            padding: '15px 110px 15px 18px', border: `1.5px solid ${C.border}`,
            borderRadius: 12, outline: 'none', boxShadow: '0 6px 20px rgba(6,60,92,0.06)',
          }}
        />
        <button
          type="submit"
          style={{
            position: 'absolute', right: 6, top: 6,
            padding: '11px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: C.ink, color: 'white', fontSize: 14, fontWeight: 600,
          }}
        >
          Buscar
        </button>
      </form>

      {open && (
        <div role="listbox" aria-label="Resultados da busca" style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30,
          background: 'white', border: `1px solid ${C.border}`, borderRadius: 12,
          boxShadow: '0 12px 32px rgba(6,60,92,0.12)', overflow: 'hidden', textAlign: 'left',
        }}>
          {results.length === 0 ? (
            <p style={{ padding: '14px 16px', fontSize: 14, color: C.muted }}>
              Nenhum artigo encontrado. Tente outras palavras.
            </p>
          ) : (
            <>
              {results.map((r, i) => (
                <button
                  key={r.url}
                  role="option"
                  aria-selected={i === active}
                  onClick={() => go(r.url)}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '11px 16px', background: i === active ? '#EDF3F7' : 'white',
                    border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
                  }}
                >
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 500, color: C.ink }}>{r.title}</span>
                  <span style={{ display: 'block', fontSize: 12.5, color: C.muted, marginTop: 2 }}>{r.categoryName}</span>
                </button>
              ))}
              <button
                onClick={() => go(`/ajuda/busca?q=${encodeURIComponent(q.trim())}`)}
                style={{
                  display: 'block', width: '100%', textAlign: 'center', cursor: 'pointer',
                  padding: '11px 16px', background: C.bg, border: 'none',
                  borderTop: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, color: C.ink,
                }}
              >
                Ver todos os resultados →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// "Este artigo ajudou?" — registra o voto via lib/track (fila offline-safe).
export function FeedbackWidget({ category, slug }) {
  const [voted, setVoted] = useState(null); // 'up' | 'down'

  const vote = v => {
    if (voted) return;
    setVoted(v);
    try {
      track('help_article_feedback', {
        source: 'ajuda',
        metadata: { article: `${category}/${slug}`, helpful: v === 'up' },
      });
    } catch {}
  };

  const btn = active => ({
    fontSize: 22, lineHeight: 1, padding: '10px 18px', borderRadius: 10, cursor: voted ? 'default' : 'pointer',
    border: `1.5px solid ${active ? C.ink : C.border}`, background: active ? '#EDF3F7' : 'white',
    opacity: voted && !active ? 0.4 : 1,
  });

  return (
    <div style={{ marginTop: 36, padding: '20px 16px', background: 'white', border: `1px solid ${C.border}`, borderRadius: 12, textAlign: 'center' }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 12 }}>Este artigo ajudou?</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button onClick={() => vote('up')} aria-label="Sim, ajudou" style={btn(voted === 'up')}>👍</button>
        <button onClick={() => vote('down')} aria-label="Não ajudou" style={btn(voted === 'down')}>👎</button>
      </div>
      {voted === 'up' && (
        <p style={{ fontSize: 13, color: C.muted, marginTop: 12 }}>Obrigado pelo feedback!</p>
      )}
      {voted === 'down' && (
        <p style={{ fontSize: 13, color: C.muted, marginTop: 12 }}>
          Que pena! <a href="/ajuda/assistente" style={{ color: C.ink, fontWeight: 600 }}>Fale com o assistente</a> — ele pode ajudar com a sua dúvida.
        </p>
      )}
    </div>
  );
}
