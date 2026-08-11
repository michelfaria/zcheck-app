/**
 * ZCheck — RANKING e ÍNDICE OPERACIONAL da pessoa.
 *
 * Movido de `app/app/page.js` na Fase 1b da consolidação de abas. Nenhuma linha
 * de lógica mudou: só endereço. Ver `docs/PLANO_CONSOLIDACAO_ABAS.md`.
 *
 * REGRA: não pode importar de `app/`.
 */

// Os ícones das faixas de desempenho viajam DENTRO do objeto devolvido (o
// `RatingLabel` só desenha o que recebe), então este módulo importa lucide
// mesmo sendo cálculo. Era assim quando morava em page.js.
import { Sprout, TrendingUp, Flame, CalendarCheck, Star, ShieldCheck, Camera, Trophy } from 'lucide-react';
import { todayStr, addDays, dateStrOf, tzOf, weekStartStr, APP_TZ } from './dates';
import { latestPerRound, earliestPerRound } from './rounds';
import { PERIODS, periodDates } from './stats';
import { completionOnTime, deadlineIndex, applicableItems, templateAtiva } from './checklists';

/* --- dependências que vieram junto na Fase 1b --- */

// Tarefa reprovada pela liderança não conta como feita — é a consequência que
// dá peso à conferência. "Ressalva" conta: o trabalho foi entregue, com
// observação. Uma função só porque a regra aparece no índice do colaborador, no
// briefing e no resumo do dia, e três cópias divergiriam.
export const taskCounts = i => !!i.done && i.review?.verdict !== 'reprovado';

/* ------------------------------ ID Operacional (H2) ------------------------------ */
// Identidade operacional do colaborador, derivada das completions.
// Foco em EVOLUÇÃO e qualidade/consistência (não quantidade pura — princípio de gamificação).
export function currentStreak(daySet, tz) {
  if (daySet.size === 0) return 0;
  let streak = 0;
  const today = todayStr(tz);
  let s = daySet.has(today) ? today : addDays(today, -1); // permite começar de ontem
  while (daySet.has(s)) { streak++; s = addDays(s, -1); }
  return streak;
}

export function longestStreak(days) {
  if (days.length === 0) return 0;
  const sorted = [...days].sort();
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.round((new Date(`${sorted[i]}T00:00:00`) - new Date(`${sorted[i - 1]}T00:00:00`)) / 86400000);
    if (diff === 1) { cur++; best = Math.max(best, cur); } else if (diff > 1) { cur = 1; }
  }
  return best;
}

/**
 * Pontuação de qualidade — as três constantes da régua (decisão de 08/08).
 *
 * O CORTE é o que impede a mudança de ser retroativa: julgamento feito antes
 * dele foi dado sob a régua antiga (quando ressalva não custava nada) e não
 * pode passar a custar depois do fato. Vereditos anteriores continuam valendo
 * para tudo o mais — só não entram NESTA conta.
 *
 * O PISO DE JULGADAS protege quem tem líder ausente: com menos de 5 tarefas
 * julgadas o componente é null e o índice se renormaliza sem ele (`usable`).
 *
 * O PESO nasce baixo (0,10) de propósito: sobe para os 0,25 do plano só quando
 * a taxa de apontamento sem motivo cair abaixo de 20% — hoje ela é 95%, e um
 * sinal desses ainda não merece um quarto da nota de ninguém.
 */
export const QUALITY_CUTOFF = '2026-08-09';

export const QUALITY_MIN_JULGADAS = 5;


// Papéis que aparecem no ranking da equipe: quem tem loja fixa e executa
// checklist nela. Gerência e diretoria ficam de fora (unitId null).
export const RANKED_ROLES = ['colaborador', 'lideranca'];

