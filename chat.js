// Seaninho no celular: a lógica do chat de uma sessão (sem tela), para o index.html desenhar e o Node testar
// (pessoal/celular/test_chat_web.cjs). Junta a conversa que o PC publica (agente 0.8) com os pedidos do celular e
// decide os sinais de cada mensagem minha, no combinado com o Monitor geral do Seaninho Pro (29/10):
//   🕓 mandando (o celular ainda não falou com o banco) · ✓ enviado (o pedido existe) · ✓✓ entregue (o agente pôs na
//   aba) · ✓✓ azul (a sessão começou a responder) · ⚠ erro, com o motivo numa linha embaixo do balão.
// 0.9.0.15: e o selo de por onde foi (⌨ digitada, 🎼 pelo maestro, 🌙 de fundo), com o 🕓 enquanto está com o maestro.
(function (raiz) {
"use strict";

// 0.9.0.15: "fila" = o relógio da mensagem que vai pelo maestro e ainda não chegou à sessão (na caixa dele, ou ele entregando)
const SINAL = {mandando: "🕓", enviado: "✓", entregue: "✓✓", lido: "✓✓", erro: "⚠", esperando: "⏳", fila: "🕓"};
const ESPERANDO = "Esperando: ";   // o "erro" do pedido que o PC ainda vai tentar de novo (0.8.7): não é erro
const NAO_SABE = "Isso ainda não dá";   // o agente antigo responde assim a uma ação que não conhece
const JANELA_CASAR = 300;               // s: a mensagem da conversa pode ter hora um pouco antes do pedido (relógios)

// ---- 0.9.0.15 (12/11): o celular entrega em qualquer sessão (CONTRATO-0915.md) ----------------------------------
// Pedido do Arthur pelo celular: "A Seaninho celular poder mandar mensagem em qualquer lugar. Vc code, terminal, app…".
// O agente 0.9.0.15 escolhe o caminho: digitada na aba (VS Code), pelo maestro (terminal e app do Claude) ou de fundo
// (a de segundo plano parada é retomada com a mensagem). Na sessão vem "entregavel" e, sem caminho, "motivo_entrega".
// O balão meu leva um selo pequeno de por onde foi, tirado do começo da resposta do pedido.
const AGENTE_QUALQUER = "0.9.0.15";
const SELO = {digitada: "⌨ digitada", maestro: "🎼 pelo maestro", fundo: "🌙 de fundo"};
const PELO_MAESTRO = /^Pelo maestro\b/i, DE_FUNDO = /^De fundo\b/i;
// "Pelo maestro: …" e "De fundo: …" são os caminhos novos. O plano B ("Pelo plano B: …") e a caixa da orquestra também
// não foram digitados: foram pela caixa de quem repassa, como o maestro (o contrato os punha em "digitada"; aqui o selo
// diz por onde a mensagem foi de verdade). O resto ("Entregue.", "Na fila: …", vazio) foi digitado na aba.
function viaDaResposta(resposta) {
  const r = String(resposta || "").trim();
  if (PELO_MAESTRO.test(r) || /^(Entregue pelo|Pelo) plano B|caixa da orquestra/i.test(r)) return "maestro";
  return DE_FUNDO.test(r) ? "fundo" : "digitada";
}
// O caminho de um pedido que deu erro ou espera, quando o texto diz ("O maestro não conseguiu entregar: …", "Esperando:
// a sessão de fundo está trabalhando…"); "" quando não diz (o selo não aparece: não se sabe por onde ia).
function viaDoErro(erro) {
  const e = String(erro || "");
  return /^O maestro não conseguiu entregar/i.test(e) ? "maestro" : /sessão de fundo|^De fundo/i.test(e) ? "fundo" : "";
}
// Por que não dá para mandar daqui (a caixa some e o aviso diz isso), ou "" quando dá. `versaoPc`: o agente do PC da
// sessão. O 0.9.0.15+ diz na sessão (motivo_entrega); o de antes só entregava no VS Code: fora dele, o aviso é atualizar.
function motivoSemEntrega(s, versaoPc, {nomePc = "", agentePermissao = "0.8.1"} = {}) {
  if (!s || s.entregavel) return "";
  const pc = nomePc || s.pc || "PC";
  if (versaoMin(versaoPc, AGENTE_QUALQUER)) {
    if (s.motivo_entrega) return String(s.motivo_entrega);
  } else if (s.onde && s.onde !== "VS Code")
    return `Para entregar no terminal, no app do Claude e no segundo plano, o ${pc} precisa do Seaninho no celular ${AGENTE_QUALQUER} (esta está no ${s.onde}).`;
  // sem o porquê do agente: os de sempre da aba do VS Code
  return s.enquete ? "A pergunta com opções desta sessão ainda só se responde no PC."
    : s.permissao ? `Para responder a permissão daqui, o ${pc} precisa do Seaninho no celular ${agentePermissao}.`
    : s.onde && s.onde !== "VS Code" ? "Agora não há caminho para entregar nesta sessão: mande pelo PC."
    : "A sessão está esperando uma permissão: isso ainda só se responde no PC.";
}

// Como a entrega compara (entrega.linha_unica + _cmp): sem emoji fora do plano básico, sem invisíveis, espaços juntos.
function normalizar(t) {
  return String(t ?? "").replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "").replace(/[​-‍⁠﻿️]/g, "")
    .replace(/\s+/g, " ").trim();
}

// 0.9.0.15: até 4 partes (antes 3: "0.9.0.14" passava por "0.9.0.15", e a página achava que o agente velho entregava)
function versao(v) {
  const n = (String(v ?? "").match(/\d+/g) || []).slice(0, 4).map(Number);
  while (n.length < 4) n.push(0);
  return n;
}
function versaoMin(v, minimo) {
  const a = versao(v), b = versao(minimo);
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] > b[i];
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
  return ["responder_enquete", "recusar_enquete"].includes(a.acao) && (!sessao || a.sessao === sessao) ? a : null;   // o X (0.8.7) também
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
  if (acao.acao === "recusar_enquete") return "✕ Não quis responder a enquete";
  const perguntas = (enquete && enquete.perguntas) || [];
  const partes = (acao.respostas || []).map((r, i) => {
    const valor = [...(r.opcoes || []), ...(r.outra ? [r.outra] : [])].join(", ");
    const titulo = perguntas.length > 1 && perguntas[i] ? (perguntas[i].titulo || perguntas[i].pergunta) + ": " : "";
    return titulo + valor;
  });
  return partes.join("\n") || "Resposta da enquete";
}

