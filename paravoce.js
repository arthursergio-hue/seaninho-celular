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
  // pro-105: a frase que foi ao próprio maestro (direto): não há nota; chegou quando entrou na sessão dele
  if (r.direto) return r.chegou || (p && p.estado === "entregue") ? "chegou" : "enviado";
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
// caixa do comando), resposta: {r, p, html: a frase de sempre (estadoRespostaPv)} ou null, pcItem (14/11: o PC do item,
// o Rodar.pcDoItem: o chip mostra o mesmo PC para onde vai o ⚡)}.
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
    pc: o.pcItem || (a ? a.pc : o.pcMaestro || ""), tag: "div", classe: `pv-item pv-card${it.alta ? " alta" : ""}`, attrs: {"data-pv-item": it.chave},
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

// ==== pro-105: o Para você premium ======================================================================================
// O Arthur, 17/11, 05h45, pelo celular: "Esse espaço aqui está tudo muito grande muito poluído, ajuste para mim. Quero
// tudo premium." O roteiro (DESIGN-pv-premium.md) é comum ao celular e ao Monitor geral: a faixa fina de chips, os
// grupos recolhíveis com a contagem (PvLista.agrupar, web/pvlista.js), a linha compacta (o título numa linha, as
// pílulas das respostas e os ícones ↩ ✓ ↗), a folha do detalhe que sobe de baixo, os gestos (direita = a resposta
// principal, esquerda = depois) e os estados (vazio, carregando, erro, "Respondidos agora"). Aqui só o HTML, o CSS e
// as contas sem tela (test_paravoce.cjs); o estado, os toques e o envio ficam na página (index.html), pelos caminhos de
// sempre (os data-pv-*, o ⚡ do rodar.js, a nota ao maestro).

const TIPOS = {acao: {icone: "🔧", rotulo: "Ação sua"}, decisao: {icone: "❓", rotulo: "Decisão"},
  slack: {icone: "💬", rotulo: "Mensagens"}, info: {icone: "✓", rotulo: "Informação"}, feitos: {icone: "✓", rotulo: "Respondidos agora"}};
const umaLinha = (t, n) => { const s = String(t ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };

// ---- a trava: o mesmo critério do pvTrava do Monitor (scripto/assets/geral_chat.js, as mesmas palavras; o
// test_paravoce.cjs confere com os casos de lá e com o texto da regra, quando a cópia do Pro está à mão). A frase que
// autoriza o que só o Arthur decide (push, PR, merge, publicar, liberar versão, mandar ou responder mensagem, Slack,
// e-mail, postar, apagar, mover, desligar…), ou o item que fala disso, nunca sai num toque nem num gesto: abre a folha
// com o "✓ Confirmar". "Não…" nunca trava.
const L = "\\p{L}\\p{N}_", W = `[${L}]*`;
const RX_AUTORIZA = new RegExp(`(?<![${L}])(?:push${W}|prs?|pull\\s+requests?|merge${W}|rebase${W}` +
  `|junt(?:a|ar|e|em|amos|ando|ou|ei|aria|arei)` +
  `|sob(?:e|em)|sub(?:a|am|ir|o|imos|indo|iu)|publi${W}|deploy${W}|releases?` +
  `|liber(?:a|ar|e|em|o|amos|ando|ou|ei|aria|arei)|solt(?:a|ar|e|em|amos|ando|ou|ei|aria|arei)` +
  `|lan[çc](?:a|ar|e|em|amos|ando|ou|ei|aria|arei)` +
  `|mand${W}|envi${W}|encaminh${W}|compartilh${W}` +
  `|respond(?:a|am|e|em|er|o|emos|endo|eu|i|eria|erei)|reply${W}` +
  `|avis(?:a|ar|e|em|amos|ando|ou|ei|aria|arei)` +
  `|notific(?:a|ar|ando|ou|aria)|notifiqu${W}|notify|coment${W}` +
  `|slack|whats${W}|e-?mails?|telegram|teams` +
  `|post(?:a|as|e|em|ar|amos|ando|ou|ado|ada|ados|adas|aria)` +
  `|apag${W}|delet${W}|exclu${W}|remov${W}|rm` +
  `|sobrescrev${W}|overwrit${W}|renome${W}|rename${W}` +
  `|mov(?:a|am|e|em|er|o|emos|endo|eu|i|eria|erei)` +
  `|deslig${W}|reinici${W}|hibern${W}|suspend${W}|shutdown|restart${W}|reboot${W}` +
  `|reset${W}|force${W}|for[çc](?:a|ar|e|em|ando|ou)` +
  `|send|publish${W}|delete|remove)(?![${L}])`, "iu");
const autoriza = t => RX_AUTORIZA.test(String(t || ""));
const negativa = t => /^\s*n[ãa]o(?![\p{L}])/iu.test(String(t || ""));
// O texto sem os blocos de código e sem as citações (> …). manter: o código na linha fica (sem as crases); senão sai.
function semCodigo(texto, manter) {
  const out = [];
  let cerca = "";
  for (const linha of String(texto || "").replace(/\r\n?/g, "\n").split("\n")) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(linha);
    if (cerca) {
      if (f && f[1][0] === cerca[0] && f[1].length >= cerca.length && !linha.slice(f[0].length).trim()) cerca = "";
      out.push("");
      continue;
    }
    if (f) { cerca = f[1]; out.push(""); continue; }
    if (/^\s{0,3}>/.test(linha)) { out.push(""); continue; }
    out.push(manter ? linha.replace(/`([^`\n]*)`/g, "$1") : linha.replace(/`[^`\n]*`/g, " "));
  }
  return out.join("\n");
}
// A frase que só adia ("depois", "mais tarde", "agora não"…) nunca trava: adiar não autoriza nada (a revisão de 17/11:
// o "depois" saía travado em 9 de 11 itens, e o deslize para a esquerda abria a folha em vez de adiar). A MESMA
// expressão do PvLista.soAdia (pvlista.js) e do Monitor (geral_chat.js), copiada aqui para a trava funcionar sem o
// pvlista; "depois manda" ou "depois do Delta" dizem mais que adiar e seguem a regra de sempre.
const soAdia = t => /^\s*(?:depois|mais tarde|deixa para depois|vejo depois|vejo no monitor depois|agora n[ãa]o)\s*[.!]?\s*$/iu.test(String(t || ""));
// O item do celular traz o texto cortado em 240 (o "texto") e, quando cortou, o inteiro (o "inteiro", painel.py): a
// trava olha o inteiro, como o Monitor, que tem o quadro todo.
// 20/11 (a junção, o crítico): quando o resto do texto não chegou, trava também. O agente 0.9.0.31 ou de antes manda só o "texto"
// cortado em 240 (o curto do painel.py termina em "…"), e o inteiro acima de 1.200 letras termina em "… (texto inteiro
// no Monitor)": o push ou o PR do fim do item ficaria de fora e a frase sairia num toque. Só o corte exato do
// painel.curto conta (239 ou 240 letras terminando em "…"): o texto mais curto que termina em "…" não foi cortado.
function cortado(item) {
  if (!item) return false;
  const t = String(item.inteiro || item.texto || "").trimEnd();
  return /…\s*\(texto inteiro no Monitor\)$/.test(t) || (!item.inteiro && t.length >= 239 && t.endsWith("…"));
}
function trava(item, frase) {
  if (negativa(frase) || soAdia(frase)) return false;
  return autoriza(frase) || cortado(item) || autoriza(semCodigo(item && (item.inteiro || item.texto), true));
}

