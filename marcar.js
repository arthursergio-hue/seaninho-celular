// A imagem do chat em tela cheia (visor) e o editor de marcações, como no WhatsApp (0.8.1). SÓ DO DONO.
// A conta (zoom, limites, cores, a ponta da seta, o toque que pega uma marca, desfazer/refazer) é pura e testada no
// Node (test_marcar.cjs); o resto mexe na tela (#visor e #editor do index.html) e só roda no navegador.
(function (raiz) {
"use strict";

// ---- Conta (pura) -------------------------------------------------------------------------------------------------
const ZOOM_MAX = 6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Zoom pelo fator `f` mantendo parado o ponto (fx, fy) da tela, medido do centro do palco. e = {s, x, y}.
function zoomEm(e, f, fx, fy) {
  const s = clamp(e.s * f, 1, ZOOM_MAX), k = s / e.s;
  return {s, x: fx - k * (fx - e.x), y: fy - k * (fy - e.y)};
}

// A imagem não sai do palco: com zoom, arrasta até a borda dela; sem zoom, fica no centro.
function limitar(e, w, h, W, H) {
  const mx = Math.max(0, (w * e.s - W) / 2), my = Math.max(0, (h * e.s - H) / 2);
  return {s: e.s, x: clamp(e.x, -mx, mx), y: clamp(e.y, -my, my)};
}

// O tamanho da imagem inteira encaixada no palco.
function encaixar(nw, nh, W, H) {
  const k = Math.min(W / nw, H / nh);
  return {w: nw * k, h: nh * k};
}

function rgb(cor) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(cor || "").trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function luminancia(cor) {   // a relativa (WCAG): 0 é preto, 1 é branco
  const [r, g, b] = rgb(cor).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// A letra em cima da cor: preta nas claras (amarelo, verde, branco), branca nas outras.
const contraste = cor => (luminancia(cor) > 0.3 ? "#000000" : "#FFFFFF");

// O texto em cada estilo: só a letra (com sombra para ler em cima da foto), caixa cheia na cor (letra em contraste)
// ou fundo meio transparente (escuro; claro se a letra for escura).
const ESTILOS = ["simples", "caixa", "meio"];
function estiloTexto(cor, estilo) {
  if (estilo === "caixa") return {texto: contraste(cor), fundo: cor, sombra: false};
  if (estilo === "meio") return {texto: cor, fundo: luminancia(cor) < 0.05 ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.55)",
                                 sombra: false};
  return {texto: cor, fundo: "", sombra: true};
}

// A barra lateral (0 = fino, 1 = grosso), em px da tela: o traço (lápis, formas, borracha) e o tamanho do texto.
const larguraDa = v => 2 + clamp(v, 0, 1) * 26;
const fonteDa = v => 14 + clamp(v, 0, 1) * 50;
// O contrário: onde a barra fica para mostrar a marca selecionada (px da tela).
const barraDe = (o, k) => clamp(o.t === "texto" ? (o.tam * o.esc / k - 14) / 50 : ((o.larg || 0) / k - 2) / 26, 0, 1);

// A ponta da seta cresce com a espessura; o traço para na base dela (não fura a ponta).
function pontaDaSeta(x1, y1, x2, y2, larg) {
  const ang = Math.atan2(y2 - y1, x2 - x1), comp = Math.hypot(x2 - x1, y2 - y1);
  const L = Math.min(comp * 0.6, Math.max(14, larg * 3.4)), A = L * 0.58;
  const bx = x2 - L * Math.cos(ang), by = y2 - L * Math.sin(ang), nx = -Math.sin(ang) * A, ny = Math.cos(ang) * A;
  return {base: [bx, by], ponta: [[x2, y2], [bx + nx, by + ny], [bx - nx, by - ny]]};
}

// Cada marca tem o centro (cx, cy), o giro (rot) e o tamanho (esc); a forma fica em volta do (0, 0).
function paraLocal(o, x, y) {
  const dx = x - o.cx, dy = y - o.cy, c = Math.cos(-o.rot), s = Math.sin(-o.rot);
  return [(dx * c - dy * s) / o.esc, (dx * s + dy * c) / o.esc];
}
function paraFora(o, x, y) {
  const c = Math.cos(o.rot), s = Math.sin(o.rot), X = x * o.esc, Y = y * o.esc;
  return [o.cx + X * c - Y * s, o.cy + X * s + Y * c];
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// A caixa da marca (largura e altura, em volta do centro, sem o tamanho).
function caixa(o) {
  if (o.t !== "lapis" && o.t !== "seta") return {w: o.w, h: o.h};
  const pts = o.t === "seta" ? [o.a, o.b] : o.pts;
  let w = 0, h = 0;
  for (const [x, y] of pts) { w = Math.max(w, Math.abs(x)); h = Math.max(h, Math.abs(y)); }
  return {w: 2 * w, h: 2 * h};
}

// O toque (x, y) pega a marca? `tol`: a folga, em px da imagem. Retângulo e círculo pegam pela borda (dá para
// desenhar dentro deles); texto, por dentro.
function pega(o, x, y, tol) {
  const [lx, ly] = paraLocal(o, x, y), t = (tol + (o.larg || 0) / 2) / o.esc;
  if (o.t === "texto") return Math.abs(lx) <= o.w / 2 + t && Math.abs(ly) <= o.h / 2 + t;
  if (o.t === "ret") {
    const fora = Math.abs(lx) <= o.w / 2 + t && Math.abs(ly) <= o.h / 2 + t;
    return fora && !(Math.abs(lx) < o.w / 2 - t && Math.abs(ly) < o.h / 2 - t);
  }
  if (o.t === "circ") {
    const rx = Math.max(o.w / 2, 1), ry = Math.max(o.h / 2, 1);
    return Math.abs(Math.hypot(lx / rx, ly / ry) - 1) * Math.min(rx, ry) <= t;
  }
  const pts = o.t === "seta" ? [o.a, o.b] : o.pts;
  if (pts.length === 1) return Math.hypot(lx - pts[0][0], ly - pts[0][1]) <= t;
  for (let i = 1; i < pts.length; i++) if (distSeg(lx, ly, ...pts[i - 1], ...pts[i]) <= t) return true;
  return false;
}

// A marca de cima que o toque pega, ou -1. `filtro(o)`: só as que podem ser pegas agora.
function marcaEm(objs, x, y, tol, filtro) {
  for (let i = objs.length - 1; i >= 0; i--) if ((!filtro || filtro(objs[i])) && pega(objs[i], x, y, tol)) return i;
  return -1;
}

// A alça de mudar o tamanho: o canto de baixo, à direita, da caixa da marca.
function alca(o) {
  const {w, h} = caixa(o);
  return paraFora(o, w / 2, h / 2);
}

// Seta, retângulo ou círculo do arrasto de (x1, y1) a (x2, y2), com o centro no meio.
function forma(t, x1, y1, x2, y2, cor, larg) {
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, o = {t, cor, larg, cx, cy, rot: 0, esc: 1};
  if (t === "seta") return Object.assign(o, {a: [x1 - cx, y1 - cy], b: [x2 - cx, y2 - cy]});
  return Object.assign(o, {w: Math.abs(x2 - x1), h: Math.abs(y2 - y1)});
}

// O traço do lápis com o centro no meio dele, para mover, girar e mudar de tamanho como as outras marcas.
function traco(pts, cor, larg) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  return {t: "lapis", cor, larg, cx, cy, rot: 0, esc: 1, pts: pts.map(([x, y]) => [x - cx, y - cy])};
}

// Dois dedos na marca: ela vai com o meio dos dedos, gira com eles e muda de tamanho com a distância.
function doisDedos(o0, a0, b0, a1, b1) {
  const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1, d1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
  const ang = Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) - Math.atan2(b0[1] - a0[1], b0[0] - a0[0]);
  const esc = clamp(o0.esc * d1 / d0, 0.2, 12), k = esc / o0.esc, c = Math.cos(ang), s = Math.sin(ang);
  const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2], m1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
  const vx = o0.cx - m0[0], vy = o0.cy - m0[1];
  return {...o0, esc, rot: o0.rot + ang, cx: m1[0] + k * (vx * c - vy * s), cy: m1[1] + k * (vx * s + vy * c)};
}

