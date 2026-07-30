'use client';

/**
 * Zchek — Sync Layer
 *
 * Strategy:
 * 1. All reads: try Supabase first, fall back to IndexedDB cache if offline.
 * 2. All writes: write to IndexedDB immediately (optimistic), then sync to Supabase.
 *    If offline, queue the write and drain the queue when connectivity returns.
 */

import { supabase, authedSupabase, getSessionToken } from './supabase';
import { storageGet, storageSet, getSyncQueue, clearSyncQueue } from './storage';
import { daysAgoStr } from './dates';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Toda leitura/escrita de tabela passa por aqui. Antes do login não há token e
// authedSupabase() devolve o cliente anônimo; depois, o token viaja no header e
// o RLS escopa as linhas por company_id.
//
// `supabase` (anônimo) segue em uso de propósito para storage e para os canais
// de realtime — ver setSessionToken(), que reautoriza o socket no login.
const db = () => authedSupabase();

// Escopo do cache local. As chaves eram globais ('ibr_templates', 'ibr_users',
// 'ibr_public_users'…), herança do app single-tenant: abrir o IBR e depois outra
// empresa no mesmo navegador podia servir dados do IBR pelo fallback offline —
// inclusive os NOMES da tela de login de outra empresa. Agora cada empresa tem o
// seu namespace. Sem escopo definido, cai no comportamento antigo.
let cacheScope = '';
export function setCacheScope(companyId) { cacheScope = companyId || ''; }
const scoped = (key) => (cacheScope ? `${cacheScope}::${key}` : key);

const cache = {
  async get(key) {
    try { const r = await storageGet(scoped(key)); return JSON.parse(r.value); } catch { return null; }
  },
  async set(key, value) {
    try { await storageSet(scoped(key), JSON.stringify(value)); } catch (e) { console.warn('cache.set failed', e); }
  },
  // SEM escopo, de propósito: a fila offline guarda escritas pendentes. Escopar
  // agora orfanaria o que estiver pendente no aparelho de quem está offline no
  // momento do deploy — perda de dado. Fica global até haver uma migração
  // explícita da fila.
  async getRaw(key) {
    try { const r = await storageGet(key); return JSON.parse(r.value); } catch { return null; }
  },
  async setRaw(key, value) {
    try { await storageSet(key, JSON.stringify(value)); } catch (e) { console.warn('cache.setRaw failed', e); }
  },
};

function isOnline() {
  if (typeof window === 'undefined') return false; // SSR guard
  return navigator.onLine;
}

// ── Templates ─────────────────────────────────────────────────────────────────

export async function fetchTemplates(seedTemplates) {
  // Always try Supabase first — isOnline() is unreliable at mount time
  try {
    const { data, error } = await db().from('templates').select('*').order('unit_id').order('sector');
    if (error) throw error;
    if (data && data.length > 0) {
      const mapped = data.map(row => ({
        id: row.id,
        unitId: row.unit_id,
        sector: row.sector,
        shift: row.shift,
        name: row.name,
        deadline: row.deadline,
        items: row.items,
        // Checklist desativado CONTINUA vindo do banco de propósito: ele não
        // aparece na operação, mas é o que permite contar o passado com a
        // configuração que existia naquele dia. Quem lista para executar ou
        // gerenciar filtra por `active` — ver `templateAtiva` em app/app/page.js.
        // Antes da migration 20260730 as colunas não existem: `active` cai em
        // true e `deactivatedAt` em null, que é o comportamento de sempre.
        active: row.active !== false,
        deactivatedAt: row.deactivated_at ?? null,
        createdAt: row.created_at ?? null,
      }));
      await cache.set('ibr_templates', mapped);
      console.log('[Supabase] Loaded', mapped.length, 'templates');
      return mapped;
    }
  } catch (e) {
    console.warn('[Supabase] fetchTemplates failed, using cache:', e.message);
  }
  const cached = await cache.get('ibr_templates');
  return cached || seedTemplates;
}

/**
 * Desativa o checklist em vez de apagá-lo.
 *
 * `delete` reescrevia o passado: as execuções ficavam órfãs em `completions` e o
 * "previstos" de dias já fechados encolhia, porque ele é contado da lista ATUAL
 * de checklists. A linha ia embora e não havia como reconstruir a configuração
 * do dia anterior.
 *
 * `deactivated_at` é preenchido pelo trigger da migration 20260730 — não é
 * enviado aqui de propósito, para que uma escrita direta no banco também não
 * consiga deixar um checklist inativo sem data.
 *
 * LANÇA em falha. O chamador precisa poder contar a verdade: o botão de excluir
 * engolia o erro num `catch` vazio e a linha voltava no próximo carregamento.
 */
export async function deactivateTemplate(id) {
  const { data, error } = await db()
    .from('templates')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id');
  if (error) {
    // Sem a migration, `active` não existe. Cai no comportamento antigo para o
    // app não travar no intervalo entre o deploy e a migration — com aviso, que
    // aqui a diferença é perda de dado.
    if (error.code === '42703' || /active/.test(error.message || '')) {
      console.warn('[sync] templates.active ausente — rode 20260730_templates_desativar.sql. Apagando (comportamento antigo).');
      const { error: delErr } = await db().from('templates').delete().eq('id', id);
      if (delErr) throw delErr;
      return { legacy: true };
    }
    throw error;
  }
  if (!data || data.length === 0) throw new Error('o checklist não foi desativado no banco');
  return { legacy: false };
}

