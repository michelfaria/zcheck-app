/**
 * Caminhos no bucket `checklist-photos` — fotos de prova, fotos da rodada e
 * documentos de referência (POP).
 *
 * Módulo puro: o cliente (lib/sync.js) e a rota de migração do legado
 * (app/api/admin/storage-migrate, service_role) montam caminho pela MESMA regra,
 * e tests/photo-paths.spec.mjs a prova sem rede.
 *
 * ── A regra ─────────────────────────────────────────────────────────────────
 * Todo objeto mora na pasta da empresa: `{company_id}/<caminho relativo>`. A
 * policy do bucket compara `(storage.foldername(name))[1]` com o company_id do
 * TOKEN (ver 20260924_storage_01_checklist_photos_tenant.sql) — é isso que
 * impede uma empresa de ler, listar ou sobrescrever a foto de outra.
 *
 * Até 24/09/2026 os caminhos não tinham empresa (`{conclusão}/{item}.jpg`,
 * `rodada/...`, `refdocs/...`) e o bucket era aberto ao anon. Esses objetos
 * ANTIGOS continuam existindo até a cópia para a pasta da empresa. Por isso:
 *
 *   · o caminho RELATIVO (sem empresa) é o nome do objeto antigo, e
 *   · `{empresa}/{relativo}` é o nome do novo — a cópia do legado só acrescenta
 *     o prefixo, nada mais muda.
 *
 * Quem LÊ não sabe se o objeto já foi copiado. `pathCandidates` devolve os dois
 * nomes, novo primeiro: depois da cópia o primeiro acerta, antes dela o segundo
 * (que só abre para a empresa dona — policy de leitura do legado).
 */

export const PHOTOS_BUCKET = 'checklist-photos';

// A empresa vira a 1ª pasta do objeto. Barra, vazio ou `.`/`..` produziriam um
// caminho cuja 1ª pasta NÃO é a empresa — a policy recusaria, e o erro só
// apareceria como "foto não sobe". Melhor falhar aqui, com nome.
export function isValidCompanyFolder(companyId) {
  return typeof companyId === 'string'
    && companyId.length > 0
    && !companyId.includes('/')
    && companyId !== '.' && companyId !== '..';
}

/** `{empresa}/{relativo}`. Idempotente: caminho já qualificado volta igual. */
export function qualifyPath(companyId, path) {
  if (!isValidCompanyFolder(companyId)) throw new Error(`empresa inválida para o storage: ${companyId}`);
  if (typeof path !== 'string' || !path) throw new Error('caminho vazio');
  return path.startsWith(`${companyId}/`) ? path : `${companyId}/${path}`;
}

/** O inverso: tira a pasta da empresa, se houver. É o nome do objeto antigo. */
export function legacyPath(companyId, path) {
  if (!isValidCompanyFolder(companyId) || typeof path !== 'string') return path;
  return path.startsWith(`${companyId}/`) ? path.slice(companyId.length + 1) : path;
}

/**
 * Nomes a tentar, em ordem, para LER um objeto — de um ou mais caminhos vindos
 * do banco ou da convenção. Novo antes do antigo; sem repetição.
 *
 * Sem empresa (sem sessão) devolve os caminhos como vieram: a leitura vai
 * falhar na policy de qualquer jeito, e o chamador cai no cache local.
 */
export function pathCandidates(companyId, ...paths) {
  const out = [];
  const add = p => { if (p && !out.includes(p)) out.push(p); };
  for (const p of paths.flat()) {
    if (typeof p !== 'string' || !p) continue;
    if (!isValidCompanyFolder(companyId)) { add(p); continue; }
    add(qualifyPath(companyId, p));
    add(legacyPath(companyId, p));
  }
  return out;
}

// ── Caminhos RELATIVOS (sem empresa) ─────────────────────────────────────────
// São exatamente as convenções antigas. A empresa entra por `qualifyPath` na
// hora de gravar, com o company_id do token.

/** Foto de prova de quem submeteu: `{conclusão}/{item}.jpg`. */
export const evidencePath = (completionId, itemId) => `${completionId}/${itemId}.jpg`;

// A mesma sanitização de sempre — 20260731_photos_metadata_repair_2.sql a
// repete em SQL para achar estes objetos. Mudar aqui desalinha o reparo.
const safe = s => String(s).replace(/[^\w.-]+/g, '_');

/** Foto da rodada colaborativa: `rodada/{checklist}/{loja}/{dia}/{item}.jpg`. */
export const roundPath = ({ templateId, unitId, date, itemId }) =>
  `rodada/${safe(templateId)}/${safe(unitId)}/${safe(date)}/${safe(itemId)}.jpg`;

/** Documento de referência (POP): `refdocs/{ts}-{aleatório}/{nome}`. */
export function refDocPath(fileName, { now = Date.now(), rand = Math.random().toString(36).slice(2, 8) } = {}) {
  const safeName = String(fileName || 'documento').replace(/[^\w.\-]+/g, '_').slice(-80);
  return `refdocs/${now}-${rand}/${safeName}`;
}
