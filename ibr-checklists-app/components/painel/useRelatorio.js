'use client';

/**
 * Motor da aba Dados — todo o estado de filtro e tudo o que se deriva dele.
 *
 * Extraído da `ReportsView` na Fase 4b da consolidação de abas. **Nenhuma linha
 * de lógica mudou**: as 374 linhas abaixo são as mesmas que viviam no corpo do
 * componente, no mesmo endereço relativo umas das outras.
 *
 * Por que virou hook: a aba consolidada precisa dos MESMOS números — os mesmos
 * `filtered`, `summary`, `groups`, `collaborators` e os mesmos `exportCSV` /
 * `exportPDF` — mas com o seletor de período numa faixa no topo e o conteúdo
 * fatiado em três lentes. Reimplementar daria ~1.600 linhas duplicadas e duas
 * verdades; dar props de controle à `ReportsView` esbarraria em `period` ser
 * estado interno de uns quinze derivados. Com o motor aqui, as duas telas
 * consomem a mesma origem e não há o que divergir.
 *
 * `exportCSV` e `exportPDF` vêm junto de propósito: eles fecham sobre `filtered`,
 * `summary`, `groups` e `collaborators`: separá-los do motor recriaria o
 * acoplamento por outro caminho, com o risco de exportar um recorte diferente do
 * que está na tela. A restrição dura nº 2 do plano é que o PDF continue igual.
 *
 * REGRA: não pode importar de `app/`.
 */

import { useState, useEffect } from 'react';
import { todayStr, tzOf } from '../../lib/dates';
import { latestPerRound, roundKey } from '../../lib/rounds';
import { CHECKLIST_TYPE_ORDER, completeRoundChecker, isUnitClosed } from '../../lib/checklists';
import {
  PERIODS, periodDates, filterCompletions, countApplicableTemplatesOnDate,
  summarizeCompletions, collaboratorStats, groupStats, computeProductivity,
} from '../../lib/stats';
import { MANAGER_ROLES } from './shared';
import { useUnits } from './context';

