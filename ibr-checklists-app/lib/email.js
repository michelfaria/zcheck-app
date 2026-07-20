// Envio de e-mail transacional via Brevo. NUNCA importar no cliente — lê o
// BREVO_API_KEY. Usado hoje só para o código OTP do cadastro self-service.
//
// Pré-requisito operacional: o remetente (contato@zcheckapp.com) precisa estar
// verificado no Brevo, senão o envio é recusado.

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

// O remetente PRECISA ser um remetente verificado no Brevo, senão o envio é
// recusado. Configurável por env para apontar para o que estiver verificado
// (ex.: contato@zcheckapp.com quando o domínio estiver autenticado, ou um
// e-mail já verificado enquanto isso). Default: contato@zcheckapp.com.
function sender() {
  return {
    name: process.env.BREVO_SENDER_NAME || 'ZCheck',
    email: process.env.BREVO_SENDER_EMAIL || 'contato@zcheckapp.com',
  };
}

// E-mail simples de texto (follow-up do time de gestão). Mesmo contrato do
// OTP: retorna { ok } ou { ok: false, reason }, nunca lança.
export async function sendPlainEmail(to, subject, bodyText) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'not_configured' };

  const paragraphs = String(bodyText || '').split('\n').filter(Boolean)
    .map(p => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${p}</p>`).join('');
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#102A3A">
      ${paragraphs}
      <p style="font-size:12px;color:#94A3B8;margin:20px 0 0">ZCheck · Faça bem feito. Todo dia. · <a href="https://zcheckapp.com" style="color:#063C5C">zcheckapp.com</a></p>
    </div>`;

  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: sender(), to: [{ email: to }], subject, htmlContent: html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('Brevo recusou o follow-up:', res.status, body);
      return { ok: false, reason: 'send_failed' };
    }
    return { ok: true };
  } catch (e) {
    console.error('sendPlainEmail falhou:', e.message);
    return { ok: false, reason: 'send_failed' };
  }
}

// Retorna { ok: true } ou { ok: false, reason }. Não lança — o chamador decide
// o status HTTP. 'not_configured' distingue falta de chave de falha de rede.
export async function sendOtpEmail(email, code) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'not_configured' };

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#102A3A">
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Seu código para criar a empresa no ZCheck é:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:0.2em;text-align:center;background:#F1F5F9;border-radius:12px;padding:16px 0;margin:0 0 16px;color:#063C5C">${code}</p>
      <p style="font-size:13px;line-height:1.6;color:#64748B;margin:0">O código expira em 10 minutos. Se você não pediu isto, ignore este e-mail.</p>
    </div>`;

  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: sender(),
        to: [{ email }],
        subject: `Seu código ZCheck: ${code}`,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('Brevo recusou o envio:', res.status, body);
      return { ok: false, reason: 'send_failed' };
    }
    return { ok: true };
  } catch (e) {
    console.error('sendOtpEmail falhou:', e.message);
    return { ok: false, reason: 'send_failed' };
  }
}