/**
 * O PERÍODO do índice do colaborador.
 *
 * O padrão é o MÊS CORRENTE, não uma janela deslizante de 30 dias — decisão de
 * 10/08, para fomentar constância. A diferença não é cosmética: numa janela
 * deslizante o passado some sozinho todo dia, e um mês ruim vai se diluindo sem
 * que ninguém precise fazer nada. No mês fechado existe um placar que começa
 * limpo no dia 1º e vale até o fim — dá para recuperar um começo ruim, e o
 * esforço do dia 28 ainda conta.
 *
 * `days` é o DENOMINADOR DA CONSTÂNCIA, e por isso é dias DECORRIDOS, não o
 * tamanho do período: no dia 3 do mês ninguém pode aparecer com 10% de
 * constância porque o mês tem 30 dias. Constância é "dos dias que já passaram,
 * em quantos você trabalhou".
 *
 * @returns {{ id, label, dates: Set<string>, days: number }}
 */
export const RANKING_PERIOD_DEFAULT = 'month';

/**
 * Envelope do período para o ranking — MESMO seletor da aba Dados.
 *
 * `PERIODS` e `periodDates` são reusados de propósito, não reimplementados:
 * duas telas do mesmo app oferecendo "Personalizado" com regras diferentes de
 * borda (o dia final entra? intervalo invertido faz o quê?) é o tipo de
 * divergência que ninguém percebe até dar número diferente para a mesma
 * pergunta. Quem já sabe escolher período em Dados sabe escolher aqui.
 *
 * O que este envelope acrescenta é o que o ranking precisa e o relatório não:
 *
 *   `days` — DENOMINADOR DA CONSTÂNCIA. São os dias do período que JÁ
 *   PASSARAM, não o tamanho dele: no dia 3 do mês ninguém pode aparecer com
 *   10% de constância porque o mês tem 30 dias. Em "Tudo" é o intervalo real
 *   desde a primeira execução — dividir por 90 fixo faria toda empresa nova
 *   parecer inconstante no primeiro mês de uso.
 *
 *   `label` — a frase que as telas exibem, para "de quando é este ranking?"
 *   ter uma resposta só.
 *
 * `periodDates` devolve `null` para "Tudo" e para um Personalizado incompleto.
 * Os dois caem no histórico inteiro, igual à aba Dados: um ranking que esvazia
 * enquanto a pessoa digita a segunda data pareceria defeito.
 *
 * @param {object} opt  { from, to, mes }  — os controles do seletor
 */
export function rankingPeriod(periodId, tz, completions, opt = {}) {
  const hoje = todayStr(tz);
  const lista = periodDates(periodId, opt.from, opt.to, opt.mes, tz);

  if (!lista) {
    // Intervalo CONTÍNUO da primeira execução até hoje — não só os dias que
    // tiveram execução. A aderência da liderança conta o PREVISTO iterando
    // estas datas: um dia em que a loja não entregou nada precisa aparecer no
    // denominador, senão sumir do trabalho melhoraria a nota de quem responde.
    const datas = [...new Set((completions || []).map(c => c.date).filter(Boolean))].sort();
    const inicio = datas[0] || hoje;
    const todos = [];
    for (let d = inicio; d <= hoje; d = addDays(d, 1)) todos.push(d);
    return { id: periodId, label: 'todo o período', dates: new Set(todos), days: Math.max(1, todos.length) };
  }

  // Só os dias decorridos contam no denominador. Um período que termina no
  // futuro não pode diluir a constância de ninguém.
  const decorridos = lista.filter(d => d <= hoje).length;

  let label;
  if (periodId === 'custom') {
    const fmt = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    label = `${fmt(opt.from)} a ${fmt(opt.to)}`;
  } else if (periodId === 'month') {
    const ym = opt.mes || hoje.slice(0, 7);
    const nome = new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    label = ym === hoje.slice(0, 7) ? `${nome} (em curso)` : nome;
  } else {
    const p = PERIODS.find(x => x.id === periodId);
    label = periodId === 'today' ? 'hoje' : `últimos ${(p?.label || '').toLowerCase()}`;
  }

  return { id: periodId, label, dates: new Set(lista), days: Math.max(1, decorridos) };
}