export async function saveTemplates(templates, changedIds = null) {
  await cache.set('ibr_templates', templates);
  try {
    const toSave = changedIds
      ? templates.filter(t => changedIds.includes(t.id))
      : templates;
    // changedIds apontando para id que não está na lista = a edição se perdeu
    // antes de chegar aqui. Sair calado fazia a tela dizer "salvo com sucesso"
    // sem nada ter sido gravado — era indistinguível de um save real.
    if (changedIds?.length && toSave.length === 0) {
      throw new Error('o checklist editado não está mais na lista carregada — recarregue a página e tente de novo');
    }
    if (toSave.length === 0) return;

    // Upsert one by one to guarantee postgres_changes fires for each row
    const falhas = [];
    for (const t of toSave) {
      const { error } = await db().from('templates').upsert({
        id: t.id, unit_id: t.unitId, sector: t.sector,
        shift: t.shift, name: t.name, deadline: t.deadline, items: t.items,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) { console.error('saveTemplates: upsert error', t.name, error); falhas.push(`${t.name}: ${error.message}`); }
    }
    console.log(`[Sync] Saved ${toSave.length - falhas.length}/${toSave.length} template(s) to Supabase`);
    // Antes o erro do banco morria num console.error e a tela dizia "Checklist
    // criado!" do mesmo jeito. Quem salva precisa poder contar a verdade.
    if (falhas.length) throw new Error(falhas.join(' | '));

    // Confere no banco o que acabou de ser gravado. Um upsert pode responder
    // "ok" e a linha não refletir o esperado (RLS que filtra o retorno, id que
    // não bate, escrita concorrente). Sem esta leitura, a tela dava "salvo" e o
    // item sumia no próximo carregamento, sem nenhum sinal.
    if (changedIds?.length) {
      const { data: gravados } = await db().from('templates')
        .select('id, items').in('id', toSave.map(t => t.id));
      const porId = new Map((gravados || []).map(r => [r.id, r]));
      const divergentes = toSave.filter(t => {
        const row = porId.get(t.id);
        return !row || (row.items || []).length !== (t.items || []).length;
      });
      if (divergentes.length) {
        throw new Error(`o servidor não confirmou a gravação de ${divergentes.map(t => `"${t.name}"`).join(', ')} — recarregue e tente de novo`);
      }
    }
  } catch (e) {
    console.warn('saveTemplates: Supabase error', e);
    throw e;
  }
}

// ── Users ─────────────────────────────────────────────────────────────────────

const USERS_COLS = 'id, name, role, unit_id, sector_id, suspended';

export async function fetchUsers(seedUsers) {
  // Always try Supabase first — returns users WITHOUT pin (security)
  try {
    // `avatar_url` nasceu em 20260726_user_avatars.sql. Se o cliente subir
    // ANTES da migration, o select inteiro devolve 42703 e a lista de usuários
    // cai no cache — num aparelho novo, cai em nada. Então: tenta com a coluna,
    // e se ela não existir refaz sem. Dá para remover esta segunda tentativa
    // quando a migration estiver aplicada em todos os projetos.
    let { data, error } = await db()
      .from('users')
      .select(`${USERS_COLS}, avatar_url`)
      .order('name');
    if (error && (error.code === '42703' || /avatar_url/.test(error.message || ''))) {
      console.warn('[Supabase] users.avatar_url ausente — rode 20260726_user_avatars.sql');
      ({ data, error } = await db().from('users').select(USERS_COLS).order('name'));
    }
    if (error) throw error;
    if (data && data.length > 0) {
      const mapped = data.map(row => ({
        id: row.id, name: row.name, role: row.role,
        unitId: row.unit_id, sectorId: row.sector_id ?? null,
        suspended: row.suspended ?? false,
        avatarUrl: row.avatar_url ?? null,
      }));
      await cache.set('ibr_users', mapped);
      return mapped;
    }
  } catch (e) {
    console.warn('[Supabase] fetchUsers failed, using cache:', e.message);
  }
  const cached = await cache.get('ibr_users');
  return (cached || seedUsers).map(({ pin: _pin, ...u }) => u);
}

// NUNCA usar .upsert() nesta tabela. O `authenticated` tem SELECT só de COLUNA
// em `users` — é assim que o `pin` fica escondido de quem tem a anon key (ver
// 20260709_secure_pin_validation.sql, que revoga o SELECT de tabela e reconcede
// coluna a coluna). E o `INSERT ... ON CONFLICT DO UPDATE` que o .upsert() gera
// exige SELECT da TABELA INTEIRA: todo upsert aqui volta 42501 "permission
// denied for table users". Verificado em produção em 30/07/2026 com um token de
// sessão real — upsert 403, INSERT puro 201, UPDATE 204, DELETE 204.
//
// Como nenhum retorno era conferido (o supabase-js NÃO lança: devolve
// `{ data, error }`, e o try/catch em volta era decorativo), a gestão criava um
// colaborador, via o nome na tela, e a linha nunca existia. Nenhum dos 10
// usuários de produção nasceu por esta função — todos vieram da RPC de
// aprovação. Daí: INSERT para quem é novo, UPDATE para quem já existe, e erro
// que sobe para a tela.
//
// Opções:
//   · changedIds — mesmo contrato de saveTemplates: grava só o que mudou.
//     `[]` significa "só estado local e cache, não escreve nada no banco".
//     Ausente/null grava a lista inteira.
//   · deleteIds  — quem apagar, NOMEADO. Antes a exclusão era o diff entre a
//     lista recebida e o banco: quem não estivesse na lista morria. Uma lista
//     parcial (o fallback offline do cache devolve o que tiver, e antes do
//     login `users` é só a lista de nomes do /entrar) apagava gente viva sem
//     ninguém ter pedido. Aconteceu de verdade em 30/07/2026, num script de
//     teste com a lista errada: 5 usuários de uma empresa foram apagados de uma
//     vez. Exclusão agora só acontece com o id na mão.
export async function saveUsers(users, { changedIds = null, deleteIds = null } = {}) {
  // Cache SEM os PINs: ele é só o fallback de leitura offline (fetchUsers já
  // descarta `pin` ao ler), e não há por que deixar segredo em repouso no
  // IndexedDB do aparelho.
  await cache.set('ibr_users', users.map(({ pin: _pin, ...u }) => u));
  try {
    const baseRow = u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      unit_id: u.unitId ?? null,
      sector_id: u.sectorId ?? null,
      suspended: u.suspended ?? false,
      updated_at: new Date().toISOString(),
    });

    // Quem já está no banco decide INSERT vs UPDATE. Ler só `id` não é
    // sensível, e o RLS já escopa por empresa.
    const { data: existing, error: readErr } = await db().from('users').select('id');
    if (readErr) throw readErr;
    const existingIds = new Set((existing || []).map(u => u.id));

    const toSave = changedIds ? users.filter(u => changedIds.includes(u.id)) : users;
    // changedIds apontando para id fora da lista = a edição se perdeu no
    // caminho. Sair calado faria a tela dizer "salvo" sem nada gravado.
    if (changedIds?.length && toSave.length === 0) {
      throw new Error('o usuário editado não está mais na lista carregada — recarregue a página e tente de novo');
    }

    const falhas = [];
    for (const u of toSave) {
      if (existingIds.has(u.id)) {
        // `pin` só entra quando um PIN novo foi digitado. Sem ele o PIN gravado
        // fica intacto — o cliente nunca chega a LER o PIN de ninguém para
        // poder reenviá-lo.
        const patch = baseRow(u);
        if (u.pin) patch.pin = u.pin;
        const { error } = await db().from('users').update(patch).eq('id', u.id);
        if (error) { console.error('saveUsers: update', u.name, error); falhas.push(`${u.name}: ${error.message}`); }
      } else {
        // `users.pin` é NOT NULL e não tem default: usuário novo sem PIN é
        // recusado pelo banco com 23502. Os formulários já exigem 4 dígitos.
        if (!u.pin) { falhas.push(`${u.name}: usuário novo precisa de um PIN de 4 dígitos`); continue; }
        const { error } = await db().from('users').insert({ ...baseRow(u), pin: u.pin });
        if (error) { console.error('saveUsers: insert', u.name, error); falhas.push(`${u.name}: ${error.message}`); }
      }
    }
    if (falhas.length) throw new Error(falhas.join(' | '));

    // Exclusão: só os ids pedidos, e só os que existem. Nunca um diff.
    const toDelete = (deleteIds || []).filter(id => existingIds.has(id));
    if (toDelete.length > 0) {
      // Sem .select() de propósito: pedir a representação de volta exige SELECT
      // de TODAS as colunas (inclusive `pin`) e o DELETE volta 42501.
      const { error } = await db().from('users').delete().in('id', toDelete);
      if (error) throw error;
      const { data: sobrou } = await db().from('users').select('id').in('id', toDelete);
      if (sobrou?.length) {
        throw new Error(`o servidor não confirmou a remoção de ${sobrou.length} usuário(s) — recarregue e tente de novo`);
      }
    }

    // Confere no banco o que acabou de ser gravado — mesma razão de
    // saveTemplates: um "ok" do PostgREST não garante linha visível.
    if (toSave.length > 0) {
      const { data: gravados } = await db().from('users')
        .select('id').in('id', toSave.map(u => u.id));
      const ok = new Set((gravados || []).map(r => r.id));
      const faltando = toSave.filter(u => !ok.has(u.id));
      if (faltando.length) {
        throw new Error(`o servidor não confirmou a gravação de ${faltando.map(u => `"${u.name}"`).join(', ')} — recarregue e tente de novo`);
      }
    }
  } catch (e) {
    console.warn('saveUsers: Supabase error', e);
    throw e;
  }
}

