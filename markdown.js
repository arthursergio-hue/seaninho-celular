// Seaninho no celular: o markdown das respostas do Claude em HTML seguro (0.8.8, o pedido do Arthur das 16h18: "no
// VS Code a tabela aparece bem bonita; aqui no aplicativo não. Tem que ser premium aqui"). Títulos, listas (numeradas,
// aninhadas e com caixa de seleção), citação e aviso (> [!NOTE]), bloco de código com Copiar, linha horizontal e
// tabelas de verdade: cartões no celular em pé, rolagem com o cabeçalho e a 1ª coluna fixos, % como barra, status como
// etiqueta e hora em destaque; a tela cheia e o Copiar (para o Sheets, como texto, em markdown) leem a tabela daqui.
// Sem tela (testado no Node: test_markdown.cjs). Tudo o que vem do texto passa pelo esc: nada de HTML do Claude entra.
(function (raiz) {
"use strict";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const LINK_OK = /^(https?:\/\/|mailto:)/i;
// Os ícones dos botões (desenhados: o ⧉ e o ⤢ não existem em toda fonte do celular).
const svg = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONE = {copiar: svg('<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>'),
               cheia: svg('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
               certo: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
               grade: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>'),
               linhas: svg('<path d="M5 7h14M5 12h14M5 17h9"/>'),
               cerquilha: svg('<path d="M9.5 4L7.5 20M16.5 4l-2 16M4.5 9h15M4 15h15"/>'),
               cartoes: svg('<rect x="4" y="3.5" width="16" height="7.5" rx="2"/><rect x="4" y="13" width="16" height="7.5" rx="2"/>'),
               girar: svg('<rect x="2.5" y="9" width="13" height="10" rx="2"/><path d="M11 4h3a5.5 5.5 0 0 1 5.5 5.5V12m0 0l-2.3-2.3M19.5 12l2.3-2.3"/>'),
               sol: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
               lua: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>')};
const MAX_TABELAS = 200;           // as tabelas guardadas para a tela cheia e o Copiar (as mais velhas saem)
const TABELAS = new Map();         // id -> {cab, linhas, alins, tipos, indice, titulo, md}

// ---- Dentro da linha: código, links, **negrito**, *itálico*, ~~riscado~~ e, nas tabelas, a hora em destaque ------
// Só \* \` \| \~ são escape: o resto da barra invertida fica (C:\dev\_maquina\.claude é caminho, não markdown).
const HORA = /(^|[^\p{L}\p{N}])((?:~|≈)\s?)?(\d{1,2}h(?:\d{2})?(?![\p{L}\p{N}])|\d{1,2}:\d{2}(?![\p{N}])|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?(?![\p{N}\/])|\d+\s?min(?![\p{L}])|hoje(?: à (?:noite|tarde)| de manhã)?(?![\p{L}])|amanhã(?![\p{L}]))/gu;

function enfase(h) {
  return h
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, "$1<strong>$2</strong>")
    .replace(/(^|[^*\p{L}\p{N}])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![*\p{L}\p{N}])/gu, "$1<em>$2</em>")
    .replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\p{L}\p{N}_])/gu, "$1<em>$2</em>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
}

