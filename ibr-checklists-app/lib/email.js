// Envio de e-mail transacional via Brevo. NUNCA importar no cliente — lê o
// BREVO_API_KEY. Usado para o código OTP do cadastro self-service e para o
// follow-up do time de gestão.
//
// Pré-requisitos operacionais no Brevo:
//   · o remetente (contato@zcheckapp.com) verificado, senão o envio é recusado;
//   · "Authorised IPs" DESATIVADO (app.brevo.com/security/authorised_ips). A
//     Vercel não tem IP de saída fixo: com o bloqueio ligado, cada IP novo da
//     AWS volta 401 "unrecognised IP address" e o código do /comecar não sai.
//     Aconteceu em 24/09/2026 — ver raiseEmailAlert abaixo.

import { todayStr } from './dates';

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

// Retorna { ok: true } ou { ok: false, reason, status?, detail? }. Nunca lança.
// 'not_configured' = sem chave; 'ip_not_authorized' = bloqueio de IP do Brevo;
// 'send_failed' = qualquer outra recusa ou falha de rede.
async function sendBrevo(to, subject, htmlContent, label) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, reason: 'not_configured' };

  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: sender(), to: [{ email: to }], subject, htmlContent }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`Brevo recusou o ${label}:`, res.status, body);
      const ipBlocked = res.status === 401 && /unrecognised IP/i.test(body);
      return {
        ok: false,
        reason: ipBlocked ? 'ip_not_authorized' : 'send_failed',
        status: res.status,
        detail: body.slice(0, 300),
      };
    }
    return { ok: true };
  } catch (e) {
    console.error(`envio do ${label} falhou:`, e.message);
    return { ok: false, reason: 'send_failed', detail: String(e.message || '').slice(0, 300) };
  }
}

// E-mail simples de texto (follow-up do time de gestão).
export async function sendPlainEmail(to, subject, bodyText) {
  const paragraphs = String(bodyText || '').split('\n').filter(Boolean)
    .map(p => `<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${p}</p>`).join('');
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#102A3A">
      ${paragraphs}
      <p style="font-size:12px;color:#94A3B8;margin:20px 0 0">ZCheck · Faça bem feito. Todo dia. · <a href="https://zcheckapp.com" style="color:#063C5C">zcheckapp.com</a></p>
    </div>`;
  return sendBrevo(to, subject, html, 'follow-up');
}

export async function sendOtpEmail(email, code) {
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#102A3A">
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px">Seu código para criar a empresa no ZCheck é:</p>
      <p style="font-size:32px;font-weight:800;letter-spacing:0.2em;text-align:center;background:#F1F5F9;border-radius:12px;padding:16px 0;margin:0 0 16px;color:#063C5C">${code}</p>
      <p style="font-size:13px;line-height:1.6;color:#64748B;margin:0">O código expira em 10 minutos. Se você não pediu isto, ignore este e-mail.</p>
    </div>`;
  return sendBrevo(email, `Seu código ZCheck: ${code}`, html, 'OTP');
}

// Falha de envio vira alerta crítico no Core (/admin/alertas), um por dia e
// por causa. Sem isto a falha do OTP era muda: o envio roda DEPOIS da resposta
// (after() no request-otp), a tela diz "Enviamos um código" e o único rastro
// era uma linha de log da Vercel. Mesmo padrão do raiseBillingAlert: nunca
// derruba o fluxo, só loga se não gravar.
export async function raiseEmailAlert(supabase, flow, sent) {
  if (!supabase || sent?.ok) return;
  const why = {
    ip_not_authorized: 'o Brevo bloqueou o IP da Vercel ("unrecognised IP address"). A Vercel não tem IP '
      + 'fixo: desative o bloqueio em app.brevo.com/security/authorised_ips (não adianta liberar o IP).',
    not_configured: 'BREVO_API_KEY ausente neste ambiente.',
  }[sent?.reason] || `Brevo recusou${sent?.status ? ` (HTTP ${sent.status})` : ''}: ${sent?.detail || 'erro desconhecido'}`;
  const { error } = await supabase.from('admin_alerts')
    .upsert([{
      severity: 'critical',
      rule: 'email_send_failed',
      message: `E-mail transacional não saiu (${flow}): ${why}`,
      dedupe_key: `email_send_failed|${sent?.reason || 'unknown'}|${todayStr()}`,
    }], { onConflict: 'dedupe_key', ignoreDuplicates: true });
  if (error) console.error('alerta de e-mail não gravado:', error.message);
}