// A alça arrastada até (x, y): retângulo e círculo mudam a caixa; texto, seta e traço mudam de tamanho por igual.
function redimensionar(o0, x, y) {
  const [lx, ly] = paraLocal(o0, x, y);
  if (o0.t === "ret" || o0.t === "circ") return {...o0, w: Math.max(6, 2 * Math.abs(lx)), h: Math.max(6, 2 * Math.abs(ly))};
  const {w, h} = caixa(o0), d0 = Math.hypot(w / 2, h / 2) || 1;
  return {...o0, esc: clamp(o0.esc * Math.hypot(lx, ly) / d0, 0.2, 12)};
}

// Desfazer e refazer: cada mudança guarda como estava antes.
function historia() {
  return {
    antes: [], depois: [],
    guardar(anterior) { this.antes.push(anterior); this.depois = []; if (this.antes.length > 100) this.antes.shift(); },
    desfazer(atual) { if (!this.antes.length) return null; this.depois.push(JSON.stringify(atual)); return JSON.parse(this.antes.pop()); },
    refazer(atual) { if (!this.depois.length) return null; this.antes.push(JSON.stringify(atual)); return JSON.parse(this.depois.pop()); },
  };
}

// O nome do arquivo com a extensão do que ele é (a foto do Claude chega em JPEG, mesmo a de um .png).
function nomeDoArquivo(nome, mime) {
  const ext = {"image/png": "png", "image/webp": "webp", "image/gif": "gif"}[mime] || "jpg";
  const base = String(nome || "").replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[\\/:*?"<>|]+/g, " ").trim();
  return (base || "imagem") + "." + ext;
}

// A imagem de um data URL, para salvar ou compartilhar (sem esperar: o iPhone só compartilha no toque).
function blobDe(url) {
  const [cab, b64] = String(url).split(",");
  const mime = (/data:([^;,]+)/.exec(cab) || [])[1] || "image/jpeg";
  const bin = atob(b64 || ""), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], {type: mime});
}

const Conta = {zoomEm, limitar, encaixar, contraste, luminancia, estiloTexto, ESTILOS, larguraDa, fonteDa, pontaDaSeta,
  paraLocal, paraFora, caixa, pega, marcaEm, alca, forma, traco, doisDedos, redimensionar, historia, barraDe,
  nomeDoArquivo};
if (typeof module !== "undefined" && module.exports) { module.exports = Conta; return; }