function linha(texto, {horas = false} = {}) {
  const guarda = [];
  const g = html => { guarda.push(html); return `\u0000${guarda.length - 1}\u0000`; };
  // A URL nunca leva o marcador de outro trecho guardado (\u0000n\u0000): um link dentro do href de outro fechava as
  // aspas e punha um onclick no balão (achado na verificação da 0.8.8). Com marcador, fica como texto.
  const a = (url, rotulo, cru) => url.includes("\u0000") ? cru
    : g(`<a href="${esc(url)}" target="_blank" rel="noopener">${rotulo}</a>`);
  let t = String(texto ?? "")
    .replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _c, c) => {
      const cod = c.replace(/\\\|/g, "|");
      return g(`<code>${esc(/^ [\s\S]*[^ ][\s\S]* $/.test(cod) ? cod.slice(1, -1) : cod)}</code>`);
    })
    .replace(/<br\s*\/?>/gi, () => g("<br>"))
    .replace(/\\([*`|~])/g, (_, c) => g(esc(c)))
    .replace(/\[([^\]\n]+)\]\(\s*<?([^)\s>\u0000]+)>?(?:\s+"[^"\n]*")?\s*\)/g,
             (m, rotulo, url) => LINK_OK.test(url) ? a(url, enfase(esc(rotulo)), m)   // o arquivo do PC (ou javascript:): só o nome
               : g(`<span class="md-local" title="${esc(url)}">${enfase(esc(rotulo))}</span>`))
    .replace(/<((?:https?:\/\/|mailto:)[^\s<>\u0000]+)>/g, (m, url) => a(url, esc(url), m))
    .replace(/(^|[\s(\[*_~>])(https?:\/\/[^\s<>"'`\u0000]*[^\s<>"'`.,;:!?)\]*_~\u0000])/g, (m, antes, url) => antes + a(url, esc(url), url));
  t = enfase(esc(t));
  if (horas) t = t.replace(HORA, (_, antes, til, h) => `${antes}<span class="md-hora">${til || ""}${h}</span>`);
  for (let i = 0; i < 4 && t.includes("\u0000"); i++) t = t.replace(/\u0000(\d+)\u0000/g, (_, n) => guarda[Number(n)]);
  return t;
}

// ---- Tabelas -----------------------------------------------------------------------------------------------------
const SEPARADOR = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
function celulas(l, crases = true) {
  let s = l.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const out = [];
  let atual = "", aberta = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "\\" && s[k + 1] === "|") { atual += "\\|"; k++; continue; }
    if (c === "`" && crases) {
      let n = 1;
      while (s[k + n] === "`") n++;
      if (!aberta) aberta = n; else if (aberta === n) aberta = 0;
      atual += "`".repeat(n); k += n - 1; continue;
    }
    if (c === "|" && !aberta) { out.push(atual.trim()); atual = ""; continue; }
    atual += c;
  }
  out.push(atual.trim());
  return aberta && crases ? celulas(l, false) : out;   // uma crase sem par: o "|" vale como sempre
}
const comecaTabela = (ls, i) => i + 1 < ls.length && ls[i].includes("|") && SEPARADOR.test(ls[i + 1]) && ls[i + 1].includes("-")
  && (ls[i + 1].includes("|") || celulas(ls[i]).length > 1);

