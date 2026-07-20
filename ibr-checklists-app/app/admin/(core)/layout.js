'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { C } from '../../../lib/tokens';

// Casca do ZCheck Core: navegação lateral (topo no mobile) + sessão.
// O grupo (core) NÃO envolve /admin/login — o portão fica no middleware.
const NAV = [
  { href: '/admin', label: 'Visão Geral' },
  { href: '/admin/adocao', label: 'Adoção' },
  { href: '/admin/uso', label: 'Uso Operacional' },
  { href: '/admin/empresas', label: 'Empresas' },
  { href: '/admin/financeiro', label: 'Financeiro' },
  { href: '/admin/agentes', label: 'Time de Gestão' },
  { href: '/admin/alertas', label: 'Alertas' },
  { href: '/admin/config', label: 'Config' },
];

export default function CoreLayout({ children }) {
  const pathname = usePathname();
  const [me, setMe] = useState(null);
  const [openAlerts, setOpenAlerts] = useState(0);

  useEffect(() => {
    fetch('/api/admin/me').then(r => r.json()).then(d => { if (d.ok) setMe(d); }).catch(() => {});
  }, []);

  // Badge de alertas abertos — poll leve (só contagem, sem reavaliar regras).
  // O painel de alertas dispara 'zcheck:alerts-changed' ao resolver/reabrir/
  // verificar, para o número cair na hora em vez de esperar o próximo poll.
  useEffect(() => {
    const load = () =>
      fetch('/api/admin/alerts?badge=1').then(r => r.json())
        .then(d => { if (d.ok) setOpenAlerts(d.openCount); }).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    window.addEventListener('zcheck:alerts-changed', load);
    return () => { clearInterval(t); window.removeEventListener('zcheck:alerts-changed', load); };
  }, [pathname]);

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/admin/login';
  }

  const linkStyle = active => ({
    display: 'block', padding: '10px 14px', borderRadius: 8, fontSize: 14,
    fontWeight: active ? 800 : 600, color: active ? 'white' : C.ink,
    background: active ? C.ink : 'transparent', textDecoration: 'none', whiteSpace: 'nowrap',
  });

  return (
    <div className="min-h-screen md:flex" style={{ background: C.bg, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <aside
        className="md:w-56 md:min-h-screen md:flex-shrink-0 md:flex md:flex-col"
        style={{ background: 'white', borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}
      >
        <div style={{ padding: '18px 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/zcheck-logo.png" alt="ZCheck" style={{ height: 26, width: 'auto' }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: C.ink, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Core</span>
        </div>

        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible" style={{ padding: '6px 10px 12px' }}>
          {NAV.map(item => (
            <Link key={item.href} href={item.href} style={{ ...linkStyle(pathname === item.href), display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.label}
              {item.href === '/admin/alertas' && openAlerts > 0 && (
                <span style={{ background: C.critical, color: 'white', borderRadius: 999, fontSize: 11, fontWeight: 800, padding: '1px 7px', lineHeight: '16px' }}>
                  {openAlerts}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block" style={{ marginTop: 'auto', padding: 14, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {me?.email || '…'}
          </p>
          <button
            onClick={handleLogout}
            style={{ width: '100%', background: 'none', border: `1px solid ${C.borderStrong}`, borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 700, color: C.ink, cursor: 'pointer' }}
          >
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0" style={{ padding: '20px 20px 60px', maxWidth: 1200 }}>
        {children}
      </main>
    </div>
  );
}