// ---- o gesto: direita = a resposta principal, esquerda = depois; passou de 35% da largura, soltar faz ---------------
const LIMIAR = 0.35;
// Qual movimento é: "h" (claramente de lado: o deslize começa), "v" (a rolagem tem a vez) ou "" (ainda não se sabe).
function direcaoGesto(dx, dy) {
  const ax = Math.abs(Number(dx) || 0), ay = Math.abs(Number(dy) || 0);
  if (ay >= 10 && ay >= ax) return "v";
  if (ax >= 12 && ax > ay * 1.5) return "h";
  return "";
}
// Onde a linha fica com o dedo em dx: {lado: "dir" | "esq" | "", pronto (passou do limite), x (com resistência depois
// do limite, como o iOS), limite}.
function gesto(dx, largura) {
  const w = Math.max(1, Number(largura) || 1), d = Number(dx) || 0, lim = w * LIMIAR, a = Math.abs(d);
  const x = a <= lim ? a : lim + (a - lim) * 0.4;
  return {lado: d > 0 ? "dir" : d < 0 ? "esq" : "", pronto: a >= lim, x: Math.sign(d) * Math.min(x, w * 0.85), limite: lim};
}

// ---- a faixa de chips (os contadores de cima e os chips do quadro) ---------------------------------------------------
// As regras são as do módulo comum (pvlista.js, iguais no Monitor): os contadores sem os de 0 (o "você" fica), a palavra
// sempre no singular, e os chips do quadro que não repetem um contador nem só dizem a hora da volta, até 3.
const PL = () => (typeof module !== "undefined" && module.exports ? require("./pvlista.js") : raiz.PvLista);
const chipFica = c => PL().chipFica(c);
function faixa(contador, chips) {
  const c = contador && typeof contador === "object" ? contador : null;
  const cs = PL().contadoresDaFaixa(c);
  const conts = cs.map(x => `<span class="pv-ch c-${x.chave}"><i aria-hidden="true"></i><b>${x.n}</b> ${x.palavra}</span>`).join("");
  const extras = (Array.isArray(chips) ? chips : []).filter(PL().chipFica).slice(0, 3)
    .map(x => `<span class="pv-ch">${esc(String(x.icone || "").slice(0, 4))} ${esc(umaLinha(x.texto, 40))}</span>`).join("");
  if (!conts && !extras) return "";
  const aria = cs.length ? cs.map(x => x.chave === "voce" ? `${x.n} esperam você` : `${x.n} ${x.palavra}`).join(", ") : "Resumo do maestro";
  return `<div class="pv-faixa" role="group" aria-label="${esc(aria)}">${conts}${extras}</div>`;
}