// ---- Na tela --------------------------------------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const guardado = {
  get(k) { try { return localStorage.getItem(k) || ""; } catch { return ""; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const ICONE = {
  lapis: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>',
  borracha: '<path d="M8 20h12"/><path d="M5 15l9-9 5 5-8 8H9z"/><path d="M10 10l5 5"/>',
  texto: '<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>',
  seta: '<path d="M5 19L19 5"/><path d="M10 5h9v9"/>',
  ret: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>',
  circ: '<circle cx="12" cy="12" r="8"/>',
  desfazer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  refazer: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  lixo: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  salvar: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  compartilhar: '<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const svg = nome => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONE[nome]}</svg>`;
const CORES = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#00C7BE", "#0A84FF", "#5856D6", "#AF52DE", "#FF2D55",
               "#A2845E", "#FFFFFF", "#8E8E93", "#000000"];
const podeCompartilhar = () => typeof navigator !== "undefined" && !!navigator.share && !!navigator.canShare;

// Salva no celular: o iPhone abre a folha de compartilhar (com "Salvar Imagem"); sem ela, baixa o arquivo.
function salvar(url, nome) {
  const blob = blobDe(url), arq = new File([blob], nomeDoArquivo(nome, blob.type), {type: blob.type});
  if (podeCompartilhar() && navigator.canShare({files: [arq]}))
    return navigator.share({files: [arq]}).then(() => "ok", e => (e && e.name === "AbortError" ? "cancelado" : baixar(arq)));
  return Promise.resolve(baixar(arq));
}
function baixar(arq) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(arq);
  a.download = arq.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return "baixado";
}

// As imagens grandes das que mandei daqui (o localStorage só comporta as miniaturas): as 30 mais novas.
const Grandes = {
  _db: null,
  abrir() {
    if (!this._db) this._db = new Promise((ok, falha) => {
      const r = indexedDB.open("seaninho", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("grandes");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => falha(r.error);
    });
    return this._db;
  },
  async guardar(id, url) {
    try {
      const db = await this.abrir();
      const loja = db.transaction("grandes", "readwrite").objectStore("grandes"), todas = [];
      loja.put({url, t: Date.now()}, id);
      loja.openCursor().onsuccess = e => {   // as mais velhas saem ainda dentro da transação
        const c = e.target.result;
        if (c) { todas.push([c.key, c.value.t]); return c.continue(); }
        todas.sort((a, b) => b[1] - a[1]).slice(30).forEach(([k]) => loja.delete(k));
      };
    } catch {}
  },
  async ler(id) {
    try {
      const db = await this.abrir();
      return await new Promise(ok => {
        const r = db.transaction("grandes").objectStore("grandes").get(id);
        r.onsuccess = () => ok((r.result && r.result.url) || "");
        r.onerror = () => ok("");
      });
    } catch { return ""; }
  },
};

// ---- Visor: a imagem em tela cheia (pinça, arrastar, toque duplo, deslizar para o lado ou para fechar) -------------
const V = {e: {s: 1, x: 0, y: 0}, dedos: new Map(), w: 0, h: 0, W: 0, H: 0, opts: null, toque: null, unico: 0};

// opts: {lista: [{src, nome, sub, chave?}], indice, aoMarcar(foto)?} (ou uma foto só: {src, nome, ...}).
function ver(opts) {
  const lista = opts.lista || [opts];
  V.opts = {...opts, lista, indice: clamp(opts.indice || 0, 0, lista.length - 1)};
  $("vTopo").classList.remove("some");
  $("visor").style.background = "";
  $("visor").classList.remove("hidden");
  mostrarFoto();
}
const fotoAtual = () => V.opts && V.opts.lista[V.opts.indice];
function mostrarFoto() {
  const f = fotoAtual(), img = $("vImg"), n = V.opts.lista.length;
  img.onload = encaixarVisor;
  img.src = f.src;
  img.alt = f.nome || "Imagem";
  $("vNome").innerHTML = "";
  $("vNome").append(f.nome || "Imagem");
  const sub = [f.sub, n > 1 ? `${V.opts.indice + 1} de ${n}` : ""].filter(Boolean).join(" · ");
  if (sub) { const el = document.createElement("small"); el.textContent = sub; $("vNome").append(el); }
  $("vMarcar").classList.toggle("hidden", !V.opts.aoMarcar);
  V.e = {s: 1, x: 0, y: 0};
  aplicar(false);
  if (f.chave && !f.grande) Grandes.ler(f.chave).then(url => {   // a minha foto: a grande, guardada no celular
    if (!url) return;
    Object.assign(f, {src: url, grande: true});
    if (fotoAtual() === f) img.src = url;
  });
}
function passar(passo) {
  const i = V.opts.indice + passo;
  if (i < 0 || i >= V.opts.lista.length) return false;
  V.opts.indice = i;
  mostrarFoto();
  return true;
}
function fecharVisor() {
  $("visor").classList.add("hidden");
  $("vImg").removeAttribute("src");
  V.opts = null; V.dedos.clear();
}
function encaixarVisor() {
  const img = $("vImg"), p = $("vPalco").getBoundingClientRect();
  if (!img.naturalWidth || !p.width) return;
  const {w, h} = encaixar(img.naturalWidth, img.naturalHeight, p.width, p.height);
  Object.assign(V, {w, h, W: p.width, H: p.height});
  Object.assign(img.style, {width: w + "px", height: h + "px", left: (p.width - w) / 2 + "px", top: (p.height - h) / 2 + "px"});
  V.e = limitar(V.e, w, h, p.width, p.height);
  aplicar(false);
}
function aplicar(animar, dy = 0, dx = 0) {
  const img = $("vImg");
  img.style.transition = animar ? "transform .22s ease" : "none";
  img.style.transform = `translate(${V.e.x + dx}px, ${V.e.y + dy}px) scale(${V.e.s})`;
}
function pontoVisor(e) {   // do centro do palco
  const p = $("vPalco").getBoundingClientRect();
  return [e.clientX - p.left - p.width / 2, e.clientY - p.top - p.height / 2];
}
function dedosVisor() {
  const [a, b] = [...V.dedos.values()];
  return {d: Math.hypot(b[0] - a[0], b[1] - a[1]), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]};
}
function visorDown(e) {
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  V.dedos.set(e.pointerId, pontoVisor(e));
  if (V.dedos.size === 2) { V.pinca = {...dedosVisor(), e0: {...V.e}}; V.toque = null; }
  else if (V.dedos.size === 1) V.toque = {p0: pontoVisor(e), e0: {...V.e}, t0: Date.now(), moveu: false, modo: ""};
}
function visorMove(e) {
  if (!V.dedos.has(e.pointerId)) return;
  V.dedos.set(e.pointerId, pontoVisor(e));
  if (V.dedos.size >= 2 && V.pinca) {
    const {d, m} = dedosVisor(), p0 = V.pinca;
    const z = zoomEm(p0.e0, d / (p0.d || 1), p0.m[0], p0.m[1]);
    V.e = {s: z.s, x: z.x + m[0] - p0.m[0], y: z.y + m[1] - p0.m[1]};
    return aplicar(false);
  }
  const t = V.toque;
  if (!t) return;
  const [x, y] = pontoVisor(e), dx = x - t.p0[0], dy = y - t.p0[1];
  if (!t.moveu && Math.hypot(dx, dy) > 8) {   // sem zoom: para cima/baixo fecha, para o lado passa de foto
    t.moveu = true;
    t.modo = t.e0.s > 1.02 ? "arrastar" : Math.abs(dy) > Math.abs(dx) ? "fechar" : V.opts.lista.length > 1 ? "passar" : "arrastar";
  }
  if (!t.moveu) return;
  if (t.modo === "fechar") {   // a imagem acompanha o dedo e o fundo clareia
    $("visor").style.background = `rgba(0,0,0,${Math.max(0.25, 1 - Math.abs(dy) / 420)})`;
    return aplicar(false, dy);
  }
  if (t.modo === "passar") return aplicar(false, 0, dx);
  V.e = limitar({s: t.e0.s, x: t.e0.x + dx, y: t.e0.y + dy}, V.w, V.h, V.W, V.H);
  aplicar(false);
}
function visorUp(e) {
  if (!V.dedos.delete(e.pointerId)) return;
  if (V.dedos.size === 1 && V.pinca) {   // soltou um dedo da pinça: o outro continua arrastando
    V.pinca = null;
    V.toque = {p0: [...V.dedos.values()][0], e0: {...V.e}, t0: Date.now(), moveu: true, modo: "arrastar"};
    return;
  }
  if (V.dedos.size) return;
  const t = V.toque, pinca = V.pinca;
  V.toque = V.pinca = null;
  if (pinca || (t && t.modo === "arrastar")) { V.e = limitar(V.e, V.w, V.h, V.W, V.H); return aplicar(true); }
  if (!t) return;
  const [x, y] = pontoVisor(e), dx = x - t.p0[0], dy = y - t.p0[1], ms = Math.max(1, Date.now() - t.t0);
  if (t.modo === "fechar") {
    if (Math.abs(dy) > 110 || Math.abs(dy) / ms > 0.6) return fecharVisor();
    $("visor").style.background = "";
    return aplicar(true);
  }
  if (t.modo === "passar") {
    if ((Math.abs(dx) > 80 || Math.abs(dx) / ms > 0.5) && passar(dx < 0 ? 1 : -1)) return;
    return aplicar(true);
  }
  // toque: duplo amplia (ou volta); um só mostra ou esconde a barra de cima
  const agora = Date.now(), p = t.p0;
  if (V.ultimo && agora - V.ultimo.t < 300 && Math.hypot(p[0] - V.ultimo.p[0], p[1] - V.ultimo.p[1]) < 30) {
    clearTimeout(V.unico); V.ultimo = null;
    V.e = V.e.s > 1.05 ? {s: 1, x: 0, y: 0} : limitar(zoomEm(V.e, 2.5, p[0], p[1]), V.w, V.h, V.W, V.H);
    return aplicar(true);
  }
  V.ultimo = {t: agora, p};
  clearTimeout(V.unico);
  V.unico = setTimeout(() => $("vTopo").classList.toggle("some"), 300);
}

// ---- Editor de marcações -------------------------------------------------------------------------------------------
const E = {objs: [], hist: historia(), ferramenta: "lapis", cor: "#FF3B30", v: 0.25, estilo: "simples", sel: -1,
           base: null, opts: null, gesto: null, dedos: new Map(), cliente: new Map(), escrevendo: null, enviando: false,
           vista: {s: 1, x: 0, y: 0}, fit: {w: 0, h: 0, W: 0, H: 0}, fitBase: 0};
try {   // o último jeito usado
  const g = JSON.parse(guardado.get("seaninho.marcar") || "{}");
  if (g.cor) E.cor = g.cor;
  if (typeof g.v === "number") E.v = g.v;
  if (ESTILOS.includes(g.estilo)) E.estilo = g.estilo;
  if (g.ferramenta && ICONE[g.ferramenta]) E.ferramenta = g.ferramenta;
} catch {}
const lembrar = () => guardado.set("seaninho.marcar", JSON.stringify({cor: E.cor, v: E.v, estilo: E.estilo, ferramenta: E.ferramenta}));
const tela = () => $("eTela");
// px da imagem por px da tela, sem o teclado: com ele aberto a imagem encolhe, e o texto escrito nessa hora cresceria.
const escala = () => { const c = tela(), w = (E.fitBase || c.getBoundingClientRect().width) * E.vista.s; return w ? c.width / w : 1; };
const fonte = tam => `600 ${Math.max(4, tam).toFixed(1)}px -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif`;
const linhas = o => String(o.texto || "").split("\n");

function editar(opts) {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // fecha o teclado do chat
  E.opts = opts; E.fitBase = 0;
  E.objs = []; E.hist = historia(); E.sel = -1; E.gesto = null; E.dedos.clear(); E.cliente.clear(); E.escrevendo = null;
  E.enviando = false; E.vista = {s: 1, x: 0, y: 0};
  $("eErro").classList.add("hidden");
  $("eEscrever").classList.add("hidden");
  $("eLegenda").value = opts.legenda || "";
  $("editor").classList.remove("hidden");
  alturaEditor();
  ajustarLegenda();
  botoesEditor();
  const img = new Image();
  img.onload = () => {
    // a marca fica nítida: a imagem vai a 1200–1600 px (a miniatura do Claude é ampliada; a grande, reduzida)
    const lado = Math.max(img.naturalWidth, img.naturalHeight), L = Math.min(1600, Math.max(1200, lado)), k = L / lado;
    const base = document.createElement("canvas");
    base.width = Math.round(img.naturalWidth * k); base.height = Math.round(img.naturalHeight * k);
    const bc = base.getContext("2d");
    bc.imageSmoothingQuality = "high";
    bc.drawImage(img, 0, 0, base.width, base.height);
    E.base = base;
    tela().width = base.width; tela().height = base.height;
    encaixarEditor();
    desenhar();
  };
  img.onerror = () => erroEditor("Não consegui abrir a imagem para marcar.");
  img.src = opts.src;
}

function sairEditor(perguntar = true) {   // true se saiu
  if (perguntar && E.objs.length && !confirm("Descartar as marcações?")) return false;
  if (E.escrevendo) fimDeEscrever();
  $("editor").classList.add("hidden");
  const opts = E.opts;
  E.opts = null; E.base = null;
  if (opts && opts.aoSair) opts.aoSair($("eLegenda").value);
  return true;
}

function alturaEditor() {
  const vv = window.visualViewport, el = $("editor");
  el.style.setProperty("--altura", Math.round(vv ? vv.height : innerHeight) + "px");
  el.style.top = (vv ? Math.max(0, vv.offsetTop) : 0) + "px";
}
function encaixarEditor() {
  const c = tela(), p = $("ePalco").getBoundingClientRect();
  if (!c.width || !p.width) return;
  const {w, h} = encaixar(c.width, c.height, Math.max(40, p.width - 24), Math.max(40, p.height - 16));
  c.style.width = Math.floor(w) + "px"; c.style.height = Math.floor(h) + "px";
  E.fit = {w: Math.floor(w), h: Math.floor(h), W: p.width, H: p.height};
  const digitando = !!E.escrevendo || [$("eLegenda"), $("eTexto")].includes(document.activeElement);
  if (!digitando || !E.fitBase) E.fitBase = E.fit.w;   // o tamanho sem o teclado
  aplicarVista(false);
}
function aplicarVista(animar) {
  const v = E.vista = limitar(E.vista, E.fit.w, E.fit.h, E.fit.W, E.fit.H), c = tela();
  c.style.transition = animar ? "transform .2s ease" : "none";
  c.style.transform = `translate(-50%, -50%) translate(${v.x}px, ${v.y}px) scale(${v.s})`;
  $("eZoom").classList.toggle("hidden", v.s < 1.05);
}
function clienteEditor(e) {   // do centro do palco, em px da tela
  const p = $("ePalco").getBoundingClientRect();
  return [e.clientX - p.left - p.width / 2, e.clientY - p.top - p.height / 2];
}

function erroEditor(msg) {
  $("eErro").textContent = msg;
  $("eErro").classList.toggle("hidden", !msg);
}

// ---- Desenho
function arredondado(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function medirTexto(o) {   // a caixa do texto, sem o tamanho (esc)
  const ctx = tela().getContext("2d");
  ctx.save(); ctx.font = fonte(o.tam);
  const ls = linhas(o), largura = Math.max(...ls.map(l => ctx.measureText(l || " ").width));
  ctx.restore();
  const pad = o.tam * 0.4;
  o.w = largura + 2 * pad; o.h = ls.length * o.tam * 1.22 + pad * 1.3;
  return o;
}

function desenharMarca(ctx, o) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = o.cor;
  ctx.lineWidth = o.larg; ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (o.t === "lapis") {
    const p = o.pts.map(([x, y]) => paraFora(o, x, y));
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], o.larg / 2, 0, 2 * Math.PI); ctx.fill(); }
    else {   // curva suave pelos meios dos pontos
      ctx.beginPath(); ctx.moveTo(...p[0]);
      for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
      ctx.lineTo(...p[p.length - 1]); ctx.stroke();
    }
  } else if (o.t === "seta") {
    const [a, b] = [paraFora(o, ...o.a), paraFora(o, ...o.b)], s = pontaDaSeta(a[0], a[1], b[0], b[1], o.larg);
    ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...s.base); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(...s.ponta[0]); ctx.lineTo(...s.ponta[1]); ctx.lineTo(...s.ponta[2]); ctx.closePath();
    ctx.lineWidth = Math.max(1, o.larg * 0.35); ctx.fill(); ctx.stroke();
  } else if (o.t === "ret" || o.t === "circ") {
    ctx.translate(o.cx, o.cy); ctx.rotate(o.rot);
    const w = o.w * o.esc, h = o.h * o.esc;
    ctx.beginPath();
    if (o.t === "ret") ctx.rect(-w / 2, -h / 2, w, h);
    else ctx.ellipse(0, 0, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, 2 * Math.PI);
    ctx.stroke();
  } else if (o.t === "texto") {
    const st = estiloTexto(o.cor, o.estilo), tam = o.tam * o.esc, w = o.w * o.esc, h = o.h * o.esc, ls = linhas(o);
    ctx.translate(o.cx, o.cy); ctx.rotate(o.rot);
    if (st.fundo) { ctx.fillStyle = st.fundo; arredondado(ctx, -w / 2, -h / 2, w, h, tam * 0.32); ctx.fill(); }
    ctx.font = fonte(tam); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = st.texto;
    if (st.sombra) { ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = tam * 0.2; ctx.shadowOffsetY = tam * 0.04; }
    ls.forEach((l, j) => ctx.fillText(l, 0, (j - (ls.length - 1) / 2) * tam * 1.22));
  }
  ctx.restore();
}

