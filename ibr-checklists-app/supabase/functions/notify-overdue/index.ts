// IBR Checklists — notify-overdue v6 — uses web-push library
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_ANON_KEY') ||
  JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').anon_key || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;

Deno.serve(async () => {
  console.log('notify-overdue v6 started');

  webpush.setVapidDetails(
    'mailto:ingonegocios@gmail.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const brNow = new Date(Date.now() - 3*60*60*1000);
  const todayStr = brNow.toISOString().slice(0,10);
  const timeNow = brNow.getHours()*60 + brNow.getMinutes();
  console.log(`BR: ${brNow.toISOString()}, timeNow: ${timeNow}min`);

  const { data: templates } = await supabase.from('templates').select('id,unit_id,sector,name,deadline');
  const withDeadline = (templates||[]).filter((t:any) => t.deadline);

  const { data: completions } = await supabase.from('completions').select('template_id').eq('date', todayStr);
  const doneIds = new Set((completions||[]).map((c:any) => c.template_id));

  const notifKey = `notified_${todayStr}`;
  const { data: cfg } = await supabase.from('config').select('value').eq('key', notifKey).maybeSingle();
  const alreadyNotified: Set<string> = new Set(cfg?.value ? JSON.parse(cfg.value) : []);

  const overdue = withDeadline.filter((t:any) => {
    if (doneIds.has(t.id)) return false;
    if (alreadyNotified.has(t.id)) return false;
    const [h, m] = t.deadline.split(':').map(Number);
    return timeNow > h*60+m;
  });
  console.log(`Overdue: ${overdue.length}, templates: ${withDeadline.length}, done: ${doneIds.size}`);

  if (overdue.length === 0) {
    return new Response(JSON.stringify({sent:0, message:'No overdue', timeNow, templates:withDeadline.length, done:doneIds.size}));
  }

  const { data: subs } = await supabase.from('push_subscriptions').select('endpoint,p256dh,auth,unit_id,role');
  console.log(`Subs: ${(subs||[]).length}`);
  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({sent:0, message:'No subscriptions'}));
  }

  let sent = 0;
  const notifiedNow: string[] = [];

  for (const t of overdue) {
    const targets = (subs as any[]).filter(s => s.unit_id === t.unit_id || s.role === 'gestao' || s.role === 'gerencia');
    const payload = JSON.stringify({
      title: `⚠ Checklist atrasado — ${t.unit_id?.toUpperCase()}`,
      body: `${t.name} (${t.sector}) — prazo: ${t.deadline}`,
    });
    for (const s of targets) {
      try {
        const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        const result = await webpush.sendNotification(sub, payload, { TTL: 86400 });
        console.log(`Push sent: ${result.statusCode}`);
        if (result.statusCode >= 200 && result.statusCode < 300) sent++;
      } catch(e: any) {
        console.error(`Push error: ${e.statusCode} ${e.body}`);
      }
    }
    notifiedNow.push(t.id);
  }

  await supabase.from('config').upsert(
    { key: notifKey, value: JSON.stringify([...alreadyNotified, ...notifiedNow]), updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );

  console.log(`Done. Sent: ${sent}`);
  return new Response(JSON.stringify({sent, overdue: overdue.length}), {headers: {'Content-Type': 'application/json'}});
});
