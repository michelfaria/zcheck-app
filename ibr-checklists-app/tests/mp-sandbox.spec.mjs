/**
 * A sonda do sandbox do Mercado Pago (scripts/mp-sandbox/ajuste.mjs) contra um
 * MP FALSO — sem rede, sem credencial.
 *
 *   cd ibr-checklists-app && node tests/mp-sandbox.spec.mjs
 *
 * ── Por que um arquivo de teste ──────────────────────────────────────────────
 *
 * A sonda é o que decide se MP_ADJUST_ENABLED pode ser ligada. Se ela deixasse
 * passar um PUT que devolve a assinatura a 'pending' (reconsentimento), que
 * reinicia o ciclo ou que cobra na hora, a flag seria ligada em cima de um
 * comportamento que para a cobrança ou cobra o cliente em dobro. E ela roda
 * com um token do MP: se aceitasse um token de PRODUÇÃO, criaria assinatura
 * de verdade. Aqui fica provado:
 *   1. sem token de teste ela para ANTES de qualquer escrita — e não cai no
 *      MP_ACCESS_TOKEN da produção;
 *   2. com o MP se comportando como o billing supõe, tudo passa, os valores
 *      saem de lib/plans.js (1 loja anual → + 1 vaga → volta) e a assinatura
 *      de teste é cancelada no fim;
 *   3. cada desvio que importa reprova: volta a 'pending', próxima fatura
 *      muda, cobrança na hora, PUT recusado — e mesmo reprovando, cancela;
 *   4. --manter não cancela;
 *   5. o .env.sandbox.local só entrega MP_SANDBOX_* — um MP_ACCESS_TOKEN
 *      colado ali não chega à sonda.
 */

import { run, loadLib, sandboxEnv } from '../scripts/mp-sandbox/ajuste.mjs';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

const lib = await loadLib();
const { priceForUnits } = lib;
const BASE = priceForUnits(1, 'annual', 0).monthlyCharge;
const PLUS = priceForUnits(1, 'annual', 1).monthlyCharge;
const TOKEN = 'APP_USR-sandbox-vendedor';

// MP falso com estado. `mode` escolhe como o PUT de valor se comporta.
function fakeMp({ mode = 'ok', testUser = true } = {}) {
  const calls = [];
  let pre = null;
  const reply = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, path: u.pathname, auth: init.headers?.Authorization, body });
    if (u.pathname === '/users/me') return reply(200, { id: 42, tags: testUser ? ['normal', 'test_user'] : ['normal'] });
    if (u.pathname === '/v1/card_tokens' && method === 'POST') return reply(201, { id: 'ct-1' });
    if (u.pathname === '/preapproval' && method === 'POST') {
      pre = {
        id: 'pre-1', status: body.status, external_reference: body.external_reference,
        date_created: '2026-09-25T12:00:00.000-03:00', next_payment_date: '2026-10-25T12:00:00.000-03:00',
        auto_recurring: { ...body.auto_recurring },
        summarized: { charged_quantity: 1, charged_amount: body.auto_recurring.transaction_amount, semaphore: 'green' },
      };
      return reply(201, { ...pre, init_point: 'https://mp.invalid/checkout' });
    }
    if (u.pathname === '/preapproval/pre-1' && method === 'GET') return reply(200, structuredClone(pre));
    if (u.pathname === '/preapproval/pre-1' && method === 'PUT') {
      if (body.status === 'cancelled') { pre.status = 'cancelled'; return reply(200, pre); }
      if (mode === 'reject') return reply(400, { message: 'cannot update' });
      pre.auto_recurring.transaction_amount = body.auto_recurring.transaction_amount;
      if (mode === 'reconsent') pre.status = 'pending';
      if (mode === 'resetCycle') pre.next_payment_date = '2026-11-25T12:00:00.000-03:00';
      if (mode === 'chargeNow') {
        pre.summarized.charged_quantity += 1;
        pre.summarized.charged_amount += body.auto_recurring.transaction_amount;
      }
      return reply(200, pre);
    }
    if (u.pathname === '/authorized_payments/search') {
      return reply(200, { results: [
        { id: 1, status: 'processed', transaction_amount: BASE },
        { id: 2, status: 'scheduled', transaction_amount: pre.auto_recurring.transaction_amount, debit_date: pre.next_payment_date },
      ] });
    }
    return reply(404, { message: `sem rota ${method} ${u.pathname}` });
  };
  return { fetch, calls, get pre() { return pre; } };
}

const ENV = { MP_SANDBOX_ACCESS_TOKEN: TOKEN, MP_SANDBOX_PUBLIC_KEY: 'APP_USR-pk', MP_SANDBOX_PAYER_EMAIL: 'test_user_1@testuser.com' };

async function probe({ mode, testUser, env = ENV, argv = [] } = {}) {
  const mp = fakeMp({ mode, testUser });
  const realFetch = globalThis.fetch;
  globalThis.fetch = mp.fetch;
  const lines = [];
  try {
    const { code, report } = await run({
      argv, env, lib, sleep: async () => {}, log: (m) => lines.push(m), writeReport: false,
    });
    return { code, report, mp, lines };
  } finally {
    globalThis.fetch = realFetch;
  }
}
const writes = (mp) => mp.calls.filter(c => c.method !== 'GET' && c.path !== '/users/me');
const amountPuts = (mp) => mp.calls.filter(c => c.method === 'PUT' && c.body?.auto_recurring).map(c => c.body.auto_recurring.transaction_amount);
const cancelled = (mp) => mp.calls.some(c => c.method === 'PUT' && c.body?.status === 'cancelled');
const failedMsgs = (r) => r.report.checks.filter(c => !c.ok).map(c => c.msg).join(' | ');