function desenharSelecao(ctx, o, k) {
  const {w, h} = caixa(o), pad = (o.larg || 0) / 2 + 8 * k;
  ctx.save();
  ctx.translate(o.cx, o.cy); ctx.rotate(o.rot);
  const W = w * o.esc + 2 * pad, H = h * o.esc + 2 * pad;
  ctx.setLineDash([6 * k, 5 * k]); ctx.lineWidth = 1.5 * k;
  ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.strokeRect(-W / 2, -H / 2, W, H);
  ctx.setLineDash([]);
  ctx.restore();
  const [ax, ay] = alca(o);
  ctx.save();
  ctx.beginPath(); ctx.arc(ax, ay, 9 * k, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 2.5 * k; ctx.strokeStyle = "#0A84FF"; ctx.stroke();
  ctx.restore();
}

function compor(ctx, comSelecao) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (E.base) ctx.drawImage(E.base, 0, 0);
  const sem = E.escrevendo && E.escrevendo.i != null ? E.escrevendo.i : -1;   // o texto sendo escrito fica na caixa
  E.objs.forEach((o, i) => { if (i !== sem) desenharMarca(ctx, o); });
  if (comSelecao && E.sel >= 0 && E.objs[E.sel] && E.sel !== sem) desenharSelecao(ctx, E.objs[E.sel], escala());
}
function desenhar() {
  if (!E.base) return;
  compor(tela().getContext("2d"), true);
}
// A imagem marcada, do tamanho da base, sem a seleção.
function exportar() {
  const c = document.createElement("canvas");
  c.width = tela().width; c.height = tela().height;
  compor(c.getContext("2d"), false);
  return c;
}