// ── Completions ───────────────────────────────────────────────────────────────

export async function fetchCompletions() {
  // Always try Supabase first — isOnline() is unreliable at mount time
  try {
    const { data, error } = await db()
      .from('completions')
      .select('*')
      .gte('date', daysAgoStr(90))
      .order('completed_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    if (data) {
      const mapped = data.map(row => ({
        id: row.id,
        templateId: row.template_id,
        templateName: row.template_name,
        unitId: row.unit_id,
        sector: row.sector,
        shift: row.shift,
        date: row.date,
        completedAt: row.completed_at,
        operatorName: row.operator_name,
        operatorUserId: row.operator_user_id,
        items: row.items,
        // Conferência pela liderança (20260726_conferencia_lideranca.sql). O
        // select é `*`, então antes da migration estes campos chegam undefined
        // e viram null aqui — nenhum caminho novo precisa de fallback.
        reviewedBy: row.reviewed_by ?? null,
        reviewedByName: row.reviewed_by_name ?? null,
        reviewedAt: row.reviewed_at ?? null,
        reviewNote: row.review_note ?? null,
      }));
      await cache.set('ibr_completions', mapped);
      console.log('[Supabase] Loaded', mapped.length, 'completions');
      return mapped;
    }
  } catch (e) {
    console.warn('[Supabase] fetchCompletions failed, using cache:', e.message);
  }
  return (await cache.get('ibr_completions')) || [];
}

export async function saveCompletion(record) {
  // 1. Update local cache immediately (optimistic)
  const cached = (await cache.get('ibr_completions')) || [];
  const next = [...cached, record].slice(-500);
  await cache.set('ibr_completions', next);

  // 2. Push to Supabase
  if (!isOnline()) {
    console.log('[Sync] offline — queuing completion:', record.id);
    await queueOfflineCompletion(record);
    return;
  }
  console.log('[Sync] pushing completion to Supabase:', record.id);
  try {
    await pushCompletion(record);
  } catch (e) {
    console.error('[Supabase] pushCompletion FAILED:', e.message);
    await queueOfflineCompletion(record);
  }
}