console.log('\n1. sem credencial de teste, nenhuma escrita');
{
  const r = await probe({ env: { MP_ACCESS_TOKEN: 'APP_USR-producao' } });
  check(r.code === 2 && r.mp.calls.length === 0, 'sem MP_SANDBOX_ACCESS_TOKEN: sai 2 sem tocar no MP (não usa o MP_ACCESS_TOKEN)');
  const p = await probe({ testUser: false });
  check(p.code === 2, 'token de conta que não é de teste: sai 2');
  check(writes(p.mp).length === 0, 'token de produção: nenhum POST/PUT');
  const t = await probe({ env: { ...ENV, MP_SANDBOX_ACCESS_TOKEN: 'TEST-123' } });
  check(t.code === 0 && !t.mp.calls.some(c => c.path === '/users/me'), 'prefixo TEST- dispensa /users/me');
}

console.log('\n2. o MP se comporta como o billing supõe → passa');
{
  const r = await probe();
  check(r.code === 0, `sai 0 (${r.report.checks.length} afirmações)${r.code ? ` — ${failedMsgs(r)}` : ''}`);
  check(r.report.checks.length >= 14, 'afirma aumento E redução');
  check(JSON.stringify(amountPuts(r.mp)) === JSON.stringify([PLUS, BASE]),
    `PUTs de valor ${PLUS} e depois ${BASE}, de lib/plans.js (foram ${amountPuts(r.mp).join(', ')})`);
  const create = r.mp.calls.find(c => c.method === 'POST' && c.path === '/preapproval');
  check(create?.body?.external_reference?.startsWith('sandbox-'), 'external_reference sandbox-…, nunca uma empresa');
  check(create?.body?.auto_recurring?.transaction_amount === BASE && create.body.auto_recurring.currency_id === 'BRL',
    `assinatura nasce em ${BASE} BRL`);
  check(r.mp.calls.every(c => c.auth === `Bearer ${TOKEN}`), 'toda chamada leva o token de teste');
  check(cancelled(r.mp) && r.mp.pre.status === 'cancelled', 'assinatura de teste cancelada no fim');
  check(r.lines.some(l => /agendada/.test(l)), 'relata a fatura agendada (próxima cobrança)');
}

console.log('\n3. cada desvio reprova — e cancela mesmo assim');
for (const [mode, needle, what] of [
  ['reconsent', "segue 'authorized'", 'PUT devolve a assinatura a pending (reconsentimento)'],
  ['resetCycle', 'próxima fatura não muda', 'PUT reinicia o ciclo'],
  ['chargeNow', 'nada cobrado na hora', 'PUT cobra na hora'],
  ['reject', 'PUT aceito', 'PUT recusado pelo MP'],
]) {
  const r = await probe({ mode });
  check(r.code === 1 && failedMsgs(r).includes(needle), `${what}: sai 1 com "${needle}" reprovado`);
  check(cancelled(r.mp), `${what}: assinatura de teste cancelada`);
}
{
  const r = await probe({ mode: 'reject' });
  check(amountPuts(r.mp).length === 1, 'PUT recusado no aumento: não tenta a redução');
}

console.log('\n4. --manter');
{
  const r = await probe({ argv: ['--manter'] });
  check(r.code === 0 && !cancelled(r.mp), 'não cancela e sai 0');
  check(r.lines.some(l => l.includes('estado pre-1')), 'diz como fotografar depois');
}

console.log('\n5. .env.sandbox.local');
{
  const dir = await mkdtemp(join(tmpdir(), 'zc-mp-sandbox-'));
  const file = join(dir, '.env.sandbox.local');
  await writeFile(file, [
    '# credenciais de teste',
    'MP_ACCESS_TOKEN=APP_USR-producao',
    'MP_SANDBOX_ACCESS_TOKEN="APP_USR-do-arquivo"',
    "export MP_SANDBOX_PUBLIC_KEY='APP_USR-pk'",
    'MP_SANDBOX_PAYER_EMAIL=test_user_9@testuser.com',
  ].join('\n'));
  const e = await sandboxEnv({ MP_SANDBOX_PAYER_EMAIL: 'test_user_env@testuser.com', MP_ACCESS_TOKEN: 'APP_USR-producao' }, file);
  check(e.MP_SANDBOX_ACCESS_TOKEN === 'APP_USR-do-arquivo' && e.MP_SANDBOX_PUBLIC_KEY === 'APP_USR-pk', 'lê MP_SANDBOX_* do arquivo, sem aspas');
  check(e.MP_SANDBOX_PAYER_EMAIL === 'test_user_env@testuser.com', 'a variável de ambiente vale mais que o arquivo');
  check(!('MP_ACCESS_TOKEN' in e), 'MP_ACCESS_TOKEN (do arquivo ou do ambiente) não entra');
  const none = await sandboxEnv({}, join(dir, 'nao-existe'));
  check(Object.keys(none).length === 0, 'sem arquivo: vazio, sem erro');
}

console.log(ok ? '\n✓ mp-sandbox: tudo passou' : '\n✗ mp-sandbox: falhou');
process.exit(ok ? 0 : 1);