// ---- Botões, cores e a barra de espessura
function botoesEditor() {
  document.querySelectorAll("#eFerr [data-f]").forEach(b => b.classList.toggle("on", b.dataset.f === E.ferramenta));
  document.querySelectorAll("#eCores .e-cor[data-cor]").forEach(b => b.classList.toggle("on", b.dataset.cor.toLowerCase() === E.cor.toLowerCase()));
  const livre = !CORES.some(c => c.toLowerCase() === E.cor.toLowerCase());
  $("eCorLivre").classList.toggle("on", livre);
  $("eCorLivre").style.setProperty("--c", livre ? E.cor : "");
  const sel = E.objs[E.sel];
  const texto = E.ferramenta === "texto" || !!E.escrevendo || (sel && sel.t === "texto");
  $("eEstilo").classList.toggle("hidden", !texto);
  $("eEstilo").dataset.estilo = E.estilo;
  $("eEstilo").setAttribute("aria-label", {simples: "Texto sem fundo", caixa: "Texto com caixa", meio: "Texto com fundo transparente"}[E.estilo]);
  $("eDesfazer").disabled = !E.hist.antes.length;
  $("eRefazer").disabled = !E.hist.depois.length;
  $("eApagar").classList.toggle("hidden", !sel || (!!E.escrevendo && E.escrevendo.i == null));
  $("eBola").style.top = (1 - E.v) * 100 + "%";
  $("eBarra").setAttribute("aria-valuenow", String(Math.round(E.v * 100)));
  if (E.escrevendo) estiloDaCaixa();
}

