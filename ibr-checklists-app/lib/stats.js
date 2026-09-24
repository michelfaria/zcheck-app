/**
 * ZCheck — AGREGAÇÃO de execuções.
 *
 * Recorte de período, filtro e as estatísticas que Painel, J.I.T. e Relatórios
 * consomem. Função pura sobre listas de execução: nada de React, nada de
 * estado, nada de consulta.
 *
 * Extraído de `app/app/page.js` (Fase 1a da consolidação de abas — ver
 * `docs/PLANO_CONSOLIDACAO_ABAS.md`). As três views fechavam sobre estes
 * símbolos no escopo de módulo de `page.js`; enquanto isso valesse, nenhuma
 * delas podia sair de lá sem criar o ciclo
 * `components/painel/* → app/app/page.js → components/painel/*`.
 *
 * REGRA: este módulo não pode importar de `app/`. Só de outros `lib/`.
 */

import { todayStr, addDays, lastDays } from './dates';
import { latestPerRound } from './rounds';
import { verdictInForce, tarefaFeita } from './conferencia';
import {
  CHECKLIST_TYPE_ORDER, matchesShift, templatePrevistoEm,
  completionOnTime, deadlineIndex,
} from './checklists';

export const PERIODS = [
  { id: 'today', label: 'Hoje', days: 1 },
  { id: '7d', label: '7 dias', days: 7 },
  { id: '30d', label: '30 dias', days: 30 },
  { id: 'month', label: 'Mês', days: null },
  { id: 'all', label: 'Tudo', days: null },
  { id: 'custom', label: 'Personalizado', days: null },
];

