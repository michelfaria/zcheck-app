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
import { latestPerRound, templateExistedOn } from './rounds';
import {
  CHECKLIST_TYPE_ORDER, isItemApplicable, matchesShift,
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

// Number of checklists expected on a given date, considering each template's item-level recurrence:
// a template counts as "expected" that day if at least one of its items applies to that weekday.
export function countApplicableTemplatesOnDate(templates, f, dateStr) {
  return templates.filter(t => {
    if (f.unitId && t.unitId !== f.unitId) return false;
    if (f.sector && t.sector !== f.sector) return false;
    if (f.shift && !matchesShift(t, f.shift)) return false;
    if (!templateExistedOn(t, dateStr)) return false;
    return t.items.some(i => isItemApplicable(i, dateStr));
  }).length;
}

export function summarizeCompletions(filtered) {
  let totalItems = 0, doneItems = 0, criticalPending = 0, photos = 0;
  filtered.forEach(c => {
    totalItems += c.items.length;
    c.items.forEach(i => {
      if (i.done) doneItems += 1;
      if (i.critical && !i.done) criticalPending += 1;
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
      if (i.critical && !i.done) s.criticalPending += 1;
      if (i.hasPhoto) s.photos += 1;
      if (!i.done) return;
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
      if (i.done) s.doneItems += 1;
      if (i.critical && !i.done) s.criticalPending += 1;
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
// O mesmo cálculo agrega colaborador, setor, loja e empresa — comparáveis entre si.
export function computeProductivity(completions) {
  const mkAgg = (key, name) => ({ key, name, points: 0, timedPoints: 0, minutes: 0, tasks: 0, criticals: 0, fullChecklists: 0, unitIds: new Set() });
  const collabs = new Map(), units = new Map(), sectors = new Map();
  const company = mkAgg('empresa', 'Empresa');
  const ensure = (map, key, name) => { if (!map.has(key)) map.set(key, mkAgg(key, name)); return map.get(key); };

  // Uma rodada por checklist/dia/loja: reexecução não multiplica pontos.
  latestPerRound(completions).forEach(c => {
    const items = c.items || [];
    const doneItems = items.filter(i => i.done);
    if (doneItems.length === 0) return;
    const isFull = doneItems.length === items.length;
    const subKey = c.operatorUserId || c.operatorName || '—';

    // Agrupa as tarefas concluídas por quem executou (colaborativo ou não)
    const byExec = new Map();
    doneItems.forEach(i => {
      const key = i.doneBy || subKey;
      if (!byExec.has(key)) byExec.set(key, { key, name: i.doneByName || c.operatorName || 'Sem responsável', pts: 0, tasks: 0, criticals: 0, times: [] });
      const e = byExec.get(key);
      e.pts += i.critical ? 2 : 1;
      e.tasks += 1;
      if (i.critical) e.criticals += 1;
      if (i.doneAt) e.times.push(new Date(i.doneAt).getTime());
    });

    byExec.forEach(e => {
      const pts = e.pts + (isFull ? 3 * (e.tasks / doneItems.length) : 0);
      const minutes = e.times.length ? Math.max(1, (Math.max(...e.times) - Math.min(...e.times)) / 60000) : null;
      const apply = agg => {
        agg.points += pts; agg.tasks += e.tasks; agg.criticals += e.criticals;
        if (isFull) agg.fullChecklists += e.tasks / doneItems.length; // participação proporcional
        agg.unitIds.add(c.unitId);
        if (minutes != null) { agg.timedPoints += pts; agg.minutes += minutes; }
      };
      apply(ensure(collabs, e.key, e.name));
      apply(ensure(units, c.unitId || '—', c.unitId || '—'));
      apply(ensure(sectors, `${c.unitId}|${c.sector || '—'}`, c.sector || '—'));
      apply(company);
    });
  });

  const finish = agg => ({ ...agg, rate: agg.minutes > 0 ? agg.timedPoints / (agg.minutes / 60) : null });
  const companyF = finish(company);
  const withScore = agg => {
    const f = finish(agg);
    return { ...f, score: f.rate != null && companyF.rate ? Math.round((f.rate / companyF.rate) * 100) : null };
  };
  const toList = map => [...map.values()].map(withScore).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.points - a.points);
  return { company: companyF, collaborators: toList(collabs), units: toList(units), sectors: toList(sectors) };
}
