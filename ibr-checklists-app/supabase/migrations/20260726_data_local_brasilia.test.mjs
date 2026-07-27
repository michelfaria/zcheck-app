/**
 * Teste da migration 20260726_data_local_brasilia.sql.
 *
 * Roda contra um Postgres DE VERDADE (PGlite = Postgres compilado para WASM),
 * sem precisar de Docker nem de projeto Supabase descartável. Não está no
 * package.json de propósito — é ferramenta de manutenção, instalada só quando
 * se vai mexer numa migration:
 *
 *   cd ibr-checklists-app
 *   npm i --no-save @electric-sql/pglite
 *   node supabase/migrations/20260726_data_local_brasilia.test.mjs
 *
 * Verifica, para `completions.date` do tipo text E do tipo date: que as linhas
 * do bug são corrigidas, que as corretas não são tocadas, que task_reviews
 * herda, que rodar duas vezes não muda nada, e que o rollback do rodapé da
 * migration devolve o estado original.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATION = readFileSync(
  fileURLToPath(new URL('./20260726_data_local_brasilia.sql', import.meta.url)),
  'utf8',
);

// A migration se adapta ao tipo de `completions.date` porque a tabela foi
// criada fora das migrations e o tipo não está versionado. Testa os dois.
for (const dateType of ['text', 'date']) {
  const db = new PGlite();
  console.log(`\n═══ completions.date do tipo ${dateType.toUpperCase()} ═══`);

  // Roles que o Supabase cria por padrão e o PGlite não tem.
  await db.exec(`create role anon; create role authenticated;`);

  await db.exec(`
    create table public.completions (
      id            text primary key,
      company_id    text not null default 'ilhabelarepublic',
      unit_id       text,
      template_id   text,
      date          ${dateType},
      completed_at  timestamptz
    );
    create table public.task_reviews (
      id            serial primary key,
      company_id    text not null default 'ilhabelarepublic',
      completion_id text not null,
      item_id       text not null,
      verdict       text not null,
      date          date
    );
  `);

  await db.exec(`
    insert into public.completions (id, unit_id, template_id, date, completed_at) values
      -- Fechamento salvo 26/07 21:16 BRT: o bug. date veio como 27.
      ('c-fechamento-2116', 'ibr1', 't-fech', '2026-07-27', '2026-07-27T00:16:00Z'),
      -- 26/07 23:59 BRT: borda máxima do bug.
      ('c-fechamento-2359', 'ibr1', 't-fech', '2026-07-27', '2026-07-27T02:59:00Z'),
      -- 27/07 00:01 BRT: já é dia 27 de verdade. Não pode ser tocada.
      ('c-madrugada',       'ibr2', 't-fech', '2026-07-27', '2026-07-27T03:01:00Z'),
      -- Abertura das 10h: sempre esteve certa.
      ('c-abertura',        'ibr1', 't-abre', '2026-07-26', '2026-07-26T13:00:00Z'),
      -- Sem completed_at: nada a inferir, não pode ser tocada.
      ('c-sem-hora',        'ibr3', 't-fech', '2026-07-27', null);

    insert into public.task_reviews (completion_id, item_id, verdict, date) values
      ('c-fechamento-2116', 'i-1', 'aprovado',  '2026-07-27'),
      ('c-abertura',        'i-2', 'ressalva',  '2026-07-26');
  `);

  const saida = await db.exec(MIGRATION);
  // A migration termina com um SELECT de diagnóstico (o SQL Editor descarta
  // `raise notice`). É o último resultado da lista.
  const diag = saida.at(-1).rows;
  diag.forEach(r => console.log(`  ${r.item}: ${r.valor}`));
  const restantes = diag.find(r => r.item.startsWith('divergencias'))?.valor;

  const { rows } = await db.query(
    `select id, date::text as date, completed_at from public.completions order by id`);
  const esperado = {
    'c-abertura':        '2026-07-26',
    'c-fechamento-2116': '2026-07-26',
    'c-fechamento-2359': '2026-07-26',
    'c-madrugada':       '2026-07-27',
    'c-sem-hora':        '2026-07-27',
  };
  let ok = true;
  if (restantes !== '0') { ok = false; console.log(`  ✗ sobraram divergências: ${restantes}`); }
  const nesta = diag.find(r => r.item.includes('nesta rodada'))?.valor;
  if (nesta !== '2') { ok = false; console.log(`  ✗ "nesta rodada" deveria ser 2, veio ${nesta}`); }
  for (const r of rows) {
    const bate = r.date === esperado[r.id];
    if (!bate) ok = false;
    console.log(`  ${bate ? '✓' : '✗'} ${r.id.padEnd(20)} date=${r.date}  (esperado ${esperado[r.id]})`);
  }

  const tr = await db.query(
    `select completion_id, date::text as date from public.task_reviews order by completion_id`);
  const esperadoTr = { 'c-abertura': '2026-07-26', 'c-fechamento-2116': '2026-07-26' };
  for (const r of tr.rows) {
    const bate = r.date === esperadoTr[r.completion_id];
    if (!bate) ok = false;
    console.log(`  ${bate ? '✓' : '✗'} task_review de ${r.completion_id.padEnd(20)} date=${r.date}`);
  }

  const aud = await db.query(`select completion_id, date_antiga, date_nova from public.fix_data_local_20260726 order by completion_id`);
  console.log('  auditoria:', aud.rows.length, 'linha(s) —',
    aud.rows.map(r => `${r.completion_id}: ${r.date_antiga}→${r.date_nova}`).join(', '));
  if (aud.rows.length !== 2) { ok = false; console.log('  ✗ auditoria deveria ter exatamente 2 linhas'); }

  // Idempotência: rodar de novo não pode mudar mais nada nem duplicar auditoria.
  await db.exec(MIGRATION);
  const depois = await db.query(`select id, date::text as date from public.completions order by id`);
  const audDepois = await db.query(`select count(*)::int as n from public.fix_data_local_20260726`);
  const idempotente = depois.rows.every(r => r.date === esperado[r.id]) && audDepois.rows[0].n === 2;
  if (!idempotente) ok = false;
  console.log(`  ${idempotente ? '✓' : '✗'} idempotente (2ª execução não muda nada)`);

  // O cenário real: a migration roda ANTES do deploy, o app continua gravando
  // errado por algumas horas, e a migration roda de novo depois. A 2ª rodada
  // tem que corrigir só o novo e dizer isso separado do acumulado.
  await db.query(`
    insert into public.completions (id, unit_id, template_id, date, completed_at)
    values ('c-pos-migration', 'ibr1', 't-fech', '2026-07-28', '2026-07-28T01:00:00Z')
  `); // 27/07 22:00 BRT, salvo pelo código velho → nasceu com o dia 28
  const rodada2 = await db.exec(MIGRATION);
  const d2 = rodada2.at(-1).rows;
  const nesta2 = d2.find(r => r.item.includes('nesta rodada'))?.valor;
  const total2 = d2.find(r => r.item.includes('total'))?.valor;
  const corrigida = (await db.query(
    `select date::text as date from public.completions where id = 'c-pos-migration'`)).rows[0].date;
  const okRodada2 = nesta2 === '1' && total2 === '3' && corrigida === '2026-07-27';
  if (!okRodada2) ok = false;
  console.log(`  ${okRodada2 ? '✓' : '✗'} 2ª rodada pega só a execução nova (nesta rodada=${nesta2}, total=${total2}, date=${corrigida})`);

  // Rollback documentado no rodapé do arquivo.
  const setAntiga = dateType === 'text' ? 'f.date_antiga' : 'f.date_antiga::date';
  await db.exec(`
    update public.completions c set date = ${setAntiga}
      from public.fix_data_local_20260726 f where c.id::text = f.completion_id;
    update public.task_reviews tr set date = c.date::date
      from public.completions c
     where tr.completion_id = c.id::text and tr.date is distinct from c.date::date;
  `);
  const volta = await db.query(`select id, date::text as date from public.completions where id = 'c-fechamento-2116'`);
  const voltou = volta.rows[0].date === '2026-07-27';
  if (!voltou) ok = false;
  console.log(`  ${voltou ? '✓' : '✗'} rollback devolve o valor original`);

  console.log(`  ${ok ? '✅ PASSOU' : '❌ FALHOU'}`);
  await db.close();
  if (!ok) process.exitCode = 1;
}
