// Peças compartilhadas pelas rotas /api/signup/*. Server-only: lê service_role e
// o JWT secret (usado como pepper do HMAC). NUNCA importar no cliente.

import { createHmac, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from './supabase';

export const json = (body, status) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Cliente service_role — ignora RLS. Só existe no servidor. Retorna null se a
// chave não estiver configurada, para o chamador responder server_misconfigured.
export function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// HMAC-SHA256 com o JWT secret como pepper. Guardamos só o hash de OTP e
// claim_token — nunca o valor em claro. Retorna null se o segredo faltar.
export function hashSecret(value) {
  const pepper = process.env.SUPABASE_JWT_SECRET;
  if (!pepper) return null;
  return createHmac('sha256', pepper).update(String(value)).digest('hex');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

export function sixDigitCode() {
  // 000000–999999, sempre com 6 dígitos.
  return String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, '0');
}

// IP do cliente. Prefere x-real-ip (setado pela Vercel, mais difícil de forjar)
// e cai no primeiro x-forwarded-for. É defesa em profundidade — o rate-limit por
// e-mail é o guarda principal.
export function clientIp(request) {
  const real = (request.headers.get('x-real-ip') || '').trim();
  if (real) return real;
  const xff = request.headers.get('x-forwarded-for') || '';
  return xff.split(',')[0].trim() || null;
}

export const isEmail = (s) =>
  typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()) && s.length <= 254;

// Limites de anti-abuso.
export const OTP_TTL_MS = 10 * 60 * 1000;        // validade do código
export const PROVISION_WINDOW_MS = 30 * 60 * 1000; // janela para provisionar após verificar
export const MAX_OTP_PER_EMAIL_HOUR = 3;
export const MAX_OTP_PER_IP_HOUR = 10;
export const MAX_VERIFY_ATTEMPTS = 5;
