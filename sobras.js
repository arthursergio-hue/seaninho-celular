// Seaninho no celular: as sobras do chat (entrega 5 do Monitor no celular, 13/11/2026).
// - ✨ Sugerir respostas, no menu do balão (toque longo) de uma fala do Claude: o PC pede à IA as respostas prontas
//   para AQUELA fala (ação "sugerir", que reaproveita o ia_sugestoes do agente) e elas aparecem numa faixa própria em
//   cima da caixa de escrever (a #dSugestoes é do PC e se refaz a cada volta). O toque numa resposta só a escreve na
//   caixa (com a citação, quando a fala não é a última do Claude), para você conferir e mandar.
// - Copiar a imagem, no visor: a imagem que está na tela (a alta, quando já chegou) vai para a área de transferência
//   em PNG (o iPhone só copia PNG; a do Claude chega em JPEG e passa por um canvas, dentro do toque).
// - 📁 Mostrar na pasta, no cartão de PDF de uma fala do Claude: o PC abre o Explorer com o PDF selecionado (ação
//   abrir_pasta com "doc": o agente acha o arquivo pelo id do documento que ele mesmo publicou e confere as travas de
//   sempre; a página não sabe o caminho). Nos meus balões o botão não aparece: o PDF que mandei do celular fica nos
//   anexos, na pasta de dados do Seaninho, onde o Explorer não abre.
//
// A página só liga (Sobras.ligar e uma linha no abrirMenuBalao e no cartaoDoc do index.html). O que é puro (o pedido, a
// leitura da resposta, o HTML da faixa e dos botões) é testado no Node (test_sobras.cjs); a tela, no Chromium
// (test_web_espaco.py).
(function (raiz) {
"use strict";

const MAX_SUG = 4;
const NAO_SABE = "Isso ainda não dá";     // o agente antigo responde "entregue" com essa frase (Chat.NAO_SABE)
const ID_DOC = /^[0-9a-f]{8,64}$/i;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const ICONE_COPIAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>';

// ---- ✨ Sugerir respostas ---------------------------------------------------------------------------------------------
// Só a fala do Claude que já está na conversa (não a minha, não a permissão, não o balão local ou do pedido)
const podeSugerir = l => !!(l && l.de === "claude" && String(l.texto || "").trim() && !/^(p:|local|perm:|dia:)/.test(String(l.id || "")));
const pedidoSugerir = (sessao, mensagem) => ({acao: "sugerir", sessao: String(sessao || "").slice(0, 80), mensagem: String(mensagem || "").slice(0, 120)});
// A resposta do PC: {"sugestoes": [...], "texto"}; o agente que não conhece a ação dá erro (ou, os antigos, "entregue"
// com a frase do NAO_SABE). Devolve {lista} ou {erro}.
function lerSugestoes(p) {
  if (!p) return {erro: "o PC não respondeu"};
  if (p.estado === "erro" || p.estado === "cancelado") return {erro: semAgente(p.erro) ? "agente" : String(p.erro || "o PC não conseguiu")};
  const r = String(p.resposta || "");
  if (r.startsWith(NAO_SABE)) return {erro: "agente"};
  let j = null;
  try { j = JSON.parse(r); } catch { j = null; }
  if (!j || !Array.isArray(j.sugestoes)) return {erro: "o PC não mandou as respostas"};
  const lista = [];
  for (const s of j.sugestoes) {
    const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    if (t && !lista.includes(t)) lista.push(t);
    if (lista.length >= MAX_SUG) break;
  }
  return lista.length ? {lista} : {erro: "a IA não achou respostas para essa fala"};
}
const semAgente = m => /desconhecida no agente|ainda não dá para fazer pelo celular/i.test(String(m || ""));
const AGENTE_SOBRAS = "0.9.0.18";   // o trem 0.9.0.18: o agente que sugere sob pedido e mostra o PDF do chat na pasta
const FRASE_AGENTE = `O agente deste PC ainda não sugere respostas sob pedido: precisa do agente ${AGENTE_SOBRAS}.`;
// A faixa em cima da caixa de escrever: pensando (com o ✕ para largar) ou as respostas
function htmlFaixa(f) {
  if (!f) return "";
  const de = f.hora ? `a fala das ${esc(f.hora)}` : "a fala";
  const fechar = `<button class="sgd-x" data-sgd-fechar aria-label="Fechar as respostas sugeridas"></button>`;
  if (f.fase === "pensando") return `<div class="sgd-topo"><span class="spin"></span><span class="sgd-t">✨ Pensando em respostas para ${de}…</span>${fechar}</div>`;
  return `<div class="sgd-topo"><span class="sgd-t">✨ Respostas para ${de}</span>${fechar}</div>`
    + `<div class="sgd-lista">${f.lista.map((t, i) => `<button class="sug" data-sgd="${i}">${esc(t)}</button>`).join("")}</div>`;
}

// ---- 📁 Mostrar na pasta (o cartão de PDF) ------------------------------------------------------------------------------
// Os botões embaixo do cartão: o Abrir (o mesmo data-doc do cartão, que a página já trata) e o Mostrar na pasta
function botoesDoc(d) {
  if (!d || !ID_DOC.test(String(d.id || ""))) return "";
  return `<div class="doc-acoes"><button class="doc-b" data-doc="${esc(d.id)}">Abrir</button>`
    + `<button class="doc-b" data-doc-pasta="${esc(d.id)}" aria-label="Mostrar ${esc(d.nome || "o PDF")} na pasta, no PC">📁 Mostrar na pasta</button></div>`;
}
const pedidoPasta = (doc, sessao) => ({acao: "abrir_pasta", doc: String(doc || ""), sessao: String(sessao || "").slice(0, 80)});
// O agente antigo não conhece o "doc" e procura a frente: a frase vira a do agente novo
const lerPasta = p => p && p.estado === "entregue" ? {ok: String(p.resposta || "Mostrei o PDF na pasta.")}
  : {erro: p && /frente/i.test(String(p.erro || "")) ? `O agente deste PC ainda não mostra o PDF do chat na pasta: precisa do agente ${AGENTE_SOBRAS}.`
           : String((p && p.erro) || "o PC não conseguiu")};

// ---- Copiar a imagem ------------------------------------------------------------------------------------------------------
const imagemPronta = src => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(String(src || ""));
const podeCopiarImagem = n => !!(n && n.clipboard && typeof n.clipboard.write === "function" && typeof raiz.ClipboardItem === "function");

const CSS = `
#dSugeridas{margin:0 0 8px}
#dSugeridas:empty{display:none}
#dSugeridas .sgd-topo{display:flex;align-items:center;gap:8px;min-height:32px;font-size:13px;color:var(--muted)}
#dSugeridas .sgd-t{flex:1;min-width:0}
#dSugeridas .sgd-x{flex:none;width:40px;height:40px;margin:-4px -6px -4px 0;border-radius:20px;color:var(--faint)}
#dSugeridas .sgd-x::before{content:"✕"}
#dSugeridas .sgd-lista{display:flex;gap:8px;overflow-x:auto;padding:2px 0 4px;scrollbar-width:none}
#dSugeridas .sgd-lista .sug{flex:none;white-space:nowrap;max-width:78vw;overflow:hidden;text-overflow:ellipsis;min-height:40px}
.linha-msg .doc-acoes{display:flex;gap:8px;margin:6px 0 2px;flex-wrap:wrap}
.linha-msg.eu .doc-acoes{display:none}
.linha-msg .doc-b{min-height:40px;padding:0 14px;border-radius:20px;background:var(--glass-2);color:var(--ink);font-size:14px;font-weight:600}
.linha-msg .doc-b:active{background:var(--glass)}
#vCopiar svg{width:22px;height:22px}
`;

// ---- a tela (só no navegador) ------------------------------------------------------------------------------------------
// op: {aberta, linha, conversa, pcLigado, pcCurto, rpc, esperarPedido, avisar, responder, foto, avisoVisor, blobDe}
//   aberta(): {pc, id} da conversa aberta; linha(id): a linha desenhada (linhasNaTela); conversa(): as mensagens da
//   sessão aberta; pcLigado(pc), pcCurto(pc); rpc e esperarPedido: os da página; avisar(msg, opções): o #dAviso da
//   conversa; responder(id): a citação (responderA); foto(): a foto do visor (Marcar.atualFoto); avisoVisor(texto, ms):
//   o aviso do visor; blobDe(dataUrl): o Marcar.blobDe.
function ligar(op) {
  const doc = raiz.document;
  if (!doc || !op) return null;
  const $ = id => doc.getElementById(id);
  const st = {faixa: null, seq: 0};

  // ✨ Sugerir respostas: o item no menu do balão (escondido nos balões que não são do Claude)
  const menu = $("dMenuBalao");
  let item = null;
  if (menu && !menu.querySelector("[data-sobra='sugerir']")) {
    item = doc.createElement("button");
    item.setAttribute("role", "menuitem");
    item.dataset.sobra = "sugerir";
    item.textContent = "✨ Sugerir respostas";
    menu.append(item);
    menu.addEventListener("click", ev => {
      const b = ev.target && ev.target.closest && ev.target.closest("[data-sobra='sugerir']");
      if (b) sugerir(menu.dataset.id);   // a página fecha o menu (o item não tem data-menu)
    });
  }
  function noMenu(linha) {
    if (!item) return;
    const ok = !!linha && podeSugerir(op.linha(linha.dataset.id)) && !($("dCompor") && $("dCompor").classList.contains("hidden"));
    item.classList.toggle("hidden", !ok);
  }

  // a faixa das respostas sugeridas, em cima das da #dSugestoes
  const compor = $("dCompor"), sug = $("dSugestoes");
  let faixa = $("dSugeridas");
  if (compor && sug && !faixa) {
    faixa = doc.createElement("div");
    faixa.id = "dSugeridas";
    faixa.setAttribute("aria-live", "polite");
    sug.before(faixa);
  }
  function desenharFaixa() {
    if (!faixa) return;
    const ab = op.aberta();
    if (st.faixa && (!ab || ab.id !== st.faixa.sessao)) st.faixa = null;   // outra conversa: a faixa era da de antes
    const html = htmlFaixa(st.faixa);
    if (faixa._html !== html) { faixa._html = html; faixa.innerHTML = html; }
  }
  async function sugerir(id) {
    const ab = op.aberta(), l = op.linha(id);
    if (!ab || !podeSugerir(l)) return;
    if (!op.pcLigado(ab.pc)) return op.avisar(`O ${op.pcCurto(ab.pc)} está desligado: as respostas vêm dele.`, {erro: true});
    const f = st.faixa;
    if (f && f.fase === "pensando" && f.sessao === ab.id && f.mensagem === l.id) return;   // já está pedida
    const n = ++st.seq;
    st.faixa = {sessao: ab.id, mensagem: l.id, hora: l.hora || "", fase: "pensando", lista: []};
    desenharFaixa();
    let pid;
    try { pid = await op.rpc("cel_pedir", {pc: ab.pc, tipo: "acao", texto: JSON.stringify(pedidoSugerir(ab.id, l.id))}); }
    catch (e) { return falhou(n, "Não saiu do celular: " + ((e && e.message) || "sem internet")); }
    let p = null;
    try { p = await op.esperarPedido(pid, 90000); }
    catch (e) { p = {estado: "erro", erro: (e && e.message) || "o PC não respondeu"}; }
    if (n !== st.seq || !st.faixa) return;   // largou (✕) ou pediu outra no meio
    const r = lerSugestoes(p);
    if (r.erro) return falhou(n, r.erro === "agente" ? FRASE_AGENTE : "Não vieram respostas: " + r.erro);
    st.faixa = {...st.faixa, fase: "pronto", lista: r.lista};
    desenharFaixa();
  }
  function falhou(n, msg) {
    if (n !== st.seq) return;
    st.faixa = null;
    desenharFaixa();
    op.avisar(msg, {erro: true});
  }
  if (faixa) faixa.addEventListener("click", ev => {
    const t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-sgd-fechar]")) { st.seq++; st.faixa = null; return desenharFaixa(); }
    const b = t.closest("[data-sgd]");
    if (!b || !st.faixa) return;
    const texto = st.faixa.lista[Number(b.dataset.sgd)] || "";
    const conversa = op.conversa() || [], ultima = [...conversa].reverse().find(m => m && m.de === "claude");
    if (ultima && ultima.id !== st.faixa.mensagem) op.responder(st.faixa.mensagem);   // a fala antiga vai citada
    const caixa = $("texto");
    if (!caixa) return;
    caixa.value = texto;
    caixa.dispatchEvent(new Event("input"));
    caixa.focus();
  });
  // sair da conversa (ou trocar de conversa) larga a faixa
  const det = $("detalhe"), titulo = $("dTitulo");
  if (det) new MutationObserver(() => desenharFaixa()).observe(det, {attributes: true, attributeFilter: ["class"]});
  if (titulo) new MutationObserver(() => desenharFaixa()).observe(titulo, {childList: true, characterData: true, subtree: true});

  // 📁 Mostrar na pasta
  const msgs = $("dMsgs");
  if (msgs) msgs.addEventListener("click", ev => {
    const b = ev.target && ev.target.closest && ev.target.closest("[data-doc-pasta]");
    if (b) mostrarNaPasta(b.dataset.docPasta, b);
  });
  async function mostrarNaPasta(id, b) {
    const ab = op.aberta();
    if (!ab || !ID_DOC.test(String(id || ""))) return;
    if (!op.pcLigado(ab.pc)) return op.avisar(`O ${op.pcCurto(ab.pc)} está desligado: o PDF está nele.`, {erro: true});
    if (b) b.disabled = true;
    op.avisar(`Pedi ao ${op.pcCurto(ab.pc)} para mostrar o PDF na pasta…`, {});
    let p = null;
    try {
      const pid = await op.rpc("cel_pedir", {pc: ab.pc, tipo: "acao", texto: JSON.stringify(pedidoPasta(id, ab.id))});
      p = await op.esperarPedido(pid, 60000);
    } catch (e) { p = {estado: "erro", erro: (e && e.message) || "sem internet"}; }
    finally { if (b) b.disabled = false; }
    const r = lerPasta(p);
    if (r.ok) op.avisar("✓ " + r.ok, {ok: true});
    else op.avisar("Não mostrei: " + r.erro, {erro: true});
  }

  // Copiar a imagem (no visor, ao lado do Salvar ou compartilhar)
  const salvar = $("vSalvar");
  if (salvar && !$("vCopiar")) {
    const c = doc.createElement("button");
    c.id = "vCopiar";
    c.setAttribute("aria-label", "Copiar a imagem");
    c.innerHTML = ICONE_COPIAR;
    salvar.before(c);
    c.addEventListener("click", copiarImagem);
  }
  function copiarImagem() {
    const f = op.foto && op.foto(), src = f && f.src;
    if (!imagemPronta(src)) return op.avisoVisor("A imagem ainda não chegou: espere um pouco e copie de novo.");
    if (!podeCopiarImagem(raiz.navigator)) return op.avisoVisor("Este navegador não copia imagem: use o ⤴ (Salvar ou compartilhar) e escolha Copiar.", 4500);
    let png;
    try {
      // o ClipboardItem sai já no toque (o Safari exige), com a promessa do PNG dentro
      png = /^data:image\/png;/i.test(src) ? Promise.resolve(op.blobDe(src)) : paraPng(src);
      raiz.navigator.clipboard.write([new raiz.ClipboardItem({"image/png": png})])
        .then(() => op.avisoVisor(f.carregarAlta && !f.alta ? "✓ Copiei a imagem da tela (a alta ainda está chegando)" : "✓ Imagem copiada", 2200), e => op.avisoVisor("Não consegui copiar a imagem" + (e && e.name === "NotAllowedError" ? " (o navegador não deixou)" : "") + ".", 4000));
    } catch (e) {
      op.avisoVisor("Não consegui copiar a imagem.", 4000);
    }
  }
  function paraPng(src) {
    return new Promise((ok, falha) => {
      const img = new raiz.Image();
      img.onload = () => {
        try {
          const c = doc.createElement("canvas");
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0);
          c.toBlob(b => (b ? ok(b) : falha(new Error("o PNG não saiu"))), "image/png");
        } catch (e) { falha(e); }
      };
      img.onerror = () => falha(new Error("a imagem não abriu"));
      img.src = src;
    });
  }

  if (!$("estiloSobras")) {
    const s = doc.createElement("style");
    s.id = "estiloSobras";
    s.textContent = CSS;
    doc.head.append(s);
  }
  return {noMenu, sugerir, mostrarNaPasta, copiarImagem, faixa: () => st.faixa};
}

// O que a página chama antes do ligar (o cartão é desenhado pelo index.html) e o que os testes usam
let tela = null;
const Sobras = {MAX_SUG, podeSugerir, pedidoSugerir, lerSugestoes, htmlFaixa, botoesDoc, pedidoPasta, lerPasta, imagemPronta,
                podeCopiarImagem, FRASE_AGENTE, CSS,
                ligar: op => (tela = ligar(op)),
                noMenu: linha => { if (tela) tela.noMenu(linha); }};
if (typeof module !== "undefined" && module.exports) module.exports = Sobras;
else raiz.Sobras = Sobras;
})(typeof window !== "undefined" ? window : globalThis);
