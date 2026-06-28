/**
 * TENANT DETECTION
 * ─────────────────────────────────────────────────────────
 * Detecta a empresa pelo hostname e retorna o slug do banco.
 * Para adicionar novo cliente: adicione uma entrada no DOMAIN_MAP.
 * ─────────────────────────────────────────────────────────
 */

// Mapa hostname → slug da empresa no banco (tabela companies.slug)
const DOMAIN_MAP = {
  // IBR — domínio principal Zchek
  'ilhabelarepublic.zcheckapp.com': 'ibr',

  // IBR — domínio legado
  'checklists.ilhabelarepublic.com': 'ibr',

  // Desenvolvimento
  'localhost': 'ibr',      // carrega IBR em dev para facilitar testes
  '127.0.0.1': 'ibr',

  // Vercel preview
  'ibr-checklists-app.vercel.app': 'ibr',
};

export function getTenantSlug() {
  if (typeof window === 'undefined') return 'ibr'; // SSR fallback
  const hostname = window.location.hostname;

  // Match exato no mapa — tem prioridade
  if (hostname in DOMAIN_MAP) return DOMAIN_MAP[hostname];

  // Wildcard *.zcheckapp.com
  // Subdomínio = slug da empresa no banco
  // Ex: ilhabelarepublic.zcheckapp.com → slug 'ilhabelarepublic'
  // Adicione entrada no DOMAIN_MAP se o slug no banco for diferente do subdomínio
  if (hostname.endsWith('.zcheckapp.com')) {
    const sub = hostname.replace('.zcheckapp.com', '');
    if (sub && sub !== 'www') return sub;
  }

  return 'ibr'; // fallback seguro
}
