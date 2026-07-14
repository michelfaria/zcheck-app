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

// ── Helpers ──────────────────────────────────────────────────────────────────

// Toda leitura/escrita de tabela passa por aqui. Antes do login não há token e
// authedSupabase() devolve o cliente anônimo; depois, o token viaja no header e
// o RLS escopa as linhas por company_id.
//
// `supabase` (anônimo) segue em uso de propósito para storage e para os canais
// de realtime — ver setSessionToken(), que reautoriza o socket no login.
const db = () => authedSupabase();

const cache = {
  async get(key) {
    try { const r = await storageGet(key); return JSON.parse(r.value); } catch { return null; }
  },
  async set(key, value) {
    try { await storageSet(key, JSON.stringify(value)); } catch (e) { console.warn('cache.set failed', e); }
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

export async function saveTemplates(templates, changedIds = null) {
  await cache.set('ibr_templates', templates);
  try {
    const toSave = changedIds
      ? templates.filter(t => changedIds.includes(t.id))
      : templates;
    if (toSave.length === 0) return;

    // Upsert one by one to guarantee postgres_changes fires for each row
    for (const t of toSave) {
      const { error } = await db().from('templates').upsert({
        id: t.id, unit_id: t.unitId, sector: t.sector,
        shift: t.shift, name: t.name, deadline: t.deadline, items: t.items,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) console.error('saveTemplates: upsert error', error);
    }
    console.log(`[Sync] Saved ${toSave.length} template(s) to Supabase`);
  } catch (e) { console.warn('saveTemplates: Supabase error', e); }
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function fetchUsers(seedUsers) {
  // Always try Supabase first — returns users WITHOUT pin (security)
  try {
    const { data, error } = await db()
      .from('users')
      .select('id, name, role, unit_id, sector_id, suspended')
      .order('name');
    if (error) throw error;
    if (data && data.length > 0) {
      const mapped = data.map(row => ({
        id: row.id, name: row.name, role: row.role,
        unitId: row.unit_id, sectorId: row.sector_id ?? null,
        suspended: row.suspended ?? false,
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

export async function saveUsers(users) {
  await cache.set('ibr_users', users);
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

    // The anon role can no longer read the `pin` column, so we never fetch PINs
    // back to preserve them. Instead: rows that carry a new PIN are upserted
    // WITH the pin column; rows without a PIN are upserted WITHOUT it, so the
    // ON CONFLICT UPDATE leaves the stored PIN untouched. (New users always
    // arrive with a PIN — the forms require one — so no INSERT ever lands a
    // null PIN.)
    const withPin = users.filter(u => u.pin);
    const withoutPin = users.filter(u => !u.pin);

    if (withPin.length) {
      await db().from('users').upsert(
        withPin.map(u => ({ ...baseRow(u), pin: u.pin })),
        { onConflict: 'id' }
      );
    }
    if (withoutPin.length) {
      await db().from('users').upsert(
        withoutPin.map(baseRow),
        { onConflict: 'id' }
      );
    }

    // Only delete users that were explicitly removed (exist in DB but not in
    // our list). Diff against ids only — reading ids is not sensitive.
    const { data: existing } = await db().from('users').select('id');
    const currentIds = new Set(users.map(u => u.id));
    const toDelete = (existing || []).filter(u => !currentIds.has(u.id)).map(u => u.id);
    if (toDelete.length > 0) {
      await db().from('users').delete().in('id', toDelete);
    }
  } catch (e) { console.warn('saveUsers: Supabase error', e); }
}

// ── Completions ───────────────────────────────────────────────────────────────

export async function fetchCompletions() {
  // Always try Supabase first — isOnline() is unreliable at mount time
  try {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const { data, error } = await db()
      .from('completions')
      .select('*')
      .gte('date', since.toISOString().slice(0, 10))
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
    items: record.items,
  };
  const { error } = await db().from('completions').upsert(row, { onConflict: 'id' });
  if (error) throw error;
}

// ── Photos ────────────────────────────────────────────────────────────────────
//
// Fotos de REFERÊNCIA (orientação do item) vivem como base64 direto no template
// — ver o editor em GerenciarView. Não há upload para storage: base64 persiste
// e nunca expira. (Havia um `uploadRefPhoto` que gravava no bucket privado
// `checklist-photos` e devolvia getPublicUrl — URL que nunca resolvia. Removido:
// era código morto que só produziria imagem quebrada se alguém o religasse.)

export async function uploadPhoto(completionId, itemId, dataUrl) {
  const queue = async () => {
    try {
      await storageSet(`ibr_photo_${completionId}_${itemId}`, dataUrl);
      await queueOfflinePhoto({ completionId, itemId });
    } catch (e) { console.warn('uploadPhoto offline queue failed', e); }
  };

  if (!isOnline()) {
    console.log('[Sync] offline — queuing photo:', completionId, itemId);
    await queue();
    return null;
  }
  try {
    return await pushPhoto(completionId, itemId, dataUrl);
  } catch (e) {
    console.warn('pushPhoto failed, enfileirando', e.message);
    await queue();
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
    const q = (await cache.get('ibr_offline_queue')) || [];
    q.push({ type: 'completion', record, ts: Date.now() });
    await cache.set('ibr_offline_queue', q);
  } catch (e) { console.warn('queueOfflineCompletion failed', e); }
}

async function queueOfflinePhoto({ completionId, itemId }) {
  try {
    const q = (await cache.get('ibr_offline_queue')) || [];
    q.push({ type: 'photo', completionId, itemId, ts: Date.now() });
    await cache.set('ibr_offline_queue', q);
  } catch (e) { console.warn('queueOfflinePhoto failed', e); }
}

export async function drainOfflineQueue() {
  console.log('[Sync] drainOfflineQueue called, online:', isOnline());
  if (!isOnline()) return { drained: 0, failed: 0 };
  // Sem sessão, a escrita é recusada pelo RLS. O poll de rede roda já na tela de
  // login, então drenar aqui só queimaria tentativas contra a fila do usuário.
  if (!getSessionToken()) return { drained: 0, failed: 0 };
  try {
    const q = (await cache.get('ibr_offline_queue')) || [];
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
        }
      } catch {
        failed++;
        remaining.push(entry);
      }
    }

    await cache.set('ibr_offline_queue', remaining);
    return { drained, failed };
  } catch (e) {
    console.warn('drainOfflineQueue failed', e);
    return { drained: 0, failed: 0 };
  }
}

export async function getOfflineQueueLength() {
  const q = (await cache.get('ibr_offline_queue')) || [];
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
  briefingDate: r.briefing_date,
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
      briefing_date: plan.briefingDate,
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

export async function fetchCompany(slug, id) {
  try {
    let query = db().from('companies').select('*').eq('active', true);
    if (id) query = query.eq('id', id);
    else if (slug) query = query.eq('slug', slug);
    else return null;
    const { data, error } = await query.single();
    if (error) throw error;
    return data;
  } catch (e) {
    console.warn('[Supabase] fetchCompany failed:', e.message);
    return null;
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
    return data || [];
  } catch (e) {
    console.warn('[Supabase] fetchUnits failed:', e.message);
    return [];
  }
}

export async function fetchSectors(companyId) {
  try {
    const { data, error } = await db()
      .from('sectors')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order');
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('[Supabase] fetchSectors failed:', e.message);
    return [];
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
    return data || [];
  } catch (e) {
    console.warn('[Supabase] fetchChecklistTypes failed:', e.message);
    return [];
  }
}

export async function saveUnit(unit) {
  const { error } = await db().from('units').upsert({
    id: unit.id, company_id: unit.companyId, name: unit.name,
    color: unit.color, active: unit.active ?? true, sort_order: unit.sortOrder ?? 0,
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function saveSector(sector) {
  const { error } = await db().from('sectors').upsert({
    id: sector.id, company_id: sector.companyId, unit_id: sector.unitId,
    name: sector.name, sort_order: sector.sortOrder ?? 0,
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function saveChecklistType(type) {
  const { error } = await db().from('checklist_types').upsert({
    id: type.id, company_id: type.companyId, name: type.name,
    shift: type.shift, sort_order: type.sortOrder ?? 0,
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function saveCompany(company) {
  const { error } = await db().from('companies').upsert({
    id: company.id, name: company.name, slug: company.slug,
    primary_color: company.primaryColor, plan: company.plan ?? 'trial',
    active: company.active ?? true,
  }, { onConflict: 'id' });
  if (error) throw error;
}
