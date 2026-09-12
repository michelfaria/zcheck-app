/**
 * CNPJ — normalização, validação e raiz.
 *
 * Suporta os DOIS formatos:
 *   · numérico clássico  — 14 dígitos (12 base + 2 DV)
 *   · alfanumérico       — 12 primeiras posições podem ter letras (A–Z), os
 *                          2 DV continuam numéricos (regra da Receita para os
 *                          CNPJs emitidos a partir de 2026)
 *
 * O algoritmo é o mesmo nos dois casos: o valor de cada caractere é
 * `ASCII − 48` ('0'→0 … '9'→9, 'A'→17 … 'Z'→42), pesos 2..9 cíclicos da
 * direita para a esquerda, módulo 11. Por isso um validador alfanumérico
 * valida corretamente os CNPJs numéricos antigos — não são dois caminhos.
 *
 * RAIZ = as 8 primeiras posições: identifica o GRUPO ECONÔMICO (matriz e
 * filiais compartilham a raiz e mudam a ordem: /0001, /0002…). É a raiz, não
 * o CNPJ completo, que trava o trial — senão uma rede pegaria um período de
 * teste por loja.
 */

/** Só o essencial: maiúsculas, sem pontuação. */
export function normalizeCnpj(value) {
  return String(value || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** 12.ABC.345/0001-90 — formatação de exibição (aceita alfanumérico). */
export function formatCnpj(value) {
  const v = normalizeCnpj(value);
  if (v.length !== 14) return v;
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
}

/** Raiz (grupo econômico) — 8 primeiras posições. */
export function cnpjRoot(value) {
  const v = normalizeCnpj(value);
  return v.length === 14 ? v.slice(0, 8) : null;
}

const charValue = ch => ch.charCodeAt(0) - 48;

function checkDigit(base) {
  // Pesos 2..9 cíclicos, da direita para a esquerda.
  let sum = 0;
  let weight = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    sum += charValue(base[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/**
 * Valida o CNPJ pelos dígitos verificadores.
 * Rejeita também os 14 caracteres repetidos (00000000000000 e afins), que
 * passam no módulo 11 mas não existem na prática.
 */
export function isValidCnpj(value) {
  const v = normalizeCnpj(value);
  if (v.length !== 14) return false;
  if (!/^[0-9A-Z]{12}\d{2}$/.test(v)) return false;   // DV é sempre numérico
  if (/^(.)\1{13}$/.test(v)) return false;             // todos iguais

  const base = v.slice(0, 12);
  const d1 = checkDigit(base);
  const d2 = checkDigit(base + String(d1));
  return v.slice(12) === `${d1}${d2}`;
}

/** Mensagem pronta para a UI (null quando válido). */
export function cnpjError(value) {
  const v = normalizeCnpj(value);
  if (!v) return 'Informe o CNPJ.';
  if (v.length !== 14) return 'CNPJ deve ter 14 caracteres.';
  if (!isValidCnpj(v)) return 'CNPJ inválido — confira os números.';
  return null;
}