// Returns the list of YYYY-MM-DD strings covered by a period (null for "all" / incomplete "custom").
export function periodDates(periodId, from, to, selectedMonth, tz) {
  if (periodId === 'custom') {
    if (!from || !to || from > to) return null;
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }
  if (periodId === 'month') {
    const today = todayStr(tz);
    const [y, m] = (selectedMonth || today.slice(0, 7)).split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const out = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const d = `${y}-${String(m).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
      if (d <= today) out.push(d);
    }
    return out.length > 0 ? out : null;
  }
  const period = PERIODS.find(p => p.id === periodId);
  if (!period || period.days == null) return null;
  return lastDays(period.days, null, tz);
}

export function filterCompletions(completions, f) {
  return completions.filter(c => {
    if (f.dates && !f.dates.includes(c.date)) return false;
    if (f.unitId && c.unitId !== f.unitId) return false;
    if (f.sectorList && !f.sectorList.includes(c.sector)) return false;
    else if (f.sector && c.sector !== f.sector) return false;
    if (f.shift && !(c.shift || '').includes(f.shift)) return false;
    if (f.userId && c.operatorUserId !== f.userId && c.operatorName !== f.userId) return false;
    return true;
  });
}

// Checklists PREVISTOS no dia — o denominador da aderência. Um checklist é
// previsto se existia e tem ao menos uma tarefa que o calendário prevê
// (`templatePrevistoEm`), e é a MESMA régua do numerador (`completeRoundChecker`
// e `rodadaPrevistaChecker`). Até 24/09/2026 esta conta chamava
// `isItemApplicable` sem o tipo do checklist, ignorando o `appearsIn` que o
// Executar respeita: checklist cujas tarefas só apareciam em outro tipo contava
// como previsto e não tinha nada para executar.
export function countApplicableTemplatesOnDate(templates, f, dateStr) {
  return templates.filter(t => {
    if (f.unitId && t.unitId !== f.unitId) return false;
    if (f.sector && t.sector !== f.sector) return false;
    if (f.shift && !matchesShift(t, f.shift)) return false;
    return templatePrevistoEm(t, dateStr);
  }).length;
}

// `tarefaFeita` e não `i.done` em todo o resumo: tarefa reprovada pela
// liderança (a partir do corte, ver lib/conferencia.js) não conta como feita —
// e crítica reprovada volta a ser crítica pendente.
export function summarizeCompletions(filtered) {
  let totalItems = 0, doneItems = 0, criticalPending = 0, photos = 0;
  filtered.forEach(c => {
    totalItems += c.items.length;
    c.items.forEach(i => {
      if (tarefaFeita(i)) doneItems += 1;
      if (i.critical && !tarefaFeita(i)) criticalPending += 1;
      if (i.hasPhoto) photos += 1;
    });
  });
  return {
    checklists: filtered.length,
    totalItems, doneItems,
    rate: totalItems ? (doneItems / totalItems) * 100 : 0,
    criticalPending, photos,
  };
}

// "Nível de realização das tarefas" por colaborador.
// A contagem é por TAREFA executada (item.doneBy — execução colaborativa), não
// só por checklist submetido: quem divide um checklist com um colega recebe
// crédito pelas tarefas que fez. Registros antigos (sem doneBy) creditam as
// tarefas a quem submeteu o checklist.
export function collaboratorStats(entrada) {
  const filtered = latestPerRound(entrada);
  const map = new Map();
  const ensure = (key, name, at) => {
    if (!map.has(key)) map.set(key, { key, name: name || 'Sem responsável', checklists: 0, totalItems: 0, doneItems: 0, tasksDone: 0, criticalDone: 0, criticalPending: 0, photos: 0, last: at });
    return map.get(key);
  };
  filtered.forEach(c => {
    const subKey = c.operatorUserId || c.operatorName || '—';
    const s = ensure(subKey, c.operatorName, c.completedAt);
    s.checklists += 1;
    s.totalItems += c.items.length;
    if (c.completedAt > s.last) s.last = c.completedAt;
    c.items.forEach(i => {
      if (i.critical && !tarefaFeita(i)) s.criticalPending += 1;
      if (i.hasPhoto) s.photos += 1;
      if (!tarefaFeita(i)) return;
      s.doneItems += 1; // realização do checklist que a pessoa submeteu
      const ex = i.doneBy && i.doneBy !== subKey
        ? ensure(i.doneBy, i.doneByName, i.doneAt || c.completedAt)
        : s;
      ex.tasksDone += 1;
      if (i.critical) ex.criticalDone += 1;
      const at = i.doneAt || c.completedAt;
      if (at > ex.last) ex.last = at;
    });
  });
  return [...map.values()]
    .map(s => ({ ...s, rate: s.totalItems ? (s.doneItems / s.totalItems) * 100 : null }))
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.tasksDone - a.tasksDone);
}

// Agrupa por loja, setor ou turno.
// `units` vem do chamador (as unidades da empresa logada) e os cinco call sites
// sempre passam. O default `[]` existe só para não estourar em chamada nova
// esquecida: sem unidades, o nome da loja cai no id cru, que é degradação
// visível — antes o default era a constante UNITS (IBR), e uma chamada sem o
// parâmetro fazia QUALQUER empresa resolver nomes pela tabela do IBR, que é
// degradação invisível e errada.
// `types` idem: os tipos de checklist da empresa (ACTIVE_TYPES); o default
// preserva o IBR, mas tipos personalizados só agrupam certo com o parâmetro.
export function groupStats(filtered, groupBy, units = [], types = CHECKLIST_TYPE_ORDER) {
  const map = new Map();
  filtered.forEach(c => {
    let key;
    if (groupBy === 'loja') key = units.find(u => u.id === c.unitId)?.name || c.unitId;
    else if (groupBy === 'setor') key = c.sector;
    else if (groupBy === 'tipo') {
      const ct = types.find(ct => ct.match({ name: c.templateName }));
      key = ct ? ct.label : c.templateName;
    }
    else key = c.shift || '—';
    if (!map.has(key)) map.set(key, { key, checklists: 0, totalItems: 0, doneItems: 0, criticalPending: 0 });
    const s = map.get(key);
    s.checklists += 1;
    s.totalItems += c.items.length;
    c.items.forEach(i => {
      if (tarefaFeita(i)) s.doneItems += 1;
      if (i.critical && !tarefaFeita(i)) s.criticalPending += 1;
    });
  });
  return [...map.values()]
    .map(s => ({ ...s, rate: s.totalItems ? (s.doneItems / s.totalItems) * 100 : 0 }))
    .sort((a, b) => b.checklists - a.checklists);
}

/**
 * Pontualidade — quantos checklists foram entregues DENTRO do prazo do próprio
 * checklist e quantos passaram do horário, com o mesmo recorte por loja e por
 * setor que o resto do J.I.T.
 *
 * A regra de "no prazo" é uma só em todo o app: `completionOnTime`. Ela devolve
 * `null` para checklist SEM prazo (o "Intermediário", por exemplo) — sem
 * horário a cumprir, ele não pode ser nem pontual nem atrasado. Esses ficam
 * fora do numerador E do denominador, e voltam separados em `noDeadline`: o
 * gestor precisa saber que a conta não cobre a operação inteira, senão lê "15
 * checklists" onde rodaram 40.
 *
 * A ordenação é do PIOR para o melhor (menor % no prazo primeiro). O J.I.T. é
 * uma tela de decisão: o que precisa de atenção vem antes do que já vai bem.
 */
export const PUNCTUALITY_PERIODS = [{ id: 'today', label: 'Hoje' }, { id: 'last7', label: '7 dias' }];
export const PUNCTUALITY_GROUPS = [{ id: 'loja', label: 'Loja' }, { id: 'setor', label: 'Setor' }];

export function punctualityStats(filtered, templates, units) {
  let onTime = 0, late = 0, noDeadline = 0;
  const deadlines = deadlineIndex(templates);
  const byUnit = new Map(), bySector = new Map();
  const bump = (map, key, name, ok) => {
    if (!map.has(key)) map.set(key, { key, name, onTime: 0, late: 0 });
    const g = map.get(key);
    if (ok) g.onTime += 1; else g.late += 1;
  };
  (filtered || []).forEach(c => {
    const ok = completionOnTime(c, templates, deadlines, units);
    if (ok === null) { noDeadline += 1; return; }
    if (ok) onTime += 1; else late += 1;
    const uName = (units || []).find(u => u.id === c.unitId)?.name || c.unitId || 'Sem loja';
    bump(byUnit, c.unitId || '—', uName, ok);
    bump(bySector, c.sector || '—', c.sector || 'Sem setor', ok);
  });
  const finish = map => [...map.values()]
    .map(g => ({ ...g, total: g.onTime + g.late, rate: Math.round((g.onTime / (g.onTime + g.late)) * 100) }))
    .sort((a, b) => a.rate - b.rate || b.total - a.total);
  const total = onTime + late;
  return {
    onTime, late, total, noDeadline,
    rate: total ? Math.round((onTime / total) * 100) : null,
    byUnit: finish(byUnit),
    bySector: finish(bySector),
  };
}

/* ------------------------------ produtividade ------------------------------ */
//
// Fórmula (transparente para a gestão):
//   Pontos      tarefa comum concluída = 1 · tarefa CRÍTICA = 2 ·
//               checklist 100% completo = +3 pts distribuídos entre os
//               executores na proporção das tarefas que cada um fez.
//   Tempo ativo por checklist e por executor: intervalo entre a primeira e a
//               última tarefa que a pessoa marcou (mínimo 1 min). Registros
//               antigos sem horário por tarefa não entram no ritmo.
//   Ritmo       pontos por hora ativa (pts/h).
//   Score       ritmo ÷ ritmo médio da EMPRESA no período × 100.
//               100 = na média da empresa · >100 acima · <100 abaixo.
//   Conferência o veredito da liderança muda o valor da tarefa (ver
//               `REVIEW_POINT_FACTOR` logo abaixo).
// O mesmo cálculo agrega colaborador, setor, loja e empresa — comparáveis entre si.

// Reexportados para quem já os pedia daqui (testes, telas). A fonte é
// lib/conferencia.js.
export { verdictInForce, CONFERENCIA_CUTOFF } from './conferencia';

/**
 * A CONFERÊNCIA dentro da produtividade — decisão do Michel em 24/09/2026.
 *
 * Até aqui o score contava `i.done` e mais nada: tarefa REPROVADA pela
 * liderança valia ponto cheio e ainda garantia o bônus do checklist 100%. Era
 * o único lugar do app que media execução ignorando o veredito — o índice do
 * colaborador já tratava reprovada como não feita (`taskCounts`, ranking.js).
 *
 * A régua é um MULTIPLICADOR do valor da tarefa, porque é a frase que cabe
 * para quem é medido: "ressalva vale metade; reprovada custa o que valeria".
 *
 *   aprovado / não julgada  × 1    — 1 pt comum, 2 pts crítica
 *   ressalva                × 0,5  — 0,5 / 1: o trabalho foi entregue, com
 *                                    observação, e vale menos que o limpo
 *   reprovado               × −1   — −1 / −2: não só deixa de pontuar, DESCONTA.
 *                                    E o checklist deixa de ser "100%": o
 *                                    bônus de +3 some para todos que o fizeram
 *
 * DUAS DIFERENÇAS DELIBERADAS em relação à Qualidade do índice
 * (`computeOperationalProfile`), e as duas foram escolha, não descuido:
 *
 *   1. Apontamento SEM MOTIVO escrito também pesa aqui. Na Qualidade o mudo
 *      não desconta (regra de 08/08, para empurrar a liderança a explicar); na
 *      produtividade o Michel decidiu que o veredito vale por si.
 *
 *   2. O corte é outro. Só pesa veredito dado a partir de
 *      `CONFERENCIA_CUTOFF` (lib/conferencia.js): julgamento feito quando
 *      ressalva ainda não custava produtividade não passa a custar depois do
 *      fato — mesmo princípio do corte da Qualidade, data diferente porque a
 *      régua é nova. O corte e `verdictInForce` moram em conferencia.js porque
 *      a regra do checklist 100% (`tarefaFeita`, lib/rounds.js) usa os mesmos.
 */
export const REVIEW_POINT_FACTOR = { aprovado: 1, ressalva: 0.5, reprovado: -1 };

// A regra por extenso, para as telas que explicam o score. Mora aqui, colada
// aos números, pelo mesmo motivo de `collabIndexSentence`: texto repetido à mão
// em duas telas continua dizendo a régua antiga depois que ela muda.
export const PRODUCTIVITY_REVIEW_RULE =
  'Conferência da liderança (a partir de 24/09/2026): tarefa com ressalva vale metade; '
  + 'tarefa reprovada vale o mesmo em negativo (−1 comum, −2 crítica) e tira o bônus do checklist 100%. '
  + 'Vale com ou sem motivo escrito.';

// "Conferência: 12 aprovadas · 2 ressalvas · 1 reprovada · −4 pts" — a linha
// que mostra, ao lado do score, de onde veio o desconto. Null quando nada do
// período foi julgado sob a régua: uma linha "0 de 0" só ocuparia espaço.
export function reviewSummary(entry) {
  if (!entry?.julgadas) return null;
  const partes = [];
  if (entry.aprovadas) partes.push(`${entry.aprovadas} aprovada${entry.aprovadas !== 1 ? 's' : ''}`);
  if (entry.ressalvas) partes.push(`${entry.ressalvas} ressalva${entry.ressalvas !== 1 ? 's' : ''}`);
  if (entry.reprovadas) partes.push(`${entry.reprovadas} reprovada${entry.reprovadas !== 1 ? 's' : ''}`);
  const perda = Math.round(entry.reviewLoss * 10) / 10;
  if (perda > 0) partes.push(`−${String(perda).replace('.', ',')} pts`);
  return `Conferência: ${partes.join(' · ')}`;
}

export function computeProductivity(completions) {
  const mkAgg = (key, name) => ({
    key, name, points: 0, timedPoints: 0, minutes: 0, tasks: 0, criticals: 0, fullChecklists: 0, unitIds: new Set(),
    // O que a conferência fez com o placar: quantas tarefas foram julgadas sob
    // a régua, com que veredito, e quantos pontos isso custou (tarefa + bônus
    // perdido). É o que deixa quem é medido refazer a conta.
    julgadas: 0, aprovadas: 0, ressalvas: 0, reprovadas: 0, reviewLoss: 0,
  });
  const collabs = new Map(), units = new Map(), sectors = new Map();
  const company = mkAgg('empresa', 'Empresa');
  const ensure = (map, key, name) => { if (!map.has(key)) map.set(key, mkAgg(key, name)); return map.get(key); };

  // Uma rodada por checklist/dia/loja: reexecução não multiplica pontos.
  latestPerRound(completions).forEach(c => {
    const items = c.items || [];
    const doneItems = items.filter(i => i.done);
    if (doneItems.length === 0) return;
    const allDone = doneItems.length === items.length;
    // Uma tarefa reprovada tira o checklist do "100%": ele foi marcado inteiro,
    // mas a liderança disse que não foi feito inteiro.
    const isFull = allDone && !doneItems.some(i => verdictInForce(i) === 'reprovado');
    const bonusPerdido = allDone && !isFull;
    const subKey = c.operatorUserId || c.operatorName || '—';

    // Agrupa as tarefas concluídas por quem executou (colaborativo ou não)
    const byExec = new Map();
    doneItems.forEach(i => {
      const key = i.doneBy || subKey;
      if (!byExec.has(key)) byExec.set(key, { key, name: i.doneByName || c.operatorName || 'Sem responsável', pts: 0, marcadas: 0, tasks: 0, criticals: 0, times: [], julgadas: 0, aprovadas: 0, ressalvas: 0, reprovadas: 0, loss: 0 });
      const e = byExec.get(key);
      const base = i.critical ? 2 : 1;
      const v = verdictInForce(i);
      const valor = base * (REVIEW_POINT_FACTOR[v] ?? 1);
      e.pts += valor;
      e.loss += base - valor;
      // `marcadas` é a fatia da pessoa no checklist (divide o bônus); `tasks`
      // é o que conta como FEITO — reprovada não entra, como em `taskCounts`.
      e.marcadas += 1;
      if (v !== 'reprovado') {
        e.tasks += 1;
        if (i.critical) e.criticals += 1;
      }
      if (v) {
        e.julgadas += 1;
        if (v === 'aprovado') e.aprovadas += 1;
        else if (v === 'ressalva') e.ressalvas += 1;
        else if (v === 'reprovado') e.reprovadas += 1;
      }
      // O tempo fica mesmo na reprovada: ele foi gasto, e é justamente o que
      // faz o ritmo cair — pontos a menos no mesmo intervalo.
      if (i.doneAt) e.times.push(new Date(i.doneAt).getTime());
    });

    byExec.forEach(e => {
      const share = e.marcadas / doneItems.length;
      const pts = e.pts + (isFull ? 3 * share : 0);
      const loss = e.loss + (bonusPerdido ? 3 * share : 0);
      const minutes = e.times.length ? Math.max(1, (Math.max(...e.times) - Math.min(...e.times)) / 60000) : null;
      const apply = agg => {
        agg.points += pts; agg.tasks += e.tasks; agg.criticals += e.criticals;
        if (isFull) agg.fullChecklists += share; // participação proporcional
        agg.julgadas += e.julgadas; agg.aprovadas += e.aprovadas;
        agg.ressalvas += e.ressalvas; agg.reprovadas += e.reprovadas;
        agg.reviewLoss += loss;
        agg.unitIds.add(c.unitId);
        if (minutes != null) { agg.timedPoints += pts; agg.minutes += minutes; }
      };
      apply(ensure(collabs, e.key, e.name));
      apply(ensure(units, c.unitId || '—', c.unitId || '—'));
      apply(ensure(sectors, `${c.unitId}|${c.sector || '—'}`, c.sector || '—'));
      apply(company);
    });
  });

  // Ritmo com piso em zero. Com reprovações o saldo de pontos pode ficar
  // negativo, e "−2 pts/h" não é ritmo de ninguém — o score só vai até 0. Os
  // pontos, esses sim, aparecem negativos: esconder o saldo seria esconder a
  // conta.
  const finish = agg => ({ ...agg, rate: agg.minutes > 0 ? Math.max(0, agg.timedPoints) / (agg.minutes / 60) : null });
  const companyF = finish(company);
  const withScore = agg => {
    const f = finish(agg);
    return { ...f, score: f.rate != null && companyF.rate ? Math.round((f.rate / companyF.rate) * 100) : null };
  };
  const toList = map => [...map.values()].map(withScore).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.points - a.points);
  return { company: companyF, collaborators: toList(collabs), units: toList(units), sectors: toList(sectors) };
}
