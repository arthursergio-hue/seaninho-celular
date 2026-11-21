// O Para você premium (pro-105, 17/11: "Esse espaço aqui está tudo muito grande muito poluído, ajuste para mim. Quero
// tudo premium."): as contas sem tela da lista compacta, IGUAIS no celular e no Monitor geral. Este arquivo tem uma
// cópia irmã que precisa ficar idêntica (do "// ==== início" ao "// ==== fim"):
//   seaninho-pessoal: celular/web/pvlista.js          (testes: celular/test_pvlista.cjs)
//   seaninho-pro:     scripto/assets/geral_pvlista.js (testes: tests/geral_pvlista.test.cjs)
// O item é o do Para você de cada lado ({texto, titulo?, respostas?, recomendada?, comando?, slack?, alta?, prioridade?,
// link?}); o "card" (o do quadro visual, opcional) tem a palavra final sobre o título, as respostas e o comando.
// ==== início
(function (raiz) {
"use strict";

// Os grupos, nesta ordem: [tipo, ícone, rótulo]
const GRUPOS = [["acao", "🔧", "Ação sua"], ["decisao", "❓", "Decisão"], ["slack", "💬", "Mensagens"], ["info", "✓", "Informação"]];
const ROTULO = Object.fromEntries(GRUPOS.map(([k, ic, r]) => [k, {icone: ic, rotulo: r}]));
// O ícone de abertura do texto do quadro (🔧 ação, ❓ pergunta, ✓/✅/ℹ informação, 💬 mensagem)
const ABRE = /^\s*(?:🔧|❓|✅|✓|ℹ️?|💬)️?\s*/u;

const str = v => (typeof v === "string" ? v : v == null ? "" : String(v));
const umaLinha = t => str(t).replace(/\s+/g, " ").trim();
// O valor do card quando ele traz; senão o do item
function campo(item, card, k) {
  if (card && card[k] != null && card[k] !== "") return card[k];
  return item ? item[k] : undefined;
}
function frasesDe(item, card) {
  const f = campo(item, card, "respostas");
  return Array.isArray(f) ? f.filter(x => typeof x === "string" && x.trim()).map(x => x.trim()) : [];
}
// O texto sem o ícone de abertura e sem o "Ação sua (…):" do começo
function semPrefixo(t) {
  let s = str(t).replace(ABRE, "");
  s = s.replace(/^(?:Ação sua|Acao sua)\b[^:\n]{0,80}:\s*/i, "");
  s = s.replace(/^Informação\s*:\s*/i, "");
  return s.trim();
}
// A primeira frase (até o primeiro . ! ? … seguido de espaço, ou a primeira quebra de linha), no máximo 160 letras
function primeiraFrase(t) {
  const s = str(t).split("\n")[0].trim();
  const m = /[.!?…](?=\s|$)/u.exec(s);
  const f = (m ? s.slice(0, m.index + 1) : s).trim();
  return f.length > 160 ? f.slice(0, 159).trimEnd() + "…" : f;
}
const maiuscula = s => (s ? s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1) : s);
const norm = s => umaLinha(s).toLocaleLowerCase("pt-BR").replace(/[.!?…:]+$/u, "");

// O tipo do item: "acao" | "slack" | "decisao" | "info"
function tipoDoItem(item, card) {
  const it = item || {}, t = str(it.texto).trim();
  if (it.slack || (card && card.icone === "slack")) return "slack";
  if (campo(it, card, "comando") || (card && card.icone === "comando") || /^\s*🔧/u.test(t) || /^\s*a[çc][ãa]o sua\b/i.test(t)) return "acao";
  if (/^\s*(?:✅|✓|ℹ)/u.test(t)) return "info";
  if (/^\s*❓/u.test(t) || frasesDe(it, card).length || /\?\s*$/.test(primeiraFrase(semPrefixo(t)))) return "decisao";
  return "info";
}

// O título (uma linha; a tela corta com reticências) e a segunda linha, só quando ajuda
function tituloESub(item, card) {
  const it = item || {}, tipo = tipoDoItem(it, card);
  const frase = maiuscula(primeiraFrase(semPrefixo(it.texto)));
  // o título do quadro sem o ícone e sem o "Ação sua (…):"; o que sobra só com o rótulo ("Ação sua, 1 toque") não diz nada
  let doQuadro = maiuscula(semPrefixo(umaLinha(campo(it, card, "titulo"))));
  if (/^a[çc][ãa]o sua\b/i.test(doQuadro) && frase) doQuadro = "";
  let titulo = doQuadro && !/…$/u.test(doQuadro) ? doQuadro : (frase || doQuadro.replace(/…$/u, "").trim());
  if (!titulo) titulo = tipo === "slack" ? "Mensagem no Slack" : ROTULO[tipo].rotulo;
  let sub = "";
  if (tipo === "slack" && it.slack) {
    const de = umaLinha(it.slack.de), msg = umaLinha(it.slack.texto);
    sub = de && msg ? `${de}: ${msg}` : (msg || de);
  } else if (frase) {
    const a = norm(titulo), b = norm(frase);
    const repete = !a || b === a || b.startsWith(a.slice(0, 25)) || a.startsWith(b.slice(0, 25));
    if (!repete && (titulo.length <= 40 || /\?$/.test(titulo))) sub = frase;
  }
  if (norm(sub) === norm(titulo)) sub = "";
  return {titulo, sub: sub.length > 200 ? sub.slice(0, 199).trimEnd() + "…" : sub};
}

// A resposta principal (a recomendada) e a do "depois" (a frase que começa com "depois"; -1 sem ela)
function principalEDepois(frases, recomendada) {
  const f = Array.isArray(frases) ? frases : [];
  if (!f.length) return {principal: -1, depois: -1};
  const r = Number.isInteger(recomendada) && recomendada >= 0 && recomendada < f.length ? recomendada : 0;
  let d = f.findIndex((x, i) => i !== r && /^\s*depois\b/i.test(str(x)));
  if (d < 0 && /^\s*depois\b/i.test(str(f[r]))) d = r;
  return {principal: r, depois: d};
}

const alta = (item, card) => !!(item && (item.alta || item.prioridade === "alta")) || !!(card && card.prioridade === "alta");

// Os grupos à vista: [{tipo, icone, rotulo, itens}] na ordem de GRUPOS, só os que têm item; dentro do grupo, a
// prioridade alta primeiro e, no resto, a ordem do quadro. cardDe(item): o card do quadro do item (ou nada).
function agrupar(itens, cardDe) {
  const porTipo = {};
  (Array.isArray(itens) ? itens : []).forEach((it, n) => {
    if (!it) return;
    const card = typeof cardDe === "function" ? cardDe(it) : null, tipo = tipoDoItem(it, card);
    (porTipo[tipo] = porTipo[tipo] || []).push({it, n, a: alta(it, card) ? 0 : 1});
  });
  return GRUPOS.filter(([k]) => porTipo[k] && porTipo[k].length).map(([k, icone, rotulo]) => ({
    tipo: k, icone, rotulo,
    itens: porTipo[k].sort((x, y) => x.a - y.a || x.n - y.n).map(x => x.it),
  }));
}

// ---- as regras da linha, iguais nos dois lados (a revisão de 17/11: os críticos de design, função e completude) ----

// A frase que só adia ("depois", "mais tarde", "agora não", "vejo no Monitor depois"): nunca é travada, porque não
// autoriza nada; "depois do Delta" ou "depois manda" não entram (dizem mais que adiar).
const soAdia = t => /^\s*(?:depois|mais tarde|deixa para depois|vejo depois|vejo no monitor depois|agora n[ãa]o)\s*[.!]?\s*$/iu.test(str(t));

// O comando com cara de terminal (o ⚡ Rodar no PC e o "Copiar comando" só valem para ele). A frase em português para
// o chat ("Instala o código novo… e retoma os vigias.") não é: fica como "Frase para o chat", só com o Copiar.
function ehShell(cmd) {
  const c = str(cmd).trim();
  if (!c) return false;
  return /[\\/$=;|<>]|\.(?:ps1|py|exe|bat|cmd|sh)\b|^\s*(?:py|python|git|gh|node|npm|npx|pip|winget|code|claude|schtasks|reg|sc|cmd|powershell|pwsh|curl|ssh|scp|tailscale|choco|wsl|[A-Z][a-z]+-[A-Z][A-Za-z]+)\b/m.test(c);
}

// As pílulas da linha. Sem comando de terminal: a principal (a recomendada), uma curta (até 28 letras) e o "depois" por
// último, até 3. Com comando de terminal, o ⚡ Rodar no PC / Copiar comando é a principal (fora das frases) e fica só uma
// frase discreta: o "depois" (ou, sem ele, a recomendada). O resto vai no "+N", que abre o detalhe. Devolve {indices: as
// frases à vista, na ordem da tela; principal: o índice destacado (-1 quando o comando é o principal); resto: quantas
// ficaram só no detalhe}.
function pilulasDaLinha(frases, recomendada, comando) {
  const f = Array.isArray(frases) ? frases : [];
  if (!f.length) return {indices: [], principal: -1, resto: 0};
  const {principal: p, depois: d} = principalEDepois(f, recomendada), cmd = ehShell(comando);
  let vis;
  if (cmd) vis = [d >= 0 ? d : p];
  else {
    const curtas = f.map((_, i) => i).filter(i => i !== p && i !== d && str(f[i]).trim().length <= 28);
    vis = p === d ? [p, ...curtas].slice(0, 3) : [p, ...curtas].slice(0, d >= 0 ? 2 : 3).concat(d >= 0 ? [d] : []);
  }
  return {indices: vis, principal: cmd ? -1 : p, resto: f.length - vis.length};
}

// O chip do PC na linha só quando o item é de outro PC que não o da central (12 de 12 diziam "S192": ruído)
const mostraPc = (pcItem, pcCentral) => !!str(pcItem).trim() && str(pcItem).trim().toUpperCase() !== str(pcCentral).trim().toUpperCase();

// Os chips do quadro que ficam na faixa: sai o que repete um contador (🟡/🔵/🟢/⚪/🔴: "terça: 14 esperam você") e o
// que só diz a hora da volta (🔹 "17/11 05h4x")
const chipFica = c => !!c && !!str(c.texto).trim() && !/^\s*(?:🟡|🔵|🟢|⚪|🔴)/u.test(str(c.icone))
  && !(/^\s*🔹/u.test(str(c.icone)) && /^\s*\d{1,2}\/\d{1,2}\b/.test(str(c.texto)));
// Os contadores da faixa, na ordem, com a palavra (sempre no singular, nos dois lados) e sem os de 0 (o "você" fica)
const CONTADORES = [["voce", "você"], ["rodando", "rodando"], ["pronto", "pronto"], ["esperando", "esperando"]];
function contadoresDaFaixa(contador) {
  const c = contador && typeof contador === "object" ? contador : null;
  if (!c) return [];
  const n = k => Math.max(0, Math.floor(Number(c[k]) || 0));
  return CONTADORES.filter(([k]) => k === "voce" || n(k) > 0).map(([k, palavra]) => ({chave: k, n: n(k), palavra}));
}

// Quantos itens do grupo ficam à vista: até 6, todos; mais de 6, os 5 primeiros e o "Mostrar mais N"
const quantosAVista = (n, todos) => (todos || n <= 6) ? n : 5;

// A linha do "✓ Respondidos agora": uma só, nos dois lados: “fiz” · 13:33 · ✓✓ visto
function linhaFeito(frase, hora, fase) {
  const ROT = {enviado: "🕓 enviado", chegou: "✓ chegou", visto: "✓✓ visto", erro: "⚠ não entrou"};
  return [frase ? `“${umaLinha(frase)}”` : "", str(hora), ROT[fase] || ""].filter(Boolean).join(" · ");
}

// Os ícones monocromáticos dos tipos (Linear e Things usam ícone de linha: o emoji colorido brigava com o acento único).
// SVG de 14 px em currentColor; a página põe a cor (o tom suave).
const SVG = (d, extra) => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra || ""}>${d}</svg>`;
const ICONES = {
  acao: SVG('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'),
  decisao: SVG('<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 18h.01"/>'),
  slack: SVG('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/>'),
  info: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
};
const iconeDoTipo = tipo => ICONES[tipo] || ICONES.info;

const PvLista = {GRUPOS, tipoDoItem, tituloESub, principalEDepois, agrupar, frasesDe, semPrefixo, primeiraFrase, alta,
  soAdia, ehShell, pilulasDaLinha, mostraPc, chipFica, contadoresDaFaixa, quantosAVista, linhaFeito, iconeDoTipo};
if (typeof module !== "undefined" && module.exports) module.exports = PvLista;
else raiz.PvLista = PvLista;
})(typeof window !== "undefined" ? window : globalThis);
// ==== fim