// A mensagem que o PC mandou pela caixa da orquestra (o maestro lê pelo caixa.py): "entregue pela caixa", com o porquê
// que o PC deu ("a janela do VS Code do maestro demorou a responder", 10/11) quando vier.
function pelaCaixa(resposta) {
  const porque = (String(resposta || "").match(/caixa da orquestra:\s*(.+?)\.?\s*$/) || [])[1];
  return `Entregue pela caixa da orquestra${porque ? ` (${porque})` : ""}: chega ao maestro como aviso, não como mensagem sua.`;
}

// O estado de um pedido meu, do jeito do chat: {sinal, texto, erro, nota, obs, via}. sinal null = não vira balão.
// via (0.9.0.15): por onde a mensagem foi ("digitada", "maestro", "fundo"; "" sem saber), só nas mensagens (não nas
// respostas de enquete e de permissão, que são botões apertados no PC).
function estadoDoPedido(p, enquete) {
  const resp = respostaDeEnquete(p), perm = respostaDePermissao(p);
  const texto = resp ? textoResposta(resp, enquete) : perm ? textoPermissao(perm) : (p.prompt || p.texto || "");
  const msg = !resp && !perm;
  switch (p.estado) {
    case "novo": case "escrevendo":
      return {sinal: "enviado", texto: resp || perm ? texto : p.texto, nota: resp || perm ? "" : "O Seaninho está escrevendo o texto…"};
    case "pronto": return {sinal: null, texto};   // a prévia para conferir aparece em cima da caixa
    case "enviar": case "enviando":
      if (String(p.erro || "").startsWith(ESPERANDO))   // o PC espera a causa sumir (rascunho na caixa, alguém no PC)
        return {sinal: "esperando", texto, erro: p.erro.slice(ESPERANDO.length), rascunho: /rascunho/i.test(p.erro),
                via: msg ? viaDoErro(p.erro.slice(ESPERANDO.length)) : ""};   // 0.9.0.15: a de fundo que trabalha
      return {sinal: "enviado", texto};
    case "entregue":
      if (String(p.resposta || "").startsWith(NAO_SABE)) return {sinal: "erro", texto, erro: p.resposta};
      // 0.9.0.15: pelo maestro e de fundo, o andamento vem na resposta (CONTRATO-0915, seção 4). O ✓✓ só quando a
      // sessão recebeu ("… ✓ a sessão recebeu."); na caixa do maestro, ou com ele entregando, o relógio (ainda não
      // chegou); entregue à sessão ou retomada, o ✓ (saiu, falta a sessão mostrar). A obs é a resposta, como no plano B.
      if (msg && (PELO_MAESTRO.test(p.resposta || "") || DE_FUNDO.test(p.resposta || ""))) {
        const r = String(p.resposta).trim();
        return {sinal: /✓/.test(r) ? "entregue" : /na fila|entregando/i.test(r) ? "fila" : "enviado", texto, obs: r,
                via: viaDaResposta(r)};
      }
      return {sinal: "entregue", texto, via: msg ? viaDaResposta(p.resposta) : "",   // "Apertei “Yes” no PC." / "Respondida pelo plano B: …"
              obs: perm || (resp && p.resposta && p.resposta !== "Respondida.") ? String(p.resposta || "")
                // 0.8.9: digitada com a sessão trabalhando (entra quando ela terminar o passo), ou pela caixa da orquestra
                : /^Na fila/.test(p.resposta || "") ? "Na fila da sessão: entra quando ela terminar o passo atual."
                : /caixa da orquestra/.test(p.resposta || "") ? pelaCaixa(p.resposta)
                // 11/11: a entrega digitada não deu (nada escrito) e foi pela caixa de quem repassa (o plano B do PC;
                // "Pelo plano B: …" desde a revisão, "Entregue pelo plano B: …" no agente de antes)
                : /^(Entregue pelo|Pelo) plano B/.test(p.resposta || "") ? String(p.resposta)
                : ""};
    case "erro": return {sinal: "erro", texto, erro: p.erro || "Não foi.", via: msg ? viaDoErro(p.erro) : ""};
    default: return {sinal: null, texto};         // cancelado
  }
}

