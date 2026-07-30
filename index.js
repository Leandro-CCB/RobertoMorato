// ══════════════════════════════════════════════════════════════
//  SERVICE WORKER — Grupo Bertoni PR Morato
//  Estratégia: Cache First para assets estáticos,
//              Network First para Supabase (dados sempre frescos)
// ══════════════════════════════════════════════════════════════

const CACHE_NAME = 'bertoni-pr-v2-supabase';
const CACHE_VERSION = 2;

// Assets que serão cacheados para uso offline
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-datalabels/2.2.0/chartjs-plugin-datalabels.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'
];

// ── INSTALL: faz cache dos assets estáticos ──────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando v' + CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando assets...');
        // Cacheia cada asset individualmente para não falhar tudo se um falhar
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Não cacheou:', url, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] Instalado com sucesso!');
        return self.skipWaiting(); // Ativa imediatamente
      })
  );
});

// ── ACTIVATE: limpa caches antigos ──────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Ativando...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      console.log('[SW] Ativo! Controlando todas as abas.');
      return self.clients.claim();
    })
  );
});

// ── FETCH: estratégia inteligente por tipo de request ────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase (REST/Auth) → SEMPRE busca da rede (dados em tempo real)
  if (url.hostname.endsWith('.supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Se offline e Supabase falhar, retorna resposta de erro elegante
        return new Response(
          JSON.stringify({ error: 'offline', message: 'Sem conexão com Supabase' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // jsDelivr (biblioteca supabase-js) → Cache First
  if (url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Google Fonts → Cache First (fontes raramente mudam)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // CDN (Chart.js, etc.) → Cache First
  if (url.hostname.includes('cdnjs.cloudflare.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // index.html e assets locais → Network First (sempre tenta pegar versão mais nova)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Atualiza o cache com a versão mais recente
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        // Offline → serve do cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback para index.html se for navegação
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Recurso indisponível offline.', { status: 503 });
        });
      })
  );
});

// ── MENSAGENS do app principal ────────────────────────────────
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION, cacheName: CACHE_NAME });
  }
});
