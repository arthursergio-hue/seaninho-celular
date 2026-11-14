// Seaninho no celular: as Sessões em mosaico (entrega 3 do Monitor no celular, 13/11/2026; CONTRATO-mosaico.md, seção 2).
// O plano: "Sessões em mosaico (2 colunas a 390 px, alternando com a lista), ladrilho com a última fala, o quadro, o
// estado e a caixa de envio; a central (deste e do outro PC) em destaque com a cor e o ícone dela".
// - [Mosaico | Lista] no alto da aba Sessões (a escolha fica no aparelho). O mosaico mostra as MESMAS sessões da lista
//   (a busca, os filtros, as fixadas e a ordem dos projetos valem igual), em 2 colunas.
// - As centrais (a de cada PC: a "central_de" do agente novo, o "central" do nome ou a orquestra) vêm primeiro, em
//   destaque: a cor e o ícone dela (sem cor, o dourado e a ★), o resumo do quadro ("quadro: 3 frentes", "Para você ②")
//   e o primeiro item do Para você. As outras: a última fala, a frente do maestro de que ela cuida (com a barra do
//   workflow, quando há) e o estado.
// - A caixa de envio de cada ladrilho manda como está (sem o ✨ Melhorar), pelo mesmo caminho da caixa da conversa
//   (a fila sem rede, o ✓ e o ✓✓), e o ladrilho mostra o andamento. Esperando uma resposta (enquete ou permissão), o
//   ladrilho leva à conversa; sem caminho de entrega, diz o porquê. O rascunho é o mesmo da conversa.
// Sem tela (testado no Node: test_mosaico.cjs): aqui se escolhe a ordem, se monta o HTML e se lê o toque; a página dá
// os dados e as ações (ligar(ctx)).
(function (raiz) {
"use strict";

const CHAVE_MODO = "seaninho.sessoes.modo";
const MODOS = [["mosaico", "Mosaico"], ["lista", "Lista"]];
const COR_PADRAO = "#E2B84A";   // o --gold da página: a central que não diz a cor
const ICONE_PADRAO = "★";
const CIRCULOS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const FALA_MAX = 180, TITULO_MAX = 60, ITEM_MAX = 70, MOTIVO_MAX = 140;
const TEXTO_MAX = 4000;              // o que o PC entrega (o mesmo teto da caixa da conversa)
const ENTREGUE_VALE_MS = 90e3;       // o "✓✓ Entregue" do ladrilho some depois disso
const ERRO_VALE_MS = 10 * 60e3;      // o "⚠ Não entrou" fica 10 min (ou até a conversa abrir)
const SEGURAR_MS = 500;              // o toque longo abre o menu da sessão (o mesmo da lista)
const ESTADOS = {esperando: ["❓", "Esperando você"], trabalhando: ["●", "Trabalhando"], ociosa: ["◌", "Ociosa"],
  parada: ["◌", "Parada"], desligado: ["⏻", "PC desligado"]};
const ANDANDO = ["novo", "escrevendo", "pronto", "enviar", "enviando"];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const umaLinha = (t, n) => { const s = String(t ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const conta = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(9999, n)) : 0; };
const arr = v => Array.isArray(v) ? v : [];
const obj = v => !!v && typeof v === "object" && !Array.isArray(v);
const mesmaSessao = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase() && String(a || "") !== "";
const chave = (pc, id) => `${pc}|${String(id || "").toLowerCase()}`;

// ==== Os dados ========================================================================================================
// "#RRGGBB" ou "" (o agente já confere; aqui de novo, porque a cor vai num style)
function corValida(c) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || "").trim());
  if (!m) return "";
  const h = m[1].length === 3 ? m[1].split("").map(x => x + x).join("") : m[1];
  return "#" + h.toUpperCase();
}
const rgbDe = hex => { const h = corValida(hex) || COR_PADRAO; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(","); };
const iconeValido = i => Array.from(String(i || "").replace(/[<>&"'`\\{};\s]/g, "")).slice(0, 4).join("");
// "WIN" (WIN-EAD6OD66GE7), "S192" (SEAZONE192): a etiqueta curta do PC no ladrilho
function siglaPc(pc) {
  const s = String(pc || "");
  const curto = s.length > 11 && s.includes("-") ? s.split("-")[0] : s;
  if (curto.length <= 5) return curto;
  const m = /^([A-Za-z])[A-Za-z_-]*?(\d+)$/.exec(curto);
  return m ? (m[1] + m[2]).toUpperCase() : curto.slice(0, 5);
}
const circulo = n => n >= 1 && n <= 20 ? CIRCULOS[n - 1] : `(${n})`;

// A central dona da sessão: {nome, cor, icone} (a "central_de" do agente novo; o "central" do nome, 12/11; ou a
// orquestra que o PC publica, em `extras`: [{pc, sessao, nome}]). null quando não é central.
function centralDe(s, extras) {
  if (!obj(s)) return null;
  if (obj(s.central_de)) {
    const c = s.central_de;
    return {nome: umaLinha(c.nome || s.central || "Central", 40), cor: corValida(c.cor), icone: iconeValido(c.icone)};
  }
  if (typeof s.central === "string" && s.central.trim()) return {nome: umaLinha(s.central, 40), cor: "", icone: ""};
  const e = arr(extras).find(x => obj(x) && x.pc === s.pc && mesmaSessao(x.sessao, s.id));
  return e ? {nome: umaLinha(e.nome || "Hokage", 40), cor: "", icone: ""} : null;
}
// As centrais das sessões abertas, para quem precisa saber (os Meus pedidos: o pedido do celular à central): [{pc, sessao}]
function centrais(ss, extras) {
  const out = arr(ss).filter(s => centralDe(s, extras)).map(s => ({pc: s.pc, sessao: String(s.id)}));
  for (const e of arr(extras)) if (obj(e) && e.pc && e.sessao && !out.some(c => c.pc === e.pc && mesmaSessao(c.sessao, e.sessao)))
    out.push({pc: e.pc, sessao: String(e.sessao)});
  return out;
}

// O quadro da sessão (o resumo que o agente novo põe na central; sem ele, o da orquestra do PC, em `extras`), limpo:
// {frentes, para_voce, esperando, contador?, chips, resumo, itens, titulo} ou null.
function quadroDe(s, extras) {
  let q = obj(s) && obj(s.quadro) ? s.quadro : null;
  if (!q) { const e = arr(extras).find(x => obj(x) && obj(s) && x.pc === s.pc && mesmaSessao(x.sessao, s.id)); q = e && obj(e.quadro) ? e.quadro : null; }
  if (!q) return null;
  const c = obj(q.contador) ? Object.fromEntries(["voce", "rodando", "pronto", "esperando", "erro", "antigas"].map(k => [k, conta(q.contador[k])])) : null;
  return {frentes: conta(q.frentes), para_voce: conta(q.para_voce), esperando: conta(q.esperando), contador: c,
    chips: arr(q.chips).filter(obj).slice(0, 4).map(x => ({icone: iconeValido(x.icone) || "•", texto: umaLinha(x.texto, 32)})).filter(x => x.texto),
    resumo: umaLinha(q.resumo, 140), itens: arr(q.itens).map(t => umaLinha(t, ITEM_MAX)).filter(Boolean).slice(0, 3),
    titulo: umaLinha(q.titulo, 40)};
}
// O hoje.painel.orquestra de um PC no formato do quadro do ladrilho (o agente de antes, sem o "quadro" na sessão).
function quadroDaOrquestra(o) {
  if (!obj(o)) return null;
  const pv = arr(o.para_voce).filter(obj);
  return {frentes: conta(o.em_andamento), para_voce: pv.length, esperando: conta(o.esperando),
    contador: obj(o.contador) ? o.contador : null, chips: arr(o.chips), resumo: o.resumo || "",
    itens: pv.map(i => i.titulo || i.texto).filter(Boolean).slice(0, 3)};
}

// A ordem do mosaico: as centrais primeiro (a ordem de cada grupo fica a da lista).
function ordenar(ss, extras) {
  const lista = arr(ss);
  return [...lista.filter(s => centralDe(s, extras)), ...lista.filter(s => !centralDe(s, extras))];
}

// A frente do maestro de que a sessão cuida (a vista das frentes do workflows.js): {titulo, pct (0 a 1) ou null,
// barra (o texto), chip}. O maestro guarda às vezes só o começo do id (8 letras ou mais).
function frenteDe(s, frentes) {
  if (!obj(s)) return null;
  const id = String(s.id || "").toLowerCase();
  const it = arr(frentes).find(f => obj(f) && obj(f.f) && (f.pc || "") === s.pc && String(f.f.sessao || "").length >= 8
    && id.startsWith(String(f.f.sessao).toLowerCase()));
  if (!it) return null;
  // só o workflow que a vista das frentes aceita para ela (o barraDaFrente descarta o que acabou antes de a frente
  // começar: sem a "barra", sem a porcentagem)
  const w = it.barra && obj(it.wf) ? it.wf : null, total = w ? Math.max(0, parseInt(w.total, 10) || 0) : 0;
  const feitos = w ? Math.max(0, parseInt(w.feitos, 10) || 0) : 0;
  return {titulo: umaLinha(it.titulo, 60), pct: total ? Math.min(1, feitos / total) : null, barra: String(it.barra || ""),
    chip: obj(it.chip) ? umaLinha(it.chip.texto, 30) : "", icone: it.icone || "🎼"};
}

// ==== O andamento do envio de cada ladrilho ==============================================================================
const enviados = new Map();   // "pc|id" -> {local, t}: o último envio da caixa do ladrilho
function lembrarEnvio(pc, id, local, agora = Date.now()) { if (local) enviados.set(chave(pc, id), {local, t: agora}); }
function esquecerEnvio(pc, id) { enviados.delete(chave(pc, id)); }
// {k: "indo" | "fila" | "ok" | "entregue" | "erro", texto} ou null. pedido(id) -> a linha do cel_pedidos (ou null).
function envioDe(s, pedido, agora = Date.now()) {
  const e = enviados.get(chave(s.pc, s.id));
  if (!e) return null;
  const l = e.local || {};
  if (l.fila) return {k: "fila", texto: "🕓 Sem internet: sai sozinha quando a rede voltar"};
  if (l.sinal === "erro") return agora - e.t < ERRO_VALE_MS ? {k: "erro", texto: "⚠ " + umaLinha(l.erro || "Não saiu do celular", 120)} : null;
  if (!l.pedidoId) return {k: "indo", texto: "🕓 Enviando…"};
  const p = typeof pedido === "function" ? pedido(l.pedidoId) : null;
  if (!p) return {k: "ok", texto: "✓ Enviada"};
  if (p.estado === "entregue") {   // o ✓✓ some 90 s depois de entregue (sem a hora do banco, 90 s depois do envio)
    const fim = Date.parse(p.atualizado_em || "") || e.t;
    return agora - fim < ENTREGUE_VALE_MS ? {k: "entregue", texto: "✓✓ Entregue"} : null;
  }
  if (p.estado === "erro") {   // os 10 min contam da hora do erro (sem ela, do envio)
    const fim = Date.parse(p.atualizado_em || "") || e.t;
    return agora - fim < ERRO_VALE_MS ? {k: "erro", texto: "⚠ Não entrou: " + umaLinha(p.erro || "o PC não conseguiu", 110)} : null;
  }
  if (p.estado === "cancelado") return {k: "erro", texto: "Cancelada"};
  if (ANDANDO.includes(p.estado)) return {k: "ok", texto: p.estado === "enviando" ? "✓ Escrevendo na sessão…" : "✓ Na fila do PC"};
  return {k: "ok", texto: "✓ Enviada"};
}

// ==== A tela ==========================================================================================================
// O ladrilho. op: {agora, varios, estadoDe(s), previa(s), ha(s), envio(s) -> {pode, motivo, responder, desligado},
// frentes (a vista das frentes), extras (as orquestras: [{pc, sessao, nome, quadro}]), rascunho(s), pedido(id)}.
function ladrilho(s, op = {}) {
  const k = typeof op.estadoDe === "function" ? op.estadoDe(s) : (s.desligado ? "desligado" : s.estado === "perguntando" ? "esperando" : s.estado === "trabalhando" ? "trabalhando" : "ociosa");
  const [icEst, rotEst] = ESTADOS[k] || ESTADOS.ociosa;
  const cen = centralDe(s, op.extras), q = cen ? quadroDe(s, op.extras) : null;
  const cor = cen ? (cen.cor || COR_PADRAO) : "";
  const titulo = umaLinha((cen && cen.nome) || s.titulo || "Sessão", TITULO_MAX);
  const icone = cen ? (cen.icone || ICONE_PADRAO) : icEst;
  const estilo = cen ? ` style="--mz-cor:${cor};--mz-rgb:${rgbDe(cor)}"` : "";
  const fala = typeof op.previa === "function" ? umaLinha(op.previa(s), FALA_MAX) : "";
  const pergunta = s.permissao && !s.enquete ? umaLinha((s.permissao.plano ? "📋 Plano para aprovar: " : "🔐 Pede permissão: ") + (s.permissao.titulo || ""), FALA_MAX)
    : s.estado === "perguntando" && (s.enquete || s.detalhe) ? umaLinha((s.enquete ? "📊 " : "❓ ") + (s.enquete ? ((arr(s.enquete.perguntas)[0] || {}).pergunta || "Enquete") : s.detalhe), FALA_MAX)
    : s.paraVoce ? umaLinha("🎼 Para você: " + s.paraVoce, FALA_MAX) : "";
  let corpo = "";
  if (q) {
    const n = q.contador ? q.contador.rodando : q.frentes;
    corpo += `<div class="mz-quadro"><span>quadro: <b>${n}</b> ${n === 1 ? "frente" : "frentes"}${q.esperando ? ` · ${q.esperando} esperando` : ""}</span>`
      + `<span class="mz-pv${q.para_voce ? " tem" : ""}">${q.para_voce ? `Para você <b aria-label="${q.para_voce}">${circulo(q.para_voce)}</b>` : "Nada para você"}</span></div>`
      + (q.itens.length ? `<p class="mz-item">${esc(q.itens[0])}</p>` : "");
  }
  if (pergunta) corpo += `<p class="mz-fala mz-pergunta">${esc(pergunta)}</p>`;
  else if (!q && fala) corpo += `<p class="mz-fala">“${esc(fala)}”</p>`;
  else if (!q) corpo += `<p class="mz-fala mz-vazia">Sem fala ainda</p>`;
  const fr = cen ? null : frenteDe(s, op.frentes);
  if (fr) {
    const pct = fr.pct == null ? null : Math.round(fr.pct * 100);
    corpo += `<div class="mz-fr"><span class="mz-fr-t">${esc(fr.icone)} ${esc(fr.titulo)}</span>${pct == null ? ""
      : `<span class="mz-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span><small>${pct}%</small>`}</div>`;
  }
  const ha = typeof op.ha === "function" ? op.ha(s) : "";
  corpo += `<div class="mz-est"><span class="mz-chip ${esc(k)}">${esc(rotEst)}</span>${ha ? `<small>${esc(ha)}</small>` : ""}</div>`;
  const ev = typeof op.envio === "function" ? op.envio(s) || {} : {pode: true};
  let pe;
  if (ev.responder) pe = `<button type="button" class="mz-resp" data-mz-abrir>Responder ›</button>`;
  else if (ev.desligado) pe = `<p class="mz-motivo">⏻ ${esc(umaLinha(ev.motivo || "PC desligado", MOTIVO_MAX))}</p>`;
  else if (!ev.pode) pe = `<p class="mz-motivo">${esc(umaLinha(ev.motivo || "Agora não dá para mandar daqui.", MOTIVO_MAX))}</p><button type="button" class="mz-resp sec" data-mz-abrir>Abrir ›</button>`;
  else {
    const r = typeof op.rascunho === "function" ? String(op.rascunho(s) || "") : "";
    // um textarea de uma linha (e não um input): o rascunho da conversa pode ter quebras de linha, e elas ficam; o
    // Enter (o "enviar" do teclado do iPhone) manda, como na lista de conversas do WhatsApp
    pe = `<form class="mz-caixa" data-mz-form data-pc="${esc(s.pc)}" data-id="${esc(s.id)}"><textarea class="mz-in" data-mz-texto rows="1" enterkeyhint="send" autocomplete="off" maxlength="${TEXTO_MAX}" placeholder="Mensagem…" aria-label="Mensagem para ${esc(titulo)}">${esc(r)}</textarea><button type="submit" class="mz-env" data-mz-enviar aria-label="Enviar para ${esc(titulo)}">➤</button></form>`;
  }
  const st = envioDe(s, op.pedido, op.agora);
  return `<div class="mz-t est-${esc(k)}${cen ? " mz-central" : ""}${s.desligado ? " off" : ""}" data-mz-t data-pc="${esc(s.pc)}" data-id="${esc(s.id)}"${estilo}>
  <button type="button" class="mz-cab" data-mz-abrir aria-label="Abrir a conversa: ${esc(titulo)}${op.varios ? ", " + esc(s.pc) : ""}"><span class="mz-ic" aria-hidden="true">${esc(icone)}</span><span class="mz-tit">${esc(titulo)}</span>${op.varios ? `<span class="mz-pc" title="${esc(s.pc)}">${esc(siglaPc(s.pc))}</span>` : ""}</button>
  ${corpo}${pe}${st ? `<p class="mz-envio ${st.k}" role="status">${esc(st.texto)}</p>` : ""}
</div>`;
}
const grade = (ss, op) => ss.length ? `<div class="mz-grade">${ss.map(s => ladrilho(s, op)).join("")}</div>` : "";

// O mosaico inteiro: as centrais primeiro (fora dos grupos), depois as com janela (por projeto, quando a página dá
// op.grupos(lista) -> [{cab (HTML pronto), estilo, rotulo, lista}]) e o grupo 🌙 Segundo plano.
function html(janela, fundo, op = {}) {
  const todas = [...arr(janela), ...arr(fundo)];
  const cent = todas.filter(s => centralDe(s, op.extras));
  const ehCentral = s => cent.includes(s);
  const resto = arr(janela).filter(s => !ehCentral(s)), resF = arr(fundo).filter(s => !ehCentral(s));
  let h = cent.length ? `<section class="mz-centrais" aria-label="Centrais">${grade(cent, op)}</section>` : "";
  const grupos = typeof op.grupos === "function" && resto.length ? op.grupos(resto) : null;
  if (grupos) h += arr(grupos).filter(g => g && arr(g.lista).length).map(g => `<section class="pj-grupo mz-grupo"${g.estilo ? ` style="${esc(g.estilo)}"` : ""}${g.rotulo ? ` aria-label="${esc(g.rotulo)}"` : ""}>${g.cab || ""}${grade(g.lista, op)}</section>`).join("");
  else h += grade(resto, op);
  if (resF.length) h += `<h4 class="grupo-fundo" id="grupoFundo">🌙 Segundo plano <i>${resF.length}</i></h4>` + grade(resF, op);
  return `<div class="mz" data-mz>${h}</div>`;
}

// O [Mosaico | Lista] do alto da aba.
function seletor(modo = estado.modo) {
  return `<div class="mz-topo"><b class="mz-rot">Sessões</b><div class="mz-seg" role="group" aria-label="Ver as sessões em">${MODOS.map(([v, rot]) =>
    `<button type="button" data-mz-modo="${v}" aria-pressed="${v === modo}" class="${v === modo ? "on" : ""}">${v === "mosaico" ? "▦" : "☰"} ${rot}</button>`).join("")}</div></div>`;
}

// O que um toque pede: {acao: "modo", valor} | {acao: "abrir", pc, id} | null (a caixa e o ➤ não abrem a conversa).
function acaoDe(el) {
  if (!el || !el.closest) return null;
  const m = el.closest("[data-mz-modo]");
  if (m) return {acao: "modo", valor: m.dataset.mzModo};
  if (el.closest("[data-mz-form]")) return null;
  const t = el.closest("[data-mz-t]");
  if (t && el.closest("[data-mz-abrir], [data-mz-t]")) return {acao: "abrir", pc: t.dataset.pc, id: t.dataset.id};
  return null;
}

// ==== O modo (guardado no aparelho) ======================================================================================
const estado = {modo: "lista"};
function lerModo(store) {
  let v = "";
  try { v = store && store.get ? store.get(CHAVE_MODO) : ""; } catch {}
  estado.modo = v === "mosaico" ? "mosaico" : "lista";
  return estado.modo;
}
function definirModo(v, store) {
  estado.modo = v === "mosaico" ? "mosaico" : "lista";
  try { if (store && store.set) store.set(CHAVE_MODO, estado.modo === "mosaico" ? "mosaico" : ""); } catch {}
  return estado.modo;
}
// O texto de um envio da caixa do ladrilho: {ok, texto} ou {ok: false, aviso}.
function conferirTexto(t) {
  const texto = String(t || "").trim();
  if (!texto) return {ok: false, aviso: ""};
  if (texto.length > TEXTO_MAX) return {ok: false, aviso: `A mensagem tem ${texto.length.toLocaleString("pt-BR")} letras; o PC entrega até 4.000. Abra a conversa para dividir.`};
  return {ok: true, texto};
}

// ==== Na página (o navegador) ============================================================================================
let C = null;   // o ctx de ligar()
let segura = null;   // o dedo num ladrilho agora: {t, id, x, y, em, disparou, timer}
// Há um dedo num ladrilho? (a página não refaz o mosaico embaixo dele, como o gestoSessao da lista; 5 s no máximo)
const segurando = (agora = Date.now()) => !!segura && agora - segura.em < 5000;
// Alguém está escrevendo numa caixa de ladrilho? (a página não refaz o mosaico embaixo do dedo)
function escrevendo(lista) {
  const d = lista && lista.ownerDocument, a = d && d.activeElement;
  return !!(a && lista.contains(a) && a.matches && a.matches("[data-mz-texto]"));
}
function enviarDe(form) {
  if (!C) return;
  const input = form.querySelector("[data-mz-texto]"), pc = form.dataset.pc, id = form.dataset.id;
  const r = conferirTexto(input && input.value);
  if (!r.ok) { if (r.aviso && C.avisar) C.avisar(r.aviso, {erro: true}); return; }
  let local = null;
  try { local = C.enviar(pc, id, r.texto); }
  catch (e) { if (C.avisar) C.avisar("Não mandei: " + String((e && e.message) || e).slice(0, 120), {erro: true}); return; }
  lembrarEnvio(pc, id, local);
  if (input) { input.value = ""; input.blur(); }
  if (C.guardarRascunho) C.guardarRascunho(pc, id, "");
  if (C.vibrar) C.vibrar();
  if (C.redesenhar) C.redesenhar();
}
const CSS = `
.mz-topo{display:flex;align-items:center;gap:8px;margin:0 0 8px}
.mz-rot{font-size:12px;font-weight:650;letter-spacing:.6px;text-transform:uppercase;color:var(--muted)}
.mz-seg{display:inline-flex;margin-left:auto;padding:2px;border-radius:13px;background:var(--glass-2);border:1px solid var(--stroke)}
.mz-seg button{min-height:44px;min-width:44px;padding:0 12px;border-radius:11px;color:var(--muted);font-size:14px;font-weight:650}
.mz-seg button.on{background:var(--gold);color:var(--navy)}
.mz-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 10px;align-items:stretch}
.mz-centrais .mz-grade{margin-bottom:14px}
.mz-grupo .mz-grade{margin-top:0}
.mz-t{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0;padding:6px 8px 8px;border-radius:16px;background:#11264c;border:1px solid var(--stroke);cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.mz-t.est-esperando{border-color:rgba(226,184,74,.5);background:linear-gradient(160deg,rgba(226,184,74,.13),rgba(226,184,74,.03) 60%),#11264c}
.mz-t.mz-central{border-color:rgba(var(--mz-rgb),.7);background:linear-gradient(160deg,rgba(var(--mz-rgb),.26),rgba(var(--mz-rgb),.07) 58%),#11264c;box-shadow:inset 0 3px 0 rgba(var(--mz-rgb),.95),0 0 0 1px rgba(var(--mz-rgb),.18)}
.mz-grupo .mz-t{box-shadow:inset 3px 0 0 rgba(var(--pj-rgb),.85)}
.mz-t.off>*:not(.mz-cab){opacity:.6}
.mz-cab{display:flex;align-items:center;gap:6px;width:100%;min-height:44px;min-width:0;padding:0;text-align:left;color:var(--ink);background:none}
.mz-ic{flex:none;width:24px;height:24px;display:grid;place-items:center;border-radius:8px;font-size:13px;background:var(--glass-2);color:var(--muted)}
.est-trabalhando .mz-ic{color:var(--green);background:rgba(72,214,128,.14)}
.est-esperando .mz-ic{background:var(--gold);color:var(--navy)}
.mz-central .mz-ic{background:rgba(var(--mz-rgb),.38);color:#fff;font-size:14px}
.mz-tit{flex:1;min-width:0;font-weight:650;font-size:14.5px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mz-pc{flex:none;font-size:10.5px;font-weight:750;letter-spacing:.3px;padding:2px 5px;border-radius:6px;background:rgba(255,255,255,.1);color:var(--muted)}
.mz-central .mz-pc{background:rgba(var(--mz-rgb),.3);color:var(--ink)}
.mz-fala{margin:0;font-size:13.5px;line-height:1.36;color:var(--muted);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.mz-fala.mz-pergunta{color:var(--ink)}
.mz-fala.mz-vazia{font-style:italic;color:var(--faint)}
.mz-quadro{display:flex;flex-direction:column;gap:3px;font-size:13.5px;color:var(--ink)}
.mz-quadro b{font-variant-numeric:tabular-nums}
.mz-pv{color:var(--muted)}
.mz-pv.tem{color:var(--gold-2,#F6D77E);font-weight:650}
.mz-pv.tem b{font-size:16px;font-weight:600}
.mz-item{margin:0;font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mz-fr{display:flex;align-items:center;flex-wrap:wrap;gap:4px 6px;font-size:12px;color:var(--muted)}
.mz-fr-t{flex:1 1 100%;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mz-barra{flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}
.mz-barra i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#C99A2E,#F6D77E)}
.mz-fr small{font-variant-numeric:tabular-nums;color:var(--ink);font-weight:650}
.mz-est{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--faint);min-width:0;margin-top:auto}
.mz-est small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mz-chip{flex:none;font-size:11.5px;font-weight:650;padding:2px 7px;border-radius:999px;background:var(--glass-2);color:var(--muted);white-space:nowrap}
.mz-chip.trabalhando{background:rgba(72,214,128,.16);color:var(--green)}
.mz-chip.esperando{background:var(--gold);color:var(--navy)}
.mz-chip.desligado{background:rgba(255,255,255,.08);color:var(--faint)}
.mz-caixa{display:flex;align-items:center;gap:2px;padding:0 0 0 10px;border-radius:23px;background:rgba(255,255,255,.07);border:1px solid var(--stroke-2);cursor:text}
.mz-caixa:focus-within{border-color:rgba(226,184,74,.65)}
.mz-in{flex:1;min-width:0;height:44px;border:0;background:none;color:var(--ink);font-size:16px;line-height:22px;padding:11px 0;border-radius:0;resize:none;overflow:hidden;white-space:nowrap;-webkit-user-select:text;user-select:text;-webkit-touch-callout:default;font-family:inherit}
.mz-in:focus{outline:none}
.mz-in::placeholder{color:var(--faint)}
.mz-env{flex:none;width:44px;height:44px;border-radius:50%;background:var(--gold);color:var(--navy);font-size:17px;font-weight:800;display:grid;place-items:center}
.mz-resp{min-height:44px;border-radius:12px;background:var(--gold);color:var(--navy);font-weight:700;font-size:14px}
.mz-resp.sec{background:var(--glass-2);color:var(--ink)}
.mz-motivo{margin:0;font-size:12px;line-height:1.3;color:var(--faint);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.mz-envio{margin:0;font-size:12px;line-height:1.3;color:var(--muted)}
.mz-envio.entregue{color:#86E8AE}
.mz-envio.erro{color:#ffb3ad}
.mz-t.segurando{transform:scale(.98);transition:transform .15s}
`;
function estilo(doc) {
  if (!doc || doc.getElementById("mz-css")) return;
  const s = doc.createElement("style");
  s.id = "mz-css";
  s.textContent = CSS;
  (doc.head || doc.documentElement).appendChild(s);
}
// A página: ctx = {doc, lista (o #sessoesLista), topo (o #mzTopo), store, redesenhar(), abrir(pc, id), menu(pc, id, el)?,
// enviar(pc, id, texto) -> o objeto da mensagem (o "local" da página), guardarRascunho(pc, id, texto), avisar(msg, o),
// vibrar()}. Os toques do mosaico; a página só chama Mosaico.html() e Mosaico.seletor() no desenho.
function ligar(ctx) {
  C = ctx || {};
  lerModo(C.store);
  estilo(C.doc);
  if (C.topo) C.topo.addEventListener("click", e => {
    const a = acaoDe(e.target);
    if (!a || a.acao !== "modo") return;
    if (definirModo(a.valor, C.store) && C.redesenhar) C.redesenhar();
  });
  const lista = C.lista;
  if (!lista) return;
  let segurou = 0;
  lista.addEventListener("pointerdown", e => {
    const t = e.target.closest && e.target.closest("[data-mz-t]");
    if (!t || (e.button || 0) > 0 || e.target.closest("[data-mz-form]")) return;
    const g = segura = {t, id: e.pointerId, x: e.clientX, y: e.clientY, em: Date.now(), disparou: false};
    if (!C.menu) return;
    g.timer = setTimeout(() => { if (segura === g) { g.disparou = true; t.classList.remove("segurando"); C.menu(t.dataset.pc, t.dataset.id, t); } }, SEGURAR_MS);
    t.classList.add("segurando");
  });
  // o soltar do toque longo (e o cancelar do iOS) marca a hora: o click que chega depois não abre a conversa
  const soltar = e => {
    const g = segura;
    if (!g || (e && e.pointerId !== g.id)) return;
    clearTimeout(g.timer); g.t.classList.remove("segurando");
    if (g.disparou) segurou = Date.now();
    segura = null;
  };
  lista.addEventListener("pointermove", e => { const g = segura; if (g && !g.disparou && e.pointerId === g.id && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 10) soltar(e); });
  lista.addEventListener("pointerup", soltar);
  lista.addEventListener("pointercancel", soltar);
  lista.addEventListener("click", e => {
    if (Date.now() - segurou < 450) return;   // o soltar do toque longo não abre a conversa
    const a = acaoDe(e.target);
    if (a && a.acao === "abrir" && C.abrir) { esquecerEnvio(a.pc, a.id); C.abrir(a.pc, a.id); }
  });
  lista.addEventListener("submit", e => {
    const f = e.target.closest && e.target.closest("[data-mz-form]");
    if (!f) return;
    e.preventDefault();
    enviarDe(f);
  });
  lista.addEventListener("keydown", e => {   // o Enter manda (o Shift+Enter quebra a linha, no teclado de verdade)
    const i = e.target.closest && e.target.closest("[data-mz-texto]"), f = i && i.closest("[data-mz-form]");
    if (!f || e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    enviarDe(f);
  });
  lista.addEventListener("input", e => {
    const i = e.target.closest && e.target.closest("[data-mz-texto]"), f = i && i.closest("[data-mz-form]");
    if (f && C.guardarRascunho) C.guardarRascunho(f.dataset.pc, f.dataset.id, i.value);
  });
}

const Mosaico = {CHAVE_MODO, MODOS, COR_PADRAO, ICONE_PADRAO, TEXTO_MAX, ENTREGUE_VALE_MS, ERRO_VALE_MS, ESTADOS, corValida, rgbDe,
  iconeValido, siglaPc, circulo, centralDe, centrais, quadroDe, quadroDaOrquestra, ordenar, frenteDe, lembrarEnvio, esquecerEnvio,
  envioDe, ladrilho, html, seletor, acaoDe, lerModo, definirModo, conferirTexto, escrevendo, segurando, ligar, estilo, CSS,
  get modo() { return estado.modo; }};
if (typeof module !== "undefined" && module.exports) module.exports = Mosaico;
else raiz.Mosaico = Mosaico;
})(typeof window !== "undefined" ? window : globalThis);
