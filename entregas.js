// Seaninho no celular: as Entregas (v24), a prova de cada entrega das sessões do Claude, como a visão Entregas do
// Monitor geral (geral_entregas.js do Pro): o cartão com a miniatura, o título, o projeto, quem, quando e o estado; o
// Abrir (a prova grande), o ✓ Aprovar e o ✎ Pedir ajuste; o filtro Novas / Todas; a entrega de uma sessão pessoal
// mascarada e sem botões. Sem tela (testado no Node: test_entregas.cjs): aqui se juntam os índices que os PCs publicam
// (hoje.painel.entregas, CONTRATO-v24 seção 3), se monta o HTML e o pedido ao PC. A página desenha, baixa as
// miniaturas (cel_foto "media", só as que aparecem) e a prova grande (cel_foto "alta", só no Abrir) e manda o pedido
// (cel_pedir tipo "acao").
// 13/11 (CONTRATO-monitor-1, "quero todas as funções do monitor aqui"): o cartão é o card comum (cards.js), com a faixa
// da cor do estado, o ícone do tipo, o chip do PC com a bolinha de ligado, o "💬 comentar…" (o Pedir ajuste) e a linha
// da ação (🕓 enviado · ✓ chegou · ✓✓ visto); os botões 🖥 No PC (a pasta dela no Explorer do PC dela) e os extras do
// Monitor (▶ Postar no AI Rats…); no detalhe, o ↺ Voltar para nova; o número de novas no topo da tela; o ✓ Aprovar e
// o ✎ Ajuste no visor.
(function (raiz) {
"use strict";

// O card comum (cards.js): no Node, pelo require; no navegador, o window.Cards lido na hora de desenhar (a ordem dos
// <script> não importa). Sem ele (a casca velha no cache), a lista e o detalhe pedem para abrir o app de novo.
const CARDS_NODE = typeof module !== "undefined" && module.exports && typeof require === "function" ? require("./cards.js") : null;
const cards = () => CARDS_NODE || raiz.Cards || null;

const ESTADOS = ["nova", "aprovada", "ajuste", "refeita"];
const MARCAS = ["aprovada", "ajuste", "nova"];
const ROT_ESTADO = {nova: "Nova", aprovada: "Aprovada", ajuste: "Ajuste pedido", refeita: "Refeita"};
const DICA_ESTADO = {nova: "Ainda não vista: Aprovar ou Pedir ajuste", aprovada: "Você aprovou esta entrega",
  ajuste: "Você pediu um ajuste", refeita: "A sessão entregou a nova versão depois do ajuste"};
const ROT_TIPO = {codigo: "Código", arquivo: "Arquivo", mensagem: "Mensagem", automacao: "Automação",
  publicacao: "Publicação"};
// O card comum: a cor da faixa pelo estado e o ícone pelo tipo (a pessoal: cinza, com o 🔒).
const COR_ESTADO = {nova: "ouro", aprovada: "verde", ajuste: "laranja", refeita: "azul"};
const ICONE_TIPO = {codigo: "💻", arquivo: "📄", mensagem: "💬", automacao: "⚙️", publicacao: "📣"};
const ICONE_SEM_TIPO = "📦", ICONE_PESSOAL = "🔒";
const TITULO_PESSOAL = "Entrega de uma sessão pessoal";
const ONLINE_MS = 150000;       // o mesmo online() da página
const COMENTARIO_MAX = 3000;    // o TEXTO_MAX do Monitor (o pedido inteiro cabe nas 8000 letras do cel_pedir)
const RESUMO_N = 3;             // o bloco do Início: as 3 últimas
const MINIS_POR_VEZ = 4;        // miniaturas pedidas ao banco de uma vez (o MINIS_JUNTAS do Monitor)
// O 🖥 No PC e os botões extras só existem no agente 0.9.0.18 (o de antes responde "ação desconhecida", sem estrago).
// A junção das 6 entregas do Monitor no celular dá esse número (ou um maior) ao trem: se for outro, troque aqui.
const AGENTE_ENT1 = "0.9.0.18";
const ACOES_MAX = 3;            // os botões extras de uma entrega (o agente publica até 3)
const ROTULO_MAX = 30;          // o rótulo de um botão extra: até 30 letras, numa linha
// A id da prova na tabela fotos (CONTRATO seção 1, corrigido em 12/11: só hex, a trava fotos_id_check do banco; o
// agente manda 32 hex do sha256("en|<PC>|" + os bytes)). Que é a prova de uma entrega, diz o campo "mini" onde ela
// aparece, nunca a id. Só ela vai para o cel_foto.
const RX_MINI = /^[0-9a-f]{16,40}$/;
const RX_ID = /^[0-9A-Za-z][0-9A-Za-z_.:-]{0,119}$/;
// A chave de um botão extra: 12 hex do sha256(rótulo + comando), feita no PC. O celular só manda a chave, nunca o
// comando nem o caminho; o botão que muda no PC muda de chave, e o toque com a chave velha é recusado lá.
const RX_CHAVE = /^[0-9a-f]{12}$/;
const RX_VERSAO = /^\d+(\.\d+)*$/;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const umaLinha = (t, n) => { const s = String(t ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const doisDig = n => String(n).padStart(2, "0");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
// Até n letras numa linha, contadas como o agente (Python) conta: por caractere, sem partir um emoji no meio.
function cortar(t, n) {
  const s = String(t ?? "").replace(/\s+/g, " ").trim(), cs = Array.from(s);
  return cs.length > n ? cs.slice(0, n - 1).join("").trimEnd() + "…" : s;
}
const nomeCurto = pc => String(pc || "").length > 11 && String(pc).includes("-") ? String(pc).split("-")[0] : String(pc || "");
// O horário em ms: o ISO do contrato ("2026-11-11T18:40:00-03:00") ou, se vier, segundos/ms da época.
function ms(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
}
const idValido = id => typeof id === "string" && RX_ID.test(id);
const miniValida = id => typeof id === "string" && RX_MINI.test(id);
// Só https vai para o href (o link do Drive); o resto some.
const linkSeguro = u => /^https:\/\/[^\s"'<>]+$/.test(String(u || "")) ? String(u) : "";
// A imagem que a página já baixou: data URL de imagem, blob: ou https. Outra coisa não vira src.
const srcSeguro = u => /^(data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+|blob:[^\s"'<>]+|https:\/\/[^\s"'<>]+)$/.test(String(u || "")) ? String(u) : "";
const onlineDe = (p, agora) => !!p && agora - ms(p.visto_em) < ONLINE_MS;

// ==== Juntar os PCs ===================================================================================================
const listaDePcs = pcs => (Array.isArray(pcs) ? pcs : Object.values(pcs || {})).filter(p => p && typeof p === "object");
function blocoDe(p) {
  const e = p && p.hoje && p.hoje.painel && p.hoje.painel.entregas;
  return e && typeof e === "object" && Array.isArray(e.itens) ? e : null;
}

// Os botões extras de uma entrega (CONTRATO-monitor-1, seção 2): até 3 {rotulo, acao}, o rótulo numa linha de até 30
// letras e a chave com 12 hex; o que não passa cai (e a mesma chave duas vezes vale uma).
function limparAcoes(lista) {
  const out = [];
  for (const b of Array.isArray(lista) ? lista : []) {
    if (out.length >= ACOES_MAX) break;
    if (!b || typeof b !== "object" || typeof b.rotulo !== "string" || typeof b.acao !== "string" || !RX_CHAVE.test(b.acao)) continue;
    const rotulo = cortar(b.rotulo, ROTULO_MAX);
    if (rotulo && !out.some(x => x.acao === b.acao)) out.push({rotulo, acao: b.acao});
  }
  return out;
}

// Uma entrega como a tela usa: os campos do contrato, limpos. A pessoal fica só com o título fixo, o PC, a hora e o
// estado (sem resumo, miniatura, link e botões extras, como no Monitor), mesmo que o índice traga mais.
function limpar(it) {
  const pessoal = it.pessoal === true;
  const estado = ESTADOS.includes(it.estado) ? it.estado : "nova";
  const base = {id: it.id, pc: String(it.pc || ""), quando: ms(it.quando), estado, pessoal,
    tipo: ROT_TIPO[it.tipo] ? it.tipo : ""};
  if (pessoal) return {...base, titulo: TITULO_PESSOAL, projeto: "", quem: "", resumo: "", mini: "", link: "", acoes: []};
  return {...base, titulo: umaLinha(it.titulo, 200) || "Entrega", projeto: umaLinha(it.projeto, 80),
    quem: umaLinha(it.quem, 80), resumo: String(it.resumo || "").trim().slice(0, 280),
    mini: miniValida(it.mini) ? it.mini : "", link: linkSeguro(it.link), acoes: limparAcoes(it.acoes)};
}

// Os dois PCs leem os mesmos índices no Drive e publicam cada um a sua lista: junta pelo id e fica com o estado mais
// novo (o "estado_quando" do item, se vier; senão, o "gerado" da lista de quem publicou; no empate, o PC dela).
// "destino" = o PC que recebe a ação (Aprovar, Pedir ajuste): o PC dela se ele publicou; senão, quem publicou (o
// ligado primeiro, o de lista mais nova no empate). "acoesDe" = o PC cuja lista venceu, de onde vieram os botões
// extras (é ele que os roda: a chave é do acoes-entregas.json dele); "" sem botão. A mais nova primeiro.
function juntar(pcs, agoraMs) {
  const agora = agoraMs ?? Date.now();
  const pubs = new Map();   // pc -> {ligado, gerado}
  const por = new Map();    // id -> {it, peso, pc}
  for (const p of listaDePcs(pcs)) {
    const b = blocoDe(p), pc = String(p.pc || "");
    if (!b || !pc) continue;
    const gerado = ms(b.gerado);
    pubs.set(pc, {ligado: onlineDe(p, agora), gerado});
    for (const it of b.itens) {
      if (!it || typeof it !== "object" || !idValido(it.id)) continue;
      const cand = {it, peso: ms(it.estado_quando) || gerado, pc};
      const atual = por.get(it.id);
      if (!atual || cand.peso > atual.peso || (cand.peso === atual.peso && cand.pc === String(it.pc || "") && atual.pc !== cand.pc))
        por.set(it.id, {...cand, publicaram: atual ? atual.publicaram : []});
      const reg = por.get(it.id);
      if (!reg.publicaram.includes(pc)) reg.publicaram.push(pc);
    }
  }
  const ordemPub = [...pubs.entries()].sort((a, b) => (b[1].ligado - a[1].ligado) || (b[1].gerado - a[1].gerado)).map(x => x[0]);
  const out = [];
  for (const reg of por.values()) {
    const it = limpar(reg.it);
    const destino = reg.publicaram.includes(it.pc) ? it.pc : ordemPub.find(pc => reg.publicaram.includes(pc)) || "";
    const acoesDe = it.acoes.length ? reg.pc : "";
    out.push({...it, destino, destinoLigado: !!(pubs.get(destino) || {}).ligado, publicaram: [...reg.publicaram],
      acoesDe, acoesDeLigado: !!(pubs.get(acoesDe) || {}).ligado});
  }
  return out.sort((a, b) => b.quando - a.quando);
}

const ehNova = it => it && it.estado === "nova";
function contarNovas(itens) { return (itens || []).filter(ehNova).length; }

// As miniaturas que faltam baixar, das entregas que aparecem (poucas por vez, nunca em laço: a página chama de novo
// quando uma chega). `tem(id)` diz se a página já tem a imagem (no cache ou pedindo).
function minisParaPedir(itens, tem, max) {
  const out = [];
  for (const it of itens || []) {
    if (out.length >= (max || MINIS_POR_VEZ)) break;
    if (it && !it.pessoal && miniValida(it.mini) && !out.includes(it.mini) && !(tem && tem(it.mini))) out.push(it.mini);
  }
  return out;
}

// ==== As contas da tela ==============================================================================================
function inicioDoDia(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function horaDe(t) { const d = new Date(t); return `${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`; }
function diaDe(t) { const d = new Date(t); return `${doisDig(d.getDate())}/${doisDig(d.getMonth() + 1)}`; }
// "agora", "há 5 min", "há 2 h", "ontem 14:32", "09/11 14:32" (o haTexto do Monitor)
function haTexto(t, agora) {
  if (!t) return "";
  const s = Math.max(0, (agora - t) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (t >= inicioDoDia(agora)) return `há ${Math.floor(s / 3600)} h`;
  if (t >= inicioDoDia(inicioDoDia(agora) - 1)) return `ontem ${horaDe(t)}`;
  return `${diaDe(t)} ${horaDe(t)}`;
}
// Os cartões em grupos por dia: Hoje, Ontem e dd/mm (a mais nova primeiro).
function grupos(itens, agora) {
  const hoje = inicioDoDia(agora), ontem = inicioDoDia(hoje - 1), out = [];
  for (const it of [...(itens || [])].sort((a, b) => b.quando - a.quando)) {
    const dia = inicioDoDia(it.quando);
    const rotulo = dia >= hoje ? "Hoje" : dia === ontem ? "Ontem" : diaDe(it.quando);
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(it);
    else out.push({dia, rotulo, itens: [it]});
  }
  return out;
}

// O andamento do pedido de uma entrega: a linha do cel_pedir (a página guarda id da entrega -> pedido; estado novo,
// entregue, erro ou cancelado; o "texto" é o JSON do pedido) ou o {fase, texto, marca?, semId?, passo?} que a própria
// página montou. {fase: "enviando" | "ok" | "erro", texto, passo} ou null. O texto é a frase de sempre ("Pedi ao WIN…",
// a resposta do PC, o motivo do erro); o "passo" é a fase da linha do card comum: "fila" (o cel_pedir ainda não
// voltou), "enviado" (no banco, esperando o PC), "esperando" (o PC vai tentar de novo: "Esperando: …"), "chegou" (o PC
// fez), "visto" (a lista do PC já mostra o estado pedido: a marca do pedido é o estado da entrega agora) e "erro".
const PASSOS_DA_FASE = {enviando: ["fila", "enviado", "esperando"], ok: ["chegou", "visto"], erro: ["erro"]};
function marcaDoPedido(p, it) {
  if (MARCAS.includes(p.marca)) return p.marca;
  const t = typeof p.texto === "string" ? p.texto.trim() : "";
  if (!t.startsWith("{")) return "";
  try {
    const j = JSON.parse(t);
    return j && typeof j === "object" && MARCAS.includes(j.marca) && (!it || !j.id || j.id === it.id) ? j.marca : "";
  } catch { return ""; }
}
function andamentoDe(p, it) {
  if (!p || typeof p !== "object") return null;
  let fase, texto;
  if (p.fase) { fase = PASSOS_DA_FASE[p.fase] ? p.fase : "enviando"; texto = String(p.texto || ""); }
  else if (p.estado === "entregue") { fase = "ok"; texto = String(p.resposta || "").trim() || "Feito"; }
  else if (["erro", "cancelado"].includes(p.estado)) { fase = "erro"; texto = String(p.erro || "").trim() || "o PC não conseguiu"; }
  else { fase = "enviando"; texto = `Pedi ao ${nomeCurto(p.pc || (it && it.destino)) || "PC"}…`; }   // o PC do pedido: o No PC e os extras vão a outro
  let passo;
  if (PASSOS_DA_FASE[fase].includes(p.passo)) passo = p.passo;   // a página sabe mais
  else if (fase === "erro") passo = "erro";
  else if (fase === "ok") { const m = marcaDoPedido(p, it); passo = m && it && it.estado === m ? "visto" : "chegou"; }
  else passo = p.semId ? "fila" : String(p.erro || "").startsWith("Esperando:") ? "esperando" : "enviado";
  return {fase, texto, passo};
}
// A linha da ação no card comum, com as frases de sempre: "Pedi ao WIN…" (com a roda), "✓ <resposta>" e
// "⚠ Não deu: <erro>". null sem pedido.
function linhaDe(a) {
  if (!a) return null;
  const texto = a.fase === "ok" ? `✓ ${a.texto}` : a.fase === "erro" ? `⚠ Não deu: ${a.texto}` : a.texto;
  return {fase: a.passo, texto, roda: a.fase === "enviando"};
}
const pedidoDe = (o, it) => andamentoDe(((o && o.pedidos) || {})[it.id], it);

// ==== O PC de cada entrega =============================================================================================
// "0.9.0.17" < "0.9.0.18" < "0.9.1" (as partes que faltam valem 0). Texto que não é versão: false.
function versaoMin(v, min) {
  const a = String(v ?? "").trim(), b = String(min ?? "").trim();
  if (!RX_VERSAO.test(a) || !RX_VERSAO.test(b)) return false;
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0;
  }
  return true;
}
// O PC nos {"WIN-EAD6OD66GE7": {versao, ligado}} da página, sem olhar a caixa (o igual primeiro): {...o dele, nome (a
// chave da página: é o nome que o cel_pedir conhece)} ou null.
function infoPc(pcs, nome) {
  const alvo = String(nome || "").trim().toUpperCase();
  if (!alvo || !pcs || typeof pcs !== "object") return null;
  let achou = null;
  for (const [k, v] of Object.entries(pcs)) {
    if (!v || typeof v !== "object" || k.trim().toUpperCase() !== alvo) continue;
    if (k === nome) return {...v, nome: k};
    achou = achou || {...v, nome: k};
  }
  return achou;
}
// A bolinha do card: o PC da entrega ligado (true), desligado (false) ou desconhecido (undefined: a cor do card).
function ligadoDe(it, pcs) {
  const p = it && infoPc(pcs, it.pc);
  return p && p.ligado !== undefined && p.ligado !== null ? !!p.ligado : undefined;
}
// O 🖥 No PC aparece só fora da pessoal e com o agente AGENTE_ENT1 (ou mais novo) no PC dela; com ele desligado, fica
// apagado, com o porquê ("WIN desligado").
function podeNoPc(it, pcs) {
  const p = it && !it.pessoal && idValido(it.id) ? infoPc(pcs, it.pc) : null;
  if (!p || !versaoMin(p.versao, AGENTE_ENT1)) return {mostrar: false, pode: false, motivo: ""};
  const ligado = !!p.ligado, sem = semCelularAprovado(p);
  if (ligado && sem) return {mostrar: true, pode: false, motivo: sem};
  return {mostrar: true, pode: ligado, motivo: ligado ? "" : `${nomeCurto(it.pc || p.nome)} desligado`};   // o nome do chip
}
// Revisão do PR #36: o agente só faz o 🖥 No PC e os botões extras para um celular aprovado (como o ⚡ Rodar no PC); o
// sinal dele (hoje.painel.rodar = {ligado, motivo}, que a página põe no "rodar" do PC) diz quando está desligado
function semCelularAprovado(p) {
  const r = p && p.rodar;
  return r && typeof r === "object" && r.ligado === false ? String(r.motivo || "Desligado neste PC").slice(0, 200) : "";
}

// ==== O pedido ao PC ==================================================================================================
// O Aprovar, o Pedir ajuste e o Voltar para nova: {pc, ligado, pedido} para o cel_pedir(pc, tipo "acao",
// texto = JSON do pedido), ou {erro} (nada sai). No "ajuste", o comentário é o que a sessão recebe.
function pedidoMarcar(it, marca, comentario) {
  if (!it || !idValido(it.id)) return {erro: "Essa entrega não está mais na lista"};
  if (!MARCAS.includes(marca)) return {erro: "Marca desconhecida"};
  if (it.pessoal) return {erro: "Entrega de uma sessão pessoal: peça na própria sessão, no PC"};
  const c = String(comentario ?? "").trim();
  if (marca === "ajuste" && !c) return {erro: "Escreva o que ajustar"};
  if (c.length > COMENTARIO_MAX) return {erro: `O ajuste passou ${(c.length - COMENTARIO_MAX).toLocaleString("pt-BR")} letras do limite (${COMENTARIO_MAX.toLocaleString("pt-BR")}): encurte. Nada foi cortado.`};
  if (!it.destino) return {erro: "Nenhum PC publicou esta entrega agora"};
  return {pc: it.destino, ligado: !!it.destinoLigado, pedido: {acao: "entrega_marcar", id: it.id, marca, comentario: c}};
}
// O 🖥 No PC (CONTRATO-monitor-1, 3.1): vai ao PC DA ENTREGA (é lá que estão as pastas dela), que abre a pasta no
// Explorer. {pc, ligado, pedido} ou {erro}: a pessoal, o PC sem o agente novo e o PC desligado não pedem nada.
function pedidoAbrirPc(it, pcs) {
  if (!it || !idValido(it.id)) return {erro: "Essa entrega não está mais na lista"};
  if (it.pessoal) return {erro: "Entrega de uma sessão pessoal: abra no PC"};
  const p = infoPc(pcs, it.pc), curto = nomeCurto(it.pc || (p && p.nome)) || "PC";
  if (!p || !versaoMin(p.versao, AGENTE_ENT1)) return {erro: `O agente do ${curto} é de antes da ${AGENTE_ENT1}: abra no PC.`};
  if (!p.ligado) return {erro: `O ${curto} está desligado: abra quando ele ligar.`};
  if (semCelularAprovado(p)) return {erro: semCelularAprovado(p)};
  return {pc: p.nome, ligado: true, pedido: {acao: "entrega_abrir_pc", id: it.id}};
}
// Um botão extra (CONTRATO-monitor-1, 3.2): vai ao PC que publicou os botões (o acoesDe), só com a chave (o comando
// fica no PC). {pc, ligado, rotulo, pedido} ou {erro}.
function pedidoBotao(it, chave, pcs = null) {
  if (!it || !idValido(it.id)) return {erro: "Essa entrega não está mais na lista"};
  if (it.pessoal) return {erro: "Entrega de uma sessão pessoal: peça na própria sessão, no PC"};
  const b = RX_CHAVE.test(String(chave || "")) ? limparAcoes(it.acoes).find(x => x.acao === chave) : null;
  if (!b) return {erro: "Esse botão saiu da lista: atualize."};
  if (!it.acoesDe) return {erro: "Nenhum PC publicou esse botão agora"};
  // 2ª revisão do PR #36: com o PC desligado, não manda (o pedido ficaria na fila e rodaria quando ele ligasse)
  if (!it.acoesDeLigado) return {erro: `O ${nomeCurto(it.acoesDe)} está desligado: toque de novo quando ele ligar.`};
  const sem = semCelularAprovado(infoPc(pcs, it.acoesDe));
  if (sem) return {erro: sem};
  return {pc: it.acoesDe, ligado: !!it.acoesDeLigado, rotulo: b.rotulo, pedido: {acao: "entrega_botao", id: it.id, botao: chave}};
}

// ==== O HTML ==========================================================================================================
const estadoDe = it => (ESTADOS.includes(it.estado) ? it.estado : "nova");
const corDe = it => (it.pessoal ? "cinza" : COR_ESTADO[estadoDe(it)]);
const iconeDe = it => (it.pessoal ? ICONE_PESSOAL : ICONE_TIPO[it.tipo] || ICONE_SEM_TIPO);
const SEM_CARDS = `<div class="ent-vazio"><b>Falta uma parte da página.</b><p>Feche o app e abra de novo: ele baixa a versão inteira.</p></div>`;
function selo(it) {
  const s = estadoDe(it);
  return `<span class="ent-selo ${s}" title="${esc(DICA_ESTADO[s])}">${esc(ROT_ESTADO[s])}</span>`;
}
const tipoHtml = it => (it.tipo && ROT_TIPO[it.tipo] ? `<span class="ent-tipo">${esc(ROT_TIPO[it.tipo])}</span>` : "");
// "projeto · quem" (escapado)
const metaTexto = it => [it.projeto, it.quem && it.quem !== it.projeto ? it.quem : ""].filter(Boolean).map(esc).join(" · ");
function metaHtml(it) {
  const m = metaTexto(it);
  return m ? `<div class="ent-meta">${m}</div>` : "";
}
// A miniatura: a imagem que a página já tem (op.minis[id]) ou o lugar dela, marcado com data-foto-mini para a página
// baixar (cel_foto "media"). As classes do card comum (card-mini) e as de sempre (ent-thumb, data-ent-abrir).
function miniHtml(it, o) {
  if (it.pessoal) return `<div class="card-mini ent-thumb vazio pessoal" aria-hidden="true"><span>🔒</span></div>`;
  if (!it.mini) return `<div class="card-mini ent-thumb vazio" aria-hidden="true"><span>Sem imagem</span></div>`;
  const src = srcSeguro(((o && o.minis) || {})[it.mini]);
  const dentro = src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">`
    : `<span class="card-mini-ph" data-foto-mini="${esc(it.mini)}"><i class="card-roda" aria-hidden="true"></i></span>`;
  return `<button type="button" class="card-mini ent-thumb" data-ent-abrir="${esc(it.id)}" aria-label="Abrir a prova: ${esc(it.titulo)}">${dentro}</button>`;
}
// Os botões, no card comum (com a classe "ent-b" de sempre, para os seletores da página): o 👁 Abrir só no card da
// lista; o ✓ Aprovar fora da aprovada; o ✎ Ajuste (no detalhe, "✎ Pedir ajuste") some com a caixa aberta (ela tem o
// Mandar e o Cancelar); o ↺ Voltar para nova só no detalhe da aprovada, da de ajuste e da refeita; o 🖥 No PC só com o
// agente novo no PC dela (desligado: apagado, com o porquê); os extras do Monitor (▶ rótulo). Com um pedido indo, só
// o Abrir continua. A pessoal: nenhum.
function botoesDe(it, o, a, detalhe) {
  if (it.pessoal) return [];
  const id = it.id, ocupado = !!a && a.fase === "enviando";
  const b = (icone, rotulo, attrs, extra) => ({icone, rotulo, attrs, classe: "ent-b", ...extra});
  const lista = [];
  if (!detalhe) lista.push(b("👁", "Abrir", {"data-ent-abrir": id}));
  if (it.estado !== "aprovada") lista.push(b("✓", "Aprovar", {"data-ent-aprovar": id}, {cor: "ouro", desligado: ocupado}));
  if (o.ajuste !== id) lista.push(b("✎", detalhe ? "Pedir ajuste" : "Ajuste", {"data-ent-ajuste": id, "aria-expanded": "false"}, {desligado: ocupado}));
  if (detalhe && ["aprovada", "ajuste", "refeita"].includes(it.estado)) lista.push(b("↺", "Voltar para nova", {"data-ent-nova": id}, {desligado: ocupado}));
  const np = podeNoPc(it, o.pcs);
  if (np.mostrar) lista.push(b("🖥", "No PC", {"data-ent-pc": id}, {desligado: ocupado || !np.pode, dica: np.motivo || undefined,
    aria: np.motivo ? `No PC: ${np.motivo}` : undefined}));
  for (const x of limparAcoes(it.acoes)) lista.push(b("▶", x.rotulo, {"data-ent-botao": id, "data-ent-chave": x.acao}, {desligado: ocupado}));
  return lista;
}
// O card da lista (o card comum): a faixa da cor do estado, o ícone do tipo, o título, o chip do PC e o "há X" com a
// bolinha do PC ligado; o selo e o tipo, e "projeto · quem" numa linha só dela (ao lado da prova, a coluna é estreita:
// junto do selo, ela quebrava no meio); a prova ao lado do resumo; os botões; o "💬 comentar…" (o
// Pedir ajuste: abre a caixa no lugar dele; com um pedido indo, sai, como o ✎) e a linha da ação.
function cartao(it, o, agora, K) {
  const s = estadoDe(it), a = pedidoDe(o, it), aberto = o.ajuste === it.id, enviando = !!a && a.fase === "enviando";
  const meta = metaTexto(it);
  const corpo = it.pessoal ? `<p class="ent-txt mudo">Peça o que precisar na própria sessão, no PC.</p>`
    : it.resumo ? `<p class="ent-txt">${esc(it.resumo)}</p>` : "";
  return K.card({cor: corDe(it), icone: iconeDe(it), titulo: it.titulo, pc: it.pc, quando: it.quando, agora,
    ligado: ligadoDe(it, o.pcs), sub: `${selo(it)}${tipoHtml(it)}${meta ? `<span class="ent-meta">${meta}</span>` : ""}`,
    mini: miniHtml(it, o), corpo, botoes: botoesDe(it, o, a, false),
    comentar: it.pessoal || (enviando && !aberto) ? null
      : {attrs: {"data-ent-comentar": it.id}, valor: String((o.rascunhos || {})[it.id] ?? ""), aberto, html: aberto ? htmlAjuste(it, o) : ""},
    linha: it.pessoal ? null : linhaDe(a), classe: `ent-card st-${s}${it.pessoal ? " pessoal" : ""}`, attrs: {"data-ent-card": it.id}});
}
function chip(valor, rotulo, n, atual) {
  const on = valor === atual;
  return `<button type="button" class="ent-chip${on ? " on" : ""}" data-ent-filtro="${valor}" aria-pressed="${on}">${esc(rotulo)} <b>${n}</b></button>`;
}

// A lista (tela cheia). filtro: "novas" (padrão) | "todas". op: {minis: {id da miniatura: src}, pedidos: {id da
// entrega: linha do cel_pedir ou {fase, texto, marca?, semId?, passo?}}, ajuste: id da entrega com a caixa do Pedir
// ajuste aberta, rascunhos: {id: texto}, erro, pcs: {"WIN-…": {versao, ligado}} (a bolinha e o 🖥 No PC), agora: ms}.
function htmlLista(itens, filtro, op) {
  const o = op || {}, agora = o.agora ?? Date.now(), f = filtro === "todas" ? "todas" : "novas";
  const todas = itens || [], novas = todas.filter(ehNova), lista = f === "novas" ? novas : todas;
  const topo = `<div class="ent-filtros" role="group" aria-label="Quais entregas">${chip("novas", "Novas", novas.length, f)}${chip("todas", "Todas", todas.length, f)}</div>`;
  if (!todas.length) {
    return `${topo}<div class="ent-vazio"><b>Nenhuma entrega nos últimos 14 dias.</b><p>Toda sessão que entrega um trabalho registra aqui a prova (o print, o cartão ou a página do PDF), com a skill registrar-entrega.</p></div>`;
  }
  if (!lista.length) {
    return `${topo}<div class="ent-vazio"><b>Nenhuma entrega nova 🎉</b><p>Você já aprovou ou pediu ajuste em todas.</p><button type="button" class="card-b ent-b" data-ent-filtro="todas">Ver todas</button></div>`;
  }
  const K = cards();
  if (!K) return `${topo}${SEM_CARDS}`;
  const gs = grupos(lista, agora).map(g => `<section class="ent-dia" aria-label="${esc(g.rotulo)}"><h4 class="ent-dia-t">${esc(g.rotulo)} <span>${g.itens.length}</span></h4>
${g.itens.map(it => cartao(it, o, agora, K)).join("")}</section>`).join("");
  return `${topo}<div class="ent-lista">${gs}</div>`;
}

// O título da tela no topo: "📦 Entregas" e, com novas, o número em destaque ("③ novas").
function htmlTitulo(itens) {
  const n = contarNovas(Array.isArray(itens) ? itens : []);
  if (!n) return "📦 Entregas";
  const p = n === 1 ? "nova" : "novas";
  return `📦 Entregas <span class="ent-novas" aria-label="${esc(`${n} ${p}`)}"><span class="ent-novas-n">${esc(n)}</span> ${p}</span>`;
}
// Os botões do visor (o toque na prova: o "extra" do Marcar.ver): o ✓ Aprovar (fora da aprovada) e o ✎ Ajuste (a
// página fecha o visor e abre a caixa no detalhe). A página troca o "acao" pela função.
function extrasDoVisor(it) {
  if (!it || it.pessoal || !idValido(it.id)) return [];
  return [...(it.estado === "aprovada" ? [] : [{rotulo: "✓ Aprovar", acao: "aprovar"}]), {rotulo: "✎ Ajuste", acao: "ajuste"}];
}

// A prova grande e o texto (o Abrir). A imagem leva data-foto-alta: a página baixa a "alta" (cel_foto) só agora e
// troca o src; até lá, mostra a miniatura (op.minis) ou a roda. op: {minis, altas: {id: src}, pedidos, ajuste,
// rascunhos, erro, pcs, agora}.
function htmlDetalhe(it, op) {
  const o = op || {}, agora = o.agora ?? Date.now();
  if (!it) return `<div class="ent-vazio"><b>Essa entrega saiu da lista.</b></div>`;
  const K = cards();
  if (!K) return SEM_CARDS;
  const a = pedidoDe(o, it);
  let prova;
  if (it.pessoal) prova = `<div class="ent-prova vazio pessoal"><span>🔒 Sessão pessoal</span><small>A prova fica só no PC.</small></div>`;
  else if (!it.mini) prova = `<div class="ent-prova vazio"><span>Esta entrega não tem imagem</span></div>`;
  else {
    const alta = srcSeguro((o.altas || {})[it.mini]), mini = srcSeguro((o.minis || {})[it.mini]);
    const img = alta || mini;
    prova = `<button type="button" class="ent-prova${alta ? "" : " baixando"}" data-foto-alta="${esc(it.mini)}" aria-label="Ver a prova em tela cheia: ${esc(it.titulo)}">
      ${img ? `<img src="${esc(img)}" alt="Prova: ${esc(it.titulo)}">` : ""}${alta ? "" : `<span class="ent-baixando"><i class="card-roda" aria-hidden="true"></i>Baixando a imagem grande…</span>`}</button>`;
  }
  const link = it.link ? `<a class="ent-link" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">↗ ${/^https:\/\/(drive|docs)\.google\.com\//.test(it.link) ? "Abrir no Google Drive" : "Abrir o link"}</a>` : "";
  const quando = it.quando ? `${diaDe(it.quando)} às ${horaDe(it.quando)}` : "";   // o "há quanto" já está no alto
  const cab = `<div class="ent-cab">${selo(it)}${tipoHtml(it)}<span class="ent-grow"></span>${K.chipPc(it.pc)}${K.ha(it.quando, agora, ligadoDe(it, o.pcs), corDe(it))}</div>`;
  return `<div class="ent-det" data-ent-det="${esc(it.id)}">
  ${prova}
  <div class="ent-det-info">${cab}
    <h3 class="ent-titulo grande">${esc(it.titulo)}</h3>${metaHtml(it)}
    <div class="ent-quando">${esc([it.pc ? "no " + nomeCurto(it.pc) : "", quando].filter(Boolean).join(" · "))}</div>
    ${it.resumo ? `<p class="ent-resumo">${esc(it.resumo)}</p>` : ""}
    ${it.pessoal ? `<p class="ent-txt mudo">Entrega de uma sessão pessoal: peça o que precisar na própria sessão, no PC.</p>` : ""}
    ${link}${K.linha(linhaDe(a))}${o.ajuste === it.id ? htmlAjuste(it, o) : ""}${K.botoes(botoesDe(it, o, a, true))}
  </div>
</div>`;
}

// O contador do ajuste (a caixa não corta: sem maxlength): aparece perto do limite e fica vermelho ao passar.
function contadorAjuste(id, n) {
  const passou = n > COMENTARIO_MAX, mostra = n >= Math.floor(COMENTARIO_MAX * 0.8), fmt = x => x.toLocaleString("pt-BR");
  return `<div class="ent-cont${passou ? " passou" : ""}${mostra ? "" : " oculto"}" data-ent-cont="${esc(id)}">`
    + `${passou ? `⚠ passou ${fmt(n - COMENTARIO_MAX)} letras do limite (${fmt(COMENTARIO_MAX)}): encurte` : `${fmt(n)}/${fmt(COMENTARIO_MAX)}`}</div>`;
}
// A caixa do ✎ Pedir ajuste (e do 💬 comentar…): o texto vai à sessão que entregou (ou à central, se ela estiver
// fechada), pelo PC dela. op.rascunhos[id]: o que já estava escrito; op.erro: o motivo do último envio que não saiu.
function htmlAjuste(it, op) {
  if (!it || it.pessoal) return "";
  const o = op || {}, id = esc(it.id), rasc = String((o.rascunhos || {})[it.id] ?? "");
  const quem = it.quem ? `a sessão ${umaLinha(it.quem, 40)}` : "a sessão que entregou";
  const para = it.destino ? `→ Vai para ${quem}, no ${nomeCurto(it.pc || it.destino)} (se ela estiver fechada, para a sessão central)`
    : "⚠ Nenhum PC ligado publicou esta entrega agora";
  return `<div class="ent-ajuste" data-ent-form="${id}">
  <label class="ent-aj-rot" for="ent-aj-${id}">O que ajustar?</label>
  <textarea id="ent-aj-${id}" data-ent-texto="${id}" rows="3" placeholder="Ex.: a planta do térreo está sem as vagas; troque a capa pela imagem 3" aria-describedby="ent-para-${id}">${esc(rasc)}</textarea>
  ${contadorAjuste(it.id, rasc.length)}
  <div class="ent-para${it.destino ? "" : " erro"}" id="ent-para-${id}">${esc(para)}</div>
  ${o.erro ? `<div class="ent-linha erro" role="alert">⚠ ${esc(umaLinha(o.erro, 200))}</div>` : ""}
  <div class="ent-aj-acoes"><button type="button" class="card-b ent-b" data-ent-cancelar="${id}">Cancelar</button><button type="button" class="card-b ouro ent-b" data-ent-mandar="${id}"${it.destino ? "" : " disabled"}>Mandar ajuste</button></div>
</div>`;
}

// O bloco "📦 Entregas" do Início: as 3 últimas, com miniatura, e o "ver tudo". "" sem entrega.
function htmlResumo(itens, op) {
  const o = op || {}, agora = o.agora ?? Date.now(), todas = itens || [];
  if (!todas.length) return "";
  const n = contarNovas(todas);
  const linhas = todas.slice(0, RESUMO_N).map(it => `<button type="button" class="ent-res" data-ent-abrir="${esc(it.id)}">
    ${it.pessoal || !it.mini ? `<span class="ent-res-mini vazio" aria-hidden="true">${it.pessoal ? "🔒" : "📦"}</span>`
      : srcSeguro((o.minis || {})[it.mini]) ? `<img class="ent-res-mini" src="${esc(srcSeguro(o.minis[it.mini]))}" alt="">`
      : `<span class="ent-res-mini" data-foto-mini="${esc(it.mini)}" aria-hidden="true"></span>`}
    <span class="ent-res-t"><b>${esc(it.titulo)}</b><small>${esc([it.projeto, haTexto(it.quando, agora)].filter(Boolean).join(" · "))}</small></span>${selo(it)}</button>`).join("");
  return `<section class="bloco ent-bloco"><h3>📦 Entregas <button type="button" class="ent-ir" data-ent-tudo>${n ? esc(plural(n, "nova", "novas")) + " · " : ""}ver tudo ›</button></h3>${linhas}</section>`;
}

// O que um toque pede, pelo elemento tocado (a página só despacha): {acao, id?, valor?, chave?} ou null (fora, ou
// num botão desligado). O 💬 comentar… é o mesmo que o ✎ Ajuste (abre a caixa); o ↺ Voltar para nova é "nova"; o
// 🖥 No PC é "nopc"; um extra é "botao", com a chave dele.
const ATRS = [["entAbrir", "abrir"], ["entAprovar", "aprovar"], ["entAjuste", "ajuste"], ["entComentar", "ajuste"],
  ["entNova", "nova"], ["entPc", "nopc"], ["entBotao", "botao"], ["entMandar", "mandar"], ["entCancelar", "cancelar"],
  ["entFiltro", "filtro"], ["entTudo", "tudo"], ["fotoAlta", "foto"]];
const SELETOR = ATRS.map(([k]) => `[data-${k.replace(/[A-Z]/g, c => "-" + c.toLowerCase())}]`).join(",");
function acaoDe(el) {
  const n = el && el.closest ? el.closest(SELETOR) : null;
  if (!n || n.disabled) return null;
  for (const [k, acao] of ATRS) {
    if (!n.dataset || n.dataset[k] === undefined) continue;
    if (acao === "filtro") return {acao, valor: n.dataset[k]};
    if (acao === "tudo") return {acao};
    if (acao === "botao") return {acao, id: n.dataset[k], chave: String(n.dataset.entChave || "")};
    return {acao, id: n.dataset[k]};
  }
  return null;
}

// ==== O CSS (com as variáveis do index.html: --glass, --stroke, --gold, --ink, --muted, --navy) ======================
// Só o que é das Entregas: o card, os botões (card-b), a miniatura (card-mini), a linha da ação e a roda vêm do
// Cards.CSS, que a página põe antes deste.
const CSS = `
.ent-filtros{display:flex;gap:6px;margin:0 0 12px}
.ent-chip{flex:1;min-height:44px;padding:0 12px;border-radius:999px;background:var(--glass);border:1px solid var(--stroke);color:var(--muted);font-size:15px;font-weight:600}
.ent-chip b{font-weight:500;opacity:.8;font-variant-numeric:tabular-nums}
.ent-chip.on{background:rgba(226,184,74,.16);border-color:rgba(226,184,74,.5);color:var(--gold-2,#F6D77E)}
.ent-dia-t{margin:14px 2px 8px;font-size:12px;font-weight:650;letter-spacing:.6px;text-transform:uppercase;color:var(--muted)}
.ent-dia-t span{font-weight:400;margin-left:4px}
.ent-thumb.pessoal{font-size:24px}
.ent-cab{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);min-width:0;flex-wrap:wrap}
.ent-grow{flex:1}
.ent-selo{padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap}
.ent-selo.nova{background:rgba(226,184,74,.17);color:var(--gold-2,#F6D77E)}
.ent-selo.aprovada{background:rgba(72,214,128,.15);color:#86E8AE}
.ent-selo.ajuste{background:rgba(232,128,92,.18);color:#F0A06F}
.ent-selo.refeita{background:rgba(111,168,255,.16);color:#A5C8FF}
.ent-tipo{white-space:nowrap}
.ent-card .ent-meta{flex-basis:100%}
.ent-titulo{margin:0;font-size:18px;font-weight:650;line-height:1.3;color:var(--ink);overflow:hidden;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.ent-meta{min-width:0;max-width:100%;font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ent-txt{margin:0;font-size:14px;color:var(--muted);overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.ent-txt.mudo{font-size:13px;-webkit-line-clamp:2}
.ent-b{max-width:100%;overflow:hidden;text-overflow:ellipsis}
.ent-linha{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--muted)}
.ent-linha.erro{color:#FFA49C}
.ent-ajuste{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:12px;background:rgba(0,0,0,.2);border:1px solid var(--stroke)}
.ent-aj-rot{font-size:13px;font-weight:650;color:var(--ink)}
.ent-cont{font-size:12px;text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}
.ent-cont.oculto{display:none}
.ent-cont.passou{color:#FFA49C;font-weight:650;text-align:left}
.ent-ajuste textarea{display:block;width:100%;min-height:96px;padding:10px 12px;border-radius:12px;border:1px solid var(--stroke);background:var(--glass-2);color:var(--ink);font:inherit;font-size:16px;line-height:1.35;resize:vertical}
.ent-ajuste textarea:focus{outline:none;border-color:rgba(226,184,74,.65)}
.ent-para{font-size:12.5px;color:var(--muted)}
.ent-para.erro{color:#FFA49C}
.ent-aj-acoes{display:flex;gap:8px}
.ent-vazio{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:16px;border-radius:16px;background:var(--glass);border:1px dashed var(--stroke);color:var(--muted);font-size:14px}
.ent-vazio b{color:var(--ink);font-size:15.5px}
.ent-vazio p{margin:0}
.ent-vazio .ent-b{flex:none}
.ent-det{display:flex;flex-direction:column;gap:12px}
.ent-prova{display:grid;place-items:center;position:relative;width:100%;min-height:180px;max-height:62vh;padding:0;border-radius:14px;overflow:hidden;background:rgba(0,0,0,.3);border:1px solid var(--stroke);cursor:zoom-in}
.ent-prova img{display:block;width:100%;max-height:62vh;object-fit:contain}
.ent-prova.baixando img{filter:blur(2px);opacity:.75}
.ent-prova.vazio{cursor:default;display:flex;flex-direction:column;gap:4px;color:var(--muted);font-size:14px;padding:20px}
.ent-baixando{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:5px 12px;border-radius:999px;background:rgba(4,10,24,.82);color:var(--ink);font-size:12.5px;white-space:nowrap}
.ent-det-info{display:flex;flex-direction:column;gap:8px}
.ent-quando{font-size:13px;color:var(--muted)}
.ent-resumo{margin:0;font-size:15px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.ent-link{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:12px;background:var(--glass-2);border:1px solid var(--stroke);color:#7FD3FF;font-weight:650;text-decoration:none}
.ent-res{display:flex;align-items:center;gap:10px;width:100%;min-height:56px;padding:8px 0;border-top:1px solid var(--stroke);text-align:left}
.ent-res:first-of-type{border-top:0;padding-top:2px}
.ent-res-mini{flex:none;width:56px;height:42px;border-radius:8px;object-fit:cover;background:rgba(0,0,0,.28);display:grid;place-items:center;font-size:18px}
.ent-res-t{flex:1;min-width:0;display:flex;flex-direction:column}
.ent-res-t b{font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ent-res-t small{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ent-ir{margin-left:auto;min-height:44px;padding:0 4px;font-size:13.5px;font-weight:600;color:var(--gold-2,#F6D77E);text-transform:none;letter-spacing:0}
.ent-novas{margin-left:4px;font-size:14px;font-weight:600;color:var(--gold-2,#F6D77E)}
.ent-novas-n{display:inline-block;min-width:22px;height:22px;padding:0 6px;margin-right:2px;border-radius:999px;background:var(--gold);color:var(--navy);font-size:13px;font-weight:800;line-height:22px;text-align:center;vertical-align:1px;font-variant-numeric:tabular-nums}
.v-extra-b{min-height:44px}
`;

const Entregas = {ESTADOS, MARCAS, ROT_ESTADO, ROT_TIPO, COR_ESTADO, ICONE_TIPO, TITULO_PESSOAL, COMENTARIO_MAX, AGENTE_ENT1,
  ACOES_MAX, ROTULO_MAX, contadorAjuste, juntar, contarNovas, minisParaPedir, versaoMin, podeNoPc, pedidoMarcar,
  pedidoAbrirPc, pedidoBotao, andamentoDe, htmlLista, htmlDetalhe, htmlAjuste, htmlResumo, htmlTitulo, extrasDoVisor,
  acaoDe, haTexto, grupos, ms, CSS};
if (typeof module !== "undefined" && module.exports) module.exports = Entregas;
else raiz.Entregas = Entregas;
})(typeof window !== "undefined" ? window : globalThis);
