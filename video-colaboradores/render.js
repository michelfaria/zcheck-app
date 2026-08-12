// Renderiza video.html frame a frame (determinístico via window.__seek) em JPEGs.
// Uso: node render.js [fps]
const { chromium } = require('/Users/michelfaria/Documents/Site ZCheck/ibr-checklists-app/node_modules/playwright');
const fs = require('fs');
const path = require('path');

const FPS = Number(process.argv[2] || 30);
const OUT = process.env.FRAME_DIR || path.join(__dirname, 'frames');

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
  });
  await page.goto('file://' + path.join(__dirname, 'video.html'));
  await page.waitForFunction(() => typeof window.__seek === 'function');
  const dur = await page.evaluate(() => window.__DUR);
  const total = Math.round(dur * FPS);
  console.log(`${total} frames @ ${FPS}fps (${dur}s)`);

  for (let i = 0; i < total; i++) {
    await page.evaluate(t => window.__seek(t), i / FPS);
    await page.screenshot({
      path: path.join(OUT, String(i).padStart(5, '0') + '.jpg'),
      type: 'jpeg',
      quality: 95,
    });
    if (i % 90 === 0) console.log(`  ${i}/${total}`);
  }
  await browser.close();
  console.log('frames ok');
})();
