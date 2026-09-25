/**
 * Escrita em `users` pelo cliente: UPDATE que o RLS filtra não pode virar "salvo".
 *
 *   cd ibr-checklists-app && node tests/users-escrita.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * Desde 20260923_users_escrita_gestao, só a diretoria (`user_role = 'gestao'`
 * no token) escreve em `users`. Um UPDATE de outro papel não dá erro: o USING
 * da policy FILTRA a linha, o UPDATE toca zero linhas e o PostgREST responde
 * 204. O supabase-js devolve `{ error: null }`.
 *
 * Dois caminhos do cliente caíam nesse buraco:
 *   · `saveUsers` — diretoria rebaixada em outro aparelho continua com a aba
 *     Usuários aberta (o /api/auth/refresh troca o token, não o papel na tela).
 *     Editar, suspender, reativar ou trocar PIN: 204, a conferência do fim
 *     (reler os ids) passa porque a linha existe e é legível, a tela diz
 *     "salvo", o cache guarda — e tudo volta no próximo reload.
 *   · `saveUserAvatar`, no UPDATE de reserva (quando a RPC responde PGRST202,
 *     inclusive com o cache de esquema do PostgREST velho logo depois da
 *     migration): a foto "salva" e some.
 *
 * A regra que o arquivo prova: o cliente pede a contagem (`count: 'exact'`,
 * sem RETURNING — um .select() exigiria SELECT de `pin` e voltaria 42501) e
 * trata ZERO linhas como falha. Contagem ausente (servidor que não a devolve)
 * continua como antes: não é recusa.
 *
 * O dublê do supabase-js imita o PostgREST no que importa aqui: com `count`
 * pedido, devolve o número de linhas que o UPDATE alcançou; sem `count`,
 * `null`; com o Content-Range sem total, `NaN` (é o que o parseInt do
 * postgrest-js faz com `*`).
 */

import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-users-escrita');
await mkdir(dir, { recursive: true });

// ── Dublês ──────────────────────────────────────────────────────────────────
await writeFile(join(dir, 'storage.js'), `
  export const _db = new Map();
  export async function storageGet(k) { return { value: _db.get(k) ?? null }; }
  export async function storageSet(k, v) { _db.set(k, v); }
`);

// Um "servidor" mínimo: `rows` é a tabela; `papel` decide se o UPDATE alcança
// a linha (a policy users_gestao_update); `contagem` = 'normal' | 'sem-total'.
await writeFile(join(dir, 'supabase.js'), `
  export const _state = {
    rows: [], papel: 'gestao', contagem: 'normal', rpc: { error: null }, chamadas: [],
  };
  const resposta = (n, pediuContagem) => ({
    error: null,
    count: !pediuContagem ? null : _state.contagem === 'sem-total' ? NaN : n,
  });
  const from = tabela => {
    const q = { filtros: [] };
    const api = {
      select: cols => { if (q.op) q.selectDepois = true; else { q.op = 'select'; q.cols = cols; } return api; },
      update: (valores, opts) => { q.op = 'update'; q.valores = valores; q.opts = opts; return api; },
      insert: valores => { q.op = 'insert'; q.valores = valores; return api; },
      delete: () => { q.op = 'delete'; return api; },
      eq: (c, v) => { q.filtros.push(r => r[c] === v); return api; },
      in: (c, vs) => { q.filtros.push(r => vs.includes(r[c])); return api; },
      order: () => api,
      then: (res, rej) => {
        _state.chamadas.push({ tabela, ...q });
        const alvo = _state.rows.filter(r => q.filtros.every(f => f(r)));
        let out;
        if (q.op === 'select') out = { data: alvo.map(r => ({ id: r.id })), error: null };
        else if (q.op === 'update') {
          const alcancadas = _state.papel === 'gestao' ? alvo : [];   // o USING do RLS
          for (const r of alcancadas) Object.assign(r, q.valores);
          out = resposta(alcancadas.length, !!q.opts?.count);
        } else out = { error: null };
        return Promise.resolve(out).then(res, rej);
      },
    };
    return api;
  };
  const cliente = {
    from,
    rpc: (nome, args) => { _state.chamadas.push({ rpc: nome, args }); return Promise.resolve(_state.rpc); },
  };
  export const supabase = cliente;
  export const authedSupabase = () => cliente;
  export const getSessionToken = () => null;
  export const getSessionCompanyId = () => null;
`);

