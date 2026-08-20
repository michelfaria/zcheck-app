/**
 * Teste de RENDERIZAÇÃO do carryover — o editor e a tela de execução.
 *
 *   cd ibr-checklists-app && node tests/carryover-render.spec.mjs
 *
 * Existe pela armadilha nº 1 do HANDOFF_PAINEL_CONSOLIDADO: build limpo não
 * prova que a tela renderiza. A função `pendenciasArrastadas` tem 21 casos em
 * tests/checklists.spec.js, mas ela só é ALIMENTADA se o gestor conseguir ligar
 * a flag — e um controle que não pinta deixa a feature inteira inerte sem que
 * lint, build ou teste de lógica reclamem.
 *
 * O que se afirma aqui é a PRIMEIRA pintura (efeitos não rodam em SSR, de
 * propósito): o controle existe, reflete o estado do item, e o bloco de
 * recorrência que ele acompanha continua inteiro.
 *
 * Não cobre o editor do "+ Novo checklist": lá o mesmo controle mora atrás do
 * painel `novoOptsOpen`, que só abre por clique — fora do alcance de SSR.
 */

import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

// Mesma estratégia de bundle do painel-render: dentro do projeto (para o Node
// achar `node_modules`), React externo (duas cópias quebram os hooks), `.js`
// lido como JSX, e um `require` de verdade para o build CJS do lucide-react.
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-editor-render');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `
  export { TemplateEditor, ExecutionScreen } from '${process.cwd()}/app/app/page.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { TemplateEditor, ExecutionScreen } = await import(out);

// ── Fixtures ────────────────────────────────────────────────────────────────
const unit = { id: 'u1', name: 'Loja Teste', color: '#8a2be2', sectors: ['Cozinha'], timezone: 'America/Sao_Paulo' };
const LABEL = 'Se não for feita, cobrar no dia seguinte';

const pintar = (item) => renderToStaticMarkup(h(TemplateEditor, {
  unit, sector: 'Cozinha', allTemplates: [], onSave: () => {}, onCancel: () => {},
  template: { id: 't1', unitId: 'u1', sector: 'Cozinha', name: 'Limpeza — Cozinha', deadline: '08:00', items: [item] },
}));

// Um item "limpo": só o que o teste liga aparece marcado, então contar
// `checked` distingue a caixa do carryover das de crítico/obrigatório/foto.
const itemBase = { id: 'coifa', text: 'Limpar a coifa', critical: false, required: false, photoRequired: false, recurrence: [1, 3, 5] };
const marcadas = (html) => (html.match(/checked=""/g) || []).length;

console.log('\neditor de tarefa — flag de carryover');

const desligada = pintar(itemBase);
check(desligada.includes(LABEL), 'o controle aparece no editor');
check(marcadas(desligada) === 0, 'nasce desmarcado — arrastar é opt-in');
check(!desligada.includes('Cobra a partir de'), 'sem a flag, nenhuma promessa de cobrança na tela');

const ligada = pintar({ ...itemBase, carryover: true, carryoverSince: '2026-08-03' });
check(marcadas(ligada) === 1, 'com a flag ligada, a caixa vem marcada');
check(ligada.includes('Cobra a partir de 03/08'), 'a tela mostra a data de ativação, em dd/mm');
check(ligada.includes('por até 7 dias'), 'e o teto, que é o limite real da varredura');
check(ligada.includes('Dia de folga da loja não conta'), 'e a folga, que é a exceção que o gestor precisa saber');

// A data de corte é o que impede a estreia cobrando dívida velha: se ela sumir
// da tela, o gestor liga a flag sem saber de quando o app vai cobrar.
const semCarimbo = pintar({ ...itemBase, carryover: true });
check(semCarimbo.includes('Cobra a partir de'), 'item legado sem carimbo ainda anuncia a partir de quando cobra');

