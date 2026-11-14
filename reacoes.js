// Seaninho no celular: as reações nas mensagens, como no WhatsApp (CONTRATO-reacoes.md, 12/11/2026). Pedido do Arthur
// (09h01): "Adicionar reação às mensagens, por elas eu consigo mostrar se está indo bem. Se gostei, se não gostei. [...]
// Tudo comum entre monitor e celular."
//
// - As regras (as mesmas do Pro, do agente e da caixa; os casos comuns no reacoes-casos.json): emojiValido, normalizar,
//   casar (o registro vai ao balão pelo id, sem o "m:", ou pela assinatura: o mesmo "de", os 48 primeiros caracteres
//   normalizados e até 900 s de diferença) e a dobra (por balão e por pessoa, pela hora: "por" troca, "tirar" só tira o
//   emoji atual).
// - A tela: o toque longo no balão abre a fileira 👍 👎 ❤️ 😂 😮 🙏 ✅ ⚠️ + "+" EM CIMA do menu de hoje ("Responder" e
//   "Copiar o texto" continuam); no PC, o clique direito e o "☺" que aparece com o mouse em cima. O "+" abre a grade
//   por categorias com o campo para colar ou digitar qualquer emoji. Embaixo do balão, um chip por pessoa ("👎 Arthur",
//   "✅ Hokage", Arthur primeiro); o toque no chip mostra quem e a hora, e no meu, tocar de novo tira; o ⚠️ do Hokage
//   leva a linha do porquê embaixo. Uma reação por pessoa: outro emoji troca, o mesmo tira.
// - Mandar: na hora, meio apagada (otimista) até o PC dono devolver na lista da sessão ("reacoes"); erro volta ao que era
//   e avisa ("Não consegui reagir: …"); sem rede, espera e manda de novo (o PC não grava duas vezes o mesmo id).
//   cel_pedir({pc dono, tipo: "acao", texto: {"acao": "reacao", reacao, guardar, entregar, caixa}}) e, numa sessão
//   comum com a central principal (o maestro) em outro PC, um segundo só com a caixa. Na conversa de uma central de
//   qualquer PC (o hokage ou o maestro do WIN), só o pedido ao PC dono, com a caixa (5.4).
// Tudo o que vem de fora entra como texto (esc), nunca como HTML.
(function (raiz) {
"use strict";

const FILEIRA = ["👍", "👎", "❤️", "😂", "😮", "🙏", "✅", "⚠️"];
const ALERTA = ["👎", "⚠️", "❓", "❌", "😡", "😠", "😢", "🤔"];
const QUEM = ["arthur", "hokage"];
const NOMES = {arthur: "Arthur", hokage: "Hokage"};
const DE_MSG = ["eu", "claude", "sessao"];
const JANELA_S = 14 * 24 * 3600, LETRAS = 48, JAN_ASS = 900, TRECHO = 120, NOTA = 140;
const VS16 = "️";
const FEITO_MS = 3 * 60 * 1000;     // o PC disse "entregue" e a lista ainda não trouxe: depois disso, a lista é a verdade
const RECENTES = "seaninho.reacoes.recentes", FILA = "seaninho.reacoes.fila";
const ID_FORA = /^(p:|local|perm:|dia:)/;   // os balões que ainda não estão na conversa do PC (o meu pedido andando)
const CITACAO = /^\s*↩ Respondendo a \([^)]*\): ".*?" — /s;
const ANEXO = /^\s*\[(imagem|pdf): [^\]]*\]\s*$/gm;

// A grade do "+" (as categorias do WhatsApp, enxutas). "Recentes" é a do aparelho.
const CATEGORIAS = [
  ["rostos", "😀", "Rostos", "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤔 🤨 😐 😑 😶 🙄 😏 😬 😌 😔 😴 😷 🤒 🤯 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😢 😭 😱 😖 😞 😓 😩 😫 😤 😡 😠 🤬"],
  ["gestos", "👍", "Gestos", "👍 👎 👏 🙌 👐 🤝 🙏 ✍️ 💪 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 🫡 👀 🧠 🫶"],
  ["coracoes", "❤️", "Corações", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❤️‍🔥 💕 💞 💓 💗 💖 💘 💝"],
  ["simbolos", "✅", "Símbolos", "✅ ☑️ ✔️ ❌ ❎ ⚠️ ❓ ❗ 💯 🔥 ⭐ 🌟 ✨ ⚡ 💡 🎯 🚩 🏁 🔴 🟠 🟡 🟢 🔵 🟣 ⚪ ⚫ ➕ ➖ ⏳ ⌛ 🔁 🆗 🆕 🔝"],
  ["trabalho", "📄", "Trabalho", "📌 📎 📝 📄 📊 📈 📉 🗂️ 📁 🗓️ ⏰ 💻 🖥️ 🖨️ 📷 🔍 🔧 🛠️ 🧱 🏗️ 🏠 🏢 🏖️ 🚗 ✈️ 🚀 💰 🧾 📦 🎉 🎁 🏆 🥇 ☕"],
  ["natureza", "🌴", "Natureza", "🌞 🌙 ⛅ 🌧️ 🌈 🌊 🌴 🌵 🌱 🌸 🌻 🍀 🐶 🐱 🦊 🐻 🐼 🐵 🦁 🐢 🐬 🦋"],
  ["bandeiras", "🏁", "Bandeiras", "🇧🇷 🇵🇹 🇺🇸 🏳️ 🏴 🚩 🏁"],
].map(([id, icone, nome, lista]) => ({id, icone, nome, emojis: lista.split(" ")}));

// ---- As regras puras ---------------------------------------------------------------------------------------------
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const umaLinha = t => String(t ?? "").replace(/\s+/g, " ").trim();
const cortar = (t, n) => { t = umaLinha(t); return [...t].length <= n ? t : [...t].slice(0, n - 1).join("").trimEnd() + "…"; };
const semVariacao = e => String(e ?? "").split(VS16).join("");
const mesmoEmoji = (a, b) => semVariacao(a) === semVariacao(b);
const ehAlerta = e => ALERTA.some(x => mesmoEmoji(x, e));
const semM = i => { i = String(i ?? ""); return i.startsWith("m:") ? i.slice(2) : i; };
const mesmoPc = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
const chaveConversa = c => { const s = String(c ?? ""), i = s.indexOf("|");
  return i < 0 ? `${s.trim().toLowerCase()}|` : `${s.slice(0, i).trim().toLowerCase()}|${s.slice(i + 1).trim().toLowerCase()}`; };

// O emoji na forma da fileira: o "⚠" vira "⚠️" e o "❤" vira "❤️" (com e sem o U+FE0F é o mesmo emoji).
function canonico(e) {
  e = String(e ?? "");
  if (e && !e.includes(VS16)) for (const x of [...FILEIRA, ...ALERTA, "👀"]) if (semVariacao(x) === e && x !== e) return x;
  return e;
}

// A regra da seção 2 (refeita em 12/11 12h4x, depois do cético): de 1 a 10 pontos de código; pelo menos um símbolo
// (So) ou o U+20E3 do "1️⃣"; os outros só So, Sk (tom de pele), Mn/Me (U+FE0F, U+20E3), o U+200D e as tags
// U+E0020–U+E007F (as bandeiras de região); 0-9, # e * só logo antes do U+20E3 (com ou sem o U+FE0F no meio). Fica de
// fora o invisível (U+200B, o U+FE0F sozinho), o controle de direção (U+202E), letra de qualquer língua e pontuação.
const KEYCAP = "⃣", ZWJ = "‍";
const SO = /^\p{So}$/u, OUTROS = /^[\p{Sk}\p{Mn}\p{Me}]$/u;
function emojiValido(e) {
  if (typeof e !== "string") return false;
  const cps = Array.from(e);
  if (cps.length < 1 || cps.length > 10) return false;
  let simbolo = false;
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i], cp = c.codePointAt(0);
    if (SO.test(c)) simbolo = true;
    else if (OUTROS.test(c) || c === ZWJ || (cp >= 0xE0020 && cp <= 0xE007F)) continue;
    else if ("0123456789#*".includes(c) && cps.slice(i + 1, i + 3).includes(KEYCAP)) continue;
    else return false;
  }
  return simbolo || cps.includes(KEYCAP);
}
// Um emoji só (um grafema), quando o aparelho sabe contar (o campo do "+": "👍👍" é válido pela regra, mas são dois).
function umSo(e) {
  try { return [...new Intl.Segmenter("pt-BR", {granularity: "grapheme"}).segment(e)].length === 1; } catch { return true; }
}

