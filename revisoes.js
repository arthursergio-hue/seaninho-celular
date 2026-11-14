// Seaninho no celular: a aba ✓ Revisões do Monitor geral (entrega 2 do Monitor no celular, 13/11/2026). O Arthur (13/11):
// "quero todas as funções do monitor aqui" (PLANO-MONITOR-NO-CELULAR.md, entrega 2).
//
// O que mostra: os cards do quadro visual da central (o hoje.painel.revisoes que o agente do PC do maestro publica,
// revisoes.py: frente, pronto, espera, decisão, fechar e o Para você), as decisões pendentes de todos os PCs (o toque leva
// à tela Decisões, no lote), os filtros por tipo e, em cada card, os botões das ações que a caixa do maestro aceita
// (CARD_ACOES do agente: priorizar, pausar, retomar, prova, aprovar, ajuste, manter, fechar, resolvido, responder e
// comentar), o arrasto (para a direita prioriza, para a esquerda pausa) e a linha da ação: 🕓 (no aparelho), ✓ (no banco /
// o PC recebeu), ✓✓ (com o maestro: a linha na caixa) e "visto" (o caixa.py marcou o card: o maestro leu).
//
// A ação é a nota "card" ao maestro, a mesma do Monitor geral e do "✓ Rodei" (agente.linha_da_caixa): o cel_pedir tipo
// "acao" para o PC do maestro com {acao: "nota_maestro", tipo: "card", ref, item: "[card <id>] <Ação>[: texto]", card:
// {id, acao, titulo, sessao?, pc_sessao?, texto?}}. Ela espera DESFAZER_MS (o "Desfazer" no aviso e na linha) e, sem
// internet, fica na fila do aparelho e tenta de novo sozinha.
//
// O card comum do Monitor (cards.js) é da entrega 1, que corre em paralelo: o card daqui segue o mesmo desenho (faixa da
// cor do tipo, ícone, título, chip do PC, "há X", barra, botões ícone+palavra, linha da ação) e fica num lugar só
// (htmlCard), para trocar pelo comum na junção.
//
// Sem tela (testado no Node: test_revisoes.cjs): juntar, filtrar, a nota, a linha, o gesto, o HTML e o CSS. A página só
// liga (criarTela com as funções dela) e desenha.
(function (raiz) {
"use strict";

const VERSAO = 1;
const AGENTE_MIN = "0.9.0.11";     // o agente que leva a nota "card" à caixa do maestro (o AGENTE_CARD da página)
const AGENTE_REVISOES = "0.9.0.18"; // o trem 0.9.0.18: o agente que publica os cards (o hoje.painel.revisoes, revisoes.py)
const DESFAZER_MS = 5000;          // a ação espera isso antes de sair (o "Desfazer")
const TENTA_MS = 30000;            // sem internet: tenta de novo depois disso
const GUARDA_MS = 24 * 3600e3;     // as ações ficam no aparelho por um dia (a linha do card)
const MAX_REGISTROS = 60;
const TEXTO_MAX = 600;             // o texto do card na caixa (agente.card_da_nota: "texto" até 600)
const TITULO_MAX = 80;             // o "titulo" do card na nota (agente.card_da_nota)
const DUPLO_MS = 2500;             // o mesmo botão de novo nesse tempo é o dedo que bateu duas vezes
const INICIO_PX = 12, RAZAO = 1.4; // o arrasto: começa depois de 12 px de lado, e de lado mais que 1,4 × de pé
const LIMIAR_PX = 90, LIMIAR_FRACAO = 0.3, LIMIAR_MIN = 40;   // decide: 30% da largura ou 90 px (o das Decisões)
const CHAVE_STORE = "seaninho.rvAcoes", CHAVE_FILTRO = "seaninho.rvFiltro";
// o id do card na gramática do agente (CARD_ID): a página nunca manda outro
const RX_CARD = /^(frente|pv|pronto|espera|decisao|fechar):[0-9A-Za-z_.:/-]{1,80}$/;
const RX_REF = /^[0-9A-Za-z-]{6,40}$/;

const TIPOS = {
  frente: {icone: "🟡", rotulo: "Frente", cor: "#E2B84A"},
  pronto: {icone: "🔵", rotulo: "Pronto", cor: "#4AA8FF"},
  decisao: {icone: "🟣", rotulo: "Decisão", cor: "#A77BFF"},
  pv: {icone: "🟠", rotulo: "Para você", cor: "#F0913A"},
  espera: {icone: "⚪", rotulo: "Espera", cor: "#AEB8C8"},
  fechar: {icone: "🔴", rotulo: "Fechar", cor: "#E86A6A"},
};
// cada ação: o botão (ícone + palavra), a frase que vai na caixa ("[card <id>] <frase>[: texto]") e se pede um texto
const ACOES = {
  priorizar: {icone: "▲", rotulo: "Priorizar", frase: "Priorizar"},
  pausar: {icone: "⏸", rotulo: "Pausar", frase: "Pausar"},
  retomar: {icone: "▶", rotulo: "Retomar", frase: "Retomar"},
  prova: {icone: "👁", rotulo: "Prova", frase: "Prova"},
  aprovar: {icone: "✓", rotulo: "Aprovar", frase: "Aprovar"},
  ajuste: {icone: "✎", rotulo: "Ajuste", frase: "Ajuste", texto: "O que ajustar?"},
  manter: {icone: "📌", rotulo: "Manter", frase: "Manter"},
  fechar: {icone: "✕", rotulo: "Fechar", frase: "Fechar"},
  resolvido: {icone: "✓", rotulo: "Resolvido", frase: "Resolvido"},
  responder: {icone: "↩", rotulo: "Responder", frase: "Resposta", texto: "Sua resposta"},
  comentar: {icone: "💬", rotulo: "Comentar", frase: "Comentário", texto: "Comentário para o maestro", soIcone: true},
};
// os botões de cada tipo, na ordem (o card que traz "acoes" do quadro usa as dele)
const ACOES_DO_TIPO = {
  frente: ["priorizar", "pausar", "comentar"],
  espera: ["retomar", "priorizar", "comentar"],
  pronto: ["prova", "aprovar", "ajuste", "comentar"],
  fechar: ["fechar", "manter", "comentar"],
  pv: ["responder", "resolvido", "comentar"],
  decisao: [],
};
const ARRASTO = {direita: "priorizar", esquerda: "pausar"};
const ARRASTA_TIPOS = new Set(["frente", "espera"]);
const FILTROS = [["tudo", "Tudo"], ["frente", "Frentes"], ["pronto", "Prontos"], ["decisao", "Decisões"],
  ["pv", "Para você"], ["espera", "Espera"], ["fechar", "Fechar"]];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const umaLinha = (t, n) => { const s = String(t ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const txt = v => typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
const objeto = v => !!v && typeof v === "object" && !Array.isArray(v);
const nomeCurto = pc => String(pc || "").length > 11 && String(pc).includes("-") ? String(pc).split("-")[0] : String(pc || "");
// o horário em ms: época em s (o que o agente manda) ou ms, ou ISO
function ms(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(txt(v));
  return Number.isFinite(t) ? t : 0;
}
function haTexto(t, agora) {
  if (!t) return "";
  const s = Math.max(0, (agora - t) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}
// a comparação de versões "0.9.0.11" (a da página é a Lista.compararVersao; esta é igual, para o Node)
function compararVersao(a, b) {
  const pa = txt(a).split(".").map(n => parseInt(n, 10) || 0), pb = txt(b).split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

// ---- Juntar: os cards da tela ---------------------------------------------------------------------------------------
// entrada: {revisoes (o bloco do PC do maestro), maestro ({pc}), paraVoce (os itens do orquestra.para_voce, com "chave"),
// decisoes ([{chave, titulo, n, pc, desde}]: os lotes pendentes de todos os PCs), agora}. Saída: a lista na ordem da
// tela: as decisões pendentes primeiro (elas seguram sessões), depois os cards na ordem do quadro (a do Monitor). O card
// pv sem o item no Para você (o maestro já tirou, ou passou dos 12) não vai.
function juntar(e) {
  e = objeto(e) ? e : {};
  const bloco = objeto(e.revisoes) && Array.isArray(e.revisoes.cards) ? e.revisoes : {cards: []};
  const pcMaestro = txt(e.maestro && e.maestro.pc);
  const itens = new Map();
  for (const it of Array.isArray(e.paraVoce) ? e.paraVoce : []) if (objeto(it) && txt(it.id)) itens.set(txt(it.id), it);
  const pend = (Array.isArray(e.decisoes) ? e.decisoes : []).filter(d => objeto(d) && txt(d.chave));
  const out = [], usadas = new Set(), ids = new Set();
  for (const c of bloco.cards) {
    if (!objeto(c) || !RX_CARD.test(txt(c.id)) || ids.has(c.id)) continue;
    const tipo = c.id.split(":")[0];
    if (txt(c.tipo) && c.tipo !== tipo) continue;
    ids.add(c.id);
    const base = {id: c.id, tipo, coluna: txt(c.coluna), titulo: umaLinha(c.titulo, 90), linha: umaLinha(c.linha, 160),
      pc: txt(c.pc) || pcMaestro, sessao: txt(c.sessao), nome: umaLinha(c.nome, 60), desde: ms(c.desde),
      pct: Number.isFinite(c.pct) ? Math.max(0, Math.min(100, Math.round(c.pct))) : null, alta: c.alta === true,
      pausado: c.pausado === true, estado: txt(c.estado), visto: objeto(c.visto) ? c.visto : null,
      acoes: Array.isArray(c.acoes) ? c.acoes.filter(a => ACOES[a]) : null, link: /^https:\/\//.test(txt(c.link)) ? c.link : "",
      entrega: txt(c.entrega), lote: txt(c.lote), n: Number.isInteger(c.n) ? c.n : null, origem: "quadro"};
    if (tipo === "pv") {
      const it = itens.get(txt(c.ref_item));
      if (!it) continue;
      base.titulo = umaLinha(it.titulo || it.texto, 90);
      base.linha = it.titulo ? umaLinha(it.texto, 160) : "";
      base.alta = base.alta || it.alta === true;
      base.respostas = Array.isArray(it.respostas) ? it.respostas.filter(f => typeof f === "string").slice(0, 4) : [];
      base.recomendada = Number.isInteger(it.recomendada) ? it.recomendada : 0;
      base.chavePv = txt(it.chave);
      base.link = /^https:\/\//.test(txt(it.link)) ? it.link : "";
    }
    if (tipo === "decisao") {   // o lote pendente que é este card (pelo id do lote, ou pela chave "<pc>|<id>"): um só
      const k = base.lote || c.id.slice("decisao:".length);
      const d = pend.find(x => !usadas.has(x.chave) && (x.chave === k || (txt(x.lote) && x.lote === k)));
      if (d) { usadas.add(d.chave); base.chave = d.chave; base.n = Number.isInteger(d.n) ? d.n : base.n;
        base.titulo = base.titulo || umaLinha(d.titulo, 90); base.pc = base.pc || txt(d.pc); base.desde = base.desde || ms(d.desde); }
    }
    out.push(base);
  }
  const decisoes = pend.filter(d => !usadas.has(d.chave)).map(d => ({id: "", tipo: "decisao", origem: "decisoes",
    chave: d.chave, titulo: umaLinha(d.titulo, 90), n: Number.isInteger(d.n) ? d.n : null, pc: txt(d.pc),
    desde: ms(d.desde), linha: umaLinha(d.linha, 160), alta: false}));
  return [...decisoes, ...out];
}
const contar = lista => {
  const c = {tudo: 0, frente: 0, pronto: 0, decisao: 0, pv: 0, espera: 0, fechar: 0};
  for (const k of lista || []) { c.tudo++; if (k.tipo in c) c[k.tipo]++; }
  return c;
};
const filtroValido = f => FILTROS.some(([k]) => k === f) ? f : "tudo";
const filtrar = (lista, f) => (f = filtroValido(f)) === "tudo" ? [...(lista || [])] : (lista || []).filter(k => k.tipo === f);

// ---- As ações -------------------------------------------------------------------------------------------------------
// O último registro (ação) deste aparelho para o card, sem os desfeitos.
const ultimoDoCard = (regs, id) => (regs || []).filter(r => r && r.id === id && !r.desfeito).sort((a, b) => b.t - a.t)[0] || null;
// Os botões do card: os do quadro (se ele disser) ou os do tipo; a frente pausada (pelo quadro ou pela última ação
// daqui, que ainda não voltou com erro) troca o ⏸ Pausar pelo ▶ Retomar.
function acoesDoCard(card, ultimo) {
  if (!objeto(card) || card.tipo === "decisao" || card.origem !== "quadro") return [];
  let lista = card.acoes && card.acoes.length ? [...card.acoes] : [...(ACOES_DO_TIPO[card.tipo] || [])];
  const pausada = card.pausado || (ultimo && ultimo.acao === "pausar" && !ultimo.erro);
  const retomada = ultimo && ultimo.acao === "retomar" && !ultimo.erro;
  if (pausada && !retomada) lista = lista.map(a => a === "pausar" ? "retomar" : a);
  return [...new Set(lista)].filter(a => ACOES[a]);
}
// O arrasto que vale para o card: só frente e espera, e só para uma ação que ele tem (a frente já pausada não pausa).
function arrastoDoCard(card, ultimo) {
  if (!objeto(card) || card.origem !== "quadro" || !ARRASTA_TIPOS.has(card.tipo)) return {};
  const tem = new Set(acoesDoCard(card, ultimo).concat(card.acoes && card.acoes.length ? [] : ["priorizar", "pausar"]));
  const pausada = card.pausado || (ultimo && ultimo.acao === "pausar" && !ultimo.erro);
  return {direita: tem.has("priorizar") ? "priorizar" : "", esquerda: tem.has("pausar") && !pausada ? "pausar" : ""};
}
// O texto que vai na caixa e o objeto card, iguais ao que o agente confere (CARD_TEXTO, card_da_nota): uma linha só.
function montarRegistro(card, acao, texto, ref, t, maestro) {
  if (!objeto(card) || !RX_CARD.test(txt(card.id)) || !ACOES[acao] || !RX_REF.test(txt(ref))) return null;
  const nota = umaLinha(texto, TEXTO_MAX);
  if (ACOES[acao].texto && !nota) return null;   // o comentário, o ajuste e a resposta vão com o texto
  const frase = ACOES[acao].frase;
  const objetoCard = {id: card.id, acao, titulo: umaLinha(card.titulo || TIPOS[card.tipo].rotulo, TITULO_MAX)};
  if (/^[0-9a-f][0-9a-f-]{3,35}$/.test(txt(card.sessao))) objetoCard.sessao = card.sessao;
  if (txt(card.pc)) objetoCard.pc_sessao = umaLinha(card.pc, 40);
  if (nota) objetoCard.texto = nota;
  return {ref: txt(ref).toLowerCase(), id: card.id, acao, rotulo: ACOES[acao].rotulo, texto: nota,
    item: `[card ${card.id}] ${frase}${nota ? ": " + nota : ""}`, card: objetoCard, titulo: objetoCard.titulo,
    maestro: txt(maestro), t: Number(t) || 0, depois: (Number(t) || 0) + DESFAZER_MS, pid: "", erro: "", erroLocal: "",
    tenta: 0, desfeito: false};
}
// O cel_pedir da ação (o mesmo JSON do processarNotas da página, a nota "card").
const pedidoDoRegistro = r => ({pc: r.maestro, tipo: "acao", texto: JSON.stringify({acao: "nota_maestro", tipo: "card",
  ref: r.ref, item: r.item, card: r.card})});
// O "visto" do card vale para a ação: pela linha da caixa (o ref), pela hora (com 2 min de folga entre os relógios) ou,
// sem hora, pela mesma ação já entregue.
function vistoDaAcao(card, r, pedido) {
  const v = card && objeto(card.visto) ? card.visto : null;
  if (!v || !r) return false;
  if (txt(v.ref)) return v.ref === "card-" + r.ref;
  if (Number.isFinite(v.em) && v.em > 0) return v.em * 1000 >= r.t - 120000;
  return v.acao === r.acao && !!pedido && pedido.estado === "entregue";
}
// A linha da ação: {sinal: desfazer | fila | mandando | enviado | recebido | entregue | visto | erro, texto, ref,
// desfazer?, tentar?}. `pedido`: o da lista da página (pelo pid), se já chegou.
function estadoDaAcao(r, pedido, card, agora, nomes) {
  if (!r) return null;
  const pc = nomeCurto(r.maestro) || "PC", quem = (nomes && nomes.maestro) || "maestro";
  const base = {ref: r.ref, acao: r.acao, rotulo: `${ACOES[r.acao] ? ACOES[r.acao].icone + " " : ""}${r.rotulo}`};
  if (r.erro) return {...base, sinal: "erro", texto: `não foi: ${r.erro}`, tentar: true};
  if (!r.pid) {
    if (r.depois && agora < r.depois) return {...base, sinal: "desfazer", texto: `sai em ${Math.max(1, Math.ceil((r.depois - agora) / 1000))} s`, desfazer: true};
    if (r.erroLocal) return {...base, sinal: "fila", texto: `na fila do aparelho: ${r.erroLocal}`};
    return {...base, sinal: "mandando", texto: "mandando…"};
  }
  if (vistoDaAcao(card, r, pedido)) {
    const em = card.visto.em ? ms(card.visto.em) : 0;
    return {...base, sinal: "visto", texto: `visto pelo ${quem}${em ? " · " + haTexto(em, agora) : ""}`};
  }
  const p = objeto(pedido) ? pedido : null;
  if (p && p.estado === "erro") return {...base, sinal: "erro", texto: `não foi: ${umaLinha(p.erro || "o PC não conseguiu", 140)}`, tentar: true};
  if (p && p.estado === "entregue") {
    const como = /\(([^)]{3,80})\)\.?\s*$/.exec(txt(p.resposta));
    return {...base, sinal: "entregue", texto: `com o ${quem}${como ? " · " + como[1] : ""}`};
  }
  if (p && (p.estado === "escrevendo" || p.estado === "enviando")) return {...base, sinal: "recebido", texto: `o ${pc} recebeu`};
  return {...base, sinal: "enviado", texto: `enviado ao ${pc}`};
}
// A linha de um card: a da última ação daqui; sem ela, o visto que veio do quadro (uma ação feita no Monitor do PC).
function linhaDoCard(card, regs, pedidoDe, agora, nomes) {
  const r = card && card.id ? ultimoDoCard(regs, card.id) : null;
  if (r) return estadoDaAcao(r, r.pid && typeof pedidoDe === "function" ? pedidoDe(r.pid) : null, card, agora, nomes);
  const v = card && objeto(card.visto) ? card.visto : null;
  if (!v || !ACOES[v.acao]) return null;
  const em = v.em ? ms(v.em) : 0;
  return {sinal: "visto", acao: v.acao, rotulo: `${ACOES[v.acao].icone} ${ACOES[v.acao].rotulo}`,
    texto: `visto pelo ${(nomes && nomes.maestro) || "maestro"}${em ? " · " + haTexto(em, agora) : ""}`};
}
const SINAL = {desfazer: "🕓", fila: "🕓", mandando: "🕓", enviado: "✓", recebido: "✓", entregue: "✓✓", visto: "✓✓", erro: "⚠"};

// ---- O gesto (sem tela) ---------------------------------------------------------------------------------------------
const limiarArrasto = largura => {
  const l = Number(largura);
  return Math.max(LIMIAR_MIN, Math.min(LIMIAR_PX, l > 0 ? l * LIMIAR_FRACAO : LIMIAR_PX));
};
// null (ainda não dá para dizer), "rolar" (mais de pé que de lado) ou "direita" / "esquerda" (passou do limiar).
function decidirArrasto(dx, dy, largura) {
  const ax = Math.abs(Number(dx)), ay = Math.abs(Number(dy));
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return null;
  if (ax < INICIO_PX && ay < INICIO_PX) return null;
  if (ax <= ay * RAZAO) return "rolar";
  if (ax < limiarArrasto(largura)) return null;
  return Number(dx) > 0 ? "direita" : "esquerda";
}
// A ação do arrasto para o card ("" se o card não faz aquilo).
const acaoDoArrasto = (card, direcao, ultimo) => (direcao === "direita" || direcao === "esquerda") ? (arrastoDoCard(card, ultimo)[direcao] || "") : "";

// ---- O HTML ---------------------------------------------------------------------------------------------------------
function htmlLinha(l) {
  if (!l) return "";
  const s = SINAL[l.sinal] || "";
  const botao = l.desfazer ? ` <button class="rv-mini" data-rv-desfazer="${esc(l.ref)}">Desfazer</button>`
    : l.tentar ? ` <button class="rv-mini" data-rv-tentar="${esc(l.ref)}">Tentar de novo</button>` : "";
  return `<div class="rv-sinal rv-s-${esc(l.sinal)}" data-rv-sinal="${esc(l.sinal)}"><span class="rv-rot">${esc(l.rotulo || "")}</span> <b>${s}</b> ${esc(l.texto)}${botao}</div>`;
}
function htmlBotao(card, acao, ctx) {
  const a = ACOES[acao], pendente = ctx.ultimo && ctx.ultimo.acao === acao && ctx.linha
    && ["desfazer", "fila", "mandando"].includes(ctx.linha.sinal);
  const off = ctx.bloqueio || pendente;
  const rot = a.soIcone ? a.icone : `${a.icone} ${a.rotulo}`;
  return `<button class="rv-b rv-b-${acao}${a.soIcone ? " so-icone" : ""}" data-rv-acao="${acao}" data-rv-id="${esc(card.id)}"${off ? " disabled" : ""} aria-label="${esc(a.rotulo)}: ${esc(card.titulo || TIPOS[card.tipo].rotulo)}"${ctx.bloqueio ? ` title="${esc(ctx.bloqueio)}"` : ""}>${esc(rot)}</button>`;
}
// O card (o desenho do card comum do Monitor: faixa, ícone, título, chip do PC, "há X", barra, botões, linha).
// ctx: {agora, linha, ultimo, bloqueio ("" ou o porquê dos botões desligados), nomes}.
function htmlCard(card, ctx) {
  ctx = ctx || {};
  const t = TIPOS[card.tipo] || TIPOS.frente, agora = ctx.agora || Date.now();
  const erro = card.coluna === "erro";
  const quando = card.desde ? `<span class="rv-ha">${esc(haTexto(card.desde, agora))}</span>` : "";
  const pc = card.pc ? `<span class="rv-pc" title="${esc(card.pc)}">${esc(nomeCurto(card.pc))}</span>` : "";
  if (card.tipo === "decisao") {   // uma linha: o toque abre a tela Decisões no lote
    const n = Number.isInteger(card.n) && card.n > 0 ? `${card.n} ${card.n === 1 ? "pergunta" : "perguntas"}` : "perguntas";
    return `<article class="rv-card rv-t-decisao" style="--rv-cor:${t.cor}" data-rv-card="${esc(card.id || "dec:" + (card.chave || ""))}">
      <button class="rv-dec" data-rv-dec="${esc(card.chave || "")}" aria-label="Abrir a decisão ${esc(card.titulo || "")} na tela Decisões">
        <span class="rv-ic">${t.icone}</span><span class="rv-dec-t"><b>Decisão: ${esc(n)}</b>${card.titulo ? `<small>${esc(card.titulo)}</small>` : ""}</span>${pc}${quando}<span class="rv-ir">abrir ›</span></button></article>`;
  }
  const arr = arrastoDoCard(card, ctx.ultimo);
  const arrasta = !ctx.bloqueio && (arr.direita || arr.esquerda);
  const barra = Number.isFinite(card.pct) && card.pct !== null
    ? `<div class="rv-barra-l"><div class="rv-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${card.pct}"><i style="width:${card.pct}%"></i></div><span class="rv-pct">${card.pct}%</span></div>` : "";
  const frases = card.tipo === "pv" && card.respostas && card.respostas.length && !ctx.bloqueio
    ? `<div class="rv-frases">${card.respostas.map((f, n) => `<button class="rv-frase${n === card.recomendada ? " rec" : ""}" data-rv-frase="${n}" data-rv-id="${esc(card.id)}">${esc(umaLinha(f, 120))}</button>`).join("")}</div>` : "";
  const botoes = acoesDoCard(card, ctx.ultimo).map(a => htmlBotao(card, a, ctx)).join("");
  const sessao = card.nome && card.nome !== card.titulo ? `<div class="rv-quem">💬 ${esc(card.nome)}</div>` : "";
  const fundo = arrasta ? `<div class="rv-fundo" aria-hidden="true"><span class="rv-fd-dir">${arr.direita ? "▲ Priorizar" : ""}</span><span class="rv-fd-esq">${arr.esquerda ? "Pausar ⏸" : ""}</span></div>` : "";
  return `<article class="rv-card rv-t-${card.tipo}${card.alta ? " alta" : ""}${erro ? " erro" : ""}${card.pausado ? " pausado" : ""}" style="--rv-cor:${erro ? "#E86A6A" : t.cor}" data-rv-card="${esc(card.id)}"${arrasta ? ` data-rv-arrasta="${arr.direita ? "d" : ""}${arr.esquerda ? "e" : ""}"` : ""}>${fundo}
    <div class="rv-cara">
      <div class="rv-topo"><span class="rv-ic">${erro ? "⚠" : t.icone}</span><b class="rv-tit">${esc(t.rotulo)}: ${esc(card.titulo || "(sem título)")}</b>${pc}${quando}</div>
      ${card.linha ? `<div class="rv-linha">${esc(card.linha)}</div>` : ""}${sessao}${barra}${frases}
      ${botoes ? `<div class="rv-acoes">${botoes}${card.link ? `<a class="rv-b rv-link" href="${esc(card.link)}" target="_blank" rel="noopener">↗ Abrir</a>` : ""}</div>` : ""}
      ${htmlLinha(ctx.linha)}
    </div></article>`;
}
// A folha do texto (comentar, ajuste, responder): o card, o campo e Enviar / Cancelar.
function htmlFolha(f, card) {
  if (!f || !card || !ACOES[f.acao]) return "";
  const a = ACOES[f.acao];
  return `<div class="rv-folha" role="dialog" aria-label="${esc(a.rotulo)}" data-rv-folha="${esc(card.id)}">
    <div class="rv-folha-t"><b>${esc(a.icone)} ${esc(a.rotulo)}</b><small>${esc(TIPOS[card.tipo].rotulo)}: ${esc(card.titulo || "")}</small></div>
    <textarea id="rvTexto" class="rv-texto" maxlength="${TEXTO_MAX}" rows="4" placeholder="${esc(a.texto)}">${esc(f.texto || "")}</textarea>
    <div class="rv-folha-b"><button class="rv-b" data-rv-folha-cancelar>Cancelar</button><button class="rv-b rv-ok" data-rv-folha-enviar>Enviar ao ${esc(f.quem || "maestro")}</button></div></div>`;
}
// A tela inteira: os filtros, o aviso (sem o quadro, agente velho, desligado), os cards e a dica do arrasto.
// vm: {lista (já filtrada), contagem, filtro, linhas (id → linha), ultimos (id → registro), bloqueio, aviso, rodape,
// folha, cardFolha, agora, nomes}.
function htmlTela(vm) {
  const c = vm.contagem || contar([]);
  const chips = FILTROS.filter(([k]) => k === "tudo" || c[k] || k === vm.filtro).map(([k, rot]) =>
    `<button class="rv-filtro${k === vm.filtro ? " on" : ""}" data-rv-filtro="${k}" aria-pressed="${k === vm.filtro}">${esc(rot)}${c[k] ? ` <span>${c[k]}</span>` : ""}</button>`).join("");
  const cards = (vm.lista || []).map(k => htmlCard(k, {agora: vm.agora, linha: vm.linhas && vm.linhas[k.id],
    ultimo: vm.ultimos && vm.ultimos[k.id], bloqueio: vm.bloqueio, nomes: vm.nomes})).join("");
  const vazio = vm.filtro !== "tudo" && c.tudo ? "Nenhum card com este filtro." : "Nada no quadro agora.";
  const temArrasto = (vm.lista || []).some(k => k.origem === "quadro" && ARRASTA_TIPOS.has(k.tipo)) && !vm.bloqueio;
  return `<div class="rv-filtros" role="toolbar" aria-label="Filtrar os cards">${chips}</div>
    ${vm.aviso ? `<p class="rv-aviso">${esc(vm.aviso)}</p>` : ""}
    <div class="rv-lista">${cards || `<div class="rv-vazio">${esc(vazio)}</div>`}</div>
    ${temArrasto ? `<p class="rv-dica">← arrastar: pausar · priorizar: →</p>` : ""}
    ${vm.rodape ? `<p class="rv-rodape">${esc(vm.rodape)}</p>` : ""}
    ${htmlFolha(vm.folha, vm.cardFolha)}`;
}
// O que o toque pede: {acao: "filtro"|"card"|"decisao"|"frase"|"desfazer"|"tentar"|"enviar"|"cancelar", ...}.
function acaoDe(alvo) {
  const el = alvo && alvo.closest ? alvo : null;
  if (!el) return null;
  const b = el.closest("[data-rv-filtro],[data-rv-acao],[data-rv-dec],[data-rv-frase],[data-rv-desfazer],[data-rv-tentar],[data-rv-folha-enviar],[data-rv-folha-cancelar]");
  if (!b || b.disabled) return null;
  const d = b.dataset || {};
  if (d.rvFiltro !== undefined) return {acao: "filtro", filtro: d.rvFiltro};
  if (d.rvAcao !== undefined) return {acao: "card", qual: d.rvAcao, id: d.rvId || ""};
  if (d.rvDec !== undefined) return {acao: "decisao", chave: d.rvDec};
  if (d.rvFrase !== undefined) return {acao: "frase", n: Number(d.rvFrase) || 0, id: d.rvId || ""};
  if (d.rvDesfazer !== undefined) return {acao: "desfazer", ref: d.rvDesfazer};
  if (d.rvTentar !== undefined) return {acao: "tentar", ref: d.rvTentar};
  if (d.rvFolhaEnviar !== undefined) return {acao: "enviar"};
  if (d.rvFolhaCancelar !== undefined) return {acao: "cancelar"};
  return null;
}
// O resumo do Início (uma linha que leva à tela): "✓ Revisões · 3 frentes · 1 pronto · 2 decisões".
function htmlResumo(lista) {
  const c = contar(lista);
  if (!c.tudo) return "";
  const partes = [["decisao", "decisão", "decisões"], ["pv", "para você", "para você"], ["pronto", "pronto", "prontos"],
    ["frente", "frente", "frentes"], ["espera", "em espera", "em espera"], ["fechar", "para fechar", "para fechar"]]
    .filter(([k]) => c[k]).map(([k, um, varios]) => `${c[k]} ${c[k] === 1 ? um : varios}`);
  return `<button class="rv-resumo" data-rv-abrir aria-label="Abrir as Revisões"><b>✓ Revisões</b><span>${esc(partes.join(" · "))}</span><span class="rv-ir">abrir ›</span></button>`;
}

// ---- A tela (com a página) ------------------------------------------------------------------------------------------
// env: {corpo() (o elemento da lista), store {get, set}, rpc(nome, args), novoId(), agora(), maestro() ({pc, versao,
// ligado}|null), revisoes() (o bloco do PC do maestro|null), paraVoce(), decisoes(), pedido(pid), abrirDecisoes(chave),
// avisar(msg, {ok, erro, rotulo, acao}), nomes() ({maestro, maestroMeio}), compararVersao?, aoMudar?()}.
function criarTela(env) {
  let filtro = filtroValido(lerStore(CHAVE_FILTRO, "tudo"));
  let regs = (lerStore(CHAVE_STORE, []) || []).filter(r => objeto(r) && RX_REF.test(txt(r.ref)) && RX_CARD.test(txt(r.id)));
  let folha = null, enviando = false, timer = 0, ligado = null, semCliqueAte = 0, g = null, ultimaLista = [];
  function lerStore(k, padrao) { try { const v = JSON.parse(env.store.get(k) || "null"); return v ?? padrao; } catch { return padrao; } }
  function salvar() {
    const agora = env.agora();
    regs = regs.filter(r => agora - r.t < GUARDA_MS).sort((a, b) => a.t - b.t).slice(-MAX_REGISTROS);
    try { env.store.set(CHAVE_STORE, JSON.stringify(regs)); } catch { /* sem espaço: fica na memória */ }
  }
  const comparar = (a, b) => (typeof env.compararVersao === "function" ? env.compararVersao : compararVersao)(a, b);
  const nomes = () => (typeof env.nomes === "function" ? env.nomes() : null) || {maestro: "maestro"};
  // Por que os botões estão desligados ("" = podem mandar)
  function bloqueio() {
    const m = env.maestro();
    if (!m || !m.pc) return "o maestro não está em nenhum PC agora";
    if (comparar(m.versao, AGENTE_MIN) < 0) return `o agente do ${nomeCurto(m.pc)} é de antes da ${AGENTE_MIN} e não leva a ação do card`;
    return "";
  }
  function lista() {
    const m = env.maestro();
    return juntar({revisoes: env.revisoes(), maestro: m, paraVoce: env.paraVoce(), decisoes: env.decisoes(), agora: env.agora()});
  }
  const acharCard = id => ultimaLista.find(k => k.id === id) || lista().find(k => k.id === id) || null;
  function vm() {
    const agora = env.agora(), todos = lista(), m = env.maestro(), rv = env.revisoes(), nm = nomes();
    ultimaLista = todos;
    const linhas = {}, ultimos = {};
    for (const k of todos) {
      if (!k.id) continue;
      ultimos[k.id] = ultimoDoCard(regs, k.id);
      linhas[k.id] = linhaDoCard(k, regs, env.pedido, agora, nm);
    }
    let aviso = "";
    if (!m) aviso = "O maestro não está em nenhum PC agora: os cards voltam quando ele aparecer.";
    else if (!objeto(rv)) aviso = compararVersao(String(m.versao || ""), AGENTE_REVISOES) >= 0   // o agente já é o novo: falta o quadro
      ? `O quadro visual da central do ${nomeCurto(m.pc)} ainda não tem cards.`
      : `O ${nomeCurto(m.pc)} ainda não manda os cards das Revisões: precisa do agente ${AGENTE_REVISOES} nele.`;
    else if (m.ligado === false) aviso = `O ${nomeCurto(m.pc)} está desligado: a ação espera ele voltar.`;
    const quadroEm = objeto(rv) ? ms(rv.atualizado) : 0;
    const rodape = objeto(rv) ? [quadroEm ? `Quadro de ${haTexto(quadroEm, agora)}` : "",
      Number(rv.cortados) > 0 ? `+${rv.cortados} no Monitor do PC (o celular leva os primeiros)` : ""].filter(Boolean).join(" · ") : "";
    return {lista: filtrar(todos, filtro), contagem: contar(todos), filtro, linhas, ultimos, bloqueio: bloqueio(),
      aviso, rodape, folha: folha && {...folha, quem: nm.maestro}, cardFolha: folha ? acharCard(folha.id) : null,
      agora, nomes: nm};
  }
  // Redesenha (sem `forcar`, nunca por baixo do dedo que arrasta nem com o teclado aberto na folha; e só se o HTML mudou).
  function desenhar(forcar = false) {
    const el = env.corpo();
    if (!el) return;
    const foco = typeof document !== "undefined" && document.activeElement && document.activeElement.id === "rvTexto";
    if (!forcar && (g || foco)) { agendar(); return; }
    if (folha && el.querySelector("#rvTexto")) folha.texto = el.querySelector("#rvTexto").value;   // o que já escreveu
    const html = htmlTela(vm());
    if (el._rvHtml === html && ligado === el) { agendar(); return; }
    el._rvHtml = html;
    el.innerHTML = html;
    if (foco || (folha && folha.focar)) {
      const ta = el.querySelector("#rvTexto");
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
      if (folha) folha.focar = false;
    }
    if (ligado !== el) ligarGestos(el);
    agendar();
  }
  function mudou() { desenhar(); if (typeof env.aoMudar === "function") env.aoMudar(); }
  // o próximo passo da fila: o fim de um "Desfazer", a nova tentativa sem internet ou o relógio da linha
  function agendar() {
    clearTimeout(timer);
    const agora = env.agora();
    const proximos = regs.filter(r => !r.pid && !r.erro && !r.desfeito)
      .map(r => Math.max(agora + 200, r.depois && agora < r.depois ? Math.min(r.depois, agora + 1000) : r.tenta || agora));
    if (proximos.length) timer = setTimeout(() => { processar().then(() => mudou()); }, Math.min(...proximos) - agora);
  }
  // Manda as ações que já podem ir (passou o Desfazer; sem internet, depois do TENTA_MS). Devolve se mandou alguma.
  async function processar() {
    if (enviando) return false;
    enviando = true;
    let mandou = false;
    try {
      for (const r of regs) {
        const agora = env.agora();
        if (r.pid || r.erro || r.desfeito || (r.depois && agora < r.depois) || (r.tenta && agora < r.tenta)) continue;
        try {
          r.pid = String((await env.rpc("cel_pedir", pedidoDoRegistro(r))) || "ok");
          r.erroLocal = ""; r.tenta = 0; mandou = true;
        } catch (e) {
          if (e && (e.rede || /failed to fetch|network|load failed|demorou demais/i.test(String(e.message || e)))) {
            r.erroLocal = "sem internet, tenta de novo sozinho"; r.tenta = env.agora() + TENTA_MS;
          } else r.erro = umaLinha((e && e.message) || e || "o banco recusou", 140);
        }
        salvar();
      }
    } finally { enviando = false; }
    if (mandou && typeof env.pedirInteiro === "function") env.pedirInteiro();
    return mandou;
  }
  // Uma ação nova no card: o registro com o Desfazer, o aviso e a fila.
  function registrar(card, acao, texto) {
    const agora = env.agora(), m = env.maestro(), b = bloqueio();
    if (b) { env.avisar(`Não deu: ${b}.`, {erro: true}); return false; }
    const ult = ultimoDoCard(regs, card.id);
    if (ult && ult.acao === acao && agora - ult.t < DUPLO_MS && !ult.texto) return false;   // o dedo bateu duas vezes
    const r = montarRegistro(card, acao, texto, env.novoId(), agora, m.pc);
    if (!r) { env.avisar("Escreva o texto antes de enviar.", {erro: true}); return false; }
    regs.push(r);
    salvar();
    env.avisar(`${ACOES[acao].icone} ${ACOES[acao].rotulo}: ${umaLinha(card.titulo || TIPOS[card.tipo].rotulo, 40)} · vai ao ${nomes().maestroMeio || "maestro"}`,
      {ok: true, rotulo: "Desfazer", acao: () => desfazer(r.ref)});
    desenhar();
    return true;
  }
  function desfazer(ref) {
    const r = regs.find(x => x.ref === ref);
    if (!r) return;
    if (r.pid) { env.avisar(`O ${nomes().maestroMeio || "maestro"} já recebeu: a ação não volta.`, {}); return; }
    r.desfeito = true;
    salvar(); desenhar();
  }
  // De novo com o MESMO ref: se a primeira chegou a entrar, a caixa e a digitação do agente não repetem o mesmo toque.
  function tentar(ref) {
    const r = regs.find(x => x.ref === ref);
    if (!r) return;
    if (!acharCard(r.id)) { env.avisar("O card saiu do quadro: a ação não vai mais.", {}); return; }
    Object.assign(r, {pid: "", erro: "", erroLocal: "", tenta: 0, depois: 0, t: env.agora()});
    salvar();
    processar().then(() => desenhar());
    desenhar();
  }
  function abrirFolha(card, acao, texto) {
    folha = {id: card.id, acao, texto: texto || "", focar: true};
    desenhar();
  }
  function enviarFolha() {
    if (!folha) return;
    const el = env.corpo(), ta = el && el.querySelector("#rvTexto"), texto = ta ? ta.value : folha.texto;
    const card = acharCard(folha.id);
    if (!card) { folha = null; desenhar(); env.avisar("O card saiu do quadro.", {}); return; }
    if (!umaLinha(texto, TEXTO_MAX)) { env.avisar("Escreva o texto antes de enviar.", {erro: true}); return; }
    const f = folha;
    folha = null;
    if (!registrar(card, f.acao, texto)) { folha = f; desenhar(); }
  }
  function clique(ev) {
    if (env.agora() < semCliqueAte) { ev.preventDefault(); ev.stopPropagation(); return; }
    const a = acaoDe(ev.target);
    if (!a) return;
    if (a.acao === "filtro") { filtro = filtroValido(a.filtro); try { env.store.set(CHAVE_FILTRO, JSON.stringify(filtro)); } catch {} return desenhar(); }
    if (a.acao === "decisao") return env.abrirDecisoes(a.chave || "");
    if (a.acao === "desfazer") return desfazer(a.ref);
    if (a.acao === "tentar") return tentar(a.ref);
    if (a.acao === "cancelar") { folha = null; return desenhar(); }
    if (a.acao === "enviar") return enviarFolha();
    const card = acharCard(a.id);
    if (!card) return;
    if (a.acao === "frase") return abrirFolha(card, "responder", (card.respostas || [])[a.n] || "");
    if (ACOES[a.qual] && ACOES[a.qual].texto) return abrirFolha(card, a.qual, "");
    registrar(card, a.qual);
  }
  // O arrasto: o card anda (amortecido), o fundo diz a ação; soltar depois do limiar faz, antes volta.
  function ligarGestos(el) {
    if (ligado && ligado !== el) desligarGestos(ligado);
    ligado = el;
    el.addEventListener("pointerdown", baixo);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", cima);
    el.addEventListener("pointercancel", cancela);
    el.addEventListener("touchmove", toque, {passive: false});
    el.addEventListener("click", clique, true);
  }
  function desligarGestos(el) {
    el.removeEventListener("pointerdown", baixo); el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", cima); el.removeEventListener("pointercancel", cancela);
    el.removeEventListener("touchmove", toque, {passive: false}); el.removeEventListener("click", clique, true);
  }
  function soltar(volta) {
    if (!g) return;
    const c = g.card;
    c.classList.remove("rv-pega", "pra-dir", "pra-esq");
    c.classList.toggle("rv-volta", !!volta);
    if (g.cara) g.cara.style.transform = "";
    g = null;
  }
  function baixo(ev) {
    if ((ev.button || 0) > 0 || ev.isPrimary === false || g) return;
    const card = ev.target.closest && ev.target.closest("[data-rv-arrasta]");
    if (!card || ev.target.closest("button, a, textarea, input")) return;
    g = {card, cara: card.querySelector(".rv-cara"), id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, modo: "",
      largura: card.getBoundingClientRect().width, pode: card.dataset.rvArrasta || ""};
  }
  function move(ev) {
    if (!g || ev.pointerId !== g.id) return;
    const dx = ev.clientX - g.x0, dy = ev.clientY - g.y0, d = decidirArrasto(dx, dy, g.largura);
    if (!g.modo) {
      if (d === "rolar") { soltar(false); return; }
      if (Math.abs(dx) < INICIO_PX) return;
      g.modo = "arrasta";
      g.card.classList.remove("rv-volta");
      g.card.classList.add("rv-pega");
      try { g.card.setPointerCapture(g.id); } catch { /* o dedo já saiu */ }
    }
    const pode = dx > 0 ? g.pode.includes("d") : g.pode.includes("e");
    const teto = pode ? Math.max(48, g.largura * 0.4) : 16, x = Math.max(-teto, Math.min(teto, dx * 0.75));
    if (g.cara) g.cara.style.transform = `translateX(${Math.round(x)}px)`;
    g.card.classList.toggle("pra-dir", d === "direita" && pode);
    g.card.classList.toggle("pra-esq", d === "esquerda" && pode);
  }
  function cima(ev) {
    if (!g || ev.pointerId !== g.id) return;
    const eu = g, dx = ev.clientX - eu.x0, dy = ev.clientY - eu.y0;
    if (!eu.modo) { soltar(false); return; }
    semCliqueAte = env.agora() + 450;   // o soltar não é um toque num botão
    const d = ev.type === "pointerup" ? decidirArrasto(dx, dy, eu.largura) : null;
    const id = eu.card.dataset.rvCard;
    soltar(true);
    const card = acharCard(id);
    const qual = card ? acaoDoArrasto(card, d, ultimoDoCard(regs, id)) : "";
    if (qual) registrar(card, qual);
  }
  const cancela = () => soltar(true);
  const toque = ev => { if (g && g.modo && ev.cancelable) ev.preventDefault(); };
  return {
    desenhar, processar, registrar, desfazer, tentar,
    get filtro() { return filtro; },
    set filtro(f) { filtro = filtroValido(f); },
    get registros() { return regs; },
    lista,
    fecharFolha() { folha = null; },
    temFolha: () => !!folha,
    resumo: () => htmlResumo(lista()),
    contagem: () => contar(lista()),
  };
}

const CSS = `
/* ✓ Revisões (entrega 2 do Monitor no celular): o card do quadro visual, os filtros, a linha da ação e o arrasto */
#revisoes{position:fixed;inset:0;z-index:6;display:flex;flex-direction:column;padding-left:var(--esq);padding-right:var(--dir);
  background:#050C24 var(--ceu,linear-gradient(170deg,#0E224A,#08142E 60%)) 0 0/100vw auto no-repeat}
#revisoes .ar-topo button{width:44px;height:44px;flex:none}
#revisoes .ar-topo b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#revisoes .ar-corpo{padding-bottom:calc(var(--bottom) + 24px);overscroll-behavior:contain}
.rv-filtros{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -2px 10px;padding:2px}
.rv-filtros::-webkit-scrollbar{display:none}
.rv-filtro{flex:none;min-height:36px;padding:6px 12px;border-radius:999px;background:var(--glass-2);color:var(--ink);font-size:13.5px;font-weight:650;white-space:nowrap}
.rv-filtro span{display:inline-block;min-width:18px;margin-left:3px;padding:0 5px;border-radius:999px;background:rgba(255,255,255,.12);font-size:12px}
.rv-filtro.on{background:var(--gold);color:var(--navy)}
.rv-filtro.on span{background:rgba(4,10,24,.18)}
.rv-aviso{margin:0 0 10px;padding:9px 12px;border-radius:12px;background:rgba(226,184,74,.12);color:var(--gold-2,#F6D77E);font-size:13.5px}
.rv-lista{display:flex;flex-direction:column;gap:9px}
.rv-card{position:relative;border-radius:14px;overflow:hidden;background:var(--glass);border:1px solid var(--stroke)}
.rv-card.alta{box-shadow:0 0 0 1px rgba(226,184,74,.45),0 0 16px rgba(226,184,74,.2)}
.rv-cara{position:relative;z-index:1;padding:10px 12px 10px 14px;border-left:4px solid var(--rv-cor,#E2B84A);background:linear-gradient(var(--glass),var(--glass)),#0C1A38;border-radius:14px;transition:transform .18s ease}
.rv-card[data-rv-arrasta] .rv-cara{touch-action:pan-y;user-select:none;-webkit-user-select:none}
.rv-card.rv-pega .rv-cara{transition:none}
.rv-fundo{position:absolute;inset:0;opacity:0;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:14px;font-weight:700;color:var(--ink);background:rgba(255,255,255,.05)}
.rv-card.rv-pega .rv-fundo{opacity:1}
.rv-card.pra-dir .rv-fundo{background:rgba(226,184,74,.32)}
.rv-card.pra-esq .rv-fundo{background:rgba(127,211,255,.26)}
.rv-topo{display:flex;align-items:center;gap:7px;min-width:0}
.rv-ic{flex:none;font-size:15px}
.rv-tit{flex:1;min-width:0;font-size:15px;font-weight:700;line-height:1.3;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.rv-pc{flex:none;font-size:11.5px;font-weight:700;padding:2px 7px;border-radius:7px;background:rgba(255,255,255,.1);color:var(--ink);letter-spacing:.02em}
.rv-ha{flex:none;font-size:12px;color:var(--muted);white-space:nowrap}
.rv-linha{margin-top:4px;font-size:13.5px;color:var(--muted);line-height:1.35;overflow-wrap:anywhere}
.rv-quem{margin-top:3px;font-size:12.5px;font-weight:600;color:var(--muted)}
.rv-barra-l{display:flex;align-items:center;gap:8px;margin-top:7px}
.rv-barra{flex:1;height:7px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}
.rv-barra i{display:block;height:100%;border-radius:999px;background:var(--rv-cor,#E2B84A)}
.rv-pct{flex:none;font-size:12px;font-weight:700;color:var(--muted)}
.rv-acoes{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}
.rv-b{min-height:38px;padding:6px 12px;border-radius:999px;background:var(--glass-2);color:var(--ink);font-size:13.5px;font-weight:650;text-decoration:none;display:inline-flex;align-items:center}
.rv-b.so-icone{min-width:42px;justify-content:center;padding:6px 10px}
.rv-b-aprovar,.rv-b-priorizar,.rv-b-responder,.rv-ok{background:var(--gold);color:var(--navy)}
.rv-b:disabled{background:var(--glass-2);color:var(--faint);opacity:.75}
.rv-frases{display:flex;flex-direction:column;gap:6px;margin-top:8px}
.rv-frase{min-height:40px;padding:7px 11px;border-radius:12px;background:var(--glass-2);color:var(--ink);font-size:14px;font-weight:600;text-align:left}
.rv-frase.rec{background:rgba(226,184,74,.22);color:var(--gold-2,#F6D77E)}
.rv-sinal{margin-top:8px;font-size:12.5px;color:var(--muted);display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.rv-sinal b{font-weight:700}
.rv-sinal .rv-rot{font-weight:650;color:var(--ink)}
.rv-s-entregue b,.rv-s-visto b{color:#7FD3FF}
.rv-s-visto{color:#7FD3FF}
.rv-s-erro{color:#FF9B9B}
.rv-mini{margin-left:4px;padding:3px 9px;border-radius:999px;background:var(--glass-2);color:var(--gold-2,#F6D77E);font-size:12px;font-weight:700}
.rv-dec{display:flex;align-items:center;gap:8px;width:100%;min-height:52px;padding:9px 12px 9px 14px;border-left:4px solid var(--rv-cor);border-radius:14px;text-align:left;color:var(--ink)}
.rv-dec-t{flex:1;min-width:0;display:flex;flex-direction:column}
.rv-dec-t b{font-size:15px}
.rv-dec-t small{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rv-ir{flex:none;font-size:13px;font-weight:700;color:var(--gold-2,#F6D77E)}
.rv-vazio{padding:16px;border-radius:14px;border:1px dashed var(--stroke);color:var(--muted);font-size:14px;text-align:center}
.rv-dica{margin:12px 0 0;text-align:center;font-size:12.5px;color:var(--faint)}
.rv-rodape{margin:6px 0 0;text-align:center;font-size:12px;color:var(--faint)}
.rv-folha{position:sticky;bottom:0;z-index:3;margin-top:12px;padding:12px;border-radius:16px;background:rgba(10,18,36,.97);border:1px solid var(--stroke);box-shadow:0 -6px 24px rgba(0,0,0,.4)}
.rv-folha-t{display:flex;flex-direction:column;gap:2px;margin-bottom:8px}
.rv-folha-t small{font-size:12.5px;color:var(--muted)}
.rv-texto{display:block;width:100%;min-height:90px;padding:9px 11px;border:1px solid var(--stroke);border-radius:12px;background:var(--glass-2);color:var(--ink);font:inherit;font-size:16px;line-height:1.35;resize:vertical}
.rv-folha-b{display:flex;justify-content:flex-end;gap:8px;margin-top:9px}
.rv-resumo{display:flex;align-items:center;gap:8px;width:100%;min-height:46px;margin:8px 0 2px;padding:8px 12px;border-radius:12px;background:var(--glass-2);color:var(--ink);text-align:left}
.rv-resumo b{flex:none;font-size:14px}
.rv-resumo span:not(.rv-ir){flex:1;min-width:0;font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (prefers-reduced-motion:reduce){.rv-cara{transition:none}}
`;

const Revisoes = {VERSAO, AGENTE_MIN, AGENTE_REVISOES, DESFAZER_MS, TENTA_MS, TEXTO_MAX, TIPOS, ACOES, ACOES_DO_TIPO, FILTROS, ARRASTO, SINAL,
  juntar, contar, filtrar, acoesDoCard, arrastoDoCard, montarRegistro, pedidoDoRegistro, estadoDaAcao, linhaDoCard,
  ultimoDoCard, vistoDaAcao, decidirArrasto, acaoDoArrasto, limiarArrasto, htmlCard, htmlTela, htmlFolha, htmlLinha,
  htmlResumo, acaoDe, criarTela, haTexto, compararVersao, ms, CSS};
if (typeof module !== "undefined" && module.exports) module.exports = Revisoes;
else raiz.Revisoes = Revisoes;
})(typeof window !== "undefined" ? window : globalThis);
