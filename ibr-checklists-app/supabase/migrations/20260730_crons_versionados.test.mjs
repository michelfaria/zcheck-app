/**
 * Teste da migration 20260730_crons_versionados.sql.
 *
 *   node supabase/migrations/20260730_crons_versionados.test.mjs
 *
 * O PGlite não tem pg_cron. É exatamente o cenário que precisa ser garantido:
 * a migration não pode EXPLODIR num banco sem a extensão — se explodir, ela
 * derruba a aplicação da série inteira de migrations num projeto novo, que é
 * justamente o caso para o qual ela existe.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION = readFileSync(
  fileURLToPath(new URL('./20260730_crons_versionados.sql', import.meta.url)),
  'utf8',
);

const db = new PGlite();
let ok = true;
const check = (cond, msg) => { if (!cond) ok = false; console.log(`  ${cond ? '✓' : '✗'} ${msg}`); };

console.log('═══ crons versionados ═══');

let erro = null;
try { await db.exec(MIGRATION); } catch (e) { erro = e; }
check(!erro, `aplica sem erro em banco sem pg_cron${erro ? ` (${erro.message})` : ''}`);

// Idempotência: a segunda passada também não pode falhar.
erro = null;
try { await db.exec(MIGRATION); } catch (e) { erro = e; }
check(!erro, 'idempotente — 2ª execução também passa');

// A migration não deve criar NADA fora do cron: nenhuma tabela, nenhuma função.
const objetos = await db.query(`
  select count(*)::int as n from pg_class
   where relnamespace = 'public'::regnamespace and relkind in ('r','v','m')
`);
check(objetos.rows[0].n === 0, 'não cria tabela nem view — só agendamento');

// Os quatro jobs têm que estar NOMEADOS no arquivo: é a lista de recuperação.
for (const job of ['notify-overdue-checklists', 'cleanup-checklist-photos', 'cleanup-login-attempts', 'purge-live-tasks']) {
  check(MIGRATION.includes(`'${job}'`), `cobre o agendamento ${job}`);
}

// E cada um só age se não existir — nunca substitui o que está no ar.
const guardas = (MIGRATION.match(/if not exists \(select 1 from cron\.job/g) || []).length;
check(guardas === 4, `cada job tem guarda `+"`if not exists`"+` (achei ${guardas} de 4)`);

console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
await db.close();
if (!ok) process.exitCode = 1;