await writeFile(join(dir, 'entry.js'), `
  export { saveUsers, saveUserAvatar } from ${JSON.stringify(process.cwd() + '/lib/sync.js')};
  export { _state } from './supabase.js';
  export { _db } from './storage.js';
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

// sync.js loga cada falha — é esperado aqui, e poluiria a saída do teste.
const silencio = () => {};
console.error = silencio; console.warn = silencio;

const { saveUsers, saveUserAvatar, _state, _db } = await import(out);

const MARIA = { id: 'maria', name: 'Maria', role: 'colaborador', unitId: 'ibr1', sectorId: null, suspended: false };
const cena = ({ papel = 'gestao', contagem = 'normal' } = {}) => {
  _state.rows = [{ id: 'maria', name: 'Maria', role: 'colaborador', unit_id: 'ibr1', suspended: false, avatar_url: null }];
  _state.papel = papel;
  _state.contagem = contagem;
  _state.rpc = { error: null };
  _state.chamadas = [];
  _db.clear();
};
const erroDe = async fn => { try { await fn(); return null; } catch (e) { return e; } };
const cacheUsers = () => (_db.has('ibr_users') ? JSON.parse(_db.get('ibr_users')) : null);

// ── 1. saveUsers ────────────────────────────────────────────────────────────
console.log('═══ saveUsers: UPDATE que o RLS filtra não é "salvo" ═══');

cena({ papel: 'gerencia' });
const suspender = { ...MARIA, suspended: true };
const recusado = await erroDe(() => saveUsers([suspender], { changedIds: ['maria'] }));
check(/só a diretoria altera usuários/.test(recusado?.message || ''),
  'token que não é mais de diretoria: zero linhas → ERRO, não "salvo"');
check(_state.rows[0].suspended === false && cacheUsers() === null,
  'e nada vai para o cache — o cache continua o estado verdadeiro anterior');

const update = _state.chamadas.find(c => c.op === 'update');
check(update?.opts?.count === 'exact' && !update?.selectDepois,
  'pede a contagem (count: exact) SEM .select() — que exigiria SELECT de `pin` e voltaria 42501');

cena({ papel: 'gestao' });
check(await erroDe(() => saveUsers([suspender], { changedIds: ['maria'] })) === null
   && _state.rows[0].suspended === true && cacheUsers()?.[0]?.suspended === true,
  'diretoria: uma linha alterada → salvo, e o cache acompanha');

cena({ papel: 'gestao', contagem: 'sem-total' });
check(await erroDe(() => saveUsers([suspender], { changedIds: ['maria'] })) === null,
  'servidor que não devolve o total (Content-Range */*) → como antes, não é recusa');

// ── 2. saveUserAvatar ───────────────────────────────────────────────────────
console.log('\n═══ saveUserAvatar: a RPC primeiro; a reserva confere a contagem ═══');
const URL = 'https://proj.supabase.co/storage/v1/object/public/user-avatars/emp/maria/1.jpg';

cena({ papel: 'colaborador' });
_db.set('ibr_users', JSON.stringify([{ id: 'maria', avatarUrl: null }]));
check(await erroDe(() => saveUserAvatar('maria', URL)) === null
   && !_state.chamadas.some(c => c.op === 'update') && _state.chamadas[0]?.rpc === 'set_my_avatar',
  'RPC respondeu: nenhum UPDATE direto');

cena({ papel: 'colaborador' });
_state.rpc = { error: { code: '22023', message: 'foto recusada: tem de ser um arquivo da sua pasta' } };
const recusaRpc = await erroDe(() => saveUserAvatar('maria', 'https://evil.example/t.gif'));
check(recusaRpc?.code === '22023' && !_state.chamadas.some(c => c.op === 'update'),
  'foto recusada pela RPC: o erro sobe e NÃO cai no UPDATE direto');

cena({ papel: 'colaborador' });
_db.set('ibr_users', JSON.stringify([{ id: 'maria', avatarUrl: null }]));
_state.rpc = { error: { code: 'PGRST202', message: 'Could not find the function public.set_my_avatar in the schema cache' } };
const semLinha = await erroDe(() => saveUserAvatar('maria', URL));
check(/não gravou a foto/.test(semLinha?.message || ''),
  'PGRST202 (cache de esquema velho) + UPDATE de reserva com zero linhas → ERRO, não "salvo"');
check(_state.rows[0].avatar_url === null && cacheUsers()?.[0]?.avatarUrl === null,
  'e o cache offline não recebe a foto que o banco não tem');
const reserva = _state.chamadas.find(c => c.op === 'update');
check(reserva?.opts?.count === 'exact' && !reserva?.selectDepois, 'a reserva também pede a contagem, sem .select()');

cena({ papel: 'gestao' });
_db.set('ibr_users', JSON.stringify([{ id: 'maria', avatarUrl: null }]));
_state.rpc = { error: { code: 'PGRST202', message: 'Could not find the function' } };
check(await erroDe(() => saveUserAvatar('maria', URL)) === null
   && _state.rows[0].avatar_url === URL && cacheUsers()?.[0]?.avatarUrl === URL,
  'antes da migration (função ausente, UPDATE alcança a linha): salva como antes');

cena({ papel: 'colaborador', contagem: 'sem-total' });
_state.rpc = { error: { code: 'PGRST202', message: 'Could not find the function' } };
check(await erroDe(() => saveUserAvatar('maria', URL)) === null,
  'reserva sem total na resposta → como antes, não é recusa');

console.log(`\n  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
if (!ok) process.exitCode = 1;
