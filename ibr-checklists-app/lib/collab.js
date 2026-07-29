'use client';

/**
 * ZCheck — Execução colaborativa em tempo real (H6)
 *
 * Estado compartilhado (tabela live_tasks) das tarefas de um checklist rodando
 * HOJE numa loja: quem concluiu, quando, a evidência (nota e foto) e as
 * reaberturas.
 *
 * Três garantias, nesta ordem de importância:
 *
 *  1. QUEM CHEGA PRIMEIRO LEVA. A marcação passa pelo RPC `claim_live_task`,
 *     que decide a disputa dentro do banco. A checagem antiga era no cliente,
 *     contra o último fetch: dois toques simultâneos viravam dois "done" e o
 *     segundo apagava o crédito do primeiro.
 *  2. NUNCA PIORA O QUE JÁ FUNCIONAVA. Sem os RPCs (migration ainda não
 *     aplicada — o app está em produção e o deploy do código pode chegar antes),
 *     cai no upsert direto de antes. Sem a tabela ou offline, degrada para
 *     execução individual, como sempre fez.
 *  3. NADA SE PERDE OFFLINE. Marcação feita sem rede entra na MESMA fila das
 *     conclusões (`ibr_offline_queue`) e sobe quando a conexão volta — antes ela
 *     sumia num console.warn.
 */

import { supabase, authedSupabase } from './supabase';
import { storageGet, storageSet } from './storage';

// live_tasks é escopada por company_id no RLS: precisa do token da sessão.
// Antes do login authedSupabase() devolve o cliente anônimo, como antes.
const db = () => authedSupabase();

const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

// PostgREST devolve PGRST202 quando a função não existe no banco. É o sinal de
// "migration ainda não aplicada" — e o único caso em que voltar para o caminho
// antigo é a atitude certa, em vez de falhar.
const semRpc = (e) =>
  e?.code === 'PGRST202' ||
  /could not find the function|schema cache/i.test(e?.message || '');

const mapRow = (r) => (!r ? null : {
  done: !!r.done,
  operatorUserId: r.operator_user_id ?? null,
  operatorName: r.operator_name ?? null,
  completedAt: r.completed_at ?? null,
  reopenedCount: r.reopened_count ?? 0,
  note: r.note ?? '',
  photoPath: r.photo_path ?? null,
});

/* ------------------------------ fila offline ------------------------------ */
//
// Mesma fila das conclusões, de propósito: o contador de "pendente" da barra de
// rede já a lê, então a marcação offline aparece para o usuário como trabalho
// por sincronizar em vez de sumir em silêncio.

const FILA = 'ibr_offline_queue';
// Marcação é uma afirmação sobre AGORA ("acabei de fazer"). Depois de meio dia
// na fila ela não informa mais o colega — e a atribuição da própria pessoa não
// depende dela: `submit()` credita quem marcou pelo estado local.
const VALIDADE_MS = 12 * 60 * 60 * 1000;

const lerFila = async () => {
  try { return JSON.parse((await storageGet(FILA)).value) || []; } catch { return []; }
};
const gravarFila = async (q) => {
  try { await storageSet(FILA, JSON.stringify(q)); } catch (e) { console.warn('fila live_task', e); }
};

async function enfileirar(payload) {
  try {
    const q = await lerFila();
    // Uma marcação por item: reenfileirar o mesmo item substitui a anterior.
    const i = q.findIndex(e => e.type === 'live_task' && e.payload?.itemId === payload.itemId
      && e.payload?.templateId === payload.templateId && e.payload?.date === payload.date);
    const entry = { type: 'live_task', payload, ts: Date.now() };
    if (i >= 0) q[i] = entry; else q.push(entry);
    await gravarFila(q);
    return true;
  } catch (e) { console.warn('enfileirar live_task falhou', e); return false; }
}

/**
 * Drenagem das marcações pendentes. Chamada por `drainOfflineQueue` (sync.js).
 * Devolve `true` quando a entrada pode sair da fila — inclusive quando o colega
 * ganhou a disputa no meio do caminho: aí não há o que reenviar.
 */
export async function drainLiveTask(entry) {
  if (Date.now() - (entry.ts || 0) > VALIDADE_MS) {
    console.log('[collab] marcação vencida, descartada da fila:', entry.payload?.itemId);
    return true;
  }
  const r = await claimLiveTask({ ...entry.payload, permitirFila: false });
  return r.ok;
}

/* -------------------------------- leitura --------------------------------- */

export async function fetchLiveTasks(templateId, unitId, date) {
  try {
    const { data, error } = await db()
      .from('live_tasks')
      .select('*')
      .eq('template_id', templateId)
      .eq('unit_id', unitId)
      .eq('date', date);
    if (error) throw error;
    const map = {};
    (data || []).forEach(r => { map[r.item_id] = mapRow(r); });
    return map;
  } catch (e) { console.warn('fetchLiveTasks failed', e); return {}; }
}

/* -------------------------------- escrita --------------------------------- */

/**
 * Reivindica a tarefa para quem marcou.
 *
 * Devolve `{ ok, claimed, task, offline, legacy }`:
 *   · claimed=false com `task.operatorUserId` de outra pessoa → o colega ganhou;
 *     a tela mostra o aviso e NÃO credita a marcação.
 *   · ok=false → nem o banco nem a fila aceitaram; o chamador mantém o estado
 *     local (a execução segue, como no modo individual).
 */
