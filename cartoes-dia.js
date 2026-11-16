// Seaninho no celular: os cartões externos do Monitor geral, os "cartões do dia" (13/11/2026; entra na página depois da v28).
// O Monitor geral do Seaninho Pro (pro-82) mostra grupos de cartões que um programa da pessoa grava na pasta
// cartoes-externos do PC; o agente do PC (cartoes_dia.py) publica os mesmos grupos em hoje.painel.cartoes_externos, só
// com {grupo, icone, atualizado (segundos), valido_min, pessoal, cartoes: [{id, icone, titulo, estado, linha}]}, sem
// botões (nenhum comando nem pasta chega ao celular, e o celular não tem ação equivalente).
// Aqui fica tudo o que é deste bloco, para a ligação no index.html ser de três linhas (a tag do script, o "cartoes" no
// PAINEL_BLOCOS e o por() no desenharInicio): a lista branca de novo (a página só usa o que conhece), o "velho" (passou
// do valido_min: cinza, "dados de HH:MM") com o relógio do celular, o HTML do bloco com o mesmo cartão do Computadores
// (ícone, título, a bolinha .dot com a cor do estado e a linha), o CSS (posto uma vez no <head>) e os grupos que a
// pessoa abriu (lembrados neste aparelho; a tela se refaz a cada 4 s). Todo texto sai escapado.
// 16/11/2026, o mesmo pedido do Monitor geral (pro-90, "faz isso aqui vir minimizado por padrão, para não encher a
// tela"):
// - todo grupo nasce recolhido. A guarda deste aparelho passa a ser a lista dos ABERTOS ("seaninho.cx_abertos"); a dos
//   fechados, de antes, é esquecida. Sem o localStorage, ou com o valor estragado, todos voltam recolhidos, e a escolha
//   vale até recarregar;
// - o grupo pessoal entra na lista só por um resumo do título ("#" + FNV-1a, como o Monitor), nunca pelo título;
// - recolhido, o cabeçalho mostra o resumo: quantos cartões e, se houver, quantos em atenção (⚠) e em erro (✖), nas
//   cores da bolinha (amarelo e vermelho). Aberto, o resumo some (o CSS), porque os cartões já estão à vista.
// Testado no Node (test_cartoes_dia.cjs).
(function (raiz) {
"use strict";

const ESTADOS = ["ok", "atencao", "erro", "desligado", "espera"];
// a bolinha (.dot do Computadores): ok verde; atenção e esperando amarelo; erro vermelho; desligado cinza
const DOT = {ok: "ok", atencao: "espera", erro: "erro", desligado: "", espera: "espera"};
const PALAVRA = {ok: "ok", atencao: "atenção", erro: "erro", desligado: "desligado", espera: "esperando"};
const MAX_GRUPOS = 8, MAX_CARTOES = 20, VALIDO_PADRAO = 30, VALIDO_MAX = 1440, ICONE_PADRAO = "▦";
// a lista dos grupos abertos neste aparelho (16/11; até 60: 8 grupos por PC, de mais de um PC); a de antes, dos fechados
const GUARDA = "seaninho.cx_abertos", GUARDA_ANTIGA = "seaninho.cx_fechados", MAX_ABERTOS = 60;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const obj = v => !!v && typeof v === "object" && !Array.isArray(v);
// numa linha só, sem controle nem formatação invisível (direção do texto, largura zero), até `max` letras. 16/11
// (revisão): toda a categoria Cf, como o agente e o Monitor (a lista à mão deixava passar 142 dos 170); no ícone fica o
// ZWJ (U+200D), que junta o emoji de várias partes
const INVISIVEL = /\p{Cf}/gu, INVISIVEL_NO_ICONE = /(?!‍)\p{Cf}/gu;
const texto = (v, max, invisivel = INVISIVEL) => typeof v === "string"
  ? [...v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(invisivel, "")
      .replace(/\s+/g, " ").trim()].slice(0, max).join("") : "";
const icone = v => texto(v, 4, INVISIVEL_NO_ICONE);
const doisDig = n => String(n).padStart(2, "0");

// A lista branca: só os campos do contrato, com os limites do Monitor; o que não confere cai (o cartão ou o grupo)
function normalizar(lista) {
  if (!Array.isArray(lista)) return [];
  const out = [];
  for (const g of lista.slice(0, MAX_GRUPOS)) {
    if (!obj(g)) continue;
    const ids = new Set(), cartoes = [];
    for (const c of Array.isArray(g.cartoes) ? g.cartoes.slice(0, MAX_CARTOES) : []) {
      if (!obj(c)) continue;
      const id = typeof c.id === "string" && /^[a-z0-9-]{1,40}$/.test(c.id) ? c.id : "";
      const titulo = texto(c.titulo, 40);
      if (!id || ids.has(id) || !titulo || !ESTADOS.includes(c.estado)) continue;
      ids.add(id);
      cartoes.push({id, icone: icone(c.icone), titulo, estado: c.estado, linha: texto(c.linha, 80)});
    }
    if (!cartoes.length) continue;
    const v = g.valido_min;
    out.push({
      grupo: texto(g.grupo, 40) || "Cartões",
      icone: icone(g.icone) || ICONE_PADRAO,
      atualizado: typeof g.atualizado === "number" && Number.isFinite(g.atualizado) && g.atualizado > 0 ? g.atualizado : null,
      valido_min: Number.isInteger(v) && v >= 1 && v <= VALIDO_MAX ? v : VALIDO_PADRAO,
      pessoal: g.pessoal === true,
      cartoes,
    });
  }
  return out;
}

// O grupo velho: sem hora, ou a hora do produtor mais velha que o valido_min (no relógio do celular)
const velho = (g, agora) => g.atualizado == null || agora / 1000 - g.atualizado > g.valido_min * 60;
// "15:24" no mesmo dia; de outro dia, "12/11 22:10"
function hora(g, agora) {
  if (g.atualizado == null) return "";
  const d = new Date(g.atualizado * 1000), h = new Date(agora), hm = `${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`;
  return d.toDateString() === h.toDateString() ? hm : `${doisDig(d.getDate())}/${doisDig(d.getMonth() + 1)} ${hm}`;
}
// A chave do grupo na tela (aberto ou recolhido): o PC e o título (o agente não publica o nome do arquivo). O grupo
// pessoal entra só por um resumo do título ("#" + FNV-1a, em base 36, como o Monitor), nunca pelo título. 16/11
// (revisão): as marcas do pessoal e do título repetido ("~2") vão depois de um U+200B (SEP), que o texto() tira de todo
// título: um título comum como "#1iui6gc" ou "Cartões~2" não cai na chave de outro grupo
const SEP = "​";
function chave(pc, g) {
  if (!g.pessoal) return `${pc}|${g.grupo}`;
  let h = 2166136261;
  for (const c of String(g.grupo)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return `${pc}|${SEP}#${h.toString(36)}`;
}
// O resumo do cabeçalho, como no Monitor (pro-90): "4 · ⚠ 1 · ✖ 1" (o ⚠ e o ✖ só quando há), nas cores da bolinha;
// aberto, o CSS o esconde. O ⚠ e o ✖ vão com o seletor de texto (U+FE0E): sem ele, o iPhone e o Windows os desenham
// como emoji colorido, e a cor do estado não pega
const ATENCAO = "⚠︎", ERRO = "✖︎";
function resumo(g) {
  const cs = g.cartoes, n = e => cs.filter(c => c.estado === e).length, a = n("atencao"), x = n("erro");
  const dica = `${cs.length} ${cs.length === 1 ? "cartão" : "cartões"}${a ? `, ${a} em atenção` : ""}${x ? `, ${x} com erro` : ""}`;
  return `<span class="cx-r" title="${dica}">${cs.length}${a ? ` · <i class="cx-a">${ATENCAO} ${a}</i>` : ""}${x ? ` · <i class="cx-x">${ERRO} ${x}</i>` : ""}</span>`;
}

// Os grupos de cada PC, na ordem da lista que a página passa (os PCs já em ordem de nome)
function dosPcs(lista) {
  return (Array.isArray(lista) ? lista : []).map(p => {
    const painel = p && p.hoje && obj(p.hoje.painel) ? p.hoje.painel : {};
    return {pc: String((p && p.pc) || ""), p, grupos: normalizar(painel.cartoes_externos)};
  }).filter(x => x.grupos.length);
}

function cartao(c, cinza) {
  const dot = cinza ? "" : DOT[c.estado];
  return `<div class="pcm cx-c${cinza ? " off" : ""}" aria-label="${esc(c.titulo)}: ${esc(PALAVRA[c.estado])}${c.linha ? ". " + esc(c.linha) : ""}">
      <span class="pcm-cab"><span class="cx-ic" aria-hidden="true">${esc(c.icone || "•")}</span><b>${esc(c.titulo)}</b></span>
      <span class="pcm-est"><i class="dot${dot ? " " + dot : ""}"></i>${esc(PALAVRA[c.estado])}</span>${c.linha ? `<span class="pcm-num cx-v">${esc(c.linha)}</span>` : ""}</div>`;
}

// O bloco do Início: um <details> por grupo (nasce recolhido, com o resumo; abre e fecha), o 🔒 no pessoal, o velho
// cinza com "dados de HH:MM".
// opcoes: {agora (ms), abertos (Set das chaves abertas; padrão: as deste aparelho), nomePc (pc -> nome curto),
// online (p -> o PC está no ar?; 16/11, revisão: o PC fora do ar deixa os grupos dele cinza, como o velho)}
function htmlBloco(lista, opcoes = {}) {
  const agora = opcoes.agora || Date.now(), abertos = opcoes.abertos || estado.abertos, nome = opcoes.nomePc || (x => x);
  const pcs = dosPcs(lista);
  if (!pcs.length) return "";
  // 16/11 (revisão): como o resto da página, o nome do PC aparece quando a lista tem mais de um PC (com ou sem cartões)
  const varios = (Array.isArray(lista) ? lista : []).filter(p => p && p.pc).length > 1;
  const grupos = pcs.flatMap(({pc, p, grupos}) => {
    const fora = typeof opcoes.online === "function" && !opcoes.online(p);
    const vistas = new Map();   // o mesmo título duas vezes no mesmo PC: a 2ª chave ganha "~2" (cada um lembra o seu)
    return grupos.map(g => {
      const v = fora || velho(g, agora), h = hora(g, agora), k0 = chave(pc, g), n = (vistas.get(k0) || 0) + 1;
      vistas.set(k0, n);
      const k = n > 1 ? `${k0}${SEP}~${n}` : k0, quando = h ? (v ? "dados de " + h : h) : "sem hora";
      return `<details class="cx-g${v ? " cx-velho" : ""}" data-cx-g="${esc(k)}"${abertos.has(k) ? " open" : ""}>
      <summary><span aria-hidden="true">${esc(g.icone)}</span><b>${esc(g.grupo)}</b>${g.pessoal ? `<span class="cx-lock" title="Pessoal" aria-label="pessoal">🔒</span>` : ""}${varios ? `<span class="meta">· ${esc(nome(pc))}</span>` : ""}${resumo(g)}<span class="cx-h">${esc(quando)}</span></summary>
      <div class="pcs-grade cx-cs">${g.cartoes.map(c => cartao(c, v)).join("")}</div></details>`;
    });
  });
  return `<section class="bloco cx-bloco"><h3>🗂 Cartões do dia <span class="n3">${grupos.length} ${grupos.length === 1 ? "grupo" : "grupos"}</span></h3>${grupos.join("")}</section>`;
}

// ---- Na página: o CSS, os grupos abertos e o toggle (no Node, nada disso roda) ----
const CSS = `
.cx-g{margin:0 0 10px}
.cx-g:last-child{margin-bottom:0}
.cx-g>summary{display:flex;flex-wrap:wrap;align-items:center;gap:0 8px;min-height:44px;cursor:pointer;list-style:none;font-size:15px;color:var(--ink);min-width:0}
.cx-g>summary::-webkit-details-marker{display:none}
.cx-g>summary::before{content:"\\25BE";color:var(--faint);flex:none}
.cx-g:not([open])>summary::before{content:"\\25B8"}
.cx-g>summary b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.cx-h{margin-left:auto;flex:none;font-size:12.5px;color:var(--faint);font-variant-numeric:tabular-nums}
.cx-r{flex:none;font-size:13px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.cx-r i{font-style:normal}
.cx-r .cx-a{color:var(--gold)}
.cx-r .cx-x{color:var(--coral)}
.cx-g[open] .cx-r{display:none}
.cx-g:not([open]):not(:last-child){margin-bottom:2px}
.cx-velho>summary,.cx-velho .cx-cs{filter:grayscale(1);opacity:.65}
.cx-cs{margin-top:4px}
.cx-c{min-height:0}
.cx-c .cx-ic{flex:none}
.cx-c .pcm-est{display:flex;align-items:center;gap:6px}
.cx-c .pcm-cab{align-items:flex-start}
.cx-c .pcm-cab b,.cx-v{white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.cx-v{min-width:0;font-variant-numeric:tabular-nums}`;

// Os grupos abertos guardados neste aparelho; sem a guarda, ou com o valor estragado, nenhum (todos recolhidos)
function lerAbertos(guarda) {
  try {
    const v = JSON.parse((guarda && guarda.getItem(GUARDA)) || "[]");
    return Array.isArray(v) ? v.filter(x => typeof x === "string").slice(-MAX_ABERTOS) : [];
  } catch { return []; }
}
function gravarAbertos(guarda, abertos) {
  try {
    if (!guarda) return;
    if (abertos.size) guarda.setItem(GUARDA, JSON.stringify([...abertos].slice(-MAX_ABERTOS)));
    else guarda.removeItem(GUARDA);
  } catch { /* sem espaço ou guarda bloqueada: fica só na memória, até recarregar */ }
}
// A lista dos fechados (de antes de 16/11) não vale mais: todo grupo já nasce recolhido
function esquecerAntiga(guarda) {
  try { if (guarda) guarda.removeItem(GUARDA_ANTIGA); } catch { /* nada */ }
}
// O toggle de um grupo (o evento não sobe: escutado na captura do document). Só grava quando muda: o <details open>
// que a própria tela desenha também dispara o toggle, e aí nada muda
function aoAlternar(e, guarda) {
  const el = e && e.target;
  if (!el || !el.matches || !el.matches("details[data-cx-g]")) return;
  const k = el.dataset.cxG, s = estado.abertos;
  if (s.has(k) === !!el.open) return;
  if (el.open) s.add(k); else s.delete(k);
  while (s.size > MAX_ABERTOS) s.delete(s.values().next().value);   // o mais antigo sai primeiro
  gravarAbertos(guarda, s);
}

let guardaDaPagina = null;
try { guardaDaPagina = typeof localStorage !== "undefined" ? localStorage : null; } catch { guardaDaPagina = null; }
const estado = {abertos: new Set(lerAbertos(guardaDaPagina))};
esquecerAntiga(guardaDaPagina);
if (typeof document !== "undefined" && document.head && !document.getElementById("cartoes-dia-css")) {
  const st = document.createElement("style");
  st.id = "cartoes-dia-css";
  st.textContent = CSS;
  document.head.appendChild(st);
  document.addEventListener("toggle", e => aoAlternar(e, guardaDaPagina), true);
}

const CartoesDia = {normalizar, velho, hora, chave, dosPcs, htmlBloco, ESTADOS,
  _puro: {esc, texto, resumo, lerAbertos, gravarAbertos, esquecerAntiga, aoAlternar, estado, CSS, GUARDA, GUARDA_ANTIGA, MAX_ABERTOS}};
raiz.CartoesDia = CartoesDia;
if (typeof module !== "undefined" && module.exports) module.exports = CartoesDia;
})(typeof window !== "undefined" ? window : globalThis);
