/**
 * Teste de cobrança no SANDBOX do Mercado Pago: o ajuste de valor da
 * assinatura (PUT no preapproval) que está atrás de MP_ADJUST_ENABLED.
 *
 *   cd ibr-checklists-app && node scripts/mp-sandbox/ajuste.mjs [--checkout] [--manter]
 *
 * com as credenciais de teste em ibr-checklists-app/.env.sandbox.local
 * (ignorado pelo git) ou no ambiente:
 *   MP_SANDBOX_ACCESS_TOKEN=...   access token da conta VENDEDORA de teste
 *   MP_SANDBOX_PUBLIC_KEY=...     public key da mesma conta (não precisa com --checkout)
 *   MP_SANDBOX_PAYER_EMAIL=...    e-mail da conta COMPRADORA de teste
 *
 *   node scripts/mp-sandbox/ajuste.mjs --id <preapproval>   (reusa uma já autorizada)
 *   node scripts/mp-sandbox/ajuste.mjs estado <preapproval> (só fotografa, não altera)
 *
 * ── Por que existe ───────────────────────────────────────────────────────────
 *
 * Mudar vagas ou lojas ativas reprecifica a assinatura com um PUT em
 * /preapproval/{id} (lib/billingServer.js applySubscriptionAmount). A
 * documentação do MP diz só que o PUT aceita `auto_recurring.transaction_amount`
 * — não diz se o aumento pede reconsentimento do pagador (a assinatura voltaria
 * a 'pending' e a próxima cobrança não sairia), se o ciclo reinicia, nem se o
 * MP cobra alguma coisa na hora. A flag só deve ser ligada com isso provado.
 *
 * O que fica afirmado, no aumento (1 loja anual → + 1 vaga) e na redução (volta):
 *   · o PUT é aceito;
 *   · a assinatura segue 'authorized' — sem reconsentimento;
 *   · transaction_amount passa a ser o valor novo;
 *   · next_payment_date NÃO muda — o ciclo não reinicia e não há pró-rata;
 *   · nenhuma cobrança sai na hora (charged_quantity/charged_amount iguais);
 *   · o NOSSO código lê o valor novo (preapprovalInfo) e o webhook que o MP
 *     re-dispara depois do PUT não vira divergência (webhookDecision com a
 *     intenção atualizada, como applySubscriptionAmount grava antes do PUT).
 * E fica registrado, sem veredito, o que o MP expõe da próxima fatura
 * (summarized, authorized_payments) — é o que responde "o valor novo vale da
 * próxima fatura". Com --manter a assinatura fica viva; `estado <id>` depois
 * da primeira cobrança mostra o valor que o MP cobrou de fato.
 *
 * ── Como não virar cobrança de verdade ───────────────────────────────────────
 *
 * Não lê .env.local nem MP_ACCESS_TOKEN: só as variáveis MP_SANDBOX_*. E
 * recusa rodar se o token não for de teste — prefixo TEST- ou conta com a tag
 * 'test_user' em /users/me. O PUT e as leituras passam por lib/mercadopago.js
 * (o mesmo código da produção), com MP_ACCESS_TOKEN apontado para o token de
 * teste só dentro deste processo. external_reference = 'sandbox-…', nunca o id
 * de uma empresa. Sem --manter a assinatura é cancelada no fim, passe ou não.
 *
 * Contas de teste (vendedor e comprador, mesmo país) são criadas no painel do
 * MP: Suas integrações → a aplicação → Contas de teste. O token e a public key
 * são as credenciais da conta VENDEDORA de teste; o e-mail é o da COMPRADORA.
 *
 * Por padrão a assinatura nasce autorizada pela API (card_token_id + status
 * 'authorized', cartão de teste com titular APRO) — sem navegador. Com
 * --checkout ela nasce 'pending' pelo createPreapproval da produção e o
 * script espera alguém pagar o init_point logado como a compradora de teste.
 *
 * Relatório: stdout + JSON em os.tmpdir(). Saída 0 = tudo passou; 1 = alguma
 * afirmação falhou; 2 = não deu para testar (credencial, rede, MP).
 */

import { build } from 'esbuild';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API = 'https://api.mercadopago.com';
const LIB = fileURLToPath(new URL('../../lib/', import.meta.url));

