// IBR Checklists — notify-overdue v10
//
// ── v9, 29/07/2026: o aviso enviado passa a virar registro ─────────────────
// A função só deixava rastro na chave `notified_<data>` de `config` — um array
// de ids por dia, criado para DEDUPLICAR, não para contar história. O painel do
// app lia dali e mostrava a hora do último upsert do dia para todos os avisos,
// misturado com ids de outras empresas (a chave é global). Agora cada aviso
// entregue vira uma linha em `notification_log`: empresa, loja, checklist,
// alvos e entregues, com a hora do envio. `notified_` continua exatamente como
// estava — é a deduplicação, e não muda de dono.
// Escrever no log NÃO derruba a execução: o push já saiu, e perder o registro é
// menos grave que repetir o aviso. A falha vai no retorno, em `logFalhou`.
//
// ── v8, 27/07/2026: a entrega do push nunca tinha sido verificada ──────────
// A v7 ressuscitou a função, e a primeira execução viva expôs três defeitos na
// etapa de envio, todos antigos:
//   1. o item era marcado como "avisado" INCONDICIONALMENTE, mesmo com zero
//      alvo ou zero envio bem-sucedido — um dia de falha total ficava marcado e
//      os alertas se perdiam em silêncio (foi o que aconteceu em 27/07). Agora
//      só marca o que de fato saiu (`entregues > 0`), e a chave `notified_` só
//      é gravada se houve algo a marcar.
//   2. o papel `lideranca` (posterior a esta função) não estava entre os que
//      recebem o aviso de uma loja — numa loja sem inscrição própria, ninguém.
//   3. inscrição expirada (404/410) só era logada, nunca removida — a função
//      falharia nela todos os dias. Agora é podada.
// O retorno agora detalha sent/avisados/semAlvo/falhas/inscricoesRemovidas.
//
// ── v7: a função lia o banco com a ANON KEY ────────────────────────────────
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
  console.log('notify-overdue v10 started');

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

  // `select('*')` de propósito: `active` nasceu em 20260730_templates_desativar
  // e nomear a coluna faria a query falhar (42703) num banco sem a migration —
  // derrubando o aviso de atraso inteiro por causa de uma coluna nova.
  const { data: templates, error: eTpl } = await supabase
    .from('templates').select('*');
  if (eTpl) return falha('templates', eTpl);
  // Checklist DESATIVADO não é cobrado. Sem este filtro, remover um checklist em
  // Gerenciar (que agora desativa em vez de apagar, preservando o histórico)
  // deixaria a equipe recebendo push de atraso de uma rotina que não existe mais.
  const ativos = (templates || []).filter((t: any) => t.active !== false);
  const comPrazo = ativos.filter((t: any) => t.deadline);
  console.log(`Templates: ${ativos.length} ativos de ${(templates || []).length}`);

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

  // Papéis que recebem o aviso de uma loja além de quem está lotado nela.
  // `lideranca` entrou depois que esta função foi escrita e ficou de fora até
  // 27/07/2026 — numa loja sem inscrição própria, ninguém era alvo.
  const PAPEIS_AMPLOS = ['gestao', 'gerencia', 'lideranca'];

  let sent = 0;
  let semAlvo = 0;
  const avisadosAgora: string[] = [];
  // Uma linha por checklist avisado — o histórico que o painel lê. Só entra o
  // que teve entrega confirmada, o mesmo critério de `avisadosAgora`.
  const registros: any[] = [];
  const falhas: Record<string, number> = {};
  const mortas = new Set<string>();

  for (const t of atrasados) {
    const empresa = t.company_id ?? empresaDaLoja.get(t.unit_id) ?? null;
    const alvos = (subs as any[]).filter(s => {
      const empresaDoSub = s.company_id ?? empresaDaLoja.get(s.unit_id) ?? null;
      // Empresa é barreira, não preferência: sem isso o service_role manda o
      // atraso de um cliente para a diretoria de outro.
      if (empresa == null || empresaDoSub !== empresa) return false;
      return s.unit_id === t.unit_id || PAPEIS_AMPLOS.includes(s.role);
    });

    if (alvos.length === 0) {
      // NÃO marca como avisado: sem ninguém para avisar, o aviso não aconteceu.
      // Assim que alguém da loja ativar a notificação, a próxima execução pega.
      semAlvo++;
      continue;
    }

    const titulo = `⚠ Checklist atrasado — ${String(t.unit_id ?? '').toUpperCase()}`;
    const corpo = `${t.name} (${t.sector}) — prazo: ${t.deadline}`;
    const payload = JSON.stringify({ title: titulo, body: corpo });

    let entregues = 0;
    for (const s of alvos) {
      try {
        const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        const r = await webpush.sendNotification(sub, payload, { TTL: 86400 });
        if (r.statusCode >= 200 && r.statusCode < 300) { sent++; entregues++; }
      } catch (e: any) {
        const code = String(e?.statusCode ?? 'erro');
        falhas[code] = (falhas[code] || 0) + 1;
        console.error(`Push error: ${code} ${e?.body ?? ''}`);
        // 404/410 = o serviço de push diz que esta inscrição não existe mais.
        // Sem podar, a função falha nela todo dia, para sempre.
        if (e?.statusCode === 404 || e?.statusCode === 410) mortas.add(s.endpoint);
      }
    }

    // Só marca como avisado o que REALMENTE saiu. Até 27/07/2026 esta linha
    // rodava incondicionalmente: um dia em que todos os envios falhavam ficava
    // marcado como avisado e os alertas daquele dia se perdiam em silêncio.
    if (entregues > 0) {
      avisadosAgora.push(t.id);
      registros.push({
        company_id: empresa, unit_id: t.unit_id, kind: 'atraso',
        title: titulo, body: corpo,
        template_id: t.id, sector: t.sector, deadline: t.deadline,
        targets: alvos.length, delivered: entregues,
      });
    }
  }

  if (mortas.size > 0) {
    const { error: eDel } = await supabase
      .from('push_subscriptions').delete().in('endpoint', [...mortas]);
    if (eDel) console.error('falha ao podar inscrições mortas:', eDel.message);
    else console.log(`Inscrições mortas removidas: ${mortas.size}`);
  }

  if (avisadosAgora.length > 0) {
    const { error: eUp } = await supabase.from('config').upsert(
      { key: notifKey, value: JSON.stringify([...jaAvisados, ...avisadosAgora]), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
    if (eUp) return falha('config upsert', eUp);
  }

  // O histórico é secundário ao aviso: se esta gravação falhar, o push já saiu e
  // a deduplicação já está registrada. Não devolve 500 — mas também não some:
  // vai no retorno, para não repetir a história do erro engolido da v6.
  let logFalhou: string | null = null;
  if (registros.length > 0) {
    const { error: eLog } = await supabase.from('notification_log').insert(registros);
    if (eLog) {
      logFalhou = eLog.message;
      console.error('[notify-overdue] notification_log:', eLog.message);
    }
  }

  console.log(`Done. Sent: ${sent}, avisados: ${avisadosAgora.length}, semAlvo: ${semAlvo}, falhas: ${JSON.stringify(falhas)}`);
  return new Response(JSON.stringify({
    ok: true, sent, atrasados: atrasados.length,
    avisados: avisadosAgora.length, semAlvo,
    falhas, inscricoesRemovidas: mortas.size,
    registrados: logFalhou ? 0 : registros.length,
    ...(logFalhou ? { logFalhou } : {}),
  }), { headers: { 'Content-Type': 'application/json' } });
});
