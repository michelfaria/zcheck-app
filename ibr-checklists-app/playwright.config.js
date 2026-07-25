const { defineConfig } = require('@playwright/test');

/** Config do baseline visual. Ver tests/visual-baseline.spec.js. */
module.exports = defineConfig({
  testDir: './tests',
  // Determinismo antes de velocidade: screenshot com workers em paralelo
  // compete por CPU e produz diferença de rasterização entre execuções.
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: {
    // `deviceScaleFactor: 1` mantém o arquivo pequeno e o diff estável entre
    // máquinas com e sem tela retina.
    deviceScaleFactor: 1,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
});
