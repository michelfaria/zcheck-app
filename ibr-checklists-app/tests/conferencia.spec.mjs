/**
 * Teste de lib/conferencia.js — o que a fila mostra primeiro.
 *
 *   cd ibr-checklists-app && node tests/conferencia.spec.mjs
 *
 * Isto decide por onde a liderança começa todo dia. Errar a ordem não quebra
 * nada visivelmente: só faz alguém gastar o melhor da atenção no lugar errado,
 * todo dia, sem perceber.
 */
import { classificarRodada, gravidadeDe, agruparPorChecklist, GRAVIDADE } from '../lib/conferencia.js';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

const item = (id, extra = {}) => ({ id, done: true, ...extra });
const rodada = (id, itens, extra = {}) => ({
  id, templateId: 't1', templateName: 'Fechamento', sector: 'Cozinha',
  date: '2026-08-01', operatorName: 'Ana', items: itens, ...extra,
});

console.log('═══ classificação de rodada ═══');

const limpa = classificarRodada(rodada('a', [item('i1'), item('i2')]), [], false);
check(limpa.limpa === true, 'tudo feito, no prazo, sem nota: rodada limpa');
check(gravidadeDe(limpa) === 0, 'gravidade 0');

const critica = classificarRodada(rodada('b', [item('i1', { critical: true, done: false })]), [], false);
check(critica.criticoPendente && critica.incompleta, 'crítico não executado marca os dois sinais');
check(gravidadeDe(critica) === GRAVIDADE.criticoPendente + GRAVIDADE.incompleta,
  `gravidade soma os sinais (${gravidadeDe(critica)})`);

const semProva = classificarRodada(
  rodada('c', [item('i1', { hasPhoto: false })]),
  [{ id: 'i1', photoRequired: true }], false);
check(semProva.semFoto === true, 'marcou como feito e não anexou a foto exigida');
check(!semProva.limpa, 'e por isso não é limpa');

const comProva = classificarRodada(
  rodada('d', [item('i1', { hasPhoto: true })]),
  [{ id: 'i1', photoRequired: true }], false);
check(comProva.semFoto === false, 'com a foto, o sinal some');

const naoExigia = classificarRodada(rodada('e', [item('i1', { hasPhoto: false })]), [{ id: 'i1' }], false);
check(naoExigia.limpa === true, 'item que NÃO exige foto não vira pendência por falta dela');

const comNota = classificarRodada(rodada('f', [item('i1', { note: 'geladeira 2 fazendo barulho' })]), [], false);
check(comNota.notaOperador && !comNota.limpa,
  'nota do operador tira a rodada de "limpa" — é o único sinal que vem de baixo');
const notaVazia = classificarRodada(rodada('g', [item('i1', { note: '   ' })]), [], false);
check(notaVazia.limpa === true, 'nota só com espaço não conta');

const atrasada = classificarRodada(rodada('h', [item('i1')]), [], true);
check(atrasada.foraDoPrazo && !atrasada.limpa, 'fora do prazo entra pelo parâmetro, não recalculado aqui');

console.log('═══ ordenação da fila ═══');

// O caso que o desenho existe para resolver: um checklist com MUITAS rodadas
// tranquilas não pode ficar acima de um com poucas e graves.
const f = (o) => classificarRodada(rodada('x', o.itens || [item('i1')]), o.tpl || [], o.atraso || false);
const muitasLimpas = Array.from({ length: 20 }, (_, n) => ({
  c: { ...rodada(`m${n}`, [item('i1')]), templateId: 'volumoso', templateName: 'Abertura', date: `2026-08-${String(n + 1).padStart(2, '0')}` },
  f: f({}),
}));
const poucasGraves = [0, 1].map(n => ({
  c: { ...rodada(`g${n}`, []), templateId: 'grave', templateName: 'Fechamento', date: `2026-08-0${n + 1}` },
  f: f({ itens: [item('i1', { critical: true, done: false })] }),
}));

const grupos = agruparPorChecklist([...muitasLimpas, ...poucasGraves]);
check(grupos[0].titulo === 'Fechamento',
  `o grupo GRAVE vem primeiro, mesmo com 2 rodadas contra 20 (1º = ${grupos[0].titulo})`);
check(grupos[0].rodadas.length === 2 && grupos[1].rodadas.length === 20,
  'e o volumoso vai para o fim');
check(grupos[1].gravidade === 0 && grupos[1].limpas === 20, 'o volumoso é reconhecido como sem sinal');

// Mesmo checklist em dois setores = duas rotinas.
const doisSetores = agruparPorChecklist([
  { c: { ...rodada('s1', [item('i1')]), sector: 'Cozinha' }, f: f({}) },
  { c: { ...rodada('s2', [item('i1')]), sector: 'Salão' }, f: f({}) },
]);
check(doisSetores.length === 2, 'o mesmo checklist em dois setores vira dois grupos');

// Empate de gravidade: a pendência mais ANTIGA primeiro.
const empate = agruparPorChecklist([
  { c: { ...rodada('n1', []), templateId: 'novo', templateName: 'Novo', date: '2026-08-09' }, f: f({ atraso: true }) },
  { c: { ...rodada('v1', []), templateId: 'velho', templateName: 'Velho', date: '2026-08-02' }, f: f({ atraso: true }) },
]);
check(empate[0].titulo === 'Velho',
  `empate de gravidade desempata pela pendência mais antiga (1º = ${empate[0].titulo})`);

// Dentro do grupo, o pior caso em cima.
const dentro = agruparPorChecklist([
  { c: { ...rodada('leve', []), date: '2026-08-01' }, f: f({ atraso: true }) },
  { c: { ...rodada('pior', []), date: '2026-08-05' }, f: f({ itens: [item('i1', { critical: true, done: false })] }) },
]);
check(dentro[0].rodadas[0].c.id === 'pior',
  'dentro do grupo, a rodada mais grave vem primeiro — não a mais recente');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
if (!ok) process.exitCode = 1;
