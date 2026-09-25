/**
 * Deploy por ambiente — a trava do fluxo dev → homolog → main (CLAUDE.md,
 * seção "Ambientes").
 *
 *   cd ibr-checklists-app && npm run deploy:homolog              (HEAD = origin/homolog)
 *   cd ibr-checklists-app && npm run deploy:homolog -- --hotfix  (HEAD nasce da origin/main)
 *   cd ibr-checklists-app && npm run deploy:prod                 (HEAD = origin/main, já em homolog)
 *
 * ── Por que existe ───────────────────────────────────────────────────────────
 *
 * `npx vercel --prod` publica a ÁRVORE do diretório atual, não a main. Em
 * 19/08/2026 a Conferência foi publicada de uma branch não mesclada e o deploy
 * seguinte, feito da main, tirou a tela do ar sem ninguém tocar no código. E
 * várias sessões deployam o mesmo projeto: o último --prod vence. A regra é
 * que produção só recebe o commit que passou por homolog — este script recusa
 * o resto antes de chamar a Vercel.
 *
 * Homolog é um deploy de PREVIEW da Vercel com endereço fixo: a cada deploy o
 * alias abaixo passa a apontar para ele. Não é sandbox: as variáveis de Preview
 * são as de produção (Supabase, Mercado Pago, Brevo) — ver o CLAUDE.md.
 *
 * O que fica travado:
 *   · nada não commitado em ibr-checklists-app/ (o deploy sairia ≠ do commit);
 *   · homolog: HEAD = origin/homolog — ou, com --hotfix, HEAD contém a origin/main;
 *     roda `npm run verify` antes (lint + testes + build);
 *   · produção: HEAD = origin/main e a origin/main está dentro da origin/homolog.
 *
 * Saída 0 = publicado; 1 = recusado pela trava ou falha no caminho.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const HOMOLOG_ALIAS = 'zcheck-homolog.vercel.app';

const [alvo, ...flags] = process.argv.slice(2);
const hotfix = flags.includes('--hotfix');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const contem = (ancestral, ponta) =>
  spawnSync('git', ['merge-base', '--is-ancestor', ancestral, ponta]).status === 0;
const curto = (sha) => sha.slice(0, 7);

function recusa(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function roda(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) recusa(`\`${cmd} ${args.join(' ')}\` saiu com ${r.status}`);
}

if (alvo !== 'homolog' && alvo !== 'producao') {
  recusa('uso: node scripts/ambiente/deploy.mjs homolog [--hotfix] | producao');
}
if (!existsSync('.vercel/project.json')) {
  recusa('rode de ibr-checklists-app/ — é onde está o .vercel/project.json');
}

git('fetch', '--quiet', 'origin');
const head = git('rev-parse', 'HEAD');

const sujo = git('status', '--porcelain', '--', '.');
if (sujo) {
  recusa(`mudança não commitada em ibr-checklists-app/ — o deploy sairia diferente do commit:\n${sujo}`);
}

if (alvo === 'homolog') {
  const homolog = git('rev-parse', 'origin/homolog');
  if (hotfix) {
    if (!contem('origin/main', 'HEAD')) {
      recusa('hotfix nasce da origin/main: `git checkout -b hotfix/<nome> origin/main`');
    }
  } else if (head !== homolog) {
    recusa(
      `HEAD (${curto(head)}) ≠ origin/homolog (${curto(homolog)}). Homolog publica a branch homolog:\n` +
      '  git checkout --detach origin/homolog\n' +
      '(correção urgente a partir da main: --hotfix)'
    );
  }

  roda('npm', ['run', 'verify']);

  // Sem TTY a Vercel escreve só a URL do deploy no stdout; o progresso vai no stderr.
  const r = spawnSync('npx', ['vercel', '--yes', '--meta', 'ambiente=homolog', '--meta', `sha=${head}`], {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
  });
  if (r.status !== 0) recusa(`\`npx vercel\` saiu com ${r.status}`);
  const url = r.stdout.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('https://')).pop();
  if (!url) recusa(`não achei a URL do deploy na saída da Vercel:\n${r.stdout}`);

  roda('npx', ['vercel', 'alias', 'set', url, HOMOLOG_ALIAS]);

  console.log(`
✓ homolog no ar: https://${HOMOLOG_ALIAS}  (commit ${curto(head)}${hotfix ? ', hotfix' : ''})
  deploy: ${url}
  Dados de PRODUÇÃO: testar só em checklist descartável; "Assinar" cobra de verdade.
  O que entra se for aprovado: git log --oneline origin/main..${hotfix ? 'HEAD' : 'origin/homolog'}
`);
} else {
  const main = git('rev-parse', 'origin/main');
  if (head !== main) {
    recusa(
      `produção sai da origin/main (${curto(main)}); HEAD é ${curto(head)}.\n` +
      '  git checkout --detach origin/main'
    );
  }
  if (!contem('origin/main', 'origin/homolog')) {
    recusa(
      'a origin/main tem commit que não passou por homolog. Mescle a origin/main em dev,\n' +
      'promova dev → homolog e homologue antes de publicar.'
    );
  }

  roda('npx', ['vercel', '--prod', '--yes', '--meta', 'ambiente=producao', '--meta', `sha=${head}`]);

  console.log(`
✓ produção publicada do commit ${curto(head)}.
  Conferir: npx vercel ls ibr-checklists-app --prod (deploy mais novo que o seu = outra sessão)
  e o bundle servido em https://ilhabelarepublic.zcheckapp.com/app (trecho ASCII).
`);
}
