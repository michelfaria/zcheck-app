// Cliente do Mercado Pago (Assinaturas via preapproval). NUNCA importar no
// cliente — lê MP_ACCESS_TOKEN e MP_WEBHOOK_SECRET.
//
// Modelo: preapproval SEM plano associado, status 'pending' → o MP devolve um
// init_point (checkout hospedado), então nós nunca tocamos em dados de cartão.

import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.mercadopago.com';

export function mpConfigured() {
  return !!process.env.MP_ACCESS_TOKEN;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

// Cria a assinatura. Retorna { ok, id, initPoint } ou { ok:false, status, body }.
// frequencyMonths: 1 (mensal, padrão) ou 12 (anual — cobrança única por ano).
export async function createPreapproval({ amount, reason, payerEmail, companyId, backUrl, frequencyMonths = 1 }) {
  const res = await fetch(`${API}/preapproval`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      reason,
      external_reference: companyId,
      payer_email: payerEmail,
      back_url: backUrl,
      status: 'pending',
      auto_recurring: {
        frequency: frequencyMonths,
        frequency_type: 'months',
        transaction_amount: amount,
        currency_id: 'BRL',
      },
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status, body };
  return { ok: true, id: body?.id, initPoint: body?.init_point || body?.sandbox_init_point };
}

export async function getPreapproval(id) {
  const res = await fetch(`${API}/preapproval/${encodeURIComponent(id)}`, { headers: authHeaders() });
  const body = await res.json().catch(() => null);
  return res.ok ? { ok: true, body } : { ok: false, status: res.status, body };
}

export async function getAuthorizedPayment(id) {
  const res = await fetch(`${API}/authorized_payments/${encodeURIComponent(id)}`, { headers: authHeaders() });
  const body = await res.json().catch(() => null);
  return res.ok ? { ok: true, body } : { ok: false, status: res.status, body };
}

export async function cancelPreapproval(id) {
  const res = await fetch(`${API}/preapproval/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ status: 'cancelled' }),
  });
  const body = await res.json().catch(() => null);
  return res.ok ? { ok: true, body } : { ok: false, status: res.status, body };
}

// Valida a assinatura x-signature do webhook. Template do MP:
//   id:{data.id};request-id:{x-request-id};ts:{ts};
// (cada segmento é omitido se o valor estiver ausente). HMAC-SHA256 com o
// MP_WEBHOOK_SECRET, comparado em tempo constante com o v1 do header.
export function verifyWebhookSignature({ xSignature, xRequestId, dataId }) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return null;               // não configurado → chamador trata
  if (!xSignature || !dataId) return false;

  let ts, v1;
  for (const part of xSignature.split(',')) {
    const [k, v] = part.split('=').map(s => s && s.trim());
    if (k === 'ts') ts = v;
    if (k === 'v1') v1 = v;
  }
  if (!ts || !v1) return false;

  // data.id em minúsculas quando alfanumérico (regra do MP).
  const id = String(dataId).toLowerCase();

  let manifest = `id:${id};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const computed = createHmac('sha256', secret).update(manifest).digest('hex');

  // Comparação em tempo constante (mesmo tamanho: ambos hex de 64 chars).
  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