// ---- a linha ------------------------------------------------------------------------------------------------------
// Uma pílula: {rotulo, principal (cheia no acento), trava (abre a folha com o "✓ Confirmar"; sem desenho próprio: a
// revisão de 17/11 tirou a borda tracejada, que marcava quase toda linha; ficam o aria-label e o title), mais (o "+N"
// discreto, que abre o detalhe), attrs (os data-* de quem usa: data-pv-frase + data-n, data-rd-rodar + data-rd-alvo,
// data-pv-abrir…), aria, desligado}. O desenho tem 30 px; o botão tem 44 de altura (as margens negativas devolvem o espaço).
function pilula(p) {
  if (!p || !String(p.rotulo || "").trim()) return "";
  const cls = ["pv-pil", p.principal ? "principal" : "", p.trava ? "trava" : "", p.mais ? "mais" : ""].filter(Boolean).join(" ");
  const aria = p.aria || (p.trava ? `${p.rotulo} (pede confirmação)` : undefined);
  return `<button type="button" class="${cls}"${C().attrs({...(p.attrs || {}), "aria-label": aria, title: p.trava ? "Pede confirmação: abre o detalhe" : undefined})}`
    + `${p.desligado ? " disabled" : ""}><span>${esc(umaLinha(p.rotulo, 80))}</span></button>`;
}
// Um ícone da direita (32 px de desenho, 44 de toque): {icone, attrs, aria, desligado}.
function icone(b) {
  if (!b) return "";
  return `<button type="button" class="pv-icb"${C().attrs({...(b.attrs || {}), "aria-label": b.aria || undefined, title: b.aria || undefined})}`
    + `${b.desligado ? " disabled" : ""}><span aria-hidden="true">${esc(b.icone)}</span></button>`;
}
// O ícone do tipo: o SVG monocromático do módulo comum (o emoji colorido brigava com o acento único); "feitos" usa o ✓.
const iconeTipo = tipo => PL().iconeDoTipo(tipo === "feitos" ? "info" : tipo);
// c: {chave, tipo (o do PvLista), titulo, sub, pc (o nome inteiro: o chip mostra o curto; a página só manda quando o
// item é de outro PC que não o do maestro, PvLista.mostraPc), alta, pilulas, link (https),
// responder ({icone, attrs, aria, desligado} | null), resolver (o ✓ Resolvido: o agente do maestro leva a nota), linha
// (a linha da ação do card comum: {fase, html|texto}), feito (no grupo "Respondidos agora": sem pílulas), velha (a lista
// é antiga: o PC do maestro desligado ou sem rede), deslize ({dir, esq}: o rótulo do fundo de cada lado; sem ele, a
// linha não desliza)}.
function linha(c) {
  const o = c || {}, k = esc(o.chave), tipo = TIPOS[o.tipo] ? o.tipo : "info", t = TIPOS[tipo];
  const pc = o.pc ? C().chipCurto(o.pc) : "", link = linkSeguro(o.link);
  const fundo = o.deslize && !o.feito ? `<div class="pv-fundo-d" aria-hidden="true"><span>${esc(umaLinha(o.deslize.dir, 40))}</span></div>`
    + `<div class="pv-fundo-e" aria-hidden="true"><span>${esc(umaLinha(o.deslize.esq, 40))}</span></div>` : "";
  const pils = o.feito ? "" : (o.pilulas || []).map(pilula).join("");
  const icos = (link ? `<a class="pv-icb" href="${esc(link)}" target="_blank" rel="noopener" aria-label="Abrir o link" title="Abrir o link"><span aria-hidden="true">↗</span></a>` : "")
    + (o.feito ? "" : icone(o.responder) + (o.resolver ? icone({icone: "✓", attrs: {"data-pv-ok": o.chave}, aria: "Marcar como resolvido"}) : ""));
  const acoes = pils || icos ? `<div class="pv-acoes-l">${pils ? `<div class="pv-pils">${pils}</div>` : ""}${icos ? `<div class="pv-icos">${icos}</div>` : ""}</div>` : "";
  const titulo = umaLinha(o.titulo, 200), sub = umaLinha(o.sub, 200);
  const aria = `Abrir: ${titulo}${sub ? ". " + sub : ""}${pc ? ` (${pc})` : ""}`;
  return `<div class="pv-item pv-linha t-${tipo}${o.alta ? " alta" : ""}${o.feito ? " feito" : ""}${o.velha ? " velha" : ""}" data-pv-item="${k}" data-pv-tipo="${tipo}" role="listitem">${fundo}`
    + `<div class="pv-frente"><span class="pv-ic" aria-hidden="true">${iconeTipo(tipo)}${o.alta ? `<i class="pv-ponto"></i>` : ""}</span><div class="pv-corpo">`
    + `<button type="button" class="pv-abrir" data-pv-abrir="${k}" aria-label="${esc(aria)}"><span class="pv-l1"><span class="pv-tit">${esc(titulo)}</span>`
    + `${pc ? `<span class="pv-pc" title="${esc(o.pc)}">${esc(pc)}</span>` : ""}</span>${sub ? `<span class="pv-sub">${esc(sub)}</span>` : ""}</button>`
    + `${acoes}${C().linha(o.linha)}</div></div></div>`;
}

// ---- o grupo: {tipo, icone, rotulo, n, recolhido, linhas (o HTML de cada linha), mais (quantas o "Mostrar mais" traz)}
function grupo(g) {
  const o = g || {}, tipo = String(o.tipo || "info"), t = TIPOS[tipo] || TIPOS.info;
  const rot = o.rotulo || t.rotulo, n = Number.isFinite(o.n) ? o.n : (o.linhas || []).length;
  const cab = `<button type="button" class="pv-gcab" data-pv-recolher="${esc(tipo)}" aria-expanded="${o.recolhido ? "false" : "true"}"`
    + ` aria-label="${esc(`${rot}, ${n} ${n === 1 ? "item" : "itens"}: ${o.recolhido ? "abrir" : "recolher"}`)}">`
    + `<span class="pv-gt"><span class="pv-gi" aria-hidden="true">${iconeTipo(tipo)}</span> ${esc(rot)} · ${n}</span><span class="pv-gseta" aria-hidden="true"></span></button>`;
  const mais = !o.recolhido && o.mais > 0 ? `<button type="button" class="pv-mostrar" data-pv-todos="${esc(tipo)}">Mostrar mais ${o.mais}</button>` : "";
  const corpo = o.recolhido ? "" : `<div class="pv-lista${tipo === "feitos" ? " feitos" : ""}" role="list" aria-label="${esc(rot)}">${(o.linhas || []).join("")}</div>${mais}`;
  return `<div class="pv-grupo g-${esc(tipo)}${o.recolhido ? " recolhido" : ""}" data-pv-grupo="${esc(tipo)}">${cab}${corpo}</div>`;
}

