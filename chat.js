// Seaninho no celular: a lógica do chat de uma sessão (sem tela), para o index.html desenhar e o Node testar
// (pessoal/celular/test_chat_web.cjs). Junta a conversa que o PC publica (agente 0.8) com os pedidos do celular e
// decide os sinais de cada mensagem minha, no combinado com o Monitor geral do Seaninho Pro (29/10):
//   🕓 mandando (o celular ainda não falou com o banco) · ✓ enviado (o pedido existe) · ✓✓ entregue (o agente pôs na
//   aba) · ✓✓ azul (a sessão começou a responder) · ⚠ erro, com o motivo numa linha embaixo do balão.
(function (raiz) {
"use strict";

const SINAL = {mandando: "🕓", enviado: "✓", entregue: "✓✓", lido: "✓✓", erro: "⚠"};
const NAO_SABE = "Isso ainda não dá";   // o agente antigo responde assim a uma ação que não conhece
const JANELA_CASAR = 300;               // s: a mensagem da conversa pode ter hora um pouco antes do pedido (relógios)

// Como a entrega compara (entrega.linha_unica + _cmp): sem emoji fora do plano básico, sem invisíveis, espaços juntos.
function normalizar(t) {
  return String(t ?? "").replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "").replace(/[​-‍⁠﻿️]/g, "")
    .replace(/\s+/g, " ").trim();
}

function versao(v) {
  const n = (String(v ?? "").match(/\d+/g) || []).slice(0, 3).map(Number);
  while (n.length < 3) n.push(0);
  return n;
}
function versaoMin(v, minimo) {
  const a = versao(v), b = versao(minimo);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

const epoca = iso => { const t = Date.parse(iso); return isNaN(t) ? 0 : Math.floor(t / 1000); };
const CASAR_TRECHO = 24;   // trecho mínimo para casar pelo começo (curto como "ok" só casa com mensagem igual)

// A mensagem da conversa é o pedido que o agente digitou? Igual (normalizada), ou com o começo do pedido dentro, se
// ele for comprido o bastante para não confundir com outra mensagem ("ok" não pode virar "ok, atualiza o token").
function mesmaMensagem(texto, procura) {
  const t = normalizar(texto).toLowerCase(), p = procura.toLowerCase();
  return t === p || (p.length >= CASAR_TRECHO && t.includes(p.slice(0, 60)));
}
const lerJson = t => { try { return JSON.parse(t || "{}"); } catch { return {}; } };

// O pedido de resposta de enquete (tipo acao) desta sessão, ou null.
function respostaDeEnquete(p, sessao) {
  if (p.tipo !== "acao") return null;
  const a = lerJson(p.texto);
  return a.acao === "responder_enquete" && (!sessao || a.sessao === sessao) ? a : null;
}

// O pedido de resposta a um pedido de permissão (tipo acao) desta sessão, ou null.
function respostaDePermissao(p, sessao) {
  if (p.tipo !== "acao") return null;
  const a = lerJson(p.texto);
  return a.acao === "responder_permissao" && (!sessao || a.sessao === sessao) ? a : null;
}

// Os botões que o PC mostra, em português. "Yes, allow Bash(git push:*) for this project (just you)" vira
// "Permitir sempre Bash(git push:*) neste projeto (só você)"; o que não se conhece vai como veio, depois de "Permitir".
const DESTINOS = {"this project (just you)": "neste projeto (só você)", "all projects": "em todos os projetos",
  "this project (shared)": "neste projeto (para o time)", "this session": "nesta sessão", "startup options": "nas opções de início"};
const BOTOES = {"yes": "Permitir", "no": "Não", "yes, allow all edits this session": "Permitir todas as edições nesta sessão",
  "yes, and don't ask again": "Permitir e não perguntar de novo", "yes, return to normal mode": "Permitir e voltar ao modo normal",
  "yes, and use auto mode": "Aprovar e seguir no modo auto", "yes, and auto-accept": "Aprovar e aceitar as edições",
  "yes, and manually approve edits": "Aprovar e revisar cada edição", "no, keep planning": "Não, continuar planejando",
  "send feedback and keep planning": "Mandar os comentários e continuar planejando"};
function traduzirBotao(rotulo) {
  const r = String(rotulo || "").trim(), chave = r.toLowerCase();
  if (BOTOES[chave]) return BOTOES[chave];
  const m = /^Yes, allow (access to )?(.+?) for (.+)$/i.exec(r);
  if (m) return `Permitir sempre ${m[1] ? "acesso a " : ""}${m[2]} ${DESTINOS[m[3].toLowerCase()] || "(" + m[3] + ")"}`;
  return r.replace(/^Yes,?\s*/i, "Permitir ").replace(/^No,?\s*/i, "Não ").trim() || r;
}

// Os botões do cartão de permissão: os que o PC mostra (lidos da tela; mesma regra do agente: o 1º Yes, o 2º Yes e
// o No) ou, sem eles, os de sempre. [{escolha: "sim"|"sempre"|"nao", rotulo, original?}]
function botoesPermissao(perm) {
  const opcoes = Array.isArray(perm.opcoes) ? perm.opcoes : null;
  if (opcoes) {
    const sim = opcoes.filter(r => /^yes\b/i.test(r)), nao = opcoes.find(r => /^(no\b|send feedback)/i.test(r));
    const out = [];
    if (sim[0]) out.push({escolha: "sim", rotulo: traduzirBotao(sim[0]), original: sim[0]});
    if (sim[1]) out.push({escolha: "sempre", rotulo: traduzirBotao(sim[1]), original: sim[1]});
    if (nao) out.push({escolha: "nao", rotulo: traduzirBotao(nao), original: nao});
    if (out.length >= 2) return out;
  }
  return perm.plano
    ? [{escolha: "sim", rotulo: "Aprovar o plano"}, {escolha: "sempre", rotulo: "Aprovar e revisar cada edição"},
       {escolha: "nao", rotulo: "Não, continuar planejando"}]
    : [{escolha: "sim", rotulo: "Permitir"}, {escolha: "sempre", rotulo: "Permitir sempre (a regra que o PC sugerir)"},
       {escolha: "nao", rotulo: "Não"}];
}

// O balão meu da resposta: o que escolhi e o pedido.
function textoPermissao(acao) {
  const o = {sim: "✅ Permiti", sempre: "✅ Permiti sempre", nao: "🚫 Não permiti"}[acao.escolha] || "Respondi";
  return o + (acao.titulo ? `: ${acao.titulo}` : "") + (acao.escolha === "nao" && acao.texto ? `\n“${acao.texto}”` : "");
}

function textoResposta(acao, enquete) {
  const perguntas = (enquete && enquete.perguntas) || [];
  const partes = (acao.respostas || []).map((r, i) => {
    const valor = [...(r.opcoes || []), ...(r.outra ? [r.outra] : [])].join(", ");
    const titulo = perguntas.length > 1 && perguntas[i] ? (perguntas[i].titulo || perguntas[i].pergunta) + ": " : "";
    return titulo + valor;
  });
  return partes.join("\n") || "Resposta da enquete";
}

// O estado de um pedido meu, do jeito do chat: {sinal, texto, erro, nota}. sinal null = não vira balão.
function estadoDoPedido(p, enquete) {
  const resp = respostaDeEnquete(p), perm = respostaDePermissao(p);
  const texto = resp ? textoResposta(resp, enquete) : perm ? textoPermissao(perm) : (p.prompt || p.texto || "");
  switch (p.estado) {
    case "novo": case "escrevendo":
      return {sinal: "enviado", texto: resp || perm ? texto : p.texto, nota: resp || perm ? "" : "O Seaninho está escrevendo o texto…"};
    case "pronto": return {sinal: null, texto};   // a prévia para conferir aparece em cima da caixa
    case "enviar": case "enviando": return {sinal: "enviado", texto};
    case "entregue":
      if (String(p.resposta || "").startsWith(NAO_SABE)) return {sinal: "erro", texto, erro: p.resposta};
      return {sinal: "entregue", texto, obs: perm ? String(p.resposta || "") : ""};   // "Apertei “Yes” no PC."
    case "erro": return {sinal: "erro", texto, erro: p.erro || "Não foi."};
    default: return {sinal: null, texto};         // cancelado
  }
}

// Os pedidos meus desta sessão (claude e respostas de enquete), mais velhos primeiro.
function pedidosDaSessao(pedidos, sessao) {
  return (pedidos || []).filter(p => ((p.tipo || "claude") === "claude" && p.sessao === sessao)
    || respostaDeEnquete(p, sessao) || respostaDePermissao(p, sessao)).sort((a, b) => String(a.criado_em).localeCompare(String(b.criado_em)));
}

// Sessão de agente antigo (sem "conversa"): o último pedido e a última fala, como antes.
function conversaDe(s) {
  if (Array.isArray(s.conversa)) return s.conversa;
  const out = [];
  if (s.pedido) out.push({id: "antigo-eu", de: "eu", texto: s.pedido, t: 0});
  if (s.resposta) out.push({id: "antigo-claude", de: "claude", texto: s.resposta, t: s.desde || 0});
  return out;
}

// As linhas do chat: as mensagens da conversa, os pedidos (casados com a mensagem que entrou na conversa, ou como
// balão próprio na hora em que foram feitos) e os separadores de dia. `locais`: os balões que ainda não chegaram ao
// banco (🕓) ou não conseguiram (⚠).
function montar(s, pedidos, locais, agora) {
  const conversa = conversaDe(s).map(m => ({...m}));
  const enquetes = {};
  for (const m of conversa) if (m.enquete) enquetes[m.enquete.id] = m.enquete;
  if (s.enquete) enquetes[s.enquete.id] = s.enquete;
  const casados = new Set(), soltos = [];
  for (const p of pedidosDaSessao(pedidos, s.id)) {
    const resp = respostaDeEnquete(p), perm = respostaDePermissao(p);
    const est = estadoDoPedido(p, resp && enquetes[resp.id]);
    if (!est.sinal) continue;
    const criado = epoca(p.criado_em);
    let alvo = null;
    if (resp) alvo = conversa.find(m => m.de === "eu" && m.resposta_a === resp.id && !casados.has(m.id));
    else if (!perm && (est.sinal !== "enviado" || p.estado !== "novo")) {
      const procura = normalizar(p.prompt || p.texto);
      alvo = procura && conversa.find(m => m.de === "eu" && !casados.has(m.id) && (!m.t || m.t >= criado - JANELA_CASAR)
        && mesmaMensagem(m.texto, procura));
    }
    if (alvo) {
      casados.add(alvo.id);
      alvo.pedido = p.id;
      alvo.mime = p.mime || "";
      continue;   // está na conversa: entregue com certeza (o sinal sai do "visto" dela)
    }
    soltos.push({id: "p:" + p.id, de: "eu", texto: est.texto, t: criado, pedido: p.id, mime: p.mime || "",
                 sinal: est.sinal, erro: est.erro || "", nota: est.nota || "", obs: est.obs || "",
                 resposta_a: resp ? resp.id : "", permissao_a: perm ? perm.id : ""});
  }
  for (const m of conversa) if (m.de === "eu" && !m.sinal) m.sinal = m.visto === "lido" ? "lido" : "entregue";
  // os soltos entram na ordem do tempo, depois das mensagens da conversa da mesma hora
  let linhas = conversa;
  for (const x of [...soltos, ...(locais || [])]) {
    let i = linhas.length;
    while (i > 0 && (linhas[i - 1].t || 0) > x.t) i--;
    linhas = [...linhas.slice(0, i), x, ...linhas.slice(i)];
  }
  const out = [];
  let dia = "";
  for (const m of linhas) {
    const d = m.t ? rotuloDia(m.t, agora) : "";
    if (d && d !== dia) { out.push({tipo: "dia", id: "dia:" + d, rotulo: d}); dia = d; }
    out.push({tipo: "msg", ...m});
  }
  return out;
}

function rotuloDia(t, agora) {
  const d = new Date(t * 1000), hoje = new Date(agora ?? Date.now());
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", {weekday: "short", day: "numeric", month: "short"}).replace(/\./g, "");
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

// O texto do Claude (markdown) em HTML seguro: blocos de código, `código`, **negrito**, títulos e links. O resto fica
// como está (a quebra de linha vem do CSS).
function marcacao(texto) {
  const blocos = [];
  let t = esc(texto).replace(/```[^\n]*\n?([\s\S]*?)(```|$)/g, (_, codigo) => {
    blocos.push(`<pre>${codigo.replace(/\n$/, "")}</pre>`);
    return `\u0000${blocos.length - 1}\u0000`;
  });
  t = t.replace(/`([^`\n]+)`/g, "<code>$1</code>")
       .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
       .replace(/^#{1,4} +(.+)$/gm, "<b>$1</b>")
       .replace(/(^|[\s(])(https?:\/\/[^\s<)]*[^\s<).,;:!?])/g, (_, a, url) => `${a}<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => blocos[Number(i)]);
}

