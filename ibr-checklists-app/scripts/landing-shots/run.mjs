/**
 * Capturas da landing a partir das telas REAIS do app.
 *
 *   cd ibr-checklists-app && node scripts/landing-shots/run.mjs
 *
 * Grava em public/landing/*.png. Rode de novo quando uma tela mostrada na
 * landing mudar — a imagem não se atualiza sozinha. As telas também mostram a
 * data da captura ("QUI., 24 DE SET.", "setembro de 2026 (em curso)"): passados
 * uns meses, recapture para a landing não parecer abandonada.
 *
 * PNG em paleta (sharp): mesma resolução, ~70% menor, diferença invisível
 * (PSNR ~50 dB). Importa porque o repositório é público e binário no git é
 * para sempre — cada recaptura soma o tamanho dos arquivos ao histórico. O
 * Next reencoda para WebP/AVIF na entrega; isto é só o tamanho no repo.
 *
 * ── Por que assim ────────────────────────────────────────────────────────────
 *
 * A tela logada não é capturável pelo caminho normal: o login é por PIN, os
 * segredos são Sensitive na Vercel, e o preview fala com o banco de PRODUÇÃO
 * (dados de gente real, e o repositório e a landing são públicos). Então os
 * componentes de verdade — os mesmos que os testes *-render montam — são
 * empacotados com esbuild e montados num Chromium sobre dados fictícios
 * (fixtures.js). O que aparece é o produto; só os dados são de exemplo, e a
 * landing diz isso.
 *
 * Nada sai da máquina: o fetch é dublado no bundle (vitrine.jsx), a URL do
 * Supabase aponta para um domínio `.invalid`, a Inter vem do pacote local
 * (@fontsource-variable/inter) e toda requisição para fora do servidor local é
 * abortada e conta como erro — a captura com erro não grava a PNG.
 */

import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';

const root = process.cwd();
const cache = join(root, 'node_modules', '.cache', 'zc-landing-shots');
const outDir = join(root, 'public', 'landing');
await mkdir(cache, { recursive: true });
await mkdir(outDir, { recursive: true });

// ── Bundle ──────────────────────────────────────────────────────────────────
await build({
  entryPoints: [join(root, 'scripts/landing-shots/vitrine.jsx')],
  outfile: join(cache, 'vitrine.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
  jsx: 'automatic', loader: { '.js': 'jsx' }, logLevel: 'warning',
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://vitrine.invalid"',
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"vitrine"',
  },
  banner: { js: 'globalThis.process = globalThis.process || { env: {} };' },
});

// ── CSS: o globals.css do app, com o Tailwind do projeto ────────────────────
const css = await postcss([tailwindcss({ config: join(root, 'tailwind.config.mjs') }), autoprefixer])
  .process(await readFile(join(root, 'app/globals.css'), 'utf8'), { from: join(root, 'app/globals.css') });
await writeFile(join(cache, 'app.css'), css.css);

// Os ícones do cabeçalho moram em /public. `--font-inter` faz o papel do
// next/font do layout (app/layout.js); a Inter é a variável do pacote local.
const INTER = join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2');
await writeFile(join(cache, 'index.html'), `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>@font-face { font-family: 'Inter'; src: url('/inter.woff2') format('woff2'); font-weight: 100 900; font-style: normal; font-display: block; }</style>
<link rel="stylesheet" href="/app.css">
<style>:root { --font-inter: 'Inter'; } body { margin: 0; background: #F7F9FB; }</style>
</head><body><div id="root"></div><script type="module" src="/vitrine.js"></script></body></html>`);

