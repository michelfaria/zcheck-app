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

// Toda chamada ao MP passa por aqui e NUNCA lança: erro de rede (DNS, socket,
// timeout) vira { ok:false, status:0, networkError:true }, igual a uma
// resposta de erro. Antes o `fetch` rejeitado escapava de quem chamava — o
// ajuste de valor deixava a intenção nova gravada sem restaurar nem marcar
// pendência, a rota de vagas respondia 500 com as vagas já salvas e o cron
// parava no meio da lista. status 0/429/5xx = passageiro (vale tentar de novo).
async function mpRequest(path, init = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers: authHeaders() });
  } catch (e) {
    return { ok: false, status: 0, body: null, networkError: true, message: e?.message || String(e) };
  }
  const body = await res.json().catch(() => null);
  return res.ok ? { ok: true, status: res.status, body } : { ok: false, status: res.status, body };
}

/** Falha que vale tentar de novo: rede (0), limite (429) ou erro do MP (5xx). */
export function mpTransient(r) {
  return !!r && !r.ok && (r.status === 0 || r.status === 429 || r.status >= 500);
}

// Cria a assinatura. Retorna { ok, id, initPoint } ou { ok:false, status, body }.
// frequencyMonths: a periodicidade da COBRANÇA no cartão. Hoje é sempre 1: nos
// DOIS planos o MP cobra todo mês — o anual é compromisso de 12 meses com
// preço menor por loja, não uma cobrança única por ano (lib/plans.js). O
// parâmetro fica para um eventual anual à vista; nada deve assumir 12 aqui.
export async function createPreapproval({ amount, reason, payerEmail, companyId, backUrl, frequencyMonths = 1 }) {
  const r = await mpRequest('/preapproval', {
    method: 'POST',
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
  if (!r.ok) return r;
  return { ok: true, id: r.body?.id, initPoint: r.body?.init_point || r.body?.sandbox_init_point };
}

export async function getPreapproval(id) {
  return mpRequest(`/preapproval/${encodeURIComponent(id)}`);
}

export async function getAuthorizedPayment(id) {
  return mpRequest(`/authorized_payments/${encodeURIComponent(id)}`);
}

export async function cancelPreapproval(id) {
  return mpRequest(`/preapproval/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'cancelled' }),
  });
}

// Troca o valor mensal de uma assinatura existente (vagas adicionais ou lojas
// ativas mudaram). Vale da PRÓXIMA fatura, sem pró-rata — o MP não cobra
// diferença do mês corrente. Só é chamada atrás de MP_ADJUST_ENABLED === '1'
// (lib/billingServer.js): o comportamento do PUT (aumento sem reconsentimento
// do pagador, quando o valor novo passa a valer) precisa ser confirmado no
// sandbox antes de ligar. O MP re-dispara o webhook 'preapproval' depois do
// PUT; o webhook resolve pela intenção em billing_checkouts, nunca pelo valor.
export async function updatePreapprovalAmount(id, amount) {
  return mpRequest(`/preapproval/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({
      auto_recurring: { transaction_amount: Number(amount), currency_id: 'BRL' },
    }),
  });
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
