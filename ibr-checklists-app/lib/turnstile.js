// Verificação server-side do Cloudflare Turnstile. NUNCA importar no cliente —
// lê o TURNSTILE_SECRET_KEY. O widget do cliente só produz um token; é aqui que
// ele é validado contra a Cloudflare. Sem esta checagem, o Turnstile é cosmético.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Chaves de teste oficiais da Cloudflare. Em dev/preview, o cliente usa a
// site key de teste (1x00000000000000000000AA), cujo par de secret é este —
// siteverify sempre aprova. Deixa o fluxo local rodar sem segredo real.
const TEST_SECRET = '1x0000000000000000000000000000000AA';

// Retorna true/false. Se o secret não estiver configurado, devolve null para o
// chamador decidir (as rotas tratam null como 'server_misconfigured').
export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY || TEST_SECRET;
  if (!secret) return null;
  if (typeof token !== 'string' || !token) return false;

  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  if (ip) form.set('remoteip', ip);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = await res.json().catch(() => null);
    return data?.success === true;
  } catch (e) {
    console.error('verifyTurnstile falhou:', e.message);
    return false;
  }
}