// ── Servidor estático: o bundle ESM não roda por file:// ────────────────────
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const PUBLIC = resolve(root, 'public');
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path === '/' ? join(cache, 'index.html')
    : path === '/inter.woff2' ? INTER
      : ['/vitrine.js', '/app.css'].includes(path) ? join(cache, path.slice(1))
        : resolve(PUBLIC, '.' + path);
  // Só serve o que é da captura: nada fora de public/ (../ no caminho).
  const permitido = file === INTER || file.startsWith(cache) || file.startsWith(PUBLIC + sep);
  try {
    if (!permitido) throw new Error('fora');
    const body = await readFile(file);  // lê ANTES do writeHead: 404 não derruba a rodada
    res.writeHead(200, { 'Content-Type': TIPOS[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

// ── Capturas ────────────────────────────────────────────────────────────────
// Hoje às 14:32 no relógio da loja — a mesma hora do card do hero.
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const agora = new Date(`${hoje}T14:32:00-03:00`);

const SHOTS = [
  // 1440 e não 1280: a 1280, com três lojas, os botões de loja do cabeçalho
  // invadem "Ajuda" — defeito do app, não da captura.
  { name: 'painel-desktop', tela: 'painel', width: 1440, height: 900 },
  { name: 'checklist-celular', tela: 'checklist', width: 390, height: 844 },
  // Versões de celular do Painel e das Unidades: a 390px de largura o notebook
  // do hero e a moldura de navegador viravam texto de 3px — ilegível. No
  // celular a landing mostra estas no lugar delas.
  { name: 'painel-celular', tela: 'painel', width: 390, height: 844 },
  { name: 'unidades-celular', tela: 'unidades', width: 390, height: 844 },
  // Rolado até os números, a evolução e as conquistas — é o "reconhecimento"
  // que a seção da landing promete. No topo sobrava a fórmula do índice
  // cortada no meio ("Qualidade = 100 − (ressalvas × 2 +").
  { name: 'id-celular', tela: 'id', width: 390, height: 844, scrollY: 1040 },
  // Altura justa ao ranking de 3 lojas: com 900 sobrava um terço de tela vazia.
  { name: 'unidades-desktop', tela: 'unidades', width: 1440, height: 680 },
  // Conferência, não landing (scratch: vai para o cache): o onboarding com a
  // pergunta do tipo de operação, antes e depois de marcar Hamburgueria.
  { name: 'onboarding-segmento', tela: 'onboarding', width: 390, height: 844, scratch: true },
  { name: 'onboarding-hamburgueria', tela: 'onboarding', width: 390, height: 844, scratch: true,
    cliques: ['button[aria-pressed]:has-text("Hamburgueria")', 'text=Continuar →'] },
  // Conferência em tela cheia (26/09/2026), também só conferência: aberta pelo
  // "Conferir próxima" do Painel, no celular e no desktop.
  { name: 'conferencia-celular', tela: 'painel', width: 390, height: 844, scratch: true,
    cliques: ['text=Conferir próxima'] },
  { name: 'conferencia-desktop', tela: 'painel', width: 1440, height: 900, scratch: true,
    cliques: ['text=Conferir próxima'] },
  // Só para escolher recorte: a página inteira do Painel.
  { name: 'painel-inteiro', tela: 'painel', width: 1440, height: 900, fullPage: true, scratch: true },
];
const only = process.argv.slice(2);

const browser = await chromium.launch();
for (const s of SHOTS.filter(x => !only.length || only.includes(x.name))) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height }, deviceScaleFactor: 2,
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo',
  });
  // Rede real bloqueada: qualquer requisição que não seja do servidor local é
  // abortada e vira erro da captura.
  await ctx.route(u => !u.href.startsWith(base), r => r.abort());
  const page = await ctx.newPage();
  await page.clock.setFixedTime(agora);
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('requestfailed', r => erros.push(`rede: ${r.url()}`));
  await page.goto(`${base}#${s.tela}`);
  await page.waitForSelector('body[data-pronto="1"]', { state: 'attached', timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  for (const alvo of s.cliques || []) {
    await page.click(alvo);
    await page.waitForTimeout(150);
  }
  if (s.scrollY) {
    await page.evaluate(y => window.scrollTo(0, y), s.scrollY);
    await page.waitForTimeout(200);
  }
  const file = join(s.scratch ? cache : outDir, `${s.name}.png`);
  const png = await page.screenshot({ fullPage: !!s.fullPage });
  // Com erro, a PNG antiga fica: melhor uma imagem velha e certa do que uma
  // nova quebrada publicada na landing.
  if (!erros.length) {
    await (s.scratch ? writeFile(file, png)
      : sharp(png).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toFile(file));
  } else process.exitCode = 1;
  console.log(`  ${erros.length ? '✗' : '✓'} ${s.name}.png${erros.length ? ` — NÃO gravada: ${erros.join(' | ')}` : ''}`);
  await ctx.close();
}
await browser.close();
server.close();
