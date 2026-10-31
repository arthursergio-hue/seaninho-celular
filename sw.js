// Seaninho no celular: guarda a casca da página (abre sem rede) e mostra as notificações.
const CACHE = "seaninho-v16";
const CASCA = ["./", "./index.html", "./config.js", "./markdown.js", "./chat.js", "./lista.js", "./usoia.js", "./marcar.js", "./manifest.webmanifest", "./icone-180.png", "./icone-192.png"];

self.addEventListener("install", e => {
  // "reload": sem o cache HTTP do GitHub Pages (10 min), que podia misturar arquivos de duas versões
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CASCA.map(u => new Request(u, {cache: "reload"})))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// A página (navegação): a rede, se responder em até 2,5 s (a versão nova entra logo); senão, a cópia guardada na hora,
// e a rede atualiza a cópia por trás (0.8.9: com rede ruim, o app abria só quando a rede desistia). Os scripts e o
// resto: a rede primeiro (até 8 s) e a cópia só sem rede, para uma página nova não rodar com um script velho. Só
// guarda resposta boa (antes, um 404 ou 5xx podia virar a cópia). O Supabase nunca passa por aqui.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const guardada = await cache.match(e.request, {ignoreSearch: true});
    const pedido = e.request.mode === "navigate" ? e.request.url : e.request;   // navigate não aceita init
    const rede = fetch(pedido, {cache: "no-cache"}).then(r => {
      if (r.ok && r.type === "basic") cache.put(e.request, r.clone()).catch(() => {});
      return r;
    });
    e.waitUntil(rede.catch(() => {}));
    if (!guardada) return rede.catch(() => cache.match("./index.html").then(x => x || Response.error()));
    const boa = rede.then(r => r.ok ? r : guardada, () => guardada);
    const espera = e.request.mode === "navigate" ? 2500 : 8000;
    return Promise.race([boa, new Promise(ok => setTimeout(() => ok(guardada), espera))]);
  })());
});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.titulo || "Seaninho", {
    body: d.texto || "", tag: d.tag || d.sessao || "seaninho", data: d, icon: "icone-192.png",
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const d = e.notification.data || {};
  const url = d.tipo === "ai_rats" ? "./#airats=1"   // a prévia do post do AI Rats
    : d.tipo === "para_voce" || d.tipo === "teste" ? "./#pv=1"   // o Para você (0.8.9)
    : `./#sessao=${encodeURIComponent(d.sessao || "")}&pc=${encodeURIComponent(d.pc || "")}`;
  // app aberto: a página recebe o recado e abre a sessão (0.8.9; o navigate só mudava o "#" e a página não via)
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(abertas => {
    for (const c of abertas) {
      c.postMessage({tipo: "abrir", sessao: d.sessao || "", pc: d.pc || "", airats: d.tipo === "ai_rats", pv: d.tipo === "para_voce" || d.tipo === "teste"});
      return c.focus();
    }
    return self.clients.openWindow(url);
  }));
});