// Muda a marca selecionada (ou o texto sendo escrito) com a cor, a espessura ou o estilo novos.
function mudarSelecao(fn) {
  if (E.escrevendo) { estiloDaCaixa(); return; }
  const o = E.objs[E.sel];
  if (!o) return;
  const antes = JSON.stringify(E.objs);
  fn(o);
  if (o.t === "texto") medirTexto(o);
  if (JSON.stringify(E.objs) !== antes) E.hist.guardar(antes);
  desenhar();
}

function escolherCor(cor) {
  E.cor = cor;
  lembrar();
  mudarSelecao(o => { o.cor = cor; });
  botoesEditor();
}

function previa(mostrar) {
  const p = $("ePrevia");
  clearTimeout(E.somePrevia);
  if (!mostrar) { E.somePrevia = setTimeout(() => p.classList.add("hidden"), 700); return; }
  const sel = E.objs[E.sel], texto = E.ferramenta === "texto" || E.escrevendo || (sel && sel.t === "texto");
  const r = $("eBarra").getBoundingClientRect(), pr = $("ePalco").getBoundingClientRect();
  p.style.top = (r.top - pr.top + (1 - E.v) * r.height) + "px";
  if (texto) p.innerHTML = `<span style="font:${fonte(fonteDa(E.v))};color:${E.cor}">Aa</span>`;
  else {
    const d = larguraDa(E.v);
    p.innerHTML = `<i style="width:${d}px;height:${d}px;background:${E.ferramenta === "borracha" ? "transparent" : E.cor}"></i>`;
  }
  p.classList.remove("hidden");
}

function barraDown(e) {
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  E.barra = {antes: JSON.stringify(E.objs)};
  barraMove(e);
}
function barraMove(e) {
  if (!E.barra) return;
  const r = $("eBarra").getBoundingClientRect();
  E.v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
  const k = escala(), o = E.objs[E.sel];
  if (E.escrevendo) { E.escrevendo.tam = fonteDa(E.v) * k; estiloDaCaixa(); }
  else if (o) {
    if (o.t === "texto") { o.tam = fonteDa(E.v) * k / o.esc; medirTexto(o); }
    else o.larg = larguraDa(E.v) * k;
    desenhar();
  }
  botoesEditor();
  previa(true);
}
function barraUp() {
  if (!E.barra) return;
  if (JSON.stringify(E.objs) !== E.barra.antes) E.hist.guardar(E.barra.antes);
  E.barra = null;
  lembrar();
  botoesEditor();
  previa(false);
}

// ---- Toques na imagem
function pontoEditor(e) {
  const c = tela(), r = c.getBoundingClientRect();
  return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height];
}

function apagarEm(x, y, raio, de) {   // de: o ponto anterior (o caminho do dedo entre os dois também apaga)
  const passos = de ? Math.max(1, Math.ceil(Math.hypot(x - de[0], y - de[1]) / (raio / 2))) : 1;
  for (let n = 1; n <= passos; n++) {
    const px = de ? de[0] + (x - de[0]) * n / passos : x, py = de ? de[1] + (y - de[1]) * n / passos : y;
    for (let i = E.objs.length - 1; i >= 0; i--) {
      if (!pega(E.objs[i], px, py, raio)) continue;
      E.objs.splice(i, 1);
      if (E.sel === i) E.sel = -1; else if (E.sel > i) E.sel--;
    }
  }
}

function editorDown(e) {
  if (E.escrevendo || !E.base) return;
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  const p = pontoEditor(e), [x, y] = p, k = escala();
  E.dedos.set(e.pointerId, p);
  E.cliente.set(e.pointerId, clienteEditor(e));
  if (E.dedos.size === 2) {   // o segundo dedo: na marca, gira e muda o tamanho dela; fora, zoom na imagem
    const g = E.gesto;
    if (g && g.tipo === "lapis" && E.objs.includes(g.o)) E.objs.splice(E.objs.indexOf(g.o), 1);   // era o começo da pinça
    if (g && g.tipo === "forma" && g.o && E.objs.includes(g.o)) E.objs.splice(E.objs.indexOf(g.o), 1);
    const i = g && (g.tipo === "mover" || g.tipo === "alca") ? g.i : -1;
    const [a, b] = [...E.dedos.values()], inicio = (g && g.inicio) || JSON.stringify(E.objs);
    if (i >= 0 && E.objs[i]) { E.gesto = {tipo: "dois", i, o0: {...E.objs[i]}, a0: a, b0: b, inicio}; E.sel = i; }
    else {
      const [ca, cb] = [...E.cliente.values()];
      E.gesto = {tipo: "zoom", inicio, v0: {...E.vista}, d0: Math.hypot(cb[0] - ca[0], cb[1] - ca[1]) || 1,
                 m0: [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2]};
    }
    return desenhar();
  }
  if (E.dedos.size > 2) return;
  const inicio = JSON.stringify(E.objs), tol = 14 * k;
  const sel = E.objs[E.sel];
  if (E.ferramenta !== "borracha" && sel && Math.hypot(x - alca(sel)[0], y - alca(sel)[1]) < 24 * k) {
    E.gesto = {tipo: "alca", i: E.sel, o0: {...sel}, inicio};
    return;
  }
  // o texto se pega com qualquer ferramenta (menos a borracha); as formas, com as ferramentas de forma e de texto
  const formas = !["lapis", "borracha"].includes(E.ferramenta);
  const i = E.ferramenta === "borracha" ? -1 : marcaEm(E.objs, x, y, tol, o => o.t === "texto" || formas);
  if (i >= 0) {
    E.sel = i;
    E.v = barraDe(E.objs[i], k);
    E.gesto = {tipo: "mover", i, o0: {...E.objs[i]}, p0: p, inicio, moveu: false};
  } else if (E.ferramenta === "lapis") {
    E.sel = -1;
    const o = {t: "lapis", cor: E.cor, larg: larguraDa(E.v) * k, pts: [p], cx: 0, cy: 0, rot: 0, esc: 1};
    E.objs.push(o);
    E.gesto = {tipo: "lapis", o, inicio};
  } else if (E.ferramenta === "borracha") {
    E.sel = -1;
    E.gesto = {tipo: "borracha", inicio, raio: larguraDa(E.v) * k / 2 + 6 * k, ultimo: p};
    apagarEm(x, y, E.gesto.raio);
  } else {
    E.sel = -1;
    E.gesto = E.ferramenta === "texto" ? {tipo: "texto", p0: p, moveu: false} : {tipo: "forma", p0: p, o: null, inicio};
  }
  botoesEditor();
  desenhar();
}