// O texto da célula sem o markdown (para o Copiar e para reconhecer número, % e status).
const limpo = c => String(c ?? "").replace(/<br\s*\/?>/gi, " ").replace(/\\\|/g, "|")
  .replace(/\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?[^)]*\)/g, (_, r, u) => r === u ? r : `${r} (${u})`)
  .replace(/(\*\*|__|~~)(?=\S)(.*?\S)\1/g, "$2").replace(/(^|[^\p{L}\p{N}*])\*(?=\S)([^*]*?\S)\*/gu, "$1$2")
  .replace(/`+([^`]*)`+/g, "$1").replace(/[\t\r\n]+/g, " ").trim();

const VAZIO = /^(\?|—|–|-|n\/a|n\/d|…|\.\.\.)?$/i;
const PCT = /^[~≈]?\s*(\d{1,3}(?:[.,]\d+)?)\s*%$/;
const NUM = /^[~≈]?\s*[-+−]?\s*(?:R\$|US\$|\$|€)?\s*\d[\d.\s]*(?:,\d+)?(?:\.\d+)?\s*(?:%|k|mil|mi|bi|kb|mb|gb|tb|ms|s|min|h|x|×|m²|m2|m|km|kg|un|und|pts?)?$/i;
function tipoDaColuna(valores) {
  const cheios = valores.map(limpo).filter(v => !VAZIO.test(v));
  if (!cheios.length) return "texto";
  if (cheios.every(v => PCT.test(v))) return "pct";
  if (cheios.every(v => NUM.test(v) && v.length <= 18)) return "num";
  return "texto";
}
const ehIndice = (cab, valores) => /^(#|nº|n°|no\.?|n|id|item|)$/i.test(limpo(cab))
  && valores.every(v => /^\d{1,4}[.)º°]?$/.test(limpo(v)) || VAZIO.test(limpo(v)));

// Status: a etiqueta colorida (o texto dela é o próprio status; a cor só ajuda). Na coluna de situação, o começo da
// célula vira etiqueta e o resto fica ao lado; nas outras, só a célula curta que é um status inteiro.
const STATUS = [
  ["ok", /^(?:✅\s*)?(pront[oa]s?|feit[oa]s?|conclu[ií]d[oa]s?|entregues?|publicad[oa]s?|ok|resolvid[oa]s?|aprovad[oa]s?|no ar|instalad[oa]s?|mergead[oa]s?|done)(?![\p{L}])/iu],
  ["espera", /^(?:⏳\s*)?(esperando(?: (?:você|o arthur|o seu ok|sua decisão|decisão|resposta|revisão))?|aguardando(?: (?:você|o arthur|o seu ok|sua decisão|decisão|resposta|revisão))?|na fila|pendentes?|falta você|em pausa|pausad[oa]s?)(?![\p{L}])/iu],
  ["anda", /^(?:🔄\s*)?(gerando|rodando|em andamento|fazendo|trabalhando|em curso|lendo|levantando|escrevendo|testando|instalando|subindo|renderizando|revisando|conferindo|começou|iniciad[oa])(?![\p{L}])/iu],
  ["erro", /^(?:❌\s*)?(erro|falhou|falha|quebrad[oa]|bloquead[oa]|travad[oa]|cancelad[oa]|recusad[oa]|atrasad[oa])(?![\p{L}])/iu],
];
const COLUNA_STATUS = /status|situa|estado|andamento|fase|progresso/i;
// O texto fica como veio (a mesma letra, a mesma pontuação); o resto da célula mantém o markdown dele.
function status(texto, coluna) {
  const t = limpo(texto), cru = String(texto ?? "").trim();
  for (const [tipo, re] of STATUS) {
    const m = re.exec(t);
    if (m && t.length <= 32 && !t.slice(m[0].length).replace(/^[.!]$/, "")) return {tipo, rotulo: t, resto: ""};
    const p = coluna && re.exec(cru);
    if (p) return {tipo, rotulo: p[0], resto: cru.slice(p[0].length)};
  }
  return null;
}
const etiqueta = (tipo, rotulo) => `<span class="md-tag ${tipo}">${esc(rotulo)}</span>`;

const valorPct = t => { const m = PCT.exec(limpo(t)); return m ? Math.max(0, Math.min(100, parseFloat(m[1].replace(",", ".")))) : null; };
function barra(t, larga = false) {
  const v = valorPct(t);
  if (v === null) return `<span class="md-pct sem${larga ? " larga" : ""}"><span class="md-barra"></span><b>${esc(limpo(t) || "—")}</b></span>`;
  return `<span class="md-pct${v >= 100 ? " cheia" : ""}${larga ? " larga" : ""}" role="img" aria-label="${esc(limpo(t))}">`
    + `<span class="md-barra"><i style="--p:${v}%"></i></span><b>${esc(limpo(t))}</b></span>`;
}

function celula(texto, tipo, colunaStatus) {
  if (tipo === "pct") return barra(texto);
  if (tipo === "num") return `<span class="md-num">${linha(texto)}</span>`;
  const s = status(texto, colunaStatus);
  if (s) return etiqueta(s.tipo, s.rotulo) + linha(s.resto, {horas: true});
  return linha(texto, {horas: true});
}

function hash(t) { let h = 0x811c9dc5; for (const c of t) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }

function lerTabela(ls, i) {
  const cab = celulas(ls[i]);
  const alins = celulas(ls[i + 1]).map(c => /^:-+:$/.test(c) ? "centro" : /-:$/.test(c) ? "direita" : /^:-/.test(c) ? "esquerda" : "");
  const linhas = [];
  let j = i + 2;
  for (; j < ls.length && ls[j].trim() && ls[j].includes("|") && !/^\s{0,3}(```|~~~)/.test(ls[j]); j++) {
    const r = celulas(ls[j]);
    linhas.push(cab.map((_, c) => r[c] ?? ""));
  }
  return {cab, alins, linhas, md: ls.slice(i, j).join("\n"), fim: j};
}

