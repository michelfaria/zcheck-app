// IBR Checklists — notify-overdue v12
//
// ── v12, 30/07/2026: modo simulação (?dry=1) ───────────────────────────────
// Esta função roda a cada 5 minutos e ENVIA PUSH para a operação real. Até aqui
// não havia como inspecioná-la sem notificar gente — e foi exatamente isso que a
// deixou meses quebrada respondendo "No overdue" sem ninguém notar (ver v7).
//
// `?dry=1` calcula tudo e devolve no corpo: o que enviaria, para quantos alvos, e
// um DIAGNÓSTICO de cada checklist com prazo (entregue? completo? quantas
// tarefas? já venceu?). Não envia push, não grava deduplicação, não escreve no
// log, não poda inscrição. Serve para conferir a régua a qualquer hora do dia,
// não só depois do prazo vencer.
//
// ── v11, 30/07/2026: o alerta de ENTREGUE INCOMPLETO ───────────────────────
// Havia uma brecha: qualquer submissão silenciava a cobrança do dia. Fechar o
// checklist com 1 de 8 itens matava o aviso de atraso — a métrica e o push
// mediam se alguém apertou "Concluir", não se o trabalho foi feito.
//
// Fechá-la com a régua do atraso seria errado: quem entregou 7 de 8 receberia
// "checklist atrasado", que é falso e queima a confiança no aviso. Então são
// DOIS alertas com textos e deduplicações separadas:
//   · atraso     → passou do prazo e NÃO foi entregue
//   · incompleto → passou do prazo, FOI entregue, e ficou tarefa pendente
//
// A régua de "completo" é a mesma do app (lib/rounds.js `roundIsComplete`):
// itens PREVISTOS para aquele dia, não os que sobraram no registro. A
// recorrência por dia da semana é reescrita aqui porque a função é deployada
// isolada — o contrato é o mesmo, e `previstasDoDia` é o espelho de
// `applicableItems`.
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

// Espelho de `weekdayOf` + `isItemApplicable`/`applicableItems` do app. Meio-dia
// UTC de propósito: a data já vem resolvida no fuso da loja, e usar 00:00 faria o
// dia da semana virar em quem está a oeste de Greenwich.
const diaDaSemana = (dateStr: string) => new Date(`${dateStr}T12:00:00Z`).getUTCDay();

function previstasDoDia(t: any, dateStr: string): string[] {
  const n = String(t.name || '').toLowerCase();
  const tipo = n.includes('abertura') ? 'abertura'
    : n.includes('fechamento') ? 'fechamento'
    : n.includes('intermedi') ? 'intermediario' : null;
  return (t.items || []).filter((i: any) => {
    if (i?.appearsIn?.length && tipo && !i.appearsIn.includes(tipo)) return false;
    if (!i?.recurrence || i.recurrence.length === 0) return true;
    return i.recurrence.includes(diaDaSemana(dateStr));
  }).map((i: any) => i?.id).filter(Boolean);
}

const falha = (etapa: string, e: any) => {
  console.error(`[notify-overdue] falhou em ${etapa}:`, e?.message || e);
  return new Response(JSON.stringify({ ok: false, etapa, erro: e?.message || String(e) }),
    { status: 500, headers: { 'Content-Type': 'application/json' } });
};