function editorMove(e) {
  if (!E.dedos.has(e.pointerId)) return;
  const p = pontoEditor(e), [x, y] = p, k = escala(), g = E.gesto;
  E.dedos.set(e.pointerId, p);
  E.cliente.set(e.pointerId, clienteEditor(e));
  if (!g) return;
  if (g.tipo === "zoom") {
    if (E.cliente.size < 2) return;
    const [a, b] = [...E.cliente.values()], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const z = zoomEm(g.v0, Math.hypot(b[0] - a[0], b[1] - a[1]) / g.d0, g.m0[0], g.m0[1]);
    E.vista = {s: z.s, x: z.x + m[0] - g.m0[0], y: z.y + m[1] - g.m0[1]};
    return aplicarVista(false);
  }
  if (g.tipo === "dois") {
    if (E.dedos.size < 2) return;
    const [a, b] = [...E.dedos.values()];
    E.objs[g.i] = doisDedos(g.o0, g.a0, g.b0, a, b);
  } else if (E.dedos.size > 1 || g.tipo === "nada") {
    return;
  } else if (g.tipo === "lapis") {
    const u = g.o.pts[g.o.pts.length - 1];
    if (Math.hypot(x - u[0], y - u[1]) > 1.5 * k) g.o.pts.push(p);
  } else if (g.tipo === "borracha") {
    apagarEm(x, y, g.raio, g.ultimo);
    g.ultimo = p;
  } else if (g.tipo === "mover") {
    if (!g.moveu && Math.hypot(x - g.p0[0], y - g.p0[1]) < 6 * k) return;
    g.moveu = true;
    E.objs[g.i] = {...g.o0, cx: g.o0.cx + x - g.p0[0], cy: g.o0.cy + y - g.p0[1]};
  } else if (g.tipo === "alca") {
    E.objs[g.i] = redimensionar(g.o0, x, y);
  } else if (g.tipo === "forma") {
    if (!g.o && Math.hypot(x - g.p0[0], y - g.p0[1]) < 4 * k) return;
    const nova = forma(E.ferramenta, g.p0[0], g.p0[1], x, y, E.cor, larguraDa(E.v) * k);
    if (!g.o) { g.o = nova; E.objs.push(nova); } else Object.assign(g.o, nova);
  } else if (g.tipo === "texto") {
    g.moveu = g.moveu || Math.hypot(x - g.p0[0], y - g.p0[1]) > 8 * k;
  }
  desenhar();
}

function editorUp(e) {
  E.cliente.delete(e.pointerId);
  if (!E.dedos.delete(e.pointerId)) return;
  const g = E.gesto;
  if (!g || E.dedos.size) return;   // espera todos os dedos saírem
  E.gesto = null;
  if (g.tipo === "zoom" && E.vista.s < 1.05) { E.vista = {s: 1, x: 0, y: 0}; aplicarVista(true); }
  if (g.tipo === "lapis") E.objs[E.objs.indexOf(g.o)] = traco(g.o.pts, g.o.cor, g.o.larg);
  if (g.tipo === "forma" && g.o) E.sel = E.objs.indexOf(g.o);
  if (g.tipo === "texto" && !g.moveu) return escrever(null, g.p0);
  if (g.tipo === "mover" && !g.moveu && E.objs[g.i].t === "texto") { E.objs[g.i] = g.o0; return escrever(g.i); }
  if (g.inicio && JSON.stringify(E.objs) !== g.inicio) E.hist.guardar(g.inicio);
  botoesEditor();
  desenhar();
}

// ---- Texto: escreve numa caixa por cima (com o teclado), depois arrasta, gira e muda de tamanho
function escrever(i, p) {
  const o = i != null ? E.objs[i] : null, k = escala();
  if (o) { E.cor = o.cor; E.estilo = o.estilo; E.v = barraDe(o, k); }
  // tam: o tamanho na imagem (px); só muda se a barra mexer agora (o texto ampliado com dois dedos fica como está)
  E.escrevendo = {i, p: p || [tela().width / 2, tela().height / 2], tam: o ? o.tam * o.esc : fonteDa(E.v) * k};
  E.sel = i != null ? i : -1;
  $("eTexto").value = o ? o.texto : "";
  $("eEscrever").classList.remove("hidden");
  botoesEditor();
  estiloDaCaixa();
  desenhar();
  $("eTexto").focus();
}
function estiloDaCaixa() {
  const st = estiloTexto(E.cor, E.estilo), t = $("eTexto");
  // a caixa nunca abaixo de 16 px: menor que isso, o iPhone amplia a página quando ela ganha o foco
  const tam = E.escrevendo ? E.escrevendo.tam / escala() : fonteDa(E.v);
  Object.assign(t.style, {color: st.texto, background: st.fundo || "transparent", fontSize: clamp(tam, 16, 56) + "px",
                          textShadow: st.sombra ? "0 1px 6px rgba(0,0,0,.6)" : "none"});
  t.style.height = "auto";
  t.style.height = Math.min(t.scrollHeight, 260) + "px";
}
function fimDeEscrever() {
  const w = E.escrevendo;
  if (!w) return;
  E.escrevendo = null;
  const texto = $("eTexto").value.replace(/\s+$/, ""), antes = JSON.stringify(E.objs);
  if (w.i != null) {
    const o = E.objs[w.i];
    if (!o || o.t !== "texto") { /* saiu enquanto escrevia (desfazer): nada a gravar */ }
    else if (!texto.trim()) { E.objs.splice(w.i, 1); E.sel = -1; }
    else { Object.assign(o, {texto, cor: E.cor, estilo: E.estilo, tam: w.tam / o.esc}); medirTexto(o); }
  } else if (texto.trim()) {
    E.objs.push(medirTexto({t: "texto", texto, cor: E.cor, estilo: E.estilo, tam: w.tam, larg: 0,
                            cx: w.p[0], cy: w.p[1], rot: 0, esc: 1}));
    E.sel = E.objs.length - 1;
  }
  if (JSON.stringify(E.objs) !== antes) E.hist.guardar(antes);
  $("eEscrever").classList.add("hidden");
  $("eTexto").blur();
  lembrar();
  botoesEditor();
  desenhar();
}

