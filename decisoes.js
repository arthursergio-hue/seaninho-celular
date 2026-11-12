// Seaninho no celular: a tela Decisões (v24, pedido do Arthur de 11/11: "a mesma tela Decisões do Monitor geral, um
// card por pergunta, as opções lado a lado, as imagens e a recomendada marcada; arrastar para a direita é gostei e para
// a esquerda é não gostei; um campo de comentário em cada card; a resposta volta a quem mandou como no Monitor; as
// imagens leves").
// As regras são as do scripto/decisoes.py e do geral_decisoes.js do Pro: a recomendada só marcada nunca conta como
// escolha; a opção levada para Gostei vira a escolhida; a levada para Não gostei vai para "descartadas"; descartadas
// todas, a pergunta volta para reavaliar com opção ""; a pergunta inteira em Não gostei é "nenhuma serve"; card sem
// opções é sim ou não; o que fica no meio vai como "sem_resposta".
// O que o agente publica e o que a página manda está no CONTRATO-v24 (seções 2 e 8). Corrigido em 12/11 (o banco só
// aceita id hex na tabela fotos): o lote inteiro vem DENTRO do índice do hoje.painel.decisoes, no campo "lote" (sem
// blob), e cada imagem é uma id de 32 hex no "img" da opção (miniatura "media"; a grande, "alta", só quando a pessoa
// abre). O tipo da imagem vem do campo onde a id aparece, nunca da id. O lote pode vir sem o conteúdo: "grande" (o
// índice passou do teto), "so_indice" (a cópia do outro PC, que só vale sem a do dono) ou "pessoal" (sessão de pasta
// pessoal: só o título fixo, sem botões).
// As contas não têm tela e rodam no Node (test_decisoes.cjs). O DOM fica nos html* (texto puro) e no ligar/porFoto,
// que só existem no navegador. O conteúdo dos lotes vem das sessões: é dado, sempre escapado.
(function (raiz) {
"use strict";

const COLUNAS = ["gostei", "nao_gostei", "meio"];
const MAX_PEDIDO = 8000;          // o texto do cel_pedir (length() do Postgres: letras, não bytes)
const MAX_COMENTARIO = 4000;      // o mesmo do decisoes.py (por card; a página não corta: avisa e não deixa enviar)
const AVISO_COMENTARIO = 3200;    // a partir daqui o contador aparece debaixo da caixa ("3.950/4.000")
const MAX_CARTOES = 30, MAX_OPCOES = 6, MAX_LOTES = 20, MAX_RESPONDIDOS = 10;
const PILHA_MAX = 60;             // quantos passos o Desfazer guarda por lote
const TEXTO_CURTO = 140;          // contexto ou efeito maior que isso (ou com mais de 2 linhas) ganha o "mais"
const INICIO_PX = 10;             // até aqui o dedo ainda é um toque
const LIMIAR_PX = 90, LIMIAR_FRACAO = 0.3, LIMIAR_MIN = 40;  // o arrasto que decide: 30% da largura ou 90 px
const RAZAO = 1.4;                // de lado só quando |dx| > 1,4 |dy| (a página rola na vertical)
const SEGURAR_MS = 260;           // na linha de opções que rola para o lado, segurar antes de arrastar
// A id de uma imagem na tabela fotos: só hex (a trava fotos_id_check do banco; o agente manda 32). Outra coisa não vai
// ao cel_foto.
const FOTO_ID = /^[0-9a-f]{16,40}$/;
// As frases do lote que não vem para o celular (CONTRATO, seção 2): o que passou do teto e o de sessão pessoal.
const TITULO_PESSOAL = "Decisão de uma sessão pessoal";
const MSG_GRANDE = "Lote grande demais para o celular: abra no Monitor geral.";
// O "so_indice" que ficou sem a cópia do PC dono (o hoje dele velho, ou o PC desligado): o lote não é grande, o PC dele
// é que não está publicando (corretor final de 12/11, o cético: antes dizia "grande demais")
const MSG_FORA = "O PC deste lote não está publicando agora: abra no Monitor geral.";
const MSG_PESSOAL = "Decisão de uma sessão pessoal: responda no Monitor geral, no PC.";
const SRC_OK = /^(?:data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*|blob:[^"'<>\s]{1,300})$/;
const ROTULO = {gostei: "Gostei", nao_gostei: "Não gostei (reavaliar)", sem_resposta: "Sem resposta"};
const ANDAMENTO = {esperando: "esperando", a_caminho: "a caminho", chegou: "chegou", nao_chegou: "não chegou"};
const AVISO_MUDOU = "Este card mudou na sessão depois da sua escolha: confira e decida de novo";
// O quadro de colunas do Monitor (dz-abas da tela estreita): 👎 Não gostei · Para decidir · 👍 Gostei, com as contagens,
// preso no alto da tela; o toque filtra os cards por coluna (Todos é o padrão). O pedido do Arthur era "arrastar para a
// direita o que eu gostar e colocar numa coluna à esquerda o que eu não gostar": num lote grande, a barra mostra de
// relance o que foi para cada lado. Depois de cada decisão, o aviso curto "Card 3 → 👎 Não gostei · Desfazer" (dz-snack).
const FILTROS = ["todos", "nao_gostei", "meio", "gostei"];
const ROT_COLUNA = {nao_gostei: "👎 Não gostei", meio: "Para decidir", gostei: "👍 Gostei", todos: "Todos"};
const AVISO_MS = 5000;
const filtros = new Map();   // chave do lote -> o filtro escolhido (fica entre um desenho e outro)
const avisoSaiu = op => `A opção ${op} que você tinha escolhido saiu do lote: escolha de novo`;

const txt = v => (v == null ? "" : String(v));
const esc = t => txt(t).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const objeto = x => !!x && typeof x === "object" && !Array.isArray(x);
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const letras = t => Array.from(txt(t)).length;   // como o length() do Postgres (o emoji conta 1)
// Uma linha, como o _uma_linha do Pro: a quebra vira " / " e os espaços se juntam.
const umaLinha = t => txt(t).replace(/\r\n?/g, "\n").replace(/\n/g, " / ").replace(/\s+/g, " ").trim();
const corta = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
const mil = n => Number(n).toLocaleString("pt-BR");

// ---- O lote: o índice do hoje com o conteúdo dentro ("lote") --------------------------------------------------------
const cartoesDe = l => (l && Array.isArray(l.cartoes) ? l.cartoes.filter(objeto) : []);
const opcoesDe = c => (c && Array.isArray(c.opcoes) ? c.opcoes.filter(objeto) : []);
const idsOpcoes = c => opcoesDe(c).map(o => txt(o.id));
const cartaoDe = (l, id) => cartoesDe(l).find(c => txt(c.id) === txt(id)) || null;
const ident = v => (typeof v === "string" || (typeof v === "number" && Number.isFinite(v)) ? txt(v).replace(/\s+/g, " ").trim() : "");
const bloco = v => (typeof v === "string" || typeof v === "number" ? txt(v).replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim() : "");
const linha = v => umaLinha(bloco(v));   // título: só texto (um objeto no lugar do título não vira "[object Object]")

// O conteúdo do lote ({"cartoes": […]}, o campo "lote" do índice) conferido como o validar_lote do Pro, sem levantar:
// cartões e opções com id único, até 30 e 6, a recomendada só se for uma das opções, a imagem só como id hex (outra
// coisa vira img_erro). null sem nenhum cartão.
function normalizar(bruto) {
  if (!objeto(bruto)) return null;
  const vistos = new Set(), cartoes = [];
  // tira os repetidos e só então corta nos limites (30 cartões, 6 opções); o resto de um lote enorme nem é lido
  for (const c of (Array.isArray(bruto.cartoes) ? bruto.cartoes : []).slice(0, MAX_CARTOES * 4)) {
    if (cartoes.length >= MAX_CARTOES) break;
    const id = objeto(c) ? ident(c.id) : "";
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const ids = new Set(), opcoes = [];
    for (const o of (Array.isArray(c.opcoes) ? c.opcoes : []).slice(0, MAX_OPCOES * 4)) {
      if (opcoes.length >= MAX_OPCOES) break;
      const oid = objeto(o) ? ident(o.id) : "";
      if (!oid || ids.has(oid)) continue;
      ids.add(oid);
      const op = {id: oid, titulo: linha(o.titulo), efeito: bloco(o.efeito), detalhe: bloco(o.detalhe), img: "", img_erro: ""};
      if (FOTO_ID.test(txt(o.img))) op.img = txt(o.img);
      else if (o.img_erro || o.falta) op.img_erro = linha(o.img_erro || o.falta).slice(0, 200) || "imagem não veio";
      else if (o.img) op.img_erro = "imagem em formato desconhecido";
      opcoes.push(op);
    }
    const rec = ident(c.recomendada);
    cartoes.push({id, titulo: linha(c.titulo) || `Card ${id}`, contexto: bloco(c.contexto), porque: bloco(c.porque),
      recomendada: ids.has(rec) ? rec : "", opcoes});
  }
  if (!cartoes.length) return null;
  return {id: ident(bruto.id), titulo: linha(bruto.titulo), sessao: linha(bruto.sessao), pc: linha(bruto.pc),
    criado: txt(bruto.criado), cartoes};
}

// A versão do conteúdo de um lote na página: a marca do Pro (que não olha as imagens) + as imagens de cada opção. O
// rascunho e a folha de conferência valem para uma versão; a imagem trocada também conta (o card mostra outra coisa).
function versaoDe(marca, conteudo) {
  if (!objeto(conteudo)) return "";
  const imgs = cartoesDe(conteudo).map(c => [txt(c.id), opcoesDe(c).map(o => [txt(o.id), txt(o.img), txt(o.img_erro)])]);
  return `${txt(marca)}|${hashTxt(JSON.stringify(imgs))}`;
}

// O lote para a tela: o item do índice (juntarLotes) com o conteúdo dele, o campo "lote" do índice (`conteudo` só no
// Refazer, que usa o conteúdo guardado no aparelho, e nos testes). O que é do índice vale (o PC, a marca, o "via", o
// online, o reenviar e quem publicou); o resto vem do conteúdo. null sem conteúdo (o "grande", o "so_indice" sem a
// cópia do dono e o pessoal: ver semConteudo) ou se o conteúdo for de outro lote.
function montarLote(indice, conteudo) {
  if (!objeto(indice) || indice.pessoal === true) return null;
  const bruto = conteudo === undefined ? indice.lote : conteudo, n = normalizar(bruto);
  if (!n || (n.id && txt(indice.id) && n.id !== txt(indice.id))) return null;
  return Object.assign(n, {id: txt(indice.id) || n.id, titulo: txt(indice.titulo) || n.titulo || txt(indice.id),
    sessao: txt(indice.sessao) || n.sessao, pc: txt(indice.pc) || n.pc, criado: txt(indice.criado) || n.criado,
    marca: txt(indice.marca), ver: txt(indice.ver) || versaoDe(indice.marca, bruto), via: indice.via === "rede" ? "rede" : "local",
    online: indice.online !== false, reenviar: objeto(indice.reenviar) ? indice.reenviar : null,
    publicado_por: txt(indice.publicado_por) || txt(indice.pc) || n.pc,
    chave: txt(indice.chave) || `${txt(indice.pc) || n.pc}|${txt(indice.id) || n.id}`});
}
// Por que o lote não vem para o celular: {tipo: "pessoal" | "grande" | "fora" | "vazio" | "", msg}. O "so_indice" que
// ficou (a cópia do dono não está: o hoje dele velho, ou o PC desligado) é "fora", com a frase própria; o conteúdo
// está no Monitor geral, como o do "grande".
function semConteudo(item) {
  if (!objeto(item)) return {tipo: "", msg: ""};
  if (item.pessoal === true) return {tipo: "pessoal", msg: MSG_PESSOAL};
  if (Array.isArray(item.cartoes) && item.cartoes.length) return {tipo: "", msg: ""};   // o lote já montado (montarLote)
  if (!objeto(item.lote) && item.so_indice === true && item.grande !== true) return {tipo: "fora", msg: MSG_FORA};
  if (!objeto(item.lote)) return {tipo: "grande", msg: MSG_GRANDE};
  if (!normalizar(item.lote)) return {tipo: "vazio", msg: "O lote chegou sem perguntas: confira no Monitor geral."};
  return {tipo: "", msg: ""};
}

// ---- Os PCs: juntar o que cada um publicou --------------------------------------------------------------------------
const listaPcs = pcs => (Array.isArray(pcs) ? pcs : objeto(pcs) ? Object.values(pcs) : []).filter(objeto);
function decisoesDe(p) {
  const d = p.hoje && p.hoje.painel && p.hoje.painel.decisoes;
  return objeto(d) ? d : objeto(p.decisoes) ? p.decisoes : null;
}
const chaveDe = (pc, id) => `${txt(pc).trim().toLowerCase()}|${txt(id)}`;
const msDe = t => { const v = Date.parse(txt(t)); return Number.isFinite(v) ? v : 0; };

// Percorre a lista `campo` do painel.decisoes de cada PC e junta pelo (PC do lote, id): o item publicado pelo próprio PC
// do lote ("via": "local") vale mais que a cópia que veio pela rede. `prefere(novo, velho)` desempata.
function juntarCampo(pcs, campo, max, prefere) {
  const por = new Map();
  for (const p of listaPcs(pcs)) {
    const d = decisoesDe(p), quem = txt(p.pc).trim();
    if (!d || !Array.isArray(d[campo])) continue;
    for (const x of d[campo].slice(0, max)) {
      if (!objeto(x) || !ident(x.id)) continue;
      const pc = txt(x.pc).trim() || quem;
      if (!pc) continue;
      const via = x.via === "rede" || x.via === "local" ? x.via : (quem && quem.toLowerCase() !== pc.toLowerCase() ? "rede" : "local");
      const item = Object.assign({}, x, {id: ident(x.id), pc, via, publicado_por: quem || pc, chave: `${pc}|${ident(x.id)}`});
      const k = chaveDe(pc, item.id), ja = por.get(k);
      const fica = !ja || prefere(item, ja) ? item : ja;
      // uma cópia que diz que o PC do lote está desligado vale para as duas (a resposta espera ele voltar)
      if (ja && (item.online === false || ja.online === false)) fica.online = false;
      // o "pessoal" fica o da cópia que vale: a do dono sabe de que pasta é a sessão; o outro PC marca na dúvida
      por.set(k, fica);
    }
  }
  return [...por.values()];
}
const localPrimeiro = (a, b) => (a.via === "local" && b.via !== "local");
// Entre duas cópias de um lote: a do PC dono ("local") e, entre iguais, a que traz o conteúdo (a "so_indice" e a
// "grande" vêm sem ele).
const comConteudo = l => objeto(l.lote) && l.pessoal !== true;
const loteMelhor = (a, b) => localPrimeiro(a, b) || (a.via === b.via && comConteudo(a) && !comConteudo(b));

// Os lotes esperando, de todos os PCs, uma vez cada, o mais novo primeiro. O lote que já aparece nas respondidas (o
// celular ou o Monitor respondeu e o índice ainda não andou) sai, menos o que voltou com o "reenviar". Cada um com o
// conteúdo ("lote", ou null), o "grande", o "so_indice", o "pessoal" (com o título fixo e sem a sessão, mesmo que uma
// cópia traga mais) e a versão do conteúdo ("ver").
function juntarLotes(pcs) {
  const resp = new Set(juntarRespondidos(pcs).map(r => chaveDe(r.pc, r.id)));
  return juntarCampo(pcs, "lotes", MAX_LOTES * 2, loteMelhor)
    .filter(l => objeto(l.reenviar) || !resp.has(chaveDe(l.pc, l.id)))
    .map(l => {
      const pessoal = l.pessoal === true, lote = !pessoal && objeto(l.lote) ? l.lote : null;
      return Object.assign(l, {titulo: pessoal ? TITULO_PESSOAL : txt(l.titulo) || l.id, sessao: pessoal ? "" : txt(l.sessao),
        criado: txt(l.criado), n: Math.max(0, Number(l.n) || 0), marca: txt(l.marca), lote, grande: l.grande === true,
        so_indice: l.so_indice === true, pessoal, ver: lote ? versaoDe(l.marca, lote) : "",
        online: l.online !== false, reenviar: objeto(l.reenviar) ? l.reenviar : null});
    })
    .sort((a, b) => msDe(b.criado) - msDe(a.criado) || a.chave.localeCompare(b.chave));
}
// As respondidas (resumo e andamento), a mais nova primeiro; entre duas cópias, a de envio mais novo e depois a local.
function juntarRespondidos(pcs) {
  return juntarCampo(pcs, "respondidos", MAX_RESPONDIDOS * 3,
    (a, b) => msDe(a.enviado) > msDe(b.enviado) || (msDe(a.enviado) === msDe(b.enviado) && localPrimeiro(a, b)))
    .map(r => Object.assign(r, {titulo: txt(r.titulo) || r.id, enviado: txt(r.enviado), resumo: txt(r.resumo)}))
    .sort((a, b) => msDe(b.enviado) - msDe(a.enviado) || a.chave.localeCompare(b.chave));
}
function juntarErros(pcs) {
  return juntarCampo(pcs, "erros", 50, () => false).map(e => ({pc: e.pc, id: e.id, chave: e.chave, erro: linha(e.erro).slice(0, 300) || "lote com erro"}));
}
const juntar = pcs => ({lotes: juntarLotes(pcs), respondidos: juntarRespondidos(pcs), erros: juntarErros(pcs)});

// ---- O estado de um lote enquanto a pessoa decide --------------------------------------------------------------------
// {chave, id, info: {cartao: {ids, rec}}, cartoes: {cartao: {coluna, opcao, descartadas, comentario, ass, aviso}},
// pilha}. "opcao" é só a que a PESSOA escolheu (a recomendada nunca entra sozinha). "ass": a marca do conteúdo do card;
// o rascunho de um card que mudou volta ao meio com o aviso (o comentário fica), como no Pro (Alfred, PR #61).
function hashTxt(t) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(36);
}
const marcaCartao = c => hashTxt(JSON.stringify([txt(c.id), txt(c.titulo), txt(c.contexto), txt(c.porque), txt(c.recomendada),
  opcoesDe(c).map(o => [txt(o.id), txt(o.titulo), txt(o.efeito), txt(o.detalhe), txt(o.img), txt(o.img_erro)])]));
const vazio = ass => ({coluna: "meio", opcao: "", descartadas: [], comentario: "", ass: ass || "", aviso: ""});

function novoEstado(lote, rascunho) {
  const est = {chave: txt(lote && lote.chave), id: txt(lote && lote.id), info: {}, cartoes: {}, pilha: []};
  const r = objeto(rascunho) && objeto(rascunho.cartoes) ? rascunho.cartoes : {};
  for (const c of cartoesDe(lote)) {
    const id = txt(c.id), ids = idsOpcoes(c), ass = marcaCartao(c);
    est.info[id] = {ids, rec: ids.includes(txt(c.recomendada)) ? txt(c.recomendada) : ""};
    const a = vazio(ass), d = objeto(r[id]) ? r[id] : null;
    est.cartoes[id] = a;
    if (!d) continue;
    a.comentario = txt(d.comentario);   // inteiro: o que passar do limite a folha aponta (nada é cortado em silêncio)
    const col = COLUNAS.includes(d.coluna) ? d.coluna : "meio", op = txt(d.opcao);
    const fora = (Array.isArray(d.descartadas) ? d.descartadas : []).map(txt).filter((x, i, l) => ids.includes(x) && l.indexOf(x) === i);
    const decidiu = col !== "meio" || !!op || fora.length > 0;
    if (decidiu && txt(d.ass) && d.ass !== ass) { a.aviso = AVISO_MUDOU; continue; }
    if (op && !ids.includes(op)) { a.aviso = avisoSaiu(op); continue; }
    a.opcao = op;
    a.descartadas = fora.filter(x => x !== op);
    a.coluna = col;
    if (col === "gostei" && ids.length && !op) a.coluna = "meio";   // Gostei sem a opção escolhida não vale
    if (ids.length && a.descartadas.length === ids.length) { a.coluna = "nao_gostei"; a.opcao = ""; }
  }
  return est;
}
// A respondida reaberta para refazer: o quadro como foi mandado (o "respostas" do pedido guardado no aparelho).
function estadoDaResposta(lote, respostas) {
  const cartoes = {};
  for (const x of Array.isArray(respostas) ? respostas : []) {
    if (!objeto(x)) continue;
    cartoes[txt(x.cartao)] = {coluna: x.coluna === "gostei" || x.coluna === "nao_gostei" ? x.coluna : "meio",
      opcao: x.coluna === "sem_resposta" ? "" : txt(x.opcao), comentario: txt(x.comentario), descartadas: x.descartadas};
  }
  return novoEstado(lote, {cartoes});
}
// O que guardar no aparelho enquanto a pessoa decide (pequeno: sem o lote).
function rascunhoDe(est) {
  const cartoes = {};
  for (const [id, a] of Object.entries((est && est.cartoes) || {})) {
    if (a.coluna === "meio" && !a.opcao && !a.descartadas.length && !a.comentario) continue;
    cartoes[id] = {coluna: a.coluna, opcao: a.opcao, descartadas: a.descartadas.slice(), comentario: a.comentario, ass: a.ass};
  }
  return {chave: txt(est && est.chave), cartoes};
}
function copiar(est) {
  const cartoes = {};
  for (const [k, a] of Object.entries(est.cartoes)) cartoes[k] = Object.assign({}, a, {descartadas: a.descartadas.slice()});
  return Object.assign({}, est, {cartoes, pilha: est.pilha.slice()});
}

// Uma ação na tela: {cartao, opcao?, coluna} ou {cartao, comentario}. Devolve {estado, ok, msg, todas?}; o estado de
// antes nunca muda. Com opção: "gostei" = a opção vira a escolhida e a pergunta vai para Gostei; "nao_gostei" = a opção
// é descartada (descartadas todas, a pergunta volta para reavaliar com opção ""); "meio" = desfaz a opção (a descartada
// volta, a escolhida deixa de ser). Sem opção (o card inteiro): "gostei" só no card sem opções (sim) ou com uma opção
// já escolhida; "nao_gostei" = nenhuma serve; "meio" = o card volta a ficar sem resposta (o comentário fica).
function aplicar(est, acao) {
  const sai = (estado, ok, msg, extra) => Object.assign({estado, ok, msg: msg || ""}, extra || {});
  if (!est || !objeto(est.cartoes) || !objeto(acao)) return sai(est, false);
  const id = txt(acao.cartao), a = est.cartoes[id], info = est.info && est.info[id];
  if (!a || !info) return sai(est, false, `O card ${corta(id, 40)} não está neste lote`);
  if (!("coluna" in acao) && "comentario" in acao) {
    const t = txt(acao.comentario);   // inteiro (o crítico viu o maxlength cortar 8.000 em 4.000 sem aviso)
    if (t === a.comentario) return sai(est, true);
    const n = copiar(est);
    n.cartoes[id].comentario = t;
    return sai(n, true);
  }
  const col = acao.coluna, op = txt(acao.opcao);
  if (!COLUNAS.includes(col)) return sai(est, false, `Card ${id}: coluna inválida`);
  if (op && !info.ids.includes(op)) return sai(est, false, `Card ${id}: a opção ${corta(op, 40)} não existe`);
  const n = copiar(est), b = n.cartoes[id];
  n.pilha.push({cartao: id, coluna: a.coluna, opcao: a.opcao, descartadas: a.descartadas.slice()});
  if (n.pilha.length > PILHA_MAX) n.pilha.shift();
  b.aviso = "";
  let todas = false;
  if (op && col === "gostei") {
    if (a.coluna === "gostei" && a.opcao === op) return sai(est, false);
    b.coluna = "gostei"; b.opcao = op; b.descartadas = b.descartadas.filter(x => x !== op);
  } else if (op && col === "nao_gostei") {
    if (a.descartadas.includes(op)) return sai(est, false);
    b.descartadas.push(op);
    if (b.opcao === op) { b.opcao = ""; if (b.coluna === "gostei") b.coluna = "meio"; }
    if (info.ids.every(x => b.descartadas.includes(x))) { b.coluna = "nao_gostei"; b.opcao = ""; todas = true; }
  } else if (op) {   // meio: a opção volta
    if (a.descartadas.includes(op)) {
      b.descartadas = b.descartadas.filter(x => x !== op);
      if (b.coluna === "nao_gostei" && !b.opcao) b.coluna = "meio";
    } else if (a.opcao === op) { b.opcao = ""; b.coluna = "meio"; }
    else return sai(est, false);
  } else if (col === "gostei") {
    if (a.coluna === "gostei") return sai(est, false);
    // com opções, quem diz de qual gostou é a opção (o card inteiro para a direita não aprova a recomendada sozinha)
    if (info.ids.length) {
      const msg = info.ids.every(x => a.descartadas.includes(x))
        ? `Card ${id}: todas as opções foram descartadas; traga uma de volta (↩) antes de pôr em Gostei`
        : `Card ${id}: arraste para a direita a opção de que você gostou (ou toque no 👍 dela)`;
      return sai(est, false, msg);
    }
    b.coluna = "gostei";
  } else if (col === "nao_gostei") {
    if (a.coluna === "nao_gostei" && !a.opcao) return sai(est, false);
    b.coluna = "nao_gostei"; b.opcao = "";   // a pergunta inteira: nenhuma serve
  } else {
    if (a.coluna === "meio" && !a.opcao && !a.descartadas.length) return sai(est, false);
    b.coluna = "meio"; b.opcao = ""; b.descartadas = [];
  }
  return sai(n, true, "", {todas});
}

// Volta o último passo (não o comentário). {estado, desfeito: o id do card | ""}.
function desfazer(est) {
  if (!est || !Array.isArray(est.pilha) || !est.pilha.length) return {estado: est, desfeito: ""};
  const n = copiar(est), u = n.pilha.pop(), a = n.cartoes[u.cartao];
  if (!a) return {estado: n, desfeito: ""};
  Object.assign(a, {coluna: u.coluna, opcao: u.opcao, descartadas: u.descartadas.slice(), aviso: ""});
  return {estado: n, desfeito: u.cartao};
}

function contar(lote, est) {
  const n = {gostei: 0, nao_gostei: 0, meio: 0, total: 0};
  for (const c of cartoesDe(lote)) {
    const a = est && est.cartoes && est.cartoes[txt(c.id)];
    n[a && COLUNAS.includes(a.coluna) ? a.coluna : "meio"]++;
    n.total++;
  }
  return n;
}
function resumo(n) {
  return [n.gostei ? `${n.gostei} gostei` : "", n.nao_gostei ? `${n.nao_gostei} não gostei` : "",
    n.meio ? `${n.meio} sem resposta` : ""].filter(Boolean).join(" · ");
}
const semResposta = n => (n === 1 ? "1 card vai como sem resposta" : `${n} cards vão como sem resposta`);

// ---- A resposta (página → agente) -----------------------------------------------------------------------------------
// Uma por card, na ordem do lote (o formato do CONTRATO, seção 2, e do montar_resposta do Pro).
function respostas(lote, est) {
  return cartoesDe(lote).map(c => {
    const id = txt(c.id), a = (est && est.cartoes && est.cartoes[id]) || vazio();
    const coluna = a.coluna === "gostei" || a.coluna === "nao_gostei" ? a.coluna : "sem_resposta";
    const opcao = coluna === "sem_resposta" ? "" : txt(a.opcao);
    return {cartao: id, coluna, opcao, comentario: txt(a.comentario).trim(),
      descartadas: a.descartadas.filter(x => !(coluna === "gostei" && x === opcao))};
  });
}
function pedidoResposta(lote, est, o) {
  const substitui = o && o.substitui ? txt(o.substitui) : null;
  return {acao: "decisao_responder", pc_lote: txt(lote && lote.pc), id: txt(lote && lote.id), marca: txt(lote && lote.marca),
    respostas: respostas(lote, est), substitui};
}
// Para quem vai o cel_pedir: o PC que publicou o lote no hoje (o que lê os pedidos); o agente repassa pela rede.
const destino = lote => txt(lote && (lote.publicado_por || lote.pc));
// Cabe no cel_pedir? {ok, letras, passou, msg}. Nada é cortado: se passar, a pessoa encurta os comentários.
function cabe(texto) {
  const t = typeof texto === "string" ? texto : JSON.stringify(texto == null ? "" : texto);
  const n = letras(t);
  if (n <= MAX_PEDIDO) return {ok: true, letras: n, msg: ""};
  return {ok: false, letras: n, passou: n - MAX_PEDIDO, msg: `A resposta ficou com ${mil(n)} letras e o celular manda até `
    + `${mil(MAX_PEDIDO)}: passou ${mil(n - MAX_PEDIDO)} ${n - MAX_PEDIDO === 1 ? "letra" : "letras"}. Encurte os comentários. Nada foi cortado.`};
}
// Os cards cujo comentário passa do limite de cada card (MAX_COMENTARIO): [{cartao, letras, passou}].
function excessos(lote, est) {
  return cartoesDe(lote).map(c => {
    const a = est && est.cartoes && est.cartoes[txt(c.id)], n = a ? letras(txt(a.comentario).trim()) : 0;
    return {cartao: txt(c.id), letras: n, passou: n - MAX_COMENTARIO};
  }).filter(x => x.passou > 0);
}
// Pode enviar? {ok, msg, cards: [ids a marcar na folha]}: nenhum card acima do limite dele e o pedido inteiro nas 8.000.
function podeEnviar(lote, est, o) {
  const ex = excessos(lote, est);
  if (ex.length) return {ok: false, cards: ex.map(x => x.cartao),
    msg: ex.map(x => `O comentário do card ${x.cartao} passou ${mil(x.passou)} letras (o limite é ${mil(MAX_COMENTARIO)} por card): encurte.`).join(" ")
      + " Nada foi cortado."};
  const c = cabe(JSON.stringify(pedidoResposta(lote, est, {substitui: o && o.substitui})));
  if (c.ok) return {ok: true, msg: "", cards: []};
  // os maiores comentários, para a pessoa saber onde encurtar
  const maiores = cartoesDe(lote).map(x => ({id: txt(x.id), n: letras(txt(((est && est.cartoes && est.cartoes[txt(x.id)]) || {}).comentario).trim())}))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
  return {ok: false, cards: maiores.map(x => x.id), msg: c.msg.replace(" Nada foi cortado.", "")
    + (maiores.length ? ` Os maiores: ${maiores.map(x => `card ${x.id} (${mil(x.n)} letras)`).join(" e ")}.` : "") + " Nada foi cortado."};
}

// A conferência antes de enviar: uma linha por card, como o texto que a sessão recebe no Pro
// ("1 · Gostei · opção A (título) · descartou B · comentário: …"). `antes`: as respostas do envio que se está refazendo
// (marca o que mudou, como o "(antes: …)" do Pro). [{cartao, coluna, ico, titulo, resumo, comentario, mudou, texto}].
function conferencia(lote, est, antes) {
  const velho = {};
  for (const x of Array.isArray(antes) ? antes : []) if (objeto(x)) velho[txt(x.cartao)] = x;
  return respostas(lote, est).map(r => {
    const c = cartaoDe(lote, r.cartao), op = opcoesDe(c).find(o => txt(o.id) === r.opcao);
    // as partes na ordem do texto_legivel do Pro: a coluna, a opção, as descartadas, o "(antes: …)" e o comentário
    const partes = [ROTULO[r.coluna]];
    if (r.opcao) partes.push(op && op.titulo ? `opção ${r.opcao} (${umaLinha(op.titulo)})` : `opção ${r.opcao}`);
    if (r.descartadas.length) partes.push(`descartou ${r.descartadas.join(", ")}`);
    const v = velho[r.cartao];
    const mudou = v && (txt(v.coluna) !== r.coluna || txt(v.opcao) !== r.opcao)
      ? `antes: ${ROTULO[txt(v.coluna)] ? ROTULO[txt(v.coluna)].split(" (")[0] : txt(v.coluna)}${txt(v.opcao) ? ` · opção ${txt(v.opcao)}` : ""}` : "";
    if (mudou) partes.push(`(${mudou})`);
    const com = umaLinha(r.comentario);
    // na tela, a pergunta inteira em Não gostei ganha o "nenhuma serve" (o texto da sessão fica igual ao do Pro)
    const tela = partes.slice();
    if (r.coluna === "nao_gostei" && !r.opcao && opcoesDe(c).length) tela.splice(1, 0, "nenhuma serve");
    return {cartao: r.cartao, coluna: r.coluna, ico: r.coluna === "gostei" ? "👍" : r.coluna === "nao_gostei" ? "👎" : "·",
      titulo: umaLinha(c && c.titulo), resumo: tela.join(" · "), comentario: com, comentarioInteiro: r.comentario, mudou,
      texto: [r.cartao].concat(partes, com ? [`comentário: ${com}`] : []).join(" · ")};
  });
}

// ---- O gesto (sem tela) -----------------------------------------------------------------------------------------------
const limiarArrasto = largura => {
  const l = Number(largura);
  return Math.max(LIMIAR_MIN, Math.min(LIMIAR_PX, l > 0 ? l * LIMIAR_FRACAO : LIMIAR_PX));
};
// O que o dedo está fazendo: null (ainda não dá para dizer: é toque, ou vai de lado mas ainda perto), "rolar" (mais de
// pé que de lado: a página rola; ou, na linha de opções que rola para o lado, sem ter segurado: a linha rola) ou
// "direita" / "esquerda" (passou do limiar, 30% da largura ou 90 px, com |dx| > 1,4 |dy|). o: {rola, segurou}.
function decidirArrasto(dx, dy, largura, o) {
  const ax = Math.abs(Number(dx)), ay = Math.abs(Number(dy));
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return null;
  if (ax < INICIO_PX && ay < INICIO_PX) return null;
  if (ax <= ay * RAZAO) return "rolar";
  if (o && o.rola && !o.segurou) return "rolar";
  if (ax < limiarArrasto(largura)) return null;
  return Number(dx) > 0 ? "direita" : "esquerda";
}
// A ação do arrasto: a OPÇÃO decide a opção; o CABEÇALHO do card decide a pergunta inteira (para a esquerda, nenhuma
// serve). null para "rolar" ou sem decisão.
function acaoDoArrasto(alvo, direcao) {
  if (!objeto(alvo) || !txt(alvo.cartao) || (direcao !== "direita" && direcao !== "esquerda")) return null;
  const coluna = direcao === "direita" ? "gostei" : "nao_gostei";
  return txt(alvo.opcao) ? {cartao: txt(alvo.cartao), opcao: txt(alvo.opcao), coluna} : {cartao: txt(alvo.cartao), coluna};
}

// ---- O HTML (texto puro) ------------------------------------------------------------------------------------------------
const textoLongo = t => txt(t).length > TEXTO_CURTO || txt(t).split("\n").length > 2;
const aberto = (ab, k) => !!(ab && typeof ab.has === "function" && ab.has(k));
// "11/11 19:35", do jeito que o PC escreveu (o celular e o PC estão no mesmo fuso).
function rotuloData(t) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(txt(t));
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : "";
}
function fotoDe(fotos, id) {
  const v = !fotos || !id ? "" : typeof fotos.get === "function" ? fotos.get(id) : fotos[id];
  return typeof v === "string" && SRC_OK.test(v) ? v : "";
}
// Um texto longo com as quebras de linha como vieram, recolhido em poucas linhas com o "mais".
function textoHtml(cls, texto, k, ab, extra) {
  const t = txt(texto), x = extra || "";
  if (!t && !x) return "";
  const longo = textoLongo(t) || !!x, ab1 = aberto(ab, k);
  return `<div class="dc-tw${ab1 ? " aberto" : ""}">${t ? `<div class="dc-txt ${cls}${longo ? " corta" : ""}">${esc(t)}</div>` : ""}${x}`
    + (longo ? `<button type="button" class="dc-mais" data-dc-acao="mais" data-dc-mais="${esc(k)}" aria-expanded="${ab1}">${ab1 ? "menos" : "mais"}</button>` : "")
    + `</div>`;
}
function imagemHtml(op, o) {
  if (op.img_erro) return `<div class="dc-img dc-falta" role="img" aria-label="Sem desenho: ${esc(op.img_erro)}"><span>⚠ Sem desenho</span><small>${esc(op.img_erro)}</small></div>`;
  if (!FOTO_ID.test(op.img)) return "";
  const src = fotoDe(o.fotos, op.img);
  return `<button type="button" class="dc-img${src ? " ok" : ""}" data-dc-zoom="${esc(op.img)}" aria-label="Opção ${esc(op.id)}: ver o desenho grande">`
    + `<img alt="" draggable="false" data-foto="${esc(op.img)}"${src ? ` src="${esc(src)}"` : ""}><span class="dc-espera" aria-hidden="true"></span>`
    + `<span class="dc-lupa" aria-hidden="true">⤢</span></button>`;
}
function opcaoHtml(c, op, a, o) {
  const id = txt(op.id), cid = txt(c.id), ro = !!o.ro;
  const fora = a.descartadas.includes(id), vai = a.coluna === "gostei" && a.opcao === id;
  const nao = a.coluna === "nao_gostei" && a.opcao === id, rec = id !== "" && txt(c.recomendada) === id;
  const k = `op:${cid}:${id}`;
  const det = op.detalhe ? `<div class="dc-txt dc-det">${esc(op.detalhe)}</div>` : "";
  const selo = vai ? `<span class="dc-selo dc-vai">✓ Vai esta</span>` : fora ? `<span class="dc-selo dc-fora-s">✕ Descartada</span>`
    : nao ? `<span class="dc-selo dc-fora-s">👎 Não gostei desta</span>` : "";
  const botoes = ro ? "" : fora
    ? `<button type="button" class="dc-ob volta" data-dc-acao="op-volta" data-dc-op="${esc(id)}">↩ Trazer de volta</button>`
    : vai ? `<button type="button" class="dc-ob volta" data-dc-acao="op-volta" data-dc-op="${esc(id)}" aria-label="Desfazer a escolha da opção ${esc(id)}">↩ Desfazer</button>`
    : `<button type="button" class="dc-ob sim" data-dc-acao="op-gostei" data-dc-op="${esc(id)}" aria-label="Gostei da opção ${esc(id)}">👍</button>`
      + `<button type="button" class="dc-ob nao" data-dc-acao="op-nao" data-dc-op="${esc(id)}" aria-label="Não gostei da opção ${esc(id)}">👎</button>`;
  return `<div class="dc-op${vai ? " vai" : ""}${fora ? " fora" : ""}${nao ? " nao" : ""}${rec ? " rec" : ""}" data-dc-op="${esc(id)}"`
    + `${ro || fora ? "" : ` data-dc-arrasta="opcao"`}>${imagemHtml(op, o)}<div class="dc-op-c">`
    + `${rec ? `<span class="dc-rec">★ Recomendada</span>` : ""}<div class="dc-op-h"><b class="dc-op-id">${esc(id)}</b><span class="dc-op-t">${esc(op.titulo)}</span></div>`
    + `${selo}${textoHtml("dc-ef", op.efeito, k, o.abertos, det)}</div>${botoes ? `<div class="dc-op-b">${botoes}</div>` : ""}</div>`;
}
// A linha do estado do card: verde Gostei · opção X, vermelho Não gostei, cinza sem resposta.
function estadoHtml(c, a) {
  const ops = opcoesDe(c), op = ops.find(o => txt(o.id) === a.opcao);
  const fora = a.descartadas.length ? ` · descartou ${esc(a.descartadas.join(", "))}` : "";
  const nomeOp = op ? ` · opção ${esc(op.id)}${op.titulo ? ` <span class="dc-est-o">(${esc(corta(op.titulo, 60))})</span>` : ""}` : "";
  if (a.coluna === "gostei") return `<div class="dc-est e-gostei"><span aria-hidden="true">👍</span><span><b>Gostei</b>${op ? nomeOp : " · aprovado"}${fora}</span></div>`;
  if (a.coluna === "nao_gostei") return `<div class="dc-est e-nao_gostei"><span aria-hidden="true">👎</span><span><b>Não gostei</b>${op ? nomeOp : ops.length ? " · nenhuma serve" : " · reavaliar"}${fora}</span></div>`;
  return `<div class="dc-est e-meio"><span aria-hidden="true">○</span><span><b>Sem resposta</b>${fora}</span></div>`;
}
// O contador debaixo do comentário: aparece perto do limite ("3.950/4.000") e fica vermelho ao passar ("passou 385
// letras: encurte"). A caixa não corta (sem maxlength): o que passa a folha aponta e o Enviar espera.
function contadorHtml(id, n) {
  const passou = n > MAX_COMENTARIO, mostra = n >= AVISO_COMENTARIO;
  return `<div class="dc-cont${passou ? " passou" : ""}${mostra ? "" : " oculto"}" data-dc-cont="${esc(id)}"${passou ? ` role="alert"` : ` aria-live="polite"`}>`
    + `${passou ? `⚠ passou ${mil(n - MAX_COMENTARIO)} letras do limite (${mil(MAX_COMENTARIO)}): encurte` : `${mil(n)}/${mil(MAX_COMENTARIO)}`}</div>`;
}
function htmlCartao(lote, est, cid, o) {
  o = o || {};
  const c = cartaoDe(lote, cid);
  if (!c) return "";
  const id = txt(c.id), a = (est && est.cartoes && est.cartoes[id]) || vazio(), ops = opcoesDe(c), ro = !!o.ro;
  const rec = ops.find(x => txt(x.id) === txt(c.recomendada) && txt(c.recomendada) !== "");
  const kq = `pq:${id}`, abq = aberto(o.abertos, kq);
  const porque = txt(c.porque)
    ? `<div class="dc-tw dc-pqw${abq ? " aberto" : ""}"><button type="button" class="dc-pq" data-dc-acao="mais" data-dc-mais="${esc(kq)}" aria-expanded="${abq}">`
      + `<span aria-hidden="true">★</span> Por que a recomendada${rec ? ` é a ${esc(rec.id)}` : ""} <span class="dc-seta" aria-hidden="true">${abq ? "▴" : "▾"}</span></button>`
      + `<div class="dc-txt dc-pq-t">${esc(c.porque)}</div></div>` : "";
  const corpo = ops.length
    ? `<div class="dc-ops n${Math.min(ops.length, 3)}" data-dc-ops role="group" aria-label="Opções do card ${esc(id)}">${ops.map(op => opcaoHtml(c, op, a, o)).join("")}</div>`
    : `<div class="dc-sn">Pergunta de sim ou não: 👍 aprova o que está escrito acima; 👎 pede outra proposta.</div>`;
  const b = (acao, rot, cls) => `<button type="button" class="dc-b ${cls}" data-dc-acao="${acao}">${rot}</button>`;
  const acoes = ro ? "" : [
    !ops.length && a.coluna !== "gostei" ? b("sim", "👍 Sim, aprovo", "sim") : "",
    a.coluna !== "nao_gostei" ? b("nao", ops.length ? "👎 Nenhuma serve" : "👎 Não, reavaliar", "nao") : "",
    a.coluna !== "meio" || a.opcao || a.descartadas.length ? b("meio", "↩ Desfazer", "volta") : "",
  ].join("");
  const com = ro
    ? (a.comentario ? `<div class="dc-com-ro"><span aria-hidden="true">💬</span> ${esc(a.comentario)}</div>` : "")
    : `<textarea class="dc-ta" data-dc-com="${esc(id)}" rows="2" placeholder="Comentário (opcional)" aria-label="Comentário do card ${esc(id)}">${esc(a.comentario)}</textarea>`
      + contadorHtml(id, letras(a.comentario));
  const aviso = a.aviso ? `<div class="dc-aviso-c" role="status"><span aria-hidden="true">⚠</span> ${esc(a.aviso)}</div>` : "";
  return `<section class="dc-card col-${a.coluna}${ro ? " ro" : ""}" data-dc-cartao="${esc(id)}" aria-label="Card ${esc(id)}: ${esc(c.titulo)}">`
    + `<div class="dc-ch"${ro ? "" : ` data-dc-arrasta="cartao"`}><span class="dc-num">${esc(id)}</span><h3 class="dc-tit">${esc(c.titulo)}</h3></div>`
    + estadoHtml(c, a) + aviso + textoHtml("dc-ctx", c.contexto, `ctx:${id}`, o.abertos) + porque + corpo
    + (acoes ? `<div class="dc-acoes">${acoes}</div>` : "") + com + `</section>`;
}
// A barra das colunas: as contagens de cada uma e o filtro escolhido.
function abasHtml(lote, est, filtro) {
  const n = contar(lote, est), f = FILTROS.includes(filtro) ? filtro : "todos";
  return `<div class="dc-abas" role="tablist" aria-label="Filtrar os cards por coluna" data-dc-abas>${FILTROS.map(k =>
    `<button type="button" role="tab" class="dc-aba a-${k}${k === f ? " on" : ""}" aria-selected="${k === f}" data-dc-acao="filtro" data-dc-filtro="${k}">`
    + `<span>${ROT_COLUNA[k]}</span><b>${k === "todos" ? n.total : n[k]}</b></button>`).join("")}</div>`;
}
function progHtml(lote, est) {
  const n = contar(lote, est), feitos = n.total - n.meio, pct = n.total ? Math.round(100 * feitos / n.total) : 0;
  return `<div class="dc-prog-w" data-dc-prog><span class="dc-prog" role="img" aria-label="${feitos} de ${n.total} decididos"><i style="width:${pct}%"></i></span>`
    + `<span class="dc-prog-t">${feitos} de ${plural(n.total, "decidido", "decididos")}</span></div>`;
}
function peHtml(lote, est, o) {
  o = o || {};
  if (o.ro) return o.refazer ? `<button type="button" class="dc-enviar" data-dc-acao="refazer" data-dc-chave="${esc(lote.chave)}"><span>↺ Refazer este lote</span><small>a sessão recebe a correção</small></button>` : "";
  const n = contar(lote, est), pode = !!(est && est.pilha && est.pilha.length);
  return `<button type="button" class="dc-btn dc-desf" data-dc-acao="desfazer"${pode ? "" : " disabled"} aria-label="Desfazer o último passo">↶</button>`
    + `<button type="button" class="dc-enviar" data-dc-acao="conferir"><span>${o.substitui ? "Conferir a correção" : "Conferir e enviar"}</span>`
    + `<small>${esc(resumo(n) || "nada decidido ainda")}</small></button>`;
}
// Um lote inteiro (tela cheia): o cabeçalho, os avisos, um card por pergunta e o pé com "Conferir e enviar".
// o: {fotos (Map ou objeto id → data URL da miniatura), abertos (Set dos "mais" abertos), ro, refazer, substitui,
// andamento ("enviando" | "ok" | "erro": o envio daqui; o selo diz "Enviando…" até o PC confirmar, e não "Respondida")}.
function htmlLote(lote, est, o) {
  o = o || {};
  if (!lote || !cartoesDe(lote).length) return `<div class="dc-vazio"><b>Lote sem perguntas</b><p>A sessão gravou um lote vazio ou ele ainda não chegou.</p></div>`;
  const pc = txt(lote.pc), outro = lote.via === "rede", off = lote.online === false;
  const meta = [txt(lote.sessao) || "sessão sem nome", pc ? pcCurto(pc) + (outro ? (off ? " (desligado)" : " (outro PC)") : "") : "", rotuloData(lote.criado)].filter(Boolean).join(" · ");
  const re = objeto(lote.reenviar) ? lote.reenviar : null;
  const avisos = [
    re ? `<div class="dc-faixa ouro" role="alert"><span aria-hidden="true">↻</span><span>${re.estado === "mudou"
      ? `<b>O lote mudou no ${esc(pcCurto(pc) || "outro PC")}</b> depois da sua resposta: confira os cards e mande de novo.`
      : `<b>A resposta não chegou ao ${esc(pcCurto(pc) || "outro PC")}</b>${txt(re.msg) ? `: ${esc(txt(re.msg).replace(/[.\s]+$/, ""))}` : ""}. As escolhas voltaram para o quadro.`}</span></div>` : "",
    off ? `<div class="dc-faixa"><span aria-hidden="true">⏻</span><span>O ${esc(pcCurto(pc) || "outro PC")} está desligado: a resposta vai quando ele voltar.</span></div>` : "",
    o.substitui ? `<div class="dc-faixa ouro"><span aria-hidden="true">✎</span><span><b>Refazendo o envio de ${esc(rotuloData(o.substitui) || "antes")}.</b> A sessão recebe a correção, marcada como substituindo a resposta de antes.</span></div>` : "",
  ].join("");
  const dica = o.ro ? "" : `<p class="dc-dica">Arraste a <b>opção</b>: → <b class="v">gostei</b> · ← <b class="r">não gostei</b>. O título do card para a esquerda: nenhuma serve. Ou toque em 👍 / 👎.</p>`;
  const filtro = o.ro ? "todos" : filtros.get(txt(lote.chave)) || "todos", semCard = filtro !== "todos" && !contar(lote, est)[filtro];
  return `<div class="dc-lote${semCard ? " sem-card" : ""}" data-dc-lote="${esc(lote.chave)}" data-filtro="${filtro}">${o.ro ? "" : abasHtml(lote, est, filtro)}<header class="dc-lh">`
    + `<h2 class="dc-lh-t">${o.ro ? `<span class="dc-tag${o.andamento === "enviando" ? " anda" : ""}">${o.andamento === "enviando" ? "Enviando…" : "Respondida"}</span> ` : ""}${esc(lote.titulo || lote.id)}</h2>`
    + `<div class="dc-lh-m">${esc(meta)}</div>${o.ro ? "" : progHtml(lote, est)}</header>${avisos}${dica}`
    + `<div class="dc-cards">${cartoesDe(lote).map(c => htmlCartao(lote, est, c.id, o)).join("")}`
    + `<div class="dc-filtro-vazio">Nenhum card nesta coluna. <button type="button" class="dc-mais" data-dc-acao="filtro" data-dc-filtro="todos">Ver todos</button></div></div>`
    + `<div class="dc-pe" data-dc-pe>${peHtml(lote, est, o)}</div></div>`;
}
// O lote que não vem para o celular (semConteudo): o título, de onde é e a frase, sem cards nem botões. O pessoal fica
// só com o título fixo (nada da sessão nem dos textos); o grande diz para abrir no Monitor geral.
function htmlSemConteudo(item) {
  if (!objeto(item)) return "";
  const s = semConteudo(item), pessoal = s.tipo === "pessoal", n = Math.max(0, Number(item.n) || 0);
  const meta = [pessoal ? "" : txt(item.sessao), pcCurto(item.pc), rotuloData(item.criado), n ? plural(n, "pergunta", "perguntas") : ""]
    .filter(Boolean).join(" · ");
  return `<div class="dc-lote dc-sem" data-dc-lote="${esc(item.chave)}" data-dc-sem="${esc(s.tipo || "grande")}"><header class="dc-lh">`
    + `<h2 class="dc-lh-t">${pessoal ? "🔒 " : ""}${esc(pessoal ? TITULO_PESSOAL : item.titulo || item.id)}</h2><div class="dc-lh-m">${esc(meta)}</div></header>`
    + `<div class="dc-faixa${pessoal ? "" : " ouro"}" role="status"><span aria-hidden="true">${pessoal ? "🔒" : "🖥"}</span><span>${esc(s.msg || MSG_GRANDE)}</span></div></div>`;
}

// A folha "Confira antes de enviar": o resumo card por card, os avisos e Voltar / Enviar. o: {substitui, antes}.
function htmlConferencia(lote, est, o) {
  o = o || {};
  const linhas = conferencia(lote, est, o.antes), n = contar(lote, est);
  const c = podeEnviar(lote, est, {substitui: o.substitui});
  const avisos = [lote && lote.online === false ? `O ${txt(lote.pc) || "outro PC"} está desligado: a resposta vai quando ele voltar.` : "",
    n.meio ? semResposta(n.meio) + "." : ""].filter(Boolean);
  // o comentário vai inteiro: o curto aparece todo; o longo, o começo e o "ver tudo" (o crítico viu o corte em 160
  // letras logo acima de "A sessão recebe tudo de uma vez, assim como está acima")
  const comHtml = x => {
    if (!x.comentario) return "";
    const inteiro = txt(x.comentarioInteiro).trim(), curto = inteiro.length <= 160 && inteiro.split("\n").length <= 2;
    return curto ? `<span class="dc-cf-c">💬 “${esc(inteiro)}”</span>`
      : `<details class="dc-cf-cd"><summary><span class="dc-cf-c">💬 “${esc(corta(x.comentario, 120))}”</span> <b>ver tudo (${mil(letras(inteiro))} letras)</b></summary><div class="dc-cf-ci">${esc(inteiro)}</div></details>`;
  };
  const itens = linhas.map(x => `<li class="c-${x.coluna}${x.mudou ? " mudou" : ""}${c.cards.includes(x.cartao) ? " passou" : ""}"><span class="dc-cf-id">${esc(x.cartao)}</span>`
    + `<span class="dc-cf-i" aria-hidden="true">${x.ico}</span><span class="dc-cf-t">${x.titulo ? `<small>${esc(corta(x.titulo, 80))}</small>` : ""}`
    + `<span>${esc(x.resumo)}</span>${comHtml(x)}${c.cards.includes(x.cartao) ? `<span class="dc-cf-x" role="alert">⚠ encurte este comentário</span>` : ""}</span></li>`).join("");
  return `<div class="dc-conf" role="dialog" aria-modal="true" aria-label="Confira antes de enviar">`
    + `<div class="dc-conf-h"><b>Confira antes de enviar</b><small>${esc(lote && (lote.titulo || lote.id))}</small></div>`
    + (o.substitui ? `<div class="dc-conf-corr">Correção: substitui o envio de ${esc(rotuloData(o.substitui) || "antes")}. A sessão recebe a correção marcada assim.</div>` : "")
    + avisos.map(x => `<div class="dc-conf-aviso">${esc(x)}</div>`).join("")
    + `<ol class="dc-conf-l">${itens}</ol>`
    + (c.ok ? "" : `<div class="dc-conf-erro" role="alert">${esc(c.msg)}</div>`)
    + `<p class="dc-conf-p">A sessão recebe tudo de uma vez, assim como está acima.</p>`
    + `<div class="dc-conf-b"><button type="button" class="dc-btn" data-dc-acao="voltar">Voltar</button>`
    + `<button type="button" class="dc-btn ouro" data-dc-acao="enviar"${c.ok ? "" : " disabled"}>${o.substitui ? "Enviar a correção" : "Enviar"}</button></div></div>`;
}
// Os lotes esperando, para escolher um (a tela mostra um lote por vez). estados: {chave: estado} (o que falta decidir).
function htmlLotes(lotes, sel, estados) {
  const lista = Array.isArray(lotes) ? lotes : [];
  if (lista.length < 2) return "";
  return `<div class="dc-lotes" role="group" aria-label="Lotes esperando">${lista.map(l => {
    const e = estados && estados[l.chave], n = e ? contar({cartoes: Object.keys(e.cartoes).map(id => ({id}))}, e) : null;
    const falta = n ? n.meio : Number(l.n) || 0, on = l.chave === sel, sem = semConteudo(l).tipo;
    return `<button type="button" class="dc-chip${on ? " on" : ""}${l.online === false ? " off" : ""}" data-dc-acao="lote" data-dc-chave="${esc(l.chave)}" aria-pressed="${on}">`
      + `<span class="dc-chip-t"><b>${objeto(l.reenviar) ? "↻ " : ""}${sem === "pessoal" ? "🔒 " : ""}${esc(l.titulo || l.id)}</b><small>${esc([txt(l.sessao), l.via === "rede" ? txt(l.pc) : ""].filter(Boolean).join(" · ") || (sem === "pessoal" ? pcCurto(l.pc) : "sessão sem nome"))}</small></span>`
      + `<span class="dc-chip-n${sem ? " pc" : falta ? "" : " pronto"}">${sem ? "PC" : falta || "✓"}</span></button>`;
  }).join("")}</div>`;
}
function andamentoHtml(a) {
  const e = objeto(a) ? txt(a.estado) : txt(a), msg = objeto(a) ? txt(a.msg) : "";
  if (!e) return "";
  return `<span class="dc-and and-${esc(ANDAMENTO[e] ? e : "outro")}"${msg ? ` title="${esc(msg)}"` : ""}>${esc(ANDAMENTO[e] || e)}</span>`;
}
// As respondidas: o resumo e o andamento de cada uma; "Refazer" só onde o.podeRefazer(item) diz que dá (o aparelho
// ainda tem o lote e o que foi mandado).
function htmlRespondidos(respondidos, o) {
  o = o || {};
  const lista = (Array.isArray(respondidos) ? respondidos : []).filter(objeto);
  if (!lista.length) return `<div class="dc-resps"><h3 class="dc-h3">Respondidas</h3><div class="dc-mudo">Nenhum lote respondido ainda.</div></div>`;
  return `<div class="dc-resps"><h3 class="dc-h3">Respondidas</h3><ul>${lista.map(r => {
    const pode = typeof o.podeRefazer === "function" && o.podeRefazer(r);
    return `<li class="dc-resp"><div class="dc-resp-a"><b>${esc(r.titulo || r.id)}</b><small>${esc([txt(r.pc), r.enviado ? `enviado ${rotuloData(r.enviado)}` : ""].filter(Boolean).join(" · "))}</small>`
      + `${r.resumo ? `<span class="dc-resp-r">${esc(corta(umaLinha(r.resumo), 160))}</span>` : ""}</div>`
      + `<div class="dc-resp-b">${andamentoHtml(r.andamento)}${pode ? `<button type="button" class="dc-btn mini ouro" data-dc-acao="refazer" data-dc-chave="${esc(r.chave)}">↺ Refazer</button>` : ""}</div></li>`;
  }).join("")}</ul></div>`;
}
// O bloco do Início: os lotes esperando (até 3), cada um com quantas perguntas, a sessão, o PC e o "Decidir", e o "ver
// tudo"; sem lote, a última respondida. "" sem nada.
const pcCurto = pc => (txt(pc).length > 11 && txt(pc).includes("-") ? txt(pc).split("-")[0] : txt(pc));
function htmlResumo(lotes, respondidos, o) {
  o = o || {};
  const l = (Array.isArray(lotes) ? lotes : []).filter(objeto), r = (Array.isArray(respondidos) ? respondidos : []).filter(objeto);
  if (!l.length && !r.length) return "";
  const vistos = o.vistos instanceof Set ? o.vistos : null;
  // o lote que não vem para o celular (pessoal, grande demais) aparece com o "no PC": abre a frase, sem os botões
  const itens = l.slice(0, 3).map(x => { const sem = semConteudo(x).tipo; return `<button type="button" class="dc-bl${sem ? " fora" : ""}" data-dc-acao="abrir" data-dc-chave="${esc(x.chave)}">`
    + `${vistos && !vistos.has(x.chave) ? `<i class="dc-ponto" aria-label="novo"></i>` : ""}<span class="dc-bl-t"><b>${objeto(x.reenviar) ? "↻ " : ""}${sem === "pessoal" ? "🔒 " : ""}${esc(x.titulo || x.id)}</b>`
    + `<small>${esc([x.n ? plural(Number(x.n), "pergunta", "perguntas") : "", txt(x.sessao), pcCurto(x.pc)].filter(Boolean).join(" · "))}</small></span>`
    + `<span class="dc-bl-s" aria-hidden="true">${sem === "pessoal" ? "No PC ›" : sem ? "No Monitor ›" : "Decidir ›"}</span></button>`; }).join("");
  const ult = !l.length && r[0] ? `<div class="dc-bl-ult">Nada esperando. Última: <b>${esc(r[0].titulo || r[0].id)}</b> ${andamentoHtml(r[0].andamento)}</div>` : "";
  return `<section class="dc-bloco"><div class="dc-bloco-h"><span>🗳 Decisões</span>${l.length ? `<b class="dc-n">${l.length}</b>` : ""}`
    + `<button type="button" class="dc-ver" data-dc-acao="abrir">ver tudo</button></div>${itens}${l.length > 3 ? `<div class="dc-mudo">e mais ${l.length - 3}</div>` : ""}${ult}</section>`;
}
function htmlErros(erros) {
  const lista = (Array.isArray(erros) ? erros : []).filter(objeto);
  return lista.length ? `<details class="dc-erros"><summary>⚠ ${plural(lista.length, "lote com erro", "lotes com erro")}</summary>`
    + lista.map(e => `<div><b>${esc(e.id)}</b> · ${esc(e.pc)}: ${esc(e.erro)}</div>`).join("") + `</details>` : "";
}

// As imagens do lote (para a página pedir só as miniaturas que vão aparecer).
const fotosDoLote = lote => [...new Set(cartoesDe(lote).flatMap(c => opcoesDe(c).map(o => txt(o.img)).filter(x => FOTO_ID.test(x))))];

// ---- No navegador: as miniaturas e os gestos ------------------------------------------------------------------------
// As imagens à espera da miniatura, na ordem da tela.
function fotosQueFaltam(el) {
  if (!el || !el.querySelectorAll) return [];
  return [...new Set([...el.querySelectorAll("img[data-foto]")].filter(i => !i.getAttribute("src") && !i.parentElement.classList.contains("erro")).map(i => i.dataset.foto))];
}
// A miniatura chegou (url: data URL ou blob:) ou não veio (url vazio: "a imagem não chegou").
function porFoto(el, id, url) {
  if (!el || !el.querySelectorAll) return 0;
  let n = 0;
  for (const i of el.querySelectorAll("img[data-foto]")) {
    if (i.dataset.foto !== id) continue;
    n++;
    if (url && SRC_OK.test(url)) { i.src = url; i.parentElement.classList.add("ok"); i.parentElement.classList.remove("erro"); }
    else { i.parentElement.classList.add("erro"); i.parentElement.setAttribute("title", "A imagem não chegou: toque para tentar a grande"); }
  }
  return n;
}

// Liga os gestos e os botões num container com um htmlLote dentro. o: {lote(), estado(), guardar(estado), abertos (Set,
// o mesmo do htmlLote), fotos, aviso(msg), zoom(fotoId), acao(nome, chave, botao) para conferir, enviar, voltar,
// refazer, abrir e lote, carregar(elementoNovo) para pedir as miniaturas de um card repintado}. Devolve {desligar}.
// Arrastar a opção para o lado decide a opção; arrastar o cabeçalho decide o card; na linha de opções que rola para o
// lado, segurar um instante antes de arrastar (sem segurar, a linha rola). A decisão repinta só o card (a rolagem da
// linha de opções e as miniaturas ficam).
const CSS_ESC = v => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, "\\$&"));
function ligar(el, o) {
  if (!el || typeof el.addEventListener !== "function" || typeof document === "undefined") return null;
  o = o || {};
  const ab = o.abertos instanceof Set ? o.abertos : new Set();
  let g = null, semCliqueAte = 0;
  const lote = () => (typeof o.lote === "function" ? o.lote() : null);
  const est = () => (typeof o.estado === "function" ? o.estado() : null);
  const vibrar = () => { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* sem vibrar */ } };
  const cardDe = id => [...el.querySelectorAll("[data-dc-cartao]")].find(x => x.dataset.dcCartao === id) || null;
  function repintar(l, e, cid) {
    const velho = cardDe(cid);
    if (velho) {
      const linha = velho.querySelector("[data-dc-ops]"), rol = linha ? linha.scrollLeft : 0, srcs = {};
      for (const i of velho.querySelectorAll("img[data-foto][src]")) srcs[i.dataset.foto] = i.getAttribute("src");
      const tmp = document.createElement("div");
      tmp.innerHTML = htmlCartao(l, e, cid, {fotos: o.fotos, abertos: ab});
      const novo = tmp.firstElementChild;
      if (novo) {
        const ta = velho.querySelector("textarea"), tb = novo.querySelector("textarea");
        if (ta && tb) tb.style.height = ta.style.height;
        velho.replaceWith(novo);
        for (const [id, src] of Object.entries(srcs)) porFoto(novo, id, src);
        const l2 = novo.querySelector("[data-dc-ops]");
        if (l2) l2.scrollLeft = rol;
        novo.classList.add("dc-chegou");
        if (typeof o.carregar === "function") o.carregar(novo);
      }
    }
    const pe = el.querySelector("[data-dc-pe]"), prog = el.querySelector("[data-dc-prog]"), abas = el.querySelector("[data-dc-abas]");
    if (pe) pe.innerHTML = peHtml(l, e, {substitui: o.substitui});
    if (prog) prog.outerHTML = progHtml(l, e);
    if (abas) abas.outerHTML = abasHtml(l, e, filtros.get(txt(l.chave)) || "todos");
    vazioDoFiltro();
  }
  // a coluna filtrada sem card: a frase "Nenhum card nesta coluna"
  function vazioDoFiltro() {
    const lt = el.querySelector("[data-dc-lote]");
    if (!lt) return;
    const f = lt.dataset.filtro || "todos";
    lt.classList.toggle("sem-card", f !== "todos" && !lt.querySelector(`.dc-card.col-${f}`));
  }
  function filtrar(f) {
    const lt = el.querySelector("[data-dc-lote]"), l = lote();
    if (!lt || !FILTROS.includes(f)) return;
    if (l) filtros.set(txt(l.chave), f);
    lt.dataset.filtro = f;
    for (const b of lt.querySelectorAll("[data-dc-filtro]")) if (b.closest("[data-dc-abas]")) {
      b.classList.toggle("on", b.dataset.dcFiltro === f); b.setAttribute("aria-selected", String(b.dataset.dcFiltro === f));
    }
    vazioDoFiltro();
  }
  let snack = null, snackTimer = 0;
  function avisoMovido(texto) {
    if (!snack || !snack.isConnected) {
      snack = document.createElement("div");
      snack.className = "dc-snack"; snack.setAttribute("role", "status");
      snack.innerHTML = `<span></span><button type="button" data-dc-snack>↶ Desfazer</button>`;
      document.body.append(snack);
      snack.addEventListener("click", ev => { if (ev.target.closest("[data-dc-snack]")) { esconderSnack(); desfazerUltimo(); } });
    }
    snack.firstElementChild.textContent = texto;
    snack.hidden = false;
    clearTimeout(snackTimer);
    snackTimer = setTimeout(esconderSnack, AVISO_MS);
  }
  function esconderSnack() { clearTimeout(snackTimer); if (snack) snack.hidden = true; }
  function desfazerUltimo() {
    const l = lote(), r = desfazer(est());
    if (!l || !r.desfeito) return;
    if (typeof o.guardar === "function") o.guardar(r.estado);
    repintar(l, r.estado, r.desfeito);
  }
  function agir(acao) {
    const l = lote(), e = est();
    if (!l || !e || !acao) return;
    const r = aplicar(e, acao);
    if (!r.ok) { if (r.msg && typeof o.aviso === "function") o.aviso(r.msg); return; }
    if (typeof o.guardar === "function") o.guardar(r.estado);
    repintar(l, r.estado, txt(acao.cartao));
    const de = (e.cartoes[txt(acao.cartao)] || {}).coluna, para = (r.estado.cartoes[txt(acao.cartao)] || {}).coluna;
    if (de !== para) avisoMovido(`Card ${txt(acao.cartao)} → ${ROT_COLUNA[para] || para}`);
    if (r.todas && typeof o.aviso === "function") o.aviso(`Card ${txt(acao.cartao)}: todas as opções descartadas; a pergunta volta para a sessão reavaliar`);
    vibrar();
  }
  function soltar(volta) {
    if (!g) return;
    clearTimeout(g.timer);
    const alvo = g.mover;
    if (alvo) {
      alvo.classList.remove("dc-pega", "pra-sim", "pra-nao");
      alvo.classList.toggle("dc-volta", !!volta);
      alvo.style.transform = "";
    }
    g = null;
  }
  const naoArrasta = "textarea, button:not(.dc-img), a, input, .dc-mais, .dc-pq";
  function baixo(ev) {
    if ((ev.button || 0) > 0 || ev.isPrimary === false || g) return;
    const alvo = ev.target.closest("[data-dc-arrasta]");
    if (!alvo || !el.contains(alvo) || ev.target.closest(naoArrasta)) return;
    const card = alvo.closest("[data-dc-cartao]");
    if (!card) return;
    const linha = alvo.closest("[data-dc-ops]"), opcao = alvo.dataset.dcArrasta === "opcao";
    const mover = opcao ? alvo : card;
    g = {alvo, mover, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, modo: "", segurou: false,
      cartao: card.dataset.dcCartao, opcao: opcao ? alvo.dataset.dcOp : "", largura: mover.getBoundingClientRect().width,
      rola: !!(opcao && linha && linha.scrollWidth > linha.clientWidth + 2),
      // o card com opções pelo cabeçalho só vai para a esquerda (nenhuma serve): para a direita não acende nada
      soEsquerda: !opcao && !!card.querySelector("[data-dc-ops]")};
    if (g.rola) {
      const eu = g;
      g.timer = setTimeout(() => { if (g === eu && !eu.modo) { eu.segurou = true; mover.classList.add("dc-pega"); vibrar(); } }, SEGURAR_MS);
    }
  }
  function move(ev) {
    if (!g || ev.pointerId !== g.id) return;
    const dx = ev.clientX - g.x0, dy = ev.clientY - g.y0, d = decidirArrasto(dx, dy, g.largura, {rola: g.rola, segurou: g.segurou});
    if (!g.modo) {
      if (d === "rolar") { soltar(false); return; }
      if (Math.abs(dx) < INICIO_PX) return;
      g.modo = "arrasta";
      clearTimeout(g.timer);
      g.mover.classList.remove("dc-volta");
      try { g.alvo.setPointerCapture(g.id); } catch (e) { /* o dedo já saiu */ }
    }
    // anda menos que o dedo (amortecido e com teto): a opção não some da linha; o selo por cima diz o que vai acontecer
    const teto = g.soEsquerda && dx > 0 ? 18 : Math.max(36, g.largura * 0.22), x = Math.max(-teto, Math.min(teto, dx * 0.5));
    g.mover.style.transform = `translateX(${Math.round(x)}px) rotate(${(x / 60).toFixed(2)}deg)`;
    const sim = d === "direita" && !g.soEsquerda, nao = d === "esquerda";
    if ((sim || nao) && !g.passou) vibrar();
    g.passou = sim || nao;
    g.mover.classList.toggle("pra-sim", sim);
    g.mover.classList.toggle("pra-nao", nao);
  }
  function cima(ev) {
    if (!g || ev.pointerId !== g.id) return;
    const eu = g, dx = ev.clientX - eu.x0, dy = ev.clientY - eu.y0;
    if (!eu.modo) { soltar(false); return; }
    semCliqueAte = Date.now() + 450;   // o soltar não é um toque (não abre a imagem)
    const d = ev.type === "pointerup" ? decidirArrasto(dx, dy, eu.largura, {segurou: true}) : null;
    soltar(true);
    const acao = acaoDoArrasto({cartao: eu.cartao, opcao: eu.opcao}, d);
    if (acao) agir(acao);
  }
  // segurou (ou já arrasta): o toque não rola a página nem a linha (o touchmove precisa ser "não passivo")
  const toque = ev => { if (g && (g.modo || g.segurou) && ev.cancelable) ev.preventDefault(); };
  function clique(ev) {
    if (Date.now() < semCliqueAte) { ev.preventDefault(); ev.stopPropagation(); return; }
    const b = ev.target.closest("[data-dc-acao], [data-dc-zoom]");
    if (!b || !el.contains(b)) return;
    if (b.dataset.dcZoom) { if (typeof o.zoom === "function") o.zoom(b.dataset.dcZoom); return; }
    const card = b.closest("[data-dc-cartao]"), cid = card ? card.dataset.dcCartao : "", op = b.dataset.dcOp || "";
    const nome = b.dataset.dcAcao;
    if (nome === "op-gostei") agir({cartao: cid, opcao: op, coluna: "gostei"});
    else if (nome === "op-nao") agir({cartao: cid, opcao: op, coluna: "nao_gostei"});
    else if (nome === "op-volta") agir({cartao: cid, opcao: op, coluna: "meio"});
    else if (nome === "sim") agir({cartao: cid, coluna: "gostei"});
    else if (nome === "nao") agir({cartao: cid, coluna: "nao_gostei"});
    else if (nome === "meio") agir({cartao: cid, coluna: "meio"});
    else if (nome === "mais") {
      const w = b.closest(".dc-tw"), k = b.dataset.dcMais;
      if (!w) return;
      const on = w.classList.toggle("aberto");
      if (on) ab.add(k); else ab.delete(k);
      b.setAttribute("aria-expanded", String(on));
      if (b.classList.contains("dc-mais")) b.textContent = on ? "menos" : "mais";
      const s = b.querySelector(".dc-seta");
      if (s) s.textContent = on ? "▴" : "▾";
    } else if (nome === "desfazer") {
      esconderSnack();
      desfazerUltimo();
    } else if (nome === "filtro") filtrar(b.dataset.dcFiltro);
    else if (typeof o.acao === "function") o.acao(nome, b.dataset.dcChave || "", b);
  }
  function digitou(ev) {
    const ta = ev.target.closest && ev.target.closest("textarea[data-dc-com]");
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(240, ta.scrollHeight + 2) + "px";
    const r = aplicar(est(), {cartao: ta.dataset.dcCom, comentario: ta.value});
    if (r.ok && r.estado !== est() && typeof o.guardar === "function") o.guardar(r.estado);
    // o contador vivo; ao passar do limite (colou um texto grande), o aviso uma vez
    const cont = ta.parentElement && ta.parentElement.querySelector(`[data-dc-cont="${CSS_ESC(ta.dataset.dcCom)}"]`), n = letras(ta.value);
    if (cont) {
      const novo = document.createElement("div");
      novo.innerHTML = contadorHtml(ta.dataset.dcCom, n);
      cont.replaceWith(novo.firstElementChild);
    }
    if (n > MAX_COMENTARIO && !(ta._passou) && typeof o.aviso === "function")
      o.aviso(`Card ${ta.dataset.dcCom}: o comentário passou ${mil(n - MAX_COMENTARIO)} letras do limite (${mil(MAX_COMENTARIO)}). Encurte antes de enviar: nada foi cortado.`);
    ta._passou = n > MAX_COMENTARIO;
  }
  const cancela = () => soltar(true);
  el.addEventListener("pointerdown", baixo);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", cima);
  el.addEventListener("pointercancel", cancela);
  el.addEventListener("touchmove", toque, {passive: false});
  el.addEventListener("click", clique, true);
  el.addEventListener("input", digitou);
  vazioDoFiltro();
  return {filtrar, vazioDoFiltro, avisoMovido, esconderSnack, desligar() {
    esconderSnack();
    el.removeEventListener("pointerdown", baixo); el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", cima); el.removeEventListener("pointercancel", cancela);
    el.removeEventListener("touchmove", toque, {passive: false}); el.removeEventListener("click", clique, true);
    el.removeEventListener("input", digitou);
  }};
}