// Lança em falha. Quem chama decide o que fazer: `saveCompletion` enfileira,
// `drainOfflineQueue` mantém a entrada na fila. Se esta função engolisse o erro,
// o dreno contaria sucesso e sobrescreveria a fila — perdendo a conclusão.
async function pushCompletion(record) {
  const row = {
    id: record.id,
    template_id: record.templateId || null,
    template_name: record.templateName,
    unit_id: record.unitId,
    sector: record.sector,
    shift: record.shift,
    date: record.date,
    completed_at: record.completedAt,
    operator_name: record.operatorName,
    operator_user_id: record.operatorUserId || null,
    // `review` é anexado aos itens em memória a partir de `task_reviews`, só
    // para a UI. Reenviá-lo gravaria uma cópia do veredito dentro do JSONB —
    // cópia que envelhece na primeira reconferência e passa a contradizer a
    // tabela. A fonte é a tabela; aqui vai só o que a execução produziu.
    items: (record.items || []).map(({ review: _review, ...i }) => i),
  };
  const { error } = await db().from('completions').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

// ── Conferência da liderança ─────────────────────────────────────────────────
//
// Sempre pela RPC: ela lê o revisor do TOKEN, então ninguém assina conferência
// com o nome de outro, e recusa quem não for liderança/gerência/diretoria. Um
// update direto na tabela seria aceito pelo RLS (que escopa por empresa, não
// por papel) e a nota da liderança viraria autodeclaração.
//
// Sem fila offline, ao contrário da execução: conferir é um ato de revisão, não
// de operação — quem confere está sentado com o relatório aberto, e uma fila
// silenciosa faria a liderança achar que conferiu algo que nunca chegou.
export async function reviewCompletion(completionId, { items = [], note = null, reviewed = true } = {}) {
  // `review_tasks` grava o veredito por tarefa E a marca no checklist inteiro,
  // numa transação só. Uma conferência gravada pela metade contaria como
  // conferida no índice da liderança sem ter o detalhe que o briefing usa.
  const { error } = await db().rpc('review_tasks', {
    p_completion_id: completionId,
    p_items: items,
    p_note: note,
    p_reviewed: reviewed,
  });
  if (error) throw error;

  // Espelha no cache para a lista não voltar ao estado antigo num reload
  // offline — o mesmo cuidado que saveUserAvatar já toma.
  try {
    const cached = await cache.get('ibr_completions');
    if (Array.isArray(cached)) {
      await cache.set('ibr_completions', cached.map(c => (c.id === completionId ? { ...c, reviewedAt: reviewed ? new Date().toISOString() : null } : c)));
    }
  } catch (_) {}
}

/**
 * Vereditos por tarefa dos últimos 90 dias — a mesma janela de
 * `fetchCompletions`, porque é a ela que eles se juntam.
 *
 * Falha em silêncio devolvendo o cache: sem os vereditos o app continua
 * inteiro (as tarefas voltam a valer como marcadas e o briefing não aparece),
 * e derrubar a carga inicial por causa disso seria pior que a degradação.
 */
export async function fetchTaskReviews() {
  try {
    const { data, error } = await db()
      .from('task_reviews')
      .select('completion_id, item_id, verdict, note, reviewed_by_name, reviewed_at, operator_user_id, date')
      .gte('date', daysAgoStr(90));
    if (error) throw error;
    const mapped = (data || []).map(r => ({
      completionId: r.completion_id,
      itemId: r.item_id,
      verdict: r.verdict,
      note: r.note ?? null,
      reviewedByName: r.reviewed_by_name ?? null,
      reviewedAt: r.reviewed_at,
      operatorUserId: r.operator_user_id ?? null,
      date: r.date,
    }));
    await cache.set('ibr_task_reviews', mapped);
    return mapped;
  } catch (e) {
    console.warn('[Supabase] fetchTaskReviews falhou, usando cache:', e.message);
    return (await cache.get('ibr_task_reviews')) || [];
  }
}

// ── Photos ────────────────────────────────────────────────────────────────────
//
// Fotos de REFERÊNCIA (orientação do item) vivem como base64 direto no template
// — ver o editor em GerenciarView. Não há upload para storage: base64 persiste
// e nunca expira. (Havia um `uploadRefPhoto` que gravava no bucket privado
// `checklist-photos` e devolvia getPublicUrl — URL que nunca resolvia. Removido:
// era código morto que só produziria imagem quebrada se alguém o religasse.)

export async function uploadPhoto(completionId, itemId, dataUrl) {
  // Persiste ANTES de tentar subir. "Salvei e fechei o app" matou um upload no
  // meio e a evidência ficou irrecuperável (piloto, 12/07): o caminho online
  // não guardava o dataURL local. Agora a foto sempre entra no cache + fila;
  // o sucesso remove da fila, e a próxima abertura logada retoma o que faltou.
  try {
    await storageSet(`ibr_photo_${completionId}_${itemId}`, dataUrl);
    await queueOfflinePhoto({ completionId, itemId });
  } catch (e) { console.warn('uploadPhoto persist failed', e); }

  if (!isOnline()) return null;
  try {
    const path = await pushPhoto(completionId, itemId, dataUrl);
    await removeQueuedPhoto(completionId, itemId);
    return path;
  } catch (e) {
    console.warn('pushPhoto adiado para a fila:', e.message);
    return null;
  }
}

// Lança em falha, pelo mesmo motivo de pushCompletion: o dreno precisa saber.
async function pushPhoto(completionId, itemId, dataUrl) {
  // Convert data URL to blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const path = `${completionId}/${itemId}.jpg`;
  const { error } = await supabase.storage
    .from('checklist-photos')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;

  // Metadado: é ele que o PhotoModal consulta. Falhou, LANÇA — o chamador
  // enfileira e a fila retenta (o upload acima é upsert, retentar é barato).
  // Engolir este erro foi o que deixou `photos` vazia por semanas: o upsert
  // referenciava uma constraint única que não existia no banco (criada em
  // 20260712_photos_metadata_repair.sql) e cada gravação falhava em silêncio.
  const { error: upsertErr } = await db().from('photos').upsert({
    completion_id: completionId,
    item_id: itemId,
    storage_path: path,
  }, { onConflict: 'completion_id,item_id', ignoreDuplicates: true });
  if (upsertErr) throw upsertErr;

  return path;
}

// ── Foto da RODADA (execução colaborativa) ───────────────────────────────────
//
// A foto de prova sempre morou em `{completionId}/{itemId}.jpg` — caminho que só
// existe depois que alguém submete. Numa execução a quatro mãos isso perdia
// evidência: quem tirou a foto podia não ser quem submeteu, e a foto ficava no
// aparelho dele até nunca.
//
// A foto da rodada sobe na hora em que é anexada, num caminho previsível
// (checklist × loja × dia × item). No submit, quem fecha o checklist LIGA essa
// foto à sua conclusão — sem copiar bytes, só apontando o metadado.
export async function uploadRoundPhoto({ templateId, unitId, date, itemId, dataUrl }) {
  if (!isOnline()) return null;
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const safe = s => String(s).replace(/[^\w.-]+/g, '_');
    const path = `rodada/${safe(templateId)}/${safe(unitId)}/${safe(date)}/${safe(itemId)}.jpg`;
    const { error } = await supabase.storage
      .from('checklist-photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    return path;
  } catch (e) {
    // Sem drama: quem tem a foto localmente ainda a sobe no próprio submit.
    console.warn('uploadRoundPhoto falhou (evidência segue local):', e.message);
    return null;
  }
}

// Liga uma foto já no storage (a da rodada) a esta conclusão. `ignoreDuplicates`
// porque quem submete pode ter a própria foto do mesmo item — a dele vence, esta
// só preenche o que faltava.
export async function linkRoundPhoto(completionId, itemId, storagePath) {
  try {
    const { error } = await db().from('photos').upsert({
      completion_id: completionId, item_id: itemId, storage_path: storagePath,
    }, { onConflict: 'completion_id,item_id', ignoreDuplicates: true });
    if (error) throw error;
    return true;
  } catch (e) { console.warn('linkRoundPhoto falhou', e); return false; }
}

export async function getPhotoUrl(completionId, itemId) {
  // Try Supabase first
  if (isOnline()) {
    try {
      // maybeSingle: sem foto no banco, retorna null em vez de lançar — assim
      // um item sem linha em `photos` cai no cache local em silêncio.
      const { data } = await db().from('photos')
        .select('storage_path')
        .eq('completion_id', completionId)
        .eq('item_id', itemId)
        .maybeSingle();
      if (data?.storage_path) {
        const { data: signed } = await supabase.storage
          .from('checklist-photos')
          .createSignedUrl(data.storage_path, 300); // 5 min expiry
        if (signed?.signedUrl) return signed.signedUrl;
      }
    } catch (e) { /* fall through to local cache */ }
  }
  // Offline fallback — return locally cached data URL
  try {
    const r = await storageGet(`ibr_photo_${completionId}_${itemId}`);
    return r?.value ?? null;
  } catch { return null; }
}

// ── Documentos de referência (POP etc.) ──────────────────────────────────────
//
// Diferente das fotos de referência (base64 no template), documentos podem ter
// alguns MB — vivem no bucket `checklist-photos` sob `refdocs/` e o template
// guarda só { name, path }. A leitura usa signed URL, como as fotos de prova.

export async function uploadRefDoc(file) {
  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `refdocs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}/${safeName}`;
  const { error } = await supabase.storage
    .from('checklist-photos')
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  return { name: file.name, path };
}

export async function getRefDocUrl(path) {
  const { data, error } = await supabase.storage
    .from('checklist-photos')
    .createSignedUrl(path, 3600); // 1h — abre e pode ser lido com calma
  if (error) throw error;
  return data?.signedUrl || null;
}

// ── Closures ──────────────────────────────────────────────────────────────────

export async function fetchClosures() {
  // Always try Supabase first
  try {
    const { data, error } = await db().from('closures').select('*');
    if (error) throw error;
    if (data) {
      const mapped = data.map(row => ({ unitId: row.unit_id, date: row.date }));
      await cache.set('ibr_closures', mapped);
      return mapped;
    }
  } catch (e) {
    console.warn('[Supabase] fetchClosures failed, using cache:', e.message);
  }
  return (await cache.get('ibr_closures')) || [];
}

export async function saveClosures(closures) {
  await cache.set('ibr_closures', closures);
  // Try Supabase even if isOnline() is uncertain
  try {
    // Full replace: delete all and re-insert
    await db().from('closures').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (closures.length > 0) {
      const rows = closures.map(c => ({ unit_id: c.unitId, date: c.date }));
      await db().from('closures').insert(rows);
    }
  } catch (e) { console.warn('saveClosures: Supabase error', e); }
}

// ── Offline queue ─────────────────────────────────────────────────────────────

async function queueOfflineCompletion(record) {
  try {
    const q = (await cache.getRaw('ibr_offline_queue')) || [];
    q.push({ type: 'completion', record, ts: Date.now() });
    await cache.setRaw('ibr_offline_queue', q);
  } catch (e) { console.warn('queueOfflineCompletion failed', e); }
}

async function queueOfflinePhoto({ completionId, itemId }) {
  try {
    const q = (await cache.getRaw('ibr_offline_queue')) || [];
    // Dedupe: reenfileirar a mesma foto não pode multiplicar o trabalho do dreno.
    if (!q.some(e => e.type === 'photo' && e.completionId === completionId && e.itemId === itemId)) {
      q.push({ type: 'photo', completionId, itemId, ts: Date.now() });
      await cache.setRaw('ibr_offline_queue', q);
    }
  } catch (e) { console.warn('queueOfflinePhoto failed', e); }
}

async function removeQueuedPhoto(completionId, itemId) {
  try {
    const q = (await cache.getRaw('ibr_offline_queue')) || [];
    await cache.setRaw('ibr_offline_queue',
      q.filter(e => !(e.type === 'photo' && e.completionId === completionId && e.itemId === itemId)));
  } catch (e) { console.warn('removeQueuedPhoto failed', e); }
}

export async function drainOfflineQueue() {
  console.log('[Sync] drainOfflineQueue called, online:', isOnline());
  if (!isOnline()) return { drained: 0, failed: 0 };
  // Sem sessão, a escrita é recusada pelo RLS. O poll de rede roda já na tela de
  // login, então drenar aqui só queimaria tentativas contra a fila do usuário.
  if (!getSessionToken()) return { drained: 0, failed: 0 };
  try {
    const q = (await cache.getRaw('ibr_offline_queue')) || [];
    if (q.length === 0) return { drained: 0, failed: 0 };

    let drained = 0, failed = 0;
    const remaining = [];

    for (const entry of q) {
      try {
        if (entry.type === 'completion') {
          await pushCompletion(entry.record);
          drained++;
        } else if (entry.type === 'photo') {
          const r = await storageGet(`ibr_photo_${entry.completionId}_${entry.itemId}`);
          if (r?.value) {
            await pushPhoto(entry.completionId, entry.itemId, r.value);
            drained++;
          }
        } else if (entry.type === 'live_task') {
          // Marcação de tarefa feita offline (execução colaborativa). Import
          // dinâmico para a camada de sync não puxar a de colaboração em toda
          // tela que só lê dados. Perder a disputa para um colega TAMBÉM sai da
          // fila: não há o que reenviar, o banco já tem dono para a tarefa.
          const { drainLiveTask } = await import('./collab');
          if (await drainLiveTask(entry)) drained++;
          else throw new Error('live_task não confirmada');
        }
      } catch {
        failed++;
        remaining.push(entry);
      }
    }

    await cache.setRaw('ibr_offline_queue', remaining);
    return { drained, failed };
  } catch (e) {
    console.warn('drainOfflineQueue failed', e);
    return { drained: 0, failed: 0 };
  }
}

export async function getOfflineQueueLength() {
  const q = (await cache.getRaw('ibr_offline_queue')) || [];
  return q.length;
}

// ── Seed to Supabase (first run) ──────────────────────────────────────────────

export async function seedSupabaseIfEmpty(seedTemplates, seedUsers) {
  if (!isOnline()) return;
  try {
    const { count: templateCount } = await db()
      .from('templates').select('*', { count: 'exact', head: true });
    console.log('[Supabase] Template count:', templateCount);
    if (templateCount === 0) {
      console.log('[Supabase] Seeding templates...');
      await saveTemplates(seedTemplates);
    }
    const { count: userCount } = await db()
      .from('users').select('id', { count: 'exact', head: true });
    console.log('[Supabase] User count:', userCount);
    if (userCount === 0) {
      console.log('[Supabase] Seeding users...');
      await saveUsers(seedUsers);
    }
  } catch (e) {
    console.warn('seedSupabaseIfEmpty failed', e);
  }
}

// ── Real-time subscription ────────────────────────────────────────────────────

let realtimeChannel = null;
let templatesChannel = null;

export function subscribeToTemplates(onUpdate) {
  if (typeof window === 'undefined') return () => {};
  if (templatesChannel) {
    supabase.removeChannel(templatesChannel);
    templatesChannel = null;
  }
  templatesChannel = supabase
    .channel('templates-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'templates' }, async () => {
      // Re-fetch all templates when any change is detected
      try {
        const { data } = await db().from('templates').select('*').order('name');
        if (data) {
          const mapped = data.map(row => ({
            id: row.id, unitId: row.unit_id, sector: row.sector,
            shift: row.shift, name: row.name, deadline: row.deadline, items: row.items || [],
          }));
          await cache.set('ibr_templates', mapped);
          onUpdate(mapped);
        }
      } catch(e) { console.warn('templates realtime refetch failed', e); }
    })
    .subscribe();
  return () => {
    if (templatesChannel) {
      supabase.removeChannel(templatesChannel);
      templatesChannel = null;
    }
  };
}

