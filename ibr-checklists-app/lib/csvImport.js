/**
 * Importação de checklists via CSV — parser único, usado pelo modal dentro do
 * app (Gerenciar > Importar) e pela página legada /importar.
 *
 * Por que existe: o modelo baixado pelo próprio app voltava com erro depois de
 * passar por Excel/Numbers. Três causas reais, todas tratadas aqui:
 *   1. Excel/Numbers em pt-BR salva CSV com ";" (ou TAB) — o parser só aceitava
 *      vírgula e reclamava de "colunas obrigatórias ausentes".
 *   2. Excel/Numbers autocapitaliza a primeira letra da célula: "tarefa" vira
 *      "Tarefa" e a comparação `row.tipo === 'tarefa'` descartava TODAS as
 *      linhas — resultado: "Nenhum checklist encontrado".
 *   3. BOM e quebras CRLF/CR do Windows.
 * Além disso, tudo que é descartado agora vira aviso com o número da linha, em
 * vez de sumir em silêncio.
 */

const uid = () => Math.random().toString(36).slice(2, 10);

// Comparação tolerante: minúsculo, sem acento, sem espaço sobrando.
export const csvNorm = (s) =>
  (s ?? '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');

export const CSV_COLUMNS = ['tipo', 'checklist', 'loja', 'setor', 'tarefa', 'critico', 'foto', 'dias', 'orientacao', 'video', 'link', 'deadline', 'arrastar'];
const CSV_REQUIRED = ['tipo', 'checklist', 'loja', 'setor'];

// Sinônimos aceitos na coluna `tipo` (já normalizados).
const TIPO_CHECKLIST = ['checklist', 'lista'];
const TIPO_TAREFA = ['tarefa', 'item', 'task'];

// "sim"/"s"/"x"/"1"/"true" contam como sim; qualquer outra coisa é não.
const csvBool = (v) => ['sim', 's', 'x', '1', 'true', 'yes', 'y'].includes(csvNorm(v));

/** Detecta o separador pelo cabeçalho, contando só o que está fora de aspas. */
export function detectDelimiter(headerLine) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const ch of headerLine || '') {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  const best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  return counts[best] > 0 ? best : ',';
}

/** Divide uma linha respeitando aspas ("..." com "" escapado). */
export function splitCsvLine(line, delim = ',') {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(v => v.trim());
}

const CSV_DAY_CODES = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
/** "seg qua sex" (ou "seg;qua;sex") → [1,3,5]; vazio → null (= todos os dias). */
export function parseCsvDays(s) {
  if (!s) return null;
  const days = [...new Set(csvNorm(s).split(/[^a-z]+/).map(t => CSV_DAY_CODES[t]).filter(d => d !== undefined))].sort((a, b) => a - b);
  return days.length ? days : null;
}

