/**
 * CENTRAL DE AJUDA — loader de conteúdo
 * ─────────────────────────────────────────────────────────
 * Artigos vivem em `content/ajuda/<categoria>/<slug>.md` com frontmatter
 * (title, description, category, order, updatedAt, featured). Este módulo é
 * SERVER-ONLY (usa fs) — importe apenas em Server Components e rotas de API.
 * A v1 é estática (SSG); se um dia migrar ao Supabase, só este arquivo muda.
 */

import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const CONTENT_DIR = path.join(process.cwd(), 'content', 'ajuda');

// Registro das categorias — ordem e texto dos cards da home.
// `icon` é o nome do ícone em lucide-react (resolvido na página).
export const CATEGORIES = [
  {
    slug: 'primeiros-passos',
    name: 'Primeiros passos',
    description: 'Acesse com o código da empresa, instale no celular e faça o primeiro login.',
    icon: 'Rocket',
  },
  {
    slug: 'usando-checklists',
    name: 'Usando os checklists',
    description: 'O dia a dia de quem executa: abrir, marcar itens, anexar fotos e concluir.',
    icon: 'ClipboardCheck',
  },
  {
    slug: 'para-gestores',
    name: 'Para gestores',
    description: 'Crie checklists, organize lojas e setores, aprove acessos e acompanhe a equipe.',
    icon: 'Settings2',
  },
  {
    slug: 'conta-e-acesso',
    name: 'Conta e acesso',
    description: 'PIN, código da empresa, alteração de dados e problemas de login.',
    icon: 'KeyRound',
  },
  {
    slug: 'problemas-comuns',
    name: 'Problemas comuns',
    description: 'Sem internet na loja, app desatualizado e outras soluções rápidas.',
    icon: 'LifeBuoy',
  },
];

export function getCategory(slug) {
  return CATEGORIES.find(c => c.slug === slug) || null;
}

// YAML sem aspas vira Date no gray-matter; normaliza para 'YYYY-MM-DD'.
function normalizeDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

function parseFile(categorySlug, filename) {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, categorySlug, filename), 'utf8');
  const { data, content } = matter(raw);
  const slug = filename.replace(/\.md$/, '');
  return {
    slug,
    category: categorySlug,
    title: data.title || slug,
    description: data.description || '',
    order: data.order ?? 999,
    updatedAt: normalizeDate(data.updatedAt),
    featured: !!data.featured,
    content,
    url: `/ajuda/${categorySlug}/${slug}`,
  };
}

// Artigos de uma categoria, ordenados por `order` (sem o corpo por padrão).
export function getArticles(categorySlug) {
  const dir = path.join(CONTENT_DIR, categorySlug);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => parseFile(categorySlug, f))
    .sort((a, b) => a.order - b.order);
}

export function getArticle(categorySlug, slug) {
  const file = path.join(CONTENT_DIR, categorySlug, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  return parseFile(categorySlug, `${slug}.md`);
}

export function getAllArticles() {
  return CATEGORIES.flatMap(c => getArticles(c.slug));
}

export function getFeaturedArticles() {
  return getAllArticles().filter(a => a.featured);
}

// Artigos relacionados: mesma categoria, exclui o próprio, na ordem da categoria.
export function getRelatedArticles(article, limit = 4) {
  return getArticles(article.category)
    .filter(a => a.slug !== article.slug)
    .slice(0, limit);
}

// Índice para a busca client-side (Fuse.js): corpo em texto puro, sem markdown.
function stripMarkdown(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, ' ')          // comentários (TODO: screenshot)
    .replace(/```[\s\S]*?```/g, ' ')           // blocos de código
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')     // imagens
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // links → texto
    .replace(/[#>*_`~-]/g, ' ')                // marcação
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSearchIndex() {
  return getAllArticles().map(a => ({
    title: a.title,
    description: a.description,
    body: stripMarkdown(a.content),
    url: a.url,
    category: a.category,
    categoryName: getCategory(a.category)?.name || a.category,
  }));
}
