'use client';

/**
 * Zchek — Sync Layer
 *
 * Strategy:
 * 1. All reads: try Supabase first, fall back to IndexedDB cache if offline.
 * 2. All writes: write to IndexedDB immediately (optimistic), then sync to Supabase.
 *    If offline, queue the write and drain the queue when connectivity returns.
 */

import { supabase } from './supabase';
import { storageGet, storageSet, getSyncQueue, clearSyncQueue } from './storage';

// ── Helpers ──────────────────────────────────────────────────────────────────

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
    const { data, error } = await supabase.from('templates').select('*').order('unit_id').order('sector');
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
      const { error } = await supabase.from('templates').upsert({
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
    const { data, error } = await supabase
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
      await supabase.from('users').upsert(
        withPin.map(u => ({ ...baseRow(u), pin: u.pin })),
        { onConflict: 'id' }
      );
    }
    if (withoutPin.length) {
      await supabase.from('users').upsert(
        withoutPin.map(baseRow),
        { onConflict: 'id' }
      );
    }

    // Only delete users that were explicitly removed (exist in DB but not in
    // our list). Diff against ids only — reading ids is not sensitive.
    const { data: existing } = await supabase.from('users').select('id');
    const currentIds = new Set(users.map(u => u.id));
    const toDelete = (existing || []).filter(u => !currentIds.has(u.id)).map(u => u.id);
    if (toDelete.length > 0) {
      await supabase.from('users').delete().in('id', toDelete);
    }
  } catch (e) { console.warn('saveUsers: Supabase error', e); }
}

// ── Completions ───────────────────────────────────────────────────────────────

export async function fetchCompletions() {
  // Always try Supabase first — isOnline() is unreliable at mount time
  try {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const { data, error } = await supabase
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
  await pushCompletion(record);
}

async function pushCompletion(record) {
  try {
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
    const { error } = await supabase.from('completions').upsert(row, { onConflict: 'id' });
    if (error) throw error;
  } catch (e) {
    console.error('[Supabase] pushCompletion FAILED:', JSON.stringify(e));
    await queueOfflineCompletion(record);
  }
}

// ── Photos ────────────────────────────────────────────────────────────────────

// Upload reference photo for checklist item orientation — returns public URL
export async function uploadRefPhoto(templateId, itemId, photoIndex, dataUrl) {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const path = `ref/${templateId}/${itemId}_${photoIndex}.jpg`;
    const { error } = await supabase.storage
      .from('checklist-photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('checklist-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.error('uploadRefPhoto failed:', e);
    return null; // fall back to base64 if upload fails
  }
}

export async function uploadPhoto(completionId, itemId, dataUrl) {
  if (!isOnline()) {
    // Queue for later upload — store data URL in cache keyed by completion+item
    try {
      await storageSet(`ibr_photo_${completionId}_${itemId}`, dataUrl);
      await queueOfflinePhoto({ completionId, itemId });
    } catch (e) { console.warn('uploadPhoto offline queue failed', e); }
    return null;
  }
  return await pushPhoto(completionId, itemId, dataUrl);
}

async function pushPhoto(completionId, itemId, dataUrl) {
  try {
    // Convert data URL to blob
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const path = `${completionId}/${itemId}.jpg`;
    const { error } = await supabase.storage
      .from('checklist-photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;

    // Save metadata — try upsert first, fall back to insert
    // Save metadata
    const { error: upsertErr } = await supabase.from('photos').upsert({
      completion_id: completionId,
      item_id: itemId,
      storage_path: path,
    }, { onConflict: 'completion_id,item_id', ignoreDuplicates: true });
    if (upsertErr) console.warn('pushPhoto metadata warning (ignored):', upsertErr.code);

    return path;
  } catch (e) {
    console.warn('pushPhoto failed', e);
    return null;
  }
}

export async function getPhotoUrl(completionId, itemId) {
  // Try Supabase first
  if (isOnline()) {
    try {
      const { data } = await supabase.from('photos')
        .select('storage_path')
        .eq('completion_id', completionId)
        .eq('item_id', itemId)
        .single();
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
    return r.value;
  } catch { return null; }
}

// ── Closures ──────────────────────────────────────────────────────────────────

export async function fetchClosures() {
  // Always try Supabase first
  try {
    const { data, error } = await supabase.from('closures').select('*');
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
    await supabase.from('closures').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (closures.length > 0) {
      const rows = closures.map(c => ({ unit_id: c.unitId, date: c.date }));
      await supabase.from('closures').insert(rows);
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
    const { count: templateCount } = await supabase
      .from('templates').select('*', { count: 'exact', head: true });
    console.log('[Supabase] Template count:', templateCount);
    if (templateCount === 0) {
      console.log('[Supabase] Seeding templates...');
      await saveTemplates(seedTemplates);
    }
    const { count: userCount } = await supabase
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
        const { data } = await supabase.from('templates').select('*').order('name');
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
 * Validates a PIN against Supabase.
 * Returns the user object (without PIN) if valid, null otherwise.
 * The PIN never lives in the JS bundle — it's only checked server-side.
 */
export async function validatePin(userId, pin) {
  try {
    // Everything happens server-side in a SECURITY DEFINER RPC: rate-limit
    // check, PIN comparison and login_attempts logging. The PIN column is not
    // readable by the anon role, so it never reaches the client bundle.
    // The RPC returns the same shape the caller expects:
    //   { ok: false, reason: 'rate_limited' | 'wrong_pin' | 'not_found' }
    //   { ok: true,  user: { id, name, role, unitId, sectorId, companyId, suspended } }
    const { data, error } = await supabase.rpc('validate_pin', {
      p_user_id: userId,
      p_pin: pin,
    });

    if (error) throw error;
    if (!data) return { ok: false, reason: 'network_error' };
    return data;
  } catch (e) {
    console.warn('validatePin error:', e);
    return { ok: false, reason: 'network_error' };
  }
}

/**
 * Fetches public user list (name + id only, no PIN) for the login dropdown.
 */
export async function fetchPublicUsers() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role, unit_id, sector_id')
      .order('name');

    if (error || !data) return null;

    return data.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      unitId: u.unit_id,
      sectorId: u.sector_id ?? null,
    }));
  } catch (e) {
    console.warn('fetchPublicUsers error:', e);
    return null;
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
    const { error } = await supabase.from('push_subscriptions').upsert({
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

// ── Multi-tenant: Company, Units, Sectors, Checklist Types ─────────────────

export async function fetchCompany(slug, id) {
  try {
    let query = supabase.from('companies').select('*').eq('active', true);
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
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
  const { error } = await supabase.from('units').upsert({
    id: unit.id, company_id: unit.companyId, name: unit.name,
    color: unit.color, active: unit.active ?? true, sort_order: unit.sortOrder ?? 0,
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function saveSector(sector) {
  const { error } = await supabase.from('sectors').upsert({
    id: sector.id, company_id: sector.companyId, unit_id: sector.unitId,
    name: sector.name, sort_order: sector.sortOrder ?? 0,
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function saveChecklistType(type) {
  const { error } = await supabase.from('checklist_types').upsert({
    id: type.id, company_id: type.companyId, name: type.name,
    shift: type.shift, sort_order: type.sortOrder ?? 0,
  }, { onConflict: 'id' });
  if (error) throw error;
}

export async function saveCompany(company) {
  const { error } = await supabase.from('companies').upsert({
    id: company.id, name: company.name, slug: company.slug,
    primary_color: company.primaryColor, plan: company.plan ?? 'trial',
    active: company.active ?? true,
  }, { onConflict: 'id' });
  if (error) throw error;
}