// O controle novo entrou no bloco de recorrência — ele não pode ter empurrado
// nada: os sete botões de dia da semana continuam lá, e o resumo também.
const S = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
check(S.every((_, i) => ligada.includes(`>${S[i]}</button>`)), 'os sete botões de dia da semana sobreviveram');
check(ligada.includes('Apenas: Seg, Qua, Sex'), 'o resumo da recorrência continua correto');
check(pintar({ ...itemBase, recurrence: null }).includes('Todos os dias'), 'e o caso "todos os dias" também');

/**
 * A tela de EXECUÇÃO — onde o carryover finalmente vira trabalho.
 *
 * Aqui mora o defeito que nenhum teste de lógica pega: a função pode devolver
 * a pendência certa e a linha não pintar, ou pintar sem o carimbo de origem —
 * e aí a tarefa atrasada se confunde com a rotina do dia, que é justamente o
 * que o carryover existe para evitar.
 *
 * Calendário: 2026-08-03 é SEGUNDA. A coifa é seg/qua/sex com `carryover`.
 * `hoje` é fixado pela data do sistema, então os casos usam datas relativas a
 * ele — o que importa é a RELAÇÃO entre os dias, não o dia do calendário.
 */
const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const menosDias = (d, n) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() - n);
  return x.toISOString().slice(0, 10);
};
const ontem = menosDias(hoje, 1);
const ddmm = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const execucao = (items, completions = []) => renderToStaticMarkup(h(ExecutionScreen, {
  unit, currentUser: { id: 'u9', name: 'Ana' },
  template: { id: 'limpeza', unitId: 'u1', sector: 'Cozinha', name: 'Limpeza — Cozinha', deadline: '18:00', items },
  completions, closures: [],
  onCancel: () => {}, onComplete: () => {}, onDone: () => {},
}));

// Diária sem flag + tarefa arrastável que era prevista ONTEM e não foi feita.
const diaria = { id: 'chao', text: 'Lavar o chão' };
const coifa = (over = {}) => ({
  id: 'coifa', text: 'Limpar a coifa',
  recurrence: [new Date(`${ontem}T12:00:00Z`).getUTCDay()],
  carryover: true, carryoverSince: menosDias(hoje, 30), ...over,
});

console.log('\ntela de execução — a tarefa arrastada');

const comDivida = execucao([diaria, coifa()]);
check(comDivida.includes('Limpar a coifa'), 'a tarefa de ontem aparece hoje, mesmo não sendo dia dela');
check(comDivida.includes(`Pendente desde ${ddmm(ontem)}`), 'com o carimbo de origem, em dd/mm');
check(comDivida.indexOf('Limpar a coifa') < comDivida.indexOf('Lavar o chão'), 'e vem antes da rotina do dia');

// Feita ontem: nada a cobrar — a tela volta a ser só a rotina.
const quitada = execucao([diaria, coifa()], [{
  id: 'c1', templateId: 'limpeza', unitId: 'u1', date: ontem,
  completedAt: `${ontem}T20:00:00Z`, items: [{ id: 'coifa', done: true }],
}]);
check(!quitada.includes('Limpar a coifa'), 'executada ontem, não volta hoje');
check(!quitada.includes('Pendente desde'), 'e nenhum carimbo sobra na tela');

// Tarefa do dia não pode ganhar carimbo: ele é a marca da exceção.
const soRotina = execucao([diaria]);
check(soRotina.includes('Lavar o chão'), 'a rotina do dia continua aparecendo');
check(!soRotina.includes('Pendente desde'), 'sem dívida, nenhuma linha se diz atrasada');

// O contador do rodapé conta o que está na tela — se ele ignorasse a
// arrastada, a pessoa fecharia o checklist com uma tarefa invisível pendente.
check(comDivida.includes('0 de 2 concluídos'), 'o rodapé conta a arrastada junto com a do dia');

console.log(ok ? '\n  ✅ PASSOU\n' : '\n  ❌ FALHOU\n');
process.exit(ok ? 0 : 1);