// Cartão de teste público do MP (Mastercard) — o titular APRO faz o MP aprovar.
const TEST_CARD = { number: '5031433215406351', cvv: '123', month: 11 };
const TEST_CPF = '12345678909';

// lib/mercadopago.js, lib/seats.js e lib/plans.js pelo esbuild, como os specs:
// resolve os imports sem extensão do Next e prova o código que as rotas usam.
export async function loadLib() {
  const dir = join(LIB, '..', 'node_modules', '.cache', 'zc-mp-sandbox');
  await mkdir(dir, { recursive: true });
  const entry = join(dir, 'entry.js');
  const out = join(dir, 'bundle.mjs');
  await writeFile(entry, [
    `export * from '${join(LIB, 'mercadopago.js')}';`,
    `export { preapprovalInfo, webhookDecision, checkoutReason, sameAmount } from '${join(LIB, 'seats.js')}';`,
    `export { priceForUnits, formatBRL } from '${join(LIB, 'plans.js')}';`,
  ].join('\n'));
  await build({ entryPoints: [entry], outfile: out, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
  return import(`${pathToFileURL(out).href}?t=${Date.now()}`);
}

async function mp(token, path, init = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return { ok: false, status: 0, body: { message: e?.message || String(e) } };
  }
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

// O que interessa da assinatura para comparar antes/depois.
function pick(pre) {
  const s = pre?.summarized || {};
  return {
    status: pre?.status ?? null,
    amount: pre?.auto_recurring?.transaction_amount ?? null,
    next_payment_date: pre?.next_payment_date ?? null,
    last_modified: pre?.last_modified ?? null,
    charged_quantity: s.charged_quantity ?? null,
    charged_amount: s.charged_amount ?? null,
    pending_charge_quantity: s.pending_charge_quantity ?? null,
    pending_charge_amount: s.pending_charge_amount ?? null,
    last_charged_date: s.last_charged_date ?? null,
    last_charged_amount: s.last_charged_amount ?? null,
    semaphore: s.semaphore ?? null,
  };
}

async function snapshot(lib, token, id) {
  const r = await lib.getPreapproval(id);
  if (!r.ok) return { ok: false, status: r.status, body: r.body };
  // Faturas da assinatura: processadas e agendadas. Endpoint pouco documentado
  // — se não responder, o relatório diz e segue (não é afirmação).
  const p = await mp(token, `/authorized_payments/search?preapproval_id=${encodeURIComponent(id)}`);
  const payments = p.ok && Array.isArray(p.body?.results)
    ? p.body.results.map(x => ({
        id: x.id, status: x.status, transaction_amount: x.transaction_amount,
        debit_date: x.debit_date ?? null, date_created: x.date_created ?? null,
        payment_status: x.payment?.status ?? null,
      }))
    : null;
  return { ok: true, raw: r.body, view: pick(r.body), payments, paymentsStatus: p.status };
}

// O MP pode demorar a refletir o PUT: relê até o valor novo aparecer.
async function snapshotAfterPut(lib, token, id, amount, sleep) {
  let snap;
  for (let i = 0; i < 6; i++) {
    await sleep(i === 0 ? 1500 : 3000);
    snap = await snapshot(lib, token, id);
    if (snap.ok && lib.sameAmount(snap.view.amount, amount)) break;
  }
  return snap;
}

const processed = (payments) => (payments || []).filter(p => p.status !== 'scheduled').length;

/**
 * Um PUT de `from` → `to` e as afirmações sobre ele. `intent` é a intenção que
 * applySubscriptionAmount grava em billing_checkouts ANTES do PUT.
 */
async function adjustStep(ctx, { label, id, before, to, intent }) {
  const { lib, token, sleep, check, note } = ctx;
  const brl = (v) => lib.formatBRL(v, { cents: true });
  note(`\n${label}: ${brl(before.view.amount)} → ${brl(to)}`);
  const res = await lib.updatePreapprovalAmount(id, to);
  check(res.ok, `${label}: PUT aceito (HTTP ${res.status})`, res.ok ? null : res.body);
  if (!res.ok) return { res, after: before };

  const after = await snapshotAfterPut(lib, token, id, to, sleep);
  if (!after.ok) {
    check(false, `${label}: assinatura relida depois do PUT (HTTP ${after.status})`, after.body);
    return { res, after: before };
  }
  const a = after.view, b = before.view;
  check(a.status === 'authorized', `${label}: segue 'authorized' — sem reconsentimento (é '${a.status}')`);
  check(lib.sameAmount(a.amount, to), `${label}: transaction_amount = ${brl(to)} (é ${brl(a.amount)})`);
  check(a.next_payment_date === b.next_payment_date,
    `${label}: próxima fatura não muda (${b.next_payment_date} → ${a.next_payment_date})`);
  const noCharge = (a.charged_quantity ?? 0) === (b.charged_quantity ?? 0)
    && lib.sameAmount(a.charged_amount ?? 0, b.charged_amount ?? 0)
    && (after.payments == null || before.payments == null || processed(after.payments) === processed(before.payments));
  check(noCharge, `${label}: nada cobrado na hora (cobranças ${b.charged_quantity ?? 0} → ${a.charged_quantity ?? 0}, `
    + `${brl(b.charged_amount)} → ${brl(a.charged_amount)})`);

  const info = lib.preapprovalInfo(after.raw);
  check(info && lib.sameAmount(info.amount, to), `${label}: preapprovalInfo lê ${brl(to)} (lê ${brl(info?.amount)})`);
  const d = lib.webhookDecision({ intent, companyId: intent.company_id, amount: info?.amount });
  check(d.hasIntent && !d.mismatch && lib.sameAmount(d.accountPatch.billed_amount, to),
    `${label}: webhook re-disparado não vira divergência (billed_amount ${brl(d.accountPatch.billed_amount)})`);

  note(`   summarized depois: ${JSON.stringify({
    pending_charge_quantity: a.pending_charge_quantity, pending_charge_amount: a.pending_charge_amount,
    semaphore: a.semaphore,
  })}`);
  if (after.payments) {
    const sched = after.payments.filter(p => p.status === 'scheduled');
    note(`   faturas: ${after.payments.length} (${sched.length} agendada(s)`
      + `${sched.length ? `: ${sched.map(p => `${brl(p.transaction_amount)} em ${p.debit_date}`).join(', ')}` : ''})`);
  } else {
    note(`   faturas: /authorized_payments/search indisponível (HTTP ${after.paymentsStatus})`);
  }
  return { res, after };
}

async function assertTestToken(token) {
  if (token.startsWith('TEST-')) return { ok: true, how: 'prefixo TEST-' };
  const me = await mp(token, '/users/me');
  if (!me.ok) return { ok: false, why: `/users/me respondeu HTTP ${me.status}` };
  const tags = Array.isArray(me.body?.tags) ? me.body.tags : [];
  if (tags.includes('test_user')) return { ok: true, how: `conta de teste ${me.body?.id} (tag test_user)` };
  return { ok: false, why: `a conta ${me.body?.id} não é de teste (tags: ${tags.join(', ') || 'nenhuma'})` };
}

async function createAuthorized(ctx, { amount, reason, externalRef }) {
  const { token, env } = ctx;
  if (!env.MP_SANDBOX_PUBLIC_KEY) return { ok: false, why: 'falta MP_SANDBOX_PUBLIC_KEY (ou use --checkout)' };
  const year = new Date().getFullYear() + 4;
  const ct = await mp(token, `/v1/card_tokens?public_key=${encodeURIComponent(env.MP_SANDBOX_PUBLIC_KEY)}`, {
    method: 'POST',
    body: JSON.stringify({
      card_number: TEST_CARD.number, security_code: TEST_CARD.cvv,
      expiration_month: TEST_CARD.month, expiration_year: year,
      cardholder: { name: 'APRO', identification: { type: 'CPF', number: TEST_CPF } },
    }),
  });
  if (!ct.ok || !ct.body?.id) return { ok: false, why: `card_token HTTP ${ct.status}`, body: ct.body };
  const r = await mp(token, '/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason, external_reference: externalRef, payer_email: env.MP_SANDBOX_PAYER_EMAIL,
      back_url: 'https://zcheckapp.com/app', card_token_id: ct.body.id, status: 'authorized',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: amount, currency_id: 'BRL' },
    }),
  });
  if (!r.ok || !r.body?.id) return { ok: false, why: `preapproval HTTP ${r.status}`, body: r.body };
  return { ok: true, id: String(r.body.id) };
}

