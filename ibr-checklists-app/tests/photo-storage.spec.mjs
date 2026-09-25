/**
 * Fotos de prova, fotos da rodada e POPs no bucket `checklist-photos`: por onde
 * e para onde o cliente grava e lê.
 *
 *   cd ibr-checklists-app && node tests/photo-storage.spec.mjs
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * Até 24/09/2026 o cliente gravava e lia o bucket pelo cliente ANÔNIMO, em
 * caminhos sem empresa (`{conclusão}/{item}.jpg`, `rodada/…`, `refdocs/…`), e o
 * bucket abria para a anon key — pública, está no bundle e neste repositório.
 * Qualquer pessoa listava, baixava e apagava a foto e o POP de qualquer
 * empresa. A policy nova (20260924_storage_01_checklist_photos_tenant.sql)
 * compara a 1ª pasta do objeto com o company_id do TOKEN; o teste PGlite dela
 * prova o lado do banco. Este prova o lado do cliente, que é onde a regra
 * quebra calada: um caminho sem a pasta, ou uma chamada que volte ao cliente
 * anônimo, não dá erro de build — dá foto que não sobe em produção.
 *
 * O que fica provado:
 *   1. toda operação de storage vai pelo cliente AUTENTICADO — o anônimo não é
 *      nem tocado;
 *   2. todo upload vai para `{empresa do token}/…`, e o caminho gravado em
 *      `photos` também — inclusive o que vem da convenção antiga;
 *   3. a leitura acha o objeto NOVO e, enquanto a cópia do legado não acontece,
 *      o ANTIGO — nesta ordem, e sem repetir tentativa;
 *   4. sem sessão, nada sobe: a foto fica na fila (que só drena logada);
 *   5. o módulo de caminhos (lib/photoPaths.js) é idempotente e bate com a
 *      sanitização que o SQL do inventário repete.
 */

import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

// ── Dublês de supabase e storage ────────────────────────────────────────────
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-photo-storage');
await mkdir(dir, { recursive: true });

await writeFile(join(dir, 'storage.js'), `
  export const _db = new Map();
  export async function storageGet(k) { return { value: _db.get(k) ?? null }; }
  export async function storageSet(k, v) { _db.set(k, v); }
`);

// O bucket do dublê: nomes que "existem". createSignedUrl de nome ausente
// devolve erro, como o storage-api (e como a policy, que esconde o objeto).
await writeFile(join(dir, 'supabase.js'), `
  export const _s = { companyId: 'empresa-a', token: 'tok', objetos: new Set(), photosRow: null,
                      ops: [], anonTocado: 0 };
  const bucket = (quem) => (nome) => ({
    upload: async (path) => { _s.ops.push([quem, nome, 'upload', path]); _s.objetos.add(path); return { error: null }; },
    createSignedUrl: async (path) => {
      _s.ops.push([quem, nome, 'sign', path]);
      return _s.objetos.has(path)
        ? { data: { signedUrl: 'https://signed/' + path }, error: null }
        : { data: null, error: { message: 'Object not found' } };
    },
  });
  const query = () => {
    const q = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: _s.photosRow, error: null }),
      upsert: async (row) => { _s.ops.push(['authed', 'photos', 'upsert', row.storage_path]); return { error: null }; },
    };
    return q;
  };
  export const supabase = {
    get storage() { _s.anonTocado++; return { from: bucket('anon') }; },
  };
  const authed = { storage: { from: bucket('authed') }, from: () => query() };
  export const authedSupabase = () => authed;
  export const getSessionToken = () => _s.token;
  export const getSessionCompanyId = () => _s.companyId;
`);

