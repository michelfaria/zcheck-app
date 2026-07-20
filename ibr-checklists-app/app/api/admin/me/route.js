import { adminFromRequest } from '../../../../lib/adminAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Identidade da sessão do Core. O middleware já barrou quem não tem cookie
// válido; a re-verificação aqui é defesa em profundidade (e dá o payload à UI).
export async function GET(request) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return Response.json({ ok: false, reason: 'server_misconfigured' }, { status: 500 });

  const claims = adminFromRequest(request, { secret });
  if (!claims) return Response.json({ ok: false, reason: 'unauthorized' }, { status: 401 });

  return Response.json(
    { ok: true, email: claims.email, exp: claims.exp },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