// As partes da tabela: os cartões (um por linha: o nº, o título, a barra do % e os campos com rótulo) e a tabela (a
// 1ª coluna com o nº e o cabeçalho fixos na rolagem). Guarda a tabela para a tela cheia e o Copiar.
function partes(t) {
  const {cab, alins, linhas, md} = t, n = cab.length;
  const tipos = cab.map((_, c) => tipoDaColuna(linhas.map(r => r[c])));
  const indice = n > 1 && ehIndice(cab[0], linhas.map(r => r[0])) ? 0 : -1;
  const vis = cab.map((_, c) => c).filter(c => c !== indice);
  const titulo = vis.find(c => tipos[c] === "texto") ?? vis[0];
  const pcts = vis.filter(c => tipos[c] === "pct");
  const id = "t" + hash(md);
  if (!TABELAS.has(id) && TABELAS.size >= MAX_TABELAS) TABELAS.delete(TABELAS.keys().next().value);
  TABELAS.set(id, {cab, alins, linhas, tipos, indice, titulo, md});
  const sts = cab.map(c => COLUNA_STATUS.test(limpo(c)));
  const lado = c => alins[c] === "centro" ? "centro" : alins[c] === "direita" || (!alins[c] && tipos[c] !== "texto") ? "direita" : "";
  const media = c => linhas.reduce((s, r) => s + limpo(r[c]).length, 0) / Math.max(1, linhas.length);
  const largura = c => tipos[c] !== "texto" ? "estreita" : media(c) > 38 ? "longa" : "";
  const classe = (...xs) => { const c = xs.filter(Boolean).join(" "); return c ? ` class="${c}"` : ""; };
  const num = r => indice >= 0 && limpo(r[indice]) ? `<span class="md-idx">${esc(limpo(r[indice]).replace(/[.)º°]$/, ""))}</span>` : "";
  const larga = vis.length >= 4 && vis.some(c => tipos[c] === "texto") ? " larga" : "";   // só números: tabela, não cartão

  const cartoes = linhas.map(r => {
    const pct = pcts.length === 1 ? pcts[0] : -1;
    const campos = vis.filter(c => c !== titulo && c !== pct && limpo(r[c]))
      .map(c => `<div class="md-campo"><dt>${linha(cab[c])}</dt><dd class="${tipos[c]}">${celula(r[c], tipos[c], sts[c])}</dd></div>`).join("");
    return `<article class="md-cartao">`
      + `<header>${num(r)}<div class="md-cartao-t">${linha(r[titulo], {horas: true})}</div>${pct >= 0 ? barra(r[pct], true) : ""}</header>`
      + (campos ? `<dl>${campos}</dl>` : "") + `</article>`;
  }).join("");

  const th = vis.map((c, k) => `<th${classe(k === 0 && "fixa", lado(c), largura(c))} scope="col">${linha(cab[c])}</th>`).join("");
  const corpo = linhas.map(r => "<tr>" + vis.map((c, k) => k === 0
    ? `<th${classe("fixa", lado(c))} scope="row"><div class="md-fixa">${num(r)}<span>${celula(r[c], tipos[c], sts[c])}</span></div></th>`
    : `<td${classe(tipos[c], lado(c), largura(c))}>${celula(r[c], tipos[c], sts[c])}</td>`).join("") + "</tr>").join("");

  const info = `${linhas.length} ${linhas.length === 1 ? "linha" : "linhas"} · ${vis.length} ${vis.length === 1 ? "coluna" : "colunas"}`;
  return {id, info, larga, alta: linhas.length > 8 ? " alta" : "",
          cartoes: `<div class="md-cartoes">${cartoes}</div>`,
          rolo: `<div class="md-rolo"><table class="md-t"><thead><tr>${th}</tr></thead><tbody>${corpo}</tbody></table></div>`};
}

