// IBR Checklists — notify-overdue v7
//
// v7 muda três coisas, e as três vieram de um mesmo achado: a função lia o
// banco com a ANON KEY.
//
// 1. SERVICE_ROLE em vez de anon. A anon key é a chave pública que vai no
//    bundle; usá-la do lado do servidor obrigava o banco a manter aberto para
//    QUALQUER pessoa tudo o que esta função precisava ler e escrever. Era isso
//    que sustentava a policy `anon_all_config` (ALL, qual true) em `config` —
//    com ela, dava para gravar `notified_<hoje>` de fora e desligar o aviso de
//    atraso de todas as empresas. Aqui o segredo nunca chega a um navegador.
//
//    Consequência imediata: esta função estava MORTA desde a varredura 03c
//    (26/07), que tirou do anon o acesso a templates, completions e
//    push_subscriptions. Ela não quebrou com estardalhaço — ela passou a
//    responder "No overdue" todo dia, porque o erro era descartado.
//
// 2. Erro deixa de ser silencioso. Todo `select` agora checa `error`. Era a
//    ausência disso que fazia a função morta parecer saudável: `data` vinha
//    null, `(templates||[])` virava lista vazia e o retorno era um 200 alegre.
//    Agora ela responde 500 com o que falhou.
//
// 3. Escopo por empresa no alvo do push. O filtro era
//    `s.unit_id === t.unit_id || s.role === 'gestao' || s.role === 'gerencia'`
//    — sem company_id. Com o RLS valendo para o anon isso ainda era contido;
//    com service_role o RLS não se aplica, e uma diretoria da empresa A
//    receberia o atraso da empresa B com nome do checklist e da loja. O papel
//    dá o alcance DENTRO da empresa, nunca fora dela.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Injetada pelo Supabase em toda edge function. Sem fallback para a anon:
// se faltar, é melhor falhar alto do que voltar a rodar sem permissão.
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;

const APP_TZ = 'America/Sao_Paulo';

// Data e hora no relógio de uma zona. `Intl` em vez do `-3h` fixo da v6: o app
// passou a ter fuso por loja (units.timezone), e uma loja em Manaus receberia
// "atrasado" uma hora antes do prazo dela. Não dá para importar lib/dates.js
// aqui — a função é deployada isolada — então a lógica é reescrita, mas o
// contrato é o mesmo: dia de operação é o do relógio de quem executa.
function localParts(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a: any, x) => (a[x.type] = x.value, a), {});
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const falha = (etapa: string, e: any) => {
  console.error(`[notify-overdue] falhou em ${etapa}:`, e?.message || e);
  return new Response(JSON.stringify({ ok: false, etapa, erro: e?.message || String(e) }),
    { status: 500, headers: { 'Content-Type': 'application/json' } });
};

Deno.serve(async () => {
  console.log('notify-overdue v7 started');

  webpush.setVapidDetails('mailto:ingonegocios@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const agora = new Date();

  const { data: units, error: eUnits } = await supabase.from('units').select('id, company_id, timezone');
  if (eUnits) return falha('units', eUnits);
  // Tupla explícita no retorno do map: sem ela o Map nasce <unknown, unknown> e
  // o fuso chega em `localParts` como unknown.
  const tzDaLoja = new Map<string, string>(
    (units || []).map((u: any): [string, string] => [u.id, u.timezone || APP_TZ]));
  const empresaDaLoja = new Map<string, string | null>(
    (units || []).map((u: any): [string, string | null] => [u.id, u.company_id ?? null]));

  const { data: templates, error: eTpl } = await supabase
    .from('templates').select('id, unit_id, company_id, sector, name, deadline');
  if (eTpl) return falha('templates', eTpl);
  const comPrazo = (templates || []).filter((t: any) => t.deadline);

  // As datas de operação em jogo — uma por fuso presente no parque, não uma só.
  const datas = [...new Set(comPrazo.map((t: any) =>
    localParts(agora, tzDaLoja.get(t.unit_id) || APP_TZ).date))];

  const { data: completions, error: eComp } = await supabase
    .from('completions').select('template_id, date').in('date', datas.length ? datas : ['1970-01-01']);
  if (eComp) return falha('completions', eComp);
  const feitos = new Set((completions || []).map((c: any) => `${c.template_id}|${c.date}`));

  // A chave de deduplicação segue o dia de Brasília: é uma janela de controle,
  // não um dado de operação. Numa rede multi-fuso o pior caso é uma repetição
  // na virada, e não um aviso perdido — que é o lado certo para errar.
  const notifKey = `notified_${localParts(agora, APP_TZ).date}`;
  const { data: cfg, error: eCfg } = await supabase
    .from('config').select('value').eq('key', notifKey).maybeSingle();
  if (eCfg) return falha('config', eCfg);
  const jaAvisados: Set<string> = new Set(cfg?.value ? JSON.parse(cfg.value) : []);

  const atrasados = comPrazo.filter((t: any) => {
    const { date, minutes } = localParts(agora, tzDaLoja.get(t.unit_id) || APP_TZ);
    if (feitos.has(`${t.id}|${date}`)) return false;
    if (jaAvisados.has(t.id)) return false;
    const [h, m] = t.deadline.split(':').map(Number);
    return minutes > h * 60 + m;   // no relógio DA LOJA
  });
  console.log(`Atrasados: ${atrasados.length} de ${comPrazo.length} com prazo`);

  if (atrasados.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, message: 'Nenhum atrasado', comPrazo: comPrazo.length }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  const { data: subs, error: eSubs } = await supabase
    .from('push_subscriptions').select('endpoint, p256dh, auth, unit_id, company_id, role');
  if (eSubs) return falha('push_subscriptions', eSubs);
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, message: 'Sem inscrições' }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  let sent = 0;
  const avisadosAgora: string[] = [];

  for (const t of atrasados) {
    const empresa = t.company_id ?? empresaDaLoja.get(t.unit_id) ?? null;
    const alvos = (subs as any[]).filter(s => {
      const empresaDoSub = s.company_id ?? empresaDaLoja.get(s.unit_id) ?? null;
      // Empresa é barreira, não preferência: sem isso o service_role manda o
      // atraso de um cliente para a diretoria de outro.
      if (empresa == null || empresaDoSub !== empresa) return false;
      return s.unit_id === t.unit_id || s.role === 'gestao' || s.role === 'gerencia';
    });
    const payload = JSON.stringify({
      title: `⚠ Checklist atrasado — ${String(t.unit_id ?? '').toUpperCase()}`,
      body: `${t.name} (${t.sector}) — prazo: ${t.deadline}`,
    });
    for (const s of alvos) {
      try {
        const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        const r = await webpush.sendNotification(sub, payload, { TTL: 86400 });
        if (r.statusCode >= 200 && r.statusCode < 300) sent++;
      } catch (e: any) {
        console.error(`Push error: ${e.statusCode} ${e.body}`);
      }
    }
    avisadosAgora.push(t.id);
  }

  const { error: eUp } = await supabase.from('config').upsert(
    { key: notifKey, value: JSON.stringify([...jaAvisados, ...avisadosAgora]), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (eUp) return falha('config upsert', eUp);

  console.log(`Done. Sent: ${sent}`);
  return new Response(JSON.stringify({ ok: true, sent, atrasados: atrasados.length }),
    { headers: { 'Content-Type': 'application/json' } });
});
