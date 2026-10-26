// Seaninho no celular: guarda a casca da página (abre sem rede) e mostra as notificações.
const CACHE = "seaninho-v2";
const CASCA = ["./", "./index.html", "./config.js", "./manifest.webmanifest", "./icone-180.png", "./icone-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CASCA)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Rede primeiro (versão nova da página entra logo); sem rede, a cópia guardada. O Supabase nunca passa por aqui.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone();
    caches.open(CACHE).then(c => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request)));
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.titulo || "Seaninho", {
    body: d.texto || "", tag: d.sessao || "seaninho", data: d, icon: "icone-192.png",
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const d = e.notification.data || {};
  const url = `./#sessao=${encodeURIComponent(d.sessao || "")}&pc=${encodeURIComponent(d.pc || "")}`;
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(abertas => {
    for (const c of abertas) {
      if ("navigate" in c) c.navigate(url);
      return c.focus();
    }
    return self.clients.openWindow(url);
  }));
});