// A tabela no balão: a barra (linhas, Cartões | Tabela, Copiar, tela cheia), os cartões e a tabela com rolagem. O CSS
// escolhe o que aparece (cartões no celular em pé quando ela é larga; a escolha do Arthur vale para todas).
function tabela(t) {
  const {id, info, larga, alta, cartoes, rolo} = partes(t);
  return `<div class="md-tab${larga}${alta}" data-tab="${id}">`
    + `<div class="md-tab-barra"><span class="md-tab-info">${info}</span>`
    + `<span class="md-seg" role="group" aria-label="Ver como"><button type="button" data-tab-modo="cartoes">Cartões</button>`
    + `<button type="button" data-tab-modo="tabela">Tabela</button></span>`
    + `<button type="button" class="md-tab-bt" data-tab-copiar="${id}" aria-label="Copiar a tabela">${ICONE.copiar}</button>`
    + `<button type="button" class="md-tab-bt" data-tab-cheia="${id}" aria-label="Abrir a tabela em tela cheia">${ICONE.cheia}</button></div>`
    + cartoes + rolo + `</div>`;
}

// A tabela da tela cheia, sem a barra: "tabela" ou "cartoes".
function tabelaCheia(id, modo = "tabela") {
  const t = TABELAS.get(id);
  if (!t) return "";
  const p = partes(t);
  return modo === "cartoes" ? p.cartoes : p.rolo;
}

// ---- Copiar: para o Sheets (separado por tabulação), como texto (um bloco por linha) e em markdown ---------------
function paraSheets(id) {
  const t = TABELAS.get(id);
  return t ? [t.cab, ...t.linhas].map(r => r.map(limpo).join("\t")).join("\n") : "";
}
function comoTexto(id) {
  const t = TABELAS.get(id);
  if (!t) return "";
  return t.linhas.map(r => {
    const topo = (t.indice >= 0 && limpo(r[t.indice]) ? limpo(r[t.indice]).replace(/[.)º°]$/, "") + " · " : "") + limpo(r[t.titulo]);
    const resto = t.cab.map((c, k) => k === t.indice || k === t.titulo || !limpo(r[k]) ? "" : `${limpo(c)}: ${limpo(r[k])}`)
      .filter(Boolean);
    return [topo, ...resto].join("\n");
  }).join("\n\n");
}
const emMarkdown = id => (TABELAS.get(id) || {}).md || "";
const dados = id => TABELAS.get(id) || null;

// ---- Blocos ------------------------------------------------------------------------------------------------------
const CERCA = /^(\s{0,3})(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/;
const TITULO = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const LINHA_H = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const CITA = /^\s{0,3}>/;
const ITEM = /^(\s*)([-*+]|(\d{1,9})[.)])(?:\s+(.*)|\s*$)/;
const AVISO = {NOTE: ["nota", "Nota"], TIP: ["dica", "Dica"], IMPORTANT: ["importante", "Importante"],
               WARNING: ["atencao", "Atenção"], CAUTION: ["cuidado", "Cuidado"]};
const CORTE = /^\s*\[…\]\s*$/;   // o corte no meio que os agentes até a 0.8.7 faziam nas mensagens longas
const recuo = l => { let n = 0; for (const c of l) { if (c === " ") n++; else if (c === "\t") n += 4 - n % 4; else break; } return n; };
const tirarRecuo = (l, n) => { let k = 0, w = 0; while (k < l.length && w < n && (l[k] === " " || l[k] === "\t")) { w += l[k] === "\t" ? 4 - w % 4 : 1; k++; } return l.slice(k); };
// Começa outro bloco (corta o parágrafo): título, cerca, linha, citação, lista (a numerada só a partir do 1) ou tabela.
function corta(ls, i) {
  const l = ls[i], m = ITEM.exec(l);
  return !l.trim() || CORTE.test(l) || TITULO.test(l) || CERCA.test(l) || LINHA_H.test(l) || CITA.test(l) || comecaTabela(ls, i)
    || (m && m[4] !== undefined && (!m[3] || m[3] === "1"));
}

