import { NextResponse } from 'next/server';
import { verifyAdminTokenEdge, ADMIN_COOKIE } from './lib/adminEdgeAuth';

// Rotas do ZCheck Core que ficam FORA do portão de sessão:
//  - /admin/login e /api/admin/login: é onde a sessão nasce;
//  - /api/admin/logout: sair deve funcionar mesmo com token expirado;
//  - /api/admin/provision: autoriza por segredo próprio (x-provision-secret) e
//    é chamada pelo fluxo de onboarding — exigir cookie aqui quebraria cadastro;
//  - /api/admin/cron/*: chamadas do Vercel Cron, sem cookie — autorizam por
//    CRON_SECRET dentro da própria rota.
const ADMIN_PUBLIC = new Set([
  '/admin/login', '/api/admin/login', '/api/admin/logout', '/api/admin/provision',
  '/api/admin/cron/alerts', '/api/admin/cron/briefing',
]);

export async function middleware(request) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

  // ── Portão do ZCheck Core (/admin) ─────────────────────────────────────────
  if ((pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/'))
      && !ADMIN_PUBLIC.has(pathname)) {
    const token = request.cookies.get(ADMIN_COOKIE)?.value;
    const claims = await verifyAdminTokenEdge(token, process.env.SUPABASE_JWT_SECRET);
    if (!claims) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // Se é subdomínio de tenant (não www, não raiz)
  if (hostname.endsWith('.zcheckapp.com')) {
    const sub = hostname.replace('.zcheckapp.com', '');
    if (sub && sub !== 'www') {
      // Redireciona raiz para /app
      if (pathname === '/') {
        return NextResponse.redirect(new URL('/app', request.url));
      }
    }
  }

  // No domínio principal não existe tenant: /app cairia no fallback de
  // desenvolvimento (uma empresa arbitrária). Quem chega ali é cliente sem o
  // subdomínio da empresa — o caminho certo é a página de código.
  const isApex = hostname === 'zcheckapp.com' || hostname === 'www.zcheckapp.com';
  if (isApex && (pathname === '/app' || pathname.startsWith('/app/'))) {
    return NextResponse.redirect(new URL('/entrar', request.url));
  }

  // localhost em dev também redireciona
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/app', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/((?!_next|favicon.ico|icon-192.png|icon-512.png|sw.js|manifest.json).*)'],
};