// --checkout: o caminho da produção (pending + init_point). Espera alguém pagar.
async function createViaCheckout(ctx, { amount, reason, externalRef }) {
  const { lib, env, sleep, note } = ctx;
  const pre = await lib.createPreapproval({
    amount, reason, payerEmail: env.MP_SANDBOX_PAYER_EMAIL, companyId: externalRef,
    backUrl: 'https://zcheckapp.com/app', frequencyMonths: 1,
  });
  if (!pre.ok || !pre.id) return { ok: false, why: `createPreapproval HTTP ${pre.status}`, body: pre.body };
  note(`\nAbra e pague logado como a COMPRADORA de teste (cartão de teste, titular APRO):\n  ${pre.initPoint}\n`);
  const deadline = ctx.now() + 15 * 60 * 1000;
  while (ctx.now() < deadline) {
    await sleep(10000);
    const r = await lib.getPreapproval(pre.id);
    if (r.ok && r.body?.status === 'authorized') return { ok: true, id: String(pre.id) };
  }
  return { ok: false, why: 'ninguém autorizou o init_point em 15 min', id: String(pre.id) };
}

/**
 * Roda o teste. `env` só precisa das MP_SANDBOX_*; `sleep`/`now`/`log` são
 * injetáveis para o spec (tests/mp-sandbox.spec.mjs) rodar contra um MP falso.
 * Retorna { code, report }.
 */