export function subscribeToCompletions(unitId, onNew) {
  if (typeof window === 'undefined') return () => {};
  // Clean up any existing subscription
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = supabase
    .channel('completions-live')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'completions',
        filter: unitId ? `unit_id=eq.${unitId}` : undefined,
      },
      payload => {
        const row = payload.new;
        const record = {
          id: row.id,
          templateId: row.template_id,
          templateName: row.template_name,
          unitId: row.unit_id,
          sector: row.sector,
          shift: row.shift,
          date: row.date,
          completedAt: row.completed_at,
          operatorName: row.operator_name,
          operatorUserId: row.operator_user_id,
          items: row.items,
        };
        onNew(record);
      }
    )
    .subscribe();

  return () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
}

// ── Authentication ────────────────────────────────────────────────────────────

/**
 * Validates a PIN and opens a session.
 * Returns:
 *   { ok: false, reason: 'rate_limited' | 'wrong_pin' | 'not_found' | 'network_error' }
 *   { ok: true,  user: { id, name, role, unitId, sectorId, companyId, suspended }, token }
 *
 * A rota /api/auth/session chama o RPC `validate_pin` (SECURITY DEFINER, com
 * rate-limit e log de tentativas) e assina um token com o JWT secret do
 * Supabase. O PIN nunca esteve no bundle; o segredo do token também não.
 */