// Erro do PC em que nada foi escrito nem enviado ("Nada foi escrito", "não escrevi nada", "Nada foi enviado"), num
// texto sem imagem nem áudio: o toque no erro manda o mesmo texto de novo.
const NADA_SAIU = /nada foi (escrito|enviado)|não escrevi nada/i;
function reenviavel(p) {   // 0.9.0.15: o mime "orq/…" da orquestra não é anexo
  return p.estado === "erro" && (p.tipo || "claude") === "claude" && !temAnexo(p.mime) && !p.audio && NADA_SAIU.test(String(p.erro || ""));
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
  // 0.9.0.15 (CONTRATO-0915, 8.3): o recado da orquestra que o maestro repassou ("🎼 Orquestra [orq:<id8>]: …") fica
  // "sessao" na conversa, com o "orq": é o próprio pedido, sem balão meu em dobro; e o id interno não aparece
  for (const m of conversa)
    if (m.de === "sessao" && m.orq) m.texto = String(m.texto || "").replace(MARCA_ORQ, "🎼 Orquestra: ");
  for (const p of pedidosDaSessao(pedidos, s.id)) {
    const resp = respostaDeEnquete(p), perm = respostaDePermissao(p);
    const id8 = String(p.id || "").slice(0, 8).toLowerCase();
    const recado = !resp && !perm && id8.length === 8
      && conversa.find(m => m.de === "sessao" && String(m.orq || "").toLowerCase() === id8 && !casados.has(m.id));
    if (recado) { casados.add(recado.id); recado.pedido = p.id; continue; }
    const est = estadoDoPedido(p, resp && enquetes[resp.id]);
    if (!est.sinal) continue;
    const criado = epoca(p.criado_em);
    const orq = !resp && !perm && daOrquestra(p.mime);   // corretor de 12/11: a orquestra nunca é balão meu
    let alvo = null;
    if (resp) alvo = conversa.find(m => m.de === "eu" && m.resposta_a === resp.id && !casados.has(m.id));
    else if (!perm && (est.sinal !== "enviado" || p.estado !== "novo")) {
      const procura = normalizar(p.prompt || p.texto);
      alvo = procura && conversa.find(m => m.de === "eu" && !casados.has(m.id) && (!m.t || m.t >= criado - JANELA_CASAR)
        && mesmaMensagem(m.texto, procura));
    }
    if (alvo && orq) {   // digitado no VS Code (entrou como fala na conversa): a linha da orquestra, com o texto de lá
      casados.add(alvo.id);
      Object.assign(alvo, linhaDaOrquestra({}, {sinal: "", texto: alvo.texto}), {pedido: p.id, mime: p.mime || ""});
      continue;
    }
    if (orq) {
      soltos.push(linhaDaOrquestra({id: "p:" + p.id, t: criado, pedido: p.id, mime: p.mime || "", estado: p.estado}, est));
      continue;
    }
    if (alvo) {
      casados.add(alvo.id);
      alvo.pedido = p.id;
      alvo.mime = p.mime || "";
      // 0.9.0.15: o selo de por onde foi. Vale o da conversa (o recado do maestro vem com "via"), senão o do pedido
      // (a de fundo entra como fala comum; a digitada também). Sem resposta ainda (o pedido em "enviar"), sem selo: o
      // caminho só se sabe quando o PC responde. A resposta de enquete e de permissão não tem selo.
      alvo.via = SELO[alvo.via] ? alvo.via : est.via || "";
      continue;   // está na conversa: entregue com certeza (o sinal sai do "visto" dela)
    }
    soltos.push({id: "p:" + p.id, de: "eu", texto: est.texto, t: criado, pedido: p.id, mime: p.mime || "",
                 sinal: est.sinal, erro: est.erro || "", nota: est.nota || "", obs: est.obs || "",
                 resposta_a: resp ? resp.id : "", permissao_a: perm ? perm.id : "", reenviar: reenviavel(p),
                 estado: p.estado, rascunho: !!est.rascunho, tipoPedido: p.tipo || "claude", via: est.via || ""});
  }
  for (const m of conversa) {
    if (m.de !== "eu") continue;
    if (!m.sinal) m.sinal = m.visto === "lido" ? "lido" : "entregue";
    if (m.via && !SELO[m.via]) m.via = "";   // só os três selos conhecidos
  }
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

// O texto do Claude (markdown) em HTML seguro: markdown.js (0.8.8: títulos, listas, citação, código com Copiar e
// tabelas de verdade). O balão põe a classe "md" (as quebras de linha vêm de lá, não do pre-wrap).
const Md = typeof module !== "undefined" && module.exports ? require("./markdown.js") : raiz.Markdown;
const memoMd = new Map();   // 0.8.9: o texto -> o HTML (os ~150 últimos); o chat se refaz a cada atualização
function marcacao(texto) {
  const k = String(texto ?? "");
  if (memoMd.has(k)) return memoMd.get(k);
  const h = Md.html(k);
  memoMd.set(k, h);
  if (memoMd.size > 150) memoMd.delete(memoMd.keys().next().value);
  return h;
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

const MAX_IMAGENS = 10;   // por mensagem (0.8.2), como no WhatsApp

// As imagens de uma colagem na caixa (evento paste): os arquivos image/* que vieram (files e items repetem as mesmas;
// o iOS às vezes só manda em items). Lista vazia: o texto cola normal.
function imagensDaColagem(dados) {
  if (!dados) return [];
  const arquivos = Array.from(dados.files || []).filter(f => f && ehImagem(f.type));
  if (arquivos.length) return arquivos;
  return Array.from(dados.items || []).filter(it => it && it.kind === "file" && ehImagem(it.type))
    .map(it => it.getAsFile()).filter(Boolean);
}
const imagemDaColagem = dados => imagensDaColagem(dados)[0] || null;

// As imagens do que o navigator.clipboard.read() devolveu ("Colar imagem" do 📎): um image/* de cada item.
async function imagensDosItens(itens) {
  const out = [];
  for (const it of Array.from(itens || [])) {
    const tipo = Array.from(it.types || []).find(ehImagem);
    if (tipo) out.push(await it.getType(tipo));
  }
  return out;
}
const imagemDosItens = async itens => (await imagensDosItens(itens))[0] || null;

// 0.9.0.15 (CONTRATO-0915, 8.1): o pedido da orquestra (o vigia, os crons, o maestro pelo orq.py) vem marcado no mime
// ("orq/so-livre" ou "orq/fila"). Não é anexo: nunca vira clipe, miniatura, chip de imagem nem "Mandar de novo" com
// imagem (o agente 0.9.0.15 também o trata como "sem anexo").
const daOrquestra = mime => /^orq\//i.test(String(mime || ""));
const MARCA_ORQ = /^🎼 Orquestra \[orq:[0-9A-Za-z_-]{1,40}\]:\s*/;   // o começo do recado repassado pelo maestro (8.3)
const temAnexo = mime => !!String(mime || "") && !daOrquestra(mime);
// Corretor de 12/11 (o crítico): o pedido da orquestra no chat não é mensagem MINHA. Enquanto espera a sessão ficar
// livre (até 30 min), no erro e quando foi digitado no VS Code, ele aparecia como balão meu, com "Tentar de novo" e
// "Editar", que o mandavam de novo como pedido do Arthur (sem a marca e sem a trava "só livre"). Agora é uma linha de
// outra sessão ("↪ 🎼 orquestra: …"), com o andamento na frente e sem nenhum botão.
const NOME_ORQ = "🎼 orquestra";
const CABECA_ORQ = /^\s*(?:🎼\s*)?Orquestra(?:\s*\(([^()]{1,60})\))?\s*:\s*/;   // o mesmo começo do entregar.py
const ICONE_ORQ = {esperando: "⏳ ", fila: "🕓 ", enviado: "🕓 ", entregue: "✓ ", erro: "⚠ "};
function corpoDaOrquestra(texto) {   // o texto sem o "🎼 Orquestra (<quem>):" do começo; o quem fica entre parênteses
  const t = String(texto || ""), m = CABECA_ORQ.exec(t);
  if (!m) return t.trim();
  const resto = t.slice(m[0].length).trim(), quem = String(m[1] || "").trim();
  return quem && resto ? `(${quem}) ${resto}` : resto;
}
function linhaDaOrquestra(base, est) {   // a linha do pedido da orquestra, no lugar do balão meu
  const detalhe = (est.sinal === "erro" || est.sinal === "esperando") && est.erro ? ` — ${est.erro}` : "";
  return {...base, de: "sessao", nome: NOME_ORQ, orqPedido: true, sinal: est.sinal,
          texto: (ICONE_ORQ[est.sinal] || "") + corpoDaOrquestra(est.texto) + detalhe};
}

// Quantas imagens o pedido leva: "image/jpeg" é uma (no próprio pedido); "imagens/<grupo>/<n>" são n, cada uma num
// pedido acao "anexo" à parte (0.8.2). O da orquestra ("orq/…"), nenhuma.
function nImagens(mime) {
  if (!temAnexo(mime)) return 0;
  const m = /^imagens\/[^/]+\/(\d+)$/.exec(String(mime || ""));
  return m ? Number(m[1]) : ehImagem(mime) || /^salva\//.test(String(mime || "")) ? 1 : 0;
}

// ---- 0.9.0.15 (CONTRATO-0915, 8.5 C): a foto reduzida antes do cel_pedir -------------------------------------------
// O que fez a "atenção" do SEAZONE192 em 12/11: 9 fotos de 172–417 KB, ~3,8 MB em base64 no cel_pedir. A página manda
// o lado maior até 1600 px, em JPEG de qualidade 0,8 (o print de tela em PNG vira JPEG); a foto já pequena (até 1600 px
// e 200 KB), ou a que ficaria maior reduzida, vai como está. Como está só vai o que o PC guarda (jpeg, png e webp: o
// IMAGENS do agente.py); o GIF, o HEIC e o resto viram JPEG (o PC recusaria o GIF: "chegou quebrado"). A foto com a
// orientação no EXIF (virada) vai desenhada já de pé, nunca como está: o PC e o Claude podem não ler o EXIF.
const FOTO_LADO = 1600, FOTO_QUALIDADE = 0.8;
const FOTO_PEQUENA = 200 * 1024;      // bytes: até isso (e 1600 px) a foto já é pequena; recomprimir perde nitidez à toa
const FOTO_MAX = 1050000;             // bytes: ~1,4 MB em base64, o teto de sempre da imagem do celular
const PC_GUARDA = ["image/jpeg", "image/png", "image/webp"];

// O tipo de verdade pelo começo do arquivo (o "type" do arquivo pode mentir: o iPhone às vezes chama HEIC de jpeg).
function tipoDosBytes(b) {
  const u = b || [], ini = (...xs) => xs.every((x, i) => u[i] === x);
  const asc = (de, n) => String.fromCharCode(...Array.from({length: n}, (_, i) => u[de + i] || 0));
  if (ini(0xFF, 0xD8, 0xFF)) return "image/jpeg";
  if (ini(0x89, 0x50, 0x4E, 0x47)) return "image/png";
  if (asc(0, 4) === "RIFF" && asc(8, 4) === "WEBP") return "image/webp";
  if (asc(0, 4) === "GIF8") return "image/gif";
  return "";
}

// A orientação do EXIF (1 a 8; 1 = de pé, também sem EXIF) de um JPEG (segmento APP1) ou de um WEBP (pedaço EXIF).
function orientacaoTiff(u, ini, fim) {
  if (fim - ini < 8) return 1;
  const le = u[ini] === 0x49 && u[ini + 1] === 0x49;
  if (!le && !(u[ini] === 0x4D && u[ini + 1] === 0x4D)) return 1;
  const n16 = p => p + 1 < fim ? (le ? u[p] | u[p + 1] << 8 : u[p] << 8 | u[p + 1]) : 0;
  const n32 = p => p + 3 < fim ? (le ? (u[p] | u[p + 1] << 8 | u[p + 2] << 16) + u[p + 3] * 0x1000000
                                     : u[p] * 0x1000000 + (u[p + 1] << 16 | u[p + 2] << 8 | u[p + 3])) : 0;
  const ifd = ini + n32(ini + 4), total = n16(ifd);
  for (let i = 0; i < total; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > fim) break;
    if (n16(e) === 0x0112) { const v = n16(e + 8); return v >= 1 && v <= 8 ? v : 1; }
  }
  return 1;
}
function orientacaoExif(b) {
  const u = b || [], tipo = tipoDosBytes(u);
  const exif = p => u[p] === 0x45 && u[p + 1] === 0x78 && u[p + 2] === 0x69 && u[p + 3] === 0x66 && !u[p + 4] && !u[p + 5];
  if (tipo === "image/jpeg") {
    for (let p = 2; p + 4 < u.length;) {
      if (u[p] !== 0xFF) return 1;
      if (u[p + 1] === 0xFF) { p++; continue; }   // byte de enchimento entre os segmentos
      const marca = u[p + 1], tam = u[p + 2] << 8 | u[p + 3];
      if (marca === 0xD8 || marca >= 0xD0 && marca <= 0xD7 || marca === 0x01) { p += 2; continue; }
      if (marca === 0xDA || marca === 0xD9 || tam < 2) return 1;   // começou a imagem: sem EXIF antes
      if (marca === 0xE1 && exif(p + 4)) return orientacaoTiff(u, p + 10, Math.min(u.length, p + 2 + tam));
      p += 2 + tam;
    }
    return 1;
  }
  if (tipo === "image/webp") {
    for (let p = 12; p + 8 <= u.length;) {
      const nome = String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]);
      const tam = (u[p + 4] | u[p + 5] << 8 | u[p + 6] << 16) + u[p + 7] * 0x1000000;
      if (nome === "EXIF") { const d = p + 8 + (exif(p + 8) ? 6 : 0); return orientacaoTiff(u, d, Math.min(u.length, p + 8 + tam)); }
      p += 8 + tam + (tam & 1);
    }
  }
  return 1;
}

