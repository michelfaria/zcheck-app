'use client';

/**
 * ZCheck — Execução colaborativa em tempo real (H6)
 *
 * Estado compartilhado (tabela live_tasks) das tarefas de um checklist rodando
 * HOJE numa loja: quem concluiu, quando, e reaberturas (auditoria).
 *
 * Degrada com elegância: se a tabela não existir / estiver offline, todas as
 * funções falham em silêncio e a execução volta a ser individual (sem regressão).
 */

import { supabase, authedSupabase } from './supabase';

// live_tasks é escopada por company_id no RLS: precisa do token da sessão.
// Antes do login authedSupabase() devolve o cliente anônimo, como antes.
const db = () => authedSupabase();

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
    (data || []).forEach(r => {
      map[r.item_id] = {
        done: r.done,
        operatorUserId: r.operator_user_id,
        operatorName: r.operator_name,
        completedAt: r.completed_at,
        reopenedCount: r.reopened_count,
      };
    });
    return map;
  } catch (e) { console.warn('fetchLiveTasks failed', e); return {}; }
}

export async function setLiveTask({ templateId, unitId, date, itemId, done, operatorUserId, operatorName }) {
  try {
    const { error } = await db().from('live_tasks').upsert({
      template_id: templateId, unit_id: unitId, date, item_id: itemId,
      done, operator_user_id: operatorUserId, operator_name: operatorName,
      completed_at: done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'template_id,unit_id,date,item_id' });
    if (error) throw error;
    return true;
  } catch (e) { console.warn('setLiveTask failed', e); return false; }
}

export async function reopenLiveTask({ templateId, unitId, date, itemId, operatorUserId, operatorName }) {
  try {
    const { data } = await db().from('live_tasks')
      .select('reopened_count')
      .eq('template_id', templateId).eq('unit_id', unitId).eq('date', date).eq('item_id', itemId)
      .single();
    const rc = (data?.reopened_count || 0) + 1;
    const { error } = await db().from('live_tasks').upsert({
      template_id: templateId, unit_id: unitId, date, item_id: itemId,
      done: false, operator_user_id: operatorUserId, operator_name: operatorName,
      completed_at: null, reopened_count: rc, updated_at: new Date().toISOString(),
    }, { onConflict: 'template_id,unit_id,date,item_id' });
    if (error) throw error;
    return true;
  } catch (e) { console.warn('reopenLiveTask failed', e); return false; }
}

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
