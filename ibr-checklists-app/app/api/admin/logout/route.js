import { ADMIN_COOKIE } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sair do ZCheck Core: só apaga o cookie de sessão. O token expira sozinho em
// 12h de qualquer forma (não há lista de revogação — aceitável para 1 admin).
export async function POST() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return Response.json({ ok: true }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Set-Cookie': `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
    },
  });
}
