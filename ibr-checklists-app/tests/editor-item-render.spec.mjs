/**
 * Teste de RENDERIZAÇÃO do editor de tarefa — a flag de carryover.
 *
 *   cd ibr-checklists-app && node tests/editor-item-render.spec.mjs
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
  export { TemplateEditor } from '${process.cwd()}/app/app/page.js';
`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', jsx: 'automatic', logLevel: 'silent',
  loader: { '.js': 'jsx' },
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const { TemplateEditor } = await import(out);

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

console.log(ok ? '\n  ✅ PASSOU\n' : '\n  ❌ FALHOU\n');
process.exit(ok ? 0 : 1);