export async function validatePin(userId, pin) {
  try {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pin }),
    });
    // A rota devolve 401 quando o PIN não confere: o corpo carrega o motivo.
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, reason: 'network_error' };
    return data;
  } catch (e) {
    console.warn('validatePin error:', e);
    return { ok: false, reason: 'network_error' };
  }
}

/**
 * Lista de usuários da tela de login, de UMA empresa.
 *
 * Chamada antes do login, quando ainda não existe token — por isso vai pelo
 * cliente anônimo e por um RPC `security definer`, e não pela tabela `users`:
 * o RLS não teria como saber o tenant, e deixar `users` legível por anon
 * vazaria nome e cargo de todas as empresas. O RPC projeta só o necessário e
 * nunca o PIN.
 */
export async function fetchPublicUsers(companyId) {
  if (!companyId) return null;
  try {
    const { data, error } = await supabase.rpc('public_users', { p_company_id: companyId });
    if (error) throw error;
    if (!data) throw new Error('resposta vazia');

    const mapped = data.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      unitId: u.unit_id,
      sectorId: u.sector_id ?? null,
    }));
    await cache.set('ibr_public_users', mapped);
    return mapped;
  } catch (e) {
    // App offline-first: sem o cache, uma falha de rede deixaria o seletor de
    // nomes vazio e ninguém conseguiria entrar.
    console.warn('fetchPublicUsers falhou, usando cache:', e.message);
    return await cache.get('ibr_public_users');
  }
}

// ── Push Notifications ────────────────────────────────────────────────────────

const VAPID_PUBLIC_KEY = 'BOlxksfTKoyFP-sseUN9njw3r_FBcxcNjztkbnYefliDvaeM9Fi6v24ZdEcyX1FufdXF5tttoQKwzQ1mvnCjmGE';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
}

export async function requestPushPermission(user) {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push not supported on this browser');
    return null;
  }

  try {
    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('Push permission denied');
      return null;
    }

    // Get SW registration
    const registration = await navigator.serviceWorker.ready;

    // Subscribe
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const sub = subscription.toJSON();

    // Save to Supabase
    const { error } = await db().from('push_subscriptions').upsert({
      user_id: user.id,
      unit_id: user.unitId,
      role: user.role,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });

    if (error) throw error;
    console.log('[Push] Subscription saved for', user.name);
    return subscription;
  } catch (e) {
    console.warn('[Push] Failed to subscribe:', e);
    return null;
  }
}

/**
 * Quem da empresa tem inscrição de push ativa.
 *
 * Devolve um Map `userId → última atualização` (a mais recente entre os
 * aparelhos da pessoa), ou **null** quando não foi possível saber.
 *
 * A diferença entre `null` e Map vazio é o ponto: se a leitura falhar (RLS,
 * offline, tabela ausente) e devolvêssemos um Map vazio, a tela marcaria TODA a
 * equipe como "sem notificação" — uma acusação falsa, e o tipo de erro que faz a
 * gestão perseguir gente que está com tudo em ordem. `null` significa "não sei",
 * e a tela não mostra nada.
 */
export async function fetchPushStatus() {
  try {
    const { data, error } = await db()
      .from('push_subscriptions')
      .select('user_id, updated_at');
    if (error) throw error;
    const porUsuario = new Map();
    (data || []).forEach(r => {
      if (!r.user_id) return;   // inscrição antiga, anterior à coluna user_id
      const atual = porUsuario.get(r.user_id) || '';
      if ((r.updated_at || '') > atual) porUsuario.set(r.user_id, r.updated_at || '');
    });
    return porUsuario;
  } catch (e) {
    console.warn('fetchPushStatus falhou (a tela não vai acusar ninguém):', e.message);
    return null;
  }
}

