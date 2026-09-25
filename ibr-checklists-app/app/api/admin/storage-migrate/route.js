import { adminGuard, jsonNoStore } from '../../../../lib/adminApi';
import { PHOTOS_BUCKET, qualifyPath } from '../../../../lib/photoPaths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Migração dos objetos ANTIGOS do bucket `checklist-photos` (caminho sem
// empresa) para a pasta da empresa dona: `{nome}` → `{company_id}/{nome}`.
// O dono de cada objeto está em `public.checklist_photos_legado`, preenchida
// pela 20260924_storage_01_checklist_photos_tenant.sql — ver o cabeçalho dela
// para as fases e a ordem.
//
// Não dá para fazer em SQL: renomear `storage.objects.name` não move o arquivo
// no armazenamento por baixo, e o Supabase bloqueia DELETE direto na tabela.
// Tem de ser pela API do Storage, com a service_role — por isso a rota vive
// atrás do cookie do ZCheck Core (middleware + adminGuard), como as outras
// /api/admin/*.
//
// Como usar, logado em zcheckapp.com/admin, pelo console do navegador:
//
//   const r = (acao, extra = {}) => fetch('/api/admin/storage-migrate', {
//     method: 'POST', headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ acao, ...extra }) }).then(x => x.json());
//   await fetch('/api/admin/storage-migrate').then(x => x.json());  // situação
//   await r('inventariar');                  // pega o que subiu desde a última vez
//   await r('copiar', { dry: true });        // mostra o lote, não copia
//   await r('copiar');                       // copia 100 e reescreve photos/live_tasks
//   await r('apagar', { confirmar: 'APAGAR-LEGADO' });  // só depois da 03
//
// Tudo é repetível: `copiar` retoma de onde parou, e destino que já existe
// conta como copiado (o app novo pode ter regravado a mesma foto).

const LOTE_PADRAO = 100;
const LOTE_MAX = 500;

export async function GET(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  const { data, error: qErr } = await db.from('checklist_photos_legado')
    .select('status, company_id, copiado_em, apagado_em, erro');
  if (qErr) return falha('query_failed', qErr);

  const porStatus = {};
  const porEmpresa = {};
  let comErro = 0;
  for (const r of data) {
    const s = porStatus[r.status] ||= { total: 0, copiados: 0, apagados: 0 };
    s.total++;
    if (r.copiado_em) s.copiados++;
    if (r.apagado_em) s.apagados++;
    if (r.erro) comErro++;
    if (r.status === 'dono') {
      const e = porEmpresa[r.company_id] ||= { total: 0, pendentes: 0 };
      e.total++;
      if (!r.copiado_em && !r.apagado_em) e.pendentes++;
    }
  }
  return jsonNoStore({ ok: true, porStatus, porEmpresa, comErro });
}

export async function POST(request) {
  const { db, error } = adminGuard(request);
  if (error) return error;

  // JSON obrigatório: um formulário de outro site não consegue mandar este
  // content-type sem preflight. O cookie já é SameSite=Lax; isto é a segunda trava.
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    return jsonNoStore({ ok: false, reason: 'bad_request', message: 'content-type application/json' }, 400);
  }
  let body;
  try { body = await request.json(); } catch { return jsonNoStore({ ok: false, reason: 'bad_request' }, 400); }
  const limite = Math.min(Math.max(parseInt(body?.limite, 10) || LOTE_PADRAO, 1), LOTE_MAX);

  if (body?.acao === 'inventariar') {
    const { data, error: e } = await db.rpc('checklist_photos_inventariar_legado');
    if (e) return falha('rpc_failed', e);
    return jsonNoStore({ ok: true, inventario: data });
  }
  if (body?.acao === 'copiar') return copiar(db, { limite, dry: body.dry === true });
  if (body?.acao === 'apagar') {
    if (body.confirmar !== 'APAGAR-LEGADO') {
      return jsonNoStore({ ok: false, reason: 'confirmacao', message: "mande confirmar: 'APAGAR-LEGADO'" }, 400);
    }
    return apagar(db, { limite });
  }
  return jsonNoStore({ ok: false, reason: 'bad_request', message: 'acao: inventariar | copiar | apagar' }, 400);
}