export async function run({ argv = [], env = process.env, sleep = (ms) => new Promise(r => setTimeout(r, ms)),
  now = () => Date.now(), log = console.log, lib = null, writeReport = true } = {}) {
  const token = env.MP_SANDBOX_ACCESS_TOKEN;
  const report = { startedAt: new Date(now()).toISOString(), checks: [], notes: [] };
  const note = (m) => { report.notes.push(m); log(m); };
  const check = (c, m, detail = null) => {
    report.checks.push({ ok: !!c, msg: m, ...(detail != null ? { detail } : {}) });
    log(`  ${c ? '✓' : '✗'} ${m}${!c && detail != null ? `\n      ${JSON.stringify(detail).slice(0, 400)}` : ''}`);
  };
  const finish = async (code) => {
    report.code = code;
    if (writeReport) {
      const file = join(tmpdir(), `zcheck-mp-sandbox-${report.startedAt.replace(/[:.]/g, '-')}.json`);
      await writeFile(file, JSON.stringify(report, null, 2));
      log(`\nRelatório: ${file}`);
    }
    return { code, report };
  };
  const fail = (why, body) => { log(`\n✗ Não deu para testar: ${why}${body ? `\n  ${JSON.stringify(body).slice(0, 400)}` : ''}`); report.setupError = { why, body }; return finish(2); };

  if (!token) return fail('falta MP_SANDBOX_ACCESS_TOKEN (credencial da conta VENDEDORA de teste)');
  const guard = await assertTestToken(token);
  if (!guard.ok) return fail(`token recusado — ${guard.why}. Este script só roda com credencial de teste.`);
  note(`Token de teste: ${guard.how}`);

  lib = lib || await loadLib();
  // lib/mercadopago.js lê o token a cada chamada; aqui é o de teste, só neste processo.
  process.env.MP_ACCESS_TOKEN = token;
  const ctx = { lib, token, env, sleep, now, check, note };

  const [cmd, arg] = argv.filter(a => !a.startsWith('--'));
  if (cmd === 'estado') {
    if (!arg) return fail('uso: estado <preapproval>');
    const s = await snapshot(lib, token, arg);
    if (!s.ok) return fail(`preapproval ${arg} HTTP ${s.status}`, s.body);
    report.estado = s;
    note(JSON.stringify({ assinatura: s.view, faturas: s.payments }, null, 2));
    return finish(0);
  }

  const keep = argv.includes('--manter');
  const idIdx = argv.indexOf('--id');
  const reuse = idIdx >= 0 ? argv[idIdx + 1] : null;

  // Os valores saem de lib/plans.js — nunca escritos à mão.
  const base = lib.priceForUnits(1, 'annual', 0);
  const plus = lib.priceForUnits(1, 'annual', 1);
  const externalRef = `sandbox-${now()}`;
  let id = reuse, created = false;

  if (!id) {
    if (!env.MP_SANDBOX_PAYER_EMAIL) return fail('falta MP_SANDBOX_PAYER_EMAIL (e-mail da conta COMPRADORA de teste)');
    const reason = lib.checkoutReason({ units: 1, extraSeats: 0, cycle: 'annual' });
    const c = argv.includes('--checkout')
      ? await createViaCheckout(ctx, { amount: base.monthlyCharge, reason, externalRef })
      : await createAuthorized(ctx, { amount: base.monthlyCharge, reason, externalRef });
    if (c.id) { id = c.id; created = true; }
    if (!c.ok) {
      if (created && !keep) await lib.cancelPreapproval(id);
      return fail(`assinatura de teste não criada — ${c.why}`, c.body);
    }
    note(`Assinatura de teste: ${id} (${externalRef}), ${lib.formatBRL(base.monthlyCharge, { cents: true })}/mês`);
  }
  report.preapprovalId = id;

  let code = 0;
  try {
    const before = await snapshot(lib, token, id);
    if (!before.ok) return fail(`preapproval ${id} HTTP ${before.status}`, before.body);
    if (before.view.status !== 'authorized') return fail(`a assinatura ${id} está '${before.view.status}', não 'authorized'`);
    report.antes = before.view;
    report.faturasAntes = before.payments;
    const owner = String(before.raw?.external_reference ?? externalRef);
    const from = Number(before.view.amount);
    // Aumento: + 1 vaga adicional sobre o que está cobrando; redução: volta.
    const up = lib.sameAmount(from, base.monthlyCharge) ? plus.monthlyCharge : from + (plus.monthlyCharge - base.monthlyCharge);
    const intentUp = { company_id: owner, cycle: 'annual', units: 1, extra_seats: 1, amount: up };
    const intentDown = { company_id: owner, cycle: 'annual', units: 1, extra_seats: 0, amount: from };

    const s1 = await adjustStep(ctx, { label: 'Aumento', id, before, to: up, intent: intentUp });
    report.depoisAumento = s1.after.view;
    report.faturasDepoisAumento = s1.after.payments;
    if (s1.res.ok) {
      const s2 = await adjustStep(ctx, { label: 'Redução', id, before: s1.after, to: from, intent: intentDown });
      report.depoisReducao = s2.after.view;
      report.faturasDepoisReducao = s2.after.payments;
    }
  } finally {
    if (created && !keep) {
      const c = await lib.cancelPreapproval(id);
      note(c.ok ? `\nAssinatura de teste ${id} cancelada.` : `\n! Cancelamento de ${id} falhou (HTTP ${c.status}) — cancele no painel do vendedor de teste.`);
    } else if (keep) {
      note(`\nAssinatura ${id} mantida. Depois da próxima cobrança:\n  node scripts/mp-sandbox/ajuste.mjs estado ${id}`);
    }
  }

  const failed = report.checks.filter(c => !c.ok).length;
  code = failed ? 1 : 0;
  log(failed
    ? `\n✗ ${failed} de ${report.checks.length} afirmação(ões) falharam — NÃO ligue MP_ADJUST_ENABLED.`
    : `\n✓ ${report.checks.length} afirmações passaram — o PUT se comporta como o billing supõe.`);
  return finish(code);
}

/**
 * As credenciais de teste podem ficar em ibr-checklists-app/.env.sandbox.local
 * (ignorado pelo git, como todo .env*). Só entram chaves MP_SANDBOX_* — um
 * MP_ACCESS_TOKEN colado ali por engano não é lido — e a variável de ambiente
 * vale mais que o arquivo.
 */
export async function sandboxEnv(env = process.env, file = join(LIB, '..', '.env.sandbox.local')) {
  const fromFile = {};
  const text = await readFile(file, 'utf8').catch(() => '');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?(MP_SANDBOX_[A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) fromFile[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  const out = { ...fromFile };
  for (const [k, v] of Object.entries(env)) if (k.startsWith('MP_SANDBOX_') && v) out[k] = v;
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code } = await run({ argv: process.argv.slice(2), env: await sandboxEnv() });
  process.exit(code);
}
