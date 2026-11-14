// Seaninho no celular: a prioridade dos projetos do Monitor geral na lista das sessões (pro-79, 13/11/2026), sem tela
// (testada no Node: test_prioridades.cjs). A página desenha; aqui só se decide o projeto, a cor e a ordem.
//
// O Arthur arrasta as seções do Monitor geral do Seaninho Pro ("As que estiverem em cima é porque quero prioridade
// zero, e vai baixando") e o Pro grava a ordem no prioridades.json do PC. O agente de cada PC publica o arquivo no
// hoje.painel.prioridades: {"versao": 1, "ordem": [{"projeto", "chave", "prioridade", "cor", "regra"}], "ts", "pc"}.
// - escolher(pcs): a de maior "ts" entre os PCs (os relógios podem diferir uns segundos: vale a maior, sempre).
// - projetoDe(s, prio): o projeto da sessão pela "regra" de cada um (o texto da expressão da palavra inteira), num
//   pedaço do caminho da sessão (minúsculas, sem acento, sem a pasta do usuário), como o Monitor geral: os projetos de
//   nome fixo em qualquer pedaço, de cima para baixo; os de pasta ("pasta-…") no último pedaço da pasta do projeto;
//   depois o rótulo da pasta e o nome que o Claude Code deu à sessão. A sessão em C:\dev\pessoal vai para "pessoal", se
//   o Monitor tem essa seção. A que não casa vai para "Outras", no fim.
// - agrupar(lista, prio): os grupos na ordem de prioridade, cada um com as sessões na ordem que já vinham.
// Sem prioridades (nenhum PC publica, ou nenhuma vale): a página fica exatamente como antes.
(function (raiz) {
"use strict";

const MAX = 60, MAX_CHAVE = 80, MAX_NOME = 80, MAX_REGRA = 300;
const OUTRAS = {chave: "outras", nome: "Outras", cor: "#8C9AB8", prioridade: null, re: null};
const PASTA_MUDA = /\\\.claude\\jobs\\|\\appdata\\local\\temp\\|\\scratchpad(\\|$)|\\tmp\\wt-|^[a-z]:\\?$/;

const semAcento = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = t => semAcento(t).toLowerCase().replace(/\//g, "\\");

// "#RRGGBB" em maiúsculas ("#RGB" vira "#RRGGBB"); null se não é cor
function corOk(c) {
  c = typeof c === "string" ? c.trim() : "";
  if (/^#[0-9a-f]{3}$/i.test(c)) c = "#" + c.slice(1).split("").map(x => x + x).join("");
  return /^#[0-9a-f]{6}$/i.test(c) ? c.toUpperCase() : null;
}
// A regra no formato que o Monitor gera (a casca da palavra inteira e, dentro, letras, números e poucos opcionais, cada
// um seguido de uma letra fixa, como o regra_segura do agente): a de outro formato, que poderia travar a página
// (o retrocesso exponencial de "(.|.)*!"), não vale
const CASCA = ["(^|[^a-z0-9])(?:", ")([^a-z0-9]|$)"], TOKEN = /\[ _-\]\??|\[\^a-z0-9\]\+|[a-z0-9 _]\??/y;
function segura(r) {
  if (!r.startsWith(CASCA[0]) || !r.endsWith(CASCA[1]) || r.length < CASCA[0].length + CASCA[1].length) return false;
  return r.slice(CASCA[0].length, r.length - CASCA[1].length).split("|").every(alt => {
    const t = [];
    TOKEN.lastIndex = 0;
    while (TOKEN.lastIndex < alt.length) { const m = TOKEN.exec(alt); if (!m) return false; t.push(m[0]); }
    return t.length > 0 && t.every((k, j) => !/[?+]$/.test(k)
      || (!!t[j + 1] && /^[a-z0-9]$/.test(t[j + 1]) && !(k.length === 2 && t[j + 1] === k[0])));
  });
}
function compilar(regra) {
  if (typeof regra !== "string" || !regra || regra.length > MAX_REGRA || !segura(regra)) return null;
  try { return new RegExp(regra); } catch (e) { return null; }
}
// A ordem fixa dos projetos conhecidos do Monitor (o CONHECIDOS do geral_projetos.js): quando um mesmo pedaço do caminho
// casa dois deles ("Legislacao Milagres"), vale o primeiro desta lista, como no Monitor
const FIXA = ["trancoso", "arraial", "milagres", "canas", "seaninho", "revit", "imagens-360", "legislacao", "uso-ia",
  "maquina", "avulsas"];
const fixa = k => (FIXA.includes(k) ? FIXA.indexOf(k) : FIXA.length);

// O "prioridades" conferido (o mesmo contrato do agente): {ts, pc, itens: [{chave, nome, cor, prioridade, re}]}; null
// se não vale. O que não vale sai (o item sem chave, a repetida, a cor ou a regra que não serve).
function validar(p) {
  if (!p || typeof p !== "object" || p.versao !== 1 || !Array.isArray(p.ordem)) return null;
  if (typeof p.ts !== "number" || !Number.isFinite(p.ts) || p.ts <= 0) return null;
  const vistas = new Set(), it = [];
  p.ordem.slice(0, MAX * 4).forEach((x, i) => {
    if (!x || typeof x !== "object" || typeof x.chave !== "string" || !x.chave.trim() || x.chave.length > MAX_CHAVE || vistas.has(x.chave)) return;
    vistas.add(x.chave);
    const nome = typeof x.projeto === "string" ? x.projeto.replace(/\s+/g, " ").trim().slice(0, MAX_NOME) : "";
    const peso = typeof x.prioridade === "number" && Number.isFinite(x.prioridade) ? x.prioridade : i;
    it.push({peso, i, chave: x.chave, nome: nome || x.chave, cor: corOk(x.cor) || OUTRAS.cor, re: compilar(x.regra)});
  });
  it.sort((a, b) => a.peso - b.peso || a.i - b.i);
  const itens = it.slice(0, MAX).map((x, n) => ({chave: x.chave, nome: x.nome, cor: x.cor, prioridade: n, re: x.re}));
  return {ts: Math.round(p.ts), pc: typeof p.pc === "string" ? p.pc.slice(0, 64) : "", itens};
}

// A de maior "ts" entre os PCs ({pc: {hoje: {painel: {prioridades}}}} ou a lista deles); null se nenhuma vale. A
// conferida fica guardada pelo texto (a página redesenha a cada 4 s).
let guardada = {texto: null, v: null};
function escolher(pcs) {
  let melhor = null;
  for (const p of Object.values(pcs || {})) {
    const pr = p && p.hoje && p.hoje.painel && p.hoje.painel.prioridades;
    if (pr && typeof pr === "object" && typeof pr.ts === "number" && (!melhor || pr.ts > melhor.ts) && validar(pr)) melhor = pr;
  }
  if (!melhor) return null;
  const texto = JSON.stringify(melhor);
  if (texto !== guardada.texto) guardada = {texto, v: validar(melhor)};
  return guardada.v;
}

// A pasta que diz o projeto: o cwd sem a worktree (".claude\worktrees\x"); "" para a pasta que não diz nada (a de uma
// sessão em segundo plano, o temporário, o scratchpad)
function pastaDoProjeto(cwd) {
  let c = String(cwd || "").replace(/\//g, "\\").replace(/\\+$/, "");
  const i = c.toLowerCase().indexOf("\\.claude\\worktrees\\");
  if (i >= 0) c = c.slice(0, i);
  return !c || PASTA_MUDA.test(norm(c)) ? "" : c;
}
// Os pedaços do caminho que podem dizer o projeto: sem a unidade e sem a pasta do usuário
const pedacos = c => norm(c).replace(/^[a-z]:\\users\\[^\\]+(\\|$)/, "").split("\\").filter(Boolean);
// O nome que o Claude Code deu (o da pasta em que abriu), sem as 2 letras do fim ("12235-milagres-spot-87")
const nomeBase = n => String(n || "").trim().replace(/-[0-9a-f]{2}$/i, "");
const casa = (lista, t) => t ? lista.find(x => x.re.test(t)) || null : null;

// O projeto da sessão (um item do prio) ou o grupo "Outras" (o do prio, se ele tem a seção "outras")
function projetoDe(s, prio) {
  if (!prio) return null;
  s = s || {};
  const com = prio.itens.filter(x => x.re), pastas = com.filter(x => /^pasta-/.test(x.chave));
  const fixos = com.filter(x => !/^pasta-/.test(x.chave)).sort((a, b) => fixa(a.chave) - fixa(b.chave) || a.prioridade - b.prioridade);
  const outras = prio.itens.find(x => x.chave === OUTRAS.chave) || OUTRAS;
  const pasta = pastaDoProjeto(s.cwd), cwd = norm(s.cwd);
  if (/\\dev\\pessoal(\\|$)/.test(cwd)) { const p = prio.itens.find(x => x.chave === "pessoal"); if (p) return p; }
  if (pasta) {
    const ps = pedacos(pasta);
    for (const t of ps) { const k = casa(fixos, t); if (k) return k; }
    const k = casa(pastas, ps[ps.length - 1]);
    if (k) return k;
  }
  for (const t of [pasta ? "" : norm(s.pasta), norm(nomeBase(s.nome))]) {
    const k = casa(fixos, t) || casa(pastas, t);
    if (k) return k;
  }
  return outras;
}

// Os grupos na ordem da prioridade ("Outras", sem prioridade, no fim); dentro de cada um, a ordem que veio
function agrupar(lista, prio) {
  const m = new Map();
  for (const s of lista || []) {
    const k = projetoDe(s, prio) || OUTRAS;
    let g = m.get(k.chave);
    if (!g) m.set(k.chave, g = {chave: k.chave, nome: k.nome, cor: k.cor, prioridade: k === OUTRAS ? null : k.prioridade, lista: []});
    g.lista.push(s);
  }
  const p = g => g.prioridade == null ? Infinity : g.prioridade;
  return [...m.values()].sort((a, b) => p(a) - p(b));
}
// A chave do projeto da sessão (o filtro 📁 Projeto)
const chaveDe = (s, prio) => (projetoDe(s, prio) || OUTRAS).chave;
// O nome e a cor de uma chave (o rótulo do filtro escolhido)
function infoDe(chave, prio) {
  const x = prio && prio.itens.find(i => i.chave === chave);
  return x ? {nome: x.nome, cor: x.cor, prioridade: x.prioridade} : chave === OUTRAS.chave ? {nome: OUTRAS.nome, cor: OUTRAS.cor, prioridade: null} : null;
}
// "P0 · Trancoso · 2" (o cabeçalho do grupo; "Outras · 3" sem a prioridade)
const rotulo = g => `${g.prioridade == null ? "" : "P" + g.prioridade + " · "}${g.nome} · ${g.lista.length}`;

// As variáveis da cor para o style (as mesmas do Monitor geral): a cor, uma mais clara (o texto) e o "r,g,b"
function vars(cor) {
  const c = corOk(cor) || OUTRAS.cor, rgb = [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const claro = rgb.map(v => Math.round(v + (255 - v) * 0.45).toString(16).padStart(2, "0")).join("");
  return `--pj:${c};--pj-2:#${claro.toUpperCase()};--pj-rgb:${rgb.join(",")}`;
}

const Prioridades = {OUTRAS, validar, escolher, projetoDe, agrupar, chaveDe, infoDe, rotulo, vars, corOk,
  _puro: {pastaDoProjeto, pedacos, nomeBase, norm, segura, FIXA}};
if (typeof module !== "undefined" && module.exports) module.exports = Prioridades;
else raiz.Prioridades = Prioridades;
})(typeof window !== "undefined" ? window : globalThis);