// ---- Desfazer, refazer, apagar, salvar, mandar
function voltar(refazer) {
  if (E.escrevendo) fimDeEscrever();
  const objs = refazer ? E.hist.refazer(E.objs) : E.hist.desfazer(E.objs);
  if (!objs) return;
  E.objs = objs; E.sel = -1;
  botoesEditor(); desenhar();
}
function apagarSelecao() {
  if (E.escrevendo) {   // apagar o texto que está sendo escrito: fecha a caixa sem gravar
    E.escrevendo = null;
    $("eEscrever").classList.add("hidden");
    $("eTexto").blur();
  }
  if (E.sel < 0 || !E.objs[E.sel]) return;
  const antes = JSON.stringify(E.objs);
  E.objs.splice(E.sel, 1); E.sel = -1;
  E.hist.guardar(antes);
  botoesEditor(); desenhar();
}
function salvarMarcada() {
  if (E.escrevendo) fimDeEscrever();
  const nome = String(E.opts && E.opts.nome || "imagem").replace(/\.[a-z0-9]{2,4}$/i, "") + "-marcada";
  salvar(exportar().toDataURL("image/jpeg", 0.9), nome);
}
async function enviarMarcada() {
  if (E.enviando || !E.opts) return;
  if (E.escrevendo) fimDeEscrever();
  E.enviando = true;
  $("eEnviar").classList.add("enviando");
  erroEditor("");
  try {
    await E.opts.aoEnviar(exportar(), $("eLegenda").value);
    const depois = E.opts.aoEnviado;
    $("eLegenda").value = "";
    E.objs = [];
    sairEditor(false);
    if (depois) depois();
  } catch (err) {
    erroEditor("Não foi: " + (err && err.message || err));
  } finally {
    E.enviando = false;
    $("eEnviar").classList.remove("enviando");
  }
}
function ajustarLegenda() {
  const t = $("eLegenda");
  t.style.height = "auto";
  t.style.height = Math.min(110, t.scrollHeight) + "px";
}

// ---- Começo: liga os botões (o index.html chama depois de montar a página)
function iniciar() {
  document.querySelectorAll("[data-icone]").forEach(b => { b.insertAdjacentHTML("afterbegin", svg(b.dataset.icone)); });
  $("eCores").insertAdjacentHTML("afterbegin", CORES.map(c =>
    `<button class="e-cor" data-cor="${c}" style="--c:${c}" aria-label="Cor ${c}"></button>`).join(""));
  // visor
  const palco = $("vPalco");
  palco.addEventListener("pointerdown", visorDown);
  palco.addEventListener("pointermove", visorMove);
  palco.addEventListener("pointerup", visorUp);
  palco.addEventListener("pointercancel", visorUp);
  $("vFechar").addEventListener("click", fecharVisor);
  $("vSalvar").addEventListener("click", () => { const f = fotoAtual(); if (f) salvar(f.src, f.arquivo || f.nome); });
  $("vMarcar").addEventListener("click", () => { const f = fotoAtual(); if (f && V.opts.aoMarcar) V.opts.aoMarcar(f); });
  $("eZoom").addEventListener("click", () => { E.vista = {s: 1, x: 0, y: 0}; aplicarVista(true); });
  // editor
  const c = tela();
  c.addEventListener("pointerdown", editorDown);
  c.addEventListener("pointermove", editorMove);
  c.addEventListener("pointerup", editorUp);
  c.addEventListener("pointercancel", editorUp);
  const barra = $("eBarra");
  barra.addEventListener("pointerdown", barraDown);
  barra.addEventListener("pointermove", barraMove);
  barra.addEventListener("pointerup", barraUp);
  barra.addEventListener("pointercancel", barraUp);
  barra.addEventListener("touchstart", ev => ev.preventDefault(), {passive: false});   // o toque não tira o foco do texto
  barra.addEventListener("mousedown", ev => ev.preventDefault());
  $("eFerr").addEventListener("click", ev => {
    const b = ev.target.closest("[data-f]");
    if (!b) return;
    if (E.escrevendo) fimDeEscrever();
    E.ferramenta = b.dataset.f; E.sel = -1;
    lembrar(); botoesEditor(); desenhar();
  });
  $("eEstilo").addEventListener("click", () => {
    E.estilo = ESTILOS[(ESTILOS.indexOf(E.estilo) + 1) % ESTILOS.length];
    lembrar();
    mudarSelecao(o => { if (o.t === "texto") o.estilo = E.estilo; });
    botoesEditor();
  });
  $("eCores").addEventListener("click", ev => { const b = ev.target.closest("[data-cor]"); if (b) escolherCor(b.dataset.cor); });
  $("eCor").addEventListener("input", ev => escolherCor(ev.target.value.toUpperCase()));
  $("eFechar").addEventListener("click", () => sairEditor(true));
  $("eDesfazer").addEventListener("click", () => voltar(false));
  $("eRefazer").addEventListener("click", () => voltar(true));
  $("eApagar").addEventListener("click", apagarSelecao);
  $("eSalvar").addEventListener("click", salvarMarcada);
  $("eEnviar").addEventListener("click", enviarMarcada);
  $("eLegenda").addEventListener("input", ajustarLegenda);
  $("eTexto").addEventListener("input", estiloDaCaixa);
  $("eTextoOk").addEventListener("click", fimDeEscrever);
  $("eEscrever").addEventListener("pointerdown", ev => { if (ev.target === $("eEscrever")) { ev.preventDefault(); fimDeEscrever(); } });
  const seguir = () => {
    if (!$("editor").classList.contains("hidden")) { alturaEditor(); encaixarEditor(); desenhar(); }
    if (!$("visor").classList.contains("hidden")) encaixarVisor();
  };
  addEventListener("resize", seguir);
  // a pinça do Safari (gesture*) amplia a página por cima do visor e do editor: lá, os dois dedos são nossos
  const nosso = () => !$("visor").classList.contains("hidden") || !$("editor").classList.contains("hidden");
  for (const tipo of ["gesturestart", "gesturechange"]) document.addEventListener(tipo, ev => { if (nosso()) ev.preventDefault(); }, {passive: false});
  if (window.visualViewport) visualViewport.addEventListener("resize", seguir);
}

raiz.Marcar = {...Conta, ver, fecharVisor, editar, sairEditor, iniciar, salvar, Grandes, blobDe,
               aberto: () => !$("editor").classList.contains("hidden"), estado: () => E, visor: () => V};
})(typeof window !== "undefined" ? window : globalThis);
