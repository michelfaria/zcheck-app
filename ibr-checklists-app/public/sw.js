const CACHE_NAME = 'ibr-checklists-v3';

// Install: cache the app shell. '/app' entra individualmente — é a rota real
// do app nos subdomínios; sem ela, uma abertura offline após reload não tinha
// shell para servir. addAll falha em bloco, por isso o add é tolerante.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(['/', '/app'].map((u) => cache.add(u)))
    )
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          // Navegação offline sem match exato: serve o shell do app antes de
          // cair na raiz (que nos subdomínios é redirect para /app).
          return (await cache.match('/app')) || cache.match('/');
        }
        return new Response('Offline', { status: 503 });
      }
    })
  );
});

// ── Push Notifications ────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'IBR Checklists', body: event.data.text() };
  }

  const { title, body, unitId, checklistName, sector, url } = payload;

  const options = {
    body: body || `${checklistName} — ${sector} está atrasado`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `ibr-${unitId}-${checklistName}`,   // agrupa por checklist
    renotify: false,                           // não notifica de novo se já existe
    requireInteraction: false,
    // O destino do clique é o Painel — quem recebe aviso de atraso quer VER o
    // atraso, não a raiz do site. Payloads antigos (sem url) caem no mesmo lugar.
    data: { url: url || '/app?aba=painel', unitId, checklistName, sector },
    actions: [
      { action: 'open', title: 'Abrir app' },
      { action: 'dismiss', title: 'Dispensar' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title || 'IBR Checklists — Atraso', options)
  );
});

// Click na notificação → abre o app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  // A origem é a do próprio service worker — o subdomínio do tenant onde a
  // inscrição nasceu. Domínio cravado aqui já mandou o clique para o site
  // errado quando o app mudou de checklists.ilhabelarepublic.com.
  const targetUrl = new URL(
    event.notification.data?.url || '/app?aba=painel',
    self.location.origin
  ).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se já tem uma aba aberta nesta origem, navega para a URL correta
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(targetUrl);
          return;
        }
      }
      // Senão abre aba nova na mesma origem
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
