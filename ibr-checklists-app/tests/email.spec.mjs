/**
 * Falha de envio do Brevo não pode ser muda.
 *
 *   cd ibr-checklists-app && node tests/email.spec.mjs
 *
 * Caso de 24/09/2026: o código do /comecar parou de chegar. O Brevo estava
 * com "Authorised IPs" ligado e recusava cada IP novo da Vercel com
 * 401 "unrecognised IP address". O envio roda depois da resposta (after() no
 * request-otp), a tela dizia "Enviamos um código" e o único rastro era uma
 * linha de log.
 *
 * O que fica provado, sem rede nem banco (fetch e supabase dublados):
 *   1. o 401 de IP vira reason 'ip_not_authorized', com status e detalhe;
 *   2. outra recusa vira 'send_failed' com o HTTP e o corpo;
 *   3. sem chave, 'not_configured' — e o fetch nem é chamado;
 *   4. a falha vira alerta crítico `email_send_failed` em admin_alerts, com a
 *      ação certa (desativar o bloqueio, não liberar o IP) e dedupe por
 *      causa + dia; envio bem-sucedido não grava nada.
 */
import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

let ok = true;
const check = (c, m) => { if (!c) ok = false; console.log(`  ${c ? '✓' : '✗'} ${m}`); };

const emailPath = join(process.cwd(), 'lib', 'email.js');
const dir = join(process.cwd(), 'node_modules', '.cache', 'zc-email');
await mkdir(dir, { recursive: true });
const entry = join(dir, 'entry.js');
const out = join(dir, 'bundle.mjs');
await writeFile(entry, `export * from '${emailPath}';\n`);
await build({
  entryPoints: [entry], outfile: out, bundle: true, format: 'esm',
  platform: 'node', logLevel: 'silent',
});
const { sendOtpEmail, sendPlainEmail, raiseEmailAlert } = await import(out);

const IP_BODY = JSON.stringify({
  message: 'We have detected you are using an unrecognised IP address 35.175.250.226. If you performed this action make sure to add the new IP address in this link: https://app.brevo.com/security/authorised_ips',
  code: 'unauthorized',
});

let calls = [];
const stubFetch = (status, body) => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
};
console.error = () => {}; // a lib loga a recusa; aqui só interessa o retorno

function fakeDb() {
  const rows = [];
  return {
    rows,
    from(table) {
      return {
        upsert(r, opts) { rows.push({ table, rows: r, opts }); return Promise.resolve({ error: null }); },
      };
    },
  };
}

process.env.BREVO_API_KEY = 'xkeysib-teste';

console.log('\n1. bloqueio de IP do Brevo');
stubFetch(401, IP_BODY);
const ipFail = await sendOtpEmail('dono@exemplo.com', '123456');
check(ipFail.ok === false && ipFail.reason === 'ip_not_authorized', `reason = ${ipFail.reason}`);
check(ipFail.status === 401, 'status 401 preservado');
check(/unrecognised IP/.test(ipFail.detail || ''), 'detalhe traz a mensagem do Brevo');
check(calls.length === 1 && calls[0].url === 'https://api.brevo.com/v3/smtp/email', 'uma chamada ao endpoint de envio');
const payload = JSON.parse(calls[0].init.body);
check(payload.to[0].email === 'dono@exemplo.com' && payload.subject.includes('123456'), 'destinatário e código no envio');

console.log('\n2. outra recusa');
stubFetch(400, '{"code":"invalid_parameter","message":"sender is not valid"}');
const other = await sendPlainEmail('dono@exemplo.com', 'Oi', 'linha 1\nlinha 2');
check(other.reason === 'send_failed' && other.status === 400, `send_failed com HTTP 400 (${other.reason}/${other.status})`);
check(/sender is not valid/.test(other.detail || ''), 'detalhe traz o corpo');
stubFetch(401, '{"code":"unauthorized","message":"Key not found"}');
const badKey = await sendOtpEmail('dono@exemplo.com', '123456');
check(badKey.reason === 'send_failed', '401 de chave inválida NÃO é confundido com bloqueio de IP');

console.log('\n3. sem chave');
delete process.env.BREVO_API_KEY;
stubFetch(200, '{}');
const noKey = await sendOtpEmail('dono@exemplo.com', '123456');
check(noKey.reason === 'not_configured', 'not_configured');
check(calls.length === 0, 'fetch não é chamado');
process.env.BREVO_API_KEY = 'xkeysib-teste';

console.log('\n4. alerta no Core');
const db = fakeDb();
await raiseEmailAlert(db, 'código do cadastro /comecar', ipFail);
const alert = db.rows[0]?.rows?.[0];
check(db.rows.length === 1 && db.rows[0].table === 'admin_alerts', 'grava em admin_alerts');
check(alert?.severity === 'critical' && alert?.rule === 'email_send_failed', 'crítico, rule email_send_failed');
check(/authorised_ips/.test(alert?.message || '') && /desative/i.test(alert?.message || ''), 'mensagem manda desativar o bloqueio');
check(/\/comecar/.test(alert?.message || ''), 'mensagem diz qual fluxo parou');
check(/^email_send_failed\|ip_not_authorized\|\d{4}-\d{2}-\d{2}$/.test(alert?.dedupe_key || ''), `dedupe por causa + dia (${alert?.dedupe_key})`);
check(db.rows[0].opts?.ignoreDuplicates === true && db.rows[0].opts?.onConflict === 'dedupe_key', 'não duplica no mesmo dia');

const db2 = fakeDb();
await raiseEmailAlert(db2, 'follow-up', other);
check(/HTTP 400/.test(db2.rows[0]?.rows?.[0]?.message || ''), 'recusa genérica leva o HTTP na mensagem');

const db3 = fakeDb();
await raiseEmailAlert(db3, 'x', { ok: true });
check(db3.rows.length === 0, 'envio ok não gera alerta');

console.log(ok ? '\nemail: ok' : '\nemail: FALHOU');
process.exit(ok ? 0 : 1);