function codigo(cod, lingua) {
  const corpo = /^(diff|patch)$/i.test(lingua)
    ? cod.split("\n").map(l => `<span class="${/^\+/.test(l) ? "md-mais" : /^-/.test(l) ? "md-menos" : /^@@/.test(l) ? "md-arroba" : ""}">${esc(l)}</span>`).join("\n")
    : esc(cod);
  return `<div class="md-codigo"><div class="md-codigo-topo"><span>${esc(lingua || "código")}</span>`
    + `<button type="button" class="md-copiar" data-copiar-codigo>${ICONE.copiar}Copiar</button></div><pre><code>${corpo}</code></pre></div>`;
}

function lerLista(ls, i) {
  const m0 = ITEM.exec(ls[i]), base = recuo(m0[1]), ordenada = !!m0[3];
  const mesmo = m => m && recuo(m[1]) <= base + 1 && !!m[3] === ordenada;
  const itens = [];
  while (i < ls.length) {
    const l = ls[i], m = ITEM.exec(l);
    if (mesmo(m)) {
      itens.push({n: m[3] ? Number(m[3]) : null, ls: [m[4] ?? ""], recuo: recuo(m[1]) + m[2].length + 1});
      i++; continue;
    }
    if (m && recuo(m[1]) <= base + 1) break;   // outra lista no mesmo nível
    if (!l.trim()) {
      let j = i + 1;
      while (j < ls.length && !ls[j].trim()) j++;
      if (j < ls.length && (recuo(ls[j]) > base + 1 || mesmo(ITEM.exec(ls[j])))) { itens.at(-1).ls.push(""); itens.at(-1).solto = true; i++; continue; }
      break;
    }
    if (recuo(l) > base + 1) { itens.at(-1).ls.push(tirarRecuo(l, itens.at(-1).recuo)); i++; continue; }
    if (!corta(ls, i)) { itens.at(-1).ls.push(l.trim()); i++; continue; }   // a linha preguiçosa: continua o item
    break;
  }
  const tarefas = itens.some(it => /^\[[ xX]\]\s/.test(it.ls[0]));
  const lis = itens.map(it => {
    let ls0 = it.ls, classe = "";
    const tf = /^\[([ xX])\]\s+/.exec(ls0[0]);
    if (tf) {
      ls0 = [ls0[0].slice(tf[0].length), ...ls0.slice(1)];
      classe = tf[1] === " " ? "md-tarefa" : "md-tarefa feita";
    }
    const dentro = blocos(ls0.join("\n").replace(/\n+$/, ""));
    const html = dentro.map((b, k) => k === 0 && b.tipo === "p" && !it.solto ? b.dentro : b.html).join("");
    const caixa = tf ? `<span class="md-caixa" aria-hidden="true">${tf[1] === " " ? "" : ICONE.certo}</span>` : "";
    return `<li${classe ? ` class="${classe}"` : ""}>${caixa}${tf ? `<span class="md-tarefa-t">${html}</span>` : html}</li>`;
  }).join("");
  const inicio = ordenada && itens[0].n !== 1 ? ` start="${itens[0].n}"` : "";
  return {html: ordenada ? `<ol class="md-lista"${inicio}>${lis}</ol>` : `<ul class="md-lista${tarefas ? " md-tarefas" : ""}">${lis}</ul>`, fim: i};
}

