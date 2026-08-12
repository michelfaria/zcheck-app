// Gera video.html autocontido (logo embutido em base64) a partir do template.
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const logo = fs.readFileSync(
  path.join(dir, '..', 'ibr-checklists-app', 'public', 'zcheck-logo.png')
).toString('base64');

const html = fs.readFileSync(path.join(dir, 'video.template.html'), 'utf8')
  .split('__LOGO__').join(`data:image/png;base64,${logo}`);

fs.writeFileSync(path.join(dir, 'video.html'), html);
console.log('video.html', (html.length / 1024).toFixed(0) + 'kB');
