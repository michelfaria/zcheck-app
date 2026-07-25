/**
 * Baseline visual — fase 0 do plano em docs/REVISAO_DESKTOP_v1.md.
 *
 * Para que serve: a regra dura do projeto é que a camada desktop NÃO pode mudar
 * o layout do celular. Sem diff de pixel, "o mobile não mudou" é afirmação, não
 * medição — e uma afirmação dessas já falhou uma vez neste trabalho (duas barras
 * flutuantes moveram 8px numa substituição em bloco).
 *
 * Como usar:
 *   1) suba o dev server:      npm run dev
 *   2) grave o baseline:       npx playwright test --update-snapshots
 *   3) depois de mexer em CSS: npx playwright test
 *
 * LIMITE CONHECIDO: o login depende de PIN validado no servidor e os segredos
 * são Sensitive (só produção), então as telas LOGADAS — Painel, Relatórios,
 * Gerenciar, Usuários, Equipe — não são alcançáveis aqui. Este baseline cobre
 * as rotas públicas. Para as logadas, rode contra um deploy de preview com
 * BASE_URL apontando para ele e um PIN de teste em ZC_PIN.
 */

const { test, expect } = require('@playwright/test');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

/**
 * Espera a altura do documento parar de mudar.
 *
 * Por que existe: `cadastro @ mobile` falhava mais ou menos 1 em 3, sempre com
 * o mesmo diff de 87px. Não era regressão — é o widget do Cloudflare Turnstile,
 * que monta por volta de 1,3s depois do load e empurra 71px de iframe mais 16
 * de margem. O `waitForTimeout(1200)` fixo caía bem em cima dessa fronteira,
 * então o screenshot saía ora antes, ora depois do widget entrar.
 *
 * Esperar por um seletor do Turnstile resolveria só esta rota: qualquer coisa
 * que monte tarde — outro iframe, um mapa, imagem sem dimensão declarada —
 * reintroduz a mesma corrida noutra página. A altura do documento é o sintoma
 * comum a todas, então é nela que se espera.
 *
 * Estabilizar não é garantia absoluta (um widget muito lento pode entrar depois
 * da janela), mas transforma um timeout que ACERTA por sorte num que espera
 * pelo evento real. Se estourar o teto, devolve a última medida e o teste segue
 * — a mesma tolerância que o `settle` já tinha.
 */
async function waitForStableHeight(page, { interval = 200, samples = 4, timeout = 8000 } = {}) {
  const deadline = Date.now() + timeout;
  let last = -1;
  let stable = 0;
  while (Date.now() < deadline) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    stable = h === last ? stable + 1 : 0;
    if (stable >= samples) return h;
    last = h;
    await page.waitForTimeout(interval);
  }
  return last;
}

const ROUTES = [
  { name: 'landing', path: '/' },
  { name: 'app-login', path: '/app', settle: 'select, a[href*="cadastro"]' },
  { name: 'entrar', path: '/entrar' },
  { name: 'ajuda', path: '/ajuda' },
  { name: 'comecar', path: '/comecar' },
  { name: 'cadastro', path: '/cadastro' },
  { name: 'lista', path: '/lista' },
  { name: 'termos', path: '/termos' },
  { name: 'privacidade', path: '/privacidade' },
];

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`${route.name} @ ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // `domcontentloaded` e não `networkidle`: /comecar e /cadastro mantêm
      // requisição em aberto (verificação de estado), e networkidle nunca chega.
      await page.goto(`${BASE}${route.path}`, { waitUntil: 'domcontentloaded' });

      // A fonte é carregada via next/font: sem esperar, o primeiro screenshot
      // pega o fallback e todo diff seguinte acusa mudança que não houve.
      await page.evaluate(() => document.fonts.ready);
      // Deixa o React hidratar e pintar antes de fotografar.
      await page.waitForTimeout(1200);

      // /app busca a lista de usuários no Supabase antes de montar o seletor de
      // login. Sem esperar por isso, o screenshot pega ora o estado de carga,
      // ora o seletor pronto — e o baseline vira ruído em vez de medida.
      if (route.settle) {
        await page.waitForSelector(route.settle, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(800);
      }

      // Último a entrar pode chegar depois de tudo acima (ver waitForStableHeight).
      await waitForStableHeight(page);

      // Neutraliza o que muda sozinho e produziria falso positivo: data do dia
      // no cabeçalho e qualquer animação em curso.
      await page.addStyleTag({
        content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
      });

      await expect(page).toHaveScreenshot(`${route.name}-${vp.name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.002,
        timeout: 20000,
      });
    });
  }
}