// ---- os estados ---------------------------------------------------------------------------------------------------
const esqueleto = () => `<div class="pv-esq" role="status" aria-label="Carregando o Para você">${[[72, 44], [58, 36], [66, 50]].map(([a, b]) =>
  `<div class="pv-esq-l"><i class="pv-esq-c"></i><span><i style="width:${a}%"></i><i style="width:${b}%"></i></span></div>`).join("")}</div>`;
// hora: a da última volta do maestro ("05:48")
const vazio = hora => `<div class="pv-vazio" role="status"><span class="pv-vazio-c" aria-hidden="true">✓</span><b>Nada esperando você ✓</b>`
  + `${hora ? `<small>atualizado às ${esc(hora)}</small>` : ""}</div>`;
// O aviso de cima: {texto (o motivo em palavras), tentar (o "Tentar de novo", que atualiza agora)}.
const aviso = a => !a || !a.texto ? "" : `<div class="pv-aviso" role="alert"><span>⚠ ${esc(a.texto)}</span>`
  + `${a.tentar ? `<button type="button" class="pv-tentar" data-atualizar>Tentar de novo</button>` : ""}</div>`;

// ---- o texto inteiro da folha: as quebras de linha, os links https clicáveis, o código da linha e os blocos de código
// numa caixa com Copiar. sem: o comando que a caixa do ⚡ já mostra (o bloco igual a ele não sai duas vezes).
const RX_LINK = /https:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<>"'`)\]])+/g;
function prosa(t) {
  return esc(t).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(RX_LINK, u => { const l = u.replace(/[.,;:!?…]+$/u, ""); return `<a href="${l}" target="_blank" rel="noopener">${l}</a>${u.slice(l.length)}`; });
}
const caixaCod = (cod, lang) => `<div class="pv-cod"><div class="pv-cod-bar"><span>${esc(lang || "código")}</span>`
  + `<button type="button" class="pv-copiar" data-pv-copiar aria-label="Copiar o código">Copiar</button></div><pre class="pv-pre"><code>${esc(cod)}</code></pre></div>`;