async function copiar(db, { limite, dry }) {
  const { data: lote, error } = await db.from('checklist_photos_legado')
    .select('name, company_id')
    .eq('status', 'dono').is('copiado_em', null).is('apagado_em', null)
    .order('name').limit(limite);
  if (error) return falha('query_failed', error);

  const plano = lote.map(r => ({ de: r.name, para: qualifyPath(r.company_id, r.name) }));
  if (dry) return jsonNoStore({ ok: true, dry: true, lote: plano, pendentes: await pendentes(db) });

  const res = { copiados: 0, jaExistiam: 0, sumiram: 0, erros: [] };
  for (const { de, para } of plano) {
    const { error: e } = await db.storage.from(PHOTOS_BUCKET).copy(de, para);
    const agora = new Date().toISOString();
    if (!e) {
      res.copiados++;
      await marcar(db, de, { copiado_em: agora, erro: null });
    } else if (jaExiste(e)) {
      res.jaExistiam++;
      await marcar(db, de, { copiado_em: agora, erro: null });
    } else if (naoExiste(e)) {
      // O `cleanup-photos` apagou pela retenção de 90 dias entre o inventário
      // e a cópia. Nada a copiar; sai da fila.
      res.sumiram++;
      await marcar(db, de, { apagado_em: agora, erro: 'origem não existe mais' });
    } else {
      res.erros.push({ de, erro: e.message });
      await marcar(db, de, { erro: e.message });
    }
  }

  // No mesmo passo, e não depois: se o `cleanup-photos` apagar a linha de
  // `photos` entre a cópia e a reescrita, a cópia fica órfã fora da retenção.
  const { data: reescritas, error: rErr } = await db.rpc('checklist_photos_reescrever_referencias');
  if (rErr) return falha('rpc_failed', rErr, { ...res });

  return jsonNoStore({ ok: true, ...res, reescritas, pendentes: await pendentes(db) });
}

async function apagar(db, { limite }) {
  const { data: lote, error } = await db.from('checklist_photos_legado')
    .select('name, company_id')
    .eq('status', 'dono').not('copiado_em', 'is', null).is('apagado_em', null)
    .order('name').limit(limite);
  if (error) return falha('query_failed', error);

  const res = { apagados: 0, semCopia: [] };
  const confirmados = [];
  // Apagar é irreversível: só sai o antigo cuja cópia EXISTE agora, conferida
  // objeto a objeto — não basta a marca `copiado_em`.
  // `exists` LANÇA em erro que não seja 400/404 (rede, 5xx): na dúvida, não apaga.
  for (const r of lote) {
    let ha = false;
    try { ({ data: ha } = await db.storage.from(PHOTOS_BUCKET).exists(qualifyPath(r.company_id, r.name))); }
    catch (e) { console.warn('storage-migrate: exists falhou', r.name, e?.message); }
    if (ha === true) confirmados.push(r.name);
    else res.semCopia.push(r.name);
  }
  for (let i = 0; i < confirmados.length; i += 100) {
    const parte = confirmados.slice(i, i + 100);
    const { error: e } = await db.storage.from(PHOTOS_BUCKET).remove(parte);
    if (e) return falha('remove_failed', e, res);
    await db.from('checklist_photos_legado')
      .update({ apagado_em: new Date().toISOString() }).in('name', parte);
    res.apagados += parte.length;
  }
  if (res.semCopia.length) {
    // Marca copiado_em de volta para nulo: a próxima `copiar` refaz a cópia.
    await db.from('checklist_photos_legado').update({ copiado_em: null }).in('name', res.semCopia);
  }
  return jsonNoStore({ ok: true, ...res });
}

// ── helpers ──────────────────────────────────────────────────────────────────

const status = e => String(e?.statusCode ?? e?.status ?? '');
const jaExiste = e => status(e) === '409' || /already exists|duplicate/i.test(e?.message || '');
const naoExiste = e => status(e) === '404' || /not found/i.test(e?.message || '');

async function marcar(db, name, patch) {
  const { error } = await db.from('checklist_photos_legado').update(patch).eq('name', name);
  if (error) console.error('storage-migrate: marcar falhou', name, error.message);
}

async function pendentes(db) {
  const { count } = await db.from('checklist_photos_legado')
    .select('name', { count: 'exact', head: true })
    .eq('status', 'dono').is('copiado_em', null).is('apagado_em', null);
  return count ?? null;
}

function falha(reason, e, extra = {}) {
  console.error(`storage-migrate: ${reason}:`, e?.message);
  return jsonNoStore({ ok: false, reason, message: e?.message, ...extra }, 502);
}
