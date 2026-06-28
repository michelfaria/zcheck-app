// IBR Checklists — notify-request v3
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_ANON_KEY') ||
  JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}').anon_key || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const { name, unitId } = body;

  webpush.setVapidDetails('mailto:ingonegocios@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('role', ['gestao', 'gerencia']);

  if (!subs || subs.length === 0)
    return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions' }));

  const unitLabel = unitId?.toUpperCase() || '';
  const payload = JSON.stringify({
    title: '👤 Nova solicitação de acesso',
    body: `${name} solicitou acesso à ${unitLabel}. Toque para revisar.`,
    url: '/usuarios',
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      const result = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload, { TTL: 86400 }
      );
      if (result.statusCode >= 200 && result.statusCode < 300) sent++;
    } catch(e: any) {
      console.error(`Push error: ${e.statusCode} ${e.body}`);
    }
  }

  console.log(`notify-request v3: sent ${sent}`);
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