// A enquete respondida: quais opções foram escolhidas e o que foi escrito à mão ("Outra").
function escolhidas(pergunta, resposta) {
  const rotulos = (pergunta.opcoes || []).map(o => o.rotulo);
  let resto = String(resposta ?? "");
  const marcadas = [];
  if (!pergunta.multipla) return rotulos.includes(resto) ? {marcadas: [resto], outra: ""} : {marcadas: [], outra: resto};
  for (;;) {   // "Folha 1, Folha 2, texto livre": o rótulo mais comprido que casa primeiro
    const r = rotulos.filter(x => resto === x || resto.startsWith(x + ", ")).sort((a, b) => b.length - a.length)[0];
    if (r === undefined) break;
    marcadas.push(r);
    resto = resto.slice(r.length).replace(/^, /, "");
  }
  return {marcadas, outra: resto};
}

// As escolhas na tela respondem todas as perguntas? (escolha única: uma opção ou a "outra" escrita)
function completas(enquete, escolhas) {
  return (enquete.perguntas || []).every((_, i) => {
    const e = (escolhas || [])[i] || {};
    return (e.opcoes || []).length > 0 || (e.outraMarcada && String(e.outra || "").trim());
  });
}

// O que vai para o agente (pedido tipo acao): as escolhas por pergunta, na ordem.
function acaoResponder(s, enquete, escolhas) {
  return {acao: "responder_enquete", sessao: s.id, id: enquete.id,
          respostas: enquete.perguntas.map((_, i) => {
            const e = escolhas[i] || {};
            return {opcoes: [...(e.opcoes || [])], outra: e.outraMarcada ? String(e.outra || "").trim() : ""};
          })};
}