/**
 * Os pesos do índice do colaborador — FONTE ÚNICA.
 *
 * Ficavam só dentro de `computeOperationalProfile`, e a frase que explica o
 * ranking na aba Equipe repetia os números à mão. Deu no que tinha que dar: o
 * texto continuou dizendo "conclusão 50%, críticos 30%, constância 20%" muito
 * depois de os pesos terem mudado duas vezes. Agora a frase é GERADA daqui —
 * mexer num peso corrige a explicação junto, sem ninguém lembrar de nada.
 *
 * Ordem = ordem de exibição, do que mais pesa para o que menos pesa.
 *
 * Pesos definidos pelo Michel em 10/08/2026. O que cada escolha significa na
 * prática, para quem for mexer:
 *
 *   Entregar no prazo separa de verdade — entre 100% e 60% de pontualidade são
 *   8 pontos de índice, o bastante para reordenar o ranking entre pessoas de
 *   desempenho parecido no resto.
 *
 *   CONSTÂNCIA é a que pesa menos de propósito: ela é `dias ativos ÷ 30`, e
 *   isso mede ESCALA antes de mérito — quem trabalha três dias por semana tem
 *   teto de ~43% por decisão da gerência, não por desempenho próprio.
 *
 *   QUALIDADE começa baixa e sobe quando os apontamentos deixarem de chegar
 *   mudos (ver §2 de docs/REVISAO_CONFERENCIA_v1.md): pesar muito um sinal que
 *   hoje tem 3% de variância seria pendurar a colocação em ruído.
 */
export const COLLAB_INDEX_PARTS = [
  { key: 'conclusao',  label: 'Conclusão de tarefas', weight: 0.40 },
  { key: 'prazo',      label: 'Entregas no prazo',    weight: 0.20 },
  { key: 'criticos',   label: 'Críticos em dia',      weight: 0.20 },
  { key: 'constancia', label: 'Constância',           weight: 0.10 },
  { key: 'qualidade',  label: 'Qualidade avaliada',   weight: 0.10 },
];

// "conclusão de tarefas (35%), entregas no prazo (25%) e ..." — a lista em
// português, com "e" antes do último, a partir dos pesos de verdade.
export const collabIndexSentence = () => {
  const itens = COLLAB_INDEX_PARTS.map(p => `${p.label.toLowerCase()} (${Math.round(p.weight * 100)}%)`);
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
};

