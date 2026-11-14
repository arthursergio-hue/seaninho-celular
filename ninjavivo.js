// Seaninho no celular: o ninja VIVO do uso de IA (12/11; o mesmo do Monitor geral do Pro, pro-72). Pedido do Arthur:
// "use um criador de vídeo, para ficar bem legal. Deixe uma animação loop idle também, podem ficar dando golpes ninjas
// ... Tudo estilo anime." Animação 2D quadro a quadro: por personagem e faixa, uma folha de sprites
// (ninja/<personagem>-vivo-<cor>.webp) e o manifesto (ninja/ninja-vivo.json), os mesmos arquivos do Pro.
// - Um <canvas> por cima do ninja parado de cada palco (ninja.js), com 1,5 × a caixa dele (os efeitos passam da borda,
//   até onde o palco deixa); o parado fica por baixo, escondido: some o canvas, ele volta.
// - O idle sempre (3 s em loop, sem emenda); um golpe sorteado a cada 20 a 40 s (na volta do loop) e no toque no ninja.
// - O puff de entrada e a animação de aparição (ninja.js) continuam: enquanto tocam, o canvas não entra.
// - Pausa com a página escondida e com o ninja fora da tela; com o "reduzir movimento", não entra. Sem som.
// As regras sem tela rodam no Node (test_ninja_vivo.cjs).
(function (raiz) {
"use strict";

const PERSONAGENS = ["feminino", "masculino"], GOLPES = ["golpe1", "golpe2"];
const CORES = ["branca", "amarela", "verde", "azul", "roxa", "marrom", "preta"];
const ESPERA_MIN = 20000, ESPERA_MAX = 40000, RESPIRO = 1500;
const PASTA = "ninja/", MANIFESTO = "ninja/ninja-vivo.json";
const inteiro = (v, a, b) => Number.isInteger(v) && v >= a && v <= b;
const numero = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;

// ==== as regras (as mesmas do geral_ninja_vivo.js do Pro) ============================================================
function manifesto(m) {
  if (!m || typeof m !== "object") return null;
  const {quadro, colunas, total, caixa, busto, volta, clipes} = m;
  if (!inteiro(quadro, 32, 1024) || !inteiro(colunas, 1, 64) || !inteiro(total, 1, 4096)) return null;
  const tripla = t => Array.isArray(t) && t.length === 3 && t.every(v => numero(v, 0, quadro)) && t[0] + t[2] <= quadro + 1
    && t[1] + t[2] <= quadro + 1 && t[2] >= 4;
  if (!tripla(caixa) || !tripla(busto) || !clipes || typeof clipes !== "object") return null;
  const out = {quadro, colunas, total, caixa: caixa.slice(), busto: busto.slice(), clipes: {}};
  for (const nome of ["idle", ...GOLPES]) {
    const c = clipes[nome];
    if (!c || !Array.isArray(c.q) || !Array.isArray(c.ms) || c.q.length !== c.ms.length || c.q.length < 2 || c.q.length > 600
      || !c.q.every(i => inteiro(i, 0, total - 1)) || !c.ms.every(t => inteiro(t, 20, 2000))) {
      if (nome === "idle") return null;
      continue;
    }
    out.clipes[nome] = {q: c.q.slice(), ms: c.ms.slice(), nome: typeof c.nome === "string" ? c.nome.slice(0, 60) : nome};
  }
  out.volta = inteiro(volta, 0, out.clipes.idle.q.length - 1) ? volta : 0;
  return out;
}
const posicao = (m, idx) => [(idx % m.colunas) * m.quadro, Math.floor(idx / m.colunas) * m.quadro];
const quadroDe = (m, e) => m.clipes[e.clipe].q[e.i];
const msDe = (m, e) => m.clipes[e.clipe].ms[e.i];
function avancar(m, e, pedido, ja) {
  const c = m.clipes[e.clipe];
  if (!c) return {clipe: "idle", i: 0, fim: false};
  if (e.clipe === "idle") {
    const fimDoLoop = e.i >= c.q.length - 1;
    if (pedido && m.clipes[pedido] && (ja || fimDoLoop)) return {clipe: pedido, i: 0, fim: false};
    return {clipe: "idle", i: fimDoLoop ? 0 : e.i + 1, fim: false};
  }
  if (e.i + 1 < c.q.length) return {clipe: e.clipe, i: e.i + 1, fim: false};
  return {clipe: "idle", i: m.volta, fim: true};
}
const sortear = r => ESPERA_MIN + Math.max(0, Math.min(1, Number(r) || 0)) * (ESPERA_MAX - ESPERA_MIN);
function escolher(m, ultimo, r) {
  const tem = GOLPES.filter(g => m && m.clipes[g]);
  if (!tem.length) return "";
  if (tem.length === 1) return tem[0];
  if (GOLPES.includes(ultimo)) return ultimo === "golpe1" ? "golpe2" : "golpe1";
  return (Number(r) || 0) < 0.5 ? "golpe1" : "golpe2";
}
// O personagem e a cor pelo arquivo do ninja parado ("ninja/feminino-corpo-roxa.webp"): [personagem, cor] ou null.
function doArquivo(src) {
  const m = /(?:^|\/)ninja\/([a-z]+)-corpo-([a-z]+)\.webp(?:[?#].*)?$/.exec(String(src || ""));
  return m && PERSONAGENS.includes(m[1]) && CORES.includes(m[2]) ? [m[1], m[2]] : null;
}

// ==== a tela (só no navegador) ========================================================================================
const CSS = ".ninja-palco .nj-vivo{position:absolute;left:-25%;width:150%;height:auto;aspect-ratio:1/1;"
  + "bottom:calc(5% - var(--np, 84px) / 4);pointer-events:none;display:block}"
  + ".ninja-palco:has(>canvas.nj-vivo)>img.nj-img{visibility:hidden}"
  + ".ninja-palco.espera .nj-vivo,.ninja-palco.entra .nj-vivo{display:none}";
const S = {todos: null, pedindoMan: false, erroMan: 0, m: null, folha: null, chave: "", pedindo: "", erro: {}, e: {clipe: "idle", i: 0},
  pedido: "", ja: false, ultimo: "", proximo: 0, fimGolpe: -1e9, timer: 0, telas: [], quadros: 0};
const doc = () => raiz.document;
const agora = () => (raiz.performance && raiz.performance.now ? raiz.performance.now() : Date.now());
const movimentoReduzido = () => !!(raiz.matchMedia && raiz.matchMedia("(prefers-reduced-motion: reduce)").matches);
// O ninja na tela: com caixa e cruzando a janela (rolado para fora, nada anda).
function naTela(el) {
  if (!el || !el.isConnected || !el.getClientRects().length) return false;
  const r = el.getBoundingClientRect(), h = raiz.innerHeight || 0, w = raiz.innerWidth || 0;
  return r.bottom > 0 && r.right > 0 && r.top < h && r.left < w;
}
// O palco pode receber o vivo: a imagem parada carregada, sem o puff nem a aparição tocando.
function livre(img) {
  const p = img.closest(".ninja-palco");
  return !!p && !p.classList.contains("espera") && !p.classList.contains("entra") && !img.classList.contains("anima");
}

function estilo() {
  const d = doc();
  if (d.getElementById("nj-vivo-css")) return;
  const s = d.createElement("style");
  s.id = "nj-vivo-css";
  s.textContent = CSS;
  (d.head || d.documentElement).appendChild(s);
}

function manifestos() {
  if (S.todos || S.pedindoMan || typeof raiz.fetch !== "function" || Date.now() - S.erroMan < 60000) return S.todos;
  S.pedindoMan = true;
  raiz.fetch(MANIFESTO).then(r => (r.ok ? r.json() : null)).then(j => {
    if (!j || typeof j !== "object") throw new Error("sem o manifesto");
    S.todos = j;
  }).catch(() => { S.todos = null; S.erroMan = Date.now(); }).then(() => { S.pedindoMan = false; if (S.todos) sincronizar(); });
  return null;
}

function carregar(p, cor) {
  const k = `${p}-${cor}`;
  if (S.pedindo === k || Date.now() - (S.erro[k] || 0) < 60000) return;
  const todos = manifestos();
  if (!todos) return;  // o manifesto ainda vem
  const m = manifesto(todos[k]);
  if (!m) { S.erro[k] = Date.now(); return; }
  S.pedindo = k;
  const img = new raiz.Image();
  img.src = `${PASTA}${p}-vivo-${cor}.webp`;
  (img.decode ? img.decode() : new Promise((ok, falha) => { img.onload = ok; img.onerror = falha; })).then(() => {
    if (S.pedindo !== k) return;
    if (img.naturalWidth < m.colunas * m.quadro || img.naturalHeight < Math.ceil(m.total / m.colunas) * m.quadro)
      throw new Error("folha menor que o manifesto");
    S.m = m; S.folha = img; S.chave = k; S.e = {clipe: "idle", i: 0}; S.pedido = ""; S.ja = false; S.ultimo = "";
    S.proximo = agora() + sortear(Math.random());
  }).catch(() => { S.erro[k] = Date.now(); }).then(() => { if (S.pedindo === k) { S.pedindo = ""; sincronizar(); } });
}

function cobrir(img) {
  let cv = img.nextElementSibling;
  if (!(cv && cv.classList.contains("nj-vivo"))) {
    cv = doc().createElement("canvas");
    cv.className = "nj-vivo";
    cv.setAttribute("aria-hidden", "true");
    cv.width = cv.height = S.m.quadro;
    img.after(cv);
  }
  const f = raiz.getComputedStyle ? raiz.getComputedStyle(img).filter : "";
  const filtro = f && f !== "none" ? f : "";
  if (cv.style.filter !== filtro) cv.style.filter = filtro;
  return cv;
}
function soltar(manter) {
  const d = doc();
  for (const cv of d.querySelectorAll(".ninja-palco canvas.nj-vivo")) if (!manter || !manter.includes(cv)) cv.remove();
  if (!manter) { S.telas = []; if (S.timer) { clearTimeout(S.timer); S.timer = 0; } }
}

function sincronizar() {
  const d = doc();
  if (!d || !d.body) return;
  if (movimentoReduzido()) { soltar(); return; }
  const imgs = [...d.querySelectorAll(".ninja-palco > img.nj-img")].filter(i => doArquivo(i.getAttribute("src")));
  const vistos = imgs.filter(naTela);
  if (!vistos.length) { soltar(); return; }
  const [p, cor] = doArquivo(vistos[0].getAttribute("src"));
  if (`${p}-${cor}` !== S.chave || !S.m) { soltar(); carregar(p, cor); return; }
  estilo();
  S.telas = vistos.filter(i => { const a = doArquivo(i.getAttribute("src")); return a[0] === p && a[1] === cor && livre(i); }).map(cobrir);
  soltar(S.telas);
  if (d.hidden || !S.telas.length) return;
  desenhar();
  agendar();
}

function desenhar() {
  if (!S.m || !S.folha) return;
  const m = S.m, [x, y] = posicao(m, quadroDe(m, S.e));
  for (const cv of S.telas) {
    const c = cv.getContext("2d");
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(S.folha, x, y, m.quadro, m.quadro, 0, 0, cv.width, cv.height);
  }
  S.quadros++;
}
function agendar(espera) {
  if (S.timer || !S.m || doc().hidden || !S.telas.length) return;
  S.timer = setTimeout(tique, espera === undefined ? msDe(S.m, S.e) : espera);
}
function tique() {
  S.timer = 0;
  if (!S.m || doc().hidden || movimentoReduzido() || !S.telas.some(cv => cv.isConnected && naTela(cv))) return;
  const t = agora();
  if (!S.pedido && S.e.clipe === "idle" && t >= S.proximo) { S.pedido = escolher(S.m, S.ultimo, Math.random()); S.ja = false; }
  const n = avancar(S.m, S.e, S.pedido, S.ja);
  if (n.clipe !== "idle" && S.e.clipe === "idle") { S.ultimo = n.clipe; S.pedido = ""; S.ja = false; }
  if (n.fim) { S.fimGolpe = t; S.proximo = t + sortear(Math.random()); }
  S.e = {clipe: n.clipe, i: n.i};
  desenhar();
  agendar();
}
// O toque (ou o mouse) no ninja: um golpe já, se o idle está tocando e o último golpe não acabou agora.
function golpeJa(ev) {
  const p = ev.target && ev.target.closest && ev.target.closest(".ninja-palco");
  if (!p || !p.querySelector("canvas.nj-vivo") || !S.m || S.e.clipe !== "idle" || S.pedido || agora() - S.fimGolpe < RESPIRO) return;
  S.pedido = escolher(S.m, S.ultimo, Math.random());
  S.ja = true;
  if (S.timer) { clearTimeout(S.timer); S.timer = 0; }
  agendar(0);
}

function ligar() {
  const d = doc();
  if (!d || !d.body || typeof raiz.MutationObserver !== "function") return false;
  let marcado = 0;
  const depois = () => { if (!marcado) marcado = setTimeout(() => { marcado = 0; sincronizar(); }, 50); };
  const levou = rs => rs.some(r => [...r.removedNodes].some(n => n.nodeType === 1
    && (n.matches("canvas.nj-vivo") || (n.querySelector && n.querySelector("canvas.nj-vivo")))));
  new raiz.MutationObserver(rs => { if (levou(rs)) sincronizar(); else depois(); }).observe(d.body, {childList: true, subtree: true, attributes: true,
    attributeFilter: ["class", "src", "hidden"]});
  d.addEventListener("visibilitychange", depois);
  raiz.addEventListener("scroll", depois, {passive: true, capture: true});
  raiz.addEventListener("resize", depois, {passive: true});
  d.addEventListener("pointerdown", golpeJa, {passive: true});
  d.addEventListener("pointerover", e => { if (e.pointerType === "mouse") golpeJa(e); }, {passive: true});
  if (raiz.matchMedia) {
    const mq = raiz.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.addEventListener) mq.addEventListener("change", depois);
  }
  sincronizar();
  return true;
}

const API = {PERSONAGENS, CORES, GOLPES, ESPERA_MIN, ESPERA_MAX, manifesto, posicao, avancar, sortear, escolher, quadroDe, msDe,
  doArquivo, sincronizar, ligar, _estado: () => ({clipe: S.e.clipe, i: S.e.i, chave: S.chave, quadros: S.quadros, rodando: !!S.timer,
    telas: S.telas.length}),
  _golpe: g => { if (S.m && S.m.clipes[g]) { S.pedido = g; S.ja = true; if (S.timer) { clearTimeout(S.timer); S.timer = 0; } agendar(0); } }};
if (typeof module !== "undefined" && module.exports) module.exports = API;
raiz.NinjaVivo = API;
if (raiz.document && raiz.document.body && !raiz.__ninjaVivoLigado) { raiz.__ninjaVivoLigado = true; ligar(); }
else if (raiz.document && raiz.addEventListener) raiz.addEventListener("DOMContentLoaded", () => {
  if (!raiz.__ninjaVivoLigado) { raiz.__ninjaVivoLigado = true; ligar(); }
});
})(typeof window !== "undefined" ? window : globalThis);