// O tamanho reduzido (o lado maior até `lado`; a menor nunca é ampliada).
function ladoReduzido(w, h, lado = FOTO_LADO) {
  const k = Math.min(1, lado / Math.max(w || 1, h || 1));
  return {w: Math.max(1, Math.round((w || 1) * k)), h: Math.max(1, Math.round((h || 1) * k))};
}
// Os bytes de um base64 (sem o cabeçalho data:).
const bytesDoBase64 = b64 => { const s = String(b64 || "").replace(/\s/g, ""); return Math.max(0, Math.floor(s.length * 3 / 4) - (s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0)); };

// Como a foto escolhida vai: o = {tipo (tipoDosBytes), bytes, w, h (já de pé), orientacao}; reduzida = os bytes do JPEG
// reduzido, quando já se sabe (0: não deu para reduzir). "original" (como está), "reduzida" ou, sem a reduzida, "comparar"
// (a página reduz e pergunta de novo).
function comoVaiAFoto(o, reduzida) {
  if (!PC_GUARDA.includes(o.tipo) || (o.orientacao || 1) > 1 || Math.max(o.w || 0, o.h || 0) > FOTO_LADO
      || !(o.bytes > 0) || o.bytes > FOTO_MAX) return "reduzida";
  if (o.tipo !== "image/png" && o.bytes <= FOTO_PEQUENA) return "original";       // a foto já pequena
  if (reduzida === undefined || reduzida === null) return "comparar";
  return reduzida > 0 && reduzida < o.bytes ? "reduzida" : "original";             // reduzida ficaria maior: como está
}

