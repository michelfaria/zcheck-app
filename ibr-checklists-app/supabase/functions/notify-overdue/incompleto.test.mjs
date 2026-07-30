/**
 * Teste da régua de "previstas do dia" da notify-overdue.
 *
 *   cd ibr-checklists-app
 *   node supabase/functions/notify-overdue/incompleto.test.mjs
 *
 * Por que existe: `previstasDoDia` é uma REIMPLEMENTAÇÃO de
 * `isItemApplicable`/`applicableItems` do app. A função é deployada isolada e não
 * pode importar `lib/`, então o risco não é a lógica ser difícil — é ela divergir
 * do app sem ninguém notar, e o alerta de "entregue incompleto" passar a cobrar
 * tarefa que nem era prevista naquele dia.
 *
 * O teste lê o PRÓPRIO index.ts e tira os tipos, em vez de copiar a função: uma
 * cópia passaria a valer sozinha no dia em que o original mudasse.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(fileURLToPath(new URL('./index.ts', import.meta.url)), 'utf8');

const extrair = (nome) => {
  const i = src.indexOf(nome);
  if (i < 0) throw new Error(`não achei ${nome} em index.ts`);
  // Do início da declaração até a linha em branco que a fecha.
  const inicio = src.lastIndexOf('\n', src.lastIndexOf('\n', i) + 1) + 1;
  const fim = src.indexOf('\n\n', i);
  return src.slice(inicio, fim);
};

// O lookahead no lugar de `\b` é necessário: depois de `string[]` vem `]`, que
// não é caractere de palavra, então `\b` falhava, o motor voltava para a
// alternativa `string` e sobrava um `[]` solto na assinatura.
const semTipos = (js) => js
  .replace(/:\s*(any|string\[\]|string|number|boolean)(?=[\s,)=;{]|$)/g, '');

const codigo = semTipos(
  `${extrair('const diaDaSemana =')}\n${extrair('function previstasDoDia')}\nreturn { diaDaSemana, previstasDoDia };`,
);
const { diaDaSemana, previstasDoDia } = new Function(codigo)();

let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

console.log('═══ notify-overdue: previstas do dia ═══');

// 2026-07-30 é uma quinta-feira (4). 2026-08-01, sábado (6).
check(diaDaSemana('2026-07-30') === 4, 'quinta-feira é 4');
check(diaDaSemana('2026-08-01') === 6, 'sábado é 6');

const t = (items, name = 'Rotina — Caixa') => ({ name, items });

check(
  previstasDoDia(t([{ id: 'a' }, { id: 'b' }]), '2026-07-30').join() === 'a,b',
  'item sem recorrência vale todo dia',
);
check(
  previstasDoDia(t([{ id: 'a', recurrence: [] }]), '2026-07-30').join() === 'a',
  'recorrência vazia = todo dia (não "nenhum dia")',
);
check(
  previstasDoDia(t([{ id: 'a', recurrence: [4] }, { id: 'b', recurrence: [6] }]), '2026-07-30').join() === 'a',
  'na quinta, só o item de quinta é previsto',
);
check(
  previstasDoDia(t([{ id: 'a', recurrence: [1, 2, 3] }]), '2026-07-30').length === 0,
  'item que não cai no dia não é cobrado — é o que evita alerta falso',
);

// `appearsIn` cruza com o tipo do checklist, deduzido do NOME (como no app).
check(
  previstasDoDia(t([{ id: 'a', appearsIn: ['abertura'] }], 'Salão — Abertura'), '2026-07-30').join() === 'a',
  'appearsIn casa com o tipo lido do nome do checklist',
);
check(
  previstasDoDia(t([{ id: 'a', appearsIn: ['fechamento'] }], 'Salão — Abertura'), '2026-07-30').length === 0,
  'appearsIn de outro tipo exclui o item',
);
check(
  previstasDoDia(t([{ id: 'a', appearsIn: ['fechamento'] }], 'Rotina — Caixa'), '2026-07-30').join() === 'a',
  'checklist sem tipo no nome não filtra por appearsIn (mesma regra do app)',
);

check(previstasDoDia(t([]), '2026-07-30').length === 0, 'checklist sem item não prevê nada');
check(previstasDoDia({ name: 'x' }, '2026-07-30').length === 0, 'items ausente não quebra');
check(
  previstasDoDia(t([{ recurrence: [4] }, { id: 'b' }]), '2026-07-30').join() === 'b',
  'item sem id é descartado (não viraria pendência rastreável)',
);

// ── A conta do alerta, com a régua acima ─────────────────────────────────────
// Espelha o que o index.ts faz: união das tarefas feitas no dia vs previstas.
const tpl = t([{ id: 'a' }, { id: 'b' }, { id: 'c', recurrence: [6] }]);
const previstas = previstasDoDia(tpl, '2026-07-30');   // a, b — 'c' é de sábado
const feitas = new Set(['a']);
const pendentes = previstas.filter(id => !feitas.has(id));
check(previstas.length === 2 && pendentes.length === 1,
  'entregue 1 de 2: alerta de incompleto com 1 pendente (o item de sábado fica fora)');

const feitasTudo = new Set(['a', 'b']);
check(previstas.filter(id => !feitasTudo.has(id)).length === 0,
  'entregue 2 de 2: nenhum alerta, mesmo com item de outro dia no checklist');

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
if (!ok) process.exitCode = 1;
