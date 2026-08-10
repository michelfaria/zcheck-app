/**
 * ZCheck — resolução de SETOR — dois formatos convivem.
 *
 * Movido de `app/app/page.js` na Fase 1b da consolidação de abas. Nenhuma linha
 * de lógica mudou: só endereço. Ver `docs/PLANO_CONSOLIDACAO_ABAS.md`.
 *
 * REGRA: não pode importar de `app/`.
 */

export function sectorLabelFor(sectorId, sectorRows) {
  if (!sectorId) return '';
  if (sectorId === 'salao') return 'Salão';      // legado IBR
  if (sectorId === 'cozinha') return 'Cozinha';  // legado IBR
  return (sectorRows || []).find(s => s.id === sectorId)?.name || '';
}

// Fixed display order for the three checklist types
// Returns the list of sectors visible to a user based on their sectorId.
// Dois formatos convivem: os grupos legados do IBR1 ('salao'/'cozinha') e, para
// as demais empresas, o id da linha na tabela `sectors` (resolvido por nome via
// sectorRows). Antes o filtro só existia para o IBR1 — colaborador de qualquer
// outra empresa via todos os setores mesmo vinculado a um (corrigido 20/07).
export function visibleSectors(unit, sectorId, sectorRows) {
  if (!sectorId) return unit.sectors;
  if (sectorId === 'salao' || sectorId === 'cozinha') {
    if (unit.id !== 'ibr1') return unit.sectors;
    const name = sectorId === 'salao' ? 'Salão' : 'Cozinha';
    return unit.sectors.filter(s => s === name);
  }
  const row = (sectorRows || []).find(s => s.id === sectorId);
  if (!row) return unit.sectors; // id desconhecido: nunca esconder a loja inteira
  const filtered = unit.sectors.filter(s => s === row.name);
  return filtered.length ? filtered : unit.sectors;
}