/** Escapa um valor para o CSV gerado (nome de loja pode ter vírgula). */
const q = (v) => (/[",;\n\r]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));

/**
 * Monta o CSV modelo já com a loja e o setor REAIS da empresa. Antes o modelo
 * vinha fixo com "Loja 1"/"Salão", que não existem em nenhuma empresa: baixar e
 * importar sem editar resultava sempre em "0 importados / 2 ignorados".
 */
export function buildModelCsv({ loja = 'Loja 1', setor = 'Salão', tipoAbertura = 'Abertura', tipoFechamento = 'Fechamento' } = {}) {
  const L = q(loja), S = q(setor), A = q(tipoAbertura), F = q(tipoFechamento);
  return [
    CSV_COLUMNS.join(','),
    `checklist,${A},${L},${S},,,,,,,,08:00,`,
    `tarefa,${A},${L},${S},Limpar mesas e cadeiras,nao,sim,,${q('Conferir rodapés, cantos e vãos')},,,,`,
    // "arrastar" no exemplo periódico de propósito: é onde ele faz sentido —
    // a tarefa de seg/qua/sex que ninguém fez volta no dia seguinte.
    `tarefa,${A},${L},${S},Verificar caixas,sim,,seg qua sex,,,,,sim`,
    `checklist,${F},${L},${S},,,,,,,,18:00,`,
    `tarefa,${F},${L},${S},Fechar caixas,sim,,,,https://youtube.com/watch?v=exemplo,,,`,
  ].join('\r\n');
}

/**
 * Lê o CSV e devolve `{ checklists, warnings }` ou `{ error, warnings }`.
 * `warnings` traz o motivo de cada linha descartada, com o número da linha.
 */
export function parseImportCSV(text) {
  // Tira o BOM que o Excel grava e aceita CRLF/CR além de LF.
  const raw = (text || '').replace(/^﻿/, '').trim();
  if (!raw) return { error: 'Cole ou carregue um CSV.', warnings: [] };

  const lines = raw.split(/\r\n|\r|\n/);
  const headerIdx = lines.findIndex(l => l.trim());
  if (headerIdx < 0) return { error: 'Cole ou carregue um CSV.', warnings: [] };

  const delim = detectDelimiter(lines[headerIdx]);
  const headers = splitCsvLine(lines[headerIdx], delim).map(csvNorm);
  const missing = CSV_REQUIRED.filter(r => !headers.includes(r));
  if (missing.length) {
    return {
      error: `Colunas obrigatórias ausentes: ${missing.join(', ')}. Cabeçalho lido: ${headers.filter(Boolean).join(' | ') || '(vazio)'}. `
        + 'Salve a planilha como "CSV" (vírgula, ponto e vírgula ou tabulação) mantendo a primeira linha do modelo.',
      warnings: [],
    };
  }

  const checklists = []; const warnings = []; let current = null;
  // Agrupa por checklist+loja+setor. Uma linha "tarefa" que nomeia um grupo
  // ainda não aberto CRIA o grupo: o arquivo exportado do app repete
  // checklist/loja/setor/deadline em toda linha, então a linha "checklist" é
  // redundante — exigi-la fazia o arquivo inteiro ser descartado.
  const byKey = new Map();
  const keyOf = (nome, loja, setor) => `${csvNorm(nome)}|${csvNorm(loja)}|${csvNorm(setor)}`;
  const abrir = (nome, loja, setor, deadline, lineNo) => {
    const k = keyOf(nome, loja, setor);
    let grupo = byKey.get(k);
    if (!grupo) {
      grupo = { id: uid(), name: nome, unitName: loja, sector: setor, deadline: deadline || null, items: [], line: lineNo };
      byKey.set(k, grupo);
      checklists.push(grupo);
    } else if (!grupo.deadline && deadline) {
      grupo.deadline = deadline; // primeiro deadline não-vazio vale para o grupo
    }
    return grupo;
  };

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const lineNo = i + 1; // 1-based, como a planilha mostra
    const line = lines[i];
    if (!line.trim()) continue;

    const vals = splitCsvLine(line, delim);
    const row = Object.fromEntries(headers.map((h, j) => [h, vals[j] || '']));
    // Linha só com separadores (Excel exporta assim) — ignora sem avisar.
    if (vals.every(v => !v)) continue;

    const tipo = csvNorm(row.tipo);
    if (!tipo) { warnings.push(`Linha ${lineNo}: coluna "tipo" vazia — ignorada.`); continue; }

    const isChecklist = TIPO_CHECKLIST.includes(tipo);
    const isTarefa = TIPO_TAREFA.includes(tipo);
    if (!isChecklist && !isTarefa) {
      warnings.push(`Linha ${lineNo}: tipo "${row.tipo}" não é "checklist" nem "tarefa" — ignorada.`);
      continue;
    }

    if (isChecklist) {
      const faltando = [
        !row.checklist?.trim() && 'checklist',
        !row.loja?.trim() && 'loja',
        !row.setor?.trim() && 'setor',
      ].filter(Boolean);
      if (faltando.length) {
        warnings.push(`Linha ${lineNo}: checklist sem ${faltando.join(', ')} — ignorada.`);
        current = null;
        continue;
      }
      current = abrir(row.checklist.trim(), row.loja.trim(), row.setor.trim(), row.deadline?.trim(), lineNo);
      continue;
    }

    if (!row.tarefa?.trim()) {
      warnings.push(`Linha ${lineNo}: tarefa sem texto na coluna "tarefa" — ignorada.`);
      continue;
    }
    // A própria linha diz a que checklist pertence: abre o grupo se ainda não
    // existe. Só quando checklist/loja/setor vêm em branco é que herda a de cima.
    if (row.checklist?.trim() && row.loja?.trim() && row.setor?.trim()) {
      current = abrir(row.checklist.trim(), row.loja.trim(), row.setor.trim(), row.deadline?.trim(), lineNo);
    } else if (!current) {
      const faltando = [
        !row.checklist?.trim() && 'checklist',
        !row.loja?.trim() && 'loja',
        !row.setor?.trim() && 'setor',
      ].filter(Boolean);
      warnings.push(`Linha ${lineNo}: tarefa sem ${faltando.join(', ')} e sem nenhum checklist aberto acima — ignorada.`);
      continue;
    }
    const item = { id: uid(), text: row.tarefa.trim(), critical: csvBool(row.critico) };
    if (csvBool(row.foto)) item.photoRequired = true;
    const days = parseCsvDays(row.dias); if (days) item.recurrence = days;
    // Tarefa que volta no dia seguinte enquanto não for feita. Sem
    // `carryoverSince`: o import só CRIA checklist (duplicata vira "ja-existe"),
    // e template novo nasce com `created_at` de hoje — `templateExistedOn` já
    // impede qualquer cobrança anterior à importação. O carimbo só é necessário
    // no editor, onde a flag pode ser ligada num checklist antigo.
    if (csvBool(row.arrastar)) item.carryover = true;
    if (row.orientacao) item.description = row.orientacao;
    if (row.video) item.refVideo = row.video;
    if (row.link) item.refLink = row.link;
    current.items.push(item);
  }

  if (!checklists.length) {
    return {
      error: 'Nenhum checklist encontrado. A coluna "tipo" precisa ter uma linha "checklist" antes das linhas "tarefa".',
      warnings,
    };
  }
  for (const c of checklists) {
    if (!c.items.length) warnings.push(`Checklist "${c.name}" (linha ${c.line}) ficou sem nenhuma tarefa.`);
  }
  return { checklists, warnings };
}