export async function hasPushPermission() {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  return Notification.permission === 'granted';
}

// ── Recognitions (H3) ──────────────────────────────────────────────────────────

export async function sendRecognition(rec) {
  try {
    const { error } = await db().from('recognitions').insert({
      // Omitir a coluna quando não sabemos a empresa: o DEFAULT no banco extrai
      // company_id do token. Mandar NULL explícito anula o DEFAULT e o `with
      // check` do RLS recusa a linha.
      ...(rec.companyId ? { company_id: rec.companyId } : {}),
      from_user_id: rec.fromUserId,
      from_user_name: rec.fromUserName ?? null,
      to_user_id: rec.toUserId,
      to_user_name: rec.toUserName ?? null,
      unit_id: rec.unitId ?? null,
      metric_ref: rec.metricRef ?? null,
      metric_label: rec.metricLabel ?? null,
      message: rec.message ?? null,
    });
    if (error) throw error;
    return true;
  } catch (e) { console.warn('sendRecognition failed', e); return false; }
}

export async function fetchRecognitions(toUserId) {
  try {
    const { data, error } = await db()
      .from('recognitions')
      .select('*')
      .eq('to_user_id', toUserId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id, createdAt: r.created_at,
      fromUserName: r.from_user_name,
      metricRef: r.metric_ref, metricLabel: r.metric_label,
      message: r.message,
    }));
  } catch (e) { console.warn('fetchRecognitions failed', e); return []; }
}

// ── Action Plans (H1 — fecha o loop do briefing) ──────────────────────────────
// "Tratar" no briefing persiste um compromisso; o briefing do dia seguinte
// cobra a resolução. Tabela criada em 20260710_action_plans.sql, visível só
// para `authenticated` — estas funções sempre rodam depois do login.

const mapPlan = r => ({
  id: r.id,
  createdAt: r.created_at,
  jitDate: r.jit_date,
  recId: r.rec_id,
  recType: r.rec_type,
  recText: r.rec_text,
  unitId: r.unit_id,
  createdBy: r.created_by,
  createdByName: r.created_by_name,
  status: r.status,
});

/** Planos ABERTOS do gestor logado. Degrada para [] se a migration não rodou. */
export async function fetchActionPlans(userId) {
  try {
    const { data, error } = await db()
      .from('action_plans')
      .select('*')
      .eq('status', 'open')
      .eq('created_by', userId)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw error;
    return (data || []).map(mapPlan);
  } catch (e) { console.warn('fetchActionPlans failed', e); return []; }
}

/**
 * Cria um plano a partir de uma recomendação do briefing. Devolve o plano
 * criado, ou null em falha. Plano aberto duplicado para a mesma recomendação é
 * bloqueado por índice único no banco (23505) — tratado como "já existe".
 */
export async function createActionPlan(plan) {
  try {
    const { data, error } = await db().from('action_plans').insert({
      jit_date: plan.jitDate,
      rec_id: plan.recId,
      rec_type: plan.recType ?? null,
      rec_text: plan.recText ?? null,
      unit_id: plan.unitId ?? null,
      created_by: plan.createdBy,
      created_by_name: plan.createdByName ?? null,
      // company_id omitido de propósito: o DEFAULT extrai do token, e mandar
      // NULL explícito anularia o DEFAULT (with check recusaria a linha).
    }).select('*').single();
    if (error) throw error;
    return mapPlan(data);
  } catch (e) {
    if (e?.code === '23505') { console.warn('createActionPlan: plano aberto já existe para', plan.recId); return null; }
    console.warn('createActionPlan failed', e);
    return null;
  }
}

/** Marca um plano como resolvido. */
export async function completeActionPlan(planId, userId) {
  try {
    const { error } = await db().from('action_plans')
      .update({ status: 'done', completed_at: new Date().toISOString(), completed_by: userId })
      .eq('id', planId)
      .eq('status', 'open');
    if (error) throw error;
    return true;
  } catch (e) { console.warn('completeActionPlan failed', e); return false; }
}

// ── Multi-tenant: Company, Units, Sectors, Checklist Types ─────────────────

// Metadados de tenant (empresa, lojas, setores, tipos) com fallback offline.
// Sem estes caches, uma abertura sem internet montava o app com empresa nula e
// lojas vazias — mesmo com a sessão restaurada e os checklists no aparelho.
// Chaves com o companyId embutido (setRaw), porque estas buscas rodam antes de
// setCacheScope no mount.
export async function fetchCompany(slug, id) {
  const cacheKey = `zc_company::${id || slug}`;
  try {
    let query = db().from('companies').select('*').eq('active', true);
    if (id) query = query.eq('id', id);
    else if (slug) query = query.eq('slug', slug);
    else return null;
    const { data, error } = await query.single();
    if (error) throw error;
    if (data) {
      // Grava sob as duas chaves: o mount busca por slug, o pós-login por id.
      await cache.setRaw(`zc_company::${data.slug}`, data);
      await cache.setRaw(`zc_company::${data.id}`, data);
    }
    return data;
  } catch (e) {
    console.warn('[Supabase] fetchCompany failed, trying cache:', e.message);
    return await cache.getRaw(cacheKey);
  }
}

export async function fetchUnits(companyId) {
  try {
    const { data, error } = await db()
      .from('units')
      .select('*')
      .eq('company_id', companyId)
      .eq('active', true)
      .order('sort_order');
    if (error) throw error;
    await cache.setRaw(`zc_units::${companyId}`, data || []);
    return data || [];
  } catch (e) {
    console.warn('[Supabase] fetchUnits failed, trying cache:', e.message);
    return (await cache.getRaw(`zc_units::${companyId}`)) || [];
  }
}

// Mesma leitura, SEM a rede de segurança do cache: o erro sobe. Quem precisa
// saber se o servidor confirmou (o onboarding, ao conferir as lojas gravadas)
// não pode receber o cache local como se fosse resposta do banco.
export async function fetchUnitsStrict(companyId) {
  const { data, error } = await db()
    .from('units')
    .select('*')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;
  await cache.setRaw(`zc_units::${companyId}`, data || []);
  return data || [];
}

