// Seaninho no celular: o Para você no card comum (13/11, entrega 1 do PLANO-MONITOR-NO-CELULAR: "quero todas as funções
// do monitor aqui"). Cada item vira o card do web/cards.js: a faixa ouro (espera você), o ícone de onde veio (💬 uma
// sessão, 🎼 o maestro, 💬 o Slack, 🔧 a ação sua com comando), o título (o do quadro visual; sem ele, o tipo do item),
// o chip do PC e, embaixo dos botões, a linha da ação da resposta (🕓 enviado · ✓ chegou · ✓✓ visto) com a frase de
// sempre. O resto (o texto, o "ver mais", as frases prontas, a caixa do comando, o rascunho do Slack), os data-pv-* e o
// que cada toque faz são os de antes: a página (index.html) calcula o estado e passa pronto; aqui só se monta o HTML
// (testado no Node: test_paravoce.cjs). Sem este arquivo ou sem o cards.js (a casca velha), a página desenha como era.
(function (raiz) {
"use strict";

const C = () => (typeof module !== "undefined" && module.exports ? require("./cards.js") : raiz.Cards);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const curto = (t, n) => (t = String(t || "")).length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
const linkSeguro = u => /^https:\/\/[^\s"'<>]+$/.test(String(u || "")) ? String(u) : "";

// A fase da resposta a um item na linha da ação. r: o registro do envio na página (o pvRespondidos: {pedido, nota});
// p: a linha do cel_pedir dele. "enviado" (a caminho da sessão), "chegou" (a sessão recebeu; o maestro sendo avisado,
// ou o agente dele é antigo e não é avisado), "visto" (o maestro anotou), "erro" (não entrou).
function faseResposta(r, p) {
  if (!r) return "";
  if (p && ["erro", "cancelado"].includes(p.estado)) return "erro";
  if (!r.nota && (!p || p.estado !== "entregue")) return "enviado";
  return r.nota && r.nota !== "antigo" ? "visto" : "chegou";
}
// A do envio no Slack (o estadoSlack da página): enviando → enviado, ok → chegou (a mensagem está no Slack), erro.
const FASE_SLACK = {enviando: "enviado", ok: "chegou", erro: "erro"};

// O tipo do item (o ícone e o título quando o quadro não deu um): a ação sua com comando, a pergunta de uma sessão, o
// pedido do maestro. alvo: a sessão de quem perguntou (o pvAlvo da página) ou null.
function tipoDe(it, alvo, temComando, nomeMaestro) {
  if (temComando) return {icone: "🔧", rotulo: "Ação sua"};
  if (alvo) return {icone: "💬", rotulo: "Uma sessão espera você"};
  return {icone: "🎼", rotulo: `Do ${nomeMaestro || "maestro"}`};
}

// O item de uma sessão ou do maestro. c: {alvo, maestro (a sessão do maestro está aberta: dá para responder), notas
// (o ✓ Resolvido avisa o maestro), nomeMaestro ("Hokage"), maestroMeio (o nome no meio da frase: "maestro" ou
// "Hokage"), pcMaestro, pcCurto(pc) (o nomeCurtoPc da página), frases (o HTML das frases prontas), rodar (o HTML da
// caixa do comando), resposta: {r, p, html: a frase de sempre (estadoRespostaPv)} ou null}.
function item(it, c) {
  const o = c || {}, a = o.alvo || null, k = esc(it.chave), curtoPc = o.pcCurto || (x => String(x || ""));
  const nomeM = o.nomeMaestro || "Maestro", meio = o.maestroMeio || "maestro";
  const botao = a && a.achou
    ? `<button class="card-b ouro" data-pv="${k}" ${a.ligado ? "" : "disabled"} aria-label="Responder à sessão ${esc(a.nome)} sobre: ${esc(it.texto)}">${a.ligado ? "↩ Responder a " + esc(curto(a.nome, 24)) : esc(curtoPc(a.pc)) + " desligado"}</button>`
    : `<button class="card-b ouro" data-pv="${k}" ${o.maestro ? "" : "disabled"} aria-label="Responder ao ${esc(nomeM)} sobre: ${esc(it.texto)}">${o.maestro ? "↩ Responder ao " + esc(nomeM) : esc(nomeM) + " fechado"}</button>`;
  const ok = o.notas ? `<button class="card-b pv-ok" data-pv-ok="${k}" aria-label="Marcar como resolvido: ${esc(it.texto)}">✓ Resolvido</button>` : "";
  const link = linkSeguro(it.link) ? `<a class="card-b" href="${esc(linkSeguro(it.link))}" target="_blank" rel="noopener">Abrir o link</a>` : "";
  const de = a ? `<div class="pv-de">💬 ${esc(a.nome)} · ${esc(curtoPc(a.pc))}${a.achou ? "" : ` · <span class="alerta">a sessão não está aberta: a resposta vai ao ${esc(meio)}</span>`}</div>` : "";
  const texto = `${de}<div class="pv-t">${esc(it.texto)}</div>`;
  const t = tipoDe(it, a, !!o.rodar, nomeM), res = o.resposta;
  return C().card({cor: "ouro", icone: t.icone, titulo: it.titulo || t.rotulo, tituloInteiro: it.titulo || `${t.rotulo}: ${it.texto || ""}`,
    pc: a ? a.pc : o.pcMaestro || "", tag: "div", classe: `pv-item pv-card${it.alta ? " alta" : ""}`, attrs: {"data-pv-item": it.chave},
    // com o título do quadro, o texto inteiro fica no "ver mais" (como antes); sem ele, à vista
    corpo: (it.titulo ? `<details class="pv-mais-t"><summary>ver mais</summary>${texto}</details>` : texto) + (o.frases || "") + (o.rodar || "")
      + `<div class="card-acoes">${botao}${ok}${link}</div>`,
    linha: res && res.r ? {fase: faseResposta(res.r, res.p), html: String(res.html || ""), classe: "pv-feito"} : null});
}

// O item do Slack (DM ou menção com o rascunho pronto). c: {alvo (a sessão de onde veio, se veio de uma), estado (o
// estadoSlack: {fase: "" | "enviando" | "ok" | "erro", link, erro}), hora (HH:MM do envio), rascunho (o texto da caixa),
// bloqueio (por que não dá para enviar agora: "" pode), pcMaestro, pcCurto}.
function slack(it, c) {
  const o = c || {}, sl = it.slack || {}, a = o.alvo || null, st = o.estado || {fase: ""}, k = esc(it.chave);
  const caixa = st.fase === "ok" ? ""
    : `<label class="pv-rot" for="rasc-${k}">Sua resposta${sl.thread_ts ? " (na thread)" : ""}</label>
       <textarea id="rasc-${k}" class="pv-rasc" data-pv-rasc="${k}" rows="3" placeholder="Escreva a resposta" ${st.fase === "enviando" ? "disabled" : ""}>${esc(o.rascunho || "")}</textarea>`;
  const botoes = st.fase === "ok" ? "" : `<button class="card-b ouro" data-pv-slack="${k}" ${o.bloqueio || st.fase === "enviando" ? "disabled" : ""}>${esc(o.bloqueio || (st.fase === "erro" ? "Tentar de novo" : "Enviar no Slack"))}</button>`
    + `<button class="card-b pv-ok" data-pv-ja="${k}" aria-label="Já respondi no Slack: ${esc(it.texto)}">Já respondi</button>`;
  const resp = a && a.achou ? `<button class="card-b pv-sec" data-pv="${k}" ${a.ligado ? "" : "disabled"} aria-label="Responder à sessão ${esc(a.nome)} sobre: ${esc(it.texto)}">↩ Responder a ${esc(curto(a.nome, 22))}</button>` : "";
  const link = linkSeguro(it.link) ? `<a class="card-b" href="${esc(linkSeguro(it.link))}" target="_blank" rel="noopener">Abrir no Slack</a>` : "";
  // com o título do quadro, a mensagem inteira fica no "ver a mensagem"; sem ele, à vista (como antes)
  const msg = !sl.texto ? "" : it.titulo
    ? `<details class="pv-mais-t"><summary>ver a mensagem</summary><div class="pv-msg">${esc(sl.texto)}</div></details>`
    : `<div class="pv-msg">${esc(sl.texto)}</div>`;
  // a linha da ação: as frases de sempre (a rodinha do "Enviando", o link da mensagem, o aviso em vermelho)
  const linha = st.fase === "enviando" ? `<span class="spin"></span>Enviando no Slack…`
    : st.fase === "ok" ? `✓ Enviado no Slack às ${esc(o.hora || "")}${linkSeguro(st.link) ? ` · <a href="${esc(linkSeguro(st.link))}" target="_blank" rel="noopener">Ver a mensagem</a>` : ""}`
    : st.fase === "erro" ? `<span class="alerta">⚠ Não saiu: ${esc(st.erro || "")}</span>` : "";
  return C().card({cor: "ouro", icone: "💬", titulo: it.titulo || "Mensagem no Slack", tituloInteiro: it.titulo || `Mensagem no Slack: ${it.texto || ""}`,
    pc: a ? a.pc : o.pcMaestro || "", tag: "div", classe: `pv-item pv-card pv-slack${it.alta ? " alta" : ""}`, attrs: {"data-pv-item": it.chave},
    corpo: `<div class="pv-de">💬 Slack${sl.de ? " · " + esc(sl.de) : ""}</div>${it.titulo ? "" : `<div class="pv-t">${esc(it.texto)}</div>`}${msg}${caixa}`
      + `${botoes || resp || link ? `<div class="card-acoes">${botoes}${resp}${link}</div>` : ""}`,
    linha: FASE_SLACK[st.fase] ? {fase: FASE_SLACK[st.fase], html: linha, classe: "pv-feito"} : null});
}

const ParaVoce = {item, slack, faseResposta, FASE_SLACK, tipoDe};
if (typeof module !== "undefined" && module.exports) module.exports = ParaVoce;
else raiz.ParaVoce = ParaVoce;
})(typeof window !== "undefined" ? window : globalThis);
