// Seaninho no celular: o grupo "Seaninho no Chrome" do Monitor geral no Início (entrega 6 do PLANO-MONITOR-NO-CELULAR,
// 13/11/2026). Regra do Arthur (13/11): tudo o que está no Monitor geral aparece igual no app do celular.
// O agente de cada PC lê a pasta %LOCALAPPDATA%\SeaninhoChrome como o Monitor lê (o scripto/chrome.py do Pro) e
// publica o resumo no hoje.painel.chrome (até 1,5 KB, só quando muda; chrome_celular.py):
//   {"ligada": true, "modo": "leitura|acao", "perfil": "Seazone", "hoje": 12, "visto": "2026-11-13T21:46:44-03:00",
//    "acoes": [{"h": "21:46", "o": "abas · supabase.com", "ok": true}, ... até 5 de hoje, a mais nova primeiro]}
//   (mais "pausado": true e "estragada": true, só quando valem; o visto é a hora da última ação)
// Um cartão por PC que publicou o bloco: o chip do PC, a bolinha (ponte ligada ou desligada) com o "usada há X", o
// modo como etiqueta (os rótulos do Monitor: Só ler, Pode agir; ou Pausado), o perfil, as ações de hoje e as últimas
// com ✓/⚠ (⚠: negada ou perguntou). A configuração estragada (a trava bloqueia tudo) vira um aviso. O PC sem o bloco
// não aparece; sem nenhum, o grupo some. O PC sem sinal fica apagado, com "PC sem sinal · há X" (a ponte de lá pode
// ter mudado depois da última notícia). Igual ao Monitor: só mostrar, nenhum botão muda a ponte.
// Sem tela (testado no Node: test_chrome.cjs): aqui só se lê o bloco (desconfiando de tudo, como o agente) e se monta o
// HTML; o CSS entra sozinho no primeiro desenho (<style id="estiloChrome">), sem mexer no <style> da página.
(function (raiz) {
"use strict";

const MODOS = {leitura: "Só ler", acao: "Pode agir"};   // o MODE_LABEL do Monitor (scripto/chrome.py)
// os mesmos limites do chrome_celular.py (o test_chrome_celular.py confere os dois lados)
const MAX_ACOES = 5, TEXTO_MAX = 80, PERFIL_MAX = 40;
const ONLINE_MS = 150000;   // o online() da página: o PC deu sinal há menos que isso
const H_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const TITULO = "🌐 Seaninho no Chrome";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const obj = v => !!v && typeof v === "object" && !Array.isArray(v);
const tem = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
// WIN-EAD6OD66GE7 vira WIN; SEAZONE192 fica (o nomeCurtoPc da página)
const nomeCurto = pc => { const s = String(pc || ""); return s.length > 11 && s.includes("-") ? s.split("-")[0] : s; };
const msDe = v => { const t = typeof v === "string" ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0; };

// Uma linha de texto: o controle e as quebras viram espaço, os invisíveis (hífen mole, largura zero, os que viram o
// texto ao contrário) somem, e com até n letras (o "…" no fim quando corta). Como o _texto do agente, sem tirar links:
// o agente já tira; aqui só não se confia no tamanho.
function linha(v, n) {
  if (typeof v !== "string") return "";
  const t = v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/[\u00ad\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ").trim();
  const letras = [...t];
  return letras.length <= n ? t : letras.slice(0, n - 1).join("").trimEnd() + "…";
}

// "agora", "há 5 min", "há 3 h", "há 2 dias" ("" sem a hora)
function haTexto(ms, agora) {
  if (!ms) return "";
  const s = Math.max(0, (agora - ms) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

// O bloco de um PC como a tela usa, ou null se não é um bloco (o PC fica sem cartão). O ligada tem de ser true/false; o
// modo, um da lista (outro: sem etiqueta); as ações, até 5, cada uma com o texto (a hora só no formato "HH:MM").
function normalizar(b) {
  if (!obj(b) || typeof b.ligada !== "boolean") return null;
  const modo = typeof b.modo === "string" && tem(MODOS, b.modo) ? b.modo : "";
  const acoes = (Array.isArray(b.acoes) ? b.acoes.slice(0, MAX_ACOES * 10) : []).filter(obj)
    .map(a => ({h: typeof a.h === "string" && H_RE.test(a.h) ? a.h : "", o: linha(a.o, TEXTO_MAX), ok: a.ok !== false}))
    .filter(a => a.o).slice(0, MAX_ACOES);
  return {ligada: b.ligada, modo, modoRotulo: modo ? MODOS[modo] : "", pausado: b.pausado === true,
    estragada: b.estragada === true, hoje: Number.isInteger(b.hoje) && b.hoje >= 0 ? b.hoje : null,
    perfil: linha(b.perfil, PERFIL_MAX), vistoMs: msDe(b.visto), acoes};
}

// O hoje.painel.chrome de uma linha de PC (o que veio do banco), já normalizado; null sem o bloco.
function doPc(p) {
  const painel = obj(p) && obj(p.hoje) && obj(p.hoje.painel) ? p.hoje.painel : null;
  return painel && tem(painel, "chrome") ? normalizar(painel.chrome) : null;
}

// O cartão de um PC: o chip, a bolinha com o estado e o "há X"; o modo e o perfil; as ações. Sem nenhum botão.
// opts: {agora (ms), online (a função da página; sem ela, o visto_em do PC contra ONLINE_MS)}
function cartao(p, c, opts = {}) {
  const agora = Number.isFinite(opts.agora) ? opts.agora : Date.now();
  const pc = String((p && p.pc) || ""), curto = nomeCurto(pc);
  const comSinal = typeof opts.online === "function" ? !!opts.online(p) : agora - msDe(p && p.visto_em) < ONLINE_MS;
  const estado = !comSinal ? "PC sem sinal" : c.ligada ? "ponte ligada" : "ponte desligada";
  const ha = haTexto(comSinal ? c.vistoMs : msDe(p && p.visto_em), agora);
  const quando = ha && comSinal ? "usada " + ha : ha;   // com sinal: a última ação; sem: o último sinal do PC
  const l1 = `<div class="cr-l1"><span class="cr-pcn" title="${esc(pc)}">${esc(curto)}</span>`
    + `<i class="dot${comSinal && c.ligada ? " ok" : ""}" aria-hidden="true"></i>`
    + `<span class="cr-est"><span class="cr-est-t">${esc(estado)}</span>${quando ? `<span class="cr-ha">· ${esc(quando)}</span>` : ""}</span></div>`;
  // pausado: a etiqueta é "Pausado" (como a linha do Monitor), no lugar do modo
  const modo = c.pausado ? `<span class="cr-rot">modo:</span><span class="cr-modo pausado">Pausado</span>`
    : c.modo ? `<span class="cr-rot">modo:</span><span class="cr-modo ${c.modo}">${esc(c.modoRotulo)}</span>` : "";
  // o "·" (ou o "perfil:") dentro do mesmo pedaço do perfil: o perfil longo desce de linha junto com ele
  const perfil = c.perfil ? `<span class="cr-perfil">${c.modo ? `<span class="cr-sep" aria-hidden="true">·</span> `
    : `<span class="cr-rot">perfil:</span> `}${esc(c.perfil)}</span>` : "";
  const hoje = c.hoje !== null ? `<span class="cr-hoje"><span class="cr-sep" aria-hidden="true">·</span> ${c.hoje} ${c.hoje === 1 ? "ação" : "ações"} hoje</span>` : "";
  const l2 = modo || perfil || hoje ? `<div class="cr-l2">${modo}${perfil}${hoje}</div>` : "";
  const aviso = c.estragada ? `<p class="cr-aviso">⚠ configuração estragada: a trava bloqueia tudo</p>` : "";
  const l3 = c.acoes.length ? `<ul class="cr-acoes">${c.acoes.map(a => `<li><span class="h">${esc(a.h)}</span>`
    + `<span class="s ${a.ok ? "ok" : "falha"}" role="img" aria-label="${a.ok ? "feito" : "não deu"}">${a.ok ? "✓" : "⚠"}</span>`
    + `<span class="o">${esc(a.o)}</span></li>`).join("")}</ul>` : "";
  const aria = [curto, estado + (quando ? ", " + quando : ""), c.pausado ? "pausado" : c.modo ? "modo " + c.modoRotulo : "",
    c.perfil ? "perfil " + c.perfil : "", c.hoje !== null ? `${c.hoje} ${c.hoje === 1 ? "ação" : "ações"} hoje` : "",
    c.estragada ? "configuração estragada" : ""].filter(Boolean).join(", ");
  return `<div class="cr-pc${comSinal ? "" : " off"}" role="group" aria-label="${esc(aria)}" data-cr-pc="${esc(pc)}">${l1}${l2}${aviso}${l3}</div>`;
}

// O grupo inteiro para o Início: um cartão por PC com o bloco, na ordem da lista; "" sem nenhum (o grupo some).
// opts: {agora, online, doc (o document, para o CSS; sem ele, o global)}
function bloco(lista, opts = {}) {
  const agora = Number.isFinite(opts.agora) ? opts.agora : Date.now();
  const cartoes = (Array.isArray(lista) ? lista : []).map(p => {
    const c = doPc(p);
    return c ? cartao(p, c, {agora, online: opts.online}) : "";
  }).filter(Boolean);
  if (!cartoes.length) return "";
  estilo(opts.doc);
  return `<section class="bloco cr-bloco"><h3>${TITULO}</h3>${cartoes.join("")}</section>`;
}

// ---- O CSS (com as variáveis do index.html: --stroke, --glass-2, --ink, --muted, --faint, --gold, --green) ----
// Na linha de cima, quem encolhe primeiro é o chip do PC (o nome inteiro fica no title e no aria-label): o estado da
// ponte e o "há X" ficam inteiros (o .cr-est não encolhe; numa tela estreita demais, a linha corta o fim).
const CSS = `
.cr-pc{padding:10px 0 8px;border-top:1px solid var(--stroke)}
.cr-bloco h3+.cr-pc,.cr-bloco .esp-cab+.cr-pc{border-top:0;padding-top:0}
.cr-pc.off{opacity:.62}
.cr-l1{display:flex;align-items:center;gap:8px;min-width:0;overflow:hidden}
.cr-pcn{flex:0 100 auto;min-width:3.2em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:700;letter-spacing:.3px;padding:2px 8px;border-radius:6px;background:rgba(0,0,0,.28);color:var(--muted)}
.cr-est{flex:none;display:flex;align-items:baseline;gap:5px;overflow:hidden;white-space:nowrap;font-size:14.5px;font-weight:600}
.cr-est-t{min-width:0;overflow:hidden;text-overflow:ellipsis}
.cr-ha{flex:none;font-weight:400;color:var(--muted)}
.cr-l2{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0 0;font-size:13.5px;color:var(--muted);min-width:0}
.cr-modo{font-size:12px;font-weight:650;padding:2px 9px;border-radius:999px;background:var(--glass-2);color:var(--ink)}
.cr-modo.acao{background:rgba(226,184,74,.18);color:var(--gold)}
.cr-modo.pausado{background:rgba(255,90,79,.16);color:#ffb3ad}
.cr-hoje{white-space:nowrap}
.cr-aviso{margin:6px 0 0;font-size:13px;color:#ffb3ad}
.cr-perfil{min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cr-acoes{list-style:none;margin:6px 0 0;padding:0}
.cr-acoes li{display:flex;gap:8px;align-items:baseline;font-size:13.5px;line-height:1.4;padding:2px 0;color:var(--muted)}
.cr-acoes .h{flex:none;width:40px;color:var(--faint);font-variant-numeric:tabular-nums}
.cr-acoes .s{flex:none;width:16px;text-align:center;font-weight:700}
.cr-acoes .s.ok{color:var(--green)}
.cr-acoes .s.falha{color:var(--gold)}
.cr-acoes .o{flex:1;min-width:0;overflow-wrap:anywhere}
`;

// O <style id="estiloChrome"> no <head>, uma vez (no Node, sem document, não faz nada).
function estilo(d) {
  d = d || (typeof document !== "undefined" ? document : null);
  if (!d || !d.head || d.getElementById("estiloChrome")) return;
  const s = d.createElement("style");
  s.id = "estiloChrome";
  s.textContent = CSS;
  d.head.appendChild(s);
}

const Chrome = {MODOS, MAX_ACOES, TEXTO_MAX, PERFIL_MAX, ONLINE_MS, TITULO, CSS, normalizar, doPc, cartao, bloco, estilo,
  haTexto, linha, nomeCurto, esc};
if (typeof module !== "undefined" && module.exports) module.exports = Chrome;
raiz.Chrome = Chrome;
})(typeof window !== "undefined" ? window : globalThis);