export async function fetchSectors(companyId) {
  try {
    const { data, error } = await db()
      .from('sectors')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order');
    if (error) throw error;
    await cache.setRaw(`zc_sectors::${companyId}`, data || []);
    return data || [];
  } catch (e) {
    console.warn('[Supabase] fetchSectors failed, trying cache:', e.message);
    return (await cache.getRaw(`zc_sectors::${companyId}`)) || [];
  }
}

export async function fetchChecklistTypes(companyId) {
  try {
    const { data, error } = await db()
      .from('checklist_types')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order');
    if (error) throw error;
    await cache.setRaw(`zc_types::${companyId}`, data || []);
    return data || [];
  } catch (e) {
    console.warn('[Supabase] fetchChecklistTypes failed, trying cache:', e.message);
    return (await cache.getRaw(`zc_types::${companyId}`)) || [];
  }
}

// Upsert que CONFERE o que gravou. Sem o `.select()`, o PostgREST responde 201
// sem corpo e um upsert que não afetou linha nenhuma (RLS silenciosa, conflito
// resolvido em outra linha) volta como sucesso — foi assim que loja configurada
// no onboarding sumiu sem erro. Agora, escrita que não devolve linha é erro.
async function upsertRow(table, row, label) {
  const { data, error } = await db().from(table).upsert(row, { onConflict: 'id' }).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error(`${label} não foi gravado(a) no banco`);
  return data[0];
}

export async function saveUnit(unit) {
  const row = {
    id: unit.id, company_id: unit.companyId, name: unit.name,
    color: unit.color, active: unit.active ?? true, sort_order: unit.sortOrder ?? 0,
  };
  // Só entra no upsert quando veio: um `undefined` viraria null e a coluna é
  // NOT NULL. Quem edita só o nome da loja não pode zerar o fuso dela.
  if (unit.timezone) row.timezone = unit.timezone;
  await upsertRow('units', row, `a loja "${unit.name}"`);
}

export async function deleteUnit(id) {
  const { error } = await db().from('units').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteChecklistType(id) {
  const { error } = await db().from('checklist_types').delete().eq('id', id);
  if (error) throw error;
}

export async function deleteSector(id) {
  const { error } = await db().from('sectors').delete().eq('id', id);
  if (error) throw error;
}

export async function saveSector(sector) {
  await upsertRow('sectors', {
    id: sector.id, company_id: sector.companyId, unit_id: sector.unitId,
    name: sector.name, sort_order: sector.sortOrder ?? 0,
  }, `o setor "${sector.name}"`);
}

export async function saveChecklistType(type) {
  await upsertRow('checklist_types', {
    id: type.id, company_id: type.companyId, name: type.name,
    shift: type.shift, sort_order: type.sortOrder ?? 0,
  }, `o tipo "${type.name}"`);
}

// Atualiza SÓ os campos enviados (patch), para o onboarding poder gravar cor e
// logo sem precisar reenviar name/slug/plan. Antes era um upsert com o objeto
// inteiro, que zeraria colunas ausentes.
export async function saveCompany(company) {
  // UPDATE, não upsert: a empresa SEMPRE já existe aqui (o onboarding roda depois
  // do provisionamento). Um upsert parcial tentaria o INSERT primeiro e o
  // Postgres checa NOT NULL (name/slug) antes de resolver o ON CONFLICT — então
  // o "Concluir" do onboarding quebrava com violação de NOT NULL.
  const patch = {};
  if (company.name !== undefined) patch.name = company.name;
  if (company.slug !== undefined) patch.slug = company.slug;
  if (company.primaryColor !== undefined) patch.primary_color = company.primaryColor;
  if (company.plan !== undefined) patch.plan = company.plan;
  if (company.active !== undefined) patch.active = company.active;
  if (company.logoUrl !== undefined) patch.logo_url = company.logoUrl;
  if (company.onboardedAt !== undefined) patch.onboarded_at = company.onboardedAt;
  const { error } = await db().from('companies').update(patch).eq('id', company.id);
  if (error) throw error;
}

// Sobe o logotipo da empresa para o bucket público `company-logos` sob
// `{companyId}/logo-<ts>.<ext>` (a policy exige que a 1ª pasta === company_id do
// token) e devolve a URL pública. NÃO grava em companies — quem chama decide
// quando persistir via saveCompany({ id, logoUrl }).
export async function uploadCompanyLogo(companyId, file) {
  const ext = (file.name?.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${companyId}/logo-${Date.now()}.${ext}`;
  const { error } = await db().storage
    .from('company-logos')
    .upload(path, file, { contentType: file.type || 'image/png', upsert: true });
  if (error) throw error;
  const { data } = db().storage.from('company-logos').getPublicUrl(path);
  return data.publicUrl;
}

// ── Foto de perfil ───────────────────────────────────────────────────────────
// Sobe a foto para o bucket público `user-avatars` sob
// `{companyId}/{userId}/{ts}.jpg` — a policy confere a 1ª pasta contra o
// company_id do token e a 2ª contra o user_id, para ninguém trocar a foto de um
// colega (ver 20260726_user_avatars.sql).
//
// Nome novo a cada troca (ts), de propósito: o bucket é público e serve pela
// CDN, então sobrescrever o mesmo path deixaria a foto antiga em cache por
// tempo indeterminado — a pessoa trocaria a foto e continuaria vendo a velha.
export async function uploadUserAvatar(companyId, userId, blob) {
  if (!companyId || !userId) throw new Error('empresa ou usuário ausente');
  const path = `${companyId}/${userId}/${Date.now()}.jpg`;
  const { error } = await db().storage
    .from('user-avatars')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = db().storage.from('user-avatars').getPublicUrl(path);
  return data.publicUrl;
}

// Grava SÓ a coluna da foto. Não usa saveUsers de propósito: aquela função faz
// diff da lista inteira e APAGA quem não estiver nela — nada que uma troca de
// foto deva poder fazer. `null` remove a foto e volta para a inicial do nome.
export async function saveUserAvatar(userId, avatarUrl) {
  const { error } = await db().from('users')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
  // Mantém o cache offline coerente: sem isto a foto sumia ao reabrir o app sem
  // rede, porque o cache ainda tinha a versão anterior da lista.
  try {
    const cached = await cache.get('ibr_users');
    if (Array.isArray(cached)) {
      await cache.set('ibr_users', cached.map(u => (u.id === userId ? { ...u, avatarUrl } : u)));
    }
  } catch (_) {}
  return avatarUrl;
}
