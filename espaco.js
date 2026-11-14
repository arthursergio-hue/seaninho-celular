// Seaninho no celular: o Início organizável (entrega 5 do Monitor no celular, 13/11/2026). Cada bloco do Início ganha
// o ▾ (recolher: fica só o cabeçalho, com um resumo) e o ✕ (esconder); o "👁 Mostrar", no alto, abre a folha "Mostrar
// na tela", com uma caixa por bloco. O "espaço" (o que está escondido e o que está recolhido) fica no aparelho e na
// conta (cel_preferencia "espaco", banco-espaco.sql), para voltar igual em qualquer aparelho: entre os dois, vale o mais
// novo pelo "t" (a hora do banco, a mesma em todos os aparelhos).
//
// O que nunca some: o "Esperando você" (recolhe, mas não esconde: a folha mostra a caixa travada) e os erros de conexão.
// Um bloco com erro dentro (o "Sem internet" do Início, que mora no #p-sessoes, e o "Não deu: sem internet" do AI Rats)
// aparece aberto mesmo escondido ou recolhido. O aviso "⚠ Sem conexão" do alto não é bloco: fica.
// Quem leva a um bloco escondido ou recolhido (o Slack do Esperando você e a nota da lista de Sessões levam ao Para
// você; a notificação do Para você também) o mostra até você sair do Início, sem mudar o que está salvo.
//
// A página só liga (Espaco.ligar no index.html): o módulo vigia o #tabInicio (MutationObserver) e põe os controles
// depois de cada desenho, sem mudar as funções dos blocos; os controles entram numa linha própria em volta do cabeçalho
// (em quatro blocos o título fica dentro de um <button class="bloco-cab">, e botão dentro de botão não vale). O que é
// puro (o estado, a escolha entre o aparelho e a conta, a folha) é testado no Node (test_espaco.cjs); a tela, no
// Chromium (test_web_espaco.py).
(function (raiz) {
"use strict";

const VERSAO = 1;
const FIXOS = ["esperando"];                 // recolhe, mas nunca esconde
const JUNTOS = {dcfim: "decisoes"};          // a última decisão respondida (embaixo, sem lote esperando) é das Decisões
const ROTULOS = {
  decisoes: "🗳 Decisões", airats: "📣 AI Rats", esperando: "🔔 Esperando você", frentes: "🧭 Frentes de trabalho",
  sessoes: "💬 Sessões", paravoce: "🎼 Para você", revisoes: "✓ Revisões", entregas: "📦 Entregas",
  pedidos: "📝 Meus pedidos", usoia: "📊 Uso de IA", computadores: "💻 Computadores", metricas: "📈 Hoje no Claude",
  resumos: "📋 As outras abas",
  chrome: "🌐 Seaninho no Chrome",   // o trem 0.9.0.18: o grupo da entrega 6 (chrome.js) também na folha "Mostrar na tela"
};
const NOME = /^[a-z0-9_-]{1,30}$/;
const MAX = 40;                              // nomes por lista (o banco aceita até 20 KB e a lista da conta tem 1 item)
const CHAVE_LOCAL = "seaninho.espaco";
const ESPERA_SALVAR_MS = 700;                // vários toques seguidos viram uma gravação só
const ESPERA_REDE_MS = [30e3, 60e3, 120e3, 300e3];   // sem internet: tenta de novo sozinho
// O que conta como erro dentro de um bloco (o bloco aparece aberto): o "Sem internet" e o "Nenhum PC" do Início (.empty)
// e os erros com .err (o "Não deu: sem internet…" do AI Rats, o .status.err). O .alerta não entra: no Para você ele também
// marca o aviso comum ("a sessão não está aberta: a resposta vai ao maestro"), e o bloco escondido voltaria toda hora.
const ERRO = ".empty, .err";
// Os controles e o resumo ficam fora do que se esconde ao recolher
const CAB = "esp-cab";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

// ---- o estado: {v, t, esconder: [...], recolher: [...]} ----------------------------------------------------------------
const vazio = () => ({v: VERSAO, t: 0, esconder: [], recolher: []});
function limparLista(v) {
  const fora = [];
  for (const x of Array.isArray(v) ? v : []) {
    const n = typeof x === "string" ? x : "";
    if (NOME.test(n) && !fora.includes(n)) fora.push(n);
    if (fora.length >= MAX) break;
  }
  return fora;
}
const chaveDe = b => JUNTOS[b] || b;
const fixo = b => FIXOS.includes(chaveDe(b));
// A forma da conta é uma lista com um objeto só ([{v, t, esconder, recolher}], a regra do cel_preferencia: lista); a do
// aparelho, o objeto. Qualquer outra coisa (o banco sem a SQL, um valor estragado) vira null: aí vale o que já se tem.
function normalizar(valor) {
  const o = Array.isArray(valor) ? valor[0] : valor;
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const t = Number(o.t);
  return {v: VERSAO, t: Number.isFinite(t) && t > 0 ? Math.floor(t) : 0,
          esconder: limparLista(o.esconder).filter(b => !fixo(b)), recolher: limparLista(o.recolher)};
}
const paraConta = e => [{v: VERSAO, t: e.t, esconder: e.esconder.slice(), recolher: e.recolher.slice()}];
// O mais novo vale; no empate, o do aparelho (é o mesmo que foi para a conta)
function escolher(local, conta) {
  if (!conta) return local || vazio();
  if (!local) return conta;
  return conta.t > local.t ? conta : local;
}
const escondido = (e, b) => !fixo(b) && e.esconder.includes(chaveDe(b));
const recolhido = (e, b) => e.recolher.includes(chaveDe(b));
// O estado novo com o bloco posto ou tirado de "esconder" ou de "recolher", e a hora da mudança
function comBloco(e, campo, b, sim, t) {
  const k = chaveDe(b), lista = e[campo].filter(x => x !== k);
  if (sim && !(campo === "esconder" && fixo(k))) lista.push(k);
  return {...e, v: VERSAO, t: Math.max(Math.floor(Number(t) || 0), e.t + 1), [campo]: limparLista(lista)};
}
const mesmo = (a, b) => !!a && !!b && a.t === b.t && a.esconder.join() === b.esconder.join() && a.recolher.join() === b.recolher.join();

// Os itens da folha, na ordem dos blocos da tela (o dcfim vale pelas Decisões)
function itens(blocos, rotulos = {}) {
  const fora = [];
  for (const b of Array.isArray(blocos) ? blocos : []) {
    const k = chaveDe(b);
    if (!NOME.test(k) || fora.some(x => x.bloco === k)) continue;
    fora.push({bloco: k, rotulo: rotulos[k] || ROTULOS[k] || k.charAt(0).toUpperCase() + k.slice(1), fixo: fixo(k)});
  }
  return fora;
}

// O que a folha diz sobre onde o espaço ficou salvo
const NOTAS = {
  "": ["", "Vale em todos os seus aparelhos."],
  salvando: ["", "Salvando na sua conta…"],
  conta: ["ok", "✓ Salvo na sua conta: vale em todos os seus aparelhos."],
  // revisão do PR #36: em palavras, sem o nome do arquivo interno (o banco-espaco.sql)
  aparelho: ["aviso", "Falta uma atualização do banco; até lá, a ordem fica só neste aparelho."],
  rede: ["aviso", "Sem internet: salvo neste aparelho. Vai para a sua conta quando a rede voltar."],
  erro: ["aviso", "Não salvei na sua conta ({msg}). Ficou neste aparelho."],
};
function nota(situacao, msg = "") {
  const [tipo, texto] = NOTAS[situacao] || NOTAS[""];
  return {tipo, texto: texto.replace("{msg}", String(msg || "erro").slice(0, 120))};
}
// O tipo do erro da gravação: "aparelho" (o banco sem a SQL nova: "preferência desconhecida"; ou sem a v6: a função ou a
// coluna que não existe), "rede" (tenta de novo sozinho) ou "erro" (o resto, com a mensagem). Revisão do PR #36: antes,
// qualquer erro que citasse o cel_preferencia virava "falta o SQL" (e um erro de verdade da função ficava calado)
const SEM_FUNCAO = /PGRST202|PGRST204|42883|42703|Could not find the (function|column)|(function|column) \S+( \S+)? does not exist/i;
function tipoDoErro(e) {
  const m = String((e && e.message) || e || "");
  if (/preferência desconhecida|preferencia desconhecida/i.test(m)) return "aparelho";
  if ((e && (e.codigo === "PGRST202" || e.codigo === "PGRST204" || e.codigo === "42883" || e.codigo === "42703"))
      || SEM_FUNCAO.test(m)) return "aparelho";
  if ((e && e.rede) || /failed to fetch|network|load failed|demorou demais/i.test(m)) return "rede";
  return "erro";
}

// A folha "Mostrar na tela": uma caixa por bloco (o Esperando você travado), Abrir todos, Voltar ao padrão e a nota
function htmlFolha(blocos, e, op = {}) {
  const lista = itens(blocos, op.rotulos || {}), n = nota(op.situacao || "", op.msg);
  const caixas = lista.map(it => `<label class="esp-op${it.fixo ? " fixo" : ""}">`
    + `<input type="checkbox" data-esp-mostrar="${esc(it.bloco)}"${escondido(e, it.bloco) ? "" : " checked"}${it.fixo ? " disabled" : ""}>`
    + `<span>${esc(it.rotulo)}${it.fixo ? "<small>sempre aparece</small>" : recolhido(e, it.bloco) ? "<small>recolhido</small>" : ""}</span></label>`).join("");
  const algum = e.esconder.length || e.recolher.length;
  return `<div class="pega"></div><h4 class="esp-titulo" id="espTitulo">👁 Mostrar na tela</h4>`
    + `<p class="esp-sub">O que aparece no Início. Toque no ▾ de um bloco para recolher e no ✕ para esconder.</p>`
    + `<div class="esp-grade" role="group" aria-labelledby="espTitulo" data-esp-folha>${caixas}</div>`
    + `<div class="esp-acoes"><button class="btn sec" data-esp-abrir-todos${e.recolher.length ? "" : " disabled"}>▾ Abrir os recolhidos</button>`
    + `<button class="btn sec" data-esp-padrao${algum ? "" : " disabled"}>Voltar ao padrão</button></div>`
    + `<p class="esp-nota${n.tipo ? " " + n.tipo : ""}" data-esp-nota role="status">${esc(n.texto)}</p>`
    + `<button class="op en-nao" data-nf-fechar>Fechar</button>`;
}

// O resumo do bloco recolhido (no cabeçalho): o número do Esperando você, o total e os contadores das Sessões e das
// Frentes. Os outros blocos já trazem o número no próprio cabeçalho (o 3 das Decisões, o "5 itens" do Para você…).
function resumoDe(caixa) {
  const esp = caixa.querySelectorAll(".esp-item").length;
  if (esp) {
    const ver = caixa.querySelector("h3 .ir"), m = ver && /\((\d+)\)/.exec(ver.textContent || "");
    return {num: true, texto: String(m ? Number(m[1]) : esp)};
  }
  const partes = [], grande = caixa.querySelector(".ses-topo .grande");
  if (grande) {
    const meta = caixa.querySelector(".ses-topo .meta");
    partes.push(`${grande.textContent.trim()} ${((meta && meta.textContent) || "").split("·")[0].trim()}`.trim());
  }
  for (const c of caixa.querySelectorAll("button.contador")) {
    const n = c.querySelector("b"), r = c.querySelector("span");
    if (n && r && Number(n.textContent) > 0) partes.push(`${n.textContent.trim()} ${r.textContent.trim().toLowerCase()}`);
  }
  return {num: false, texto: partes.slice(0, 3).join(" · ")};
}

const CSS = `
#tabInicio .esp-linha{display:flex;align-items:center;gap:6px;margin:-6px 2px 10px;min-height:28px}
#tabInicio .esp-linha>.painel-topo{flex:1;min-width:0;margin:0}
#tabInicio .esp-mostrar{flex:none;min-height:44px;padding:0 13px;border-radius:20px;background:var(--glass);color:var(--muted);font-size:13.5px;font-weight:600;white-space:nowrap}
#tabInicio .esp-mostrar.tem{color:var(--gold-2)}
#tabInicio .esp-oculto{display:none}
#tabInicio .esp-cab{display:flex;align-items:center;gap:2px;margin:0 0 10px}
#tabInicio .esp-cab>:not(.esp-rec):not(.esp-x){flex:1;min-width:0}
#tabInicio .esp-cab h3,#tabInicio .esp-cab .dc-bloco-h{margin-bottom:0}
#tabInicio .dc-bloco>.esp-cab{margin:0}
#tabInicio .esp-rec,#tabInicio .esp-x{flex:none;display:flex;align-items:center;justify-content:center;width:44px;min-width:44px;height:44px;margin:-12px 0;border-radius:12px;color:var(--faint);font-size:15px;line-height:1}
#tabInicio .esp-rec{margin-left:-12px}
#tabInicio .esp-x{margin-right:-10px}
#tabInicio .esp-rec::before{content:"▾";font-size:17px}
#tabInicio .esp-recolhido .esp-rec::before{content:"▸"}
#tabInicio .esp-x::before{content:"✕"}
#tabInicio .esp-rec:active,#tabInicio .esp-x:active{background:var(--glass-2)}
#tabInicio .esp-resumo{display:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:500;text-transform:none;letter-spacing:0;color:var(--faint)}
#tabInicio .esp-recolhido .esp-resumo{display:inline-block}
#tabInicio .esp-recolhido .esp-cab h3{white-space:nowrap}
#tabInicio .esp-resumo.num{flex:none;min-width:22px;padding:1px 7px;border-radius:11px;background:var(--gold);color:#1B1300;font-weight:700;text-align:center}
#tabInicio .esp-recolhido>:not(:first-child){display:none}
#tabInicio .esp-recolhido>:first-child:not(.esp-cab)>:not(.esp-cab){display:none}
#tabInicio .esp-recolhido .esp-cab{margin-bottom:0}
#tabInicio .esp-recolhido>.bloco{padding-top:10px;padding-bottom:10px}
#tabInicio .esp-recolhido>.dc-bloco{padding-top:8px;padding-bottom:8px}
.folha .esp-titulo{margin:6px 0 2px}
.folha .esp-sub{margin:0 0 10px;font-size:13.5px;color:var(--muted)}
.folha .esp-grade{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.folha .esp-op{display:flex;align-items:center;gap:10px;min-height:48px;padding:6px 10px;border-radius:12px;background:var(--glass);border:1px solid var(--stroke);font-size:14.5px}
.folha .esp-op input{flex:none;width:22px;height:22px;accent-color:var(--gold)}
.folha .esp-op span{min-width:0}
.folha .esp-op small{display:block;font-size:12px;color:var(--faint)}
.folha .esp-op.fixo{opacity:.75}
.folha .esp-acoes{display:flex;gap:8px;margin:12px 0 4px}
.folha .esp-acoes .btn{flex:1;min-height:44px;margin:0;padding:10px 8px;font-size:14.5px}
.folha .esp-nota{margin:8px 2px 4px;font-size:13px;color:var(--faint)}
.folha .esp-nota.ok{color:var(--green)}
.folha .esp-nota.aviso{color:var(--gold-2)}
`;

// ---- a tela (só no navegador) ------------------------------------------------------------------------------------
// op: {raiz, blocos, conta, contaLida, agora, rpc, store, avisar, abrirFolha, fecharFolha}
//   raiz(): o #tabInicio; blocos(): o PAINEL_BLOCOS; conta(): o prefs.espaco (vem no inteiro); contaLida(): já chegou um
//   inteiro (o prefs vale); agora(): a hora do banco (ms); rpc, store: os da página; avisar(msg, opções): o appAviso;
//   abrirFolha(html) / fecharFolha(): a #folha da página.
function ligar(op) {
  const doc = raiz.document;
  if (!doc || !op || typeof op.raiz !== "function" || !op.raiz()) return null;
  const st = {local: lerLocal(), revelados: new Set(), situacao: "", msg: "", salvando: false, deNovo: false,
              timer: 0, tentativa: 0, subiu: false, aplicando: false, folha: false};
  const agora = () => Math.floor(Number(op.agora && op.agora()) || Date.now());
  const caixaDe = b => doc.getElementById("p-" + b);

  function lerLocal() {
    try { return normalizar(JSON.parse(op.store.get(CHAVE_LOCAL) || "null")); } catch { return null; }
  }
  const gravarLocal = e => op.store.set(CHAVE_LOCAL, JSON.stringify(e));
  const atual = () => st.local || vazio();

  // A conta mais nova (outro aparelho mudou) passa a valer aqui; o aparelho mais novo (mudou sem internet, ou o banco
  // ainda sem a SQL) sobe uma vez por abertura, depois do primeiro inteiro (antes dele o prefs ainda não é o da conta)
  function sincronizar() {
    const conta = normalizar(op.conta && op.conta());
    if (conta && (!st.local || conta.t > st.local.t)) {
      st.local = conta; gravarLocal(conta);
    } else if (!st.subiu && st.local && st.local.t && (!op.contaLida || op.contaLida())) {
      st.subiu = true;
      if (!conta || st.local.t > conta.t) agendar(0);
    }
    if (!op.contaLida || op.contaLida()) st.subiu = true;
  }

  function linha(el) {
    const topo = doc.getElementById("pTopo");
    if (!topo) return;
    let l = topo.parentElement;
    if (!l || !l.classList.contains("esp-linha")) {
      l = doc.createElement("div");
      l.className = "esp-linha";
      topo.before(l);
      l.append(topo);
      const b = doc.createElement("button");
      b.className = "esp-mostrar";
      b.dataset.espAbrir = "";
      b.setAttribute("aria-haspopup", "dialog");
      l.append(b);
    }
    const b = l.querySelector("[data-esp-abrir]"), e = atual(), n = e.esconder.length;
    const txt = n ? `👁 Mostrar (${n})` : "👁 Mostrar", rot = n ? `Mostrar na tela: ${n} ${n === 1 ? "bloco escondido" : "blocos escondidos"}` : "Mostrar na tela: escolher os blocos do Início";
    if (b.textContent !== txt) b.textContent = txt;
    if (b.getAttribute("aria-label") !== rot) b.setAttribute("aria-label", rot);
    b.classList.toggle("tem", n > 0);
    if (!el.contains(l)) el.prepend(l);
  }

  function controles(caixa, b, rec) {
    const sec = caixa.firstElementChild;
    if (!sec || sec.matches(ERRO) || !sec.firstElementChild) return;
    // o trem 0.9.0.18 (revisão da junção): o bloco que é um botão inteiro (o resumo das ✓ Revisões, entrega 2) não leva
    // os controles dentro dele (botão dentro de botão: o ▾ e o ✕ abriam a tela das Revisões); ficam em volta dele
    let cab = sec.classList.contains(CAB) || sec.matches("button, a") ? sec : sec.firstElementChild;
    if (!cab.classList.contains(CAB)) {
      const novo = doc.createElement("div");
      novo.className = CAB;
      cab.before(novo);
      novo.append(cab);
      const r = doc.createElement("button");
      r.className = "esp-rec"; r.type = "button"; r.dataset.espRecolher = b;
      novo.prepend(r);
      if (!fixo(b)) {
        const x = doc.createElement("button");
        x.className = "esp-x"; x.type = "button"; x.dataset.espEsconder = b;
        novo.append(x);
      }
      cab = novo;
    }
    const nome = (ROTULOS[chaveDe(b)] || b).replace(/^\S+\s/, "");
    const r = cab.querySelector(".esp-rec"), x = cab.querySelector(".esp-x");
    atributo(r, "aria-expanded", rec ? "false" : "true");
    atributo(r, "aria-label", (rec ? "Abrir o bloco " : "Recolher o bloco ") + nome);
    if (x) atributo(x, "aria-label", `Esconder ${nome} do Início`);
    // o resumo entra no título (antes do "Abrir ›" / "ver tudo ›" da direita), só aparece recolhido
    const titulo = cab.querySelector("h3, .dc-bloco-h");
    if (!titulo) return;
    let rs = titulo.querySelector(".esp-resumo");
    const res = rec ? resumoDe(sec) : {num: false, texto: ""};
    if (!res.texto) { if (rs) rs.remove(); return; }
    if (!rs) {
      rs = doc.createElement("span");
      rs.className = "esp-resumo";
      const dir = titulo.querySelector(".ir, .n3, .ent-ir, .mp-ir, .dc-ver");
      if (dir && dir.parentElement === titulo) dir.before(rs); else titulo.append(rs);
    }
    if (rs.textContent !== res.texto) rs.textContent = res.texto;
    rs.classList.toggle("num", res.num);
  }
  function atributo(el, k, v) { if (el && el.getAttribute(k) !== v) el.setAttribute(k, v); }

  // Depois de cada desenho do Início (e de cada mudança): as classes e os controles. Não refaz nada que já está certo
  // (o observador não entra em laço).
  function aplicar() {
    const el = op.raiz();
    if (!el || st.aplicando) return;
    st.aplicando = true;
    try {
      sincronizar();
      linha(el);
      const e = atual(), blocos = op.blocos() || [];
      for (const b of blocos) {
        const caixa = caixaDe(b);
        if (!caixa) continue;
        const k = chaveDe(b), solto = st.revelados.has(k) || !!caixa.querySelector(ERRO);
        const esc_ = escondido(e, b) && !solto, rec = !esc_ && recolhido(e, b) && !solto;
        caixa.classList.toggle("esp-oculto", esc_);
        caixa.classList.toggle("esp-recolhido", rec);
        controles(caixa, b, rec);
      }
    } finally {
      mo.takeRecords();
      st.aplicando = false;
    }
  }

  function mudar(novo, aviso) {
    if (mesmo(novo, st.local)) return;
    st.local = novo;
    gravarLocal(novo);
    aplicar();
    desenharFolha();
    agendar(ESPERA_SALVAR_MS);
    if (aviso) op.avisar(aviso.msg, aviso.opcoes);
  }
  function agendar(ms) {
    clearTimeout(st.timer);
    st.timer = setTimeout(salvar, ms);
  }
  async function salvar() {
    clearTimeout(st.timer);
    if (st.salvando) { st.deNovo = true; return; }
    const enviado = atual();
    const conta = normalizar(op.conta && op.conta());
    if (!enviado.t || (conta && conta.t > enviado.t)) return;   // nada de novo, ou a conta já tem um mais novo
    st.salvando = true; st.situacao = "salvando"; desenharFolha();
    try {
      await op.rpc("cel_preferencia", {nome: "espaco", valor: paraConta(enviado)});
      st.situacao = "conta"; st.msg = ""; st.tentativa = 0;
    } catch (e) {
      st.situacao = tipoDoErro(e); st.msg = String((e && e.message) || "");
      if (st.situacao === "rede") agendar(ESPERA_REDE_MS[Math.min(st.tentativa++, ESPERA_REDE_MS.length - 1)]);
    } finally {
      st.salvando = false;
      if (st.deNovo) { st.deNovo = false; agendar(0); }
      desenharFolha();
    }
  }

  // ---- os toques ----
  function nomeDe(b) { return (ROTULOS[chaveDe(b)] || b).replace(/^\S+\s/, ""); }
  function esconder(b) {
    if (fixo(b)) return;
    st.revelados.delete(chaveDe(b));
    const antes = atual();
    mudar(comBloco(antes, "esconder", b, true, agora()),
          {msg: `${nomeDe(b)} saiu do Início. Volta pelo 👁 Mostrar.`,
           opcoes: {ok: true, rotulo: "Desfazer", passa: true, acao: () => mudar(comBloco(atual(), "esconder", b, false, agora()))}});
  }
  function alternarRecolher(b) {
    const e = atual(), k = chaveDe(b);
    // revelado por um link e recolhido no salvo: o ▾ só volta a recolher (o que se vê), sem mudar o salvo
    if (st.revelados.delete(k) && recolhido(e, k)) return aplicar();
    mudar(comBloco(e, "recolher", b, !recolhido(e, b), agora()));
  }
  function revelar(b) {
    const k = chaveDe(b), e = atual();
    if (!escondido(e, k) && !recolhido(e, k)) return;
    st.revelados.add(k);
    aplicar();
  }

  function rotulosDaTela() {
    const r = {};
    for (const b of op.blocos() || []) {
      const k = chaveDe(b), t = caixaDe(b) && caixaDe(b).querySelector("h3, .dc-bloco-h");
      if (!ROTULOS[k] && t && !r[k]) r[k] = t.textContent.replace(/(Abrir|ver tudo|Ver na lista)\s*›.*$/i, "").trim().slice(0, 40);
    }
    return r;
  }
  function abrirFolha() {
    st.folha = true;
    op.abrirFolha(htmlFolha(op.blocos(), atual(), {rotulos: rotulosDaTela(), situacao: st.situacao, msg: st.msg}));
  }
  function desenharFolha() {
    const f = doc.querySelector("#folha [data-esp-folha]");
    if (!st.folha || !f) { st.folha = false; return; }
    const fundo = doc.getElementById("folhaFundo");
    if (fundo && fundo.classList.contains("hidden")) { st.folha = false; return; }
    const html = htmlFolha(op.blocos(), atual(), {rotulos: rotulosDaTela(), situacao: st.situacao, msg: st.msg});
    const caixa = doc.createElement("div");
    caixa.innerHTML = html;
    // troca só a grade, os botões e a nota (a folha não pula para o alto nem perde o foco do toque)
    for (const sel of ["[data-esp-folha]", ".esp-acoes", "[data-esp-nota]"]) {
      const velho = doc.querySelector("#folha " + sel), novo = caixa.querySelector(sel);
      if (velho && novo && velho.outerHTML !== novo.outerHTML) velho.replaceWith(novo);
    }
  }

  const mo = new MutationObserver(() => aplicar());
  mo.observe(op.raiz(), {childList: true, subtree: true});
  // sair do Início desfaz o "mostrar até sair" (o que foi revelado por um link volta a ficar escondido ou recolhido)
  new MutationObserver(() => {
    if (op.raiz().classList.contains("hidden") && st.revelados.size) { st.revelados.clear(); aplicar(); }
  }).observe(op.raiz(), {attributes: true, attributeFilter: ["class"]});

  op.raiz().addEventListener("click", ev => {
    const t = ev.target;
    if (!t || !t.closest) return;
    const abrir = t.closest("[data-esp-abrir]"), rec = t.closest("[data-esp-recolher]"), x = t.closest("[data-esp-esconder]");
    if (abrir) { ev.stopPropagation(); return abrirFolha(); }
    if (rec) { ev.stopPropagation(); return alternarRecolher(rec.dataset.espRecolher); }
    if (x) { ev.stopPropagation(); return esconder(x.dataset.espEsconder); }
  });
  // Os caminhos que levam ao Para você mostram o bloco antes de rolar até ele (na captura: antes do clique da página)
  doc.addEventListener("click", ev => {
    const t = ev.target;
    if (t && t.closest && t.closest("[data-pv-ir], [data-ir-pv]")) revelar("paravoce");
  }, true);
  if (raiz.navigator && raiz.navigator.serviceWorker && raiz.navigator.serviceWorker.addEventListener) {
    raiz.navigator.serviceWorker.addEventListener("message", ev => { if (ev.data && ev.data.tipo === "abrir" && ev.data.pv) revelar("paravoce"); });
  }
  if (/[#&]pv=1\b/.test(String(raiz.location && raiz.location.hash))) revelar("paravoce");

  const folha = doc.getElementById("folha");
  if (folha) {
    folha.addEventListener("change", ev => {
      const c = ev.target && ev.target.closest && ev.target.closest("[data-esp-mostrar]");
      if (!c || fixo(c.dataset.espMostrar)) return;
      st.revelados.delete(chaveDe(c.dataset.espMostrar));
      mudar(comBloco(atual(), "esconder", c.dataset.espMostrar, !c.checked, agora()));
    });
    folha.addEventListener("click", ev => {
      const t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-esp-abrir-todos]")) return mudar({...atual(), t: Math.max(agora(), atual().t + 1), recolher: []});
      if (t.closest("[data-esp-padrao]")) return mudar({...vazio(), t: Math.max(agora(), atual().t + 1)});
    });
  }
  if (!doc.getElementById("estiloEspaco")) {
    const s = doc.createElement("style");
    s.id = "estiloEspaco";
    s.textContent = CSS;
    doc.head.append(s);
  }
  aplicar();
  return {aplicar, revelar, abrirFolha, estado: () => atual(), situacao: () => st.situacao, salvar};
}

const Espaco = {VERSAO, FIXOS, JUNTOS, ROTULOS, CHAVE_LOCAL, vazio, normalizar, paraConta, escolher, escondido, recolhido,
                comBloco, mesmo, itens, nota, tipoDoErro, htmlFolha, chaveDe, fixo, CSS, ligar};
if (typeof module !== "undefined" && module.exports) module.exports = Espaco;
else raiz.Espaco = Espaco;
})(typeof window !== "undefined" ? window : globalThis);