// ---- Responder a uma mensagem (0.8.3, arrastar o balão para o lado como no WhatsApp) -------------------------
// A citação vai na frente do texto, numa linha, do jeito que o Claude lê sem ambiguidade:
//   ↩ Respondendo a (Claude, 08:14): "começo da mensagem" — o texto
// (a entrega no VS Code é de uma linha só). O trecho não leva aspas duplas (viram simples), e o celular separa de novo
// a citação para desenhar o balão.
const CITA = /^↩\uFE0F? Respondendo a \(([^,()]+), (\d{1,2}:\d{2})\): "([^"]*)"\s*(?:—\s*)?/;   // o ↩ pode vir com o seletor de emoji (U+FE0F)
const MAX_TRECHO = 200;
function citacao(m) {   // m: {nome, hora, texto, foto?}
  let trecho = String(m.texto || "").replace(/\s+/g, " ").trim();
  if (m.foto) trecho = `foto ${m.foto}` + (trecho ? `: ${trecho}` : "");
  trecho = trecho.replace(/"/g, "'") || "mensagem";
  if (trecho.length > MAX_TRECHO) trecho = trecho.slice(0, MAX_TRECHO - 1).trimEnd() + "…";
  return `↩ Respondendo a (${String(m.nome).replace(/[,()]/g, " ").trim()}, ${m.hora}): "${trecho}"`;
}
const comCitacao = (cita, texto) => cita ? `${cita} — ${texto}` : texto;
function separarCitacao(texto) {
  const t = String(texto || ""), m = CITA.exec(t);
  return m ? {cita: {nome: m[1], hora: m[2], trecho: m[3]}, texto: t.slice(m[0].length)} : {cita: null, texto: t};
}
// A mensagem original de uma citação, entre as linhas do chat: a mesma hora e o mesmo começo (ou a mesma foto).
function acharCitada(linhas, cita, horaDe) {
  const trecho = cita.trecho.replace(/…$/, "");
  const foto = /^foto (\S+)/.exec(trecho);
  const alvo = normalizar(foto ? trecho.slice(foto[0].length).replace(/^: /, "") : trecho).toLowerCase().slice(0, 60);
  return (linhas || []).find(l => l.tipo === "msg" && horaDe(l.t) === cita.hora && (
    foto ? (l.fotos || []).some(f => f.nome === foto[1]) || (l.docs || []).some(d => d.nome === foto[1]) || (!alvo && (l.minis || l.mini || l.n_imagens))
         : normalizar(separarCitacao(l.texto).texto).toLowerCase().replace(/"/g, "'").startsWith(alvo))) || null;
}

// A lista com o item i levado para a posição j (reordenar as prévias arrastando).
function mover(lista, i, j) {
  const out = [...lista], [x] = out.splice(i, 1);
  out.splice(Math.max(0, Math.min(out.length, j)), 0, x);
  return out;
}

const Chat = {SINAL, normalizar, versaoMin, montar, estadoDoPedido, pelaCaixa, pedidosDaSessao, respostaDeEnquete, textoResposta,
  AGENTE_QUALQUER, SELO, viaDaResposta, viaDoErro, motivoSemEntrega,
  ESPERANDO, respostaDePermissao, traduzirBotao, botoesPermissao, textoPermissao, reenviavel, MAX_IMAGENS, imagensDaColagem, imagensDosItens,
  nImagens, mover, citacao, comCitacao, separarCitacao, acharCitada,
  daOrquestra, temAnexo, corpoDaOrquestra, NOME_ORQ, FOTO_LADO, FOTO_QUALIDADE, FOTO_PEQUENA, FOTO_MAX, PC_GUARDA, tipoDosBytes, orientacaoExif,
  ladoReduzido, bytesDoBase64, comoVaiAFoto,
  rotuloDia, marcacao, escolhidas, completas, acaoResponder, conversaDe, imagemDaColagem, imagemDosItens, esc};
if (typeof module !== "undefined" && module.exports) module.exports = Chat;
else raiz.Chat = Chat;
})(typeof window !== "undefined" ? window : globalThis);