await writeFile(join(dir, 'entry.js'), `
  export { uploadPhoto, uploadRoundPhoto, getRoundPhotoUrl, linkRoundPhoto, getPhotoUrl,
           uploadRefDoc, getRefDocUrl } from ${JSON.stringify(process.cwd() + '/lib/sync.js')};
  export { submittedTasksFrom } from ${JSON.stringify(process.cwd() + '/lib/rounds.js')};
  export * as P from ${JSON.stringify(process.cwd() + '/lib/photoPaths.js')};
  export { _s } from './supabase.js';
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

// isOnline() lê window + navigator.onLine.
globalThis.window = globalThis.window || {};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const S = await import(out);
const { _s, _db } = S;

// ── 5. Caminhos ─────────────────────────────────────────────────────────────
const P = S.P;
const { submittedTasksFrom } = S;

console.log('═══ lib/photoPaths.js ═══');
check(P.qualifyPath('empresa-a', 'c1/i1.jpg') === 'empresa-a/c1/i1.jpg', 'qualifica caminho antigo com a pasta da empresa');
check(P.qualifyPath('empresa-a', 'empresa-a/c1/i1.jpg') === 'empresa-a/c1/i1.jpg', 'caminho já qualificado volta igual');
check(P.legacyPath('empresa-a', 'empresa-a/c1/i1.jpg') === 'c1/i1.jpg', 'legacyPath tira a pasta — é o nome do objeto antigo');
check(JSON.stringify(P.pathCandidates('empresa-a', 'c1/i1.jpg')) === '["empresa-a/c1/i1.jpg","c1/i1.jpg"]',
  'candidatos: novo antes do antigo');
check(JSON.stringify(P.pathCandidates('empresa-a', ['empresa-a/c1/i1.jpg', 'c1/i1.jpg', null])) === '["empresa-a/c1/i1.jpg","c1/i1.jpg"]',
  'candidatos de vários caminhos (banco + convenção) sem repetição');
check(JSON.stringify(P.pathCandidates('empresa-a', 'empresa-b/c1/i1.jpg')) === '["empresa-a/empresa-b/c1/i1.jpg","empresa-b/c1/i1.jpg"]',
  'caminho de OUTRA empresa não vira caminho da própria (e a policy recusa os dois)');
check(JSON.stringify(P.pathCandidates(null, 'c1/i1.jpg')) === '["c1/i1.jpg"]', 'sem empresa, devolve como veio');
let lancou = null;
try { P.qualifyPath('a/b', 'x.jpg'); } catch (e) { lancou = e.message; }
check(/inválida/.test(lancou || ''), 'empresa com barra é recusada (a 1ª pasta deixaria de ser a empresa)');
lancou = null;
try { P.qualifyPath('', 'x.jpg'); } catch (e) { lancou = e.message; }
check(/inválida/.test(lancou || ''), 'empresa vazia é recusada');
check(P.roundPath({ templateId: 't 1/á', unitId: 'u1', date: '2026-09-24', itemId: 'i#1' })
  === 'rodada/t_1_/u1/2026-09-24/i_1.jpg',
  'rodada: mesma sanitização [^\\w.-]+ → _ que o inventário e o reparo 20260731 repetem em SQL');
check(/^refdocs\/123-abcdef\/POP_Limpeza_.pdf$/.test(P.refDocPath('POP Limpeza!.pdf', { now: 123, rand: 'abcdef' })),
  'POP: refdocs/{ts}-{aleatório}/{nome sanitizado}');
const sub = submittedTasksFrom([{ id: 'c7', templateId: 't', unitId: 'u', date: 'd', completedAt: 'x',
  items: [{ id: 'i3', done: true, hasPhoto: true }] }], { templateId: 't', unitId: 'u', date: 'd' });
check(sub.i3?.photoPath === P.evidencePath('c7', 'i3') && sub.i3.photoPath === 'c7/i3.jpg',
  'a convenção de lib/rounds.js é a mesma de evidencePath (relativa; sync.js qualifica)');

const FOTO = 'data:image/jpeg;base64,/9j/4AAQ';
const reset = () => { _s.ops.length = 0; _s.objetos.clear(); _s.photosRow = null; _s.companyId = 'empresa-a'; _s.token = 'tok'; };
const ops = (tipo) => _s.ops.filter(o => o[2] === tipo).map(o => o[3]);

console.log('═══ lib/sync.js: gravar ═══');
reset();
check(await S.uploadPhoto('c1', 'i1', FOTO) === 'empresa-a/c1/i1.jpg', 'foto de prova sobe em empresa-a/c1/i1.jpg');
check(_s.ops.some(o => o[0] === 'authed' && o[1] === 'checklist-photos' && o[2] === 'upload'),
  '…pelo cliente AUTENTICADO, no bucket checklist-photos');
check(ops('upsert')[0] === 'empresa-a/c1/i1.jpg', '…e a linha de photos grava o caminho com a pasta');
check(!(_db.get('ibr_offline_queue') || '').includes('"c1"'), '…e sai da fila offline');

reset();
check(await S.uploadRoundPhoto({ templateId: 't1', unitId: 'u1', date: '2026-09-24', itemId: 'i1', dataUrl: FOTO })
  === 'empresa-a/rodada/t1/u1/2026-09-24/i1.jpg', 'foto da rodada sobe em empresa-a/rodada/…');

reset();
await S.linkRoundPhoto('c2', 'i1', 'c0/i1.jpg');
check(ops('upsert')[0] === 'empresa-a/c0/i1.jpg',
  'vínculo com caminho da convenção ANTIGA grava já com a pasta (é por ele que o cleanup-photos apaga)');

reset();
const doc = await S.uploadRefDoc({ name: 'POP.pdf', type: 'application/pdf' });
check(doc.path.startsWith('empresa-a/refdocs/') && doc.name === 'POP.pdf', 'POP sobe em empresa-a/refdocs/…');

console.log('═══ lib/sync.js: ler ═══');
reset();
_s.photosRow = { storage_path: 'c0/i1.jpg' };
_s.objetos.add('c0/i1.jpg');                                  // só o antigo existe
check(await S.getPhotoUrl('c0', 'i1') === 'https://signed/c0/i1.jpg', 'objeto ainda não copiado: acha pelo nome antigo');
check(JSON.stringify(ops('sign')) === '["empresa-a/c0/i1.jpg","c0/i1.jpg"]',
  '…depois de tentar o novo, e sem repetir (linha de photos e convenção dão o mesmo par)');

reset();
_s.photosRow = { storage_path: 'c0/i1.jpg' };                  // linha ainda antiga…
_s.objetos.add('empresa-a/c0/i1.jpg');                        // …objeto já copiado
check(await S.getPhotoUrl('c0', 'i1') === 'https://signed/empresa-a/c0/i1.jpg', 'objeto copiado: acha pelo novo');
check(ops('sign').length === 1, '…na primeira tentativa');

reset();
_s.objetos.add('empresa-a/c5/i1.jpg');                        // sem linha em photos
check(await S.getPhotoUrl('c5', 'i1') === 'https://signed/empresa-a/c5/i1.jpg',
  'sem linha em photos, a convenção acha a foto na pasta da empresa');

reset();
_s.objetos.add('refdocs/9-x/pop.pdf');
check(await S.getRefDocUrl('refdocs/9-x/pop.pdf') === 'https://signed/refdocs/9-x/pop.pdf', 'POP de template antigo abre');
_s.objetos.add('empresa-a/rodada/t1/u1/d/i1.jpg');
check(await S.getRoundPhotoUrl('empresa-a/rodada/t1/u1/d/i1.jpg') === 'https://signed/empresa-a/rodada/t1/u1/d/i1.jpg',
  'foto da rodada (caminho novo) abre');
lancou = null;
try { await S.getRefDocUrl('refdocs/nao-existe.pdf'); } catch (e) { lancou = e.message; }
check(lancou !== null, 'POP inexistente lança (o botão registra no console, como antes)');

console.log('═══ lib/sync.js: sem sessão ═══');
reset();
_s.companyId = null;
check(await S.uploadPhoto('c3', 'i1', FOTO) === null, 'sem empresa no token, a foto de prova não sobe…');
check(ops('upload').length === 0, '…nenhum upload tentado…');
check((_db.get('ibr_offline_queue') || '').includes('"c3"'), '…e ela fica na fila offline (drena logada)');
check(await S.uploadRoundPhoto({ templateId: 't', unitId: 'u', date: 'd', itemId: 'i', dataUrl: FOTO }) === null,
  'sem empresa, a foto da rodada fica local (o submit dela sobe depois)');

check(_s.anonTocado === 0, 'o cliente ANÔNIMO não foi tocado em nenhuma operação de storage');

console.log(ok ? '\nOK' : '\nFALHOU');
process.exit(ok ? 0 : 1);
