import { CATEGORIES, getAllArticles } from '../lib/ajuda';

// Sitemap do domínio principal: páginas públicas + Central de Ajuda.
// Rotas de app/tenant (/app, /admin, subdomínios) ficam de fora de propósito.
const BASE = 'https://zcheckapp.com';

export default function sitemap() {
  const staticPages = ['', '/lista', '/entrar', '/termos', '/privacidade', '/ajuda'].map(p => ({
    url: `${BASE}${p}`,
    changeFrequency: 'monthly',
    priority: p === '' ? 1 : 0.6,
  }));

  const categories = CATEGORIES.map(c => ({
    url: `${BASE}/ajuda/${c.slug}`,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  const articles = getAllArticles().map(a => ({
    url: `${BASE}${a.url}`,
    lastModified: a.updatedAt ? new Date(`${a.updatedAt}T00:00:00`) : undefined,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

  return [...staticPages, ...categories, ...articles];
}