// ---- Colar imagem ------------------------------------------------------------------------------------------------
const ehImagem = tipo => /^image\//.test(String(tipo || ""));

// A imagem de uma colagem na caixa (evento paste): o arquivo image/* que veio junto, ou null (aí o texto cola normal).
function imagemDaColagem(dados) {
  if (!dados) return null;
  for (const f of Array.from(dados.files || [])) if (f && ehImagem(f.type)) return f;
  for (const it of Array.from(dados.items || [])) {
    if (it && it.kind === "file" && ehImagem(it.type)) { const f = it.getAsFile(); if (f) return f; }
  }
  return null;
}

// A imagem do que o navigator.clipboard.read() devolveu ("Colar imagem" do 📎): o primeiro image/*, ou null.
async function imagemDosItens(itens) {
  for (const it of Array.from(itens || [])) {
    const tipo = Array.from(it.types || []).find(ehImagem);
    if (tipo) return it.getType(tipo);
  }
  return null;
}

const Chat = {SINAL, normalizar, versaoMin, montar, estadoDoPedido, pedidosDaSessao, respostaDeEnquete, textoResposta,
  respostaDePermissao, traduzirBotao, botoesPermissao, textoPermissao,
  rotuloDia, marcacao, escolhidas, completas, acaoResponder, conversaDe, imagemDaColagem, imagemDosItens, esc};
if (typeof module !== "undefined" && module.exports) module.exports = Chat;
else raiz.Chat = Chat;
})(typeof window !== "undefined" ? window : globalThis);