// ---- O CSS (o integrador põe no <style> da página; usa as variáveis do :root do index.html) -----------------------
const CSS = `
.dc-lote{--dc-sim:#48D680;--dc-sim-bg:rgba(72,214,128,.12);--dc-sim-b:rgba(72,214,128,.55);--dc-nao:#FF8A82;--dc-nao-bg:rgba(255,138,130,.11);
  --dc-nao-b:rgba(255,138,130,.55);--dc-ouro-bg:rgba(226,184,74,.13);--dc-card:#10224A;--dc-img:#0A1634;display:flex;flex-direction:column;gap:10px}
/* o reset dos botões sem peso (:where): qualquer classe da tela ganha dele */
:where(.dc-lote,.dc-bloco,.dc-conf,.dc-lotes,.dc-resps) button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0}
.dc-lote :focus-visible,.dc-conf :focus-visible,.dc-bloco :focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.dc-lh{display:flex;flex-direction:column;gap:4px}
.dc-abas{position:sticky;top:0;z-index:6;display:flex;gap:6px;margin:-2px -4px 0;padding:6px 4px;background:rgba(8,20,46,.94);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-radius:0 0 14px 14px}
.dc-aba{flex:1 1 0;min-width:0;min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:4px 2px;
  border-radius:12px;border:1px solid var(--stroke);background:var(--glass);color:var(--muted);font-size:12px;line-height:1.2}
.dc-aba span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.dc-aba b{color:var(--ink);font-size:15px;font-variant-numeric:tabular-nums}
.dc-aba.on{color:var(--ink);border-color:var(--gold);background:var(--dc-ouro-bg)}
.dc-aba.a-gostei b{color:var(--dc-sim)} .dc-aba.a-nao_gostei b{color:var(--dc-nao)}
.dc-aba.a-gostei.on{border-color:var(--dc-sim);background:var(--dc-sim-bg)}
.dc-aba.a-nao_gostei.on{border-color:var(--dc-nao);background:var(--dc-nao-bg)}
.dc-lote[data-filtro="gostei"] .dc-card:not(.col-gostei),.dc-lote[data-filtro="nao_gostei"] .dc-card:not(.col-nao_gostei),
.dc-lote[data-filtro="meio"] .dc-card:not(.col-meio){display:none}
.dc-filtro-vazio{display:none;text-align:center;color:var(--muted);font-size:13.5px;padding:18px 8px}
.dc-lote.sem-card .dc-filtro-vazio{display:block}
/* o aviso fica logo acima do pé e não pega o dedo (só o Desfazer): o arrasto da opção que está por baixo continua */
.dc-snack{position:fixed;left:50%;bottom:calc(var(--bottom,0px) + 96px);pointer-events:none;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:10px;
  max-width:calc(100vw - 32px);padding:6px 6px 6px 14px;border-radius:12px;background:#14284F;border:1px solid var(--stroke-2);
  box-shadow:0 10px 30px rgba(0,0,0,.4);font-size:13.5px;color:var(--ink)}
.dc-snack[hidden]{display:none}
.dc-snack span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dc-snack button{font:inherit;cursor:pointer;flex:none;pointer-events:auto;display:inline-flex;align-items:center;justify-content:center;
  min-height:44px;padding:0 14px;border-radius:999px;background:var(--glass-2);border:1px solid var(--stroke-2);color:var(--ink);font-weight:650;white-space:nowrap}
.dc-lh-t{margin:0;font-size:19px;line-height:1.25;font-weight:700;color:var(--ink);overflow-wrap:anywhere;text-transform:none;letter-spacing:0}
.dc-lh-m{font-size:13px;color:var(--faint);overflow-wrap:anywhere}
.dc-tag{font-size:11px;font-weight:600;color:#B9D2FF;border:1px solid rgba(111,168,255,.45);border-radius:999px;padding:1px 8px;vertical-align:3px}
.dc-tag.anda{color:var(--gold-2);border-color:rgba(226,184,74,.55)}
.dc-prog-w{display:flex;align-items:center;gap:10px;margin-top:4px}
.dc-prog{flex:1;height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
.dc-prog i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#C99A1E,var(--gold));transition:width .25s}
.dc-prog-t{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.dc-dica{margin:0;font-size:12.5px;line-height:1.45;color:var(--faint)}
.dc-dica .v{color:var(--dc-sim)} .dc-dica .r{color:var(--dc-nao)}
.dc-faixa{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.4;padding:9px 12px;border-radius:12px;color:var(--muted);
  background:var(--glass);border:1px solid var(--stroke-2)}
.dc-faixa.ouro{color:#FBE7B4;background:rgba(226,184,74,.12);border-color:rgba(226,184,74,.55)}
.dc-faixa b{color:var(--gold-2)}
.dc-cards{display:flex;flex-direction:column;gap:12px}
.dc-card{position:relative;padding:12px;border-radius:16px;background:var(--dc-card);border:1px solid var(--stroke-2);border-left:4px solid var(--stroke-2);
  box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 8px 20px rgba(0,0,0,.22);transition:border-color .15s,box-shadow .15s}
.dc-card.col-gostei{border-left-color:var(--dc-sim)}
.dc-card.col-nao_gostei{border-left-color:var(--dc-nao)}
.dc-card.dc-chegou{animation:dc-chega .35s ease-out}
@keyframes dc-chega{0%{box-shadow:0 0 0 3px var(--gold)}100%{box-shadow:0 8px 20px rgba(0,0,0,.22)}}
.dc-ch{display:flex;align-items:flex-start;gap:9px;min-height:44px;touch-action:pan-y;user-select:none;-webkit-user-select:none;cursor:grab}
.dc-card.ro .dc-ch{cursor:default}
.dc-num{flex:none;min-width:28px;height:28px;padding:0 8px;border-radius:999px;display:grid;place-items:center;font-weight:800;font-size:13.5px;
  color:#1B1606;background:var(--gold);margin-top:1px}
.dc-card.col-gostei .dc-num{background:var(--dc-sim);color:#06210F}
.dc-card.col-nao_gostei .dc-num{background:var(--dc-nao);color:#2A0705}
.dc-tit{margin:0;flex:1;min-width:0;font-size:16px;line-height:1.3;font-weight:650;color:var(--ink);overflow-wrap:anywhere;text-transform:none;letter-spacing:0}
.dc-est{display:flex;gap:7px;align-items:baseline;margin-top:6px;padding:6px 10px;border-radius:10px;font-size:13px;line-height:1.35;overflow-wrap:anywhere;
  color:var(--muted);background:rgba(255,255,255,.05);border:1px solid var(--stroke)}
.dc-est b{color:var(--ink)}
.dc-est.e-gostei{color:#CFF5DD;background:var(--dc-sim-bg);border-color:var(--dc-sim-b)}
.dc-est.e-gostei b{color:var(--dc-sim)}
.dc-est.e-nao_gostei{color:#FFD2CE;background:var(--dc-nao-bg);border-color:var(--dc-nao-b)}
.dc-est.e-nao_gostei b{color:var(--dc-nao)}
.dc-est-o{color:inherit;opacity:.85}
.dc-aviso-c{margin-top:6px;padding:7px 10px;border-radius:10px;font-size:12.5px;color:var(--gold-2);background:rgba(226,184,74,.12);border:1px solid rgba(226,184,74,.4)}
.dc-tw{min-width:0}
.dc-txt{white-space:pre-wrap;overflow-wrap:anywhere}
.dc-tw:not(.aberto) .dc-txt.corta{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.dc-ctx{margin-top:8px;font-size:14px;line-height:1.45;color:var(--muted)}
.dc-mais{display:inline-flex;align-items:center;min-height:44px;min-width:44px;padding:0 10px 0 0;color:#B9D2FF;font-size:13px}
.dc-pqw{margin-top:2px}
.dc-pq{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border-radius:999px;font-size:13px;color:var(--gold-2);
  background:rgba(226,184,74,.1);border:1px solid rgba(226,184,74,.32)}
.dc-seta{font-size:11px}
.dc-pq-t{display:none;margin-top:6px;padding:9px 11px;border-radius:10px;background:rgba(226,184,74,.07);border-left:3px solid var(--gold);color:var(--ink);font-size:13.5px;line-height:1.45}
.dc-pqw.aberto .dc-pq-t{display:block}
.dc-ops{display:grid;grid-auto-flow:column;grid-auto-columns:calc((100% - 10px) / 2);gap:10px;margin-top:10px;overflow-x:auto;overflow-y:hidden;
  scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none;padding:2px 1px 4px;touch-action:pan-y}
.dc-ops::-webkit-scrollbar{display:none}
.dc-ops.n1{grid-auto-columns:100%}
.dc-ops.n3{grid-auto-columns:calc((100% - 20px) / 2.25);touch-action:pan-x pan-y}
.dc-op{scroll-snap-align:start;display:flex;flex-direction:column;min-width:0;border-radius:14px;border:1.5px solid var(--stroke-2);background:rgba(0,0,0,.22);
  overflow:hidden;touch-action:inherit;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transition:border-color .15s,background .15s,opacity .15s,box-shadow .15s}
.dc-op.rec{border-color:rgba(226,184,74,.75);box-shadow:0 0 0 1px rgba(226,184,74,.35)}
.dc-op.vai{border-color:var(--dc-sim);background:var(--dc-sim-bg);box-shadow:0 0 0 2px var(--dc-sim-b)}
.dc-card.col-gostei .dc-op:not(.vai){opacity:.45}
.dc-op.fora{opacity:.5;border-style:dashed}
.dc-op.fora .dc-op-t{text-decoration:line-through}
.dc-op.fora img{filter:grayscale(1)}
.dc-op.nao{border-color:var(--dc-nao-b)}
.dc-op.dc-pega{box-shadow:0 0 0 2px var(--gold),0 12px 28px rgba(0,0,0,.45)}
.dc-op.pra-sim,.dc-card.pra-sim{box-shadow:0 0 0 3px var(--dc-sim),0 12px 28px rgba(72,214,128,.3)}
.dc-op.pra-nao,.dc-card.pra-nao{box-shadow:0 0 0 3px var(--dc-nao),0 12px 28px rgba(255,138,130,.3)}
.dc-op.dc-volta,.dc-card.dc-volta{transition:transform .22s ease}
/* o arrasto que já decide: a camada de cor (::before) e o selo sólido no meio (::after) */
.dc-op,.dc-card{position:relative}
.dc-op.pra-sim::before,.dc-op.pra-nao::before,.dc-card.pra-sim::before,.dc-card.pra-nao::before{content:"";position:absolute;inset:0;z-index:3;
  border-radius:inherit;pointer-events:none;background:rgba(72,214,128,.32)}
.dc-op.pra-nao::before,.dc-card.pra-nao::before{background:rgba(255,138,130,.3)}
.dc-op.pra-sim::after,.dc-op.pra-nao::after,.dc-card.pra-sim::after,.dc-card.pra-nao::after{position:absolute;z-index:4;left:50%;top:42%;
  transform:translate(-50%,-50%);pointer-events:none;white-space:nowrap;padding:8px 14px;border-radius:999px;font-weight:800;font-size:16px;
  box-shadow:0 6px 18px rgba(0,0,0,.45)}
.dc-op.pra-sim::after,.dc-card.pra-sim::after{content:"👍 Gostei";background:#48D680;color:#06210F}
.dc-op.pra-nao::after{content:"👎 Não gostei";background:#FF8A82;color:#2A0705}
.dc-card.pra-nao::after{content:"👎 Nenhuma serve";background:#FF8A82;color:#2A0705}
.dc-card.pra-sim::after,.dc-card.pra-nao::after{top:52px;transform:translateX(-50%)}
.dc-img{position:relative;display:block;width:100%;aspect-ratio:4/3;padding:0;background:var(--dc-img);overflow:hidden;border-bottom:1px solid var(--stroke)}
.dc-img img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .2s;-webkit-user-drag:none}
.dc-img.ok img{opacity:1}
.dc-espera{position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.07) 50%,transparent 70%) 0 0/220% 100%;animation:dc-brilho 1.3s linear infinite}
@keyframes dc-brilho{from{background-position:120% 0}to{background-position:-120% 0}}
.dc-img.ok .dc-espera,.dc-img.erro .dc-espera{display:none}
.dc-img.erro::after{content:"⚠ a imagem não chegou";position:absolute;inset:auto 6px 8px;text-align:center;font-size:11.5px;color:var(--gold-2)}
.dc-lupa{position:absolute;right:6px;top:6px;width:26px;height:26px;border-radius:8px;background:rgba(4,10,24,.72);color:var(--ink);display:grid;place-items:center;font-size:13px}
.dc-falta{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px;text-align:center;color:var(--gold-2);font-size:12.5px;
  background:repeating-linear-gradient(135deg,rgba(226,184,74,.07) 0 10px,rgba(226,184,74,.02) 10px 20px);border-bottom:1px dashed rgba(226,184,74,.45)}
.dc-falta small{color:var(--muted);font-size:11.5px;overflow-wrap:anywhere}
.dc-op-c{display:flex;flex-direction:column;gap:5px;padding:9px 10px 4px;min-width:0;flex:1}
.dc-op-h{display:flex;align-items:baseline;gap:6px;min-width:0}
.dc-op-id{flex:none;color:var(--gold-2);font-size:14px;font-weight:800}
.dc-op-t{min-width:0;font-weight:650;font-size:14px;line-height:1.3;color:var(--ink);overflow-wrap:anywhere}
.dc-rec{align-self:flex-start;font-size:11.5px;font-weight:800;letter-spacing:.2px;color:#1B1606;background:var(--gold-2);border-radius:999px;padding:2px 9px}
.dc-selo{align-self:flex-start;font-size:11.5px;font-weight:800;border-radius:999px;padding:1px 9px}
.dc-vai{color:#06210F;background:var(--dc-sim)}
.dc-fora-s{color:var(--dc-nao);border:1px solid var(--dc-nao-b)}
.dc-ef{font-size:13px;line-height:1.4;color:var(--ink);font-variant-numeric:tabular-nums}
.dc-det{display:none;margin-top:4px;font-size:12.5px;line-height:1.4;color:var(--faint)}
.dc-tw.aberto .dc-det{display:block}
.dc-op-b{display:flex;gap:8px;padding:4px 10px 10px}
.dc-ob{flex:1;min-height:44px;border-radius:12px;font-size:18px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:4px;
  border:1px solid var(--stroke-2);background:rgba(255,255,255,.05)}
.dc-ob.sim{color:var(--dc-sim);border-color:var(--dc-sim-b);background:var(--dc-sim-bg)}
.dc-ob.nao{color:var(--dc-nao);border-color:var(--dc-nao-b);background:var(--dc-nao-bg)}
.dc-ob.volta{font-size:13.5px;color:var(--muted)}
.dc-sn{margin-top:10px;padding:10px 12px;border-radius:12px;background:rgba(0,0,0,.2);border:1px dashed var(--stroke-2);color:var(--muted);font-size:13.5px;line-height:1.4}
.dc-acoes{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.dc-b{flex:1;min-height:44px;padding:0 12px;border-radius:12px;font-size:14px;font-weight:650;white-space:nowrap;
  border:1px solid var(--stroke-2);background:var(--glass);color:var(--ink)}
.dc-b.sim{color:var(--dc-sim);border-color:var(--dc-sim-b);background:var(--dc-sim-bg)}
.dc-b.nao{color:var(--dc-nao);border-color:var(--dc-nao-b);background:var(--dc-nao-bg)}
.dc-b.volta{flex:0 1 auto;color:var(--muted)}
.dc-b:active,.dc-ob:active,.dc-bl:active,.dc-chip:active,.dc-btn:active{background:var(--glass-2)}
.dc-ta{display:block;width:100%;box-sizing:border-box;margin-top:10px;resize:none;min-height:44px;max-height:240px;padding:10px 12px;border-radius:12px;
  font:15px/1.4 var(--font);color:var(--ink);background:rgba(0,0,0,.25);border:1px solid var(--stroke-2)}
.dc-ta::placeholder{color:var(--faint)}
.dc-cont{margin-top:4px;font-size:12px;text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}
.dc-cont.oculto{display:none}
.dc-cont.passou{color:#FFA49C;font-weight:650;text-align:left}
.dc-conf-l li.passou{box-shadow:inset 3px 0 0 #FF8A82;background:rgba(255,138,130,.14)}
.dc-cf-x{color:#FFA49C;font-size:12.5px;font-weight:650}
.dc-cf-cd summary{cursor:pointer;list-style:none;min-height:24px}
.dc-cf-cd summary::-webkit-details-marker{display:none}
.dc-cf-cd summary b{color:#B9D2FF;font-size:12.5px;font-weight:600;white-space:nowrap}
.dc-cf-ci{margin-top:4px;max-height:40vh;overflow:auto;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.22);font-size:13px;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.dc-ta:focus{outline:none;border-color:rgba(226,184,74,.7);box-shadow:0 0 0 2px rgba(226,184,74,.2)}
.dc-com-ro{margin-top:10px;padding:9px 12px;border-radius:12px;background:rgba(0,0,0,.2);border:1px solid var(--stroke);font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}
.dc-pe{position:sticky;bottom:var(--dc-pe-bottom,calc(var(--bottom,0px) + 76px));z-index:5;display:flex;gap:10px;align-items:stretch;padding:10px;margin:2px -4px 0;
  border-radius:18px;background:rgba(8,20,46,.94);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--stroke-2)}
.dc-pe:empty{display:none}
.dc-desf{flex:none;width:52px;min-height:52px;font-size:22px}
.dc-enviar{flex:1;min-height:52px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:6px 14px;border-radius:14px;
  background:var(--gold);color:#1B1606;box-shadow:0 6px 18px rgba(226,184,74,.2)}
.dc-enviar span{font-weight:800;font-size:16px;line-height:1.2}
.dc-enviar small{font-size:12px;opacity:.8}
.dc-btn{min-height:44px;padding:0 16px;border-radius:999px;font-size:14.5px;color:var(--muted);border:1px solid var(--stroke-2);
  background:var(--glass);white-space:nowrap}
.dc-btn[disabled]{opacity:.4;cursor:default}
.dc-btn.ouro{color:#1B1606;background:var(--gold);border-color:var(--gold);font-weight:800}
.dc-btn.mini{min-height:44px;padding:0 12px;font-size:13px}
.dc-conf{display:flex;flex-direction:column;gap:8px;max-height:min(80vh,720px);overflow:auto;padding:14px;border-radius:18px;background:#0F1F45;border:1px solid rgba(226,184,74,.55);
  box-shadow:0 18px 40px rgba(0,0,0,.5);color:var(--ink)}
.dc-conf-h{display:flex;flex-direction:column;gap:2px}
.dc-conf-h b{font-size:17px}
.dc-conf-h small{color:var(--muted);font-size:13px;overflow-wrap:anywhere}
.dc-conf-corr,.dc-conf-aviso{font-size:13px;color:var(--gold-2);font-weight:600}
.dc-conf-erro{font-size:13.5px;color:#FFD2CE;background:rgba(255,138,130,.12);border:1px solid rgba(255,138,130,.45);border-radius:10px;padding:8px 10px}
.dc-conf-l{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
.dc-conf-l li{display:flex;gap:8px;align-items:baseline;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.04);font-size:14px;line-height:1.35}
.dc-conf-l li.c-gostei{background:rgba(72,214,128,.12)}
.dc-conf-l li.c-nao_gostei{background:rgba(255,138,130,.11)}
.dc-conf-l li.mudou{box-shadow:inset 3px 0 0 var(--gold)}
.dc-cf-id{flex:none;min-width:24px;font-weight:800;color:var(--gold-2)}
.dc-cf-i{flex:none}
.dc-cf-t{min-width:0;display:flex;flex-direction:column;gap:2px;overflow-wrap:anywhere}
.dc-cf-t small{color:var(--muted);font-size:12px}
.dc-cf-c{color:var(--muted);font-size:13px;font-style:italic}
.dc-conf-p{margin:0;font-size:12.5px;color:var(--muted)}
.dc-conf-b{position:sticky;bottom:-14px;display:flex;gap:10px;justify-content:flex-end;margin:0 -14px -14px;padding:10px 14px 14px;background:#0F1F45}
.dc-conf-b .dc-btn{flex:1}
.dc-lotes{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:2px 0 4px}
.dc-lotes::-webkit-scrollbar{display:none}
.dc-chip{flex:none;display:flex;align-items:center;gap:9px;max-width:260px;min-height:48px;padding:6px 8px 6px 12px;border-radius:14px;border:1px solid var(--stroke);background:var(--glass);text-align:left}
.dc-chip.on{border-color:var(--gold);background:rgba(226,184,74,.13)}
.dc-chip-t{min-width:0;display:flex;flex-direction:column;line-height:1.25}
.dc-chip-t b{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dc-chip-t small{font-size:11.5px;color:var(--faint);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dc-chip-n{flex:none;min-width:24px;height:24px;padding:0 6px;border-radius:999px;display:grid;place-items:center;font-weight:800;font-size:12px;background:rgba(226,184,74,.2);color:var(--gold-2)}
.dc-chip-n.pronto{background:rgba(72,214,128,.14);color:#48D680}
.dc-chip-n.pc{background:var(--glass-2);color:var(--muted);font-size:11px}
.dc-h3{margin:14px 2px 8px;font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.6px}
.dc-resps ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.dc-resp{display:flex;gap:10px;align-items:center;padding:11px 12px;border-radius:14px;background:var(--glass);border:1px solid var(--stroke)}
.dc-resp-a{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.dc-resp-a b{font-size:14.5px;overflow-wrap:anywhere}
.dc-resp-a small{font-size:12px;color:var(--faint)}
.dc-resp-r{font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.dc-resp-b{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.dc-and{display:inline-block;font-size:11.5px;font-weight:700;padding:1px 9px;border-radius:999px;white-space:nowrap;border:1px solid var(--stroke-2);color:var(--muted)}
.dc-and.and-a_caminho{color:#B9D2FF;border-color:rgba(111,168,255,.45);background:rgba(111,168,255,.1)}
.dc-and.and-chegou{color:#48D680;border-color:rgba(72,214,128,.5);background:rgba(72,214,128,.1)}
.dc-and.and-nao_chegou{color:#FF8A82;border-color:rgba(255,138,130,.5);background:rgba(255,138,130,.09)}
.dc-mudo{color:var(--faint);font-size:13px;padding:4px 2px}
.dc-bloco{display:flex;flex-direction:column;gap:6px;padding:12px;margin:0 0 10px;border-radius:16px;background:rgba(226,184,74,.07);border:1px solid rgba(226,184,74,.4)}
.dc-bloco-h{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px}
.dc-n{min-width:22px;height:22px;padding:0 7px;border-radius:999px;display:grid;place-items:center;font-size:12px;background:var(--coral,#FF5A4F);color:#fff}
.dc-ver{margin-left:auto;min-height:44px;padding:0 4px 0 12px;color:var(--gold);font-weight:600;font-size:14px}
.dc-bl{position:relative;display:flex;align-items:center;gap:10px;width:100%;min-height:52px;padding:8px 10px 8px 14px;border-radius:12px;background:var(--glass);
  border:1px solid var(--stroke);text-align:left}
.dc-bl-t{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3}
.dc-bl-t b{font-size:14.5px;overflow-wrap:anywhere}
.dc-bl-t small{font-size:12.5px;color:var(--faint);overflow-wrap:anywhere}
.dc-bl-s{flex:none;padding:7px 12px;border-radius:999px;background:var(--gold);color:#1B1606;font-size:13.5px;font-weight:800;white-space:nowrap}
.dc-bl-ult{font-size:13px;color:var(--muted)}
.dc-bl.fora .dc-bl-s{background:var(--glass-2);color:var(--muted);border:1px solid var(--stroke-2)}
.dc-sem{padding:4px 0 8px}
.dc-ponto{position:absolute;left:5px;top:50%;width:7px;height:7px;margin-top:-3px;border-radius:50%;background:var(--coral,#FF5A4F)}
.dc-erros{font-size:13px;color:#FFD2CE;padding:8px 12px;border-radius:12px;background:rgba(255,138,130,.1);border:1px solid rgba(255,138,130,.4)}
.dc-erros summary{min-height:32px;cursor:pointer}
.dc-erros div{margin-top:4px;overflow-wrap:anywhere}
.dc-vazio{text-align:center;color:var(--muted);padding:40px 12px}
.dc-vazio b{display:block;color:var(--ink);font-size:16px;margin-bottom:6px}
@media (prefers-reduced-motion:reduce){.dc-espera,.dc-card.dc-chegou{animation:none}.dc-op.dc-volta,.dc-card.dc-volta,.dc-img img,.dc-prog i{transition:none}}
`;

const Decisoes = {COLUNAS, MAX_PEDIDO, MAX_COMENTARIO, PILHA_MAX, CSS, FOTO_ID, TITULO_PESSOAL, MSG_GRANDE, MSG_FORA, MSG_PESSOAL,
  normalizar, montarLote, versaoDe, semConteudo, htmlSemConteudo, juntarLotes, juntarRespondidos, juntarErros, juntar,
  FILTROS, ROT_COLUNA, filtros, abasHtml,
  novoEstado, estadoDaResposta, rascunhoDe, aplicar, desfazer, contar, resumo, respostas, pedidoResposta, destino, cabe,
  excessos, podeEnviar, contadorHtml, AVISO_COMENTARIO,
  conferencia, decidirArrasto, acaoDoArrasto, limiarArrasto, marcaCartao, rotuloData, fotosDoLote,
  htmlLote, htmlCartao, htmlConferencia, htmlLotes, htmlRespondidos, htmlResumo, htmlErros, esc,
  fotosQueFaltam, porFoto, ligar};
if (typeof module !== "undefined" && module.exports) module.exports = Decisoes;
else raiz.Decisoes = Decisoes;
})(typeof window !== "undefined" ? window : globalThis);