Deno.serve(async (req: Request) => {
  // `dry` nunca vem do cron (body vazio, sem query): produção segue idêntica.
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  console.log(`notify-overdue v12 started${dry ? ' (DRY RUN)' : ''}`);

  webpush.setVapidDetails('mailto:ingonegocios@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const agora = new Date();

  // `select('*')` pelo mesmo motivo do select de templates logo abaixo:
  // `active_from` nasceu em 20260815_units_active_from e nomear a coluna faria a
  // query falhar (42703) num banco sem a migration — derrubando o aviso de
  // atraso inteiro do parque por causa de uma coluna nova.
  const { data: units, error: eUnits } = await supabase.from('units').select('*');
  if (eUnits) return falha('units', eUnits);
  // Tupla explícita no retorno do map: sem ela o Map nasce <unknown, unknown> e
  // o fuso chega em `localParts` como unknown.
  const tzDaLoja = new Map<string, string>(
    (units || []).map((u: any): [string, string] => [u.id, u.timezone || APP_TZ]));
  const empresaDaLoja = new Map<string, string | null>(
    (units || []).map((u: any): [string, string | null] => [u.id, u.company_id ?? null]));
  // Dia em que a loja passa a valer (units.active_from). Antes dele o checklist
  // existe mas não é cobrado — e "não é cobrado" tem que valer aqui também: a
  // equipe que ainda está sendo treinada não pode receber push de atraso de uma
  // rotina que o app dela nem mostra. Nulo = sempre ativa. Ver lib/checklists.js
  // (`unitActiveOn`), que é a mesma regra do lado do cliente.
  const ativaDesde = new Map<string, string | null>(
    (units || []).map((u: any): [string, string | null] =>
      [u.id, u.active_from ? String(u.active_from).slice(0, 10) : null]));
  const lojaAtivaEm = (unitId: string, date: string) => {
    const desde = ativaDesde.get(unitId);
    return !desde || date >= desde;   // comparação por string YYYY-MM-DD, como no app
  };

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

  // `items` entrou na v11: sem ele não há como saber se a entrega ficou pela
  // metade. É o JSONB das tarefas de UM dia — algumas dezenas de linhas.
  const { data: completions, error: eComp } = await supabase
    .from('completions').select('template_id, date, items').in('date', datas.length ? datas : ['1970-01-01']);
  if (eComp) return falha('completions', eComp);

  // Uma entrada por RODADA (checklist × dia), com a UNIÃO das tarefas feitas em
  // todas as submissões: tarefa feita em qualquer submissão do dia está feita.
  const entregas = new Map<string, Set<string>>();
  for (const c of (completions || [])) {
    const k = `${c.template_id}|${c.date}`;
    if (!entregas.has(k)) entregas.set(k, new Set<string>());
    const feitas = entregas.get(k)!;
    for (const i of (c.items || [])) if (i?.done && i?.id) feitas.add(i.id);
  }
  const feitos = new Set(entregas.keys());

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
    if (!lojaAtivaEm(t.unit_id, date)) return false;
    if (feitos.has(`${t.id}|${date}`)) return false;
    if (jaAvisados.has(t.id)) return false;
    const [h, m] = t.deadline.split(':').map(Number);
    return minutes > h * 60 + m;   // no relógio DA LOJA
  });
  console.log(`Atrasados: ${atrasados.length} de ${comPrazo.length} com prazo`);

  // ── Entregue incompleto ────────────────────────────────────────────────────
  // Passou do prazo, FOI entregue, e ficou tarefa pendente. Deduplicação em
  // chave própria: um checklist pode ser avisado como atrasado às 10h (sem
  // entrega) e como incompleto às 14h (entregue pela metade) — são dois fatos.
  //
  // O prazo é o gatilho de propósito. Sem ele o aviso sairia no instante da
  // submissão, cobrando quem talvez esteja terminando o resto agora. Consequência
  // assumida: checklist SEM prazo (o "Intermediário") não gera este alerta.
  const incompKey = `incomplete_${localParts(agora, APP_TZ).date}`;
  const { data: cfgInc, error: eCfgInc } = await supabase
    .from('config').select('value').eq('key', incompKey).maybeSingle();
  if (eCfgInc) return falha('config incompleto', eCfgInc);
  const jaAvisadosInc: Set<string> = new Set(cfgInc?.value ? JSON.parse(cfgInc.value) : []);

  const incompletos = comPrazo.map((t: any) => {
    const { date, minutes } = localParts(agora, tzDaLoja.get(t.unit_id) || APP_TZ);
    if (!lojaAtivaEm(t.unit_id, date)) return null;
    const feitas = entregas.get(`${t.id}|${date}`);
    if (!feitas) return null;                       // não entregue = é atraso, não incompleto
    if (jaAvisadosInc.has(t.id)) return null;
    const [h, m] = t.deadline.split(':').map(Number);
    if (minutes <= h * 60 + m) return null;         // ainda dá tempo de terminar
    // Mesma régua do app: previstas do dia; na falta delas, o que veio no registro.
    let previstas = previstasDoDia(t, date);
    if (previstas.length === 0) previstas = [...feitas];
    const pendentes = previstas.filter((id: string) => !feitas.has(id));
    if (pendentes.length === 0) return null;        // entregue completo: nada a avisar
    return { ...t, _feitas: previstas.length - pendentes.length, _total: previstas.length, _pendentes: pendentes.length };
  }).filter(Boolean) as any[];
  console.log(`Incompletos: ${incompletos.length}`);

  // ── Simulação ──────────────────────────────────────────────────────────────
  // Sai ANTES de qualquer escrita ou envio. O diagnóstico classifica todo
  // checklist com prazo, inclusive os que ainda estão no prazo — é o que permite
  // conferir a conta de completude às 9h com prazo às 16h50.
  if (dry) {
    const { data: subsDry } = await supabase
      .from('push_subscriptions').select('endpoint, unit_id, company_id, role');
    const PAPEIS = ['gestao', 'gerencia', 'lideranca'];
    const alvosDe = (t: any) => {
      const empresa = t.company_id ?? empresaDaLoja.get(t.unit_id) ?? null;
      return (subsDry || []).filter((s: any) => {
        const e = s.company_id ?? empresaDaLoja.get(s.unit_id) ?? null;
        if (empresa == null || e !== empresa) return false;
        return s.unit_id === t.unit_id || PAPEIS.includes(s.role);
      }).length;
    };

    const diagnostico = comPrazo.map((t: any) => {
      const { date, minutes } = localParts(agora, tzDaLoja.get(t.unit_id) || APP_TZ);
      const feitas = entregas.get(`${t.id}|${date}`);
      const [h, m] = t.deadline.split(':').map(Number);
      const venceu = minutes > h * 60 + m;
      let previstas = previstasDoDia(t, date);
      if (previstas.length === 0 && feitas) previstas = [...feitas];
      const nFeitas = previstas.filter((id: string) => feitas?.has(id)).length;
      const completo = previstas.length > 0 && nFeitas === previstas.length;
      // A loja ainda não estreou? Então o veredito é ESSE, e não "ATRASO".
      //
      // Este diagnóstico é a única janela para dentro desta função (foi a
      // ausência dele que a deixou meses respondendo "No overdue" sem ninguém
      // notar). Deixá-lo carimbar ATRASO no que `atrasados` corretamente ignora
      // faria ele mentir da forma mais cara possível: quem depurar vê "4 ATRASO"
      // ao lado de "atrasados: 0" e conclui que a função quebrou de novo.
      const inativa = !lojaAtivaEm(t.unit_id, date);
      return {
        loja: t.unit_id, checklist: t.name, setor: t.sector, prazo: t.deadline,
        dia: date, agora: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
        venceu, entregue: !!feitas, tarefas: `${nFeitas}/${previstas.length}`,
        // `ativaDesde` só aparece quando explica algo — no parque sem data de
        // ativação o diagnóstico continua idêntico ao que sempre foi.
        ...(inativa ? { ativaDesde: ativaDesde.get(t.unit_id) } : {}),
        veredito: inativa ? 'loja ainda não ativa — nada é cobrado'
          : !feitas ? (venceu ? 'ATRASO' : 'aguardando entrega')
          : completo ? 'completo' : (venceu ? 'INCOMPLETO' : 'incompleto, ainda no prazo'),
        alvos: alvosDe(t),
      };
    });

    const previa = [
      ...atrasados.map((t: any) => ({ tipo: 'atraso', loja: t.unit_id, checklist: t.name, alvos: alvosDe(t) })),
      ...incompletos.map((t: any) => ({
        tipo: 'incompleto', loja: t.unit_id, checklist: t.name,
        corpo: `${t.name} (${t.sector}): ${t._feitas} de ${t._total} tarefas. ${t._pendentes} pendente${t._pendentes > 1 ? 's' : ''}.`,
        alvos: alvosDe(t),
      })),
    ];

    return new Response(JSON.stringify({
      ok: true, dry: true, versao: 'v12',
      comPrazo: comPrazo.length, ativos: ativos.length,
      atrasados: atrasados.length, incompletos: incompletos.length,
      inscricoes: (subsDry || []).length,
      jaAvisados: [...jaAvisados].length, jaAvisadosIncompletos: [...jaAvisadosInc].length,
      previa, diagnostico,
    }, null, 2), { headers: { 'Content-Type': 'application/json' } });
  }

  if (atrasados.length === 0 && incompletos.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0, message: 'Nenhum atrasado nem incompleto', comPrazo: comPrazo.length }),
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
  const avisadosIncAgora: string[] = [];
  // Uma linha por checklist avisado — o histórico que o painel lê. Só entra o
  // que teve entrega confirmada, o mesmo critério de `avisadosAgora`.
  const registros: any[] = [];
  const falhas: Record<string, number> = {};
  const mortas = new Set<string>();

  // Um loop para os dois alertas: alvo, poda de inscrição morta e log são os
  // mesmos. O que muda é o texto e a chave de deduplicação.
  const aAvisar = [
    ...atrasados.map((t: any) => ({ t, tipo: 'atraso' as const })),
    ...incompletos.map((t: any) => ({ t, tipo: 'incompleto' as const })),
  ];

  for (const { t, tipo } of aAvisar) {
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

    const loja = String(t.unit_id ?? '').toUpperCase();
    // Textos deliberadamente diferentes: "atrasado" é ausência de entrega,
    // "incompleto" é entrega com tarefa pendente. Misturar os dois queima a
    // confiança no aviso — quem entregou 7 de 8 não pode ler "atrasado".
    const titulo = tipo === 'atraso'
      ? `⚠ Checklist atrasado — ${loja}`
      : `📋 Entregue incompleto — ${loja}`;
    const corpo = tipo === 'atraso'
      ? `${t.name} (${t.sector}) — prazo: ${t.deadline}`
      : `${t.name} (${t.sector}): ${t._feitas} de ${t._total} tarefas. ${t._pendentes} pendente${t._pendentes > 1 ? 's' : ''}.`;
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
      (tipo === 'atraso' ? avisadosAgora : avisadosIncAgora).push(t.id);
      registros.push({
        company_id: empresa, unit_id: t.unit_id, kind: tipo === 'atraso' ? 'atraso' : 'incompleto',
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

  if (avisadosIncAgora.length > 0) {
    const { error: eUpInc } = await supabase.from('config').upsert(
      { key: incompKey, value: JSON.stringify([...jaAvisadosInc, ...avisadosIncAgora]), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
    if (eUpInc) return falha('config upsert incompleto', eUpInc);
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

  console.log(`Done. Sent: ${sent}, avisados: ${avisadosAgora.length}, incompletos avisados: ${avisadosIncAgora.length}, semAlvo: ${semAlvo}, falhas: ${JSON.stringify(falhas)}`);
  return new Response(JSON.stringify({
    ok: true, sent, atrasados: atrasados.length, incompletos: incompletos.length,
    avisados: avisadosAgora.length, avisadosIncompletos: avisadosIncAgora.length, semAlvo,
    falhas, inscricoesRemovidas: mortas.size,
    registrados: logFalhou ? 0 : registros.length,
    ...(logFalhou ? { logFalhou } : {}),
  }), { headers: { 'Content-Type': 'application/json' } });
});
