/**
 * A conferência da liderança dentro do score de produtividade.
 *
 *   cd ibr-checklists-app && node tests/produtividade-conferencia.spec.mjs
 *
 * ── O que a regra promete (decisão de 24/09/2026) ────────────────────────────
 *
 * Até 24/09 o score de produtividade contava `i.done` e mais nada: uma tarefa
 * REPROVADA pela liderança valia ponto cheio e ainda garantia o bônus do
 * checklist 100%. A régua nova (`REVIEW_POINT_FACTOR`, lib/stats.js):
 *
 *   ressalva  → a tarefa vale metade
 *   reprovada → a tarefa vale o mesmo em NEGATIVO e o checklist perde o bônus
 *
 * com ou sem motivo escrito, e só para veredito dado a partir do corte.
 *
 * ── Por que teste, e não conferência na tela ─────────────────────────────────
 *
 * As três partes da regra que mais facilmente quebram em silêncio são as que
 * nenhum número "parece errado" ao olhar: o corte (um veredito antigo passando a
 * custar), o bônus perdido pelo COLEGA numa rodada colaborativa, e o ritmo
 * negativo. E, como em tests/painel-render.spec.mjs, o bloco 4 renderiza o
 * Painel de verdade: a linha que explica o desconto é promessa de TELA.
 */

import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };
const tem = (html, s) => html.includes(s);
const perto = (a, b) => Math.abs(a - b) < 1e-9;

// Mesma montagem de tests/painel-render.spec.mjs — ver o cabeçalho de lá para o
// porquê de cada opção (React externo, loader jsx em .js, banner do require).
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-prod-conferencia');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { computeProductivity, verdictInForce, reviewSummary, CONFERENCIA_CUTOFF, PRODUCTIVITY_REVIEW_RULE } from '${process.cwd()}/lib/stats.js';
  export { ReportsBody } from '${process.cwd()}/components/painel/ReportsView.js';
  export { useRelatorio } from '${process.cwd()}/components/painel/useRelatorio.js';
  export { UnitsContext } from '${process.cwd()}/components/painel/context.js';
  export { OperationalIdView } from '${process.cwd()}/app/app/page.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const {
  computeProductivity, verdictInForce, reviewSummary,
  CONFERENCIA_CUTOFF, PRODUCTIVITY_REVIEW_RULE, ReportsBody, useRelatorio,
  UnitsContext, OperationalIdView,
} = await import(out);

// ── Fixtures ────────────────────────────────────────────────────────────────
// Julgado DEPOIS do corte (vale) e ANTES dele (não vale).
const DEPOIS = '2026-09-25T12:00:00.000Z';
const ANTES = '2026-09-20T12:00:00.000Z';

// Rodada padrão: 2 tarefas comuns + 1 crítica, todas feitas pela Ana, com
// horário por tarefa (para o ritmo existir). Sem veredito: 1 + 1 + 2 + 3 = 7.
const review = (verdict, reviewedAt = DEPOIS, extra = {}) => ({ verdict, reviewedAt, comMotivo: true, ...extra });
const rodada = (id, reviews = {}, over = {}) => ({
  id, templateId: `t-${id}`, templateName: 'Fechamento', unitId: 'u1', sector: 'Salão',
  date: '2026-09-25', operatorUserId: 'ana', operatorName: 'Ana',
  completedAt: '2026-09-25T20:00:00.000Z',
  items: [
    { id: 'a', done: true, doneBy: 'ana', doneByName: 'Ana', doneAt: '2026-09-25T19:00:00.000Z' },
    { id: 'b', done: true, doneBy: 'ana', doneByName: 'Ana', doneAt: '2026-09-25T19:30:00.000Z' },
    { id: 'c', done: true, critical: true, doneBy: 'ana', doneByName: 'Ana', doneAt: '2026-09-25T20:00:00.000Z' },
  ].map(i => (reviews[i.id] ? { ...i, review: reviews[i.id] } : i)),
  ...over,
});
const ana = list => computeProductivity(list).collaborators.find(e => e.key === 'ana');

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ 1. o valor de cada veredito ═══');

const limpa = ana([rodada('r1')]);
check(limpa.points === 7 && limpa.tasks === 3 && limpa.fullChecklists === 1,
  `sem conferência nada muda: 1 + 1 + 2 + bônus 3 = 7 (${limpa.points})`);
check(limpa.julgadas === 0 && reviewSummary(limpa) === null,
  'e sem nada julgado não há linha de conferência');

const aprovada = ana([rodada('r1', { a: review('aprovado'), b: review('aprovado'), c: review('aprovado') })]);
check(aprovada.points === 7 && aprovada.reviewLoss === 0, 'aprovada vale o mesmo que não julgada');
check(aprovada.aprovadas === 3 && aprovada.julgadas === 3, 'mas conta como julgada e aprovada');