// `tz` é o da loja da pessoa: a sequência de dias seguidos tem que virar à
// meia-noite dela, senão quem trabalha à noite em Manaus perde ou ganha um dia.
//
// `templates` e `units` entraram para a PONTUALIDADE: o prazo mora no template
// e é resolvido no relógio da loja (ver `completionOnTime`). Sem eles o
// componente vem null e o índice se renormaliza — nenhuma chamada antiga
// quebra, só deixa de medir prazo.
export function computeOperationalProfile(completions, userId, userName, tz, templates, units, periodo) {
  // Uma rodada por checklist/dia, ANTES de qualquer contagem. É o que sustenta o
  // ranking da Equipe e o Meu ID: sem isso, reexecutar um checklist inflava
  // nível, conquistas, evidências e a contagem de tarefas da pessoa — e a mesma
  // tarefa era creditada duas vezes, porque a segunda submissão carrega os itens
  // da primeira (com o `doneBy` original).
  const rounds = latestPerRound(completions);
  const mineAll = rounds
    .filter(c => c.operatorUserId === userId || c.operatorName === userName)
    .sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || ''));

  /**
   * A JANELA DO ÍNDICE — e por que ela existe.
   *
   * Antes cada componente media um período diferente: conclusão, prazo e
   * críticos varriam tudo que estivesse carregado (90 dias), enquanto
   * constância dividia por 30. Quem tivesse mais de 30 dias ativos saturava em
   * 100% de constância para sempre, e o índice somava pedaços de janelas
   * distintas — um número composto assim não significa coisa nenhuma, e não
   * havia como responder "esse ranking é de quando?".
   *
   * Agora TODO componente do índice olha o MESMO período — por padrão o mês
   * corrente (ver `rankingPeriod`), e na aba Equipe o que a liderança escolher.
   *
   * O que fica FORA do período, de propósito: nível, conquistas, evidências,
   * total de tarefas, sequência de dias e a evolução semanal. Esses são
   * história da pessoa, não desempenho recente — zerar a conquista de alguém
   * porque ela tirou férias seria punir o calendário. Por isso `mineAll`
   * (tudo) e `mine` (período) andam separados daqui para baixo.
   */
  const per = periodo || rankingPeriod(RANKING_PERIOD_DEFAULT, tz, completions);
  const janela = per.dates;
  const mine = mineAll.filter(c => janela.has(c.date));
  const roundsJanela = rounds.filter(c => janela.has(c.date));

  // `taskCounts` no lugar de `i.done`: tarefa reprovada pela liderança volta a
  // valer como não executada, aqui e em todo lugar que mede execução.
  let totalItems = 0, doneItems = 0, critTotal = 0, critDone = 0;
  mine.forEach(c => (c.items || []).forEach(i => {
    totalItems++; if (taskCounts(i)) doneItems++;
    if (i.critical) { critTotal++; if (taskCounts(i)) critDone++; }
  }));

  // Evidências e total de checklists são CONTADORES de história — vêm de tudo.
  let evidences = 0;
  mineAll.forEach(c => (c.items || []).forEach(i => { if (i.hasPhoto) evidences++; }));

  const checklists = mineAll.length;
  const checklistsJanela = mine.length;
  const avgRate = totalItems ? Math.round((doneItems / totalItems) * 100) : 0;
  const criticalRate = critTotal ? Math.round((critDone / critTotal) * 100) : null;

  // Tarefas executadas pela pessoa — inclui participação em checklists que um
  // colega submeteu (execução colaborativa, item.doneBy). Registros antigos sem
  // doneBy creditam ao responsável pelo checklist.
  let tasksDone = 0, criticalDone = 0;
  const participationDays = new Set();     // história (sequência de dias)
  const participationJanela = new Set();   // janela (constância)
  // ── Qualidade avaliada (pontuação, decisão de 08/08) ──
  // Sobre as tarefas que a pessoa EXECUTOU e a liderança JULGOU, a partir do
  // corte. Penalidade contável, não média: com 96,9% de aprovação medidos, uma
  // média entregaria 97-100 para todo mundo e não separaria ninguém.
  let julgadas = 0, ressalvasQ = 0, reprovadasQ = 0;
  rounds.forEach(c => {
    const isSubmitter = c.operatorUserId === userId || c.operatorName === userName;
    (c.items || []).forEach(i => {
      // O destinatário do julgamento: o executed_by resolvido no servidor
      // manda; doneBy é o fallback de registro antigo; submissor, o último.
      const executedByMe = i.review?.executedBy
        ? i.review.executedBy === userId
        : i.doneBy ? (i.doneBy === userId || i.doneByName === userName) : isSubmitter;
      // Qualidade é COMPONENTE DO ÍNDICE: só conta dentro da janela, e só
      // depois do corte que impede a régua nova de valer para trás.
      if (executedByMe && i.review?.verdict && janela.has(c.date)
          && (i.review.reviewedAt || '').slice(0, 10) >= QUALITY_CUTOFF) {
        julgadas++;
        // Apontamento SEM MOTIVO não pontua: se a liderança não explicou, não
        // tira ponto de ninguém. É o que alinha o incentivo do líder com a
        // métrica da conferência (95% dos apontamentos eram mudos em 08/08).
        if (i.review.verdict === 'ressalva' && i.review.comMotivo) ressalvasQ++;
        if (i.review.verdict === 'reprovado' && i.review.comMotivo) reprovadasQ++;
      }
      if (!taskCounts(i)) return;
      if (!executedByMe) return;
      tasksDone++;
      if (i.critical) criticalDone++;
      if (c.date) {
        participationDays.add(c.date);
        if (janela.has(c.date)) participationJanela.add(c.date);
      }
    });
  });
  const qualidade = julgadas >= QUALITY_MIN_JULGADAS
    ? Math.max(0, 100 - (ressalvasQ * 2 + reprovadasQ * 8))
    : null;

  /**
   * PONTUALIDADE — dos checklists que a pessoa entregou e tinham prazo,
   * quantos saíram dentro dele.
   *
   * Três decisões que mudam o número, todas herdadas de regras que o app já
   * aplicava em outros lugares:
   *
   * 1. Pela PRIMEIRA entrega da rodada (`earliestPerRound`), não pela última.
   *    Reabrir uma tarefa e reenviar às 18h não transforma em atraso uma
   *    entrega feita às 9h dentro do prazo. É a mesma régua do índice da
   *    liderança e do J.I.T. — três lugares medindo pontualidade de jeitos
   *    diferentes seria pior que não medir.
   *
   * 2. Checklist SEM prazo fica fora do numerador E do denominador
   *    (`completionOnTime` devolve null). Sem horário a cumprir não há como
   *    ser pontual nem atrasado, e contá-lo como pontual inflaria a nota de
   *    quem só executa checklist sem prazo.
   *
   * 3. A pontualidade é de quem ENTREGOU, não de quem executou as tarefas.
   *    Entregar é o ato de apertar "Concluir": numa rodada colaborativa, quem
   *    submeteu fora do prazo responde por isso — não o colega que fez duas
   *    tarefas dentro dela. É por isso que este bloco filtra por submissor,
   *    diferente da qualidade logo acima, que segue o `executed_by`.
   *
   * Sem corte de data, ao contrário da qualidade: o prazo é uma regra
   * PUBLICADA no próprio checklist e sempre foi visível como "fora do prazo"
   * nos Relatórios e no J.I.T. Passar a contá-la não muda a régua, começa a
   * dar consequência a uma régua que já existia — e o dado histórico é
   * completo, sem o viés que obrigou o corte da qualidade. O que a limita é a
   * janela do índice, como todo componente.
   */
  const deadlines = deadlineIndex(templates || []);
  let prazoTotal = 0, prazoOk = 0;
  earliestPerRound(completions)
    .filter(c => janela.has(c.date)
      && (c.operatorUserId === userId || c.operatorName === userName))
    .forEach(c => {
      const ok = completionOnTime(c, templates || [], deadlines, units);
      if (ok === null) return;
      prazoTotal++;
      if (ok) prazoOk++;
    });
  const punctuality = prazoTotal ? Math.round((prazoOk / prazoTotal) * 100) : null;

  // Sequência de dias é HISTÓRIA: sai de tudo, não da janela.
  const days = [...new Set([...mineAll.map(c => c.date), ...participationDays])];
  const streak = currentStreak(new Set(days), tz);
  const bestStreak = longestStreak(days);
  // Constância é ÍNDICE: dias ativos DENTRO da janela ÷ tamanho da janela.
  // Antes o numerador vinha de todo o histórico e o denominador era 30 fixo —
  // qualquer pessoa com mais de 30 dias ativos batia 100% e ficava lá.
  const activeDaysJanela = [...new Set([...mine.map(c => c.date), ...participationJanela])];

  // Evolução: taxa de conclusão por semana (últimas 6 semanas com atividade).
  // História, não janela: o gráfico existe para mostrar tendência.
  const wkMap = new Map();
  mineAll.forEach(c => {
    const wk = weekStartStr(c.date);
    if (!wkMap.has(wk)) wkMap.set(wk, { week: wk, total: 0, done: 0, checklists: 0 });
    const s = wkMap.get(wk); s.checklists++;
    (c.items || []).forEach(i => { s.total++; if (taskCounts(i)) s.done++; });
  });
  const weekly = [...wkMap.values()]
    .map(s => ({ ...s, rate: s.total ? Math.round((s.done / s.total) * 100) : 0 }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-6);

  const perLevel = 15;
  const level = Math.floor(checklists / perLevel) + 1;
  const intoLevel = checklists % perLevel;

  const achievements = [
    { id: 'first', Icon: Sprout, title: 'Primeiro passo', desc: 'Concluiu o primeiro checklist', earned: checklists >= 1 },
    { id: 'ten', Icon: TrendingUp, title: 'Pegando o ritmo', desc: '10 checklists concluídos', earned: checklists >= 10 },
    { id: 'fifty', Icon: Flame, title: 'Veterano', desc: '50 checklists concluídos', earned: checklists >= 50 },
    { id: 'streak5', Icon: CalendarCheck, title: 'Constância', desc: '5 dias seguidos em operação', earned: bestStreak >= 5 },
    { id: 'quality', Icon: Star, title: 'Caprichoso', desc: 'Média de conclusão ≥ 90%', earned: avgRate >= 90 && checklists >= 5 },
    { id: 'critical', Icon: ShieldCheck, title: 'Guardião do crítico', desc: 'Itens críticos ≥ 95% em dia', earned: criticalRate != null && criticalRate >= 95 && checklists >= 5 },
    { id: 'evidence', Icon: Camera, title: 'Provas em dia', desc: '20+ evidências enviadas', earned: evidences >= 20 },
    { id: 'perfectweek', Icon: Trophy, title: 'Semana perfeita', desc: 'Uma semana inteira a 100%', earned: weekly.some(w => w.rate === 100 && w.checklists >= 3) },
  ];

  /**
   * Índice operacional da PESSOA — a mesma régua do ID da unidade, adaptada.
   *
   * A unidade tem "esperado" (quantos checklists eram previstos no dia) e por
   * isso a métrica-mãe dela é aderência. A pessoa não tem: ninguém sabe quantos
   * checklists eram "dela". O que dá para medir com honestidade é a QUALIDADE do
   * que ela executou e a CONSTÂNCIA com que apareceu.
   *
   * Pesos explícitos, como no ID da unidade — um lugar só para mudar.
   *
   * TUDO aqui é do período escolhido. Ver `per` / `rankingPeriod`.
   */
  // Denominador = dias DECORRIDOS do período, não o tamanho dele: no dia 3 do
  // mês ninguém pode aparecer com 10% porque o mês tem 30 dias.
  const consistency = Math.min(100, Math.round((activeDaysJanela.length / Math.max(1, per.days)) * 100));
  /**
   * Os pesos vêm de `COLLAB_INDEX_PARTS` — aqui só se liga cada um ao valor.
   * Para mudar quanto cada coisa vale, é lá; nada aqui precisa saber disso.
   */
  const valorDe = {
    conclusao: totalItems ? avgRate : null,
    prazo: punctuality,
    criticos: criticalRate,
    // Sem nada na janela, constância é `null` e o índice se renormaliza —
    // melhor que exibir 0% para quem simplesmente não trabalhou no período.
    constancia: checklistsJanela || activeDaysJanela.length ? consistency : null,
    qualidade: qualidade,
  };
  const parts = COLLAB_INDEX_PARTS.map(p => ({ ...p, value: valorDe[p.key] }));
  const usable = parts.filter(x => x.value != null);
  const wsum = usable.reduce((a, x) => a + x.weight, 0);
  const index = usable.length ? Math.round(usable.reduce((a, x) => a + x.value * x.weight, 0) / wsum) : null;

  return {
    checklists, avgRate, criticalRate, evidences,
    tasksDone, criticalDone,
    streak, bestStreak, activeDays: days.length,
    level, intoLevel, perLevel, weekly, achievements,
    // `checklists` é história; `checklistsJanela` é o que sustenta o índice. A
    // tela mostra os dois em lugares diferentes e não pode confundi-los.
    checklistsJanela, windowDays: per.days, periodLabel: per.label, periodId: per.id,
    index, parts, consistency, consistencyWindow: per.days,
    // A régua da qualidade, aberta: quem é medido precisa conseguir refazer a
    // conta. `julgadas` também explica o null (menos de 5 → sem componente).
    qualidade, julgadas, ressalvasQ, reprovadasQ,
    // Pontualidade com os dois brutos: "87%" sozinho não deixa ninguém conferir
    // se são 13 de 15 ou 87 de 100 — e a diferença muda o quanto um atraso pesa.
    punctuality, prazoOk, prazoTotal,
    recent: mine.slice(-8).reverse(),
  };
}
