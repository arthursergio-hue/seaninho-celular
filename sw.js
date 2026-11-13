// Seaninho no celular: guarda a casca da página (abre sem rede) e mostra as notificações.
// v24 (12/11): as Decisões em cards, as Entregas, os Meus pedidos e o "⚡ Rodar no PC" (decisoes.js, entregas.js,
// pedidos.js e rodar.js entram na casca), o aviso de lote novo de decisões e o uso de IA igual ao TeamZone (ninja.js e
// usoia.js novos); v23 (11/11): o banco novo (config.js) e o push com a VAPID nova; 0.9.0.7: o workflows.js novo (o
// STATUS tolerante); 0.9.0.4: ele entra na casca
// v24, o corte de tráfego (12/11): o volta.js (a leve a cada 4 s e o inteiro só quando precisa) entra na casca; o
// CACHE continua seaninho-v24 (a v24 ainda não foi publicada); o push avisa a página aberta (ver abaixo)
// v27 (13/11, a página 0.9.0.16): a VPS no Computadores (o maquinas.js entra na casca). A v25 e a v26 são das páginas
// que vão na frente dela (a 0.9.0.15 e as reações); na junção, fica o número seguinte ao último publicado
const CACHE = "seaninho-v27";
const CASCA = ["./", "./index.html", "./config.js", "./markdown.js", "./chat.js", "./lista.js", "./workflows.js", "./pcs.js", "./maquinas.js", "./volta.js", "./usoia.js", "./ninja.js", "./marcar.js", "./decisoes.js", "./entregas.js", "./pedidos.js", "./rodar.js", "./manifest.webmanifest", "./icone-180.png", "./icone-192.png"];

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

// O aviso de decisões: a tag e o lote que a página abre ("<PC do lote>|<id>", a chave da página; só o id sem o PC).
const tagDecisoes = d => (/^dc:./.test(String(d.tag || "")) ? String(d.tag) : `dc:${d.lote || d.id || ""}`);
const loteDoAviso = d => { const id = String(d.lote || d.id || ""); return id && d.pc ? `${d.pc}|${id}` : id; };

// Corretor de 12/11 (o corte de tráfego): o aviso também vai à página aberta ({tipo: "mudou"}), que traz já o que ele
// anuncia: a lista do PC da sessão que pergunta, terminou ou parou no limite (antes, ~30 s até a lista seguinte; com 6
// sessões, mais) e o inteiro no de decisões e do Para você. Só quando há aviso: não custa nada parado.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data.json(); } catch (_) {}
  const avisar = self.registration.showNotification(d.titulo || "Seaninho", {
    // v24: um aviso por lote de decisões (com a tag de sempre, um lote apagava o aviso do outro). O agente 0.9.0.14 manda
    // o id do lote ("lote") e a tag "dc:<PC do lote>|<id>", a mesma nos dois PCs (o iPhone troca um aviso pelo outro);
    // sem ela, "dc:<lote>"
    body: d.texto || "", tag: d.tipo === "decisoes" ? tagDecisoes(d) : d.tag || d.sessao || "seaninho", data: d, icon: "icone-192.png",
  });
  const contar = self.clients.matchAll({type: "window", includeUncontrolled: true}).then(abertas => {
    for (const c of abertas) c.postMessage({tipo: "mudou", aviso: d.tipo || "", pc: d.pc || "", sessao: d.sessao || ""});
  }).catch(() => {});
  e.waitUntil(Promise.all([avisar, contar]));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const d = e.notification.data || {};
  const doPc = d.tipo === "pc" || d.tipo === "seaninho_caiu";   // 0.9.0.7: o Seaninho do PC caiu: o cartão do PC
  const url = d.tipo === "ai_rats" ? "./#airats=1"   // a prévia do post do AI Rats
    : d.tipo === "decisoes" ? `./#decisoes=1${loteDoAviso(d) ? `&lote=${encodeURIComponent(loteDoAviso(d))}` : ""}`   // v24: o lote novo, já aberto
    : d.tipo === "aparelho" ? "./#ajustes=1"   // 0.9.0: aparelho novo na conta: o ⚙ (aprovar ou não)
    : doPc ? `./#pcs=${encodeURIComponent(d.pc || "")}`   // 0.9.0: o PC caiu, voltou ou vai desligar: o cartão dele
    : d.tipo === "para_voce" || d.tipo === "teste" ? "./#pv=1"   // o Para você (0.8.9)
    : `./#sessao=${encodeURIComponent(d.sessao || "")}&pc=${encodeURIComponent(d.pc || "")}`;
  // app aberto: a página recebe o recado e abre a sessão (0.8.9; o navigate só mudava o "#" e a página não via)
  e.waitUntil(self.clients.matchAll({type: "window", includeUncontrolled: true}).then(abertas => {
    for (const c of abertas) {
      c.postMessage({tipo: "abrir", sessao: doPc ? "" : d.sessao || "", pc: d.pc || "", airats: d.tipo === "ai_rats",
                     pv: d.tipo === "para_voce" || d.tipo === "teste", ...(doPc ? {pcs: d.pc || ""} : {}),
                     ...(d.tipo === "aparelho" ? {ajustes: true, sessao: ""} : {}),
                     ...(d.tipo === "decisoes" ? {decisoes: true, sessao: "", lote: loteDoAviso(d)} : {})});
      return c.focus();
    }
    return self.clients.openWindow(url);
  }));
});
