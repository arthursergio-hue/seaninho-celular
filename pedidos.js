// Seaninho no celular: Meus pedidos (v24), o que você mandou à sessão central e o que ela respondeu, como a aba
// "☰ Meus pedidos" do Monitor geral (geral_pedidos.js do Pro): um cartão por pedido com o estado (⏳ esperando ·
// 🔄 em andamento · ✅ respondido · ⚠ não deu), o pedido, a hora, de onde veio e a resposta, com o "ver mais".
// Filtro Abertos / Todos. Só leitura. Sem tela (testado no Node: test_pedidos.cjs): a lista vem pronta no
// hoje.painel.meus_pedidos do PC da central (CONTRATO-v24 seção 4); aqui se escolhe o bloco, se conta e se monta o HTML.
(function (raiz) {
"use strict";

const ESTADOS = {
  esperando: {ic: "⏳", rot: "esperando", dica: "Na caixa: a sessão central ainda não leu"},
  andamento: {ic: "🔄", rot: "em andamento", dica: "A sessão central leu e está cuidando"},
  respondido: {ic: "✅", rot: "respondido", dica: "A sessão central respondeu"},
  erro: {ic: "⚠", rot: "não deu", dica: "A sessão central não conseguiu"},
};
const ABERTOS = ["esperando", "andamento"];
const TEXTO_CURTO = 140;   // o pedido no cartão fechado (até 240 letras chegam; o resto no "ver mais")
const RESP_CURTA = 160;    // a resposta no cartão fechado (até 400 chegam)
const RESUMO_N = 3;        // o bloco do Início: os abertos mais novos

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const umaLinha = (t, n) => { const s = String(t ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const doisDig = n => String(n).padStart(2, "0");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
function ms(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
}

// O "ver mais" de cada cartão: fica aberto entre um desenho e outro (a página redesenha a cada volta do banco).
const abertos = new Set();
function alternar(id) { const k = String(id); if (abertos.has(k)) abertos.delete(k); else abertos.add(k); return abertos.has(k); }
const aberto = id => abertos.has(String(id));

// ==== Os dados ========================================================================================================
// O bloco de um PC, limpo: {central, pc, gerado, aviso, itens: [{id, quando (ms), de, texto, estado, resposta}]}.
function normalizar(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.itens)) return null;
  const itens = d.itens.filter(p => p && typeof p === "object" && String(p.id || "").trim()).map(p => ({
    id: String(p.id).slice(0, 120), quando: ms(p.quando), de: umaLinha(p.de, 40),
    texto: String(p.texto ?? "").trim().slice(0, 240), estado: ESTADOS[p.estado] ? p.estado : "esperando",
    resposta: String(p.resposta ?? "").trim().slice(0, 400)}));
  itens.sort((a, b) => b.quando - a.quando);
  // o total da semana antes do corte dos 25 (o agente 0.9.0.14 manda; sem ele, o tamanho da lista)
  const semana = Math.max(itens.length, Number.isFinite(+d.total_semana) ? Math.floor(+d.total_semana) : 0);
  return {central: umaLinha(d.central, 40), pc: String(d.pc || ""), gerado: ms(d.gerado), aviso: umaLinha(d.aviso, 240), itens,
    total_semana: semana};
}
// Quantos pedidos a semana tem (a lista que chega pode ser só uma parte: os abertos e os mais novos, até 25).
const totalSemana = dados => { const n = normalizar(dados); return n ? n.total_semana : 0; };
// Só o PC da central publica; se os dois vierem (a troca da central), vale a lista mais nova. null: nenhum publicou.
function juntar(pcs) {
  let melhor = null;
  for (const p of Array.isArray(pcs) ? pcs : Object.values(pcs || {})) {
    const d = normalizar(p && p.hoje && p.hoje.painel && p.hoje.painel.meus_pedidos);
    if (!d) continue;
    if (!d.pc) d.pc = String(p.pc || "");
    if (!melhor || d.gerado > melhor.gerado) melhor = d;
  }
  return melhor;
}
// Os itens limpos, venha o bloco cru do banco ou o que o juntar já limpou (limpar duas vezes dá o mesmo).
const lista = dados => { const n = normalizar(dados); return n ? n.itens : []; };

// As contas: o total, os abertos (esperando + em andamento) e cada estado.
function contar(dados) {
  const c = {total: 0, abertos: 0, esperando: 0, andamento: 0, respondido: 0, erro: 0};
  for (const p of lista(dados)) {
    c.total++;
    const e = ESTADOS[p.estado] ? p.estado : "esperando";
    c[e]++;
    if (ABERTOS.includes(e)) c.abertos++;
  }
  return c;
}

// ==== A tela ==========================================================================================================
function inicioDoDia(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function horaDe(t) { const d = new Date(t); return `${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`; }
function diaDe(t) { const d = new Date(t); return `${doisDig(d.getDate())}/${doisDig(d.getMonth() + 1)}`; }
function grupos(itens, agora) {
  const hoje = inicioDoDia(agora), ontem = inicioDoDia(hoje - 1), out = [];
  for (const p of itens) {
    const dia = inicioDoDia(p.quando);
    const rotulo = dia >= hoje ? "Hoje" : dia === ontem ? "Ontem" : diaDe(p.quando);
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(p);
    else out.push({dia, rotulo, itens: [p]});
  }
  return out;
}
// O cartão tem mais do que mostra fechado? (o pedido longo ou de várias linhas, a resposta longa)
function temMais(p) {
  return p.texto.length > TEXTO_CURTO || /\n/.test(p.texto) || p.resposta.length > RESP_CURTA || /\n/.test(p.resposta);
}
function cartao(p, central) {
  const e = ESTADOS[p.estado] || ESTADOS.esperando, abre = aberto(p.id), mais = temMais(p);
  const texto = abre ? esc(p.texto) : esc(umaLinha(p.texto, TEXTO_CURTO));
  const resp = !p.resposta ? "" : `<div class="mp-resp${p.estado === "erro" ? " erro" : ""}"><span class="mp-r-de">${p.estado === "erro" ? "⚠" : "↳"} ${esc(central)}</span>`
    + `<div class="mp-r-t">${abre ? esc(p.resposta) : esc(umaLinha(p.resposta, RESP_CURTA))}</div></div>`;
  return `<article class="mp-card st-${esc(p.estado)}" data-mp-card="${esc(p.id)}" title="${esc(e.dica)}">
  <div class="mp-cab"><span class="mp-est"><span aria-hidden="true">${e.ic}</span> ${esc(e.rot)}</span><span class="mp-grow"></span>${p.de ? `<span class="mp-de">${esc(p.de)}</span>` : ""}<span class="mp-hora">${p.quando ? esc(horaDe(p.quando)) : ""}</span></div>
  <p class="mp-txt${abre ? " todo" : ""}">${texto || "<i>(sem texto)</i>"}</p>${resp}
  ${mais ? `<button type="button" class="mp-mais" data-mp-mais="${esc(p.id)}" aria-expanded="${abre}">${abre ? "ver menos ▴" : "ver mais ▾"}</button>` : ""}
</article>`;
}
function chip(valor, rotulo, n, atual) {
  const on = valor === atual;
  return `<button type="button" class="mp-chip${on ? " on" : ""}" data-mp-filtro="${valor}" aria-pressed="${on}">${esc(rotulo)} <b>${n}</b></button>`;
}
// O resumo do alto: "5 pedidos · ✅ 3 respondidos · 🔄 1 em andamento · ⏳ 1 esperando". Com o corte (mais de 25 na
// semana): "25 de 31 pedidos na semana · …" (corretor final de 12/11: antes dizia "25 pedidos na semana", o teto)
function contadorHtml(c, semana) {
  if (!c.total) return "";
  const partes = [c.respondido ? `✅ ${plural(c.respondido, "respondido", "respondidos")}` : "", c.andamento ? `🔄 ${c.andamento} em andamento` : "",
    c.esperando ? `⏳ ${c.esperando} esperando` : "", c.erro ? `⚠ ${c.erro} não deu` : ""].filter(Boolean);
  const qtd = semana > c.total ? `<b>${c.total}</b> de ${semana} pedidos` : `<b>${c.total}</b> ${c.total === 1 ? "pedido" : "pedidos"}`;
  return `<div class="mp-cont">${qtd} na semana${partes.length ? " · " + partes.join(" · ") : ""}</div>`;
}

// A lista (tela cheia). filtro: "abertos" (padrão) | "todos". op: {agora: ms}.
function htmlLista(dados, filtro, op) {
  const o = op || {}, agora = o.agora ?? Date.now(), f = filtro === "todos" ? "todos" : "abertos";
  if (!dados || !Array.isArray(dados.itens)) {
    return `<div class="mp-vazio"><b>A lista ainda não chegou.</b><p>Ela vem do PC da sessão central; aparece aqui quando ele estiver ligado.</p></div>`;
  }
  const todos = lista(dados), c = contar(dados), central = (dados.central || "Sessão central");
  const visiveis = f === "abertos" ? todos.filter(p => ABERTOS.includes(p.estado)) : todos;
  const topo = `<div class="mp-filtros" role="group" aria-label="Quais pedidos">${chip("abertos", "Abertos", c.abertos, f)}${chip("todos", "Todos", c.total, f)}</div>`;
  const aviso = dados.aviso ? `<div class="mp-aviso" role="status">ℹ ${esc(dados.aviso)}</div>` : "";
  if (!todos.length) {
    return `${topo}${aviso}<div class="mp-vazio"><b>Nenhum pedido nesta semana.</b><p>O que você manda à sessão central (${esc(central)}), pelo Monitor geral ou por aqui, aparece aqui com o estado e a resposta.</p></div>`;
  }
  if (!visiveis.length) {
    return `${topo}${aviso}<div class="mp-vazio"><b>Nenhum pedido esperando resposta 🎉</b><button type="button" class="mp-b" data-mp-filtro="todos">Ver todos</button></div>`;
  }
  const gs = grupos(visiveis, agora).map(g => `<section class="mp-dia" aria-label="${esc(g.rotulo)}"><h4 class="mp-dia-t">${esc(g.rotulo)} <span>${g.itens.length}</span></h4>
${g.itens.map(p => cartao(p, central)).join("")}</section>`).join("");
  return `${topo}${aviso}${contadorHtml(c, totalSemana(dados))}<div class="mp-lista">${gs}</div>`;
}

// O bloco "📝 Meus pedidos" do Início: os abertos mais novos (até 3) e o "ver tudo". "" sem pedido aberto.
function htmlResumo(dados, op) {
  const o = op || {}, agora = o.agora ?? Date.now(), c = contar(dados);
  if (!c.abertos) return "";
  const linhas = lista(dados).filter(p => ABERTOS.includes(p.estado)).slice(0, RESUMO_N).map(p => {
    const e = ESTADOS[p.estado];
    const quando = p.quando ? (p.quando >= inicioDoDia(agora) ? horaDe(p.quando) : `${diaDe(p.quando)} ${horaDe(p.quando)}`) : "";
    return `<button type="button" class="mp-res" data-mp-tudo><span class="mp-res-ic" aria-hidden="true">${e.ic}</span><span class="mp-res-t"><b>${esc(umaLinha(p.texto, 90) || "(sem texto)")}</b><small>${esc([e.rot, quando].filter(Boolean).join(" · "))}</small></span></button>`;
  }).join("");
  return `<section class="bloco mp-bloco"><h3>📝 Meus pedidos <button type="button" class="mp-ir" data-mp-tudo>${esc(plural(c.abertos, "aberto", "abertos"))} · ver tudo ›</button></h3>${linhas}</section>`;
}

// O que um toque pede: {acao: "mais", id} (o ver mais/menos: a página chama alternar(id) e redesenha), {acao:
// "filtro", valor} ou {acao: "tudo"} (abrir a tela cheia). null fora disso.
function acaoDe(el) {
  const n = el && el.closest ? el.closest("[data-mp-mais],[data-mp-filtro],[data-mp-tudo]") : null;
  if (!n || !n.dataset) return null;
  if (n.dataset.mpMais !== undefined) return {acao: "mais", id: n.dataset.mpMais};
  if (n.dataset.mpFiltro !== undefined) return {acao: "filtro", valor: n.dataset.mpFiltro};
  if (n.dataset.mpTudo !== undefined) return {acao: "tudo"};
  return null;
}

const CSS = `
.mp-filtros{display:flex;gap:6px;margin:0 0 10px}
.mp-chip{flex:1;min-height:44px;padding:0 12px;border-radius:999px;background:var(--glass);border:1px solid var(--stroke);color:var(--muted);font-size:15px;font-weight:600}
.mp-chip b{font-weight:500;opacity:.8;font-variant-numeric:tabular-nums}
.mp-chip.on{background:rgba(226,184,74,.16);border-color:rgba(226,184,74,.5);color:var(--gold-2,#F6D77E)}
.mp-cont{font-size:13px;color:var(--muted);margin:0 2px 4px}
.mp-cont b{font-size:16px;color:var(--ink);font-variant-numeric:tabular-nums}
.mp-aviso{margin:0 0 10px;padding:9px 12px;border-radius:12px;background:var(--glass);border:1px solid var(--stroke);font-size:13.5px;color:var(--muted)}
.mp-dia-t{margin:14px 2px 8px;font-size:12px;font-weight:650;letter-spacing:.6px;text-transform:uppercase;color:var(--muted)}
.mp-dia-t span{font-weight:400;margin-left:4px}
.mp-card{padding:12px 14px;margin:0 0 10px;border-radius:16px;background:var(--glass);border:1px solid var(--stroke);border-left:4px solid var(--stroke);min-width:0}
.mp-card.st-esperando{border-left-color:var(--gold)}
.mp-card.st-andamento{border-left-color:#7FD3FF}
.mp-card.st-respondido{border-left-color:#48D680}
.mp-card.st-erro{border-left-color:#FF5A4F}
.mp-cab{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);min-width:0}
.mp-est{font-weight:650;white-space:nowrap}
.st-esperando .mp-est{color:var(--gold-2,#F6D77E)}
.st-andamento .mp-est{color:#A5DBFF}
.st-respondido .mp-est{color:#86E8AE}
.st-erro .mp-est{color:#FFA49C}
.mp-grow{flex:1}
.mp-de{padding:1px 7px;border-radius:6px;background:var(--glass-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}
.mp-hora{white-space:nowrap;font-variant-numeric:tabular-nums}
.mp-txt{margin:6px 0 0;font-size:15px;line-height:1.38;color:var(--ink);overflow-wrap:anywhere}
.mp-txt.todo{white-space:pre-wrap}
.mp-resp{margin-top:8px;padding:8px 11px;border-radius:12px;background:rgba(72,214,128,.07);border:1px solid rgba(72,214,128,.22);font-size:14px;color:var(--ink)}
.mp-resp.erro{background:rgba(255,90,79,.09);border-color:rgba(255,90,79,.3)}
.mp-r-de{display:block;font-size:11.5px;font-weight:700;letter-spacing:.2px;color:#7BEAA3;margin-bottom:2px}
.mp-resp.erro .mp-r-de{color:#FFA49C}
.mp-r-t{white-space:pre-wrap;overflow-wrap:anywhere}
.mp-mais{display:block;min-height:44px;padding:0 2px;margin-top:2px;color:var(--gold-2,#F6D77E);font-size:14px;font-weight:650}
.mp-vazio{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:16px;border-radius:16px;background:var(--glass);border:1px dashed var(--stroke);color:var(--muted);font-size:14px}
.mp-vazio b{color:var(--ink);font-size:15.5px}
.mp-vazio p{margin:0}
.mp-b{min-height:44px;padding:0 16px;border-radius:12px;background:var(--glass-2);border:1px solid var(--stroke);color:var(--ink);font-size:15px;font-weight:650}
.mp-res{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:8px 0;border-top:1px solid var(--stroke);text-align:left}
.mp-res:first-of-type{border-top:0;padding-top:2px}
.mp-res-ic{flex:none;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;background:var(--glass-2);font-size:15px}
.mp-res-t{flex:1;min-width:0;display:flex;flex-direction:column}
.mp-res-t b{font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-res-t small{font-size:12.5px;color:var(--muted)}
.mp-ir{margin-left:auto;min-height:44px;padding:0 4px;font-size:13.5px;font-weight:600;color:var(--gold-2,#F6D77E);text-transform:none;letter-spacing:0}
`;

const MeusPedidos = {ESTADOS, normalizar, juntar, contar, htmlLista, htmlResumo, alternar, aberto, acaoDe, temMais, CSS};
if (typeof module !== "undefined" && module.exports) module.exports = MeusPedidos;
else raiz.MeusPedidos = MeusPedidos;
})(typeof window !== "undefined" ? window : globalThis);