export async function claimLiveTask({
  templateId, unitId, date, itemId, userId, userName,
  note = null, photoPath = null, permitirFila = true,
}) {
  const payload = { templateId, unitId, date, itemId, userId, userName, note, photoPath };

  if (!online() && permitirFila) {
    const enfileirado = await enfileirar(payload);
    return { ok: enfileirado, claimed: true, offline: true, task: null };
  }

  try {
    const { data, error } = await db().rpc('claim_live_task', {
      p_template_id: templateId, p_unit_id: unitId, p_date: date, p_item_id: itemId,
      p_user_id: userId, p_operator_name: userName, p_note: note, p_photo_path: photoPath,
    });
    if (error) {
      if (semRpc(error)) return claimLegado(payload);
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, claimed: !!row?.claimed, task: mapRow(row) };
  } catch (e) {
    console.warn('claimLiveTask falhou', e);
    if (permitirFila) {
      const enfileirado = await enfileirar(payload);
      if (enfileirado) return { ok: true, claimed: true, offline: true, task: null };
    }
    return { ok: false, claimed: false, task: null };
  }
}

// Caminho de antes da migration: upsert direto, sem disputa resolvida no banco.
// Mantido só para o intervalo entre o deploy do código e a migration.
async function claimLegado({ templateId, unitId, date, itemId, userId, userName, note, photoPath }) {
  try {
    const row = {
      template_id: templateId, unit_id: unitId, date, item_id: itemId,
      done: true, operator_user_id: userId, operator_name: userName,
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    // note/photo_path ficam DE FORA: sem a migration essas colunas não existem e
    // o PostgREST recusaria a linha inteira — a marcação, que é o essencial,
    // deixaria de acontecer por causa da evidência, que é o acessório.
    const { error } = await db().from('live_tasks').upsert(row, { onConflict: 'template_id,unit_id,date,item_id' });
    if (error) throw error;
    return { ok: true, claimed: true, legacy: true, task: null };
  } catch (e) {
    console.warn('claimLegado falhou', e);
    return { ok: false, claimed: false, task: null };
  }
}

/** Desmarca — só o dono. Devolve `{ ok, released }`. */
export async function releaseLiveTask({ templateId, unitId, date, itemId, userId }) {
  try {
    const { data, error } = await db().rpc('release_live_task', {
      p_template_id: templateId, p_unit_id: unitId, p_date: date, p_item_id: itemId, p_user_id: userId,
    });
    if (error) {
      if (semRpc(error)) {
        const { error: e2 } = await db().from('live_tasks').upsert({
          template_id: templateId, unit_id: unitId, date, item_id: itemId,
          done: false, completed_at: null, updated_at: new Date().toISOString(),
        }, { onConflict: 'template_id,unit_id,date,item_id' });
        if (e2) throw e2;
        return { ok: true, released: true, legacy: true };
      }
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, released: !!row?.released };
  } catch (e) { console.warn('releaseLiveTask falhou', e); return { ok: false, released: false }; }
}

/** Reabre com motivo. O contador é incrementado no banco. */
export async function reopenLiveTask({ templateId, unitId, date, itemId, userId, userName, reason = null }) {
  try {
    const { data, error } = await db().rpc('reopen_live_task', {
      p_template_id: templateId, p_unit_id: unitId, p_date: date, p_item_id: itemId,
      p_user_id: userId, p_user_name: userName, p_reason: reason,
    });
    if (error) {
      if (semRpc(error)) return reopenLegado({ templateId, unitId, date, itemId, userId, userName });
      throw error;
    }
    const row = Array.isArray(data) ? data[0] : data;
    return { ok: true, reopened: !!row?.reopened, reopenedCount: row?.reopened_count ?? 0 };
  } catch (e) { console.warn('reopenLiveTask falhou', e); return { ok: false, reopened: false }; }
}

async function reopenLegado({ templateId, unitId, date, itemId, userId, userName }) {
  try {
    const { data } = await db().from('live_tasks')
      .select('reopened_count')
      .eq('template_id', templateId).eq('unit_id', unitId).eq('date', date).eq('item_id', itemId)
      .maybeSingle();
    const rc = (data?.reopened_count || 0) + 1;
    const { error } = await db().from('live_tasks').upsert({
      template_id: templateId, unit_id: unitId, date, item_id: itemId,
      done: false, operator_user_id: userId, operator_name: userName,
      completed_at: null, reopened_count: rc, updated_at: new Date().toISOString(),
    }, { onConflict: 'template_id,unit_id,date,item_id' });
    if (error) throw error;
    return { ok: true, reopened: true, reopenedCount: rc, legacy: true };
  } catch (e) { console.warn('reopenLegado falhou', e); return { ok: false, reopened: false }; }
}

/**
 * Evidência da rodada — observação e/ou foto, SEM tocar no `done`.
 *
 * É o que faz a execução a quatro mãos gerar um registro completo: quem submete
 * leva a nota e a foto que o colega anexou, em vez de só as próprias. Falha em
 * silêncio (sem a migration, o RPC não existe): a evidência volta a ser local,
 * que é exatamente o comportamento de antes.
 */
export async function setLiveEvidence({ templateId, unitId, date, itemId, note = null, photoPath = null }) {
  if (note == null && photoPath == null) return false;
  try {
    const { error } = await db().rpc('set_live_task_evidence', {
      p_template_id: templateId, p_unit_id: unitId, p_date: date, p_item_id: itemId,
      p_note: note, p_photo_path: photoPath,
    });
    if (error) throw error;
    return true;
  } catch (e) { console.warn('setLiveEvidence falhou', e); return false; }
}

/* ------------------------------- realtime --------------------------------- */

export function subscribeLiveTasks(templateId, unitId, date, onChange) {
  if (typeof window === 'undefined') return () => {};
  const ch = supabase
    .channel(`live_tasks:${templateId}:${unitId}:${date}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'live_tasks', filter: `template_id=eq.${templateId}` },
      () => onChange())
    .subscribe();
  return () => { try { supabase.removeChannel(ch); } catch (_) {} };
}
