'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { C, R } from '../lib/tokens';

// Seta discreta de "voltar ao topo" da landing. Só aparece depois que o usuário
// rola além do hero (uma altura de viewport) — em cima da página não tem razão
// de existir. Fica abaixo do header sticky (zIndex 100) na hierarquia.
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.9);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Voltar ao topo da página"
      style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 90,
        width: 44, height: 44, borderRadius: R.pill,
        background: 'white', color: C.ink, border: `1.5px solid ${C.borderStrong}`,
        boxShadow: '0 4px 14px rgba(15,23,42,0.12)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <ArrowUp size={20} aria-hidden />
    </button>
  );
}