// NFC; sem a linha de citação do começo e sem as linhas [imagem: …] e [pdf: …]; os espaços juntos; minúsculas.
function normalizar(t) {
  return String(t ?? "").normalize("NFC").replace(CITACAO, "").replace(ANEXO, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
// O texto do balão como a pessoa vê (sem a citação e sem as linhas de anexo), para o trecho do registro.
const visivel = t => umaLinha(String(t ?? "").replace(CITACAO, "").replace(ANEXO, " "));

// Os registros por balão e por pessoa, pela hora (empate: a ordem de chegada): {quem: o registro do "por" que vale}.
function dobrar(lista) {
  const atual = {};
  for (const {r} of [...lista].sort((a, b) => a.em - b.em || a.ordem - b.ordem)) {
    if (r.acao === "por") atual[r.quem] = r;
    else if (r.acao === "tirar" && atual[r.quem] && mesmoEmoji(atual[r.quem].emoji, r.emoji)) delete atual[r.quem];
  }
  return atual;
}

// As reações de cada balão: {id: [{quem, emoji, em, nota?}]}, Arthur antes do Hokage. `conversa` null: os registros já
// são daquela conversa (o "reacoes" de uma sessão publicada, sem o campo).
function casar(mensagens, registros, conversa = null, aliases = [], agora = null) {
  const convs = conversa == null ? null : new Set([conversa, ...(aliases || [])].map(chaveConversa));
  const regs = (registros || []).filter(r => r && typeof r === "object" && (!convs || convs.has(chaveConversa(r.conversa)))
    && (agora == null || num(r.em) >= agora - JANELA_S));
  const validos = (mensagens || []).filter(m => m && DE_MSG.includes(m.de));
  const porId = new Map(validos.map(m => [semM(m.id), m]));
  const porMsg = new Map((mensagens || []).filter(m => m).map(m => [String(m.id), []]));
  regs.forEach((r, ordem) => {
    let alvo = porId.get(semM(r.msg));
    if (!alvo) {
      const a = normalizar(r.trecho).slice(0, LETRAS), t = num(r.t_msg);
      const cands = a ? validos.filter(m => m.de === r.de_msg && normalizar(m.texto).slice(0, LETRAS) === a && Math.abs(num(m.t) - t) <= JAN_ASS) : [];
      if (cands.length) alvo = cands.reduce((b, m) => { const db = Math.abs(num(b.t) - t), dm = Math.abs(num(m.t) - t);
        return dm < db || (dm === db && num(m.t) > num(b.t)) ? m : b; });
    }
    if (alvo) porMsg.get(String(alvo.id)).push({em: num(r.em), ordem, r});
  });
  const saida = {};
  for (const [id, lista] of porMsg) {
    const atual = dobrar(lista);
    saida[id] = QUEM.filter(q => atual[q]).map(q => {
      const it = {quem: q, emoji: canonico(atual[q].emoji), em: num(atual[q].em)};
      if (atual[q].nota) it.nota = String(atual[q].nota);
      return it;
    });
  }
  return saida;
}

const dois = n => String(n).padStart(2, "0");
function horaDe(t) { t = num(t); if (!t) return ""; const d = new Date(t * 1000); return `${dois(d.getHours())}:${dois(d.getMinutes())}`; }
// A hora no chip: "10:05", "ontem 18:02" ou "11/11 18:02"
function quando(em, agoraMs = Date.now()) {
  const d = new Date(num(em) * 1000), h = horaDe(em), hoje = new Date(agoraMs), ontem = new Date(agoraMs - 86400000);
  if (d.toDateString() === hoje.toDateString()) return h;
  if (d.toDateString() === ontem.toDateString()) return "ontem " + h;
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${h}`;
}
function novoId(ms = Date.now()) {
  let hex = "";
  try { hex = [...crypto.getRandomValues(new Uint8Array(2))].map(b => b.toString(16).padStart(2, "0")).join(""); }
  catch { hex = Math.floor(Math.random() * 65536).toString(16).padStart(4, "0"); }
  return `r-${Math.round(ms)}-${hex}`;
}

// O registro (seção 2 do contrato) da minha reação a um balão (info: {id, de, texto, t, pc, sessao, central}).
function registroDe(info, emoji, acao, ms = Date.now()) {
  return {v: 1, id: novoId(ms), conversa: `${info.pc}|${info.sessao}`, central: !!info.central, msg: String(info.id),
          de_msg: info.de, t_msg: num(info.t), hora_msg: horaDe(info.t), trecho: cortar(visivel(info.texto), TRECHO),
          emoji: canonico(emoji), quem: "arthur", acao, em: Math.round(ms) / 1000, onde: "celular", nota: ""};
}
// O pedido da ação "reacao" (5.2): ao PC dono, guardar e (só no "por" a uma sessão comum) entregar; a caixa, se o
// maestro é do mesmo PC. `soCaixa`: o segundo pedido, ao PC do maestro.
function acaoDe(reg, caixaAqui, soCaixa = false) {
  return soCaixa ? {acao: "reacao", reacao: reg, guardar: false, entregar: false, caixa: true}
    : {acao: "reacao", reacao: reg, guardar: true, entregar: reg.acao === "por" && !reg.central, caixa: !!caixaAqui};
}

// ---- O HTML (puro: as funções de tela só montam texto escapado) ----------------------------------------------------
function fileiraHtml(marcado = "") {
  return FILEIRA.map(e => { const m = marcado && mesmoEmoji(marcado, e);
    return `<button type="button" class="rx-e${m ? " rx-marcado" : ""}" data-rx-emoji="${esc(e)}" aria-pressed="${m}" aria-label="${m ? "Tirar" : "Reagir com"} ${esc(e)}">${esc(e)}</button>`; }).join("")
    + (marcado && !FILEIRA.some(e => mesmoEmoji(e, marcado))
      ? `<button type="button" class="rx-e rx-marcado" data-rx-emoji="${esc(marcado)}" aria-pressed="true" aria-label="Tirar ${esc(marcado)}">${esc(marcado)}</button>` : "")
    + `<button type="button" class="rx-mais" data-rx-mais aria-label="Mais emojis" title="Mais emojis">+</button>`;
}
function gradeHtml(recentes = []) {
  const cats = [...(recentes.length ? [{id: "recentes", icone: "🕘", nome: "Recentes", emojis: recentes}] : []), ...CATEGORIAS];
  return `<div class="rx-g-topo"><b>Reagir com qualquer emoji</b><button type="button" class="rx-x" data-rx-fechar aria-label="Fechar">✕</button></div>
    <div class="rx-campo"><input type="text" class="rx-input" data-rx-campo inputmode="text" enterkeyhint="done" autocomplete="off"
      maxlength="24" placeholder="Digite ou cole um emoji" aria-label="Digite ou cole um emoji"><button type="button" class="rx-usar" data-rx-usar>Usar</button></div>
    <div class="rx-erro" data-rx-erro role="alert"></div>
    <div class="rx-cats" role="tablist">${cats.map(c => `<button type="button" class="rx-cat" role="tab" data-rx-cat="${esc(c.id)}" aria-label="${esc(c.nome)}" title="${esc(c.nome)}">${esc(c.icone)}</button>`).join("")}</div>
    <div class="rx-lista">${cats.map(c => `<section class="rx-sec" data-rx-sec="${esc(c.id)}"><h4>${esc(c.nome)}</h4><div class="rx-g">${
      c.emojis.map(e => `<button type="button" class="rx-ge" data-rx-emoji="${esc(e)}" aria-label="${esc(e)}">${esc(e)}</button>`).join("")}</div></section>`).join("")}</div>`;
}
// Os chips de um balão (itens do casar, Arthur primeiro), a linha do porquê do ⚠️/❓ do Hokage. `pend`: os "em" das minhas
// reações que ainda não voltaram do PC (meio apagadas). `lado`: "eu" (à direita) ou "ele".
function chipsHtml(id, itens, {lado = "ele", pend = new Set(), agoraMs = Date.now(), nomes = NOMES} = {}) {
  if (!itens || !itens.length) return "";
  const chips = itens.map(it => {
    const p = it.quem === "arthur" && pend.has(it.em), nome = nomes[it.quem] || it.quem;
    return `<button type="button" class="rx-chip rx-${esc(it.quem)}${p ? " rx-pend" : ""}${ehAlerta(it.emoji) ? " rx-alerta" : ""}" data-rx-chip="${esc(it.quem)}" data-rx-linha="${esc(id)}"
      aria-label="${esc(nome)} reagiu ${esc(it.emoji)}${it.em ? " às " + esc(quando(it.em, agoraMs)) : ""}${p ? " (mandando)" : ""}"><span class="rx-emo">${esc(it.emoji)}</span><span class="rx-quem">${esc(nome)}</span></button>`;
  }).join("");
  const notas = itens.filter(it => it.quem === "hokage" && it.nota).map(it =>
    `<div class="rx-nota">${esc(it.emoji)} ${esc(nomes.hokage || "Hokage")}: ${esc(cortar(it.nota, NOTA))}</div>`).join("");
  return `<div class="rx-chips rx-${lado === "eu" ? "eu" : "ele"}" data-rx-linha="${esc(id)}">${chips}</div>${notas ? `<div class="rx-notas rx-${lado === "eu" ? "eu" : "ele"}">${notas}</div>` : ""}`;
}
function infoHtml(it, minha, agoraMs = Date.now(), nomes = NOMES) {
  return `<div class="rx-info-l"><span class="rx-emo">${esc(it.emoji)}</span><b>${esc(nomes[it.quem] || it.quem)}</b><span class="rx-h">${esc(quando(it.em, agoraMs))}</span></div>`
    + (it.nota ? `<div class="rx-info-n">${esc(cortar(it.nota, NOTA))}</div>` : "")
    + (minha ? `<button type="button" class="rx-tirar" data-rx-tirar>Tirar a reação</button><div class="rx-dica">ou toque de novo no chip</div>` : "");
}

// ---- A tela (com a página: ligar(ctx)) ---------------------------------------------------------------------------
let ctx = null;
const pendentes = new Map();   // "pc|sessão|balão" -> {reg, antes, estado: mandando|fila|enviado|feito, pedido, desde, feitoEm}
const caixas = new Map();      // o 2º pedido (só a caixa, ao PC do maestro): id do registro -> {pc, reg, estado, pedido}
let preparado = {conversa: "", por: {}, linhas: new Map(), pend: new Set(), nomes: NOMES};
let alvo = null;               // o balão da fileira ou da grade abertas
let infoAberta = null;         // {id, quem} do chip com a hora à mostra
let ultimoPonteiro = "";
const els = {};

const chaveDe = info => `${String(info.pc).toLowerCase()}|${String(info.sessao).toLowerCase()}|${info.id}`;
const agoraS = () => Date.now() / 1000;
const guardarFila = () => { try { ctx && ctx.store && ctx.store.set(FILA, JSON.stringify({p: [...pendentes], c: [...caixas]})); } catch {} };
function lerRecentes() { try { const r = JSON.parse((ctx && ctx.store && ctx.store.get(RECENTES)) || "[]"); return Array.isArray(r) ? r.filter(emojiValido).slice(0, 16) : []; } catch { return []; } }
function lembrarRecente(e) { if (!ctx || !ctx.store) return; const r = [e, ...lerRecentes().filter(x => !mesmoEmoji(x, e))].slice(0, 16); try { ctx.store.set(RECENTES, JSON.stringify(r)); } catch {} }

// O balão pode receber reação? (o que já está na conversa do PC; o aviso, a permissão e o meu pedido andando, não)
function reagivel(l) {
  return !!l && DE_MSG.includes(l.de) && !l.permissao && !ID_FORA.test(String(l.id ?? "")) && String(l.id ?? "") !== "";
}
// A central dona da conversa, de qualquer PC (5.4, corretor de 12/11: o maestro do WIN também é central, e não só o
// principal): a sessão que o agente marca como a central do PC dele ("central": o nome dela, agente 0.9.0.16), a
// orquestra que cada PC publica (ctx.centrais(): {pc, sessao, nome}) ou a principal (ctx.maestro()). {pc, sessao, nome}
// ou null.
function centralDe(s) {
  if (!s) return null;
  if (typeof s.central === "string" && s.central.trim()) return {pc: s.pc, sessao: s.id, nome: umaLinha(s.central).slice(0, 40)};
  const lista = [...((ctx && ctx.centrais && ctx.centrais()) || []), (ctx && ctx.maestro && ctx.maestro()) || null];
  return lista.find(c => c && mesmoPc(c.pc, s.pc) && String(c.sessao || "") !== ""
    && String(c.sessao).toLowerCase() === String(s.id || "").toLowerCase()) || null;
}
const ehCentral = s => !!centralDe(s);

// As minhas reações andando, como registros (entram na dobra com as que vieram do PC): a mais nova de cada balão e as
// que ela trocou e já tinham saído (os "antigos": o PC recebe todas e dobra pela hora, então aqui também).
function registrosPendentes(conversa) {
  const k = chaveConversa(conversa);
  return [...pendentes.values()].filter(p => chaveConversa(p.reg.conversa) === k).flatMap(p => [...(p.antigos || []), p.reg]);
}

// Antes de desenhar a conversa (desenharMensagens): as reações de cada balão, com a lista do PC e as minhas andando.
function preparar(s, linhas, agoraMs = Date.now()) {
  if (!s) { preparado = {conversa: "", por: {}, linhas: new Map(), pend: new Set(), nomes: NOMES}; return preparado; }
  const pc = s.pc || (ctx && ctx.pcDe ? ctx.pcDe(s) : ""), conversa = `${pc}|${s.id}`;
  const msgs = (linhas || []).filter(l => l && (l.tipo === undefined || l.tipo === "msg"));
  const doPc = Array.isArray(s.reacoes) ? s.reacoes : [];
  const minhas = registrosPendentes(conversa);
  const por = casar(msgs, [...doPc, ...minhas], null, [], agoraMs / 1000);
  const cen = centralDe({...s, pc}), central = !!cen;
  const mapa = new Map();
  for (const l of msgs) if (reagivel(l)) mapa.set(String(l.id), {id: String(l.id), de: l.de, texto: l.texto || "", t: num(l.t), pc, sessao: s.id, central});
  const pend = new Set([...pendentes.values()].filter(p => ["mandando", "fila", "enviado"].includes(p.estado)).map(p => p.reg.em));
  // o chip e a linha do porquê com o nome da central dona da conversa (no WIN, o maestro de lá), "Hokage" sem ele
  const nomes = {...NOMES, ...(cen && cen.nome ? {hokage: cen.nome} : {})};
  preparado = {conversa, por, linhas: mapa, pend, nomes};
  return preparado;
}
function atualDe(info) { return ((preparado.por[info.id] || []).find(x => x.quem === "arthur")) || null; }

// O que vai embaixo do balão (desenharLinha): os chips e a linha do porquê.
function chipsDe(l) {
  if (!l) return "";
  return chipsHtml(String(l.id), preparado.por[String(l.id)] || [], {lado: l.de === "eu" ? "eu" : "ele", pend: preparado.pend, nomes: preparado.nomes || NOMES});
}
// O "☺" que aparece com o mouse em cima do balão (no PC), dentro da bolha.
function botao(l) {
  return reagivel(l) && preparado.linhas.has(String(l.id))
    ? `<button type="button" class="rx-abrir" data-rx-abrir="${esc(l.id)}" aria-label="Reagir" title="Reagir">☺</button>` : "";
}
// O gancho do desenharMensagens: o HTML que o desenharLinha fez para o balão, com o ☺ dentro da bolha (antes da hora,
// que é a última coisa dela) e os chips no fim da linha (embaixo da bolha). A linha da página não muda: o balão de hoje
// termina sempre na bolha (o "⚠ Não entregue" é só do meu pedido andando, que não recebe reação) e o recado de outra
// sessão, no texto dele.
function enfeitar(html, l) {
  html = String(html ?? "");
  if (!html || !l || !html.endsWith("</div>")) return html;
  const chips = chipsDe(l), b = html.startsWith('<div class="linha-msg') ? botao(l) : "";
  if (!chips && !b) return html;
  let out = html;
  if (b) { const i = out.lastIndexOf('<span class="hora">'); if (i > 0) out = out.slice(0, i) + b + out.slice(i); }
  return chips ? out.slice(0, -"</div>".length) + chips + "</div>" : out;
}

// ---- Posição: a fileira nunca sai da tela ----------------------------------------------------------------------
// r: o retângulo do balão; menu e fileira: os tamanhos. Devolve {menu: {top, left}, fileira: {top, left}} na tela. Em
// cima do balão quando cabe (a fileira e o menu); senão embaixo dele (o balão no alto da tela); o balão que ocupa a tela
// inteira: tudo no pé da tela.
function lugar(r, menu, fil, tela, lado = "ele", gap = 8, margem = 8, topo = 56) {
  const total = (fil ? fil.h + gap : 0) + (menu ? menu.h : 0);
  let top;
  if (r.top - gap - total >= topo) top = r.top - gap - total;
  else if (r.bottom + gap + total <= tela.h - margem) top = r.bottom + gap;
  else top = Math.max(margem, tela.h - margem - total);
  const x = w => Math.max(margem, Math.min(tela.w - margem - w, lado === "eu" ? r.right - w : r.left));
  const out = {};
  if (fil) { out.fileira = {top, left: x(fil.w)}; top += fil.h + gap; }
  if (menu) out.menu = {top, left: x(menu.w)};
  return out;
}
const tela = () => ({w: (ctx && ctx.win && ctx.win.innerWidth) || 390, h: (ctx && ctx.win && ctx.win.innerHeight) || 844});
const tam = el => ({w: el.offsetWidth || 0, h: el.offsetHeight || 0});

// No toque longo (o fim do abrirMenuBalao): a fileira em cima do menu de hoje, só no balão que recebe reação.
function noMenu(linhaEl, menu) {
  const f = els.fileiraMenu;
  if (!f || !menu || !linhaEl) return null;
  const info = preparado.linhas.get(String(linhaEl.dataset && linhaEl.dataset.id));
  fecharInfo();
  if (!info) { f.classList.add("hidden"); alvo = null; return null; }
  alvo = info;
  const atual = atualDe(info);
  f.innerHTML = fileiraHtml(atual ? atual.emoji : "");
  f.classList.remove("hidden");
  const bolha = (linhaEl.querySelector && linhaEl.querySelector(".bolha")) || linhaEl;
  const r = bolha.getBoundingClientRect(), pos = lugar(r, tam(menu), tam(f), tela(), linhaEl.classList.contains("eu") ? "eu" : "ele");
  menu.style.top = pos.menu.top + "px"; menu.style.left = pos.menu.left + "px";
  const borda = menu.clientLeft || 0, bordaTopo = menu.clientTop || 0;
  f.style.top = (pos.fileira.top - pos.menu.top - bordaTopo) + "px"; f.style.left = (pos.fileira.left - pos.menu.left - borda) + "px";
  if (ultimoPonteiro !== "touch") focar(f, atual);
  return pos;
}
// A fileira sozinha (o recado de outra sessão, que não tem o menu de hoje)
function abrirSolta(el, info) {
  const s = els.solta;
  if (!s || !info) return null;
  fecharInfo();
  alvo = info;
  const atual = atualDe(info);
  s.innerHTML = fileiraHtml(atual ? atual.emoji : "");
  s.classList.remove("hidden");
  const pos = lugar(el.getBoundingClientRect(), null, tam(s), tela(), "ele");
  s.style.top = pos.fileira.top + "px"; s.style.left = pos.fileira.left + "px";
  if (ctx && ctx.vibrar) ctx.vibrar();
  if (ultimoPonteiro !== "touch") focar(s, atual);
  return pos;
}
function focar(caixa, atual) {
  const bs = caixa.querySelectorAll ? [...caixa.querySelectorAll("button")] : [];
  const b = (atual && bs.find(x => x.dataset && mesmoEmoji(x.dataset.rxEmoji, atual.emoji))) || bs[0];
  if (b && b.focus) b.focus();
}
function abrirGrade(info) {
  const g = els.grade;
  if (!g || !info) return;
  alvo = info;
  g.innerHTML = gradeHtml(lerRecentes());
  g.classList.remove("hidden");
  if (els.fundo) els.fundo.classList.remove("hidden");
  const c = g.querySelector && g.querySelector("[data-rx-campo]");
  if (c && ultimoPonteiro !== "touch" && c.focus) c.focus();
}
function fecharGrade() { if (els.grade) els.grade.classList.add("hidden"); if (els.fundo) els.fundo.classList.add("hidden"); }
function fecharInfo() { if (els.info) els.info.classList.add("hidden"); infoAberta = null; }
function fechar() {
  if (els.solta) els.solta.classList.add("hidden");
  fecharGrade(); fecharInfo();
}
const aberto = () => [els.solta, els.grade, els.info].some(e => e && !e.classList.contains("hidden"));

// O toque num chip: quem e a hora; no meu, tocar de novo tira.
function tocarChip(id, quem, chipEl) {
  const info = preparado.linhas.get(String(id)), it = (preparado.por[String(id)] || []).find(x => x.quem === quem);
  if (!it) return;
  if (quem === "arthur" && info && infoAberta && infoAberta.id === String(id) && infoAberta.quem === "arthur") {
    fecharInfo();
    return reagir(info, it.emoji);
  }
  infoAberta = {id: String(id), quem};
  const box = els.info;
  if (!box) return;
  alvo = info || null;
  box.innerHTML = infoHtml(it, quem === "arthur" && !!info, Date.now(), preparado.nomes || NOMES);
  box.classList.remove("hidden");
  if (chipEl && chipEl.getBoundingClientRect) {
    const pos = lugar(chipEl.getBoundingClientRect(), null, tam(box), tela(), "ele");
    box.style.top = pos.fileira.top + "px"; box.style.left = pos.fileira.left + "px";
  }
}

// ---- Reagir, mandar e acompanhar ----------------------------------------------------------------------------------
const semRede = e => !!(e && (e.rede || e.name === "TypeError" || e.name === "AbortError")) || (ctx && ctx.online && !ctx.online());
function motivo(e) {
  const m = String((e && (e.message || e.erro)) || e || "").trim();
  if (/desconhecida|ainda não dá para fazer/i.test(m)) return "o Seaninho do celular desse PC ainda não tem as reações (falta atualizar)";
  return m || "o PC não conseguiu";
}

// A minha reação a um balão do jeito que o PC vai ter antes desta: a lista dele e as minhas que já saíram (`antigos`).
function atualNoPc(info, antigos) {
  const s = ctx && ctx.sessao ? ctx.sessao(info.pc, info.sessao) : null;
  const doPc = s && Array.isArray(s.reacoes) ? s.reacoes : [];
  const msgs = preparado.linhas.size ? [...preparado.linhas.values()] : [info];
  const por = casar(msgs, [...doPc, ...antigos], null, [], agoraS());
  return ((por[String(info.id)] || []).find(x => x.quem === "arthur")) || null;
}

// Reagir a um balão com um emoji: o mesmo que está lá tira; outro troca. Na hora, otimista.
// Trocar e tirar antes de o PC devolver a anterior (👎 firme → ❤️ andando → tocar ❤️ de novo): a ❤️ que já saiu fica nos
// "antigos" (ela chega ao PC e entra na dobra daqui), e o "tirar ❤️" tira a ❤️, sem o 👎 voltar. A que ainda não tinha
// saído (sem rede) não sai mais; aí o "tirar" vai contra o que o PC tem (o 👎).
function reagir(info, emoji, ms = Date.now()) {
  if (!info || !ctx) return null;
  emoji = canonico(String(emoji ?? "").trim());
  if (!emojiValido(emoji)) { aviso("Isso não é um emoji: escolha um da lista ou cole um emoji só.", true); return null; }
  const chave = chaveDe(info), ant = pendentes.get(chave);
  const antigos = ant ? [...(ant.antigos || []), ...(ant.estado === "fila" ? [] : [ant.reg])] : [];
  const atual = atualDe(info), tirar = !!atual && mesmoEmoji(atual.emoji, emoji);
  const noPc = tirar ? atualNoPc(info, antigos) : null;
  const reg = registroDe(info, tirar ? (noPc ? noPc.emoji : atual.emoji) : emoji, tirar ? "tirar" : "por", ms);
  pendentes.set(chave, {reg, antigos, antes: atual, estado: "mandando", pedido: "", desde: ms, feitoEm: 0});
  if (!tirar) lembrarRecente(reg.emoji);
  guardarFila(); fechar();
  if (ctx.vibrar) ctx.vibrar();
  redesenhar();
  enviar(chave);
  return reg;
}
async function enviar(chave) {
  const p = pendentes.get(chave);
  if (!p) return;
  const reg = p.reg, dono = reg.conversa.split("|")[0], m = (ctx.maestro && ctx.maestro()) || {};
  // 5.4: na conversa de uma central (a principal ou a de outro PC), quem fica sabendo é a própria central dona dela: o
  // pedido vai só ao PC dono, com a caixa e sem recado; na de uma sessão comum, a central principal (o 2º pedido, se é
  // de outro PC)
  const caixaAqui = !!reg.central || (!!m.pc && mesmoPc(m.pc, dono));
  p.estado = "mandando";
  try {
    const id = await ctx.rpc("cel_pedir", {pc: dono, tipo: "acao", texto: JSON.stringify(acaoDe(reg, caixaAqui))});
    if (pendentes.get(chave) !== p) return;   // trocou de novo no meio: vale a mais nova
    p.pedido = String(id ?? ""); p.estado = "enviado";
  } catch (e) {
    if (pendentes.get(chave) !== p) return;
    if (semRede(e)) { p.estado = "fila"; guardarFila(); redesenhar(); return; }
    return desfazer(chave, p, motivo(e));
  }
  if (m.pc && !caixaAqui) { caixas.set(reg.id, {pc: m.pc, reg, estado: "mandando", pedido: ""}); enviarCaixa(reg.id); }
  guardarFila(); redesenhar();
}
async function enviarCaixa(rid) {
  const c = caixas.get(rid);
  if (!c) return;
  c.estado = "mandando";
  try { c.pedido = String(await ctx.rpc("cel_pedir", {pc: c.pc, tipo: "acao", texto: JSON.stringify(acaoDe(c.reg, false, true))}) ?? ""); c.estado = "enviado"; }
  catch (e) { if (semRede(e)) c.estado = "fila"; else { caixas.delete(rid); aviso(`O Hokage não ficou sabendo da reação: ${motivo(e)}`, true); } }
  guardarFila();
}
function desfazer(chave, p, porque) {
  pendentes.delete(chave);
  caixas.delete(p.reg.id);
  guardarFila();
  aviso(`Não consegui reagir: ${porque}`, true);
  redesenhar();
}
function aviso(msg, erro = false) { if (ctx && ctx.avisar) ctx.avisar(msg, {erro, ok: !erro}); }
function redesenhar() { if (ctx && ctx.redesenhar) ctx.redesenhar(); }

// A lista do PC já trouxe a minha reação? (o mesmo balão, a mesma ação, o mesmo emoji e a mesma hora)
function naLista(p) {
  const [pc, sid] = [p.reg.conversa.split("|")[0], p.reg.conversa.split("|").slice(1).join("|")];
  const s = ctx.sessao ? ctx.sessao(pc, sid) : null;
  return !!s && Array.isArray(s.reacoes) && s.reacoes.some(r => r && r.quem === "arthur" && r.acao === p.reg.acao
    && semM(r.msg) === semM(p.reg.msg) && mesmoEmoji(r.emoji, p.reg.emoji) && Math.abs(num(r.em) - p.reg.em) < 0.002);
}
// A cada volta da página (depois do vigiarAcoes): o fim de cada pedido, a lista do PC e a fila sem rede.
function volta(agoraMs = Date.now()) {
  if (!ctx) return;
  const pedidos = (ctx.pedidos && ctx.pedidos()) || [], online = !ctx.online || ctx.online();
  let mudou = false;
  for (const [chave, p] of [...pendentes]) {
    if (p.estado === "fila") { if (online) enviar(chave); continue; }
    if (p.estado === "enviado") {
      const ped = pedidos.find(x => x && x.id === p.pedido);
      if (ped && ["erro", "cancelado"].includes(ped.estado)) { desfazer(chave, p, motivo(ped.erro || "cancelado")); continue; }
      if (ped && ped.estado === "entregue") { p.estado = "feito"; p.feitoEm = agoraMs; mudou = true; }
    }
    if (naLista(p) || (p.estado === "feito" && agoraMs - p.feitoEm > FEITO_MS)) { pendentes.delete(chave); mudou = true; }
  }
  for (const [rid, c] of [...caixas]) {
    if (c.estado === "fila") { if (online) enviarCaixa(rid); continue; }
    const ped = c.estado === "enviado" && pedidos.find(x => x && x.id === c.pedido);
    if (ped && ["erro", "cancelado"].includes(ped.estado)) { caixas.delete(rid); mudou = true; aviso(`O Hokage não ficou sabendo da reação: ${motivo(ped.erro || "cancelado")}`, true); }
    else if (ped && ped.estado === "entregue") { caixas.delete(rid); mudou = true; }
  }
  if (mudou) { guardarFila(); redesenhar(); }
}

// ---- Os eventos (um ouvinte por elemento; o resto da página não muda) -----------------------------------------------
function tocarFileira(e) {
  const b = e.target && e.target.closest ? e.target.closest("[data-rx-emoji],[data-rx-mais]") : null;
  if (!b || !alvo) return;
  const info = alvo;
  if (ctx.fecharMenu) ctx.fecharMenu();
  if (b.dataset.rxMais !== undefined) { if (els.solta) els.solta.classList.add("hidden"); return abrirGrade(info); }
  reagir(info, b.dataset.rxEmoji);
}
function teclasFileira(e) {
  const bs = e.currentTarget && e.currentTarget.querySelectorAll ? [...e.currentTarget.querySelectorAll("button")] : [];
  const i = bs.indexOf(e.target);
  const ir = j => { e.preventDefault(); const b = bs[(j + bs.length) % bs.length]; if (b && b.focus) b.focus(); };
  if (e.key === "ArrowRight") ir(i + 1);
  else if (e.key === "ArrowLeft") ir(i - 1);
  else if (e.key === "Home") ir(0);
  else if (e.key === "End") ir(bs.length - 1);
  else if (e.key === "Escape") { e.preventDefault(); if (ctx.fecharMenu) ctx.fecharMenu(); fechar(); }
}
function usarCampo() {
  const g = els.grade, c = g && g.querySelector && g.querySelector("[data-rx-campo]"), erro = g && g.querySelector && g.querySelector("[data-rx-erro]");
  const v = canonico(String((c && c.value) || "").trim());
  if (!emojiValido(v) || !umSo(v)) { if (erro) erro.textContent = "Isso não é um emoji só: cole ou digite um emoji (o teclado de emojis do celular)."; return false; }
  const info = alvo;
  fecharGrade();
  reagir(info, v);
  return true;
}
function tocarGrade(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest("[data-rx-fechar]")) return fecharGrade();
  if (t.closest("[data-rx-usar]")) return usarCampo();
  const cat = t.closest("[data-rx-cat]");
  if (cat) { const sec = els.grade.querySelector(`[data-rx-sec="${cat.dataset.rxCat}"]`); if (sec && sec.scrollIntoView) sec.scrollIntoView({block: "start"}); return; }
  const b = t.closest("[data-rx-emoji]");
  if (b && alvo) { const info = alvo; fecharGrade(); reagir(info, b.dataset.rxEmoji); }
}
function tocarConversa(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  const ab = t.closest("[data-rx-abrir]");
  if (ab) { e.preventDefault(); const linha = ab.closest(".linha-msg"); if (linha && ctx.abrirMenu) ctx.abrirMenu(linha); return; }
  const chip = t.closest("[data-rx-chip]");
  if (chip) { e.preventDefault(); tocarChip(chip.dataset.rxLinha, chip.dataset.rxChip, chip); }
}
let longo = null;
function pegar(e) {
  ultimoPonteiro = e.pointerType || "";
  const el = e.target && e.target.closest ? e.target.closest(".aviso.sessao[data-id]") : null;
  if (!el || (e.button || 0) > 0 || (e.target.closest && e.target.closest("button"))) return;
  const info = preparado.linhas.get(String(el.dataset.id));
  if (!info) return;
  longo = {x: e.clientX, y: e.clientY, t: setTimeout(() => { longo = null; abrirSolta(el, info); }, 500)};
}
function mexer(e) { if (longo && Math.hypot(e.clientX - longo.x, e.clientY - longo.y) > 10) { clearTimeout(longo.t); longo = null; } }
function soltar() { if (longo) { clearTimeout(longo.t); longo = null; } }
function menuDoMouse(e) {
  const t = e.target;
  if (!t || !t.closest || !ctx) return;
  const linha = t.closest(".linha-msg"), sessao = t.closest(".aviso.sessao[data-id]");
  if (linha && preparado.linhas.has(String(linha.dataset.id)) && ctx.abrirMenu) { e.preventDefault(); ultimoPonteiro = "mouse"; ctx.abrirMenu(linha); }
  else if (sessao && preparado.linhas.has(String(sessao.dataset.id))) { e.preventDefault(); ultimoPonteiro = "mouse"; abrirSolta(sessao, preparado.linhas.get(String(sessao.dataset.id))); }
}
function foraDaqui(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  if (!t.closest("#rxSolta") && !t.closest("#rxGrade") && !t.closest("#rxInfo") && !t.closest("[data-rx-chip]")) {
    if (els.solta) els.solta.classList.add("hidden");
    if (!t.closest("#rxFundo")) fecharInfo();
  }
}
function tecla(e) {
  if (e.key !== "Escape" || !aberto()) return;
  fechar();
}

// Liga a tela: ctx = {doc, win, menu (o #dMenuBalao), msgs (o #dMsgs), rpc, avisar(msg, {erro}), redesenhar(),
// pedidos(), maestro() -> {pc, sessao}, sessao(pc, id) -> a sessão, online(), abrirMenu(linha), fecharMenu(), store
// {get, set}, vibrar()}. Põe a fileira dentro do menu de hoje e cria a fileira solta, a grade e a caixinha do chip.
function ligar(c) {
  ctx = c;
  const doc = c.doc;
  if (doc && doc.createElement) {
    const novo = (id, cls, role) => { const el = doc.createElement("div"); el.id = id; el.className = cls + " hidden"; if (role) el.setAttribute("role", role); return el; };
    els.fileiraMenu = novo("rxFileira", "rx-fileira rx-no-menu", "toolbar");
    els.fileiraMenu.setAttribute("aria-label", "Reagir");
    if (c.menu) c.menu.insertBefore(els.fileiraMenu, c.menu.firstChild || null);
    els.solta = novo("rxSolta", "rx-fileira rx-solta", "toolbar");
    els.solta.setAttribute("aria-label", "Reagir");
    els.fundo = novo("rxFundo", "rx-fundo");
    els.grade = novo("rxGrade", "rx-grade", "dialog");
    els.grade.setAttribute("aria-label", "Reagir com qualquer emoji");
    els.info = novo("rxInfo", "rx-info", "status");
    for (const el of [els.solta, els.fundo, els.grade, els.info]) doc.body.appendChild(el);
    for (const el of [els.fileiraMenu, els.solta]) { el.addEventListener("click", tocarFileira); el.addEventListener("keydown", teclasFileira); }
    els.grade.addEventListener("click", tocarGrade);
    els.grade.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.closest && e.target.closest("[data-rx-campo]")) { e.preventDefault(); usarCampo(); }
      else if (e.key === "Escape") { e.preventDefault(); fecharGrade(); } });
    els.fundo.addEventListener("click", fecharGrade);
    els.info.addEventListener("click", e => { if (e.target.closest && e.target.closest("[data-rx-tirar]") && infoAberta) {
      const info = preparado.linhas.get(infoAberta.id), it = (preparado.por[infoAberta.id] || []).find(x => x.quem === "arthur");
      fecharInfo(); if (info && it) reagir(info, it.emoji); } });
    if (c.msgs) {
      c.msgs.addEventListener("click", tocarConversa);
      c.msgs.addEventListener("pointerdown", pegar);
      c.msgs.addEventListener("pointermove", mexer);
      c.msgs.addEventListener("pointerup", soltar);
      c.msgs.addEventListener("pointercancel", soltar);
      c.msgs.addEventListener("contextmenu", menuDoMouse);
    }
    doc.addEventListener("pointerdown", foraDaqui, true);
    doc.addEventListener("keydown", tecla);
  }
  try {   // as reações que não saíram (sem rede, ou a página fechou no meio) voltam à fila
    const f = JSON.parse((c.store && c.store.get(FILA)) || "null");
    for (const [k, p] of (f && f.p) || []) if (p && p.reg && emojiValido(p.reg.emoji)) pendentes.set(k, {...p, estado: p.estado === "feito" ? "feito" : p.pedido ? "enviado" : "fila"});
    for (const [k, x] of (f && f.c) || []) if (x && x.reg) caixas.set(k, {...x, estado: x.pedido ? "enviado" : "fila"});
  } catch {}
}

const CSS = `
/* O MESMO VISUAL DO MONITOR (as medidas e as cores do começo do scripto/assets/geral_reacoes.css do Pro, pro-66): o
   mesmo chip, a mesma fileira, a mesma linha do porquê. O que muda aqui é o gesto (o toque longo) e o "+", que no
   celular abre de baixo. Como no Monitor, tudo das reações segue o tema do chat (lá, o chip e a pílula claros só com o
   chat claro). A conversa desta página é sempre escura (o aparelho no claro não muda o chat nem o menu de hoje, o
   #dMenuBalao): os chips, a linha do porquê, a fileira, a grade e a caixinha do chip ficam nas cores do escuro também
   com o aparelho no claro, sem pílula branca em cima da conversa escura. */
.rx-fileira{display:flex;align-items:center;gap:2px;padding:4px;border-radius:999px;background:#0F1F45;border:1px solid rgba(255,255,255,.16);
  box-shadow:0 12px 30px rgba(0,0,0,.5);white-space:nowrap;max-width:calc(100vw - 12px)}
.rx-no-menu{position:absolute;z-index:1}
.rx-solta{position:fixed;z-index:9}
.rx-fileira .rx-e,.rx-fileira .rx-mais{position:relative;flex:none;box-sizing:border-box;width:34px;height:34px;display:grid;place-items:center;
  border-radius:999px;font-size:20px;line-height:1;padding:0;color:#F4F6FB;transition:transform .08s ease}
.rx-fileira .rx-e::after,.rx-fileira .rx-mais::after{content:"";position:absolute;inset:-6px -1px}
.rx-fileira .rx-e:active{transform:scale(1.2)}
.rx-fileira .rx-marcado{background:rgba(226,184,74,.24);box-shadow:inset 0 0 0 2px #E2B84A}
.rx-fileira .rx-mais{font-size:18px;font-weight:600;color:#C3CEE6;border:1.5px dashed rgba(255,255,255,.18)}
@media (hover:hover){.rx-fileira .rx-e:hover,.rx-fileira .rx-mais:hover{background:rgba(111,168,255,.16);transform:scale(1.12)}}
.rx-fileira button:focus-visible,.rx-grade button:focus-visible,.rx-chip:focus-visible,.rx-abrir:focus-visible{outline:2px solid #B9D2FF;outline-offset:1px}
.menu-balao .rx-no-menu button{width:34px;padding:0;gap:0;border-radius:999px;font-size:20px;justify-content:center}
.menu-balao .rx-no-menu .rx-mais{width:34px;font-size:18px}
.rx-chips{display:flex;flex-wrap:wrap;gap:4px;max-width:88%;margin:-7px 8px 0;position:relative;z-index:1}
.rx-chips.rx-eu{justify-content:flex-end;margin-left:auto}
.rx-chips.rx-ele{margin-right:auto}
.linha-msg:has(> .rx-chips) > .bolha{padding-bottom:12px}
.linha-msg:has(> .rx-chips) + .linha-msg.seguida{margin-top:6px}
.aviso.sessao .rx-chips{margin:4px auto 0;justify-content:center}
.aviso.sessao[data-id]{-webkit-touch-callout:none}
.rx-chip{position:relative;box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 7px 0 5px;border-radius:999px;
  background:#14264F;border:1px solid rgba(255,255,255,.18);color:#F4F6FB;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:opacity .15s}
.rx-chip::after{content:"";position:absolute;inset:-9px -2px}
.rx-chip .rx-emo{font-size:14px;line-height:1}
.rx-chip .rx-quem{font-size:11px;font-weight:600;line-height:1;color:#C3CEE6}
.rx-chip.rx-arthur{background:#3B3322;border-color:#E2B84A}
.rx-chip.rx-pend{opacity:.55}
.rx-notas{display:flex;flex-direction:column;gap:3px;max-width:88%;margin:3px 8px 0}
.rx-notas.rx-eu{margin-left:auto;text-align:right}
.rx-notas.rx-ele{margin-right:auto}
.rx-nota{font-size:11px;line-height:1.35;color:#FFD68A;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.rx-abrir{display:none;position:absolute;top:2px;box-sizing:border-box;width:24px;height:24px;padding:0;border-radius:999px;font-size:15px;line-height:1;
  color:#C3CEE6;background:#1A2C57;border:1px solid rgba(255,255,255,.18)}
.ele .rx-abrir{left:calc(100% + 4px)} .eu .rx-abrir{right:calc(100% + 4px)}
.bolha:has(.md-tab) .rx-abrir{top:-12px;left:auto;right:8px}
@media (hover:hover){.linha-msg:hover .rx-abrir,.rx-abrir:focus-visible{display:grid;place-items:center}
  .rx-abrir:hover{color:#F4F6FB;background:#22386B}}
.rx-fundo{position:fixed;inset:0;z-index:9;background:rgba(0,0,0,.45)}
.rx-grade{position:fixed;z-index:10;left:0;right:0;bottom:0;max-height:min(70vh,520px);display:flex;flex-direction:column;padding:10px 12px calc(var(--bottom,0px) + 10px);
  border-radius:18px 18px 0 0;background:#0F1F45;border:1px solid rgba(255,255,255,.16);box-shadow:0 -8px 30px rgba(0,0,0,.5);color:#F4F6FB}
.rx-grade > *{flex:none}
.rx-grade > .rx-lista{flex:1 1 auto;min-height:0}
@media (min-width:700px){.rx-grade{left:50%;right:auto;bottom:auto;top:50%;transform:translate(-50%,-50%);width:400px;border-radius:18px}}
.rx-g-topo{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 2px 8px}
.rx-g-topo b{font-size:15.5px;font-weight:600}
.rx-x{width:44px;height:44px;display:grid;place-items:center;border-radius:50%;color:#C3CEE6;font-size:17px}
.rx-campo{display:flex;gap:8px}
.rx-input{flex:1;min-width:0;height:44px;padding:0 12px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);font-size:18px;outline:none}
.rx-input::placeholder{color:#9AA8C4}
.rx-input:focus{border-color:#B9D2FF}
.rx-usar{flex:none;height:44px;padding:0 16px;border-radius:12px;background:var(--gold,#E2B84A);color:var(--navy,#0B1E3F);font-weight:600}
.rx-erro{min-height:0;font-size:13px;color:#FFD68A;padding:4px 2px 0}
.rx-erro:empty{display:none}
.rx-cats{display:flex;gap:2px;overflow-x:auto;padding:8px 0 4px;scrollbar-width:none}
.rx-cats::-webkit-scrollbar{display:none}
.rx-cat{flex:none;width:44px;height:44px;display:grid;place-items:center;border-radius:12px;font-size:22px}
.rx-cat:active{background:rgba(111,168,255,.16)}
.rx-lista{overflow-y:auto;overscroll-behavior:contain;padding-bottom:6px}
.rx-sec h4{margin:10px 2px 4px;font-size:11px;font-weight:600;color:#9AA8C4;text-transform:uppercase;letter-spacing:.06em}
.rx-g{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr))}
.rx-ge{height:44px;display:grid;place-items:center;font-size:26px;border-radius:10px;padding:0}
.rx-ge:active{background:rgba(111,168,255,.16)}
.rx-info{position:fixed;z-index:9;max-width:min(320px,calc(100vw - 16px));padding:10px 12px;border-radius:12px;background:#0F1F45;
  border:1px solid rgba(255,255,255,.16);box-shadow:0 12px 30px rgba(0,0,0,.5);color:#F4F6FB;font-size:14px}
.rx-info-l{display:flex;align-items:center;gap:8px}
.rx-info-l .rx-emo{font-size:22px}
.rx-info-l .rx-h{color:#9AA8C4;font-size:13px}
.rx-info-n{margin-top:6px;color:#FFD68A;overflow-wrap:anywhere}
.rx-tirar{display:block;width:100%;min-height:44px;margin-top:8px;border-radius:10px;background:rgba(255,90,79,.16);color:#FF8A80;font-weight:600}
.rx-dica{margin-top:4px;text-align:center;font-size:12px;color:#9AA8C4}
`;

const Reacoes = {FILEIRA, ALERTA, CATEGORIAS, JANELA_S, emojiValido, umSo, normalizar, semM, canonico, ehAlerta, mesmoEmoji,
  casar, dobrar, centralDe, horaDe, quando, novoId, registroDe, acaoDe, reagivel, lugar, fileiraHtml, gradeHtml, chipsHtml, infoHtml,
  ligar, preparar, chipsDe, botao, enfeitar, noMenu, abrirSolta, abrirGrade, fechar, aberto, reagir, volta, tocarChip, usarCampo,
  pendentes, caixas, esc, CSS, get alvo() { return alvo; }, get preparado() { return preparado; },
  _eventos: {tocarFileira, teclasFileira, tocarGrade, tocarConversa, menuDoMouse, pegar, soltar, foraDaqui, tecla},
  _zerar() { pendentes.clear(); caixas.clear(); alvo = null; infoAberta = null; preparado = {conversa: "", por: {}, linhas: new Map(), pend: new Set(), nomes: NOMES}; }};
if (typeof module !== "undefined" && module.exports) module.exports = Reacoes;
else raiz.Reacoes = Reacoes;
})(typeof window !== "undefined" ? window : globalThis);
