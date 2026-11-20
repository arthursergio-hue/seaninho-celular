// Seaninho no celular: o OK do Seaninho no Chrome pelo celular (pro-106, a página v37, o agente 0.9.0.26), sem tela.
// Pedido do Arthur (17/11/2026): subir o 3D no viewer da Autodesk pelo Seaninho no Chrome com a tela do PC trancada. O
// anexo sempre pede o OK dele, e a janela do Chrome ninguém vê com a tela trancada. O agente de cada PC lê o sinal da
// ponte do Chrome (0.3.2) e publica os cards em hoje.ok_chrome (ok_chrome.py):
//   {"v": 1, "ts": 1794856620, "cards": [{"id": "3f9a1c2b", "acao": "anexar 2 arquivos", "site": "viewer.autodesk.com",
//     "sessao": "orq-3d-viewer", "alvo": ["Santinho Spot.ifc · 166,0 MB", "Santo Antônio Spot.ifc · 98,0 MB"],
//     "desde": "2026-11-17T20:31:05-03:00", "segundos": 180, "prazo": "2026-11-17T20:34:05-03:00",
//     "estado": "pendente" | "permitido" | "negado" | "ja_respondido" | "fechado" | "erro", "erro": "…"}]}
// Um card por pedido: o chip do PC, a linha da ação com o site, as linhas do alvo (nome e tamanho, nunca a pasta), a
// sessão e a contagem regressiva (desde + segundos, com o prazo em HH:MM), e os botões Permitir e Negar. Nada de
// "Permitir sempre": cada anexo pede o seu OK. O toque manda ao PC o cel_pedir tipo "acao"
// {"acao": "ok_chrome_responder", "id", "resposta"} (pedirNoPc, no index.html); o agente roda a CLI do Chrome como filho
// dele e devolve em JSON {ok, codigo, erro}. O card mostra "enviando…", "✓ Permitido", "✕ Negado", "já respondido no PC
// ou venceu" ou o erro com a frase. Sem tela (testado no Node: test_ok_chrome.cjs): aqui só se lê o bloco (desconfiando
// de tudo, como o agente) e se monta o HTML; o CSS entra sozinho no primeiro desenho (<style id="estiloOkChrome">).
(function (raiz) {
"use strict";

const ACAO = "ok_chrome_responder";
const AGENTE = "0.9.0.30";          // o agente que publica o bloco e faz o pedido (a versão do agente, como o test_ok_chrome.cjs pede)
const MAX_CARDS = 6, MAX_LINHAS = 10, LINHA_MAX = 120, TEXTO_MAX = 80;   // os mesmos tetos do ok_chrome.py
const ONLINE_MS = 150000;           // o online() da página: o PC deu sinal há menos que isso
const PRAZO_PEDIDO_MS = 3 * 60000;  // o pedido do celular vale por 3 min (o agente também recusa depois disso)
const FICA_MS = 10 * 60000;         // o estado que a página guarda depois do toque (enviando, ok, erro) vale até isso
const ID_RE = /^[0-9a-f]{8}$/;
const ESTADOS = ["pendente", "permitido", "negado", "ja_respondido", "fechado", "erro"];
const TITULO = "🔐 Seaninho no Chrome pede o seu OK";
const TX = {
  permitir: "✓ Permitir", negar: "✕ Negar",
  enviando: r => r === "negar" ? "Negando no PC…" : "Permitindo no PC…",
  permitido: "✓ Permitido: o Chrome segue com a ação", negado: "✕ Negado: o Chrome não faz",
  ja_respondido: "Já respondido no PC, ou venceu", fechado: "Fechado no PC, ou venceu",
  erro: e => `⚠ Não deu: ${e || "a ponte não aceitou"}`,
  vence: "vence em", venceu: "venceu", semSinal: pc => `o ${pc} está sem sinal (desligado?)`,
  sessao: "sessão", em: "em",
  indo: r => r === "negar" ? "Negando no PC…" : "Permitindo no PC…",
  okAviso: "Resposta entregue ao PC: veja o card.", erroAviso: "O OK não chegou à ponte",
  pcOff: pc => `O ${pc} está desligado: tente quando ele ligar.`,
  semPonte: "Nenhuma ponte do Seaninho no Chrome está ligada nesse PC",
};

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const obj = v => !!v && typeof v === "object" && !Array.isArray(v);
const nomeCurto = pc => { const s = String(pc || ""); return s.length > 11 && s.includes("-") ? s.split("-")[0] : s; };
const msDe = v => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0; };
const doisDig = n => (n < 10 ? "0" : "") + n;
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${doisDig(s % 60)}`; };
const hm = ms => { const d = new Date(ms); return `${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`; };

// Uma linha de texto: o controle e as quebras viram espaço, os invisíveis somem, até n letras (o "…" quando corta)
function linha(v, n) {
  if (typeof v !== "string") return "";
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/[\u00ad\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ").trim();
  const letras = [...t];
  return letras.length <= n ? t : letras.slice(0, n - 1).join("").trimEnd() + "…";
}

// ---- As contas ---------------------------------------------------------------------------------------------------
// Um card como a tela usa, ou null (sem id no formato, ou sem ser um objeto). O estado fora da lista vira "pendente"
// só se o agente não mandou nenhum; um desconhecido vira "fechado" (não se oferece o botão a um estado que não se sabe).
function card(c) {
  if (!obj(c) || typeof c.id !== "string" || !ID_RE.test(c.id)) return null;
  const segundos = Number.isInteger(c.segundos) && c.segundos >= 0 && c.segundos <= 3600 ? c.segundos : 0;
  const desdeMs = msDe(c.desde);
  const prazoMs = msDe(c.prazo) || (desdeMs && segundos ? desdeMs + segundos * 1000 : 0);
  const estado = c.estado === undefined ? "pendente" : ESTADOS.includes(c.estado) ? c.estado : "fechado";
  return {id: c.id, acao: linha(c.acao, TEXTO_MAX) || "pede o seu OK", site: linha(c.site, TEXTO_MAX),
    sessao: linha(c.sessao, TEXTO_MAX),
    alvo: (Array.isArray(c.alvo) ? c.alvo : []).map(x => linha(x, LINHA_MAX)).filter(Boolean).slice(0, MAX_LINHAS),
    desdeMs, segundos, prazoMs, estado, erro: estado === "erro" ? linha(c.erro, 160) : ""};
}
// O hoje.ok_chrome de uma linha de PC (o que veio do banco): os cards normalizados; [] sem o bloco ou com o v errado
function doPc(p) {
  const b = obj(p) && obj(p.hoje) ? p.hoje.ok_chrome : null;
  if (!obj(b) || b.v !== 1 || !Array.isArray(b.cards)) return [];
  return b.cards.map(card).filter(Boolean).slice(0, MAX_CARDS);
}
// A chave do estado que a página guarda (um PC e um id)
const chave = (pc, id) => `${pc}|${id}`;
// O texto do pedido ao PC (o cel_pedir tipo "acao")
const pedido = (id, resposta) => ({acao: ACAO, id, resposta: resposta === "negar" ? "negar" : "permitir"});
// O código da recusa do agente pela frase (quando o pedido voltou em erro)
function codigoDoErro(msg) {
  const m = String(msg || "");
  if (/^Chegou tarde/.test(m)) return "tarde";
  if (/só vale pelo toque no celular/.test(m)) return "so_celular";
  if (/não tem o OK pelo celular|desconhecida no agente/.test(m)) return "sem_agente";
  if (/Nenhuma ponte/.test(m)) return "sem_ponte";
  return "erro";
}
// O pedido do banco (como o vigiarAcoes vê) -> o estado do card na página: {fase: "ok"|"erro", estado, texto}
function lerResposta(p, resposta) {
  if (!obj(p)) return {fase: "erro", estado: "erro", texto: TX.erro("sem resposta do PC")};
  if (p.estado === "entregue") {
    let r = null;
    try { r = JSON.parse(String(p.resposta || "")); } catch (_) { r = null; }
    if (obj(r) && r.ok === true) {
      const neg = (r.resposta || resposta) === "negar";
      return {fase: "ok", estado: neg ? "negado" : "permitido", texto: neg ? TX.negado : TX.permitido};
    }
    const cod = obj(r) ? String(r.codigo || "") : "";
    if (cod === "nao_encontrado") return {fase: "erro", estado: "ja_respondido", texto: TX.ja_respondido};
    if (cod === "sem_ponte") return {fase: "erro", estado: "erro", texto: TX.erro(TX.semPonte)};
    return {fase: "erro", estado: "erro", texto: TX.erro(obj(r) ? r.erro : "a resposta do PC veio estranha")};
  }
  if (p.estado === "erro" || p.estado === "cancelado") {
    const msg = String(p.erro || "Cancelado");
    return {fase: "erro", estado: "erro", codigo: codigoDoErro(msg), texto: TX.erro(msg)};
  }
  return {fase: "enviando", estado: "pendente", texto: TX.enviando(resposta)};
}
// O estado que a tela mostra: o do agente quando não é mais "pendente"; senão o da página (enviando, ok, erro) se
// ainda vale (FICA_MS); senão "pendente" (os botões)
function estadoDe(c, local, agora) {
  if (c.estado !== "pendente") return {estado: c.estado, texto: textoDoEstado(c.estado, c.erro)};
  if (local && agora - (local.t || 0) < FICA_MS) {
    if (local.fase === "enviando") return {estado: "enviando", texto: TX.enviando(local.resposta)};
    return {estado: local.estado || "erro", texto: local.texto || textoDoEstado(local.estado, "")};
  }
  return {estado: "pendente", texto: ""};
}
function textoDoEstado(estado, erro) {
  if (estado === "permitido") return TX.permitido;
  if (estado === "negado") return TX.negado;
  if (estado === "ja_respondido") return TX.ja_respondido;
  if (estado === "fechado") return TX.fechado;
  if (estado === "erro") return TX.erro(erro);
  return "";
}
// A ação do toque: {id, pc, resposta} do botão (ou null); o botão desligado não faz nada
function acaoDe(el) {
  const b = el && el.closest ? el.closest("[data-okc-resposta]") : null;
  if (!b || b.disabled) return null;
  return {id: String(b.dataset.okcId || ""), pc: String(b.dataset.okcPc || ""), resposta: b.dataset.okcResposta === "negar" ? "negar" : "permitir"};
}

// ---- O HTML -------------------------------------------------------------------------------------------------------
// Um card. opts: {agora, comSinal (o PC deu sinal), local (o estado da página para este card)}
function htmlCard(pc, c, opts = {}) {
  const agora = Number.isFinite(opts.agora) ? opts.agora : Date.now();
  const curto = nomeCurto(pc), comSinal = opts.comSinal !== false;
  const e = estadoDe(c, opts.local, agora);
  const resta = c.prazoMs ? c.prazoMs - agora : 0;
  const venceu = !!c.prazoMs && resta <= 0;
  const acao = `${esc(c.acao)}${c.site ? ` <span class="okc-em">${TX.em}</span> <b>${esc(c.site)}</b>` : ""}`;
  const l1 = `<div class="okc-l1"><span class="cr-pcn" title="${esc(pc)}">${esc(curto)}</span><span class="okc-acao">${acao}</span></div>`;
  const alvo = c.alvo.length ? `<ul class="okc-alvo">${c.alvo.map(x => `<li>📄 ${esc(x)}</li>`).join("")}</ul>` : "";
  const prazo = e.estado === "pendente" && c.prazoMs
    ? `<span class="okc-prazo${venceu ? " venceu" : ""}" data-okc-ate="${c.prazoMs}">${venceu ? TX.venceu : `${TX.vence} ${mmss(resta)}`}</span>`
      + `<span class="okc-ate">· até ${hm(c.prazoMs)}</span>` : "";
  const l3 = (c.sessao || prazo) ? `<div class="okc-l3">${c.sessao ? `<span class="okc-sessao">${TX.sessao}: ${esc(c.sessao)}</span>` : ""}${prazo}</div>` : "";
  let fim;
  if (e.estado === "pendente") {
    const off = !comSinal || venceu;
    const dis = off ? " disabled" : "";
    fim = `<div class="okc-bts">`
      + `<button class="btn okc-sim" data-okc-id="${esc(c.id)}" data-okc-pc="${esc(pc)}" data-okc-resposta="permitir"${dis}>${TX.permitir}</button>`
      + `<button class="btn sec okc-nao" data-okc-id="${esc(c.id)}" data-okc-pc="${esc(pc)}" data-okc-resposta="negar"${dis}>${TX.negar}</button></div>`
      + (!comSinal ? `<p class="okc-nota">${esc(TX.semSinal(curto))}</p>` : "");
  } else {
    const cls = e.estado === "permitido" ? "ok" : e.estado === "enviando" ? "indo" : e.estado === "negado" ? "nao" : "falha";
    fim = `<div class="okc-est ${cls}" role="status">${e.estado === "enviando" ? `<span class="spin"></span>` : ""}${esc(e.texto)}</div>`;
  }
  const aria = [curto, c.acao + (c.site ? ` em ${c.site}` : ""), ...c.alvo, c.sessao ? `sessão ${c.sessao}` : "",
    e.estado === "pendente" ? (!c.prazoMs ? "" : venceu ? "venceu" : `vence em ${mmss(resta)}`) : e.texto].filter(Boolean).join(", ");
  return `<div class="okc-card ${esc(e.estado)}${comSinal ? "" : " off"}" role="group" aria-label="${esc(aria)}" data-okc-card="${esc(chave(pc, c.id))}">${l1}${alvo}${l3}${fim}</div>`;
}
// O bloco inteiro para o Início: os cards de cada PC que publicou o bloco (na ordem da lista); "" sem nenhum.
// opts: {agora, online (a função da página), estados (o mapa chave -> estado da página), doc}
function bloco(lista, opts = {}) {
  const agora = Number.isFinite(opts.agora) ? opts.agora : Date.now();
  const estados = obj(opts.estados) ? opts.estados : {};
  const cards = [];
  for (const p of Array.isArray(lista) ? lista : []) {
    const pc = String((p && p.pc) || "");
    const comSinal = typeof opts.online === "function" ? !!opts.online(p) : agora - msDe(p && p.visto_em) < ONLINE_MS;
    for (const c of doPc(p)) cards.push(htmlCard(pc, c, {agora, comSinal, local: estados[chave(pc, c.id)]}));
  }
  if (!cards.length) return "";
  estilo(opts.doc);
  return `<section class="bloco okc-bloco"><h3>${TITULO}</h3>${cards.join("")}</section>`;
}
// A contagem anda a cada segundo sem refazer a tela (o tic do index.html): os [data-okc-ate]
function tic(doc, agora) {
  doc = doc || (typeof document !== "undefined" ? document : null);
  if (!doc || !doc.querySelectorAll) return 0;
  agora = Number.isFinite(agora) ? agora : Date.now();
  let n = 0;
  for (const el of doc.querySelectorAll("[data-okc-ate]")) {
    const resta = Number(el.dataset.okcAte) - agora, venceu = resta <= 0;
    const t = venceu ? TX.venceu : `${TX.vence} ${mmss(resta)}`;
    if (el.textContent !== t) { el.textContent = t; n++; }
    if (venceu && !el.classList.contains("venceu")) {
      el.classList.add("venceu");
      const card = el.closest ? el.closest(".okc-card") : null;
      if (card) for (const b of card.querySelectorAll("[data-okc-resposta]")) b.disabled = true;
    }
  }
  return n;
}

// ---- O CSS (com as variáveis do index.html: --stroke, --glass-2, --ink, --muted, --faint, --gold, --green) ----
const CSS = `
.okc-bloco h3{color:var(--gold)}
.okc-card{padding:10px 0 8px;border-top:1px solid var(--stroke)}
.okc-bloco h3+.okc-card,.okc-bloco .esp-cab+.okc-card{border-top:0;padding-top:0}
.okc-card.off{opacity:.62}
.okc-l1{display:flex;align-items:baseline;gap:8px;min-width:0}
.okc-l1 .cr-pcn{flex:none;font-size:12px;font-weight:700;letter-spacing:.3px;padding:2px 8px;border-radius:6px;background:rgba(0,0,0,.28);color:var(--muted)}
.okc-acao{min-width:0;font-size:15px;font-weight:600;overflow-wrap:anywhere}
.okc-em{font-weight:400;color:var(--muted)}
.okc-alvo{list-style:none;margin:6px 0 0;padding:0}
.okc-alvo li{font-size:13.5px;line-height:1.45;padding:1px 0;color:var(--ink);overflow-wrap:anywhere}
.okc-l3{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;margin:6px 0 0;font-size:13px;color:var(--muted)}
.okc-sessao{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.okc-prazo{font-weight:700;color:var(--gold);font-variant-numeric:tabular-nums}
.okc-prazo.venceu{color:#ffb3ad}
.okc-ate{color:var(--faint)}
.okc-bts{display:flex;gap:8px;margin-top:10px}
.okc-bts .btn{flex:1;margin:0;padding:12px 8px;font-size:15px;font-weight:700;border-radius:12px}
.okc-bts .btn.okc-sim{background:var(--green);color:#0b1a10}
.okc-bts .btn:disabled{opacity:.45}
.okc-nota{margin:6px 0 0;font-size:13px;color:#ffb3ad}
.okc-est{margin-top:10px;padding:10px 12px;border-radius:10px;font-size:14px;font-weight:600;background:var(--glass-2);color:var(--ink);display:flex;align-items:center;gap:8px}
.okc-est.ok{background:rgba(72,214,128,.16);color:var(--green)}
.okc-est.nao{background:rgba(255,255,255,.06);color:var(--muted)}
.okc-est.falha{background:rgba(255,90,79,.16);color:#ffb3ad}
.okc-est.indo{color:var(--muted)}
`;

// O <style id="estiloOkChrome"> no <head>, uma vez (no Node, sem document, não faz nada).
function estilo(d) {
  d = d || (typeof document !== "undefined" ? document : null);
  if (!d || !d.head || d.getElementById("estiloOkChrome")) return;
  const s = d.createElement("style");
  s.id = "estiloOkChrome";
  s.textContent = CSS;
  d.head.appendChild(s);
}

const OkChrome = {ACAO, AGENTE, MAX_CARDS, MAX_LINHAS, LINHA_MAX, TEXTO_MAX, ONLINE_MS, PRAZO_PEDIDO_MS, FICA_MS, TITULO, TX, CSS,
  ESTADOS, card, doPc, chave, pedido, codigoDoErro, lerResposta, estadoDe, textoDoEstado, acaoDe, htmlCard, bloco, tic, estilo,
  linha, mmss, nomeCurto, esc};
if (typeof module !== "undefined" && module.exports) module.exports = OkChrome;
raiz.OkChrome = OkChrome;
})(typeof window !== "undefined" ? window : globalThis);
