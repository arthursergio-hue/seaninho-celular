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

// ---- 16/11: mudar a prioridade pelo celular (pedido do Arthur pelo iPhone) -------------------------------------------
// O caminho é o do arrastar do Monitor geral: a ordem mora no prioridades.json do PC. O celular manda ao PC que publicou a
// ordem que a página mostra o pedido {"acao": ACAO, "chave", "para", "base"} (cel_pedir, tipo "acao"); o agente de lá
// aplica o MOVIMENTO (a chave vai para o índice "para") sobre o arquivo de agora, grava pelo escritor do próprio Pro e
// publica; o outro PC adota pela maior "ts", como já fazia (prioridades_rede.py, "16/11"). Enquanto o PC não publica a
// ordem nova, a página mostra os movimentos pedidos por cima da publicada (aplicar), na mesma regra do agente.
const ACAO = "prioridades_mover";

// As chaves com `chave` no índice `para` (limitado ao começo e ao fim); a mesma lista (cópia) se a chave não está nela
function moverChave(chaves, chave, para) {
  const out = [...(chaves || [])], i = out.indexOf(chave);
  if (i < 0) return out;
  out.splice(i, 1);
  out.splice(Math.max(0, Math.min(out.length, Math.trunc(Number(para)) || 0)), 0, chave);
  return out;
}

// O prio com os movimentos ainda não publicados ([{chave, para}], na ordem em que foram feitos), cada um sobre a ordem
// que o anterior deixou (como o agente, que aplica cada pedido sobre o arquivo de agora). O índice "prioridade" é refeito.
function aplicar(prio, movs) {
  if (!prio || !Array.isArray(movs) || !movs.length) return prio;
  let chaves = prio.itens.map(x => x.chave);
  for (const m of movs) if (m && chaves.includes(m.chave)) chaves = moverChave(chaves, m.chave, m.para);
  const de = new Map(prio.itens.map(x => [x.chave, x]));
  return {...prio, itens: chaves.map((k, n) => ({...de.get(k), prioridade: n}))};
}

// O "para" de uma seção solta no meio das que aparecem na tela (as chaves das seções com prioridade, na ordem da tela,
// com a arrastada): `vaga` = quantas das OUTRAS ficam acima do dedo. No alto, P0; embaixo de todas, a última; no meio, logo antes da seção
// que fica abaixo dela (as que não aparecem, sem sessão agora, não mudam de lugar entre si). null: no mesmo lugar.
function paraDoSoltar(prio, visiveis, chave, vaga) {
  const chaves = prio ? prio.itens.map(x => x.chave) : [], i = chaves.indexOf(chave), tela = visiveis || [];
  if (i < 0) return null;
  const outras = tela.filter(k => k !== chave), v = Math.max(0, Math.min(outras.length, Math.trunc(Number(vaga)) || 0));
  if (v === tela.indexOf(chave)) return null;   // no mesmo lugar da tela
  // as de cima e as de baixo do dedo que ainda estão na ordem (uma que sumiu dela no meio do arrasto não conta)
  const vale = k => chaves.includes(k), acima = outras.slice(0, v).filter(vale), abaixo = outras.slice(v).filter(vale);
  if (!acima.length && !abaixo.length) return null;
  const sem = chaves.filter(k => k !== chave);
  const para = !acima.length ? 0 : !abaixo.length ? sem.length : sem.indexOf(abaixo[0]);
  return para === i ? null : para;
}

// A folha de uma seção (o toque no "P<n>"): a posição de agora, o ▲ e o ▼ (null nas pontas) e a lista P0…Pn inteira (as
// sem sessão agora também: a prioridade é a do Monitor), com quantas sessões cada uma tem (`contagem` {chave: n}).
function folha(prio, chave, contagem) {
  const itens = prio ? prio.itens : [], i = itens.findIndex(x => x.chave === chave);
  if (i < 0) return null;
  return {chave, nome: itens[i].nome, cor: itens[i].cor, atual: i, subir: i > 0 ? i - 1 : null,
    descer: i < itens.length - 1 ? i + 1 : null,
    itens: itens.map((x, n) => ({chave: x.chave, nome: x.nome, cor: x.cor, p: n, n: (contagem && contagem[x.chave]) || 0, atual: n === i}))};
}

// Para que PC vai o pedido: um dos que publicam a ordem que a página mostra (a mesma "ts"), ligado (`ligado(p)`) e com o
// agente que aceita o pedido (a marca "prioridades_mover" no painel; o número da versão não diz). Entre eles, o que
// escreveu a ordem (o "pc" dela), depois o de nome menor. {pc} ou {pc: null, motivo: "nenhum" | "desligado" | "agente",
// pcs: os que publicam}.
function alvo(pcs, prio, ligado) {
  if (!prio) return {pc: null, motivo: "nenhum", pcs: []};
  const pa = p => p && p.hoje && p.hoje.painel, ts = p => { const x = pa(p) && pa(p).prioridades; return x && typeof x.ts === "number" ? Math.round(x.ts) : null; };
  const com = Object.values(pcs || {}).filter(p => p && p.pc && ts(p) === prio.ts)
    .sort((a, b) => (b.pc === prio.pc) - (a.pc === prio.pc) || String(a.pc).localeCompare(String(b.pc)));
  const nomes = com.map(p => p.pc), vivos = com.filter(p => !ligado || ligado(p));
  const bom = vivos.find(p => pa(p).prioridades_mover === true);
  if (bom) return {pc: bom.pc, pcs: nomes};
  return {pc: null, motivo: !com.length ? "nenhum" : vivos.length ? "agente" : "desligado", pcs: nomes};
}

const Prioridades = {OUTRAS, ACAO, validar, escolher, projetoDe, agrupar, chaveDe, infoDe, rotulo, vars, corOk,
  moverChave, aplicar, paraDoSoltar, folha, alvo,
  _puro: {pastaDoProjeto, pedacos, nomeBase, norm, segura, FIXA}};
if (typeof module !== "undefined" && module.exports) module.exports = Prioridades;
else raiz.Prioridades = Prioridades;
})(typeof window !== "undefined" ? window : globalThis);
