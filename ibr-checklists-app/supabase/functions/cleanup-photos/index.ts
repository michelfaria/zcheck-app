// Supabase Edge Function: cleanup-photos
// Deletes checklist photos older than 90 days from storage.
// Selfies (bucket: colaboradores) are never touched.
// Triggered by pg_cron daily at 03:00 BRT (06:00 UTC).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').service_role || '';
const BUCKET = 'checklist-photos';
const RETENTION_DAYS = 90;

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  console.log(`[cleanup-photos] Deleting photos from before ${cutoffStr}`);

  // 1. Find completions older than 90 days
  const { data: oldCompletions, error: compErr } = await supabase
    .from('completions')
    .select('id')
    .lt('date', cutoffStr);

  if (compErr) {
    console.error('Error fetching old completions:', compErr);
    return new Response(JSON.stringify({ error: compErr.message }), { status: 500 });
  }

  if (!oldCompletions || oldCompletions.length === 0) {
    console.log('[cleanup-photos] No old completions found.');
    return new Response(JSON.stringify({ deleted: 0, message: 'Nothing to clean up' }));
  }

  const oldIds = oldCompletions.map(c => c.id);
  console.log(`[cleanup-photos] Found ${oldIds.length} old completions`);

  // 2. Find photo records for those completions
  const { data: photos, error: photoErr } = await supabase
    .from('photos')
    .select('id, completion_id, storage_path')
    .in('completion_id', oldIds);

  if (photoErr) {
    console.error('Error fetching old photos:', photoErr);
    return new Response(JSON.stringify({ error: photoErr.message }), { status: 500 });
  }

  if (!photos || photos.length === 0) {
    console.log('[cleanup-photos] No photos to delete.');
    return new Response(JSON.stringify({ deleted: 0, message: 'No photos to delete' }));
  }

  console.log(`[cleanup-photos] Deleting ${photos.length} photos from storage`);

  // 3. Delete from Storage in batches of 100
  const paths = photos.map(p => p.storage_path);
  let storageDeleted = 0;

  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error: storageErr } = await supabase.storage
      .from(BUCKET)
      .remove(batch);

    if (storageErr) {
      console.warn(`Storage batch delete error (non-fatal):`, storageErr.message);
    } else {
      storageDeleted += batch.length;
    }
  }

  // 4. Delete photo records from DB
  const { error: dbErr } = await supabase
    .from('photos')
    .delete()
    .in('completion_id', oldIds);

  if (dbErr) {
    console.error('Error deleting photo records:', dbErr);
  }

  const result = {
    deleted: storageDeleted,
    completions_processed: oldIds.length,
    cutoff: cutoffStr,
    message: `Deleted ${storageDeleted} photos from ${oldIds.length} old completions`,
  };

  console.log('[cleanup-photos]', result.message);
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});