const ressalva = ana([rodada('r1', { a: review('ressalva') })]);
check(perto(ressalva.points, 6.5), `ressalva numa comum vale metade: 0,5 + 1 + 2 + 3 = 6,5 (${ressalva.points})`);
check(ressalva.tasks === 3 && ressalva.fullChecklists === 1,
  'ressalva continua contando como feita e NÃO tira o bônus — o trabalho foi entregue');
check(perto(ressalva.reviewLoss, 0.5), 'o desconto registrado é 0,5');

const ressalvaCritica = ana([rodada('r1', { c: review('ressalva') })]);
check(perto(ressalvaCritica.points, 6), `ressalva numa crítica vale 1 de 2: 1 + 1 + 1 + 3 = 6 (${ressalvaCritica.points})`);

const reprovada = ana([rodada('r1', { a: review('reprovado') })]);
check(reprovada.points === 2, `reprovada vale negativo e derruba o bônus: −1 + 1 + 2 = 2, sem o +3 (${reprovada.points})`);
check(reprovada.fullChecklists === 0, 'o checklist deixa de contar como 100%');
check(reprovada.tasks === 2, 'reprovada não conta como tarefa feita (mesma regra do `taskCounts`)');
check(reprovada.reviewLoss === 5, `desconto = 2 da tarefa (de +1 para −1) + 3 do bônus = 5 (${reprovada.reviewLoss})`);

const reprovadaCritica = ana([rodada('r1', { c: review('reprovado') })]);
check(reprovadaCritica.points === 0 && reprovadaCritica.criticals === 0,
  `crítica reprovada: 1 + 1 − 2 = 0, e sai da contagem de críticas (${reprovadaCritica.points})`);

const semMotivo = ana([rodada('r1', { a: review('reprovado', DEPOIS, { comMotivo: false }) })]);
check(semMotivo.points === 2,
  'apontamento SEM motivo também desconta — diferente da Qualidade do índice, por decisão');

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ 2. o corte: a régua não vale para trás ═══');

const antiga = ana([rodada('r1', { a: review('reprovado', ANTES), b: review('ressalva', ANTES) })]);
check(antiga.points === 7 && antiga.julgadas === 0,
  'veredito dado antes do corte não custa nada — conta como antes');

check(verdictInForce({ review: { verdict: 'reprovado' } }) === null,
  'veredito sem data não pesa: na dúvida não se tira ponto de ninguém');

// O corte é um INSTANTE em Brasília, não o dia do UTC. 01h UTC de 24/09 são
// 22h de 23/09 em Brasília: pelo `slice(0, 10)` passaria a valer, e não pode.
check(CONFERENCIA_CUTOFF === '2026-09-24T00:00:00-03:00', 'corte em 24/09/2026, meia-noite de Brasília');
check(verdictInForce({ review: { verdict: 'ressalva', reviewedAt: '2026-09-24T01:00:00.000Z' } }) === null,
  '22h de 23/09 em Brasília ainda é antes do corte, mesmo sendo 24/09 em UTC');
check(verdictInForce({ review: { verdict: 'ressalva', reviewedAt: '2026-09-24T03:00:00.000Z' } }) === 'ressalva',
  'meia-noite de 24/09 em Brasília já vale');

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ 3. rodada colaborativa, ritmo e score ═══');

// Bruno fez a crítica, Ana as duas comuns. A reprovação é da Ana — mas o
// bônus do checklist 100% some para os DOIS, porque o checklist não foi feito
// inteiro. O desconto do bônus do Bruno aparece como dele, proporcional.
const colab = rodada('r1', { a: review('reprovado') });
colab.items[2] = { ...colab.items[2], doneBy: 'bruno', doneByName: 'Bruno' };
const pc = computeProductivity([colab]);
const pAna = pc.collaborators.find(e => e.key === 'ana');
const pBruno = pc.collaborators.find(e => e.key === 'bruno');
check(pAna.points === 0 && pAna.reprovadas === 1, `Ana: −1 + 1 = 0, sem bônus (${pAna.points})`);
check(pBruno.points === 2 && pBruno.reprovadas === 0, `Bruno: a crítica dele, 2, também sem bônus (${pBruno.points})`);
check(perto(pBruno.reviewLoss, 1), 'o bônus que o Bruno perdeu (1/3 de 3) aparece no desconto dele');

