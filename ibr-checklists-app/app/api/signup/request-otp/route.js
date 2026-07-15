import { verifyTurnstile } from '../../../../lib/turnstile';
import { sendOtpEmail } from '../../../../lib/email';
import {
  json, serviceClient, hashSecret, sixDigitCode, clientIp, isEmail,
  OTP_TTL_MS, MAX_OTP_PER_EMAIL_HOUR, MAX_OTP_PER_IP_HOUR,
} from '../../../../lib/signupServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Passo 1 do cadastro self-service: valida o e-mail + Turnstile, aplica
// rate-limit, gera o OTP e o envia pela Brevo. O código sai daqui só por e-mail;
// no banco fica apenas o hash.
export async function POST(request) {
  const supabase = serviceClient();
  const pepperOk = hashSecret('probe') !== null;
  if (!supabase || !pepperOk) {
    console.error('service_role ou SUPABASE_JWT_SECRET ausente — request-otp desabilitada.');
    return json({ ok: false, reason: 'server_misconfigured' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const email = String(body?.email || '').trim().toLowerCase();
  if (!isEmail(email)) return json({ ok: false, reason: 'invalid_email' }, 400);

  const ip = clientIp(request);

  // Turnstile server-side. null = secret ausente em produção (misconfigurado);
  // false = token inválido. Fora de produção, a test key sempre aprova.
  const captchaOk = await verifyTurnstile(body?.turnstileToken, ip);
  if (captchaOk === null) return json({ ok: false, reason: 'server_misconfigured' }, 500);
  if (!captchaOk) return json({ ok: false, reason: 'captcha_failed' }, 400);

  // Rate-limit: por e-mail e por IP na última hora.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count: emailCount, error: e1 } = await supabase
    .from('signups').select('id', { count: 'exact', head: true })
    .eq('email', email).gte('created_at', since);
  if (e1) { console.error('rate-limit email falhou:', e1.message); return json({ ok: false, reason: 'network_error' }, 502); }
  if ((emailCount ?? 0) >= MAX_OTP_PER_EMAIL_HOUR) return json({ ok: false, reason: 'rate_limited' }, 429);

  if (ip) {
    const { count: ipCount, error: e2 } = await supabase
      .from('signups').select('id', { count: 'exact', head: true })
      .eq('ip', ip).gte('created_at', since);
    if (e2) { console.error('rate-limit ip falhou:', e2.message); return json({ ok: false, reason: 'network_error' }, 502); }
    if ((ipCount ?? 0) >= MAX_OTP_PER_IP_HOUR) return json({ ok: false, reason: 'rate_limited' }, 429);
  }

  const code = sixDigitCode();

  // Envia ANTES de gravar: se a Brevo recusar, não deixamos uma linha que
  // conta contra o rate-limit de um e-mail que nunca recebeu nada.
  const sent = await sendOtpEmail(email, code);
  if (!sent.ok) {
    const status = sent.reason === 'not_configured' ? 500 : 502;
    const reason = sent.reason === 'not_configured' ? 'server_misconfigured' : 'send_failed';
    return json({ ok: false, reason }, status);
  }

  const { data, error } = await supabase
    .from('signups')
    .insert({
      email,
      code_hash: hashSecret(code),
      ip,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('insert signup falhou:', error.message);
    return json({ ok: false, reason: 'network_error' }, 502);
  }

  return json({ ok: true, signup_id: data.id }, 200);
}
