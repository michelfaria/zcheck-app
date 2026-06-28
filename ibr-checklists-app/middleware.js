import { NextResponse } from 'next/server';

export function middleware(request) {
  const hostname = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

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