// Mesmo ritmo, mesma quantidade de trabalho — quem foi reprovado fica abaixo.
const outra = (id, user, reviews) => {
  const r = rodada(id, reviews, { operatorUserId: user, operatorName: user });
  r.items = r.items.map(i => ({ ...i, doneBy: user, doneByName: user }));
  return r;
};
const duas = computeProductivity([outra('r1', 'limpo', {}), outra('r2', 'apontado', { a: review('ressalva'), b: review('reprovado') })]);
const sLimpo = duas.collaborators.find(e => e.key === 'limpo');
const sApontado = duas.collaborators.find(e => e.key === 'apontado');
check(sLimpo.score > 100 && sApontado.score < 100,
  `mesmo ritmo de marcação, score separa pela conferência (${sLimpo.score} × ${sApontado.score})`);
check(duas.collaborators[0].key === 'limpo', 'e o ranking de produtividade põe quem não foi apontado em cima');

// Tudo reprovado: saldo negativo de pontos, mas ritmo não existe abaixo de 0.
const tudo = ana([rodada('r1', { a: review('reprovado'), b: review('reprovado'), c: review('reprovado') })]);
check(tudo.points === -4, `saldo aparece negativo, sem esconder a conta (${tudo.points})`);
check(tudo.rate === 0, 'mas o ritmo tem piso em 0 — "−2 pts/h" não é ritmo de ninguém');

check(reviewSummary(ana([rodada('r1', { a: review('ressalva'), b: review('reprovado'), c: review('aprovado') })]))
  === 'Conferência: 1 aprovada · 1 ressalva · 1 reprovada · −5,5 pts',
  'a linha do resumo: contagem por veredito e pontos perdidos (0,5 + 2 + bônus 3)');

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ 4. o Painel mostra de onde veio o desconto ═══');

// O dia é o do relógio da LOJA (CLAUDE.md): `toISOString()` dá o dia UTC, que
// depois das 21h em Brasília já é amanhã — as rodadas da fixture caíam no
// futuro da loja e o teste falhava só à noite (24/09/2026, 21h30).
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const unit = { id: 'u1', name: 'Loja Teste', color: '#8a2be2', sectors: ['Salão'], timezone: 'America/Sao_Paulo' };
const templates = [{
  id: 't-p', unitId: 'u1', sector: 'Salão', name: 'Fechamento', shift: 'Noite', active: true,
  items: [{ id: 'a', text: 'Varrer' }, { id: 'b', text: 'Lixo' }, { id: 'c', text: 'Gás', critical: true }],
}];
const naTela = { ...rodada('p', { b: review('reprovado', new Date().toISOString()) }), templateId: 't-p', date: hoje };
const base = {
  unit, templates, completions: [naTela], closures: [],
  users: [{ id: 'ana', name: 'Ana', role: 'colaborador', unitId: 'u1' }],
  canSeeAllUnits: true, allUnitsSelected: false,
  currentUser: { id: 'g1', name: 'Chefe', role: 'gestao', unitId: null },
  onReview: () => {}, disputes: [], onResolveDispute: () => {},
};
const Harness = () => h(ReportsBody, { ...base, embedded: true, segment: 'pessoas', rel: useRelatorio(base) });
const html = renderToStaticMarkup(h(Harness));

check(tem(html, 'Produtividade · score 100 = média da empresa'), 'o bloco de produtividade renderiza');
check(tem(html, 'Conferência: 1 reprovada · −5 pts'),
  'a linha do colaborador diz quantas foram reprovadas e quanto custou');
check(tem(html, PRODUCTIVITY_REVIEW_RULE.slice(0, 60)),
  'e a explicação do score traz a régua da conferência — gerada da mesma constante');

// ═══════════════════════════════════════════════════════════════════════════
console.log('═══ 5. o Meu ID mostra o desconto a quem foi apontado ═══');

// É a tela que a PESSOA medida abre. Um score mais baixo sem a linha que diz
// "1 reprovada · −5 pts" é exatamente o ressentimento que a conferência não
// pode produzir.
const meuId = over => renderToStaticMarkup(h(UnitsContext.Provider, { value: [unit] },
  h(OperationalIdView, {
    targetUser: { id: 'ana', name: 'Ana', role: 'colaborador', unitId: 'u1' },
    viewer: { id: 'ana' }, templates, accent: '#8a2be2', ...over,
  })));
const idApontada = meuId({ completions: [naTela] });
check(tem(idApontada, 'Score de produtividade'), 'o card do score renderiza');
check(tem(idApontada, 'Conferência: 1 reprovada · −5 pts'), 'com a linha do desconto');
check(tem(idApontada, PRODUCTIVITY_REVIEW_RULE.slice(0, 60)), 'e a régua por extenso');
const idLimpa = meuId({ completions: [{ ...rodada('p'), templateId: 't-p', date: hoje }] });
check(!tem(idLimpa, 'Conferência:'), 'sem nada julgado, nenhuma linha de conferência');

await rm(dir, { recursive: true, force: true });
console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
