// IBR Checklists — notify-status v1
// Sends push notification to a specific user (approval/rejection)
import webpush from 'https://esm.sh/web-push@3.6.7';

const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;

Deno.serve(async (req) => {
  const { subs, title, body } = await req.json().catch(() => ({}));
  if (!subs?.length) return new Response(JSON.stringify({ sent: 0 }));

  webpush.setVapidDetails('mailto:ingonegocios@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const payload = JSON.stringify({ title: title || 'IBR Checklists', body, url: '/' });
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
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } });
});