function textoHtml(texto, op) {
  const sem = String((op && op.sem) || "").trim(), out = [];
  let cerca = "", lang = "", cod = [], txt = [];
  const fechaTxt = () => { const t = txt.join("\n").replace(/^\n+|\s+$/g, ""); if (t) out.push(`<p class="pv-p">${prosa(t)}</p>`); txt = []; };
  const fechaCod = () => { const c = cod.join("\n").replace(/\s+$/, ""); if (c.trim() && c.trim() !== sem) out.push(caixaCod(c, lang)); cod = []; };
  for (const l of String(texto ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const f = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(l), resto = f ? f[2].trim() : "";
    if (cerca) {
      if (f && f[1][0] === cerca[0] && f[1].length >= cerca.length && !resto) { fechaCod(); cerca = ""; }
      else cod.push(l);
      continue;
    }
    if (f) {   // a etiqueta (```powershell) ou, no texto achatado, o próprio comando na linha da cerca
      fechaTxt(); cerca = f[1];
      if (/^[\w+.-]*$/.test(resto)) lang = resto.toLowerCase(); else { lang = ""; cod.push(resto); }
      continue;
    }
    txt.push(l);
  }
  if (cerca) fechaCod(); else fechaTxt();
  return out.join("");
}

// ---- a folha do detalhe -------------------------------------------------------------------------------------------
// c: {chave, tipo, titulo (o inteiro), de ({nome, pc, aviso}), texto (o inteiro), sem (o comando da caixa do ⚡), link,
// rodar (o HTML da caixa do comando), frases ([{rotulo, n, principal, trava}]), conf (o n da frase travada esperando o
// "✓ Confirmar"; -1 nenhuma), mandar ({pode, porque}: a resposta pode sair agora?), slack ({estado, hora, rascunho,
// bloqueio, slack (o do item), texto (o do item)} | null), livre ({nome, rascunho, pode} | null), responder ({attrs,
// rotulo, aria, desligado} | null: abre a conversa, como o "↩ Responder" de sempre), resolver, linha, entrando (a
// primeira vez: sobe com a animação)}.
// A caixa da "frase para o chat": o "comando" do item que não tem cara de terminal (PvLista.ehShell falso: "Instala o
// código novo… e retoma os vigias.") vai para a conversa do maestro, não para o PowerShell. Só o Copiar (sem o ⚡).
const caixaFrase = (frase, nome) => !String(frase || "").trim() ? ""
  : `<div class="pv-cod pv-frase-chat"><div class="pv-cod-bar"><span>${esc(`Frase para o chat do ${nome || "maestro"}`)}</span>`
    + `<button type="button" class="pv-copiar" data-pv-copiar aria-label="Copiar a frase">Copiar</button></div><pre class="pv-pre"><code>${esc(frase)}</code></pre></div>`;
// O anexo do item (o card do quadro traz a prova: {nome, tipo, src?}): a miniatura quando o celular a tem (src seguro:
// data:image, blob: ou https:); sem ela, o nome e o "abrir no Monitor" (a imagem fica no PC do maestro).
const RX_SRC = /^(data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+|blob:[^\s"'<>]+|https:\/\/[^\s"'<>]+)$/;
function anexo(a) {
  if (!a || !String(a.nome || "").trim()) return "";
  const src = RX_SRC.test(String(a.src || "")) ? String(a.src) : "", nome = umaLinha(a.nome, 80);
  const mini = src ? `<a class="pv-anexo-mini" href="${esc(src)}" target="_blank" rel="noopener" aria-label="${esc(`Abrir o anexo ${nome}`)}">`
    + `<img src="${esc(src)}" alt="" loading="lazy" decoding="async"></a>` : "";
  return `<div class="pv-f-rot">Anexo</div><div class="pv-anexo">${mini}<div class="pv-anexo-t"><span class="pv-anexo-n">📎 ${esc(nome)}</span>`
    + `${src ? "" : `<small>abrir no Monitor</small>`}</div></div>`;
}
// c (a mais): livre.conf (o texto livre travado esperando o "✓ Confirmar"), anexo ({nome, tipo, src?}).
function folha(c) {
  const o = c || {}, k = esc(o.chave), t = TIPOS[o.tipo] || TIPOS.info, ent = o.entrando ? " entra" : "";
  // o aviso (sessão fechada, PC desligado) no tom suave, com o ⚠ (não no dourado: o acento é só da principal)
  const de = o.de ? `<div class="pv-f-de">de 💬 ${esc(o.de.nome || "")}${o.de.pc ? " · " + esc(o.de.pc) : ""}`
    + `${o.de.aviso ? ` · <span class="alerta">⚠ ${esc(o.de.aviso)}</span>` : ""}</div>` : "";
  const link = linkSeguro(o.link) ? `<a class="pv-f-link" href="${esc(linkSeguro(o.link))}" target="_blank" rel="noopener">↗ ${o.tipo === "slack" ? "Abrir no Slack" : "Abrir o link"}</a>` : "";
  const podeM = !o.mandar || o.mandar.pode !== false;
  const frases = (o.frases || []).map(f => f.n === o.conf
    ? `<button type="button" class="pv-fpil conf" data-pv-confirmar="${k}" data-n="${f.n}">✓ Confirmar: ${esc(umaLinha(f.rotulo, 90))}</button>`
      + `<button type="button" class="pv-fcancelar" data-pv-cancelar="${k}">cancelar</button>`
    : `<button type="button" class="pv-fpil${f.principal ? " principal" : ""}${f.trava ? " trava" : ""}" data-pv-frase="${k}" data-n="${f.n}"`
      + `${f.trava ? ` title="Pede confirmação"` : ""}${podeM ? "" : " disabled"}>${esc(umaLinha(f.rotulo, 140))}</button>`).join("");
  const resp = frases ? `<div class="pv-f-rot">Responder</div><div class="pv-f-frases">${frases}</div>`
    + (!podeM && o.mandar.porque ? `<p class="pv-f-dica">Para responder agora: ${esc(o.mandar.porque)}.</p>` : "") : "";
  let sl = "";
  if (o.slack) {
    const s = o.slack, d = s.slack || {}, st = s.estado || {fase: ""};
    const caixa = st.fase === "ok" ? "" : `<label class="pv-rot" for="rasc-${k}">Sua resposta${d.thread_ts ? " (na thread)" : ""}</label>`
      + `<textarea id="rasc-${k}" class="pv-rasc" data-pv-rasc="${k}" rows="4" placeholder="Escreva a resposta" ${st.fase === "enviando" ? "disabled" : ""}>${esc(s.rascunho || "")}</textarea>`;
    const botoes = st.fase === "ok" ? "" : `<div class="pv-f-acoes"><button type="button" class="card-b ouro" data-pv-slack="${k}" ${s.bloqueio || st.fase === "enviando" ? "disabled" : ""}>`
      + `${esc(s.bloqueio || (st.fase === "erro" ? "Tentar de novo" : "Enviar no Slack"))}</button>`
      + `<button type="button" class="card-b pv-ok" data-pv-ja="${k}" aria-label="Já respondi no Slack: ${esc(s.texto || "")}">Já respondi</button></div>`;
    // a mensagem inteira, com as quebras (o .pv-msg é pre-wrap); quem mandou já está no "de 💬 Slack · Carla"
    sl = `${d.texto ? `<div class="pv-f-rot">Mensagem</div><div class="pv-msg">${esc(d.texto)}</div>` : ""}${caixa}${botoes}`;
  }
  const responder = o.responder ? `<button type="button" class="card-b"${C().attrs({...(o.responder.attrs || {}), "aria-label": o.responder.aria || undefined})}`
    + `${o.responder.desligado ? " disabled" : ""}>${esc(o.responder.rotulo)}</button>` : "";
  // uma caixa de escrever só: "Outra resposta", com o Mandar (contorno, sem o dourado) logo abaixo; travado, o
  // "✓ Confirmar: <texto>" no lugar dele (o rascunho fica na caixa)
  const lv = o.livre, confL = lv && String(lv.conf || "").trim();
  const livre = lv ? `<label class="pv-rot" for="pv-livre-${k}">Outra resposta</label>`
    + `<textarea id="pv-livre-${k}" class="pv-rasc pv-livre" data-pv-livre="${k}" rows="2" placeholder="${esc(`Escreva para ${lv.nome || "o maestro"}`)}">${esc(lv.rascunho || "")}</textarea>`
    + `<div class="pv-f-acoes">${confL
      ? `<button type="button" class="pv-fpil conf" data-pv-confirmar-livre="${k}">✓ Confirmar: ${esc(umaLinha(confL, 90))}</button>`
        + `<button type="button" class="pv-fcancelar" data-pv-cancelar="${k}">cancelar</button>`
      : `<button type="button" class="card-b pv-mandar" data-pv-livre-mandar="${k}"${lv.pode ? "" : " disabled"}>Mandar</button>`}</div>` : "";
  // o rodapé: [↩ Responder a …] [✓ Resolvido] lado a lado
  const ok = o.resolver ? `<button type="button" class="card-b pv-ok" data-pv-ok="${k}">✓ Resolvido</button>` : "";
  const fim = responder || ok ? `<div class="pv-f-acoes pv-f-fim">${responder}${ok}</div>` : "";
  return `<div class="pv-fundo${ent}" data-pv-fundo><div class="pv-folha${ent}" role="dialog" aria-modal="true" aria-labelledby="pv-f-t" data-pv-folha="${k}">`
    + `<div class="pv-pega" aria-hidden="true"></div><div class="pv-f-topo"><span class="pv-f-tipo"><span class="pv-gi" aria-hidden="true">${iconeTipo(o.tipo)}</span> ${esc(o.tipo === "slack" ? "Mensagem" : t.rotulo)}</span>`
    + `<button type="button" class="pv-f-x" data-pv-fechar aria-label="Fechar o detalhe">✕</button></div>`
    + `<h4 class="pv-f-t" id="pv-f-t" tabindex="-1">${esc(o.titulo)}</h4>${de}`
    + `${o.texto ? `<div class="pv-f-texto">${textoHtml(o.texto, {sem: o.sem})}</div>` : ""}${link}${anexo(o.anexo)}${o.rodar || ""}${resp}${sl}${livre}${fim}${C().linha(o.linha)}</div></div>`;
}

// ==== O CSS (as variáveis do index.html; a página é escura: as cores do bloco já vêm em --pv-* para um tema claro) ====
const CSS = `
#p-paravoce,#pvFolha{--pv-cont:rgba(255,255,255,.055);--pv-fio:rgba(255,255,255,.07);--pv-ic:rgba(255,255,255,.09);--pv-solido:#17223f;
  --pv-acento:var(--gold,#E2B84A);--pv-sobre:var(--navy,#0B1E3F);--pv-texto:var(--ink,#F4F6FB);--pv-suave:var(--muted,#9AA8C4)}
.bloco h3.pv-h{gap:6px;margin:0 0 10px;font-size:17px;font-weight:650;line-height:22px;color:var(--pv-texto);text-transform:none;letter-spacing:0}
.bloco h3.pv-h .n3{margin-left:2px;font-size:17px;font-weight:500;color:var(--pv-suave)}
.pv-bloco .rodape{color:var(--pv-suave)}
.pv-faixa{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}
.pv-ch{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:999px;background:rgba(255,255,255,.06);font-size:12.5px;color:var(--pv-suave);white-space:nowrap}
.pv-ch b{font-weight:650;color:var(--pv-texto)}
.pv-ch i{flex:none;width:8px;height:8px;border-radius:50%;background:#8E9AB4}
.pv-ch.c-voce i{background:var(--pv-acento)} .pv-ch.c-voce b{color:var(--gold-2,#F6D77E)}
.pv-ch.c-rodando i{background:#7FB0FF} .pv-ch.c-pronto i{background:#5FD99A} .pv-ch.c-esperando i{background:#B4BED3}
.pv-grupo{margin:0 0 16px}
.pv-gcab{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:44px;margin:-8px 0 -6px;padding:0 6px 0 4px;color:var(--pv-suave);font-size:12px;font-weight:650;letter-spacing:.5px;text-transform:uppercase;text-align:left}
.pv-gseta{flex:none;width:7px;height:7px;margin:0 4px 3px 0;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .2s}
.pv-grupo.recolhido .pv-gseta{transform:rotate(-45deg);margin-bottom:0}
.pv-grupo.recolhido .pv-gcab{margin-bottom:-12px}
.pv-lista{border-radius:14px;background:var(--pv-cont);overflow:hidden}
.pv-lista .pv-item.pv-linha{position:relative;padding:0;margin:0;border:0;font-size:inherit;overflow:hidden}
.pv-linha+.pv-linha>.pv-frente::before{content:"";position:absolute;left:52px;right:0;top:0;height:1px;background:var(--pv-fio)}
.pv-frente{position:relative;display:flex;gap:12px;padding:12px 12px 12px 12px;touch-action:pan-y;transition:transform .22s ease}
.pv-linha.pv-movendo>.pv-frente{transition:none}
.pv-ic{position:relative;flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--pv-ic);color:var(--pv-suave);font-size:14px;line-height:1}
.pv-ic svg,.pv-gi svg{display:block}
.pv-gi{display:inline-grid;vertical-align:-2px;color:var(--pv-suave)}
.pv-ponto{position:absolute;top:-1px;right:-2px;width:8px;height:8px;border-radius:50%;background:var(--pv-acento);box-shadow:0 0 0 2px var(--pv-solido)}
.pv-corpo{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.pv-abrir{display:block;width:100%;min-width:0;min-height:44px;margin:-12px 0 -8px;padding:12px 0 8px;text-align:left;color:inherit;background:none;border:0}
.pv-l1{display:flex;align-items:center;gap:8px;min-width:0;height:20px}
.pv-linha .pv-tit{flex:1;min-width:0;margin:0;font-size:15px;font-weight:600;line-height:20px;color:var(--pv-texto);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-pc{flex:none;font-size:11px;font-weight:600;letter-spacing:.3px;color:var(--pv-suave)}
.pv-sub{display:block;margin-top:2px;font-size:13px;line-height:18px;color:var(--pv-suave);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-acoes-l{display:flex;align-items:flex-start;gap:8px;min-width:0}
.pv-pils{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;flex:1 1 0%}
.pv-icos{display:flex;align-items:center;gap:12px;margin-left:auto;margin-right:-4px;flex:none}
.pv-pil{position:relative;display:inline-flex;align-items:center;min-height:44px;min-width:44px;max-width:100%;margin:-7px 0;padding:0;color:inherit;background:none;border:0}
.pv-pil>span{display:block;max-width:100%;height:30px;padding:0 11px;border-radius:999px;border:1px solid var(--stroke-2,rgba(255,255,255,.18));color:var(--pv-texto);font-size:13px;font-weight:600;line-height:28px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pv-pil.principal>span{background:var(--pv-acento);border-color:var(--pv-acento);color:var(--pv-sobre)}
.pv-pil.mais>span{padding:0 10px;border-color:transparent;background:rgba(255,255,255,.06);color:var(--pv-suave)}
.pv-pil[disabled]>span{opacity:.45}
.pv-pil:active>span{filter:brightness(1.15)}
.pv-icb{display:inline-grid;place-items:center;width:44px;height:44px;margin:-7px -6px;padding:0;color:var(--pv-suave);background:none;border:0;text-decoration:none}
.pv-icb>span{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:none;font-size:15px;font-weight:600;line-height:1}
.pv-icb:hover>span,.pv-icb:active>span,.pv-icb:focus-visible>span{background:var(--glass-2,rgba(255,255,255,.12));color:var(--pv-texto)}
.pv-icb[disabled]{opacity:.4}
.pv-linha .card-linha{margin-top:2px}
.pv-linha.feito .pv-tit{font-weight:500;color:var(--pv-suave)}
.pv-linha.feito .card-linha .cl-txt{color:var(--pv-suave)}
.pv-linha.feito .card-linha.f-erro .cl-txt{color:#FFA49C}
.pv-vv{color:#7FD3FF}
.pv-linha.velha .pv-frente{opacity:.72}
.pv-fundo-d,.pv-fundo-e{position:absolute;inset:0;display:none;align-items:center;padding:0 20px;font-size:14px;font-weight:650}
.pv-fundo-d{justify-content:flex-start;background:var(--pv-acento);color:var(--pv-sobre)}
.pv-fundo-e{justify-content:flex-end;background:#3B4868;color:var(--pv-texto)}
.pv-fundo-d span,.pv-fundo-e span{max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:transform .15s}
.pv-linha.desl-dir>.pv-fundo-d,.pv-linha.desl-esq>.pv-fundo-e{display:flex}
.pv-linha.desl-dir>.pv-frente,.pv-linha.desl-esq>.pv-frente{background:var(--pv-solido)}
.pv-linha.pronto>.pv-fundo-d span,.pv-linha.pronto>.pv-fundo-e span{transform:scale(1.08)}
.pv-linha.desl-esq.pronto>.pv-fundo-e{background:#56658B}
.pv-vao{height:0;overflow:hidden;transition:height .22s ease,opacity .22s ease}
.pv-vao>.pv-linha{pointer-events:none}
.pv-mostrar{display:block;min-height:44px;margin:0 0 -8px;padding:0 14px;color:var(--pv-texto);font-size:13.5px;font-weight:600;background:none;border:0}
.pv-mostrar:hover,.pv-copiar:hover,.pv-f-link:hover{text-decoration:underline}
.pv-vazio{display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px 12px 14px;border-radius:14px;background:var(--pv-cont);text-align:center}
.pv-vazio-c{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:rgba(95,217,154,.14);color:#86E8AE;font-size:20px;font-weight:700}
.pv-vazio b{font-size:15px;font-weight:600;color:var(--pv-texto)}
.pv-vazio small{font-size:12.5px;color:var(--pv-suave)}
.pv-vazio+.pv-grupo{margin-top:16px}
.pv-aviso{display:flex;align-items:center;gap:10px;margin:0 0 14px;padding:4px 4px 4px 12px;min-height:44px;border-radius:12px;background:rgba(255,90,79,.11);color:#FFB8B2;font-size:13.5px;line-height:1.35}
.pv-aviso span{flex:1;min-width:0;padding:6px 0}
.pv-tentar{flex:none;min-height:44px;padding:0 12px;border-radius:10px;color:var(--pv-texto);font-size:13.5px;font-weight:650;background:rgba(255,255,255,.08);border:0}
.pv-esq{border-radius:14px;background:var(--pv-cont);overflow:hidden}
.pv-esq-l{display:flex;gap:12px;align-items:center;padding:15px 12px}
.pv-esq-l+.pv-esq-l{border-top:1px solid var(--pv-fio)}
.pv-esq-c{flex:none;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.08)}
.pv-esq-l span{flex:1;display:flex;flex-direction:column;gap:9px}
.pv-esq-l span i{display:block;height:10px;border-radius:6px;background:linear-gradient(90deg,rgba(255,255,255,.06) 30%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.06) 70%);background-size:300% 100%;animation:pv-brilho 1.5s ease-in-out infinite}
@keyframes pv-brilho{from{background-position:100% 0}to{background-position:0 0}}
#pvFolha{position:fixed;inset:0;z-index:8}
.pv-fundo{position:absolute;inset:0;display:flex;align-items:flex-end;background:rgba(2,6,18,.62)}
.pv-folha{position:relative;width:100%;max-height:88vh;max-height:88dvh;overflow:auto;overscroll-behavior:contain;padding:4px 16px calc(var(--bottom,0px) + 20px);
  background:#10264F;border-radius:20px 20px 0 0;border-top:1px solid var(--stroke,rgba(255,255,255,.1));color:var(--pv-texto);transition:transform .22s ease;box-shadow:0 -10px 30px rgba(0,0,0,.35)}
.pv-folha.arrastando{transition:none}
.pv-fundo.entra{animation:pv-escurece .2s ease}
.pv-folha.entra{animation:pv-sobe .26s cubic-bezier(.2,.8,.2,1)}
@keyframes pv-sobe{from{transform:translateY(100%)}}
@keyframes pv-escurece{from{background:rgba(2,6,18,0)}}
.pv-pega{width:38px;height:5px;margin:6px auto 2px;border-radius:999px;background:var(--stroke-2,rgba(255,255,255,.18))}
.pv-f-topo{display:flex;align-items:center;gap:8px;min-height:44px}
.pv-f-tipo{flex:1;min-width:0;font-size:13px;font-weight:650;color:var(--pv-suave)}
.pv-f-x{flex:none;width:44px;height:44px;margin-right:-10px;border-radius:50%;color:var(--pv-suave);font-size:17px;background:none;border:0}
.pv-f-x:active{background:var(--glass-2,rgba(255,255,255,.12))}
.pv-f-t{margin:0 0 4px;font-size:17px;font-weight:650;line-height:1.3;color:var(--pv-texto);overflow-wrap:anywhere;outline:none}
.pv-f-de{margin:0 0 14px;font-size:13px;color:var(--pv-suave)}
.pv-f-de .alerta{color:var(--pv-suave)}
.pv-f-texto{font-size:15px;line-height:1.5;overflow-wrap:anywhere}
.pv-p{margin:0 0 10px;white-space:pre-wrap}
.pv-p a,.pv-linha .card-linha a,.pv-folha .card-linha a{color:#9CC3FF;text-decoration:underline}
.pv-f-link{color:var(--pv-texto)}
.pv-linha .card-linha .alerta,.pv-folha .card-linha .alerta{color:#FFA49C}
.pv-p code{padding:1px 5px;border-radius:5px;background:rgba(0,0,0,.3);font:13px ui-monospace,Menlo,Consolas,monospace}
.pv-cod{margin:0 0 10px;border-radius:10px;overflow:hidden;border:1px solid var(--stroke,rgba(255,255,255,.1));background:rgba(0,0,0,.35)}
.pv-cod-bar{display:flex;align-items:center;justify-content:space-between;padding-left:12px;border-bottom:1px solid var(--stroke,rgba(255,255,255,.1));font-size:12px;color:var(--pv-suave)}
.pv-copiar{min-height:44px;min-width:76px;padding:0 14px;color:var(--pv-texto);font-size:14px;font-weight:600;background:none;border:0}
.pv-pre{margin:0;max-height:220px;overflow:auto;padding:10px 12px;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;color:var(--pv-texto);white-space:pre-wrap;overflow-wrap:anywhere}
.pv-f-link{display:inline-flex;align-items:center;min-height:44px;font-size:15px;font-weight:650;text-decoration:none}
.pv-folha .rd-caixa{margin-top:12px}
.pv-f-rot{margin:18px 0 8px;font-size:12px;font-weight:650;letter-spacing:.5px;text-transform:uppercase;color:var(--pv-suave)}
.pv-f-frases{display:flex;flex-wrap:wrap;gap:8px}
.pv-fpil{min-height:44px;max-width:100%;padding:9px 16px;border-radius:22px;border:1px solid var(--stroke-2,rgba(255,255,255,.18));color:var(--pv-texto);background:none;font-size:15px;font-weight:600;line-height:1.3;text-align:left;overflow-wrap:anywhere}
.pv-fpil.principal{background:var(--pv-acento);border-color:var(--pv-acento);color:var(--pv-sobre)}
.pv-fpil.conf{background:rgba(226,184,74,.16);border-color:var(--pv-acento);color:var(--pv-texto)}
.pv-fpil[disabled]{opacity:.45}
.pv-fcancelar{min-height:44px;padding:0 10px;color:var(--pv-suave);font-size:14px;text-decoration:underline;background:none;border:0}
.pv-f-dica{margin:8px 0 0;font-size:12.5px;line-height:1.4;color:var(--pv-suave)}
.pv-folha .pv-rot{margin-top:18px}
.pv-folha .pv-msg{margin-top:0;padding:10px 12px;border-left:0;border-radius:12px;background:rgba(255,255,255,.05);font-size:14.5px;line-height:1.45}
.pv-mandar{background:none;border:1px solid var(--stroke-2,rgba(255,255,255,.18));color:var(--pv-texto)}
.pv-anexo{display:flex;align-items:center;gap:12px;min-height:44px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.05)}
.pv-anexo-mini{flex:none;display:block;width:64px;height:64px;border-radius:8px;overflow:hidden;background:rgba(0,0,0,.3)}
.pv-anexo-mini img{display:block;width:100%;height:100%;object-fit:cover}
.pv-anexo-t{min-width:0;display:flex;flex-direction:column;gap:2px}
.pv-anexo-n{font-size:14.5px;font-weight:600;color:var(--pv-texto);overflow-wrap:anywhere}
.pv-anexo-t small{font-size:12.5px;color:var(--pv-suave)}
.pv-f-acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.pv-f-fim{margin-top:18px;padding-top:14px;border-top:1px solid var(--pv-fio)}
.pv-folha .card-linha{margin-top:14px}
@media (max-width:360px){.pv-ch{padding:0 8px;font-size:12px}.pv-faixa{gap:4px}
  .pv-frente{gap:10px;padding:12px 8px 12px 10px}.pv-pils{gap:6px}.pv-pil>span{padding:0 9px;font-size:12.5px}}
body.pv-folha-aberta{overflow:hidden}
body.pv-folha-aberta #appAviso{z-index:10}
@media (prefers-reduced-motion:reduce){.pv-frente,.pv-vao,.pv-folha,.pv-gseta,.pv-fundo-d span,.pv-fundo-e span{transition:none}
  .pv-fundo.entra,.pv-folha.entra,.pv-esq-l span i{animation:none}}
`;

const ParaVoce = {item, slack, faseResposta, FASE_SLACK, tipoDe,
  TIPOS, trava, autoriza, negativa, soAdia, semCodigo, RX_AUTORIZA, direcaoGesto, gesto, LIMIAR, faixa, chipFica, pilula, icone, linha, grupo,   // pro-105
  esqueleto, vazio, aviso, textoHtml, folha, caixaFrase, anexo, CSS};
if (typeof module !== "undefined" && module.exports) module.exports = ParaVoce;
else raiz.ParaVoce = ParaVoce;
})(typeof window !== "undefined" ? window : globalThis);
