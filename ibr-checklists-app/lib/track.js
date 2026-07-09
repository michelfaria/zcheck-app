'use client';

/**
 * ZCheck — Event Instrumentation Layer (offline-first)
 *
 * Fundação do MVP de Inteligência Operacional (ver docs/REVISAO_MVP_v1.3.md §8).
 * Toda hipótese do MVP depende de medir COMPORTAMENTO, não só resultado.
 *
 * Estratégia (mesma do lib/sync.js):
 * 1. track() escreve o evento numa fila no IndexedDB imediatamente (nunca perde em wifi ruim).
 * 2. Um flush em batch envia para a tabela `events` do Supabase quando online.
 * 3. Reconexão e novas chamadas disparam o flush; falha reagenda com backoff.
 *
 * Uso:
 *   setTrackSession(user)              // no login
 *   track('checklist_completed', {...})// em qualquer ponto de interesse
 *   clearTrackSession()                // no logout
 */

import { supabase } from './supabase';
import { storageGet, storageSet } from './storage';

const QUEUE_KEY = 'zc_event_queue';
const QUEUE_CAP = 1000;   // teto de eventos em fila (protege o IndexedDB)
const BATCH_SIZE = 100;   // eventos por insert

// Contexto da sessão atual — preenchido no login, sobrescrevível por chamada.
let session = {};
let flushTimer = null;

export function setTrackSession(user = {}) {
  session = {
    userId: user.id ?? user.userId ?? null,
    companyId: user.companyId ?? user.company_id ?? null,
    unitId: user.unitId ?? user.unit_id ?? null,
    sectorId: user.sectorId ?? user.sector_id ?? null,
    role: user.role ?? null,
  };
  // Drena qualquer evento que tenha sobrado de uma sessão anterior.
  scheduleFlush(1500);
}

export function clearTrackSession() {
  session = {};
}

function detectDevice() {
  if (typeof window === 'undefined') return 'server';
  try {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator.standalone === true;
    if (standalone) return 'pwa';
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile-web' : 'desktop';
  } catch {
    return 'unknown';
  }
}

async function queueGet() {
  try {
    const r = await storageGet(QUEUE_KEY);
    const parsed = JSON.parse(r.value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function queueSet(q) {
  try {
    await storageSet(QUEUE_KEY, JSON.stringify(q));
  } catch (e) {
    console.warn('[track] queue set failed', e);
  }
}

function scheduleFlush(delay = 4000) {
  if (typeof window === 'undefined') return;
  if (flushTimer) return; // já há um flush agendado
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushEvents();
  }, delay);
}

/**
 * Registra um evento. Nunca lança — instrumentação jamais deve quebrar o app.
 * @param {string} eventType  ex.: 'login', 'checklist_completed', 'task_completed'
 * @param {object} props      { source, checklistId, taskId, metadata, e overrides de contexto }
 */
export async function track(eventType, props = {}) {
  if (typeof window === 'undefined' || !eventType) return;
  try {
    const ev = {
      event_type: eventType,
      occurred_at: new Date().toISOString(),
      user_id: props.userId ?? session.userId ?? null,
      company_id: props.companyId ?? session.companyId ?? null,
      unit_id: props.unitId ?? session.unitId ?? null,
      sector_id: props.sectorId ?? session.sectorId ?? null,
      checklist_id: props.checklistId ?? null,
      task_id: props.taskId ?? null,
      role: props.role ?? session.role ?? null,
      device: detectDevice(),
      action_source: props.source ?? null,
      metadata: props.metadata ?? {},
    };
    const q = await queueGet();
    q.push(ev);
    await queueSet(q.slice(-QUEUE_CAP));
    scheduleFlush();
  } catch (e) {
    console.warn('[track] enqueue failed (ignored):', e?.message);
  }
}

/** Envia a fila em batches para o Supabase. Silencioso e resiliente. */
export async function flushEvents() {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  let q = await queueGet();
  if (q.length === 0) return;

  const batch = q.slice(0, BATCH_SIZE);
  try {
    const { error } = await supabase.from('events').insert(batch);
    if (error) throw error;
    const remaining = q.slice(batch.length);
    await queueSet(remaining);
    if (remaining.length > 0) scheduleFlush(1000); // continua drenando
  } catch (e) {
    console.warn('[track] flush failed, will retry:', e?.message);
    scheduleFlush(15000); // backoff
  }
}

// Drena assim que a conectividade voltar.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushEvents());
}
