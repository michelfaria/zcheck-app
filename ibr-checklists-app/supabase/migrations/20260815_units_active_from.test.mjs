/**
 * Teste da migration 20260815_units_active_from.sql.
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260815_units_active_from.test.mjs
 *
 * Ver o cabeçalho de 20260726_data_local_brasilia.test.mjs para o porquê do
 * PGlite (o preview branch do Supabase não serve: 11 tabelas sem `create table`).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION = readFileSync(
  fileURLToPath(new URL('./20260815_units_active_from.sql', import.meta.url)),
  'utf8',
);

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

await db.exec(`
  create table public.units (
    id         text primary key,
    company_id text not null,
    name       text not null,
    color      text,
    active     boolean not null default true,
    sort_order int not null default 0
  );
  insert into public.units (id, company_id, name) values
    ('ibr1', 'ilhabelarepublic', 'IBR Centro'),
    ('ibr2', 'ilhabelarepublic', 'IBR Praia');
`);

console.log('═══ units.active_from ═══');

const saida = await db.exec(MIGRATION);
saida.at(-1).rows.forEach(r => console.log(`  ${r.ativa_desde}: ${r.lojas} loja(s)`));

// 1. O parque existente não muda de sentido.
const { rows } = await db.query(`select id, active_from from public.units order by id`);
check(rows.every(r => r.active_from === null),
  'lojas existentes ficam sem data — "sempre ativa", comportamento atual preservado');

// 2. Aceita a data e devolve DATA, não instante: se virasse timestamptz, o
//    driver traria a hora junto e a comparação por string YYYY-MM-DD quebraria
//    na virada do dia — exatamente o bug que lib/dates.js existe para fechar.
await db.query(`update public.units set active_from = '2026-08-20' where id = 'ibr2'`);
const ibr2 = await db.query(`select active_from::text as d from public.units where id = 'ibr2'`);
check(ibr2.rows[0].d === '2026-08-20', 'grava a data como YYYY-MM-DD, sem hora');

// 3. Dá para voltar atrás. Errar a data é o erro mais provável desta tela, e
//    limpar o campo tem que devolver a loja ao estado "sempre ativa" — senão a
//    correção exigiria SQL manual em produção.
await db.query(`update public.units set active_from = null where id = 'ibr2'`);
const limpo = await db.query(`select active_from from public.units where id = 'ibr2'`);
check(limpo.rows[0].active_from === null, 'aceita voltar para nulo (desfazer a ativação)');

// 4. Idempotente: `add column if not exists` roda de novo sem erro e sem apagar
//    o que já foi configurado — a migration é colada no SQL Editor à mão.
await db.query(`update public.units set active_from = '2026-08-20' where id = 'ibr1'`);
await db.exec(MIGRATION);
const depois = await db.query(`select active_from::text as d from public.units where id = 'ibr1'`);
check(depois.rows[0].d === '2026-08-20', 'rodar a migration de novo não apaga a data já configurada');

// 5. Recusa lixo. A tela manda `<input type="date">`, mas o mesmo endpoint
//    PostgREST aceita qualquer string do cliente.
let recusou = false;
try { await db.query(`update public.units set active_from = 'ontem' where id = 'ibr1'`); }
catch { recusou = true; }
check(recusou, 'recusa data inválida');

console.log(ok ? '\n✅ migration OK' : '\n❌ migration com falha');
process.exit(ok ? 0 : 1);
