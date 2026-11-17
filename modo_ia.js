// Seaninho no celular: o Modo da IA (pro-102), sem tela. O Claude Code de cada PC no Pool (o trocador de contas) ou no
// Proxy (o proxy de IA da Seazone), a saúde do proxy medida lá (ok, lento, fora) e a troca de um clique, igual ao
// controle do Monitor geral: o modo de cada PC sempre à vista nos PCs do topo, a seção "Modo da IA" no cartão de cada PC
// (Computadores), a folha de confirmação (o que muda, as sessões que seguem no modo antigo até reabrir e o ensaio, pedido
// assim que a folha abre: o trocador sem aplicar diz o que faria e nada muda), o "Trocar mesmo assim" quando o proxy não
// passou na régua de estável, o "trocando…" e, no fim, uma linha de resultado com o que falta. Nada troca sozinho: com
// o PC no Proxy e o proxy lento ou fora, só a sugestão de voltar ao Pool.
// O bloco de cada PC é o hoje.modo_ia que o agente de lá publica (o scripto/modo_ia.py do Pro, pelo modo_ia_agente.py);
// o pedido é o cel_pedir tipo "acao" {"acao": "modo_ia", "para", "forcar", "ensaio", "de": "celular"}. A página desenha
// e pede; aqui ficam as contas e o HTML (testados no Node: test_modo_ia.cjs).
(function (raiz) {
"use strict";

// OS TEXTOS: a mesma tabela do Monitor geral (a constante TX do scripto/assets/geral_modo_ia.js do Pro), com as mesmas
// frases. Mudou uma, mude a outra (o test_modo_ia.cjs confere as duas quando a pasta do Pro está ao lado).
const TX = {
  rotulo: {pool: "Pool", proxy: "Proxy", desconhecido: "?"},
  saude: {ok: "proxy ok", lento: "proxy lento", fora: "proxy fora", sem_medida: "sem medida do proxy"},
  sugestao: e => `Proxy ${e === "fora" ? "fora" : "lento"}: trocar para o Pool?`,
  botao: {pool: "Trocar para o Pool", proxy: "Trocar para o Proxy"},
  trocando: "trocando…",
  semSinal: pc => `o ${pc} está sem sinal (desligado?)`,
  semBloco: "o Seaninho de lá ainda não troca o modo",
  semModo: "não deu para ler o modo desse PC",
  agora: "trocando agora",
  semChave: "a chave do proxy não está nesse PC",
  titulo: (pc, x) => `Trocar o ${pc} para o ${x}?`,
  muda: {proxy: pc => [`O Claude Code do ${pc} passa a usar o proxy de IA da Seazone, sem as contas do pool.`,
    "A Conta do Claude do Seaninho desliga (no proxy ela não troca conta)."],
  pool: pc => [`O Claude Code do ${pc} volta ao trocador de contas e pede uma conta do pool com folga.`,
    "A Conta do Claude do Seaninho religa."]},
  reabrir: (n, pc, atual) => !n ? `Nenhuma sessão aberta no ${pc}: nada a reabrir.`
    : n === 1 ? `A sessão aberta no ${pc} segue no ${atual} até reabrir:` : `As ${n} sessões abertas no ${pc} seguem no ${atual} até reabrir:`,
  conferindo: "Conferindo o que muda…",
  faria: "O trocador faria:",
  mesmoFaria: "Mesmo assim, o trocador faria:",
  regua: "A régua de estável pede 30 min de medidas ok com a chave.",
  naoConferiu: "Não deu para conferir:",
  trocar: "Trocar agora", mesmoAssim: "Trocar mesmo assim", cancelar: "Cancelar",
  ensaioEm: (h, m) => `Ensaio às ${h}: ${m}`,
  // revisão do PR 49: a troca de verdade de outro computador é só pelo toque no celular; do Monitor do outro PC, só o
  // ensaio (aqui só para a tabela ficar igual à do Monitor: o celular é o toque que troca)
  soCelular: pc => `A troca de verdade do ${pc} é só pelo toque no celular (Computadores › Trocar). Daqui, só o ensaio.`,
  // o ninho do Monitor geral (16/11): um clique troca o PC dele, sem folha, com o Desfazer (aqui só para a tabela ficar
  // igual à do Monitor; o celular segue com a folha)
  ninhoDica: (x, s) => `Clique para trocar este PC para o ${x}${s ? ` (${s})` : ""}`,
  ninhoIndo: x => `trocando para o ${x}…`,
  desfazer: "Desfazer",
};
const AGENTE = "0.9.0.22";        // o agente que publica o bloco e faz o pedido modo_ia
const PEGAR_MS = 25000;           // o agente parado olha os pedidos a cada 10 s (o mesmo PEGAR_MS do pcs.js)
const PRAZO_MS = 8 * 60000;       // a troca leva até os 5 min do trocador, mais a fila da tela do PC
const FICA_MS = 10 * 60000;       // a linha do resultado fica até o × ou isso
const MAX_NOMES = 6;              // as sessões citadas na folha e no que falta ("e mais K")
const AVISEI = " · avisei a central do PC";   // o fim da resposta do agente quando a nota à central entrou
const CLS = {ok: "ok", lento: "lento", fora: "fora", sem_medida: "sem"};
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const ls = v => Array.isArray(v) ? v : [];
const hora = q => String(q || "").slice(-5);

// ---- As contas ---------------------------------------------------------------------------------------------------
// O bloco do PC (hoje.modo_ia), ou null: o agente de antes, ou sem o gancho lá (o controle daquele PC não aparece)
function bloco(p) {
  const b = p && p.hoje && p.hoje.modo_ia;
  return b && typeof b === "object" && !Array.isArray(b) && b.v === 1 && Object.prototype.hasOwnProperty.call(TX.rotulo, b.modo) ? b : null;
}
const alvo = b => b && b.modo === "proxy" ? "pool" : "proxy";
const sugere = b => !!(b && b.modo === "proxy" && b.sugestao === "pool");
// A saúde curta: "proxy ok · 0,4 s", "proxy lento · 4,1 s" (sem a hora e sem o parêntese; a frase inteira vai à parte)
function saudeCurta(s) {
  s = s || {};
  const e = TX.saude[s.estado] ? s.estado : "sem_medida";
  const f = String(s.frase || "").replace(/\s*\(.*\)\s*$/, "").replace(/ às \d{1,2}:\d{2}$/, "").trim();
  if (!f) return TX.saude[e];
  return /proxy/.test(f) ? f : "proxy " + f;
}
const corDaSaude = s => CLS[(s || {}).estado] || "sem";
// Uma troca de verdade andando lá (a deste celular, ou a que o bloco publicado mostra; o ensaio não conta)
const trocandoAgora = (b, pend) => !!(pend || (b && b.trocando && !b.trocando.ensaio));
// Por que o botão daquele PC não vale agora ("" vale): as mesmas regras do Monitor geral
function motivo(pc, b, {online = true, pend = false} = {}) {
  if (!online) return TX.semSinal(pc);
  if (!b) return TX.semBloco;
  if (!b.pode_trocar) return TX.semModo;
  if (trocandoAgora(b, pend)) return TX.agora;
  if (alvo(b) === "proxy" && !b.chave) return TX.semChave;
  return "";
}
// O que a última troca ou o último ensaio daquele PC diz (o ensaio nunca parece troca)
function ultimaTxt(u) {
  if (!u || !u.msg) return "";
  return u.ensaio ? TX.ensaioEm(hora(u.quando), u.msg) : `${u.ok ? "✓" : "✗"} ${hora(u.quando)} · ${u.msg}`;
}
// A linha do resultado: "✓ SEAZONE192 agora no Proxy · Conta do Claude desligada" ou "✗ <msg>"
function linha(pc, r) {
  const m = String(r.msg || "").replace(/^Este PC agora está no /, `${pc} agora no `).replace(/^Este PC já está no /, `${pc} já está no `);
  return (r.estado === "ok" ? "✓ " : "✗ ") + (r.estado === "ok" || m.includes(pc) ? m : `${pc}: ${m}`);
}
// Os nomes das sessões, até MAX_NOMES ("A, B, C e mais 3")
function listaNomes(nomes, n) {
  const ns = ls(nomes).slice(0, MAX_NOMES), total = Math.max(n || 0, ls(nomes).length);
  return ns.join(", ") + (total > ns.length ? ` e mais ${total - ns.length}` : "");
}

// ---- O pedido e a espera -------------------------------------------------------------------------------------------
// O texto do cel_pedir (tipo "acao"): o ensaio diz o que faria; o forcar só vale na ida ao Proxy, com a chave lá
const pedidoTexto = ({para, forcar = false, ensaio = false}) =>
  JSON.stringify({acao: "modo_ia", para, forcar: !!forcar, ensaio: !!ensaio, de: "celular"});
// O código da recusa do agente de lá pela frase do núcleo (scripto/modo_ia.py) ou do agente (modo_ia_agente.py)
function codigoDoErro(msg) {
  const m = String(msg || "");
  if (/régua de estável/.test(m)) return "instavel";
  if (/chave do proxy não está/.test(m)) return "sem_chave";
  if (/troca em andamento/.test(m)) return "ocupado";
  if (/não está configurado|ainda não troca o modo|desconhecida no agente/.test(m)) return "sem_config";
  if (/^Chegou tarde/.test(m)) return "tarde";
  return "erro";
}
// A resposta do ensaio ("Ensaio: … nada foi mudado · linha 1 · linha 2") -> {msg, linhas}
function lerEnsaio(resposta) {
  const t = String(resposta || ""), marca = "nada foi mudado", i = t.indexOf(marca);
  if (i < 0) return {msg: t, linhas: []};
  return {msg: t.slice(0, i + marca.length), linhas: t.slice(i + marca.length).split(" · ").map(x => x.trim()).filter(Boolean)};
}
// O pedido do banco (ou null, ainda sem ele) -> a fase: espera, anda, ok ou erro. ensaio: o que a resposta traz
function lerPedido(ped, {agora, desde, ensaio = false}) {
  const passou = agora - desde > PRAZO_MS;
  if (ped && ped.estado === "entregue") {
    return ensaio ? {fase: "ok", codigo: "ensaio", ...lerEnsaio(ped.resposta)}
      : {fase: "ok", codigo: / já está no /.test(String(ped.resposta || "")) ? "ja_esta" : "ok", msg: String(ped.resposta || "")};
  }
  if (ped && (ped.estado === "erro" || ped.estado === "cancelado")) {
    const msg = String(ped.erro || "Cancelado");
    return {fase: "erro", codigo: codigoDoErro(msg), msg};
  }
  if (passou) return {fase: "erro", codigo: "erro", msg: "Sem resposta do trocador"};
  if (!ped || ped.estado === "novo")
    return {fase: "espera", msg: agora - desde > PEGAR_MS ? "o PC ainda não pegou o pedido…" : "esperando o PC pegar…"};
  return {fase: "anda", msg: ensaio ? "conferindo no PC…" : "trocando no PC… (pode levar até 5 min)"};
}
// O resultado da troca para a linha e o que falta. ctx: {para, atual (o rótulo de antes), nomes, n}
function resultado(pc, lp, {para, atual = "?", nomes = [], n = 0} = {}) {
  if (lp.fase !== "ok") return {ok: false, linha: linha(pc, {estado: "erro", msg: lp.msg}), falta: ""};
  let msg = String(lp.msg || "");
  const avisei = msg.endsWith(AVISEI);
  if (avisei) msg = msg.slice(0, -AVISEI.length);
  if (lp.codigo === "ja_esta") return {ok: true, linha: linha(pc, {estado: "ok", msg}), falta: ""};
  const total = Math.max(n, ls(nomes).length);
  const falta = (total ? `${total === 1 ? "A sessão aberta antes segue" : `As ${total} sessões abertas antes seguem`} no ${atual} até reabrir: ${listaNomes(nomes, total)}`
    : `Nenhuma sessão estava aberta: as próximas já abrem no ${TX.rotulo[para] || "?"}`) + (avisei ? AVISEI : "");
  return {ok: true, linha: linha(pc, {estado: "ok", msg}), falta};
}
const vencido = (r, agora) => !r || agora - r.t >= FICA_MS;

// ---- O HTML ------------------------------------------------------------------------------------------------------
// O rótulo do PC nos PCs do topo: "Pool", "Proxy" ou "trocando…", na cor da saúde (âmbar com a sugestão). null: sem bloco
function topo(pc, b, {online = true, pend = false} = {}) {
  if (!b) return null;
  const indo = trocandoAgora(b, pend), sug = sugere(b);
  const texto = indo ? TX.trocando : TX.rotulo[b.modo] || "?";
  const cls = `mia-t mia-${corDaSaude(b.saude)}${sug ? " mia-sug" : ""}${indo ? " mia-indo" : ""}${online ? "" : " mia-off"}`;
  const aria = `${TX.rotulo[b.modo] || "?"}, ${indo ? TX.trocando : sug ? TX.sugestao((b.saude || {}).estado) : saudeCurta(b.saude)}`;
  return {texto, cls, aria, html: `<span class="${cls}">${esc(texto)}</span>`};
}
// A seção "Modo da IA" no cartão do PC (Computadores). ctx: {online, pend, res (o resultado deste celular), agora,
// antigo (o agente de lá é de antes do AGENTE)}. Sem o bloco: com o agente de antes, a frase de que falta atualizar; com
// o agente novo, o PC não tem o gancho do trocador (o controle não aparece, como no Monitor)
function secao(pc, b, {online = true, pend = false, res = null, agora = Date.now(), antigo = false} = {}) {
  const cab = `<h4>🔀 Modo da IA</h4>`;
  if (!b) return !antigo ? "" : `<div class="pc-sec mia-sec" data-mia-pc="${esc(pc)}">${cab}<p class="meta">${esc(TX.semBloco)} (precisa do agente ${AGENTE}).</p></div>`;
  const s = b.saude || {}, para = alvo(b), why = motivo(pc, b, {online, pend}), sug = sugere(b), indo = trocandoAgora(b, pend);
  const r = vencido(res, agora) ? null : res, u = ultimaTxt(b.ultima);
  return `<div class="pc-sec mia-sec" data-mia-pc="${esc(pc)}">${cab}
    <div class="mia-linha"><b>${esc(pc)} · ${esc(TX.rotulo[b.modo] || "?")}</b><span class="mia-s mia-${corDaSaude(s)}"><i></i>${esc(saudeCurta(s))}</span></div>
    ${s.frase ? `<div class="meta">Medida do proxy: ${esc(s.frase)}</div>` : ""}
    ${sug ? `<div class="mia-sug-l">⚠ ${esc(TX.sugestao(s.estado))}</div>` : ""}
    ${indo ? `<div class="status"><span class="spin"></span>${esc(TX.trocando)} (pode levar até 5 min)</div>` : ""}
    ${r ? `<div class="mia-res ${r.ok ? "ok" : "erro"}" role="status"><b>${esc(r.linha)}</b>${r.falta ? `<span>${esc(r.falta)}</span>` : ""}<button class="mia-x" data-mia-x="${esc(pc)}" aria-label="Fechar o resultado">×</button></div>`
      : u ? `<div class="meta mia-ult">${esc(u)}</div>` : ""}
    <button class="btn ${sug && !why ? "" : "sec"}" data-mia-abrir="${esc(pc)}" data-para="${para}" ${why ? "disabled" : ""}>⇄ ${esc(TX.botao[para])}</button>
    ${why ? `<p class="pc-motivo">⇄ ${esc(why)}</p>` : ""}</div>`;
}
// A folha de confirmação. F: {pc, para, r (o ensaio: null enquanto anda), msg (o andamento), r2 (o ensaio forçado,
// pedido depois da recusa da régua: o que o "Trocar mesmo assim" faria)}; info: {bloco, online, pend, n, nomes}
function folha(F, info = {}) {
  const b = info.bloco || {}, x = TX.rotulo[F.para], atual = TX.rotulo[b.modo] || "?", r = F.r;
  const n = Math.max(info.n || 0, ls(info.nomes).length), why = motivo(F.pc, info.bloco, info);
  let ens = `<div class="mia-ens"><span class="spin"></span>${esc(F.msg || TX.conferindo)}</div>`, forcar = false, off = why;
  const lista = linhas => `<ul class="mia-ln">${linhas.map(l => `<li>${esc(l)}</li>`).join("")}</ul>`;
  if (r && r.codigo === "instavel") {
    forcar = true;
    const l2 = ls(F.r2 && F.r2.fase === "ok" && F.r2.linhas);
    ens = `<div class="mia-ens mia-am"><b>${esc(r.msg)}</b><small>${esc(TX.regua)}</small></div>`
      + (l2.length ? `<div class="mia-ens"><small>${esc(TX.mesmoFaria)}</small>${lista(l2)}</div>` : "");
  } else if (r && r.codigo === "sem_chave") {
    off = off || TX.semChave;
    ens = `<div class="mia-ens mia-vm">${esc(r.msg)}</div>`;
  } else if (r && r.fase === "erro") {
    ens = `<div class="mia-ens mia-vm">${esc(TX.naoConferiu)} ${esc(r.msg)}</div>`;
  } else if (r) {
    const ln = ls(r.linhas);
    ens = `<div class="mia-ens"><small>${esc(r.msg)}</small>${ln.length ? `<small>${esc(TX.faria)}</small>${lista(ln)}` : ""}</div>`;
  }
  return `<div class="pega"></div><h4 class="en-titulo">${esc(TX.titulo(F.pc, x))}</h4>
    <ul class="en-avisos mia-muda">${TX.muda[F.para](F.pc).map(t => `<li><span aria-hidden="true">•</span><span>${esc(t)}</span></li>`).join("")}</ul>
    <div class="mia-re">${esc(TX.reabrir(n, F.pc, atual))}${n ? ` <b>${esc(listaNomes(info.nomes, n))}</b>` : ""}</div>
    ${ens}
    <div class="mia-bts"><button class="btn" data-mia-trocar="${forcar ? "forcar" : "1"}" ${off ? "disabled" : ""}>${forcar ? TX.mesmoAssim : TX.trocar}</button>
    ${off ? `<p class="pc-motivo">⇄ ${esc(off)}</p>` : ""}
    <button class="op en-nao" data-nf-fechar>${TX.cancelar}</button></div>`;
}

const ModoIa = {TX, AGENTE, PEGAR_MS, PRAZO_MS, FICA_MS, MAX_NOMES, AVISEI, bloco, alvo, sugere, saudeCurta, corDaSaude,
  trocandoAgora, motivo, ultimaTxt, linha, listaNomes, pedidoTexto, codigoDoErro, lerEnsaio, lerPedido, resultado, vencido,
  topo, secao, folha, esc};
if (typeof module !== "undefined" && module.exports) module.exports = ModoIa;
raiz.ModoIa = ModoIa;
})(typeof window !== "undefined" ? window : globalThis);