function blocos(texto) {
  const ls = String(texto ?? "").replace(/\u0000/g, "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0, ultima = null;
  while (i < ls.length) {
    const l = ls[i];
    if (!l.trim()) { i++; continue; }
    if (CORTE.test(l)) {   // o agente antigo cortou o meio: avisa, e as linhas soltas da tabela voltam a ser tabela
      out.push({tipo: "corte", html: `<div class="md-corte" role="note">✂ O meio desta mensagem ficou no PC: o agente de lá é antigo e `
        + `cortava as mensagens longas. Com o agente 0.8.8, ela vem inteira.</div>`});
      let j = ++i;
      while (j < ls.length && ls[j].trim() && ls[j].includes("|") && !SEPARADOR.test(ls[j])) j++;
      if (ultima && j > i) {
        const [cab, sep] = ultima.md.split("\n");
        out.push({tipo: "tabela", html: tabela(lerTabela([cab, sep, ...ls.slice(i, j)], 0))});
        i = j;
      }
      continue;
    }
    let m = CERCA.exec(l);
    if (m) {
      const fecha = new RegExp(`^\\s{0,3}${m[2][0] === "`" ? "`" : "~"}{${m[2].length},}\\s*$`), corpo = [];
      for (i++; i < ls.length && !fecha.test(ls[i]); i++) corpo.push(tirarRecuo(ls[i], m[1].length));
      i++;
      out.push({tipo: "codigo", html: codigo(corpo.join("\n"), m[3])});
      continue;
    }
    if ((m = TITULO.exec(l))) {
      const n = m[1].length;
      out.push({tipo: "h", html: `<div class="md-h md-h${n}" role="heading" aria-level="${n}">${linha(m[2])}</div>`});
      i++; continue;
    }
    if (LINHA_H.test(l)) { out.push({tipo: "hr", html: `<hr class="md-hr">`}); i++; continue; }
    if (comecaTabela(ls, i)) {
      const t = ultima = lerTabela(ls, i);
      out.push({tipo: "tabela", html: tabela(t)});
      i = t.fim; continue;
    }
    if (CITA.test(l)) {
      const dentro = [];
      for (; i < ls.length && ls[i].trim() && (CITA.test(ls[i]) || !corta(ls, i)); i++) dentro.push(ls[i].replace(/^\s{0,3}> ?/, ""));
      const av = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.exec(dentro[0] || "");
      if (av) {
        const [classe, nome] = AVISO[av[1].toUpperCase()];
        out.push({tipo: "cita", html: `<div class="md-aviso ${classe}" role="note"><div class="md-aviso-t">${nome}</div>`
          + juntar(blocos(dentro.slice(1).join("\n"))) + `</div>`});
      } else out.push({tipo: "cita", html: `<blockquote class="md-cita">${juntar(blocos(dentro.join("\n")))}</blockquote>`});
      continue;
    }
    m = ITEM.exec(l);
    if (m && m[4] !== undefined) {
      const lista = lerLista(ls, i);
      out.push({tipo: "lista", html: lista.html});
      i = lista.fim; continue;
    }
    const par = [l.trim()];
    for (i++; i < ls.length && !corta(ls, i); i++) par.push(ls[i].trim());
    const dentro = linha(par.join("\n")).replace(/\n/g, "<br>");
    out.push({tipo: "p", dentro, html: `<p class="md-p">${dentro}</p>`});
  }
  return out;
}
const juntar = bs => bs.map(b => b.html).join("");

// O texto do Claude em HTML (o balão põe a classe "md": sem o pre-wrap, as quebras vêm daqui).
const html = texto => juntar(blocos(texto));
const temTabela = texto => { const ls = String(texto ?? "").split(/\r?\n/); return ls.some((_, i) => comecaTabela(ls, i)); };

const Markdown = {ICONE, html, linha, esc, limpo, celulas, tipoDaColuna, status, temTabela, dados, tabelaCheia, paraSheets, comoTexto, emMarkdown, TABELAS};
if (typeof module !== "undefined" && module.exports) module.exports = Markdown;
else raiz.Markdown = Markdown;
})(typeof window !== "undefined" ? window : globalThis);
