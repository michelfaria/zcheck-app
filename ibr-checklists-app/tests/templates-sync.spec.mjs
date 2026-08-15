/**
 * Teste do mapeamento de `templates` — os dois caminhos de leitura têm que
 * produzir o MESMO objeto.
 *
 *   cd ibr-checklists-app && node tests/templates-sync.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * Remover um checklist não sumia da tela. Em 15/08/2026, na IBR3, "Abertura
 * Sala" foi removido, o toast disse "desativado", e o cartão continuou lá — só
 * um reload duro (cmd+shift+R) fazia sumir.
 *
 * A remoção funcionava. O que quebrava era a VOLTA: `deactivateTemplate` grava
 * `active = false`, esse UPDATE dispara o postgres_changes, e o refetch do
 * realtime tinha uma CÓPIA do mapeamento de linha — uma cópia que não trazia
 * `active`. `templateAtiva` é `t.active !== false`; com `undefined` o checklist
 * desativado voltava a ser ativo e reaparecia na lista, milissegundos depois de
 * sair. O reload duro consertava porque o reload passa por `fetchTemplates`,
 * que mapeava certo.
 *
 * A mesma cópia comia `createdAt` e `deactivatedAt`, e esse errava mais calado:
 * `templateVigente` (lib/rounds.js) usa os dois para contar o passado com a
 * configuração daquele dia. Sem eles, qualquer evento de realtime fazia um
 * checklist criado ontem passar a contar como previsto no mês inteiro.
 *
 * Por isso o teste não confere campo a campo em cada caminho: ele afirma que os
 * dois caminhos devolvem objetos IDÊNTICOS. Campo novo que só um lado mapear
 * derruba este teste, que é o ponto — o defeito não foi um campo esquecido, foi
 * a existência de duas conversões.
 */

import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { deepStrictEqual } from 'node:assert';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-templates-sync');
await mkdir(dir, { recursive: true });

// ── Dublês ──────────────────────────────────────────────────────────────────
await writeFile(join(dir, 'storage.js'), `
  export const _db = new Map();
  export async function storageGet(k) { return { value: _db.get(k) ?? null }; }
  export async function storageSet(k, v) { _db.set(k, v); }
`);

// O builder aceita qualquer encadeamento (.select().order().order()) e é
// "thenable": é assim que sync.js consome as duas consultas.
await writeFile(join(dir, 'supabase.js'), `
  export const _state = { rows: [] };
  export const _canal = { handler: null };
  const query = () => {
    const q = {
      select: () => q,
      order: () => q,
      eq: () => q,
      then: (res, rej) => Promise.resolve({ data: _state.rows, error: null }).then(res, rej),
    };
    return q;
  };
  const canal = {
    on: (_evt, _cfg, handler) => { _canal.handler = handler; return canal; },
    subscribe: () => canal,
  };
  export const supabase = { channel: () => canal, removeChannel: () => {} };
  export const authedSupabase = () => ({ from: () => query() });
  export const getSessionToken = () => null;
`);

await writeFile(join(dir, 'entry.js'), `
  export { fetchTemplates, subscribeToTemplates } from ${JSON.stringify(process.cwd() + '/lib/sync.js')};
  export { _state, _canal } from './supabase.js';
`);

const out = join(dir, 'bundle.mjs');
await build({
  entryPoints: [join(dir, 'entry.js')], outfile: out, bundle: true, format: 'esm',
  platform: 'node', logLevel: 'silent',
  plugins: [{
    name: 'dubles',
    setup(b) {
      b.onResolve({ filter: /^\.\/(storage|supabase)$/ }, args => ({
        path: join(dir, `${args.path.slice(2)}.js`),
      }));
    },
  }],
});

// sync.js só monta o canal com `window` presente — não precisa de DOM de
// verdade para isso, só do global.
globalThis.window = globalThis.window || {};

const { fetchTemplates, subscribeToTemplates, _state, _canal } = await import(out);

// ── As linhas ───────────────────────────────────────────────────────────────
// A terceira é o mundo ANTES da migration 20260730: a coluna `active` não
// existe na linha, e o checklist tem que continuar ativo.
_state.rows = [
  {
    id: 't-ativo', unit_id: 'ibr3', sector: 'Caixa', shift: 'manha',
    name: 'Abertura Caixa (IBR3)', deadline: '08:00', items: [{ id: 'i1' }],
    active: true, deactivated_at: null, created_at: '2026-08-01T10:00:00Z',
  },
  {
    id: 't-removido', unit_id: 'ibr3', sector: 'Caixa', shift: 'manha',
    name: 'Abertura Sala (IBR3)', deadline: '08:00', items: [{ id: 'i2' }],
    active: false, deactivated_at: '2026-08-15T13:59:00Z', created_at: '2026-08-01T10:00:00Z',
  },
  {
    id: 't-legado', unit_id: 'ibr3', sector: 'Caixa', shift: 'noite',
    name: 'Fechamento (IBR3)', deadline: '23:00', items: null,
  },
];

const porId = lista => new Map(lista.map(t => [t.id, t]));

// ── 1. A carga inicial ──────────────────────────────────────────────────────
console.log('═══ fetchTemplates mapeia active/createdAt/deactivatedAt ═══');
const carga = await fetchTemplates([]);
const c = porId(carga);
check(c.get('t-removido').active === false, 'checklist removido chega com active = false');
check(c.get('t-ativo').active === true, 'checklist normal chega com active = true');
check(c.get('t-legado').active === true, 'linha sem a coluna `active` (pré-migration) continua ativa');
check(Array.isArray(c.get('t-legado').items), '`items` nulo vira lista vazia, não quebra .length');
check(c.get('t-removido').deactivatedAt === '2026-08-15T13:59:00Z', 'deactivatedAt preservado');
check(c.get('t-ativo').createdAt === '2026-08-01T10:00:00Z', 'createdAt preservado');

// ── 2. O refetch do realtime — o caminho que ressuscitava o checklist ───────
console.log('\n═══ o refetch do realtime devolve o MESMO objeto ═══');
let recebido = null;
const parar = subscribeToTemplates(lista => { recebido = lista; });
check(typeof _canal.handler === 'function', 'o canal de templates foi registrado');
await _canal.handler({});   // é o que o postgres_changes dispara
parar();

check(Array.isArray(recebido) && recebido.length === 3, `o refetch entregou ${recebido?.length} templates`);
const r = porId(recebido || []);
check(r.get('t-removido')?.active === false,
  'REGRESSÃO: o refetch NÃO pode devolver o checklist removido como ativo');
check(r.get('t-legado')?.active === true, 'linha pré-migration continua ativa também no refetch');

// A afirmação forte: campo novo que só um caminho mapear derruba aqui.
let iguais = true;
try {
  deepStrictEqual(
    [...r.values()].sort((a, b) => a.id.localeCompare(b.id)),
    [...c.values()].sort((a, b) => a.id.localeCompare(b.id)),
  );
} catch (e) { iguais = false; console.log(`     ${e.message.split('\n')[0]}`); }
check(iguais, 'carga inicial e refetch produzem objetos idênticos (uma conversão só)');

console.log(ok ? '\n  ✅ PASSOU' : '\n  ❌ FALHOU');
process.exit(ok ? 0 : 1);
