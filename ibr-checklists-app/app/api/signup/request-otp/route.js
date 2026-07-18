import { after } from 'next/server';
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
// no banco fica apenas o hash. O envio acontece DEPOIS da resposta (after()):
// a Brevo era o item mais lento do caminho crítico e o usuário ficava preso
// no "Aguarde...". Se o envio falhar, a linha é apagada em background — o
// código não verificável some e não conta contra o rate-limit.
export async function POST(request) {
  const supabase = serviceClient();
  const pepperOk = hashSecret('probe') !== null;
  if (!supabase || !pepperOk || !process.env.BREVO_API_KEY) {
    console.error('service_role, SUPABASE_JWT_SECRET ou BREVO_API_KEY ausente — request-otp desabilitada.');
    return json({ ok: false, reason: 'server_misconfigured' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, reason: 'bad_request' }, 400); }

  const email = String(body?.email || '').trim().toLowerCase();
  if (!isEmail(email)) return json({ ok: false, reason: 'invalid_email' }, 400);

  const ip = clientIp(request);

  // Turnstile e rate-limits são independentes — rodam em paralelo (as counts
  // são só leitura, não têm efeito colateral se o captcha reprovar).
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const countSignups = (col, val) => supabase
    .from('signups').select('id', { count: 'exact', head: true })
    .eq(col, val).gte('created_at', since);

  const [captchaOk, byEmail, byIp] = await Promise.all([
    // null = secret ausente em produção (misconfigurado); false = token inválido.
    // Fora de produção, a test key sempre aprova.
    verifyTurnstile(body?.turnstileToken, ip),
    countSignups('email', email),
    ip ? countSignups('ip', ip) : Promise.resolve({ count: 0, error: null }),
  ]);

  if (captchaOk === null) return json({ ok: false, reason: 'server_misconfigured' }, 500);
  if (!captchaOk) return json({ ok: false, reason: 'captcha_failed' }, 400);

  if (byEmail.error) { console.error('rate-limit email falhou:', byEmail.error.message); return json({ ok: false, reason: 'network_error' }, 502); }
  if ((byEmail.count ?? 0) >= MAX_OTP_PER_EMAIL_HOUR) return json({ ok: false, reason: 'rate_limited' }, 429);
  if (byIp.error) { console.error('rate-limit ip falhou:', byIp.error.message); return json({ ok: false, reason: 'network_error' }, 502); }
  if ((byIp.count ?? 0) >= MAX_OTP_PER_IP_HOUR) return json({ ok: false, reason: 'rate_limited' }, 429);

  const code = sixDigitCode();

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

  after(async () => {
    const sent = await sendOtpEmail(email, code);
    if (!sent.ok) {
      console.error('envio do OTP falhou pós-resposta; apagando signup', data.id, sent.reason);
      const { error: delError } = await supabase.from('signups').delete().eq('id', data.id);
      if (delError) console.error('não consegui apagar o signup órfão:', delError.message);
    }
  });

  return json({ ok: true, signup_id: data.id }, 200);
}