export function useRelatorio({ unit, templates, completions, closures, users, canSeeAllUnits, allUnitsSelected = false, currentUser, onReview, disputes = [], onResolveDispute, activeTypes = CHECKLIST_TYPE_ORDER }) {
  const units = useUnits(); // unidades da empresa logada (antes: constante do IBR)
  const [viewingPhoto, setViewingPhoto] = useState(null); // evidência com foto (pedido do piloto)
  const [reviewing, setReviewing] = useState(null);       // execução aberta para conferência
  const [soPendentes, setSoPendentes] = useState(false);
  // Conferir é ato de liderança — o colaborador nem vê o botão. O portão de
  // verdade está na RPC `review_completion`, que confere o papel pelo token;
  // isto aqui só evita oferecer o que seria recusado.
  const canReview = !!onReview && MANAGER_ROLES.includes(currentUser?.role);
  /**
   * A tela tem dois empregos que não se misturam: CONFERIR (a tarefa de todo
   * dia — justificativas + execuções) e ANÁLISE (números, produtividade,
   * exportação — consulta ocasional). Antes eram uma pilha só, e quem confere
   * atravessava 8 a 12 telas de rolagem de análise para chegar ao trabalho.
   *
   * Quem confere cai em Conferir; quem não confere nem vê o seletor. NÃO é a
   * fila agrupada por checklist do plano (docs/REVISAO_CONFERENCIA_v1.md §2) —
   * aquela segue esperando observação de uso real; isto é só parar de cobrar
   * pedágio de rolagem da tarefa diária.
   */
  const [vista, setVista] = useState(canReview ? 'conferir' : 'analise');
  const [execPage, setExecPage] = useState(1);
  const [period, setPeriod] = useState('7d');
  // Trocar de filtro estando na página 7 mostraria "nenhuma execução" num
  // recorte que tem dados — a página precisa voltar ao início.
  useEffect(() => { setExecPage(1); }, [period, unit?.id]);
  // Datas do relatório na régua da loja em foco — "hoje" no seletor tem que ser
  // o mesmo "hoje" das execuções que ele filtra.
  const reportTz = tzOf(unit);
  const [customFrom, setCustomFrom] = useState(() => todayStr(reportTz));
  const [customTo, setCustomTo] = useState(() => todayStr(reportTz));
  const [selectedMonth, setSelectedMonth] = useState(() => todayStr(reportTz).slice(0, 7));
  // `null` = todas as lojas. `filterCompletions`, `openDates` e o export já
  // tratavam esse caso; o que faltava era alguém conseguir chegar nele.
  const [filterUnitId, setFilterUnitId] = useState(allUnitsSelected ? null : unit.id);

  // Keep filterUnitId in sync when the user switches loja in the header
  useEffect(() => {
    setFilterUnitId(allUnitsSelected ? null : unit.id);
    setFilterUserId('');
    setFilterSector(null);
  }, [unit.id, allUnitsSelected]);
  const [filterSector, setFilterSector] = useState(null);
  const [filterShift, setFilterShift] = useState(null);
  const [filterUserId, setFilterUserId] = useState('');
  const [groupBy, setGroupBy] = useState('tipo');

  const dates = periodDates(period, customFrom, customTo, selectedMonth, reportTz);
  // IBR1 uses sector groups (Salão/Cozinha); IBR2/IBR3 use individual sectors
  const sectorGroupToSectors = (groupId, unitId) => {
    if (unitId !== 'ibr1' || !groupId) return null;
    if (groupId === 'salao') return ['Salão'];
    if (groupId === 'cozinha') return ['Cozinha'];
    return null;
  };

  const resolvedSectors = sectorGroupToSectors(filterSector, filterUnitId);
  const submissoes = filterCompletions(completions, {
    dates, unitId: filterUnitId,
    sector: resolvedSectors ? null : filterSector, // pass null if we handle it via sectorList
    sectorList: resolvedSectors,
    shift: filterShift, userId: filterUserId || null,
  });

  /**
   * Uma linha por RODADA (loja + checklist + dia), não por submissão.
   *
   * O Relatórios era o último lugar do app que ainda contava submissões:
   * `collaboratorStats` (861) e `computeProductivity` (989) já desduplicavam,
   * e o índice da liderança também (`team` em computeLeadershipProfile). Só a
   * tela ficou para trás — então os StatCards diziam um número, a tabela de
   * colaboradores dizia outro, e a lista de execuções repetia o mesmo checklist
   * do mesmo dia.
   *
   * O custo disso não era estético: medido em 08/08/2026 na IBR, 148 submissões
   * para 105 rodadas. A liderança conferiu a mesma rodada duas vezes 43 vezes —
   * 29% do trabalho dela. E como `reviewable` já contava por rodada, essas 43
   * conferências nunca contaram para o índice dela.
   *
   * Nada some em silêncio: `submissoesPorRodada` alimenta o selo "2 submissões"
   * na lista e a coluna nos dois exports. A submissão descartada continua no
   * banco — aqui se escolhe a MAIS RECENTE, que é a que reflete o estado final.
   */
  const filtered = latestPerRound(submissoes);
  // Sem useMemo de propósito: `submissoes` é um array novo a cada render (o
  // ReportsView inteiro recalcula assim, ver `summary` e `groups`), então um
  // useMemo aqui nunca acertaria a dependência — só daria a impressão de que
  // memoiza. Quando este componente ganhar memoização, ela entra na origem.
  const submissoesPorRodada = new Map();
  submissoes.forEach(c => {
    const k = roundKey(c);
    submissoesPorRodada.set(k, (submissoesPorRodada.get(k) || 0) + 1);
  });
  const reexecucoes = filtered.filter(c => (submissoesPorRodada.get(roundKey(c)) || 1) > 1).length;

  const summary = summarizeCompletions(filtered);
  const reportFilter = { unitId: filterUnitId, sector: filterSector, shift: filterShift };
  const effectiveDates = dates || [...new Set(filtered.map(c => c.date))];
  // Exclude days when the selected unit(s) were closed
  const openDates = effectiveDates.filter(d => {
    if (filterUnitId) return !isUnitClosed(closures, filterUnitId, d);
    return units.some(u => !isUnitClosed(closures, u.id, d));
  });
  const expectedChecklists = openDates.reduce((sum, d) => sum + countApplicableTemplatesOnDate(templates, reportFilter, d), 0);
  const numDays = effectiveDates.length;
  const checklistRate = expectedChecklists ? (summary.checklists / expectedChecklists) * 100 : null;

  /**
   * "Checklists 100%" — o terceiro nome do Conjunto A (§B.6), que até 12/08/2026
   * não tinha onde morar.
   *
   * `summary.checklists` é `filtered.length`: rodadas ENTREGUES, completas ou
   * parciais. Um checklist aberto e submetido pela metade conta ali. Então
   * `checklistRate` responde "quanto do previsto foi entregue", e NÃO "quanto do
   * previsto foi terminado" — duas perguntas que o mesmo cartão vinha
   * respondendo como se fossem uma.
   *
   * `completeRoundChecker` é o MESMO predicado que o `buildJit` usa para separar
   * `yDone` de `yPartial`. Usá-lo aqui é o que faz este número ser o irmão de
   * período do `yAdherence` que o registro AGORA já mostra para ontem — se
   * fossem contas diferentes, as duas partes da mesma tela se contradiriam, que
   * é o defeito que a consolidação inteira existiu para eliminar.
   */
  const ehCompleta = completeRoundChecker(templates);
  const checklistsCompletos = filtered.filter(ehCompleta).length;
  const taxaCompletos = expectedChecklists ? (checklistsCompletos / expectedChecklists) * 100 : null;

  // IBR1 uses sector groups (Salão/Cozinha); IBR2/IBR3 use individual sectors.
  // Sem loja selecionada (rede inteira), a lista é a UNIÃO dos setores — senão
  // o filtro de setor aparecia vazio justamente para quem vê mais coisa.
  const sectorOptions = filterUnitId === 'ibr1'
    ? [{ id: 'salao', label: 'Salão' }, { id: 'cozinha', label: 'Cozinha' }]
    : (filterUnitId
        ? (units.find(u => u.id === filterUnitId)?.sectors || [])
        : [...new Set(units.flatMap(u => u.sectors || []))]
      ).map(s => ({ id: s, label: s }));

  const collaborators = collaboratorStats(filtered);
  const groups = groupStats(filtered, groupBy, units, activeTypes);

  // ── Produtividade ──────────────────────────────────────────────────────────
  // O baseline é sempre a EMPRESA inteira no período (sem filtro de loja/setor),
  // para o score do colaborador/setor/loja ser comparável contra a mesma régua.
  const prod = computeProductivity(filterCompletions(completions, { dates }));
  // Sem loja selecionada, o recorte é a rede inteira: filtrar por `null` daria
  // três listas vazias para quem tem o escopo mais largo do app.
  const prodUnits = canSeeAllUnits ? prod.units : prod.units.filter(u => u.key === filterUnitId);
  const prodSectors = filterUnitId
    ? prod.sectors.filter(s => s.key.startsWith(`${filterUnitId}|`))
    : prod.sectors;
  const prodCollabs = prod.collaborators
    .filter(cb => (!filterUnitId || cb.unitIds.has(filterUnitId)) && (!filterUserId || cb.key === filterUserId))
    .slice(0, 15);

  // ── Export helpers ─────────────────────────────────────────────────────────
  const periodLabel = period === 'custom'
    ? `${customFrom} a ${customTo}`
    : period === 'month'
      ? new Date(`${selectedMonth}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : PERIODS.find(p => p.id === period)?.label || period;

  const exportCSV = () => {
    const rows = [
      ['Data', 'Loja', 'Setor', 'Checklist', 'Responsável', 'Concluído às', 'Tarefas feitas', 'Total tarefas', '% Conclusão', 'Críticos pendentes', 'Submissões'],
      // Uma linha por rodada, igual à tela. A coluna "Submissões" é o que
      // impede a desduplicação de virar perda: quem precisa auditar uma
      // reexecução vê que ela existiu e quantas foram.
      ...filtered.map(c => {
        const done = c.items.filter(i => i.done).length;
        const total = c.items.length;
        const rate = total ? ((done / total) * 100).toFixed(0) + '%' : '—';
        const crit = c.items.filter(i => i.critical && !i.done).length;
        return [
          c.date,
          units.find(u => u.id === c.unitId)?.name || c.unitId,
          c.sector,
          c.templateName,
          c.operatorName,
          new Date(c.completedAt).toLocaleString('pt-BR'),
          done,
          total,
          rate,
          crit,
          submissoesPorRodada.get(roundKey(c)) || 1,
        ];
      }),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ibr-relatorio-${periodLabel.replace(/\s/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const unitLabel = filterUnitId ? units.find(u => u.id === filterUnitId)?.name : 'Todas as lojas';
    /**
     * E-a (§E.3) — o escopo por extenso.
     *
     * O cabeçalho dizia só período + loja. Dois PDFs do mesmo mês e da mesma
     * loja, um filtrado por Salão e outro por Cozinha, saíam VISUALMENTE
     * IDÊNTICOS — e viram anexo de e-mail, impressão em reunião, arquivo numa
     * pasta. Quem recebe não tem como saber qual é qual, e um relatório que não
     * declara o próprio recorte convida a comparar coisas diferentes.
     */
    const escopo = [
      filterSector && `setor: ${sectorOptions.find(o => o.id === filterSector)?.label || filterSector}`,
      filterUserId && `colaborador: ${users.find(u => u.id === filterUserId)?.name || filterUserId}`,
      `agrupado por ${groupBy}`,
    ].filter(Boolean).join(' · ');
    const unitColor = filterUnitId ? (units.find(u => u.id === filterUnitId)?.color || '#063C5C') : '#063C5C';

    // Build bar chart SVG for groups
    const maxRate = 100;
    const barH = 24;
    const barGap = 8;
    const chartW = 480;
    const labelW = 140;
    const barMaxW = chartW - labelW - 60;
    const chartH = groups.length * (barH + barGap) + 16;

    const barsSVG = groups.map((g, i) => {
      const y = i * (barH + barGap) + 8;
      const bw = Math.round((g.rate / 100) * barMaxW);
      const color = g.rate >= 80 ? '#31C85A' : g.rate >= 50 ? unitColor : '#D1462F';
      const label = g.key.length > 22 ? g.key.slice(0, 22) + '…' : g.key;
      return `
        <text x="0" y="${y + 16}" font-size="11" fill="#4A4035" font-family="system-ui">${label}</text>
        <rect x="${labelW}" y="${y}" width="${bw}" height="${barH}" rx="4" fill="${color}" opacity="0.85"/>
        <text x="${labelW + bw + 6}" y="${y + 16}" font-size="11" font-weight="800" fill="${color}" font-family="system-ui">${g.rate.toFixed(0)}%</text>
      `;
    }).join('');

    // Collaborator rows
    const colabRows = collaborators.map(c =>
      `<tr>
        <td>${c.name}</td>
        <td style="text-align:center">${c.checklists}</td>
        <td style="text-align:center">${c.tasksDone}${c.criticalDone > 0 ? ` (${c.criticalDone} crít.)` : ''}</td>
        <td style="text-align:center;font-weight:800;color:${c.rate==null?'#888':c.rate>=80?'#31C85A':c.rate>=50?unitColor:'#D1462F'}">${c.rate==null?'—':c.rate.toFixed(0)+'%'}</td>
        <td style="text-align:center;font-weight:${c.criticalPending>0?'700':'400'};color:${c.criticalPending>0?'#D1462F':'#888'}">${c.criticalPending > 0 ? c.criticalPending : '—'}</td>
      </tr>`
    ).join('');

    /**
     * E-c (§E.3) — teto de linhas.
     *
     * Com `period = 'all'` esta tabela despejava a história INTEIRA da loja:
     * numa empresa com um ano de operação são milhares de linhas, e o PDF vira
     * um documento que ninguém abre e uma impressora que ninguém perdoa. O teto
     * é declarado no próprio arquivo — omitir em silêncio seria pior que
     * despejar tudo, porque o leitor acharia que está vendo o total.
     *
     * Os NÚMEROS acima da tabela (cartões, gráfico, colaboradores) seguem sobre
     * o período inteiro: o teto corta a lista, não a conta.
     */
    const EXEC_MAX_PDF = 300;
    const execOrdenadas = [...filtered]
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    const execCortadas = Math.max(0, execOrdenadas.length - EXEC_MAX_PDF);
    const execRows = execOrdenadas
      .slice(0, EXEC_MAX_PDF)
      .map(c => {
        const done = c.items.filter(i => i.done).length;
        const fotos = c.items.filter(i => i.hasPhoto).length;
        const subs = submissoesPorRodada.get(roundKey(c)) || 1;
        return `<tr>
          <td style="white-space:nowrap">${new Date(c.completedAt).toLocaleDateString('pt-BR')} ${new Date(c.completedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
          <td>${units.find(u => u.id === c.unitId)?.name || c.unitId}</td>
          <td>${c.sector} · ${c.templateName}</td>
          <td>${c.operatorName}</td>
          <td style="text-align:center">${done}/${c.items.length}</td>
          <td style="text-align:center">${fotos > 0 ? fotos : '—'}</td>
          <td style="text-align:center">${subs > 1 ? subs : '—'}</td>
        </tr>`;
      }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>IBR Relatório — ${unitLabel}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #063C5C; background: white; }
  .page { padding: 32px 40px; max-width: 820px; margin: 0 auto; }

  /* Header */
  .header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 20px; border-bottom: 2px solid #E2EAF0; margin-bottom: 24px; }
  .header-left h1 { font-size: 20px; font-weight: 800; color: #063C5C; }
  .header-left p { font-size: 12px; color: #6B8299; margin-top: 4px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: white; background: ${unitColor}; }

  /* Summary cards */
  .cards { display: grid; grid-template-columns: repeat(5,1fr); gap: 10px; margin-bottom: 28px; }
  .card { border: 1.5px solid #E2EAF0; border-radius: 10px; padding: 14px 12px; }
  .card-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.12em; color: #6B8299; font-weight: 700; }
  .card-value { font-size: 28px; font-weight: 800; color: #063C5C; margin: 6px 0 2px; line-height: 1; }
  .card-sub { font-size: 10px; color: #6B8299; }
  .card.highlight { border-color: ${unitColor}; background: ${unitColor}10; }
  .card.highlight .card-value { color: ${unitColor}; }

  /* Section title */
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #6B8299; font-weight: 800; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 1px solid #E2EAF0; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 28px; }
  th { text-align: left; padding: 7px 10px; background: #F7F9FB; border-bottom: 2px solid #E2EAF0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6B8299; font-weight: 700; }
  td { padding: 7px 10px; border-bottom: 1px solid #F0EBE0; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #F7F9FB; }

  /* Chart */
  .chart-wrap { margin-bottom: 28px; overflow: hidden; }

  /* Footer */
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2EAF0; display: flex; justify-content: space-between; font-size: 10px; color: #6B8299; }

  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .page { padding: 20px 24px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <h1>ZCheck — Relatório Operacional</h1>
      <p>${periodLabel} &nbsp;·&nbsp; gerado em ${new Date().toLocaleString('pt-BR')}</p>
      <p style="font-size:11px;color:#7A6F63;margin-top:2px">${escopo}</p>
    </div>
    <span class="badge">${unitLabel}</span>
  </div>

  <!-- Summary cards -->
  <div class="cards">
    <div class="card highlight">
      <div class="card-label">Feito do entregue</div>
      <div class="card-value">${summary.rate.toFixed(0)}%</div>
      <div class="card-sub">${summary.doneItems} de ${summary.totalItems} tarefas entregues</div>
    </div>
    <div class="card">
      <div class="card-label">Checklists entregues</div>
      <div class="card-value">${summary.checklists}${expectedChecklists > 0 ? `<span style="font-size:14px;color:#6B8299">/${expectedChecklists}</span>` : ''}</div>
      <div class="card-sub">${checklistRate != null ? checklistRate.toFixed(0) + '% do previsto' : 'entregues'}</div>
    </div>
    <div class="card">
      <div class="card-label">Checklists 100%</div>
      <div class="card-value">${checklistsCompletos}${expectedChecklists > 0 ? `<span style="font-size:14px;color:#6B8299">/${expectedChecklists}</span>` : ''}</div>
      <div class="card-sub">${taxaCompletos != null ? taxaCompletos.toFixed(0) + '% do previsto, sem pendência' : 'terminados'}</div>
    </div>
    <div class="card" style="${summary.criticalPending > 0 ? 'border-color:#D1462F' : ''}">
      <div class="card-label">Críticos pend.</div>
      <div class="card-value" style="color:${summary.criticalPending > 0 ? '#D1462F' : '#31C85A'}">${summary.criticalPending}</div>
      <div class="card-sub">itens críticos</div>
    </div>
    <div class="card">
      <div class="card-label">Fotos</div>
      <div class="card-value">${summary.photos}</div>
      <div class="card-sub">comprovações</div>
    </div>
  </div>

  <!-- Bar chart -->
  ${groups.length > 0 ? `
  <p class="section-title">Realização por ${groupBy === 'tipo' ? 'tipo de checklist' : 'setor'}</p>
  <div class="chart-wrap">
    <svg width="${chartW}" height="${chartH}" xmlns="http://www.w3.org/2000/svg">
      ${barsSVG}
    </svg>
  </div>` : ''}

  <!-- Collaborator table -->
  ${collaborators.length > 0 ? `
  <p class="section-title">Desempenho por colaborador</p>
  <table>
    <thead><tr>
      <th>Colaborador</th>
      <th style="text-align:center">Checklists</th>
      <th style="text-align:center">Tarefas exec.</th>
      <th style="text-align:center">% Realização</th>
      <th style="text-align:center">Críticos pend.</th>
    </tr></thead>
    <tbody>${colabRows}</tbody>
  </table>` : ''}

  <!-- Execuções do período -->
  ${filtered.length > 0 ? `
  <p class="section-title">Execuções do período (${filtered.length})</p>
  ${execCortadas > 0 ? `<p style="font-size:11px;color:#7A6F63;margin:-4px 0 8px">Mostrando as ${EXEC_MAX_PDF} mais recentes de ${execOrdenadas.length}. Os números acima cobrem o período inteiro.</p>` : ''}
  <table>
    <thead><tr>
      <th>Quando</th>
      <th>Loja</th>
      <th>Checklist</th>
      <th>Responsável</th>
      <th style="text-align:center">Tarefas</th>
      <th style="text-align:center">Fotos</th>
      <th style="text-align:center">Submissões</th>
    </tr></thead>
    <tbody>${execRows}</tbody>
  </table>` : ''}

  <!-- Footer -->
  <div class="footer">
    <span>ZCheck — Relatório Operacional</span>
    <span>gerado em ${new Date().toLocaleString('pt-BR')}</span>
  </div>

</div>

<script>
  // Auto-print after small delay for styles to render
  setTimeout(() => window.print(), 600);
</script>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    /**
     * E-b (§E.3) — o retorno de `window.open` nunca era olhado.
     *
     * Navegador com pop-up bloqueado devolve `null`, e a exportação morria em
     * silêncio absoluto: o gestor clicava, nada acontecia, e não havia nada na
     * tela que explicasse. A conclusão natural é "o relatório está quebrado".
     */
    if (!win) {
      URL.revokeObjectURL(url);
      alert('O navegador bloqueou a janela de impressão.\n\nLibere pop-ups para este site e toque em Exportar de novo. O relatório não foi perdido — ele é gerado na hora.');
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return {
    canReview, checklistRate, collaborators, customFrom, customTo, dates, execPage,
    checklistsCompletos, taxaCompletos,
    expectedChecklists, exportCSV, exportPDF, filterSector, filterUnitId, filterUserId,
    filtered, groupBy, groups, numDays, period, prod, prodCollabs, prodSectors, prodUnits,
    reexecucoes, reportTz, reviewing, sectorOptions, selectedMonth, setCustomFrom, setCustomTo,
    setExecPage, setFilterSector, setFilterUserId, setGroupBy, setPeriod, setReviewing,
    setSelectedMonth, setSoPendentes, setViewingPhoto, setVista, soPendentes,
    submissoesPorRodada, summary, units, viewingPhoto, vista,
  };
}
